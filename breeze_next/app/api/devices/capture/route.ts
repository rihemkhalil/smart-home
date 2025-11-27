import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    // Get device IP from query params or use default
    const url = new URL(request.url);
    const deviceIp = url.searchParams.get('deviceIp') || '10.192.254.82';
    
    console.log(`Proxying image capture request to http://${deviceIp}/capture`);
    
    // Make request to device
    const response = await fetch(`http://${deviceIp}/capture`, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        'Accept': 'image/jpeg, image/png, image/*'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }
    
    // Get the image as a blob
    const imageBlob = await response.blob();
    
    // Create headers for the response
    const headers = new Headers();
    headers.set('Content-Type', response.headers.get('Content-Type') || 'image/jpeg');
    headers.set('Cache-Control', 'no-store');
    
    // Return the image directly
    return new NextResponse(imageBlob, {
      status: 200,
      headers
    });
  } catch (error) {
    console.error('Error capturing image from device:', error);
    return NextResponse.json(
      { error: 'Failed to capture image from device' }, 
      { status: 500 }
    );
  }
}
