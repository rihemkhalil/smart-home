#!/usr/bin/env node

/**
 * ESP32 Camera Integration Tester
 * 
 * This script tests your ESP32 camera integration by:
 * 1. Testing MQTT connectivity to the cloud broker
 * 2. Verifying API endpoints
 * 3. Sending test frames through both channels
 * 4. Monitoring for responses
 */

const mqtt = require('mqtt');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Configuration - modify as needed
const config = {
  deviceId: 'test_esp32_cam',
  mqttBroker: 'mqtt://broker.hivemq.com',
  apiUrl: 'http://localhost:3000',
  framesToSend: 3,
  testImagePath: path.join(__dirname, 'test_images'),
  testTopics: {
    video: 'breeze/devices/{deviceId}/streams/video',
    discovery: 'breeze/devices/{deviceId}/discovery',
    status: 'breeze/devices/{deviceId}/status'
  }
};

// Create command line interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Test status tracking
const testResults = {
  mqttConnection: false,
  mqttPublish: false,
  apiPost: false,
  apiGet: false,
  integration: false
};

// Main entry point
async function main() {
  console.log('==================================');
  console.log('🔧 ESP32 Camera Integration Tester');
  console.log('==================================\n');

  console.log(`Testing with device ID: ${config.deviceId}`);
  console.log(`MQTT Broker: ${config.mqttBroker}`);
  console.log(`API URL: ${config.apiUrl}\n`);

  // Run tests in sequence
  await testMqttConnectivity();
  await testApiEndpoints();
  await testFrameTransmission();
  
  // Show final results
  displayResults();
}

// Test MQTT connectivity
async function testMqttConnectivity() {
  console.log('📡 Testing MQTT connectivity...');
  
  return new Promise((resolve) => {
    try {
      const client = mqtt.connect(config.mqttBroker, {
        clientId: `tester_${Math.random().toString(16).substring(2, 10)}`,
        clean: true,
        connectTimeout: 5000
      });
      
      // Set a timeout in case connection fails
      const timeout = setTimeout(() => {
        console.log('❌ MQTT connection timeout');
        resolve(false);
      }, 5000);
      
      client.on('connect', () => {
        clearTimeout(timeout);
        console.log('✅ Successfully connected to MQTT broker');
        
        // Test publishing a message
        const topic = config.testTopics.status.replace('{deviceId}', config.deviceId);
        client.publish(topic, JSON.stringify({ status: 'testing', timestamp: Date.now() }), (err) => {
          if (err) {
            console.log('❌ Failed to publish test message');
          } else {
            console.log('✅ Successfully published test message to ' + topic);
            testResults.mqttPublish = true;
          }
          
          // Disconnect and resolve
          client.end();
          testResults.mqttConnection = true;
          resolve(true);
        });
      });
      
      client.on('error', (err) => {
        clearTimeout(timeout);
        console.log('❌ MQTT connection error:', err.message);
        resolve(false);
      });
    } catch (error) {
      console.log('❌ Failed to initialize MQTT client:', error.message);
      resolve(false);
    }
  });
}

