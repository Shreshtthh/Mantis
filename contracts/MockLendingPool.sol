// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MockLendingPool
 * @notice Aave V2-compatible lending pool for Mantle Sepolia demos.
 *         Tracks deposits per user but does NOT handle real token transfers.
 *         For hackathon demo use only.
 *
 *         Real mainnet deployment uses Lendle's pool at
 *         0xcFa9B6Fb9c5eE6F29A27f3A1C25BBa4EeF50AF14.
 */
contract MockLendingPool {
    /// @notice Deposited amount per (user, asset)
    mapping(address => mapping(address => uint256)) public balances;

    /// @notice Total deposited per asset
    mapping(address => uint256) public totalDeposits;

    /// @notice Simulated supply APY per asset (basis points: 620 = 6.20%)
    mapping(address => uint256) public supplyApy;

    event Deposit(
        address indexed asset,
        address indexed onBehalfOf,
        uint256 amount,
        uint16 referralCode
    );

    event Withdraw(
        address indexed asset,
        address indexed to,
        uint256 amount
    );

    constructor() {}

    /**
     * @notice Set simulated APY for an asset.
     * @param asset  Token address
     * @param apyBps APY in basis points (e.g., 620 = 6.20%)
     */
    function setSupplyApy(address asset, uint256 apyBps) external {
        supplyApy[asset] = apyBps;
    }

    /**
     * @notice Aave V2-compatible deposit.
     *         MOCK: does NOT transfer tokens. Just tracks the deposit.
     */
    function deposit(
        address asset,
        uint256 amount,
        address onBehalfOf,
        uint16 referralCode
    ) external {
        balances[onBehalfOf][asset] += amount;
        totalDeposits[asset] += amount;
        emit Deposit(asset, onBehalfOf, amount, referralCode);
    }

    /**
     * @notice Aave V2-compatible withdraw.
     *         MOCK: does NOT transfer tokens. Just decrements tracked balance.
     */
    function withdraw(
        address asset,
        uint256 amount,
        address to
    ) external returns (uint256) {
        require(balances[msg.sender][asset] >= amount, "INSUFFICIENT_BALANCE");
        balances[msg.sender][asset] -= amount;
        totalDeposits[asset] -= amount;
        emit Withdraw(asset, to, amount);
        return amount;
    }

    /**
     * @notice Aave V2-compatible getReserveData.
     *         Returns simulated reserve configuration.
     */
    function getReserveData(
        address asset
    )
        external
        view
        returns (
            uint256 configuration,
            uint128 liquidityIndex,
            uint128 variableBorrowIndex,
            uint128 currentLiquidityRate,
            uint128 currentVariableBorrowRate,
            uint128 currentStableBorrowRate,
            uint40 lastUpdateTimestamp,
            address aTokenAddress,
            address stableDebtTokenAddress,
            address variableDebtTokenAddress,
            address interestRateStrategyAddress,
            uint8 id
        )
    {
        // Convert APY (basis points) to Ray (1e27) per-second rate
        uint256 apyBps = supplyApy[asset];
        if (apyBps == 0) apyBps = 620; // default 6.20%

        uint256 RAY = 1e27;
        uint256 SECONDS_PER_YEAR = 31536000;
        // supplyRatePerSecond = (apyBps / 10000) / SECONDS_PER_YEAR in Ray
        uint256 supplyRate = (RAY * apyBps) / (10000 * SECONDS_PER_YEAR);
        // borrow rate is typically ~1.4x supply
        uint256 borrowRate = (supplyRate * 14) / 10;

        return (
            0,                          // configuration
            uint128(RAY),               // liquidityIndex
            uint128(RAY),               // variableBorrowIndex
            uint128(supplyRate),        // currentLiquidityRate
            uint128(borrowRate),        // currentVariableBorrowRate
            0,                          // currentStableBorrowRate
            uint40(block.timestamp),    // lastUpdateTimestamp
            address(0),                 // aTokenAddress
            address(0),                 // stableDebtTokenAddress
            address(0),                 // variableDebtTokenAddress
            address(0),                 // interestRateStrategyAddress
            0                           // id
        );
    }
}
