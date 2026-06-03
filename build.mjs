import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

await build({
  configFile: false, root: '.',
  plugins: [react()],
  build: { target: "esnext", minify: false, sourcemap: false, outDir: "dist" },
  optimizeDeps: { noDiscovery: true, include: [] },
});
console.log("Build completed.");

// Fix HTML: remove type="module" and crossorigin
const htmlPath = join(__dirname, "dist", "index.html");
const html = readFileSync(htmlPath, "utf8");
const fixed = html.replace(/ crossorigin/g, "");
writeFileSync(htmlPath, fixed, "utf8");
console.log("HTML fixed. Server: http://127.0.0.1:5188");
