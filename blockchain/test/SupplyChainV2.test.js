const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SupplyChainV2 Protocol Upgrades", function () {
  let supplyChain;
  let admin, farmer, buyer, trustee;
  let arbitrators = [];

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    admin = signers[0];
    farmer = signers[1];
    buyer = signers[2];
    trustee = signers[3];
    arbitrators = signers.slice(4, 20); // 16 addresses for arbitrators

    const MockAggregator = await ethers.getContractFactory("MockAggregator");
    const mockAggregator = await MockAggregator.deploy();
    await mockAggregator.waitForDeployment();

    const mockCode = await ethers.provider.getCode(await mockAggregator.getAddress());
    await ethers.provider.send("hardhat_setCode", [
      "0x694AA1769357215DE4FAC081bf1f309aDC325306",
      mockCode
    ]);

    const SupplyChainV2 = await ethers.getContractFactory("SupplyChainV2");
    supplyChain = await SupplyChainV2.deploy();
    await supplyChain.waitForDeployment();
  });

  describe("Arbitrator Pool & Staking", function () {
    it("Should require exactly 1 ETH bond to apply as arbitrator", async function () {
      await expect(
        supplyChain.connect(arbitrators[0]).applyAsArbitrator("Arb1", "APMC001", "1234567890", {
          value: ethers.parseEther("0.5")
        })
      ).to.be.revertedWith("Invalid bond");

      await expect(
        supplyChain.connect(arbitrators[0]).applyAsArbitrator("Arb1", "APMC001", "1234567890", {
          value: ethers.parseEther("1.0")
        })
      ).to.not.be.reverted;
    });

    it("Should enforce MAX_POOL_SIZE = 15 for arbitrator pool", async function () {
      // Admin adds 15 arbitrators to fill the pool
      for (let i = 0; i < 15; i++) {
        await supplyChain.connect(admin).addArbitrator(arbitrators[i].address, {
          value: ethers.parseEther("1.0")
        });
      }

      expect(await supplyChain.getArbitratorPoolSize()).to.equal(15);

      // 16th applicant should fail application
      const signers = await ethers.getSigners();
      const extraArb = signers[19];
      await expect(
        supplyChain.connect(extraArb).applyAsArbitrator("Arb16", "APMC016", "1234567890", {
          value: ethers.parseEther("1.0")
        })
      ).to.be.revertedWith("Pool full");
    });

    it("Should perform linear slashing based on rating during willing withdrawal", async function () {
      // Add arbitrator
      await supplyChain.connect(admin).addArbitrator(arbitrators[0].address, {
        value: ethers.parseEther("1.0")
      });

      // 1. Initial rating is 4.0 (400). Refund should be: ((400 - 300) * 1) / 200 = 0.5 ETH.
      let balanceBefore = await ethers.provider.getBalance(arbitrators[0].address);
      let tx = await supplyChain.connect(arbitrators[0]).withdrawArbitrator();
      let receipt = await tx.wait();
      let gasCost = receipt.gasUsed * receipt.gasPrice;
      let balanceAfter = await ethers.provider.getBalance(arbitrators[0].address);
      
      expect(balanceAfter + gasCost - balanceBefore).to.be.closeTo(
        ethers.parseEther("0.5"),
        ethers.parseEther("0.001")
      );
    });
  });

  describe("Batch Lifecycle & Trustee Access Control", function () {
    let batchId = 1;

    beforeEach(async function () {
      // Create batch
      await supplyChain.connect(farmer).createBatch("Mangoes", 100, ethers.parseEther("0.01"), 0, "Goa", Math.floor(Date.now() / 1000) + 86400 * 5, {
        value: ethers.parseEther("0.05") // 5% of 1 ETH = 0.05 ETH
      });
      // Purchase batch
      await supplyChain.connect(buyer).purchaseBatch(batchId, {
        value: ethers.parseEther("1.0")
      });
    });

    it("Should restrict nominateTrustee to only the buyer", async function () {
      await expect(
        supplyChain.connect(farmer).nominateTrustee(batchId, trustee.address, ethers.encodeBytes32String("videoHash"))
      ).to.be.revertedWith("Only buyer");

      await expect(
        supplyChain.connect(buyer).nominateTrustee(batchId, trustee.address, ethers.encodeBytes32String("videoHash"))
      ).to.not.be.reverted;
    });

    it("Should reject confirmDispatch if packing video has not been uploaded", async function () {
      await expect(
        supplyChain.connect(farmer).confirmDispatch(batchId, "TRACK123")
      ).to.be.revertedWith("No packing video");

      await supplyChain.connect(farmer).uploadPackingVideo(batchId, ethers.encodeBytes32String("packingVideo"));
      await expect(
        supplyChain.connect(farmer).confirmDispatch(batchId, "TRACK123")
      ).to.not.be.reverted;
    });

    it("Should allow nominated trustee to confirm delivery on behalf of buyer", async function () {
      await supplyChain.connect(buyer).nominateTrustee(batchId, trustee.address, ethers.encodeBytes32String("consentVideo"));
      await supplyChain.connect(farmer).uploadPackingVideo(batchId, ethers.encodeBytes32String("packingVideo"));
      await supplyChain.connect(farmer).confirmDispatch(batchId, "TRACK123");

      // Random address cannot confirm
      const randomSigner = arbitrators[0];
      await expect(
        supplyChain.connect(randomSigner).confirmDelivery(batchId, ethers.encodeBytes32String("deliveryVideo"))
      ).to.be.revertedWith("Unauthorized");

      // Trustee can confirm
      await expect(
        supplyChain.connect(trustee).confirmDelivery(batchId, ethers.encodeBytes32String("deliveryVideo"))
      ).to.not.be.reverted;
    });
  });

  describe("Dispute Commit-Reveal Voting", function () {
    let batchId = 1;
    let disputeId = 1;

    beforeEach(async function () {
      // Fill the arbitrator pool with 8 active arbitrators (needed for 7 jury seats)
      for (let i = 0; i < 8; i++) {
        await supplyChain.connect(admin).addArbitrator(arbitrators[i].address, {
          value: ethers.parseEther("1.0")
        });
      }

      // Create batch
      await supplyChain.connect(farmer).createBatch("Wheat", 100, ethers.parseEther("0.01"), 0, "UP", Math.floor(Date.now() / 1000) + 86400 * 5, {
        value: ethers.parseEther("0.05")
      });
      // Purchase batch
      await supplyChain.connect(buyer).purchaseBatch(batchId, {
        value: ethers.parseEther("1.0")
      });
      // Upload packing video & dispatch
      await supplyChain.connect(farmer).uploadPackingVideo(batchId, ethers.encodeBytes32String("packingVideo"));
      await supplyChain.connect(farmer).confirmDispatch(batchId, "TRACK123");

      // Buyer reports spoilt (dispute filed)
      await supplyChain.connect(buyer).reportSpoilt(batchId, ethers.encodeBytes32String("spoiltVideo"), {
        value: ethers.parseEther("0.05") // dispute bond
      });
    });

    it("Should allow the first 7 arbitrators to commit and resolve immediately once a side reaches 3 votes", async function () {
      // 1. Commit phase
      const salt = 12345;
      const votes = [1, 1, 1, 2, 2, 2, 3]; // 1 = Farmer, 2 = Buyer, 3 = Neither
      const commits = [];

      for (let i = 0; i < 7; i++) {
        const commitHash = ethers.solidityPackedKeccak256(
          ["uint8", "uint256"],
          [votes[i], salt]
        );
        commits.push(commitHash);
        await supplyChain.connect(arbitrators[i]).commitArbitratorVote(disputeId, commitHash);
      }

      // 8th arbitrator should not be able to commit (jury limit is 7)
      const commit8 = ethers.solidityPackedKeccak256(["uint8", "uint256"], [1, salt]);
      await expect(
        supplyChain.connect(arbitrators[7]).commitArbitratorVote(disputeId, commit8)
      ).to.be.revertedWith("Jury filled");

      // 2. Reveal phase
      // Reveal 1 (farmer)
      await supplyChain.connect(arbitrators[0]).revealArbitratorVote(disputeId, votes[0], salt);
      // Reveal 2 (farmer)
      await supplyChain.connect(arbitrators[1]).revealArbitratorVote(disputeId, votes[1], salt);
      
      // Dispute is still unresolved (only 2 votes)
      let dispute = await supplyChain.disputes(disputeId);
      expect(dispute.resolved).to.be.false;

      // Reveal 3 (farmer) - reaching 3 votes for farmer
      await expect(
        supplyChain.connect(arbitrators[2]).revealArbitratorVote(disputeId, votes[2], salt)
      ).to.emit(supplyChain, "DisputeResolved");

      dispute = await supplyChain.disputes(disputeId);
      expect(dispute.resolved).to.be.true;
    });

    it("Should split escrow and pooled stakes 5-way when 'Neither' (option 3) wins", async function () {
      // 1. Commit phase
      const salt = 54321;
      const votes = [3, 3, 3, 1, 1, 2, 2]; // 3 voters for 'Neither'
      
      for (let i = 0; i < 7; i++) {
        const commitHash = ethers.solidityPackedKeccak256(
          ["uint8", "uint256"],
          [votes[i], salt]
        );
        await supplyChain.connect(arbitrators[i]).commitArbitratorVote(disputeId, commitHash);
      }

      // Track balances before resolution
      const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
      const farmerBalanceBefore = await ethers.provider.getBalance(farmer.address);

      // 2. Reveal 'Neither' votes to resolve dispute
      await supplyChain.connect(arbitrators[0]).revealArbitratorVote(disputeId, votes[0], salt);
      await supplyChain.connect(arbitrators[1]).revealArbitratorVote(disputeId, votes[1], salt);
      
      // The 3rd 'Neither' reveal resolves the dispute
      await supplyChain.connect(arbitrators[2]).revealArbitratorVote(disputeId, votes[2], salt);

      // Verify dispute resolution status
      const dispute = await supplyChain.disputes(disputeId);
      expect(dispute.resolved).to.be.true;

      // Verify batch status is set to FarmerWins (Status = 6)
      const batch = await supplyChain.batches(batchId);
      expect(batch.status).to.equal(6); // FarmerWins

      // Math:
      // totalPool = farmer_stake + buyer_dispute_bond = 0.05 ETH + 0.05 ETH = 0.10 ETH
      // part = 0.10 ETH / 5 = 0.02 ETH
      // Farmer payout = escrow (1.0 ETH) + part (0.02 ETH) = 1.02 ETH
      // Buyer payout = part (0.02 ETH)
      
      const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
      const farmerBalanceAfter = await ethers.provider.getBalance(farmer.address);

      expect(buyerBalanceAfter - buyerBalanceBefore).to.be.closeTo(
        ethers.parseEther("0.02"),
        ethers.parseEther("0.001")
      );

      expect(farmerBalanceAfter - farmerBalanceBefore).to.be.closeTo(
        ethers.parseEther("1.02"),
        ethers.parseEther("0.001")
      );

      // Check arbitrator rewards
      // Arbitrators 0, 1, and 2 each voted 'Neither' (winner), so they should receive part (0.02 ETH)
      expect(await supplyChain.claimableArbitratorRewards(arbitrators[0].address)).to.equal(ethers.parseEther("0.02"));
      expect(await supplyChain.claimableArbitratorRewards(arbitrators[1].address)).to.equal(ethers.parseEther("0.02"));
      expect(await supplyChain.claimableArbitratorRewards(arbitrators[2].address)).to.equal(ethers.parseEther("0.02"));
    });
  });

  describe("Fiat On/Off-Ramp", function () {
    it("Should allow admin to update USD to INR rate", async function () {
      await expect(supplyChain.connect(farmer).setUsdToInrRate(85)).to.be.revertedWith("Only Admin");
      await supplyChain.connect(admin).setUsdToInrRate(85);
      expect(await supplyChain.usdToInrRate()).to.equal(85);
    });

    it("Should request on-ramp and lock rate based on Chainlink price feed", async function () {
      // Mock price is $3000 / ETH. Rate is 83. So ETH price in INR is 3000 * 83 = 249,000 INR/ETH.
      // We request conversion of 249,000 INR (249000 * 10^18).
      // Required ETH should be exactly 1 ETH (10^18 Wei).
      const amountINR = ethers.parseEther("249000");
      
      const tx = await supplyChain.connect(farmer).requestFiatConversion(amountINR, 0); // 0 = OnRamp
      const receipt = await tx.wait();

      const request = await supplyChain.fiatRequests(1);
      expect(request.id).to.equal(1);
      expect(request.user).to.equal(farmer.address);
      expect(request.amountINR).to.equal(amountINR);
      expect(request.direction).to.equal(0); // OnRamp
      expect(request.lockedPrice).to.equal(3000n * 10n**8n);
      expect(request.status).to.equal(0); // Pending
      expect(request.requiredEth).to.equal(ethers.parseEther("1.0"));

      expect(await supplyChain.pendingRequestPerUser(farmer.address)).to.equal(1);
    });

    it("Should prevent user from requesting multiple concurrent conversions", async function () {
      const amountINR = ethers.parseEther("1000");
      await supplyChain.connect(farmer).requestFiatConversion(amountINR, 0);
      
      await expect(
        supplyChain.connect(farmer).requestFiatConversion(amountINR, 0)
      ).to.be.revertedWith("Pending request");
    });

    it("Should allow admin to fulfill on-ramp and credit user with ETH", async function () {
      const amountINR = ethers.parseEther("249000");
      await supplyChain.connect(farmer).requestFiatConversion(amountINR, 0); // OnRamp

      const userBalanceBefore = await ethers.provider.getBalance(farmer.address);
      
      // Admin fulfills the request and sends the required ETH
      await supplyChain.connect(admin).fulfillConversion(1, {
        value: ethers.parseEther("1.0")
      });

      const userBalanceAfter = await ethers.provider.getBalance(farmer.address);
      expect(userBalanceAfter - userBalanceBefore).to.equal(ethers.parseEther("1.0"));

      const request = await supplyChain.fiatRequests(1);
      expect(request.status).to.equal(1); // Fulfilled
      expect(await supplyChain.pendingRequestPerUser(farmer.address)).to.equal(0);
    });

    it("Should allow cancelling pending on-ramp after timeout", async function () {
      const amountINR = ethers.parseEther("249000");
      await supplyChain.connect(farmer).requestFiatConversion(amountINR, 0);

      // User tries to cancel immediately
      await expect(
        supplyChain.connect(farmer).cancelPendingConversion(1)
      ).to.be.revertedWith("Unauthorized");

      // Admin can cancel immediately
      await expect(
        supplyChain.connect(admin).cancelPendingConversion(1)
      ).to.emit(supplyChain, "FiatConversionCancelled");

      const request = await supplyChain.fiatRequests(1);
      expect(request.status).to.equal(2); // Cancelled
      expect(await supplyChain.pendingRequestPerUser(farmer.address)).to.equal(0);
    });

    it("Should lock user's ETH during off-ramp request and release to admin on fulfillment", async function () {
      const amountINR = ethers.parseEther("249000"); // 1 ETH equivalent

      const adminBalanceBefore = await ethers.provider.getBalance(admin.address);

      // Request off-ramp, sending 1 ETH value
      await supplyChain.connect(buyer).requestFiatConversion(amountINR, 1, { // 1 = OffRamp
        value: ethers.parseEther("1.0")
      });

      const request = await supplyChain.fiatRequests(1);
      expect(request.requiredEth).to.equal(ethers.parseEther("1.0"));
      expect(request.direction).to.equal(1); // OffRamp

      // Admin fulfills conversion
      const tx = await supplyChain.connect(admin).fulfillConversion(1);
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;

      const adminBalanceAfter = await ethers.provider.getBalance(admin.address);
      
      // Admin treasury received the 1 ETH locked in the contract (less gas cost)
      expect(adminBalanceAfter + gasCost - adminBalanceBefore).to.equal(ethers.parseEther("1.0"));

      const finalRequest = await supplyChain.fiatRequests(1);
      expect(finalRequest.status).to.equal(1); // Fulfilled
    });

    it("Should refund user's ETH if off-ramp is cancelled", async function () {
      const amountINR = ethers.parseEther("249000");

      await supplyChain.connect(buyer).requestFiatConversion(amountINR, 1, {
        value: ethers.parseEther("1.0")
      });

      const balanceBefore = await ethers.provider.getBalance(buyer.address);

      // Admin cancels request (representing bank payment failure)
      await supplyChain.connect(admin).cancelPendingConversion(1);

      const balanceAfter = await ethers.provider.getBalance(buyer.address);
      expect(balanceAfter - balanceBefore).to.equal(ethers.parseEther("1.0"));

      const request = await supplyChain.fiatRequests(1);
      expect(request.status).to.equal(2); // Cancelled
    });
  });
});
