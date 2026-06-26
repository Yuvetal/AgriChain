// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "./IAccount.sol";
import "./IEntryPoint.sol";

contract SimpleAccount is IAccount {
    using ECDSA for bytes32;

    address public immutable owner;
    IEntryPoint public immutable entryPoint;

    modifier onlyEntryPoint() {
        require(msg.sender == address(entryPoint), "Only EntryPoint can call");
        _;
    }

    constructor(address _owner, IEntryPoint _entryPoint) {
        owner = _owner;
        entryPoint = _entryPoint;
    }

    /**
     * @notice Fallback function to receive native ETH.
     */
    receive() external payable {}

    /**
     * @notice Executes a transaction (call) to a destination address.
     * @dev Can be called by the owner directly or by the EntryPoint contract.
     */
    function execute(address dest, uint256 value, bytes calldata func) external {
        require(
            msg.sender == address(entryPoint) || msg.sender == owner,
            "Only owner or EntryPoint can execute"
        );
        (bool success, bytes memory result) = dest.call{value: value}(func);
        if (!success) {
            assembly {
                revert(add(result, 32), mload(result))
            }
        }
    }

    /**
     * @notice Validates the UserOperation signature and sends any missing funds required.
     */
    function validateUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external override onlyEntryPoint returns (uint256 validationData) {
        bytes32 messageHash = MessageHashUtils.toEthSignedMessageHash(userOpHash);
        if (owner != messageHash.recover(userOp.signature)) {
            return 1; // SIG_VALIDATION_FAILED (1)
        }

        if (missingAccountFunds > 0) {
            (bool success, ) = payable(msg.sender).call{value: missingAccountFunds}("");
            require(success, "Failed to send missing funds");
        }

        return 0; // Success
    }

    /**
     * @notice Helper view function to query the account's current nonce.
     */
    function getNonce() external view returns (uint256) {
        return entryPoint.getNonce(address(this), 0);
    }
}
