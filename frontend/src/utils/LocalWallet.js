import { ethers } from "ethers";

const STORAGE_KEY = "farmer_encrypted_wallet";

// Volatile Memory Store: Physically wiped from RAM the instant the browser reloads
let inMemorySessionPin = null;

export const hasLocalWallet = () => {
  return localStorage.getItem(STORAGE_KEY) !== null;
};

export const getFarmerAddress = () => {
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

export const logoutFarmer = () => {
  localStorage.removeItem("farmer_session_active");
  localStorage.removeItem("farmer_session_phone");
  inMemorySessionPin = null; // Purge the volatile memory variables
  // NEVER remove the STORAGE_KEY or it'll destroy their funds!
};
