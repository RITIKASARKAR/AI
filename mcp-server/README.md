# Build an MCP Server with JavaScript

> Day topic for a 90-day AI agents challenge. Build a small server that makes a notes tool, a resource, and a prompt available to an MCP host.

## What you will build

This lesson creates a local **Notes MCP server** using JavaScript and Node.js. It exposes:

- A **tool** named `search_notes` that searches a tiny in-memory collection.
- A **resource** at `notes://getting-started` that provides a fixed note.
- A **prompt** named `summarize_notes` that gives a host a reusable prompt template.
- A small **client** that starts the server over standard input/output (stdio), lists its capabilities, reads the resource, gets the prompt, and calls the tool.

The model is not inside the MCP server. An MCP **host** owns the model and conversation. The host's MCP client discovers what servers provide and passes tool results or context to the model when appropriate. This separation is a central idea to understand.

## Learning objectives

After this lesson, you should be able to explain MCP's host/client/server architecture, identify tools/resources/prompts, describe JSON-RPC and transports at a high level, start a JavaScript MCP server, connect a client over stdio, and apply basic operational and security practices.

## 1. What is MCP?

The **Model Context Protocol (MCP)** is an open protocol for connecting AI applications to tools and context. It defines a common way for an AI application to discover and interact with servers that expose capabilities. It is a protocol, not an LLM, agent framework, or database.

Without a shared protocol, each AI application can need a custom integration for every data source or tool. MCP gives hosts and servers a common interaction model. A server can then be reused by compatible hosts, subject to each host's configuration and permission controls.

## 2. The three roles

```text
Host (AI application, UI, model orchestration)
└── MCP client (protocol connection for one server)
    └── MCP server (exposes tools, resources, prompts)
        └── APIs, files, databases, or other services
```

- **Host:** The application the user interacts with. It manages the model, user experience, and which servers are configured.
- **MCP client:** A component inside a host that speaks the protocol to one MCP server. A host may create multiple clients for multiple servers.
- **MCP server:** A program that exposes a focused set of capabilities to a client. It can wrap local files, a company API, or another system.

The server does not normally decide what the model should do next. It describes capabilities and handles protocol requests. The host and model decide when a capability is useful, and the host controls whether it is allowed to run.

## 3. Three server capabilities

| Capability | Direction and purpose | Example in this project |
| --- | --- | --- |
| **Tool** | A callable operation, usually chosen by the model through the host. | Search notes for a phrase. |
| **Resource** | Addressable context the client can read, like a file or record. | Read `notes://getting-started`. |
| **Prompt** | A reusable prompt template that a client or user can request. | Get a template for summarizing notes. |

Think of the distinction this way: a tool **does** something, a resource **is** something to read, and a prompt **guides** a model interaction. Hosts may surface or use these capabilities differently.

## 4. How a connection works

MCP messages use JSON-RPC concepts such as requests, responses, and notifications. During connection setup, the client and server establish protocol details and capabilities. The client can then list tools and invoke one, list or read resources, and retrieve prompts. The server returns structured protocol results; the host decides how to present them or provide them to a model.

With **stdio**, a host launches the server as a child process. The client sends protocol messages through the server's standard input and reads responses from standard output. This is convenient for a local tool. Standard output belongs to the protocol stream, so use standard error for logs. A stray `console.log()` can break the connection.

With **Streamable HTTP**, a server can be reached as a network service. This is useful for remote or shared deployments, but it introduces network security requirements such as authentication, authorization, secure transport, and careful origin/host validation. This beginner project uses stdio.

```text
Host starts server process
      │ stdin/stdout (stdio transport)
      ▼
MCP client <── JSON-RPC requests/results ──> MCP server
                                               ├─ tool
                                               ├─ resource
                                               └─ prompt
```

## 5. Setup

Requirements: Node.js 20 or newer for the current official JavaScript SDK guide. Install dependencies from the project directory:

```bash
cd mcp-server
npm install
```

The project uses ECMAScript modules (`"type": "module"`) and the official `@modelcontextprotocol/server` package with Zod schemas.

## 6. Run and explore

Run the self-contained client. It launches the server process and exercises each capability through MCP:

```bash
npm run demo
```

To run the server directly, it waits for an MCP client on stdin/stdout; it does not behave like a web page or print a welcome message to stdout:

```bash
npm start
```

