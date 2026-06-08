// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AgentVault
 * @notice On-chain programmable wallet for autonomous AI agents.
 *         The agent executes trades through this vault. Every action is
 *         recorded as an event. The owner can always recover funds via
 *         time-locked emergency withdrawal.
 *
 *         Designed for Mantis — deployed on Mantle Network.
 *
 *         Tracks: Agentic Wallets & Economy (Turing Test Hackathon 2026)
 */
contract AgentVault {
    // ============================================================
    // STATE
    // ============================================================

    /// @notice The agent that controls day-to-day operations
    address public agent;

    /// @notice The human owner who can recover funds
    address public immutable owner;

    /// @notice Max value the agent can spend in a single transaction (USD-denominated)
    uint256 public maxSingleTradeUsd;

    /// @notice Max value the agent can spend in a rolling 24h window (USD-denominated)
    uint256 public maxDailySpendUsd;

    /// @notice How long the owner must wait before withdrawing (seconds)
    uint256 public immutable withdrawalDelay;

    /// @notice Whether the vault is paused (kill switch)
    bool public paused;

    /// @notice Rolling 24h spend tracking
    uint256 public dailySpentUsd;
    uint256 public dailyWindowStart;

    /// @notice Pending owner withdrawal (timelock)
    struct PendingWithdrawal {
        uint256 amount;
        address token;
        uint256 unlockAt;
    }
    PendingWithdrawal public pendingWithdrawal;

    // ============================================================
    // EVENTS — permanent on-chain audit trail
    // ============================================================

    event AgentExecuted(
        address indexed protocol,
        bytes4 indexed action,
        uint256 valueUsd,
        string rationaleCid   // IPFS CID of the agent's rationale (ERC-8004 audit)
    );

    event AgentUpdated(address indexed previousAgent, address indexed newAgent);

    event GuardrailUpdated(
        uint256 maxSingleTradeUsd,
        uint256 maxDailySpendUsd
    );

    event WithdrawalRequested(
        address indexed token,
        uint256 amount,
        uint256 unlockAt
    );

    event WithdrawalExecuted(
        address indexed token,
        uint256 amount
    );

    event WithdrawalCancelled();

    event Paused();
    event Unpaused();

    // ============================================================
    // ERRORS
    // ============================================================

    error NotAgent();
    error NotOwner();
    error VaultPaused();
    error ExceedsSingleTradeLimit(uint256 requested, uint256 max);
    error ExceedsDailySpendLimit(uint256 requested, uint256 remaining);
    error WithdrawalTimelocked(uint256 unlockAt);
    error NoPendingWithdrawal();
    error TransferFailed();

    // ============================================================
    // MODIFIERS
    // ============================================================

    modifier onlyAgent() {
        if (msg.sender != agent) revert NotAgent();
        _;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert VaultPaused();
        _;
    }

    // ============================================================
    // CONSTRUCTOR
    // ============================================================

    constructor(
        address _agent,
        uint256 _maxSingleTradeUsd,
        uint256 _maxDailySpendUsd,
        uint256 _withdrawalDelay
    ) {
        require(_agent != address(0), "Agent cannot be zero address");
        require(_withdrawalDelay >= 1 hours, "Withdrawal delay too short");
        require(_withdrawalDelay <= 7 days, "Withdrawal delay too long");

        agent = _agent;
        owner = msg.sender;
        maxSingleTradeUsd = _maxSingleTradeUsd;
        maxDailySpendUsd = _maxDailySpendUsd;
        withdrawalDelay = _withdrawalDelay;
    }

    // ============================================================
    // AGENT EXECUTION — the agent calls this for every trade
    // ============================================================

    /**
     * @notice Execute a trade through the vault.
     * @param target   The protocol contract to call
     * @param value    Native token value to send (0 for ERC-20 approvals/swaps)
     * @param data     Encoded function call
     * @param valueUsd Estimated USD value of the trade
     * @param rationaleCid IPFS CID of the agent's audit rationale
     */
    function execute(
        address target,
        uint256 value,
        bytes calldata data,
        uint256 valueUsd,
        string calldata rationaleCid
    )
        external
        onlyAgent
        whenNotPaused
        returns (bool success, bytes memory returnData)
    {
        // === Hard guardrails ===
        if (valueUsd > maxSingleTradeUsd) {
            revert ExceedsSingleTradeLimit(valueUsd, maxSingleTradeUsd);
        }

        // Daily spend check (rolling 24h window)
        if (block.timestamp > dailyWindowStart + 24 hours) {
            dailySpentUsd = 0;
            dailyWindowStart = block.timestamp;
        }
        uint256 remaining = maxDailySpendUsd > dailySpentUsd
            ? maxDailySpendUsd - dailySpentUsd
            : 0;
        if (valueUsd > remaining) {
            revert ExceedsDailySpendLimit(valueUsd, remaining);
        }

        dailySpentUsd += valueUsd;

        // === Execute ===
        (success, returnData) = target.call{value: value}(data);
        if (!success) revert TransferFailed();

        // === Audit event ===
        bytes4 action = bytes4(data[:4]);
        emit AgentExecuted(target, action, valueUsd, rationaleCid);
    }

    // ============================================================
    // OWNER EMERGENCY WITHDRAWAL (time-locked)
    // ============================================================

    /**
     * @notice Request withdrawal of all funds. Starts the timelock.
     *         Agent can still operate until the timelock expires.
     */
    function requestWithdrawal(address token)
        external
        onlyOwner
    {
        uint256 balance;
        if (token == address(0)) {
            balance = address(this).balance;
        } else {
            balance = IERC20(token).balanceOf(address(this));
        }
        require(balance > 0, "No balance to withdraw");

        // Cancel any existing pending withdrawal
        if (pendingWithdrawal.unlockAt > 0) {
            emit WithdrawalCancelled();
        }

        pendingWithdrawal = PendingWithdrawal({
            amount: balance,
            token: token,
            unlockAt: block.timestamp + withdrawalDelay
        });

        emit WithdrawalRequested(token, balance, pendingWithdrawal.unlockAt);
    }

    /**
     * @notice Execute the withdrawal after the timelock expires.
     */
    function executeWithdrawal() external onlyOwner {
        PendingWithdrawal memory pw = pendingWithdrawal;
        if (pw.unlockAt == 0) revert NoPendingWithdrawal();
        if (block.timestamp < pw.unlockAt) revert WithdrawalTimelocked(pw.unlockAt);

        delete pendingWithdrawal;

        if (pw.token == address(0)) {
            (bool ok, ) = owner.call{value: pw.amount}("");
            if (!ok) revert TransferFailed();
        } else {
            bool ok = IERC20(pw.token).transfer(owner, pw.amount);
            if (!ok) revert TransferFailed();
        }

        emit WithdrawalExecuted(pw.token, pw.amount);
    }

    /**
     * @notice Cancel a pending withdrawal request.
     */
    function cancelWithdrawal() external onlyOwner {
        if (pendingWithdrawal.unlockAt == 0) revert NoPendingWithdrawal();
        delete pendingWithdrawal;
        emit WithdrawalCancelled();
    }

    // ============================================================
    // GUARDRAIL MANAGEMENT (owner only)
    // ============================================================

    /**
     * @notice Update the agent address (e.g., for upgrades).
     */
    function setAgent(address _newAgent) external onlyOwner {
        require(_newAgent != address(0), "Agent cannot be zero address");
        emit AgentUpdated(agent, _newAgent);
        agent = _newAgent;
    }

    /**
     * @notice Update guardrail parameters. Can only tighten, not loosen.
     */
    function setGuardrails(
        uint256 _maxSingleTradeUsd,
        uint256 _maxDailySpendUsd
    ) external onlyOwner {
        require(_maxSingleTradeUsd <= maxSingleTradeUsd, "Can only tighten");
        require(_maxDailySpendUsd <= maxDailySpendUsd, "Can only tighten");
        maxSingleTradeUsd = _maxSingleTradeUsd;
        maxDailySpendUsd = _maxDailySpendUsd;
        emit GuardrailUpdated(_maxSingleTradeUsd, _maxDailySpendUsd);
    }

    /**
     * @notice Emergency pause — stops all agent execution.
     */
    function pause() external onlyOwner {
        paused = true;
        emit Paused();
    }

    /**
     * @notice Unpause — resume agent operations.
     */
    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused();
    }

    // ============================================================
    // RECEIVE
    // ============================================================

    receive() external payable {
        // Accept native token deposits
    }
}

// ============================================================
// INTERFACES
// ============================================================

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}
