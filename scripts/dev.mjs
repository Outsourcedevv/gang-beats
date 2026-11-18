// Development: rebuild + restart the game server on change, and run the Vite client.
import { spawn } from 'node:child_process';

const run = (cmd, args, name) => {
  const p = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  p.on('exit', (code) => {
    console.log(`[${name}] exited (${code})`);
    process.exit(code ?? 0);
  });
  return p;
};

const procs = [];
const build = spawn('npx', ['vite', 'build', '--ssr', 'server/index.ts', '--outDir', 'dist-server', '--logLevel', 'warn'], { stdio: 'inherit', shell: process.platform === 'win32' });
build.on('exit', (code) => {
  if (code) process.exit(code);
  procs.push(run('npx', ['vite', 'build', '--ssr', 'server/index.ts', '--outDir', 'dist-server', '--watch', '--logLevel', 'warn'], 'server-build'));
  procs.push(run('node', ['--watch', 'dist-server/index.js'], 'server'));
  procs.push(run('npx', ['vite'], 'client'));
});
const stop = () => {
  for (const p of procs) p.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
