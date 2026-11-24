# RAG and Advanced RAG: Chunking, Embeddings, Retrieval, and Grounded Answers

> A complete beginner-to-advanced learning module for JavaScript and Node.js. It includes separate, commented examples for fixed-size, structure-aware, and semantic chunking, a small embedding explainer, a basic RAG pipeline, and an advanced hybrid retrieval pipeline.

## What you will build

This project builds a tiny search assistant over a fictional product knowledge base. It demonstrates how to prepare documents, split them into chunks, represent text as vectors, retrieve evidence, and produce an answer with citations. It also shows advanced retrieval patterns: metadata filters, query variants, lexical plus vector retrieval, reciprocal rank fusion (RRF), reranking, and abstention when the evidence is weak.

The examples run offline with **toy lexical vectors** and template-based answer generation. They are deliberately small enough to study. The toy vectors are not a real semantic embedding model and should not be used in production. A production system swaps in a real embedding model, persistent vector store, and generator while keeping the pipeline stages and evaluations explicit.

## Learning path

1. Understand what problem RAG solves and its end-to-end stages.
2. Learn fixed-size, structure-aware, and semantic chunking separately.
3. Understand embedding vectors and cosine similarity with tiny JavaScript examples.
4. Build a baseline retrieve-then-answer RAG pipeline.
5. Improve retrieval with metadata, query expansion, hybrid search, fusion, and reranking.
6. Evaluate retrieval and answers independently, diagnose failures, and select a suitable strategy.

## 1. What is RAG?

**Retrieval-Augmented Generation (RAG)** is a pattern that looks up relevant external information and supplies it to a language model as context for generating an answer. The model's trained parameters are sometimes called parametric memory; retrieved documents are external, updateable context. RAG helps a system answer from a chosen corpus, provide provenance, and use recently updated knowledge. It does not guarantee truth: retrieval may miss the evidence, the source may be wrong, or generation may misread it.

```text
OFFLINE / INGESTION
Documents → parse → clean → chunk → embed chunks → index vectors + metadata

ONLINE / QUESTION
Question → optional rewrite → retrieve candidates → filter / fuse / rerank
         → select evidence → generate grounded answer → cite / abstain
```

The ingestion path is usually run when documents are added or updated. The query path runs for each user question. Keeping these paths separate helps control cost, freshness, and debugging.

## 2. Core vocabulary

- **Document:** Source unit, such as a PDF, web page, product policy, ticket, or database record.
- **Chunk:** A smaller passage selected for retrieval and passed to the model as context.
- **Embedding:** A vector of numbers produced from text by an embedding model.
- **Vector index/store:** A system that stores vectors and metadata and finds near neighbors.
- **Retriever:** Logic that selects candidate chunks for a query.
- **Reranker:** A second-stage scorer that reorders candidates more carefully, often using a cross-encoder or model.
- **Context window:** The model input capacity. Retrieved text consumes tokens from this budget.
- **Grounding:** Using evidence from retrieved sources to support claims.
- **Citation/provenance:** A pointer from an answer claim to the source chunk/document that supports it.

## 3. Chunking: why it matters

Chunking decides what units are embedded and retrieved. A chunk that is too large can mix unrelated facts, dilute search relevance, and waste context. A chunk that is too small can lose definitions, conditions, exceptions, or the subject needed to understand a sentence. Overlap can preserve continuity across boundaries, but too much overlap duplicates content and increases index size and retrieval redundancy.

The best chunk size depends on document structure, query style, embedding model, retriever, and how much context the generator can use. Treat chunking as an empirical design choice: build representative questions, inspect retrieved passages, and compare measured retrieval quality.

The code examples use **characters** so you can see boundaries without a tokenizer dependency. Real systems should size chunks with the tokenizer relevant to the embedding/generation model, or use document-aware units (paragraphs, sections, rows, code blocks) and then apply a token limit.

## 4. Fixed-size chunking

Fixed chunking slices text into windows of a configured size with optional overlap. It is easy, fast, reproducible, and useful for unstructured text where no better boundaries are available. It may cut a sentence, table, code block, or condition in half. Tune both window size and overlap; neither is universal.

Example: with size 100 and overlap 20, the next window starts 80 characters after the previous start. The overlap carries a little context across the boundary.

See `src/chunking-fixed.js` for a standalone runnable example.

## 5. Structure-aware chunking

Structure-aware (often called structural or document-aware) chunking uses meaningful document boundaries: Markdown headings, HTML sections, paragraphs, policy clauses, code functions, table rows, or slide boundaries. It can retain a heading path as metadata so a chunk such as “14 days” keeps the context “Trial duration.”

