import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Plus,
    FolderOpen,
    Users,
    Clock,
    MoreVertical,
    Trash2,
    Share2,
    Code2,
    Sparkles,
    Github,
    AlertCircle,
    Loader2
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import api from '../../services/api';
import AIAssistant from '../ai/AIAssistant';

function Dashboard() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { user } = useAuthStore();
    const [showNewModal, setShowNewModal] = useState(false);
    const [showAIAssistant, setShowAIAssistant] = useState(false);
    const [deleteModal, setDeleteModal] = useState({ show: false, workspaceId: null, workspaceName: '' });
    const [newWorkspaceName, setNewWorkspaceName] = useState('');

    const isGithubLinked = new URLSearchParams(window.location.search).get('github_linked') || !!user?.settings?.githubToken;

    const handleLinkGithub = () => {
        const token = useAuthStore.getState().token;
        if (!token) return;
        const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
        window.location.href = `${baseUrl}/auth/github?state=${token}`;
    };

    // Fetch workspaces
    const { data: workspaces, isLoading } = useQuery({
        queryKey: ['workspaces'],
        queryFn: async () => {
            const response = await api.get('/workspaces');
            return response.data.data;
        },
    });

    // Create workspace mutation
    const createWorkspace = useMutation({
        mutationFn: async (name) => {
            const response = await api.post('/workspaces', { name });
            return response.data.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['workspaces']);
            setShowNewModal(false);
            setNewWorkspaceName('');
        },
    });

    // Delete workspace mutation
    const deleteWorkspace = useMutation({
        mutationFn: async (id) => {
            const response = await api.delete(`/workspaces/${id}`);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['workspaces']);
            setDeleteModal({ show: false, workspaceId: null, workspaceName: '' });
        },
    });

    const handleCreateWorkspace = (e) => {
        e.preventDefault();
        if (newWorkspaceName.trim()) {
            createWorkspace.mutate(newWorkspaceName.trim());
        }
    };

    const handleDeleteWorkspace = () => {
        if (deleteModal.workspaceId) {
            deleteWorkspace.mutate(deleteModal.workspaceId);
        }
    };

    return (
        <div className="h-full overflow-auto bg-editor-bg">
            {/* Header */}
            <div className="bg-gradient-to-r from-editor-accent/20 via-purple-500/10 to-editor-accent/20 border-b border-editor-border">
                <div className="max-w-6xl mx-auto px-8 py-12">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="p-3 bg-editor-accent rounded-xl">
                            <Code2 className="w-8 h-8 text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-white">
                                Welcome back, {user?.name?.split(' ')[0]}!
                            </h1>
                            <p className="text-editor-text-dim">
                                Your collaborative coding workspace
                            </p>
                        </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="flex gap-3 mt-6">
                        <button
                            onClick={() => setShowNewModal(true)}
                            className="btn btn-primary flex items-center gap-2"
                        >
                            <Plus className="w-4 h-4" />
                            New Workspace
                        </button>
                        <button
                            onClick={() => setShowAIAssistant(true)}
                            className="btn btn-secondary flex items-center gap-2"
                        >
                            <Sparkles className="w-4 h-4" />
                            AI Assistant
                        </button>
                        <button
                            onClick={handleLinkGithub}
                            className="btn btn-secondary flex items-center gap-2"
                        >
                            <Github className="w-4 h-4" />
                            {isGithubLinked ? 'GitHub Linked \u2713' : 'Link GitHub'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Workspaces Grid */}
            <div className="max-w-6xl mx-auto px-8 py-8">
                <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <FolderOpen className="w-5 h-5" />
                    Your Workspaces
                </h2>

                {isLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="h-40 bg-editor-sidebar rounded-xl animate-pulse" />
                        ))}
                    </div>
                ) : workspaces?.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {workspaces.map((workspace) => (
                            <WorkspaceCard
                                key={workspace.id}
                                workspace={workspace}
                                onClick={() => navigate(`/workspace/${workspace.id}`)}
                                onDelete={() => setDeleteModal({
                                    show: true,
                                    workspaceId: workspace.id,
                                    workspaceName: workspace.name
                                })}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-16 bg-editor-sidebar rounded-xl border border-editor-border">
                        <FolderOpen className="w-16 h-16 mx-auto mb-4 text-editor-text-dim opacity-50" />
                        <h3 className="text-xl font-semibold text-white mb-2">No workspaces yet</h3>
                        <p className="text-editor-text-dim mb-6">
                            Create your first workspace to start coding
                        </p>
                        <button
                            onClick={() => setShowNewModal(true)}
                            className="btn btn-primary"
                        >
                            Create Workspace
                        </button>
                    </div>
                )}
            </div>

            {/* New Workspace Modal */}
            {showNewModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-editor-sidebar rounded-xl p-6 w-full max-w-md border border-editor-border shadow-2xl">
                        <h3 className="text-xl font-semibold text-white mb-4">Create Workspace</h3>
                        <form onSubmit={handleCreateWorkspace}>
                            <input
                                type="text"
                                value={newWorkspaceName}
                                onChange={(e) => setNewWorkspaceName(e.target.value)}
                                placeholder="Workspace name"
                                className="input mb-4"
                                autoFocus
                            />
                            <div className="flex gap-3 justify-end">
                                <button
                                    type="button"
                                    onClick={() => setShowNewModal(false)}
                                    className="btn btn-secondary"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={!newWorkspaceName.trim() || createWorkspace.isPending}
                                    className="btn btn-primary disabled:opacity-50"
                                >
                                    {createWorkspace.isPending ? 'Creating...' : 'Create'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteModal.show && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-editor-sidebar rounded-xl p-6 w-full max-w-md border border-editor-border shadow-2xl">
                        <div className="flex items-center gap-3 text-red-500 mb-4">
                            <AlertCircle className="w-6 h-6" />
                            <h3 className="text-xl font-semibold">Delete Workspace?</h3>
                        </div>
                        <p className="text-editor-text mb-6">
                            Are you sure you want to delete <span className="font-bold text-white">"{deleteModal.workspaceName}"</span>?
                            This action is permanent and will delete all files, chat history, and active sessions.
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                type="button"
                                onClick={() => setDeleteModal({ show: false, workspaceId: null, workspaceName: '' })}
                                className="btn btn-secondary"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeleteWorkspace}
                                disabled={deleteWorkspace.isPending}
                                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors font-medium disabled:opacity-50 flex items-center gap-2"
                            >
                                {deleteWorkspace.isPending ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Cleaning up...
                                    </>
                                ) : 'Delete Permanently'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* AI Assistant Modal */}
            <AIAssistant
                isOpen={showAIAssistant}
                onClose={() => setShowAIAssistant(false)}
            />
        </div>
    );
}

