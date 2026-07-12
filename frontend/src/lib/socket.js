import { io } from 'socket.io-client';
import { API_URL } from './api';

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(API_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1500,
    });
  }
  return socket;
}
