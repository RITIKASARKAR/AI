import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';

const notes = [
  { title: 'MCP basics', body: 'MCP connects AI applications to tools and context through a shared protocol.' },
  { title: 'Server capabilities', body: 'An MCP server can expose tools, resources, and prompt templates.' },
  { title: 'Stdio transport', body: 'A local host can start an MCP server process and communicate over stdin and stdout.' },
  { title: 'Security reminder', body: 'Validate tool arguments and enforce permissions in trusted application code.' }
];

function searchNotes(query, limit) {
  const normalizedQuery = query.toLowerCase();
  const matches = notes
    .filter((note) => `${note.title} ${note.body}`.toLowerCase().includes(normalizedQuery))
    .slice(0, limit);

  if (matches.length === 0) {
    return `No notes matched "${query}".`;
  }

  return matches.map((note) => `## ${note.title}\n${note.body}`).join('\n\n');
}

function createServer() {
  const server = new McpServer({ name: 'learning-notes', version: '1.0.0' });

  // A tool performs an operation. The schema places simple bounds on caller input.
  server.registerTool(
    'search_notes',
    {
      title: 'Search learning notes',
      description: 'Search the example learning notes by a word or phrase.',
      inputSchema: z.object({
        query: z.string().min(1).max(100),
        limit: z.number().int().min(1).max(5).optional()
      })
    },
    async ({ query, limit = 3 }) => ({
      content: [{ type: 'text', text: searchNotes(query, limit) }]
    })
  );

  // A resource exposes addressable context that a client can read.
  server.registerResource(
    'getting-started',
    'notes://getting-started',
    {
      title: 'Getting started note',
      description: 'A short introduction to the example notes collection.',
      mimeType: 'text/plain'
    },
    async (uri) => ({
      contents: [{
        uri: uri.href,
        mimeType: 'text/plain',
        text: 'Welcome. Use search_notes to find notes about MCP, transports, and safe tool design.'
      }]
    })
  );

  // A prompt is a reusable template. The host decides how to present or use it.
  server.registerPrompt(
    'summarize_notes',
    {
      title: 'Summarize notes',
      description: 'Create a reusable prompt for summarizing a topic in the notes.',
      argsSchema: { topic: z.string().min(1).max(80) }
    },
    ({ topic }) => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `Find the notes about "${topic}" and summarize the key ideas. If the notes do not contain the answer, say so.`
        }
      }]
    })
  );

  return server;
}

// stdio uses stdout for protocol messages, so any diagnostic goes to stderr.
serveStdio(createServer);
