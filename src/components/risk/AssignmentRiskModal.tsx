import React, { useEffect, useMemo } from 'react';
import { ShieldAlert, ShieldCheck, X, AlertTriangle } from 'lucide-react';
import { Portal } from '../common/Portal/Portal.tsx';
import { usePortfolio } from '../../context/usePortfolio.ts';
import {
  evaluateAssignmentRisk,
  type AssignmentRiskReport,
} from '../../services/math/assignmentRisk.ts';
import styles from './AssignmentRiskModal.module.scss';

interface AssignmentRiskModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AssignmentRiskModal: React.FC<AssignmentRiskModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { state } = usePortfolio();

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

  const { spotPrice, riskFreeRate, dividendYield, symbol } = state.underlying;
  const { legs } = state;

  const riskReports: AssignmentRiskReport[] = useMemo(() => {
    if (!isOpen) return [];
    return evaluateAssignmentRisk(legs, spotPrice, riskFreeRate, dividendYield, symbol);
  }, [isOpen, legs, spotPrice, riskFreeRate, dividendYield, symbol]);

  const criticalCount = useMemo(
    () => riskReports.filter((r) => r.riskLevel === 'CRITICAL').length,
    [riskReports]
  );

  const elevatedCount = useMemo(
    () => riskReports.filter((r) => r.riskLevel === 'ELEVATED').length,
    [riskReports]
  );

  if (!isOpen) return null;

  return (
    <Portal>
      <div
        className={styles.overlay}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="assignment-risk-title"
      >
        <div className={styles.modal}>
          <header className={styles.header}>
            <div className={styles.titleGroup}>
              <div className={styles.iconWrapper}>
                {criticalCount > 0 ? (
                  <AlertTriangle size={20} color="var(--color-loss)" />
                ) : (
                  <ShieldAlert size={20} />
                )}
              </div>
              <h3 id="assignment-risk-title">Early Assignment & Exercise Audit</h3>
              {riskReports.length > 0 && (
                <span className={styles.badge}>
                  {criticalCount > 0
                    ? `${criticalCount} Critical Threat${criticalCount > 1 ? 's' : ''}`
                    : elevatedCount > 0
                    ? `${elevatedCount} Elevated Alert${elevatedCount > 1 ? 's' : ''}`
                    : `${riskReports.length} Short Leg${riskReports.length > 1 ? 's' : ''} Monitored`}
                </span>
              )}
            </div>
            <button
              type="button"
              className={styles.closeBtn}
              onClick={onClose}
              aria-label="Close assignment risk audit"
            >
              <X size={18} />
            </button>
          </header>

          <div className={styles.content}>
            {riskReports.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>
                  <ShieldCheck size={44} />
                </div>
                <h4>No Short Option Assignment Exposure</h4>
                <p>
                  Your current portfolio configuration contains no open short option contracts.
                  Long options and equity positions are immune to early counterparty assignment.
                </p>
              </div>
            ) : (
              <div className={styles.tableWrapper}>
                <table className={styles.riskTable}>
                  <thead>
                    <tr>
                      <th>Leg / Contract</th>
                      <th>Expiry</th>
                      <th>P(ITM) Risk</th>
                      <th>Extrinsic Buffer</th>
                      <th>Risk Level</th>
                      <th>Tactical Protocol</th>
                    </tr>
                  </thead>
                  <tbody>
                    {riskReports.map((report) => {
                      const probPct = Math.round(report.itmProbability * 100);
                      const riskClass =
                        report.riskLevel === 'CRITICAL'
                          ? styles.critical
                          : report.riskLevel === 'ELEVATED'
                          ? styles.elevated
                          : report.riskLevel === 'MODERATE'
                          ? styles.moderate
                          : styles.low;

                      const fillClass =
                        report.riskLevel === 'CRITICAL'
                          ? styles.critical
                          : report.riskLevel === 'ELEVATED'
                          ? styles.elevated
                          : styles.low;

                      return (
                        <tr key={report.legId}>
                          <td>
                            <strong>
                              {report.symbol} ${report.strike.toFixed(2)} {report.type}
                            </strong>
                          </td>
                          <td>{report.dte} DTE</td>
                          <td>
                            <div className={styles.probMeter}>
                              <div className={styles.probBar}>
                                <div
                                  className={`${styles.probFill} ${fillClass}`}
                                  style={{ width: `${Math.min(100, Math.max(0, probPct))}%` }}
                                />
                              </div>
                              <span className={styles.probPct}>{probPct}%</span>
                            </div>
                          </td>
                          <td>${report.extrinsicValue.toFixed(2)}</td>
                          <td>
                            <span className={`${styles.riskBadge} ${riskClass}`}>
                              {report.riskLevel}
                            </span>
                          </td>
                          <td className={styles.recCell}>{report.recommendations}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
};
