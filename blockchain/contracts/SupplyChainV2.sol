// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

/**
 * @title SupplyChainV2 - AgroChainMart Protocol
 * @dev Universal Agricultural Marketplace with Fractional Escrow, IPFS Evidence Pining, and Hybrid Consensus Arbitration.
 * @notice Full chain-of-custody protocol for agricultural supply chain.
 * @dev Implements: two-video IPFS evidence, QR+OTP delivery, 5-member blind arbitration,
 *      proportional stake/bond penalties, partial escrow release, and expiry-based abandonment.
 */
contract SupplyChainV2 is ReentrancyGuard {

    // ================================================================
    // ENUMS
    // ================================================================

    enum Status {
        Created,         // 0: Listed on marketplace
        Sold,            // 1: Purchased, escrow locked, awaiting packing video
        Dispatched,      // 2: Goods shipped, delivery pending
        Confirmed,       // 3: Full delivery confirmed by buyer via OTP
        PartialConfirm,  // 4: Partial delivery accepted, proportional split done
        Disputed,        // 5: Dispute filed, arbitrators assigned
        FarmerWins,      // 6: Arbitrators ruled in favour of farmer
        BuyerWins,       // 7: Arbitrators ruled in favour of buyer (or auto-resolve, no video)
        Abandoned,       // 8: Buyer silent past expiry + grace; farmer claimed funds
        Refunded,        // 9: Pre-dispatch cancellation by farmer or buyer
        Cancelled        // 10: Farmer cancelled unsold listing (stake returned)
    }

    // ================================================================
    // STRUCTS
    // ================================================================

    struct Batch {
        uint id;
        uint parentId;
        string name;
        uint quantity;
        uint remainingQuantity;
        uint pricePerKg;
        uint escrowAmount;
        uint stakeAmount;         // Locked stake (proportional to total value)
        address farmer;
        address buyer;
        Status status;
        bool isAdminSponsored;
        string location;
        uint expiryTimestamp;
        bytes32 video1Hash;       // IPFS CID hash - one-write, immutable once set
        string trackingId;        // Carrier tracking number submitted at dispatch
        address trusteeAddress;   // Nominated delivery recipient's Ethereum address
        bytes32 trusteeConsentHash; // IPFS hash of buyer's consent video for trustee
        uint dispatchTimestamp;   // Timestamp of dispatch
    }

    struct Dispute {
        uint batchId;
        bytes32 video2Hash;       // IPFS hash of delivery-scene video (optional)
        address initiator;
        uint votesForFarmer;
        uint votesForBuyer;
        bool resolved;
        uint bondAmount;          // Buyer's dispute bond locked here
    }

    struct Arbitrator {
        address addr;
        uint rating;              // Rating × 100 (e.g. 4.0 → 400, floor removal at 300)
        bool isActive;
        uint totalEarnings;
        uint disputesResolved;
    }

    // ================================================================
    // CONSTANTS
    // ================================================================

    uint public constant MIN_STAKE            = 0.01 ether;
    uint public constant STAKE_PERCENT        = 5;    // 5% of batch price
    uint public constant MIN_DISPUTE_BOND     = 0.05 ether;
    uint public constant DISPUTE_BOND_PERCENT = 5;    // 5% of batch price
    uint public constant MIN_EXPIRY_DURATION  = 1 days;
    uint public constant MAX_EXPIRY_DURATION  = 30 days;
    uint public constant ABANDON_GRACE_PERIOD = 7 days;
    uint public constant PROTOCOL_FEE_PERCENT = 2;    // 2% on successful delivery

    // Arbitrator rating constants (stored × 100)
    uint public constant ARBITRATOR_INITIAL_RATING = 400; // 4.0
    uint public constant ARBITRATOR_MIN_RATING     = 300; // 3.0 - below this = removed
    uint public constant RATING_INCREMENT          = 10;  // +0.10 per majority vote
    uint public constant RATING_DECREMENT          = 20;  // −0.20 per minority vote
    uint public constant ARBITRATOR_BOND           = 1 ether;
    uint public constant MAX_POOL_SIZE             = 10;

    // ================================================================
    // STATE VARIABLES
    // ================================================================

    uint public batchCount;
    uint public disputeCount;

    mapping(uint => Batch)    public batches;
    mapping(uint => Dispute)  public disputes;

    // Arbitrator vote tracking (separate from Dispute to keep struct lean)
    mapping(uint => mapping(address => bool)) public hasVotedOnDispute;
    // true = voted for farmer, false = voted for buyer
    mapping(uint => mapping(address => bool)) public arbitratorVoteForFarmer;

    // First-to-vote commit-reveal state
    mapping(uint => mapping(address => bytes32)) public arbitratorCommits;
    mapping(uint => mapping(address => bool)) public hasCommittedOnDispute;
    mapping(uint => mapping(address => bool)) public hasRevealedOnDispute;
    mapping(uint => address[]) public disputeCommittedArbitrators;
    mapping(address => uint) public claimableArbitratorRewards;

    // Arbitrator pool
    address[]                        public arbitratorPool;
    mapping(address => Arbitrator)   public arbitrators;
    mapping(address => bool)         public isArbitrator;

    // Arbitrator applications
    mapping(address => bytes32)                           public arbitratorApplications;
    mapping(address => uint) public applicantApprovalCount;
    mapping(address => uint) public applicantRejectionCount;
    mapping(address => mapping(address => bool))          public hasVotedOnApplicant;

    // Farmer financial tracking
    mapping(address => uint)  public totalEarnings;
    mapping(address => bool)  public isAdminSponsored;

    // Admin + Oracle
    address                        public adminTreasury;
    AggregatorV3Interface internal dataFeed;

    // ================================================================
    // EVENTS
    // ================================================================

    event BatchCreated(uint indexed batchId, string name, uint quantity, uint pricePerKg, address indexed farmer, string location, uint expiryTimestamp);
    event BatchPurchased(uint indexed batchId, address indexed buyer, uint amount);
    event TrusteeNominated(uint indexed batchId, address indexed buyer, address trusteeAddress);
    event PackingVideoUploaded(uint indexed batchId, bytes32 video1Hash);
    event BatchDispatched(uint indexed batchId, string trackingId);
    event DeliveryConfirmed(uint indexed batchId, address indexed buyer, uint farmerPayout, bytes32 video2Hash);
    event PartialDeliveryConfirmed(uint indexed batchId, uint acceptedQty, uint farmerPayout, uint buyerRefund);
    event DisputeFiled(uint indexed disputeId, uint indexed batchId, address indexed initiator);
    event ArbitratorVoteSubmitted(uint indexed disputeId, address indexed arbitrator);
    event DisputeResolved(uint indexed disputeId, uint indexed batchId, bool farmerWins, uint majorityVotes);
    event AutoResolvedNoBuyerWins(uint indexed batchId, address indexed buyer, string reason);
    event BatchAbandoned(uint indexed batchId, address indexed farmer, uint payout);
    event Refunded(uint indexed batchId, address indexed buyer, uint amount);
    event BatchCancelled(uint indexed batchId, address indexed farmer);
    event ArbitratorAdded(address indexed arbitrator);
    event ArbitratorRemoved(address indexed arbitrator, string reason);
    event ArbitratorApplied(address indexed applicant, string name, string apmcId, string phone);
    event FarmerSponsored(address indexed farmer);

    // ================================================================
    // MODIFIERS
    // ================================================================

    modifier onlyAdmin() {
        require(msg.sender == adminTreasury, "Only Admin Treasury");
        _;
    }

    modifier onlyActiveArbitrator() {
        require(isArbitrator[msg.sender] && arbitrators[msg.sender].isActive, "Not an active arbitrator");
        _;
    }

    // ================================================================
    // CONSTRUCTOR
    // ================================================================

    constructor() {
        adminTreasury = msg.sender;
        // Chainlink ETH/USD feed on Sepolia
        dataFeed = AggregatorV3Interface(0x694AA1769357215DE4FAC081bf1f309aDC325306);
    }

    // ================================================================
    // ORACLE
    // ================================================================

    /**
     * @notice Returns current ETH/USD price from Chainlink with 8 decimals.
     */
    function getLatestEthUsdPrice() public view returns (int) {
        (, int price, , , ) = dataFeed.latestRoundData();
        return price;
    }

    // ================================================================
    // ADMIN - FARMER SPONSORSHIP
    // ================================================================

    /**
     * @notice Admin sponsors a new farmer's first harvest stake.
     * @dev Farmer must not have earned more than MIN_STAKE yet.
     */
    function sponsorFarmer(address _farmer) external payable onlyAdmin nonReentrant {
        require(msg.value == MIN_STAKE, "Must deposit exactly MIN_STAKE");
        require(totalEarnings[_farmer] < MIN_STAKE, "Farmer already financially independent");
        require(!isAdminSponsored[_farmer], "Farmer already sponsored");
        isAdminSponsored[_farmer] = true;
        emit FarmerSponsored(_farmer);
    }

    // ================================================================
    // ARBITRATOR POOL MANAGEMENT
    // ================================================================

    /**
     * @notice Admin adds an arbitrator during bootstrap phase.
     */
    function addArbitrator(address _arbitrator) external payable onlyAdmin {
        require(msg.value == ARBITRATOR_BOND, "Must deposit arbitrator bond");
        require(arbitratorPool.length < MAX_POOL_SIZE, "Arbitrator pool full");
        _addArbitratorInternal(_arbitrator);
    }

    /**
     * @notice Any address can apply to become an arbitrator by submitting transparent credentials.
     */
    function applyAsArbitrator(string memory _name, string memory _apmcId, string memory _phone) external payable {
        require(arbitratorPool.length < MAX_POOL_SIZE, "Arbitrator pool full");
        require(!isArbitrator[msg.sender], "Already an arbitrator");
        require(arbitratorApplications[msg.sender] == bytes32(0), "Application already pending");
        require(msg.value == ARBITRATOR_BOND, "Must deposit arbitrator bond");
        require(bytes(_name).length > 0 && bytes(_apmcId).length > 0 && bytes(_phone).length > 0, "All credentials required");
        
        // We still hash it locally to act as a state-tracking unique identifier without taking up massive bytes space
        bytes32 rawHash = keccak256(abi.encodePacked(_name, _apmcId, _phone));
        arbitratorApplications[msg.sender] = rawHash;
        
        // Emit the plain-text credentials statically into the ledger logs for existing staff to read!
        emit ArbitratorApplied(msg.sender, _name, _apmcId, _phone);
    }

    /**
     * @notice Existing active arbitrators or Admin vote to approve applicants.
     * @dev Uses dynamic majority (n/2 + 1) with Admin tie-breaking for even pools.
     */
    function voteOnApplicant(address _applicant, bool _approve) external {
        require(
            (isArbitrator[msg.sender] && arbitrators[msg.sender].isActive) || msg.sender == adminTreasury,
            "Not authorized to vote"
        );
        require(arbitratorApplications[_applicant] != bytes32(0), "No pending application");
        require(!hasVotedOnApplicant[_applicant][msg.sender], "Already voted on this applicant");

        uint poolSize = arbitratorPool.length;
        uint threshold = (poolSize / 2) + 1;

        if (msg.sender == adminTreasury) {
            // Admin only votes if it's a perfect tie (even pool)
            require(poolSize % 2 == 0, "Consensus exists (odd pool). Wait for peer vote.");
            require(
                applicantApprovalCount[_applicant] == poolSize / 2 && 
                applicantRejectionCount[_applicant] == poolSize / 2,
                "Not a tie. Wait for peers."
            );
            // Admin's decision is final
            if (_approve) {
                _promoteApplicant(_applicant);
            } else {
                _deleteApplication(_applicant);
            }
            return;
        }

        // Standard Peer Path
        hasVotedOnApplicant[_applicant][msg.sender] = true;

        if (_approve) {
            applicantApprovalCount[_applicant]++;
            if (applicantApprovalCount[_applicant] >= threshold) {
                _promoteApplicant(_applicant);
            }
        } else {
            applicantRejectionCount[_applicant]++;
            if (applicantRejectionCount[_applicant] >= threshold) {
                _deleteApplication(_applicant);
            }
        }
    }

    function _promoteApplicant(address _applicant) internal {
        _addArbitratorInternal(_applicant);
        // Clear application parameters without refunding (bond is locked as arbitrator stake)
        delete arbitratorApplications[_applicant];
        delete applicantApprovalCount[_applicant];
        delete applicantRejectionCount[_applicant];
    }

    function _deleteApplication(address _applicant) internal {
        delete arbitratorApplications[_applicant];
        delete applicantApprovalCount[_applicant];
        delete applicantRejectionCount[_applicant];
        
        // Refund the 1 ETH bond to the rejected applicant
        (bool success, ) = payable(_applicant).call{value: ARBITRATOR_BOND}("");
        require(success, "Refund of applicant bond failed");
    }

    function _addArbitratorInternal(address _arbitrator) internal {
        require(!isArbitrator[_arbitrator], "Already an arbitrator");
        isArbitrator[_arbitrator] = true;
        arbitrators[_arbitrator] = Arbitrator({
            addr: _arbitrator,
            rating: ARBITRATOR_INITIAL_RATING,
            isActive: true,
            totalEarnings: 0,
            disputesResolved: 0
        });
        arbitratorPool.push(_arbitrator);
        emit ArbitratorAdded(_arbitrator);
    }

    function _removeArbitratorInternal(address _arbitrator, string memory _reason) internal {
        isArbitrator[_arbitrator] = false;
        arbitrators[_arbitrator].isActive = false;

        // Remove from arbitratorPool array using swap-and-pop
        uint poolSize = arbitratorPool.length;
        for (uint i = 0; i < poolSize; i++) {
            if (arbitratorPool[i] == _arbitrator) {
                arbitratorPool[i] = arbitratorPool[poolSize - 1];
                arbitratorPool.pop();
                break;
            }
        }

        // Slash entire bond to the adminTreasury
        (bool success, ) = payable(adminTreasury).call{value: ARBITRATOR_BOND}("");
        require(success, "Slashed bond transfer to treasury failed");

        emit ArbitratorRemoved(_arbitrator, _reason);
    }

    /**
     * @notice Allows an arbitrator to willingly withdraw from the pool and recover their scaled bond.
     */
    function withdrawArbitrator() external nonReentrant {
        require(isArbitrator[msg.sender], "Not a registered arbitrator");
        require(arbitrators[msg.sender].isActive, "Arbitrator already inactive");

        isArbitrator[msg.sender] = false;
        arbitrators[msg.sender].isActive = false;

        // Remove from arbitratorPool array using swap-and-pop
        uint poolSize = arbitratorPool.length;
        for (uint i = 0; i < poolSize; i++) {
            if (arbitratorPool[i] == msg.sender) {
                arbitratorPool[i] = arbitratorPool[poolSize - 1];
                arbitratorPool.pop();
                break;
            }
        }

        uint rating = arbitrators[msg.sender].rating;
        uint refundAmount = 0;

        if (rating >= 500) {
            refundAmount = ARBITRATOR_BOND;
        } else if (rating > 300) {
            // Linear interpolation between 3.0 (0% refund) and 5.0 (100% refund)
            refundAmount = ((rating - 300) * ARBITRATOR_BOND) / 200;
        }

        uint slashedAmount = ARBITRATOR_BOND - refundAmount;

        if (refundAmount > 0) {
            (bool s1, ) = payable(msg.sender).call{value: refundAmount}("");
            require(s1, "Arbitrator bond refund failed");
        }
        if (slashedAmount > 0) {
            (bool s2, ) = payable(adminTreasury).call{value: slashedAmount}("");
            require(s2, "Slashed bond transfer failed");
        }

        emit ArbitratorRemoved(msg.sender, "Willing withdrawal");
    }

    // ================================================================
    // BATCH LIFECYCLE - LISTING
    // ================================================================

    /**
     * @notice Creates a new harvest batch or resale batch.
     * @param _name       Product name.
     * @param _quantity   Quantity in kg.
     * @param _pricePerKg Total price per kg in Wei.
     * @param _parentId   Set to 0 for a root harvest. Set to parent batch ID for resale.
     * @param _location   Current physical location of the goods.
     * @param _expiryTimestamp Unix timestamp for product expiry. Min 24h, Max 30 days from now.
     */
    function createBatch(
        string memory _name,
        uint _quantity,
        uint _pricePerKg,
        uint _parentId,
        string memory _location,
        uint _expiryTimestamp
    ) external payable {
        require(bytes(_name).length > 0, "Name cannot be empty");
        require(_quantity > 0, "Quantity must be > 0");
        require(_pricePerKg > 0, "Price must be > 0");
        require(bytes(_location).length > 0, "Location cannot be empty");
        require(_expiryTimestamp >= block.timestamp + MIN_EXPIRY_DURATION, "Expiry too soon - minimum 24 hours");
        require(_expiryTimestamp <= block.timestamp + MAX_EXPIRY_DURATION, "Expiry too far - maximum 30 days");

        uint stakeRequired = _calculateStake(_pricePerKg * _quantity);
        uint actualStake = 0;

        if (_parentId == 0) {
            // Root harvest - stake required
            if (isAdminSponsored[msg.sender]) {
                require(msg.value == 0, "No stake needed - Admin Sponsored");
                isAdminSponsored[msg.sender] = false;
                actualStake = stakeRequired; // Conceptually covered by Admin
            } else {
                require(msg.value == stakeRequired, "Incorrect stake amount");
                actualStake = stakeRequired;
            }
        } else {
            // Resale/child batch - no stake
            require(msg.value == 0, "No stake required for resale batches");
            Batch storage parent = batches[_parentId];
            require(parent.id != 0, "Parent batch does not exist");
            require(parent.status == Status.Created, "Parent batch not available");
            require(parent.remainingQuantity >= _quantity, "Insufficient supply in parent");
            require(
                msg.sender == parent.buyer ||
                (parent.buyer == address(0) && msg.sender == parent.farmer),
                "Unauthorized: You do not own this supply"
            );
            parent.remainingQuantity -= _quantity;
        }

        batchCount++;
        batches[batchCount] = Batch({
            id: batchCount,
            parentId: _parentId,
            name: _name,
            quantity: _quantity,
            remainingQuantity: _quantity,
            pricePerKg: _pricePerKg,
            escrowAmount: 0,
            stakeAmount: actualStake,
            farmer: msg.sender,
            buyer: address(0),
            status: Status.Created,
            isAdminSponsored: (_parentId == 0 && msg.value == 0 && actualStake > 0),
            location: _location,
            expiryTimestamp: _expiryTimestamp,
            video1Hash: bytes32(0),
            trackingId: "",
            trusteeAddress: address(0),
            trusteeConsentHash: bytes32(0),
            dispatchTimestamp: 0
        });

        emit BatchCreated(batchCount, _name, _quantity, _pricePerKg, msg.sender, _location, _expiryTimestamp);
    }

    // ================================================================
    // BATCH LIFECYCLE - PURCHASE
    // ================================================================

    function purchaseBatch(uint _batchId) external payable nonReentrant {
        Batch storage batch = batches[_batchId];
        require(batch.id != 0, "Batch does not exist");
        require(batch.status == Status.Created, "Batch not available");
        require(msg.sender != batch.farmer, "Farmer cannot buy own batch");
        uint totalCost = batch.pricePerKg * batch.quantity;
        require(msg.value == totalCost, "Incorrect payment amount");
        require(block.timestamp < batch.expiryTimestamp, "Batch has expired");

        batch.buyer = msg.sender;
        batch.status = Status.Sold;
        batch.escrowAmount = msg.value;

        emit BatchPurchased(_batchId, msg.sender, msg.value);
    }

    function purchasePartialBatch(uint _batchId, uint _quantity) external payable nonReentrant {
        Batch storage parent = batches[_batchId];
        require(parent.id != 0, "Parent does not exist");
        require(parent.status == Status.Created, "Parent not available");
        require(_quantity > 0 && _quantity <= parent.remainingQuantity, "Invalid quantity");
        require(msg.sender != parent.farmer, "Farmer cannot buy own batch");
        require(block.timestamp < parent.expiryTimestamp, "Batch has expired");

        uint reqPayment = parent.pricePerKg * _quantity;
        require(msg.value == reqPayment, "Incorrect payment amount");

        parent.remainingQuantity -= _quantity;

        batchCount++;
        batches[batchCount] = Batch({
            id: batchCount,
            parentId: _batchId,
            name: parent.name,
            quantity: _quantity,
            remainingQuantity: _quantity,
            pricePerKg: parent.pricePerKg,
            escrowAmount: msg.value,
            stakeAmount: 0,            // Child batches carry no stake
            farmer: parent.farmer,
            buyer: msg.sender,
            status: Status.Sold,
            isAdminSponsored: false,
            location: parent.location, // Inherited from parent
            expiryTimestamp: parent.expiryTimestamp,
            video1Hash: bytes32(0),
            trackingId: "",
            trusteeAddress: address(0),
            trusteeConsentHash: bytes32(0),
            dispatchTimestamp: 0
        });

        emit BatchCreated(batchCount, parent.name, _quantity, parent.pricePerKg, parent.farmer, parent.location, parent.expiryTimestamp);
        emit BatchPurchased(batchCount, msg.sender, msg.value);
    }

    // ================================================================
    // BATCH LIFECYCLE - PRE-DISPATCH
    // ================================================================

    /**
     * @notice Buyer nominates a trusted person to receive the delivery on their behalf.
     * @param _trusteeAddress     Ethereum address of the trustee.
     * @param _consentHash        IPFS hash of buyer's consent video.
     */
    function nominateTrustee(
        uint _batchId,
        address _trusteeAddress,
        bytes32 _consentHash
    ) external {
        Batch storage batch = batches[_batchId];
        require(batch.id != 0, "Batch does not exist");
        require(batch.status == Status.Sold || batch.status == Status.Dispatched, "Invalid state");
        require(msg.sender == batch.buyer, "Only buyer can nominate a trustee");
        require(_trusteeAddress != address(0), "Trustee address required");
        require(_consentHash != bytes32(0), "Consent video hash required");

        batch.trusteeAddress = _trusteeAddress;
        batch.trusteeConsentHash = _consentHash;

        emit TrusteeNominated(_batchId, msg.sender, _trusteeAddress);
    }

    /**
     * @notice Farmer uploads pre-packing video to establish baseline quality on-chain.
     */
    function uploadPackingVideo(uint _batchId, bytes32 _video1Hash) external {
        Batch storage batch = batches[_batchId];
        require(batch.id != 0, "Batch does not exist");
        require(batch.status == Status.Sold, "Must be in Sold status");
        require(msg.sender == batch.farmer, "Only farmer can upload packing video");
        require(batch.video1Hash == bytes32(0), "Video already submitted.");
        require(_video1Hash != bytes32(0), "Invalid IPFS hash");

        batch.video1Hash = _video1Hash;

        emit PackingVideoUploaded(_batchId, _video1Hash);
    }

    /**
     * @notice Farmer confirms dispatch, providing an immutable carrier tracking reference.
     */
    function confirmDispatch(uint _batchId, string memory _trackingId) external {
        Batch storage batch = batches[_batchId];
        require(batch.id != 0, "Batch does not exist");
        require(batch.status == Status.Sold, "Must be in Sold status");
        require(msg.sender == batch.farmer, "Only farmer can confirm dispatch");
        require(bytes(_trackingId).length > 0, "Tracking ID is required");
        require(batch.video1Hash != bytes32(0), "Must upload packing video before dispatch");

        batch.status = Status.Dispatched;
        batch.trackingId = _trackingId;
        batch.dispatchTimestamp = block.timestamp;

        emit BatchDispatched(_batchId, _trackingId);
    }

    // ================================================================
    // BATCH LIFECYCLE - DELIVERY CONFIRMATION
    // ================================================================

    /**
     * @notice Buyer or Nominated Trustee confirms full delivery after OTP verification off-chain.
     */
    function confirmDelivery(uint _batchId, bytes32 _video2Hash) external nonReentrant {
        Batch storage batch = batches[_batchId];
        require(batch.id != 0, "Batch does not exist");
        require(batch.status == Status.Dispatched, "Goods not dispatched yet");
        require(msg.sender == batch.buyer || msg.sender == batch.trusteeAddress, "Only buyer or trustee can confirm delivery");

        batch.status = Status.Confirmed;

        uint escrow = batch.escrowAmount;
        batch.escrowAmount = 0;

        uint protocolFee = (escrow * PROTOCOL_FEE_PERCENT) / 100;
        uint farmerPayout = escrow - protocolFee;

        // Return stake for root batches
        if (batch.parentId == 0 && batch.stakeAmount > 0) {
            if (batch.isAdminSponsored) {
                protocolFee += batch.stakeAmount;
            } else {
                farmerPayout += batch.stakeAmount;
            }
            batch.stakeAmount = 0;
        }

        totalEarnings[batch.farmer] += (escrow - protocolFee);

        (bool s1, ) = payable(batch.farmer).call{value: farmerPayout}("");
        require(s1, "Farmer payout failed");
        (bool s2, ) = payable(adminTreasury).call{value: protocolFee}("");
        require(s2, "Protocol fee transfer failed");

        emit DeliveryConfirmed(_batchId, msg.sender, farmerPayout, _video2Hash);
    }

    /**
     * @notice Buyer or Nominated Trustee confirms partial delivery - proportional escrow released.
     */
    function partialConfirm(
        uint _batchId,
        uint _acceptedQuantity,
        bytes32 _video2Hash
    ) external nonReentrant {
        Batch storage batch = batches[_batchId];
        require(batch.id != 0, "Batch does not exist");
        require(batch.status == Status.Dispatched, "Goods not dispatched yet");
        require(msg.sender == batch.buyer || msg.sender == batch.trusteeAddress, "Only buyer or trustee can confirm delivery");
        require(_acceptedQuantity > 0 && _acceptedQuantity < batch.quantity, "Invalid partial quantity");
        require(_video2Hash != bytes32(0), "Delivery video hash required");

        batch.status = Status.PartialConfirm;
        batch.remainingQuantity = 0;

        uint farmerPayout  = (batch.escrowAmount * _acceptedQuantity) / batch.quantity;
        uint buyerRefund   = batch.escrowAmount - farmerPayout;
        batch.escrowAmount = 0;

        // Full stake returned to farmer - stake is anti-spam, not per-kg
        uint stakeReturn = 0;
        if (batch.parentId == 0 && batch.stakeAmount > 0) {
            if (!batch.isAdminSponsored) {
                stakeReturn = batch.stakeAmount;
            } else {
                (bool sa, ) = payable(adminTreasury).call{value: batch.stakeAmount}("");
                require(sa, "Admin stake return failed");
                isAdminSponsored[batch.farmer] = true;
            }
            batch.stakeAmount = 0;
        }

        totalEarnings[batch.farmer] += farmerPayout;

        (bool s1, ) = payable(batch.farmer).call{value: farmerPayout + stakeReturn}("");
        require(s1, "Farmer payout failed");
        (bool s2, ) = payable(batch.buyer).call{value: buyerRefund}("");
        require(s2, "Buyer refund failed");

        emit PartialDeliveryConfirmed(_batchId, _acceptedQuantity, farmerPayout, buyerRefund);
    }

    // ================================================================
    // BATCH LIFECYCLE - CANCELLATION / REFUND
    // ================================================================

    /**
     * @notice Refunds buyer. Only valid BEFORE dispatch is confirmed.
     */
    function refund(uint _batchId) external nonReentrant {
        Batch storage batch = batches[_batchId];
        require(batch.id != 0, "Batch does not exist");
        require(batch.status == Status.Sold, "Can only refund from Sold status (pre-dispatch)");
        require(msg.sender == batch.buyer || msg.sender == batch.farmer, "Not authorized");

        address originalBuyer = batch.buyer;
        uint amount = batch.escrowAmount;

        batch.status = Status.Refunded;
        batch.buyer = address(0);
        batch.escrowAmount = 0;
        batch.remainingQuantity = 0;

        // Restore quantity to parent if partial
        if (batch.parentId != 0) {
            batches[batch.parentId].remainingQuantity += batch.quantity;
        }

        (bool s1, ) = payable(originalBuyer).call{value: amount}("");
        require(s1, "Buyer refund failed");

        // Return stake for root batches
        if (batch.parentId == 0 && batch.stakeAmount > 0) {
            uint stake = batch.stakeAmount;
            batch.stakeAmount = 0;
            if (batch.isAdminSponsored) {
                (bool s2, ) = payable(adminTreasury).call{value: stake}("");
                require(s2, "Admin stake return failed");
                isAdminSponsored[batch.farmer] = true;
            } else {
                (bool s2, ) = payable(batch.farmer).call{value: stake}("");
                require(s2, "Farmer stake return failed");
            }
        }

        emit Refunded(_batchId, originalBuyer, amount);
    }

    /**
     * @notice Farmer cancels an unsold listing and recovers stake.
     */
    function cancelBatch(uint _batchId) external nonReentrant {
        Batch storage batch = batches[_batchId];
        require(batch.id != 0, "Batch does not exist");
        require(batch.parentId == 0, "Only root batches can be cancelled");
        require(batch.status == Status.Created, "Can only cancel unsold batches");
        require(msg.sender == batch.farmer, "Only farmer can cancel");

        batch.status = Status.Cancelled;
        batch.remainingQuantity = 0;

        uint stake = batch.stakeAmount;
        batch.stakeAmount = 0;

        if (batch.isAdminSponsored) {
            (bool s1, ) = payable(adminTreasury).call{value: stake}("");
            require(s1, "Admin stake return failed");
            isAdminSponsored[batch.farmer] = true;
        } else {
            (bool s1, ) = payable(batch.farmer).call{value: stake}("");
            require(s1, "Farmer stake return failed");
        }

        emit BatchCancelled(_batchId, batch.farmer);
    }

    // ================================================================
    // DISPUTE SYSTEM
    // ================================================================

    /**
     * @notice Files a dispute. Requires a dispute bond from buyer.
     * @dev AUTO-RESOLVES in buyer's favour if farmer uploaded no packing video.
     */
    function reportSpoilt(uint _batchId, bytes32 _video2Hash) external payable nonReentrant {
        Batch storage batch = batches[_batchId];
        require(batch.id != 0, "Batch does not exist");
        require(batch.status == Status.Dispatched, "Must be in Dispatched status");
        require(msg.sender == batch.buyer || msg.sender == batch.farmer, "Not authorized");

        // ── AUTO-RESOLVE: No Video 1 = Automatic Buyer Wins ──────────────────────
        if (batch.video1Hash == bytes32(0)) {
            require(msg.value == 0, "No bond needed for auto-resolve (no video = auto buyer wins)");
            batch.status = Status.BuyerWins;

            uint escrow = batch.escrowAmount;
            uint stake  = batch.stakeAmount;
            batch.escrowAmount = 0;
            batch.stakeAmount  = 0;

            // Refund buyer
            (bool s1, ) = payable(batch.buyer).call{value: escrow}("");
            require(s1, "Buyer refund failed");

            // Farmer's stake to Admin (as penalty for no evidence)
            if (stake > 0) {
                (bool s2, ) = payable(adminTreasury).call{value: stake}("");
                require(s2, "Stake transfer failed");
            }

            emit AutoResolvedNoBuyerWins(_batchId, batch.buyer, "No packing video submitted by farmer");
            return;
        }

        require(!batch.isAdminSponsored, "Sponsored batches cannot file standard bonds. Admin exception needed.");

        // ── FULL DISPUTE: Both videos exist, requires bond ────────────────────────
        uint bondRequired = _calculateDisputeBond(batch.pricePerKg * batch.quantity);
        require(msg.value == bondRequired, "Incorrect dispute bond amount");
        require(arbitratorPool.length >= 5, "Not enough arbitrators in pool");

        disputeCount++;

        disputes[disputeCount] = Dispute({
            batchId: _batchId,
            video2Hash: _video2Hash,
            initiator: msg.sender,
            votesForFarmer: 0,
            votesForBuyer: 0,
            resolved: false,
            bondAmount: msg.value
        });

        batch.status = Status.Disputed;

        emit DisputeFiled(disputeCount, _batchId, msg.sender);
    }

    /**
     * @notice Arbitrators commit their secret vote hash.
     * @dev The first 5 active arbitrators to commit form the jury.
     */
    function commitArbitratorVote(uint _disputeId, bytes32 _commitHash) external onlyActiveArbitrator nonReentrant {
        Dispute storage dispute = disputes[_disputeId];
        require(!dispute.resolved, "Dispute already resolved");
        require(!hasCommittedOnDispute[_disputeId][msg.sender], "Already committed on this dispute");
        
        address[] storage jury = disputeCommittedArbitrators[_disputeId];
        require(jury.length < 5, "Jury pool of 5 already filled");

        hasCommittedOnDispute[_disputeId][msg.sender] = true;
        arbitratorCommits[_disputeId][msg.sender] = _commitHash;
        jury.push(msg.sender);

        emit ArbitratorVoteSubmitted(_disputeId, msg.sender);
    }

    /**
     * @notice Committed arbitrators reveal their plaintext votes.
     * @dev Once 3 winning votes are revealed, the dispute auto-finalizes.
     */
    function revealArbitratorVote(uint _disputeId, bool _votesForFarmer, uint256 _salt) external onlyActiveArbitrator nonReentrant {
        Dispute storage dispute = disputes[_disputeId];
        require(!dispute.resolved, "Dispute already resolved");
        require(hasCommittedOnDispute[_disputeId][msg.sender], "Did not commit a vote for this dispute");
        require(!hasRevealedOnDispute[_disputeId][msg.sender], "Already revealed vote");

        bytes32 expectedHash = keccak256(abi.encodePacked(_votesForFarmer, _salt));
        require(arbitratorCommits[_disputeId][msg.sender] == expectedHash, "Invalid commit reveal parameters");

        hasRevealedOnDispute[_disputeId][msg.sender] = true;
        hasVotedOnDispute[_disputeId][msg.sender] = true;
        arbitratorVoteForFarmer[_disputeId][msg.sender] = _votesForFarmer;

        if (_votesForFarmer) {
            dispute.votesForFarmer++;
        } else {
            dispute.votesForBuyer++;
        }

        // Auto-finalize: first side to 3 votes wins immediately
        if (dispute.votesForFarmer >= 3 || dispute.votesForBuyer >= 3) {
            _finalizeDisputeInternal(_disputeId);
        }
    }

    /**
     * @notice Safety-valve: manually finalize a dispute if a side has already reached 3 votes.
     */
    function finalizeDispute(uint _disputeId) external nonReentrant {
        Dispute storage dispute = disputes[_disputeId];
        require(!dispute.resolved, "Already resolved");
        require(
            dispute.votesForFarmer >= 3 || dispute.votesForBuyer >= 3,
            "No majority reached yet - 3 votes required"
        );
        _finalizeDisputeInternal(_disputeId);
    }

    /**
     * @notice Internal dispute resolution logic.
     * @dev Payment per winning arbitrator = losing_party_stake ÷ 3.
     */
    function _finalizeDisputeInternal(uint _disputeId) internal {
        Dispute storage dispute = disputes[_disputeId];
        dispute.resolved = true;

        bool farmerWins = dispute.votesForFarmer >= 3;

        Batch storage batch = batches[dispute.batchId];
        uint escrow = batch.escrowAmount;
        uint stake  = batch.stakeAmount;
        uint bond   = dispute.bondAmount;
        batch.escrowAmount = 0;
        batch.stakeAmount  = 0;

        // Payment = losing party's stake ÷ 3 (always exactly 3 winners in first-to-3 model)
        uint payPerWinner = farmerWins ? bond / 3 : stake / 3;

        if (farmerWins) {
            batch.status = Status.FarmerWins;
            // Farmer gets escrow + stake returned
            totalEarnings[batch.farmer] += escrow;
            (bool s1, ) = payable(batch.farmer).call{value: escrow + stake}("");
            require(s1, "Farmer payout failed");
        } else {
            batch.status = Status.BuyerWins;
            // Buyer gets escrow refund + bond returned
            (bool s1, ) = payable(batch.buyer).call{value: escrow + bond}("");
            require(s1, "Buyer refund failed");
        }

        // Update arbitrator ratings and reward winners (Pull withdrawal pattern)
        address[] storage jury = disputeCommittedArbitrators[_disputeId];
        uint juryLength = jury.length;
        for (uint i = 0; i < juryLength; i++) {
            address arb = jury[i];
            if (!hasRevealedOnDispute[_disputeId][arb]) {
                continue; // Did not participate in time - no consequence
            }

            bool votedForFarmer = arbitratorVoteForFarmer[_disputeId][arb];
            bool isWinner       = (farmerWins == votedForFarmer);

            if (isWinner) {
                arbitrators[arb].rating       += RATING_INCREMENT;
                claimableArbitratorRewards[arb] += payPerWinner;
                arbitrators[arb].totalEarnings += payPerWinner;
                arbitrators[arb].disputesResolved++;
            } else {
                arbitrators[arb].disputesResolved++;
                _decrementArbitratorRating(arb); // Penalise minority voters
            }
        }

        uint winningVotes = farmerWins ? dispute.votesForFarmer : dispute.votesForBuyer;
        emit DisputeResolved(_disputeId, dispute.batchId, farmerWins, winningVotes);
    }

    /**
     * @notice Exposes reward withdrawal for arbitrators.
     */
    function claimArbitratorRewards() external nonReentrant {
        uint reward = claimableArbitratorRewards[msg.sender];
        require(reward > 0, "No rewards to claim");
        claimableArbitratorRewards[msg.sender] = 0;
        (bool success, ) = payable(msg.sender).call{value: reward}("");
        require(success, "Reward transfer failed");
    }

    /**
     * @notice Farmer claims escrowed funds after buyer is permanently silent past dispatch + grace period.
     */
    function claimAbandoned(uint _batchId) external nonReentrant {
        Batch storage batch = batches[_batchId];
        require(batch.id != 0, "Batch does not exist");
        require(batch.status == Status.Dispatched, "Must be in Dispatched status");
        require(msg.sender == batch.farmer, "Only farmer can claim abandoned batch");
        require(
            block.timestamp > batch.dispatchTimestamp + ABANDON_GRACE_PERIOD,
            "Grace period has not expired yet"
        );

        batch.status = Status.Abandoned;

        uint escrow = batch.escrowAmount;
        uint stake  = batch.stakeAmount;
        batch.escrowAmount = 0;
        batch.stakeAmount  = 0;

        uint stakeReturn = 0;
        uint adminAmount = 0;

        if (batch.parentId == 0 && stake > 0) {
            if (batch.isAdminSponsored) {
                adminAmount = stake;
            } else {
                stakeReturn = stake;
            }
        }

        totalEarnings[batch.farmer] += escrow;

        (bool s1, ) = payable(batch.farmer).call{value: escrow + stakeReturn}("");
        require(s1, "Farmer payout failed");

        if (adminAmount > 0) {
            (bool s2, ) = payable(adminTreasury).call{value: adminAmount}("");
            require(s2, "Admin stake return failed");
            isAdminSponsored[batch.farmer] = true;
        }

        emit BatchAbandoned(_batchId, batch.farmer, escrow);
    }

    // ================================================================
    // INTERNAL HELPERS
    // ================================================================

    function _calculateStake(uint _totalValue) internal pure returns (uint) {
        uint pctStake = (_totalValue * STAKE_PERCENT) / 100;
        return pctStake > MIN_STAKE ? pctStake : MIN_STAKE;
    }

    function _calculateDisputeBond(uint _totalValue) internal pure returns (uint) {
        uint pctBond = (_totalValue * DISPUTE_BOND_PERCENT) / 100;
        return pctBond > MIN_DISPUTE_BOND ? pctBond : MIN_DISPUTE_BOND;
    }

    function _decrementArbitratorRating(address _arb) internal {
        if (arbitrators[_arb].rating >= RATING_DECREMENT) {
            arbitrators[_arb].rating -= RATING_DECREMENT;
        } else {
            arbitrators[_arb].rating = 0;
        }
        if (arbitrators[_arb].rating < ARBITRATOR_MIN_RATING) {
            _removeArbitratorInternal(_arb, "Rating fell below minimum threshold (3.0)");
        }
    }

    // ================================================================
    // VIEW FUNCTIONS
    // ================================================================

    function calculateStake(uint _totalValue) external pure returns (uint) {
        return _calculateStake(_totalValue);
    }

    function calculateDisputeBond(uint _totalValue) external pure returns (uint) {
        return _calculateDisputeBond(_totalValue);
    }

    function getArbitratorPool() external view returns (address[] memory) {
        return arbitratorPool;
    }

    function getArbitrator(address _arb) external view returns (Arbitrator memory) {
        return arbitrators[_arb];
    }

    function getDisputeArbitrators(uint _disputeId) external view returns (address[] memory) {
        return disputeCommittedArbitrators[_disputeId];
    }

    function getArbitratorPoolSize() external view returns (uint) {
        return arbitratorPool.length;
    }
}
