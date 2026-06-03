import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const server = await createServer({
  configFile: false,
  root: '.',
  server: { host: '127.0.0.1', port: 5188, strictPort: true },
  plugins: [react()],
  build: { target: 'esnext', minify: false },
  optimizeDeps: { noDiscovery: true, include: [] },
});

await server.listen();
console.log('Server running on http://127.0.0.1:5188');
process.on('SIGTERM', () => { server.close(); process.exit(0); });
setInterval(() => {}, 10000);
