import { useState } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import {
    Files,
    Search,
    GitBranch,
    Bug,
    Blocks,
    Settings,
    User,
    LogOut,
    Home
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import SearchPanel from '../features/editor/SearchPanel';
import GitPanel from '../features/git/GitPanel';

function Sidebar() {
    const navigate = useNavigate();
    const location = useLocation();
    const { workspaceId } = useParams();
    const { user, logout } = useAuthStore();
    const [activeTab, setActiveTab] = useState('explorer');
    const [showUserMenu, setShowUserMenu] = useState(false);

    const isInWorkspace = location.pathname.includes('/workspace/');

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const activityItems = [
        { id: 'home', icon: Home, label: 'Dashboard', action: () => navigate('/') },
        { id: 'explorer', icon: Files, label: 'Explorer' },
        { id: 'search', icon: Search, label: 'Search' },
        { id: 'git', icon: GitBranch, label: 'Source Control' },
        { id: 'debug', icon: Bug, label: 'Debug' },
        { id: 'extensions', icon: Blocks, label: 'Extensions' },
    ];

    // Render the active panel based on selection
    const renderPanel = () => {
        switch (activeTab) {
            case 'search':
                return <SearchPanel onClose={() => setActiveTab('explorer')} />;
            case 'git':
                return <GitPanel workspaceId={workspaceId} />;
            case 'explorer':
            default:
                return null; // Explorer is rendered in the Editor component
        }
    };

    return (
        <div className="flex h-full">
            {/* Activity Bar */}
            <div className="w-12 bg-editor-sidebar flex flex-col items-center py-2 border-r border-editor-border">
                {activityItems.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => {
                            if (item.action) {
                                item.action();
                            } else {
                                setActiveTab(activeTab === item.id ? 'explorer' : item.id);
                            }
                        }}
                        className={`activity-bar-item ${activeTab === item.id ? 'active' : ''}`}
                        title={item.label}
                    >
                        <item.icon className="w-6 h-6" />
                    </button>
                ))}

                <div className="flex-1" />

                <button
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    className="activity-bar-item relative"
                    title={user?.name || 'Account'}
                >
                    <User className="w-6 h-6" />

                    {showUserMenu && (
                        <div className="absolute left-14 bottom-0 w-48 bg-editor-sidebar border border-editor-border rounded-lg shadow-xl z-50">
                            <div className="p-3 border-b border-editor-border">
                                <p className="font-medium text-editor-text">{user?.name}</p>
                                <p className="text-xs text-editor-text-dim">{user?.email}</p>
                            </div>
                            <button
                                onClick={() => { /* Settings */ }}
                                className="flex items-center gap-2 w-full px-3 py-2 hover:bg-editor-active text-left"
                            >
                                <Settings className="w-4 h-4" />
                                <span>Settings</span>
                            </button>
                            <button
                                onClick={handleLogout}
                                className="flex items-center gap-2 w-full px-3 py-2 hover:bg-editor-active text-left text-red-400"
                            >
                                <LogOut className="w-4 h-4" />
                                <span>Sign out</span>
                            </button>
                        </div>
                    )}
                </button>

                <button className="activity-bar-item" title="Settings">
                    <Settings className="w-6 h-6" />
                </button>
            </div>

            {/* Side Panel - Only show for search and git */}
            {(activeTab === 'search' || activeTab === 'git') && (
                <div className="w-64 border-r border-editor-border">
                    {renderPanel()}
                </div>
            )}
        </div>
    );
}

export default Sidebar;
