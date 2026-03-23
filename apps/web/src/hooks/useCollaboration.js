import { useEffect, useRef, useState, useCallback } from 'react';
import * as Y from 'yjs';
import { initCollabSocket, joinDocument, updateAwareness, removeAwareness, getYDoc } from '../services/collaboration';

/**
 * Hook to manage collaborative editing with Y.js
 */
export function useCollaboration(documentId, editorInstance) {
    const [remoteUsers, setRemoteUsers] = useState(new Map());
    const [isConnected, setIsConnected] = useState(false);
    const connectionRef = useRef(null);
    const decorationsRef = useRef([]);
    const isApplyingRemoteRef = useRef(false);
    const styleElementRef = useRef(null);

    // Initialize the style element for dynamic cursor colors
    useEffect(() => {
        const styleId = 'dynamic-cursor-colors';
        let styleEl = document.getElementById(styleId);
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = styleId;
            document.head.appendChild(styleEl);
        }
        styleElementRef.current = styleEl;

        return () => {
            // Only clean up on full unmount if we really wanted to, 
            // but multiple editors might share it. It's safer to just clear it on disconnect.
        };
    }, []);

    // Setup collaboration when document changes
    useEffect(() => {
        if (!documentId || !editorInstance) return;

        // Initialize collaboration
        initCollabSocket();

        const connection = joinDocument(
            documentId,
            // On document update
            (ydoc) => {
                const ytext = ydoc.getText('content');
                const model = editorInstance.getModel();
                if (model) {
                    const currentContent = model.getValue();
                    const ytextContent = ytext.toString();

                    // Only update if content differs AND Y.js is not empty
                    // (prevents clearing editor when server has no state)
                    if (currentContent !== ytextContent && ytextContent.length > 0) {
                        // Set flag to prevent triggering Y.js update from editor change
                        isApplyingRemoteRef.current = true;
                        const position = editorInstance.getPosition();
                        model.setValue(ytextContent);
                        if (position) {
                            editorInstance.setPosition(position);
                        }
                        // Reset flag after a tick to ensure the change event is processed
                        setTimeout(() => {
                            isApplyingRemoteRef.current = false;
                        }, 0);
                    }
                }
            },
            // On awareness update
            (awareness) => {
                setRemoteUsers(new Map(awareness));
                updateRemoteCursors(awareness);
            },
            // On initial sync
            (ydoc) => {
                const ytext = ydoc.getText('content');
                const model = editorInstance.getModel();

                // If Y.js doc is empty but editor has content, sync editor -> Y.js
                // Only do this after we are sure we've synced with server
                if (ytext.length === 0 && model && model.getValue()) {
                    // Mark as local change but we are initializing
                    ytext.insert(0, model.getValue());
                }
            }
        );

        if (connection) {
            connectionRef.current = connection;
            setIsConnected(true);

            // Listen for local editor changes
            const disposable = editorInstance.onDidChangeModelContent((event) => {
                // Skip if we're applying a remote update (to prevent infinite loop)
                if (isApplyingRemoteRef.current) return;

                const model = editorInstance.getModel();
                if (!model) return;

                // Apply changes to Y.js document
                const ytext = connection.ydoc.getText('content');

                connection.ydoc.transact(() => {
                    event.changes
                        .sort((a, b) => b.rangeOffset - a.rangeOffset) // Apply in reverse order
                        .forEach((change) => {
                            if (change.rangeLength > 0) {
                                ytext.delete(change.rangeOffset, change.rangeLength);
                            }
                            if (change.text) {
                                ytext.insert(change.rangeOffset, change.text);
                            }
                        });
                }, 'local'); // Mark as local origin
            });

            // Listen for cursor/selection changes
            const cursorDisposable = editorInstance.onDidChangeCursorPosition((e) => {
                updateAwareness(documentId, {
                    cursor: {
                        lineNumber: e.position.lineNumber,
                        column: e.position.column,
                    },
                });
            });

            const selectionDisposable = editorInstance.onDidChangeCursorSelection((e) => {
                updateAwareness(documentId, {
                    selection: {
                        startLineNumber: e.selection.startLineNumber,
                        startColumn: e.selection.startColumn,
                        endLineNumber: e.selection.endLineNumber,
                        endColumn: e.selection.endColumn,
                    },
                });
            });

            return () => {
                disposable.dispose();
                cursorDisposable.dispose();
                selectionDisposable.dispose();
                removeAwareness(documentId);
                connection.cleanup();
                setIsConnected(false);
                if (styleElementRef.current) {
                    styleElementRef.current.innerHTML = ''; // Clear remote cursors from DOM
                }
            };
        }
    }, [documentId, editorInstance]);

    // Update remote cursors in the editor
    const updateRemoteCursors = useCallback((awareness) => {
        if (!editorInstance) return;

        const socket = connectionRef.current?.socket;
        if (!socket) return;

        const decorations = [];
        let styleContent = ''; // Accumulate dynamic CSS

        awareness.forEach((state, clientId) => {
            // Skip our own cursor
            if (clientId === socket.id) return;

            const { cursor, selection, user } = state;
            if (!user) return;

            const color = user.color || '#888888';

            // Generate unique CSS classes for this user's cursor
            const cursorBeforeClass = `remote-cursor-before-${clientId}`;
            const selectionClass = `remote-selection-${clientId}`;

            // Append to our dynamic stylesheet string
            styleContent += `
                .${cursorBeforeClass} {
                    position: relative;
                }
                /* The vertical cursor line */
                .${cursorBeforeClass}::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: -1px;
                    width: 2px;
                    height: 20px; /* Hardcoded to ensure visibility on empty lines */
                    background-color: ${color};
                    z-index: 40;
                }
                /* The floating user name label */
                .${cursorBeforeClass}::after {
                    content: '${user.name || 'Anonymous'}';
                    position: absolute;
                    top: -20px;
                    left: -1px;
                    background-color: ${color};
                    color: white;
                    padding: 2px 6px;
                    font-size: 10px;
                    border-radius: 2px;
                    white-space: nowrap;
                    z-index: 50;
                    pointer-events: none;
                }
                .${selectionClass} {
                    background-color: ${color}33 !important; /* ~20% opacity */
                }
            `;

            // Remote cursor decoration
            if (cursor) {
                decorations.push({
                    range: {
                        startLineNumber: cursor.lineNumber,
                        startColumn: cursor.column,
                        endLineNumber: cursor.lineNumber,
                        endColumn: Math.max(cursor.column + 1, 1),
                    },
                    options: {
                        beforeContentClassName: cursorBeforeClass,
                        stickiness: 1,
                    },
                });
            }

            // Remote selection decoration
            if (selection && (
                selection.startLineNumber !== selection.endLineNumber ||
                selection.startColumn !== selection.endColumn
            )) {
                decorations.push({
                    range: {
                        startLineNumber: selection.startLineNumber,
                        startColumn: selection.startColumn,
                        endLineNumber: selection.endLineNumber,
                        endColumn: selection.endColumn,
                    },
                    options: {
                        className: selectionClass,
                        stickiness: 1,
                    },
                });
            }
        });

        // Apply generated CSS to the style block
        if (styleElementRef.current) {
            styleElementRef.current.innerHTML = styleContent;
        }

        // Apply decorations
        decorationsRef.current = editorInstance.deltaDecorations(
            decorationsRef.current,
            decorations
        );
    }, [editorInstance]);

    return {
        remoteUsers,
        isConnected,
    };
}

export default useCollaboration;
