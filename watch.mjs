import { execSync, spawn } from 'child_process';
import { watch, writeFileSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VERSION_FILE = join(__dirname, '.build_version');
const WATCH_DIR = join(__dirname, 'src');

let building = false;
let pendingRebuild = false;

function getCounter() {
  try { return parseInt(readFileSync(VERSION_FILE, 'utf8')) || 0; }
  catch { return 0; }
}

function bumpVersion() {
  const next = getCounter() + 1;
  writeFileSync(VERSION_FILE, String(next), 'utf8');
  return next;
}

function doBuild() {
  if (building) { pendingRebuild = true; return; }
  building = true;
  try {
    console.log('[watch] Building...');
    execSync('npm run build', { cwd: __dirname, stdio: 'inherit' });
    const v = bumpVersion();
    console.log('[watch] Build done. Version: ' + v);
  } catch(e) {
    console.error('[watch] Build failed: ' + e.message);
  }
  building = false;
  if (pendingRebuild) { pendingRebuild = false; doBuild(); }
}

watch(WATCH_DIR, { recursive: true }, (eventType, filename) => {
  if (!filename) return;
  const ext = filename.slice(filename.lastIndexOf('.'));
  if (['.ts', '.tsx', '.css', '.mjs', '.js'].includes(ext)) {
    console.log('[watch] Changed: ' + filename);
    doBuild();
  }
});

console.log('[watch] Initial build...');
execSync('npm run build', { cwd: __dirname, stdio: 'inherit' });
bumpVersion();

const serverPath = join(__dirname, 'preview.mjs');
const child = spawn('node', [serverPath], { detached: true, stdio: 'ignore', cwd: __dirname });
child.unref();

console.log('[watch] Auto-reload dev server at http://127.0.0.1:5188');