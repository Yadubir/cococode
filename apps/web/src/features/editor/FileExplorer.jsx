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
    const { files, isLoadingFiles, fetchFiles, createFile, deleteFile } = useEditorStore();
    const [expandedFolders, setExpandedFolders] = useState(new Set(['/']));
    const [showNewFileModal, setShowNewFileModal] = useState(false);
    const [showShareModal, setShowShareModal] = useState(false);
    const [newFileName, setNewFileName] = useState('');
    const [newFileType, setNewFileType] = useState('file');
    const [contextMenu, setContextMenu] = useState(null);

    // Build file tree structure
    const fileTree = useMemo(() => {
        const tree = { name: 'root', children: [], path: '/' };

        files.forEach(file => {
            const parts = file.path.split('/').filter(Boolean);
            let current = tree;

            parts.forEach((part, index) => {
                const isLast = index === parts.length - 1;
                const existingChild = current.children?.find(c => c.name === part);

                if (existingChild) {
                    current = existingChild;
                } else if (!isLast) {
                    const newFolder = { name: part, children: [], path: parts.slice(0, index + 1).join('/'), type: 'directory' };
                    current.children = current.children || [];
                    current.children.push(newFolder);
                    current = newFolder;
                }
            });

            // Add the file
            current.children = current.children || [];
            if (!current.children.find(c => c.id === file.id)) {
                current.children.push({ ...file });
            }
        });

        return tree.children || [];
    }, [files]);

    // Toggle folder expansion
    const toggleFolder = (path) => {
        setExpandedFolders(prev => {
            const next = new Set(prev);
            if (next.has(path)) {
                next.delete(path);
            } else {
                next.add(path);
            }
            return next;
        });
    };

    // Handle file click
    const handleFileClick = (item) => {
        if (item.type === 'directory') {
            toggleFolder(item.path);
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
            if (confirm(`Delete "${contextMenu.item.name}"?`)) {
                await deleteFile(contextMenu.item.id);
            }
            closeContextMenu();
        }
    };

    // Handle create file
    const handleCreateFile = async (e) => {
        e.preventDefault();
        if (!newFileName.trim()) return;

        try {
            await createFile(`/${newFileName}`, newFileName, newFileType);
            setShowNewFileModal(false);
            setNewFileName('');
        } catch (error) {
            console.error('Failed to create file:', error);
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
        const isExpanded = expandedFolders.has(item.path);
        const FileIcon = isFolder ? (isExpanded ? FolderOpen : Folder) : getFileIcon(item.name);

        return (
            <div key={item.id || item.path}>
                <div
                    className="file-tree-item group"
                    style={{ paddingLeft: `${depth * 12 + 8}px` }}
                    onClick={() => handleFileClick(item)}
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
                    <span className="truncate text-sm">{item.name}</span>

                    <button
                        className="ml-auto p-1 opacity-0 group-hover:opacity-100 hover:bg-editor-active rounded"
                        onClick={(e) => {
                            e.stopPropagation();
                            handleContextMenu(e, item);
                        }}
                    >
                        <Trash2 className="w-3 h-3 text-red-400" />
                    </button>
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
                        onClick={() => setShowNewFileModal(true)}
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
                            onClick={() => setShowNewFileModal(true)}
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
                                    onChange={(e) => setNewFileName(e.target.value)}
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