The sample parser groups Markdown text under headings and splits an oversized section into fixed windows, retaining heading metadata. This is **not** a complete Markdown parser; nested lists, tables, code fences, and complex HTML need a parser designed for that source format.

Use it when document structure carries meaning: manuals, policies, technical docs, FAQs, source code, and reports. Preserve hierarchy and identifiers. For tables, keep headers with rows; for code, prefer functions/classes or syntax trees over arbitrary character slices.

See `src/chunking-structured.js`.

## 6. Semantic chunking

Semantic chunking tries to split where the meaning changes rather than at a fixed character count. One common approach is:

1. Split into sentences or small candidate units.
2. Embed each unit.
3. Compare neighboring unit vectors.
4. Create a boundary where similarity drops below a threshold, while enforcing size limits.

This can keep related sentences together when their lengths vary. It costs more because each unit needs an embedding and it depends on the embedding model and threshold. Similar adjacent passages may still discuss different details; unrelated passages may use similar vocabulary. Semantic chunking is not automatically better than heading-aware chunking. It is often best for long narrative material with weak explicit structure.

`src/chunking-semantic.js` uses the toy embedding implementation in `src/embeddings.js`. This illustrates the boundary algorithm only. A real semantic chunker needs a real sentence embedding model and calibrated similarity thresholds.

## 7. Which chunking method should I choose?

| Situation | Good starting point | Why / watch for |
| --- | --- | --- |
| Logs, plain text, or no reliable structure | Fixed windows with modest overlap | Simple baseline; inspect boundary loss. |
| Markdown docs, manuals, policies, source code | Structure-aware chunks | Keeps headings and sections with their content. |
| Long narrative with topic shifts and weak headings | Semantic boundaries, with max/min size | Follows meaning; adds embedding cost and tuning. |
| Tables, spreadsheets, forms | Row/record-aware chunks with column headers | Preserve schema and row meaning; avoid splitting cells from headers. |
| Code repositories | Syntax-aware chunks by symbol/function plus file path | Preserves code units and identifiers. |
| Short Q&A or product facts | One fact/answer per chunk, with metadata | Precise retrieval, but retain conditions and exceptions. |

These are starting points, not rules. Compare strategies with your own corpus and query set. Chunking is often a combination: parse structure first, then split unusually large sections, and optionally merge tiny adjacent sections.

## 8. Embeddings: a small, intuitive view

An embedding model maps text to a fixed-length vector, for example `[0.12, -0.08, ...]`. The model is trained so that useful semantic relationships can be reflected by vector geometry. Texts with related meanings often have vectors closer together under a chosen distance/similarity measure. The values themselves generally do not map to interpretable words or coordinates.

The project implements a **toy bag-of-words vector**, where each vocabulary term is a dimension and term frequency is the value. It demonstrates vectorization and cosine similarity, but matches overlapping vocabulary rather than rich meaning. A real embedding might find “refund” related to “money returned” even with little word overlap; this toy cannot reliably do that.

Cosine similarity compares vector direction:

```text
cosine(a, b) = dot(a, b) / (magnitude(a) × magnitude(b))
```

For normalized non-zero vectors, larger cosine means closer direction. Similarity scores are not probabilities. The score distribution depends on the embedding model, corpus, and task. Do not transfer thresholds from one model to another without validation.

Embeddings are often computed for chunks during ingestion and for the user's query at question time. Both sides must use compatible embedding model/version and vector dimensions. If the embedding model changes, re-embed and rebuild or version the index. Store model/version, dimensions, document IDs, chunk IDs, metadata, and content provenance with the index.

See `src/embeddings.js` for code and a small cosine comparison.

## 9. Basic RAG pipeline

The baseline in `src/rag-basic.js` follows these steps:

1. Load source documents and split them into chunks.
2. Attach metadata and stable IDs to chunks.
3. Embed chunks and store vectors in an in-memory index.
4. Embed the query using the same embedding interface.
5. Rank chunks by cosine similarity and select top `k`.
6. Build a prompt/context from the retrieved evidence.
7. Generate a supported answer with citations, or say evidence is insufficient.

The demo uses an extractive/template answer builder instead of a live LLM. This makes retrieval inspectable and free to run. A real generator should receive the question, selected context, and explicit instructions to use the sources, cite claims, and abstain if evidence is insufficient. The prompt alone cannot guarantee faithfulness; evaluate answers.

### Why top-k is not enough

`k` controls how many results are included; it does not mean those results are relevant or diverse. A large `k` can add noise and crowd out useful evidence. A small `k` can miss a second fact required by a multi-part question. Inspect ranking and tune using retrieval evaluation rather than guessing.

