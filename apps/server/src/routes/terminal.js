const express = require('express');
const pty = require('node-pty');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { authenticate, ensureWorkspaceMember } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// Store active terminal sessions
const terminalSessions = new Map();

// Use bash explicitly : available everywhere including Docker Alpine (with bash installed)
// Fall back to sh if bash is not present
const SHELL = (() => {
    const candidates = ['/bin/bash', '/usr/bin/bash', '/bin/sh'];
    for (const s of candidates) {
        try { fs.accessSync(s, fs.constants.X_OK); return s; } catch {}
    }
    return '/bin/sh';
})();

/**
 * @route   POST /api/terminal/create
 * @desc    Create a new terminal session with PTY
 * @access  Private
 */
router.post('/create', authenticate, ensureWorkspaceMember, (req, res) => {
    const { workspaceId } = req.body;
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
        // Write a minimal .bashrc so the shell prompt is clean and stays in tempDir
        const bashrc = [
            `export HOME="${tempDir}"`,
            `export PS1="\\[\\033[0;32m\\]cococode\\[\\033[0m\\]:\\[\\033[0;34m\\]\\W\\[\\033[0m\\]$ "`,
            `export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"`,
            `cd "${tempDir}"`,
            `alias ll="ls -lah --color=auto"`,
            `alias la="ls -A --color=auto"`,
            `alias l="ls -CF --color=auto"`,
            `# Welcome`,
            `echo ""`,
            `echo -e "\\033[0;36m  CocoCode Terminal\\033[0m"`,
            `echo -e "\\033[0;90m  Workspace: ${sessionId}\\033[0m"`,
            `echo ""`,
        ].join('\n');

        fs.writeFileSync(path.join(tempDir, '.bashrc'), bashrc);
        fs.writeFileSync(path.join(tempDir, '.bash_profile'), `source "${path.join(tempDir, '.bashrc')}"\n`);

        // Spawn PTY process — HOME points to tempDir so shell rc files load from there
        const ptyProcess = pty.spawn(SHELL, ['--rcfile', path.join(tempDir, '.bashrc')], {
            name: 'xterm-256color',
            cols: 80,
            rows: 24,
            cwd: tempDir,
            env: {
                TERM: 'xterm-256color',
                COLORTERM: 'truecolor',
                HOME: tempDir,
                // Minimal safe PATH — no access to host dev tools unless in container
                PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
                SHELL,
                LANG: 'en_US.UTF-8',
                LC_ALL: 'en_US.UTF-8',
                // Pass through Node/Python/Go paths if present in the real env
                ...(process.env.NODE_PATH ? { NODE_PATH: process.env.NODE_PATH } : {}),
            }
        });

        const session = {
            userId: req.user.id,
            workspaceId,
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
 * @route   POST /api/terminal/:sessionId/exec
 * @desc    Execute a command in the terminal session
 * @access  Private
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
        // Always ensure we run from the workspace directory
        session.pty.write(`cd "${session.tempDir}" && ${command}\r`);
    }

    res.json({
        success: true,
        message: 'Command sent to terminal',
    });
});

/**
 * @route   GET /api/terminal/sessions
 * @desc    Get list of active terminal sessions
 * @access  Private
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
 * @route   DELETE /api/terminal/:sessionId
 * @desc    Close a terminal session
 * @access  Private
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
 * Cleanup all terminal sessions for a workspace
 */
const cleanupWorkspaceTerminals = async (workspaceId) => {
    logger.info(`Cleaning up terminal sessions for workspace: ${workspaceId}`);
    
    for (const [sessionId, session] of terminalSessions.entries()) {
        if (session.workspaceId === workspaceId) {
            try {
                if (session.pty) {
                    session.pty.kill();
                }
            } catch (e) {
                logger.warn(`Failed to kill PTY ${sessionId} during workspace cleanup:`, e);
            }

            // Cleanup temp dir
            if (session.tempDir && session.tempDir.includes('cococode')) {
                try {
                    // Use async rm for non-blocking cleanup
                    await fs.promises.rm(session.tempDir, { recursive: true, force: true });
                } catch (e) {
                    logger.error(`Failed to cleanup session dir ${session.tempDir} during workspace cleanup:`, e);
                }
            }

            terminalSessions.delete(sessionId);
        }
    }
};

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

module.exports = { router, setupTerminalSocket, terminalSessions, cleanupWorkspaceTerminals };
