'use client';

import { useEffect, useState } from 'react';
import { NextPage } from 'next';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import InterphoneCall from '@/components/InterphoneCall';

interface Device {
  id: string;
  name: string;
  type: string;
  status: string;
}

const StreamPage: NextPage = () => {
  const params = useParams() as { id: string };
  const deviceId = params.id;
  const [device, setDevice] = useState<Device | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch device info to determine if it's an interphone
    const fetchDevice = async () => {
      try {
        const response = await fetch('/api/devices');
        const data = await response.json();
        const foundDevice = data.devices.find((d: Device) => d.id === deviceId);
        
        if (foundDevice) {
          setDevice(foundDevice);
        } else {
          setError('Device not found');
        }
      } catch (error) {
        console.error('Device fetch error:', error);
        setError('Failed to load device');
      } finally {
        setLoading(false);
      }
    };

    fetchDevice();
  }, [deviceId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading device...</p>
        </div>
      </div>
    );
  }

  if (error || !device) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <h1 className="text-2xl font-bold mb-4 text-red-600">Error</h1>
        <p className="text-gray-600 mb-6">{error || 'Device not found'}</p>
        <Link href="/">
          <button className="px-4 py-2 bg-blue-100 text-blue-700 rounded hover:bg-blue-200">
            Back to Dashboard
          </button>
        </Link>
      </div>
    );
  }

  // If it's an interphone device, show the WebRTC interphone interface
  if (device.type === 'INTERPHONE') {
    return (
      <div className="min-h-screen bg-gray-900">
        <InterphoneCall 
          device={{
            id: device.id,
            name: device.name,
            type: 'INTERPHONE',
            status: device.status as 'online' | 'offline',
            state: 'on',
            lastSeen: new Date(),
            capabilities: {
              audio: true,
              video: true,
              two_way_audio: true
            },
            stream_config: {
              video_resolution: '640x480',
              audio_sample_rate: 16000,
              max_bitrate: 1000000
            },
            call_status: 'ACTIVE'
          }}
          onCallEnd={() => {
            // Navigate back to dashboard when call ends
            window.location.href = '/';
          }}
          onAcceptCall={() => {
            console.log('Call accepted');
          }}
          onRejectCall={() => {
            // Navigate back to dashboard when call is rejected
            window.location.href = '/';
          }}
          isIncoming={false}
        />
      </div>
    );
  }

  // For other device types, show basic info (no streaming yet)
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <h1 className="text-2xl font-bold mb-4 text-black">Device: {device.name}</h1>
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <div className="text-center">
          <div className="text-4xl mb-4">🔧</div>
          <h3 className="text-lg font-semibold mb-2">Non-Interphone Device</h3>
          <p className="text-gray-600 mb-4">
            Streaming is only available for interphone devices.
          </p>
          <div className="text-sm text-gray-500 mb-4">
            <p><strong>Type:</strong> {device.type}</p>
            <p><strong>Status:</strong> {device.status}</p>
          </div>
        </div>
      </div>
      <Link href="/">
        <button className="mt-6 px-4 py-2 bg-blue-100 text-blue-700 rounded hover:bg-blue-200">
          Back to Dashboard
        </button>
      </Link>
    </div>
  );
};

export default StreamPage;
