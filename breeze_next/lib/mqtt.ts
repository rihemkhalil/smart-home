import mqtt from 'mqtt';
import { deviceStore } from './deviceStore';

class MQTTManager {
  private client: mqtt.MqttClient | null = null;
  private isConnected = false;
  private topicCallbacks: Map<string, Array<(topic: string, message: Buffer) => void>> = new Map();

  async connect() {
    if (this.client) {
      return;
    }

    try {
      const brokerUrl = process.env.MQTT_BROKER_URL || 'http://51.83.98.100';
      console.log(`🔄 Connecting to MQTT broker: ${brokerUrl}`);
      
      this.client = mqtt.connect(brokerUrl, {
        clientId: `breeze_server_${Math.random().toString(16).substr(2, 8)}`,
        clean: true,
        connectTimeout: 4000,
        reconnectPeriod: 1000,
      });

      this.client.on('connect', () => {
        console.log('✅ MQTT Client connected successfully');
        this.isConnected = true;
        this.subscribeToTopics();
      });

      this.client.on('error', (err) => {
        console.error('❌ MQTT connection error:', err);
        this.isConnected = false;
      });

      this.client.on('message', this.handleMessage.bind(this));

      this.client.on('close', () => {
        console.log('📴 MQTT Client disconnected');
        this.isConnected = false;
      });

    } catch (error) {
      console.error('❌ Failed to connect to MQTT broker:', error);
    }
  }

  private subscribeToTopics() {
    if (!this.client || !this.isConnected) return;

    // ✅ Subscribe to all breeze topics with flexible patterns
    const topics = [
      'breeze/+/+/+',        // Support both old and new topic formats
      'breeze/devices/+/+',  // Legacy format support  
      'breeze/devices/+/discovery',
      'breeze/devices/+/status', 
      'breeze/devices/+/state',
      'breeze/devices/+/streams/+',      // Add interphone streams
      'breeze/devices/+/interphone/+',   // Add interphone events
    ];

    topics.forEach(topic => {
      this.client?.subscribe(topic, (err) => {
        if (err) {
          console.error(`❌ Failed to subscribe to ${topic}:`, err);
        } else {
          console.log(`📡 Subscribed to ${topic}`);
        }
      });
    });
  }

