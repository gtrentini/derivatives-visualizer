import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Table2, X, Loader2, AlertCircle } from 'lucide-react';
import { Portal } from '../common/Portal/Portal.tsx';
import { usePortfolio } from '../../context/usePortfolio.ts';
import { fetchLiveOptionChain } from '../../services/marketData/yahooFinance.ts';
import type { LiveOptionChainData, OptionContractQuote } from '../../types/market.ts';
import type { OptionLeg } from '../../types/derivatives.ts';
import styles from './OptionChainModal.module.scss';

interface OptionChainModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Module-level date formatter
const formatExpDate = (ts: number): string => {
  const date = new Date(ts * 1000);
  const now = Math.floor(Date.now() / 1000);
  const dte = Math.max(0, Math.round((ts - now) / 86400));
  const formatted = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return `${formatted} (${dte} DTE)`;
};

export const OptionChainModal: React.FC<OptionChainModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { state, addLeg } = usePortfolio();

  const [chainData, setChainData] = useState<LiveOptionChainData | null>(null);
  const [selectedExp, setSelectedExp] = useState<number | null>(null);
  const [addedNotice, setAddedNotice] = useState<string | null>(null);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  // Load option chain on open or symbol change
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;

    fetchLiveOptionChain(state.underlying.symbol, selectedExp || undefined)
      .then((data) => {
        if (!isMounted) return;
        setChainData(data);
        if (!selectedExp && data.selectedExpiration) {
          setSelectedExp(data.selectedExpiration);
        }
      })
      .catch((err) => {
        console.error('Failed to fetch option chain:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, state.underlying.symbol, selectedExp]);

  // Reactive loading state derived from whether active chainData matches underlying symbol
  const isLoading =
    !chainData ||
    chainData.symbol !== state.underlying.symbol ||
    (selectedExp !== null && chainData.selectedExpiration !== selectedExp);

  // Unique strikes sorted ascending
  const strikes = useMemo(() => {
    if (!chainData) return [];
    const set = new Set<number>();
    chainData.calls.forEach((c) => set.add(c.strike));
    chainData.puts.forEach((p) => set.add(p.strike));
    return Array.from(set).sort((a, b) => a - b);
  }, [chainData]);

  // Strike closest to spot price
  const atmStrike = useMemo(() => {
    if (strikes.length === 0) return 0;
    let closest = strikes[0];
    let minDiff = Math.abs(closest - state.underlying.spotPrice);
    for (const s of strikes) {
      const diff = Math.abs(s - state.underlying.spotPrice);
      if (diff < minDiff) {
        minDiff = diff;
        closest = s;
      }
    }
    return closest;
  }, [strikes, state.underlying.spotPrice]);

  // Fast strike lookup maps
  const callMap = useMemo(() => {
    const map = new Map<number, OptionContractQuote>();
    chainData?.calls.forEach((c) => map.set(c.strike, c));
    return map;
  }, [chainData]);

  const putMap = useMemo(() => {
    const map = new Map<number, OptionContractQuote>();
    chainData?.puts.forEach((p) => map.set(p.strike, p));
    return map;
  }, [chainData]);

  // Add leg to portfolio
  const handleAddContract = useCallback(
    (quote: OptionContractQuote, type: 'CALL' | 'PUT', side: 'LONG' | 'SHORT') => {
      const now = Math.floor(Date.now() / 1000);
      const dte = Math.max(1, Math.round((quote.expiration - now) / 86400));
      const midPrice =
        quote.bid > 0 && quote.ask > 0
          ? Number(((quote.bid + quote.ask) / 2).toFixed(2))
          : quote.lastPrice;

      const randomSuffix = Math.random().toString(36).slice(2, 8);
      const newLeg: OptionLeg = {
        id: `leg-${type.toLowerCase()}-${side.toLowerCase()}-${quote.strike}-${randomSuffix}`,
        legType: 'OPTION',
        type,
        side,
        strike: quote.strike,
        expirationDays: dte,
        contracts: 1,
        premium: midPrice,
        impliedVol: quote.impliedVolatility,
        isOpen: true,
      };

      addLeg(newLeg);
      setAddedNotice(`Added ${side} ${quote.strike} ${type} @ $${midPrice.toFixed(2)}`);
      setTimeout(() => setAddedNotice(null), 2500);
    },
    [addLeg]
  );

  if (!isOpen) return null;

  return (
    <Portal>
      <div
        className={styles.overlay}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            handleClose();
          }
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="option-chain-title"
      >
        <div className={styles.modal}>
          <header className={styles.header}>
            <div className={styles.leftGroup}>
              <div className={styles.iconWrapper}>
                <Table2 size={22} />
              </div>
              <h3 id="option-chain-title" className={styles.title}>
                <span>Live Option Chain</span>
                <span className={styles.symbolPill}>{state.underlying.symbol}</span>
                <span className={styles.spotText}>
                  ${state.underlying.spotPrice.toFixed(2)} Spot
                </span>
              </h3>
            </div>

            <div className={styles.rightControls}>
              {chainData && chainData.expirationDates.length > 0 && (
                <div className={styles.expSelectWrapper}>
                  <label htmlFor="exp-select">Expiry:</label>
                  <select
                    id="exp-select"
                    value={selectedExp || chainData.selectedExpiration}
                    onChange={(e) => {
                      const newExp = Number(e.target.value);
                      setSelectedExp(newExp);
                    }}
                  >
                    {chainData.expirationDates.map((ts) => (
                      <option key={ts} value={ts}>
                        {formatExpDate(ts)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                type="button"
                className={styles.closeBtn}
                onClick={handleClose}
                aria-label="Close option chain"
              >
                <X size={18} />
              </button>
            </div>
          </header>

          {/* Market Data Status Ribbon */}
          {chainData && (
            <div
              className={`${styles.statusRibbon} ${
                chainData.isLive ? styles.live : styles.fallback
              }`}
            >
              {chainData.isLive ? (
                <>
                  <span className={styles.dot}>●</span>
                  <span>Connected to live exchange options feed.</span>
                </>
              ) : (
                <>
                  <AlertCircle size={14} />
                  <span>
                    Notice: Displaying simulated quantitative option chain. Live Yahoo/CBOE feed
                    unavailable or rate-limited.
                  </span>
                </>
              )}
            </div>
          )}

          <div className={styles.tableContainer}>
            {isLoading && (
              <div className={styles.loadingOverlay}>
                <Loader2 size={32} className={styles.spinner} />
                <span>Loading live chain for {state.underlying.symbol}...</span>
              </div>
            )}

            <table className={styles.matrixTable}>
              <thead>
                <tr className={styles.topHeaderRow}>
                  <th colSpan={6} className={styles.callsHeader}>
                    CALL OPTIONS
                  </th>
                  <th className={styles.strikeHeader}>STRIKE</th>
                  <th colSpan={6} className={styles.putsHeader}>
                    PUT OPTIONS
                  </th>
                </tr>
                <tr className={styles.subHeaderRow}>
                  {/* Calls columns */}
                  <th className={styles.alignLeft}>Action</th>
                  <th className={styles.alignRight}>Bid</th>
                  <th className={styles.alignRight}>Ask</th>
                  <th className={styles.alignRight}>Mid</th>
                  <th className={styles.alignRight}>IV</th>
                  <th className={styles.alignRight}>OI</th>
                  {/* Strike column */}
                  <th className={styles.strikeCol}>Strike</th>
                  {/* Puts columns */}
                  <th className={styles.alignLeft}>Bid</th>
                  <th className={styles.alignLeft}>Ask</th>
                  <th className={styles.alignLeft}>Mid</th>
                  <th className={styles.alignLeft}>IV</th>
                  <th className={styles.alignLeft}>OI</th>
                  <th className={styles.alignRight}>Action</th>
                </tr>
              </thead>
              <tbody>
                {strikes.map((strike) => {
                  const call = callMap.get(strike);
                  const put = putMap.get(strike);
                  const isAtm = strike === atmStrike;

                  const callMid = call
                    ? call.bid > 0 && call.ask > 0
                      ? (call.bid + call.ask) / 2
                      : call.lastPrice
                    : 0;

                  const putMid = put
                    ? put.bid > 0 && put.ask > 0
                      ? (put.bid + put.ask) / 2
                      : put.lastPrice
                    : 0;

                  return (
                    <tr key={strike} className={isAtm ? styles.atmRow : ''}>
                      {/* CALL ACTIONS */}
                      <td className={styles.actionCell}>
                        {call && (
                          <div className={styles.actionButtons}>
                            <button
                              type="button"
                              className={styles.buyBtn}
                              onClick={() => handleAddContract(call, 'CALL', 'LONG')}
                              title={`Buy +1 ${strike} Call`}
                            >
                              +Buy
                            </button>
                            <button
                              type="button"
                              className={styles.sellBtn}
                              onClick={() => handleAddContract(call, 'CALL', 'SHORT')}
                              title={`Sell -1 ${strike} Call`}
                            >
                              +Sell
                            </button>
                          </div>
                        )}
                      </td>
                      {/* CALL DATA */}
                      <td className={`${styles.alignRight} ${call?.inTheMoney ? styles.itmCall : ''}`}>
                        {call ? `$${call.bid.toFixed(2)}` : '—'}
                      </td>
                      <td className={`${styles.alignRight} ${call?.inTheMoney ? styles.itmCall : ''}`}>
                        {call ? `$${call.ask.toFixed(2)}` : '—'}
                      </td>
                      <td className={`${styles.alignRight} ${call?.inTheMoney ? styles.itmCall : ''}`}>
                        {call ? `$${callMid.toFixed(2)}` : '—'}
                      </td>
                      <td className={`${styles.alignRight} ${call?.inTheMoney ? styles.itmCall : ''}`}>
                        {call ? `${(call.impliedVolatility * 100).toFixed(1)}%` : '—'}
                      </td>
                      <td className={`${styles.alignRight} ${call?.inTheMoney ? styles.itmCall : ''}`}>
                        {call ? call.openInterest.toLocaleString() : '—'}
                      </td>

                      {/* STRIKE */}
                      <td className={styles.strikeCell}>
                        <span className={styles.strikeBadge}>${strike.toFixed(2)}</span>
                      </td>

                      {/* PUT DATA */}
                      <td className={`${styles.alignLeft} ${put?.inTheMoney ? styles.itmPut : ''}`}>
                        {put ? `$${put.bid.toFixed(2)}` : '—'}
                      </td>
                      <td className={`${styles.alignLeft} ${put?.inTheMoney ? styles.itmPut : ''}`}>
                        {put ? `$${put.ask.toFixed(2)}` : '—'}
                      </td>
                      <td className={`${styles.alignLeft} ${put?.inTheMoney ? styles.itmPut : ''}`}>
                        {put ? `$${putMid.toFixed(2)}` : '—'}
                      </td>
                      <td className={`${styles.alignLeft} ${put?.inTheMoney ? styles.itmPut : ''}`}>
                        {put ? `${(put.impliedVolatility * 100).toFixed(1)}%` : '—'}
                      </td>
                      <td className={`${styles.alignLeft} ${put?.inTheMoney ? styles.itmPut : ''}`}>
                        {put ? put.openInterest.toLocaleString() : '—'}
                      </td>

                      {/* PUT ACTIONS */}
                      <td className={styles.actionCell}>
                        {put && (
                          <div className={styles.actionButtons}>
                            <button
                              type="button"
                              className={styles.buyBtn}
                              onClick={() => handleAddContract(put, 'PUT', 'LONG')}
                              title={`Buy +1 ${strike} Put`}
                            >
                              +Buy
                            </button>
                            <button
                              type="button"
                              className={styles.sellBtn}
                              onClick={() => handleAddContract(put, 'PUT', 'SHORT')}
                              title={`Sell -1 ${strike} Put`}
                            >
                              +Sell
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <footer className={styles.footer}>
            <div className={styles.legend}>
              <div className={styles.legendItem}>
                <span className={`${styles.sampleSquare} ${styles.call}`} />
                <span>ITM Calls</span>
              </div>
              <div className={styles.legendItem}>
                <span className={`${styles.sampleSquare} ${styles.put}`} />
                <span>ITM Puts</span>
              </div>
              <div className={styles.legendItem}>
                <span className={`${styles.sampleSquare} ${styles.atm}`} />
                <span>ATM Strike (${atmStrike.toFixed(2)})</span>
              </div>
            </div>

            {addedNotice && (
              <span style={{ color: 'var(--color-profit)', fontWeight: 700 }}>
                ✓ {addedNotice}
              </span>
            )}
          </footer>
        </div>
      </div>
    </Portal>
  );
};
