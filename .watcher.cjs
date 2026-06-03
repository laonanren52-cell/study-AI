const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');
const __d = 'C:\\Users\\cheng\\Documents\\Codex\\2026-06-02\\new-chat\\work\\repo';
const VF = path.join(__d, '.build_version');
const WD = path.join(__d, 'src');
let building = false, pending = false;
function build() {
  if (building) { pending = true; return; }
  building = true;
  try {
    execSync('npm run build', { cwd: __d, stdio: 'inherit' });
    const v = (parseInt(fs.readFileSync(VF,'utf8')) || 0) + 1;
    fs.writeFileSync(VF, String(v), 'utf8');
  } catch(e) {}
  building = false;
  if(pending) { pending = false; build(); }
}
fs.watch(WD, { recursive: true }, (e, f) => {
  if (f && /\.(ts|tsx|css|mjs|js)$/.test(f)) build();
});
setInterval(() => {}, 60000);
