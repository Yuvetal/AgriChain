// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./SimpleAccount.sol";
import "./IEntryPoint.sol";

contract SimpleAccountFactory {
    IEntryPoint public immutable entryPoint;

    constructor(IEntryPoint _entryPoint) {
        entryPoint = _entryPoint;
    }

    /**
     * @notice Deploys a SimpleAccount deterministically using CREATE2.
     * @dev If the account is already deployed, it simply returns the address.
     */
    function createAccount(address owner, uint256 salt) external returns (SimpleAccount ret) {
        address addr = predictAddress(owner, salt);
        uint256 codeSize = addr.code.length;
        if (codeSize > 0) {
            return SimpleAccount(payable(addr));
        }
        ret = new SimpleAccount{salt: bytes32(salt)}(owner, entryPoint);
    }

    /**
     * @notice Predicts the address of a SimpleAccount before deployment.
     */
    function predictAddress(address owner, uint256 salt) public view returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xff),
            address(this),
            salt,
            keccak256(abi.encodePacked(
                type(SimpleAccount).creationCode,
                abi.encode(owner, entryPoint)
            ))
        )))));
    }
}
