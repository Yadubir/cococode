import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, Code2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import api from '../../services/api';

function AIChatPanel({ workspaceId, activeFile, getFileContent }) {
    const [messages, setMessages] = useState([
        { id: '1', role: 'ai', content: "Hi! I'm CocoCode AI. Ask me to explain code, find bugs, or write new features." }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef(null);

    // Resizing state
    const [width, setWidth] = useState(320);
    const isResizing = useRef(false);

    const handleMouseDown = (e) => {
        e.preventDefault();
        isResizing.current = true;
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const handleMouseMove = (e) => {
        if (!isResizing.current) return;
        // Panel is on the right, so moving left (negative movementX) expands it.
        setWidth(prev => Math.max(250, Math.min(prev - e.movementX, 800)));
    };

    const handleMouseUp = () => {
        isResizing.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    };

    useEffect(() => {
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMsg = input.trim();
        setInput('');
        setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', content: userMsg }]);
        setIsLoading(true);

        try {
            // Gather context if a file is open
            let context = '';
            if (activeFile) {
                const content = getFileContent ? getFileContent(activeFile.path) : '';
                if (content) {
                    context = `File: ${activeFile.name}\n\n${content}`;
                }
            }

            const response = await api.post('/ai/chat', {
                message: userMsg,
                context
            });

            if (!response.data || !response.data.success) {
                 throw new Error('AI request failed');
            }

            const replyText = response.data.data.response;

            setMessages(prev => [...prev, {
                id: (Date.now() + 1).toString(),
                role: 'ai',
                content: replyText
            }]);

        } catch (error) {
            console.error('Error calling AI:', error);
            setMessages(prev => [...prev, {
                id: (Date.now() + 1).toString(),
                role: 'ai',
                content: "I'm sorry, I encountered an error connecting to the AI service. Please ensure the backend is running and the GEMINI_API_KEY is configured."
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div 
            className="flex flex-col h-full bg-editor-bg border-l border-editor-border text-editor-text relative shrink-0"
            style={{ width: `${width}px` }}
        >
            {/* Resize Handle */}
            <div 
                className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-blue-500/50 z-10 transition-colors"
                onMouseDown={handleMouseDown}
            />
            
            <div className="flex items-center gap-2 p-3 border-b border-editor-border bg-editor-sidebar">
                <Bot className="w-5 h-5 text-blue-400" />
                <h2 className="text-sm font-semibold selection:bg-editor-selection">CocoCode AI</h2>
            </div>

            {activeFile && (
                <div className="bg-editor-active/50 px-3 py-1.5 text-xs text-editor-text-dim flex items-center gap-1.5 border-b border-editor-border">
                    <Code2 className="w-3.5 h-3.5" />
                    Context: <span className="font-mono text-editor-text">{activeFile.name}</span>
                </div>
            )}

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((message) => (
                    <div key={message.id} className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${message.role === 'user' ? 'bg-blue-600' : 'bg-editor-active border border-editor-border'
                            }`}>
                            {message.role === 'user' ? <User className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-blue-400" />}
                        </div>
                        <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm overflow-hidden break-words ${message.role === 'user'
                                ? 'bg-blue-600 text-white rounded-tr-none'
                                : 'bg-editor-sidebar border border-editor-border rounded-tl-none prose prose-invert prose-sm max-w-none'
                            }`}>
                            {message.role === 'user' ? (
                                <p className="whitespace-pre-wrap m-0 break-words">{message.content}</p>
                            ) : (
                                <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    components={{
                                        pre({ node, ...props }) {
                                            return <pre className="bg-editor-bg p-2 rounded border border-editor-border overflow-x-auto my-2" {...props} />
                                        },
                                        code({ node, inline, ...props }) {
                                            return inline
                                                ? <code className="bg-editor-bg px-1 py-0.5 rounded text-blue-300 font-mono text-xs" {...props} />
                                                : <code className="font-mono text-xs" {...props} />
                                        }
                                    }}
                                >
                                    {message.content}
                                </ReactMarkdown>
                            )}
                        </div>
                    </div>
                ))}

                {isLoading && (
                    <div className="flex gap-3">
                        <div className="w-8 h-8 rounded-full bg-editor-active flex items-center justify-center border border-editor-border">
                            <Bot className="w-4 h-4 text-blue-400" />
                        </div>
                        <div className="bg-editor-sidebar border border-editor-border rounded-xl rounded-tl-none px-4 py-3 text-sm">
                            <Loader2 className="w-4 h-4 animate-spin text-editor-text-dim" />
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="p-3 border-t border-editor-border bg-editor-sidebar">
                <form onSubmit={handleSubmit} className="flex gap-2">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder={activeFile ? `Ask about ${activeFile.name}...` : "Ask a coding question..."}
                        className="flex-1 bg-editor-bg border border-editor-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                        disabled={isLoading}
                    />
                    <button
                        type="submit"
                        disabled={!input.trim() || isLoading}
                        className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 text-white p-2 rounded-lg transition-colors flex items-center justify-center"
                    >
                        <Send className="w-4 h-4" />
                    </button>
                </form>
            </div>
        </div>
    );
}

export default AIChatPanel;
