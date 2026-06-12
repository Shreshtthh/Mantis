/**
 * Mantis Contract Deployment Script (standalone — no Hardhat required)
 *
 * Compiles Solidity with solc, deploys via viem.
 *
 * Usage: npx tsx scripts/deploy.ts
 */

import solc from "solc";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, join } from "path";
import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  getAddress,
  encodeAbiParameters,
  parseAbiParameters,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
// Load .env manually
function loadEnv() {
  const envPath = resolve(__dirname, "..", ".env");
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}
loadEnv();

// ============================================================
// CONFIG
// ============================================================

const RPC_URL = "https://rpc.sepolia.mantle.xyz";
const CHAIN_ID = 5003;

const mantleSepolia = defineChain({
  id: CHAIN_ID,
  name: "Mantle Sepolia",
  nativeCurrency: { decimals: 18, name: "MNT", symbol: "MNT" },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "Mantlescan", url: "https://explorer.sepolia.mantle.xyz" } },
});

let rawKey = process.env.MANTLE_PRIVATE_KEY!;
if (!rawKey) throw new Error("MANTLE_PRIVATE_KEY not set in .env");
// Ensure 0x prefix
if (!rawKey.startsWith("0x")) rawKey = "0x" + rawKey;

const account = privateKeyToAccount(rawKey as `0x${string}`);

const publicClient = createPublicClient({
  chain: mantleSepolia,
  transport: http(RPC_URL),
});

const walletClient = createWalletClient({
  account,
  chain: mantleSepolia,
  transport: http(RPC_URL),
});

// ============================================================
// COMPILE
// ============================================================

const CONTRACTS_DIR = resolve(__dirname, "..", "contracts");
const OUTPUT_DIR = resolve(__dirname, "..", "artifacts");

function compileContract(filename: string): { abi: any; bytecode: string } {
  const source = readFileSync(join(CONTRACTS_DIR, filename), "utf8");

  const input: solc.InputSchema = {
    language: "Solidity",
    sources: {
      [filename]: { content: source },
    },
    settings: {
      outputSelection: {
        "*": { "*": ["abi", "evm.bytecode.object"] },
      },
      optimizer: { enabled: true, runs: 200, details: { yul: true } },
      viaIR: true,
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));

  if (output.errors) {
    const errors = output.errors.filter((e: any) => e.severity === "error");
    if (errors.length > 0) {
      for (const e of errors) console.error("  ❌", e.formattedMessage);
      throw new Error(`Compilation failed for ${filename}`);
    }
  }

  const contractName = Object.keys(output.contracts[filename])[0];
  const contract = output.contracts[filename][contractName];

  return {
    abi: contract.abi,
    bytecode: "0x" + contract.evm.bytecode.object,
  };
}

// ============================================================
// DEPLOY
// ============================================================

// ABI encoding for constructor args
function encodeConstructorArgs(types: string, values: any[]): string {
  if (!types || values.length === 0) return "";
  // Strip 0x prefix from encoded data
  return encodeAbiParameters(parseAbiParameters(types), values).slice(2);
}

