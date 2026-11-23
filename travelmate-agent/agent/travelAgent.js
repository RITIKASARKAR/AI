import OpenAI from "openai";
import { travelTools, executeTravelTool } from "../tools/travelTools.js";

const SYSTEM_PROMPT = `
You are TravelMate, a thoughtful AI travel-planning agent.

Your goal is to help a traveler make a practical trip plan through conversation.
You have tools for:
1. Checking live weather forecasts for a destination.
2. Calculating a budget from the traveler's own budget.
3. Creating a day-by-day itinerary structure.

How to behave:
- Understand the traveler's goal, dates, destination, group size, interests, and budget.
- Ask a short follow-up question when a critical detail is missing. Do not invent personal preferences.
- Decide which tools are useful. You may call multiple tools for one request.
- Use get_weather when weather matters or the user asks about weather. Clearly mention forecast dates and limitations.
- Use calculate_budget when the user gives a total budget. The tool allocates the supplied amount; it does not fetch live hotel or flight prices.
- Use create_itinerary when the user asks for a schedule or trip plan.
- After receiving tool results, inspect them and decide whether another tool call is needed before answering.
- Never claim that flights, hotels, tickets, or restaurant reservations have been booked.
- Never invent live prices, availability, opening hours, or weather. Say when information is an estimate.
- Keep the final answer organized, useful, and friendly. Mention assumptions.
- Do not expose API keys or internal implementation details.
`;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((item) =>
      item &&
      (item.role === "user" || item.role === "assistant") &&
      typeof item.content === "string"
    )
    .slice(-8)
    .map(({ role, content }) => ({ role, content: content.slice(0, 4000) }));
}

export async function runTravelAgent(userMessage, history = []) {
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...sanitizeHistory(history),
    { role: "user", content: userMessage }
  ];

  const toolTrace = [];
  const maxTurns = 6;

  for (let turn = 0; turn < maxTurns; turn++) {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages,
      tools: travelTools,
      tool_choice: "auto",
      temperature: 0.3
    });

    const assistantMessage = completion.choices[0]?.message;
    if (!assistantMessage) {
      throw new Error("The AI did not return a response. Please try again.");
    }

    messages.push(assistantMessage);

    if (!assistantMessage.tool_calls?.length) {
      return {
        reply: assistantMessage.content || "I couldn't create a response. Please try again.",
        toolTrace
      };
    }

    for (const toolCall of assistantMessage.tool_calls) {
      const toolName = toolCall.function.name;
      let args;

      try {
        args = JSON.parse(toolCall.function.arguments || "{}");
      } catch {
        args = {};
      }

      let toolResult;
      try {
        toolResult = await executeTravelTool(toolName, args);
      } catch (error) {
        toolResult = { error: error.message || "Tool execution failed." };
      }

      toolTrace.push({
        tool: toolName,
        input: args,
        output: toolResult
      });

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(toolResult)
      });
    }
  }

  return {
    reply: "I reached the planning step limit. Please narrow your request or ask me to continue with one part of the plan.",
    toolTrace
  };
}