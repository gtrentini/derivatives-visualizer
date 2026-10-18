import type { LiveOptionChainData, OptionContractQuote } from '../../types/market.ts';
import { calculateBlackScholes } from '../math/blackScholes.ts';

// Known market parameters for liquid symbols (used when exchange feed is offline)
const TICKER_DEFAULTS: Record<string, { spot: number; divYield: number; histVol: number }> = {
  SPY: { spot: 763.25, divYield: 0.0125, histVol: 0.14 },
  QQQ: { spot: 707.87, divYield: 0.0055, histVol: 0.19 },
  AAPL: { spot: 342.62, divYield: 0.0045, histVol: 0.22 },
  NVDA: { spot: 213.75, divYield: 0.0003, histVol: 0.45 },
  TSLA: { spot: 352.46, divYield: 0.0, histVol: 0.52 },
  MSFT: { spot: 526.83, divYield: 0.0075, histVol: 0.21 },
  AMZN: { spot: 248.98, divYield: 0.0, histVol: 0.26 },
  IWM: { spot: 270.44, divYield: 0.012, histVol: 0.21 },
};

interface CboeOptionRaw {
  option: string;
  bid: number;
  bid_size?: number;
  ask: number;
  ask_size?: number;
  iv?: number;
  open_interest?: number;
  volume?: number;
  delta?: number;
  gamma?: number;
  vega?: number;
  theta?: number;
  rho?: number;
  theo?: number;
  change?: number;
  last_trade_price?: number;
  percent_change?: number;
}

interface CboeApiResponse {
  timestamp?: string;
  data?: {
    symbol?: string;
    current_price?: number;
    close?: number;
    prev_day_close?: number;
    iv30?: number;
    options?: CboeOptionRaw[];
  };
}

/**
 * Normalizes ticker symbols for CBOE options endpoints.
 * CBOE prefixes index symbols with an underscore (e.g. SPX -> _SPX, VIX -> _VIX).
 */
const toCboeSymbol = (symbol: string): string => {
  const upper = symbol.trim().toUpperCase();
  if (upper.startsWith('^')) {
    return `_${upper.slice(1)}`;
  }
  if (['SPX', 'VIX', 'RUT', 'DJX', 'NDX'].includes(upper)) {
    return `_${upper}`;
  }
  return upper;
};

/**
 * Fetches real market spot price via Yahoo Finance's open v8 chart endpoint.
 * Requires NO crumb and NO cookies. Used as a secondary fallback.
 */
