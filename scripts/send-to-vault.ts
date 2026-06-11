/**
 * Send test tokens from the deployer to the AgentVault.
 *
 * The deployer (0x92Cb…) already holds 100k USDC/USDT/WMNT and
 * 100 WETH/mETH. This script sends a portion to the vault so
 * the agent has funds to trade with.
 *
 * Usage: npx tsx scripts/send-to-vault.ts
 */

import { createPublicClient, createWalletClient, http, defineChain, parseUnits, encodeFunctionData, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

// ============================================================
// Load .env
// ============================================================

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
// Config
// ============================================================

const RPC_URL = "https://rpc.sepolia.mantle.xyz";
const CHAIN_ID = 5003;

// Deployed addresses from artifacts/deployed.json
const VAULT = "0x543Ad9C3Bc414691E07F468850e5aD45A2A9Ad6f" as `0x${string}`;
const TOKENS: Record<string, `0x${string}`> = {
  USDC: "0x5d2040b04C8fFc4079Cf79eba59A0b23a29F1997",
  USDT: "0x960D6e42b2A20cE748c09F66f17F735C55aF7Ac7",
  WETH: "0xF2Cb0cfa25653726a150A0Ea2A1d7Cde11B3fF8E",
  mETH: "0xc519dd58a8f982B115F2922D60B09EbfdFd62A89",
  WMNT: "0x132AD79122Aef72d0F82FED8666D7CDA7c9C9f54",
};

// How much to send to the vault
const SEND: Record<string, string> = {
  USDC: "5000",
  USDT: "5000",
  WETH: "5",
  mETH: "5",
  WMNT: "5000",
};

// ============================================================
// Clients
// ============================================================

let rawKey = process.env.MANTLE_PRIVATE_KEY!;
if (!rawKey) throw new Error("MANTLE_PRIVATE_KEY not set in .env");
if (!rawKey.startsWith("0x")) rawKey = "0x" + rawKey;
const account = privateKeyToAccount(rawKey as `0x${string}`);

const publicClient = createPublicClient({
  chain: defineChain({
    id: CHAIN_ID, name: "Mantle Sepolia",
    nativeCurrency: { decimals: 18, name: "MNT", symbol: "MNT" },
    rpcUrls: { default: { http: [RPC_URL] } },
    blockExplorers: { default: { name: "Explorer", url: "https://explorer.sepolia.mantle.xyz" } },
  }),
  transport: http(RPC_URL),
});

const walletClient = createWalletClient({
  account, chain: publicClient.chain as any, transport: http(RPC_URL),
});

// Minimal ERC-20 transfer ABI
const ERC20_ABI = parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]);

// ============================================================
// Main
// ============================================================

async function main() {
  console.log("=" .repeat(60));
  console.log("  💸 Send Test Tokens to AgentVault");
  console.log("=" .repeat(60));
  console.log(`  From:  ${account.address}`);
  console.log(`  To:    ${VAULT} (AgentVault)`);
  console.log();

  for (const [symbol, tokenAddr] of Object.entries(TOKENS)) {
    const amountStr = SEND[symbol];
    if (!amountStr) continue;

    const decimals = ["USDC", "USDT"].includes(symbol) ? 6 : 18;
    const amountWei = parseUnits(amountStr, decimals);

    console.log(`  Sending ${amountStr} ${symbol}...`);

    const data = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [VAULT, amountWei],
    });

    const hash = await walletClient.sendTransaction({
      to: tokenAddr,
      data,
      chain: publicClient.chain as any,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`    ✅  ${amountStr} ${symbol} sent → vault`);
    console.log(`        Tx: https://explorer.sepolia.mantle.xyz/tx/${hash}`);
  }

  // Also send some native MNT
  console.log();
  console.log("  Sending 10 MNT (native)...");
  const nativeHash = await walletClient.sendTransaction({
    to: VAULT,
    value: parseUnits("10", 18),
    chain: publicClient.chain as any,
  });
  await publicClient.waitForTransactionReceipt({ hash: nativeHash });
  console.log(`    ✅  10 MNT sent → vault`);
  console.log(`        Tx: https://explorer.sepolia.mantle.xyz/tx/${nativeHash}`);

  console.log();
  console.log("  🎉 Done. Vault funded. Visit the dashboard to verify.");
}

main().catch((err) => {
  console.error("❌ Failed:", err);
  process.exit(1);
});
