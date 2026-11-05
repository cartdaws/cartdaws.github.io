import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Lists every built file with a content hash, so a phone can save the whole game for playing without signal and refresh only what changed.
function offlineList() {
  return {
    name: 'offline-list',
    apply: 'build',
    closeBundle() {
      const root = path.resolve('dist'), out = [];
      const walk = (dir) => { for (const n of fs.readdirSync(dir)) { const p = path.join(dir, n); if (fs.statSync(p).isDirectory()) walk(p); else out.push(p); } };
      walk(root);
      const list = out.map((p) => {
        const rel = path.relative(root, p).split(path.sep).join('/');
        return { u: rel === 'index.html' ? './' : rel, h: crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex').slice(0, 12) };
      }).filter((f) => f.u !== 'precache.json' && f.u !== 'sw.js');
      fs.writeFileSync(path.join(root, 'precache.json'), JSON.stringify(list));
    },
  };
}

// Relative base so the build works from any folder, including https://<user>.github.io/<repo>/.
// BUILD_TAG is shown on the start menu so it is obvious which version a browser is running.
const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
export default defineConfig({ base: './', plugins: [offlineList()], build: { chunkSizeWarningLimit: 1500 }, define: { __BUILD__: JSON.stringify(stamp) } });
