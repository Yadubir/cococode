import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../services/api';

export const useAuthStore = create(
    persist(
        (set, get) => ({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,

            /**
             * Login user
             */
            login: async (email, password) => {
                set({ isLoading: true, error: null });

                try {
                    const response = await api.post('/auth/login', { email, password });
                    const { user, token } = response.data.data;

                    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;

                    set({
                        user,
                        token,
                        isAuthenticated: true,
                        isLoading: false,
                    });

                    return { success: true };
                } catch (error) {
                    const message = error.response?.data?.message || 'Login failed';
                    set({ error: message, isLoading: false });
                    return { success: false, error: message };
                }
            },

            /**
             * Register new user
             */
            register: async (name, email, password) => {
                set({ isLoading: true, error: null });

                try {
                    const response = await api.post('/auth/register', { name, email, password });
                    const { user, token } = response.data.data;

                    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;

                    set({
                        user,
                        token,
                        isAuthenticated: true,
                        isLoading: false,
                    });

                    return { success: true };
                } catch (error) {
                    const message = error.response?.data?.message || 'Registration failed';
                    set({ error: message, isLoading: false });
                    return { success: false, error: message };
                }
            },

            /**
             * Logout user
             */
            logout: () => {
                delete api.defaults.headers.common['Authorization'];
                set({
                    user: null,
                    token: null,
                    isAuthenticated: false,
                });
            },

            /**
             * Initialize auth state from storage
             */
            initialize: () => {
                const { token } = get();
                if (token) {
                    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
                }
            },

            /**
             * Clear error
             */
            clearError: () => set({ error: null }),
        }),
        {
            name: 'auth-storage',
            partialize: (state) => ({
                user: state.user,
                token: state.token,
                isAuthenticated: state.isAuthenticated,
            }),
        }
    )
);

// Initialize auth on import
useAuthStore.getState().initialize();
