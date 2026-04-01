const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const SupplyChainV2 = await hre.ethers.getContractFactory("SupplyChainV2");
  const supplyChain = await SupplyChainV2.deploy();
  await supplyChain.waitForDeployment();

  const address = await supplyChain.getAddress();
  console.log("SupplyChainV2 deployed to:", address);

  // Read ABI from compiled artifact
  const artifactPath = path.join(
    __dirname,
    "../artifacts/contracts/SupplyChainV2.sol/SupplyChainV2.json"
  );
  const contractArtifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  const frontendContractsDir = path.join(__dirname, "../../frontend/src/contracts");
  if (!fs.existsSync(frontendContractsDir)) {
    fs.mkdirSync(frontendContractsDir, { recursive: true });
  }

  // Write address + ABI to frontend (keep filename as SupplyChain.json for import compatibility)
  const frontendOutput = {
    address: address,
    abi: contractArtifact.abi
  };

  fs.writeFileSync(
    path.join(frontendContractsDir, "SupplyChain.json"),
    JSON.stringify(frontendOutput, null, 2)
  );

  // Keep backend updated
  fs.writeFileSync(
    path.join(__dirname, "../../backend/contract_address.json"),
    JSON.stringify({ address: address }, null, 2)
  );

  console.log("SupplyChainV2 ABI and address exported to frontend/src/contracts/SupplyChain.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});