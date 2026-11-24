# AI Streaming: From Model Output to a Live Chat UI

> Day topic for a 90-day AI agents challenge. This lesson follows streaming through the complete path: incremental generation, provider/backend delivery, HTTP events, browser byte decoding, and one progressively updated assistant message.

## What you will build

A small dependency-free Node.js chat demo. The backend simulates an AI provider that yields output pieces over time, then forwards those pieces to a browser as Server-Sent Events (SSE). The browser reads the response body incrementally, decodes bytes as UTF-8 text, parses event frames, and appends text to **one** assistant bubble. A cancel button aborts the request.

The generator is simulated so the project runs without an API key. It has a clearly defined async-generator interface where a real LLM provider stream can be connected. The simulated chunks are not actual model tokens.

## Learning objectives

- Explain token generation versus provider chunks versus network chunks.
- Distinguish streaming generation from streaming delivery.
- Understand time to first token/output and total response time.
- Keep streaming intact across the whole model → backend → browser pipeline.
- Implement a Node HTTP SSE endpoint and a browser Fetch `ReadableStream` client.
- Decode UTF-8 incrementally and parse events that may arrive split across reads.
- Handle errors, completion, cancellation, buffering, and backpressure.

## 1. How an LLM generates text

Most text generation is autoregressive: after processing the prompt, the model predicts a next token, adds it to the sequence, and repeats. The internal generation is incremental even when an API waits and returns only a completed answer.

Conceptually:

```text
Prompt → process input → predict next token → predict next token → ...
```

Generation and delivery are different. The model may generate incrementally while the application buffers everything and returns only the final string. In that case, generation is incremental but the user experience is not streaming.

## 2. What streaming changes

Without streaming, the request path looks like:

```text
Browser sends request → backend waits for complete model answer → complete response arrives
```

With streaming, the backend forwards available output as it arrives:

```text
Model/provider → backend → HTTP body → browser stream reader → UI append
```

Streaming does not necessarily reduce total generation time. It can reduce perceived waiting by showing useful output earlier.

Two useful latency measures:

- **Time to first token/output (TTFT):** elapsed time from request start until the first visible output arrives. Be clear whether measurement starts at user submit, provider request, or first provider event.
- **Time to completion:** elapsed time until the final event and stream closure.

Also measure inter-chunk gaps, error rate, cancellation rate, and total tokens/bytes. A low TTFT with long pauses may still feel poor.

## 3. A chunk is not necessarily a token

Keep these separate:

```text
LLM token ≠ provider delta ≠ HTTP/network chunk ≠ reader.read() result
```

The model may generate several tokens. A provider SDK may group them into a delta. HTTP buffering, TLS, proxies, the operating system, and browser scheduling can regroup those bytes again. `reader.read()` returns whatever bytes are available, not a semantic word or a guaranteed provider event.

The UI should append text pieces without relying on their boundaries. Structured protocols such as SSE require a parser that can retain an incomplete frame between reads.

## 4. End-to-end architecture

```text
User submits prompt
        ↓ POST /api/chat
Node backend calls a streaming model/provider
        ↓ provider deltas
Backend encodes app-level SSE events
        ↓ HTTP response body: text/event-stream
Browser fetch() receives response headers
        ↓ response.body: ReadableStream<Uint8Array>
TextDecoder converts UTF-8 bytes to text incrementally
        ↓ SSE parser extracts complete event frames
UI appends token text into one assistant message
```

**The whole pipeline must preserve streaming.** If any layer collects all pieces into a string before forwarding, streaming stops at that layer. A server that streams correctly cannot compensate for a browser that calls `await response.text()` before updating the UI.

## 5. HTTP streaming, SSE, and WebSockets

Streaming can happen in an ordinary HTTP response: the server starts the response and progressively writes to the body. HTTP has not been replaced; the response body simply arrives over time.

### Server-Sent Events (SSE)

SSE is a text event format typically served as `text/event-stream`. Each event contains fields such as `event:` and `data:` and ends with a blank line. It is one-way from server to client on a connection. It works well for server → browser progress or generated output.

This example uses `fetch()` plus an SSE parser because the chat request is a POST with a JSON body and a cancel signal. Native `EventSource` is convenient for simple GET streams but does not expose the same general POST request setup.

### WebSockets

