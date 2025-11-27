import { NextRequest, NextResponse } from 'next/server';
import { streamStore } from '@/lib/streamStore';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  const { deviceId } = await params;
  
  if (!deviceId) {
    return NextResponse.json(
      { error: 'Device ID is required' },
      { status: 400 }
    );
  }

  // Set up Server-Sent Events
  const stream = new ReadableStream({
    start(controller) {
      console.log(`🔄 Starting SSE stream for device: ${deviceId}`);
      
      let isControllerClosed = false;
      
      // Helper function to safely enqueue data
      const safeEnqueue = (data: string) => {
        if (!isControllerClosed) {
          try {
            controller.enqueue(new TextEncoder().encode(data));
            return true;
          } catch (error) {
            if (error instanceof Error && error.message.includes('Controller is already closed')) {
              isControllerClosed = true;
              console.log(`🔌 SSE controller closed for device: ${deviceId}`);
            } else {
              console.error('Error enqueuing SSE data:', error);
            }
            return false;
          }
        }
        return false;
      };
      
      // Send initial connection message
      const initialData = `data: ${JSON.stringify({
        type: 'connection',
        deviceId,
        timestamp: Date.now(),
        message: 'Stream connected'
      })}\n\n`;
      safeEnqueue(initialData);

      // Subscribe to stream updates for this device
      const unsubscribe = streamStore.subscribe(deviceId, (frame) => {
        if (isControllerClosed) {
          // Clean up subscription if controller is closed
          unsubscribe();
          return;
        }
        
        const eventData = `data: ${JSON.stringify({
          type: 'frame',
          deviceId: frame.deviceId,
          timestamp: frame.timestamp,
          frameType: frame.type,
          data: frame.data,
          metadata: frame.metadata
        })}\n\n`;
        
        if (!safeEnqueue(eventData)) {
          // If enqueue fails, unsubscribe to prevent further attempts
          unsubscribe();
        }
      });

      // Send periodic heartbeat to keep connection alive
      const heartbeatInterval = setInterval(() => {
        if (isControllerClosed) {
          clearInterval(heartbeatInterval);
          return;
        }
        
        const heartbeatData = `data: ${JSON.stringify({
          type: 'heartbeat',
          deviceId,
          timestamp: Date.now()
        })}\n\n`;
        
        if (!safeEnqueue(heartbeatData)) {
          clearInterval(heartbeatInterval);
        }
      }, 30000); // Every 30 seconds

      // Cleanup function
      return () => {
        console.log(`🔌 Cleaning up SSE stream for device: ${deviceId}`);
        isControllerClosed = true;
        clearInterval(heartbeatInterval);
        unsubscribe();
      };
    },

    cancel() {
      console.log(`❌ SSE stream cancelled for device: ${deviceId}`);
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    },
  });
}
