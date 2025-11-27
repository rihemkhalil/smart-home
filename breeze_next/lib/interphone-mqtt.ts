// MQTT interphone stream handler - unified approach
// Two ESP32 devices (audio + video) share the same logical device_id

import { mqttManager, MQTTManager } from './mqtt';
import { StreamSynchronizer, SyncedFrame } from './stream-synchronizer';
import { Server as SocketIOServer } from 'socket.io';
import { AudioPacket, VideoPacket, InterphoneCallEvent, InterphoneDevice, MQTT_TOPICS } from '@/types/interphone';

export class InterphoneMQTTHandler {
  private mqttManager: MQTTManager;
  private streamSynchronizer: StreamSynchronizer;
  private devices: Map<string, InterphoneDevice>;
  private synchronizers: Map<string, StreamSynchronizer> = new Map(); // device_id → synchronizer
  private activeDevices: Set<string> = new Set();
  private callEventListeners: Array<(event: InterphoneCallEvent) => void> = [];
  private socketIOServer: SocketIOServer | null = null;
  
  constructor(mqttManager: MQTTManager, streamSynchronizer: StreamSynchronizer) {
    this.mqttManager = mqttManager;
    this.streamSynchronizer = streamSynchronizer;
    this.devices = new Map();

    // Subscribe to interphone topics once MQTT is connected
    this.initializeWhenConnected();
  }

  private async initializeWhenConnected(): Promise<void> {
    // Wait for MQTT connection
    const checkConnection = async () => {
      if (this.mqttManager.isClientConnected()) {
        console.log('🎙️ MQTT connected, initializing interphone handler...');
        this.subscribeToTopics();
      } else {
        console.log('🎙️ Waiting for MQTT connection...');
        setTimeout(checkConnection, 1000);
      }
    };
    checkConnection();
  }

  private subscribeToTopics(): void {
    console.log('🎙️ Subscribing to interphone MQTT topics...');
    
    // Subscribe to all device streams
    this.mqttManager.subscribeToTopic('breeze/devices/+/streams/audio', this.handleAudioStream.bind(this));
    this.mqttManager.subscribeToTopic('breeze/devices/+/streams/video', this.handleVideoStream.bind(this));
    
    // Subscribe to call events
    this.mqttManager.subscribeToTopic('breeze/devices/+/interphone/incoming', this.handleIncomingCall.bind(this));
    this.mqttManager.subscribeToTopic('breeze/devices/+/interphone/control', this.handleCallControl.bind(this));
    
    console.log('🔔 Subscribed to interphone MQTT topics');
  }

  private handleAudioStream(topic: string, message: Buffer): void {
    try {
      const deviceId = this.extractDeviceId(topic);
      const packet: AudioPacket = JSON.parse(message.toString());
      
      console.log(`🎤 Audio packet from ${deviceId}: seq=${packet.sequence_num}, ts=${packet.timestamp_us}`);
      
      // Get or create synchronizer for this logical device
      const synchronizer = this.getSynchronizer(deviceId);
      synchronizer.addAudioPacket(packet);
      
    } catch (error) {
      console.error('❌ Error handling audio stream:', error);
    }
  }

  private handleVideoStream(topic: string, message: Buffer): void {
    try {
      const deviceId = this.extractDeviceId(topic);
      const packet: VideoPacket = JSON.parse(message.toString());
      
      console.log(`📹 Video packet from ${deviceId}: seq=${packet.sequence_num}, ts=${packet.timestamp_us}`);
      
      // Get or create synchronizer for this logical device
      const synchronizer = this.getSynchronizer(deviceId);
      synchronizer.addVideoPacket(packet);
      
    } catch (error) {
      console.error('❌ Error handling video stream:', error);
    }
  }

  private handleIncomingCall(topic: string, message: Buffer): void {
    try {
      const deviceId = this.extractDeviceId(topic);
      const event: InterphoneCallEvent = JSON.parse(message.toString());
      
      console.log(`📞 Incoming call from ${deviceId}:`, event);
      
      // Mark device as active
      this.activeDevices.add(deviceId);
      
      // Initialize synchronizer for this call
      this.getSynchronizer(deviceId);
      
      // Notify listeners
      this.callEventListeners.forEach(listener => listener(event));
      
    } catch (error) {
      console.error('❌ Error handling incoming call:', error);
    }
  }

  private handleCallControl(topic: string, message: Buffer): void {
    try {
      const deviceId = this.extractDeviceId(topic);
      const event: InterphoneCallEvent = JSON.parse(message.toString());
      
      console.log(`📱 Call control from ${deviceId}:`, event);
      
      if (event.event_type === 'CALL_ENDED') {
        this.endCall(deviceId);
      }
      
      // Notify listeners
      this.callEventListeners.forEach(listener => listener(event));
      
    } catch (error) {
      console.error('❌ Error handling call control:', error);
    }
  }

  private getSynchronizer(deviceId: string): StreamSynchronizer {
    if (!this.synchronizers.has(deviceId)) {
      const synchronizer = new StreamSynchronizer({
        max_jitter_ms: 50,
        buffer_timeout_ms: 500,
        target_latency_ms: 100,
        drop_threshold: 0.05
      });
      
      // Listen for synchronized frames
      synchronizer.onSyncedFrame((frame) => {
        console.log(`🔄 Synced frame for ${deviceId}:`, {
          hasAudio: !!frame.audio,
          hasVideo: !!frame.video,
          timestamp: frame.timestamp
        });
        
        // Forward frame data to WebSocket/Socket.IO clients
        this.broadcastSyncedFrame(deviceId, frame);
      });
      
      this.synchronizers.set(deviceId, synchronizer);
      console.log(`🔄 Created synchronizer for device: ${deviceId}`);
    }
    
    return this.synchronizers.get(deviceId)!;
  }

