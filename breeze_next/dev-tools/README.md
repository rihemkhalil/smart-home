# Development Tools

Tools for testing and developing the ESP32 interphone system.

## Available Tools

### unified_interphone_emulator.js
Complete emulator that simulates both audio and video ESP32 devices:
- Generates real BMP video frames with animated patterns
- Produces 440Hz sine wave audio data
- Uses unified device ID for both streams
- Registers via MQTT and streams via HTTP

**Usage:**
```bash
node unified_interphone_emulator.js <deviceId>
```

### clean_start_unified.js
Resets the system to a clean state:
- Stops any running emulators
- Clears device stores
- Restarts MQTT broker
- Prepares for fresh device testing

**Usage:**
```bash
node clean_start_unified.js
```

### demo_devices.sh
Quick demo script for rapid testing:
- Starts MQTT broker
- Launches unified emulator
- Provides quick access to demo interphone

**Usage:**
```bash
./demo_devices.sh
```

## Testing Workflow

1. Run `clean_start_unified.js` to reset system
2. Start the Next.js server with `pnpm dev`
3. Launch emulator with `unified_interphone_emulator.js`
4. Open browser to view stream: `http://localhost:3001/devices/{deviceId}/stream`
