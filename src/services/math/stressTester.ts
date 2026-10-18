import type { OptionLeg } from '../../types/derivatives.ts';
import { calculateBlackScholes } from './blackScholes.ts';
import { calculateMarginRequirement } from './marginEngine.ts';

export interface StressMatrixCell {
  spotPct: number;
  spotPrice: number;
  volPct: number;
  stressedIv: number;
  plDelta: number;
  stressedMargin: number;
  marginExpansionPct: number;
}

/**
 * Calculates Beta-Weighted Delta against a benchmark index (e.g. SPY).
 * Formula: totalDelta * beta * (spotPrice / benchmarkPrice)
 */
export const calculateBetaWeightedDelta = (
  totalDelta: number,
  spotPrice: number,
  beta: number,
  benchmarkPrice: number = 500
): number => {
  if (benchmarkPrice <= 0) return 0;
  return Number((totalDelta * beta * (spotPrice / benchmarkPrice)).toFixed(2));
};

/**
 * Evaluates total portfolio Black-Scholes market value at a given spot and vol multiplier.
 */
const evaluatePortfolioValue = (
  activeLegs: OptionLeg[],
  spot: number,
  volMultiplier: number,
  dte: number,
  r: number,
  q: number
): number => {
  const timeYears = Math.max(0.0001, dte / 365);
  let totalValue = 0;

  for (const leg of activeLegs) {
    const sideSign = leg.side === 'LONG' ? 1 : -1;

    if (leg.legType === 'STOCK') {
      // Stock value at spot
      totalValue += spot * leg.contracts * sideSign;
    } else {
      // Option value
      const shockedIv = Math.max(0.01, leg.impliedVol * volMultiplier);
      const bsm = calculateBlackScholes(
        spot,
        leg.strike,
        timeYears,
        shockedIv,
        r,
        q,
        leg.type
      );
      totalValue += bsm.price * 100 * leg.contracts * sideSign;
    }
  }

  return totalValue;
};

/**
 * Generates a full multi-scenario stress matrix combining Spot Shocks and Volatility Shocks.
 * Spot shocks: [-20%, -10%, -5%, 0%, +5%, +10%, +20%]
 * Vol shocks: [-30%, -15%, 0%, +15%, +30%, +50%]
 */
export const generateStressMatrix = (
  legs: OptionLeg[],
  spotPrice: number,
  baseDte: number,
  r: number,
  q: number
): StressMatrixCell[][] => {
  const activeLegs = legs.filter((l) => l.isOpen);
  const spotShocks = [-0.2, -0.1, -0.05, 0, 0.05, 0.1, 0.2];
  const volShocks = [-0.3, -0.15, 0, 0.15, 0.3, 0.5];

  if (activeLegs.length === 0) {
    return [];
  }

  // Base state portfolio valuation
  const baseValue = evaluatePortfolioValue(activeLegs, spotPrice, 1.0, baseDte, r, q);
  const baseMargin = calculateMarginRequirement(activeLegs, spotPrice);

  const avgBaseIv =
    activeLegs.filter((l) => l.legType === 'OPTION').reduce((s, l) => s + l.impliedVol, 0) /
      (activeLegs.filter((l) => l.legType === 'OPTION').length || 1) || 0.2;

  const matrix: StressMatrixCell[][] = [];

  for (let rIdx = 0; rIdx < volShocks.length; rIdx++) {
    const volPct = volShocks[rIdx];
    const volMultiplier = 1 + volPct;
    matrix[rIdx] = [];

    for (let cIdx = 0; cIdx < spotShocks.length; cIdx++) {
      const spotPct = spotShocks[cIdx];
      const stressedSpot = Number((spotPrice * (1 + spotPct)).toFixed(2));

      // Calculate stressed portfolio value
      const stressedValue = evaluatePortfolioValue(
        activeLegs,
        stressedSpot,
        volMultiplier,
        baseDte,
        r,
        q
      );

      const plDelta = Number((stressedValue - baseValue).toFixed(2));

      // Build temporary stressed legs with shocked IV for margin engine
      const stressedLegs: OptionLeg[] = activeLegs.map((leg) => ({
        ...leg,
        impliedVol: Math.max(0.01, leg.impliedVol * volMultiplier),
      }));

      const stressedMargin = calculateMarginRequirement(stressedLegs, stressedSpot);

      const marginExpansionPct =
        baseMargin > 0
          ? Number((((stressedMargin - baseMargin) / baseMargin) * 100).toFixed(1))
          : 0;

      matrix[rIdx][cIdx] = {
        spotPct,
        spotPrice: stressedSpot,
        volPct,
        stressedIv: Number((avgBaseIv * volMultiplier * 100).toFixed(1)),
        plDelta,
        stressedMargin,
        marginExpansionPct,
      };
    }
  }

  return matrix;
};
