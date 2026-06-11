// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MockSwapRouter
 * @notice Uniswap V2-compatible router for Mantle Sepolia demos.
 *         Does NOT handle real token transfers — just emits Swap events
 *         and returns mock amounts. For hackathon demo use only.
 *
 *         Real mainnet deployment uses Merchant Moe's router at
 *         0xeaEE7EE68874218c3558b40063c42B82D3E7232a.
 */
contract MockSwapRouter {
    /// @notice Mock exchange rates — human-scaled: rate = price of tokenB per 1 tokenA * 1e18
    ///         e.g., if 1 WETH = 2500 USDC, rate[WETH][USDC] = 2500 * 1e18
    mapping(address => mapping(address => uint256)) public rates;

    /// @notice Token decimals for decimal-aware amount normalization
    mapping(address => uint8) public tokenDecimals;

    event Swap(
        address indexed sender,
        uint256 amountIn,
        uint256 amountOut,
        address indexed tokenIn,
        address indexed tokenOut,
        address to
    );

    constructor() {
        // Rates set after deployment via setRate()
    }

    /**
     * @notice Set mock exchange rate between two tokens.
     * @param tokenA  First token
     * @param tokenB  Second token
     * @param rate    How many tokenB per 1 tokenA (scaled by 1e18)
     */
    function setRate(address tokenA, address tokenB, uint256 rate) external {
        rates[tokenA][tokenB] = rate;
        rates[tokenB][tokenA] = (1e36) / rate; // inverse
    }

    /// @notice Let the deployer set per-token decimals for decimal-aware rate math
    function setTokenDecimals(address token, uint8 decimals) external {
        tokenDecimals[token] = decimals;
    }

    /**
     * @notice Uniswap V2-compatible getAmountsOut.
     *         Returns array: [amountIn, amountOut]
     */
    function getAmountsOut(
        uint256 amountIn,
        address[] calldata path
    ) public view returns (uint256[] memory amounts) {
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        for (uint256 i = 0; i < path.length - 1; i++) {
            uint256 rate = rates[path[i]][path[i + 1]];
            if (rate == 0) rate = 1e18;

            // Decimal-aware normalization:
            // 1. Convert amount from token's decimals → 18-dec base
            // 2. Apply rate (human-scaled, 1e18 precision)
            // 3. Convert back from 18-dec base → output token's decimals
            uint8 decIn = tokenDecimals[path[i]];
            if (decIn == 0) decIn = 18;
            uint8 decOut = tokenDecimals[path[i + 1]];
            if (decOut == 0) decOut = 18;

            uint256 amountIn18 = amounts[i] * (10 ** (18 - decIn));
            uint256 amountOut18 = (amountIn18 * rate) / 1e18;
            amounts[i + 1] = amountOut18 / (10 ** (18 - decOut));
        }
    }

    /**
     * @notice Uniswap V2-compatible swapExactTokensForTokens.
     *         MOCK: does NOT transfer tokens. Just emits event + returns amounts.
     */
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 /* deadline */
    ) external returns (uint256[] memory amounts) {
        amounts = getAmountsOut(amountIn, path);
        require(amounts[amounts.length - 1] >= amountOutMin, "INSUFFICIENT_OUTPUT_AMOUNT");

        emit Swap(
            msg.sender,
            amountIn,
            amounts[amounts.length - 1],
            path[0],
            path[path.length - 1],
            to
        );

        return amounts;
    }
}
