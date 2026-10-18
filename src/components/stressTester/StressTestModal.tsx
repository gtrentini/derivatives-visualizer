import React, { useState, useEffect, useMemo } from 'react';
import { Flame, X } from 'lucide-react';
import { Portal } from '../common/Portal/Portal.tsx';
import { usePortfolio } from '../../context/usePortfolio.ts';
import { usePortfolioAnalytics } from '../../hooks/usePortfolioAnalytics.ts';
import {
  generateStressMatrix,
  calculateBetaWeightedDelta,
  type StressMatrixCell,
} from '../../services/math/stressTester.ts';
import styles from './StressTestModal.module.scss';

interface StressTestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const StressTestModal: React.FC<StressTestModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { state } = usePortfolio();
  const { currentGreeks } = usePortfolioAnalytics();

  const [beta, setBeta] = useState<number>(1.0);
  const [benchmarkPrice, setBenchmarkPrice] = useState<number>(500);
  const [hoveredCell, setHoveredCell] = useState<StressMatrixCell | null>(null);

  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const { spotPrice, riskFreeRate, dividendYield } = state.underlying;
  const { legs, simulationDte } = state;

  // Generate multi-scenario stress matrix
  const matrix = useMemo(() => {
    if (!isOpen) return [];
    return generateStressMatrix(legs, spotPrice, simulationDte, riskFreeRate, dividendYield);
  }, [isOpen, legs, spotPrice, simulationDte, riskFreeRate, dividendYield]);

  // Compute Beta-Weighted Delta
  const betaWeightedDelta = useMemo(() => {
    return calculateBetaWeightedDelta(currentGreeks.delta, spotPrice, beta, benchmarkPrice);
  }, [currentGreeks.delta, spotPrice, beta, benchmarkPrice]);

  // Compute Value at Risk (Worst-case stress loss in matrix)
  const worstCaseLoss = useMemo(() => {
    let minLoss = 0;
    for (const row of matrix) {
      for (const cell of row) {
        if (cell.plDelta < minLoss) {
          minLoss = cell.plDelta;
        }
      }
    }
    return minLoss;
  }, [matrix]);

  if (!isOpen) return null;

  const spotHeaders = [-20, -10, -5, 0, 5, 10, 20];

  return (
    <Portal>
      <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true">
        <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className={styles.header}>
            <div className={styles.titleGroup}>
              <div className={styles.iconWrapper}>
                <Flame size={20} />
              </div>
              <h3>Portfolio Stress-Tester & Margin Shock Engine</h3>
              <span className={styles.badge}>MULTI-FACTOR</span>
            </div>
            <button
              type="button"
              className={styles.closeBtn}
              onClick={onClose}
              aria-label="Close modal"
            >
              <X size={18} />
            </button>
          </div>

          <div className={styles.content}>
            {/* Beta-Weighted Delta & Tail VaR Dashboard */}
            <div className={styles.betaDashboard}>
              <div className={styles.dashboardHeader}>
                <span className={styles.dashTitle}>Beta-Weighted Portfolio Delta (Δ_β)</span>
                <span className={styles.dashSubtitle}>Benchmark Normalized Exposure</span>
              </div>

              <div className={styles.inputsGrid}>
                <div className={styles.field}>
                  <label>Underlying Beta (β vs SPY)</label>
                  <div className={styles.inputBox}>
                    <input
                      type="number"
                      step="0.05"
                      value={beta}
                      onChange={(e) => setBeta(parseFloat(e.target.value) || 0)}
                    />
                    <span className={styles.suffix}>β</span>
                  </div>
                </div>

                <div className={styles.field}>
                  <label>Benchmark Index Price</label>
                  <div className={styles.inputBox}>
                    <span className={styles.prefix}>$</span>
                    <input
                      type="number"
                      step="1"
                      className={styles.hasPrefix}
                      value={benchmarkPrice}
                      onChange={(e) => setBenchmarkPrice(parseFloat(e.target.value) || 1)}
                    />
                    <span className={styles.suffix}>SPY</span>
                  </div>
                </div>
              </div>

              <div className={styles.kpiRow}>
                <div className={styles.kpiCard}>
                  <span className={styles.kpiLabel}>Beta-Weighted Delta</span>
                  <span
                    className={`${styles.kpiVal} ${
                      betaWeightedDelta > 0
                        ? styles.profit
                        : betaWeightedDelta < 0
                        ? styles.loss
                        : styles.cyan
                    }`}
                  >
                    {betaWeightedDelta > 0 ? '+' : ''}
                    {betaWeightedDelta.toFixed(1)} Δ_β
                  </span>
                  <span className={styles.kpiSub}>Normalized to benchmark</span>
                </div>

                <div className={styles.kpiCard}>
                  <span className={styles.kpiLabel}>Benchmark Equivalent</span>
                  <span className={`${styles.kpiVal} ${styles.cyan}`}>
                    {betaWeightedDelta > 0 ? '+' : ''}
                    {(betaWeightedDelta * 1).toFixed(0)} Shares
                  </span>
                  <span className={styles.kpiSub}>Equivalent market bias</span>
                </div>

                <div className={styles.kpiCard}>
                  <span className={styles.kpiLabel}>Worst-Case Tail VaR</span>
                  <span className={`${styles.kpiVal} ${styles.loss}`}>
                    -${Math.abs(worstCaseLoss).toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                  <span className={styles.kpiSub}>Severe macro stress shock</span>
                </div>
              </div>
            </div>

            {/* Macro Shock Heatmap Grid */}
            <div className={styles.heatmapSection}>
              <div className={styles.sectionTop}>
                <span className={styles.heading}>Macro Shock Heatmap (Spot Shift × Vol Shift)</span>
                <span className={styles.cellInspector}>
                  {hoveredCell
                    ? `Spot: ${hoveredCell.spotPct > 0 ? '+' : ''}${hoveredCell.spotPct * 100}% ($${hoveredCell.spotPrice}) | Vol: ${hoveredCell.volPct > 0 ? '+' : ''}${hoveredCell.volPct * 100}% | P&L: ${hoveredCell.plDelta >= 0 ? '+' : '-'}$${Math.abs(hoveredCell.plDelta).toFixed(2)} | Margin: $${hoveredCell.stressedMargin} (${hoveredCell.marginExpansionPct > 0 ? '+' : ''}${hoveredCell.marginExpansionPct}%)`
                    : 'Hover over a matrix cell to inspect stress impact'}
                </span>
              </div>

              <div className={styles.tableWrapper}>
                <table className={styles.heatmapTable}>
                  <thead>
                    <tr>
                      <th className={styles.cornerHeader}>Vol Shock \ Spot</th>
                      {spotHeaders.map((pct) => (
                        <th key={pct}>
                          {pct > 0 ? '+' : ''}
                          {pct}%
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matrix.map((row, rIdx) => {
                      const volLabel = `${row[0].volPct > 0 ? '+' : ''}${row[0].volPct * 100}% IV`;
                      return (
                        <tr key={rIdx}>
                          <td className={styles.rowHeader}>{volLabel}</td>
                          {row.map((cell, cIdx) => {
                            const pl = cell.plDelta;
                            let cellCls = styles.neutral;
                            if (pl > 500) cellCls = styles.profitHeavy;
                            else if (pl > 0) cellCls = styles.profitLight;
                            else if (pl < -500) cellCls = styles.lossHeavy;
                            else if (pl < 0) cellCls = styles.lossLight;

                            return (
                              <td
                                key={cIdx}
                                className={`${styles.matrixCell} ${cellCls}`}
                                onMouseEnter={() => setHoveredCell(cell)}
                              >
                                {pl >= 0 ? '+' : '-'}${Math.abs(pl).toFixed(0)}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
};
