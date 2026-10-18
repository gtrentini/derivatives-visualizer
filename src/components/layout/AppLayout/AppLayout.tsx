import React from 'react';
import { Header } from '../../common/Header/Header.tsx';
import { Sidebar } from '../../common/Sidebar/Sidebar.tsx';
import { SimulationBar } from '../../common/Controls/SimulationBar.tsx';
import { VisualizerContainer } from '../../visualizer/VisualizerContainer.tsx';
import styles from './AppLayout.module.scss';

export const AppLayout: React.FC = () => {
  return (
    <div className={styles.appLayout}>
      <Header />
      <div className={styles.mainShell}>
        <Sidebar />
        <main className={styles.contentArea}>
          <SimulationBar />
          <VisualizerContainer />
        </main>
      </div>
    </div>
  );
};
