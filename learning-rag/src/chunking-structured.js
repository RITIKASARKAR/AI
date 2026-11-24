import { fixedChunks } from './chunking-fixed.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// A small Markdown heading parser; production parsing should use a full format parser.
export function structuredChunks(markdown, { maxCharacters = 300 } = {}) {
  const sections = [];
  let headingPath = [];
  let bodyLines = [];

  function saveSection() {
    const body = bodyLines.join('\n').trim();
    if (body) sections.push({ headingPath: [...headingPath], body });
  }

  for (const line of markdown.split(/\r?\n/)) {
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      saveSection();
      const level = heading[1].length;
      headingPath = headingPath.slice(0, level - 1);
      headingPath[level - 1] = heading[2].trim();
      bodyLines = [];
    } else {
      bodyLines.push(line);
    }
  }
  saveSection();

  return sections.flatMap((section, sectionIndex) => {
    const prefix = section.headingPath.join(' > ');
    const text = `${prefix}\n${section.body}`;
    // Split only sections larger than our bound; retain heading context on each piece.
    return fixedChunks(text, { size: maxCharacters, overlap: 0 }).map((chunk, partIndex) => ({
      id: `section-${sectionIndex + 1}-${partIndex + 1}`,
      headingPath: section.headingPath,
      content: chunk.content
    }));
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sample = '# Billing\n\n## Trial\nThe trial lasts 14 days.\n\n## Export\nExport as Markdown or PDF from Settings.';
  console.log('Structure-aware chunks:');
  console.log(structuredChunks(sample));
}
