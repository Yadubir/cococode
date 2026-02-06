const express = require('express');
const { spawn, exec } = require('child_process');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// Store active terminal sessions
const terminalSessions = new Map();

/**
 * Create a new terminal session (command-based)
 */
router.post('/create', authenticate, (req, res) => {
    const sessionId = `${req.user.id}-${Date.now()}`;

    terminalSessions.set(sessionId, {
        userId: req.user.id,
        createdAt: new Date(),
        cwd: process.env.HOME || process.cwd(),
        history: [],
    });

    logger.info(`Terminal session ${sessionId} created`);

    res.json({
        success: true,
        data: { sessionId },
    });
});

/**
 * Execute a command in the terminal session
 */
router.post('/:sessionId/exec', authenticate, (req, res) => {
    const { sessionId } = req.params;
    const { command } = req.body;
    const session = terminalSessions.get(sessionId);

    if (!session || session.userId !== req.user.id) {
        return res.status(404).json({
            success: false,
            error: 'NotFoundError',
            message: 'Terminal session not found',
        });
    }

    if (!command) {
        return res.status(400).json({
            success: false,
            error: 'ValidationError',
            message: 'Command is required',
        });
    }

    // Handle cd command specially
    if (command.trim().startsWith('cd ')) {
        const path = command.trim().slice(3).trim();
        const newPath = path.startsWith('/')
            ? path
            : require('path').resolve(session.cwd, path);

        const fs = require('fs');
        if (fs.existsSync(newPath) && fs.statSync(newPath).isDirectory()) {
            session.cwd = newPath;
            return res.json({
                success: true,
                data: { output: '', cwd: session.cwd },
            });
        } else {
            return res.json({
                success: true,
                data: { output: `cd: no such directory: ${path}\n`, cwd: session.cwd },
            });
        }
    }

    // Execute command
    exec(command, {
        cwd: session.cwd,
        timeout: 30000,
        maxBuffer: 1024 * 1024 * 10, // 10MB
        env: {
            ...process.env,
            TERM: 'xterm-256color',
        },
    }, (error, stdout, stderr) => {
        session.history.push(command);

        let output = '';
        if (stdout) output += stdout;
        if (stderr) output += stderr;
        if (error && !stderr) output += error.message;

        res.json({
            success: true,
            data: {
                output,
                cwd: session.cwd,
                exitCode: error ? error.code || 1 : 0,
            },
        });
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
                cwd: session.cwd,
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

        socket.emit('terminal:attached', { sessionId, cwd: session.cwd });
        socket.emit('terminal:output', {
            sessionId,
            data: `\x1b[32m✓ Terminal connected\x1b[0m\n\x1b[36m${session.cwd}\x1b[0m $ `
        });
    });

    socket.on('terminal:input', ({ sessionId, data }) => {
        const session = terminalSessions.get(sessionId);

        if (!session || session.userId !== socket.user.id) {
            return;
        }

        // Buffer input until Enter is pressed
        if (!session.inputBuffer) {
            session.inputBuffer = '';
        }

        // Handle special characters
        if (data === '\r' || data === '\n') {
            // Execute command
            const command = session.inputBuffer.trim();
            session.inputBuffer = '';

            if (!command) {
                socket.emit('terminal:output', {
                    sessionId,
                    data: `\n\x1b[36m${session.cwd}\x1b[0m $ `
                });
                return;
            }

            // Handle cd command
            if (command.startsWith('cd ')) {
                const path = command.slice(3).trim();
                const newPath = path.startsWith('/')
                    ? path
                    : require('path').resolve(session.cwd, path);

                const fs = require('fs');
                if (fs.existsSync(newPath) && fs.statSync(newPath).isDirectory()) {
                    session.cwd = newPath;
                    socket.emit('terminal:output', {
                        sessionId,
                        data: `\n\x1b[36m${session.cwd}\x1b[0m $ `
                    });
                } else {
                    socket.emit('terminal:output', {
                        sessionId,
                        data: `\n\x1b[31mcd: no such directory: ${path}\x1b[0m\n\x1b[36m${session.cwd}\x1b[0m $ `
                    });
                }
                return;
            }

            // Handle clear
            if (command === 'clear') {
                socket.emit('terminal:output', {
                    sessionId,
                    data: `\x1b[2J\x1b[H\x1b[36m${session.cwd}\x1b[0m $ `
                });
                return;
            }

            // Execute shell command
            socket.emit('terminal:output', { sessionId, data: '\n' });

            exec(command, {
                cwd: session.cwd,
                timeout: 30000,
                maxBuffer: 1024 * 1024 * 10,
                env: {
                    ...process.env,
                    TERM: 'xterm-256color',
                    FORCE_COLOR: '1',
                },
            }, (error, stdout, stderr) => {
                let output = '';
                if (stdout) output += stdout;
                if (stderr) output += `\x1b[31m${stderr}\x1b[0m`;
                if (error && !stderr) output += `\x1b[31m${error.message}\x1b[0m\n`;

                output += `\x1b[36m${session.cwd}\x1b[0m $ `;

                socket.emit('terminal:output', { sessionId, data: output });
            });
        } else if (data === '\x7f' || data === '\b') {
            // Backspace
            if (session.inputBuffer.length > 0) {
                session.inputBuffer = session.inputBuffer.slice(0, -1);
                socket.emit('terminal:output', { sessionId, data: '\b \b' });
            }
        } else if (data === '\x03') {
            // Ctrl+C
            session.inputBuffer = '';
            socket.emit('terminal:output', {
                sessionId,
                data: `^C\n\x1b[36m${session.cwd}\x1b[0m $ `
            });
        } else if (data.charCodeAt(0) >= 32) {
            // Regular character
            session.inputBuffer += data;
            socket.emit('terminal:output', { sessionId, data });
        }
    });

    socket.on('terminal:resize', () => {
        // Not needed for command-based terminal
    });
};

module.exports = { router, setupTerminalSocket, terminalSessions };
