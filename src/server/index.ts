/**
 * Mantis Status API — Standalone Server
 *
 * Deploy to Render as a Web Service. This runs on a box that HAS the
 * byreal-perps-cli binary, so it CAN call the CLI for live data.
 *
 * Usage:
 *   npx tsx src/server/index.ts              # start on port 3001
 *   PORT=8080 npx tsx src/server/index.ts    # custom port
 *
 * Endpoints:
 *   GET  /api/status   — guardrail state + network + wallet summary
 *   GET  /api/health   — liveness check
 */

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

// ---------- Load .env (same as agent-loop does) -----------------
function loadEnv(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf-8').split('\n')) {
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
loadEnv(path.join(process.cwd(), '.env'));

// ---------- Imports (after env is loaded) -----------------------
import { getPortfolio } from '@/agent/tools/analytics';
import { getGuardrailStatus } from '@/agent/guardrails';
import { NETWORK, config, AGENT_IDENTITY } from '@/agent/config';
import { getAccountInfo as getByrealAccount } from '@/agent/tools/byreal-perps';

// ---------- Helpers ---------------------------------------------
function json(res: http.ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data, null, 2));
}

function safe<T>(fn: () => Promise<T>, fallback: T): () => Promise<T> {
  return () => fn().catch(() => fallback);
}

// ---------- Route: /api/status ----------------------------------
async function handleStatus(_req: http.IncomingMessage, res: http.ServerResponse) {
  const [guardrails, byreal] = await Promise.allSettled([
    Promise.resolve(getGuardrailStatus()),
    getByrealAccount().then((a) => a ?? { address: 'unknown', margin: 0, equity: 0, unrealizedPnl: 0, leverage: 0 }),
  ]);

  const gStatus = guardrails.status === 'fulfilled' ? guardrails.value : null;
  const byrealData = byreal.status === 'fulfilled' ? byreal.value : null;

  json(res, {
    agent: {
      name: AGENT_IDENTITY.name,
      version: AGENT_IDENTITY.version,
      tokenId: AGENT_IDENTITY.tokenId?.toString() ?? 'not-minted',
    },
    network: {
      name: config.name,
      chainId: config.chainId,
      mode: NETWORK,
    },
    guardrails: gStatus,
    byrealAccount: byrealData
      ? {
          address: byrealData.address,
          equity: byrealData.equity,
          margin: byrealData.margin,
          unrealizedPnl: byrealData.unrealizedPnl,
        }
      : null,
    message: byrealData && byrealData.equity > 0
      ? `Agent online. $${byrealData.equity.toFixed(2)} equity. Trading ${NETWORK === 'mainnet' ? 'LIVE' : 'testnet'}.`
      : `Agent online. Wallet ${byrealData?.address ?? 'unknown'} has $0. Fund it to enable trading.`,
  });
}

// ---------- Route: /api/health ----------------------------------
async function handleHealth(_req: http.IncomingMessage, res: http.ServerResponse) {
  json(res, { status: 'ok', uptime: process.uptime() });
}

// ---------- Router ----------------------------------------------
const PORT = parseInt(process.env.PORT ?? '3001', 10);

const server = http.createServer(async (req, res) => {
  const url = req.url ?? '/';

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
    res.end();
    return;
  }

  if (url === '/api/status' && req.method === 'GET') return handleStatus(req, res);
  if (url === '/api/health' && req.method === 'GET') return handleHealth(req, res);
  if (url === '/' || url === '') return json(res, { name: 'Mantis Status API', docs: { status: '/api/status', health: '/api/health' } });

  json(res, { error: 'Not found' }, 404);
});

server.listen(PORT, () => {
  console.log(`🦗 Mantis Status API → http://localhost:${PORT}`);
  console.log(`   /api/status  — guardrails + wallet + network`);
  console.log(`   /api/health  — liveness`);
  console.log(`   Network: ${NETWORK} (chain ${config.chainId})`);
});