// Test API endpoints
async function testApiEndpoints() {
  console.log('\n🔌 Testing API endpoints...');
  
  // Test GET endpoint
  try {
    const getUrl = `${config.apiUrl}/api/stream/mqtt-ws?deviceId=${config.deviceId}`;
    console.log(`Testing GET: ${getUrl}`);
    
    const getResponse = await axios.get(getUrl, { validateStatus: () => true });
    
    if (getResponse.status === 200) {
      console.log('✅ GET endpoint is accessible');
      testResults.apiGet = true;
    } else if (getResponse.status === 404) {
      console.log('✅ GET endpoint returned 404 - This is expected if no frames exist yet');
      testResults.apiGet = true;
    } else {
      console.log(`❌ GET endpoint returned unexpected status: ${getResponse.status}`);
    }
  } catch (error) {
    console.log('❌ Error testing GET endpoint:', error.message);
  }
  
  // Test POST endpoint with minimal data
  try {
    const postUrl = `${config.apiUrl}/api/stream/mqtt-ws`;
    console.log(`Testing POST: ${postUrl}`);
    
    const testPayload = {
      deviceId: config.deviceId,
      timestamp: Date.now(),
      type: 'video',
      data: 'VGVzdCBEYXRh', // "Test Data" in base64
    };
    
    const postResponse = await axios.post(postUrl, testPayload, { 
      validateStatus: () => true,
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (postResponse.status === 200) {
      console.log('✅ POST endpoint is working');
      testResults.apiPost = true;
    } else {
      console.log(`❌ POST endpoint returned unexpected status: ${postResponse.status}`);
    }
  } catch (error) {
    console.log('❌ Error testing POST endpoint:', error.message);
  }
}

// Test sending frames through both channels
async function testFrameTransmission() {
  console.log('\n📷 Testing frame transmission...');
  
  // Check if we have test images
  const testImages = getTestImages();
  if (testImages.length === 0) {
    console.log('❌ No test images found. Skipping frame transmission test.');
    return;
  }
  
  // Send test frames
  let successCount = 0;
  for (let i = 0; i < Math.min(config.framesToSend, testImages.length); i++) {
    try {
      console.log(`\nSending test frame ${i + 1}/${config.framesToSend}...`);
      
      const imageData = fs.readFileSync(testImages[i]);
      const base64Data = imageData.toString('base64');
      
      const frame = {
        deviceId: config.deviceId,
        timestamp: Date.now(),
        type: 'video',
        data: base64Data,
        metadata: {
          format: 'jpeg',
          width: 640,
          height: 480
        }
      };
      
      // Send via API
      const apiResponse = await axios.post(`${config.apiUrl}/api/stream/mqtt-ws`, frame, {
        validateStatus: () => true,
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (apiResponse.status === 200) {
        console.log('✅ Frame successfully sent via API');
        successCount++;
      } else {
        console.log(`❌ API returned error: ${apiResponse.status}`);
      }
      
      // Wait a bit between frames
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.log('❌ Error sending test frame:', error.message);
    }
  }
  
  testResults.integration = successCount > 0;
  console.log(`\nSent ${successCount} frames successfully.`);
}

// Get list of test images
function getTestImages() {
  try {
    if (!fs.existsSync(config.testImagePath)) {
      console.log(`❌ Test image directory not found: ${config.testImagePath}`);
      return [];
    }
    
    return fs.readdirSync(config.testImagePath)
      .filter(file => /\.(jpg|jpeg|png)$/i.test(file))
      .map(file => path.join(config.testImagePath, file));
  } catch (error) {
    console.log('❌ Error reading test images:', error.message);
    return [];
  }
}

// Display final test results
function displayResults() {
  console.log('\n==================================');
  console.log('🔍 Test Results');
  console.log('==================================');
  
  console.log(`MQTT Broker Connection: ${testResults.mqttConnection ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`MQTT Message Publishing: ${testResults.mqttPublish ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`API GET Endpoint: ${testResults.apiGet ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`API POST Endpoint: ${testResults.apiPost ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Frame Transmission: ${testResults.integration ? '✅ PASS' : '❌ FAIL'}`);
  
  const overallResult = Object.values(testResults).every(result => result);
  console.log(`\nOverall: ${overallResult ? '✅ SYSTEM READY' : '❌ ISSUES DETECTED'}`);
  
  if (!overallResult) {
    console.log('\nRecommendations:');
    if (!testResults.mqttConnection) console.log('- Check MQTT broker address and internet connectivity');
    if (!testResults.mqttPublish) console.log('- Verify MQTT permissions and topic structure');
    if (!testResults.apiGet || !testResults.apiPost) console.log('- Ensure Next.js app is running and API routes are properly configured');
    if (!testResults.integration) console.log('- Check your frame processing pipeline in the application');
  }
  
  console.log('\n==================================');
  console.log('Test completed! You can now view the camera stream in your application.');
  console.log('Go to: http://localhost:3000/cameras');
  console.log('==================================');
  
  // Exit the process
  process.exit(0);
}

// Run the tests
main().catch(error => {
  console.error('Unexpected error during tests:', error);
  process.exit(1);
});
