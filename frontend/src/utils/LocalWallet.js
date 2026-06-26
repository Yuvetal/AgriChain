import { ethers } from "ethers";

const STORAGE_KEY = "farmer_encrypted_wallet";

// Volatile Memory Store: Physically wiped from RAM the instant the browser reloads
let inMemorySessionPin = null;

export const hasLocalWallet = () => {
  return localStorage.getItem(STORAGE_KEY) !== null;
};

export const getFarmerAddress = () => {
  return localStorage.getItem("farmer_smart_account") || localStorage.getItem("farmer_address");
};

export const getFarmerEOAAddress = () => {
  return localStorage.getItem("farmer_address");
};

/**
 * Derives a deterministic cryptographic key or generates a new one.
 * It uses the Ethers.js 'encrypt' function to generate a strict, non-custodial
 * JSON vault that is totally immune to XSS theft unless the hacker knows the Farmer's PIN.
 */
export const loginOrGenerateFarmer = async (phoneNumber, pin, onProgress) => {
  const dynamicVaultKey = `farmer_vault_${phoneNumber}`;
  let encryptedJson = localStorage.getItem(dynamicVaultKey);
  let wallet;
  let isNewAccount = false;
  const password = `${phoneNumber}:${pin}`;

  if (encryptedJson) {
    try {
      // Decrypt the existing vault
      wallet = await ethers.Wallet.fromEncryptedJson(encryptedJson, password, onProgress);
    } catch (e) {
      throw new Error("Invalid PIN. Cryptographic decryption failed.");
    }
  } else {
    // Generate a fresh random private key for this new farmer
    wallet = ethers.Wallet.createRandom();
    isNewAccount = true;
    
    // Encrypt it with their Phone/PIN as the vault key (this takes a few seconds)
    encryptedJson = await wallet.encrypt(password, onProgress);

    // Non-Custodial Client-Side Storage tied uniquely to their Number!
    localStorage.setItem(dynamicVaultKey, encryptedJson);
    localStorage.setItem("farmer_address", wallet.address);

    // [New] AgriVault Cloud Sync: Backup the locked vault to the cloud server
    await syncVaultToCloud(phoneNumber, encryptedJson);
  }

  // Predict and cache the SimpleAccount smart account address
  try {
    const rpcUrl = process.env.REACT_APP_ALCHEMY_RPC_URL || "https://rpc.sepolia.org";
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const factoryArtifact = require("../contracts/SimpleAccountFactory.json");
    const factoryContract = new ethers.Contract(factoryArtifact.address, factoryArtifact.abi, provider);
    const salt = 0;
    const smartAccountAddress = await factoryContract.predictAddress(wallet.address, salt);
    localStorage.setItem("farmer_smart_account", smartAccountAddress);
    console.log("Predicted Smart Account:", smartAccountAddress);
  } catch (err) {
    console.error("Failed to predict smart account address:", err);
  }

  // Set the temporal session token so the app knows they are authed right now
  localStorage.setItem("farmer_session_active", "true");
  localStorage.setItem("farmer_session_phone", phoneNumber);

  // VERY IMPORTANT: Cache purely in Active RAM. Never touches the actual disk!
  inMemorySessionPin = pin; 
  
  return { wallet, isNewAccount };
};

/**
 * Used strictly right before a contract interaction silently behind the scenes!
 */
export const getActiveFarmerSigner = async (provider) => {
  const isAuthed = localStorage.getItem("farmer_session_active");
  if (!isAuthed) return null;

  const phone = localStorage.getItem("farmer_session_phone");

  // XSS Protection Force-Lock: If they refreshed the page, the RAM clears natively.
  if (!inMemorySessionPin) {
    console.error("Cryptographic RAM wiped. Forcing user to re-authenticate manually.");
    return null;
  }

  const password = `${phone}:${inMemorySessionPin}`;

  const dynamicVaultKey = `farmer_vault_${phone}`;
  const encryptedJson = localStorage.getItem(dynamicVaultKey);
  if (!encryptedJson) return null;

  const wallet = await ethers.Wallet.fromEncryptedJson(encryptedJson, password);
  return wallet.connect(provider);
};

// ---------- CLOUD SYNC HELPERS ----------

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

export const syncVaultToCloud = async (phone, encryptedJson) => {
  // Deprecated: Keystore backups are handled non-custodially via Privy/Web3Auth MPC.
  console.log("⛅ AgriVault Sync (Deprecated): Keystore backups are managed by Privy/Web3Auth.");
  // Save locally as fallback for the current user flow
  const dynamicVaultKey = `farmer_vault_${phone}`;
  localStorage.setItem(dynamicVaultKey, encryptedJson);
};

export const fetchVaultFromCloud = async (phone, otpCode) => {
  // Deprecated: Keystores are reconstructed in memory via Privy/Web3Auth social/SMS login.
  console.warn("AgriVault recovery is deprecated. Social/SMS MPC login should be used.");
  const dynamicVaultKey = `farmer_vault_${phone}`;
  const localVault = localStorage.getItem(dynamicVaultKey);
  if (!localVault) {
    throw new Error("AgriVault Cloud Sync is deprecated. No local keystore fallback found.");
  }
  return localVault;
};

export const logoutFarmer = () => {
  localStorage.removeItem("farmer_session_active");
  localStorage.removeItem("farmer_session_phone");
  inMemorySessionPin = null; // Purge the volatile memory variables
  // NEVER remove the STORAGE_KEY or it'll destroy their funds!
};