  private extractDeviceId(topic: string): string {
    const parts = topic.split('/');
    return parts[2]; // breeze/devices/{deviceId}/...
  }
  
  /**
   * Broadcasts a synchronized frame to all connected WebSocket clients
   * subscribed to this device's stream
   */
  private broadcastSyncedFrame(deviceId: string, frame: SyncedFrame): void {
    if (!this.socketIOServer) {
      // No socket server configured, skip broadcasting
      return;
    }
    
    try {
      // Prepare frame data for sending - extract only what's needed to minimize payload
      const frameData = {
        deviceId,
        timestamp: frame.timestamp,
        hasAudio: !!frame.audio,
        hasVideo: !!frame.video,
        // Include audio data if available
        audio: frame.audio ? {
          data: frame.audio.data,
          format: frame.audio.format,
          sampleRate: frame.audio.sample_rate,
          channels: frame.audio.channels
        } : null,
        // Include video data if available
        video: frame.video ? {
          data: frame.video.data,
          width: frame.video.width,
          height: frame.video.height,
          format: frame.video.format
        } : null
      };
      
      // Emit to the device-specific room
      this.socketIOServer.to(`interphone:${deviceId}`).emit('syncedFrame', frameData);
      
      console.log(`📡 Broadcasted synced frame for ${deviceId} (audio: ${!!frame.audio}, video: ${!!frame.video})`);
    } catch (error) {
      console.error(`❌ Error broadcasting synced frame for ${deviceId}:`, error);
    }
  }

  // Public API

  onCallEvent(callback: (event: InterphoneCallEvent) => void): void {
    this.callEventListeners.push(callback);
  }

  getStreamSynchronizer(deviceId: string): StreamSynchronizer | null {
    return this.synchronizers.get(deviceId) || null;
  }

  answerCall(deviceId: string): void {
    const event: InterphoneCallEvent = {
      device_id: deviceId,
      event_type: 'CALL_ANSWERED',
      timestamp: Date.now()
    };
    
    this.mqttManager.publish(MQTT_TOPICS.CALL_CONTROL(deviceId), JSON.stringify(event));
    console.log(`📞 Answered call for device: ${deviceId}`);
  }

  rejectCall(deviceId: string): void {
    const event: InterphoneCallEvent = {
      device_id: deviceId,
      event_type: 'CALL_ENDED',
      timestamp: Date.now()
    };
    
    this.mqttManager.publish(MQTT_TOPICS.CALL_CONTROL(deviceId), JSON.stringify(event));
    this.endCall(deviceId);
    console.log(`📞 Rejected call for device: ${deviceId}`);
  }

  endCall(deviceId: string): void {
    // Remove from active devices
    this.activeDevices.delete(deviceId);
    
    // Clean up synchronizer
    const synchronizer = this.synchronizers.get(deviceId);
    if (synchronizer) {
      // TODO: Clean up synchronizer resources
    }
    
    console.log(`📞 Ended call for device: ${deviceId}`);
  }

  getActiveDevices(): string[] {
    return Array.from(this.activeDevices);
  }

  isDeviceActive(deviceId: string): boolean {
    return this.activeDevices.has(deviceId);
  }

  // Register a device (called when device comes online)
  registerDevice(device: InterphoneDevice): void {
    this.devices.set(device.id, device);
    console.log(`📱 Registered interphone device: ${device.id} (${device.name})`);
  }
  
  /**
   * Configure the Socket.IO server for interphone events
   */
  setSocketServer(io: SocketIOServer): void {
    this.socketIOServer = io;
    
    // Set up Socket.IO event handlers
    io.on('connection', (socket) => {
      console.log(`Socket client connected: ${socket.id}`);
      
      // Handle client subscribing to a device's stream
      socket.on('subscribeToDevice', (deviceId: string) => {
        // Join the device-specific room
        socket.join(`interphone:${deviceId}`);
        console.log(`Client ${socket.id} subscribed to interphone device: ${deviceId}`);
        
        // Send device status if available
        const device = this.getDevice(deviceId);
        if (device) {
          socket.emit('deviceStatus', {
            deviceId,
            active: this.isDeviceActive(deviceId),
            device
          });
        }
      });
      
      // Handle client unsubscribing
      socket.on('unsubscribeFromDevice', (deviceId: string) => {
        socket.leave(`interphone:${deviceId}`);
        console.log(`Client ${socket.id} unsubscribed from interphone device: ${deviceId}`);
      });
    });
  }

  // Unregister a device (called when device goes offline)
  unregisterDevice(deviceId: string): void {
    this.devices.delete(deviceId);
    this.endCall(deviceId);
    console.log(`📱 Unregistered interphone device: ${deviceId}`);
  }

  getDevice(deviceId: string): InterphoneDevice | undefined {
    return this.devices.get(deviceId);
  }

  getAllDevices(): InterphoneDevice[] {
    return Array.from(this.devices.values());
  }
}

// Export singleton instance
let _interphoneMQTTHandler: InterphoneMQTTHandler | null = null;

export const getInterphoneMQTTHandler = (): InterphoneMQTTHandler => {
  if (!_interphoneMQTTHandler) {
    _interphoneMQTTHandler = new InterphoneMQTTHandler(mqttManager, new StreamSynchronizer());
    console.log('🎙️ InterphoneMQTTHandler singleton created');
  }
  return _interphoneMQTTHandler;
};

// Setup socket.io server instance
export const setupSocketServer = (io: SocketIOServer): void => {
  const handler = getInterphoneMQTTHandler();
  handler.setSocketServer(io);
  console.log('📞 Socket.IO server configured for interphone events');
};

// Removed auto-initialization to prevent circular dependency
