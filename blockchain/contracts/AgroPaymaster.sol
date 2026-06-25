// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "./IAccount.sol";
import "./IEntryPoint.sol";

contract AgroPaymaster {
    using ECDSA for bytes32;

    IEntryPoint public immutable entryPoint;
    address public admin;
    address public verifyingSigner;

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can call");
        _;
    }

    modifier onlyEntryPoint() {
        require(msg.sender == address(entryPoint), "Only EntryPoint can call");
        _;
    }

    constructor(IEntryPoint _entryPoint, address _admin, address _verifyingSigner) {
        entryPoint = _entryPoint;
        admin = _admin;
        verifyingSigner = _verifyingSigner;
    }

    receive() external payable {}

    /**
     * @notice Deposit funds into the EntryPoint to secure sponsorship balance.
     */
    function deposit() external payable {
        entryPoint.depositTo{value: msg.value}(address(this));
    }

    /**
     * @notice Withdraw funds from the EntryPoint.
     */
    function withdraw(address payable to, uint256 amount) external onlyAdmin {
        entryPoint.withdrawTo(to, amount);
    }

    /**
     * @notice Update the admin address.
     */
    function setAdmin(address _admin) external onlyAdmin {
        admin = _admin;
    }

    /**
     * @notice Update the verifying backend signer address.
     */
    function setVerifyingSigner(address _signer) external onlyAdmin {
        verifyingSigner = _signer;
    }

    /**
     * @notice Validates that the UserOperation is sponsored by the backend.
     * @dev Parses paymasterAndData to retrieve validity windows and signature.
     */
    function validatePaymasterUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 maxCost
    ) external onlyEntryPoint returns (bytes memory context, uint256 validationData) {
        // Slicing: paymasterAndData contains: [20 bytes paymasterAddr] [6 bytes validUntil] [6 bytes validAfter] [remaining signature]
        bytes calldata data = userOp.paymasterAndData[20:];
        require(data.length >= 12, "Paymaster: invalid paymasterAndData length");
        
        uint48 validUntil = uint48(bytes6(data[0:6]));
        uint48 validAfter = uint48(bytes6(data[6:12]));
        bytes calldata signature = data[12:];

        bytes32 hash = keccak256(abi.encode(
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
            address(this),
            validUntil,
            validAfter
        ));

        bytes32 messageHash = MessageHashUtils.toEthSignedMessageHash(hash);
        if (verifyingSigner != messageHash.recover(signature)) {
            return (new bytes(0), 1); // Signature mismatch / invalid
        }

        // Return timestamps in validationData
        validationData = (uint256(validUntil) << 160) | (uint256(validAfter) << 80);
        return (new bytes(0), validationData);
    }
}