async function deployContract(
  name: string,
  filename: string,
  constructorTypes: string,
  args: any[]
): Promise<`0x${string}`> {
  console.log(`  Deploying ${name}...`);

  const { bytecode } = compileContract(filename);

  // Append encoded constructor args to bytecode
  const encodedArgs = encodeConstructorArgs(constructorTypes, args);
  const deployData = (bytecode + encodedArgs) as `0x${string}`;

  const hash = await walletClient.sendTransaction({
    data: deployData,
    chain: mantleSepolia,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const deployedAddress = receipt.contractAddress!;
  console.log(`    ✅ ${name}: ${getAddress(deployedAddress)}`);
  return getAddress(deployedAddress);
}

async function sendTx(to: `0x${string}`, data: `0x${string}`, label: string) {
  console.log(`  ${label}...`);
  const hash = await walletClient.sendTransaction({ to, data, chain: mantleSepolia });
  await publicClient.waitForTransactionReceipt({ hash });
  console.log(`    ✅ Done`);
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  // Ensure output dir
  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR);

  console.log("=".repeat(60));
  console.log("  🦂 Mantis Contract Deployment");
  console.log("=".repeat(60));
  console.log(`  Network:  Mantle Sepolia (chain ${CHAIN_ID})`);
  console.log(`  Deployer: ${account.address}`);
  console.log();

  // ---- 1. MockERC20 tokens ----
  console.log("── Deploying MockERC20 tokens ──\n");

  const TOKENS = [
    { name: "Test USDC",      symbol: "tUSDC", decimals: 6  },
    { name: "Test USDT",      symbol: "tUSDT", decimals: 6  },
    { name: "Test WETH",      symbol: "tWETH", decimals: 18 },
    { name: "Test mETH",      symbol: "tmETH", decimals: 18 },
    { name: "Test WMNT",      symbol: "tWMNT", decimals: 18 },
  ];

  const tokenAddrs: Record<string, string> = {};

  for (const t of TOKENS) {
    const addr = await deployContract(`${t.symbol} (${t.name})`, "MockERC20.sol", "string,string,uint8", [
      t.name,
      t.symbol,
      t.decimals,
    ]);
    tokenAddrs[t.symbol] = addr;
  }

  console.log();

  // ---- 2. Mint test tokens to agent ----
  console.log("── Minting test tokens ──\n");

  const MINT: Record<string, string> = {
    tUSDC: "100000", tUSDT: "100000", tWETH: "100", tmETH: "100", tWMNT: "100000",
  };

  for (const t of TOKENS) {
    const amount = MINT[t.symbol];
    const scaled = BigInt(amount) * (10n ** BigInt(t.decimals));
    const mintData = `0x40c10f19${account.address.slice(2).padStart(64, "0")}${scaled.toString(16).padStart(64, "0")}` as `0x${string}`;
    await sendTx(tokenAddrs[t.symbol] as `0x${string}`, mintData, `Mint ${amount} ${t.symbol} → ${account.address}`);
  }

  console.log();

  // ---- 3. Deploy AgentVault ----
  console.log("── Deploying AgentVault ──\n");

  const vaultAddr = await deployContract("AgentVault", "AgentVault.sol", "address,uint256,uint256,uint256", [
    account.address, // agent
    500n,            // maxSingleTradeUsd: $500
    2000n,           // maxDailySpendUsd: $2000
    3600n,           // withdrawalDelay: 1 hour
  ]);

  console.log();

  // ---- 4. Deploy MockSwapRouter ----
  console.log("── Deploying MockSwapRouter ──\n");

  const mockRouterAddr = await deployContract("MockSwapRouter", "MockSwapRouter.sol", "", []);

  // Set exchange rates for common pairs
  const RATE_1E18 = 10n ** 18n;
  const USDC = tokenAddrs["tUSDC"] as `0x${string}`;
  const USDT = tokenAddrs["tUSDT"] as `0x${string}`;
  const WETH = tokenAddrs["tWETH"] as `0x${string}`;
  const mETH = tokenAddrs["tmETH"] as `0x${string}`;
  const WMNT = tokenAddrs["tWMNT"] as `0x${string}`;

  // ---- Set token decimals for decimal-aware rate math ----
  // keccak("setTokenDecimals(address,uint8)") = 0x5cdcd8bb
  const setTokenDecimalsSelector = "0x5cdcd8bb";

  async function setDecimals(token: string, decimals: number) {
    const data = (setTokenDecimalsSelector +
      token.slice(2).padStart(64, "0") +
      decimals.toString(16).padStart(64, "0")) as `0x${string}`;
    await sendTx(mockRouterAddr, data, `Set decimals(${decimals}) for ${token.slice(0,6)}…`);
  }

  await setDecimals(USDC, 6);
  await setDecimals(USDT, 6);
  await setDecimals(WMNT, 18);
  await setDecimals(WETH, 18);
  await setDecimals(mETH, 18);

  // encode setRate: keccak("setRate(address,address,uint256)") = 0x7b7c6e1a
  const setRateSelector = "0x5911fb9a";

  async function setRate(tokenA: string, tokenB: string, rateAtoB: bigint) {
    const data = (setRateSelector +
      tokenA.slice(2).padStart(64, "0") +
      tokenB.slice(2).padStart(64, "0") +
      rateAtoB.toString(16).padStart(64, "0")) as `0x${string}`;
    await sendTx(mockRouterAddr, data, `Set rate ${tokenA.slice(0,6)}… → ${tokenB.slice(0,6)}…`);
  }

  // USDC/WMNT: 1 USDC ≈ 1.25 WMNT (at $0.80/MNT)
  await setRate(USDC, WMNT, (RATE_1E18 * 125n) / 100n);
  // USDC/WETH: 1 WETH ≈ 2500 USDC
  await setRate(WETH, USDC, RATE_1E18 * 2500n);
  // USDC/mETH: 1 mETH ≈ 2600 USDC
  await setRate(mETH, USDC, RATE_1E18 * 2600n);
  // mETH/WETH: ~1.04 (mETH slightly higher)
  await setRate(mETH, WETH, (RATE_1E18 * 104n) / 100n);

  console.log();

  // ---- 5. Deploy MockLendingPool ----
  console.log("── Deploying MockLendingPool ──\n");

  const mockLendleAddr = await deployContract("MockLendingPool", "MockLendingPool.sol", "", []);

  // Set APYs for each token
  const setSupplyApySelector = "0x97bb778a"; // keccak("setSupplyApy(address,uint256)")
  const APY_BPS: Record<string, number> = {
    [USDC]: 620, [USDT]: 580, [WETH]: 280,
    [mETH]: 310, [WMNT]: 450,
  };

  for (const [token, bps] of Object.entries(APY_BPS)) {
    const data = (setSupplyApySelector +
      token.slice(2).padStart(64, "0") +
      BigInt(bps).toString(16).padStart(64, "0")) as `0x${string}`;
    await sendTx(mockLendleAddr, data, `Set APY ${bps / 100}% for ${token.slice(0,6)}…`);
  }

  console.log();

  // ---- Summary ----
  console.log("=".repeat(60));
  console.log("  📋 DEPLOYMENT SUMMARY");
  console.log("=".repeat(60));
  console.log(`  Deployer: ${account.address}`);
  console.log();
  console.log("  Tokens:");
  for (const [sym, addr] of Object.entries(tokenAddrs)) {
    console.log(`    ${sym.padEnd(8)} ${addr}`);
  }
  console.log(`\n  AgentVault:       ${vaultAddr}`);
  console.log(`  MockSwapRouter:   ${mockRouterAddr}`);
  console.log(`  MockLendingPool:  ${mockLendleAddr}`);
  console.log();
  console.log("  ── Copy into src/agent/config.ts ──");
  console.log();
  console.log("  const TESTNET_TOKENS = {");
  console.log(`    WMNT: '${tokenAddrs["tWMNT"]}' as \`0x\${string}\`,`);
  console.log(`    USDC: '${tokenAddrs["tUSDC"]}' as \`0x\${string}\`,`);
  console.log(`    USDT: '${tokenAddrs["tUSDT"]}' as \`0x\${string}\`,`);
  console.log(`    WETH: '${tokenAddrs["tWETH"]}' as \`0x\${string}\`,`);
  console.log(`    mETH: '${tokenAddrs["tmETH"]}' as \`0x\${string}\`,`);
  console.log("  } as const;");
  console.log();
  console.log("  // In TESTNET_CONTRACTS, update:");
  console.log(`  merchantMoeRouter: '${mockRouterAddr}' as \`0x\${string}\`,`);
  console.log(`  lendlePool:        '${mockLendleAddr}' as \`0x\${string}\`,`);

  // Save to file for reference
  const summary = {
    network: "mantle-sepolia",
    chainId: CHAIN_ID,
    deployer: account.address,
    tokens: tokenAddrs,
    agentVault: vaultAddr,
    mockSwapRouter: mockRouterAddr,
    mockLendingPool: mockLendleAddr,
    deployedAt: new Date().toISOString(),
  };
  writeFileSync(join(OUTPUT_DIR, "deployed.json"), JSON.stringify(summary, null, 2));
  console.log(`\n  ✅ Saved to artifacts/deployed.json`);
}

main().catch((err) => {
  console.error("❌ Deployment failed:", err);
  process.exit(1);
});
