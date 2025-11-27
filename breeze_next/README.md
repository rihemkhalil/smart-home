# Breeze Next - ESP32 Interphone System

A real-time interphone system built with Next.js, featuring ESP32 hardware devices for audio/video streaming.

## System Overview

**🎯 Unified Device Architecture:**
- Two ESP32 devices share the same `deviceId` (e.g., "interphone_01")
- Audio ESP32: I2S microphone capture → HTTP streaming
- Video ESP32-CAM: Camera capture → HTTP streaming
- Frontend: Real-time display via Server-Sent Events (SSE)

## Quick Start

1. **Start the server:**
   ```bash
   pnpm dev
   ```

2. **Start MQTT broker:**
   ```bash
   docker compose up mqtt
   ```

3. **Test with emulator:**
   ```bash
   node dev-tools/unified_interphone_emulator.js interphone_01
   ```

4. **View interphone:**
   Open http://localhost:3001/devices/interphone_01/stream

## Hardware Deployment

**ESP32 Audio Device:**
- File: `examples/esp32_audio_interphone_real.ino`
- Hardware: ESP32 + I2S microphone (INMP441)
- Captures PCM audio at 16kHz, streams via HTTP

**ESP32 Video Device:**
- File: `examples/esp32_video_interphone_real.ino`  
- Hardware: ESP32-CAM with OV2640 camera
- Captures JPEG frames at 5 FPS, streams via HTTP

**Configuration:**
Update WiFi credentials and server IP in both Arduino files:
```cpp
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* SERVER_IP = "192.168.1.100";  // Your computer's IP
const char* DEVICE_ID = "interphone_01";   // Same for both devices
```

## Architecture

- **Frontend:** Next.js 15.5.0 with TypeScript
- **Streaming:** HTTP ingestion + SSE real-time delivery
- **MQTT:** Device discovery and registration (Mosquitto)
- **Audio:** Web Audio API with PCM processing
- **Video:** HTML5 Canvas rendering

## Development Tools

- `dev-tools/unified_interphone_emulator.js`: Test emulator with real audio/video generation
- `dev-tools/clean_start_unified.js`: Reset system state
- `dev-tools/demo_devices.sh`: Quick demo setup
- Port 1883 (MQTT)
- Port 9001 (WebSocket)

### 3. Run the Application

```bash
pnpm dev
```

Visit `http://localhost:3000` to see the dashboard.

### 4. Configure ESP Devices

1. Upload the example ESP32 code (`examples/esp32_client.ino`) to your device
2. Update the device configuration:
   - `DEVICE_ID`: Unique identifier for your device
   - `DEVICE_NAME`: Human-readable device name
   - `MQTT_SERVER`: Your server's IP address
3. The device will create a WiFi hotspot "BreezeSetup_deviceid" for initial setup
4. Connect to the hotspot and configure your WiFi credentials

## Architecture

### MQTT Topics

The system uses a structured MQTT topic hierarchy:

- `breeze/devices/{device_id}/discovery` - Device registration
- `breeze/devices/{device_id}/status` - Device health status
- `breeze/devices/{device_id}/state` - Device on/off state
- `breeze/devices/{device_id}/command/{command}` - Commands to device

### API Endpoints

- `GET /api/devices` - List all devices
- `POST /api/devices` - Send commands to devices
- `GET /api/devices/{id}` - Get specific device info
- `PUT /api/devices/{id}` - Update device information

## Device Development

### ESP32/ESP8266 Integration

Your ESP devices need to:

1. **Connect to WiFi** with fallback captive portal
2. **Send discovery message** when connected
3. **Subscribe to command topics** for remote control
4. **Publish status updates** periodically
5. **Handle state changes** and report back

### Required Libraries

For ESP devices, install these Arduino libraries:

- WiFi (built-in)
- PubSubClient
- ArduinoJson
- WebServer (ESP32) or ESP8266WebServer (ESP8266)
- DNSServer

### Discovery Message Format

```json
{
  "id": "esp32-001",
  "name": "Living Room Light",
  "type": "ESP32",
  "firmware": "1.0.0",
  "ip": "192.168.1.100",
  "mac": "24:6F:28:12:34:56",
  "state": "off"
}
```

### Status Update Format

```json
{
  "online": true,
  "wifi_strength": -45,
  "uptime": 3600,
  "free_heap": 280000
}
```

### Command Format

```json
{
  "state": "on"
}
```

## Configuration

### Environment Variables

Create a `.env.local` file:

```env
MQTT_BROKER_URL=mqtt://localhost:1883
NEXT_PUBLIC_MQTT_WS_URL=ws://localhost:9001
```

### MQTT Broker Settings

The included `docker-compose.yml` configures Mosquitto with:

- Anonymous connections allowed (for simplicity)
- Persistence enabled
- WebSocket support on port 9001
- Logging to `/mqtt/log/mosquitto.log`

For production, consider adding authentication and TLS.

## Development

### Project Structure

```
breeze_next/
├── app/                    # Next.js app directory
│   ├── api/               # API routes
│   │   └── devices/       # Device management endpoints
│   ├── globals.css        # Global styles
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Home page
├── components/            # React components
│   └── Dashboard.tsx      # Main dashboard component
├── lib/                   # Utility libraries
│   ├── deviceStore.ts     # In-memory device storage
│   └── mqtt.ts           # MQTT client manager
├── types/                 # TypeScript type definitions
│   └── device.ts         # Device type definitions
├── examples/              # Example code
│   └── esp32_client.ino  # ESP32 client example
├── mqtt/                  # MQTT broker configuration
│   └── config/
│       └── mosquitto.conf
└── docker-compose.yml     # MQTT broker setup
```

### Adding New Device Types

1. Update the `Device` type in `types/device.ts`
2. Add device type handling in `components/Dashboard.tsx`
3. Update the ESP client code for device-specific features

### Extending API

The API is built with Next.js App Router. Add new endpoints in the `app/api/` directory.

## Production Deployment

### Security Considerations

- Add MQTT authentication and authorization
- Use TLS/SSL for MQTT connections
- Implement device authentication
- Add user authentication for the web interface
- Validate and sanitize all inputs

### Scaling

- Replace in-memory storage with a database (PostgreSQL, MongoDB)
- Add Redis for session management and caching
- Use proper message queuing for high device counts
- Implement device grouping and bulk operations

## Troubleshooting

### Common Issues

1. **Devices not appearing**: Check MQTT broker connectivity and topic subscription
2. **Commands not working**: Verify device MQTT connection and command topic subscription
3. **WiFi setup failing**: Ensure captive portal DNS is working correctly

### Debugging

- Check browser network tab for API errors
- Monitor MQTT broker logs: `docker-compose logs mosquitto`
- Use MQTT client tools like MQTT Explorer for debugging
- Check device serial output for connection issues

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.
