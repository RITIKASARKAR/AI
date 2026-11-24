# Vector embeddings and vector databases — detailed notes

## 1. From text to a point in space

An embedding model maps an input (text, image, audio, or another supported object) to a fixed-length numeric vector. For text, the model is trained so that useful semantic or task-related relationships are reflected in vector geometry. Similar inputs often land near each other under a chosen distance function. An embedding is not a compressed sentence that can reliably be decoded back into the original wording. It is a task-specific representation.

Example shape (illustrative only):

```text
"A dog is playing outside" -> [0.04, -0.11, 0.72, ...]
```

The number of coordinates is the vector dimension. Each coordinate is not usually a human-readable feature such as “dogness.” Meaning is distributed across dimensions. Dimensions and values depend on the model, its version, preprocessing, and input. Never compare vectors created by incompatible embedding spaces.

## 2. What “similar” means mathematically

For vectors `a` and `b`, common measures are:

- **Cosine similarity:** `dot(a,b) / (||a|| ||b||)`. It compares direction and is common for semantic text embeddings.
- **Dot product:** `sum(a_i * b_i)`. If vectors are normalized to unit length, dot product equals cosine similarity. Without normalization, vector magnitude affects ranking.
- **Euclidean distance (L2):** `sqrt(sum((a_i-b_i)^2))`. Smaller distance means closer points.

The database metric must match the embedding model's intended use and the application's ranking interpretation. A score is not automatically a probability or a calibrated measure of truth. Thresholds must be tuned on representative examples.

High-dimensional spaces behave differently from 2D intuition: distances may cluster, irrelevant features may dominate, and a nearest neighbor can still be poor. Semantic similarity is not the same as factual entailment, keyword equality, or relevance to every task. Retrieval quality must be measured on real queries.

## 3. Embedding choices and compatibility

Choose a model based on language coverage, domain performance, latency, price, privacy, supported input size, and vector dimension. Keep an explicit model identifier and version in index/application configuration. If changing models, dimensions, normalization, or text preprocessing, plan a re-embedding migration; old and new vectors generally cannot be mixed meaningfully. Common migration pattern: create a new namespace or index, re-embed, evaluate, switch traffic, then retire the old collection.

Embedding input limits are model-specific. Long documents must be divided into semantically useful passages before embedding. If a request supports batches, batch for throughput while respecting token and request limits. Retry transient errors with bounded exponential backoff and jitter; do not retry invalid inputs forever.

## 4. What a vector database stores

A vector record usually contains:

```text
id: stable unique identifier
values: [floating-point coordinates]
metadata: {source, page, chunk_index, text, tenant, ...}
```

The vector supports similarity search. Metadata supports filtering, provenance, authorization, and displaying source context. Some systems store text separately and keep only a document key in the vector record; this can reduce payload size and duplicate storage. Decide where the canonical chunk text lives and how IDs map back to it.

A vector database commonly offers vector indexing, approximate nearest-neighbor (ANN) search, metadata filters, namespaces or collections, upsert/delete/fetch, and operational controls. It is not necessarily a replacement for a relational database, object store, or full-text search engine. Production systems commonly combine them.

## 5. Exact and approximate nearest neighbors

An exact scan computes the distance from the query to every vector: simple and exact, but expensive as the corpus grows. ANN indexes trade a small chance of missing the mathematically closest item for much faster search. Index families include graph-based methods (for example HNSW), inverted-file/centroid methods, and quantization/compression approaches. Managed services hide many internal details and expose parameters or service tiers instead.

The core trade-off is recall versus latency, memory, and cost. Recall@k measures the fraction of exact top-k neighbors recovered by approximate retrieval. Tune using a representative evaluation set and realistic filters, corpus size, and query patterns. Also track p95/p99 latency, empty-result rate, relevance judgments, and cost.

## 6. Metadata, namespaces, and access boundaries

Metadata filters can constrain search by source, document, date, content type, or tenant. Filters narrow the eligible records; they do not replace authorization checks. Enforce tenant identity on the server and construct filter values from authenticated state, not untrusted client input. Namespaces can separate logical datasets, but understand service-specific semantics and costs. Do not put secrets or sensitive personal data in metadata casually.

Include provenance fields such as document ID, filename, page number, chunk number, ingestion version, and optionally a content hash. This supports citations, debugging, de-duplication, update, and deletion. Use stable IDs (for example a hash of document ID + chunk index + preprocessing version) so repeated ingestion can upsert rather than duplicate.

