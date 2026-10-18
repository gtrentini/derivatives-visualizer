import type { PortfolioAction, PortfolioState } from '../types/derivatives.ts';
import { createPresetLegs } from '../utils/presets.ts';

export const initialPortfolioState: PortfolioState = {
  underlying: {
    symbol: 'SPY',
    spotPrice: 500.0,
    historicalVol: 0.16,
    riskFreeRate: 0.045,
    dividendYield: 0.013,
    isLiveMarketData: false,
  },
  legs: createPresetLegs('IRON_CONDOR', 500.0),
  activeStrategy: 'IRON_CONDOR',
  simulationDte: 30,
  ivShift: 0,
  selectedMetric: 'PL',
};

export const portfolioReducer = (
  state: PortfolioState,
  action: PortfolioAction
): PortfolioState => {
  switch (action.type) {
    case 'SET_SPOT': {
      const newSpot = Math.max(1, Number(action.payload));
      return {
        ...state,
        underlying: {
          ...state.underlying,
          spotPrice: Number(newSpot.toFixed(2)),
        },
      };
    }

    case 'LOAD_PRESET': {
      const preset = action.payload;
      const legs = createPresetLegs(preset, state.underlying.spotPrice);
      // Auto-tune simulation DTE based on legs' max DTE if available
      const maxDte = legs.length > 0 ? Math.max(...legs.map((l) => l.expirationDays)) : 30;
      return {
        ...state,
        activeStrategy: preset,
        legs,
        simulationDte: maxDte > 0 ? maxDte : 30,
      };
    }

    case 'ADD_LEG': {
      return {
        ...state,
        activeStrategy: 'CUSTOM',
        legs: [...state.legs, action.payload],
      };
    }

    case 'UPDATE_LEG': {
      return {
        ...state,
        activeStrategy: 'CUSTOM',
        legs: state.legs.map((leg) =>
          leg.id === action.payload.id ? action.payload : leg
        ),
      };
    }

    case 'REMOVE_LEG': {
      return {
        ...state,
        activeStrategy: 'CUSTOM',
        legs: state.legs.filter((leg) => leg.id !== action.payload),
      };
    }

    case 'TOGGLE_LEG': {
      return {
        ...state,
        legs: state.legs.map((leg) =>
          leg.id === action.payload ? { ...leg, isOpen: !leg.isOpen } : leg
        ),
      };
    }

    case 'SET_SIM_DTE': {
      return {
        ...state,
        simulationDte: Math.max(0, action.payload),
      };
    }

    case 'SET_IV_SHIFT': {
      return {
        ...state,
        ivShift: action.payload,
      };
    }

    case 'SET_METRIC': {
      return {
        ...state,
        selectedMetric: action.payload,
      };
    }

    case 'IMPORT_PORTFOLIO': {
      return {
        ...action.payload,
      };
    }

    case 'SET_TICKER_DATA': {
      const { symbol, spotPrice, dividendYield, historicalVol, isLive } = action.payload;
      const cleanSpot = Math.max(1, Number(spotPrice.toFixed(2)));
      const updatedUnderlying = {
        ...state.underlying,
        symbol: symbol.toUpperCase(),
        spotPrice: cleanSpot,
        dividendYield:
          typeof dividendYield === 'number'
            ? dividendYield
            : state.underlying.dividendYield,
        historicalVol:
          typeof historicalVol === 'number'
            ? historicalVol
            : state.underlying.historicalVol,
        isLiveMarketData: isLive ?? false,
      };

      // If active strategy is a preset, regenerate preset legs around new spot
      if (state.activeStrategy !== 'CUSTOM') {
        const regeneratedLegs = createPresetLegs(state.activeStrategy, cleanSpot);
        const maxDte =
          regeneratedLegs.length > 0
            ? Math.max(...regeneratedLegs.map((l) => l.expirationDays))
            : state.simulationDte;
        return {
          ...state,
          underlying: updatedUnderlying,
          legs: regeneratedLegs,
          simulationDte: maxDte > 0 ? maxDte : state.simulationDte,
        };
      }

      return {
        ...state,
        underlying: updatedUnderlying,
      };
    }

    case 'REPLACE_ALL_LEGS': {
      const newLegs = action.payload;
      const maxDte =
        newLegs.length > 0
          ? Math.max(...newLegs.map((l) => l.expirationDays))
          : state.simulationDte;
      return {
        ...state,
        activeStrategy: 'CUSTOM',
        legs: newLegs,
        simulationDte: maxDte > 0 ? maxDte : state.simulationDte,
      };
    }

    default:
      return state;
  }
};
