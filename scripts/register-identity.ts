/**
 * Register Mantis on ERC-8004 Identity Registry (Mantle Mainnet)
 *
 * Usage: npx tsx scripts/register-identity.ts
 *
 * Prerequisites:
 * - MNT on Mantle mainnet in the agent wallet (0x92CB...) for gas (~$0.02)
 * - MANTLE_PRIVATE_KEY in .env
 * - PINATA_JWT in .env (for metadata upload)
 */

import * as fs from 'fs';
import * as path from 'path';
import { createPublicClient, createWalletClient, http, defineChain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// ---- load .env ----
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

// ---- config ----
const MANTLE_MAINNET = defineChain({
  id: 5000,
  name: 'Mantle',
  nativeCurrency: { decimals: 18, name: 'MNT', symbol: 'MNT' },
  rpcUrls: { default: { http: ['https://rpc.mantle.xyz'] } },
  blockExplorers: { default: { name: 'Mantle Explorer', url: 'https://explorer.mantle.xyz' } },
});

const IDENTITY_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as `0x${string}`;

const IDENTITY_ABI = [{
  type: 'function', name: 'register',
  stateMutability: 'nonpayable' as const,
  inputs: [{ name: 'agentURI', type: 'string' }],
  outputs: [{ name: 'agentId', type: 'uint256' }],
}] as const;

// ---- main ----
async function main() {
  const pk = process.env.MANTLE_PRIVATE_KEY;
  if (!pk) throw new Error('MANTLE_PRIVATE_KEY not set in .env');

  const normalizedKey = pk.startsWith('0x') ? pk : `0x${pk}`;
  const account = privateKeyToAccount(normalizedKey as `0x${string}`);

  const publicClient = createPublicClient({ chain: MANTLE_MAINNET, transport: http() });
  const walletClient = createWalletClient({ account, chain: MANTLE_MAINNET, transport: http() });

  console.log(`Agent: ${account.address}`);
  console.log(`Registry: ${IDENTITY_REGISTRY}`);
  console.log(`Chain: Mantle Mainnet (5000)`);

  // Check MNT balance
  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`MNT balance: ${Number(balance) / 1e18}`);

  if (balance < 1_000_000_000_000_000n) {
    console.log('\n⚠️  Less than 0.001 MNT — you may not have enough for gas.');
    console.log('   Send at least 0.01 MNT to this address on Mantle mainnet.\n');
    return;
  }

  // ---- Step 1: Upload metadata to IPFS ----
  console.log('\n📦 Uploading agent metadata to IPFS via Pinata...');

  const metadata = {
    name: 'Mantis',
    description: 'Autonomous DeFi agent on Mantle. Manages swaps, lending, and perps through natural language. Every decision audited on-chain.',
    version: '1.0.0',
    capabilities: [
      'market_sentiment', 'perps_trading', 'token_swap', 'lending',
      'yield_comparison', 'self_audit', 'portfolio_management', 'whale_tracking'
    ],
    chains: ['mantle-5000', 'hyperliquid'],
    protocols: ['byreal_perps', 'merchant_moe', 'lendle', 'erc8004'],
    provider: 'Mantis v1.0.0 — Turing Test Hackathon 2026',
    createdAt: new Date().toISOString(),
  };

  const pinataJwt = process.env.PINATA_JWT;
  if (!pinataJwt) throw new Error('PINATA_JWT not set in .env');

  const pinataRes = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${pinataJwt}`,
    },
    body: JSON.stringify({
      pinataContent: metadata,
      pinataMetadata: { name: `mantis-agent-metadata-${Date.now()}` },
    }),
  });

  if (!pinataRes.ok) throw new Error(`Pinata upload failed: ${await pinataRes.text()}`);

  const { IpfsHash } = await pinataRes.json() as { IpfsHash: string };
  const agentURI = `ipfs://${IpfsHash}`;
  console.log(`   CID: ${IpfsHash}`);
  console.log(`   URI: ${agentURI}`);

  // ---- Step 2: Register on-chain ----
  console.log('\n🆔 Calling register() on IdentityRegistry...');

  const txHash = await walletClient.writeContract({
    address: IDENTITY_REGISTRY,
    abi: IDENTITY_ABI,
    functionName: 'register',
    args: [agentURI],
  });

  console.log(`   Tx: https://explorer.mantle.xyz/tx/${txHash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  const success = receipt.status === 'success';
  console.log(`   Status: ${success ? '✅ Confirmed' : '❌ Reverted'}`);

  if (!success) {
    console.log('\n❌ Transaction reverted. Check the explorer for details.');
    return;
  }

  // ---- Step 3: Extract tokenId from the Transfer event ----
  console.log('\nLooking up agent ID from tx receipt...');

  // The register() function emits ERC-721 Transfer(address(0), msg.sender, agentId).
  // Topic 3 of the first Transfer log contains the tokenId.
  let agentId = '0';
  const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() === IDENTITY_REGISTRY.toLowerCase()
        && log.topics[0] === TRANSFER_TOPIC
        && log.topics.length >= 4) {
      agentId = BigInt(log.topics[3]).toString();
      console.log(`   Found tokenId ${agentId} in Transfer event`);
      break;
    }
  }

  console.log('\nSaving identity...');

  // Save to .agent-identity.json
  const identityData = {
    agentId,
    address: account.address,
    agentURI,
    ipfsCid: IpfsHash,
    txHash,
    registeredAt: new Date().toISOString(),
    registry: IDENTITY_REGISTRY,
    network: 'mantle-mainnet',
  };

  fs.writeFileSync(
    path.join(process.cwd(), '.agent-identity.json'),
    JSON.stringify(identityData, null, 2)
  );

  // Append to .env
  const envContent = fs.readFileSync(envPath, 'utf-8');
  if (!envContent.includes('AGENT_TOKEN_ID=')) {
    fs.appendFileSync(envPath, `\nAGENT_TOKEN_ID=${agentId}\n`);
  } else {
    const updated = envContent.replace(
      /AGENT_TOKEN_ID=.*/,
      `AGENT_TOKEN_ID=${agentId}`
    );
    fs.writeFileSync(envPath, updated);
  }

  console.log('\nERC-8004 Identity Registered!');
  console.log(`   Agent ID: ${agentId}`);
  console.log(`   Explorer: https://explorer.mantle.xyz/address/${IDENTITY_REGISTRY}`);
  console.log(`   Metadata: https://gateway.pinata.cloud/ipfs/${IpfsHash}`);
  console.log(`   Saved to .agent-identity.json and .env\n`);
}

main().catch((err) => {
  console.error('💥 Fatal:', err);
  process.exit(1);
});
