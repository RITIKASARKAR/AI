# PDF → chunks → embeddings → Pinecone search (Node.js)

This project builds the retrieval half of a RAG system. It extracts selectable text from a PDF, splits it into overlapping word-window chunks, asks OpenAI for an embedding for each chunk, and upserts vectors plus citation metadata into Pinecone. A search question is embedded the same way and sent to Pinecone; the closest chunks are printed with source, page, and similarity score.

All application code is JavaScript. Node.js built-in fetch calls the HTTP APIs, and PDF.js (pdfjs-dist) extracts PDF text. There is no Python.

## What it demonstrates

```text
PDF → page text → chunks → embedding vectors → Pinecone upsert
Question → query vector → Pinecone nearest-neighbor query → matching chunks
```

The project prints retrieved evidence instead of generating an AI answer, making it easy to inspect whether retrieval works. The RAG folder explains how to add a grounded answer-generation stage.

## Requirements

- Node.js 20+
- OpenAI API key with embeddings access
- Pinecone account, API key, and a ready dense index
- Text-based PDF (scanned/image-only PDFs need OCR, not included)

## Pinecone index setup

Create a dense index in Pinecone with the dimension required by your embedding model. text-embedding-3-small returns 1536 dimensions by default. Choose a compatible metric, commonly cosine. Copy the index host/endpoint from Pinecone's console into PINECONE_INDEX_HOST; use the host only, including https://, with no /vectors suffix. The index must be ready before indexing.

If you change embedding model or requested dimensions, configure a matching index and re-embed the corpus. Existing vector dimensions cannot be mixed in one dense index.

## Install and configure

From this folder:

```sh
npm install
cp .env.example .env
```

On Windows PowerShell, use Copy-Item .env.example .env if needed. Edit .env and set OPENAI_API_KEY, PINECONE_API_KEY, and PINECONE_INDEX_HOST. Optionally configure namespace, chunk sizing, and top-k. Never commit .env; the included .gitignore excludes it and local PDFs.

## Run it

Place a PDF in data/, then run:

```sh
npm run index -- ./data/handbook.pdf
npm run search -- "How do I reset the device?"
```

The index command reports pages and chunks created. Search shows the closest chunks. Scores are ranking values, not answer-confidence probabilities.

## How each stage works

### 1. Extract page text

src/pdf.js reads PDF bytes, loads PDF.js in Node, visits pages, and joins text items. It records page numbers for citations. PDFs may have broken reading order, columns, tables, scanned pages, or headers/footers; inspect samples. Add OCR for scanned documents.

### 2. Chunk

chunkPages creates word windows independently per page. CHUNK_WORDS sets the maximum window and CHUNK_OVERLAP_WORDS sets repeated words between consecutive windows on a page. These are learning defaults, not universal best values. Word counts are a rough proxy for model tokens. Real systems often chunk by headings/paragraphs and enforce token limits.

### 3. Embed

src/embeddings.js batches text calls to the OpenAI embeddings endpoint. It uses the configured model for document chunks and questions, keeping them in the same embedding space. Calls cost money and transmit chunk text to the provider. Avoid embedding secrets or data you are not permitted to send.

### 4. Store and search

src/pinecone.js calls Pinecone vector data-plane endpoints. Each ID combines a stable hash of the local PDF path with its chunk number. Metadata includes text and source/page/chunk identifiers. Upsert replaces records with the same IDs. For maintained corpora, include a content version/hash, remove obsolete chunk IDs, and design deterministic lifecycle handling.

Pinecone metadata stores text so this demo can print matches directly. For larger or sensitive corpora, consider an authorized document store and keep only references plus required filters in vector metadata.

## Important limits and next steps

- This is a learning example, not a multi-user service. Add authentication and server-side authorization before exposing retrieval.
- Re-indexing a changed PDF under a different path produces different IDs; it does not automatically delete old vectors.
- There is no retry/backoff, rate-limit handling, concurrency control, OCR, reranking, hybrid search, or answer generation.
- Add input size/page limits and resumable ingestion before processing huge PDFs.
- Do not treat similarity as proof. Inspect matches and evaluate recall/precision with real questions.
- Protect secrets, scope API keys, apply tenant filters on the server, and handle retention/deletion requirements.

## Main files

- src/pdf.js — PDF text extraction and chunking
- src/embeddings.js — embedding API client
- src/pinecone.js — Pinecone upsert/query client
- src/cli.js — index and search commands
- .env.example — configuration template

## References

- [Pinecone API docs](https://docs.pinecone.io/)
- [OpenAI embeddings guide](https://platform.openai.com/docs/guides/embeddings)
- [PDF.js Node example](https://github.com/mozilla/pdf.js/blob/master/examples/node/getinfo.mjs)
