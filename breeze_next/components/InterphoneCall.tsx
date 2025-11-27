'use client';

import { useState, useEffect, useRef } from 'react';
import { InterphoneDevice } from '@/types/interphone';
import { useDeviceStream } from '@/hooks/useDeviceStream';
import { useSyncedStream } from '@/hooks/useSyncedStream';
import html2canvas from 'html2canvas';
import { useMqttVideoStream } from '@/hooks/useMqttVideoStream';

interface InterphoneCallProps {
  device: InterphoneDevice;
  onCallEnd: () => void;
  onAcceptCall: () => void;
  onRejectCall: () => void;
  isIncoming?: boolean;
}

export default function InterphoneCall({ 
  device, 
  onCallEnd, 
  onAcceptCall, 
  onRejectCall,
  isIncoming = false 
}: InterphoneCallProps) {
  const [callState, setCallState] = useState<'incoming' | 'connected' | 'ended'>(isIncoming ? 'incoming' : 'connected');
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [humanDetected, setHumanDetected] = useState<boolean | null>(null);
  const [verificationActive, setVerificationActive] = useState(true);
  const [debugImageUrl, setDebugImageUrl] = useState<string | null>(null);
  const [showDebugImage, setShowDebugImage] = useState(true);
  const verificationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null);
  
  // Canvas for video display and audio context for audio playback
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  
  // Use the device stream hook as fallback
  const { 
    isConnected: localConnected, 
    latestVideoFrame, 
    latestAudioFrame, 
    error: localError, 
    stats: localStats 
  } = useDeviceStream(device.id);
  
  // Use the synchronized stream hook for WebSocket frames
  const {
    isConnected: wsConnected,
    latestFrame: syncedFrame,
    deviceStatus,
    error: wsError,
    stats: wsStats,
    renderVideoFrame
  } = useSyncedStream(device.id);
  
  // Combine connection status and errors
  const isConnected = wsConnected || localConnected;
  const error = wsError || localError;
  
  // Combined stats
  const stats = {
    videoFrames: wsStats.videoFrames || localStats.videoFrames,
    audioFrames: wsStats.audioFrames || localStats.audioFrames,
    fps: wsStats.fps || 0
  };
  
  // Use MQTT video stream hook for cloud streaming