  private handleMessage(topic: string, message: Buffer) {
    try {
      // First check for custom callbacks
      let handled = false;
      for (const [pattern, callbacks] of this.topicCallbacks) {
        const regex = new RegExp('^' + pattern.replace(/\+/g, '[^/]+') + '$');
        if (regex.test(topic)) {
          callbacks.forEach(callback => callback(topic, message));
          handled = true;
        }
      }

      // If handled by custom callback, don't process further
      if (handled) {
        return;
      }

      const messageStr = message.toString();
      console.log(`📨 MQTT Message: ${topic} -> ${messageStr}`);
      
      // Extract device ID from topic - be flexible with topic formats
      let deviceId = '';
      const topicParts = topic.split('/');
      
      if (topicParts.length >= 3) {
        // Support both breeze/devices/ID/type and breeze/ID/type formats
        if (topicParts[1] === 'devices') {
          deviceId = topicParts[2];
        } else {
          deviceId = topicParts[1];
        }
      }

      if (!deviceId) {
        console.warn(`⚠️ Could not extract device ID from topic: ${topic}`);
        return;
      }

      // Parse message - handle both JSON and plain text
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(messageStr);
      } catch {
        // Handle plain text messages
        console.log(`📝 Plain text message: ${messageStr}`);
        data = { raw_message: messageStr };
        
        // Try to interpret plain text as state
        if (messageStr.toLowerCase() === 'on' || messageStr.toLowerCase() === 'off') {
          data.state = messageStr.toLowerCase();
        }
      }

      // Determine message type from topic
      const lastPart = topicParts[topicParts.length - 1];
      const secondLastPart = topicParts.length > 1 ? topicParts[topicParts.length - 2] : '';
      
      // Handle interphone streams
      if (secondLastPart === 'streams' && (lastPart === 'audio' || lastPart === 'video')) {
        console.log(`🎵📹 Interphone ${lastPart} stream packet received from ${deviceId}`);
        // Let the interphone handler deal with this
        return;
      }
      
      if (secondLastPart === 'interphone') {
        console.log(`📞 Interphone ${lastPart} event received from ${deviceId}`);
        // Let the interphone handler deal with this
        return;
      }
      
      switch (lastPart) {
        case 'discovery':
          console.log(`🔍 Discovery message received: ${deviceId}`);
          if (data.id || deviceId) {
            data.id = data.id || deviceId;
            deviceStore.addOrUpdateDevice(data);
          }
          break;
          
        case 'status':
          console.log(`📊 Status message received: ${deviceId}`);
          deviceStore.updateDeviceStatus(deviceId, data);
          break;
          
        case 'state':
          console.log(`🔄 State message received: ${deviceId}`);
          deviceStore.updateDeviceState(deviceId, data);
          break;
          
        default:
          console.log(`📝 Generic message received: ${deviceId}`);
          // Try to handle as discovery if it has device info
          if (data.id || data.name || data.type) {
            data.id = data.id || deviceId;
            deviceStore.addOrUpdateDevice(data);
          } else {
            // Handle as status update
            deviceStore.updateDeviceStatus(deviceId, data);
          }
          break;
      }

    } catch (error) {
      console.error('❌ Error handling MQTT message:', error);
      console.error('Topic:', topic);
      console.error('Message:', message.toString());
    }
  }

  async publishCommand(deviceId: string, command: string, data: Record<string, unknown>): Promise<boolean> {
    if (!this.isConnected || !this.client) {
      console.error('❌ MQTT client not connected');
      return false;
    }

    try {
      const topic = `breeze/devices/${deviceId}/command/${command}`;
      const payload = JSON.stringify(data);
      
      console.log(`📤 Publishing command: ${topic} -> ${payload}`);
      
      return new Promise((resolve) => {
        this.client!.publish(topic, payload, (err) => {
          if (err) {
            console.error('❌ Error publishing MQTT command:', err);
            resolve(false);
          } else {
            console.log('✅ Command published successfully');
            resolve(true);
          }
        });
      });
    } catch (error) {
      console.error('❌ Error publishing MQTT command:', error);
      return false;
    }
  }

  // ✅ NEW: Generic publish method for interphone streams
  async publish(topic: string, message: string): Promise<boolean> {
    if (!this.isConnected || !this.client) {
      console.error('❌ MQTT client not connected');
      return false;
    }

    try {
      return new Promise((resolve) => {
        this.client!.publish(topic, message, (err) => {
          if (err) {
            console.error('❌ Error publishing MQTT message:', err);
            resolve(false);
          } else {
            resolve(true);
          }
        });
      });
    } catch (error) {
      console.error('❌ Error publishing MQTT message:', error);
      return false;
    }
  }

  // ✅ NEW: Subscribe to additional topics for interphone
  subscribeToTopic(topic: string, callback?: (topic: string, message: Buffer) => void): void {
    if (!this.client || !this.isConnected) {
      console.error('❌ MQTT client not connected');
      return;
    }

    this.client.subscribe(topic, (err) => {
      if (err) {
        console.error(`❌ Failed to subscribe to ${topic}:`, err);
      } else {
        console.log(`📡 Subscribed to ${topic}`);
      }
    });

    // If callback provided, store it for routing
    if (callback) {
      if (!this.topicCallbacks.has(topic)) {
        this.topicCallbacks.set(topic, []);
      }
      this.topicCallbacks.get(topic)!.push(callback);
    }
  }

  isClientConnected(): boolean {
    return this.isConnected;
  }

  async disconnect() {
    if (this.client) {
      await this.client.endAsync();
      this.client = null;
      this.isConnected = false;
    }
  }
}

// Export singleton instance and class
export const mqttManager = new MQTTManager();
export { MQTTManager };
