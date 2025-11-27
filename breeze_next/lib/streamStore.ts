// Stream data store for real-time audio/video streaming
export interface StreamFrame {
  deviceId: string;
  timestamp: number;
  data: string; // base64 encoded data
  type: 'audio' | 'video';
  metadata?: {
    // Audio metadata
    sampleRate?: number;
    channels?: number;
    // Video metadata  
    width?: number;
    height?: number;
    format?: string;
  };
}

class StreamStore {
  private streams: Map<string, StreamFrame[]> = new Map();
  private subscribers: Map<string, Set<(frame: StreamFrame) => void>> = new Map();
  private maxFramesPerDevice = 50; // Keep last 50 frames per device

  // Add a new frame to the stream
  addFrame(frame: StreamFrame) {
    const deviceId = frame.deviceId;
    
    if (!this.streams.has(deviceId)) {
      this.streams.set(deviceId, []);
    }
    
    const frames = this.streams.get(deviceId)!;
    frames.push(frame);
    
    // Keep only the last N frames to prevent memory leaks
    if (frames.length > this.maxFramesPerDevice) {
      frames.shift();
    }
    
    // Notify all subscribers for this device
    this.notifySubscribers(deviceId, frame);
  }

  // Subscribe to stream updates for a device
  subscribe(deviceId: string, callback: (frame: StreamFrame) => void) {
    if (!this.subscribers.has(deviceId)) {
      this.subscribers.set(deviceId, new Set());
    }
    
    this.subscribers.get(deviceId)!.add(callback);
    
    // Return unsubscribe function
    return () => {
      const deviceSubscribers = this.subscribers.get(deviceId);
      if (deviceSubscribers) {
        deviceSubscribers.delete(callback);
        if (deviceSubscribers.size === 0) {
          this.subscribers.delete(deviceId);
        }
      }
    };
  }

  // Get the latest frames for a device
  getLatestFrames(deviceId: string, count: number = 10): StreamFrame[] {
    const frames = this.streams.get(deviceId) || [];
    return frames.slice(-count);
  }

  // Get the latest frame of a specific type
  getLatestFrame(deviceId: string, type: 'audio' | 'video'): StreamFrame | null {
    const frames = this.streams.get(deviceId) || [];
    for (let i = frames.length - 1; i >= 0; i--) {
      if (frames[i].type === type) {
        return frames[i];
      }
    }
    return null;
  }

  // Notify subscribers about new frames
  private notifySubscribers(deviceId: string, frame: StreamFrame) {
    const deviceSubscribers = this.subscribers.get(deviceId);
    if (deviceSubscribers) {
      // Create a copy of the set to avoid issues if subscribers are removed during iteration
      const subscribersArray = Array.from(deviceSubscribers);
      
      subscribersArray.forEach(callback => {
        try {
          callback(frame);
        } catch (error) {
          console.error('Error notifying stream subscriber:', error);
          // Remove the problematic subscriber
          deviceSubscribers.delete(callback);
        }
      });
      
      // Clean up empty subscriber sets
      if (deviceSubscribers.size === 0) {
        this.subscribers.delete(deviceId);
      }
    }
  }

  // Clear all streams for a device
  clearDevice(deviceId: string) {
    this.streams.delete(deviceId);
    this.subscribers.delete(deviceId);
  }

  // Get all active device IDs
  getActiveDevices(): string[] {
    return Array.from(this.streams.keys());
  }

  // Get stream statistics
  getStats(deviceId: string) {
    const frames = this.streams.get(deviceId) || [];
    const audioFrames = frames.filter(f => f.type === 'audio');
    const videoFrames = frames.filter(f => f.type === 'video');
    
    return {
      totalFrames: frames.length,
      audioFrames: audioFrames.length,
      videoFrames: videoFrames.length,
      latestAudioTimestamp: audioFrames.length > 0 ? audioFrames[audioFrames.length - 1].timestamp : null,
      latestVideoTimestamp: videoFrames.length > 0 ? videoFrames[videoFrames.length - 1].timestamp : null
    };
  }
}

// Export a singleton instance
export const streamStore = new StreamStore();
