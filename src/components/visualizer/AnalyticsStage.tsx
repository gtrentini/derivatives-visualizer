import React, { useMemo } from 'react';
import {
  ShieldCheck,
  TrendingUp,
  Table as TableIcon,
  CheckCircle,
} from 'lucide-react';
import { usePortfolio } from '../../context/usePortfolio.ts';
import { usePortfolioAnalytics } from '../../hooks/usePortfolioAnalytics.ts';
import {
  calculateBlackScholes,
  calculateLegGreeks,
} from '../../services/math/blackScholes.ts';
import styles from './AnalyticsStage.module.scss';

export const AnalyticsStage: React.FC = () => {
  const { state } = usePortfolio();
  const { currentGreeks, riskEnvelope } = usePortfolioAnalytics();

  const { spotPrice, riskFreeRate, dividendYield } = state.underlying;
  const { legs, simulationDte, ivShift } = state;
  const activeLegs = legs.filter((l) => l.isOpen);

  // 1. Greek Gauge Formats & Classifications
  const deltaVal = currentGreeks.delta;
  const deltaFormatted = `${deltaVal > 0 ? '+' : ''}${deltaVal.toFixed(2)} Δ`;
  const deltaStatus =
    Math.abs(deltaVal) < 2
      ? { label: 'Delta Neutral', cls: styles.neutral }
      : deltaVal > 0
      ? { label: 'Net Long Bias', cls: styles.positive }
      : { label: 'Net Short Bias', cls: styles.negative };

  const gammaVal = currentGreeks.gamma;
  const gammaFormatted = `${gammaVal > 0 ? '+' : ''}${gammaVal.toFixed(4)} Γ`;
  const gammaStatus =
    Math.abs(gammaVal) < 0.001
      ? { label: 'Linear Payoff', cls: styles.neutral }
      : gammaVal > 0
      ? { label: 'Long Convexity', cls: styles.positive }
      : { label: 'Short Convexity', cls: styles.negative };

  const thetaVal = currentGreeks.theta;
  const thetaFormatted = `${thetaVal >= 0 ? '+' : '-'}$${Math.abs(thetaVal).toFixed(2)} / day`;
  const thetaStatus =
    thetaVal >= 0
      ? { label: 'Positive Carry', cls: styles.positive }
      : { label: 'Time Decay Drag', cls: styles.negative };

  const vegaVal = currentGreeks.vega;
  const vegaFormatted = `${vegaVal >= 0 ? '+' : '-'}$${Math.abs(vegaVal).toFixed(2)} / 1% IV`;
  const vegaStatus =
    vegaVal >= 0
      ? { label: 'Long Volatility', cls: styles.positive }
      : { label: 'Short Volatility', cls: styles.negative };

  // 2. Risk & Capital Formatted Values
  const maxProfitText =
    riskEnvelope.maxProfit === 'UNLIMITED'
      ? 'UNLIMITED'
      : `+$${riskEnvelope.maxProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  const maxLossText =
    riskEnvelope.maxLoss === 'UNLIMITED'
      ? 'UNLIMITED'
      : `-$${riskEnvelope.maxLoss.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  const marginRequiredText = `$${riskEnvelope.marginRequired.toLocaleString('en-US', {
    minimumFractionDigits: 2,
  })}`;

  const rocText =
    riskEnvelope.returnOnCapital !== null ? `${riskEnvelope.returnOnCapital}%` : 'N/A';

  // 3. Compute Real-Time 5-Checkpoint Spot Sensitivity Matrix (-10%, -5%, 0%, +5%, +10%)
  const checkpoints = useMemo(() => {
    const percentages = [-0.1, -0.05, 0, 0.05, 0.1];
    const effectiveDte = Math.max(0, simulationDte);
    const timeYears = effectiveDte / 365;

    return percentages.map((pct) => {
      const s = Number((spotPrice * (1 + pct)).toFixed(2));
      const isCurrent = pct === 0;
      const pctLabel = pct === 0 ? 'Current Spot' : `${pct > 0 ? '+' : ''}${pct * 100}%`;

      let totalExpPl = 0;
      let totalCurPl = 0;
      let totalDelta = 0;
      let totalGamma = 0;
      let totalTheta = 0;
      let totalVega = 0;

      for (const leg of activeLegs) {
        const isLong = leg.side === 'LONG';
        const sideSign = isLong ? 1 : -1;

        if (leg.legType === 'STOCK') {
          const shares = leg.contracts;
          const pl = (s - leg.strike) * shares * sideSign;
          totalExpPl += pl;
          totalCurPl += pl;
          totalDelta += shares * sideSign;
        } else {
          // Option
          const contracts = leg.contracts;
          const multiplier = contracts * 100;

          // Expiration P&L
          const intrinsic =
            leg.type === 'CALL'
              ? Math.max(0, s - leg.strike)
              : Math.max(0, leg.strike - s);
          totalExpPl += (intrinsic - leg.premium) * multiplier * sideSign;

          // Model intermediate P&L
          const shockedIv = Math.max(0.01, leg.impliedVol + ivShift);
          const bsm = calculateBlackScholes(
            s,
            leg.strike,
            timeYears,
            shockedIv,
            riskFreeRate,
            dividendYield,
            leg.type
          );
          totalCurPl += (bsm.price - leg.premium) * multiplier * sideSign;

          // Greeks at s
          const g = calculateLegGreeks(
            leg,
            s,
            effectiveDte,
            ivShift,
            riskFreeRate,
            dividendYield
          );
          totalDelta += g.delta;
          totalGamma += g.gamma;
          totalTheta += g.theta;
          totalVega += g.vega;
        }
      }

      return {
        pctLabel,
        spot: s,
        isCurrent,
        expirationPl: totalExpPl,
        currentPl: totalCurPl,
        delta: totalDelta,
        gamma: totalGamma,
        theta: totalTheta,
        vega: totalVega,
      };
    });
  }, [spotPrice, activeLegs, simulationDte, ivShift, riskFreeRate, dividendYield]);

  return (
    <div className={styles.analyticsStage}>
      {/* 1. Institutional Greeks Telemetry Ribbon */}
      <div className={styles.greeksRibbon}>
        {/* Delta */}
        <div className={`${styles.greekCard} ${styles.deltaCard}`}>
          <div className={styles.cardTop}>
            <div className={styles.symbolGroup}>
              <span className={`${styles.greekSymbol} ${styles.delta}`}>Δ</span>
              <span className={styles.greekName}>Portfolio Delta</span>
            </div>
            <span className={`${styles.statusPill} ${deltaStatus.cls}`}>
              {deltaStatus.label}
            </span>
          </div>
          <div
            className={`${styles.valueDisplay} ${
              deltaVal > 0 ? styles.positive : deltaVal < 0 ? styles.negative : ''
            }`}
          >
            {deltaFormatted}
          </div>
          <span className={styles.formulaLabel}>
            ∂Π / ∂S • Dollar delta ${deltaVal > 0 ? '+' : ''}
            {(deltaVal * 1).toFixed(1)} per $1.00 move
          </span>
        </div>

        {/* Gamma */}
        <div className={`${styles.greekCard} ${styles.gammaCard}`}>
          <div className={styles.cardTop}>
            <div className={styles.symbolGroup}>
              <span className={`${styles.greekSymbol} ${styles.gamma}`}>Γ</span>
              <span className={styles.greekName}>Portfolio Gamma</span>
            </div>
            <span className={`${styles.statusPill} ${gammaStatus.cls}`}>
              {gammaStatus.label}
            </span>
          </div>
          <div className={styles.valueDisplay}>{gammaFormatted}</div>
          <span className={styles.formulaLabel}>
            ∂²Π / ∂S² • Delta acceleration per $1.00 underlying shift
          </span>
        </div>

        {/* Theta */}
        <div className={`${styles.greekCard} ${styles.thetaCard}`}>
          <div className={styles.cardTop}>
            <div className={styles.symbolGroup}>
              <span className={`${styles.greekSymbol} ${styles.theta}`}>Θ</span>
              <span className={styles.greekName}>Daily Theta Decay</span>
            </div>
            <span className={`${styles.statusPill} ${thetaStatus.cls}`}>
              {thetaStatus.label}
            </span>
          </div>
          <div
            className={`${styles.valueDisplay} ${
              thetaVal >= 0 ? styles.positive : styles.negative
            }`}
          >
            {thetaFormatted}
          </div>
          <span className={styles.formulaLabel}>
            ∂Π / ∂t • Portfolio P&L accretion per 24h calendar day
          </span>
        </div>

        {/* Vega */}
        <div className={`${styles.greekCard} ${styles.vegaCard}`}>
          <div className={styles.cardTop}>
            <div className={styles.symbolGroup}>
              <span className={`${styles.greekSymbol} ${styles.vega}`}>ν</span>
              <span className={styles.greekName}>Portfolio Vega</span>
            </div>
            <span className={`${styles.statusPill} ${vegaStatus.cls}`}>
              {vegaStatus.label}
            </span>
          </div>
          <div
            className={`${styles.valueDisplay} ${
              vegaVal >= 0 ? styles.positive : styles.negative
            }`}
          >
            {vegaFormatted}
          </div>
          <span className={styles.formulaLabel}>
            ∂Π / ∂σ • Portfolio sensitivity per 1.0% (100 bps) vol shock
          </span>
        </div>
      </div>

      {/* 2. Risk & Capital Envelope */}
      <section className={styles.envelopeSection}>
        <div className={styles.sectionHeader}>
          <div className={styles.headerTitle}>
            <ShieldCheck className={styles.headerIcon} size={18} />
            <span>Risk & Capital Envelope</span>
          </div>
          <span className={styles.badgeTag}>FINRA / CBOE MODEL</span>
        </div>

        <div className={styles.envelopeGrid}>
          {/* Max Profit */}
          <div className={styles.envelopeCard}>
            <span className={styles.envLabel}>Max Profit</span>
            <span className={`${styles.envValue} ${styles.profit}`}>
              {maxProfitText}
            </span>
            <span className={styles.envSub}>Terminal upside payoff</span>
          </div>

          {/* Max Loss */}
          <div className={styles.envelopeCard}>
            <span className={styles.envLabel}>Max Loss</span>
            <span className={`${styles.envValue} ${styles.loss}`}>
              {maxLossText}
            </span>
            <span className={styles.envSub}>Defined risk floor</span>
          </div>

          {/* Margin Requirement */}
          <div className={styles.envelopeCard}>
            <span className={styles.envLabel}>Margin Required</span>
            <span className={`${styles.envValue} ${styles.cyan}`}>
              {marginRequiredText}
            </span>
            <span className={styles.envSub}>Collateral lock-up</span>
          </div>

          {/* Return on Capital */}
          <div className={styles.envelopeCard}>
            <span className={styles.envLabel}>Return on Capital</span>
            <span className={`${styles.envValue} ${styles.amber}`}>{rocText}</span>
            <span className={styles.envSub}>Max Profit / Margin</span>
          </div>

          {/* Expiration Breakevens */}
          <div className={styles.envelopeCard}>
            <span className={styles.envLabel}>Expiry Breakevens (T=0)</span>
            <div className={styles.breakevenList}>
              {riskEnvelope.expirationBreakevens.length > 0 ? (
                riskEnvelope.expirationBreakevens.map((be) => (
                  <span key={`exp-${be}`} className={styles.breakevenBadge}>
                    ${be.toFixed(2)}
                  </span>
                ))
              ) : (
                <span className={styles.noneBadge}>No Zero Crossing</span>
              )}
            </div>
            <span className={styles.envSub}>Zero P&L boundaries</span>
          </div>

          {/* Intermediate Horizon Breakevens */}
          <div className={styles.envelopeCard}>
            <span className={styles.envLabel}>
              Sim Breakevens (T={simulationDte}d)
            </span>
            <div className={styles.breakevenList}>
              {riskEnvelope.currentBreakevens.length > 0 ? (
                riskEnvelope.currentBreakevens.map((be) => (
                  <span key={`cur-${be}`} className={styles.breakevenBadge}>
                    ${be.toFixed(2)}
                  </span>
                ))
              ) : (
                <span className={styles.noneBadge}>No Zero Crossing</span>
              )}
            </div>
            <span className={styles.envSub}>BSM dynamic horizon</span>
          </div>
        </div>
      </section>

      {/* 3. Real-Time Spot Sensitivity Grid */}
      <section className={styles.sensitivitySection}>
        <div className={styles.tableHeader}>
          <div className={styles.titleGroup}>
            <TrendingUp className={styles.titleIcon} size={17} />
            <h4>Real-Time Spot Sensitivity Grid (Stress Horizon: {simulationDte} DTE)</h4>
          </div>
          <span className={styles.tableSubtitle}>
            IV Shock: {ivShift > 0 ? '+' : ''}{(ivShift * 100).toFixed(1)}% • Risk-Free: {(riskFreeRate * 100).toFixed(2)}%
          </span>
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.sensitivityTable}>
            <thead>
              <tr>
                <th>Spot Stress</th>
                <th>Underlying Spot</th>
                <th>Model P&L (T={simulationDte}d)</th>
                <th>Expiry P&L (T=0)</th>
                <th>Delta (Δ)</th>
                <th>Gamma (Γ)</th>
                <th>Theta (Θ/day)</th>
                <th>Vega (ν/1%)</th>
                <th>Zone State</th>
              </tr>
            </thead>
            <tbody>
              {checkpoints.map((pt) => {
                const isCurProfit = pt.currentPl >= 0;
                const isExpProfit = pt.expirationPl >= 0;

                return (
                  <tr
                    key={pt.pctLabel}
                    className={pt.isCurrent ? styles.currentSpotRow : ''}
                  >
                    <td>
                      <div className={styles.spotLabelWrapper}>
                        <span>{pt.pctLabel}</span>
                        {pt.isCurrent && (
                          <span className={styles.currentPill}>LIVE</span>
                        )}
                      </div>
                    </td>
                    <td>${pt.spot.toFixed(2)}</td>
                    <td className={isCurProfit ? styles.plProfit : styles.plLoss}>
                      {isCurProfit ? '+' : '-'}$
                      {Math.abs(pt.currentPl).toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className={isExpProfit ? styles.plProfit : styles.plLoss}>
                      {isExpProfit ? '+' : '-'}$
                      {Math.abs(pt.expirationPl).toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td>{pt.delta > 0 ? '+' : ''}{pt.delta.toFixed(1)}</td>
                    <td>{pt.gamma > 0 ? '+' : ''}{pt.gamma.toFixed(4)}</td>
                    <td>{pt.theta >= 0 ? '+' : '-'}${Math.abs(pt.theta).toFixed(2)}</td>
                    <td>{pt.vega >= 0 ? '+' : '-'}${Math.abs(pt.vega).toFixed(2)}</td>
                    <td>
                      <span
                        className={`${styles.stateBadge} ${
                          isCurProfit ? styles.profit : styles.loss
                        }`}
                      >
                        {isCurProfit ? 'PROFIT ZONE' : 'LOSS ZONE'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 4. Active Legs BSM Analytical Parameter Matrix */}
      <section className={styles.legsSection}>
        <div className={styles.legsHeader}>
          <div className={styles.titleGroup}>
            <TableIcon className={styles.titleIcon} size={17} />
            <h4>Portfolio Legs Analytical Matrix</h4>
          </div>
          <div className={styles.engineStatus}>
            <span className={styles.dot} />
            <span>BSM CLOSED-FORM PRICER ACTIVE</span>
          </div>
        </div>

        <div className={styles.legsTableWrapper}>
          <table className={styles.legsTable}>
            <thead>
              <tr>
                <th>Status</th>
                <th>Side</th>
                <th>Instrument</th>
                <th>Strike (K)</th>
                <th>DTE</th>
                <th>Implied Vol</th>
                <th>Shocked IV</th>
                <th>Qty</th>
                <th>Unit Premium</th>
                <th>Model Price (T={simulationDte}d)</th>
                <th>Position Model Value</th>
              </tr>
            </thead>
            <tbody>
              {legs.map((leg) => {
                const isStock = leg.legType === 'STOCK';
                const shockedIv = Math.max(0.01, leg.impliedVol + ivShift);
                const effectiveDte = Math.max(0, simulationDte);
                const timeYears = effectiveDte / 365;

                const modelGreeks = isStock
                  ? { price: spotPrice }
                  : calculateBlackScholes(
                      spotPrice,
                      leg.strike,
                      timeYears,
                      shockedIv,
                      riskFreeRate,
                      dividendYield,
                      leg.type
                    );

                const positionValue = isStock
                  ? modelGreeks.price * leg.contracts
                  : modelGreeks.price * 100 * leg.contracts;

                return (
                  <tr
                    key={leg.id}
                    className={!leg.isOpen ? styles.mutedRow : ''}
                  >
                    <td>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        {leg.isOpen ? (
                          <CheckCircle size={14} color="#00e676" />
                        ) : (
                          '—'
                        )}
                        {leg.isOpen ? 'ACTIVE' : 'MUTED'}
                      </span>
                    </td>
                    <td>
                      <span
                        className={
                          leg.side === 'LONG' ? styles.sideLong : styles.sideShort
                        }
                      >
                        {leg.side}
                      </span>
                    </td>
                    <td>
                      <span
                        className={
                          isStock
                            ? styles.typeStock
                            : leg.type === 'CALL'
                            ? styles.typeCall
                            : styles.typePut
                        }
                      >
                        {isStock ? 'STOCK' : leg.type}
                      </span>
                    </td>
                    <td>${leg.strike.toFixed(2)}</td>
                    <td>{isStock ? 'Perp (0d)' : `${leg.expirationDays}d`}</td>
                    <td>{isStock ? '—' : `${(leg.impliedVol * 100).toFixed(1)}%`}</td>
                    <td>{isStock ? '—' : `${(shockedIv * 100).toFixed(1)}%`}</td>
                    <td>
                      {leg.contracts} {isStock ? 'sh' : 'ct'}
                    </td>
                    <td>${leg.premium.toFixed(2)}</td>
                    <td>${modelGreeks.price.toFixed(2)}</td>
                    <td>
                      ${positionValue.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
