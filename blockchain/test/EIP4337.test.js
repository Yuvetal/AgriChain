const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("EIP-4337 Account Abstraction Integration", function () {
  this.timeout(100000);
  let entryPoint;
  let factory;
  let paymaster;
  let supplyChain;
  let deployer;
  let verifyingSigner;
  let farmerEOA;
  let buyer;

  beforeEach(async function () {
    [deployer, verifyingSigner, buyer] = await ethers.getSigners();
    
    // Create a new random wallet for the farmer to represent a non-custodial EOA identity
    farmerEOA = ethers.Wallet.createRandom().connect(ethers.provider);

    // 1. Deploy EntryPoint
    const EntryPoint = await ethers.getContractFactory("EntryPoint");
    entryPoint = await EntryPoint.deploy();
    await entryPoint.waitForDeployment();
    const entryPointAddr = await entryPoint.getAddress();

    // 2. Deploy SimpleAccountFactory
    const SimpleAccountFactory = await ethers.getContractFactory("SimpleAccountFactory");
    factory = await SimpleAccountFactory.deploy(entryPointAddr);
    await factory.waitForDeployment();
    const factoryAddr = await factory.getAddress();

    // 3. Deploy AgroPaymaster
    const AgroPaymaster = await ethers.getContractFactory("AgroPaymaster");
    paymaster = await AgroPaymaster.deploy(entryPointAddr, deployer.address, verifyingSigner.address);
    await paymaster.waitForDeployment();
    const paymasterAddr = await paymaster.getAddress();

    // 4. Deploy SupplyChainV2
    const SupplyChainV2 = await ethers.getContractFactory("SupplyChainV2");
    supplyChain = await SupplyChainV2.deploy();
    await supplyChain.waitForDeployment();

    // 5. Fund the Paymaster in the EntryPoint
    await paymaster.deposit({ value: ethers.parseEther("10.0") });

    // 6. Give deployer enough native ether to act as relayer (mock bundler)
  });

  it("Deploys smart account on the fly, validates EOA signature, sponsors gas, and commits listing via Paymaster", async function () {
    const supplyChainAddr = await supplyChain.getAddress();
    const factoryAddr = await factory.getAddress();
    const paymasterAddr = await paymaster.getAddress();
    const chainId = (await ethers.provider.getNetwork()).chainId;

    const salt = 12345; // Simulated unique farm/device index
    
    // Predict smart account address
    const predictedAccountAddr = await factory.predictAddress(farmerEOA.address, salt);
    console.log("Predicted Smart Account Address:", predictedAccountAddr);

    // Construct the callData to list a batch: createBatch(name, quantity, pricePerKg, parentId, location, expiryTimestamp)
    const name = "Basmati Rice";
    const quantity = 100;
    const pricePerKg = ethers.parseEther("0.001"); // Price per Kg in Wei
    const parentId = 0;
    const location = "Punjab, India";
    const expiryTimestamp = Math.floor(Date.now() / 1000) + 5 * 24 * 60 * 60; // 5 days

    const supplyChainInterface = new ethers.Interface([
      "function createBatch(string name, uint256 quantity, uint256 pricePerKg, uint256 parentId, string location, uint256 expiryTimestamp) external payable"
    ]);
    const createBatchCallData = supplyChainInterface.encodeFunctionData("createBatch", [
      name,
      quantity,
      pricePerKg,
      parentId,
      location,
      expiryTimestamp
    ]);

    // SimpleAccount execute function: execute(address dest, uint256 value, bytes calldata func)
    const accountInterface = new ethers.Interface([
      "function execute(address dest, uint256 value, bytes calldata func) external"
    ]);
    const executeCallData = accountInterface.encodeFunctionData("execute", [
      supplyChainAddr,
      ethers.parseEther("0.01"), // Send the 0.01 ETH stake along with the call to createBatch
      createBatchCallData
    ]);

    // Factory initCode: deploy the account and perform execution in the same step
    const factoryInterface = new ethers.Interface([
      "function createAccount(address owner, uint256 salt) external returns (address)"
    ]);
    const createAccountCallData = factoryInterface.encodeFunctionData("createAccount", [
      farmerEOA.address,
      salt
    ]);
    const initCode = ethers.concat([factoryAddr, createAccountCallData]);

    // Construct UserOperation struct parameters
    const userOp = {
      sender: predictedAccountAddr,
      nonce: 0,
      initCode: initCode,
      callData: executeCallData,
      callGasLimit: 1000000,
      verificationGasLimit: 1000000,
      preVerificationGas: 21000,
      maxFeePerGas: ethers.parseUnits("20", "gwei"),
      maxPriorityFeePerGas: ethers.parseUnits("2", "gwei"),
      paymasterAndData: "0x",
      signature: "0x"
    };

    // Calculate paymaster verification signature
    const validUntil = Math.floor(Date.now() / 1000) + 3600; // 1 hour validity
    const validAfter = 0;

    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    const paymasterHash = ethers.keccak256(
      abiCoder.encode(
        [
          "address", "uint256", "bytes32", "bytes32",
          "uint256", "uint256", "uint256", "uint256",
          "uint256", "uint256", "address", "uint48", "uint48"
        ],
        [
          userOp.sender,
          userOp.nonce,
          ethers.keccak256(userOp.initCode),
          ethers.keccak256(userOp.callData),
          userOp.callGasLimit,
          userOp.verificationGasLimit,
          userOp.preVerificationGas,
          userOp.maxFeePerGas,
          userOp.maxPriorityFeePerGas,
          chainId,
          paymasterAddr,
          validUntil,
          validAfter
        ]
      )
    );

    // Sign using the backend verifyingSigner EOA
    const paymasterSignature = await verifyingSigner.signMessage(ethers.getBytes(paymasterHash));

    // Construct paymasterAndData: [20 bytes paymasterAddr] [6 bytes validUntil] [6 bytes validAfter] [remaining signature]
    const validUntilHex = ethers.zeroPadValue(ethers.toBeHex(validUntil), 6);
    const validAfterHex = ethers.zeroPadValue(ethers.toBeHex(validAfter), 6);
    
    userOp.paymasterAndData = ethers.concat([
      paymasterAddr,
      validUntilHex,
      validAfterHex,
      paymasterSignature
    ]);

    // Generate UserOpHash and sign it with the farmer's private key (representing device authorization)
    const userOpHash = await entryPoint.getUserOpHash(userOp);
    const farmerSignature = await farmerEOA.signMessage(ethers.getBytes(userOpHash));
    userOp.signature = farmerSignature;

    // Fund the predicted smart account directly with 0.01 ETH to cover the crop listing stake
    await deployer.sendTransaction({ to: predictedAccountAddr, value: ethers.parseEther("0.01") });

    // Verify smart wallet is NOT deployed yet
    expect(await ethers.provider.getCode(predictedAccountAddr)).to.equal("0x");

    // Execute via EntryPoint (acting as Relayer / Mock Bundler)
    // The relayer (deployer) pays the gas fee to submit the handleOps tx, but the paymaster covers the userOp costs
    const beforeBalance = await ethers.provider.getBalance(farmerEOA.address);
    
    const tx = await entryPoint.connect(deployer).handleOps([userOp], deployer.address);
    await tx.wait();

    // Verify smart wallet WAS deployed successfully
    const code = await ethers.provider.getCode(predictedAccountAddr);
    expect(code).to.not.equal("0x");

    // Verify farmer EOA balance remained exactly unchanged (fully sponsored gasless tx)
    const afterBalance = await ethers.provider.getBalance(farmerEOA.address);
    expect(afterBalance).to.equal(beforeBalance);

    // Verify SupplyChainV2 recorded the crop batch listing
    const batchCount = await supplyChain.batchCount();
    expect(batchCount).to.equal(1);

    const batch = await supplyChain.batches(1);
    expect(batch.name).to.equal(name);
    expect(batch.farmer.toLowerCase()).to.equal(predictedAccountAddr.toLowerCase());
  });
});
