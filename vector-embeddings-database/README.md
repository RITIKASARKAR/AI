# Vector embeddings and vector databases — detailed notes

## 1. What an embedding is

An embedding model maps an input (text, image, audio, code, and so on) to a list of numbers called a vector. For text, the model is trained so useful semantic relationships are reflected by geometric relationships in the vector space. Similar meanings tend to have vectors near one another under a chosen distance measure. A vector is a learned representation, not a dictionary, a reliably decodable compressed sentence, or a truth score.

Real model output has hundreds or thousands of values, for example [0.012, -0.084, 0.331, ...]. The vector dimension is fixed by the model/configuration. Every vector in a dense index must have exactly that dimension. Values are usually floating point. Sparse vectors instead hold weighted token indices; hybrid search combines dense semantic and sparse lexical signals.

## 2. Why semantic search works

Keyword search asks whether terms overlap. Embedding search can find paraphrases and related concepts: “car repair” may retrieve “automotive maintenance” with little literal overlap. The model's training objective shapes this behavior. It does not guarantee that every notion of similarity fits your use case; evaluate with representative queries.

Embeddings may encode language, style, topic, and common associations. They can miss exact identifiers, negation, rare names, tables, or domain-specific distinctions. Combine semantic search with filters, keyword search, metadata, or reranking as appropriate.

## 3. Similarity and distance

- **Cosine similarity**: dot product divided by vector lengths. Often viewed as angle similarity and common for text. Higher is more similar. With normalized vectors, cosine ranking equals dot-product ranking.
- **Dot product**: sum of pairwise products. Magnitude affects score unless vectors are normalized. Some models are trained specifically for dot product.
- **Euclidean distance (L2)**: straight-line distance. Lower is closer. Squared L2 gives the same ranking.

Scores are not probabilities. A cosine score of 0.8 does not mean an 80% chance an answer is correct. Useful score ranges depend on model, corpus, chunking, and query. Calibrate against labeled examples. Query and passage encoders sometimes require different prefixes or input types; follow model instructions.

## 4. Embedding workflow

1. Normalize and prepare source content. Remove boilerplate where appropriate; retain headings and context.
2. Split long documents into chunks that fit model limits and retrieval needs.
3. Call the embedding model with batches. Respect token limits, retry transient errors, and cap concurrency.
4. Store each vector with a stable ID and useful metadata: source, page, chunk number, text/reference, tenant, timestamps, and version.
5. At query time, embed the query with the compatible query mode.
6. Search nearest neighbors, possibly filtering by metadata.
7. Inspect and/or rerank matches, then provide relevant text to the application.

## 5. Chunking matters

Embedding an entire book into one vector loses local detail and may exceed model limits. Tiny chunks lose context and increase record count. A starting experiment might use several hundred tokens per chunk with modest overlap, but no setting is universal. Chunk by document structure first (headings, paragraphs, pages), then enforce token/size limits. Character counts are not token counts. Preserve page and section metadata so results can be cited.

Overlap allows facts near a boundary to appear in adjacent chunks; excessive overlap duplicates results and costs storage. Avoid splitting a heading from its body. For tables, retain headers alongside rows. Deduplicate boilerplate. Evaluate retrieval on actual questions before tuning.

## 6. What a vector database does

A vector database stores vectors and supports approximate nearest-neighbor (ANN) search, IDs, metadata, filtering, namespaces/tenancy, upsert, fetch, delete, and operational scaling. ANN indexes trade some recall for lower latency and memory than exhaustive comparison at scale. Exact search computes distance against every vector; approximate indexes use graph- or partition-based structures to find promising candidates faster. The database handles indexing and retrieval; it does not determine which passage is factually correct.

Pinecone is a managed vector database. An index has a vector type, dimension, similarity metric, and deployment configuration. For dense vectors, dimension and metric must agree with the embedding model. A namespace logically groups records within an index. Metadata filters constrain matches; they are not a replacement for authorization. Enforce tenant access on the server, and never trust a client to choose an unrestricted namespace.

## 7. IDs, metadata, and lifecycle

Choose deterministic IDs, e.g. document-id:content-version:chunk-number. This makes re-indexing idempotent: upserting the same ID replaces the prior record. Include a document version or content hash so changed PDFs do not leave stale chunks. On replacement, delete old IDs or use versioned IDs and remove the previous version after successful indexing. Store only metadata needed for retrieval, citations, filters, and debugging; metadata has size/type limits.

Keep source-of-truth documents outside the vector index. Treat vectors as derived data that can be rebuilt. Track embedding model name, dimension, chunking strategy, and preprocessing version. Changing models generally requires re-embedding and a compatible index; unrelated model vectors should not be mixed.

## 8. Retrieval quality and evaluation

Separate **recall** (did relevant evidence appear?) from **precision** (were returned results relevant?). Useful measures include recall@k, precision@k, mean reciprocal rank, and nDCG. Build real questions with known source passages. Compare chunk size, overlap, filters, top-k, query rewrite, and reranking.

Top-k is a context budget trade-off. Too small can miss evidence; too large can add noise and consume context. A similarity threshold can reject weak matches, but calibrate it. Diversify results when many adjacent chunks come from one document. Rerank candidates with a cross-encoder or reranker when precision matters.

## 9. Common failure modes

- Wrong dimensions or metric: model/index mismatch.
- Weak retrieval: poor PDF extraction, bad chunk boundaries, wrong query mode, language mismatch, or no useful metadata.
- Duplicate or stale records: unstable IDs and incomplete deletion/versioning.
- Security leak: relying on a caller-supplied metadata filter instead of server-side authorization.
- Overconfident answer: treating nearest neighbors as proof; scores are ranking signals, not certainty.
- Silent quality regression: changing model or chunker without evaluation.
- Cost/latency surprises: too many tiny chunks, unbounded embedding concurrency, oversized top-k, or re-embedding unchanged documents.

## 10. Pinecone mental model

Think of an index as a searchable collection of compatible vectors; a record is {id, values, metadata}; a namespace is a logical partition; upsert inserts or replaces by ID; query finds nearest vectors to the supplied query vector and can return metadata. This learning project calls the OpenAI embeddings endpoint and Pinecone data-plane REST endpoint, keeping embedding and storage responsibilities explicit.

## 11. Quick recall

- **Embedding**: model-produced coordinates representing learned features.
- **Vector search**: rank candidates by distance/similarity.
- **Vector DB**: stores vectors plus metadata and performs scalable retrieval.
- **Embedding is not generation**: embeddings retrieve; a generative model writes an answer.
- **Similarity is not truth**: inspect evidence and measure retrieval quality.
- **Compatibility is essential**: same embedding space, dimension, metric, and query/document conventions.
- **Metadata is part of the design**: it supports filters, citations, tenancy, lifecycle, and debugging.

## References

- [Pinecone index configuration](https://docs.pinecone.io/reference/api/2025-10/control-plane/configure_index)
- [Pinecone API documentation](https://docs.pinecone.io/)
- [OpenAI embeddings guide](https://platform.openai.com/docs/guides/embeddings)
