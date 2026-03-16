import { io } from 'socket.io-client';
import { useAuthStore } from '../stores/authStore';

let socket = null;

/**
 * Initialize socket connection
 */
export const initSocket = () => {
    if (socket?.connected) return socket;

    const { token } = useAuthStore.getState();

    if (!token) {
        console.warn('Cannot initialize socket without token');
        return null;
    }

    socket = io(import.meta.env.VITE_WS_URL || '', {
        auth: { token },
        transports: ['websocket', 'polling'],
        path: '/socket.io',
    });

    socket.on('connect', () => {
        console.log('Socket connected:', socket.id);
    });

    socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error.message);
    });

    socket.on('disconnect', (reason) => {
        console.log('Socket disconnected:', reason);
    });

    return socket;
};

/**
 * Get current socket instance
 */
export const getSocket = () => {
    if (!socket?.connected) {
        return initSocket();
    }
    return socket;
};

/**
 * Disconnect socket
 */
export const disconnectSocket = () => {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
};

export default { initSocket, getSocket, disconnectSocket };
