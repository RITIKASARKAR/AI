import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
  return value;
}

export const config = {
  openAiKey: required('OPENAI_API_KEY'),
  embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
  pineconeKey: required('PINECONE_API_KEY'),
  pineconeHost: required('PINECONE_INDEX_HOST').replace(/\/$/, ''),
  namespace: process.env.PINECONE_NAMESPACE || 'pdf-learning',
  chunkWords: Number(process.env.CHUNK_WORDS || 350),
  overlapWords: Number(process.env.CHUNK_OVERLAP_WORDS || 50),
  topK: Number(process.env.TOP_K || 5),
};

if (!Number.isInteger(config.chunkWords) || config.chunkWords < 30) throw new Error('CHUNK_WORDS must be an integer >= 30.');
if (!Number.isInteger(config.overlapWords) || config.overlapWords < 0 || config.overlapWords >= config.chunkWords) throw new Error('CHUNK_OVERLAP_WORDS must be >= 0 and smaller than CHUNK_WORDS.');
