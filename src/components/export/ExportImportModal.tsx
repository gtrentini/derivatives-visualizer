import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  FileDown,
  Upload,
  Copy,
  Check,
  Download,
  X,
  AlertCircle,
  FileCode,
} from 'lucide-react';
import { Portal } from '../common/Portal/Portal.tsx';
import { usePortfolio } from '../../context/usePortfolio.ts';
import type { OptionLeg, PortfolioState } from '../../types/derivatives.ts';
import styles from './ExportImportModal.module.scss';

interface ExportImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ExportImportModal: React.FC<ExportImportModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { state, importPortfolio } = usePortfolio();

  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');
  const [copied, setCopied] = useState<boolean>(false);
  const [importText, setImportText] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClose = useCallback(() => {
    setCopied(false);
    setErrorMessage(null);
    setSuccessMessage(null);
    setImportText('');
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

  const jsonExportString = React.useMemo(() => {
    if (!isOpen) return '';
    return JSON.stringify(state, null, 2);
  }, [isOpen, state]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonExportString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      setErrorMessage('Failed to copy to clipboard.');
    }
  };

  const handleDownload = () => {
    const blob = new Blob([jsonExportString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `${state.underlying.symbol}_strategy_${timestamp}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const validateAndImport = (jsonStr: string) => {
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const parsed = JSON.parse(jsonStr) as unknown;

      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid JSON: Must be an object.');
      }

      const candidate = parsed as Record<string, unknown>;

      if (!Array.isArray(candidate.legs)) {
        throw new Error('Invalid structure: "legs" must be an array.');
      }

      // Validate each leg
      const validatedLegs: OptionLeg[] = candidate.legs.map((legRaw, idx) => {
        if (!legRaw || typeof legRaw !== 'object') {
          throw new Error(`Leg at index ${idx} is invalid.`);
        }
        const leg = legRaw as Record<string, unknown>;

        const id = typeof leg.id === 'string' ? leg.id : `leg-imported-${idx}-${Date.now()}`;
        const legType = leg.legType === 'STOCK' ? 'STOCK' : 'OPTION';
        const side = leg.side === 'SHORT' ? 'SHORT' : 'LONG';
        const type = leg.type === 'PUT' ? 'PUT' : 'CALL';
        const strike = Number(leg.strike) || 0;
        const expirationDays = Number(leg.expirationDays) || 0;
        const contracts = Number(leg.contracts) || 1;
        const premium = Number(leg.premium) || 0;
        const impliedVol = Number(leg.impliedVol) || 0.2;
        const isOpen = typeof leg.isOpen === 'boolean' ? leg.isOpen : true;

        return {
          id,
          legType,
          side,
          type,
          strike,
          expirationDays,
          contracts,
          premium,
          impliedVol,
          isOpen,
        };
      });

      // Validate underlying asset
      const rawUnderlying = (candidate.underlying || {}) as Record<string, unknown>;
      const underlying = {
        symbol: typeof rawUnderlying.symbol === 'string' ? rawUnderlying.symbol : 'SPY',
        spotPrice: Number(rawUnderlying.spotPrice) || 500,
        historicalVol: Number(rawUnderlying.historicalVol) || 0.16,
        riskFreeRate: Number(rawUnderlying.riskFreeRate) || 0.045,
        dividendYield: Number(rawUnderlying.dividendYield) || 0.013,
        isLiveMarketData: Boolean(rawUnderlying.isLiveMarketData),
      };

      const finalState: PortfolioState = {
        underlying,
        legs: validatedLegs,
        activeStrategy: (candidate.activeStrategy as PortfolioState['activeStrategy']) || 'CUSTOM',
        simulationDte: Number(candidate.simulationDte) || 30,
        ivShift: Number(candidate.ivShift) || 0,
        selectedMetric: (candidate.selectedMetric as PortfolioState['selectedMetric']) || 'PL',
      };

      importPortfolio(finalState);
      setSuccessMessage(`Successfully imported strategy with ${validatedLegs.length} leg(s)!`);
      setTimeout(() => {
        handleClose();
      }, 1200);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to parse and validate strategy JSON.');
      }
    }
  };

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      readFile(file);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      readFile(file);
    }
  };

  const readFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setImportText(content);
      validateAndImport(content);
    };
    reader.onerror = () => {
      setErrorMessage('Failed to read the selected file.');
    };
    reader.readAsText(file);
  };

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
        aria-labelledby="export-import-title"
      >
        <div className={styles.modal}>
          <header className={styles.header}>
            <div className={styles.titleGroup}>
              <div className={styles.iconWrapper}>
                <FileCode size={20} />
              </div>
              <h3 id="export-import-title">Strategy Export & Import</h3>
            </div>
            <button
              type="button"
              className={styles.closeBtn}
              onClick={handleClose}
              aria-label="Close export/import dialog"
            >
              <X size={18} />
            </button>
          </header>

          <nav className={styles.tabs} aria-label="Strategy data management">
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === 'export' ? styles.active : ''}`}
              onClick={() => setActiveTab('export')}
            >
              <FileDown size={16} />
              Export JSON
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === 'import' ? styles.active : ''}`}
              onClick={() => setActiveTab('import')}
            >
              <Upload size={16} />
              Import Strategy
            </button>
          </nav>

          <div className={styles.content}>
            {activeTab === 'export' ? (
              <div className={styles.exportSection}>
                <p className={styles.description}>
                  Download or copy your complete portfolio configuration, including underlying
                  parameters, simulation shock state, and all option/equity legs.
                </p>

                <div className={styles.codeBox}>
                  <code>{jsonExportString}</code>
                </div>

                <div className={styles.buttonRow}>
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${styles.secondary}`}
                    onClick={handleCopy}
                  >
                    {copied ? <Check size={16} color="var(--color-profit)" /> : <Copy size={16} />}
                    {copied ? 'Copied to Clipboard' : 'Copy JSON'}
                  </button>
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${styles.primary}`}
                    onClick={handleDownload}
                  >
                    <Download size={16} />
                    Download (.json)
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.importSection}>
                <p className={styles.description}>
                  Import a saved portfolio file or paste strategy JSON to instantly reconstruct the
                  derivatives payoff model and surface visualizer.
                </p>

                <div
                  className={`${styles.dropZone} ${isDragOver ? styles.dragActive : ''}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOver(true);
                  }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleFileDrop}
                  onClick={() => fileInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      fileInputRef.current?.click();
                    }
                  }}
                >
                  <div className={styles.dropIcon}>
                    <Upload size={28} />
                  </div>
                  <p>
                    <strong>Click to select file</strong> or drag & drop here
                  </p>
                  <span className={styles.fileHint}>Supports .json configuration files</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,application/json"
                    className={styles.fileInputHidden}
                    onChange={handleFileInputChange}
                  />
                </div>

                <div className={styles.separator}>or paste JSON directly</div>

                <textarea
                  className={styles.textarea}
                  placeholder={`{\n  "underlying": { "symbol": "SPY", "spotPrice": 500, ... },\n  "legs": [ ... ]\n}`}
                  value={importText}
                  onChange={(e) => {
                    setImportText(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                />

                {errorMessage && (
                  <div className={styles.errorMessage}>
                    <AlertCircle size={16} />
                    <span>{errorMessage}</span>
                  </div>
                )}

                {successMessage && (
                  <div className={styles.successMessage}>
                    <Check size={16} />
                    <span>{successMessage}</span>
                  </div>
                )}

                <div className={styles.buttonRow}>
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${styles.primary}`}
                    disabled={!importText.trim()}
                    onClick={() => validateAndImport(importText)}
                  >
                    <Upload size={16} />
                    Load Strategy
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
};
