const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SupplyChain Gas Estimator", function () {
  let supplyChain;
  let owner, farmer, buyer;

  beforeEach(async function () {
    [owner, farmer, buyer] = await ethers.getSigners();
    const SupplyChain = await ethers.getContractFactory("SupplyChain");
    supplyChain = await SupplyChain.deploy();
    await supplyChain.waitForDeployment();
  });

  it("Estimates gas for batch creation", async function () {
    const tx = await supplyChain.connect(farmer).createBatch("Apples", 100, ethers.parseEther("1"), 0, "Punjab, India", {
      value: ethers.parseEther("0.01")
    });
    const receipt = await tx.wait();
    console.log("Gas used for createBatch:", receipt.gasUsed.toString());
  });

  it("Estimates gas for purchase", async function () {
    await supplyChain.connect(farmer).createBatch("Apples", 100, ethers.parseEther("1"), 0, "Punjab, India", {
      value: ethers.parseEther("0.01")
    });
    const tx = await supplyChain.connect(buyer).purchaseBatch(1, { value: ethers.parseEther("1") });
    const receipt = await tx.wait();
    console.log("Gas used for purchaseBatch:", receipt.gasUsed.toString());
  });

  it("Estimates gas for delivery confirmation", async function () {
    await supplyChain.connect(farmer).createBatch("Apples", 100, ethers.parseEther("1"), 0, "Punjab, India", {
      value: ethers.parseEther("0.01")
    });
    await supplyChain.connect(buyer).purchaseBatch(1, { value: ethers.parseEther("1") });
    const tx = await supplyChain.connect(buyer).confirmDelivery(1);
    const receipt = await tx.wait();
    console.log("Gas used for confirmDelivery:", receipt.gasUsed.toString());
  });
});
