// This tiny vectorizer is pedagogical only; it counts words instead of learning meaning.
export function buildVocabulary(texts) {
  return [...new Set(texts.flatMap((text) => text.toLowerCase().match(/[a-z0-9]+/g) ?? []))].sort();
}

export function toyEmbedding(text, vocabulary) {
  const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const counts = new Map();
  for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);
  return vocabulary.map((word) => counts.get(word) ?? 0);
}

export function cosineSimilarity(left, right) {
  if (left.length !== right.length) throw new Error('Vectors must have the same dimensions.');
  const dot = left.reduce((sum, value, index) => sum + value * right[index], 0);
  const leftMagnitude = Math.sqrt(left.reduce((sum, value) => sum + value * value, 0));
  const rightMagnitude = Math.sqrt(right.reduce((sum, value) => sum + value * value, 0));
  if (leftMagnitude === 0 || rightMagnitude === 0) return 0;
  return dot / (leftMagnitude * rightMagnitude);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const examples = ['notes can be exported as PDF', 'PDF export is available', 'the trial lasts fourteen days'];
  const vocabulary = buildVocabulary(examples);
  const queryVector = toyEmbedding('export notes PDF', vocabulary);
  console.log('Cosine similarity to query "export notes PDF":');
  for (const text of examples) {
    console.log(cosineSimilarity(queryVector, toyEmbedding(text, vocabulary)).toFixed(3), text);
  }
}
import path from 'node:path';
import { fileURLToPath } from 'node:url';

