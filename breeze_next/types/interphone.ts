// Interphone streaming types and protocols

import { Device } from './device';

export interface StreamPacket {
  timestamp_us: number;        // Microsecond timestamp (NTP synced)
  sequence_num: number;        // Packet sequence number
  stream_type: 'AUDIO' | 'VIDEO';
  device_id: string;           // Device identifier
  data: string;                // Base64 encoded data
  checksum?: string;           // Optional data integrity check
}

export interface AudioPacket extends StreamPacket {
  stream_type: 'AUDIO';
  sample_rate: number;         // Audio sample rate (e.g., 16000)
  channels: number;            // Audio channels (1 = mono, 2 = stereo)
  bits_per_sample: number;     // Bit depth (16, 24, 32)
  format: 'PCM' | 'WAV';       // Audio format
}

export interface VideoPacket extends StreamPacket {
  stream_type: 'VIDEO';
  width: number;               // Frame width
  height: number;              // Frame height
  format: 'JPEG' | 'H264';     // Video format
  quality: number;             // JPEG quality (1-100)
  frame_type: 'I' | 'P' | 'B'; // Frame type for H264
}

export interface InterphoneCallEvent {
  device_id: string;
  event_type: 'INCOMING_CALL' | 'CALL_ANSWERED' | 'CALL_ENDED' | 'CALL_TIMEOUT';
  timestamp: number;
  metadata?: {
    trigger_source?: 'BUTTON' | 'MOTION' | 'MANUAL';
    caller_info?: string;
  };
}

export interface SyncConfig {
  max_jitter_ms: number;       // Maximum allowed time difference (50ms)
  buffer_timeout_ms: number;   // Drop packets after this time (500ms)
  target_latency_ms: number;   // Target end-to-end latency (100ms)
  drop_threshold: number;      // Drop packet percentage for sync (0.05 = 5%)
}

// MQTT Topics
export const MQTT_TOPICS = {
  // Control topics
  INCOMING_CALL: (deviceId: string) => `breeze/devices/${deviceId}/interphone/incoming`,
  CALL_CONTROL: (deviceId: string) => `breeze/devices/${deviceId}/interphone/control`,
  DEVICE_STATUS: (deviceId: string) => `breeze/devices/${deviceId}/interphone/status`,
  
  // Streaming topics
  AUDIO_STREAM: (deviceId: string) => `breeze/devices/${deviceId}/streams/audio`,
  VIDEO_STREAM: (deviceId: string) => `breeze/devices/${deviceId}/streams/video`,
  SYNC_CONTROL: (deviceId: string) => `breeze/devices/${deviceId}/streams/sync`,
  
  // Time synchronization
  TIME_SYNC: 'breeze/time/sync',
  TIME_BROADCAST: 'breeze/time/broadcast'
} as const;

export interface InterphoneDevice extends Device {
  type: 'INTERPHONE';
  capabilities: {
    audio: boolean;
    video: boolean;
    two_way_audio: boolean;
  };
  stream_config: {
    video_resolution: string;
    audio_sample_rate: number;
    max_bitrate: number;
  };
  call_status: 'IDLE' | 'INCOMING' | 'ACTIVE' | 'ENDING';
}
