const express = require('express');
const pty = require('node-pty');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// Store active terminal sessions
const terminalSessions = new Map();

const SHELL = process.env.SHELL || '/bin/bash';

/**
 * Create a new terminal session with PTY
 */
router.post('/create', authenticate, (req, res) => {
    const sessionId = `${req.user.id}-${Date.now()}`;
    const tempDir = path.join(os.tmpdir(), 'cococode', sessionId);

    try {
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
    } catch (err) {
        logger.error('Failed to create session directory:', err);
        return res.status(500).json({
            success: false,
            message: 'Failed to create execution environment'
        });
    }

    try {
        // Spawn PTY process
        const ptyProcess = pty.spawn(SHELL, [], {
            name: 'xterm-256color',
            cols: 80,
            rows: 24,
            cwd: tempDir,
            env: {
                ...process.env,
                TERM: 'xterm-256color',
                COLORTERM: 'truecolor',
            }
        });

        const session = {
            userId: req.user.id,
            createdAt: new Date(),
            pty: ptyProcess,
            tempDir,
            socket: null,
            dataHandler: null
        };

        terminalSessions.set(sessionId, session);

        // Handle PTY exit
        ptyProcess.onExit(({ exitCode }) => {
            logger.info(`Terminal session ${sessionId} exited with code ${exitCode}`);
            if (session.socket) {
                session.socket.emit('terminal:exit', { sessionId, code: exitCode });
            }
            terminalSessions.delete(sessionId);
        });

        logger.info(`Terminal session ${sessionId} created (PID: ${ptyProcess.pid})`);

        res.json({
            success: true,
            data: { sessionId },
        });
    } catch (error) {
        logger.error('Failed to create PTY session:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create terminal session',
            error: error.message
        });
    }
});

/**
 * Execute a command in the terminal session
 */
router.post('/:sessionId/exec', authenticate, (req, res) => {
    const { sessionId } = req.params;
    const { command, files } = req.body;
    const session = terminalSessions.get(sessionId);

    if (!session || session.userId !== req.user.id) {
        return res.status(404).json({
            success: false,
            error: 'NotFoundError',
            message: 'Terminal session not found',
        });
    }

    // Write provided files to the session directory
    if (files && Array.isArray(files)) {
        try {
            for (const file of files) {
                if (file.name && typeof file.content === 'string') {
                    const filePath = path.join(session.tempDir, file.name);
                    fs.writeFileSync(filePath, file.content);
                    logger.info(`Wrote file: ${filePath}`);
                }
            }
        } catch (err) {
            logger.error('Failed to write files to session dir:', err);
        }
    }

    if (command && session.pty) {
        // Write command to PTY (PTY handles echo)
        session.pty.write(`${command}\r`);
    }

    res.json({
        success: true,
        message: 'Command sent to terminal',
    });
});

/**
 * Get list of active terminal sessions
 */
router.get('/sessions', authenticate, (req, res) => {
    const userSessions = [];

    for (const [sessionId, session] of terminalSessions.entries()) {
        if (session.userId === req.user.id) {
            userSessions.push({
                sessionId,
                createdAt: session.createdAt,
            });
        }
    }

    res.json({
        success: true,
        data: userSessions,
    });
});

/**
 * Close a terminal session
 */
router.delete('/:sessionId', authenticate, (req, res) => {
    const { sessionId } = req.params;
    const session = terminalSessions.get(sessionId);

    if (!session || session.userId !== req.user.id) {
        return res.status(404).json({
            success: false,
            error: 'NotFoundError',
            message: 'Terminal session not found',
        });
    }

    try {
        if (session.pty) {
            session.pty.kill();
        }
    } catch (e) {
        logger.warn(`Failed to kill PTY ${sessionId}:`, e);
    }

    // Cleanup temp dir
    if (session.tempDir && session.tempDir.includes('cococode')) {
        try {
            fs.rmSync(session.tempDir, { recursive: true, force: true });
        } catch (e) {
            logger.error(`Failed to cleanup session dir ${session.tempDir}:`, e);
        }
    }

    terminalSessions.delete(sessionId);

    res.json({
        success: true,
        message: 'Terminal session closed',
    });
});

/**
 * WebSocket handler for terminal I/O
 */
const setupTerminalSocket = (socket) => {
    socket.on('terminal:attach', ({ sessionId }) => {
        const session = terminalSessions.get(sessionId);

        if (!session || session.userId !== socket.user.id) {
            socket.emit('terminal:error', { message: 'Session not found' });
            return;
        }

        // Store socket reference
        session.socket = socket;

        // Set up PTY data handler
        if (session.pty && !session.dataHandler) {
            session.dataHandler = session.pty.onData((data) => {
                if (session.socket) {
                    session.socket.emit('terminal:output', { sessionId, data });
                }
            });
        }

        socket.emit('terminal:attached', { sessionId });
        socket.emit('terminal:output', {
            sessionId,
            data: '\x1b[32m✓ Terminal connected\x1b[0m\r\n'
        });
    });

    socket.on('terminal:input', ({ sessionId, data }) => {
        const session = terminalSessions.get(sessionId);
        if (session && session.userId === socket.user.id && session.pty) {
            // Write directly to PTY - it handles echo
            session.pty.write(data);
        }
    });

    socket.on('terminal:resize', ({ sessionId, cols, rows }) => {
        const session = terminalSessions.get(sessionId);
        if (session && session.userId === socket.user.id && session.pty) {
            try {
                session.pty.resize(cols, rows);
            } catch (err) {
                logger.warn(`Failed to resize terminal ${sessionId}:`, err);
            }
        }
    });

    socket.on('disconnect', () => {
        // Clean up socket references
        for (const session of terminalSessions.values()) {
            if (session.socket === socket) {
                session.socket = null;
            }
        }
    });
};

module.exports = { router, setupTerminalSocket, terminalSessions };
