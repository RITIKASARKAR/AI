# Streaming AI output with Server-Sent Events (SSE)

## The idea

An ordinary HTTP request usually feels like: send a request, wait, receive one complete response. With streaming, the server sends a response progressively. For generated text, this lets an interface display partial output while generation is still happening. The model may produce tokens, but the application usually receives text deltas or structured events; a token is a model-internal unit and does not always equal a word.

Server-Sent Events is a browser-friendly convention for one-way messages from a server to a client over a long-lived HTTP response. The client opens a connection; the server writes events as UTF-8 text; the connection remains open until completion or failure. SSE is server-to-client only. A separate request (or another transport) carries user input and cancellation.

## Wire format to remember

The response has `Content-Type: text/event-stream`. Events are text records separated by a blank line. Fields can include:

```text
event: message
id: 17
retry: 3000
data: {"delta":"Hello"}

```

`data:` may appear more than once in one event; the lines are joined with newline characters. A line beginning with `:` is a comment and is often used as a keep-alive heartbeat. `event:` names an event type, `id:` provides a last-event identifier for reconnection, and `retry:` suggests a reconnection delay in milliseconds. A stream can end with a final event, a sentinel such as `[DONE]` (API-specific), or simply a closed connection. Do not assume every provider uses the same event names or payload shape.

## Browser client

The native `EventSource` API is convenient for a GET endpoint that does not need custom authorization headers or a request body:

```js
const source = new EventSource("/api/stream");
source.onmessage = (event) => {
  const payload = JSON.parse(event.data);
  appendText(payload.delta);
};
source.addEventListener("done", () => source.close());
source.onerror = () => {
  // EventSource may reconnect automatically. Decide whether to show status,
  // keep waiting, or close based on your app's protocol.
};
```

For POST requests, custom headers, or explicit abort control, use `fetch()` and parse the byte stream. Network chunks are arbitrary: one event may be split across several reads, and one read may contain several events. Buffer decoded text until the blank-line event boundary; do not treat each `reader.read()` result as one event. Handle `\r\n` and `\n`, UTF-8 characters split between byte chunks (use a streaming decoder), malformed payloads, cancellation, and end-of-stream.

## AI output event pattern

A robust app-level protocol can define explicit event types such as `start`, `delta`, `usage`, `error`, and `done`. Include a request or response identifier, and specify whether `delta` is append-only text or a structured patch. Keep the protocol stable even if the upstream model provider changes.

Typical lifecycle:

1. Client sends the prompt in an HTTP request.
2. Server authenticates, validates, and starts generation.
3. Server forwards each generated delta as an SSE event.
4. Client appends deltas in order and exposes a stop action.
5. On finish, server sends terminal metadata and closes the response.
6. On error, server sends a safe, structured error when possible, then closes.

The server should propagate client disconnects to the model request so generation and billing stop when possible. Apply timeouts, output limits, per-user rate limits, and backpressure. Do not expose secrets or raw provider error details in events.

## Headers and infrastructure

Common response headers include `Content-Type: text/event-stream; charset=utf-8`, `Cache-Control: no-cache`, and, in some proxy deployments, `X-Accel-Buffering: no`. The server must flush output; reverse proxies, CDNs, compression, or serverless platforms may buffer it. Test through the actual deployment route, not just localhost. Heartbeats can keep idle connections alive, but must be comments or valid events and should fit the infrastructure's idle timeout.

SSE typically uses HTTP GET with EventSource, but fetch-based clients can stream POST responses. HTTP/2 can multiplex streams; SSE itself does not define application-level multiplexing beyond named events and IDs. Browsers impose connection limits in some configurations. For bidirectional, high-frequency interaction, WebSockets or another protocol may be a better fit.

## Reconnection and ordering

Native EventSource reconnects after many connection losses. If the server sends `id:`, the browser can send `Last-Event-ID` when reconnecting. Replay is only correct if the server retains events and defines what an ID means. Without replay, reconnecting may duplicate, skip, or restart generation. Decide explicitly whether to resume, restart, or report interruption. A generation stream is often not safely resumable unless the application stores generated output and a stable sequence cursor.

## Common bugs checklist

- UI appears only at the end: a proxy or server buffers, or the client does not flush/render deltas.
- Broken JSON: code parsed a partial event before its blank-line delimiter.
- Garbled non-English characters: UTF-8 bytes were decoded independently per read.
- Duplicate text after reconnect: event replay is not deduplicated by ID.
- UI hangs forever: no terminal event, timeout, disconnect handling, or reader cleanup.
- Stop button only hides output: cancellation was not propagated upstream.
- Works locally, fails in production: proxy buffering, idle timeout, or compression behavior differs.

## When SSE is a good choice

Use SSE for a simple one-way progress or text stream that fits HTTP and benefits from automatic reconnect behavior. Choose another mechanism when the client and server need continuous bidirectional messaging or when the deployment cannot maintain streaming HTTP responses reliably.

## Mental model

**SSE is a framed text protocol carried by a long-lived HTTP response.** HTTP chunks are transport fragments; SSE events are application records; model tokens/deltas are payload content. Keep those three layers separate.

## Further reading

- [WHATWG HTML: Server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html)
- [MDN: Using server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)
