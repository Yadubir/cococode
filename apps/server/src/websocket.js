const jwt = require('jsonwebtoken');
const logger = require('./utils/logger');

/**
 * WebSocket server setup for real-time collaboration
 */
const setupWebSocket = (io, setupTerminalSocket) => {
    // Authentication middleware for WebSocket
    io.use((socket, next) => {
        const token = socket.handshake.auth.token;

        if (!token) {
            return next(new Error('Authentication required'));
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.user = decoded;
            next();
        } catch (error) {
            return next(new Error('Invalid token'));
        }
    });

    // Track connected users per document
    const documentUsers = new Map(); // documentId -> Set of user sockets
    const userSockets = new Map();   // socketId -> user info

    io.on('connection', (socket) => {
        const user = socket.user;
        logger.info(`User connected: ${user.email} (${socket.id})`);

        userSockets.set(socket.id, {
            id: user.id,
            email: user.email,
            name: user.name,
            color: generateUserColor(user.id),
        });

        // Setup terminal socket handlers
        if (setupTerminalSocket) {
            setupTerminalSocket(socket);
        }

        /**
         * Join a document for collaborative editing
         */
        socket.on('document:join', ({ documentId }) => {
            socket.join(`doc:${documentId}`);

            if (!documentUsers.has(documentId)) {
                documentUsers.set(documentId, new Set());
            }
            documentUsers.get(documentId).add(socket.id);

            // Notify others in the document
            const users = Array.from(documentUsers.get(documentId))
                .map(id => userSockets.get(id))
                .filter(Boolean);

            io.to(`doc:${documentId}`).emit('document:users', { users });

            logger.info(`${user.email} joined document: ${documentId}`);
        });

        /**
         * Leave a document
         */
        socket.on('document:leave', ({ documentId }) => {
            socket.leave(`doc:${documentId}`);

            if (documentUsers.has(documentId)) {
                documentUsers.get(documentId).delete(socket.id);

                const users = Array.from(documentUsers.get(documentId))
                    .map(id => userSockets.get(id))
                    .filter(Boolean);

                io.to(`doc:${documentId}`).emit('document:users', { users });
            }

            logger.info(`${user.email} left document: ${documentId}`);
        });

        /**
         * Broadcast cursor position
         */
        socket.on('cursor:update', ({ documentId, position }) => {
            socket.to(`doc:${documentId}`).emit('cursor:update', {
                userId: user.id,
                name: user.name,
                color: userSockets.get(socket.id)?.color,
                position,
            });
        });

        /**
         * Broadcast selection change
         */
        socket.on('selection:update', ({ documentId, selection }) => {
            socket.to(`doc:${documentId}`).emit('selection:update', {
                userId: user.id,
                name: user.name,
                color: userSockets.get(socket.id)?.color,
                selection,
            });
        });

        /**
         * Handle text chat messages
         */
        socket.on('chat:message', ({ workspaceId, message }) => {
            io.to(`workspace:${workspaceId}`).emit('chat:message', {
                id: Date.now().toString(),
                userId: user.id,
                userName: user.name,
                message,
                timestamp: new Date().toISOString(),
            });
        });

        /**
         * Join workspace for general notifications
         */
        socket.on('workspace:join', ({ workspaceId }) => {
            socket.join(`workspace:${workspaceId}`);
            logger.info(`${user.email} joined workspace: ${workspaceId}`);
        });

        /**
         * Handle disconnect
         */
        socket.on('disconnect', () => {
            logger.info(`User disconnected: ${user.email}`);

            // Remove from all documents
            for (const [documentId, users] of documentUsers.entries()) {
                if (users.has(socket.id)) {
                    users.delete(socket.id);

                    const remainingUsers = Array.from(users)
                        .map(id => userSockets.get(id))
                        .filter(Boolean);

                    io.to(`doc:${documentId}`).emit('document:users', { users: remainingUsers });
                }
            }

            userSockets.delete(socket.id);
        });
    });

    logger.info('WebSocket server initialized');
};

/**
 * Generate a consistent color for a user based on their ID
 */
const generateUserColor = (userId) => {
    const colors = [
        '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
        '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
        '#BB8FCE', '#85C1E9', '#F8B500', '#00CED1',
    ];

    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
        hash = userId.charCodeAt(i) + ((hash << 5) - hash);
    }

    return colors[Math.abs(hash) % colors.length];
};

module.exports = setupWebSocket;
