/**
 * Market Sentiment & News Analysis
 *
 * Aggregates free data sources into actionable trade signals:
 * - CoinGecko (price + 24h change)
 * - Fear & Greed Index (alternative.me)
 * - CryptoPanic RSS (news headlines)
 * - Byreal signal scan (funding rates, technicals)
 *
 * No API keys required. All sources are free-tier.
 * In-memory cache to stay within rate limits.
 */

import { scanSignals } from './byreal-perps';

// ============================================================
// TYPES
// ============================================================

export interface SentimentScore {
  coin: string;
  price: number;
  change24h: number;
  fearGreed: number;
  newsScore: number;        // -100 to 100 (negative=bearish, positive=bullish)
  newsHeadlines: string[];
  fundingRate: number;
  overallScore: number;     // 0-100 (>60 bullish, <40 bearish)
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number;       // 0-100
  reasons: string[];
  updatedAt: string;
}

export interface FearGreedData {
  value: number;            // 0-100
  classification: string;  // "Extreme Fear", "Fear", "Neutral", "Greed", "Extreme Greed"
}

// ============================================================
// IN-MEMORY CACHE
// ============================================================

const cache = new Map<string, { data: unknown; ts: number }>();

function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < ttlMs) {
    return Promise.resolve(entry.data as T);
  }
  return fn().then((data) => {
    cache.set(key, { data, ts: Date.now() });
    return data;
  });
}

// ============================================================
// FEAR & GREED INDEX
// ============================================================

const FG_URL = 'https://api.alternative.me/fng/?limit=1';

async function fetchFearGreed(): Promise<FearGreedData> {
  try {
    const res = await fetch(FG_URL, { signal: AbortSignal.timeout(5000) });
    const json = await res.json() as { data: Array<{ value: string; value_classification: string }> };
    const item = json.data?.[0];
    return {
      value: parseInt(item?.value ?? '50', 10),
      classification: item?.value_classification ?? 'Neutral',
    };
  } catch {
    return { value: 50, classification: 'Neutral' };
  }
}

export const getFearGreedIndex = () => cached('fear-greed', 60_000, fetchFearGreed);

// ============================================================
// COINGECKO PRICES
// ============================================================

const CG_IDS: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
};

async function fetchCoinPrices(): Promise<Record<string, { price: number; change24h: number }>> {
  const ids = Object.values(CG_IDS).join(',');
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const json = await res.json() as Record<string, { usd: number; usd_24h_change: number }>;
    const result: Record<string, { price: number; change24h: number }> = {};
    for (const [coin, cgId] of Object.entries(CG_IDS)) {
      result[coin] = {
        price: json[cgId]?.usd ?? 0,
        change24h: json[cgId]?.usd_24h_change ?? 0,
      };
    }
    return result;
  } catch {
    return {};
  }
}

export const getCoinPrices = () => cached('coin-prices', 30_000, fetchCoinPrices);

// ============================================================
// NEWS HEADLINES (CryptoPanic RSS)
// ============================================================

interface NewsItem {
  title: string;
  url: string;
  publishedAt: string;
}

async function fetchNews(): Promise<NewsItem[]> {
  try {
    const res = await fetch('https://cryptopanic.com/news/rss/', { signal: AbortSignal.timeout(5000) });
    const text = await res.text();

    // Lightweight RSS parsing — extract <item> blocks
    const items: NewsItem[] = [];
    const itemBlocks = text.split('<item>').slice(1); // First split is before first <item>
    for (const block of itemBlocks) {
      const title = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
        ?? block.match(/<title>(.*?)<\/title>/)?.[1]
        ?? '';
      const link = block.match(/<link>(.*?)<\/link>/)?.[1] ?? '';
      const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ?? '';
      if (title) {
        items.push({ title, url: link, publishedAt: pubDate });
      }
    }
    return items;
  } catch {
    return [];
  }
}

export const getNewsHeadlines = () => cached('news', 120_000, fetchNews);

