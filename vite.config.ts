import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const groqKey = env.GROQ_API_KEY || env.VITE_GROQ_API_KEY || '';

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    define: {
      'import.meta.env.VITE_GROQ_API_KEY': JSON.stringify(groqKey),
    },
    server: {
      proxy: {
        '/local-functions': {
          target: 'http://127.0.0.1:8787',
          changeOrigin: true,
        },
      },
    },
  };
})
