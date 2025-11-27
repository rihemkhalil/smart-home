'use client';

import { useState, useEffect, useRef } from 'react';
import { useMqttVideoStream } from '@/hooks/useMqttVideoStream';

interface CameraViewerProps {
  deviceId: string;
  width?: number;
  height?: number;
  showControls?: boolean;
  showStats?: boolean;
  className?: string;
}

export default function CameraViewer({
  deviceId,
  width = 640,
  height = 480,
  showControls = true,
  showStats = true,
  className = '',
}: CameraViewerProps) {
  const [isEnabled, setIsEnabled] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Use the MQTT video stream hook
  const {
    isConnected,
    latestFrame,
    error,
    stats,
    connect,
    sendCommand
  } = useMqttVideoStream(deviceId);

  // Handle toggling the stream on/off
  const toggleStream = () => {
    setIsEnabled(!isEnabled);
    
    // If turning on and not connected, reconnect
    if (!isEnabled && !isConnected) {
      connect();
    }
  };

  // Handle quality adjustment
  const adjustQuality = (quality: number) => {
    sendCommand({
      command: 'quality',
      value: quality
    });
  };

  // Display video frames on canvas
  useEffect(() => {
    if (latestFrame && canvasRef.current && isEnabled) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        try {
          const img = new Image();
          img.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          };
          
          // Handle different image formats
          const format = latestFrame.metadata?.format || 'jpeg';
          const dataUrl = `data:image/${format};base64,${latestFrame.data}`;
          
          img.src = dataUrl;
        } catch (error) {
          console.error('Error displaying video frame:', error);
        }
      }
    } else if (canvasRef.current && !isEnabled) {
      // Clear canvas when disabled
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#333';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Stream Disabled', canvas.width / 2, canvas.height / 2);
      }
    }
  }, [latestFrame, isEnabled]);

  return (
    <div className={`camera-viewer ${className}`}>
      <div className="camera-view relative bg-black rounded-lg overflow-hidden">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="w-full h-full object-contain"
        />

        {/* Status overlay */}
        {showStats && (
          <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded">
            {isConnected ? (
              <span className="flex items-center">
                <span className="w-2 h-2 bg-green-500 rounded-full mr-1"></span> 
                {stats.fps} FPS
              </span>
            ) : (
              <span className="flex items-center">
                <span className="w-2 h-2 bg-red-500 rounded-full mr-1"></span> 
                Disconnected
              </span>
            )}
          </div>
        )}
        
        {error && (
          <div className="absolute top-2 right-2 bg-red-500 bg-opacity-75 text-white text-xs px-2 py-1 rounded">
            Error: {error}
          </div>
        )}
      </div>
      
      {/* Controls */}
      {showControls && (
        <div className="camera-controls mt-2 flex items-center space-x-2">
          <button 
            onClick={toggleStream}
            className={`px-2 py-1 rounded text-sm ${isEnabled 
              ? 'bg-red-500 hover:bg-red-600 text-white' 
              : 'bg-green-500 hover:bg-green-600 text-white'}`}
          >
            {isEnabled ? 'Disable' : 'Enable'} Stream
          </button>
          
          <select 
            onChange={(e) => adjustQuality(parseInt(e.target.value))}
            className="px-2 py-1 rounded text-sm bg-gray-100 border"
            disabled={!isConnected}
          >
            <option value="">Quality</option>
            <option value="10">High</option>
            <option value="20">Medium</option>
            <option value="30">Low</option>
          </select>
          
          {showStats && (
            <div className="text-xs text-gray-600">
              Frames: {stats.frameCount}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
