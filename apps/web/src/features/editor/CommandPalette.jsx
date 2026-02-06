import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Search,
    File,
    Settings,
    Terminal,
    GitBranch,
    Plus,
    FolderOpen,
    LogOut,
    Palette,
    Command
} from 'lucide-react';
import { useEditorStore } from '../../stores/editorStore';
import { useAuthStore } from '../../stores/authStore';

function CommandPalette({ isOpen, onClose, onOpenTerminal }) {
    const navigate = useNavigate();
    const inputRef = useRef(null);
    const { files, openFile, createFile, workspaceId } = useEditorStore();
    const { logout } = useAuthStore();
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);

    // Define all commands
    const allCommands = useMemo(() => [
        // File commands
        { id: 'new-file', label: 'New File', icon: Plus, category: 'File', action: () => createFile('/untitled.txt', 'untitled.txt', 'file') },
        { id: 'new-folder', label: 'New Folder', icon: FolderOpen, category: 'File', action: () => createFile('/untitled', 'untitled', 'directory') },

        // Editor commands
        { id: 'toggle-terminal', label: 'Toggle Terminal', icon: Terminal, category: 'View', shortcut: 'Ctrl+`', action: () => onOpenTerminal?.() },
        { id: 'command-palette', label: 'Command Palette', icon: Command, category: 'View', shortcut: 'Ctrl+Shift+P' },

        // Settings
        { id: 'settings', label: 'Open Settings', icon: Settings, category: 'Preferences' },
        { id: 'theme', label: 'Color Theme', icon: Palette, category: 'Preferences' },

        // Git
        { id: 'git-status', label: 'Git: Status', icon: GitBranch, category: 'Git' },
        { id: 'git-commit', label: 'Git: Commit', icon: GitBranch, category: 'Git' },
        { id: 'git-push', label: 'Git: Push', icon: GitBranch, category: 'Git' },
        { id: 'git-pull', label: 'Git: Pull', icon: GitBranch, category: 'Git' },

        // Navigation
        { id: 'go-dashboard', label: 'Go to Dashboard', icon: FolderOpen, category: 'Navigation', action: () => navigate('/') },
        { id: 'logout', label: 'Sign Out', icon: LogOut, category: 'Account', action: () => { logout(); navigate('/login'); } },

        // Files - add all workspace files
        ...files.filter(f => f.type === 'file').map(file => ({
            id: `file-${file.id}`,
            label: file.name,
            description: file.path,
            icon: File,
            category: 'Files',
            action: () => openFile(file),
        })),
    ], [files, navigate, logout, onOpenTerminal, openFile, createFile]);

    // Filter commands based on query
    const filteredCommands = useMemo(() => {
        if (!query.trim()) {
            return allCommands;
        }

        const lowerQuery = query.toLowerCase();
        return allCommands.filter(cmd =>
            cmd.label.toLowerCase().includes(lowerQuery) ||
            cmd.category?.toLowerCase().includes(lowerQuery) ||
            cmd.description?.toLowerCase().includes(lowerQuery)
        );
    }, [allCommands, query]);

    // Focus input when opened
    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
            setQuery('');
            setSelectedIndex(0);
        }
    }, [isOpen]);

    // Reset selection when filtered results change
    useEffect(() => {
        setSelectedIndex(0);
    }, [filteredCommands.length]);

    // Handle keyboard navigation
    const handleKeyDown = (e) => {
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setSelectedIndex(i => Math.min(i + 1, filteredCommands.length - 1));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setSelectedIndex(i => Math.max(i - 1, 0));
                break;
            case 'Enter':
                e.preventDefault();
                if (filteredCommands[selectedIndex]) {
                    executeCommand(filteredCommands[selectedIndex]);
                }
                break;
            case 'Escape':
                onClose();
                break;
        }
    };

    // Execute command
    const executeCommand = (command) => {
        if (command.action) {
            command.action();
        }
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] bg-black/50"
            onClick={onClose}
        >
            <div
                className="w-full max-w-xl bg-editor-sidebar border border-editor-border rounded-lg shadow-2xl overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Search Input */}
                <div className="flex items-center gap-2 px-4 py-3 border-b border-editor-border">
                    <Search className="w-5 h-5 text-editor-text-dim" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Type a command or search..."
                        className="flex-1 bg-transparent border-none outline-none text-editor-text placeholder:text-editor-text-dim"
                    />
                    <kbd className="px-2 py-0.5 text-xs bg-editor-bg rounded text-editor-text-dim">
                        esc
                    </kbd>
                </div>

                {/* Command List */}
                <div className="max-h-80 overflow-auto">
                    {filteredCommands.length === 0 ? (
                        <div className="px-4 py-8 text-center text-editor-text-dim">
                            No commands found
                        </div>
                    ) : (
                        <div className="py-2">
                            {filteredCommands.map((command, index) => {
                                const Icon = command.icon;
                                return (
                                    <div
                                        key={command.id}
                                        className={`flex items-center gap-3 px-4 py-2 cursor-pointer ${index === selectedIndex ? 'bg-editor-active' : 'hover:bg-editor-active/50'
                                            }`}
                                        onClick={() => executeCommand(command)}
                                        onMouseEnter={() => setSelectedIndex(index)}
                                    >
                                        <Icon className="w-4 h-4 text-editor-text-dim flex-shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm text-editor-text truncate">
                                                {command.label}
                                            </div>
                                            {command.description && (
                                                <div className="text-xs text-editor-text-dim truncate">
                                                    {command.description}
                                                </div>
                                            )}
                                        </div>
                                        {command.shortcut && (
                                            <kbd className="px-2 py-0.5 text-xs bg-editor-bg rounded text-editor-text-dim flex-shrink-0">
                                                {command.shortcut}
                                            </kbd>
                                        )}
                                        <span className="text-xs text-editor-text-dim flex-shrink-0">
                                            {command.category}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default CommandPalette;
