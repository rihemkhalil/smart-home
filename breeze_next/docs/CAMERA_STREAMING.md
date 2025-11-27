# Remote ESP32 Camera Streaming Guide

This guide explains how to set up and use the ESP32 camera streaming solution across different networks.

## Overview

Our system allows ESP32 cameras to stream video to the frontend application from anywhere with internet connectivity. The solution uses:

1. A cloud MQTT broker for message routing
2. HTTP endpoints for video frame transmission
3. Efficient polling for frontend video display

## ESP32 Camera Setup

1. **Hardware Requirements**
   - ESP32-CAM or similar module
   - USB-to-TTL converter for programming

2. **Software Setup**
   - Flash the ESP32 with the `examples/esp32_cloud_camera.ino` sketch
   - Configure Wi-Fi credentials and device ID in the sketch:

```cpp
// ===== CONFIGURATION - FILL THESE IN =====
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* MQTT_BROKER = "broker.hivemq.com";  // Free public MQTT broker
const int MQTT_PORT = 1883;
const char* MQTT_CLIENT_ID = "esp32cam_";       // Will be appended with device MAC
const char* MQTT_TOPIC = "breeze/cameras/";     // Will be appended with device ID
const char* DEVICE_ID = "esp32cam_01";          // Unique device ID
// ==========================================
```

3. **Testing Connectivity**
   - Monitor the serial output to verify:
     - Wi-Fi connection
     - MQTT broker connection
     - Frame capture and transmission

## Frontend Integration

The frontend components are pre-configured to work with the cloud-based camera stream:

1. **InterphoneCall Component**
   - Automatically detects and uses cloud video stream when available
   - Falls back to local streaming when cloud is unavailable
   - Shows connection status and streaming statistics

2. **useMqttVideoStream Hook**
   - Handles HTTP polling for frame retrieval
   - Manages stream statistics and frame processing
   - Provides device control commands interface

## API Routes

The application includes API routes for handling video frames:

- `POST /api/stream/mqtt-ws` - Receives frames from ESP32 cameras
- `GET /api/stream/mqtt-ws?deviceId=xyz` - Retrieves the latest frame for a device

## Troubleshooting

If you encounter issues with the video stream:

1. **ESP32 Camera Problems**
   - Check Wi-Fi connectivity
   - Verify MQTT broker connection
   - Ensure proper camera initialization
   - Check serial monitor for error messages

2. **Network Issues**
   - Confirm internet connectivity on both ESP32 and server
   - Check if MQTT broker is accessible
   - Verify firewall settings allow MQTT traffic

3. **Frontend Display Issues**
   - Check browser console for errors
   - Verify device ID matches between ESP32 and frontend
   - Test HTTP endpoints directly in browser

## Security Considerations

This implementation uses a public MQTT broker for simplicity. For production use, consider:

1. Using a private MQTT broker with authentication
2. Implementing TLS for MQTT and HTTP connections
3. Adding device authentication mechanisms
4. Encrypting sensitive video data

## Advanced Configuration

For optimal performance, you can adjust:

1. **Video Quality**
   - Modify `videoQuality` in ESP32 code (0-63, lower is better)
   - Change frame size for different resolutions

2. **Transmission Rate**
   - Adjust `FRAME_INTERVAL` to balance frame rate and bandwidth

3. **Polling Frequency**
   - Change polling interval in `useMqttVideoStream.ts` for smoother video
