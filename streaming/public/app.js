const form = document.querySelector('#chat-form');
const promptInput = document.querySelector('#prompt');
const chat = document.querySelector('#chat');
const status = document.querySelector('#status');
const sendButton = document.querySelector('#send');
const stopButton = document.querySelector('#stop');

let activeController;

function addMessage(role, text = '') {
  const message = document.createElement('p');
  message.className = `message ${role}`;
  message.textContent = text;
  chat.append(message);
  return message;
}

function parseEventFrame(frame) {
  let eventName = 'message';
  const dataLines = [];
  for (const line of frame.split('\n')) {
    if (line.startsWith(':')) continue;
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const field = line.slice(0, separator);
    const value = line.slice(separator + 1).replace(/^ /, '');
    if (field === 'event') eventName = value;
    if (field === 'data') dataLines.push(value);
  }
  if (dataLines.length === 0) return null;
  return { event: eventName, data: JSON.parse(dataLines.join('\n')) };
}

async function consumeEventStream(response, assistantMessage) {
  if (!response.body) throw new Error('This browser did not provide a readable response stream.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let streamCompleted = false;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      // Network reads return bytes; keep decoder state for split UTF-8 characters.
      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, '\n');

      // One read may contain multiple events or only part of an event frame.
      let frameEnd = buffer.indexOf('\n\n');
      while (frameEnd >= 0) {
        const frame = buffer.slice(0, frameEnd);
        buffer = buffer.slice(frameEnd + 2);
        const parsed = parseEventFrame(frame);
        if (parsed?.event === 'token') assistantMessage.textContent += parsed.data.text;
        if (parsed?.event === 'done') streamCompleted = true;
        if (parsed?.event === 'error') throw new Error(parsed.data.message);
        frameEnd = buffer.indexOf('\n\n');
      }
    }

    // Flush any buffered UTF-8 bytes, then parse a final event if the stream ended without its delimiter.
    buffer += decoder.decode();
    buffer = buffer.replace(/\r\n/g, '\n');
    if (buffer.trim()) {
      const parsed = parseEventFrame(buffer);
      if (parsed?.event === 'token') assistantMessage.textContent += parsed.data.text;
      if (parsed?.event === 'error') throw new Error(parsed.data.message);
      if (parsed?.event === 'done') streamCompleted = true;
    }
  } finally {
    reader.releaseLock();
  }

  if (!streamCompleted) throw new Error('The connection closed before a completion event arrived.');
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const prompt = promptInput.value.trim();
  if (!prompt || activeController) return;

  addMessage('user', prompt);
  promptInput.value = '';
  const assistantMessage = addMessage('assistant');
  activeController = new AbortController();
  sendButton.disabled = true;
  stopButton.disabled = false;
  status.textContent = 'Waiting for first output…';

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
      signal: activeController.signal
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(errorBody.error || `Request failed with status ${response.status}.`);
    }

    status.textContent = 'Streaming response…';
    await consumeEventStream(response, assistantMessage);
    status.textContent = 'Complete';
  } catch (error) {
    if (error.name === 'AbortError') {
      status.textContent = 'Stopped';
    } else {
      status.textContent = 'The response ended with an error.';
      addMessage('error', error.message);
    }
  } finally {
    activeController = undefined;
    sendButton.disabled = false;
    stopButton.disabled = true;
    promptInput.focus();
  }
});

stopButton.addEventListener('click', () => activeController?.abort());
