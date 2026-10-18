import React, { useState, useMemo } from 'react';
import { LineChart, Box, Table2, Crosshair } from 'lucide-react';
import { usePortfolio } from '../../context/usePortfolio.ts';
import { PayoffChart2D } from './PayoffChart2D/PayoffChart2D.tsx';
import { SurfaceChart3D } from './SurfaceChart3D/SurfaceChart3D.tsx';
import { AnalyticsStage } from './AnalyticsStage.tsx';
import styles from './VisualizerContainer.module.scss';

type VisualizerViewMode = 'CHART_2D' | 'SURFACE_3D' | 'ANALYTICS';

export const VisualizerContainer: React.FC = () => {
  const [viewMode, setViewMode] = useState<VisualizerViewMode>('CHART_2D');
  const { state, setSpotPrice } = usePortfolio();

  const { spotPrice } = state.underlying;
  const { legs, simulationDte, ivShift, selectedMetric } = state;

  // Calculate standard deviation probability ranges
  const probabilityStats = useMemo(() => {
    const activeOpts = legs.filter((l) => l.isOpen && l.legType === 'OPTION');
    const avgIv =
      activeOpts.length > 0
        ? activeOpts.reduce((sum, l) => sum + l.impliedVol, 0) / activeOpts.length
        : state.underlying.historicalVol;

    const effectiveVol = Math.max(0.02, avgIv + ivShift);
    const timeYears = Math.max(0, simulationDte) / 365;
    const sigmaDollars = spotPrice * effectiveVol * Math.sqrt(timeYears);

    return {
      oneSigmaRange: `$${(spotPrice - sigmaDollars).toFixed(1)} – $${(
        spotPrice + sigmaDollars
      ).toFixed(1)}`,
      twoSigmaRange: `$${(spotPrice - 2 * sigmaDollars).toFixed(1)} – $${(
        spotPrice + 2 * sigmaDollars
      ).toFixed(1)}`,
    };
  }, [legs, state.underlying.historicalVol, ivShift, simulationDte, spotPrice]);

  const metricLabel = {
    PL: 'P&L ($)',
    DELTA: 'Delta (Δ)',
    GAMMA: 'Gamma (Γ)',
    THETA: 'Theta (Θ)',
    VEGA: 'Vega (ν)',
  }[selectedMetric];

  const handleCenterOnSpot = () => {
    // Re-center spot to nearest round dollar
    setSpotPrice(Math.round(spotPrice));
  };

  return (
    <div className={styles.container}>
      {/* Top Controls Toolbar */}
      <div className={styles.topBar}>
        <div className={styles.leftControls}>
          {/* View Switcher Segmented Control: 3 Modes */}
          <div className={styles.segmentedViewSwitch}>
            <button
              type="button"
              className={`${styles.switchBtn} ${
                viewMode === 'CHART_2D' ? styles.active : ''
              }`}
              onClick={() => setViewMode('CHART_2D')}
            >
              <LineChart size={16} />
              <span>2D Payoff Chart</span>
            </button>
            <button
              type="button"
              className={`${styles.switchBtn} ${
                viewMode === 'SURFACE_3D' ? styles.active : ''
              }`}
              onClick={() => setViewMode('SURFACE_3D')}
            >
              <Box size={16} />
              <span>3D Greeks Surface</span>
            </button>
            <button
              type="button"
              className={`${styles.switchBtn} ${
                viewMode === 'ANALYTICS' ? styles.active : ''
              }`}
              onClick={() => setViewMode('ANALYTICS')}
            >
              <Table2 size={16} />
              <span>Analytics Matrix</span>
            </button>
          </div>

          {/* Probability Standard Deviation Pills */}
          <div className={styles.probabilityGroup}>
            <div className={styles.probPill}>
              <span className={styles.probLabel}>±1σ (68%):</span>
              <span className={styles.probValue}>
                {probabilityStats.oneSigmaRange}
              </span>
            </div>
            <div className={styles.probPill}>
              <span className={styles.probLabel}>±2σ (95%):</span>
              <span className={styles.probValue}>
                {probabilityStats.twoSigmaRange}
              </span>
            </div>
          </div>
        </div>

        <div className={styles.rightControls}>
          {/* Active Metric Badge */}
          <div className={styles.metricBadge}>
            <span className={styles.metricLabel}>SURFACE:</span>
            <span className={styles.metricName}>{metricLabel}</span>
          </div>

          {/* Center on Spot button */}
          <button
            type="button"
            className={styles.centerSpotBtn}
            onClick={handleCenterOnSpot}
            title="Snap spot price to round dollar"
          >
            <Crosshair size={15} />
            <span>Center S₀</span>
          </button>
        </div>
      </div>

      {/* Main Body View */}
      <div className={styles.bodyArea}>
        {viewMode === 'CHART_2D' && <PayoffChart2D />}
        {viewMode === 'SURFACE_3D' && <SurfaceChart3D />}
        {viewMode === 'ANALYTICS' && <AnalyticsStage />}
      </div>
    </div>
  );
};
