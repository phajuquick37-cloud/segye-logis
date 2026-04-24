import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      chunkSizeWarningLimit: 1100,
      rollupOptions: {
        output: {
          manualChunks: {
            // React 코어
            'vendor-react':    ['react', 'react-dom', 'react-router-dom'],
            // Firebase (auth/firestore/storage 분리)
            'vendor-firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage'],
            // xlsx 단독 분리 (자체 1MB급 대형 라이브러리)
            'vendor-xlsx':     ['xlsx'],
            // PDF·캡처 도구
            'vendor-pdf':      ['jspdf', 'html2canvas'],
            // 애니메이션
            'vendor-motion':   ['motion'],
            // Gemini AI SDK
            'vendor-genai':    ['@google/genai'],
            // UI 유틸리티
            'vendor-ui':       ['lucide-react', 'clsx', 'tailwind-merge', 'class-variance-authority'],
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      headers: {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN',
        'X-XSS-Protection': '1; mode=block',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      },
    },
  };
});
