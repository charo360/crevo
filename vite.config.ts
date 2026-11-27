import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/api': {
            target: `http://localhost:${env.API_PORT || 4000}`,
            changeOrigin: true,
          },
        },
      },
      plugins: [react()],
      envPrefix: ['VITE_', 'NEXT_PUBLIC_', 'STRIPE_'],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        // Optimize build for production
        target: 'es2015',
        minify: 'terser',
        terserOptions: {
          compress: {
            drop_console: true, // Remove console.log in production
            drop_debugger: true,
          },
        },
        rollupOptions: {
          output: {
            // Code splitting for better caching
            manualChunks: {
              'react-vendor': ['react', 'react-dom', 'react-router-dom'],
              'supabase-vendor': ['@supabase/supabase-js'],
              'ai-vendor': ['@google/genai'],
            },
          },
        },
        // Optimize chunk size warning threshold
        chunkSizeWarningLimit: 1000,
        // Enable source maps for production debugging (optional)
        sourcemap: false,
        // Optimize asset handling
        assetsInlineLimit: 4096, // Inline small assets (< 4KB)
        cssCodeSplit: true,
      },
      // Optimize dependencies
      optimizeDeps: {
        include: ['react', 'react-dom', 'react-router-dom', '@supabase/supabase-js'],
        exclude: ['@google/genai'], // Large library, load on demand
      },
    };
});
