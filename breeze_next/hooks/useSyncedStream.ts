'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { getSocketClient, subscribeToDevice, unsubscribeFromDevice } from '@/lib/socketClient';

interface SyncedFrameData {
  deviceId: string;
  timestamp: number;
  hasAudio: boolean;
  hasVideo: boolean;
  audio: {
    data: string;
    format: string;
    sampleRate: number;
    channels: number;
  } | null;
  video: {
    data: string;
    width: number;
    height: number;
    format: string;
  } | null;
}

interface DeviceStatus {
  deviceId: string;
  active: boolean;
  device: any;
}

export function useSyncedStream(deviceId: string) {
  const [isConnected, setIsConnected] = useState(false);
  const [latestFrame, setLatestFrame] = useState<SyncedFrameData | null>(null);
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({
    framesReceived: 0,
    audioFrames: 0,
    videoFrames: 0,
    fps: 0
  });

  const socketRef = useRef<Socket | null>(null);
  const frameCountRef = useRef(0);
  const fpsIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastTimeRef = useRef(Date.now());

  // Initialize Socket.IO connection
  useEffect(() => {
    if (!deviceId) return;

    // Get the shared socket instance
    const socket = getSocketClient();
    socketRef.current = socket;
    
    // Set connection status based on socket state
    setIsConnected(socket.connected);
    
    // Subscribe to device stream
    subscribeToDevice(deviceId);
    
    // Set up event listeners
    const handleConnect = () => {
      console.log('Socket connected:', socket.id);
      setIsConnected(true);
      setError(null);
    };
    
    const handleDisconnect = () => {
      console.log('Socket disconnected');
      setIsConnected(false);
    };
    
    const handleError = (err: Error) => {
      console.error('Socket connection error:', err.message);
      setError(`Connection error: ${err.message}`);
      setIsConnected(false);
    };
    
    // Add event listeners
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleError);

    socket.on('deviceStatus', (status: DeviceStatus) => {
      console.log('Device status received:', status);
      setDeviceStatus(status);
    });

    // Handle synced frames
    socket.on('syncedFrame', (frame: SyncedFrameData) => {
      if (frame.deviceId === deviceId) {
        setLatestFrame(frame);
        frameCountRef.current++;

        // Update stats
        setStats(prev => ({
          ...prev,
          framesReceived: prev.framesReceived + 1,
          audioFrames: prev.audioFrames + (frame.hasAudio ? 1 : 0),
          videoFrames: prev.videoFrames + (frame.hasVideo ? 1 : 0)
        }));
      }
    });

    // Set up FPS calculation
    fpsIntervalRef.current = setInterval(() => {
      const now = Date.now();
      const elapsed = (now - lastTimeRef.current) / 1000;
      const currentFps = frameCountRef.current / elapsed;

      setStats(prev => ({
        ...prev,
        fps: Math.round(currentFps)
      }));

      frameCountRef.current = 0;
      lastTimeRef.current = now;
    }, 1000);

    // Cleanup function
    return () => {
      if (socketRef.current) {
        // Unsubscribe from device but don't disconnect the shared socket
        unsubscribeFromDevice(deviceId);
        
        // Remove event listeners
        socket.off('connect', handleConnect);
        socket.off('disconnect', handleDisconnect);
        socket.off('connect_error', handleError);
        socket.off('deviceStatus');
        socket.off('syncedFrame');
      }

      if (fpsIntervalRef.current) {
        clearInterval(fpsIntervalRef.current);
      }
    };
  }, [deviceId]);

  // Function to play audio data
  const playAudio = useCallback((audioData: SyncedFrameData['audio']) => {
    if (!audioData) return;

    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Decode base64 audio
      const binaryData = atob(audioData.data);
      const buffer = new Uint8Array(binaryData.length);
      
      for (let i = 0; i < binaryData.length; i++) {
        buffer[i] = binaryData.charCodeAt(i);
      }
      
      // Create audio buffer
      const numSamples = buffer.length / 2; // Assuming 16-bit audio
      const audioBuffer = audioContext.createBuffer(
        audioData.channels, 
        numSamples, 
        audioData.sampleRate
      );
      
      // Fill audio buffer with PCM data
      const channelData = audioBuffer.getChannelData(0);
      for (let i = 0; i < numSamples; i++) {
        // Convert from 16-bit PCM to float32
        const sample16 = (buffer[i * 2 + 1] << 8) | buffer[i * 2];
        const signedSample = sample16 > 32767 ? sample16 - 65536 : sample16;
        channelData[i] = signedSample / 32768.0;
      }
      
      // Play the audio
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.start();
    } catch (err) {
      console.error('Error playing audio:', err);
    }
  }, []);

  // Function to render video frame to canvas
  const renderVideoFrame = useCallback((videoData: SyncedFrameData['video'], canvas: HTMLCanvasElement) => {
    if (!videoData || !canvas) return;
    
    try {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
      
      const dataUrl = `data:image/${videoData.format || 'jpeg'};base64,${videoData.data}`;
      img.src = dataUrl;
    } catch (err) {
      console.error('Error rendering video frame:', err);
    }
  }, []);

  return {
    isConnected,
    latestFrame,
    deviceStatus,
    error,
    stats,
    playAudio,
    renderVideoFrame
  };
}
