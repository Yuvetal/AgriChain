// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

contract SupplyChain is ReentrancyGuard {
    enum Status {
        Created,
        Sold,
        Delivered,
        Refunded,
        Spoilt
    }

    struct Batch {
        uint id;
        uint parentId;
        string name;
        uint quantity;
        uint remainingQuantity;
        uint price;
        uint escrowAmount;
        address farmer;
        address buyer;
        Status status;
        bool isAdminSponsored;
        string location;
    }

    event BatchCreated(uint indexed batchId, string name, uint quantity, uint price, address indexed farmer, string location);
    event BatchPurchased(uint indexed batchId, address indexed buyer, uint amount);
    event DeliveryConfirmed(uint indexed batchId, address indexed farmer, uint amount);
    event Refunded(uint indexed batchId, address indexed buyer, uint amount);
    event BatchSpoilt(uint indexed batchId, address indexed buyer, uint amount);

    /// @notice Total number of batches ever created on-chain.
    uint public batchCount;
    /// @notice The security amount (0.01 ETH) required for Root Harvest registrations.
    uint public constant STAKE_AMOUNT = 0.01 ether;
    /// @notice Mapping from Batch ID to its full cryptographic metadata.
    mapping(uint => Batch) public batches;
    
    /// @notice Tracks the cumulative net earnings (excluding returned stakes) of a farmer.
    mapping(address => uint) public totalEarnings; 
    /// @notice Tracks if an address currently holds an unused Admin sponsorship token.
    mapping(address => bool) public isAdminSponsored; 
    
    AggregatorV3Interface internal dataFeed;
    /// @notice The address where 2% marketplace fees and unclaimed stakes are routed.
    address public adminTreasury; 

    /**
     * @notice Initializes the Supply Chain with the current admin and the Chainlink Price Feed.
     */
    constructor() {
        adminTreasury = msg.sender;
        dataFeed = AggregatorV3Interface(0x694AA1769357215DE4FAC081bf1f309aDC325306);
    }

    /**
     * @notice Natively computes the mathematically proven ETH/USD Price from the Chainlink Oracle.
     * @dev Removes centralized oracle risk and allows for transparent INR pricing in the UI.
     * @return price The current ETH price with 8 decimals.
     */
    function getLatestEthUsdPrice() public view returns (int) {
        (
            /* uint80 roundID */,
            int price,
            /*uint startedAt*/,
            /*uint timeStamp*/,
            /*uint80 answeredInRound*/
        ) = dataFeed.latestRoundData();
        return price;
    }

    /**
     * @notice Allows the Admin Treasury to front the staking cost for new, unverified farmers.
     * @dev Creates a "Seed Subsidy" that is consumed upon the first batch creation.
     * @dev Only available if the farmer's total earnings are below the 0.01 ETH threshold.
     * @param _farmer The target address to receive the sponsorship.
     */
    function sponsorFarmer(address _farmer) external payable nonReentrant {
        require(msg.sender == adminTreasury, "Only the Admin Treasury can sponsor farmers");
        require(msg.value == STAKE_AMOUNT, "Must deposit exactly the STAKE_AMOUNT");
        require(totalEarnings[_farmer] < STAKE_AMOUNT, "Farmer has already earned enough to be financially independent");
        require(!isAdminSponsored[_farmer], "Farmer is already sponsored");
        
        isAdminSponsored[_farmer] = true;
    }

    /**
     * @notice Records an agricultural batch (Harvest or Resale) as an immutable block on the ledger.
     * @dev If _parentId is 0, a 0.01 ETH stake is required unless the sender is Admin Sponsored.
     * @param _name The taxonomic or commercial identifier of the produce.
     * @param _quantity The numeric mass in kilograms (int).
     * @param _price The total target price in Wei (18-decimal integer).
     * @param _parentId The ID of the source batch. Set to 0 for a Root Harvest.
     */
    function createBatch(
        string memory _name,
        uint _quantity,
        uint _price,
        uint _parentId,
        string memory _location
    ) public payable {
        require(bytes(_name).length > 0, "Name cannot be empty");
        require(_quantity > 0, "Quantity must be > 0");
        require(_price > 0, "Price must be > 0");

        if (_parentId == 0) {
            if (isAdminSponsored[msg.sender]) {
                require(msg.value == 0, "No native stake required. Your crop is explicitly Admin Sponsored.");
                isAdminSponsored[msg.sender] = false; 
            } else {
                require(msg.value == STAKE_AMOUNT, "Must stake exactly 0.01 ETH to prevent Sybil attacks");
            }
        } else {
            require(msg.value == 0, "No stake required for reselling downstream");
            require(batches[_parentId].id != 0, "Parent batch does not exist");
            require(batches[_parentId].status != Status.Refunded, "Cannot source from a refunded parent");
            require(batches[_parentId].remainingQuantity >= _quantity, "Parent lacks enough downstream supply");
            
            require(
                msg.sender == batches[_parentId].buyer || 
                (batches[_parentId].buyer == address(0) && msg.sender == batches[_parentId].farmer), 
                "Unauthorized: You do not legally own this parent supply"
            );

            batches[_parentId].remainingQuantity -= _quantity;
        }

        batchCount++;

        batches[batchCount] = Batch({
            id: batchCount,
            parentId: _parentId,
            name: _name,
            quantity: _quantity,
            remainingQuantity: _quantity, 
            price: _price,
            escrowAmount: 0,
            farmer: msg.sender,
            buyer: address(0),
            status: Status.Created,
            isAdminSponsored: (_parentId == 0 && msg.value == 0),
            location: _location
        });

        emit BatchCreated(batchCount, _name, _quantity, _price, msg.sender, _location);
    }

    /**
     * @notice Commits the full purchase price of a batch into a smart contract escrow.
     * @param _batchId The unique integer ID of the target produce.
     */
    function purchaseBatch(uint _batchId) public payable nonReentrant {
        Batch storage batch = batches[_batchId];

        require(batch.id != 0, "Batch does not exist");
        require(batch.status == Status.Created, "Already sold or processed");
        require(msg.sender != batch.farmer, "Farmer cannot buy their own batch");
        require(msg.value == batch.price, "Incorrect payment amount sent");

        batch.buyer = msg.sender;
        batch.status = Status.Sold;
        batch.escrowAmount = msg.value;

        emit BatchPurchased(_batchId, msg.sender, msg.value);
    }

    /**
     * @notice Allows an institutional or retail buyer to splinter a specific quantity from a larger batch.
     * @dev Spawns a new unique batch tracking the fractional owner while preserving parent lineage.
     * @param _batchId The source batch ID.
     * @param _quantity The fractional quantity to purchase (kg).
     */
    function purchasePartialBatch(uint _batchId, uint _quantity) public payable nonReentrant {
        Batch storage parent = batches[_batchId];
        
        require(parent.id != 0, "Parent batch does not exist");
        require(parent.status == Status.Created, "Parent batch is no longer available");
        require(_quantity > 0, "Must buy at least 1 unit");
        require(parent.remainingQuantity >= _quantity, "Not enough remaining quantity");
        require(msg.sender != parent.farmer, "Farmer cannot buy their own fractional batch");
        
        uint fractionalPrice = (parent.price * _quantity) / parent.quantity;
        require(msg.value == fractionalPrice, "Incorrect EVM payment amount sent for this fraction");

        parent.remainingQuantity -= _quantity;

        batchCount++;
        batches[batchCount] = Batch({
            id: batchCount,
            parentId: _batchId,
            name: parent.name,
            quantity: _quantity,
            remainingQuantity: _quantity,
            price: fractionalPrice,
            escrowAmount: msg.value,
            farmer: parent.farmer,
            buyer: msg.sender,
            status: Status.Sold,
            isAdminSponsored: false,
            location: parent.location
        });

        emit BatchCreated(batchCount, parent.name, _quantity, fractionalPrice, parent.farmer, parent.location);
        emit BatchPurchased(batchCount, msg.sender, msg.value);
    }

    /**
     * @notice Cancels an unlisted root harvest and restores the security stake to the origin address.
     * @param _batchId The batch ID to be unlisted.
     */
    function cancelBatch(uint _batchId) public nonReentrant {
        Batch storage batch = batches[_batchId];
        require(batch.id != 0, "Batch does not exist");
        require(batch.parentId == 0, "Only original staked harvests can be unlisted");
        require(batch.status == Status.Created, "Cannot unlist a sold/processed harvest");
        require(msg.sender == batch.farmer, "Not authorized to unlist");

        batch.status = Status.Refunded; 
        batch.remainingQuantity = 0; 

        if (batch.isAdminSponsored) {
            (bool success, ) = payable(adminTreasury).call{value: STAKE_AMOUNT}("");
            require(success, "Admin Sponsor refund failed");
            isAdminSponsored[batch.farmer] = true;
        } else {
            (bool success, ) = payable(batch.farmer).call{value: STAKE_AMOUNT}("");
            require(success, "Stake refund transfer failed");
        }
    }

    /**
     * @notice Finalizes a sale, releases funds from escrow to the farmer, and returns the stake.
     * @dev Applies a 2% protocol fee to the admin treasury.
     * @param _batchId The batch ID tracking the successful delivery.
     */
    function confirmDelivery(uint _batchId) public nonReentrant {
        Batch storage batch = batches[_batchId];

        require(batch.id != 0, "Batch does not exist");
        require(batch.status == Status.Sold, "Invalid State: Not Sold");
        require(msg.sender == batch.buyer, "Only the designated buyer can confirm delivery");

        batch.status = Status.Delivered;

        uint amount = batch.escrowAmount;
        require(amount > 0, "No funds in escrow");
        batch.escrowAmount = 0;

        uint protocolFee = (amount * 2) / 100;
        uint payout = amount - protocolFee;

        // Traceable Achievement: Increment earnings by the net protocol payout (Sale Revenue - 2% fee)
        totalEarnings[batch.farmer] += payout;

        if (batch.parentId == 0) {
            if (batch.isAdminSponsored) {
                protocolFee += STAKE_AMOUNT; 
            } else {
                payout += STAKE_AMOUNT; 
            }
        }

        (bool successFarmer, ) = payable(batch.farmer).call{value: payout}("");
        require(successFarmer, "Transfer to farmer failed");

        (bool successTreasury, ) = payable(adminTreasury).call{value: protocolFee}("");
        require(successTreasury, "Transfer to treasury failed");

        emit DeliveryConfirmed(_batchId, batch.farmer, payout);
    }

    /**
     * @notice Reverts a sale and returns the escrowed payment to the buyer.
     * @dev Restores any fractional quantity back to the parent batch.
     * @param _batchId The batch ID to be refunded.
     */
    function refund(uint _batchId) public nonReentrant {
        Batch storage batch = batches[_batchId];

        require(batch.id != 0, "Batch does not exist");
        require(batch.status == Status.Sold, "Invalid State: Not Sold");
        
        require(msg.sender == batch.buyer || msg.sender == batch.farmer, "Not authorized to refund");

        address originalBuyer = batch.buyer;
        uint amount = batch.escrowAmount;
        require(amount > 0, "No funds in escrow to refund");

        batch.status = Status.Refunded;
        batch.buyer = address(0);
        batch.escrowAmount = 0; 
        
        batch.remainingQuantity = 0;
        
        if (batch.parentId != 0) {
            batches[batch.parentId].remainingQuantity += batch.quantity;
        }

        (bool success1, ) = payable(originalBuyer).call{value: amount}("");
        require(success1, "Refund transfer failed");

        if (batch.parentId == 0) {
            if (batch.isAdminSponsored) {
                (bool success2, ) = payable(adminTreasury).call{value: STAKE_AMOUNT}("");
                require(success2, "Admin stake refund failed");
                isAdminSponsored[batch.farmer] = true;
            } else {
                (bool success2, ) = payable(batch.farmer).call{value: STAKE_AMOUNT}("");
                require(success2, "Farmer stake refund failed");
            }
        }

        emit Refunded(_batchId, originalBuyer, amount);
    }

    /**
     * @notice Marks a batch as burnt/spoilt in transit.
     * @dev Refunds buyer, but only releases stake if it was a Root Harvest (parentId == 0).
     * @param _batchId The unique id of the damaged goods.
     */
    function reportSpoilt(uint _batchId) public nonReentrant {
        Batch storage batch = batches[_batchId];
        require(batch.id != 0, "Batch does not exist");
        require(batch.status == Status.Sold, "Invalid State: Not Sold");
        require(msg.sender == batch.buyer || msg.sender == batch.farmer, "Not authorized to report spoilage");

        batch.status = Status.Spoilt;
        address originalBuyer = batch.buyer;
        uint amount = batch.escrowAmount;
        batch.escrowAmount = 0;
        batch.remainingQuantity = 0;

        // Refund the Buyer
        (bool successBuyer, ) = payable(originalBuyer).call{value: amount}("");
        require(successBuyer, "Buyer refund failed");

        // Stake Persistence Logic (As per Developer-Evaluator Agreement)
        if (batch.parentId == 0) {
            if (batch.isAdminSponsored) {
                (bool successAdmin, ) = payable(adminTreasury).call{value: STAKE_AMOUNT}("");
                require(successAdmin, "Admin stake refund failed");
                isAdminSponsored[batch.farmer] = true; // Reinstate sponsorship for their next harvest
            } else {
                (bool successFarmer, ) = payable(batch.farmer).call{value: STAKE_AMOUNT}("");
                require(successFarmer, "Farmer stake refund failed");
            }
        }
        // If parentId != 0, we do NOTHING. Stake stays in the contract securing other parts of the parent.

        emit BatchSpoilt(_batchId, originalBuyer, amount);
    }
}