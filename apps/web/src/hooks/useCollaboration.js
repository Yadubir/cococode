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
            };
        }
    }, [documentId, editorInstance]);

    // Update remote cursors in the editor
    const updateRemoteCursors = useCallback((awareness) => {
        if (!editorInstance) return;

        const socket = connectionRef.current?.socket;
        if (!socket) return;

        const decorations = [];

        awareness.forEach((state, clientId) => {
            // Skip our own cursor
            if (clientId === socket.id) return;

            const { cursor, selection, user } = state;
            if (!user) return;

            const color = user.color || '#888888';

            // Remote cursor decoration
            if (cursor) {
                decorations.push({
                    range: {
                        startLineNumber: cursor.lineNumber,
                        startColumn: cursor.column,
                        endLineNumber: cursor.lineNumber,
                        endColumn: cursor.column + 1,
                    },
                    options: {
                        className: 'remote-cursor',
                        beforeContentClassName: 'remote-cursor-before',
                        hoverMessage: { value: user.name },
                        stickiness: 1,
                        afterContentClassName: `remote-cursor-label`,
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
                        className: 'remote-selection',
                        stickiness: 1,
                    },
                });
            }
        });

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
