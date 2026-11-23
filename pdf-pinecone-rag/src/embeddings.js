import { config } from './config.js';

async function requestEmbeddings(input) {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { authorization: `Bearer ${config.openAiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: config.embeddingModel, input, encoding_format: 'float' }),
  });
  if (!response.ok) throw new Error(`OpenAI embeddings failed (${response.status}): ${await response.text()}`);
  const result = await response.json();
  return result.data.sort((a, b) => a.index - b.index).map(row => row.embedding);
}

export async function embedTexts(texts, batchSize = 64) {
  const vectors = [];
  for (let offset = 0; offset < texts.length; offset += batchSize) {
    vectors.push(...await requestEmbeddings(texts.slice(offset, offset + batchSize)));
  }
  return vectors;
}
