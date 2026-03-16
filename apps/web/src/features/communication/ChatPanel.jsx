import { useState, useEffect, useRef } from 'react';
import { Send, User as UserIcon } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { getSocket } from '../../services/socket';
import api from '../../services/api';

function ChatPanel({ workspaceId }) {
    const { user } = useAuthStore();
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const messagesEndRef = useRef(null);

    // Format date for message grouping
    const formatDate = (dateString) => {
        const date = new Date(dateString);
        const today = new Date();
        const isToday = date.getDate() === today.getDate() &&
            date.getMonth() === today.getMonth() &&
            date.getFullYear() === today.getFullYear();

        if (isToday) {
            return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        }
        return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    // Scroll to bottom when messages change
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Load message history
    useEffect(() => {
        const fetchHistory = async () => {
            if (!workspaceId) return;

            try {
                setIsLoading(true);
                const response = await api.get(`/workspaces/${workspaceId}/messages`);
                setMessages(response.data.data);
            } catch (error) {
                console.error('Failed to load chat history:', error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchHistory();
    }, [workspaceId]);

    // Setup WebSocket listeners
    useEffect(() => {
        const socket = getSocket();
        if (!socket || !workspaceId) return;

        // Join the workspace room for real-time messages
        socket.emit('workspace:join', { workspaceId });

        const handleMessage = (msg) => {
            setMessages((prev) => [...prev, msg]);
        };

        socket.on('chat:message', handleMessage);

        return () => {
            socket.off('chat:message', handleMessage);
        };
    }, [workspaceId]);

    // Send new message
    const handleSend = (e) => {
        e.preventDefault();
        if (!newMessage.trim() || !workspaceId) return;

        const socket = getSocket();
        if (socket) {
            socket.emit('chat:message', {
                workspaceId,
                message: newMessage.trim(),
            });
            setNewMessage('');
        }
    };

    return (
        <div className="flex flex-col h-full bg-editor-sidebar border-l border-editor-border w-80 flex-shrink-0">
            {/* Header */}
            <div className="panel-header border-b border-editor-border px-4 py-3 flex items-center justify-between">
                <h3 className="font-semibold text-white">Team Chat</h3>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {isLoading ? (
                    <div className="text-center text-editor-text-dim text-sm mt-4">Loading messages...</div>
                ) : messages.length === 0 ? (
                    <div className="text-center text-editor-text-dim text-sm mt-10">
                        <p className="mb-2">No messages yet.</p>
                        <p>Start the conversation!</p>
                    </div>
                ) : (
                    messages.map((msg, index) => {
                        const isOwn = msg.userId === user?.id;
                        const showHeader = index === 0 || messages[index - 1].userId !== msg.userId ||
                            (new Date(msg.createdAt || msg.timestamp) - new Date(messages[index - 1].createdAt || messages[index - 1].timestamp) > 300000); // 5 mins

                        return (
                            <div key={msg.id} className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
                                {showHeader && (
                                    <div className="flex items-center gap-2 mb-1 px-1">
                                        {!isOwn && (
                                            <span className="text-xs font-medium text-editor-text">{msg.userName}</span>
                                        )}
                                        <span className="text-[10px] text-editor-text-dim">
                                            {formatDate(msg.createdAt || msg.timestamp)}
                                        </span>
                                    </div>
                                )}

                                <div className="flex items-end gap-2 max-w-[85%]">
                                    {!isOwn && showHeader && (
                                        <div className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0 bg-editor-active flex items-center justify-center">
                                            {msg.userAvatar ? (
                                                <img src={msg.userAvatar} alt={msg.userName} className="w-full h-full object-cover" />
                                            ) : (
                                                <UserIcon className="w-4 h-4 text-editor-text-dim" />
                                            )}
                                        </div>
                                    )}
                                    {/* Invisible spacer if no header but not own message, to align text */}
                                    {!isOwn && !showHeader && <div className="w-6 h-6 flex-shrink-0" />}

                                    <div
                                        className={`px-3 py-2 rounded-lg text-sm break-words ${isOwn
                                            ? 'bg-editor-accent text-white rounded-br-none'
                                            : 'bg-editor-active text-editor-text rounded-bl-none'
                                            }`}
                                    >
                                        {msg.content || msg.message}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-3 border-t border-editor-border bg-editor-bg">
                <form onSubmit={handleSend} className="relative">
                    <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="Type a message..."
                        className="w-full bg-editor-sidebar border border-editor-border rounded-md pl-3 pr-10 py-2 text-sm text-editor-text focus:outline-none focus:border-editor-accent transition-colors"
                    />
                    <button
                        type="submit"
                        disabled={!newMessage.trim()}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-editor-text-dim hover:text-editor-accent disabled:opacity-50 disabled:hover:text-editor-text-dim rounded transition-colors"
                    >
                        <Send className="w-4 h-4" />
                    </button>
                </form>
            </div>
        </div>
    );
}

export default ChatPanel;
