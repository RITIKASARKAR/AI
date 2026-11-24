import { buildVocabulary, cosineSimilarity, toyEmbedding } from './embeddings.js';

function splitSentences(text) {
  return text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [];
}

// Start a new chunk when neighboring sentence vectors become dissimilar, subject to a size cap.
export function semanticChunks(text, { boundaryThreshold = 0.18, maxCharacters = 240 } = {}) {
  const sentences = splitSentences(text);
  const vocabulary = buildVocabulary(sentences);
  const vectors = sentences.map((sentence) => toyEmbedding(sentence, vocabulary));
  const chunks = [];
  let current = [];

  for (let index = 0; index < sentences.length; index += 1) {
    const sentence = sentences[index];
    const previous = current.at(-1);
    const similarity = previous === undefined ? 1 : cosineSimilarity(vectors[index - 1], vectors[index]);
    const currentLength = current.join(' ').length;
    const meaningShift = previous !== undefined && similarity < boundaryThreshold;
    const exceedsSize = previous !== undefined && currentLength + sentence.length + 1 > maxCharacters;

    if (meaningShift || exceedsSize) {
      chunks.push(current.join(' '));
      current = [];
    }
    current.push(sentence);
  }

  if (current.length) chunks.push(current.join(' '));
  return chunks.map((content, index) => ({ id: `semantic-${index + 1}`, content }));
}

if (import.meta.url === `file://${process.argv[1]?.replaceAll('\\', '/')}`) {
  const sample = 'The trial lasts 14 days. A credit card is not required to start the trial. Export notes as PDF from Settings. Update the app if an export fails.';
  console.log('Toy semantic chunks:');
  console.log(semanticChunks(sample, { boundaryThreshold: 0.12, maxCharacters: 100 }));
  console.log('Tune the threshold with a real embedding model and representative documents.');
}