WebSockets provide a persistent bidirectional channel. They are useful when both client and server need to send frequent messages, such as collaborative interaction or live control. A standard “send one prompt, receive a stream of answer events” flow often works with HTTP streaming/SSE without a WebSocket.

| Need | Typical starting choice |
| --- | --- |
| One request, progressive response | HTTP streaming; SSE is a common event format. |
| Server pushes events to a browser | SSE. |
| Continuous messages in both directions | WebSocket. |

The right transport depends on reconnect behavior, authentication, proxy support, load balancing, and product interaction needs.

## 6. Run the demo

Requirements: Node.js 18 or newer. There are no npm dependencies or API credentials.

```bash
cd ai-streaming
npm start
```

Open `http://localhost:3000`, enter a prompt, and observe the response appear progressively. Click **Stop** while it is generating to abort the fetch request. The mock response uses short delays so the streaming behavior is visible.

The terminal shows backend startup and errors. The server streams event data rather than returning a complete JSON response.

## 7. Code walkthrough

### `src/server.js`

1. Uses Node's built-in `http` module and serves the two fixed frontend files.
2. Accepts `POST /api/chat`, validates JSON, and limits request body size.
3. Sends `Content-Type: text/event-stream`, no-cache headers, and starts the response.
4. `mockModelStream()` is an async generator that yields simulated text deltas over time.
5. `writeSseEvent()` encodes each delta as a named SSE `token` event with JSON in `data:`.
6. A final `done` event marks normal completion. If generation fails, an `error` event carries a safe message.
7. It notices a disconnected client and stops mock generation. `response.write()` backpressure is handled by waiting for `drain` when the writable buffer is full.

### `public/app.js`

1. Sends a POST using `fetch()` with an `AbortController` signal.
2. Checks the HTTP status before consuming the body.
3. Reads `response.body` using a reader. Each `value` is bytes (`Uint8Array`), not necessarily a complete character or event.
4. Uses one persistent `TextDecoder` with `{ stream: true }` so a multi-byte UTF-8 character split across reads can be decoded correctly.
5. Keeps an `incompleteFrame` buffer and parses only after the SSE blank-line delimiter arrives.
6. Creates one assistant bubble on the first token and appends later token events to it with `textContent`.
7. Handles `done`, `error`, network failure, and user cancellation, then releases the reader lock.

`public/index.html` contains the minimal interface. The demo renders model output as text, not HTML, to avoid interpreting generated content as markup.

## 8. SSE frame example

The server sends event frames like:

```text
event: token
data: {"text":"Streaming "}

event: token
data: {"text":"works."}

event: done
data: {}

```

The blank line ends each event. A browser read may contain part of one frame, several frames, or the end of one plus the beginning of another. That is why the client retains a buffer and extracts complete frames in a loop.

## 9. Browser stream fundamentals

After `await fetch(...)`, the response headers are available; the body may still be arriving. `response.text()` consumes the body and resolves only after the complete text is read. For a live UI, access `response.body` and read incrementally.

```js
const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  // Parse only complete SSE frames; keep a trailing partial frame in buffer.
}

buffer += decoder.decode();
```

`stream: true` tells the decoder to retain any incomplete UTF-8 sequence for the next read. The final no-argument `decode()` flushes remaining decoder state. Never assume one byte chunk ends at a character boundary.

## 10. Backend streaming and backpressure

Node's `response.write(data)` writes a piece to the HTTP response. If it returns `false`, data is buffered because the writable side is applying backpressure. Wait for the `drain` event before writing more. This prevents a fast producer from continually filling memory when a client is slow.

The sample waits for `drain`. Production code should also handle disconnects, provider cancellation, maximum generation duration, and cleanup. A provider stream should be closed when the browser aborts, when a timeout fires, or when the server shuts down.

Some reverse proxies, serverless platforms, CDNs, and compression middleware buffer responses. A streaming app may appear non-streaming in production even when local code is correct. Check each layer, disable buffering where appropriate, and test through the real deployment path.

## 11. Connecting a real model provider

Replace `mockModelStream(prompt, { signal })` with an adapter that:

1. Calls your provider's streaming API.
2. Iterates its stream events/deltas.
3. Yields only text fragments (and separately handles tool calls, usage, refusal, and finish reason if needed).
4. Passes the `AbortSignal` through so browser cancellation stops upstream work.
5. Converts provider exceptions into safe server-side logs and client-safe error events.

