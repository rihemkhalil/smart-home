'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export interface StreamFrame {
  deviceId: string;
  timestamp: number;
  frameType: 'audio' | 'video';
  data: string; // base64 encoded
  metadata?: {
    sampleRate?: number;
    channels?: number;
    width?: number;
    height?: number;
    format?: string;
  };
}

export interface StreamEvent {
  type: 'connection' | 'frame' | 'heartbeat' | 'error';
  deviceId: string;
  timestamp: number;
  message?: string;
  // Frame-specific fields
  frameType?: 'audio' | 'video';
  data?: string;
  metadata?: any;
}

export function useDeviceStream(deviceId: string) {
  const [isConnected, setIsConnected] = useState(false);
  const [latestVideoFrame, setLatestVideoFrame] = useState<StreamFrame | null>(null);
  const [latestAudioFrame, setLatestAudioFrame] = useState<StreamFrame | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ videoFrames: 0, audioFrames: 0 });
  
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  const connect = useCallback(() => {
    if (!deviceId) {
      setError('Device ID is required');
      return;
    }

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    console.log(`🔗 Connecting to stream for device: ${deviceId}`);
    
    try {
      const eventSource = new EventSource(`/api/stream/${deviceId}/sse`);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log(`✅ SSE connected for device: ${deviceId}`);
        setIsConnected(true);
        setError(null);
        reconnectAttempts.current = 0;
      };

      eventSource.onmessage = (event) => {
        try {
          const streamEvent: StreamEvent = JSON.parse(event.data);
          
          switch (streamEvent.type) {
            case 'connection':
              console.log(`🔄 Stream initialized for ${deviceId}`);
              break;
              
            case 'frame':
              if (streamEvent.frameType === 'video' && streamEvent.data) {
                setLatestVideoFrame({
                  deviceId: streamEvent.deviceId,
                  timestamp: streamEvent.timestamp,
                  frameType: 'video',
                  data: streamEvent.data,
                  metadata: streamEvent.metadata
                });
                setStats(prev => ({ ...prev, videoFrames: prev.videoFrames + 1 }));
              } else if (streamEvent.frameType === 'audio' && streamEvent.data) {
                setLatestAudioFrame({
                  deviceId: streamEvent.deviceId,
                  timestamp: streamEvent.timestamp,
                  frameType: 'audio',
                  data: streamEvent.data,
                  metadata: streamEvent.metadata
                });
                setStats(prev => ({ ...prev, audioFrames: prev.audioFrames + 1 }));
              }
              break;
              
            case 'heartbeat':
              // Keep-alive signal, no action needed
              break;
              
            default:
              console.log('Unknown stream event type:', streamEvent.type);
          }
        } catch (parseError) {
          console.error('Error parsing stream event:', parseError);
        }
      };

      eventSource.onerror = (event) => {
        console.error(`❌ SSE error for device ${deviceId}:`, event);
        setIsConnected(false);
        
        // Close the current connection
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
        
        // Attempt to reconnect with exponential backoff
        if (reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.pow(2, reconnectAttempts.current) * 1000; // 1s, 2s, 4s, 8s, 16s
          console.log(`🔄 Attempting to reconnect in ${delay}ms (attempt ${reconnectAttempts.current + 1}/${maxReconnectAttempts})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts.current++;
            connect();
          }, delay);
        } else {
          setError(`Failed to connect to stream after ${maxReconnectAttempts} attempts`);
        }
      };

    } catch (error) {
      console.error('Error creating EventSource:', error);
      setError('Failed to create stream connection');
    }
  }, [deviceId]);

  const disconnect = useCallback(() => {
    console.log(`🔌 Disconnecting stream for device: ${deviceId}`);
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    
    setIsConnected(false);
    setLatestVideoFrame(null);
    setLatestAudioFrame(null);
    setStats({ videoFrames: 0, audioFrames: 0 });
  }, [deviceId]);

  // Auto-connect when deviceId changes
  useEffect(() => {
    if (deviceId) {
      connect();
    }
    
    return disconnect;
  }, [deviceId, connect, disconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    isConnected,
    latestVideoFrame,
    latestAudioFrame,
    error,
    stats,
    connect,
    disconnect
  };
}
