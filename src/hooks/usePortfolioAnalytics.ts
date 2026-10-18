import { useMemo } from 'react';
import { usePortfolio } from '../context/usePortfolio.ts';
import {
  generatePayoffSeries,
  calculateRiskEnvelope,
  type PayoffPoint,
  type RiskEnvelope,
} from '../services/math/payoffCalculator.ts';
import { calculateLegGreeks } from '../services/math/blackScholes.ts';

export interface CurrentGreeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
}

export interface PortfolioAnalyticsResult {
  payoffSeries: PayoffPoint[];
  riskEnvelope: RiskEnvelope;
  currentGreeks: CurrentGreeks;
  spotPriceRange: [number, number];
  isCalculating: boolean;
}

/**
 * Custom React hook that memoizes quantitative derivatives analytics:
 * - High-resolution Black-Scholes multi-leg payoff series (expiration and intermediate)
 * - Portfolio-level Greeks (Delta, Gamma, Theta, Vega, Rho)
 * - Collateral, margin, risk envelope, and exact breakevens
 */
export const usePortfolioAnalytics = (): PortfolioAnalyticsResult => {
  const { state } = usePortfolio();

  const { spotPrice, riskFreeRate, dividendYield } = state.underlying;
  const { legs, simulationDte, ivShift } = state;

  return useMemo(() => {
    // 1. Generate 250-point high-resolution payoff curves
    const payoffSeries = generatePayoffSeries(
      legs,
      spotPrice,
      simulationDte,
      ivShift,
      riskFreeRate,
      dividendYield,
      250
    );

    // 2. Compute risk envelope, margin, and zero crossings
    const riskEnvelope = calculateRiskEnvelope(payoffSeries, legs, spotPrice);

    // 3. Compute net instantaneous portfolio Greeks at current spot price
    const activeLegs = legs.filter((l) => l.isOpen);
    let totalDelta = 0;
    let totalGamma = 0;
    let totalTheta = 0;
    let totalVega = 0;
    let totalRho = 0;

    for (const leg of activeLegs) {
      const greeks = calculateLegGreeks(
        leg,
        spotPrice,
        simulationDte,
        ivShift,
        riskFreeRate,
        dividendYield
      );
      totalDelta += greeks.delta;
      totalGamma += greeks.gamma;
      totalTheta += greeks.theta;
      totalVega += greeks.vega;
      totalRho += greeks.rho;
    }

    const currentGreeks: CurrentGreeks = {
      delta: Number(totalDelta.toFixed(3)),
      gamma: Number(totalGamma.toFixed(4)),
      theta: Number(totalTheta.toFixed(2)),
      vega: Number(totalVega.toFixed(2)),
      rho: Number(totalRho.toFixed(2)),
    };

    // 4. Spot price domain bounds
    const minSpot =
      payoffSeries.length > 0
        ? payoffSeries[0].spot
        : Number((spotPrice * 0.7).toFixed(2));
    const maxSpot =
      payoffSeries.length > 0
        ? payoffSeries[payoffSeries.length - 1].spot
        : Number((spotPrice * 1.3).toFixed(2));

    return {
      payoffSeries,
      riskEnvelope,
      currentGreeks,
      spotPriceRange: [minSpot, maxSpot],
      isCalculating: false,
    };
  }, [legs, spotPrice, simulationDte, ivShift, riskFreeRate, dividendYield]);
};
