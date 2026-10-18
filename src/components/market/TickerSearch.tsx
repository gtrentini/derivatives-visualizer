import React, { useState, useEffect } from 'react';
import { Search, Loader2, AlertCircle, X } from 'lucide-react';
import { usePortfolio } from '../../context/usePortfolio.ts';
import { fetchLiveOptionChain } from '../../services/marketData/yahooFinance.ts';
import styles from './TickerSearch.module.scss';

const POPULAR_TICKERS = ['SPY', 'QQQ', 'AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN', 'IWM'];

export const TickerSearch: React.FC = () => {
  const { state, setTickerData } = usePortfolio();
  const [query, setQuery] = useState(state.underlying.symbol);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Hydrate live market data on initial load if not yet live
  useEffect(() => {
    let isMounted = true;
    if (!state.underlying.isLiveMarketData) {
      fetchLiveOptionChain(state.underlying.symbol)
        .then((chain) => {
          if (!isMounted) return;
          if (chain.isLive) {
            setTickerData({
              symbol: chain.symbol,
              spotPrice: chain.underlyingPrice,
              dividendYield: chain.dividendYield,
              isLive: chain.isLive,
            });
          }
        })
        .catch(() => {});
    }
    return () => {
      isMounted = false;
    };
  }, [state.underlying.isLiveMarketData, state.underlying.symbol, setTickerData]);

  const handleSelectTicker = async (symbol: string) => {
    const clean = symbol.trim().toUpperCase();
    if (!clean) return;

    setQuery(clean);
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const chain = await fetchLiveOptionChain(clean);
      setTickerData({
        symbol: chain.symbol,
        spotPrice: chain.underlyingPrice,
        dividendYield: chain.dividendYield,
        isLive: chain.isLive,
      });
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage(`Could not load market data for ${clean}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      handleSelectTicker(query);
    }
  };

  return (
    <div className={styles.container}>
      <form className={styles.searchForm} onSubmit={handleSubmit}>
        <div className={styles.inputWrapper}>
          <Search size={14} className={styles.searchIcon} />
          <input
            type="text"
            className={styles.input}
            value={query}
            placeholder="TICKER"
            maxLength={6}
            onChange={(e) => {
              setQuery(e.target.value.toUpperCase());
              if (errorMessage) setErrorMessage(null);
            }}
            disabled={isLoading}
          />
          <button
            type="submit"
            className={styles.submitBtn}
            disabled={isLoading || !query.trim()}
            title="Fetch live market data"
          >
            {isLoading ? <Loader2 size={12} className={styles.spinner} /> : 'Go'}
          </button>
        </div>
      </form>

      {/* Quick Select Pills */}
      <div className={styles.pillGroup}>
        {POPULAR_TICKERS.map((ticker) => {
          const isActive = state.underlying.symbol === ticker;
          return (
            <button
              key={ticker}
              type="button"
              className={`${styles.pillBtn} ${isActive ? styles.active : ''}`}
              onClick={() => handleSelectTicker(ticker)}
              disabled={isLoading}
            >
              {ticker}
            </button>
          );
        })}
      </div>

      {/* Error Toast */}
      {errorMessage && (
        <div className={styles.errorToast}>
          <AlertCircle size={14} />
          <span>{errorMessage}</span>
          <button
            type="button"
            className={styles.dismissBtn}
            onClick={() => setErrorMessage(null)}
            aria-label="Dismiss error"
          >
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  );
};
