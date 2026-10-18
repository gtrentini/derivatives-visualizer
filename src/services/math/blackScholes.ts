import { cdf, pdf } from './normalDistribution.ts';
import type { OptionLeg, OptionType } from '../../types/derivatives.ts';

export interface GreeksResult {
  price: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
}

/**
 * Calculates European option price and analytical Greeks under the Black-Scholes-Merton model
 * with continuous dividend yield q.
 *
 * @param spot Current underlying price S
 * @param strike Strike price K
 * @param timeToExpiryYears Time to expiration in years T (e.g. DTE / 365)
 * @param volatility Annualized volatility sigma (e.g. 0.20 for 20%)
 * @param riskFreeRate Annualized continuously compounded risk-free rate r
 * @param dividendYield Annualized continuous dividend yield q
 * @param type 'CALL' | 'PUT'
 */
export const calculateBlackScholes = (
  spot: number,
  strike: number,
  timeToExpiryYears: number,
  volatility: number,
  riskFreeRate: number,
  dividendYield: number,
  type: OptionType
): GreeksResult => {
  const isCall = type === 'CALL';

  // Boundary condition: Expired or zero volatility -> Intrinsic value & zero time-decay Greeks
  if (timeToExpiryYears <= 0.0001 || volatility <= 0.0001) {
    const intrinsic = isCall ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
    const delta = isCall
      ? spot > strike
        ? 1
        : spot === strike
        ? 0.5
        : 0
      : spot < strike
      ? -1
      : spot === strike
      ? -0.5
      : 0;

    return {
      price: intrinsic,
      delta,
      gamma: 0,
      theta: 0,
      vega: 0,
      rho: 0,
    };
  }

  const S = Math.max(0.0001, spot);
  const K = Math.max(0.0001, strike);
  const T = Math.max(0.0001, timeToExpiryYears);
  const sigma = Math.max(0.0001, volatility);
  const r = riskFreeRate;
  const q = dividendYield;

  const sqrtT = Math.sqrt(T);
  const sigmaSqrtT = sigma * sqrtT;

  const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / sigmaSqrtT;
  const d2 = d1 - sigmaSqrtT;

  const expNegativeQT = Math.exp(-q * T);
  const expNegativeRT = Math.exp(-r * T);

  const Nd1 = cdf(d1);
  const Nd2 = cdf(d2);
  const NNegD1 = cdf(-d1);
  const NNegD2 = cdf(-d2);
  const pdfD1 = pdf(d1);

  // Price
  const rawPrice = isCall
    ? S * expNegativeQT * Nd1 - K * expNegativeRT * Nd2
    : K * expNegativeRT * NNegD2 - S * expNegativeQT * NNegD1;
  const price = Math.max(0, rawPrice);

  // Delta: dPrice / dS
  const delta = isCall ? expNegativeQT * Nd1 : -expNegativeQT * NNegD1;

  // Gamma: d^2Price / dS^2 (same for Call and Put)
  const gamma = (expNegativeQT * pdfD1) / (S * sigmaSqrtT);

  // Vega: dPrice / dSigma (scaled per 1% vol shift: multiply by 0.01)
  const rawVega = S * expNegativeQT * sqrtT * pdfD1;
  const vega = rawVega * 0.01;

  // Theta: -dPrice / dT (scaled per calendar day: divide by 365)
  const commonTheta = -(S * expNegativeQT * pdfD1 * sigma) / (2 * sqrtT);
  const rawTheta = isCall
    ? commonTheta - r * K * expNegativeRT * Nd2 + q * S * expNegativeQT * Nd1
    : commonTheta + r * K * expNegativeRT * NNegD2 - q * S * expNegativeQT * NNegD1;
  const theta = rawTheta / 365;

  // Rho: dPrice / dr (scaled per 1% interest rate shift: multiply by 0.01)
  const rawRho = isCall
    ? K * T * expNegativeRT * Nd2
    : -K * T * expNegativeRT * NNegD2;
  const rho = rawRho * 0.01;

  return {
    price,
    delta,
    gamma,
    theta,
    vega,
    rho,
  };
};

/**
 * Calculates net Greeks for an individual portfolio leg (Option or Stock).
 * Scales Greeks by contracts * 100 * (side === 'LONG' ? 1 : -1) for options,
 * and by contracts * (side === 'LONG' ? 1 : -1) for stock equity.
 */
export const calculateLegGreeks = (
  leg: OptionLeg,
  spot: number,
  simDte: number,
  ivShift: number,
  r: number,
  q: number
): GreeksResult => {
  const isLong = leg.side === 'LONG';
  const sign = isLong ? 1 : -1;

  if (leg.legType === 'STOCK') {
    // Stock shares: 1 share has delta = 1, gamma = 0, theta = 0, vega = 0, rho = 0
    const shares = leg.contracts;
    return {
      price: spot,
      delta: shares * sign,
      gamma: 0,
      theta: 0,
      vega: 0,
      rho: 0,
    };
  }

  // OPTION leg
  const shockedIv = Math.max(0.01, leg.impliedVol + ivShift);
  const effectiveDte = Math.max(0, simDte);
  const timeYears = effectiveDte / 365;

  const unitGreeks = calculateBlackScholes(
    spot,
    leg.strike,
    timeYears,
    shockedIv,
    r,
    q,
    leg.type
  );

  const positionMultiplier = leg.contracts * 100 * sign;

  return {
    price: unitGreeks.price,
    delta: unitGreeks.delta * positionMultiplier,
    gamma: unitGreeks.gamma * positionMultiplier,
    theta: unitGreeks.theta * positionMultiplier,
    vega: unitGreeks.vega * positionMultiplier,
    rho: unitGreeks.rho * positionMultiplier,
  };
};
