import { ethers } from "ethers";
import SupplyChainArtifact from "../contracts/SupplyChain.json";
import { getActiveFarmerSigner } from "./LocalWallet";

const SEPOLIA_NETWORK_ID = "0xaa36a7"; // 11155111 in hex

export const getEthereumObject = () => window.ethereum;

export const getWeb3Provider = () => {
  const eth = getEthereumObject();
  if (!eth) return null;
  return new ethers.BrowserProvider(eth);
};

export const connectWallet = async () => {
  const eth = getEthereumObject();
  if (!eth) {
    throw new Error("MetaMask is completely missing!");
  }

  // Request account access
  const accounts = await eth.request({ method: "eth_requestAccounts" });
  const account = accounts[0];

  // Auto-switch network to Hardhat Localhost
  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SEPOLIA_NETWORK_ID }]
    });
  } catch (switchError) {
    // This error code indicates that the chain has not been added to MetaMask.
    if (switchError.code === 4902) {
      try {
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: SEPOLIA_NETWORK_ID,
              chainName: "Sepolia Testnet",
              rpcUrls: ["https://rpc.sepolia.org"],
              nativeCurrency: {
                name: "Sepolia ETH",
                symbol: "ETH",
                decimals: 18,
              },
              blockExplorerUrls: ["https://sepolia.etherscan.io"],
            },
          ],
        });
      } catch (addError) {
        throw new Error("Failed to add Sepolia network to MetaMask.");
      }
    } else {
      throw new Error("Failed to switch to the Sepolia network.");
    }
  }

  return account;
};

export const buildAndSendUserOp = async (targetContract, prop, args, signer, provider) => {
  const farmerEOA = signer.address;
  const smartAccount = localStorage.getItem("farmer_smart_account");
  if (!smartAccount) {
    throw new Error("Smart Account address not cached. Try logging in again.");
  }

  const entryPointArtifact = require("../contracts/EntryPoint.json");
  const factoryArtifact = require("../contracts/SimpleAccountFactory.json");
  const paymasterArtifact = require("../contracts/AgroPaymaster.json");

  const entryPoint = new ethers.Contract(entryPointArtifact.address, entryPointArtifact.abi, provider);

  // Check if smart account is deployed
  const code = await provider.getCode(smartAccount);
  const isDeployed = code !== "0x";

  let initCode = "0x";
  if (!isDeployed) {
    const factoryInterface = new ethers.Interface(factoryArtifact.abi);
    const salt = 0;
    const createAccountData = factoryInterface.encodeFunctionData("createAccount", [farmerEOA, salt]);
    initCode = ethers.concat([factoryArtifact.address, createAccountData]);
  }

  // Encode target write method callData
  const targetInterface = new ethers.Interface(targetContract.interface.fragments);
  
  // Extract override if passed as last arg
  let cleanArgs = [...args];
  let value = 0n;
  if (args.length > 0 && typeof args[args.length - 1] === "object") {
    const overrides = args[args.length - 1];
    if (overrides.value !== undefined) {
      value = ethers.toBigInt(overrides.value);
    }
    // Remove transaction overrides from the args list encoded for the inner contract call
    cleanArgs.pop();
  }

  const encodedTargetCall = targetInterface.encodeFunctionData(prop, cleanArgs);

  // SimpleAccount execute function: execute(address dest, uint256 value, bytes calldata func)
  const accountInterface = new ethers.Interface([
    "function execute(address dest, uint256 value, bytes calldata func) external"
  ]);
  const callData = accountInterface.encodeFunctionData("execute", [
    targetContract.target,
    value,
    encodedTargetCall
  ]);

  // Use unique sequential timestamp for local Node nonce simulation
  const nonce = Date.now();
  const chainId = (await provider.getNetwork()).chainId;

  const userOp = {
    sender: smartAccount,
    nonce: nonce,
    initCode: initCode,
    callData: callData,
    callGasLimit: 2000000,
    verificationGasLimit: 2000000,
    preVerificationGas: 21000,
    maxFeePerGas: ethers.parseUnits("20", "gwei").toString(),
    maxPriorityFeePerGas: ethers.parseUnits("2", "gwei").toString(),
    paymasterAndData: "0x",
    signature: "0x"
  };

  const serializeUserOp = (op) => {
    return {
      sender: op.sender,
      nonce: op.nonce.toString(),
      initCode: op.initCode,
      callData: op.callData,
      callGasLimit: op.callGasLimit.toString(),
      verificationGasLimit: op.verificationGasLimit.toString(),
      preVerificationGas: op.preVerificationGas.toString(),
      maxFeePerGas: op.maxFeePerGas.toString(),
      maxPriorityFeePerGas: op.maxPriorityFeePerGas.toString(),
      paymasterAndData: op.paymasterAndData,
      signature: op.signature
    };
  };

  // Fetch paymaster verifying signature from Flask Backend
  const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";
  const signRes = await fetch(`${API_URL}/api/paymaster/sign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userOp: serializeUserOp(userOp) })
  });

  const signData = await signRes.json();
  if (!signRes.ok || !signData.paymasterAndData) {
    throw new Error(signData.error || "Failed to retrieve Paymaster signature.");
  }

  userOp.paymasterAndData = signData.paymasterAndData;

  // Generate UserOpHash and sign it with farmer EOA private key
  const userOpHash = await entryPoint.getUserOpHash(userOp);
  const signature = await signer.signMessage(ethers.getBytes(userOpHash));
  userOp.signature = signature;

  // Submit UserOperation to Backend Relayer
  const submitRes = await fetch(`${API_URL}/api/userop/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userOp: serializeUserOp(userOp) })
  });

  const submitData = await submitRes.json();
  if (!submitRes.ok || !submitData.tx_hash) {
    throw new Error(submitData.error || "Failed to submit UserOperation via Relayer.");
  }

  const txHash = submitData.tx_hash;
  return {
    hash: txHash,
    wait: async () => {
      let receipt = null;
      while (!receipt) {
        try {
          receipt = await provider.getTransactionReceipt(txHash);
        } catch (e) {}
        if (!receipt) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
      return receipt;
    }
  };
};

