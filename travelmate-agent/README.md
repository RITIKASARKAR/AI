# TravelMate — AI Travel Planning Agent

TravelMate is a small but portfolio-worthy **Agentic AI** project built with Node.js, Express, and the OpenAI API.

Instead of only generating a travel answer, TravelMate can decide when to use tools, execute them through the application, inspect their results, and then continue reasoning.

## What it can do

- Understand natural-language travel requests.
- Check a destination's near-term weather forecast using the Open-Meteo API.
- Split a traveler's stated budget into useful categories.
- Generate a day-by-day itinerary framework based on trip duration, interests, and pace.
- Use more than one tool for a single request.
- Show a small chat interface in the browser.

### Example requests

- "Plan a 4-day Jaipur trip for two people. We like history and local food."
- "Check the weather in Goa and suggest what kind of activities I should plan."
- "I have ₹30,000 for 5 days. Help me split the budget."
- "Create a relaxed 3-day itinerary for Singapore focused on food and gardens."

## Tech stack

- Node.js (ES modules)
- Express.js
- OpenAI API with function/tool calling
- Open-Meteo Geocoding API
- Open-Meteo Forecast API
- HTML, CSS, and vanilla JavaScript

## Project structure

```text
travelmate-agent/
├── agent/
│   └── travelAgent.js       # LLM decision loop and tool execution orchestration
├── tools/
│   └── travelTools.js       # Weather, budget, and itinerary tools
├── public/
│   ├── index.html           # Chat UI
│   ├── style.css
│   └── app.js
├── .env.example
├── .gitignore
├── package.json
├── server.js                # Express API
└── README.md
```

## Setup

### 1. Install Node.js

Use Node.js 18 or later. The project uses the built-in `fetch` API.

### 2. Install dependencies

```bash
npm install
```

### 3. Add your API key

Copy `.env.example` to `.env`:

```bash
# Windows PowerShell
Copy-Item .env.example .env

# macOS / Linux
cp .env.example .env
```

Open `.env` and add your OpenAI API key:

```env
OPENAI_API_KEY=your_real_api_key
OPENAI_MODEL=gpt-4o-mini
PORT=3000
```

Never commit `.env` or expose your API key in frontend JavaScript.

### 4. Start the project

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

For normal start:

```bash
npm start
```

## How the agent works

The architecture follows the core agent model:

```text
User goal
   ↓
Node.js application
   ↓
LLM decides what is needed
   ↓
Tool call (weather / budget / itinerary)
   ↓
Node.js executes the tool
   ↓
Tool result is returned to the LLM
   ↓
LLM observes the result and decides again
   ↓
Final travel response
```

### The agent loop

The main loop is in `agent/travelAgent.js`.

1. The user's request and conversation history are sent to the model.
2. The model may return one or more structured tool calls.
3. The Node.js application executes each requested tool.
4. Tool results are appended to the conversation.
5. The model is called again and can decide to use another tool or provide its final answer.
6. A maximum of six model turns prevents an endless loop.

### Available tools

| Tool | What it does | Type |
|---|---|---|
| `get_weather` | Geocodes a city and retrieves a near-term forecast | Information |
| `calculate_budget` | Allocates the user's total budget across categories | Calculation |
| `create_itinerary` | Creates a day-by-day schedule framework | Planning |

The model does not directly call external APIs. It requests a tool using a structured contract; the Node.js application validates and executes that request.

## Important limitations

- Weather is a near-term forecast, limited by the Open-Meteo forecast API. It is not a reliable forecast for dates months away.
- Budget allocation uses the amount supplied by the user. It does not fetch current flight, hotel, or ticket prices.
- The itinerary tool creates a schedule framework. The model fills it with suggestions, which should be verified before travel.
- This version does not book flights, hotels, activities, or restaurant reservations.
- The project requires an OpenAI API key. Open-Meteo weather endpoints do not require a key.

## API

### `GET /api/health`

Returns service status.

### `POST /api/plan`

Request:

```json
{
  "message": "Plan a 3-day trip to Jaipur for two people with a budget of 25000 INR.",
  "history": []
}
```

Response:

```json
{
  "reply": "Your travel plan...",
  "toolTrace": [
    {
      "tool": "calculate_budget",
      "input": {
        "totalBudget": 25000,
        "currency": "INR",
        "travelers": 2,
        "days": 3
      },
      "output": {}
    }
  ]
}
```

`toolTrace` is useful while learning: it lets you inspect which tools the model selected and what each tool returned.

## Security notes

- Keep API keys on the server in environment variables.
- Do not expose unrestricted shell, filesystem, or payment tools to the model.
- Validate tool inputs before executing them.
- Add rate limiting and authentication before deploying publicly.
- Treat bookings and payments as high-impact actions. A real booking feature should pause for explicit human approval before executing anything.

## Ideas to improve the project

1. Add a destination comparison tool with transparent scoring criteria.
2. Add a currency conversion tool using a trusted exchange-rate API.
3. Add user accounts and save trip plans in MongoDB.
4. Add a map view for itinerary stops.
5. Add a human-approval flow before connecting any booking provider.
6. Add tests for each tool and for the agent's maximum-turn behaviour.

## Learning outcomes

By building TravelMate, you practice:
- Tool/function calling
- Agent loops and observations
- Separating LLM reasoning from deterministic application logic
- Integrating external APIs
- Input validation and basic security boundaries
- Building a small full-stack Node.js application

---

**Note:** TravelMate is a learning project, not a live travel booking service. Always verify travel requirements, prices, opening hours, and weather before making decisions.
