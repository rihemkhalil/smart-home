'use client';

import { useState, useEffect } from 'react';
import CameraViewer from '@/components/CameraViewer';

export default function CameraDashboard() {
  const [cameras, setCameras] = useState<Array<{id: string, name: string}>>([
    { id: 'test_camera_01', name: 'Test Camera 1' },
    // Add your camera devices here
  ]);
  
  const [customCameraId, setCustomCameraId] = useState('');
  const [layout, setLayout] = useState<'grid' | 'single'>('grid');
  const [activeCamera, setActiveCamera] = useState<string | null>(null);
  
  // Add a custom camera
  const addCustomCamera = () => {
    if (customCameraId && !cameras.some(camera => camera.id === customCameraId)) {
      setCameras([...cameras, { 
        id: customCameraId, 
        name: `Camera ${customCameraId}` 
      }]);
      setCustomCameraId('');
    }
  };
  
  // Handle camera click in grid view
  const handleCameraClick = (cameraId: string) => {
    if (layout === 'grid') {
      setActiveCamera(cameraId);
      setLayout('single');
    }
  };
  
  // Go back to grid view
  const backToGrid = () => {
    setLayout('grid');
    setActiveCamera(null);
  };
  
  // Remove a camera
  const removeCamera = (cameraId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCameras(cameras.filter(camera => camera.id !== cameraId));
    
    if (activeCamera === cameraId) {
      backToGrid();
    }
  };
  
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Camera Dashboard</h1>
      
      {/* Controls */}
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={customCameraId}
            onChange={(e) => setCustomCameraId(e.target.value)}
            placeholder="Enter Camera ID"
            className="px-3 py-2 border rounded"
          />
          <button
            onClick={addCustomCamera}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
          >
            Add Camera
          </button>
        </div>
        
        {layout === 'single' && (
          <button
            onClick={backToGrid}
            className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded"
          >
            Back to Grid View
          </button>
        )}
      </div>
      
      {/* Camera Grid */}
      {layout === 'grid' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cameras.map(camera => (
            <div 
              key={camera.id}
              className="bg-white rounded-lg shadow-md overflow-hidden cursor-pointer relative"
              onClick={() => handleCameraClick(camera.id)}
            >
              <div className="p-3 bg-gray-50 border-b flex justify-between items-center">
                <h3 className="font-medium">{camera.name}</h3>
                <button
                  onClick={(e) => removeCamera(camera.id, e)}
                  className="text-red-500 hover:text-red-700"
                >
                  ✕
                </button>
              </div>
              <CameraViewer
                deviceId={camera.id}
                width={320}
                height={240}
                showControls={false}
                className="p-2"
              />
            </div>
          ))}
        </div>
      )}
      
      {/* Single Camera View */}
      {layout === 'single' && activeCamera && (
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="p-3 bg-gray-50 border-b">
            <h3 className="font-medium">
              {cameras.find(c => c.id === activeCamera)?.name || activeCamera}
            </h3>
          </div>
          <div className="p-4">
            <CameraViewer
              deviceId={activeCamera}
              width={960}
              height={720}
              showControls={true}
              showStats={true}
              className="mx-auto"
            />
          </div>
        </div>
      )}
      
      {/* Empty state */}
      {cameras.length === 0 && (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-500 mb-4">No cameras added yet</p>
          <p className="text-sm text-gray-400">
            Add a camera using the input field above
          </p>
        </div>
      )}
    </div>
  );
}
