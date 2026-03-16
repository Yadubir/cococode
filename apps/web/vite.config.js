import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
    plugins: [
        react(),
        nodePolyfills({
            include: ['process', 'buffer', 'util', 'events'],
            globals: {
                process: true,
                Buffer: true,
                global: true,
            },
        }),
    ],
    server: {
        port: 5173,
        host: true,
        proxy: {
            '/api': {
                target: 'http://localhost:3001',
                changeOrigin: true,
            },
            '/socket.io': {
                target: 'http://localhost:3001',
                changeOrigin: true,
                ws: true,
            },
        },
    },
    resolve: {
        alias: {
            '@': '/src',
        },
    },
});
