#!/usr/bin/env node

/**
 * Unified Interphone Device Emulator
 * 1. Registers device via MQTT
 * 2. Starts both audio and video HTTP streams
 * 3. Handles graceful shutdown
 */

const mqtt = require('mqtt');
const http = require('http');

class UnifiedInterphoneEmulator {
  constructor(deviceId, serverUrl = 'http://localhost:3001', mqttUrl = 'mqtt://localhost:1883') {
    this.deviceId = deviceId;
    this.audioDeviceId = `${deviceId}_audio`;
    this.videoDeviceId = `${deviceId}_video`;
    this.serverUrl = serverUrl;
    this.mqttUrl = mqttUrl;
    
    // MQTT
    this.mqttClient = null;
    this.isConnected = false;
    
    // HTTP Streaming
    this.isRunning = false;
    this.audioInterval = null;
    this.videoInterval = null;
    
    // Audio settings
    this.sampleRate = 16000;
    this.audioChunkDuration = 100; // ms
    
    // Video settings
    this.frameRate = 30;
    this.videoChunkDuration = 1000 / this.frameRate; // ~33ms for 30fps
  }

  async start() {
    console.log('🚀 Unified Interphone Device Emulator');
    console.log('=====================================');
    console.log(`📱 Device ID: ${this.deviceId}`);
    console.log(`🎤 Audio Device: ${this.audioDeviceId}`);
    console.log(`📹 Video Device: ${this.videoDeviceId}`);
    console.log(`📡 Server: ${this.serverUrl}`);
    console.log(`🔌 MQTT: ${this.mqttUrl}`);
    console.log('');
    
    try {
      // Step 1: Connect to MQTT and register devices
      await this.connectMQTT();
      await this.registerDevices();
      
      // Step 2: Start HTTP streaming
      this.startStreaming();
      
      console.log('✅ Unified interphone emulator running successfully!');
      console.log('📊 Both devices should now appear in the dashboard');
      console.log('🔄 Streaming audio and video data...');
      
    } catch (error) {
      console.error('❌ Failed to start unified emulator:', error);
      process.exit(1);
    }
  }

  async connectMQTT() {
    return new Promise((resolve, reject) => {
      console.log('🔄 Connecting to MQTT broker...');
      
      this.mqttClient = mqtt.connect(this.mqttUrl, {
        clientId: `emulator_${this.deviceId}_${Math.random().toString(16).substr(2, 8)}`,
        clean: true,
        connectTimeout: 4000,
      });

      this.mqttClient.on('connect', () => {
        console.log('✅ MQTT connected successfully');
        this.isConnected = true;
        resolve();
      });

      this.mqttClient.on('error', (err) => {
        console.error('❌ MQTT connection error:', err);
        reject(err);
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        if (!this.isConnected) {
          reject(new Error('MQTT connection timeout'));
        }
      }, 5000);
    });
  }

  async registerDevices() {
    if (!this.mqttClient || !this.isConnected) {
      throw new Error('MQTT not connected');
    }

    console.log('📝 Registering unified interphone device...');

    // Register ONLY the main interphone device with audio/video capabilities
    const interphoneDevice = {
      id: this.deviceId,
      name: `Interphone ${this.deviceId}`,
      type: 'INTERPHONE',
      ip: '192.168.1.100',
      mac: 'AA:BB:CC:DD:EE:FF',
      firmware: '2.1.0',
      capabilities: ['audio', 'video', 'call', 'two-way-audio'],
      has_audio: true,
      has_video: true,
      stream_endpoints: {
        audio: `/api/stream/audio`,
        video: `/api/stream/video`
      }
    };

    // Send discovery message for main device only
    const topic = `breeze/devices/${this.deviceId}/discovery`;
    await new Promise((resolve) => {
      this.mqttClient.publish(topic, JSON.stringify(interphoneDevice), { retain: true }, () => {
        console.log(`✅ Registered ${interphoneDevice.name} (${interphoneDevice.id})`);
        resolve();
      });
    });

    // Send status message
    const statusTopic = `breeze/devices/${this.deviceId}/status`;
    const status = { online: true, wifi_strength: -45, uptime: 3600 };
    await new Promise((resolve) => {
      this.mqttClient.publish(statusTopic, JSON.stringify(status), { retain: true }, () => {
        resolve();
      });
    });

    console.log('✅ Unified interphone device registered via MQTT');
  }

  startStreaming() {
    if (this.isRunning) {
      console.log('🔄 Already streaming');
      return;
    }

    this.isRunning = true;

    // Start audio streaming with reduced frequency for stability
    this.audioInterval = setInterval(() => {
      this.sendAudioChunk();
    }, 300); // Increased from audioChunkDuration to 300ms

    // Start video streaming with reduced frequency for stability
    this.videoInterval = setInterval(() => {
      this.sendVideoChunk();
    }, 200); // Increased from videoChunkDuration to 200ms

    console.log('🎬 Started audio and video streaming (reduced frequency for stability)');
  }

