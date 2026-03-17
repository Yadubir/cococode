import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { X, Plus, Maximize2, Minimize2 } from 'lucide-react';
import { getSocket } from '../../services/socket';
import api from '../../services/api';

function Terminal({ workspaceId, onClose, isMaximized, onToggleMaximize, onSessionChange }) {
    const terminalRef = useRef(null);
    const xtermRef = useRef(null);
    const fitAddonRef = useRef(null);
    const socketListenersRef = useRef([]);
    const [sessionId, setSessionId] = useState(null);
    const [isConnecting, setIsConnecting] = useState(true);
    const [error, setError] = useState(null);

    // Cleanup socket listeners and xterm disposables
    const cleanupListeners = useCallback(() => {
        const socket = getSocket();
        socketListenersRef.current.forEach((item) => {
            if (item.event && item.handler && socket) {
                socket.off(item.event, item.handler);
            }
            if (item.dispose && typeof item.dispose.dispose === 'function') {
                item.dispose.dispose();
            }
        });
        socketListenersRef.current = [];
    }, []);

    // Initialize terminal
    useEffect(() => {
        if (!terminalRef.current || xtermRef.current) return;

        const xterm = new XTerm({
            theme: {
                background: '#1e1e1e',
                foreground: '#d4d4d4',
                cursor: '#d4d4d4',
                cursorAccent: '#1e1e1e',
                selection: 'rgba(255, 255, 255, 0.3)',
                black: '#000000',
                red: '#cd3131',
                green: '#0dbc79',
                yellow: '#e5e510',
                blue: '#2472c8',
                magenta: '#bc3fbc',
                cyan: '#11a8cd',
                white: '#e5e5e5',
                brightBlack: '#666666',
                brightRed: '#f14c4c',
                brightGreen: '#23d18b',
                brightYellow: '#f5f543',
                brightBlue: '#3b8eea',
                brightMagenta: '#d670d6',
                brightCyan: '#29b8db',
                brightWhite: '#ffffff',
            },
            fontFamily: "'Fira Code', 'Consolas', 'Courier New', monospace",
            fontSize: 14,
            lineHeight: 1.2,
            cursorBlink: true,
            cursorStyle: 'block',
        });

        const fitAddon = new FitAddon();
        const webLinksAddon = new WebLinksAddon();

        xterm.loadAddon(fitAddon);
        xterm.loadAddon(webLinksAddon);
        xterm.open(terminalRef.current);

        xtermRef.current = xterm;
        fitAddonRef.current = fitAddon;

        // Fit terminal to container
        setTimeout(() => {
            fitAddon.fit();
        }, 0);

        // Create terminal session
        createSession();

        return () => {
            cleanupListeners();
            xterm.dispose();
            xtermRef.current = null;
        };
    }, [cleanupListeners]);

    // Handle resize
    useEffect(() => {
        const handleResize = () => {
            if (fitAddonRef.current) {
                fitAddonRef.current.fit();
            }
        };

        window.addEventListener('resize', handleResize);
        setTimeout(handleResize, 100);

        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, [isMaximized]);

    // Create terminal session
    const createSession = async () => {
        try {
            setIsConnecting(true);
            setError(null);

            const response = await api.post('/terminal/create', { workspaceId });
            const { sessionId: newSessionId } = response.data.data;
            setSessionId(newSessionId);
            onSessionChange?.(newSessionId);

            // Connect to WebSocket
            connectToTerminal(newSessionId);
        } catch (err) {
            console.error('Failed to create terminal session:', err);
            setError('Failed to create terminal session');
            setIsConnecting(false);
        }
    };

    // Connect terminal to WebSocket
    const connectToTerminal = useCallback((sid) => {
        const socket = getSocket();
        if (!socket || !xtermRef.current) return;

        const xterm = xtermRef.current;

        // Clean up any previous listeners
        cleanupListeners();

        // Define handlers
        const handleOutput = ({ sessionId: outputSessionId, data }) => {
            if (outputSessionId === sid) {
                xterm.write(data);
            }
        };

        const handleAttached = ({ sessionId: attachedSessionId }) => {
            if (attachedSessionId === sid) {
                setIsConnecting(false);
            }
        };

        const handleExit = ({ sessionId: exitSessionId, code }) => {
            if (exitSessionId === sid) {
                xterm.write(`\r\n\x1b[33mProcess exited with code ${code}\x1b[0m\r\n`);
            }
        };

        const handleError = ({ message }) => {
            xterm.write(`\r\n\x1b[31mError: ${message}\x1b[0m\r\n`);
        };

        // Register listeners and track them
        socket.on('terminal:output', handleOutput);
        socket.on('terminal:attached', handleAttached);
        socket.on('terminal:exit', handleExit);
        socket.on('terminal:error', handleError);

        // Track xterm disposables for cleanup
        const dataDisposable = xterm.onData((data) => {
            socket.emit('terminal:input', { sessionId: sid, data });
        });

        const resizeDisposable = xterm.onResize(({ cols, rows }) => {
            socket.emit('terminal:resize', { sessionId: sid, cols, rows });
        });

        socketListenersRef.current = [
            { event: 'terminal:output', handler: handleOutput },
            { event: 'terminal:attached', handler: handleAttached },
            { event: 'terminal:exit', handler: handleExit },
            { event: 'terminal:error', handler: handleError },
            { dispose: dataDisposable },
            { dispose: resizeDisposable },
        ];

        // Attach to terminal session
        socket.emit('terminal:attach', { sessionId: sid });
    }, [cleanupListeners]);

    // Close terminal session
    const handleClose = async () => {
        cleanupListeners();
        if (sessionId) {
            try {
                await api.delete(`/terminal/${sessionId}`);
                setSessionId(null);
                onSessionChange?.(null);
            } catch (err) {
                console.error('Failed to close terminal session:', err);
            }
        }
        onClose?.();
    };

    return (
        <div className={`flex flex-col bg-[#1e1e1e] ${isMaximized ? 'fixed inset-0 z-50' : 'h-64'}`}>
            {/* Terminal Header */}
            <div className="flex items-center justify-between px-3 py-1 bg-editor-sidebar border-b border-editor-border">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-editor-text">Terminal</span>
                    {isConnecting && (
                        <span className="text-xs text-editor-text-dim">Connecting...</span>
                    )}
                    {error && (
                        <span className="text-xs text-red-400">{error}</span>
                    )}
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={createSession}
                        className="p-1 hover:bg-editor-active rounded"
                        title="New Terminal"
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                    <button
                        onClick={onToggleMaximize}
                        className="p-1 hover:bg-editor-active rounded"
                        title={isMaximized ? 'Minimize' : 'Maximize'}
                    >
                        {isMaximized ? (
                            <Minimize2 className="w-4 h-4" />
                        ) : (
                            <Maximize2 className="w-4 h-4" />
                        )}
                    </button>
                    <button
                        onClick={handleClose}
                        className="p-1 hover:bg-editor-active rounded"
                        title="Close"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Terminal Content */}
            <div
                ref={terminalRef}
                className="flex-1 p-2 overflow-hidden"
                style={{ minHeight: isMaximized ? 'calc(100vh - 40px)' : '200px' }}
            />
        </div>
    );
}

export default Terminal;
