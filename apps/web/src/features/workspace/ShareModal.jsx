import { useState, useEffect } from 'react';
import { Link2, Copy, Check, Trash2, Plus, Clock, Users, X } from 'lucide-react';
import api from '../../services/api';

function ShareModal({ workspaceId, workspaceName, isOpen, onClose }) {
    const [invites, setInvites] = useState([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [copiedId, setCopiedId] = useState(null);
    const [newInviteSettings, setNewInviteSettings] = useState({
        expiresIn: 86400 * 7, // 7 days in seconds
        maxUses: 0, // unlimited
    });

    // Fetch existing invites
    useEffect(() => {
        if (isOpen && workspaceId) {
            fetchInvites();
        }
    }, [isOpen, workspaceId]);

    const fetchInvites = async () => {
        try {
            setLoading(true);
            const response = await api.get(`/workspaces/${workspaceId}/invites`);
            setInvites(response.data.data);
        } catch (err) {
            console.error('Failed to fetch invites:', err);
        } finally {
            setLoading(false);
        }
    };

    // Create new invite
    const handleCreateInvite = async () => {
        setCreating(true);
        try {
            const response = await api.post(`/workspaces/${workspaceId}/invites`, {
                expiresIn: newInviteSettings.expiresIn,
                maxUses: newInviteSettings.maxUses || undefined,
            });
            setInvites([response.data.data, ...invites]);
        } catch (err) {
            console.error('Failed to create invite:', err);
        } finally {
            setCreating(false);
        }
    };

    // Copy invite link
    const handleCopy = async (inviteUrl, inviteId) => {
        try {
            await navigator.clipboard.writeText(inviteUrl);
            setCopiedId(inviteId);
            setTimeout(() => setCopiedId(null), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    // Delete invite
    const handleDelete = async (inviteId) => {
        try {
            await api.delete(`/workspaces/${workspaceId}/invites/${inviteId}`);
            setInvites(invites.filter(i => i.id !== inviteId));
        } catch (err) {
            console.error('Failed to delete invite:', err);
        }
    };

    // Format expiry
    const formatExpiry = (expiresAt) => {
        if (!expiresAt) return 'Never';
        const date = new Date(expiresAt);
        const now = new Date();
        const diff = date - now;

        if (diff < 0) return 'Expired';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
        return `${Math.floor(diff / 86400000)}d`;
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
            <div
                className="bg-editor-sidebar w-full max-w-lg rounded-xl border border-editor-border shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-editor-border">
                    <div className="flex items-center gap-3">
                        <Link2 className="w-5 h-5 text-editor-accent" />
                        <h2 className="text-lg font-semibold text-white">Share "{workspaceName}"</h2>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-editor-active rounded">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">
                    {/* Create new invite */}
                    <div className="mb-6">
                        <h3 className="text-sm font-medium text-editor-text-dim mb-3">Create Invite Link</h3>
                        <div className="flex gap-3 mb-3">
                            <select
                                value={newInviteSettings.expiresIn}
                                onChange={(e) => setNewInviteSettings({ ...newInviteSettings, expiresIn: Number(e.target.value) })}
                                className="input flex-1"
                            >
                                <option value={3600}>1 hour</option>
                                <option value={86400}>1 day</option>
                                <option value={604800}>7 days</option>
                                <option value={2592000}>30 days</option>
                                <option value={0}>Never expires</option>
                            </select>
                            <select
                                value={newInviteSettings.maxUses}
                                onChange={(e) => setNewInviteSettings({ ...newInviteSettings, maxUses: Number(e.target.value) })}
                                className="input flex-1"
                            >
                                <option value={0}>Unlimited uses</option>
                                <option value={1}>1 use</option>
                                <option value={5}>5 uses</option>
                                <option value={10}>10 uses</option>
                                <option value={25}>25 uses</option>
                            </select>
                        </div>
                        <button
                            onClick={handleCreateInvite}
                            disabled={creating}
                            className="w-full btn btn-primary flex items-center justify-center gap-2"
                        >
                            <Plus className="w-4 h-4" />
                            {creating ? 'Creating...' : 'Generate New Link'}
                        </button>
                    </div>

                    {/* Existing invites */}
                    <div>
                        <h3 className="text-sm font-medium text-editor-text-dim mb-3">Active Invite Links</h3>
                        {loading ? (
                            <p className="text-editor-text-dim text-sm">Loading...</p>
                        ) : invites.length === 0 ? (
                            <p className="text-editor-text-dim text-sm text-center py-4">
                                No active invite links. Create one above!
                            </p>
                        ) : (
                            <div className="space-y-2 max-h-64 overflow-auto">
                                {invites.map((invite) => (
                                    <div
                                        key={invite.id}
                                        className="flex items-center gap-3 p-3 bg-editor-bg rounded-lg border border-editor-border"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <code className="text-xs text-editor-accent truncate block">
                                                {invite.inviteUrl}
                                            </code>
                                            <div className="flex items-center gap-3 mt-1 text-xs text-editor-text-dim">
                                                <span className="flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    {formatExpiry(invite.expiresAt)}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <Users className="w-3 h-3" />
                                                    {invite.useCount}{invite.maxUses > 0 ? `/${invite.maxUses}` : ''} uses
                                                </span>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleCopy(invite.inviteUrl, invite.id)}
                                            className="p-2 hover:bg-editor-active rounded"
                                            title="Copy link"
                                        >
                                            {copiedId === invite.id ? (
                                                <Check className="w-4 h-4 text-green-400" />
                                            ) : (
                                                <Copy className="w-4 h-4" />
                                            )}
                                        </button>
                                        <button
                                            onClick={() => handleDelete(invite.id)}
                                            className="p-2 hover:bg-editor-active rounded text-red-400"
                                            title="Delete invite"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default ShareModal;
