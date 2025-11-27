'use client';

import { useState, useEffect } from 'react';
import { InterphoneDevice, InterphoneCallEvent } from '@/types/interphone';
import InterphoneCall from './InterphoneCall';

interface InterphoneManagerProps {
  devices: InterphoneDevice[];
}

export default function InterphoneManager({ devices }: InterphoneManagerProps) {
  const [activeCall, setActiveCall] = useState<InterphoneDevice | null>(null);
  const [incomingCall, setIncomingCall] = useState<InterphoneDevice | null>(null);
  const [callHistory] = useState<InterphoneCallEvent[]>([]);

  useEffect(() => {
    // TODO: Subscribe to MQTT call events
    console.log('InterphoneManager initialized with devices:', devices);
  }, [devices]);

  const handleCallDevice = (device: InterphoneDevice) => {
    setActiveCall(device);
    // TODO: Send call initiation to device via MQTT
    console.log(`Initiating call to device: ${device.id}`);
  };

  const handleAcceptCall = () => {
    if (incomingCall) {
      setActiveCall(incomingCall);
      setIncomingCall(null);
      // TODO: Send accept call event via MQTT
    }
  };

  const handleRejectCall = () => {
    if (incomingCall) {
      setIncomingCall(null);
      // TODO: Send reject call event via MQTT
    }
  };

  const handleEndCall = () => {
    setActiveCall(null);
    // TODO: Send end call event via MQTT
  };

  // Filter only interphone devices
  const interphoneDevices = devices.filter(device => device.type === 'INTERPHONE');

  if (interphoneDevices.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">📞 Interphone System</h2>
        <div className="text-center py-8">
          <div className="text-gray-400 text-6xl mb-4">📞</div>
          <h3 className="text-lg font-medium text-gray-600 mb-2">No Interphone Devices</h3>
          <p className="text-gray-500 mb-4">
            Connect ESP32 interphone devices to start making calls.
          </p>
          <div className="text-sm text-gray-400">
            <p>Expected device topics:</p>
            <code className="bg-gray-100 px-2 py-1 rounded">breeze/devices/[id]/interphone/incoming</code>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">📞 Interphone System</h2>
          <div className="text-sm text-gray-500">
            {interphoneDevices.length} device{interphoneDevices.length !== 1 ? 's' : ''} available
          </div>
        </div>

        {/* Device Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {interphoneDevices.map((device) => (
            <div 
              key={device.id} 
              className="border rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold">{device.name}</h3>
                  <p className="text-sm text-gray-600">{device.id}</p>
                </div>
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                  device.status === 'online' 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-red-100 text-red-800'
                }`}>
                  {device.status}
                </span>
              </div>

              {/* Device Capabilities */}
              <div className="flex items-center space-x-2 mb-3 text-xs text-gray-500">
                {device.capabilities?.audio && <span>🔊 Audio</span>}
                {device.capabilities?.video && <span>📹 Video</span>}
                {device.capabilities?.two_way_audio && <span>🎤 Two-way</span>}
              </div>

              {/* Last Seen */}
              {device.lastSeen && (
                <p className="text-sm text-gray-600 mb-3">
                  Last seen: {new Date(device.lastSeen).toLocaleString()}
                </p>
              )}

              {/* Call Button */}
              <button
                onClick={() => handleCallDevice(device)}
                disabled={device.status !== 'online' || activeCall !== null}
                className={`w-full py-2 px-4 rounded-md text-sm font-medium ${
                  device.status === 'online' && !activeCall
                    ? 'bg-blue-500 hover:bg-blue-600 text-white'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                {activeCall ? 'Call in Progress' : '📞 Call Device'}
              </button>

              {/* Last Seen (moved from capabilities section) */}
              {device.lastSeen && (
                <p className="text-xs text-gray-400 mt-2">
                  Last seen: {new Date(device.lastSeen).toLocaleString()}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Call History */}
        {callHistory.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold mb-3">Recent Calls</h3>
            <div className="space-y-2">
              {callHistory.slice(0, 5).map((event, index) => (
                <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm">
                      {event.event_type === 'CALL_ANSWERED' ? '📞' :
                       event.event_type === 'CALL_ENDED' ? '📵' : '📲'}
                    </span>
                    <span className="text-sm">{event.device_id}</span>
                    <span className="text-sm text-gray-600">{event.event_type.replace('_', ' ')}</span>
                  </div>
                  <span className="text-xs text-gray-500">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* System Status */}
        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-semibold mb-2">System Status</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Total Devices:</span>
              <span className="ml-2 font-semibold">{interphoneDevices.length}</span>
            </div>
            <div>
              <span className="text-gray-600">Online:</span>
              <span className="ml-2 font-semibold text-green-600">
                {interphoneDevices.filter(d => d.status === 'online').length}
              </span>
            </div>
            <div>
              <span className="text-gray-600">Active Calls:</span>
              <span className="ml-2 font-semibold">{activeCall ? '1' : '0'}</span>
            </div>
            <div>
              <span className="text-gray-600">MQTT:</span>
              <span className="ml-2 font-semibold text-green-600">Connected</span>
            </div>
          </div>
        </div>
      </div>

      {/* Active Call Overlay */}
      {activeCall && (
        <InterphoneCall
          device={activeCall}
          onCallEnd={handleEndCall}
          onAcceptCall={handleAcceptCall}
          onRejectCall={handleRejectCall}
          isIncoming={false}
        />
      )}

      {/* Incoming Call Overlay */}
      {incomingCall && (
        <InterphoneCall
          device={incomingCall}
          onCallEnd={handleEndCall}
          onAcceptCall={handleAcceptCall}
          onRejectCall={handleRejectCall}
          isIncoming={true}
        />
      )}
    </>
  );
}
