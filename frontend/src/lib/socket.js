import { io } from 'socket.io-client';
import { API_URL } from './api';
import { getToken } from './auth';

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(API_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1500,
      // Sent on every (re)connect, so the current token is always used.
      auth: (cb) => cb({ token: getToken() }),
    });
  }
  return socket;
}
