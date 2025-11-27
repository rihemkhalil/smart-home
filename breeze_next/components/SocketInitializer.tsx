'use client';

import { useEffect } from 'react';
import { initializeSocketConnection } from '@/lib/socketClient';

/**
 * This component initializes the Socket.IO connection when mounted.
 * It should be included in a root layout or a high-level layout component.
 */
export default function SocketInitializer() {
  useEffect(() => {
    // Initialize the Socket.IO connection
    initializeSocketConnection()
      .then(() => {
        console.log('Socket connection initialization triggered');
      })
      .catch(error => {
        console.error('Failed to initialize socket connection:', error);
      });
  }, []);

  // This component doesn't render anything
  return null;
}