To explore interactively with the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector node src/server.js
```

In the Inspector, connect, open the Tools tab to call `search_notes`, inspect the Resources tab to read the example note, and inspect Prompts to retrieve the summarization template. The Inspector is an optional development tool; it is not needed by the project client.

## 7. Understand the code

### `src/server.js`

1. `createServer()` constructs a server and registers each capability.
2. `registerTool()` gives `search_notes` a description, a Zod input schema, and an async handler. The schema validates `query` and optional `limit` before the handler uses them.
3. `registerResource()` publishes a fixed URI and returns text content with a MIME type.
4. `registerPrompt()` provides a named prompt with a required `topic` argument.
5. `serveStdio(createServer)` runs the server over stdio. The SDK handles protocol framing and lifecycle; handlers focus on application behavior.

### `src/client.js`

The client creates a `Client` and a `StdioClientTransport`. The transport launches `node src/server.js` as a child process. It then lists tools, reads a resource, retrieves a prompt, calls the search tool, prints the returned content, and closes the connection in a `finally` block.

This is useful for learning: you see both sides of MCP instead of only a server that waits silently for a host.

## 8. Code tour: server

```js
server.registerTool(
  'search_notes',
  {
    description: 'Search the example notes by text.',
    inputSchema: z.object({
      query: z.string().min(1).max(100),
      limit: z.number().int().min(1).max(5).optional()
    })
  },
  async ({ query, limit = 3 }) => ({
    content: [{ type: 'text', text: searchNotes(query, limit) }]
  })
);
```

The name and description help a host/model understand when the capability might be relevant. The schema defines valid input shape and bounds. The handler performs the actual operation. A description is not an authorization rule: sensitive operations still need server-side authorization and validation.

## 9. Code tour: client

```js
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverPath]
});

await client.connect(transport);
const { tools } = await client.listTools();
const result = await client.callTool({
  name: 'search_notes',
  arguments: { query: 'MCP', limit: 2 }
});
```

The client does not directly import or call the server's JavaScript function. It uses the protocol to discover and call the capability. This is what makes the integration interoperable.

## 10. Errors and safe tool design

Tool handlers should validate inputs, return clear results, and handle expected failures. Do not expose stack traces, credentials, or internal system details to a model. Use narrow tools with limited scope. Avoid a generic tool such as `run_any_command` or `execute_sql` unless the full security model explicitly supports it.

MCP makes capabilities discoverable; it does not automatically make them safe. Treat tool input as untrusted, enforce the caller's permissions in the server or host, require approval for consequential actions where appropriate, and consider the impact of data returned to the model. Keep secrets out of tool descriptions and results.

For stdio servers, write diagnostics to `console.error`, not stdout. For remote HTTP servers, add authentication and authorization, use secure transport, validate hosts/origins according to the SDK/framework guidance, and avoid exposing a development server directly to the public internet.

## 11. Common misunderstandings

- **“MCP is an AI model.”** It is a protocol for connecting applications and capabilities.
- **“An MCP server must be remote.”** A stdio server can run locally as a child process.
- **“The server is the agent.”** The host typically owns the model orchestration; the server exposes capabilities.
- **“A tool description grants permission.”** It tells the host what a tool does. Authorization is a separate control.
- **“Every capability is a tool.”** MCP distinguishes tools, resources, and prompts.
- **“The LLM directly executes the server function.”** A host/client sends a protocol call; the server handles it.
- **“If the process starts, the server works.”** A meaningful check is whether a client can initialize, discover capabilities, and successfully invoke them.

## 12. Extend the project

1. Add a `create_note` tool with title and body validation.
2. Add a resource template for reading a note by ID.
3. Return structured content in addition to the readable text result.
4. Replace in-memory notes with a local JSON file, then consider file access boundaries.
5. Add a tool error for a missing note and decide what details are safe to return.
6. Configure the server in a compatible MCP host using the command `node` and the absolute path to `src/server.js`.
7. Add an authenticated remote HTTP transport only after studying its threat model and official security guidance.

## Production checklist

- Use narrow, well-described capabilities and bounded input schemas.
- Validate authorization and business rules in the server for every sensitive operation.
- Return only the information the current user/session is allowed to access.
- Keep credentials out of prompts, source control, logs, and tool results.
- Log diagnostics to stderr for stdio; keep stdout reserved for protocol messages.
- For network transports, configure authentication, authorization, TLS, and origin/host validation.
- Pin and update dependencies using your team's dependency-management practice.
- Test with the actual host/client combinations you intend to support.

## Key takeaway

MCP standardizes how an AI host discovers and uses capabilities exposed by servers. Tools, resources, and prompts are different kinds of capability. The protocol handles communication; your server still owns the quality, boundaries, and security of its implementation.

## Official references

- [MCP TypeScript SDK documentation](https://github.com/modelcontextprotocol/typescript-sdk/tree/main/docs)
- [Build your first MCP server](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/get-started/first-server.md)
- [Serve over stdio](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/serving/stdio.md)
- [MCP specification](https://modelcontextprotocol.io/specification/2025-11-25)
