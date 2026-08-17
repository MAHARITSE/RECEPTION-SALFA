import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    testTimeout: 60000,
    globals: true,
  },
  // Empêche vitest d'embarquer le fichier de données JSON en doublon
  resolve: {},
});
