import { useEffect, useRef } from 'react';
import api from '../../services/api';

// Max characters to send as prefix/suffix to keep token usage low
const MAX_PREFIX_CHARS = 600;
const MAX_SUFFIX_CHARS = 200;
// How long to wait after the user stops typing before firing the request (ms)
const DEBOUNCE_MS = 800;

export function useAICompletions(monaco, editorInstance) {
    const debounceTimerRef = useRef(null);
    const abortControllerRef = useRef(null);
    const rateLimitedUntilRef = useRef(0); // timestamp until which requests are suppressed

    useEffect(() => {
        if (!monaco || !editorInstance) return;

        const emptyResult = { items: [], dispose: () => {} };

        const provider = monaco.languages.registerInlineCompletionsProvider('*', {
            provideInlineCompletions: (model, position, _context, token) => {
                // Suppress requests while rate-limited
                if (Date.now() < rateLimitedUntilRef.current) {
                    return emptyResult;
                }

                const textUntilPosition = model.getValueInRange({
                    startLineNumber: 1,
                    startColumn: 1,
                    endLineNumber: position.lineNumber,
                    endColumn: position.column,
                });

                // Don't bother for very short prefixes
                if (textUntilPosition.trim().length < 5) {
                    return emptyResult;
                }

                const textAfterPosition = model.getValueInRange({
                    startLineNumber: position.lineNumber,
                    startColumn: position.column,
                    endLineNumber: model.getLineCount(),
                    endColumn: model.getLineMaxColumn(model.getLineCount()),
                });

                // Trim to avoid blowing up the token quota
                const prefix = textUntilPosition.slice(-MAX_PREFIX_CHARS);
                const suffix = textAfterPosition.slice(0, MAX_SUFFIX_CHARS);
                const language = model.getLanguageId();

                // Cancel any previous in-flight request
                if (abortControllerRef.current) {
                    abortControllerRef.current.abort();
                    abortControllerRef.current = null;
                }

                // Clear any pending debounce timer
                if (debounceTimerRef.current) {
                    clearTimeout(debounceTimerRef.current);
                    debounceTimerRef.current = null;
                }

                return new Promise((resolve) => {
                    debounceTimerRef.current = setTimeout(async () => {
                        // Check cancellation after debounce wait
                        if (token.isCancellationRequested) {
                            return resolve(emptyResult);
                        }

                        const abortController = new AbortController();
                        abortControllerRef.current = abortController;

                        try {
                            const response = await api.post(
                                '/ai/autocomplete',
                                { prefix, suffix, language },
                                { signal: abortController.signal }
                            );

                            if (token.isCancellationRequested) {
                                return resolve(emptyResult);
                            }

                            const completion = response.data?.data?.completion?.trim();
                            if (response.data.success && completion) {
                                resolve({
                                    items: [{
                                        insertText: completion,
                                        range: {
                                            startLineNumber: position.lineNumber,
                                            startColumn: position.column,
                                            endLineNumber: position.lineNumber,
                                            endColumn: position.column,
                                        },
                                    }],
                                    dispose: () => {},
                                });
                            } else {
                                resolve(emptyResult);
                            }
                        } catch (error) {
                            // Ignore aborted requests — they're expected on rapid typing
                            if (error?.code === 'ERR_CANCELED' || error?.name === 'AbortError') {
                                return resolve(emptyResult);
                            }
                            if (error?.response?.status === 429) {
                                // Back off for 60 seconds on rate limit
                                rateLimitedUntilRef.current = Date.now() + 60_000;
                                console.warn('AI Autocomplete: rate limited, pausing for 60s');
                            } else if (!token.isCancellationRequested) {
                                console.error('AI Autocomplete Error:', error);
                            }
                            resolve(emptyResult);
                        }
                    }, DEBOUNCE_MS);
                });
            },
            // Both method names provided for compatibility across Monaco versions
            freeInlineCompletions: () => {},
            disposeInlineCompletions: () => {},
            handleItemDidShow: () => {},
        });

        return () => {
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
            if (abortControllerRef.current) abortControllerRef.current.abort();
            provider.dispose();
        };
    }, [monaco, editorInstance]);
}
