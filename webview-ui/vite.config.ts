import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/index.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
    assetsInlineLimit: 100000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Must mirror the @shared path in tsconfig.json — see the note there.
      '@shared': path.resolve(__dirname, '../src'),
    },
  },
  define: {
    'process.env': {},
  },
});