export const buildAndSendUserOpForEth = async (to, value, signer, provider) => {
  const farmerEOA = signer.address;
  const smartAccount = localStorage.getItem("farmer_smart_account");
  if (!smartAccount) {
    throw new Error("Smart Account address not cached. Try logging in again.");
  }

  const entryPointArtifact = require("../contracts/EntryPoint.json");
  const factoryArtifact = require("../contracts/SimpleAccountFactory.json");

  const entryPoint = new ethers.Contract(entryPointArtifact.address, entryPointArtifact.abi, provider);

  // Check if smart account is deployed
  const code = await provider.getCode(smartAccount);
  const isDeployed = code !== "0x";

  let initCode = "0x";
  if (!isDeployed) {
    const factoryInterface = new ethers.Interface(factoryArtifact.abi);
    const salt = 0;
    const createAccountData = factoryInterface.encodeFunctionData("createAccount", [farmerEOA, salt]);
    initCode = ethers.concat([factoryArtifact.address, createAccountData]);
  }

  // SimpleAccount execute function: execute(address dest, uint256 value, bytes calldata func)
  const accountInterface = new ethers.Interface([
    "function execute(address dest, uint256 value, bytes calldata func) external"
  ]);
  const callData = accountInterface.encodeFunctionData("execute", [
    to,
    value,
    "0x"
  ]);

  const nonce = Date.now();

  const userOp = {
    sender: smartAccount,
    nonce: nonce,
    initCode: initCode,
    callData: callData,
    callGasLimit: 2000000,
    verificationGasLimit: 2000000,
    preVerificationGas: 21000,
    maxFeePerGas: ethers.parseUnits("20", "gwei").toString(),
    maxPriorityFeePerGas: ethers.parseUnits("2", "gwei").toString(),
    paymasterAndData: "0x",
    signature: "0x"
  };

  const serializeUserOp = (op) => {
    return {
      sender: op.sender,
      nonce: op.nonce.toString(),
      initCode: op.initCode,
      callData: op.callData,
      callGasLimit: op.callGasLimit.toString(),
      verificationGasLimit: op.verificationGasLimit.toString(),
      preVerificationGas: op.preVerificationGas.toString(),
      maxFeePerGas: op.maxFeePerGas.toString(),
      maxPriorityFeePerGas: op.maxPriorityFeePerGas.toString(),
      paymasterAndData: op.paymasterAndData,
      signature: op.signature
    };
  };

  const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";
  const signRes = await fetch(`${API_URL}/api/paymaster/sign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userOp: serializeUserOp(userOp) })
  });

  const signData = await signRes.json();
  if (!signRes.ok || !signData.paymasterAndData) {
    throw new Error(signData.error || "Failed to retrieve Paymaster signature.");
  }

  userOp.paymasterAndData = signData.paymasterAndData;

  const userOpHash = await entryPoint.getUserOpHash(userOp);
  const signature = await signer.signMessage(ethers.getBytes(userOpHash));
  userOp.signature = signature;

  const submitRes = await fetch(`${API_URL}/api/userop/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userOp: serializeUserOp(userOp) })
  });

  const submitData = await submitRes.json();
  if (!submitRes.ok || !submitData.tx_hash) {
    throw new Error(submitData.error || "Failed to submit UserOperation via Relayer.");
  }

  const txHash = submitData.tx_hash;
  return {
    hash: txHash,
    wait: async () => {
      let receipt = null;
      while (!receipt) {
        try {
          receipt = await provider.getTransactionReceipt(txHash);
        } catch (e) {}
        if (!receipt) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
      return receipt;
    }
  };
};

