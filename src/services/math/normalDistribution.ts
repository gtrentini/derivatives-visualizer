/**
 * Standard Normal Distribution functions.
 * Implements high-precision Abramowitz & Stegun (7.1.26 / 26.2.17) approximation.
 * Error |epsilon(x)| < 7.5e-8 across the entire domain.
 */

const INV_SQRT_2PI = 1 / Math.sqrt(2 * Math.PI); // ~0.3989422804014327

const P = 0.2316419;
const B1 = 0.31938153;
const B2 = -0.356563782;
const B3 = 1.781477937;
const B4 = -1.821255978;
const B5 = 1.330274429;

/**
 * Standard normal probability density function (PDF).
 * pdf(x) = (1 / sqrt(2*PI)) * exp(-0.5 * x^2)
 */
export const pdf = (x: number): number => {
  return INV_SQRT_2PI * Math.exp(-0.5 * x * x);
};

/**
 * Cumulative normal distribution function (CDF) Phi(x).
 * Uses Abramowitz & Stegun polynomial approximation.
 */
export const cdf = (x: number): number => {
  if (x === 0) return 0.5;

  const absX = Math.abs(x);
  const t = 1 / (1 + P * absX);
  const poly = ((((B5 * t + B4) * t + B3) * t + B2) * t + B1) * t;
  const z = pdf(absX);
  const prob = 1 - z * poly;

  return x > 0 ? prob : 1 - prob;
};