## 7. Chunking before embedding

Chunking determines what one vector represents. Very large chunks mix topics and may exceed model limits; very small chunks lose context and produce vague matches. Use document structure first: headings, paragraphs, page boundaries, and tables where possible. Then apply a token or character budget. An overlap can preserve context across boundaries, but too much overlap creates redundant vectors and repeated search results.

Store the original page and offsets if citations matter. Keep chunk text with its metadata or a durable external mapping. PDFs can contain headers, footers, columns, scanned images, and tables; plain text extraction may not preserve reading order. OCR may be needed for scanned pages. Always inspect extracted text before trusting retrieval.

## 8. Search workflow

1. Normalize and validate the user query.
2. Embed the query with the same compatible model used for corpus vectors.
3. Apply security and scope filters.
4. Ask the database for top `k` nearest records and scores.
5. Optionally filter by a tuned minimum score, deduplicate adjacent/overlapping chunks, or rerank candidates with a stronger model.
6. Fetch canonical text and provenance.
7. Return results, or pass selected context into a RAG generation step.

`k` is a relevance/latency/context-size decision. A high `k` can improve recall but adds noise, cost, and duplicated passages. Hybrid search combines lexical matching (good for exact names, codes, and rare terms) with dense semantic retrieval. Reciprocal-rank fusion or a learned reranker can combine candidate lists; validate gains empirically.

## 9. CRUD and lifecycle

- **Upsert:** insert or replace by ID. A safe re-ingestion flow computes stable IDs and refreshes changed metadata and vectors.
- **Delete:** delete IDs or records matching a document filter when the source is removed or access changes.
- **Fetch:** inspect known IDs; useful for diagnostics and reconciliation.
- **Update:** metadata-only changes may avoid re-embedding; text or embedding-model changes require re-embedding.
- **Reconciliation:** track ingestion state outside the index so failures can resume and stale vectors can be cleaned up.

Use batching, bounded concurrency, idempotent IDs, retries, and checkpoints. Monitor partial failures: a file should not be marked complete until all its chunks are stored and verified. For large imports, consider a staging namespace/index and a controlled cutover.

## 10. Quality and evaluation

Create a small labeled set of questions with expected relevant passages. Evaluate Recall@k, Precision@k, reciprocal rank / MRR, nDCG when graded relevance is available, and citation correctness. Split by document or time when measuring generalization. Inspect both good and bad examples. Ablate chunk size/overlap, embedding model, filters, metric, k, and reranking. A benchmark of a few hand-picked examples is a starting point, not proof of production quality.

Separate retrieval quality from answer quality. A model cannot cite evidence the retriever failed to return. Conversely, relevant chunks can still yield a bad answer if the generation prompt ignores them or invents details.

## 11. Security and operational cautions

Treat uploaded files and retrieved text as untrusted data. A document can contain prompt injection instructions; retrieval does not make those instructions trustworthy. Keep system instructions separate from retrieved content, enforce access before retrieval, and avoid exposing one tenant's chunks to another. Apply retention and deletion policies to both original files and derived vectors. Protect API keys with environment/secret storage, rotate them, and never commit `.env` files.

Plan for dimension mismatch, model drift, rate limits, index readiness, network errors, stale metadata, duplicate chunks, and deletion propagation. Log IDs and latency without logging sensitive full text unless policy allows it. Use health checks and alert on ingestion failures and retrieval degradation.

## 12. Common misconceptions

- “The closest vector is the correct answer.” It is only a ranked candidate under a metric.
- “Embeddings understand facts.” They encode learned relationships and can retrieve plausible but wrong neighbors.
- “More dimensions are always better.” Dimension is a model design choice with storage and compute costs.
- “A vector DB knows the source document.” It only knows what the application stored and can map back.
- “A score threshold transfers between models.” Scores are model/data/metric dependent.
- “Chunk overlap fixes context.” It may help boundaries while also causing redundancy.

## Mental model

**An embedding model defines a coordinate system; a vector database indexes points in that system; retrieval ranks candidates; your application decides what candidates mean and what to do with them.**

## Further reading

- [Pinecone: Vector database concepts](https://docs.pinecone.io/guides/get-started/overview)
- [Pinecone: Search](https://docs.pinecone.io/guides/search/semantic-search)
- [OpenAI: Embeddings guide](https://platform.openai.com/docs/guides/embeddings)
