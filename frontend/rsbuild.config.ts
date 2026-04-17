import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

// Docs: https://rsbuild.rs/config/
export default defineConfig({
  plugins: [pluginReact()],
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
      '/nl': 'http://localhost:8080',
      '/healthz': 'http://localhost:8080',
    },
  },
});
