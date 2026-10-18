export type OptionType = 'CALL' | 'PUT';

export type PositionSide = 'LONG' | 'SHORT';

export type LegType = 'OPTION' | 'STOCK';

export interface OptionLeg {
  id: string;
  legType: LegType;
  type: OptionType;
  side: PositionSide;
  strike: number;
  expirationDays: number; // DTE
  contracts: number;
  premium: number;
  impliedVol: number; // e.g. 0.20 for 20%
  isOpen: boolean;
}

export type StrategyPreset =
  | 'CUSTOM'
  | 'IRON_CONDOR'
  | 'COVERED_CALL'
  | 'CASH_SECURED_PUT'
  | 'BULL_CALL_SPREAD'
  | 'COLLAR'
  | 'STRADDLE';

export type MetricType = 'PL' | 'DELTA' | 'GAMMA' | 'THETA' | 'VEGA';

export interface UnderlyingAsset {
  symbol: string;
  spotPrice: number;
  historicalVol: number;
  riskFreeRate: number;
  dividendYield: number;
  isLiveMarketData: boolean;
}

export interface PortfolioState {
  underlying: UnderlyingAsset;
  legs: OptionLeg[];
  activeStrategy: StrategyPreset;
  simulationDte: number;
  ivShift: number; // e.g., 0 for neutral, 0.05 for +5%, -0.10 for -10%
  selectedMetric: MetricType;
}

export type PortfolioAction =
  | { type: 'SET_SPOT'; payload: number }
  | { type: 'LOAD_PRESET'; payload: StrategyPreset }
  | { type: 'ADD_LEG'; payload: OptionLeg }
  | { type: 'UPDATE_LEG'; payload: OptionLeg }
  | { type: 'REMOVE_LEG'; payload: string }
  | { type: 'TOGGLE_LEG'; payload: string }
  | { type: 'SET_SIM_DTE'; payload: number }
  | { type: 'SET_IV_SHIFT'; payload: number }
  | { type: 'SET_METRIC'; payload: MetricType }
  | { type: 'IMPORT_PORTFOLIO'; payload: PortfolioState }
  | {
      type: 'SET_TICKER_DATA';
      payload: {
        symbol: string;
        spotPrice: number;
        dividendYield?: number;
        historicalVol?: number;
        isLive?: boolean;
      };
    }
  | { type: 'REPLACE_ALL_LEGS'; payload: OptionLeg[] };
