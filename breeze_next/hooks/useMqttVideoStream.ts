'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export interface VideoFrame {
  deviceId: string;
  timestamp: number;
  data: string; // base64 encoded
  metadata?: {
    width?: number;
    height?: number;
    format?: string;
  };
}

export function useMqttVideoStream(deviceId: string) {
  const [isConnected, setIsConnected] = useState(false);
  const [latestFrame, setLatestFrame] = useState<VideoFrame | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ frameCount: 0, fps: 0 });
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(Date.now());
  const connectedRef = useRef(false);

  // FPS calculation
  useEffect(() => {
    const fpsInterval = setInterval(() => {
      const currentTime = Date.now();
      const elapsed = (currentTime - lastTimeRef.current) / 1000;
      const currentFps = frameCountRef.current / elapsed;
      
      setStats(prev => ({
        ...prev,
        fps: Math.round(currentFps)
      }));
      
      frameCountRef.current = 0;
      lastTimeRef.current = currentTime;
    }, 1000);
    
    return () => clearInterval(fpsInterval);
  }, []);

  // Connect to the video stream API using HTTP polling
  const connect = useCallback(() => {
    if (!deviceId) {
      setError('Device ID is required');
      return;
    }

    // Clear any existing polling
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    // Mark as connected
    setIsConnected(true);
    connectedRef.current = true;
    setError(null);
    console.log(`🔌 Starting video stream polling for device: ${deviceId}`);

    // Set up polling interval to fetch frames
    const pollFrames = async () => {
      try {
        if (!connectedRef.current) return;

        const response = await fetch(`/api/stream/mqtt-ws?deviceId=${deviceId}`);
        
        if (!response.ok) {
          if (response.status === 404) {
            // No frames yet, just wait
            return;
          }
          
          throw new Error(`HTTP error: ${response.status}`);
        }
        
        const frameData = await response.json();
        
        // Process the new frame
        if (frameData && frameData.data) {
          setLatestFrame({
            deviceId: frameData.deviceId,
            timestamp: frameData.timestamp,
            data: frameData.data,
            metadata: frameData.metadata
          });
          
          // Update statistics
          frameCountRef.current++;
          setStats(prev => ({
            ...prev,
            frameCount: prev.frameCount + 1
          }));
        }
      } catch (err: any) {
        if (connectedRef.current) {
          console.error('Error polling for video frames:', err);
          setError(`Polling error: ${err.message}`);
        }
      }
    };
    
    // Start polling immediately and then at intervals
    pollFrames();
    pollingRef.current = setInterval(pollFrames, 200); // Poll every 200ms

    // Handle page visibility changes
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !connectedRef.current) {
        connect();
      } else if (document.visibilityState === 'hidden' && pollingRef.current) {
        // Pause polling when tab is not visible
        clearInterval(pollingRef.current);
        pollingRef.current = null;
        connectedRef.current = false;
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [deviceId]);

  // Connect on component mount and when deviceId changes
  useEffect(() => {
    connect();
    
    // Clean up function
    return () => {
      connectedRef.current = false;
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [deviceId, connect]);

  // Function to send control commands to the device
  const sendCommand = useCallback((command: object) => {
    if (!deviceId || !isConnected) return false;
    
    // Send command via HTTP POST
    fetch(`/api/devices/${deviceId}/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(command)
    }).catch(err => {
      console.error('Error sending command:', err);
    });
    
    return true;
  }, [deviceId, isConnected]);

  return {
    isConnected,
    latestFrame,
    error,
    stats,
    connect,
    sendCommand
  };
}
