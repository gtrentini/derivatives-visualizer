import type { OptionLeg } from '../../types/derivatives.ts';

/**
 * Calculates the required collateral / margin requirement for a derivatives portfolio.
 * Accurately models FINRA / CBOE margin rules:
 * - Cash-Secured Put: strike * 100 * contracts
 * - Covered Call: spotPrice * contracts (equity purchase/carry cost)
 * - Vertical Spreads (Credit/Debit): strike width * 100 * contracts
 * - Iron Condor: max(putWingWidth, callWingWidth) * 100 * contracts
 * - Straddle / Strangle / Naked Option: Standard Reg-T margin requirement
 */
export const calculateMarginRequirement = (
  legs: OptionLeg[],
  spotPrice: number
): number => {
  const activeLegs = legs.filter((l) => l.isOpen);
  if (activeLegs.length === 0) return 0;

  const stockLegs = activeLegs.filter((l) => l.legType === 'STOCK');
  const optionLegs = activeLegs.filter((l) => l.legType === 'OPTION');

  const puts = optionLegs.filter((l) => l.type === 'PUT');
  const calls = optionLegs.filter((l) => l.type === 'CALL');

  const longPuts = puts.filter((l) => l.side === 'LONG');
  const shortPuts = puts.filter((l) => l.side === 'SHORT');
  const longCalls = calls.filter((l) => l.side === 'LONG');
  const shortCalls = calls.filter((l) => l.side === 'SHORT');

  // Case 1: Iron Condor
  // 1 Long Put, 1 Short Put, 1 Short Call, 1 Long Call, no stock
  if (
    stockLegs.length === 0 &&
    longPuts.length === 1 &&
    shortPuts.length === 1 &&
    shortCalls.length === 1 &&
    longCalls.length === 1
  ) {
    const putWingWidth = Math.abs(shortPuts[0].strike - longPuts[0].strike);
    const callWingWidth = Math.abs(longCalls[0].strike - shortCalls[0].strike);
    const contracts = Math.min(
      shortPuts[0].contracts,
      longPuts[0].contracts,
      shortCalls[0].contracts,
      longCalls[0].contracts
    );
    return Math.max(putWingWidth, callWingWidth) * 100 * contracts;
  }

  // Case 2: Covered Call
  // 1 Long Stock (>= 100 shares) + Short Calls covered by stock
  if (
    stockLegs.length === 1 &&
    stockLegs[0].side === 'LONG' &&
    shortCalls.length > 0 &&
    shortPuts.length === 0 &&
    longCalls.length === 0 &&
    longPuts.length === 0
  ) {
    // Equity purchase cost (spotPrice * shares)
    return spotPrice * stockLegs[0].contracts;
  }

  // Case 3: Collar
  // 1 Long Stock + 1 Long Put + 1 Short Call
  if (
    stockLegs.length === 1 &&
    stockLegs[0].side === 'LONG' &&
    longPuts.length === 1 &&
    shortCalls.length === 1
  ) {
    return spotPrice * stockLegs[0].contracts;
  }

  // Case 4: Cash-Secured Put
  // 1 Short Put, no stock, no other options
  if (
    stockLegs.length === 0 &&
    shortPuts.length === 1 &&
    longPuts.length === 0 &&
    shortCalls.length === 0 &&
    longCalls.length === 0
  ) {
    return shortPuts[0].strike * 100 * shortPuts[0].contracts;
  }

  // Case 5: Vertical Spreads (Call Spread or Put Spread)
  // 2 options: 1 Long, 1 Short of same option type
  if (stockLegs.length === 0 && optionLegs.length === 2) {
    if (calls.length === 2 && longCalls.length === 1 && shortCalls.length === 1) {
      const strikeWidth = Math.abs(longCalls[0].strike - shortCalls[0].strike);
      const contracts = Math.min(longCalls[0].contracts, shortCalls[0].contracts);
      return strikeWidth * 100 * contracts;
    }
    if (puts.length === 2 && longPuts.length === 1 && shortPuts.length === 1) {
      const strikeWidth = Math.abs(longPuts[0].strike - shortPuts[0].strike);
      const contracts = Math.min(longPuts[0].contracts, shortPuts[0].contracts);
      return strikeWidth * 100 * contracts;
    }
  }

  // Case 6: Fallback Reg-T margin aggregation for multi-leg / arbitrary positions
  let totalMargin = 0;

  // Stock positions
  for (const s of stockLegs) {
    if (s.side === 'LONG') {
      totalMargin += spotPrice * s.contracts;
    } else {
      // Short stock Reg-T: 150% of short market value (or 100% + 50%)
      totalMargin += spotPrice * s.contracts * 1.5;
    }
  }

  // For long options: capital outlay is 100% of premium
  // For naked short options: FINRA standard 20% rule
  for (const opt of optionLegs) {
    const contracts = opt.contracts;
    const premium = opt.premium;

    if (opt.side === 'LONG') {
      totalMargin += premium * 100 * contracts;
    } else {
      // Short option naked margin requirement
      if (opt.type === 'CALL') {
        const otmAmount = Math.max(0, opt.strike - spotPrice);
        const formula1 = 0.2 * spotPrice - otmAmount + premium;
        const formula2 = 0.1 * spotPrice + premium;
        totalMargin += Math.max(formula1, formula2) * 100 * contracts;
      } else {
        // Short PUT
        const otmAmount = Math.max(0, spotPrice - opt.strike);
        const formula1 = 0.2 * spotPrice - otmAmount + premium;
        const formula2 = 0.1 * opt.strike + premium;
        totalMargin += Math.max(formula1, formula2) * 100 * contracts;
      }
    }
  }

  return Math.round(totalMargin);
};
