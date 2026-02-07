import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import MonacoEditor from '@monaco-editor/react';
import {
    X,
    File,
    Save,
    Circle,
    Terminal as TerminalIcon,
    Users,
    Play
} from 'lucide-react';
import { useEditorStore } from '../../stores/editorStore';
import { initSocket } from '../../services/socket';
import api from '../../services/api';
import FileExplorer from './FileExplorer';
import CommandPalette from './CommandPalette';
import Terminal from '../terminal/Terminal';
import UserPresence from '../collaboration/UserPresence';
import { useCollaboration } from '../../hooks/useCollaboration';

function Editor() {
    const { workspaceId } = useParams();
    const {
        openFiles,
        activeFile,
        fileContents,
        setWorkspace,
        fetchFiles,
        openFile,
        closeFile,
        setActiveFile,
        updateFileContent,
        saveFile,
        hasUnsavedChanges,
    } = useEditorStore();

    const [isSaving, setIsSaving] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [showCommandPalette, setShowCommandPalette] = useState(false);
    const [showTerminal, setShowTerminal] = useState(false);
    const [isTerminalMaximized, setIsTerminalMaximized] = useState(false);
    const [activeTerminalSessionId, setActiveTerminalSessionId] = useState(null);
    const [editorInstance, setEditorInstance] = useState(null);

    // Collaboration
    const documentId = activeFile ? `${workspaceId}:${activeFile.id}` : null;
    const { remoteUsers, isConnected: isCollabConnected } = useCollaboration(documentId, editorInstance);

    // Initialize workspace and socket
    useEffect(() => {
        if (workspaceId) {
            setWorkspace(workspaceId);
            fetchFiles(workspaceId);
            initSocket();
        }
    }, [workspaceId, setWorkspace, fetchFiles]);

    // Handle keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Save: Ctrl+S
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                handleSave();
            }
            // Run: Ctrl+R (or maybe Ctrl+Enter?)
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                handleRun();
            }
            // Command Palette: Ctrl+Shift+P
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
                e.preventDefault();
                setShowCommandPalette(true);
            }
            // Quick Open: Ctrl+P
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'p') {
                e.preventDefault();
                setShowCommandPalette(true);
            }
            // Toggle Terminal: Ctrl+`
            if ((e.ctrlKey || e.metaKey) && e.key === '`') {
                e.preventDefault();
                setShowTerminal(prev => !prev);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeFile, activeTerminalSessionId]);

    // Save current file
    const handleSave = async () => {
        if (!activeFile || isSaving) return;

        setIsSaving(true);
        try {
            await saveFile(activeFile.id);
        } catch (error) {
            console.error('Save failed:', error);
        } finally {
            setIsSaving(false);
        }
    };

    // Run current file
    const handleRun = async () => {
        if (!activeFile || isRunning) return;

        setIsRunning(true);
        try {
            // 1. Save file first
            await handleSave();

            // 2. Ensure terminal is visible
            setShowTerminal(true);

            // 3. Check for active session
            if (!activeTerminalSessionId) {
                console.warn('No active terminal session');
                return;
            }

            // 4. Determine command
            const filename = activeFile.name;
            const ext = filename.split('.').pop().toLowerCase();
            let command = '';

            switch (ext) {
                case 'js':
                case 'jsx':
                    command = `node "${filename}"`;
                    break;
                case 'ts':
                case 'tsx':
                    command = `npx ts-node "${filename}"`;
                    break;
                case 'py':
                    command = `python3 "${filename}"`;
                    break;
                case 'c':
                    command = `gcc "${filename}" -o "${filename.split('.')[0]}" && "./${filename.split('.')[0]}"`;
                    break;
                case 'cpp':
                    command = `g++ "${filename}" -o "${filename.split('.')[0]}" && "./${filename.split('.')[0]}"`;
                    break;
                case 'java':
                    command = `javac "${filename}" && java "${filename.split('.')[0]}"`;
                    break;
                case 'go':
                    command = `go run "${filename}"`;
                    break;
                case 'rs':
                    command = `rustc "${filename}" && "./${filename.split('.')[0]}"`;
                    break;
                case 'sh':
                    command = `bash "${filename}"`;
                    break;
                default:
                    command = `echo "No runner configured for .${ext} files"`;
            }

            // 5. Execute command
            // Send current file content to be written to temp dir before execution
            const content = fileContents[activeFile.id] || '';
            const files = [{ name: filename, content }];

            await api.post(`/terminal/${activeTerminalSessionId}/exec`, {
                command,
                files
            });
        } catch (error) {
            console.error('Run failed:', error);
        } finally {
            setIsRunning(false);
        }
    };

    // Handle editor mount
    const handleEditorMount = (editor) => {
        setEditorInstance(editor);
    };

    // Handle editor content change
    const handleEditorChange = useCallback((value) => {
        if (activeFile && value !== undefined) {
            updateFileContent(activeFile.id, value);
        }
    }, [activeFile, updateFileContent]);

    // Get file extension for language detection
    const getLanguage = (filename) => {
        const ext = filename?.split('.').pop()?.toLowerCase();
        const langMap = {
            js: 'javascript',
            jsx: 'javascript',
            ts: 'typescript',
            tsx: 'typescript',
            py: 'python',
            rb: 'ruby',
            go: 'go',
            rs: 'rust',
            java: 'java',
            c: 'c',
            cpp: 'cpp',
            h: 'c',
            hpp: 'cpp',
            cs: 'csharp',
            php: 'php',
            html: 'html',
            css: 'css',
            scss: 'scss',
            json: 'json',
            xml: 'xml',
            yaml: 'yaml',
            yml: 'yaml',
            md: 'markdown',
            sql: 'sql',
            sh: 'shell',
            bash: 'shell',
        };
        return langMap[ext] || 'plaintext';
    };

    // Handle tab close
    const handleCloseTab = (file, e) => {
        e.stopPropagation();
        closeFile(file.id);
    };

    return (
        <div className="h-full flex flex-col">
            <div className="flex-1 flex overflow-hidden">
                {/* File Explorer Sidebar */}
                <FileExplorer workspaceId={workspaceId} onFileOpen={openFile} />

                {/* Editor Area */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    {/* User Presence Bar */}
                    {remoteUsers.size > 0 && (
                        <UserPresence remoteUsers={remoteUsers} />
                    )}

                    {/* Tabs */}
                    <div className="flex bg-editor-sidebar border-b border-editor-border overflow-x-auto flex-shrink-0">
                        {openFiles.map((file) => {
                            const hasChanges = hasUnsavedChanges(file.id);
                            return (
                                <div
                                    key={file.id}
                                    onClick={() => setActiveFile(file)}
                                    className={`editor-tab ${activeFile?.id === file.id ? 'active' : ''}`}
                                >
                                    <File className="w-4 h-4 text-editor-text-dim" />
                                    <span className="text-sm">{file.name}</span>
                                    {hasChanges && (
                                        <Circle className="w-2 h-2 fill-editor-accent text-editor-accent" />
                                    )}
                                    <button
                                        onClick={(e) => handleCloseTab(file, e)}
                                        className="ml-1 p-0.5 hover:bg-editor-active rounded"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            );
                        })}

                        {openFiles.length === 0 && (
                            <div className="px-4 py-2 text-editor-text-dim text-sm">
                                No files open
                            </div>
                        )}

                        {/* Collaboration indicator */}
                        {activeFile && isCollabConnected && (
                            <div className="flex items-center gap-1 px-2 text-xs text-green-400">
                                <Users className="w-3 h-3" />
                                <span>Live</span>
                            </div>
                        )}

                        <div className="ml-auto flex items-center pr-2 gap-1">
                            {/* Run button */}
                            {activeFile && (
                                <button
                                    onClick={handleRun}
                                    disabled={isRunning}
                                    className="px-3 py-1 text-xs text-green-400 hover:bg-editor-active flex items-center gap-1 transition-colors"
                                    title="Run Code (Ctrl+Enter)"
                                >
                                    <Play className="w-3 h-3" />
                                    {isRunning ? 'Running...' : 'Run'}
                                </button>
                            )}

                            {/* Save button */}
                            {activeFile && hasUnsavedChanges(activeFile.id) && (
                                <button
                                    onClick={handleSave}
                                    disabled={isSaving}
                                    className="px-3 py-1 text-xs text-editor-accent hover:bg-editor-active flex items-center gap-1"
                                >
                                    <Save className="w-3 h-3" />
                                    {isSaving ? 'Saving...' : 'Save'}
                                </button>
                            )}

                            {/* Terminal toggle button */}
                            <button
                                onClick={() => setShowTerminal(!showTerminal)}
                                className={`px-3 py-1 hover:bg-editor-active flex items-center gap-1 ${showTerminal ? 'text-editor-accent' : 'text-editor-text-dim'
                                    }`}
                                title="Toggle Terminal (Ctrl+`)"
                            >
                                <TerminalIcon className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Breadcrumb */}
                    {activeFile && (
                        <div className="flex items-center px-4 py-1 bg-editor-bg border-b border-editor-border text-xs text-editor-text-dim flex-shrink-0">
                            <span>{activeFile.path}</span>
                        </div>
                    )}

                    {/* Monaco Editor */}
                    <div className="flex-1 overflow-hidden">
                        {activeFile ? (
                            <MonacoEditor
                                height="100%"
                                language={getLanguage(activeFile.name)}
                                theme="vs-dark"
                                value={fileContents[activeFile.id] || ''}
                                onChange={handleEditorChange}
                                onMount={handleEditorMount}
                                options={{
                                    fontSize: 14,
                                    fontFamily: "'Fira Code', Consolas, 'Courier New', monospace",
                                    fontLigatures: true,
                                    minimap: { enabled: true },
                                    scrollBeyondLastLine: false,
                                    wordWrap: 'on',
                                    automaticLayout: true,
                                    tabSize: 2,
                                    lineNumbers: 'on',
                                    renderWhitespace: 'selection',
                                    cursorBlinking: 'smooth',
                                    smoothScrolling: true,
                                }}
                            />
                        ) : (
                            <div className="h-full flex items-center justify-center bg-editor-bg">
                                <div className="text-center">
                                    <div className="text-6xl mb-4 opacity-20">🚀</div>
                                    <h2 className="text-xl font-semibold text-white mb-2">
                                        Welcome to CocoCode
                                    </h2>
                                    <p className="text-editor-text-dim mb-4">
                                        Select a file from the explorer to start editing
                                    </p>
                                    <div className="flex flex-col gap-2 text-sm text-editor-text-dim">
                                        <span><kbd className="px-2 py-1 bg-editor-sidebar rounded">Ctrl+S</kbd> Save file</span>
                                        <span><kbd className="px-2 py-1 bg-editor-sidebar rounded">Ctrl+Enter</kbd> Run code</span>
                                        <span><kbd className="px-2 py-1 bg-editor-sidebar rounded">Ctrl+P</kbd> Quick Open</span>
                                        <span><kbd className="px-2 py-1 bg-editor-sidebar rounded">Ctrl+Shift+P</kbd> Command Palette</span>
                                        <span><kbd className="px-2 py-1 bg-editor-sidebar rounded">Ctrl+`</kbd> Toggle Terminal</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Terminal Panel */}
            <div style={{ display: showTerminal ? 'block' : 'none' }}>
                <Terminal
                    onClose={() => setShowTerminal(false)}
                    isMaximized={isTerminalMaximized}
                    onToggleMaximize={() => setIsTerminalMaximized(!isTerminalMaximized)}
                    onSessionChange={setActiveTerminalSessionId}
                />
            </div>

            {/* Command Palette */}
            <CommandPalette
                isOpen={showCommandPalette}
                onClose={() => setShowCommandPalette(false)}
                onOpenTerminal={() => setShowTerminal(true)}
            />
        </div>
    );
}

export default Editor;
