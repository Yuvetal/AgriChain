# 📐 Protocol Design Choices & Architectural Rationale

This document outlines the core technical and economic design choices implemented in the AgroChainMart protocol, detailing the underlying engineering mindset and security philosophy.

---

## ⚖️ 1. Trustless Trustee Address Delegation
* **Choice**: Nominating the trustee's **Ethereum address** (`trusteeAddress`) on-chain rather than just a Web2 identifier (like a phone number).
* **Rationale**: 
  Using a phone number for the trustee would require the off-chain backend to verify the trustee's identity via SMS OTP, sign a payload with the admin private key, and relay the transaction. This introduces Web2 centralization, single point of failure (SPOF), and trust in the backend server.
  By registering the trustee's Ethereum address on-chain:
  1. The smart account or EOA of the trustee can directly invoke `confirmDelivery` or `partialConfirm` on-chain.
  2. The smart contract natively checks `msg.sender == batch.trusteeAddress` or `msg.sender == batch.buyer` with zero off-chain dependencies.
  3. Trust remains fully decentralized.

---

## 🏛️ 2. First-to-Commit Commit-Reveal Disputes
* **Choice**: Selecting the first 5 active arbitrators to submit a cryptographic commit (`keccak256(abi.encodePacked(vote, salt))`) to lock in the jury pool, with auto-finalization as soon as one side reaches 3 votes.
* **Rationale**:
  * **Rollback Prevention**: Synchronous random arbitrator selection (e.g., using `block.prevrandao`) is vulnerable to miner or contract-based simulation rollback. A buyer could call `reportSpoilt` via a contract and revert the transaction if their own Sybil accounts were not chosen. The "first-to-commit" approach relies on active participation, removing deterministic transaction-level random manipulation.
  * **Anti-Herding (Commit-Reveal)**: Plain text votes in the mempool invite "herding." Arbitrators are penalized for voting in the minority, meaning subsequent voters would copy whichever side was winning to secure rewards and protect their ratings. Hashing votes with a salt ensures that no arbitrator can see others' votes before the commit phase ends.
  * **Liveness Protection**: Resolving immediately when a side reaches 3 revealed votes prevents disputes from hanging indefinitely if 1 or 2 arbitrators go offline or fail to reveal their salt during the reveal window.

---

## 💰 3. Linear Arbitrator Bond Slashing
* **Choice**: Enforcing a `1 ETH` bond to register, pool capacity cap of `10`, and scaling the refund linearly: `refund = (Rating - 300) * 1 ETH / 200` upon willing withdrawal.
* **Rationale**:
  * **Anti-Sybil**: A low or nonexistent bond makes registering multiple arbitrator accounts cheap. An attacker could register 5 accounts, wait to get selected on a high-value batch, vote in their own favor, and steal the escrow funds. A substantial 1 ETH bond makes Sybil attack setup financially prohibitive.
  * **Dynamic Penalty**: If an arbitrator consistently votes against the consensus, their rating drops. If they decide to withdraw willingly before dropping below 3.0 (and getting kicked/100% slashed), they are still penalized proportionally to the damage they caused to consensus. This aligns arbitrator self-interest with honest and timely voting.

---

## 📹 4. Pre-Dispatch Packing Video Constraint
* **Choice**: Restricting the farmer from calling `confirmDispatch` unless they have already uploaded the crop-packing video (`video1Hash`).
* **Rationale**:
  In the legacy system, a buyer could immediately call `reportSpoilt` to trigger a dispute auto-resolution in the buyer's favor if the farmer had not uploaded a packing video yet. This created a race condition where buyers could front-run the farmer's upload transaction. Forcing the video upload at dispatch guarantees the crop's baseline state is established on-chain before the package enters transit.

---

## 📅 5. Dispatch-Relative Cooldown for Abandonment Claims
* **Choice**: Basing the `claimAbandoned` cooldown check on `batch.dispatchTimestamp` rather than the crop's quality expiry date.
* **Rationale**:
  If a crop has a 30-day quality expiry and is shipped on day 1, a buyer could lock up the farmer's funds for up to 37 days (expiry + grace) simply by remaining silent and not confirming receipt. Basing the countdown post-dispatch provides a consistent, logistically fair 7-day window for transit and buyer inspection, preventing buyers from griefing farmers' working capital.

---

## 🔑 6. Keystore Vault Deprecation
* **Choice**: Deprecating the backend endpoints `/api/wallet/save` and `/api/wallet/recover` in favor of standard client-side non-custodial MPC recovery (e.g., Privy/Web3Auth).
* **Rationale**:
  Storing encrypted private keys in a centralized backend database creates a high-value target. Since browser wallet passwords (phone number + 4-digit PIN) have low entropy (10,000 combinations), an attacker gaining access to the database could brute-force every user's wallet offline in seconds. By using professional non-custodial social login SDKs, key fragments are reconstructed dynamically in memory without storing raw encrypted keystores on our servers, mitigating XSS localStorage leaks and database compromise.

---

## 🛡️ 7. Off-Chain API Guardrails
* **Choice**: Web3 on-chain checks in the `/api/bank/withdraw` off-ramp route and a `20MB` limit on the IPFS upload route.
* **Rationale**:
  * **Off-ramp Integrity**: A user could call the API with dummy hashes or negative amounts to drain balances. Verifying the receipt on-chain ensures that off-chain fiat conversions only occur after real, successful ETH events.
  * **DoS Defense**: The backend must handle file streams defensively to prevent attackers from uploading multi-gigabyte files to overflow server disks or exhaust Pinata API storage quotas.
