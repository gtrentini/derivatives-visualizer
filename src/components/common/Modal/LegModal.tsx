import React, { useState, useEffect } from 'react';
import { X, PlusCircle, Check } from 'lucide-react';
import { Portal } from '../Portal/Portal.tsx';
import type { LegType, OptionLeg, OptionType, PositionSide } from '../../../types/derivatives.ts';
import styles from './LegModal.module.scss';

interface LegModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (leg: OptionLeg) => void;
  editingLeg?: OptionLeg | null;
  defaultSpotPrice?: number;
}

interface LegModalFormProps {
  onClose: () => void;
  onSave: (leg: OptionLeg) => void;
  editingLeg?: OptionLeg | null;
  defaultSpotPrice: number;
}

const LegModalForm: React.FC<LegModalFormProps> = ({
  onClose,
  onSave,
  editingLeg,
  defaultSpotPrice,
}) => {
  const [legType, setLegType] = useState<LegType>(editingLeg?.legType ?? 'OPTION');
  const [type, setType] = useState<OptionType>(editingLeg?.type ?? 'CALL');
  const [side, setSide] = useState<PositionSide>(editingLeg?.side ?? 'LONG');
  const [strike, setStrike] = useState<number>(editingLeg?.strike ?? defaultSpotPrice);
  const [expirationDays, setExpirationDays] = useState<number>(editingLeg?.expirationDays ?? 30);
  const [contracts, setContracts] = useState<number>(editingLeg?.contracts ?? 1);
  const [premium, setPremium] = useState<number>(editingLeg?.premium ?? 3.5);
  const [ivPercent, setIvPercent] = useState<number>(
    editingLeg ? Math.round(editingLeg.impliedVol * 100) : 20
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const leg: OptionLeg = {
      id: editingLeg ? editingLeg.id : `leg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      legType,
      type,
      side,
      strike: Number(strike),
      expirationDays: legType === 'STOCK' ? 0 : Number(expirationDays),
      contracts: Number(contracts),
      premium: Number(premium),
      impliedVol: legType === 'STOCK' ? 0 : Number(ivPercent) / 100,
      isOpen: editingLeg ? editingLeg.isOpen : true,
    };
    onSave(leg);
    onClose();
  };

  return (
    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <div className={styles.iconWrapper}>
            {editingLeg ? <Check size={18} /> : <PlusCircle size={18} />}
          </div>
          <h3>{editingLeg ? 'Edit Position Leg' : 'Add Quantitative Leg'}</h3>
        </div>
        <button
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Close modal"
        >
          <X size={18} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className={styles.form}>
        {/* Leg Type & Position Side */}
        <div className={styles.rowGroup}>
          <div className={styles.field}>
            <label>Instrument</label>
            <div className={styles.segmentedControl}>
              <button
                type="button"
                className={`${styles.segmentBtn} ${legType === 'OPTION' ? styles.active : ''}`}
                onClick={() => setLegType('OPTION')}
              >
                OPTION
              </button>
              <button
                type="button"
                className={`${styles.segmentBtn} ${legType === 'STOCK' ? styles.active : ''}`}
                onClick={() => setLegType('STOCK')}
              >
                STOCK
              </button>
            </div>
          </div>

          <div className={styles.field}>
            <label>Position Side</label>
            <div className={styles.segmentedControl}>
              <button
                type="button"
                className={`${styles.segmentBtn} ${
                  side === 'LONG' ? `${styles.active} ${styles.activeLong}` : ''
                }`}
                onClick={() => setSide('LONG')}
              >
                LONG
              </button>
              <button
                type="button"
                className={`${styles.segmentBtn} ${
                  side === 'SHORT' ? `${styles.active} ${styles.activeShort}` : ''
                }`}
                onClick={() => setSide('SHORT')}
              >
                SHORT
              </button>
            </div>
          </div>
        </div>

        {/* Option Type & Strike */}
        <div className={styles.rowGroup}>
          {legType === 'OPTION' ? (
            <div className={styles.field}>
              <label>Option Type</label>
              <div className={styles.segmentedControl}>
                <button
                  type="button"
                  className={`${styles.segmentBtn} ${
                    type === 'CALL' ? `${styles.active} ${styles.activeCall}` : ''
                  }`}
                  onClick={() => setType('CALL')}
                >
                  CALL
                </button>
                <button
                  type="button"
                  className={`${styles.segmentBtn} ${
                    type === 'PUT' ? `${styles.active} ${styles.activePut}` : ''
                  }`}
                  onClick={() => setType('PUT')}
                >
                  PUT
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.field}>
              <label>Asset Class</label>
              <div className={styles.inputWrapper}>
                <input type="text" value="Underlying Equity" disabled />
              </div>
            </div>
          )}

          <div className={styles.field}>
            <label>{legType === 'STOCK' ? 'Entry Price' : 'Strike Price'}</label>
            <div className={styles.inputWrapper}>
              <span className={styles.prefix}>$</span>
              <input
                type="number"
                step="0.5"
                className={styles.hasPrefix}
                value={strike}
                onChange={(e) => setStrike(parseFloat(e.target.value) || 0)}
                required
              />
            </div>
          </div>
        </div>

        {/* Expiration DTE & Contracts */}
        <div className={styles.rowGroup}>
          {legType === 'OPTION' ? (
            <div className={styles.field}>
              <label>Days to Expiration (DTE)</label>
              <div className={styles.inputWrapper}>
                <input
                  type="number"
                  min="0"
                  max="720"
                  value={expirationDays}
                  onChange={(e) => setExpirationDays(parseInt(e.target.value, 10) || 0)}
                  required
                />
                <span className={styles.suffix}>DTE</span>
              </div>
            </div>
          ) : (
            <div className={styles.field}>
              <label>Horizon</label>
              <div className={styles.inputWrapper}>
                <input type="text" value="Perpetual (0 DTE)" disabled />
              </div>
            </div>
          )}

          <div className={styles.field}>
            <label>{legType === 'STOCK' ? 'Shares' : 'Contracts'}</label>
            <div className={styles.inputWrapper}>
              <input
                type="number"
                min="1"
                max="10000"
                value={contracts}
                onChange={(e) => setContracts(parseInt(e.target.value, 10) || 1)}
                required
              />
              <span className={styles.suffix}>
                {legType === 'STOCK' ? 'shares' : 'contracts'}
              </span>
            </div>
          </div>
        </div>

        {/* Premium & IV */}
        <div className={styles.rowGroup}>
          <div className={styles.field}>
            <label>{legType === 'STOCK' ? 'Basis Cost' : 'Unit Premium'}</label>
            <div className={styles.inputWrapper}>
              <span className={styles.prefix}>$</span>
              <input
                type="number"
                step="0.05"
                min="0"
                className={styles.hasPrefix}
                value={premium}
                onChange={(e) => setPremium(parseFloat(e.target.value) || 0)}
                required
              />
            </div>
          </div>

          {legType === 'OPTION' && (
            <div className={styles.field}>
              <label>Implied Volatility (IV)</label>
              <div className={styles.inputWrapper}>
                <input
                  type="number"
                  step="1"
                  min="1"
                  max="500"
                  value={ivPercent}
                  className={styles.hasSuffix}
                  onChange={(e) => setIvPercent(parseFloat(e.target.value) || 0)}
                  required
                />
                <span className={styles.suffix}>%</span>
              </div>
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.cancelBtn} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={styles.submitBtn}>
            {editingLeg ? 'Update Leg' : 'Add Leg to Portfolio'}
          </button>
        </div>
      </form>
    </div>
  );
};

export const LegModal: React.FC<LegModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingLeg,
  defaultSpotPrice = 500,
}) => {
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

  if (!isOpen) return null;

  return (
    <Portal>
      <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true">
        <LegModalForm
          key={editingLeg ? editingLeg.id : 'new-leg'}
          onClose={onClose}
          onSave={onSave}
          editingLeg={editingLeg}
          defaultSpotPrice={defaultSpotPrice}
        />
      </div>
    </Portal>
  );
};