export const wrapContractForEIP4337 = (contract, signer, provider) => {
  return new Proxy(contract, {
    get(target, prop, receiver) {
      const origVal = target[prop];
      if (typeof origVal === "function") {
        try {
          const fragment = target.interface.getFunction(prop);
          const isWrite = fragment && !fragment.constant && 
                          fragment.stateMutability !== "view" && 
                          fragment.stateMutability !== "pure";
          
          if (isWrite) {
            return async (...args) => {
              return buildAndSendUserOp(target, prop, args, signer, provider);
            };
          }
        } catch (e) {}
      }
      return Reflect.get(target, prop, receiver);
    }
  });
};

export const getContract = async () => {
  const eth = getEthereumObject();
  let metamaskAccounts = [];
  let currentChainId = null;
  let networkMismatch = false;

  if (eth) {
    try {
      metamaskAccounts = await eth.request({ method: "eth_accounts" });
      currentChainId = await eth.request({ method: "eth_chainId" });
    } catch (e) {}
  }

  // 1. Web2.5 Path: Use Farmer session if active (Primary Priority)
  const isFarmer = localStorage.getItem("farmer_session_active") === "true";
  if (isFarmer) {
      const rpcUrl = process.env.REACT_APP_ALCHEMY_RPC_URL || "https://rpc.sepolia.org";
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const signer = await getActiveFarmerSigner(provider);
      
      if (signer) {
        const proxySigner = new Proxy(signer, {
          get(target, prop, receiver) {
            if (prop === "sendTransaction") {
              return async (txRequest) => {
                return buildAndSendUserOpForEth(txRequest.to, txRequest.value, signer, provider);
              };
            }
            return Reflect.get(target, prop, receiver);
          }
        });

        const contract = new ethers.Contract(
            SupplyChainArtifact.address,
            SupplyChainArtifact.abi,
            proxySigner
        );
        const proxyContract = wrapContractForEIP4337(contract, proxySigner, provider);
        return { contract: proxyContract, signer: proxySigner, provider, networkMismatch: false };
      }
  }

  // 2. Web3 Path: Use MetaMask if authorized AND on correct network
  if (metamaskAccounts && metamaskAccounts.length > 0) {
    if (currentChainId === SEPOLIA_NETWORK_ID) {
      const provider = new ethers.BrowserProvider(eth);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(
        SupplyChainArtifact.address,
        SupplyChainArtifact.abi,
        signer
      );
      return { contract, signer, provider, networkMismatch: false };
    } else {
      networkMismatch = true;
    }
  }

  // 3. Resilient Read-Only Mode: Fallback to Public RPC
  const rpcUrl = process.env.REACT_APP_ALCHEMY_RPC_URL || "https://rpc.sepolia.org";
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const contract = new ethers.Contract(
    SupplyChainArtifact.address,
    SupplyChainArtifact.abi,
    provider
  );
  
  return { contract, signer: null, provider, networkMismatch };
};