export const fetchYahooV8SpotPrice = async (symbol: string): Promise<number | null> => {
  const clean = symbol.trim().toUpperCase();
  try {
    const res = await fetch(
      `/api/yahoo/v8/finance/chart/${encodeURIComponent(clean)}?interval=1d&range=1d`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (typeof price === 'number' && price > 0) {
      return Number(price.toFixed(2));
    }
  } catch {
    // ignore
  }
  return null;
};

/**
 * Generates a realistic simulated option chain when network is unavailable
 * or ticker is not found on live exchanges. Strictly marked as SIMULATED_MODEL (isLive: false).
 */
export const generateSimulatedOptionChain = (
  symbol: string,
  expirationTimestamp?: number,
  spotOverride?: number
): LiveOptionChainData => {
  const upper = symbol.toUpperCase();
  const info = TICKER_DEFAULTS[upper] || { spot: 500.0, divYield: 0.013, histVol: 0.22 };
  const spot = spotOverride && spotOverride > 0 ? spotOverride : info.spot;
  const divYield = info.divYield;

  // Generate 6 realistic expiration dates (7d, 14d, 30d, 45d, 60d, 90d)
  const now = Math.floor(Date.now() / 1000);
  const expirationOffsets = [7, 14, 30, 45, 60, 90];
  const expirationDates = expirationOffsets.map((days) => now + days * 86400);

  const selectedExpiration =
    expirationTimestamp && expirationDates.includes(expirationTimestamp)
      ? expirationTimestamp
      : expirationDates[2]; // Default ~30 DTE

  const dte = Math.max(1, Math.round((selectedExpiration - now) / 86400));
  const timeYears = dte / 365;

  const step = spot < 100 ? 2.5 : 5;
  const centerStrike = Math.round(spot / step) * step;
  const strikes: number[] = [];
  const numWings = 10;

  for (let i = -numWings; i <= numWings; i++) {
    const strike = Number((centerStrike + i * step).toFixed(2));
    if (strike > 0) {
      strikes.push(strike);
    }
  }

  const calls: OptionContractQuote[] = [];
  const puts: OptionContractQuote[] = [];

  for (const strike of strikes) {
    const moneyness = Math.log(strike / spot);
    const skew = Math.max(-0.05, Math.min(0.15, -0.3 * moneyness));
    const iv = Math.max(0.12, Math.min(0.9, info.histVol + skew));

    const callGreeks = calculateBlackScholes(
      spot,
      strike,
      timeYears,
      iv,
      0.045,
      divYield,
      'CALL'
    );

    const putGreeks = calculateBlackScholes(
      spot,
      strike,
      timeYears,
      iv,
      0.045,
      divYield,
      'PUT'
    );

    const callMid = Math.max(0.05, callGreeks.price);
    const putMid = Math.max(0.05, putGreeks.price);

    const callSpread = Math.max(0.05, Number((callMid * 0.04).toFixed(2)));
    const putSpread = Math.max(0.05, Number((putMid * 0.04).toFixed(2)));

    const callBid = Math.max(0.01, Number((callMid - callSpread / 2).toFixed(2)));
    const callAsk = Number((callMid + callSpread / 2).toFixed(2));

    const putBid = Math.max(0.01, Number((putMid - putSpread / 2).toFixed(2)));
    const putAsk = Number((putMid + putSpread / 2).toFixed(2));

    const expDateStr = new Date(selectedExpiration * 1000)
      .toISOString()
      .slice(2, 10)
      .replace(/-/g, '');

    const strikeStr = String(Math.round(strike * 1000)).padStart(8, '0');

    calls.push({
      contractSymbol: `${upper}${expDateStr}C${strikeStr}`,
      strike,
      lastPrice: Number(callMid.toFixed(2)),
      bid: callBid,
      ask: callAsk,
      change: Number(((Math.random() - 0.48) * 1.5).toFixed(2)),
      percentChange: Number(((Math.random() - 0.48) * 4).toFixed(2)),
      volume: Math.floor(Math.random() * 2500) + 120,
      openInterest: Math.floor(Math.random() * 8000) + 450,
      impliedVolatility: Number(iv.toFixed(4)),
      inTheMoney: spot > strike,
      expiration: selectedExpiration,
    });

    puts.push({
      contractSymbol: `${upper}${expDateStr}P${strikeStr}`,
      strike,
      lastPrice: Number(putMid.toFixed(2)),
      bid: putBid,
      ask: putAsk,
      change: Number(((Math.random() - 0.48) * 1.5).toFixed(2)),
      percentChange: Number(((Math.random() - 0.48) * 4).toFixed(2)),
      volume: Math.floor(Math.random() * 2500) + 120,
      openInterest: Math.floor(Math.random() * 8000) + 450,
      impliedVolatility: Number(iv.toFixed(4)),
      inTheMoney: spot < strike,
      expiration: selectedExpiration,
    });
  }

  return {
    symbol: upper,
    underlyingPrice: spot,
    dividendYield: divYield,
    expirationDates,
    selectedExpiration,
    calls,
    puts,
    isLive: false,
    dataSource: 'SIMULATED_MODEL',
  };
};

/**
 * Fetches live option chains from CBOE's public delayed quotes CDN.
 * Parses OCC contract symbols (e.g. SPY261019C00550000) directly into
 * structured quotes with actual market bid, ask, last, IV, and open interest.
 */
export const fetchLiveOptionChain = async (
  symbol: string,
  expirationTimestamp?: number
): Promise<LiveOptionChainData> => {
  const cleanSymbol = symbol.trim().toUpperCase();
  const cboeSymbol = toCboeSymbol(cleanSymbol);

  try {
    const url = `/api/cboe/api/global/delayed_quotes/options/${encodeURIComponent(cboeSymbol)}.json`;
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      console.warn(`[MarketData] CBOE API returned HTTP ${response.status}. Attempting secondary fallback.`);
      return await fallbackPipeline(cleanSymbol, expirationTimestamp);
    }

    const payload = (await response.json()) as CboeApiResponse;
    const data = payload?.data;

    if (!data || !Array.isArray(data.options) || data.options.length === 0) {
      console.warn('[MarketData] CBOE response missing options data. Attempting secondary fallback.');
      return await fallbackPipeline(cleanSymbol, expirationTimestamp);
    }

    // 1. Extract Underlying Spot Price
    const rawSpot = data.current_price || data.close || data.prev_day_close;
    const spot =
      Number(rawSpot) > 0
        ? Number(rawSpot)
        : (TICKER_DEFAULTS[cleanSymbol]?.spot ?? 500);

    const divYield = TICKER_DEFAULTS[cleanSymbol]?.divYield ?? 0.013;

    // 2. Parse OCC Option Contracts
    const occRegex = /^([A-Z_]+)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/;
    const expSet = new Set<number>();

    interface ParsedOccOption {
      quote: OptionContractQuote;
      type: 'CALL' | 'PUT';
    }

    const parsedOptions: ParsedOccOption[] = [];

    for (const opt of data.options) {
      if (!opt.option) continue;
      const match = opt.option.trim().toUpperCase().match(occRegex);
      if (!match) continue;

      const yy = parseInt(match[2], 10);
      const mm = parseInt(match[3], 10);
      const dd = parseInt(match[4], 10);
      const isCall = match[5] === 'C';
      const type: 'CALL' | 'PUT' = isCall ? 'CALL' : 'PUT';
      const strike = parseInt(match[6], 10) / 1000;
      const expSec = Math.floor(Date.UTC(2000 + yy, mm - 1, dd, 20, 0, 0) / 1000);

      expSet.add(expSec);

      const bid = Math.max(0, Number(opt.bid) || 0);
      const ask = Math.max(0, Number(opt.ask) || 0);
      const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : 0;
      const lastPrice = Math.max(
        0.01,
        Number(opt.last_trade_price) || Number(opt.theo) || mid || 0.01
      );

      const rawIv = Number(opt.iv);
      const impliedVolatility = rawIv > 0.001 ? rawIv : 0.2;

      parsedOptions.push({
        type,
        quote: {
          contractSymbol: opt.option,
          strike,
          lastPrice: Number(lastPrice.toFixed(2)),
          bid: Number(bid.toFixed(2)),
          ask: Number(ask.toFixed(2)),
          change: Number(opt.change) || 0,
          percentChange: Number(opt.percent_change) || 0,
          volume: Number(opt.volume) || 0,
          openInterest: Number(opt.open_interest) || 0,
          impliedVolatility: Number(impliedVolatility.toFixed(4)),
          inTheMoney: isCall ? spot > strike : spot < strike,
          expiration: expSec,
        },
      });
    }

    const expirationDates = Array.from(expSet).sort((a, b) => a - b);
    if (expirationDates.length === 0) {
      return await fallbackPipeline(cleanSymbol, expirationTimestamp, spot);
    }

    // 3. Determine Active Selected Expiration
    let selectedExpiration: number;
    if (expirationTimestamp && expirationDates.includes(expirationTimestamp)) {
      selectedExpiration = expirationTimestamp;
    } else {
      // Find expiration closest to ~30 days out
      const now = Math.floor(Date.now() / 1000);
      const targetSec = now + 30 * 86400;
      let minDiff = Infinity;
      selectedExpiration = expirationDates[0];

      for (const exp of expirationDates) {
        const diff = Math.abs(exp - targetSec);
        if (diff < minDiff) {
          minDiff = diff;
          selectedExpiration = exp;
        }
      }
    }

    // 4. Filter and Deduplicate Calls & Puts for the Selected Expiration
    const callsMap = new Map<number, OptionContractQuote>();
    const putsMap = new Map<number, OptionContractQuote>();

    for (const item of parsedOptions) {
      if (item.quote.expiration !== selectedExpiration) continue;

      if (item.type === 'CALL') {
        const existing = callsMap.get(item.quote.strike);
        if (!existing || item.quote.openInterest + item.quote.volume > existing.openInterest + existing.volume) {
          callsMap.set(item.quote.strike, item.quote);
        }
      } else {
        const existing = putsMap.get(item.quote.strike);
        if (!existing || item.quote.openInterest + item.quote.volume > existing.openInterest + existing.volume) {
          putsMap.set(item.quote.strike, item.quote);
        }
      }
    }

    const calls = Array.from(callsMap.values()).sort((a, b) => a.strike - b.strike);
    const puts = Array.from(putsMap.values()).sort((a, b) => a.strike - b.strike);

    return {
      symbol: cleanSymbol,
      underlyingPrice: Number(spot.toFixed(2)),
      dividendYield: Number(divYield.toFixed(4)),
      expirationDates,
      selectedExpiration,
      calls,
      puts,
      isLive: true,
      dataSource: 'LIVE_EXCHANGE',
    };
  } catch (err) {
    console.warn('[MarketData] CBOE fetch encountered error. Using fallback pipeline.', err);
    return await fallbackPipeline(cleanSymbol, expirationTimestamp);
  }
};

/**
 * Secondary fallback pipeline:
 * Tries Yahoo v8 open chart endpoint for live spot price first, then generates simulated chain.
 */
const fallbackPipeline = async (
  symbol: string,
  expirationTimestamp?: number,
  knownSpot?: number
): Promise<LiveOptionChainData> => {
  let spot = knownSpot;
  if (!spot) {
    const v8Price = await fetchYahooV8SpotPrice(symbol);
    if (v8Price) {
      spot = v8Price;
    }
  }

  return generateSimulatedOptionChain(symbol, expirationTimestamp, spot);
};
