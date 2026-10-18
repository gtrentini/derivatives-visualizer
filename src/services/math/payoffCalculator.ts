import type { OptionLeg } from '../../types/derivatives.ts';
import { calculateBlackScholes, calculateLegGreeks } from './blackScholes.ts';
import { calculateMarginRequirement } from './marginEngine.ts';

export interface PayoffPoint {
  spot: number;
  expirationPl: number;
  currentPl: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
}

export interface RiskEnvelope {
  maxProfit: number | 'UNLIMITED';
  maxLoss: number | 'UNLIMITED';
  returnOnCapital: number | null;
  expirationBreakevens: number[];
  currentBreakevens: number[];
  marginRequired: number;
  netDebitCredit: number; // positive = net credit, negative = net debit
  currentPlAtSpot: number;
  expirationPlAtSpot: number;
}

/**
 * Finds zero crossings using linear interpolation.
 */
const findBreakevens = (
  points: { spot: number; pl: number }[]
): number[] => {
  const breakevens: number[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];

    if (p1.pl === 0) {
      breakevens.push(Number(p1.spot.toFixed(2)));
    } else if (p1.pl * p2.pl < 0) {
      // Crossing occurred between p1 and p2
      const t = -p1.pl / (p2.pl - p1.pl);
      const zeroSpot = p1.spot + t * (p2.spot - p1.spot);
      breakevens.push(Number(zeroSpot.toFixed(2)));
    }
  }

  // Deduplicate points within $0.05
  return breakevens.filter((val, idx, arr) => {
    return idx === 0 || Math.abs(val - arr[idx - 1]) > 0.05;
  });
};

/**
 * Generates an array of 250 evaluation points spanning a dynamic spot price window.
 * Computes expiration P&L, intermediate BSM theoretical P&L, and portfolio Greeks at each price step.
 */
export const generatePayoffSeries = (
  legs: OptionLeg[],
  spotPrice: number,
  simDte: number,
  ivShift: number,
  r: number,
  q: number,
  pointsCount: number = 250
): PayoffPoint[] => {
  const activeLegs = legs.filter((l) => l.isOpen);
  if (activeLegs.length === 0) {
    return [];
  }

  // Calculate dynamic price range
  const strikes = activeLegs.map((l) => l.strike);
  const minStrike = Math.min(...strikes, spotPrice);
  const maxStrike = Math.max(...strikes, spotPrice);

  const minSpot = Math.max(1, Math.min(spotPrice * 0.7, minStrike * 0.85));
  const maxSpot = Math.max(spotPrice * 1.3, maxStrike * 1.15);

  const step = (maxSpot - minSpot) / (pointsCount - 1);
  const effectiveDte = Math.max(0, simDte);
  const timeYears = effectiveDte / 365;

  const points: PayoffPoint[] = [];

  for (let i = 0; i < pointsCount; i++) {
    const s = minSpot + i * step;

    let totalExpPl = 0;
    let totalCurPl = 0;
    let totalDelta = 0;
    let totalGamma = 0;
    let totalTheta = 0;
    let totalVega = 0;

    for (const leg of activeLegs) {
      const isLong = leg.side === 'LONG';
      const sideSign = isLong ? 1 : -1;

      if (leg.legType === 'STOCK') {
        const shares = leg.contracts;
        // P&L at expiration and intermediate are both (S - entryPrice) * shares * sideSign
        const stockPl = (s - leg.strike) * shares * sideSign;
        totalExpPl += stockPl;
        totalCurPl += stockPl;
        totalDelta += shares * sideSign;
      } else {
        // OPTION
        const contracts = leg.contracts;
        const multiplier = contracts * 100;

        // 1. Expiration P&L (T = 0)
        const intrinsic =
          leg.type === 'CALL'
            ? Math.max(0, s - leg.strike)
            : Math.max(0, leg.strike - s);
        const expPl = (intrinsic - leg.premium) * multiplier * sideSign;
        totalExpPl += expPl;

        // 2. Intermediate theoretical P&L (T = simDte)
        const shockedIv = Math.max(0.01, leg.impliedVol + ivShift);
        const bsm = calculateBlackScholes(
          s,
          leg.strike,
          timeYears,
          shockedIv,
          r,
          q,
          leg.type
        );
        const curPl = (bsm.price - leg.premium) * multiplier * sideSign;
        totalCurPl += curPl;

        // 3. Greeks at spot step s
        const legGreeks = calculateLegGreeks(leg, s, effectiveDte, ivShift, r, q);
        totalDelta += legGreeks.delta;
        totalGamma += legGreeks.gamma;
        totalTheta += legGreeks.theta;
        totalVega += legGreeks.vega;
      }
    }

    points.push({
      spot: Number(s.toFixed(2)),
      expirationPl: Number(totalExpPl.toFixed(2)),
      currentPl: Number(totalCurPl.toFixed(2)),
      delta: Number(totalDelta.toFixed(3)),
      gamma: Number(totalGamma.toFixed(4)),
      theta: Number(totalTheta.toFixed(2)),
      vega: Number(totalVega.toFixed(2)),
    });
  }

  return points;
};

