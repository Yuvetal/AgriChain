// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract MockAggregator {
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (1, 3000 * 1e8, block.timestamp, block.timestamp, 1);
    }
}
