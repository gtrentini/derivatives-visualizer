import { cdf } from './normalDistribution.ts';
import type { OptionLeg, OptionType } from '../../types/derivatives.ts';

export interface AssignmentRiskReport {
  legId: string;
  symbol: string;
  type: OptionType;
  strike: number;
  dte: number;
  itmProbability: number; // 0 to 1
  extrinsicValue: number;
  riskLevel: 'CRITICAL' | 'ELEVATED' | 'MODERATE' | 'LOW';
  recommendations: string;
}

/**
 * Audits portfolio legs for short option assignment risk.
 * Calculates risk-neutral ITM probability via Black-Scholes d2,
 * extrinsic time value decay buffer, and generates institutional defense protocols.
 */
export const evaluateAssignmentRisk = (
  legs: OptionLeg[],
  spot: number,
  r: number,
  q: number,
  symbol: string = 'SPY'
): AssignmentRiskReport[] => {
  const shortOptions = legs.filter(
    (l) => l.isOpen && l.side === 'SHORT' && l.legType === 'OPTION'
  );

  return shortOptions.map((leg) => {
    const isCall = leg.type === 'CALL';
    const strike = leg.strike;
    const dte = Math.max(0, leg.expirationDays);
    const timeYears = dte / 365;
    const sigma = Math.max(0.01, leg.impliedVol);

    // 1. Calculate Intrinsic Value
    const intrinsic = isCall ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
    const extrinsic = Math.max(0, leg.premium - intrinsic);

    // 2. Risk-Neutral ITM Probability via Black-Scholes d2
    let itmProbability: number;

    if (dte <= 0.0001 || sigma <= 0.0001) {
      if (isCall) {
        itmProbability = spot > strike ? 1 : spot === strike ? 0.5 : 0;
      } else {
        itmProbability = spot < strike ? 1 : spot === strike ? 0.5 : 0;
      }
    } else {
      const sqrtT = Math.sqrt(timeYears);
      const d1 =
        (Math.log(spot / strike) + (r - q + 0.5 * sigma * sigma) * timeYears) /
        (sigma * sqrtT);
      const d2 = d1 - sigma * sqrtT;

      itmProbability = isCall ? cdf(d2) : cdf(-d2);
    }

    // 3. Classify Risk Level
    let riskLevel: 'CRITICAL' | 'ELEVATED' | 'MODERATE' | 'LOW';
    let recommendations: string;

    if (dte <= 5 && itmProbability >= 0.5) {
      riskLevel = 'CRITICAL';
      if (isCall && q > 0 && extrinsic < 0.25) {
        recommendations =
          'Imminent dividend capture risk! Extrinsic buffer < dividend yield. Roll out and up or buy to close immediately.';
      } else {
        recommendations =
          'Critical threat of early exercise! Option is ITM within 5 DTE. Roll out to next cycle or close leg.';
      }
    } else if (dte <= 14 && itmProbability >= 0.4) {
      riskLevel = 'ELEVATED';
      recommendations =
        'Elevated assignment risk. Delta is deep in the money with diminishing time premium. Prepare rolling defense for credit.';
    } else if (itmProbability >= 0.45 || (dte <= 7 && itmProbability >= 0.25)) {
      riskLevel = 'MODERATE';
      recommendations =
        'Near the money with moderate gamma exposure. Monitor underlying spot closely around strike price.';
    } else {
      riskLevel = 'LOW';
      recommendations =
        'OTM buffer is safe. Extrinsic time decay theta is working in your favor with low assignment risk.';
    }

    return {
      legId: leg.id,
      symbol,
      type: leg.type,
      strike: Number(strike.toFixed(2)),
      dte,
      itmProbability: Number(itmProbability.toFixed(3)),
      extrinsicValue: Number(extrinsic.toFixed(2)),
      riskLevel,
      recommendations,
    };
  });
};
