require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { createServer } = require('http');
const { Server } = require('socket.io');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const workspaceRoutes = require('./routes/workspaces');
const fileRoutes = require('./routes/files');
const { router: terminalRoutes, setupTerminalSocket } = require('./routes/terminal');
const aiRoutes = require('./routes/ai');
const gitRoutes = require('./routes/git');

const setupWebSocket = require('./websocket');
const { setupCollaborationServer } = require('./collaboration');
const logger = require('./utils/logger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { initDatabase } = require('./services/database');

const app = express();
const httpServer = createServer(app);

// Socket.io setup
const io = new Server(httpServer, {
    cors: {
        origin: (origin, callback) => {
            const allowed = (process.env.CORS_ORIGIN || '')
                .split(',')
                .map(o => o.trim())
                .filter(Boolean);
            // Allow requests with no origin (curl, server-to-server) or matching origins
            if (!origin || allowed.length === 0 || allowed.includes(origin) || allowed.includes('*')) {
                callback(null, true);
            } else {
                callback(new Error(`CORS: origin ${origin} not allowed`));
            }
        },
        methods: ['GET', 'POST'],
        credentials: true,
    },
});

// Middleware
app.use(helmet());
app.use(cors({
    origin: (origin, callback) => {
        const allowed = (process.env.CORS_ORIGIN || '')
            .split(',')
            .map(o => o.trim())
            .filter(Boolean);
        if (!origin || allowed.length === 0 || allowed.includes(origin) || allowed.includes('*')) {
            callback(null, true);
        } else {
            callback(new Error(`CORS: origin ${origin} not allowed`));
        }
    },
    credentials: true,
}));
app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/terminal', terminalRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/git', gitRoutes);


// WebSocket setup
setupWebSocket(io, setupTerminalSocket);

// Collaboration server (Y.js)
setupCollaborationServer(io);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 3001;

(async () => {
    try {
        // Start HTTP server FIRST so Railway's health check on /health
        // succeeds immediately — before the DB is ready.
        await new Promise((resolve) => {
            httpServer.listen(PORT, () => {
                logger.info(`🚀 CocoCode Server running on port ${PORT}`);
                logger.info(`📡 WebSocket server ready`);
                logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
                resolve();
            });
        });

        // Then connect to the database (with retries for cold Railway starts)
        let retries = 10;
        while (retries > 0) {
            try {
                await initDatabase();
                logger.info('✅ Database ready');
                break;
            } catch (err) {
                retries--;
                if (retries === 0) {
                    logger.error('❌ Database failed after all retries:', err);
                    process.exit(1);
                }
                logger.warn(`⏳ Database not ready, retrying in 3s... (${retries} attempts left)`);
                await new Promise(r => setTimeout(r, 3000));
            }
        }
    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
})();

module.exports = { app, io };

