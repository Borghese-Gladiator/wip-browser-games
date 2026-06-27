#!/usr/bin/env node
// Start both the gateway server and Vite dev server concurrently.
// This is used by the QA harness which expects a single dev command.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));

const processes = [
  // Start gateway server on :3001
  spawn('node', ['dev-server.js'], { cwd: dir, stdio: 'inherit' }),
  // Start Vite on :5173
  spawn('npx', ['vite', '--port', '5173'], { cwd: dirname(dir), stdio: 'inherit' }),
];

// Kill all child processes when this process exits
process.on('SIGINT', () => {
  processes.forEach(p => p.kill('SIGINT'));
  process.exit(0);
});

process.on('SIGTERM', () => {
  processes.forEach(p => p.kill('SIGTERM'));
  process.exit(0);
});
