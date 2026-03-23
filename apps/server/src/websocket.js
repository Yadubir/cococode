const jwt = require('jsonwebtoken');
const logger = require('./utils/logger');
const db = require('./services/database');

const callUsersMap = new Map(); // socket.id -> workspaceId
const workspaceCallsMap = new Map(); // workspaceId -> Set of socket.ids

/**
 * WebSocket server setup for real time collab
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
        socket.on('document:join', async ({ documentId }) => {
            try {
                if (!documentId) return;
                const [workspaceId] = documentId.split(':');
                if (!workspaceId) return;

                const isMember = await db.isWorkspaceMember(workspaceId, user.id);
                
                if (!isMember) {
                    logger.warn(`Unauthorized document join attempt: ${user.email} -> ${documentId}`);
                    socket.emit('error', { message: 'Access denied: You are not a member of this workspace' });
                    return;
                }

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
            } catch (error) {
                logger.error(`Error in document:join for ${user.email}:`, error);
            }
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
                const isMember = await db.isWorkspaceMember(workspaceId, user.id);
                if (!isMember) {
                    logger.warn(`Unauthorized chat attempt from ${user.email} in workspace ${workspaceId}`);
                    return;
                }
                
                // Save to database
                const dbMessage = await db.createMessage({
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
                logger.error('Error in chat:message:', error);
            }
        });

        /**
         * Join workspace for general notifications
         */
        socket.on('workspace:join', async ({ workspaceId }) => {
            try {
                const isMember = await db.isWorkspaceMember(workspaceId, user.id);
                if (!isMember) {
                    logger.warn(`Unauthorized workspace join attempt from ${user.email} for ${workspaceId}`);
                    return;
                }

                socket.join(`workspace:${workspaceId}`);
                logger.info(`${user.email} joined workspace: ${workspaceId}`);
            } catch (error) {
                logger.error('Error in workspace:join:', error);
            }
        });

        // ==========================
        // WEBRTC SIGNALING (VOICE/VIDEO)
        // ==========================

        socket.on('webrtc:join-call', async ({ workspaceId, userId }) => {
            const isMember = await require('./services/database').isWorkspaceMember(workspaceId, user.id);
            if (!isMember) {
                socket.emit('webrtc:error', { message: 'Access denied' });
                return;
            }

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

/**
 * Cleanup all active calls for a workspace
 */
const cleanupWorkspaceCalls = (io, workspaceId) => {
    logger.info(`Cleaning up WebRTC calls for workspace: ${workspaceId}`);
    
    if (workspaceCallsMap.has(workspaceId)) {
        const usersInCall = workspaceCallsMap.get(workspaceId);
        
        // Notify all users in the call room
        io.to(`call:${workspaceId}`).emit('webrtc:call-ended', { workspaceId });
        
        // Clear maps
        for (const socketId of usersInCall) {
            callUsersMap.delete(socketId);
        }
        workspaceCallsMap.delete(workspaceId);
    }
};

module.exports = {
    setupWebSocket,
    cleanupWorkspaceCalls
};
