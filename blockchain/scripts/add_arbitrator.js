const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const arbitratorAddress = "0x42d68CC937BBD88989885c6f5075Ab131d352a99";

  // Get the most recently deployed contract address from the frontend config
  const artifactPath = path.join(__dirname, "../../frontend/src/contracts/SupplyChain.json");
  const contractData = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  
  const SupplyChainV2 = await hre.ethers.getContractFactory("SupplyChainV2");
  const contract = SupplyChainV2.attach(contractData.address);

  console.log(`Connecting to SupplyChainV2 at: ${contractData.address}`);
  console.log(`Bypassing applicant vote. Promoting ${arbitratorAddress} to Active Arbitrator...`);
  
  // Call the Admin-only Backdoor
  const tx = await contract.addArbitrator(arbitratorAddress);
  await tx.wait();
  
  console.log("✅ Success! The wallet is now authorized as an active Arbitrator node.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
