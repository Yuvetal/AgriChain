# 🌾 AgriChain — Decentralized Agricultural Marketplace

**A fractionalized B2C agricultural supply chain built on the Sepolia Ethereum Testnet.**

AgriChain is a high-trust, decentralized protocol designed to bridge the gap between rural farmers and institutional/retail buyers through a "Modern Earth" interactive marketplace. It leverages the Ethereum Ledger to ensure 100% provenance, immutability, and financial security.

---

### 🌟 Key Visionary Features

*   **🛡️ Delegated Staking:** A non-custodial sybil-defense mechanism requiring a 0.01 ETH deposit for original root harvests (fully refundable).
*   **🔗 Parent-Child Traceability:** Native on-chain linkage mapping the entire journey from Seed Harvest to processed Downstream Products.
*   **💨 Invisible Wallet Integration:** A "Web2.5" authentication gateway using browser-local, pin-protected private key backup systems to simplify blockchain interactions for non-technical users.
*   **⚖️ Fractionalized Escrow:** Buyers can purchase precise partial quantities (e.g., 20kg out of a 500kg batch) with automated price-to-wei conversion and linear financial distribution.
*   **✨ Modern Earth UI:** A high-end, glassmorphic design system using the 'Outfit' geometric font and emerald-accented slate palettes.

---

### 🛠️ Technology Stack

| Layer | Technology | Role |
| :--- | :--- | :--- |
| **Blockchain** | Solidity (0.8.28) | Core Protocol & Smart Contracts |
| **Network** | Sepolia Testnet | Decentralized Ledger |
| **Oracle** | Chainlink | Real-time ETH/USD Price Feed Verification |
| **Frontend** | React.js / Ethers.js | Interactive Dashboard & Web3 Integration |
| **Security** | OpenZeppelin | ReentrancyGuard & Math Standards |

---

### 🚀 Launch / Simulation Instructions

To simulate a full "Harvest to Sale" lifecycle:

1.  **Setup Funds:** Obtain Sepolia ETH from [Alchemy](https://sepoliafaucet.com/) or [Google Cloud](https://cloud.google.com/application/web3/faucet/ethereum/sepolia).
2.  **Farmer Onboarding:** Log in as a Farmer to create an invisible wallet. Perform a **Seed Harvest** (0.01 ETH stake required).
3.  **Marketplace View:** Observe the **Traceability Card** appearing in the live marketplace with automated INR price conversions.
4.  **The Purchase:** Use an Institutional wallet (MetaMask) to perform a **Partial Purchase**.
5.  **Chain Linkage:** Log in as the Middleman to add a **Downstream Product** (e.g., Rice Flour) using the original harvest as a blockchain-verified parent.

---

### 🛡️ Safety & Security Checkpoint

This project was built with a **Security-First** mindset:
*   [x] **Reentrancy Protection:** All withdrawals follow the Checks-Effects-Interactions pattern.
*   [x] **Anti-Spam Paymaster:** Admin-sponsored staking allows for bot-resistant farmer onboarding.
*   [x] **Human-Readable Errors:** A custom mitigation layer translates technical RPC errors into actionable user feedback.

---

> [!IMPORTANT]
> **Birthday Launch Note (01.04.2026)**
> This protocol represents my commitment to solving real-world supply chain transparency issues through decentralized state machines. Distributed under the MIT License.

Developed with 💚 for the future of Agritech.
