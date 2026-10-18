import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { usePortfolio } from '../../../context/usePortfolio.ts';
import { usePortfolioAnalytics } from '../../../hooks/usePortfolioAnalytics.ts';
import type { PayoffPoint } from '../../../services/math/payoffCalculator.ts';
import styles from './PayoffChart2D.module.scss';

interface CursorState {
  px: number;
  py: number;
  spot: number;
  point: PayoffPoint;
}

export const PayoffChart2D: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { state } = usePortfolio();
  const { payoffSeries, riskEnvelope, spotPriceRange } = usePortfolioAnalytics();

  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({
    width: 800,
    height: 480,
  });

  const [cursor, setCursor] = useState<CursorState | null>(null);

  // Dynamic Theme state observation
  const [isLightMode, setIsLightMode] = useState<boolean>(() => {
    if (typeof document !== 'undefined') {
      return document.documentElement.getAttribute('data-theme') !== 'dark';
    }
    return true;
  });

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const currentTheme = document.documentElement.getAttribute('data-theme');
      setIsLightMode(currentTheme !== 'dark');
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => observer.disconnect();
  }, []);

  const spotPrice = state.underlying.spotPrice;
  const activeLegs = useMemo(() => state.legs.filter((l) => l.isOpen), [state.legs]);
  const selectedMetric = state.selectedMetric;

  // 1. Observe container dimensions with ResizeObserver
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({
            width: Math.floor(width),
            height: Math.floor(height),
          });
        }
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // 2. Compute dynamic Y-axis bounds based on selectedMetric
  const yBounds = useMemo(() => {
    if (payoffSeries.length === 0) {
      return { minY: -100, maxY: 100 };
    }

    if (selectedMetric === 'PL') {
      let rMin = 0;
      let rMax = 0;
      for (const pt of payoffSeries) {
        if (pt.expirationPl < rMin) rMin = pt.expirationPl;
        if (pt.expirationPl > rMax) rMax = pt.expirationPl;
        if (pt.currentPl < rMin) rMin = pt.currentPl;
        if (pt.currentPl > rMax) rMax = pt.currentPl;
      }
      const range = rMax - rMin || 100;
      const pad = range * 0.15;
      return { minY: rMin - pad, maxY: rMax + pad };
    }

    // GREEKS: 'DELTA', 'GAMMA', 'THETA', 'VEGA'
    const metricKey =
      selectedMetric === 'DELTA'
        ? 'delta'
        : selectedMetric === 'GAMMA'
        ? 'gamma'
        : selectedMetric === 'THETA'
        ? 'theta'
        : 'vega';

    let rMin = Infinity;
    let rMax = -Infinity;
    for (const pt of payoffSeries) {
      const val = pt[metricKey];
      if (val < rMin) rMin = val;
      if (val > rMax) rMax = val;
    }

    if (rMin > 0) rMin = 0;
    if (rMax < 0) rMax = 0;

    const range = rMax - rMin || (selectedMetric === 'GAMMA' ? 0.005 : 10);
    const pad = range * 0.15;
    return { minY: rMin - pad, maxY: rMax + pad };
  }, [payoffSeries, selectedMetric]);

  // 3. Coordinate mapping helpers
  const margins = useMemo(
    () => ({
      top: 38,
      right: 35,
      bottom: 48,
      left: 85,
    }),
    []
  );

  const plotWidth = Math.max(10, dimensions.width - margins.left - margins.right);
  const plotHeight = Math.max(10, dimensions.height - margins.top - margins.bottom);

  const [minX, maxX] = spotPriceRange;

  const xToPx = useCallback(
    (x: number) => {
      const span = maxX - minX || 1;
      return margins.left + ((x - minX) / span) * plotWidth;
    },
    [minX, maxX, margins.left, plotWidth]
  );

  const pxToX = useCallback(
    (px: number) => {
      const span = maxX - minX || 1;
      return minX + ((px - margins.left) / plotWidth) * span;
    },
    [minX, maxX, margins.left, plotWidth]
  );

  const yToPx = useCallback(
    (y: number) => {
      const { minY, maxY } = yBounds;
      const span = maxY - minY || 1;
      return margins.top + plotHeight - ((y - minY) / span) * plotHeight;
    },
    [yBounds, margins.top, plotHeight]
  );

  // 4. Standard Deviation Cones calculations
  const sigmaCones = useMemo(() => {
    const optLegs = activeLegs.filter((l) => l.legType === 'OPTION');
    const avgIv =
      optLegs.length > 0
        ? optLegs.reduce((sum, l) => sum + l.impliedVol, 0) / optLegs.length
        : state.underlying.historicalVol;

    const effectiveVol = Math.max(0.02, avgIv + state.ivShift);
    const effectiveDte = Math.max(0, state.simulationDte);
    const timeYears = effectiveDte / 365;
    const sigmaDollars = spotPrice * effectiveVol * Math.sqrt(timeYears);

    return {
      oneSigmaLower: Math.max(minX, spotPrice - sigmaDollars),
      oneSigmaUpper: Math.min(maxX, spotPrice + sigmaDollars),
      twoSigmaLower: Math.max(minX, spotPrice - 2 * sigmaDollars),
      twoSigmaUpper: Math.min(maxX, spotPrice + 2 * sigmaDollars),
      sigmaDollars,
    };
  }, [activeLegs, state.underlying.historicalVol, state.ivShift, state.simulationDte, spotPrice, minX, maxX]);

  // 5. Draw Canvas Scene
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(dimensions.width * dpr);
    canvas.height = Math.floor(dimensions.height * dpr);

    ctx.save();
    ctx.scale(dpr, dpr);

    const { width, height } = dimensions;

    // Read Theme Colors
    const bgColor = isLightMode ? '#f8fafc' : '#0b0f17';
    const gridColor = isLightMode ? 'rgba(15, 23, 42, 0.07)' : 'rgba(255, 255, 255, 0.06)';
    const textColor = isLightMode ? '#64748b' : '#94a3b8';
    const borderColor = isLightMode ? '#e2e8f0' : '#2d3748';
    const zeroLineColor = isLightMode ? 'rgba(15, 23, 42, 0.35)' : 'rgba(255, 255, 255, 0.35)';
    const zeroTextColor = isLightMode ? '#0f172a' : '#f8fafc';
    const profitColor = isLightMode ? '#16a34a' : '#10b981';
    const lossColor = isLightMode ? '#dc2626' : '#f43f5e';
    const cyanColor = isLightMode ? '#2563eb' : '#38bdf8';
    const amberColor = isLightMode ? '#d97706' : '#f59e0b';
    const badgeBg = isLightMode ? 'rgba(255, 255, 255, 0.95)' : 'rgba(17, 24, 39, 0.95)';

    // Clear background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);

    if (payoffSeries.length === 0) {
      ctx.restore();
      return;
    }

    const { top, left, bottom, right } = margins;
    const pWidth = width - left - right;
    const pHeight = height - top - bottom;
    const zeroY = yToPx(0);

    // --- A. Shaded Profit & Loss Zones (For 'PL' Metric) ---
    if (selectedMetric === 'PL' && zeroY >= top && zeroY <= top + pHeight) {
      // Profit zone (above zero)
      const profitGrad = ctx.createLinearGradient(0, top, 0, zeroY);
      profitGrad.addColorStop(0, isLightMode ? 'rgba(22, 163, 74, 0.08)' : 'rgba(16, 185, 129, 0.08)');
      profitGrad.addColorStop(1, isLightMode ? 'rgba(22, 163, 74, 0.015)' : 'rgba(16, 185, 129, 0.015)');
      ctx.fillStyle = profitGrad;
      ctx.fillRect(left, top, pWidth, zeroY - top);

      // Loss zone (below zero)
      const lossGrad = ctx.createLinearGradient(0, zeroY, 0, top + pHeight);
      lossGrad.addColorStop(0, isLightMode ? 'rgba(220, 38, 38, 0.015)' : 'rgba(244, 63, 94, 0.015)');
      lossGrad.addColorStop(1, isLightMode ? 'rgba(220, 38, 38, 0.08)' : 'rgba(244, 63, 94, 0.08)');
      ctx.fillStyle = lossGrad;
      ctx.fillRect(left, zeroY, pWidth, top + pHeight - zeroY);
    }

    // --- B. Standard Deviation Cones Shading ---
    const s2Left = xToPx(sigmaCones.twoSigmaLower);
    const s2Right = xToPx(sigmaCones.twoSigmaUpper);
    const s1Left = xToPx(sigmaCones.oneSigmaLower);
    const s1Right = xToPx(sigmaCones.oneSigmaUpper);

    // 2-Sigma band (95.4%)
    ctx.fillStyle = isLightMode ? 'rgba(37, 99, 235, 0.035)' : 'rgba(56, 189, 248, 0.035)';
    ctx.fillRect(s2Left, top, s2Right - s2Left, pHeight);

    // 1-Sigma band (68.2%)
    ctx.fillStyle = isLightMode ? 'rgba(37, 99, 235, 0.07)' : 'rgba(56, 189, 248, 0.065)';
    ctx.fillRect(s1Left, top, s1Right - s1Left, pHeight);

    // Dashed lines for sigma edges
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = isLightMode ? 'rgba(37, 99, 235, 0.25)' : 'rgba(56, 189, 248, 0.25)';
    [s2Left, s2Right].forEach((px) => {
      ctx.beginPath();
      ctx.moveTo(px, top);
      ctx.lineTo(px, top + pHeight);
      ctx.stroke();
    });
    ctx.strokeStyle = isLightMode ? 'rgba(37, 99, 235, 0.45)' : 'rgba(56, 189, 248, 0.45)';
    [s1Left, s1Right].forEach((px) => {
      ctx.beginPath();
      ctx.moveTo(px, top);
      ctx.lineTo(px, top + pHeight);
      ctx.stroke();
    });
    ctx.setLineDash([]);

    // Sigma Top Annotation labels (Upgraded to 12px)
    ctx.font = '12px "JetBrains Mono", monospace';
    ctx.fillStyle = cyanColor;
    ctx.textAlign = 'center';
    ctx.fillText('±1σ (68.2%)', (s1Left + s1Right) / 2, top - 12);
    ctx.fillStyle = textColor;
    ctx.fillText('-2σ', s2Left + 16, top - 12);
    ctx.fillText('+2σ', s2Right - 16, top - 12);

    // --- C. Background Grid & Axis Labels ---
    ctx.font = '12px "JetBrains Mono", monospace';
    ctx.lineWidth = 1;

    // Y-Axis Ticks & Gridlines
    const yTickCount = 7;
    const { minY, maxY } = yBounds;
    const yStep = (maxY - minY) / (yTickCount - 1);

    for (let i = 0; i < yTickCount; i++) {
      const val = minY + i * yStep;
      const py = yToPx(val);

      if (py < top || py > top + pHeight) continue;

      // Grid line
      ctx.strokeStyle = gridColor;
      ctx.beginPath();
      ctx.moveTo(left, py);
      ctx.lineTo(left + pWidth, py);
      ctx.stroke();

      // Label
      ctx.fillStyle = textColor;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';

      const formatYValue = (v: number): string => {
        if (selectedMetric === 'PL') {
          const sign = v >= 0 ? '+' : '-';
          return `${sign}$${Math.abs(v).toFixed(0)}`;
        }
        if (selectedMetric === 'DELTA') {
          return `${v.toFixed(1)} Δ`;
        }
        if (selectedMetric === 'GAMMA') {
          return `${v.toFixed(4)} Γ`;
        }
        if (selectedMetric === 'THETA') {
          return `${v >= 0 ? '+' : ''}$${v.toFixed(1)}`;
        }
        return `${v >= 0 ? '+' : ''}${v.toFixed(1)} ν`;
      };

      const formatted = formatYValue(val);
      ctx.fillText(formatted, left - 10, py);
    }

    // X-Axis Ticks & Gridlines
    const xTickCount = 9;
    const xStep = (maxX - minX) / (xTickCount - 1);

    for (let i = 0; i < xTickCount; i++) {
      const sVal = minX + i * xStep;
      const px = xToPx(sVal);

      if (px < left || px > left + pWidth) continue;

      // Grid line
      ctx.strokeStyle = gridColor;
      ctx.beginPath();
      ctx.moveTo(px, top);
      ctx.lineTo(px, top + pHeight);
      ctx.stroke();

      // Label (Upgraded to 12px)
      ctx.fillStyle = textColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(`$${sVal.toFixed(0)}`, px, top + pHeight + 10);
    }

    // Prominent Zero Line (y = 0)
    if (zeroY >= top && zeroY <= top + pHeight) {
      ctx.strokeStyle = zeroLineColor;
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(left, zeroY);
      ctx.lineTo(left + pWidth, zeroY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = zeroTextColor;
      ctx.font = 'bold 12px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText('$0.00', left - 10, zeroY);
    }

    // Plot Border
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(left, top, pWidth, pHeight);

    // --- D. Strike Pins & Landmarks ---
    activeLegs.forEach((leg) => {
      const strikePx = xToPx(leg.strike);
      if (strikePx >= left && strikePx <= left + pWidth) {
        const isStock = leg.legType === 'STOCK';
        const color = isStock
          ? (isLightMode ? '#7c3aed' : '#a855f7')
          : leg.type === 'CALL'
          ? profitColor
          : lossColor;

        // Vertical dashed strike line
        ctx.strokeStyle = color;
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(strikePx, top);
        ctx.lineTo(strikePx, top + pHeight);
        ctx.stroke();
        ctx.setLineDash([]);

        // Strike Pin Badge at bottom (Upgraded to 12px)
        const label = isStock ? `STK $${leg.strike}` : `${leg.strike}${leg.type[0]}`;
        ctx.font = 'bold 11px "JetBrains Mono", monospace';
        const textWidth = ctx.measureText(label).width;

        ctx.fillStyle = badgeBg;
        ctx.fillRect(strikePx - textWidth / 2 - 4, top + pHeight - 18, textWidth + 8, 16);
        ctx.strokeStyle = color;
        ctx.strokeRect(strikePx - textWidth / 2 - 4, top + pHeight - 18, textWidth + 8, 16);

        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, strikePx, top + pHeight - 10);
      }
    });

    // Current Spot Price Line (S0)
    const spotPx = xToPx(spotPrice);
    if (spotPx >= left && spotPx <= left + pWidth) {
      ctx.strokeStyle = cyanColor;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(spotPx, top);
      ctx.lineTo(spotPx, top + pHeight);
      ctx.stroke();

      // Spot Marker Tag at top (Upgraded to 12px)
      const spotTag = `$${spotPrice.toFixed(2)} S₀`;
      ctx.font = 'bold 11px "JetBrains Mono", monospace';
      const tagWidth = ctx.measureText(spotTag).width;

      ctx.fillStyle = cyanColor;
      ctx.fillRect(spotPx - tagWidth / 2 - 5, top + 2, tagWidth + 10, 16);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(spotTag, spotPx, top + 10);
    }

    // Breakeven Point Nodes on Zero Line (for 'PL')
    if (selectedMetric === 'PL' && zeroY >= top && zeroY <= top + pHeight) {
      riskEnvelope.expirationBreakevens.forEach((be) => {
        const bePx = xToPx(be);
        if (bePx >= left && bePx <= left + pWidth) {
          // Amber Node Circle
          ctx.beginPath();
          ctx.arc(bePx, zeroY, 5, 0, Math.PI * 2);
          ctx.fillStyle = amberColor;
          ctx.fill();
          ctx.strokeStyle = isLightMode ? '#ffffff' : '#0b0f17';
          ctx.lineWidth = 2;
          ctx.stroke();

          // Amber Breakeven Price Tag (Upgraded to 12px)
          ctx.font = 'bold 12px "JetBrains Mono", monospace';
          const beText = `$${be.toFixed(2)}`;
          ctx.fillStyle = amberColor;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(beText, bePx, zeroY - 8);
        }
      });
    }

    // --- E. Payoff Curve Rendering ---
    if (selectedMetric === 'PL') {
      // 1. Expiration Payoff (T=0) - Dashed Slate Line
      ctx.strokeStyle = isLightMode ? '#64748b' : '#94a3b8';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      let started = false;

      for (const pt of payoffSeries) {
        const px = xToPx(pt.spot);
        const py = yToPx(pt.expirationPl);
        if (!started) {
          ctx.moveTo(px, py);
          started = true;
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // 2. Model Intermediate Payoff (T=simDte) - Solid Glowing Cyan Line
      ctx.save();
      ctx.strokeStyle = cyanColor;
      ctx.lineWidth = 2.8;
      ctx.shadowColor = cyanColor;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      started = false;

      for (const pt of payoffSeries) {
        const px = xToPx(pt.spot);
        const py = yToPx(pt.currentPl);
        if (!started) {
          ctx.moveTo(px, py);
          started = true;
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.stroke();
      ctx.restore();
    } else {
      // Selected Greek Curve
      const metricConfig = {
        DELTA: { key: 'delta', color: cyanColor, label: 'Delta' },
        GAMMA: { key: 'gamma', color: isLightMode ? '#7c3aed' : '#a855f7', label: 'Gamma' },
        THETA: { key: 'theta', color: profitColor, label: 'Theta' },
        VEGA: { key: 'vega', color: amberColor, label: 'Vega' },
      }[selectedMetric];

      const key = metricConfig.key as keyof PayoffPoint;
      const color = metricConfig.color;

      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.8;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      let started = false;

      for (const pt of payoffSeries) {
        const px = xToPx(pt.spot);
        const py = yToPx(Number(pt[key]));
        if (!started) {
          ctx.moveTo(px, py);
          started = true;
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.stroke();
      ctx.restore();
    }

    // --- F. Cursor Crosshair & Snapping Node ---
    if (cursor) {
      const cx = cursor.px;
      const cy = cursor.py;

      if (cx >= left && cx <= left + pWidth && cy >= top && cy <= top + pHeight) {
        // Vertical cursor guide
        ctx.strokeStyle = cyanColor;
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(cx, top);
        ctx.lineTo(cx, top + pHeight);
        ctx.stroke();

        // Horizontal model guide snapped to current model curve
        const modelYVal =
          selectedMetric === 'PL'
            ? cursor.point.currentPl
            : cursor.point[
                selectedMetric === 'DELTA'
                  ? 'delta'
                  : selectedMetric === 'GAMMA'
                  ? 'gamma'
                  : selectedMetric === 'THETA'
                  ? 'theta'
                  : 'vega'
              ];
        const snappedY = yToPx(Number(modelYVal));

        ctx.beginPath();
        ctx.moveTo(left, snappedY);
        ctx.lineTo(left + pWidth, snappedY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Intersection Glowing Node
        ctx.beginPath();
        ctx.arc(cx, snappedY, 5.5, 0, Math.PI * 2);
        ctx.fillStyle = cyanColor;
        ctx.shadowColor = cyanColor;
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.strokeStyle = isLightMode ? '#ffffff' : '#07090e';
        ctx.lineWidth = 2.2;
        ctx.stroke();
      }
    }

    ctx.restore();
  }, [
    dimensions,
    payoffSeries,
    selectedMetric,
    yBounds,
    margins,
    xToPx,
    yToPx,
    sigmaCones,
    activeLegs,
    spotPrice,
    riskEnvelope.expirationBreakevens,
    minX,
    maxX,
    cursor,
    isLightMode,
  ]);

  // 6. Handle Mouse Scrubbing
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const { left, right } = margins;
    const pWidth = dimensions.width - left - right;

    if (mouseX < left || mouseX > left + pWidth || payoffSeries.length === 0) {
      setCursor(null);
      return;
    }

    const currentSpot = pxToX(mouseX);

    // Find closest point in series
    let closest = payoffSeries[0];
    let minDiff = Math.abs(closest.spot - currentSpot);

    for (const pt of payoffSeries) {
      const diff = Math.abs(pt.spot - currentSpot);
      if (diff < minDiff) {
        minDiff = diff;
        closest = pt;
      }
    }

    setCursor({
      px: mouseX,
      py: mouseY,
      spot: closest.spot,
      point: closest,
    });
  };

  const handlePointerLeave = () => {
    setCursor(null);
  };

  // Determine Tooltip alignment to avoid clipping screen edges
  const hudAlignmentClass = useMemo(() => {
    if (!cursor) return '';
    const isNearRight = cursor.px > dimensions.width - 270;
    const isNearBottom = cursor.py > dimensions.height - 200;

    if (isNearRight && isNearBottom) return styles.alignLeftTop;
    if (isNearRight) return styles.alignLeft;
    if (isNearBottom) return styles.alignTop;
    return '';
  }, [cursor, dimensions]);

  // Compute cursor spot difference from current spot
  const spotDiffPercent = cursor
    ? (((cursor.spot - spotPrice) / spotPrice) * 100).toFixed(1)
    : '0.0';

  return (
    <div className={styles.chartWrapper}>
      <div className={styles.canvasContainer} ref={containerRef}>
        <canvas
          ref={canvasRef}
          className={styles.chartCanvas}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
        />

        {/* Floating Quant HUD Tooltip */}
        {cursor && (
          <div
            className={`${styles.hudTooltip} ${hudAlignmentClass}`}
            style={{
              left: `${cursor.px}px`,
              top: `${cursor.py}px`,
            }}
          >
            <div className={styles.hudHeader}>
              <div className={styles.spotGroup}>
                <span className={styles.spotValue}>${cursor.spot.toFixed(2)}</span>
                <span
                  className={`${styles.spotDiff} ${
                    Number(spotDiffPercent) > 0
                      ? styles.up
                      : Number(spotDiffPercent) < 0
                      ? styles.down
                      : styles.neutral
                  }`}
                >
                  {Number(spotDiffPercent) > 0 ? '+' : ''}
                  {spotDiffPercent}%
                </span>
              </div>
              <span className={styles.horizonTag}>T={state.simulationDte}d</span>
            </div>

            <div className={styles.hudPlSection}>
              <div className={styles.plRow}>
                <span className={styles.plLabel}>Model P&L:</span>
                <span
                  className={`${styles.plValue} ${
                    cursor.point.currentPl >= 0 ? styles.profit : styles.loss
                  }`}
                >
                  {cursor.point.currentPl >= 0 ? '+' : '-'}$
                  {Math.abs(cursor.point.currentPl).toFixed(2)}
                </span>
              </div>
              <div className={styles.plRow}>
                <span className={styles.plLabel}>Expiry P&L:</span>
                <span
                  className={`${styles.plValue} ${
                    cursor.point.expirationPl >= 0 ? styles.profit : styles.loss
                  }`}
                >
                  {cursor.point.expirationPl >= 0 ? '+' : '-'}$
                  {Math.abs(cursor.point.expirationPl).toFixed(2)}
                </span>
              </div>
            </div>

            <div className={styles.hudGreeksGrid}>
              <div className={styles.greekItem}>
                <span className={styles.gSym}>Δ Delta:</span>
                <span className={styles.gVal}>{cursor.point.delta.toFixed(1)}</span>
              </div>
              <div className={styles.greekItem}>
                <span className={styles.gSym}>Γ Gamma:</span>
                <span className={styles.gVal}>{cursor.point.gamma.toFixed(4)}</span>
              </div>
              <div className={styles.greekItem}>
                <span className={styles.gSym}>Θ Theta:</span>
                <span className={styles.gVal}>
                  {cursor.point.theta >= 0 ? '+' : '-'}$
                  {Math.abs(cursor.point.theta).toFixed(1)}
                </span>
              </div>
              <div className={styles.greekItem}>
                <span className={styles.gSym}>ν Vega:</span>
                <span className={styles.gVal}>
                  {cursor.point.vega >= 0 ? '+' : '-'}$
                  {Math.abs(cursor.point.vega).toFixed(1)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Mini-Summary Risk Dock */}
      <div className={styles.summaryDock}>
        <div className={styles.dockGroup}>
          <div className={styles.dockCard}>
            <span className={styles.dockLabel}>Breakevens (T=0)</span>
            <div className={styles.bePills}>
              {riskEnvelope.expirationBreakevens.length > 0 ? (
                riskEnvelope.expirationBreakevens.map((be) => (
                  <span key={be} className={styles.bePill}>
                    ${be.toFixed(2)}
                  </span>
                ))
              ) : (
                <span className={styles.nonePill}>None</span>
              )}
            </div>
          </div>

          <div className={styles.dockCard}>
            <span className={styles.dockLabel}>Max Profit</span>
            <span className={`${styles.dockValue} ${styles.profit}`}>
              {riskEnvelope.maxProfit === 'UNLIMITED'
                ? 'UNLIMITED'
                : `+$${riskEnvelope.maxProfit.toFixed(2)}`}
            </span>
          </div>

          <div className={styles.dockCard}>
            <span className={styles.dockLabel}>Max Loss</span>
            <span className={`${styles.dockValue} ${styles.loss}`}>
              {riskEnvelope.maxLoss === 'UNLIMITED'
                ? 'UNLIMITED'
                : `-$${riskEnvelope.maxLoss.toFixed(2)}`}
            </span>
          </div>

          <div className={styles.dockCard}>
            <span className={styles.dockLabel}>Margin Required</span>
            <span className={`${styles.dockValue} ${styles.cyan}`}>
              ${riskEnvelope.marginRequired.toLocaleString('en-US', {
                minimumFractionDigits: 2,
              })}
            </span>
          </div>

          <div className={styles.dockCard}>
            <span className={styles.dockLabel}>ROC</span>
            <span className={`${styles.dockValue} ${styles.amber}`}>
              {riskEnvelope.returnOnCapital !== null
                ? `${riskEnvelope.returnOnCapital}%`
                : 'N/A'}
            </span>
          </div>
        </div>

        {/* Legend */}
        <div className={styles.legend}>
          {selectedMetric === 'PL' ? (
            <>
              <div className={styles.legendItem}>
                <span className={`${styles.lineSample} ${styles.curLine}`} />
                <span>Model (T={state.simulationDte}d)</span>
              </div>
              <div className={styles.legendItem}>
                <span className={`${styles.lineSample} ${styles.expLine}`} />
                <span>Expiry (T=0)</span>
              </div>
            </>
          ) : (
            <div className={styles.legendItem}>
              <span className={`${styles.lineSample} ${styles.greekLine}`} />
              <span>{selectedMetric} Surface</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
