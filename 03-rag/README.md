# Retrieval-Augmented Generation (RAG) — notes

## What RAG is

Retrieval-Augmented Generation combines a retrieval system with a generative language model. At question time, the system finds external information relevant to the question and supplies it as context to the model. The goal is to ground responses in a changing or private knowledge source, improve traceability, and reduce the need to place an entire corpus in the prompt.

RAG is a system pattern, not a guarantee of correctness. It can fail because the source is missing or stale, extraction/chunking is poor, retrieval misses relevant evidence, context is badly assembled, the model misreads evidence, or citations are fabricated. Retrieved documents can themselves contain misleading or hostile instructions.

## Two phases

### Ingestion / indexing

1. Collect files or records and record permissions/provenance.
2. Parse and normalize content; handle OCR, tables, and structure as needed.
3. Split content into chunks with useful context and source offsets.
4. Embed chunks and write vectors plus metadata to an index; keep canonical text somewhere durable.
5. Track versions, completion, failures, and deletion state.

### Query / generation

1. Authenticate the user and determine allowed sources.
2. Rewrite or expand the query if useful (optional).
3. Retrieve candidates using dense, lexical, or hybrid search with access filters.
4. Rerank, deduplicate, and select evidence under a context budget.
5. Prompt the model with the question, retrieved evidence, and clear grounding rules.
6. Return an answer with citations linked to retrieved chunk provenance.
7. Record feedback and evaluate retrieval and answer quality.

## Retrieval design

Dense vector search finds semantically related passages. Lexical search is often stronger for exact identifiers, quoted phrases, uncommon names, and codes. Hybrid search combines them. Reranking can improve ordering by scoring query-document pairs more directly, at the cost of added latency and compute. Query expansion can help recall but may introduce drift. Use these techniques only when evaluation shows a benefit.

Search within authorized scope first. A filter applied after retrieval can leak unauthorized text into logs, caches, or intermediate processing. Consider metadata filters, tenant namespaces, and server-side access checks together. Deduplicate overlapping adjacent chunks so the prompt does not spend its budget repeating the same passage.

## Context construction and prompting

Context has a finite budget. Select evidence based on relevance, diversity, recency, authority, and redundancy. Include source identifiers and page/section details beside each excerpt. Preserve enough surrounding text to interpret pronouns, definitions, and qualifications. Clearly delimit retrieved text as data, not instructions. Ask the model to state when evidence is insufficient and to cite claims using provided source IDs. Validate that cited IDs were actually retrieved and that each citation supports the associated claim.

Prompt rules help, but are not a security boundary. Retrieved content can include prompt injection. Do not give a model tools or privileges merely because a retrieved document requests it. Restrict tool access and validate all actions outside the model.

## RAG versus long context and fine-tuning

Long context is simple when the source set is small and fits economically, but can be costly, noisy, or too large at scale. RAG selects evidence from larger collections and can update knowledge without model retraining. Fine-tuning changes model behavior/style or teaches repeated task patterns; it is usually not a dependable way to keep a large frequently changing fact base current. Systems can combine these methods.

## Evaluation

Evaluate components separately:

- **Parsing:** text coverage, page alignment, table/OCR fidelity.
- **Retrieval:** Recall@k, Precision@k, MRR, nDCG, authorization correctness.
- **Reranking/context:** evidence relevance, diversity, redundancy, and token use.
- **Generation:** factual support, completeness, abstention behavior, citation precision/recall, harmful instruction resistance.
- **Operations:** latency percentiles, cost per query, failures, freshness, ingestion lag.

Build a representative dataset with questions, relevant sources/passages, expected answer attributes, and access scope. Include unanswerable questions, ambiguous queries, exact identifiers, recent updates, adversarial documents, and cross-tenant cases. Review failure examples regularly. Avoid optimizing only for fluent answers: unsupported confidence can mask retrieval failure.

## Common failure modes and remedies

- **Wrong chunks retrieved:** improve parsing, chunking, query processing, filters, hybrid search, or reranking; measure each change.
- **Right document, wrong passage:** use finer structural chunks, headings, or a second-stage passage retrieval.
- **Answer ignores evidence:** shorten and organize context, instruct grounding, or use structured output and validation.
- **Citations look right but do not support claims:** generate citations from evidence IDs and validate support.
- **Stale results:** version sources, re-index changed content, monitor freshness, delete superseded vectors.
- **Prompt injection in documents:** treat context as untrusted data, limit tools, and test adversarial cases.
- **Unauthorized retrieval:** enforce scope before search and test isolation as a first-class requirement.
- **Too much duplicated text:** deduplicate near/adjacent chunks and tune overlap/top-k.

## Design checklist

- What is the authoritative source, and how quickly must changes appear?
- What are the user and tenant access rules?
- Which file types need OCR or structured table parsing?
- What are stable chunk IDs and deletion semantics?
- Which model/index versions produced each vector?
- What retrieval metrics and answer checks define success?
- How will citations be verified and displayed?
- How will failures, re-indexing, and rollback work?
- What content may be retained in logs or traces?

## Mental model

**RAG is a chain: source quality → extraction → chunking → retrieval → evidence selection → grounded generation → citation validation.** Measure the chain stage by stage; the final answer alone does not reveal where it failed.

## Further reading

- [Pinecone: Retrieval augmented generation](https://docs.pinecone.io/guides/get-started/build-a-rag-chatbot)
- [Pinecone: Search](https://docs.pinecone.io/guides/search/semantic-search)
