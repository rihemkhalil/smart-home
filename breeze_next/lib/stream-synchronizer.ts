// Stream synchronization engine for interphone audio/video

import { AudioPacket, VideoPacket, StreamPacket, SyncConfig } from '@/types/interphone';

interface BufferedPacket {
  packet: StreamPacket;
  received_at: number;
}

export interface SyncedFrame {
  audio: AudioPacket | null;
  video: VideoPacket | null;
  timestamp: number;
  complete: boolean;
}

export class StreamSynchronizer {
  private audioBuffer: BufferedPacket[] = [];
  private videoBuffer: BufferedPacket[] = [];
  private syncedFrames: SyncedFrame[] = [];
  
  private config: SyncConfig = {
    max_jitter_ms: 50,
    buffer_timeout_ms: 500,
    target_latency_ms: 100,
    drop_threshold: 0.05
  };
  
  private listeners: Array<(frame: SyncedFrame) => void> = [];
  private statsListeners: Array<(stats: SyncStats) => void> = [];
  
  private stats = {
    packets_received: 0,
    packets_synced: 0,
    packets_dropped: 0,
    avg_jitter: 0,
    current_latency: 0
  };

  constructor(config?: Partial<SyncConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
    
    // Clean up old packets periodically
    setInterval(() => this.cleanupBuffers(), 100);
    setInterval(() => this.emitStats(), 1000);
  }

  addAudioPacket(packet: AudioPacket): void {
    this.stats.packets_received++;
    
    const buffered: BufferedPacket = {
      packet,
      received_at: Date.now()
    };
    
    this.audioBuffer.push(buffered);
    this.audioBuffer.sort((a, b) => a.packet.timestamp_us - b.packet.timestamp_us);
    
    this.trySync();
  }

  addVideoPacket(packet: VideoPacket): void {
    this.stats.packets_received++;
    
    const buffered: BufferedPacket = {
      packet,
      received_at: Date.now()
    };
    
    this.videoBuffer.push(buffered);
    this.videoBuffer.sort((a, b) => a.packet.timestamp_us - b.packet.timestamp_us);
    
    this.trySync();
  }

  onSyncedFrame(callback: (frame: SyncedFrame) => void): void {
    this.listeners.push(callback);
  }

  onStats(callback: (stats: SyncStats) => void): void {
    this.statsListeners.push(callback);
  }

  private trySync(): void {
    const now = Date.now();
    
    // Find matching audio/video pairs within jitter tolerance
    for (let i = 0; i < this.audioBuffer.length; i++) {
      const audioItem = this.audioBuffer[i];
      const audioTimestamp = audioItem.packet.timestamp_us / 1000; // Convert to ms
      
      for (let j = 0; j < this.videoBuffer.length; j++) {
        const videoItem = this.videoBuffer[j];
        const videoTimestamp = videoItem.packet.timestamp_us / 1000;
        
        const timeDiff = Math.abs(audioTimestamp - videoTimestamp);
        
        if (timeDiff <= this.config.max_jitter_ms) {
          // Found synchronized pair!
          const syncedFrame: SyncedFrame = {
            audio: audioItem.packet as AudioPacket,
            video: videoItem.packet as VideoPacket,
            timestamp: Math.min(audioTimestamp, videoTimestamp),
            complete: true
          };
          
          this.emitSyncedFrame(syncedFrame);
          
          // Remove used packets
          this.audioBuffer.splice(i, 1);
          this.videoBuffer.splice(j, 1);
          
          this.stats.packets_synced += 2;
          this.updateJitterStats(timeDiff);
          
          return; // Process one pair at a time
        }
      }
    }
    
    // Handle orphaned packets (audio without video or vice versa)
    this.handleOrphanedPackets(now);
  }

  private handleOrphanedPackets(now: number): void {
    const timeout = this.config.buffer_timeout_ms;
    
    // Create frames with missing audio or video
    const orphanedAudio = this.audioBuffer.filter(item => 
      now - item.received_at > timeout
    );
    
    const orphanedVideo = this.videoBuffer.filter(item => 
      now - item.received_at > timeout
    );
    
    // Emit video-only frames
    orphanedVideo.forEach(item => {
      const frame: SyncedFrame = {
        audio: null,
        video: item.packet as VideoPacket,
        timestamp: item.packet.timestamp_us / 1000,
        complete: false
      };
      this.emitSyncedFrame(frame);
    });
    
    // Emit audio-only frames
    orphanedAudio.forEach(item => {
      const frame: SyncedFrame = {
        audio: item.packet as AudioPacket,
        video: null,
        timestamp: item.packet.timestamp_us / 1000,
        complete: false
      };
      this.emitSyncedFrame(frame);
    });
    
    // Remove orphaned packets
    this.audioBuffer = this.audioBuffer.filter(item => 
      now - item.received_at <= timeout
    );
    this.videoBuffer = this.videoBuffer.filter(item => 
      now - item.received_at <= timeout
    );
    
    this.stats.packets_dropped += orphanedAudio.length + orphanedVideo.length;
  }

  private emitSyncedFrame(frame: SyncedFrame): void {
    this.listeners.forEach(callback => callback(frame));
  }

  private cleanupBuffers(): void {
    const now = Date.now();
    const maxAge = this.config.buffer_timeout_ms * 2;
    
    this.audioBuffer = this.audioBuffer.filter(item => 
      now - item.received_at < maxAge
    );
    this.videoBuffer = this.videoBuffer.filter(item => 
      now - item.received_at < maxAge
    );
  }

  private updateJitterStats(jitter: number): void {
    // Simple moving average
    this.stats.avg_jitter = (this.stats.avg_jitter * 0.9) + (jitter * 0.1);
  }

  private emitStats(): void {
    this.stats.current_latency = this.calculateCurrentLatency();
    this.statsListeners.forEach(callback => callback(this.stats));
  }

  private calculateCurrentLatency(): number {
    const now = Date.now();
    const recentPackets = [
      ...this.audioBuffer.filter(p => now - p.received_at < 1000),
      ...this.videoBuffer.filter(p => now - p.received_at < 1000)
    ];
    
    if (recentPackets.length === 0) return 0;
    
    const avgAge = recentPackets.reduce((sum, p) => 
      sum + (now - p.received_at), 0
    ) / recentPackets.length;
    
    return avgAge;
  }

  getStats(): SyncStats {
    return { ...this.stats };
  }

  reset(): void {
    this.audioBuffer = [];
    this.videoBuffer = [];
    this.syncedFrames = [];
    this.stats = {
      packets_received: 0,
      packets_synced: 0,
      packets_dropped: 0,
      avg_jitter: 0,
      current_latency: 0
    };
  }
}

export interface SyncStats {
  packets_received: number;
  packets_synced: number;
  packets_dropped: number;
  avg_jitter: number;
  current_latency: number;
}
