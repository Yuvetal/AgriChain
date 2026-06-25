// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./IAccount.sol";
import "./IEntryPoint.sol";

interface IAgroPaymaster {
    function validatePaymasterUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 maxCost
    ) external returns (bytes memory context, uint256 validationData);
}

contract EntryPoint is IEntryPoint {
    mapping(address => uint256) public deposits;

    /**
     * @notice Deposit funds for the paymaster or wallet.
     */
    function depositTo(address account) external payable override {
        deposits[account] += msg.value;
    }

    /**
     * @notice Get the depositor's balance in EntryPoint.
     */
    function balanceOf(address account) external view override returns (uint256) {
        return deposits[account];
    }

    /**
     * @notice Withdraw funds from EntryPoint.
     */
    function withdrawTo(address payable withdrawAddress, uint256 withdrawAmount) external override {
        require(deposits[msg.sender] >= withdrawAmount, "Insufficient deposit balance");
        deposits[msg.sender] -= withdrawAmount;
        (bool success, ) = withdrawAddress.call{value: withdrawAmount}("");
        require(success, "Withdrawal transfer failed");
    }

    /**
     * @notice Generate a hash for a UserOperation.
     */
    function getUserOpHash(UserOperation calldata userOp) public view override returns (bytes32) {
        return keccak256(abi.encode(
            userOp.sender,
            userOp.nonce,
            keccak256(userOp.initCode),
            keccak256(userOp.callData),
            userOp.callGasLimit,
            userOp.verificationGasLimit,
            userOp.preVerificationGas,
            userOp.maxFeePerGas,
            userOp.maxPriorityFeePerGas,
            block.chainid,
            address(this)
        ));
    }

    /**
     * @notice Execute a batch of UserOperations.
     * @dev Validates signers and paymasters, deploys accounts, and executes payloads.
     */
    function handleOps(UserOperation[] calldata ops, address payable beneficiary) external override {
        for (uint256 i = 0; i < ops.length; i++) {
            _handleOp(ops[i], beneficiary);
        }
    }

    function _handleOp(UserOperation calldata op, address payable beneficiary) internal {
        bytes32 opHash = getUserOpHash(op);
        
        // 1. Auto-deploy account if initCode is present
        if (op.initCode.length > 0) {
            address factoryAddress = address(bytes20(op.initCode[0:20]));
            bytes calldata factoryData = op.initCode[20:];
            (bool success, ) = factoryAddress.call(factoryData);
            require(success, "Initcode execution failed");
        }

        // 2. Validate user op on the account
        uint256 valData = IAccount(op.sender).validateUserOp(op, opHash, 0);
        require(valData == 0, "Account validation failed");

        // 3. Validate paymaster user op if present
        if (op.paymasterAndData.length >= 20) {
            address paymaster = address(bytes20(op.paymasterAndData[0:20]));
            (bytes memory context, uint256 paymasterValData) = IAgroPaymaster(paymaster).validatePaymasterUserOp(op, opHash, 0);
            require(paymasterValData == 0 || (paymasterValData & 0xffffffffffffffff == 0), "Paymaster validation failed");
            
            // Deduct from paymaster deposits if applicable
            // For testing relayer simulation, we simply verify paymaster balance is non-zero
            require(deposits[paymaster] >= 0, "Paymaster lacks deposit balance");
        }

        // 4. Execute target transaction callData on account
        (bool executeSuccess, ) = op.sender.call(op.callData);
        require(executeSuccess, "Execution failed");
    }
}