// ============================================================
// SENTIMENT SCORING
// ============================================================

/** Simple keyword-based sentiment on a headline. Returns -1 to 1. */
function headlineSentiment(headline: string): number {
  const lower = headline.toLowerCase();
  const bullish = ['surge', 'rally', 'bull', 'breakout', 'pump', 'upgrade', 'adoption',
    'partnership', 'launch', 'all-time', 'record high', 'accumulation', 'buy', 'green',
    'gain', 'jump', 'soar', 'spike', 'positive', 'optimism', 'support', 'bounce'];
  const bearish = ['crash', 'dump', 'bear', 'decline', 'drop', 'fall', 'fear', 'sell-off',
    'correction', 'hack', 'exploit', 'regulation', 'crackdown', 'ban', 'lawsuit', 'sec ',
    'liquidat', 'red', 'loss', 'plunge', 'tumble', 'panic', 'uncertainty', 'risk'];

  let score = 0;
  for (const word of bullish) {
    if (lower.includes(word)) score += 0.15;
  }
  for (const word of bearish) {
    if (lower.includes(word)) score -= 0.15;
  }
  return Math.max(-1, Math.min(1, score));
}

const COIN_KEYWORDS: Record<string, string[]> = {
  BTC: ['btc', 'bitcoin'],
  ETH: ['eth', 'ethereum'],
  SOL: ['sol', 'solana'],
};

function coinMatches(headline: string, coin: string): boolean {
  const lower = headline.toLowerCase();
  return COIN_KEYWORDS[coin]?.some((kw) => lower.includes(kw)) ?? false;
}

/** Score news sentiment for a specific coin */
function scoreNewsForCoin(headlines: NewsItem[], coin: string): { score: number; headlines: string[] } {
  const relevant = headlines.filter((h) => coinMatches(h.title, coin));
  if (relevant.length === 0) return { score: 0, headlines: [] };

  let raw = 0;
  for (const item of relevant) {
    raw += headlineSentiment(item.title);
  }
  // Normalize: average score mapped to -100 to 100
  const score = Math.round((raw / Math.max(relevant.length, 1)) * 100);
  return {
    score,
    headlines: relevant.slice(0, 5).map((h) => h.title),
  };
}

// ============================================================
// MAIN: AGGREGATED SENTIMENT ANALYSIS
// ============================================================

/**
 * Analyze sentiment for a single coin.
 * Combines: Fear & Greed, CoinGecko price action, news headlines,
 * and Byreal funding rates into one signal.
 */
