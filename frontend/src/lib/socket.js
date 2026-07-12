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

// Tear down the singleton on logout so it doesn't keep a live connection with a
// dead token; the next getSocket() builds a fresh one that handshakes anew.
export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
