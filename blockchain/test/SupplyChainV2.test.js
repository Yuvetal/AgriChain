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
    arbitrators = signers.slice(4, 15); // 11 addresses for arbitrators

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
      ).to.be.revertedWith("Must deposit arbitrator bond");

      await expect(
        supplyChain.connect(arbitrators[0]).applyAsArbitrator("Arb1", "APMC001", "1234567890", {
          value: ethers.parseEther("1.0")
        })
      ).to.not.be.reverted;
    });
    it("Should enforce MAX_POOL_SIZE = 10 for arbitrator pool", async function () {
      // Admin adds 10 arbitrators to fill the pool
      for (let i = 0; i < 10; i++) {
        await supplyChain.connect(admin).addArbitrator(arbitrators[i].address, {
          value: ethers.parseEther("1.0")
        });
      }

      expect(await supplyChain.getArbitratorPoolSize()).to.equal(10);

      // 11th applicant should fail application
      const signers = await ethers.getSigners();
      const extraArb = signers[15];
      await expect(
        supplyChain.connect(extraArb).applyAsArbitrator("Arb11", "APMC011", "1234567890", {
          value: ethers.parseEther("1.0")
        })
      ).to.be.revertedWith("Arbitrator pool full");
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
      ).to.be.revertedWith("Only buyer can nominate a trustee");

      await expect(
        supplyChain.connect(buyer).nominateTrustee(batchId, trustee.address, ethers.encodeBytes32String("videoHash"))
      ).to.not.be.reverted;
    });

    it("Should reject confirmDispatch if packing video has not been uploaded", async function () {
      await expect(
        supplyChain.connect(farmer).confirmDispatch(batchId, "TRACK123")
      ).to.be.revertedWith("Must upload packing video before dispatch");

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
      ).to.be.revertedWith("Only buyer or trustee can confirm delivery");

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
      // Fill the arbitrator pool with 5 active arbitrators
      for (let i = 0; i < 5; i++) {
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

    it("Should allow the first 5 arbitrators to commit and resolve immediately once a side reaches 3 votes", async function () {
      // 1. Commit phase
      const salt = 12345;
      const votes = [true, true, true, false, false]; // 3 for farmer, 2 for buyer
      const commits = [];

      for (let i = 0; i < 5; i++) {
        const commitHash = ethers.solidityPackedKeccak256(
          ["bool", "uint256"],
          [votes[i], salt]
        );
        commits.push(commitHash);
        await supplyChain.connect(arbitrators[i]).commitArbitratorVote(disputeId, commitHash);
      }

      // 6th arbitrator should not be able to commit (jury limit is 5)
      const commit6 = ethers.solidityPackedKeccak256(["bool", "uint256"], [true, salt]);
      const signers = await ethers.getSigners();
      const arb6 = signers[9]; // arbitrators pool is signers[4..14]. arbitrators[5] = signers[9]
      
      // Approve arb6 as active arbitrator first
      await supplyChain.connect(admin).addArbitrator(arb6.address, {
        value: ethers.parseEther("1.0")
      });
      await expect(
        supplyChain.connect(arb6).commitArbitratorVote(disputeId, commit6)
      ).to.be.revertedWith("Jury pool of 5 already filled");

      // 2. Reveal phase
      // Reveal 1 (farmer)
      await supplyChain.connect(arbitrators[0]).revealArbitratorVote(disputeId, votes[0], salt);
      // Reveal 2 (farmer)
      await supplyChain.connect(arbitrators[1]).revealArbitratorVote(disputeId, votes[1], salt);
      
      // Farmer does not win yet (only 2 votes)
      let dispute = await supplyChain.disputes(disputeId);
      expect(dispute.resolved).to.be.false;

      // Reveal 3 (farmer) - reaching 3 votes for farmer
      await expect(
        supplyChain.connect(arbitrators[2]).revealArbitratorVote(disputeId, votes[2], salt)
      ).to.emit(supplyChain, "DisputeResolved");

      dispute = await supplyChain.disputes(disputeId);
      expect(dispute.resolved).to.be.true;
    });
  });
});