Keep provider event parsing separate from the HTTP/SSE layer. Different providers expose different event schemas, and not every event is user-visible text. Avoid forwarding raw provider events, internal reasoning, credentials, or tool arguments directly to the browser.

## 12. Streaming tool calls and structured output

Some model streams contain more than text: tool-call name/argument deltas, refusal signals, usage, and completion metadata. Tool arguments may arrive piece by piece and may not form valid JSON until the end. Do not execute a tool from partial arguments. Buffer and parse the complete call, validate its schema and authorization, then execute it through the agent harness. Stream user-visible status events such as “Searching…” separately if appropriate.

Structured output may be incomplete until the final event. The UI should distinguish partial display from a validated final object. For JSON, do not treat each partial fragment as a valid document.

## 13. Error handling and cancellation

Possible failures include invalid input, an upstream provider error, client disconnect, timeout, a proxy closing an idle connection, a browser decode/parse failure, or a server exception after headers were already sent.

Before response headers are sent, the server can return a normal HTTP error status. After a streaming response starts, it generally cannot change the status code; it can send an application-level `error` event and close the stream. The client should keep already received text if useful, show an error state, and always re-enable its controls.

`AbortController` lets the browser cancel the fetch. The server observes the disconnected response and stops the generation loop. In a real provider adapter, cancellation should propagate upstream; otherwise the browser stops waiting while the provider continues generating and consuming resources.

## 14. Security and product considerations

- Authenticate and authorize the POST request like any other endpoint.
- Validate prompt size and apply rate limits and concurrency limits.
- Do not expose provider keys or internal errors in event data.
- Render generated content safely; use `textContent` or a sanitizer before allowing rich Markdown/HTML.
- Avoid logging full prompts/answers by default when they may contain personal or confidential data.
- Set a maximum duration and maximum output size.
- Handle moderation, refusal, and tool authorization as separate application concerns.
- Consider that streamed text may be displayed before the final answer is complete or checked. If output needs a final safety check, either buffer it or clearly design a reversible/interruptible display policy.
- Avoid auto-scrolling if the user has intentionally scrolled away from the end in a long conversation.

## 15. Measuring and debugging streaming

Instrument timestamps for:

- User submit / request received.
- Upstream provider request start.
- First provider delta.
- First byte written to HTTP.
- First browser chunk / first visible text (TTFT).
- Last provider delta and stream completion.
- Cancellation and error.

This separates provider delay from backend buffering, proxy buffering, and frontend parsing/rendering. A first provider token is not necessarily the first visible browser output. Diagnose the whole path before changing model settings.

## 16. Common mistakes

- Calling `await response.text()` and expecting a live UI.
- Assuming one browser read equals one model token or SSE event.
- Decoding each chunk with a fresh `TextDecoder`, which can corrupt split multi-byte characters.
- Forgetting to retain incomplete SSE frames across reads.
- Creating a new chat bubble for every chunk instead of appending to one.
- Sending debug `console.log` output into a raw streaming protocol.
- Failing to flush the last decoder bytes or handle the final frame.
- Forgetting abort/error cleanup and leaving the send button disabled.
- Buffering at the backend/proxy and wondering why the browser sees one final result.
- Forwarding raw provider payloads or executing partial tool arguments.

## 17. Exercises

1. Increase the mock delay and compare first-output latency with completion time.
2. Change the mock generator so one yielded fragment contains multiple words. Confirm the browser still renders correctly.
3. Add a Unicode emoji and accented characters to a response. Confirm the decoder handles them.
4. Split one SSE frame across multiple writes and confirm the parser waits for the blank-line delimiter.
5. Add a `status` event and show “Thinking…” before the first token.
6. Add a provider adapter that yields text deltas and supports an abort signal.
7. Record TTFT and total duration in the browser and server.
8. Try the app through a reverse proxy and verify it does not buffer the response.

## Key takeaway

Streaming is an end-to-end delivery property. The model generates incrementally, but the provider, backend, HTTP response, browser decoder, event parser, and UI must all pass data along progressively. Chunks are transport pieces, not guaranteed tokens; parse protocol boundaries explicitly and append them to one message.

## Further reading

- [MDN: Streaming responses with Fetch](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch#streaming_the_response_body)
- [MDN: Using Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)
- [MDN: Using readable streams](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API/Using_readable_streams)
- [Node.js HTTP API: `response.write()` and backpressure](https://nodejs.org/api/http.html#responsewritechunk-encoding-callback)