/**
 * Computes exact Risk & Capital Envelope metrics:
 * Max profit, Max loss, breakevens, margin required, and Return on Capital.
 */
export const calculateRiskEnvelope = (
  payoffSeries: PayoffPoint[],
  legs: OptionLeg[],
  spotPrice: number
): RiskEnvelope => {
  const activeLegs = legs.filter((l) => l.isOpen);
  const marginRequired = calculateMarginRequirement(activeLegs, spotPrice);

  if (payoffSeries.length === 0 || activeLegs.length === 0) {
    return {
      maxProfit: 0,
      maxLoss: 0,
      returnOnCapital: null,
      expirationBreakevens: [],
      currentBreakevens: [],
      marginRequired: 0,
      netDebitCredit: 0,
      currentPlAtSpot: 0,
      expirationPlAtSpot: 0,
    };
  }

  // Net Debit / Credit calculation
  let netDebitCredit = 0;
  for (const leg of activeLegs) {
    if (leg.legType === 'OPTION') {
      const sign = leg.side === 'SHORT' ? 1 : -1;
      netDebitCredit += sign * leg.premium * 100 * leg.contracts;
    } else {
      const sign = leg.side === 'LONG' ? -1 : 1;
      netDebitCredit += sign * leg.strike * leg.contracts;
    }
  }

  // Breakevens
  const expPoints = payoffSeries.map((p) => ({ spot: p.spot, pl: p.expirationPl }));
  const curPoints = payoffSeries.map((p) => ({ spot: p.spot, pl: p.currentPl }));

  const expirationBreakevens = findBreakevens(expPoints);
  const currentBreakevens = findBreakevens(curPoints);

  // Check asymptotic tail slopes at upper and lower boundaries
  const n = payoffSeries.length;
  const pEndMinus1 = payoffSeries[n - 2];
  const pEnd = payoffSeries[n - 1];

  const rightSlope =
    (pEnd.expirationPl - pEndMinus1.expirationPl) / (pEnd.spot - pEndMinus1.spot);

  // Net delta exposure determines unboundedness
  // If right slope is significantly positive (e.g. > +2 per dollar spot), profit is unlimited as spot -> inf
  // If right slope is significantly negative (e.g. < -2 per dollar spot), loss is unlimited as spot -> inf
  const isRightProfitUnbounded = rightSlope > 2;
  const isRightLossUnbounded = rightSlope < -2;

  // Max profit & Max loss across evaluated window
  let rawMaxPl = -Infinity;
  let rawMinPl = Infinity;

  for (const pt of payoffSeries) {
    if (pt.expirationPl > rawMaxPl) rawMaxPl = pt.expirationPl;
    if (pt.expirationPl < rawMinPl) rawMinPl = pt.expirationPl;
  }

  const maxProfit: number | 'UNLIMITED' = isRightProfitUnbounded
    ? 'UNLIMITED'
    : Number(rawMaxPl.toFixed(2));

  // For maxLoss: if right slope is negative and steep, or naked short put at S=0
  const maxLoss: number | 'UNLIMITED' = isRightLossUnbounded
    ? 'UNLIMITED'
    : Number(Math.abs(Math.min(0, rawMinPl)).toFixed(2));

  // Return on Capital (ROC) %
  let returnOnCapital: number | null = null;
  if (marginRequired > 0 && typeof maxProfit === 'number') {
    returnOnCapital = Number(((maxProfit / marginRequired) * 100).toFixed(1));
  }

  // P&L at current spot price: find closest point
  let closestPoint = payoffSeries[0];
  let minDiff = Math.abs(closestPoint.spot - spotPrice);
  for (const pt of payoffSeries) {
    const diff = Math.abs(pt.spot - spotPrice);
    if (diff < minDiff) {
      minDiff = diff;
      closestPoint = pt;
    }
  }

  return {
    maxProfit,
    maxLoss,
    returnOnCapital,
    expirationBreakevens,
    currentBreakevens,
    marginRequired,
    netDebitCredit: Number(netDebitCredit.toFixed(2)),
    currentPlAtSpot: closestPoint.currentPl,
    expirationPlAtSpot: closestPoint.expirationPl,
  };
};
