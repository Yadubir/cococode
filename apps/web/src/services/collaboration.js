import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { io } from 'socket.io-client';
import { useAuthStore } from '../stores/authStore';

// Store Y.js documents per file
const ydocs = new Map();
const providers = new Map();
const awareness = new Map();

let collabSocket = null;

/**
 * Initialize collaboration socket
 */
export const initCollabSocket = () => {
    if (collabSocket?.connected) return collabSocket;

    const { token } = useAuthStore.getState();

    if (!token) {
        console.warn('Cannot initialize collaboration socket without token');
        return null;
    }

    collabSocket = io(
        `${import.meta.env.VITE_WS_URL || 'http://localhost:3001'}/collaboration`,
        {
            auth: { token },
            transports: ['websocket', 'polling'],
        }
    );

    collabSocket.on('connect', () => {
        console.log('Collaboration socket connected:', collabSocket.id);
    });

    collabSocket.on('connect_error', (error) => {
        console.error('Collaboration socket error:', error.message);
    });

    return collabSocket;
};

/**
 * Get or create Y.js document for a file
 */
export const getYDoc = (documentId) => {
    if (!ydocs.has(documentId)) {
        const ydoc = new Y.Doc();
        ydocs.set(documentId, ydoc);
        awareness.set(documentId, new Map());
    }
    return ydocs.get(documentId);
};

/**
 * Get awareness map for a document
 */
export const getAwareness = (documentId) => {
    if (!awareness.has(documentId)) {
        awareness.set(documentId, new Map());
    }
    return awareness.get(documentId);
};

/**
 * Join a document for collaborative editing
 */
export const joinDocument = (documentId, onUpdate, onAwarenessUpdate, onSync) => {
    const socket = initCollabSocket();
    if (!socket) return null;

    const ydoc = getYDoc(documentId);
    const docAwareness = getAwareness(documentId);

    // Join the document room
    socket.emit('doc:join', { documentId });

    // Handle initial sync
    socket.on('doc:sync', ({ documentId: docId, state }) => {
        if (docId === documentId && state) {
            const update = new Uint8Array(state);
            Y.applyUpdate(ydoc, update, 'remote');
            // Call onSync FIRST to allow populating empty Y.js doc from editor
            onSync?.(ydoc);
            // Then call onUpdate to sync the (now populated) Y.js to editor
            onUpdate?.(ydoc);
        }
    });

    // Handle remote updates
    socket.on('doc:update', ({ documentId: docId, update }) => {
        if (docId === documentId) {
            const updateArray = new Uint8Array(update);
            Y.applyUpdate(ydoc, updateArray, 'remote');
            onUpdate?.(ydoc);
        }
    });

    // Handle awareness sync
    socket.on('awareness:sync', ({ documentId: docId, states }) => {
        if (docId === documentId) {
            Object.entries(states).forEach(([clientId, state]) => {
                docAwareness.set(clientId, state);
            });
            onAwarenessUpdate?.(docAwareness);
        }
    });

    // Handle awareness updates
    socket.on('awareness:update', ({ documentId: docId, clientId, state }) => {
        if (docId === documentId) {
            docAwareness.set(clientId, state);
            onAwarenessUpdate?.(docAwareness);
        }
    });

    // Handle awareness removal
    socket.on('awareness:remove', ({ documentId: docId, clientId }) => {
        if (docId === documentId) {
            docAwareness.delete(clientId);
            onAwarenessUpdate?.(docAwareness);
        }
    });

    // Listen for local changes
    ydoc.on('update', (update, origin) => {
        if (origin !== 'remote') {
            socket.emit('doc:update', {
                documentId,
                update: Array.from(update)
            });
        }
    });

    return {
        ydoc,
        awareness: docAwareness,
        socket,
        cleanup: () => {
            socket.emit('doc:leave', { documentId });
            socket.off('doc:sync');
            socket.off('doc:update');
            socket.off('awareness:sync');
            socket.off('awareness:update');
            socket.off('awareness:remove');
        },
    };
};

/**
 * Update local awareness state (cursor, selection)
 */
export const updateAwareness = (documentId, state) => {
    if (!collabSocket) return;

    collabSocket.emit('awareness:update', {
        documentId,
        clientId: collabSocket.id,
        state,
    });
};

/**
 * Remove awareness (when leaving or unfocusing)
 */
export const removeAwareness = (documentId) => {
    if (!collabSocket) return;

    collabSocket.emit('awareness:remove', {
        documentId,
        clientId: collabSocket.id,
    });
};

/**
 * Get Y.Text for Monaco binding
 */
export const getYText = (documentId) => {
    const ydoc = getYDoc(documentId);
    return ydoc.getText('content');
};

export default {
    initCollabSocket,
    getYDoc,
    getAwareness,
    joinDocument,
    updateAwareness,
    removeAwareness,
    getYText,
};
