import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Users, ArrowRight, Loader } from 'lucide-react';
import api from '../../services/api';
import { useAuthStore } from '../../stores/authStore';

function JoinWorkspace() {
    const { code } = useParams();
    const navigate = useNavigate();
    const { isAuthenticated, user } = useAuthStore();

    const [invite, setInvite] = useState(null);
    const [loading, setLoading] = useState(true);
    const [joining, setJoining] = useState(false);
    const [error, setError] = useState(null);

    // Fetch invite details
    useEffect(() => {
        const fetchInvite = async () => {
            try {
                const response = await api.get(`/workspaces/invites/${code}`);
                setInvite(response.data.data);
            } catch (err) {
                setError(err.response?.data?.message || 'Invalid or expired invite link');
            } finally {
                setLoading(false);
            }
        };

        if (code) {
            fetchInvite();
        }
    }, [code]);

    // Handle join
    const handleJoin = async () => {
        if (!isAuthenticated) {
            // Redirect to login with return URL
            navigate(`/login?redirect=/join/${code}`);
            return;
        }

        setJoining(true);
        try {
            const response = await api.post(`/workspaces/invites/${code}/join`);
            const { workspace } = response.data.data;
            navigate(`/workspace/${workspace.id}`);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to join workspace');
        } finally {
            setJoining(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-editor-bg flex items-center justify-center">
                <Loader className="w-8 h-8 animate-spin text-editor-accent" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-editor-bg flex items-center justify-center">
                <div className="text-center max-w-md">
                    <div className="text-6xl mb-4">😕</div>
                    <h1 className="text-2xl font-bold text-white mb-2">Invite Not Found</h1>
                    <p className="text-editor-text-dim mb-6">{error}</p>
                    <button
                        onClick={() => navigate('/')}
                        className="btn btn-primary"
                    >
                        Go to Dashboard
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-editor-bg flex items-center justify-center p-4">
            <div className="bg-editor-sidebar rounded-xl p-8 max-w-md w-full border border-editor-border">
                <div className="text-center mb-6">
                    <div className="w-16 h-16 bg-editor-accent/20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Users className="w-8 h-8 text-editor-accent" />
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2">
                        You're invited!
                    </h1>
                    <p className="text-editor-text-dim">
                        You've been invited to join a workspace on CocoCode
                    </p>
                </div>

                {invite && (
                    <div className="bg-editor-bg rounded-lg p-4 mb-6 border border-editor-border">
                        <p className="text-sm text-editor-text-dim mb-1">Workspace</p>
                        <p className="text-lg font-semibold text-white">
                            {invite.workspace.name}
                        </p>
                    </div>
                )}

                {isAuthenticated ? (
                    <div>
                        <p className="text-sm text-editor-text-dim mb-4 text-center">
                            Joining as <span className="text-white">{user?.email}</span>
                        </p>
                        <button
                            onClick={handleJoin}
                            disabled={joining}
                            className="w-full btn btn-primary flex items-center justify-center gap-2"
                        >
                            {joining ? (
                                <Loader className="w-4 h-4 animate-spin" />
                            ) : (
                                <>
                                    Join Workspace
                                    <ArrowRight className="w-4 h-4" />
                                </>
                            )}
                        </button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <button
                            onClick={handleJoin}
                            className="w-full btn btn-primary"
                        >
                            Sign in to Join
                        </button>
                        <p className="text-xs text-center text-editor-text-dim">
                            Don't have an account?{' '}
                            <a href={`/register?redirect=/join/${code}`} className="text-editor-accent hover:underline">
                                Sign up
                            </a>
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

export default JoinWorkspace;
