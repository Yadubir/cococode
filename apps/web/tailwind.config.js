/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,jsx}",
    ],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                'editor': {
                    'bg': '#1e1e1e',
                    'sidebar': '#252526',
                    'active': '#2d2d2d',
                    'border': '#3c3c3c',
                    'text': '#cccccc',
                    'text-dim': '#858585',
                    'accent': '#007acc',
                    'success': '#4ec9b0',
                    'warning': '#dcdcaa',
                    'error': '#f48771',
                },
            },
            fontFamily: {
                'mono': ['Fira Code', 'Consolas', 'Monaco', 'monospace'],
                'sans': ['Inter', 'system-ui', 'sans-serif'],
            },
        },
    },
    plugins: [],
};
