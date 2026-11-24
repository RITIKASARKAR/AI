import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { answerFromEvidence, loadIndex } from './rag-basic.js';
import { buildVocabulary, cosineSimilarity, toyEmbedding } from './embeddings.js';

const stopWords = new Set(['a', 'an', 'and', 'are', 'can', 'do', 'does', 'for', 'how', 'i', 'is', 'it', 'my', 'of', 'the', 'to', 'what', 'when', 'where']);

function terms(text) {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((word) => !stopWords.has(word));
}

function makeQueryVariants(query) {
  const variants = [query];
  if (/credit card/i.test(query)) variants.push(query.replace(/credit card/ig, 'payment card billing'));
  if (/trial/i.test(query)) variants.push(query.replace(/trial/ig, 'free trial signup duration'));
  return [...new Set(variants)];
}

function lexicalSearch(chunks, query, limit) {
  const queryTerms = new Set(terms(query));
  return chunks
    .map((chunk) => {
      const chunkTerms = terms(chunk.content);
      const matchingTerms = chunkTerms.filter((term) => queryTerms.has(term)).length;
      const score = queryTerms.size ? matchingTerms / queryTerms.size : 0;
      return { chunk, score };
    })
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

function vectorSearch(chunks, query, vocabulary, limit) {
  const queryVector = toyEmbedding(query, vocabulary);
  return chunks
    .map((chunk) => ({ chunk, score: cosineSimilarity(queryVector, chunk.vector) }))
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

function reciprocalRankFusion(rankedLists, constant = 60) {
  const fused = new Map();
  for (const list of rankedLists) {
    list.forEach(({ chunk }, index) => {
      const current = fused.get(chunk.id) ?? { chunk, score: 0 };
      current.score += 1 / (constant + index + 1);
      fused.set(chunk.id, current);
    });
  }
  return [...fused.values()].sort((left, right) => right.score - left.score);
}

export function advancedRetrieve(index, query, { category, topK = 3, candidateK = 5 } = {}) {
  // Trusted metadata filters run before retrieval; they are not delegated to a model.
  const filtered = category ? index.filter((chunk) => chunk.category === category) : index;
  const vocabulary = buildVocabulary(filtered.map((chunk) => chunk.content));
  const variants = makeQueryVariants(query);
  const rankedLists = variants.flatMap((variant) => [
    vectorSearch(filtered, variant, vocabulary, candidateK),
    lexicalSearch(filtered, variant, candidateK)
  ]);
  const fused = reciprocalRankFusion(rankedLists);

  // A lightweight second-stage score reranks only the fused candidate set.
  const queryVector = toyEmbedding(query, vocabulary);
  const reranked = fused.map(({ chunk, score: fusionScore }) => {
    const vectorScore = cosineSimilarity(queryVector, chunk.vector);
    const lexicalScore = lexicalSearch([chunk], query, 1)[0]?.score ?? 0;
    return { ...chunk, fusionScore, vectorScore, lexicalScore, rerankScore: vectorScore * 0.55 + lexicalScore * 0.45 };
  }).sort((left, right) => right.rerankScore - left.rerankScore);

  return { variants, candidates: fused.length, results: reranked.slice(0, topK) };
}

async function main() {
  const index = await loadIndex();
  const question = 'Do I need a credit card to start my free trial?';
  const retrieval = advancedRetrieve(index, question, { category: 'billing', topK: 2 });
  const response = answerFromEvidence(question, retrieval.results);
  console.log('Query variants:', retrieval.variants);
  console.log('Hybrid and reranked passages:');
  console.log(retrieval.results.map(({ title, fusionScore, rerankScore, content }) => ({
    title,
    fusionScore: Number(fusionScore.toFixed(4)),
    rerankScore: Number(rerankScore.toFixed(3)),
    content
  })));
  console.log('\nAnswer with source references:');
  console.log(response);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
