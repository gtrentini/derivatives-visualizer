import React, { useReducer, useMemo, useCallback } from 'react';
import { initialPortfolioState, portfolioReducer } from './portfolioReducer.ts';
import { PortfolioContext } from './portfolioContextDef.ts';
import type {
  MetricType,
  OptionLeg,
  PortfolioState,
  StrategyPreset,
} from '../types/derivatives.ts';

export const PortfolioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(portfolioReducer, initialPortfolioState);

  const setSpotPrice = useCallback((price: number) => {
    dispatch({ type: 'SET_SPOT', payload: price });
  }, []);

  const nudgeSpot = useCallback((delta: number) => {
    dispatch({ type: 'SET_SPOT', payload: state.underlying.spotPrice + delta });
  }, [state.underlying.spotPrice]);

  const loadPreset = useCallback((preset: StrategyPreset) => {
    dispatch({ type: 'LOAD_PRESET', payload: preset });
  }, []);

  const addLeg = useCallback((leg: OptionLeg) => {
    dispatch({ type: 'ADD_LEG', payload: leg });
  }, []);

  const updateLeg = useCallback((leg: OptionLeg) => {
    dispatch({ type: 'UPDATE_LEG', payload: leg });
  }, []);

  const removeLeg = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_LEG', payload: id });
  }, []);

  const toggleLeg = useCallback((id: string) => {
    dispatch({ type: 'TOGGLE_LEG', payload: id });
  }, []);

  const setSimDte = useCallback((dte: number) => {
    dispatch({ type: 'SET_SIM_DTE', payload: dte });
  }, []);

  const setIvShift = useCallback((shift: number) => {
    dispatch({ type: 'SET_IV_SHIFT', payload: shift });
  }, []);

  const setSelectedMetric = useCallback((metric: MetricType) => {
    dispatch({ type: 'SET_METRIC', payload: metric });
  }, []);

  const importPortfolio = useCallback((importedState: PortfolioState) => {
    dispatch({ type: 'IMPORT_PORTFOLIO', payload: importedState });
  }, []);

  const setTickerData = useCallback(
    (data: {
      symbol: string;
      spotPrice: number;
      dividendYield?: number;
      historicalVol?: number;
      isLive?: boolean;
    }) => {
      dispatch({ type: 'SET_TICKER_DATA', payload: data });
    },
    []
  );

  const replaceAllLegs = useCallback((legs: OptionLeg[]) => {
    dispatch({ type: 'REPLACE_ALL_LEGS', payload: legs });
  }, []);

  const { activeLegsCount, netPremiumDollars } = useMemo(() => {
    let activeCount = 0;
    let net = 0;

    for (const leg of state.legs) {
      if (!leg.isOpen) continue;
      activeCount++;

      if (leg.legType === 'OPTION') {
        const sign = leg.side === 'SHORT' ? 1 : -1;
        net += sign * leg.premium * 100 * leg.contracts;
      } else {
        // STOCK
        const sign = leg.side === 'LONG' ? -1 : 1;
        net += sign * leg.strike * leg.contracts;
      }
    }

    return {
      activeLegsCount: activeCount,
      netPremiumDollars: net,
    };
  }, [state.legs]);

  const value = useMemo(
    () => ({
      state,
      dispatch,
      setSpotPrice,
      nudgeSpot,
      loadPreset,
      addLeg,
      updateLeg,
      removeLeg,
      toggleLeg,
      setSimDte,
      setIvShift,
      setSelectedMetric,
      importPortfolio,
      setTickerData,
      replaceAllLegs,
      activeLegsCount,
      netPremiumDollars,
    }),
    [
      state,
      nudgeSpot,
      setSpotPrice,
      loadPreset,
      addLeg,
      updateLeg,
      removeLeg,
      toggleLeg,
      setSimDte,
      setIvShift,
      setSelectedMetric,
      importPortfolio,
      setTickerData,
      replaceAllLegs,
      activeLegsCount,
      netPremiumDollars,
    ]
  );

  return <PortfolioContext.Provider value={value}>{children}</PortfolioContext.Provider>;
};
