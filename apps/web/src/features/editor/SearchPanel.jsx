import { useState, useRef, useEffect } from 'react';
import {
    Search as SearchIcon,
    ChevronDown,
    ChevronRight,
    File,
    X,
    RefreshCw,
    CaseSensitive,
    Regex,
    WholeWord
} from 'lucide-react';

function SearchPanel({ onFileSelect, onClose }) {
    const inputRef = useRef(null);
    const [query, setQuery] = useState('');
    const [replaceQuery, setReplaceQuery] = useState('');
    const [showReplace, setShowReplace] = useState(false);
    const [results, setResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [expandedFiles, setExpandedFiles] = useState(new Set());

    // Search options
    const [caseSensitive, setCaseSensitive] = useState(false);
    const [wholeWord, setWholeWord] = useState(false);
    const [useRegex, setUseRegex] = useState(false);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    // Perform search
    const handleSearch = async () => {
        if (!query.trim()) {
            setResults([]);
            return;
        }

        setIsSearching(true);

        // Simulated search results - in production this would call the API
        // For now, we'll show how the UI would look
        setTimeout(() => {
            const mockResults = [
                {
                    file: { id: '1', name: 'index.js', path: '/src/index.js' },
                    matches: [
                        { line: 1, content: `import React from 'react';`, matchStart: 7, matchEnd: 12 },
                        { line: 5, content: `function App() {`, matchStart: 0, matchEnd: 8 },
                    ],
                },
                {
                    file: { id: '2', name: 'App.jsx', path: '/src/App.jsx' },
                    matches: [
                        { line: 10, content: `  return <div className="app">`, matchStart: 25, matchEnd: 28 },
                    ],
                },
            ].filter(r =>
                r.matches.some(m =>
                    caseSensitive
                        ? m.content.includes(query)
                        : m.content.toLowerCase().includes(query.toLowerCase())
                )
            );

            setResults(mockResults);
            setExpandedFiles(new Set(mockResults.map(r => r.file.id)));
            setIsSearching(false);
        }, 300);
    };

    // Handle enter key
    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
        if (e.key === 'Escape') {
            onClose?.();
        }
    };

    // Toggle file expansion
    const toggleFile = (fileId) => {
        setExpandedFiles(prev => {
            const next = new Set(prev);
            if (next.has(fileId)) {
                next.delete(fileId);
            } else {
                next.add(fileId);
            }
            return next;
        });
    };

    // Highlight match in text
    const highlightMatch = (text, matchStart, matchEnd) => {
        const before = text.slice(0, matchStart);
        const match = text.slice(matchStart, matchEnd);
        const after = text.slice(matchEnd);

        return (
            <>
                <span className="text-editor-text-dim">{before}</span>
                <span className="bg-yellow-500/30 text-yellow-200">{match}</span>
                <span className="text-editor-text-dim">{after}</span>
            </>
        );
    };

    const totalMatches = results.reduce((sum, r) => sum + r.matches.length, 0);

    return (
        <div className="h-full flex flex-col bg-editor-sidebar">
            {/* Search Input */}
            <div className="p-3 border-b border-editor-border">
                <div className="relative mb-2">
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Search"
                        className="input pr-24"
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                        <button
                            onClick={() => setCaseSensitive(!caseSensitive)}
                            className={`p-1 rounded ${caseSensitive ? 'bg-editor-accent text-white' : 'hover:bg-editor-active'}`}
                            title="Match Case"
                        >
                            <CaseSensitive className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setWholeWord(!wholeWord)}
                            className={`p-1 rounded ${wholeWord ? 'bg-editor-accent text-white' : 'hover:bg-editor-active'}`}
                            title="Match Whole Word"
                        >
                            <WholeWord className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setUseRegex(!useRegex)}
                            className={`p-1 rounded ${useRegex ? 'bg-editor-accent text-white' : 'hover:bg-editor-active'}`}
                            title="Use Regular Expression"
                        >
                            <Regex className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Replace Input */}
                {showReplace && (
                    <input
                        type="text"
                        value={replaceQuery}
                        onChange={(e) => setReplaceQuery(e.target.value)}
                        placeholder="Replace"
                        className="input mb-2"
                    />
                )}

                <div className="flex items-center justify-between">
                    <button
                        onClick={() => setShowReplace(!showReplace)}
                        className="text-xs text-editor-text-dim hover:text-editor-text"
                    >
                        {showReplace ? '▲ Hide Replace' : '▼ Show Replace'}
                    </button>
                    <button
                        onClick={handleSearch}
                        disabled={isSearching}
                        className="btn btn-primary text-xs py-1 px-2"
                    >
                        {isSearching ? <RefreshCw className="w-3 h-3 animate-spin" /> : <SearchIcon className="w-3 h-3" />}
                        Search
                    </button>
                </div>
            </div>

            {/* Results */}
            <div className="flex-1 overflow-auto">
                {query && results.length === 0 && !isSearching && (
                    <div className="p-4 text-center text-editor-text-dim text-sm">
                        No results found
                    </div>
                )}

                {results.length > 0 && (
                    <div className="p-2">
                        <div className="text-xs text-editor-text-dim mb-2 px-2">
                            {totalMatches} results in {results.length} files
                        </div>

                        {results.map((result) => (
                            <div key={result.file.id} className="mb-1">
                                {/* File Header */}
                                <div
                                    onClick={() => toggleFile(result.file.id)}
                                    className="flex items-center gap-1 px-2 py-1 hover:bg-editor-active rounded cursor-pointer"
                                >
                                    {expandedFiles.has(result.file.id) ? (
                                        <ChevronDown className="w-4 h-4" />
                                    ) : (
                                        <ChevronRight className="w-4 h-4" />
                                    )}
                                    <File className="w-4 h-4 text-editor-text-dim" />
                                    <span className="text-sm font-medium">{result.file.name}</span>
                                    <span className="text-xs text-editor-text-dim ml-auto">
                                        {result.matches.length}
                                    </span>
                                </div>

                                {/* Matches */}
                                {expandedFiles.has(result.file.id) && (
                                    <div className="ml-6">
                                        {result.matches.map((match, idx) => (
                                            <div
                                                key={idx}
                                                onClick={() => onFileSelect?.(result.file, match.line)}
                                                className="flex items-start gap-2 px-2 py-1 hover:bg-editor-active rounded cursor-pointer text-xs"
                                            >
                                                <span className="text-editor-text-dim w-8 text-right flex-shrink-0">
                                                    {match.line}
                                                </span>
                                                <code className="truncate font-mono">
                                                    {highlightMatch(match.content, match.matchStart, match.matchEnd)}
                                                </code>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export default SearchPanel;
