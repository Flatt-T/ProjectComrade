import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'engines/vendor'],
    // Integration files share one real PostgreSQL database and reset its schema;
    // they must never run concurrently.
    fileParallelism: false
  }
});
