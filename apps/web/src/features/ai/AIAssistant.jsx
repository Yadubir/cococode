import { useState, useRef, useEffect } from 'react';
import { X, Send, Sparkles, Code, Lightbulb, Loader2, Bot, User } from 'lucide-react';
import api from '../../services/api';

function AIAssistant({ isOpen, onClose, context }) {
    const [messages, setMessages] = useState([
        {
            role: 'assistant',
            content: "Hi! I'm your AI coding assistant. How can I help you today?\n\nI can help with:\n- Explaining code\n- Debugging issues\n- Writing code snippets\n- Best practices",
        },
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef(null);

    // Scroll to bottom when new messages arrive
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const sendMessage = async (e) => {
        e?.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMessage = input.trim();
        setInput('');
        setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
        setIsLoading(true);

        try {
            const response = await api.post('/ai/chat', {
                message: userMessage,
                context: context || null,
            });

            setMessages((prev) => [
                ...prev,
                { role: 'assistant', content: response.data.data.response },
            ]);
        } catch (error) {
            console.error('AI chat error:', error);
            setMessages((prev) => [
                ...prev,
                {
                    role: 'assistant',
                    content: 'Sorry, I encountered an error. Please try again.',
                    isError: true,
                },
            ]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-editor-sidebar rounded-xl w-full max-w-2xl h-[600px] flex flex-col border border-editor-border shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-editor-border">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-editor-accent/20 rounded-lg">
                            <Sparkles className="w-5 h-5 text-editor-accent" />
                        </div>
                        <div>
                            <h2 className="font-semibold text-white">AI Assistant</h2>
                            <p className="text-xs text-editor-text-dim">Powered by Gemini</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-editor-active rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.map((message, index) => (
                        <div
                            key={index}
                            className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                            {message.role === 'assistant' && (
                                <div className="w-8 h-8 rounded-full bg-editor-accent/20 flex items-center justify-center flex-shrink-0">
                                    <Bot className="w-4 h-4 text-editor-accent" />
                                </div>
                            )}
                            <div
                                className={`max-w-[80%] rounded-xl px-4 py-3 ${message.role === 'user'
                                        ? 'bg-editor-accent text-white'
                                        : message.isError
                                            ? 'bg-red-500/20 text-red-300'
                                            : 'bg-editor-active text-editor-text'
                                    }`}
                            >
                                <div className="whitespace-pre-wrap text-sm">
                                    {message.content}
                                </div>
                            </div>
                            {message.role === 'user' && (
                                <div className="w-8 h-8 rounded-full bg-editor-accent flex items-center justify-center flex-shrink-0">
                                    <User className="w-4 h-4 text-white" />
                                </div>
                            )}
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex gap-3 justify-start">
                            <div className="w-8 h-8 rounded-full bg-editor-accent/20 flex items-center justify-center flex-shrink-0">
                                <Bot className="w-4 h-4 text-editor-accent" />
                            </div>
                            <div className="bg-editor-active rounded-xl px-4 py-3">
                                <Loader2 className="w-5 h-5 animate-spin text-editor-accent" />
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Quick Actions */}
                <div className="px-4 py-2 flex gap-2 border-t border-editor-border">
                    <button
                        onClick={() => setInput('Explain this code: ')}
                        className="px-3 py-1.5 bg-editor-active rounded-full text-xs text-editor-text hover:bg-editor-hover transition-colors flex items-center gap-1"
                    >
                        <Code className="w-3 h-3" />
                        Explain Code
                    </button>
                    <button
                        onClick={() => setInput('Suggest improvements for: ')}
                        className="px-3 py-1.5 bg-editor-active rounded-full text-xs text-editor-text hover:bg-editor-hover transition-colors flex items-center gap-1"
                    >
                        <Lightbulb className="w-3 h-3" />
                        Suggest Improvements
                    </button>
                </div>

                {/* Input */}
                <form onSubmit={sendMessage} className="p-4 border-t border-editor-border">
                    <div className="flex gap-2">
                        <textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Ask me anything about coding..."
                            className="flex-1 bg-editor-active rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-editor-accent"
                            rows={2}
                            disabled={isLoading}
                        />
                        <button
                            type="submit"
                            disabled={!input.trim() || isLoading}
                            className="px-4 bg-editor-accent hover:bg-editor-accent/80 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors"
                        >
                            <Send className="w-5 h-5" />
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default AIAssistant;
