import { NextApiResponse } from 'next';
import { Server as ServerIO } from 'socket.io';

export interface NextApiResponseServerIO extends NextApiResponse {
  socket: {
    server: any & {
      io: ServerIO;
    };
  };
}
