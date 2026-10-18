import type { OptionLeg, StrategyPreset } from '../types/derivatives.ts';

const generateId = (prefix: string = 'leg'): string => {
  return `${prefix}-${Math.random().toString(36).substring(2, 9)}`;
};

export const createIronCondor = (spot: number = 500): OptionLeg[] => {
  const round = Math.round(spot);
  const scale = spot / 500;
  const wing = Math.max(1, Math.round(spot * 0.05));
  const body = Math.max(1, Math.round(spot * 0.03));
  return [
    {
      id: generateId('ic-p-long'),
      legType: 'OPTION',
      type: 'PUT',
      side: 'LONG',
      strike: round - wing,
      expirationDays: 30,
      contracts: 1,
      premium: Number((2.2 * scale).toFixed(2)),
      impliedVol: 0.24,
      isOpen: true,
    },
    {
      id: generateId('ic-p-short'),
      legType: 'OPTION',
      type: 'PUT',
      side: 'SHORT',
      strike: round - body,
      expirationDays: 30,
      contracts: 1,
      premium: Number((4.5 * scale).toFixed(2)),
      impliedVol: 0.22,
      isOpen: true,
    },
    {
      id: generateId('ic-c-short'),
      legType: 'OPTION',
      type: 'CALL',
      side: 'SHORT',
      strike: round + body,
      expirationDays: 30,
      contracts: 1,
      premium: Number((4.2 * scale).toFixed(2)),
      impliedVol: 0.19,
      isOpen: true,
    },
    {
      id: generateId('ic-c-long'),
      legType: 'OPTION',
      type: 'CALL',
      side: 'LONG',
      strike: round + wing,
      expirationDays: 30,
      contracts: 1,
      premium: Number((1.9 * scale).toFixed(2)),
      impliedVol: 0.2,
      isOpen: true,
    },
  ];
};

export const createCoveredCall = (spot: number = 500): OptionLeg[] => {
  const round = Math.round(spot);
  const scale = spot / 500;
  const otm = Math.max(1, Math.round(spot * 0.03));
  return [
    {
      id: generateId('cc-stock'),
      legType: 'STOCK',
      type: 'CALL',
      side: 'LONG',
      strike: round,
      expirationDays: 0,
      contracts: 100,
      premium: round,
      impliedVol: 0,
      isOpen: true,
    },
    {
      id: generateId('cc-call'),
      legType: 'OPTION',
      type: 'CALL',
      side: 'SHORT',
      strike: round + otm,
      expirationDays: 30,
      contracts: 1,
      premium: Number((4.2 * scale).toFixed(2)),
      impliedVol: 0.19,
      isOpen: true,
    },
  ];
};

export const createCashSecuredPut = (spot: number = 500): OptionLeg[] => {
  const round = Math.round(spot);
  const scale = spot / 500;
  const otm = Math.max(1, Math.round(spot * 0.02));
  return [
    {
      id: generateId('csp-put'),
      legType: 'OPTION',
      type: 'PUT',
      side: 'SHORT',
      strike: round - otm,
      expirationDays: 30,
      contracts: 1,
      premium: Number((5.2 * scale).toFixed(2)),
      impliedVol: 0.21,
      isOpen: true,
    },
  ];
};

export const createBullCallSpread = (spot: number = 500): OptionLeg[] => {
  const round = Math.round(spot);
  const scale = spot / 500;
  const itm = Math.max(1, Math.round(spot * 0.01));
  const otm = Math.max(1, Math.round(spot * 0.03));
  return [
    {
      id: generateId('bcs-long'),
      legType: 'OPTION',
      type: 'CALL',
      side: 'LONG',
      strike: round - itm,
      expirationDays: 30,
      contracts: 1,
      premium: Number((12.8 * scale).toFixed(2)),
      impliedVol: 0.19,
      isOpen: true,
    },
    {
      id: generateId('bcs-short'),
      legType: 'OPTION',
      type: 'CALL',
      side: 'SHORT',
      strike: round + otm,
      expirationDays: 30,
      contracts: 1,
      premium: Number((4.2 * scale).toFixed(2)),
      impliedVol: 0.19,
      isOpen: true,
    },
  ];
};

