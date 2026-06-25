const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  // 1. Deploy SupplyChainV2
  const SupplyChainV2 = await hre.ethers.getContractFactory("SupplyChainV2");
  const supplyChain = await SupplyChainV2.deploy();
  await supplyChain.waitForDeployment();
  const supplyChainAddress = await supplyChain.getAddress();
  console.log("SupplyChainV2 deployed to:", supplyChainAddress);

  // 2. Deploy EntryPoint
  const EntryPoint = await hre.ethers.getContractFactory("EntryPoint");
  const entryPoint = await EntryPoint.deploy();
  await entryPoint.waitForDeployment();
  const entryPointAddress = await entryPoint.getAddress();
  console.log("EntryPoint deployed to:", entryPointAddress);

  // 3. Deploy SimpleAccountFactory
  const SimpleAccountFactory = await hre.ethers.getContractFactory("SimpleAccountFactory");
  const factory = await SimpleAccountFactory.deploy(entryPointAddress);
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log("SimpleAccountFactory deployed to:", factoryAddress);

  // 4. Deploy AgroPaymaster
  // For local development, deployer (accounts[0]) will act as verifyingSigner
  const AgroPaymaster = await hre.ethers.getContractFactory("AgroPaymaster");
  const paymaster = await AgroPaymaster.deploy(entryPointAddress, deployer.address, deployer.address);
  await paymaster.waitForDeployment();
  const paymasterAddress = await paymaster.getAddress();
  console.log("AgroPaymaster deployed to:", paymasterAddress);

  // 5. Fund the AgroPaymaster in EntryPoint
  console.log("Depositing gas sponsoring reserves to EntryPoint...");
  const depositTx = await paymaster.deposit({ value: hre.ethers.parseEther("5.0") });
  await depositTx.wait();
  console.log("Successfully deposited 5.0 ETH gas sponsorship reserves.");

  // Helper to read and write ABI + address to frontend & backend
  const exportContract = (contractName, address, artifactName, outputName) => {
    const artifactPath = path.join(
      __dirname,
      `../artifacts/contracts/${artifactName}.sol/${contractName}.json`
    );
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    const output = {
      address: address,
      abi: artifact.abi
    };
    
    // Write to frontend
    const frontendContractsDir = path.join(__dirname, "../../frontend/src/contracts");
    if (!fs.existsSync(frontendContractsDir)) {
      fs.mkdirSync(frontendContractsDir, { recursive: true });
    }
    fs.writeFileSync(
      path.join(frontendContractsDir, `${outputName}.json`),
      JSON.stringify(output, null, 2)
    );

    // Write to backend
    const backendContractsDir = path.join(__dirname, "../../backend/contracts");
    if (!fs.existsSync(backendContractsDir)) {
      fs.mkdirSync(backendContractsDir, { recursive: true });
    }
    fs.writeFileSync(
      path.join(backendContractsDir, `${outputName}.json`),
      JSON.stringify(output, null, 2)
    );
  };

  // Export all contracts
  exportContract("SupplyChainV2", supplyChainAddress, "SupplyChainV2", "SupplyChain");
  exportContract("EntryPoint", entryPointAddress, "EntryPoint", "EntryPoint");
  exportContract("SimpleAccountFactory", factoryAddress, "SimpleAccountFactory", "SimpleAccountFactory");
  exportContract("AgroPaymaster", paymasterAddress, "AgroPaymaster", "AgroPaymaster");

  // Keep backend contract_address.json updated for backward compatibility
  fs.writeFileSync(
    path.join(__dirname, "../../backend/contract_address.json"),
    JSON.stringify({ address: supplyChainAddress }, null, 2)
  );

  console.log("EIP-4337 Deployment completed successfully. All artifacts exported.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});