/*   const {
    isConnected: cloudIsConnected,
    latestFrame: cloudVideoFrame,
    error: cloudError,
    stats: cloudStats
  } = useMqttVideoStream(device.id); */
  
  // Display synchronized video frames on canvas (preferred)
  useEffect(() => {
    if (syncedFrame?.hasVideo && syncedFrame.video && canvasRef.current && videoEnabled) {
      renderVideoFrame(syncedFrame.video, canvasRef.current);
    }
  }, [syncedFrame, videoEnabled, renderVideoFrame]);

  // Function to capture image via server API proxy to avoid CORS
  const captureImage = async () => {
    try {
      console.log('Fetching image via API proxy for device:', device.id);
      
      // Make request to our API endpoint instead of directly to the device
      const response = await fetch(`/api/devices/capture?deviceIp=10.192.254.82`, {
        method: 'GET',
        cache: 'no-store', // Prevent caching to get fresh images each time
        headers: {
          'Accept': 'image/jpeg, image/png, image/*'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
      }
      
      // Get the response as a blob
      const imageBlob = await response.blob();
      
      console.log('Image captured successfully, size:', imageBlob.size, 'bytes');
      
      // Set debug image URL for display if enabled
      if (showDebugImage) {
        const debugUrl = URL.createObjectURL(imageBlob);
        setDebugImageUrl(debugUrl);
        
        // Clean up object URL when no longer needed
        setTimeout(() => URL.revokeObjectURL(debugUrl), 60000);
      }
      
      return imageBlob;
    } catch (error) {
      console.error('Error capturing image from device:', error);
      return null;
    }
  };

  // Function to send image to verification API
  const verifyHuman = async (imageBlob: Blob) => {
    try {
      const response = await fetch('/api/verify-human', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        body: imageBlob,
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const result = await response.json();
      console.log('Human verification result:', result);
      
      // Update state based on verification result
      setHumanDetected(result.isHuman);
      
      return result;
    } catch (error) {
      console.error('Error verifying human:', error);
      return { isHuman: false, confidence: 0 };
    }
  };
  
  // Function to run verification when detect button is clicked
  const runVerification = async () => {
    // Store the current video src to restore it later
    const iframe = document.getElementById('streamIframe') as HTMLIFrameElement;
    const originalSrc = iframe?.src || '';
    
    // Pause video by clearing the src
    if (iframe) {
      iframe.src = '';
    }
    
    // Run the verification
    const imageBlob = await captureImage();
    if (imageBlob) {
      await verifyHuman(imageBlob);
    } else {
      console.error('Failed to get image for verification');
    }
    
    // Restore the video stream after verification
    setTimeout(() => {
      if (iframe && videoEnabled) {
        iframe.src = originalSrc;
      }
    }, 1000); // Small delay before restoring
  };
  


  // Play audio frames with proper PCM handling
  useEffect(() => {
    if (latestAudioFrame && audioEnabled && !isMuted) {
      try {
        // Initialize audio context if needed
        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
          
          // Resume audio context if it's suspended (required by browsers)
          if (audioContextRef.current.state === 'suspended') {
            audioContextRef.current.resume();
          }
        }
        
        const audioContext = audioContextRef.current;
        
        // Decode base64 PCM audio data
        const audioDataBase64 = latestAudioFrame.data;
        const audioDataBinary = atob(audioDataBase64);
        const audioBuffer = new Uint8Array(audioDataBinary.length);
        
        for (let i = 0; i < audioDataBinary.length; i++) {
          audioBuffer[i] = audioDataBinary.charCodeAt(i);
        }
        
        // Get audio metadata
        const sampleRate = latestAudioFrame.metadata?.sampleRate || 16000;
        const channels = latestAudioFrame.metadata?.channels || 1;
        const samples = (latestAudioFrame.metadata as { samples?: number })?.samples || (audioBuffer.length / 2);
        
        // Create audio buffer for Web Audio API
        const webAudioBuffer = audioContext.createBuffer(channels, samples, sampleRate);
        const channelData = webAudioBuffer.getChannelData(0);
        
        // Convert 16-bit PCM to float32 samples
        for (let i = 0; i < samples; i++) {
          // Read 16-bit little-endian sample
          const sample16 = (audioBuffer[i * 2 + 1] << 8) | audioBuffer[i * 2];
          // Convert to signed 16-bit
          const signedSample = sample16 > 32767 ? sample16 - 65536 : sample16;
          // Convert to float32 (-1.0 to 1.0)
          channelData[i] = signedSample / 32768.0;
        }
        
        // Create audio source and play
        const source = audioContext.createBufferSource();
        const gainNode = audioContext.createGain();
        
        gainNode.gain.value = volume;
        source.buffer = webAudioBuffer;
        source.connect(gainNode);
        gainNode.connect(audioContext.destination);
        source.start();
        
        console.log(`🔊 Playing audio: ${samples} samples at ${sampleRate}Hz`);
        
      } catch (error) {
        console.warn('Audio playback error:', error);
      }
    }
  }, [latestAudioFrame, audioEnabled, isMuted, volume]);

  const handleAcceptCall = () => {
    setCallState('connected');
    onAcceptCall();
  };

  const handleRejectCall = () => {
    setCallState('ended');
    onRejectCall();
  };

  const handleEndCall = () => {
    setCallState('ended');
    onCallEnd();
  };

  const toggleAudio = () => {
    setAudioEnabled(!audioEnabled);
  };

  const toggleVideo = () => {
    setVideoEnabled(!videoEnabled);
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };
  
  const toggleVerification = () => {
    setVerificationActive(prev => !prev);
    
    // Clear any existing verification timer
    if (verificationTimerRef.current) {
      clearInterval(verificationTimerRef.current);
      verificationTimerRef.current = null;
    }
    
    // If turning verification on, reset the human detection status
    if (!verificationActive) {
      setHumanDetected(null);
    }
  };
  
  const toggleDebugImage = () => {
    setShowDebugImage(prev => !prev);
  };

  if (callState === 'ended') {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-4">Call Ended</h2>
            <p className="text-gray-600 mb-4">Call with {device.name} has ended.</p>
            <button
              onClick={() => window.location.reload()}
              className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-md"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-6xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        
        {/* Call Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-semibold">
              {isIncoming && callState === 'incoming' ? 'Incoming Call' : 'Live Stream'}
            </h2>
            <p className="text-gray-600">{device.name} ({device.id})</p>
         {/*    <div className="text-sm text-gray-500 space-y-1">
              <p>Status: {callState === 'incoming' ? 'Waiting...' : 'Connected'}</p>
              <p>Stream: {isConnected ? '🟢 Connected' : '🔴 Disconnected'} {wsConnected ? '(WebSocket)' : '(Local)'}</p>
              <p>Video: {stats.videoFrames} frames | FPS: {stats.fps} | Audio: {stats.audioFrames} chunks</p>
              {error && <p className="text-red-500">Error: {error}</p>}
            </div> */}
          </div>
          
          {callState === 'connected' && (
            <div className="flex space-x-2">
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                ● Live Stream
              </span>
            </div>
          )}
        </div>

        {/* Video Display Area */}
        {callState === 'connected' && (
          <div className="mb-6 w-full">
            <div style={{ 
              position: 'relative',
              width: '100%'
            }}>
              {/* Video container with aspect ratio */}
              <div style={{ 
                paddingBottom: '56.25%', /* 16:9 Aspect Ratio */
                position: 'relative',
                width: '100%',
                backgroundColor: 'black',
                borderRadius: '0.5rem',
                overflow: 'hidden'
              }}>
                {videoEnabled ? (
                  <>
                    <iframe
                      src="http://10.192.254.82/stream"
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        border: 'none',
                        display: 'block'
                      }}
                      id="streamIframe"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      frameBorder="0"
                    />
                    <audio 
                      id="audioPlayback" 
                      autoPlay 
                      muted 
                      playsInline
                      src="http://10.192.254.59/audio"
                      style={{ display: 'none' }} 
                      ref={(audio) => {
                        // Unmute programmatically after loading
                        if (audio) {
                          audio.oncanplaythrough = () => {
                            audio.muted = false;
                            audio.play().catch(e => console.log('Audio play failed:', e));
                          };
                        }
                      }}
                    />
                    {/* Verification Status */}
                    <div className="absolute bottom-2 right-2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded flex items-center">
                      <button 
                        onClick={toggleVerification}
                        className={`mr-2 px-1 py-0.5 rounded text-xs ${verificationActive ? 'bg-green-600' : 'bg-gray-600'}`}
                      >
                        {verificationActive ? 'ON' : 'OFF'}
                      </button>
                      {verificationActive && (
                        <button 
                          onClick={runVerification}
                          className="mr-2 px-2 py-0.5 bg-blue-600 hover:bg-blue-700 rounded text-xs"
                          title="Detect human in frame"
                        >
                          Detect
                        </button>
                      )}
                      {verificationActive ? (
                        humanDetected === null ? (
                          <>
                            <div className="w-2 h-2 mr-1 bg-yellow-500 rounded-full animate-pulse"></div>
                            Waiting...
                          </>
                        ) : humanDetected ? (
                          <>
                            <div className="w-2 h-2 mr-1 bg-green-500 rounded-full"></div>
                            Human verified
                          </>
                        ) : (
                          <>
                            <div className="w-2 h-2 mr-1 bg-red-500 rounded-full"></div>
                            No human detected
                          </>
                        )
                      ) : (
                        <span>Verification disabled</span>
                      )}
                    </div>
                    
                    {/* Stream Status Overlay */}
                    <div className="absolute bottom-4 left-4 bg-black bg-opacity-50 text-white px-3 py-2 rounded-lg backdrop-blur-sm">
                      <div className="flex items-center space-x-4 text-sm">
                        <div className="flex items-center space-x-1">
                          <span>📹</span>
                          <span>{videoEnabled ? 'Video Active' : 'Video Off'}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <span>{audioEnabled && !isMuted ? '🔊' : '🔇'}</span>
                          <span>{audioEnabled && !isMuted ? 'Audio Active' : 'Audio Off'}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}></span>
                          <span>{isConnected ? 'Live' : 'Offline'}</span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Hidden canvas for capturing frames */}
                    <canvas 
                      ref={captureCanvasRef} 
                      className="hidden" 
                      width={800} 
                      height={600}
                    />
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white">
                    <div className="text-center">
                      <div className="text-6xl mb-4">📹</div>
                      <p className="text-xl">Video Disabled</p>
                      <p className="text-sm text-gray-300 mt-2">Click video button to enable</p>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Debug image display */}
              {showDebugImage && debugImageUrl && (
                <div className="mt-4 p-2 border border-gray-300 rounded">
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="text-sm font-semibold">Captured Image for Verification</h4>
                    <button 
                      onClick={() => setShowDebugImage(prev => !prev)}
                      className="text-xs px-2 py-0.5 bg-gray-200 hover:bg-gray-300 rounded"
                    >
                      Hide
                    </button>
                  </div>
                  <img 
                    src={debugImageUrl} 
                    alt="Debug captured frame" 
                    className="w-full max-h-60 object-contain border border-gray-200" 
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Call Controls */}
        <div className="flex justify-center space-x-4 mb-6">
          
          {/* Incoming Call Controls */}
          {isIncoming && callState === 'incoming' && (
            <>
              <button
                onClick={handleRejectCall}
                className="bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-full flex items-center space-x-2 transition-colors"
              >
                <span>📞</span>
                <span>Decline</span>
              </button>
              
              <button
                onClick={handleAcceptCall}
                className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-full flex items-center space-x-2 transition-colors"
              >
                <span>📞</span>
                <span>Accept</span>
              </button>
            </>
          )}

          {/* Active Call Controls */}
          {callState === 'connected' && (
            <>
              <button
                onClick={toggleMute}
                className={`px-4 py-3 rounded-full flex items-center space-x-2 transition-colors ${
                  isMuted 
                    ? 'bg-red-500 hover:bg-red-600 text-white' 
                    : 'bg-gray-200 hover:bg-gray-300 text-gray-800'
                }`}
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                <span>{isMuted ? '🔇' : '🎤'}</span>
              </button>
              
              <button
                onClick={toggleVideo}
                className={`px-4 py-3 rounded-full flex items-center space-x-2 transition-colors ${
                  videoEnabled 
                    ? 'bg-gray-200 hover:bg-gray-300 text-gray-800' 
                    : 'bg-gray-500 hover:bg-gray-600 text-white'
                }`}
                title={videoEnabled ? 'Disable Video' : 'Enable Video'}
              >
                <span>📹</span>
              </button>

              <button
                onClick={toggleAudio}
                className={`px-4 py-3 rounded-full flex items-center space-x-2 transition-colors ${
                  audioEnabled 
                    ? 'bg-gray-200 hover:bg-gray-300 text-gray-800' 
                    : 'bg-gray-500 hover:bg-gray-600 text-white'
                }`}
                title={audioEnabled ? 'Disable Audio' : 'Enable Audio'}
              >
                <span>🔊</span>
              </button>

              <button
                onClick={handleEndCall}
                className="bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-full flex items-center space-x-2 transition-colors"
              >
                <span>📞</span>
                <span>End Call</span>
              </button>
            </>
          )}
        </div>

        {/* Volume Control */}
  {/*       {callState === 'connected' && audioEnabled && (
          <div className="flex items-center space-x-4 mb-4">
            <span className="text-sm text-gray-600">Volume:</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="flex-1 max-w-xs"
            />
            <span className="text-sm text-gray-600 w-12">{Math.round(volume * 100)}%</span>
          </div>
        )} */}
      </div>
    </div>
  );
}
