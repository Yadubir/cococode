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
        socket.on('chat:message', async ({ workspaceId, message }) => {
            try {
                // Save to database
                const dbMessage = await require('./services/database').createMessage({
                    workspaceId,
                    userId: user.id,
                    content: message
                });

                // Broadcast the saved message with DB ID and User Info
                io.to(`workspace:${workspaceId}`).emit('chat:message', {
                    id: dbMessage.id,
                    userId: dbMessage.userId,
                    userName: dbMessage.userName,
                    userAvatar: dbMessage.userAvatar,
                    message: dbMessage.content,
                    timestamp: dbMessage.createdAt,
                });
            } catch (error) {
                logger.error('Error saving chat message:', error);
            }
        });

        /**
         * Join workspace for general notifications
         */
        socket.on('workspace:join', ({ workspaceId }) => {
            socket.join(`workspace:${workspaceId}`);
            logger.info(`${user.email} joined workspace: ${workspaceId}`);
        });

        // ==========================
        // WEBRTC SIGNALING (VOICE/VIDEO)
        // ==========================

        const callUsersMap = new Map(); // socket.id -> workspaceId
        const workspaceCallsMap = new Map(); // workspaceId -> Set of socket.ids

        socket.on('webrtc:join-call', ({ workspaceId, userId }) => {
            // Track the user in the call room
            socket.join(`call:${workspaceId}`);
            callUsersMap.set(socket.id, workspaceId);

            if (!workspaceCallsMap.has(workspaceId)) {
                workspaceCallsMap.set(workspaceId, new Set());
            }
            workspaceCallsMap.get(workspaceId).add(socket.id);

            // Notify others in the call that a new user joined
            socket.to(`call:${workspaceId}`).emit('webrtc:user-joined', {
                callerId: socket.id,
                userId: user.id,
            });

            // Send to the joined user the list of current active users
            const usersInCall = Array.from(workspaceCallsMap.get(workspaceId)).filter(id => id !== socket.id);
            socket.emit('webrtc:active-users', usersInCall);
            logger.info(`${user.email} joined call in workspace ${workspaceId}`);
        });

        socket.on('webrtc:signal', (payload) => {
            io.to(payload.userToSignal || payload.callerId).emit('webrtc:signal', {
                signal: payload.signal,
                callerId: socket.id,
                id: socket.id,
                userId: user.id
            });
        });

        socket.on('webrtc:leave-call', ({ workspaceId }) => {
            socket.leave(`call:${workspaceId}`);
            callUsersMap.delete(socket.id);
            if (workspaceCallsMap.has(workspaceId)) {
                workspaceCallsMap.get(workspaceId).delete(socket.id);
            }
            socket.to(`call:${workspaceId}`).emit('webrtc:user-left', socket.id);
            logger.info(`${user.email} left call in workspace ${workspaceId}`);
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

            // Remove from WebRTC calls
            try {
                const workspaceId = callUsersMap?.get(socket.id);
                if (workspaceId && workspaceCallsMap?.has(workspaceId)) {
                    workspaceCallsMap.get(workspaceId).delete(socket.id);
                    socket.to(`call:${workspaceId}`).emit('webrtc:user-left', socket.id);
                }
                callUsersMap?.delete(socket.id);
            } catch (e) {
                // Ignore map scoping error if they weren't in a call
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
