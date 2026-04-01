/**
 * Human-Readable Error Mitigation Utility
 * Converts cryptic Ethereum JSON RPC errors into actionable user guidance.
 */
export const parseWeb3Error = (err) => {
    // 1. Manually check for Action Rejected (User clicked "Cancel" in MetaMask)
    if (err.code === "ACTION_REJECTED" || err.message?.includes("user rejected")) {
        return "⚠️ Action Cancelled. You rejected the request in MetaMask. Please try again if you intended to proceed.";
    }

    // 2. Insufficient Funds (The User's MetaMask wallet is broke)
    if (err.code === "INSUFFICIENT_FUNDS" || err.message?.includes("insufficient funds")) {
        return "❌ Insufficient Funds! Your MetaMask wallet doesn't have enough Sepolia ETH to pay for the gas or stake. Please top up!";
    }

    // 3. Network Unmatched (User is on Mainnet/Polygon instead of Sepolia)
    if (err.message?.includes("network") || err.code === "NETWORK_ERROR") {
        return "⚠️ Wrong Network! Please ensure your MetaMask is connected to the 'Sepolia Testnet'.";
    }

    // 4. Contract Logic Revert (提取 Smart Contract `require` assertions)
    // Often follows "execution reverted: [YOUR MESSAGE]"
    if (err.reason) return `❌ Protocol Error: ${err.reason}`;
    
    // Fallback for technical data
    const revertMatch = err.message?.match(/execution reverted: (.*?)"/);
    if (revertMatch && revertMatch[1]) {
        return `❌ Protocol Error: ${revertMatch[1]}`;
    }

    // 5. Application / LocalWallet Errors (Encryption/PIN)
    if (err.message?.toLowerCase().includes("pin") || err.message?.toLowerCase().includes("decrypt")) {
        return "❌ Decryption Failed: Incorrect PIN. Please try again with your 4-digit security code.";
    }

    if (err.message?.toLowerCase().includes("quota") || err.message?.toLowerCase().includes("storage")) {
        return "⚠️ Storage Full: Your browser's local storage is full. Please clear some data to allow wallet generation.";
    }

    // 6. Default Fallback
    console.error("Unhandleable Error Detail:", err);
    return `❌ Error: ${err.message || "An unexpected error occurred. Please refresh and try again."}`;
};
