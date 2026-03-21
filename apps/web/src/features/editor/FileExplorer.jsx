import { useState, useMemo } from 'react';
import {
    File,
    Folder,
    FolderOpen,
    Plus,
    RefreshCw,
    Trash2,
    ChevronRight,
    ChevronDown,
    FileCode,
    FileText,
    FileJson,
    FileType,
    Image,
    Share2
} from 'lucide-react';
import { useEditorStore } from '../../stores/editorStore';
import ShareModal from '../workspace/ShareModal';

function FileExplorer({ workspaceId, onFileOpen }) {
    const { files, isLoadingFiles, fetchFiles, createFile, deleteFile, renameFile } = useEditorStore();
    const [expandedFolders, setExpandedFolders] = useState(new Set(['root']));
    const [showNewFileModal, setShowNewFileModal] = useState(false);
    const [showShareModal, setShowShareModal] = useState(false);
    const [newFileName, setNewFileName] = useState('');
    const [newFileType, setNewFileType] = useState('file');
    const [contextMenu, setContextMenu] = useState(null);
    const [selectedDirectory, setSelectedDirectory] = useState(null);
    const [editingId, setEditingId] = useState(null);
    const [editingName, setEditingName] = useState('');
    const [createError, setCreateError] = useState(null);

    // Build file tree structure
    const fileTree = useMemo(() => {
        const tree = { id: 'root', name: 'root', children: [], path: '/' };

        files.forEach(file => {
            const parts = file.path.split('/').filter(Boolean);
            let current = tree;

            parts.forEach((part, index) => {
                const isLast = index === parts.length - 1;
                const currentPath = '/' + parts.slice(0, index + 1).join('/');
                const existingChild = current.children?.find(c => c.name === part && c.type === 'directory');

                if (existingChild) {
                    current = existingChild;
                } else if (!isLast) {
                    // Virtual folder (not explicitly a file/directory record in DB but part of a path)
                    const newFolder = {
                        id: `folder:${currentPath}`, // Guaranteed unique ID based on path
                        name: part,
                        children: [],
                        path: currentPath,
                        type: 'directory'
                    };
                    current.children = current.children || [];
                    current.children.push(newFolder);
                    current = newFolder;
                }
            });

            // Add the file (or explicitly created directory)
            current.children = current.children || [];
            if (!current.children.find(c => c.id === file.id)) {
                current.children.push({ ...file });
            }
        });

        return tree.children || [];
    }, [files]);

    // Toggle folder expansion
    const toggleFolder = (id) => {
        setExpandedFolders(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    // Handle file click
    const handleFileClick = (item) => {
        if (item.type === 'directory') {
            toggleFolder(item.id);
        } else {
            onFileOpen(item);
        }
    };

    // Handle context menu
    const handleContextMenu = (e, item) => {
        e.preventDefault();
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            item,
        });
    };

    // Close context menu
    const closeContextMenu = () => setContextMenu(null);

    // Handle delete
    const handleDelete = async () => {
        if (contextMenu?.item) {
            // Virtual folders don't have UUIDs, they start with folder:
            if (String(contextMenu.item.id).startsWith('folder:')) {
                alert('Cannot delete a virtual folder. Delete its contents instead.');
            } else if (confirm(`Delete "${contextMenu.item.name}"?`)) {
                await deleteFile(contextMenu.item.id);
            }
            closeContextMenu();
        }
    };

    // Handle Rename
    const handleStartRename = () => {
        if (contextMenu?.item) {
            if (String(contextMenu.item.id).startsWith('folder:')) {
                alert('Cannot rename virtual folders.');
            } else {
                setEditingId(contextMenu.item.id);
                setEditingName(contextMenu.item.name);
            }
            closeContextMenu();
        }
    };

    const handleRenameSubmit = async (item) => {
        if (!editingName.trim() || editingName === item.name) {
            setEditingId(null);
            return;
        }

        try {
            // Calculate new path if needed (if path is used for hierarchy)
            const parentPath = item.path.substring(0, item.path.lastIndexOf('/') + 1);
            const newPath = parentPath + editingName;

            await renameFile(item.id, editingName, newPath);
            setEditingId(null);
        } catch (error) {
            console.error('Failed to rename:', error);
        }
    };

    const handleRenameCancel = () => {
        setEditingId(null);
    };

    // Handle create file
    const handleCreateFile = async (e) => {
        e.preventDefault();
        if (!newFileName.trim()) return;
        setCreateError(null);

        try {
            const parentPath = selectedDirectory ? selectedDirectory.path : '/';
            const fullPath = parentPath.endsWith('/')
                ? `${parentPath}${newFileName}`
                : `${parentPath}/${newFileName}`;

            await createFile(fullPath, newFileName, newFileType);
            setShowNewFileModal(false);
            setNewFileName('');
            setSelectedDirectory(null);
            setCreateError(null);
        } catch (error) {
            console.error('Failed to create file:', error);
            const message = error.response?.data?.message || 'Failed to create file. Please try again.';
            setCreateError(message);
        }
    };

    // Get file icon based on extension
    const getFileIcon = (filename) => {
        const ext = filename.split('.').pop()?.toLowerCase();
        const iconMap = {
            js: FileCode,
            jsx: FileCode,
            ts: FileCode,
            tsx: FileCode,
            json: FileJson,
            css: FileType,
            scss: FileType,
            html: FileCode,
            md: FileText,
            txt: FileText,
            png: Image,
            jpg: Image,
            svg: Image,
        };
        return iconMap[ext] || File;
    };

    // Render tree item
    const renderTreeItem = (item, depth = 0) => {
        const isFolder = item.type === 'directory';
        const isExpanded = expandedFolders.has(item.id);
        const isEditing = editingId === item.id;
        const FileIcon = isFolder ? (isExpanded ? FolderOpen : Folder) : getFileIcon(item.name);

        return (
            <div key={item.id}>
                <div
                    className={`file-tree-item group ${isEditing ? 'bg-editor-active' : ''}`}
                    style={{ paddingLeft: `${depth * 12 + 8}px` }}
                    onClick={() => !isEditing && handleFileClick(item)}
                    onContextMenu={(e) => handleContextMenu(e, item)}
                >
                    {isFolder && (
                        <span className="w-4 flex-shrink-0">
                            {isExpanded ? (
                                <ChevronDown className="w-4 h-4" />
                            ) : (
                                <ChevronRight className="w-4 h-4" />
                            )}
                        </span>
                    )}
                    {!isFolder && <span className="w-4" />}

                    <FileIcon className={`w-4 h-4 flex-shrink-0 ${isFolder ? 'text-yellow-500' : 'text-editor-text-dim'}`} />

                    {isEditing ? (
                        <input
                            autoFocus
                            className="bg-editor-bg text-white text-sm px-1 py-0.5 w-full rounded outline-none border border-editor-accent"
                            value={editingName}
                            onChange={(e) => {
                                setEditingName(e.target.value);
                                setCreateError(null);
                            }}
                            onBlur={() => handleRenameSubmit(item)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleRenameSubmit(item);
                                if (e.key === 'Escape') handleRenameCancel();
                            }}
                            onClick={(e) => e.stopPropagation()}
                        />
                    ) : (
                        <span className="truncate text-sm">{item.name}</span>
                    )}

                    {!isEditing && (
                        <button
                            className="ml-auto p-1 opacity-0 group-hover:opacity-100 hover:bg-editor-active rounded"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleContextMenu(e, item);
                            }}
                        >
                            <Trash2 className="w-3 h-3 text-red-400" />
                        </button>
                    )}
                </div>

                {isFolder && isExpanded && item.children && (
                    <div>
                        {item.children
                            .sort((a, b) => {
                                // Folders first, then alphabetically
                                if (a.type === 'directory' && b.type !== 'directory') return -1;
                                if (a.type !== 'directory' && b.type === 'directory') return 1;
                                return a.name.localeCompare(b.name);
                            })
                            .map(child => renderTreeItem(child, depth + 1))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="w-64 bg-editor-sidebar border-r border-editor-border flex flex-col" onClick={closeContextMenu}>
            {/* Header */}
            <div className="panel-header">
                <div className="flex items-center gap-2">
                    <span>Explorer</span>
                </div>
                <div className="flex gap-1">
                    <button
                        onClick={() => setShowShareModal(true)}
                        className="p-1 hover:bg-editor-active rounded text-editor-accent"
                        title="Share Workspace"
                    >
                        <Share2 className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => {
                            setSelectedDirectory(null);
                            setCreateError(null);
                            setShowNewFileModal(true);
                        }}
                        className="p-1 hover:bg-editor-active rounded"
                        title="New File"
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => fetchFiles(workspaceId)}
                        className="p-1 hover:bg-editor-active rounded"
                        title="Refresh"
                    >
                        <RefreshCw className={`w-4 h-4 ${isLoadingFiles ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* File Tree */}
            <div className="flex-1 overflow-auto py-2">
                {isLoadingFiles ? (
                    <div className="text-center py-4 text-editor-text-dim text-sm">
                        Loading files...
                    </div>
                ) : files.length === 0 ? (
                    <div className="text-center py-8 text-editor-text-dim">
                        <Folder className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p className="text-sm">No files yet</p>
                        <button
                            onClick={() => {
                                setCreateError(null);
                                setShowNewFileModal(true);
                            }}
                            className="mt-3 text-editor-accent text-sm hover:underline"
                        >
                            Create first file
                        </button>
                    </div>
                ) : (
                    fileTree
                        .sort((a, b) => {
                            if (a.type === 'directory' && b.type !== 'directory') return -1;
                            if (a.type !== 'directory' && b.type === 'directory') return 1;
                            return a.name.localeCompare(b.name);
                        })
                        .map(item => renderTreeItem(item, 0))
                )}
            </div>

            {/* Context Menu */}
            {contextMenu && (
                <div
                    className="fixed bg-editor-sidebar border border-editor-border rounded-lg shadow-xl py-1 z-50"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {contextMenu.item.type === 'directory' && (
                        <button
                            onClick={() => {
                                setSelectedDirectory(contextMenu.item);
                                setNewFileType('file');
                                setCreateError(null);
                                setShowNewFileModal(true);
                                closeContextMenu();
                            }}
                            className="flex items-center gap-2 px-4 py-2 hover:bg-editor-active w-full text-left"
                        >
                            <Plus className="w-4 h-4" />
                            New File
                        </button>
                    )}
                    <button
                        onClick={handleStartRename}
                        className="flex items-center gap-2 px-4 py-2 hover:bg-editor-active w-full text-left"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Rename
                    </button>
                    <button
                        onClick={handleDelete}
                        className="flex items-center gap-2 px-4 py-2 hover:bg-editor-active w-full text-left text-red-400"
                    >
                        <Trash2 className="w-4 h-4" />
                        Delete
                    </button>
                </div>
            )}

            {/* New File Modal */}
            {showNewFileModal && (
                <div
                    className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
                    onClick={() => setShowNewFileModal(false)}
                >
                    <div
                        className="bg-editor-sidebar rounded-xl p-6 w-full max-w-md border border-editor-border shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="text-xl font-semibold text-white mb-4">Create New File</h3>
                        
                        {createError && (
                            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 text-sm">
                                {createError}
                            </div>
                        )}

                        <form onSubmit={handleCreateFile}>
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-editor-text mb-2">
                                    Type
                                </label>
                                <div className="flex gap-4">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            value="file"
                                            checked={newFileType === 'file'}
                                            onChange={(e) => setNewFileType(e.target.value)}
                                            className="text-editor-accent"
                                        />
                                        <File className="w-4 h-4" />
                                        <span>File</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            value="directory"
                                            checked={newFileType === 'directory'}
                                            onChange={(e) => setNewFileType(e.target.value)}
                                            className="text-editor-accent"
                                        />
                                        <Folder className="w-4 h-4" />
                                        <span>Folder</span>
                                    </label>
                                </div>
                            </div>

                            <div className="mb-4">
                                <label className="block text-sm font-medium text-editor-text mb-2">
                                    Name
                                </label>
                                <input
                                    type="text"
                                    value={newFileName}
                                    onChange={(e) => {
                                        setNewFileName(e.target.value);
                                        setCreateError(null);
                                    }}
                                    placeholder={newFileType === 'file' ? 'example.js' : 'folder-name'}
                                    className="input"
                                    autoFocus
                                />
                            </div>

                            <div className="flex gap-3 justify-end">
                                <button
                                    type="button"
                                    onClick={() => setShowNewFileModal(false)}
                                    className="btn btn-secondary"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={!newFileName.trim()}
                                    className="btn btn-primary disabled:opacity-50"
                                >
                                    Create
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Share Modal */}
            <ShareModal
                workspaceId={workspaceId}
                workspaceName="Workspace" // Ideally pass actual name
                isOpen={showShareModal}
                onClose={() => setShowShareModal(false)}
            />
        </div>
    );
}

export default FileExplorer;