## 10. Advanced RAG patterns in the code

`src/rag-advanced.js` demonstrates small, dependency-free versions of these patterns:

### Metadata filtering

Restrict candidate chunks by fields such as product, locale, tenant, publication status, or date. Apply access-control filters in a trusted retrieval layer; never ask an LLM to enforce document permissions. Test that unauthorized documents cannot enter the candidate set.

### Query rewriting and multi-query retrieval

Rewriting can expand acronyms, add likely terminology, or turn a vague question into a clearer search query. Multiple query variants can improve recall when the original wording differs from source phrasing. They also cost more and may retrieve contradictory noise. The example uses deterministic variants; production rewrites can use rules or a model, then record the original query and versions.

### Hybrid retrieval

Vector retrieval helps with semantic similarity. Lexical retrieval (for example BM25) is strong for exact terms, IDs, product names, and rare tokens. Combining them can improve robustness. This teaching example uses a simple lexical overlap score rather than BM25. For production, use a proper search engine or database implementation and tune its analyzer.

### Rank fusion

Different retrievers return scores that may not share a scale. Reciprocal Rank Fusion (RRF) combines positions rather than raw scores:

```text
RRF(document) = Σ 1 / (constant + rank_in_each_list)
```

This is a practical baseline for merging lexical and vector rankings. The RRF constant affects the influence of high ranks; validate it on your data.

### Reranking

A first-stage retriever cheaply narrows a large corpus to candidates. A reranker then scores query-candidate pairs more precisely and reorders a smaller set. Cross-encoders or LLM rerankers can improve precision but add latency and cost. The demo's lexical reranker is only illustrative. Preserve original retrieval scores/ranks to debug reranking regressions.

### Context assembly

After reranking, choose a token-budgeted set of passages. Deduplicate overlapping chunks, retain source identifiers, and consider diversity. For multi-hop questions, the best evidence may span multiple documents. Context order can affect generation; test different policies. Do not simply dump the entire corpus into the prompt.

## 11. Generation, grounding, and citations

The generation stage should be given explicit evidence boundaries. A useful response format includes:

- Direct answer to the question.
- Citations linked to chunk/document IDs and source locations.
- Clear uncertainty or abstention when evidence is absent or conflicting.
- No claim that a source supports more than it actually says.

The sample creates citations from retrieved chunk metadata. In production, store stable source IDs, URLs or file paths, page/section/row locations, versions, and timestamps. A citation being present does not prove that it supports a claim. Evaluate citation correctness and claim-level support.

## 12. Failure analysis: find the broken stage

RAG failures are easier to fix when classified by stage:

1. **Source failure:** source is missing, stale, duplicated, malformed, or low quality.
2. **Parsing failure:** text or layout was extracted incorrectly.
3. **Chunking failure:** the needed fact was separated from its heading, condition, or exception.
4. **Embedding/index failure:** wrong model/version, failed ingestion, stale vector, bad metadata.
5. **Retrieval failure:** evidence exists but was not ranked high enough or filters excluded it.
6. **Context failure:** evidence was retrieved but omitted, truncated, duplicated, or buried.
7. **Generation failure:** evidence was present but the answer ignored, misread, or overclaimed it.
8. **Evaluation failure:** test set does not represent users or labels are incorrect.

Do not respond to every incorrect answer by changing the system prompt. First inspect the exact chunks, metadata, scores, filters, and context that the model received.

## 13. RAG evaluation

Measure retrieval and generation separately.

### Retrieval metrics

- **Recall@k:** Is the needed evidence among the top `k` results?
- **Precision@k:** How much of the top `k` is actually relevant?
- **MRR:** How early does the first relevant result appear?
- **nDCG:** Does the ranking place highly relevant results above partially relevant ones?

### Answer metrics

- **Correctness:** Is the answer accurate compared with a trusted reference?
- **Faithfulness/groundedness:** Are material claims supported by retrieved sources?
- **Relevance:** Does it answer the user's question?
- **Citation quality:** Do citations point to sources that support the associated claims?
- **Abstention quality:** Does it decline when evidence is missing or conflicting?

Build a set of realistic questions with known supporting document/chunk IDs and expected answers. Include normal, exact identifier, paraphrase, multi-hop, ambiguous, stale/conflicting, and unanswerable queries. Evaluate retrieval recall before tuning generation. A strong answer model cannot cite evidence that retrieval never found.

LLM judges can assist with nuanced answer quality, but validate them against human-reviewed examples. Deterministic checks are preferable where exact IDs, numbers, statuses, or citations can be checked in code.

