import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Grid, Eye, RotateCcw } from 'lucide-react';
import { usePortfolio } from '../../../context/usePortfolio.ts';
import { calculateBlackScholes } from '../../../services/math/blackScholes.ts';
import styles from './SurfaceChart3D.module.scss';

interface HoveredPointInfo {
  screenX: number;
  screenY: number;
  spot: number;
  dte: number;
  value: number;
}

export const SurfaceChart3D: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { state } = usePortfolio();

  const [wireframe, setWireframe] = useState<boolean>(false);
  const [showZeroPlane, setShowZeroPlane] = useState<boolean>(true);
  const [hoverInfo, setHoverInfo] = useState<HoveredPointInfo | null>(null);

  const { spotPrice, riskFreeRate, dividendYield } = state.underlying;
  const { legs, simulationDte, ivShift, selectedMetric } = state;

  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const surfaceMeshRef = useRef<THREE.Mesh | null>(null);
  const zeroPlaneGroupRef = useRef<THREE.Group | null>(null);
  const hitMarkerRef = useRef<THREE.Mesh | null>(null);

  // Reset Camera View Handler
  const handleResetCamera = useCallback(() => {
    if (cameraRef.current && controlsRef.current) {
      cameraRef.current.position.set(24, 18, 28);
      cameraRef.current.lookAt(0, 0, 0);
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
  }, []);

  // Update Wireframe Material toggle
  useEffect(() => {
    if (surfaceMeshRef.current) {
      const mat = surfaceMeshRef.current.material as THREE.MeshStandardMaterial;
      if (mat) {
        mat.wireframe = wireframe;
        mat.needsUpdate = true;
      }
    }
  }, [wireframe]);

  // Update Zero Plane visibility toggle
  useEffect(() => {
    if (zeroPlaneGroupRef.current) {
      zeroPlaneGroupRef.current.visible = showZeroPlane;
    }
  }, [showZeroPlane]);

  // Three.js Scene Initialization and Rendering
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 500;

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(24, 18, 28);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    // 2. OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 + 0.15;
    controlsRef.current = controls;

    // 3. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.85);
    dirLight1.position.set(25, 45, 25);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x38bdf8, 0.35);
    dirLight2.position.set(-25, -20, -25);
    scene.add(dirLight2);

    // 4. Build 3D Surface Parametric Geometry (45 x 45 resolution)
    const resX = 45;
    const resZ = 45;
    const boxWidth = 24;
    const boxDepth = 24;
    const boxHeight = 12;

    const minSpot = spotPrice * 0.75;
    const maxSpot = spotPrice * 1.25;
    const minDte = 1;
    const maxDte = Math.max(simulationDte, 60);

    const activeLegs = legs.filter((l) => l.isOpen);

    // Evaluate surface points
    const valuesGrid: number[][] = [];
    let absMaxVal = 0.001;

    for (let i = 0; i < resX; i++) {
      valuesGrid[i] = [];
      const s = minSpot + (i / (resX - 1)) * (maxSpot - minSpot);

      for (let j = 0; j < resZ; j++) {
        const d = minDte + (j / (resZ - 1)) * (maxDte - minDte);
        const timeYears = d / 365;

        let totalMetricVal = 0;

        for (const leg of activeLegs) {
          const sideSign = leg.side === 'LONG' ? 1 : -1;

          if (leg.legType === 'STOCK') {
            const shares = leg.contracts;
            if (selectedMetric === 'PL') {
              totalMetricVal += (s - leg.strike) * shares * sideSign;
            } else if (selectedMetric === 'DELTA') {
              totalMetricVal += shares * sideSign;
            }
          } else {
            // Option
            const contracts = leg.contracts;
            const multiplier = contracts * 100 * sideSign;
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

            if (selectedMetric === 'PL') {
              totalMetricVal += (bsm.price - leg.premium) * multiplier;
            } else if (selectedMetric === 'DELTA') {
              totalMetricVal += bsm.delta * multiplier;
            } else if (selectedMetric === 'GAMMA') {
              totalMetricVal += bsm.gamma * multiplier;
            } else if (selectedMetric === 'THETA') {
              totalMetricVal += bsm.theta * multiplier;
            } else if (selectedMetric === 'VEGA') {
              totalMetricVal += bsm.vega * multiplier;
            }
          }
        }

        valuesGrid[i][j] = totalMetricVal;
        if (Math.abs(totalMetricVal) > absMaxVal) {
          absMaxVal = Math.abs(totalMetricVal);
        }
      }
    }

    // Generate Vertex Coordinates and Colors
    const positions: number[] = [];
    const colors: number[] = [];
    const colorProfit = new THREE.Color(0x10b981); // Emerald
    const colorCyan = new THREE.Color(0x38bdf8);   // Cyan
    const colorNeutral = new THREE.Color(0x475569);// Slate
    const colorLoss = new THREE.Color(0xf43f5e);   // Rose / Crimson

    for (let i = 0; i < resX; i++) {
      const xPct = i / (resX - 1);
      const xCoord = (xPct - 0.5) * boxWidth;

      for (let j = 0; j < resZ; j++) {
        const zPct = j / (resZ - 1);
        const zCoord = (zPct - 0.5) * boxDepth;
        const v = valuesGrid[i][j];

        // Normalized Y-elevation
        const yCoord = (v / absMaxVal) * (boxHeight / 2);

        positions.push(xCoord, yCoord, zCoord);

        // Gradient coloring
        const vertexColor = new THREE.Color();
        if (v >= 0) {
          const ratio = Math.min(1, v / absMaxVal);
          vertexColor.lerpColors(colorCyan, colorProfit, ratio);
        } else {
          const ratio = Math.min(1, Math.abs(v) / absMaxVal);
          vertexColor.lerpColors(colorNeutral, colorLoss, ratio);
        }
        colors.push(vertexColor.r, vertexColor.g, vertexColor.b);
      }
    }

    // Generate Triangle Indices
    const indices: number[] = [];
    for (let i = 0; i < resX - 1; i++) {
      for (let j = 0; j < resZ - 1; j++) {
        const a = i * resZ + j;
        const b = (i + 1) * resZ + j;
        const c = (i + 1) * resZ + (j + 1);
        const d = i * resZ + (j + 1);

        indices.push(a, b, d);
        indices.push(b, c, d);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.35,
      metalness: 0.15,
      side: THREE.DoubleSide,
      wireframe,
    });

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    surfaceMeshRef.current = mesh;

    // 5. Zero-Plane Helper Elements
    const zeroPlaneGroup = new THREE.Group();

    // Zero-Plane Grid
    const gridHelper = new THREE.GridHelper(boxWidth, 12, 0x00e5ff, 0x334155);
    gridHelper.position.y = 0;
    zeroPlaneGroup.add(gridHelper);

    // Translucent Sheet at Y=0
    const planeGeo = new THREE.PlaneGeometry(boxWidth, boxDepth);
    const planeMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.05,
      side: THREE.DoubleSide,
    });
    const zeroSheet = new THREE.Mesh(planeGeo, planeMat);
    zeroSheet.rotation.x = -Math.PI / 2;
    zeroPlaneGroup.add(zeroSheet);

    zeroPlaneGroup.visible = showZeroPlane;
    scene.add(zeroPlaneGroup);
    zeroPlaneGroupRef.current = zeroPlaneGroup;

    // 6. Interactive Raycast Hit Marker
    const markerGeo = new THREE.SphereGeometry(0.35, 16, 16);
    const markerMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff });
    const hitMarker = new THREE.Mesh(markerGeo, markerMat);
    hitMarker.visible = false;
    scene.add(hitMarker);
    hitMarkerRef.current = hitMarker;

    // 7. Raycaster Setup for Mouse Interaction
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handlePointerMove = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObject(mesh);

      if (intersects.length > 0) {
        const hit = intersects[0];
        hitMarker.position.copy(hit.point);
        hitMarker.visible = true;

        // Map back 3D X & Z coordinates to Spot and DTE
        const normX = hit.point.x / boxWidth + 0.5;
        const normZ = hit.point.z / boxDepth + 0.5;

        const evaluatedSpot = minSpot + Math.max(0, Math.min(1, normX)) * (maxSpot - minSpot);
        const evaluatedDte = minDte + Math.max(0, Math.min(1, normZ)) * (maxDte - minDte);

        // Approximate value from Y coordinate
        const evaluatedVal = (hit.point.y / (boxHeight / 2)) * absMaxVal;

        setHoverInfo({
          screenX: e.clientX - rect.left,
          screenY: e.clientY - rect.top,
          spot: evaluatedSpot,
          dte: evaluatedDte,
          value: evaluatedVal,
        });
      } else {
        hitMarker.visible = false;
        setHoverInfo(null);
      }
    };

    const handlePointerLeave = () => {
      hitMarker.visible = false;
      setHoverInfo(null);
    };

    const domElement = renderer.domElement;
    domElement.addEventListener('mousemove', handlePointerMove);
    domElement.addEventListener('mouseleave', handlePointerLeave);

    // 8. ResizeObserver
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: newWidth, height: newHeight } = entry.contentRect;
        if (newWidth > 0 && newHeight > 0) {
          camera.aspect = newWidth / newHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(newWidth, newHeight);
        }
      }
    });
    resizeObserver.observe(container);

    // 9. Animation Loop
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // 10. Clean Cleanup on Unmount
    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();

      domElement.removeEventListener('mousemove', handlePointerMove);
      domElement.removeEventListener('mouseleave', handlePointerLeave);

      geometry.dispose();
      material.dispose();
      planeGeo.dispose();
      planeMat.dispose();
      markerGeo.dispose();
      markerMat.dispose();
      renderer.dispose();

      if (domElement.parentElement) {
        domElement.parentElement.removeChild(domElement);
      }
    };
  }, [
    spotPrice,
    riskFreeRate,
    dividendYield,
    legs,
    simulationDte,
    ivShift,
    selectedMetric,
    wireframe,
    showZeroPlane,
  ]);

  const metricLabel = {
    PL: 'Model P&L ($)',
    DELTA: 'Delta (Δ)',
    GAMMA: 'Gamma (Γ)',
    THETA: 'Theta (Θ/d)',
    VEGA: 'Vega (ν/1%)',
  }[selectedMetric];

  return (
    <div className={styles.surfaceContainer}>
      {/* 3D Surface Floating Toolbar */}
      <div className={styles.floatingToolbar}>
        <button
          type="button"
          className={`${styles.toolBtn} ${wireframe ? styles.active : ''}`}
          onClick={() => setWireframe((prev) => !prev)}
          title="Toggle wireframe rendering"
        >
          <Grid size={14} />
          <span>Wireframe</span>
        </button>

        <button
          type="button"
          className={`${styles.toolBtn} ${showZeroPlane ? styles.active : ''}`}
          onClick={() => setShowZeroPlane((prev) => !prev)}
          title="Toggle zero threshold plane"
        >
          <Eye size={14} />
          <span>Zero Plane</span>
        </button>

        <button
          type="button"
          className={styles.toolBtn}
          onClick={handleResetCamera}
          title="Reset camera view"
        >
          <RotateCcw size={14} />
          <span>Reset View</span>
        </button>
      </div>

      {/* 3D Canvas Mount */}
      <div className={styles.canvasWrapper} ref={containerRef}>
        {/* Floating Raycast 3D HUD Tooltip */}
        {hoverInfo && (
          <div
            className={styles.hud3D}
            style={{
              left: `${hoverInfo.screenX}px`,
              top: `${hoverInfo.screenY}px`,
            }}
          >
            <div className={styles.hudHeader}>
              <span className={styles.hudTitle}>3D Mesh Coordinate</span>
              <span className={styles.coordBadge}>T={hoverInfo.dte.toFixed(0)}d</span>
            </div>

            <div className={styles.hudRow}>
              <span className={styles.rowKey}>Spot Price (S):</span>
              <span className={styles.rowVal}>${hoverInfo.spot.toFixed(2)}</span>
            </div>

            <div className={styles.hudRow}>
              <span className={styles.rowKey}>Time Horizon (t):</span>
              <span className={styles.rowVal}>{hoverInfo.dte.toFixed(1)} Days</span>
            </div>

            <div className={styles.hudRow}>
              <span className={styles.rowKey}>{metricLabel}:</span>
              <span
                className={`${styles.rowVal} ${
                  hoverInfo.value >= 0 ? styles.profit : styles.loss
                }`}
              >
                {selectedMetric === 'PL'
                  ? `${hoverInfo.value >= 0 ? '+' : '-'}$${Math.abs(hoverInfo.value).toFixed(2)}`
                  : hoverInfo.value.toFixed(selectedMetric === 'GAMMA' ? 4 : 2)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Coordinate Space Legend */}
      <div className={styles.bottomInfo}>
        <div className={styles.axisInfo}>
          <span className={`${styles.axisDot} ${styles.x}`} />
          <span>X: Underlying Spot</span>
        </div>
        <div className={styles.axisInfo}>
          <span className={`${styles.axisDot} ${styles.y}`} />
          <span>Y: {metricLabel}</span>
        </div>
        <div className={styles.axisInfo}>
          <span className={`${styles.axisDot} ${styles.z}`} />
          <span>Z: Horizon (DTE)</span>
        </div>
      </div>
    </div>
  );
};
