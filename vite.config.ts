import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Загружаем переменные окружения из .env файлов
  const env = loadEnv(mode, process.cwd(), '');

  return {
    // ОБЯЗАТЕЛЬНО: точка делает пути относительными для Capacitor
    base: './', 
    
    plugins: [react()],
    
    build: {
      outDir: 'dist',
    },

    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },

    resolve: {
      alias: {
        '@': path.resolve(__dirname, './'),
      }
    }
  };
});