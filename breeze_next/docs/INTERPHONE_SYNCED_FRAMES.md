# Synchronized Audio/Video Frames with WebSockets

This document explains how the synchronized frame system works in the Breeze Interphone system.

## Overview

The Synchronized Frame system allows audio and video frames to be synchronized, processed, and delivered in real-time to the frontend via WebSockets. This provides a more efficient and lower-latency experience compared to traditional HTTP polling methods.

## Architecture

The system consists of the following components:

1. **StreamSynchronizer** - Core synchronization engine that matches audio and video frames
2. **InterphoneMQTTHandler** - Manages MQTT connections and forwards synced frames to WebSockets
3. **Socket.IO Server** - Handles WebSocket connections and broadcasts frames to clients
4. **Client Hooks** - React hooks that consume synchronized frames

## Server-Side Components

### Stream Synchronizer

Located in `lib/stream-synchronizer.ts`, this component:
- Receives individual audio and video frames from devices
- Buffers and sorts frames by timestamp
- Matches frames that belong together (within jitter tolerance)
- Emits synchronized frame events with both audio and video data

### Interphone MQTT Handler

Located in `lib/interphone-mqtt.ts`, this component:
- Subscribes to MQTT topics for audio and video streams
- Passes individual frames to the synchronizer
- Takes synchronized frames and broadcasts them to WebSocket clients
- Maintains device status and active connections

### Socket.IO Server

The Socket.IO server is initialized in `pages/api/socket/index.ts` and provides:
- WebSocket connections for browsers and clients
- Room-based subscription system for device streams
- Efficient frame broadcasting to subscribed clients

## Client-Side Components

### Socket Client

Located in `lib/socketClient.ts`, this utility:
- Manages the Socket.IO client connection
- Provides methods to subscribe/unsubscribe from device streams
- Handles reconnection and error scenarios

### useSyncedStream Hook

Located in `hooks/useSyncedStream.ts`, this React hook:
- Connects to the WebSocket server
- Subscribes to synchronized frames for a specific device
- Provides methods to render video frames and play audio
- Tracks stream statistics

### InterphoneCall Component

The `components/InterphoneCall.tsx` component uses the synchronized frames to:
- Display real-time video from interphone devices
- Play synchronized audio
- Show connection status and stream statistics

## Usage

### Initialize WebSocket Connection

Include the SocketInitializer component in your app layout:

```tsx
import SocketInitializer from '@/components/SocketInitializer';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <SocketInitializer />
        {children}
      </body>
    </html>
  );
}
```

### Using Synchronized Frames in Components

```tsx
import { useSyncedStream } from '@/hooks/useSyncedStream';

export default function MyComponent({ deviceId }) {
  const canvasRef = useRef(null);
  
  const {
    isConnected,
    latestFrame,
    renderVideoFrame,
    error,
    stats
  } = useSyncedStream(deviceId);
  
  useEffect(() => {
    if (latestFrame?.hasVideo && canvasRef.current) {
      renderVideoFrame(latestFrame.video, canvasRef.current);
    }
  }, [latestFrame, renderVideoFrame]);
  
  return (
    <div>
      <canvas ref={canvasRef} width={640} height={480} />
      <div>Status: {isConnected ? 'Connected' : 'Disconnected'}</div>
      <div>FPS: {stats.fps}</div>
    </div>
  );
}
```

## Testing

You can test the synchronized frame system using the provided test script:

```
node dev-tools/test_synced_frames.js
```

This script simulates synchronized audio and video frames sent through the WebSocket connection.

## Troubleshooting

### WebSocket Connection Issues

If the WebSocket connection fails to establish:
1. Check that the Socket.IO server is running
2. Verify that the client is properly initializing the connection
3. Look for CORS or network connectivity issues

### Missing or Delayed Frames

If frames are not appearing or are significantly delayed:
1. Check the MQTT connection to the broker
2. Verify that devices are sending frames correctly
3. Check synchronizer settings for buffer sizes and timeouts

### Audio/Video Synchronization Issues

If audio and video are not synchronized:
1. Adjust the `max_jitter_ms` setting in the synchronizer
2. Verify that device timestamps are accurate
3. Check for network congestion or bandwidth limitations
