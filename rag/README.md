# Retrieval-Augmented Generation (RAG) — complete study notes

## 1. Definition

RAG is a pattern that retrieves relevant external information and supplies it to a language model while it generates a response. The model's pretrained knowledge remains; retrieval adds current, private, or domain-specific evidence at answer time. RAG can improve grounding and citations, but does not guarantee correctness.

**Memory formula:** question → retrieve evidence → generate an answer from evidence.

## 2. Why use RAG?

- Use private or frequently changing material without training on every update.
- Show source passages so users can inspect support.
- Limit answers to a selected corpus or tenant.
- Update the knowledge store by re-indexing rather than retraining model weights.

RAG is not automatically right for exact database lookups, deterministic calculations, or workflows where a structured API/tool is more reliable. It adds retrieval latency, data preparation, and operational complexity.

## 3. Two pipelines

### Offline ingestion

1. **Collect** source files and record provenance and permissions.
2. **Extract** text, page numbers, tables, and metadata. OCR image-only PDFs when needed.
3. **Clean** headers/footers and normalize whitespace while preserving meaning and structure.
4. **Chunk** by semantic/document boundaries, keeping heading and page context.
5. **Embed** each chunk with a chosen embedding model.
6. **Index** vector + metadata + text/reference in a vector store.
7. **Validate** counts, samples, extraction quality, and retrieval against test questions.

### Online question answering

1. Authenticate the user and determine authorized corpus/filters.
2. Rewrite or expand the question if useful; retain original intent.
3. Embed the query in the same compatible embedding space.
4. Retrieve top-k candidates with metadata filters.
5. Optionally apply hybrid lexical search, deduplication, diversity, and reranking.
6. Assemble a bounded context with source labels and page references.
7. Prompt the LLM to answer using evidence, say when evidence is insufficient, and preserve citations.
8. Return answer plus sources; log quality and latency safely and collect feedback.

## 4. Chunking and context design

Chunk size controls how much context one vector represents. Small chunks give precise matches but may lose surrounding definitions. Large chunks preserve context but dilute topical focus and use more context tokens. Start with structure-aware paragraph/section chunks; use token-based maximums and modest overlap only where boundaries need continuity. Preserve document title, section heading, page, chunk index, and source ID. Character count is not token count.

For PDFs, page boundaries are useful citation metadata but not always ideal semantic boundaries. Keep heading text with content, carry table column labels into table chunks, and inspect extracted samples. Scanned documents need OCR; ordinary text extraction cannot read pixels.

## 5. Retrieval techniques

- **Dense retrieval** finds semantic neighbors using embeddings.
- **Sparse/keyword retrieval** finds lexical matches, useful for exact names, codes, and rare terms.
- **Hybrid retrieval** combines both, often improving robustness.
- **Metadata filtering** limits by tenant, date, document type, or permissions. Enforce filters server-side.
- **Reranking** scores query-candidate pairs more precisely after broad retrieval.
- **Query transformation** can add terms, decompose multi-part questions, or create hypothetical answer text for retrieval. It must not change user constraints.
- **Parent-child retrieval** indexes small chunks but returns a larger parent section for context.

Retrieval topK and thresholds should be measured. A high similarity score is not proof. Diverse results reduce redundant adjacent chunks. For multi-hop questions, retrieve evidence for each sub-question and combine carefully.

## 6. Prompting and grounded generation

Provide concise, clearly delimited context with source IDs and page metadata. Instruct the model to answer only to the extent supported by evidence, distinguish evidence from inference, say when sources do not contain the answer, cite source IDs/pages, and treat retrieved text as untrusted data rather than instructions.

Documents can contain prompt injection such as “ignore previous instructions.” Isolate retrieved text as data, keep system policy separate, and do not give retrieved content authority to invoke tools. RAG does not eliminate prompt injection risk.

## 7. Citations and provenance

Each result needs a stable source identity and a location (page, section, or URL). Preserve metadata through ranking and generation. Validate citations refer to retrieved chunks and ideally that claims are supported by cited text. Track document version and access controls; removed or updated content must not remain retrievable.

## 8. Evaluation

Evaluate each stage independently:

- **Extraction**: text fidelity, page correctness, OCR quality.
- **Chunking**: coherent context, no missing headings or broken tables.
- **Retrieval**: recall@k, precision@k, MRR, nDCG, and authorization correctness.
- **Generation**: answer correctness, groundedness, citation precision, refusal when unsupported, and relevance.
- **System**: latency, availability, cost, and user satisfaction.

Create representative questions, expected evidence, and acceptable answers. Include unanswerable queries, ambiguous questions, adversarial instructions in source text, and access-boundary cases. Inspect false negatives and positives; a fluent answer can hide a retrieval failure.

## 9. Security, privacy, and operations

- Apply authorization before retrieval and validate every source belongs to the caller's allowed scope.
- Avoid logging sensitive prompts or document text unless policy allows it; redact secrets and set retention rules.
- Protect API keys on the server, encrypt transport, rotate credentials, and rate-limit expensive endpoints.
- Re-index deletions and permission changes promptly. Ensure caches respect tenant/user scope.
- Defend against malicious or poisoned source documents and prompt injection.
- Bound file size, page count, token count, retrieval count, and generation time.
- Monitor ingestion failures, indexing lag, empty retrieval rate, latency, cost, and quality feedback.

## 10. Common design mistakes

1. Embedding whole documents rather than retrievable passages.
2. Using arbitrary character chunks that cut concepts in half.
3. Indexing noisy PDF headers/footers without inspection.
4. Using incompatible query and passage embedding configurations.
5. Returning redundant neighbors and overwhelming the prompt.
6. Trusting semantic similarity as factual verification.
7. Omitting page/source metadata, making answers impossible to audit.
8. Trusting tenant filters from untrusted client input.
9. Failing to define behavior when evidence does not support an answer.
10. Skipping evaluation after changing a model, chunker, or prompt.

## 11. When to use another approach

- Use SQL or an API for exact structured values and transactional state.
- Use fine-tuning for persistent behavior/style/task adaptation, not as a substitute for frequently updated facts.
- Use long-context prompting when the corpus is small and fits reliably, considering cost and citation needs.
- Combine RAG with tools when answers require live calculations or actions.

## 12. End-to-end pseudocode

```text
for each authorized document:
  pages = extract_text_and_page_numbers(document)
  chunks = structure_aware_chunk(pages)
  vectors = embed(chunks)
  upsert(id, vector, {text, source, page, version, access_scope})

on question(user, query):
  scope = server_side_authorized_scope(user)
  candidates = vector_search(embed(query), filter=scope, topK=...)
  evidence = rerank_and_select(candidates)
  answer = generate(query, evidence, groundedness_rules)
  return answer plus verified source references
```

See [the PDF + Pinecone project](../pdf-pinecone-rag/README.md) for ingestion and search code in Node.js.

## Memory hook

**RAG quality = source quality × chunk quality × retrieval quality × generation discipline.** A failure in any stage can produce a confident but unsupported answer.
