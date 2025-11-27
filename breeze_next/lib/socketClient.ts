'use client';

import { io, Socket } from 'socket.io-client';

// Singleton instance for Socket.IO client
let socket: Socket | null = null;

/**
 * Initialize and get the Socket.IO client instance
 * This creates a singleton Socket.IO client that can be reused across the application
 */
export function getSocketClient(): Socket {
  if (!socket) {
    // Create new Socket.IO instance
    socket = io('', {
      path: '/api/socket',
      autoConnect: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 20000,
    });
    
    // Set up event listeners for connection status
    socket.on('connect', () => {
      console.log('Socket.IO connected with ID:', socket?.id);
    });
    
    socket.on('disconnect', (reason) => {
      console.log('Socket.IO disconnected:', reason);
    });
    
    socket.on('connect_error', (error) => {
      console.error('Socket.IO connection error:', error);
    });
    
    socket.on('reconnect', (attemptNumber) => {
      console.log(`Socket.IO reconnected after ${attemptNumber} attempts`);
    });
    
    socket.on('reconnect_error', (error) => {
      console.error('Socket.IO reconnection error:', error);
    });
    
    socket.on('reconnect_failed', () => {
      console.error('Socket.IO reconnection failed');
    });
  }
  
  return socket;
}

/**
 * Initialize Socket.IO connection by requesting the server to start the Socket.IO server
 */
export async function initializeSocketConnection(): Promise<void> {
  try {
    // Call the Socket.IO API endpoint to initialize the server-side Socket.IO instance
    const response = await fetch('/api/socket', {
      method: 'GET',
    });
    
    if (!response.ok) {
      console.error('Failed to initialize Socket.IO server:', response.statusText);
      return;
    }
    
    console.log('Socket.IO server initialized');
    
    // Get or create the socket client
    getSocketClient();
  } catch (error) {
    console.error('Error initializing Socket.IO connection:', error);
  }
}

/**
 * Subscribe to a device's stream events
 */
export function subscribeToDevice(deviceId: string): void {
  const socket = getSocketClient();
  socket.emit('subscribeToDevice', deviceId);
  console.log(`Subscribed to device: ${deviceId}`);
}

/**
 * Unsubscribe from a device's stream events
 */
export function unsubscribeFromDevice(deviceId: string): void {
  const socket = getSocketClient();
  socket.emit('unsubscribeFromDevice', deviceId);
  console.log(`Unsubscribed from device: ${deviceId}`);
}
