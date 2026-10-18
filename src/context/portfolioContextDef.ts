import { createContext } from 'react';
import type {
  MetricType,
  OptionLeg,
  PortfolioAction,
  PortfolioState,
  StrategyPreset,
} from '../types/derivatives.ts';

export interface PortfolioContextType {
  state: PortfolioState;
  dispatch: React.Dispatch<PortfolioAction>;
  setSpotPrice: (price: number) => void;
  nudgeSpot: (delta: number) => void;
  loadPreset: (preset: StrategyPreset) => void;
  addLeg: (leg: OptionLeg) => void;
  updateLeg: (leg: OptionLeg) => void;
  removeLeg: (id: string) => void;
  toggleLeg: (id: string) => void;
  setSimDte: (dte: number) => void;
  setIvShift: (shift: number) => void;
  setSelectedMetric: (metric: MetricType) => void;
  importPortfolio: (state: PortfolioState) => void;
  setTickerData: (data: {
    symbol: string;
    spotPrice: number;
    dividendYield?: number;
    historicalVol?: number;
    isLive?: boolean;
  }) => void;
  replaceAllLegs: (legs: OptionLeg[]) => void;
  // Computed helpers
  activeLegsCount: number;
  netPremiumDollars: number;
}

export const PortfolioContext = createContext<PortfolioContextType | undefined>(undefined);
