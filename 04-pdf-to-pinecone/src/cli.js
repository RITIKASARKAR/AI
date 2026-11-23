import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";
import { createHash } from "node:crypto";
import OpenAI from "openai";
import { Pinecone } from "@pinecone-database/pinecone";
import { PDFParse } from "pdf-parse";

const env = (key, fallback) => process.env[key] ?? fallback;
const required = (key) => {
  const value = process.env[key];
  if (!value) throw new Error(`Set ${key} in .env before running this command`);
  return value;
};
const hash = (value) => createHash("sha256").update(value).digest("hex");

function parseArgs(args) {
  const [command, ...rest] = args;
  if (!command || !["ingest", "search"].includes(command)) {
    throw new Error("Usage: npm run ingest -- ./pdfs [--limit 3] | npm run search -- \"question\" [--top-k 5]");
  }
  const positional = [];
  const options = {};
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith("--")) options[rest[i].slice(2)] = rest[++i];
    else positional.push(rest[i]);
  }
  return { command, positional, options };
}

async function clients() {
  const openai = new OpenAI({ apiKey: required("OPENAI_API_KEY") });
  const pinecone = new Pinecone({ apiKey: required("PINECONE_API_KEY") });
  const indexName = env("PINECONE_INDEX_NAME", "pdf-chunks-demo");
  const dimension = Number(env("EMBEDDING_DIMENSION", "1536"));
  const existing = await pinecone.listIndexes();
  const names = (existing.indexes ?? []).map((index) => index.name);
  if (!names.includes(indexName)) {
    await pinecone.createIndex({
      name: indexName,
      dimension,
      metric: "cosine",
      spec: { serverless: { cloud: env("PINECONE_CLOUD", "aws"), region: env("PINECONE_REGION", "us-east-1") } },
      waitUntilReady: true
    });
  }
  return { openai, index: pinecone.index(indexName) };
}

function chunkText(text, size, overlap) {
  if (!Number.isInteger(size) || size <= 0 || overlap < 0 || overlap >= size) {
    throw new Error("Require CHUNK_SIZE > 0 and 0 <= CHUNK_OVERLAP < CHUNK_SIZE");
  }
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + size, text.length);
    if (end < text.length) {
      const window = text.slice(start, end);
      const boundary = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf(". "), window.lastIndexOf("? "), window.lastIndexOf("! "));
      if (boundary > size / 2) end = start + boundary + (text.slice(start + boundary, start + boundary + 2) === ". " ? 2 : 1);
    }
    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= text.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return chunks;
}

async function extractPdf(path) {
  const parser = new PDFParse({ data: await readFile(path) });
  try {
    const result = await parser.getText();
    // pdf-parse returns page markers in its combined text; preserve page provenance by splitting them.
    return result.pages.map((page, i) => ({ page: i + 1, text: page.text.trim() })).filter((p) => p.text);
  } finally {
    await parser.destroy();
  }
}

async function embed(openai, texts) {
  const response = await openai.embeddings.create({ model: env("EMBEDDING_MODEL", "text-embedding-3-small"), input: texts });
  return response.data.map((item) => item.embedding);
}

async function listPdfs(folder) {
  const entries = await readdir(folder, { withFileTypes: true });
  const found = await Promise.all(entries.map((entry) => {
    const path = resolve(folder, entry.name);
    return entry.isDirectory() ? listPdfs(path) : Promise.resolve(entry.isFile() && entry.name.toLowerCase().endsWith(".pdf") ? [path] : []);
  }));
  return found.flat().sort();
}

async function ingest(folder, limit) {
  const { openai, index } = await clients();
  const size = Number(env("CHUNK_SIZE", "1200"));
  const overlap = Number(env("CHUNK_OVERLAP", "200"));
  let pdfs = await listPdfs(resolve(folder));
  if (limit) pdfs = pdfs.slice(0, Number(limit));
  if (!pdfs.length) throw new Error(`No PDF files found under ${folder}`);
  let total = 0;
  for (const path of pdfs) {
    const pages = await extractPdf(path);
    const sourcePath = relative(process.cwd(), path).replaceAll("\\", "/");
    const records = pages.flatMap(({ page, text }) => chunkText(text, size, overlap).map((chunk, chunkNumber) => {
      const id = hash(`${sourcePath}|${page}|${chunkNumber}|${hash(chunk)}`);
      return { id, values: [], metadata: { text: chunk, source: basename(path), source_path: sourcePath, page, chunk: chunkNumber } };
    }));
    if (!records.length) { console.log(`Skipping ${basename(path)}: no extractable text (possibly scanned).`); continue; }
    for (let offset = 0; offset < records.length; offset += 64) {
      const batch = records.slice(offset, offset + 64);
      const vectors = await embed(openai, batch.map((record) => record.metadata.text));
      await index.upsert({ vectors: batch.map((record, i) => ({ ...record, values: vectors[i] })) });
    }
    total += records.length;
    console.log(`Indexed ${records.length} chunks from ${basename(path)}`);
  }
  console.log(`Done. Upserted ${total} chunks into Pinecone.`);
}

async function search(question, topK) {
  if (!question?.trim()) throw new Error("Provide a question to search for");
  if (!Number.isInteger(topK) || topK <= 0) throw new Error("--top-k must be a positive integer");
  const { openai, index } = await clients();
  const [vector] = await embed(openai, [question]);
  const result = await index.query({ vector, topK, includeMetadata: true });
  if (!result.matches?.length) { console.log("No matches found."); return; }
  result.matches.forEach((match, i) => {
    const m = match.metadata ?? {};
    console.log(`\n[${i + 1}] score=${match.score?.toFixed(4)} source=${m.source ?? "?"} page=${m.page ?? "?"} chunk=${m.chunk ?? "?"}`);
    console.log(m.text ?? "[text metadata missing]");
  });
}

try {
  const { command, positional, options } = parseArgs(process.argv.slice(2));
  if (command === "ingest") await ingest(positional[0] ?? "./pdfs", options.limit);
  else await search(positional.join(" "), Number(options["top-k"] ?? 5));
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
}
