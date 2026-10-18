import React from 'react';
import { usePortfolio } from '../../../context/usePortfolio.ts';
import type { MetricType } from '../../../types/derivatives.ts';
import styles from './SimulationBar.module.scss';

interface MetricOption {
  id: MetricType;
  label: string;
  symbol: string;
}

const METRIC_OPTIONS: MetricOption[] = [
  { id: 'PL', label: 'P&L', symbol: '$' },
  { id: 'DELTA', label: 'Delta', symbol: 'Δ' },
  { id: 'GAMMA', label: 'Gamma', symbol: 'Γ' },
  { id: 'THETA', label: 'Theta', symbol: 'Θ' },
  { id: 'VEGA', label: 'Vega', symbol: 'ν' },
];

export const SimulationBar: React.FC = () => {
  const {
    state,
    setSimDte,
    setIvShift,
    setSelectedMetric,
  } = usePortfolio();

  const shockPercent = Math.round(state.ivShift * 100);
  const shockSign = shockPercent > 0 ? '+' : '';

  return (
    <div className={styles.simulationBar}>
      <div className={styles.slidersGroup}>
        {/* DTE Scrubber */}
        <div className={styles.sliderContainer}>
          <div className={styles.sliderHeader}>
            <span className={styles.sliderLabel}>Time Horizon (DTE)</span>
            <span className={styles.sliderValueBadge}>{state.simulationDte} Days</span>
          </div>
          <div className={styles.rangeWrapper}>
            <span className={styles.rangeBound}>0d</span>
            <input
              type="range"
              min="0"
              max="90"
              step="1"
              value={state.simulationDte}
              onChange={(e) => setSimDte(parseInt(e.target.value, 10))}
              className={styles.rangeInput}
              aria-label="Simulation Days to Expiration"
            />
            <span className={styles.rangeBound}>90d</span>
          </div>
        </div>

        {/* IV Shock Scrubber */}
        <div className={styles.sliderContainer}>
          <div className={styles.sliderHeader}>
            <span className={styles.sliderLabel}>IV Shock Shift</span>
            <span
              className={`${styles.sliderValueBadge} ${
                shockPercent > 0
                  ? styles.shockPositive
                  : shockPercent < 0
                  ? styles.shockNegative
                  : ''
              }`}
            >
              {shockSign}
              {shockPercent}%
            </span>
          </div>
          <div className={styles.rangeWrapper}>
            <span className={styles.rangeBound}>-50%</span>
            <input
              type="range"
              min="-0.50"
              max="0.50"
              step="0.01"
              value={state.ivShift}
              onChange={(e) => setIvShift(parseFloat(e.target.value))}
              className={styles.rangeInput}
              aria-label="Implied Volatility Shock"
            />
            <span className={styles.rangeBound}>+50%</span>
            {state.ivShift !== 0 && (
              <button
                type="button"
                className={styles.resetBtn}
                onClick={() => setIvShift(0)}
                title="Reset IV shock to 0%"
              >
                0%
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Metric Switch Tabs */}
      <div className={styles.metricsGroup}>
        <span className={styles.metricsLabel}>Analytical Surface Metric</span>
        <div className={styles.tabsList} role="tablist">
          {METRIC_OPTIONS.map((metric) => {
            const isActive = state.selectedMetric === metric.id;
            return (
              <button
                key={metric.id}
                role="tab"
                aria-selected={isActive}
                type="button"
                className={`${styles.metricTab} ${isActive ? styles.active : ''}`}
                onClick={() => setSelectedMetric(metric.id)}
              >
                <span className={styles.symbol}>{metric.symbol}</span>
                <span>{metric.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
