import { NextApiRequest } from 'next';
import { NextApiResponseServerIO } from '@/types/socket';
import { Server as ServerIO } from 'socket.io';
import { setupSocketServer } from '@/lib/interphone-mqtt';

// Socket.IO handler for Next.js API routes
export default async function handler(
  req: NextApiRequest, 
  res: NextApiResponseServerIO
) {
  if (res.socket.server.io) {
    // Socket.IO server is already running
    console.log('Socket.IO already running');
    return res.end();
  }

  console.log('Setting up Socket.IO server...');
  
  // Create Socket.IO server
  const io = new ServerIO(res.socket.server, {
    path: '/api/socket',
    addTrailingSlash: false,
  });
  
  // Save Socket.IO instance to server object
  res.socket.server.io = io;
  
  // Setup interphone-specific socket handlers
  setupSocketServer(io);
  
  console.log('Socket.IO server initialized');
  res.end();
}
