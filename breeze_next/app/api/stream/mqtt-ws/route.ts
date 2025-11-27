import { NextRequest } from 'next/server';
import { mqttManager } from '@/lib/mqtt';

// This API creates a simple HTTP polling endpoint for ESP32 camera frames
// We use this instead of WebSockets for simpler implementation

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Store the latest frames in memory by deviceId
const latestFrames = new Map<string, {
  timestamp: number;
  data: string;
  metadata?: Record<string, any>;
}>();

// This route receives video frames from the ESP32 camera
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (!body.deviceId || !body.data) {
      return new Response(JSON.stringify({ error: 'Missing deviceId or data' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Store the latest frame
    latestFrames.set(body.deviceId, {
      timestamp: body.timestamp || Date.now(),
      data: body.data,
      metadata: body.metadata || {}
    });
    
    // Forward to MQTT broker for cloud distribution
    const topic = `breeze/devices/${body.deviceId}/streams/video`;
    await mqttManager.publish(topic, JSON.stringify(body));
    
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error processing video frame:', error);
    return new Response(JSON.stringify({ error: 'Failed to process request' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// This route allows clients to get the latest frame for a device
export async function GET(request: NextRequest) {
  // Extract deviceId from the URL
  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get('deviceId');
  
  if (!deviceId) {
    return new Response(JSON.stringify({ error: 'Missing deviceId parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const frame = latestFrames.get(deviceId);
  
  if (!frame) {
    return new Response(JSON.stringify({ error: 'No frames available for this device' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return new Response(JSON.stringify({
    deviceId,
    timestamp: frame.timestamp,
    data: frame.data,
    metadata: frame.metadata
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    }
  });
}



// Initialize MQTT connection when the route module loads
(async function initMQTT() {
  try {
    await mqttManager.connect();
    console.log('MQTT connection initialized for cloud relay');
  } catch (error) {
    console.error('Failed to initialize MQTT connection:', error);
  }
})();
