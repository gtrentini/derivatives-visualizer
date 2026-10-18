import React, { useState, useEffect, useMemo } from 'react';
import {
  Activity,
  Sun,
  Moon,
  Flame,
  ShieldAlert,
  ShieldCheck,
  FileDown,
  AlertTriangle,
  Table2,
  AlertCircle,
} from 'lucide-react';
import { usePortfolio } from '../../../context/usePortfolio.ts';
import { usePortfolioAnalytics } from '../../../hooks/usePortfolioAnalytics.ts';
import { evaluateAssignmentRisk } from '../../../services/math/assignmentRisk.ts';
import { AssignmentRiskModal } from '../../risk/AssignmentRiskModal.tsx';
import { StressTestModal } from '../../stressTester/StressTestModal.tsx';
import { ExportImportModal } from '../../export/ExportImportModal.tsx';
import { OptionChainModal } from '../../market/OptionChainModal.tsx';
import { TickerSearch } from '../../market/TickerSearch.tsx';
import styles from './Header.module.scss';

export const Header: React.FC = () => {
  const {
    state,
    nudgeSpot,
    netPremiumDollars,
  } = usePortfolio();

  const { currentGreeks } = usePortfolioAnalytics();

  // Dual Theme Engine State
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('quant_theme');
      if (stored === 'light' || stored === 'dark') {
        return stored;
      }
    }
    return 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('quant_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  // Modals state
  const [isRiskModalOpen, setIsRiskModalOpen] = useState(false);
  const [isStressModalOpen, setIsStressModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isChainModalOpen, setIsChainModalOpen] = useState(false);

  // Compute live early assignment risk audit
  const riskReports = useMemo(() => {
    return evaluateAssignmentRisk(
      state.legs,
      state.underlying.spotPrice,
      state.underlying.riskFreeRate,
      state.underlying.dividendYield,
      state.underlying.symbol
    );
  }, [
    state.legs,
    state.underlying.spotPrice,
    state.underlying.riskFreeRate,
    state.underlying.dividendYield,
    state.underlying.symbol,
  ]);

  const criticalRisks = useMemo(
    () => riskReports.filter((r) => r.riskLevel === 'CRITICAL').length,
    [riskReports]
  );
  const elevatedRisks = useMemo(
    () => riskReports.filter((r) => r.riskLevel === 'ELEVATED').length,
    [riskReports]
  );

  const formattedSpot = state.underlying.spotPrice.toFixed(2);
  const ivShiftPercent = (state.ivShift * 100).toFixed(1);
  const ivSign = state.ivShift > 0 ? '+' : '';

  // Format Net Premium (Credit or Debit)
  const isCredit = netPremiumDollars >= 0;
  const netPremiumFormatted = `${isCredit ? '+' : '-'}$${Math.abs(netPremiumDollars).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${isCredit ? 'Credit' : 'Debit'}`;

  // Format Delta (Δ) with explicit sign
  const deltaVal = currentGreeks.delta;
  const deltaSign = deltaVal > 0 ? '+' : '';
  const deltaFormatted = `${deltaSign}${deltaVal.toFixed(1)} Δ`;

  // Format Theta (Θ) in dollars/day
  const thetaVal = currentGreeks.theta;
  const isThetaProfit = thetaVal >= 0;
  const thetaFormatted = `${isThetaProfit ? '+' : '-'}$${Math.abs(thetaVal).toFixed(2)}/day`;

  // Strategy display label
  const strategyLabel = state.activeStrategy.replace(/_/g, ' ');

  return (
    <>
      <header className={styles.header}>
        <div className={styles.leftSection}>
          {/* Brand */}
          <div className={styles.brand}>
            <div className={styles.logoIcon}>
              <Activity size={24} />
            </div>
            <span className={styles.title}>
              QUANT<span>SURFACE</span>
            </span>
          </div>

          {/* Dynamic Ticker Search & Spot Price Adjuster */}
          <div className={styles.tickerGroup}>
            <TickerSearch />

            <div className={styles.spotPriceDisplay}>
              <span className={styles.currency}>$</span>
              <span className={styles.price}>{formattedSpot}</span>
            </div>

            {state.underlying.isLiveMarketData ? (
              <span
                className={`${styles.marketPill} ${styles.live}`}
                title="Connected to live real-time market data feed"
              >
                ● LIVE MARKET
              </span>
            ) : (
              <span
                className={`${styles.marketPill} ${styles.fallback}`}
                title="Using fallback BSM model. Ticker unlisted or exchange feed offline."
              >
                <AlertCircle size={12} />
                SIMULATED MODEL
              </span>
            )}

            <div className={styles.nudgeControls}>
              <button
                type="button"
                className={styles.nudgeBtn}
                onClick={() => nudgeSpot(-5)}
                title="Decrease spot by $5"
              >
                -$5
              </button>
              <button
                type="button"
                className={styles.nudgeBtn}
                onClick={() => nudgeSpot(-1)}
                title="Decrease spot by $1"
              >
                -$1
              </button>
              <button
                type="button"
                className={styles.nudgeBtn}
                onClick={() => nudgeSpot(1)}
                title="Increase spot by $1"
              >
                +$1
              </button>
              <button
                type="button"
                className={styles.nudgeBtn}
                onClick={() => nudgeSpot(5)}
                title="Increase spot by $5"
              >
                +$5
              </button>
            </div>
          </div>

          {/* Quick Strategy Badge */}
          <div className={styles.strategyBadge}>
            <span className={styles.label}>STRATEGY</span>
            <span className={styles.value}>{strategyLabel}</span>
          </div>
        </div>

        <div className={styles.rightSection}>
          {/* Institutional Tool Triggers */}
          <div className={styles.toolsGroup}>
            {/* Live Option Chain Button */}
            <button
              type="button"
              className={styles.toolBtn}
              onClick={() => setIsChainModalOpen(true)}
              title="Open Live Option Chain Matrix"
            >
              <Table2 size={16} color="var(--color-profit)" />
              <span>Live Chain</span>
            </button>

            {/* Assignment Risk Button */}
            <button
              type="button"
              className={`${styles.toolBtn} ${
                criticalRisks > 0
                  ? styles.critical
                  : elevatedRisks > 0
                  ? styles.elevated
                  : ''
              }`}
              onClick={() => setIsRiskModalOpen(true)}
              title="Inspect Early Assignment & Exercise Risk"
            >
              {criticalRisks > 0 ? (
                <AlertTriangle size={16} />
              ) : elevatedRisks > 0 ? (
                <ShieldAlert size={16} />
              ) : (
                <ShieldCheck size={16} color="var(--color-profit)" />
              )}
              <span>Risk Audit</span>
              {criticalRisks > 0 ? (
                <span className={`${styles.toolBadge} ${styles.critical}`}>
                  {criticalRisks} Threat{criticalRisks > 1 ? 's' : ''}
                </span>
              ) : elevatedRisks > 0 ? (
                <span className={`${styles.toolBadge} ${styles.elevated}`}>
                  {elevatedRisks} Alert{elevatedRisks > 1 ? 's' : ''}
                </span>
              ) : null}
            </button>

            {/* Macro Stress Test Button */}
            <button
              type="button"
              className={styles.toolBtn}
              onClick={() => setIsStressModalOpen(true)}
              title="Open Portfolio Macro Shock & Margin Stress-Tester"
            >
              <Flame size={16} color="var(--color-amber)" />
              <span>Stress Test</span>
            </button>

            {/* Export / Import Button */}
            <button
              type="button"
              className={styles.toolBtn}
              onClick={() => setIsExportModalOpen(true)}
              title="Export or Import Strategy JSON"
            >
              <FileDown size={16} color="var(--color-cyan)" />
              <span>Export / Import</span>
            </button>
          </div>

          {/* Telemetry Stats Ribbon */}
          <div className={styles.telemetryGroup}>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>Net Premium</span>
              <span
                className={`${styles.statValue} ${isCredit ? styles.profit : styles.loss}`}
              >
                {netPremiumFormatted}
              </span>
            </div>

            <div className={styles.statCard}>
              <span className={styles.statLabel}>Portfolio Delta (Δ)</span>
              <span
                className={`${styles.statValue} ${
                  deltaVal > 0.05
                    ? styles.profit
                    : deltaVal < -0.05
                    ? styles.loss
                    : styles.neutral
                }`}
              >
                {deltaFormatted}
              </span>
            </div>

            <div className={styles.statCard}>
              <span className={styles.statLabel}>Daily Theta (Θ)</span>
              <span
                className={`${styles.statValue} ${isThetaProfit ? styles.profit : styles.loss}`}
              >
                {thetaFormatted}
              </span>
            </div>

            <div className={styles.statCard}>
              <span className={styles.statLabel}>Sim DTE</span>
              <span className={styles.statValue}>{state.simulationDte}d</span>
            </div>

            <div className={styles.statCard}>
              <span className={styles.statLabel}>IV Shock</span>
              <span
                className={`${styles.statValue} ${
                  state.ivShift === 0
                    ? styles.neutral
                    : state.ivShift > 0
                    ? styles.loss
                    : styles.profit
                }`}
              >
                {ivSign}
                {ivShiftPercent}%
              </span>
            </div>
          </div>

          {/* Theme Toggle Button */}
          <button
            type="button"
            className={styles.themeToggleBtn}
            onClick={toggleTheme}
            title={theme === 'light' ? 'Switch to Dark Theme' : 'Switch to Light Theme'}
            aria-label="Toggle visual theme"
          >
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
        </div>
      </header>

      {/* Modal Dialogs */}
      <OptionChainModal
        isOpen={isChainModalOpen}
        onClose={() => setIsChainModalOpen(false)}
      />
      <AssignmentRiskModal
        isOpen={isRiskModalOpen}
        onClose={() => setIsRiskModalOpen(false)}
      />
      <StressTestModal
        isOpen={isStressModalOpen}
        onClose={() => setIsStressModalOpen(false)}
      />
      <ExportImportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
      />
    </>
  );
};
