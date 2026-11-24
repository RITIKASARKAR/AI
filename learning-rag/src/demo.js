import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
const examples = [
  'chunking-fixed.js',
  'chunking-structured.js',
  'chunking-semantic.js',
  'embeddings.js',
  'rag-basic.js',
  'rag-advanced.js'
];

for (const example of examples) {
  console.log(`\n===== ${example} =====`);
  const result = spawnSync(process.execPath, [path.join(sourceDirectory, example)], { encoding: 'utf8' });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  if (result.status !== 0) process.exitCode = result.status ?? 1;
}
