import { create } from 'zustand';
import api from '../services/api';

export const useEditorStore = create((set, get) => ({
    // Current workspace
    workspaceId: null,

    // Files in workspace
    files: [],
    isLoadingFiles: false,

    // Open tabs
    openFiles: [],
    activeFile: null,

    // File contents cache
    fileContents: {},

    // Unsaved changes tracking
    unsavedChanges: new Set(),

    /**
     * Set current workspace
     */
    setWorkspace: (workspaceId) => {
        set({ workspaceId, files: [], openFiles: [], activeFile: null, fileContents: {} });
    },

    /**
     * Fetch files for workspace
     */
    fetchFiles: async (workspaceId) => {
        set({ isLoadingFiles: true });
        try {
            const response = await api.get(`/files/${workspaceId}`);
            set({ files: response.data.data, isLoadingFiles: false });
            return response.data.data;
        } catch (error) {
            console.error('Failed to fetch files:', error);
            set({ isLoadingFiles: false });
            throw error;
        }
    },

    /**
     * Open a file
     */
    openFile: async (file) => {
        const { openFiles, fileContents, workspaceId } = get();

        // Check if already open
        const existingFile = openFiles.find(f => f.id === file.id);
        if (existingFile) {
            set({ activeFile: existingFile });
            return;
        }

        // Fetch content if not cached
        if (!fileContents[file.id]) {
            try {
                const response = await api.get(`/files/${workspaceId}/${file.id}`);
                set(state => ({
                    fileContents: {
                        ...state.fileContents,
                        [file.id]: response.data.data.content || '',
                    },
                }));
            } catch (error) {
                console.error('Failed to fetch file content:', error);
                throw error;
            }
        }

        set(state => ({
            openFiles: [...state.openFiles, file],
            activeFile: file,
        }));
    },

    /**
     * Close a file tab
     */
    closeFile: (fileId) => {
        set(state => {
            const newOpenFiles = state.openFiles.filter(f => f.id !== fileId);
            const newActiveFile = state.activeFile?.id === fileId
                ? newOpenFiles[newOpenFiles.length - 1] || null
                : state.activeFile;

            return {
                openFiles: newOpenFiles,
                activeFile: newActiveFile,
            };
        });
    },

    /**
     * Set active file
     */
    setActiveFile: (file) => {
        set({ activeFile: file });
    },

    /**
     * Update file content in cache
     */
    updateFileContent: (fileId, content) => {
        set(state => ({
            fileContents: {
                ...state.fileContents,
                [fileId]: content,
            },
            unsavedChanges: new Set(state.unsavedChanges).add(fileId),
        }));
    },

    /**
     * Create a new file
     */
    createFile: async (path, name, type = 'file', content = '') => {
        const { workspaceId, fetchFiles } = get();

        try {
            const response = await api.post(`/files/${workspaceId}`, {
                path,
                name,
                type,
                content,
            });

            await fetchFiles(workspaceId);

            // Open the new file if it's a file (not directory)
            if (type === 'file') {
                const newFile = response.data.data;
                set(state => ({
                    fileContents: {
                        ...state.fileContents,
                        [newFile.id]: content,
                    },
                    openFiles: [...state.openFiles, newFile],
                    activeFile: newFile,
                }));
            }

            return response.data.data;
        } catch (error) {
            console.error('Failed to create file:', error);
            throw error;
        }
    },

    /**
     * Save file content
     */
    saveFile: async (fileId) => {
        const { workspaceId, fileContents, unsavedChanges } = get();
        const content = fileContents[fileId];

        if (content === undefined) return;

        try {
            await api.put(`/files/${workspaceId}/${fileId}`, { content });

            set(state => {
                const newUnsaved = new Set(state.unsavedChanges);
                newUnsaved.delete(fileId);
                return { unsavedChanges: newUnsaved };
            });

            return true;
        } catch (error) {
            console.error('Failed to save file:', error);
            throw error;
        }
    },

    /**
     * Delete a file
     */
    deleteFile: async (fileId) => {
        const { workspaceId, fetchFiles, closeFile } = get();

        try {
            await api.delete(`/files/${workspaceId}/${fileId}`);
            closeFile(fileId);
            await fetchFiles(workspaceId);
            return true;
        } catch (error) {
            console.error('Failed to delete file:', error);
            throw error;
        }
    },

    /**
     * Check if file has unsaved changes
     */
    hasUnsavedChanges: (fileId) => {
        return get().unsavedChanges.has(fileId);
    },
}));
