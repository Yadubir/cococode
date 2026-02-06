import { useState, useEffect } from 'react';
import {
    GitBranch,
    GitCommit,
    Plus,
    Minus,
    RotateCcw,
    RefreshCw,
    Check,
    ChevronDown,
    ChevronRight,
    File,
    Upload,
    Download
} from 'lucide-react';
import api from '../../services/api';

function GitPanel({ workspaceId }) {
    const [currentBranch, setCurrentBranch] = useState('main');
    const [changes, setChanges] = useState({
        staged: [],
        unstaged: [],
        untracked: [],
    });
    const [commitMessage, setCommitMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [expandedSections, setExpandedSections] = useState(new Set(['unstaged', 'staged']));

    // Simulated git status - in production would call the API
    useEffect(() => {
        setChanges({
            staged: [
                { path: 'src/index.js', status: 'modified' },
            ],
            unstaged: [
                { path: 'src/App.jsx', status: 'modified' },
                { path: 'src/components/Button.jsx', status: 'modified' },
            ],
            untracked: [
                { path: 'src/utils/helpers.js', status: 'untracked' },
            ],
        });
    }, [workspaceId]);

    const toggleSection = (section) => {
        setExpandedSections(prev => {
            const next = new Set(prev);
            if (next.has(section)) {
                next.delete(section);
            } else {
                next.add(section);
            }
            return next;
        });
    };

    const handleStageFile = (file) => {
        setChanges(prev => ({
            ...prev,
            staged: [...prev.staged, file],
            unstaged: prev.unstaged.filter(f => f.path !== file.path),
            untracked: prev.untracked.filter(f => f.path !== file.path),
        }));
    };

    const handleUnstageFile = (file) => {
        setChanges(prev => ({
            ...prev,
            unstaged: [...prev.unstaged, file],
            staged: prev.staged.filter(f => f.path !== file.path),
        }));
    };

    const handleStageAll = () => {
        setChanges(prev => ({
            staged: [...prev.staged, ...prev.unstaged, ...prev.untracked],
            unstaged: [],
            untracked: [],
        }));
    };

    const handleUnstageAll = () => {
        setChanges(prev => ({
            staged: [],
            unstaged: [...prev.unstaged, ...prev.staged.filter(f => f.status !== 'untracked')],
            untracked: [...prev.untracked, ...prev.staged.filter(f => f.status === 'untracked')],
        }));
    };

    const handleCommit = async () => {
        if (!commitMessage.trim() || changes.staged.length === 0) return;

        setIsLoading(true);
        // Simulate commit
        setTimeout(() => {
            setChanges(prev => ({ ...prev, staged: [] }));
            setCommitMessage('');
            setIsLoading(false);
        }, 1000);
    };

    const getStatusIcon = (status) => {
        switch (status) {
            case 'modified':
                return <span className="text-yellow-500 text-xs font-bold">M</span>;
            case 'added':
                return <span className="text-green-500 text-xs font-bold">A</span>;
            case 'deleted':
                return <span className="text-red-500 text-xs font-bold">D</span>;
            case 'untracked':
                return <span className="text-gray-400 text-xs font-bold">U</span>;
            default:
                return null;
        }
    };

    const totalChanges = changes.staged.length + changes.unstaged.length + changes.untracked.length;

    return (
        <div className="h-full flex flex-col bg-editor-sidebar">
            {/* Branch Header */}
            <div className="p-3 border-b border-editor-border">
                <div className="flex items-center gap-2 mb-3">
                    <GitBranch className="w-4 h-4 text-editor-accent" />
                    <span className="font-medium">{currentBranch}</span>
                    <button className="ml-auto btn btn-secondary text-xs py-1 px-2">
                        <RefreshCw className="w-3 h-3" />
                    </button>
                </div>

                {/* Quick Actions */}
                <div className="flex gap-2">
                    <button className="flex-1 btn btn-secondary text-xs py-1 flex items-center justify-center gap-1">
                        <Download className="w-3 h-3" />
                        Pull
                    </button>
                    <button className="flex-1 btn btn-secondary text-xs py-1 flex items-center justify-center gap-1">
                        <Upload className="w-3 h-3" />
                        Push
                    </button>
                </div>
            </div>

            {/* Commit Message */}
            <div className="p-3 border-b border-editor-border">
                <textarea
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    placeholder="Commit message"
                    className="input resize-none h-20"
                />
                <button
                    onClick={handleCommit}
                    disabled={!commitMessage.trim() || changes.staged.length === 0 || isLoading}
                    className="w-full btn btn-primary mt-2 disabled:opacity-50"
                >
                    {isLoading ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                        <>
                            <Check className="w-4 h-4" />
                            Commit ({changes.staged.length} files)
                        </>
                    )}
                </button>
            </div>

            {/* Changes */}
            <div className="flex-1 overflow-auto">
                {totalChanges === 0 ? (
                    <div className="p-4 text-center text-editor-text-dim text-sm">
                        <GitCommit className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p>No changes to commit</p>
                    </div>
                ) : (
                    <>
                        {/* Staged Changes */}
                        <ChangeSection
                            title="Staged Changes"
                            count={changes.staged.length}
                            isExpanded={expandedSections.has('staged')}
                            onToggle={() => toggleSection('staged')}
                            files={changes.staged}
                            getStatusIcon={getStatusIcon}
                            actions={[
                                { icon: Minus, title: 'Unstage All', onClick: handleUnstageAll },
                            ]}
                            onFileAction={(file) => handleUnstageFile(file)}
                            fileActionIcon={Minus}
                            fileActionTitle="Unstage"
                        />

                        {/* Unstaged Changes */}
                        <ChangeSection
                            title="Changes"
                            count={changes.unstaged.length}
                            isExpanded={expandedSections.has('unstaged')}
                            onToggle={() => toggleSection('unstaged')}
                            files={changes.unstaged}
                            getStatusIcon={getStatusIcon}
                            actions={[
                                { icon: Plus, title: 'Stage All', onClick: handleStageAll },
                                { icon: RotateCcw, title: 'Discard All' },
                            ]}
                            onFileAction={(file) => handleStageFile(file)}
                            fileActionIcon={Plus}
                            fileActionTitle="Stage"
                        />

                        {/* Untracked Files */}
                        {changes.untracked.length > 0 && (
                            <ChangeSection
                                title="Untracked Files"
                                count={changes.untracked.length}
                                isExpanded={expandedSections.has('untracked')}
                                onToggle={() => toggleSection('untracked')}
                                files={changes.untracked}
                                getStatusIcon={getStatusIcon}
                                onFileAction={(file) => handleStageFile(file)}
                                fileActionIcon={Plus}
                                fileActionTitle="Stage"
                            />
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

function ChangeSection({
    title,
    count,
    isExpanded,
    onToggle,
    files,
    getStatusIcon,
    actions = [],
    onFileAction,
    fileActionIcon: FileActionIcon,
    fileActionTitle
}) {
    if (count === 0) return null;

    return (
        <div className="border-b border-editor-border">
            <div
                onClick={onToggle}
                className="flex items-center gap-2 px-3 py-2 hover:bg-editor-active cursor-pointer"
            >
                {isExpanded ? (
                    <ChevronDown className="w-4 h-4" />
                ) : (
                    <ChevronRight className="w-4 h-4" />
                )}
                <span className="text-sm font-medium">{title}</span>
                <span className="text-xs text-editor-text-dim">({count})</span>

                <div className="ml-auto flex gap-1">
                    {actions.map((action, idx) => (
                        <button
                            key={idx}
                            onClick={(e) => {
                                e.stopPropagation();
                                action.onClick?.();
                            }}
                            className="p-1 hover:bg-editor-active rounded"
                            title={action.title}
                        >
                            <action.icon className="w-3 h-3" />
                        </button>
                    ))}
                </div>
            </div>

            {isExpanded && (
                <div className="pb-2">
                    {files.map((file, idx) => (
                        <div
                            key={idx}
                            className="flex items-center gap-2 px-3 py-1 hover:bg-editor-active group"
                        >
                            {getStatusIcon(file.status)}
                            <File className="w-4 h-4 text-editor-text-dim" />
                            <span className="text-sm truncate flex-1">{file.path}</span>

                            {FileActionIcon && (
                                <button
                                    onClick={() => onFileAction?.(file)}
                                    className="p-1 hover:bg-editor-active rounded opacity-0 group-hover:opacity-100"
                                    title={fileActionTitle}
                                >
                                    <FileActionIcon className="w-3 h-3" />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default GitPanel;
