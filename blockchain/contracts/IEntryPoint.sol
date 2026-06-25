// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./IAccount.sol";

interface IEntryPoint {
    /**
     * @notice Deposit funds for the paymaster or wallet.
     */
    function depositTo(address account) external payable;

    /**
     * @notice Get the depositor's balance in EntryPoint.
     */
    function balanceOf(address account) external view returns (uint256);

    /**
     * @notice Withdraw funds from EntryPoint.
     */
    function withdrawTo(address payable withdrawAddress, uint256 withdrawAmount) external;

    /**
     * @notice Generate a hash for a UserOperation.
     */
    function getUserOpHash(UserOperation calldata userOp) external view returns (bytes32);

    /**
     * @notice Execute a batch of UserOperations.
     */
    function handleOps(UserOperation[] calldata ops, address payable beneficiary) external;
}