## 14. Ingestion and operations

Production ingestion needs more than `split()`:

- Parse each format with appropriate extractors; preserve page, section, table, and code structure.
- Normalize whitespace and remove repeated headers/footers carefully without deleting meaning.
- Assign stable document and chunk IDs; track source version and ingestion timestamp.
- Handle updates and deletions so stale chunks are removed from retrieval.
- Avoid indexing secrets or content the caller is not allowed to see.
- Batch embeddings within provider limits; retry transient failures safely and record partial failures.
- Keep the embedding model/version and chunking configuration with the index build.
- Monitor ingestion errors, empty documents, duplicate chunks, index freshness, retrieval latency, and cost.

## 15. Advanced directions beyond the sample

- **Parent-child retrieval:** index small child passages for precise matching, then return a larger parent section for context.
- **Contextual retrieval:** attach a short document/section description to a chunk before embedding, while preserving the original source passage and provenance.
- **Late chunking:** embed a larger context first and derive chunk-level representations that retain surrounding context; requires model support.
- **Hierarchical retrieval:** first select documents/sections, then retrieve passages inside them.
- **Knowledge graphs:** retrieve entities/relationships for questions requiring structured multi-hop connections; often combine with text search.
- **Agentic retrieval:** let a controller perform another search or reformulate the question when evidence is incomplete; bound iterations and measure the benefit.
- **Corrective retrieval:** detect weak or contradictory results and trigger alternative retrieval or abstention.
- **Multimodal RAG:** index images, audio, video frames, or mixed documents with appropriate parsing and multimodal embeddings.

Each additional stage adds complexity, latency, and new failure modes. Add it when evaluation reveals a specific retrieval problem that the technique can address.

## 16. How to choose a practical architecture

Start with a simple baseline: clean sources, structure-aware chunks where possible, one embedding model, vector top-k retrieval, citations, and an evaluation set. Add lexical search when exact terms and IDs are missed. Add reranking when relevant results are in the candidate pool but ordered poorly. Add query rewriting when user vocabulary mismatches source vocabulary. Add parent-child context when small chunks retrieve well but lack enough surrounding meaning.

Change one stage at a time and compare on the same versioned test set. Record retrieval candidates and per-stage scores. A more elaborate architecture is useful only if it measurably improves the outcomes that matter.

## 17. Run the examples

Requirements: Node.js 18 or newer. There are no dependencies and no API key is required.

```bash
cd rag-advanced
npm run chunking
npm run embeddings
npm run rag
npm run rag:advanced
```

Or run the complete walkthrough:

```bash
npm run demo
```

## 18. Project files

```text
rag-advanced/
├── README.md
├── package.json
├── data/
│   └── knowledge-base.json
└── src/
    ├── chunking-fixed.js
    ├── chunking-structured.js
    ├── chunking-semantic.js
    ├── embeddings.js
    ├── rag-basic.js
    ├── rag-advanced.js
    └── demo.js
```

## 19. Exercises

1. Change fixed chunk size and overlap. Inspect whether useful facts are split or duplicated.
2. Add a Markdown heading to the knowledge base and confirm it is preserved in chunk metadata.
3. Change the semantic boundary threshold. Compare the result with the structure-aware chunks.
4. Add an exact order ID query and see whether the hybrid lexical retriever improves over vector-only retrieval.
5. Add `locale` metadata and filter to one locale. Verify nonmatching chunks are never returned.
6. Add a deliberately unanswerable query and ensure the system abstains.
7. Build a small labeled query set and calculate Recall@3 by hand before writing code to automate it.
8. Replace the toy embedder and template answerer with real model adapters. Keep model names and versions in the report.

## Key takeaways

- RAG is a pipeline: source quality, parsing, chunking, embeddings, retrieval, context assembly, and generation all matter.
- Fixed chunking is simple; structure-aware chunking preserves document organization; semantic chunking uses similarity to find topic boundaries. Choose by document/query evaluation.
- Embedding vectors enable similarity search, but toy vectors are not equivalent to learned semantic embeddings.
- Advanced retrieval stages solve specific problems and add cost; measure each stage before adding complexity.
- Inspect retrieved evidence and evaluate retrieval separately from answer generation.
- Ground answers in sources, cite them, and abstain when the evidence is not sufficient.

## Further reading

- [Lewis et al., Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks](https://arxiv.org/abs/2005.11401)
- [LangChain documentation: text splitters](https://docs.langchain.com/oss/python/integrations/splitters)
- [LangChain documentation: embedding models and similarity](https://docs.langchain.com/oss/python/integrations/embeddings)