  sendAudioChunk() {
    const timestamp = Date.now();
    const samples = Math.floor(this.sampleRate * this.audioChunkDuration / 1000);
    
    // Generate a simple sine wave audio tone for testing
    const audioBuffer = Buffer.alloc(samples * 2); // 16-bit samples
    const frequency = 440; // A4 note (440 Hz)
    
    for (let i = 0; i < samples; i++) {
      // Generate sine wave sample
      const sample = Math.sin(2 * Math.PI * frequency * i / this.sampleRate) * 0.3; // 30% volume
      const intSample = Math.round(sample * 32767); // Convert to 16-bit integer
      
      // Write as little-endian 16-bit
      audioBuffer.writeInt16LE(intSample, i * 2);
    }
    
    const audioData = {
      deviceId: this.deviceId,        // Use SAME device ID as main interphone
      streamType: 'audio',            // Identify this as audio stream
      timestamp: timestamp,
      audioData: audioBuffer.toString('base64'), // Real sine wave audio data
      sampleRate: this.sampleRate,
      channels: 1,
      samples: samples,
      format: 'pcm_s16le'
    };

    this.sendHTTPData('/api/stream/audio', audioData, '🎤');
  }

  sendVideoChunk() {
    const timestamp = Date.now();
    
    // Generate a simple test pattern without canvas
    // Create a minimal valid JPEG header + data for testing
    const time = Date.now() / 1000;
    const colorValue = Math.floor((Math.sin(time) + 1) * 127); // Animated color
    
    // Simple test pattern: create a small 64x64 RGB bitmap and convert to base64
    const width = 64;
    const height = 64;
    const pixelData = [];
    
    // Generate colorful test pattern
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // Create animated checkered pattern
        const checker = ((x / 8) + (y / 8)) % 2;
        const r = checker ? colorValue : 255 - colorValue;
        const g = (x / width) * 255;
        const b = (y / height) * 255;
        
        pixelData.push(r, g, b);
      }
    }
    
    // Create a simple BMP header (for testing - browsers can display this)
    const imageSize = width * height * 3;
    const fileSize = 54 + imageSize;
    
    const bmpHeader = Buffer.alloc(54);
    // BMP signature
    bmpHeader.write('BM', 0);
    // File size
    bmpHeader.writeUInt32LE(fileSize, 2);
    // Data offset
    bmpHeader.writeUInt32LE(54, 10);
    // Info header size
    bmpHeader.writeUInt32LE(40, 14);
    // Width
    bmpHeader.writeUInt32LE(width, 18);
    // Height (negative for top-down)
    bmpHeader.writeInt32LE(-height, 22);
    // Planes
    bmpHeader.writeUInt16LE(1, 26);
    // Bits per pixel
    bmpHeader.writeUInt16LE(24, 28);
    
    const bmpData = Buffer.from(pixelData);
    const bmpImage = Buffer.concat([bmpHeader, bmpData]);
    
    const videoData = {
      deviceId: this.deviceId,        // Use SAME device ID as main interphone
      streamType: 'video',            // Identify this as video stream
      timestamp: timestamp,
      videoData: bmpImage.toString('base64'), // Real BMP image data
      width: width,
      height: height,
      format: 'bmp', // Change to BMP format
      frameRate: this.frameRate
    };

    this.sendHTTPData('/api/stream/video', videoData, '📹');
  }

  sendHTTPData(endpoint, data, icon) {
    const postData = JSON.stringify(data);
    const url = new URL(endpoint, this.serverUrl);
    
    // Validate JSON data before sending
    if (!postData || postData === '{}' || postData.length < 10) {
      console.error(`${icon} [${data.deviceId}] Invalid JSON data, skipping...`);
      return;
    }
    
    // Add debug logging
    const dataSize = Buffer.byteLength(postData);
    console.log(`${icon} [${data.deviceId}] Sending ${dataSize} bytes to ${endpoint}`);
    
    const options = {
      hostname: url.hostname,
      port: url.port || 3001,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': dataSize
      }
    };

    const req = http.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log(`${icon} [${data.deviceId}] ✅ Success (${res.statusCode})`);
        } else {
          console.error(`${icon} [${data.deviceId}] ❌ Error ${res.statusCode}: ${responseData}`);
        }
      });
    });

    req.on('error', (err) => {
      console.error(`${icon} [${data.deviceId}] 🚨 Request error:`, err.message);
    });

    req.on('timeout', () => {
      console.error(`${icon} [${data.deviceId}] ⏰ Request timeout (5s)`);
      req.destroy();
    });

    // Set timeout for requests
    req.setTimeout(5000);

    try {
      req.write(postData);
      req.end();
    } catch (error) {
      console.error(`${icon} [${data.deviceId}] 💥 Failed to send request:`, error.message);
    }
  }

  stop() {
    console.log('⏹️  Shutting down unified emulator...');
    
    this.isRunning = false;
    
    if (this.audioInterval) {
      clearInterval(this.audioInterval);
      this.audioInterval = null;
    }
    
    if (this.videoInterval) {
      clearInterval(this.videoInterval);
      this.videoInterval = null;
    }
    
    if (this.mqttClient && this.isConnected) {
      this.mqttClient.end();
    }
    
    console.log('⏹️  Unified emulator stopped');
  }
}

// Handle command line usage
if (require.main === module) {
  const deviceId = process.argv[2];
  
  if (!deviceId) {
    console.log('Usage: node unified_interphone_emulator.js <device_id>');
    console.log('Example: node unified_interphone_emulator.js interphone_01');
    process.exit(1);
  }

  const emulator = new UnifiedInterphoneEmulator(deviceId);
  
  // Graceful shutdown
  process.on('SIGINT', () => {
    emulator.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    emulator.stop();
    process.exit(0);
  });
  
  emulator.start().catch(console.error);
}

module.exports = UnifiedInterphoneEmulator;
