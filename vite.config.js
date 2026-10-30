import { defineConfig } from 'vite';

// Relative base so the build works from any folder, including https://<user>.github.io/<repo>/.
export default defineConfig({ base: './', build: { chunkSizeWarningLimit: 1500 } });
