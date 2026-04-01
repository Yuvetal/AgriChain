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

export const getContract = async () => {
  // 1. Web2.5 Path: Check if Farmer is logged in via native Invisible Wallet
  const isFarmer = localStorage.getItem("farmer_session_active") === "true";
  
  if (isFarmer) {
      // Create a native RPC connection directly to the blockchain
      // Bypassing generic public nodes to explicitly avoid Chrome CORS blocks
      const rpcUrl = process.env.REACT_APP_ALCHEMY_RPC_URL || "https://rpc.sepolia.org"; // Fallback to public if env is missing
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const signer = await getActiveFarmerSigner(provider);
      
      if (!signer) throw new Error("Fatal: Missing encrypted vault!");

      const contract = new ethers.Contract(
          SupplyChainArtifact.address,
          SupplyChainArtifact.abi,
          signer
      );
      
      return { contract, signer, provider };
  }

  // 2. Web3 Path: Native Institutional Connect (MetaMask)
  const provider = getWeb3Provider();
  if (!provider) throw new Error("MetaMask is required for Institutional Access.");
  
  const signer = await provider.getSigner();
  
  const contract = new ethers.Contract(
    SupplyChainArtifact.address,
    SupplyChainArtifact.abi,
    signer
  );
  
  return { contract, signer, provider };
};
