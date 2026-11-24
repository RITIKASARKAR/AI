// Fixed windows are a useful baseline when the source has no dependable structure.
export function fixedChunks(text, { size = 120, overlap = 20 } = {}) {
  if (size <= 0 || overlap < 0 || overlap >= size) {
    throw new Error('size must be positive and overlap must be between zero and size.');
  }

  const chunks = [];
  const step = size - overlap;
  for (let start = 0; start < text.length; start += step) {
    const content = text.slice(start, start + size).trim();
    if (content) chunks.push({ id: `fixed-${chunks.length + 1}`, start, content });
  }
  return chunks;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sample = 'RAG retrieves useful passages before a language model answers. Chunking determines which passages can be found. Overlap preserves a little context at boundaries.';
  console.log('Fixed-size chunks:');
  console.log(fixedChunks(sample, { size: 75, overlap: 15 }));
}
import path from 'node:path';
import { fileURLToPath } from 'node:url';