export const createCollar = (spot: number = 500): OptionLeg[] => {
  const round = Math.round(spot);
  const scale = spot / 500;
  const width = Math.max(1, Math.round(spot * 0.04));
  return [
    {
      id: generateId('col-stock'),
      legType: 'STOCK',
      type: 'CALL',
      side: 'LONG',
      strike: round,
      expirationDays: 0,
      contracts: 100,
      premium: round,
      impliedVol: 0,
      isOpen: true,
    },
    {
      id: generateId('col-put'),
      legType: 'OPTION',
      type: 'PUT',
      side: 'LONG',
      strike: round - width,
      expirationDays: 45,
      contracts: 1,
      premium: Number((4.1 * scale).toFixed(2)),
      impliedVol: 0.23,
      isOpen: true,
    },
    {
      id: generateId('col-call'),
      legType: 'OPTION',
      type: 'CALL',
      side: 'SHORT',
      strike: round + width,
      expirationDays: 45,
      contracts: 1,
      premium: Number((3.8 * scale).toFixed(2)),
      impliedVol: 0.18,
      isOpen: true,
    },
  ];
};

export const createStraddle = (spot: number = 500): OptionLeg[] => {
  const round = Math.round(spot);
  const scale = spot / 500;
  return [
    {
      id: generateId('str-call'),
      legType: 'OPTION',
      type: 'CALL',
      side: 'LONG',
      strike: round,
      expirationDays: 30,
      contracts: 1,
      premium: Number((10.5 * scale).toFixed(2)),
      impliedVol: 0.2,
      isOpen: true,
    },
    {
      id: generateId('str-put'),
      legType: 'OPTION',
      type: 'PUT',
      side: 'LONG',
      strike: round,
      expirationDays: 30,
      contracts: 1,
      premium: Number((9.8 * scale).toFixed(2)),
      impliedVol: 0.2,
      isOpen: true,
    },
  ];
};

export const createPresetLegs = (preset: StrategyPreset, spot: number = 500): OptionLeg[] => {
  switch (preset) {
    case 'IRON_CONDOR':
      return createIronCondor(spot);
    case 'COVERED_CALL':
      return createCoveredCall(spot);
    case 'CASH_SECURED_PUT':
      return createCashSecuredPut(spot);
    case 'BULL_CALL_SPREAD':
      return createBullCallSpread(spot);
    case 'COLLAR':
      return createCollar(spot);
    case 'STRADDLE':
      return createStraddle(spot);
    case 'CUSTOM':
    default:
      return [];
  }
};

export interface StrategyInfo {
  id: StrategyPreset;
  label: string;
  description: string;
  sentiment: 'Neutral' | 'Bullish' | 'Bearish' | 'High Volatility';
}

export const STRATEGY_PRESETS: StrategyInfo[] = [
  {
    id: 'IRON_CONDOR',
    label: 'Iron Condor',
    description: '4-leg range-bound defined-risk strategy profiting from low volatility.',
    sentiment: 'Neutral',
  },
  {
    id: 'COVERED_CALL',
    label: 'Covered Call',
    description: 'Long 100 shares overlaid with an out-of-the-money short call.',
    sentiment: 'Bullish',
  },
  {
    id: 'CASH_SECURED_PUT',
    label: 'Cash-Secured Put',
    description: 'Short put backed by capital to acquire shares at strike price.',
    sentiment: 'Bullish',
  },
  {
    id: 'BULL_CALL_SPREAD',
    label: 'Bull Call Spread',
    description: 'Vertical debit call spread targeting moderate upside movement.',
    sentiment: 'Bullish',
  },
  {
    id: 'COLLAR',
    label: 'Collar',
    description: 'Long stock protected by long put and financed by short call.',
    sentiment: 'Neutral',
  },
  {
    id: 'STRADDLE',
    label: 'Straddle',
    description: 'Simultaneous long call & put targeting explosive price breakout.',
    sentiment: 'High Volatility',
  },
];
