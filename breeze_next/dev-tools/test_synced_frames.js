#!/usr/bin/env node

/**
 * Test script for WebSocket synchronized frames
 * 
 * This script simulates sending synchronized audio and video frames
 * through the Socket.IO server to connected clients
 */

const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
const http = require('http');

// Configuration
const config = {
  port: 3001,
  deviceId: 'test_interphone_01',
  frameInterval: 200,  // Send frames every 200ms (5fps)
  testImagesDir: path.join(__dirname, 'test_images'), // Directory with test images
  testAudioDir: path.join(__dirname, 'test_audio')    // Directory with test audio samples
};

// Create HTTP server and Socket.IO instance
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Interphone WebSocket Test Server');
});

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Check for test images
let testImages = [];
if (fs.existsSync(config.testImagesDir)) {
  testImages = fs.readdirSync(config.testImagesDir)
    .filter(file => /\.(jpg|jpeg|png)$/i.test(file))
    .map(file => path.join(config.testImagesDir, file));
}

if (testImages.length === 0) {
  console.log(`⚠️ No test images found in ${config.testImagesDir}`);
  console.log('Creating a simple test pattern instead.');
}

// Check for test audio samples
let testAudio = [];
if (fs.existsSync(config.testAudioDir)) {
  testAudio = fs.readdirSync(config.testAudioDir)
    .filter(file => /\.(raw|pcm)$/i.test(file))
    .map(file => path.join(config.testAudioDir, file));
}

// Initialize Socket.IO
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  
  // Handle subscriptions to devices
  socket.on('subscribeToDevice', (deviceId) => {
    console.log(`Client ${socket.id} subscribed to device: ${deviceId}`);
    socket.join(`interphone:${deviceId}`);
    
    // Send device status
    socket.emit('deviceStatus', {
      deviceId: deviceId,
      active: true,
      device: {
        id: deviceId,
        name: 'Test Interphone Device',
        type: 'interphone',
        status: 'online'
      }
    });
  });
  
  socket.on('unsubscribeFromDevice', (deviceId) => {
    console.log(`Client ${socket.id} unsubscribed from device: ${deviceId}`);
    socket.leave(`interphone:${deviceId}`);
  });
  
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Generate a simple test pattern if no images are available
function generateTestPattern(width = 320, height = 240) {
  const canvas = require('canvas').createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  
  // Fill background
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);
  
  // Draw color bars
  const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff', '#ffffff'];
  const barWidth = width / colors.length;
  
  colors.forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.fillRect(i * barWidth, 0, barWidth, height);
  });
  
  // Add timestamp
  const timestamp = new Date().toISOString();
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, height - 30, width, 30);
  ctx.fillStyle = '#ffffff';
  ctx.font = '14px Arial';
  ctx.fillText(timestamp, 10, height - 10);
  
  // Return as base64 JPEG
  return canvas.toBuffer('image/jpeg').toString('base64');
}

// Generate simple PCM audio
function generateTestAudio(sampleRate = 8000, durationMs = 200) {
  const numSamples = Math.floor(sampleRate * durationMs / 1000);
  const buffer = Buffer.alloc(numSamples * 2); // 16-bit samples = 2 bytes per sample
  
  // Generate a simple sine wave
  const frequency = 440; // A4 note
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const amplitude = Math.sin(2 * Math.PI * frequency * t) * 0.5;
    const sample = Math.floor(amplitude * 32767); // Convert to 16-bit
    
    // Write as little-endian 16-bit
    buffer.writeInt16LE(sample, i * 2);
  }
  
  return buffer.toString('base64');
}

// Send synchronized frames periodically
let frameCount = 0;
const sendSyncedFrames = () => {
  frameCount++;
  
  try {
    let videoData;
    let audioData;
    
    // Get video frame
    if (testImages.length > 0) {
      const imageIndex = frameCount % testImages.length;
      const imagePath = testImages[imageIndex];
      videoData = fs.readFileSync(imagePath).toString('base64');
    } else {
      videoData = generateTestPattern(640, 480);
    }
    
    // Get audio data
    if (testAudio.length > 0) {
      const audioIndex = frameCount % testAudio.length;
      const audioPath = testAudio[audioIndex];
      audioData = fs.readFileSync(audioPath).toString('base64');
    } else {
      audioData = generateTestAudio();
    }
    
    // Create synced frame
    const timestamp = Date.now();
    const frame = {
      deviceId: config.deviceId,
      timestamp: timestamp,
      hasAudio: true,
      hasVideo: true,
      audio: {
        data: audioData,
        format: 'pcm',
        sampleRate: 8000,
        channels: 1
      },
      video: {
        data: videoData,
        width: 640,
        height: 480,
        format: 'jpeg'
      }
    };
    
    // Broadcast to all clients subscribed to this device
    io.to(`interphone:${config.deviceId}`).emit('syncedFrame', frame);
    
    console.log(`📡 Frame ${frameCount} sent (${frame.video.data.length} bytes video, ${frame.audio.data.length} bytes audio)`);
  } catch (error) {
    console.error('Error sending frame:', error);
  }
};

// Start the server
server.listen(config.port, () => {
  console.log(`🚀 WebSocket test server running at http://localhost:${config.port}`);
  console.log(`📹 Sending synchronized frames for device: ${config.deviceId}`);
  console.log(`💡 To test: Open http://localhost:3000 and connect to device: ${config.deviceId}`);
  
  // Start sending frames
  setInterval(sendSyncedFrames, config.frameInterval);
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Stopping test server');
  server.close();
  process.exit();
});
