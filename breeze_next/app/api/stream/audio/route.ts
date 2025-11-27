import { NextRequest, NextResponse } from 'next/server';
import { streamStore } from '@/lib/streamStore';

// This endpoint receives audio streams from ESP32 audio devices
export async function POST(request: NextRequest) {
  try {
    // Get the raw body text first
    const bodyText = await request.text();
    
    // Check if we have actual content
    if (!bodyText || bodyText.trim().length === 0) {
      return NextResponse.json(
        { error: 'Empty request body' },
        { status: 400 }
      );
    }

    // Try to parse JSON safely
    let requestBody;
    try {
      requestBody = JSON.parse(bodyText);
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      return NextResponse.json(
        { error: 'Invalid JSON format' },
        { status: 400 }
      );
    }

    const { deviceId, timestamp, audioData, sampleRate = 16000, streamType } = requestBody;
    
    if (!deviceId || !audioData) {
      return NextResponse.json(
        { error: 'Missing deviceId or audioData' },
        { status: 400 }
      );
    }

    // Store audio frame in stream store
    streamStore.addFrame({
      deviceId,
      timestamp,
      data: audioData,
      type: 'audio',
      metadata: {
        sampleRate,
        channels: 1 // Assuming mono audio for now
      }
    });
    
    console.log(`📡 Received audio chunk for ${deviceId} at ${timestamp}`);
    
    return NextResponse.json({
      status: 'received',
      deviceId,
      timestamp,
      sampleRate,
      streamType,
      message: 'Audio chunk processed and stored'
    });
    
  } catch (error) {
    console.error('Error processing audio stream:', error);
    return NextResponse.json(
      { error: 'Failed to process audio stream' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/stream/audio',
    description: 'Receives audio streams from ESP32 devices',
    method: 'POST',
    expectedFormat: {
      deviceId: 'string',
      timestamp: 'number',
      audioData: 'base64 or array',
      sampleRate: 'number (default: 16000)'
    }
  });
}
