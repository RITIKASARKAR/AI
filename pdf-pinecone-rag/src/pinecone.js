import { config } from './config.js';

async function pineconeRequest(path, body) {
  const response = await fetch(`${config.pineconeHost}${path}`, {
    method: 'POST',
    headers: { 'Api-Key': config.pineconeKey, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Pinecone request failed (${response.status}): ${await response.text()}`);
  return response.json();
}

export async function upsertVectors(vectors) {
  for (let offset = 0; offset < vectors.length; offset += 100) {
    await pineconeRequest('/vectors/upsert', { namespace: config.namespace, vectors: vectors.slice(offset, offset + 100) });
  }
}

export async function queryVectors(vector, topK = config.topK) {
  return pineconeRequest('/query', { namespace: config.namespace, vector, topK, includeMetadata: true });
}
