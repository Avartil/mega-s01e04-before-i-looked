import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { serve, type ServerType } from '@hono/node-server';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

function outputPathFromArgs(): string {
  const args = process.argv.slice(2);
  const positionalArgs = args[0] === '--' ? args.slice(1) : args;
  const [argument] = positionalArgs;
  if (!argument || positionalArgs.length !== 1) {
    throw new Error('Usage: pnpm export-preview -- <output.html>');
  }

  const outputPath = resolve(argument);
  const repositoryPath = resolve('.');
  const pathFromRepository = relative(repositoryPath, outputPath);
  if (
    pathFromRepository === '' ||
    (!pathFromRepository.startsWith(`..${sep}`) && pathFromRepository !== '..' && !isAbsolute(pathFromRepository))
  ) {
    throw new Error('Choose an output path outside the repository.');
  }

  return outputPath;
}

async function closeServer(server: ServerType): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => (error ? rejectClose(error) : resolveClose()));
  });
}

async function exportPreview(): Promise<void> {
  const outputPath = outputPathFromArgs();
  const app = createApp(loadConfig());
  const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 });

  try {
    await new Promise<void>((resolveListening, rejectListening) => {
      server.once('listening', resolveListening);
      server.once('error', rejectListening);
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Could not determine the local server port.');
    }

    let response: Response;
    try {
      response = await fetch(`http://127.0.0.1:${address.port}/digest/2026-10-28`);
    } catch {
      throw new Error('Could not fetch the digest from the local server.');
    }
    if (!response.ok) {
      throw new Error(`Digest request failed with HTTP ${response.status}.`);
    }

    const html = await response.text();
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, html, 'utf8');
  } finally {
    await closeServer(server);
  }
}

exportPreview().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Preview export failed.';
  console.error(message);
  process.exitCode = 1;
});
