import { NextRequest, NextResponse } from 'next/server';
import { streamStore } from '@/lib/streamStore';

// This endpoint receives video streams from ESP32 video devices
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

    const { deviceId, timestamp, videoData, width = 640, height = 480, format = 'jpeg', streamType } = requestBody;
    
    if (!deviceId || !videoData) {
      return NextResponse.json(
        { error: 'Missing deviceId or videoData' },
        { status: 400 }
      );
    }

    // Store video frame in stream store
    streamStore.addFrame({
      deviceId,
      timestamp,
      data: videoData,
      type: 'video',
      metadata: {
        width,
        height,
        format
      }
    });

    console.log(`📡 Received video frame for ${deviceId} at ${timestamp}`);
    
    return NextResponse.json({
      status: 'received',
      deviceId,
      timestamp,
      resolution: `${width}x${height}`,
      format,
      streamType,
      message: 'Video frame processed and stored'
    });
    
  } catch (error) {
    console.error('Error processing video stream:', error);
    return NextResponse.json(
      { error: 'Failed to process video stream' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/stream/video',
    description: 'Receives video streams from ESP32 devices',
    method: 'POST',
    expectedFormat: {
      deviceId: 'string',
      timestamp: 'number',
      videoData: 'base64 encoded image',
      width: 'number (default: 640)',
      height: 'number (default: 480)',
      format: 'string (default: jpeg)'
    }
  });
}
