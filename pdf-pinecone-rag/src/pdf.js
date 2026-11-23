import { readFile } from 'node:fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export async function extractPdfPages(filePath) {
  const bytes = new Uint8Array(await readFile(filePath));
  const task = getDocument({ data: bytes });
  const pdf = await task.promise;
  const pages = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items.map(item => 'str' in item ? item.str : '').join(' ').replace(/\s+/g, ' ').trim();
      if (text) pages.push({ pageNumber, text });
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  return pages;
}

export function chunkPages(pages, maxWords, overlapWords) {
  const chunks = [];
  for (const page of pages) {
    const words = page.text.split(/\s+/).filter(Boolean);
    const step = maxWords - overlapWords;
    for (let start = 0; start < words.length; start += step) {
      const text = words.slice(start, start + maxWords).join(' ');
      if (text) chunks.push({ pageNumber: page.pageNumber, text });
    }
  }
  return chunks;
}
