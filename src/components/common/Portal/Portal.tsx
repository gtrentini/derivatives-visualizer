import React, { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

interface PortalProps {
  children: React.ReactNode;
}

const emptySubscribe = () => () => {};

export const Portal: React.FC<PortalProps> = ({ children }) => {
  const isMounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  if (!isMounted || typeof document === 'undefined') {
    return null;
  }

  return createPortal(children, document.body);
};
