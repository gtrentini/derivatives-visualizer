import React, { useState } from 'react';
import { Plus, Trash2, Eye, EyeOff, Edit3, Layers } from 'lucide-react';
import { usePortfolio } from '../../../context/usePortfolio.ts';
import type { OptionLeg, StrategyPreset } from '../../../types/derivatives.ts';
import { STRATEGY_PRESETS } from '../../../utils/presets.ts';
import { LegModal } from '../Modal/LegModal.tsx';
import styles from './Sidebar.module.scss';

export const Sidebar: React.FC = () => {
  const {
    state,
    loadPreset,
    addLeg,
    updateLeg,
    removeLeg,
    toggleLeg,
  } = usePortfolio();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLeg, setEditingLeg] = useState<OptionLeg | null>(null);

  const handleOpenAddModal = () => {
    setEditingLeg(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (leg: OptionLeg) => {
    setEditingLeg(leg);
    setIsModalOpen(true);
  };

  const handleSaveLeg = (leg: OptionLeg) => {
    if (editingLeg) {
      updateLeg(leg);
    } else {
      addLeg(leg);
    }
  };

  return (
    <aside className={styles.sidebar}>
      {/* Strategy Presets Grid */}
      <div className={styles.presetsSection}>
        <div className={styles.sectionHeader}>
          <span className={styles.title}>Strategy Presets</span>
          <span className={styles.presetBadge}>
            {state.activeStrategy === 'CUSTOM' ? 'CUSTOM ARCH' : 'STANDARDIZED'}
          </span>
        </div>

        <div className={styles.presetGrid}>
          {STRATEGY_PRESETS.map((preset) => {
            const isActive = state.activeStrategy === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                className={`${styles.presetBtn} ${isActive ? styles.active : ''}`}
                onClick={() => loadPreset(preset.id as StrategyPreset)}
              >
                <span className={styles.presetName}>{preset.label}</span>
                <span className={styles.presetSentiment}>{preset.sentiment}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Leg Inventory */}
      <div className={styles.inventorySection}>
        <div className={styles.inventoryHeader}>
          <div className={styles.titleGroup}>
            <span className={styles.title}>Leg Inventory</span>
            <span className={styles.countBadge}>{state.legs.length}</span>
          </div>

          <button
            type="button"
            className={styles.addLegBtn}
            onClick={handleOpenAddModal}
          >
            <Plus size={14} />
            <span>Add Leg</span>
          </button>
        </div>

        <div className={styles.legList}>
          {state.legs.length === 0 ? (
            <div className={styles.emptyState}>
              <Layers size={32} />
              <p>No active derivative legs. Choose a preset or add a custom leg.</p>
            </div>
          ) : (
            state.legs.map((leg) => {
              const isOption = leg.legType === 'OPTION';
              const sideClass =
                leg.side === 'LONG' ? styles.long : styles.short;
              const typeClass =
                leg.legType === 'STOCK'
                  ? styles.stock
                  : leg.type === 'CALL'
                  ? styles.call
                  : styles.put;

              return (
                <div
                  key={leg.id}
                  className={`${styles.legCard} ${!leg.isOpen ? styles.inactive : ''}`}
                >
                  <div className={styles.cardTop}>
                    <div className={styles.badgesGroup}>
                      <span className={`${styles.sideBadge} ${sideClass}`}>
                        {leg.side}
                      </span>
                      <span className={`${styles.typeBadge} ${typeClass}`}>
                        {leg.legType === 'STOCK' ? 'STOCK' : leg.type}
                      </span>
                      <span className={styles.strikeHighlight}>
                        ${leg.strike.toFixed(2)}
                      </span>
                    </div>

                    <div className={styles.cardActions}>
                      <button
                        type="button"
                        className={`${styles.actionIconBtn} ${
                          leg.isOpen ? styles.activeToggle : ''
                        }`}
                        onClick={() => toggleLeg(leg.id)}
                        title={leg.isOpen ? 'Disable leg in model' : 'Enable leg in model'}
                      >
                        {leg.isOpen ? <Eye size={15} /> : <EyeOff size={15} />}
                      </button>

                      <button
                        type="button"
                        className={styles.actionIconBtn}
                        onClick={() => handleOpenEditModal(leg)}
                        title="Edit leg parameters"
                      >
                        <Edit3 size={15} />
                      </button>

                      <button
                        type="button"
                        className={`${styles.actionIconBtn} ${styles.deleteBtn}`}
                        onClick={() => removeLeg(leg.id)}
                        title="Remove leg"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  <div className={styles.cardGrid}>
                    <div className={styles.gridItem}>
                      <span className={styles.itemLabel}>Horizon</span>
                      <span className={styles.itemValue}>
                        {isOption ? `${leg.expirationDays}d` : 'Shares'}
                      </span>
                    </div>

                    <div className={styles.gridItem}>
                      <span className={styles.itemLabel}>Qty</span>
                      <span className={styles.itemValue}>
                        {leg.contracts}x
                      </span>
                    </div>

                    <div className={styles.gridItem}>
                      <span className={styles.itemLabel}>Premium</span>
                      <span className={styles.itemValue}>
                        ${leg.premium.toFixed(2)}
                      </span>
                    </div>

                    <div className={styles.gridItem}>
                      <span className={styles.itemLabel}>IV</span>
                      <span className={styles.itemValue}>
                        {isOption ? `${(leg.impliedVol * 100).toFixed(0)}%` : '—'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Leg Modal for Add / Edit */}
      <LegModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveLeg}
        editingLeg={editingLeg}
        defaultSpotPrice={state.underlying.spotPrice}
      />
    </aside>
  );
};
