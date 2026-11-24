import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const serverPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'server.js');
const client = new Client({ name: 'learning-notes-demo-client', version: '1.0.0' });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverPath]
});

try {
  // Connect starts the child server and performs the MCP connection setup.
  await client.connect(transport);

  const { tools } = await client.listTools();
  console.log('Discovered tools:', tools.map((tool) => tool.name).join(', '));

  const resource = await client.readResource({ uri: 'notes://getting-started' });
  console.log('\nResource content:', resource.contents[0].text);

  const prompt = await client.getPrompt({ name: 'summarize_notes', arguments: { topic: 'security' } });
  console.log('\nPrompt template:', prompt.messages[0].content.text);

  const result = await client.callTool({
    name: 'search_notes',
    arguments: { query: 'MCP', limit: 2 }
  });
  console.log('\nTool result:', result.content.map((item) => item.text).join('\n'));
} finally {
  // Close both ends so the demo child process does not stay running.
  await client.close();
  await transport.close();
}