export async function analyzeSentiment(coin: string): Promise<SentimentScore | null> {
  if (!['BTC', 'ETH', 'SOL'].includes(coin)) return null;

  console.log(`\n📊 SENTIMENT: Fetching data for ${coin}...`);

  const start = Date.now();
  const [fg, prices, news, signals] = await Promise.allSettled([
    getFearGreedIndex(),
    getCoinPrices(),
    getNewsHeadlines(),
    scanSignals().catch(() => []),
  ]);
  const elapsed = Date.now() - start;

  const fearGreed = fg.status === 'fulfilled' ? fg.value : { value: 50, classification: 'Neutral' };
  const priceData = prices.status === 'fulfilled' ? prices.value : {};
  const headlines = news.status === 'fulfilled' ? news.value : [];
  const signalData = signals.status === 'fulfilled'
    ? (signals.value as Array<{ coin: string; fundingRate: number; signal: string; strength: number; priceChange24h: number }>)
    : [];

  console.log(`  Fear & Greed: ${fearGreed.value} (${fg.status === 'fulfilled' ? '✓' : '✗ fallback'})`);
  console.log(`  CoinGecko: $${priceData[coin]?.price ?? '?'} (${prices.status === 'fulfilled' ? '✓' : '✗ fallback'})`);
  console.log(`  News: ${headlines.length} headlines (${news.status === 'fulfilled' ? '✓' : '✗ fallback'})`);
  console.log(`  Byreal signals: ${signalData.length} coins (${signals.status === 'fulfilled' ? '✓' : '✗ fallback'})`);
  console.log(`  Total: ${elapsed}ms`);

  const price = priceData[coin]?.price ?? 0;
  const cgChange = priceData[coin]?.change24h ?? 0;
  const byrealSignal = signalData.find((s) => s.coin === coin);
  const fundingRate = byrealSignal?.fundingRate ?? 0;
  const byrealChange = byrealSignal?.priceChange24h ?? cgChange;

  const newsResult = scoreNewsForCoin(headlines, coin);

  // Weighted scoring (0-100 scale):
  // Funding rate:   25%  (negative=bullish → score up)
  // Price trend:    25%  (positive change → score up)
  // Fear & Greed:   25%  (above 50 → score up)
  // News sentiment: 25%  (positive → score up)
  const fgScore = fearGreed.value; // already 0-100

  // Funding: negative funding = bullish (shorts paying longs)
  // Map funding rate from [-0.01, 0.01] range to [0, 100]
  const fundingScore = 50 - Math.max(-100, Math.min(100, fundingRate * 5000));

  // Price trend: map change from [-10%, 10%] to [0, 100]
  const trendScore = 50 + Math.max(-50, Math.min(50, byrealChange * 5));

  // News: map from [-100, 100] to [0, 100]
  const newsScore = 50 + newsResult.score / 2;

  // Weighted aggregate
  const overallScore = Math.round(
    fundingScore * 0.25 + trendScore * 0.25 + fgScore * 0.25 + newsScore * 0.25
  );

  const direction: SentimentScore['direction'] =
    overallScore >= 60 ? 'bullish' : overallScore <= 40 ? 'bearish' : 'neutral';

  // Confidence = distance from 50 * 2 (max 100)
  const confidence = Math.min(100, Math.abs(overallScore - 50) * 2);

  // Build human-readable reasons
  const reasons: string[] = [];
  if (Math.abs(fundingRate) > 0.0005) {
    const dir = fundingRate < 0 ? 'negative (bullish — shorts paying longs)' : 'positive (bearish — longs paying shorts)';
    reasons.push(`Funding rate: ${(fundingRate * 100).toFixed(3)}% ${dir}`);
  }
  if (Math.abs(byrealChange) > 1) {
    reasons.push(`Price 24h: ${byrealChange > 0 ? '+' : ''}${byrealChange.toFixed(1)}%`);
  }
  if (fearGreed.value >= 70 || fearGreed.value <= 30) {
    reasons.push(`Fear & Greed: ${fearGreed.value} (${fearGreed.classification})`);
  }
  if (newsResult.headlines.length > 0) {
    const sentiment = newsResult.score > 20 ? 'positive' : newsResult.score < -20 ? 'negative' : 'mixed';
    reasons.push(`News: ${sentiment} (${newsResult.headlines.length} articles)`);
  }

  const result: SentimentScore = {
    coin,
    price,
    change24h: byrealChange,
    fearGreed: fearGreed.value,
    newsScore: newsResult.score,
    newsHeadlines: newsResult.headlines,
    fundingRate,
    overallScore,
    direction,
    confidence,
    reasons,
    updatedAt: new Date().toISOString(),
  };

  console.log(`  → Result: ${direction.toUpperCase()} (score ${overallScore}/100, conf ${confidence}%)\n`);
  return result;
}

/** Scan sentiment for all tracked coins */
export async function scanSentiment(): Promise<SentimentScore[]> {
  const results = await Promise.allSettled([
    analyzeSentiment('BTC'),
    analyzeSentiment('ETH'),
    analyzeSentiment('SOL'),
  ]);
  return results
    .filter((r) => r.status === 'fulfilled' && r.value !== null)
    .map((r) => (r as PromiseFulfilledResult<SentimentScore>).value);
}
