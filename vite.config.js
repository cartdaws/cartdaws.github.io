import { defineConfig } from 'vite';

// Relative base so the build works from any folder, including https://<user>.github.io/<repo>/.
// BUILD_TAG is shown on the start menu so it is obvious which version a browser is running.
const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
export default defineConfig({ base: './', build: { chunkSizeWarningLimit: 1500 }, define: { __BUILD__: JSON.stringify(stamp) } });
