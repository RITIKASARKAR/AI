import { basename, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { config } from './config.js';
import { chunkPages, extractPdfPages } from './pdf.js';
import { embedTexts } from './embeddings.js';
import { queryVectors, upsertVectors } from './pinecone.js';

function documentId(filePath) {
  return createHash('sha256').update(resolve(filePath)).digest('hex').slice(0, 16);
}

async function indexPdf(filePath) {
  const pages = await extractPdfPages(filePath);
  if (!pages.length) throw new Error('No selectable text found. This may be a scanned PDF; add an OCR step before chunking.');
  const chunks = chunkPages(pages, config.chunkWords, config.overlapWords);
  console.log(`Extracted ${pages.length} text pages; creating ${chunks.length} chunks...`);
  const vectors = await embedTexts(chunks.map(chunk => chunk.text));
  const docId = documentId(filePath);
  await upsertVectors(chunks.map((chunk, index) => ({
    id: `${docId}-${index}`, values: vectors[index],
    metadata: { text: chunk.text, source: basename(filePath), documentId: docId, page: chunk.pageNumber, chunk: index, embeddingModel: config.embeddingModel },
  })));
  console.log(`Indexed ${chunks.length} chunks in namespace "${config.namespace}".`);
  console.log('The PDF stays local; chunk text is sent to the embedding API and stored as Pinecone metadata.');
}

async function search(query) {
  if (!query) throw new Error('Provide a search question in quotes.');
  const [vector] = await embedTexts([query]);
  const result = await queryVectors(vector);
  if (!result.matches?.length) return console.log('No matches found.');
  for (const [index, match] of result.matches.entries()) {
    const metadata = match.metadata || {};
    console.log(`\n#${index + 1} score=${match.score?.toFixed(4)} source=${metadata.source || '?'} page=${metadata.page ?? '?'}`);
    console.log(metadata.text || '(text metadata not returned)');
  }
}

try {
  const [, , command, ...args] = process.argv;
  if (command === 'index' && args[0]) await indexPdf(resolve(args[0]));
  else if (command === 'search') await search(args.join(' ').trim());
  else {
    console.log('Usage:\n  npm run index -- ./data/handbook.pdf\n  npm run search -- "How does the process work?"');
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