function WorkspaceCard({ workspace, onClick, onDelete }) {
    const [showMenu, setShowMenu] = useState(false);

    return (
        <div
            onClick={onClick}
            className="bg-editor-sidebar rounded-xl p-5 border border-editor-border hover:border-editor-accent/50 cursor-pointer transition-all hover:shadow-lg group relative"
        >
            <div className="flex items-start justify-between mb-4">
                <div className="p-2 bg-editor-accent/20 rounded-lg">
                    <FolderOpen className="w-6 h-6 text-editor-accent" />
                </div>
                <div className="relative">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowMenu(!showMenu);
                        }}
                        className="p-1 hover:bg-editor-active rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                        <MoreVertical className="w-4 h-4" />
                    </button>
                    {showMenu && (
                        <div className="absolute right-0 mt-1 w-48 bg-editor-sidebar border border-editor-border rounded-lg shadow-xl z-10 overflow-hidden">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowMenu(false);
                                    onDelete();
                                }}
                                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors text-left"
                            >
                                <Trash2 className="w-4 h-4" />
                                Delete Workspace
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <h3 className="font-semibold text-white mb-2">{workspace.name}</h3>

            <div className="flex items-center gap-4 text-xs text-editor-text-dim">
                <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>{new Date(workspace.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    <span>1 member</span>
                </div>
            </div>
        </div>
    );
}

export default Dashboard;
