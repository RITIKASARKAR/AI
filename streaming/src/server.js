import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 3000);

async function readRequestJson(request, maximumBytes = 4000) {
  const pieces = [];
  let totalBytes = 0;
  for await (const piece of request) {
    totalBytes += piece.length;
    if (totalBytes > maximumBytes) throw new Error('Request body is too large.');
    pieces.push(piece);
  }
  return JSON.parse(Buffer.concat(pieces).toString('utf8'));
}

// A slow async generator stands in for deltas from an actual model provider.
async function* mockModelStream(prompt, signal) {
  const answer = `You asked: ${prompt}. This response arrives piece by piece, so the browser can show progress before generation is complete.`;
  const pieces = answer.match(/\S+\s*/g) ?? [];

  for (const piece of pieces) {
    if (signal.aborted) return;
    await new Promise((resolve) => setTimeout(resolve, 90));
    yield piece;
  }
}

function sendEvent(response, eventName, data) {
  response.write(`event: ${eventName}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function serveStatic(response, fileName, contentType) {
  const body = await readFile(path.join(projectDirectory, 'public', fileName));
  response.writeHead(200, { 'Content-Type': contentType, 'Content-Length': body.length });
  response.end(body);
}

async function handleChat(request, response) {
  let prompt;
  try {
    const payload = await readRequestJson(request);
    prompt = typeof payload.prompt === 'string' ? payload.prompt.trim() : '';
    if (!prompt || prompt.length > 1000) throw new Error('Prompt must contain 1 to 1000 characters.');
  } catch (error) {
    response.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: error.message }));
    return;
  }

  response.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  response.flushHeaders();

  const abortController = new AbortController();
  response.on('close', () => {
    if (!response.writableEnded) abortController.abort();
  });

  try {
    for await (const text of mockModelStream(prompt, abortController.signal)) {
      if (abortController.signal.aborted || response.destroyed) return;
      sendEvent(response, 'token', { text });
      if (response.writableNeedDrain) await once(response, 'drain');
    }
    if (!response.destroyed) {
      sendEvent(response, 'done', {});
      response.end();
    }
  } catch (error) {
    console.error('Streaming failed:', error.message);
    if (!response.destroyed) {
      sendEvent(response, 'error', { message: 'The response stream ended unexpectedly.' });
      response.end();
    }
  }
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === 'GET' && request.url === '/') {
      await serveStatic(response, 'index.html', 'text/html; charset=utf-8');
    } else if (request.method === 'GET' && request.url === '/app.js') {
      await serveStatic(response, 'app.js', 'text/javascript; charset=utf-8');
    } else if (request.method === 'POST' && request.url === '/api/chat') {
      await handleChat(request, response);
    } else {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
    }
  } catch (error) {
    console.error('Request failed:', error.message);
    if (!response.headersSent) response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    if (!response.destroyed) response.end('Server error');
  }
});

server.listen(port, () => {
  console.log(`Streaming demo listening at http://localhost:${port}`);
});
