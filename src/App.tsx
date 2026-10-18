import React from 'react';
import { PortfolioProvider } from './context/PortfolioContext.tsx';
import { AppLayout } from './components/layout/AppLayout/AppLayout.tsx';

export const App: React.FC = () => {
  return (
    <PortfolioProvider>
      <AppLayout />
    </PortfolioProvider>
  );
};

export default App;
