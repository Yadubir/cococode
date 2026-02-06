import { useMemo } from 'react';
import { Users, Circle } from 'lucide-react';

/**
 * User Presence component showing online collaborators
 */
function UserPresence({ remoteUsers }) {
    const users = useMemo(() => {
        const uniqueUsers = new Map();

        remoteUsers.forEach((state) => {
            if (state.user) {
                uniqueUsers.set(state.user.id, state.user);
            }
        });

        return Array.from(uniqueUsers.values());
    }, [remoteUsers]);

    if (users.length === 0) {
        return null;
    }

    return (
        <div className="flex items-center gap-2 px-3 py-1 bg-editor-sidebar border-b border-editor-border">
            <Users className="w-4 h-4 text-editor-text-dim" />
            <span className="text-xs text-editor-text-dim">
                {users.length} online
            </span>
            <div className="flex -space-x-2">
                {users.slice(0, 5).map((user) => (
                    <div
                        key={user.id}
                        className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium text-white border-2 border-editor-bg"
                        style={{ backgroundColor: user.color }}
                        title={user.name}
                    >
                        {user.name?.charAt(0).toUpperCase()}
                    </div>
                ))}
                {users.length > 5 && (
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs bg-editor-active text-editor-text border-2 border-editor-bg">
                        +{users.length - 5}
                    </div>
                )}
            </div>
        </div>
    );
}

/**
 * Remote cursor label component
 */
function RemoteCursorLabel({ user }) {
    return (
        <div
            className="absolute pointer-events-none z-50 flex items-center gap-1 px-1 py-0.5 rounded text-xs text-white whitespace-nowrap"
            style={{ backgroundColor: user.color }}
        >
            <Circle className="w-2 h-2 fill-current" />
            {user.name}
        </div>
    );
}

/**
 * CSS styles for remote cursors (inject into page)
 */
export const collaborationStyles = `
  .remote-cursor {
    position: relative;
  }

  .remote-cursor::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 2px;
    height: 100%;
    background-color: var(--cursor-color, #ff6b6b);
    animation: cursor-blink 1s infinite;
  }

  .remote-cursor-label {
    position: relative;
  }

  .remote-cursor-label::after {
    content: attr(data-user-name);
    position: absolute;
    top: -18px;
    left: 0;
    padding: 2px 4px;
    font-size: 10px;
    background-color: var(--cursor-color, #ff6b6b);
    color: white;
    border-radius: 2px;
    white-space: nowrap;
    z-index: 100;
  }

  .remote-selection {
    background-color: rgba(255, 107, 107, 0.25);
  }

  @keyframes cursor-blink {
    0%, 50% { opacity: 1; }
    51%, 100% { opacity: 0; }
  }
`;

export { UserPresence, RemoteCursorLabel };
export default UserPresence;
