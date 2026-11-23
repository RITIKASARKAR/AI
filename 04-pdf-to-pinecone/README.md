# PDF chunks → embeddings → Pinecone search

A JavaScript CLI that extracts text from PDFs, splits each page into overlapping chunks, embeds every chunk, stores vectors and source metadata in Pinecone, then embeds a question and retrieves the closest chunks. This is the retrieval part of RAG; it prints evidence and does not yet generate an answer.

## How the data flows

```text
PDF → page text → chunks → OpenAI embedding vectors → Pinecone upsert
Question → query embedding → Pinecone similarity search → ranked source chunks
```

The embedding model and index must use the same dimension and compatible vector space. The default is `text-embedding-3-small` (1536 dimensions). Pinecone's cosine scores rank matches; they are not probabilities or guarantees of truth.

## Requirements and setup

- Node.js 22 or newer (required by the Pinecone JavaScript SDK)
- A Pinecone API key and an OpenAI API key
- Text-based PDFs (scanned/image-only PDFs need OCR)

From this folder:

```bash
npm install
cp .env.example .env
```

On PowerShell use `Copy-Item .env.example .env` instead of `cp` if needed. Edit `.env` and set both API keys. Keep `.env` private; it is ignored by Git. Pinecone cloud and region must be available to your account. The CLI creates the named serverless index when absent and waits for readiness.

## Add PDFs and ingest

Put PDFs in `pdfs/` (or pass another folder path), then run:

```bash
npm run ingest -- ./pdfs
npm run ingest -- ./pdfs --limit 1
```

The limit option is handy for a small first run. The CLI walks subfolders, extracts each page, chunks each page independently, requests embeddings in batches of 64, and upserts records. Each record has a stable hash ID plus `source`, `source_path`, `page`, `chunk`, and `text` metadata. Re-ingesting unchanged input overwrites those IDs. If a document changes and its chunk boundaries change, old IDs may remain; a production ingestion pipeline should track each document's prior IDs and delete stale records, or use a document namespace and replace it deliberately.

## Search

```bash
npm run search -- "What does the document say about refunds?" --top-k 5
```

The command prints rank, score, file, page, chunk number, and matched text. Try several questions, inspect whether the evidence really answers them, and tune chunk size, overlap, model, and `top-k` based on representative queries.

## Chunking and metadata choices

The example uses character windows (default 1200 characters, 200-character overlap) and prefers nearby paragraph/sentence boundaries. Character counts are not token counts, so this is a teaching baseline rather than a universal chunking rule. Page-by-page chunking keeps citations simple but can split a thought across pages. Better systems can preserve headings, paragraphs, tables, and section hierarchy, and use a tokenizer-aware budget. Overlap preserves boundary context but increases duplicate storage and near-duplicate results.

PDF extraction is imperfect: multi-column layouts, tables, headers/footers, ligatures, and reading order can be wrong. Empty extracted pages are skipped; OCR is not included. Review extracted text before trusting search quality. Treat document text as untrusted input.

## Files

- `src/cli.js`: JavaScript CLI for PDF extraction, chunking, OpenAI embeddings, Pinecone index creation, upsert, and query.
- `.env.example`: configuration template.
- `package.json`: Node scripts and dependencies.
- `.gitignore`: excludes credentials, PDFs, and installed dependencies.

## Important limitations / next steps

This project demonstrates dense semantic retrieval only. A full RAG application would add an answer-generation call with retrieved context, citations grounded in chunk metadata, access-control filters, document deletion/version tracking, OCR, robust retry/rate-limit handling, hybrid lexical+dense retrieval, reranking, and evaluation. Do not send sensitive PDFs to an embedding provider unless your data handling requirements allow it.

## References

- [Pinecone JavaScript SDK](https://docs.pinecone.io/reference/sdks/node/overview)
- [Pinecone index concepts](https://docs.pinecone.io/guides/get-started/overview)
- [OpenAI embeddings guide](https://platform.openai.com/docs/guides/embeddings)
- [pdf-parse documentation](https://github.com/mehmet-kozan/pdf-parse)
