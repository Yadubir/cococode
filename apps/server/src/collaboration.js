const { WebsocketProvider } = require('y-websocket');
const Y = require('yjs');
const jwt = require('jsonwebtoken');
const logger = require('./utils/logger');
const db = require('./services/database');

// Store active Y.js documents
const ydocs = new Map();
const awareness = new Map();

/**
 * Setup Y.js collaboration server
 */
const setupCollaborationServer = (io) => {
    // Collaboration namespace
    const collabNamespace = io.of('/collaboration');

    // Authentication middleware
    collabNamespace.use((socket, next) => {
        const token = socket.handshake.auth.token;
        if (!token) {
            return next(new Error('Authentication required'));
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.user = decoded;
            next();
        } catch (err) {
            next(new Error('Invalid token'));
        }
    });

    collabNamespace.on('connection', (socket) => {
        logger.info(`Collaboration socket connected: ${socket.id} (user: ${socket.user.email})`);

        let currentDocId = null;

        /**
         * Helper to get or create a document with membership check
         */
        const getOrCreateDoc = async (documentId) => {
            if (!documentId) return null;
            const [workspaceId] = documentId.split(':');
            if (!workspaceId) return null;

            const isMember = await db.isWorkspaceMember(workspaceId, socket.user.id);
            if (!isMember) {
                logger.warn(`Unauthorized access attempt from ${socket.user.email} for document ${documentId}`);
                return null;
            }

            if (!ydocs.has(documentId)) {
                logger.info(`Lazy initializing ydoc for ${documentId}`);
                const ydoc = new Y.Doc();
                ydocs.set(documentId, ydoc);
                awareness.set(documentId, new Map());
                // In a real app, you'd load the latest state from DB here
            }
            return ydocs.get(documentId);
        };

        // Join a document for collaborative editing
        socket.on('doc:join', async ({ documentId }) => {
            try {
                const ydoc = await getOrCreateDoc(documentId);
                if (!ydoc) {
                    socket.emit('error', { message: 'Access denied' });
                    return;
                }

                currentDocId = documentId;
                socket.join(`doc:${documentId}`);

                // Send initial document state
                const state = Y.encodeStateAsUpdate(ydoc);
                socket.emit('doc:sync', {
                    documentId,
                    state: Array.from(state)
                });

                // Send current awareness states
                const docAwareness = awareness.get(documentId);
                const awarenessStates = {};
                docAwareness.forEach((state, odId) => {
                    awarenessStates[odId] = state;
                });
                socket.emit('awareness:sync', { documentId, states: awarenessStates });

                logger.info(`User ${socket.user.email} joined document: ${documentId}`);
            } catch (error) {
                logger.error('Error in doc:join:', error);
            }
        });

        // Handle document updates
        socket.on('doc:update', async ({ documentId, update }) => {
            try {
                const ydoc = await getOrCreateDoc(documentId);
                if (ydoc) {
                    // Apply update to server-side Y.js document
                    const updateArray = new Uint8Array(update);
                    Y.applyUpdate(ydoc, updateArray);

                    // Broadcast to other clients
                    socket.to(`doc:${documentId}`).emit('doc:update', {
                        documentId,
                        update
                    });
                }
            } catch (error) {
                logger.error('Error in doc:update:', error);
            }
        });

        // Handle awareness updates (cursor, selection, user info)
        socket.on('awareness:update', async ({ documentId, clientId, state }) => {
            try {
                const docAwarenessMap = awareness.get(documentId);
                // If it's missing, we try to authorize and create it
                if (!docAwarenessMap) {
                    const ydoc = await getOrCreateDoc(documentId);
                    if (!ydoc) return;
                }

                const docAwareness = awareness.get(documentId);
                if (docAwareness) {
                    docAwareness.set(clientId, {
                        ...state,
                        user: {
                            id: socket.user.id,
                            name: socket.user.name,
                            email: socket.user.email,
                            color: generateUserColor(socket.user.id),
                        },
                    });

                    // Broadcast to other clients
                    socket.to(`doc:${documentId}`).emit('awareness:update', {
                        documentId,
                        clientId,
                        state: docAwareness.get(clientId),
                    });
                }
            } catch (error) {
                logger.error('Error in awareness:update:', error);
            }
        });

        // Remove awareness on blur or disconnect
        socket.on('awareness:remove', ({ documentId, clientId }) => {
            const docAwareness = awareness.get(documentId);
            if (docAwareness) {
                docAwareness.delete(clientId);
                socket.to(`doc:${documentId}`).emit('awareness:remove', { documentId, clientId });
            }
        });

        // Leave document
        socket.on('doc:leave', ({ documentId }) => {
            socket.leave(`doc:${documentId}`);
            const docAwareness = awareness.get(documentId);
            if (docAwareness) {
                docAwareness.delete(socket.id);
                socket.to(`doc:${documentId}`).emit('awareness:remove', {
                    documentId,
                    clientId: socket.id
                });
            }
        });

        // Handle disconnect
        socket.on('disconnect', () => {
            if (currentDocId) {
                const docAwareness = awareness.get(currentDocId);
                if (docAwareness) {
                    docAwareness.delete(socket.id);
                    socket.to(`doc:${currentDocId}`).emit('awareness:remove', {
                        documentId: currentDocId,
                        clientId: socket.id,
                    });
                }
            }
            logger.info(`Collaboration socket disconnected: ${socket.id}`);
        });
    });

    logger.info('Collaboration server initialized');
    return collabNamespace;
};

/**
 * Generate a consistent color for a user based on their ID
 */
function generateUserColor(userId) {
    const colors = [
        '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
        '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
        '#BB8FCE', '#85C1E9', '#F8B500', '#00CED1',
    ];
    const hash = String(userId).split('').reduce((a, b) => {
        a = ((a << 5) - a) + b.charCodeAt(0);
        return a & a;
    }, 0);
    return colors[Math.abs(hash) % colors.length];
}

/**
 * Get Y.js document for persistence
 */
const getDocument = (documentId) => {
    return ydocs.get(documentId);
};

/**
 * Save document to database (call periodically)
 */
const persistDocument = async (documentId) => {
    const ydoc = ydocs.get(documentId);
    if (!ydoc) return null;

    const state = Y.encodeStateAsUpdate(ydoc);
    return Buffer.from(state);
};

/**
 * Load document from database
 */
const loadDocument = (documentId, savedState) => {
    let ydoc = ydocs.get(documentId);
    if (!ydoc) {
        ydoc = new Y.Doc();
        ydocs.set(documentId, ydoc);
        awareness.set(documentId, new Map());
    }

    if (savedState) {
        const update = new Uint8Array(savedState);
        Y.applyUpdate(ydoc, update);
    }

    return ydoc;
};

/**
 * Cleanup all collaborative documents for a workspace
 */
const cleanupWorkspaceDocs = (workspaceId) => {
    logger.info(`Cleaning up collaborative documents for workspace: ${workspaceId}`);
    
    // Cleanup ydocs and awareness
    for (const docId of ydocs.keys()) {
        if (docId.startsWith(`${workspaceId}:`)) {
            ydocs.delete(docId);
            awareness.delete(docId);
            logger.info(`Cleared document from memory: ${docId}`);
        }
    }
};

module.exports = {
    setupCollaborationServer,
    getDocument,
    persistDocument,
    loadDocument,
    generateUserColor,
    cleanupWorkspaceDocs
};
