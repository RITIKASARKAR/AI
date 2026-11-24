import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { structuredChunks } from './chunking-structured.js';
import { buildVocabulary, cosineSimilarity, toyEmbedding } from './embeddings.js';

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function loadIndex() {
  const documents = JSON.parse(await readFile(path.join(projectDirectory, 'data/knowledge-base.json'), 'utf8'));
  const chunks = documents.flatMap((document) => structuredChunks(document.text).map((chunk, index) => ({
    ...chunk,
    id: `${document.id}-chunk-${index + 1}`,
    documentId: document.id,
    title: document.title,
    category: document.category,
    locale: document.locale
  })));

  // A real index would store provider-generated vectors and metadata in a vector database.
  const vocabulary = buildVocabulary(chunks.map((chunk) => chunk.content));
  return chunks.map((chunk) => ({ ...chunk, vector: toyEmbedding(chunk.content, vocabulary) }));
}

export function retrieve(index, query, topK = 3) {
  const vocabulary = buildVocabulary(index.map((chunk) => chunk.content));
  const queryVector = toyEmbedding(query, vocabulary);
  return index
    .map((chunk) => ({ ...chunk, score: cosineSimilarity(queryVector, chunk.vector) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, topK);
}

export function answerFromEvidence(question, results) {
  // This simple answer builder shows evidence selection and citation flow, not LLM generation.
  const usefulResults = results.filter((result) => {
    const score = result.score ?? result.rerankScore ?? result.vectorScore ?? result.fusionScore ?? 0;
    return score > 0;
  });
  if (usefulResults.length === 0) {
    return { answer: 'I could not find enough information in the knowledge base to answer that.', citations: [] };
  }

  const citations = usefulResults.map((result) => ({ id: result.documentId, title: result.title }));
  return {
    answer: `For "${question}", the retrieved source says: ${usefulResults[0].content.replace(/\s+/g, ' ')}`,
    citations
  };
}

async function main() {
  const index = await loadIndex();
  const question = 'Do I need a credit card for the free trial?';
  const results = retrieve(index, question, 3);
  const response = answerFromEvidence(question, results);
  console.log('Retrieved passages:');
  console.log(results.map(({ title, score, content }) => ({ title, score: Number(score.toFixed(3)), content })));
  console.log('\nGrounded answer:');
  console.log(response);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
