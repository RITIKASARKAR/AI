# Agent Harness: Loops, State, Controls, Evaluation, and Human Approval

> A detailed, beginner-to-advanced lesson for building the runtime around an AI agent. The code is plain JavaScript for Node.js and runs without an API key.

## What you will build

This project is a small task-list agent. Given a request such as “check task 7” or “mark task 7 complete,” a model adapter proposes a short plan, a tool call, or a final answer. The harness controls the loop, validates tool requests, executes tools, records observations, applies retry and budget limits, and pauses for a human decision before changing task state.

A separate evaluator runs multiple scenarios and checks the actual task store against expected outcomes. The project uses a deterministic scripted model so the control flow is easy to follow. It is a model adapter demonstration, not a claim that the agent has LLM reasoning. Replace the adapter with a real model API when you are ready; keep execution controls and tool policy in the harness.

## Learning objectives

By the end, you should be able to:

1. Explain what an agent harness is and why it is separate from the model.
2. Trace a plan → act → observe → decide loop through source code.
3. Distinguish model context from trusted application task state.
4. Control execution with turn limits, tool-call limits, deadlines, retries, and approval gates.
5. Design tools that validate inputs and return useful observations.
6. Involve a human before a consequential action.
7. Evaluate completed runs with independent checks instead of trusting the agent's final claim.
8. Identify production concerns such as idempotency, persistence, observability, and recovery.

## 1. What is an agent harness?

An **agent** is commonly an LLM-driven process that can select actions, observe results, and continue toward a goal. An **agent harness** is the application runtime around that model. It owns the loop and connects model decisions to real tools and state.

The model can suggest what to do next. The harness decides whether that suggestion is valid, authorized, safe, within budget, approved, and executable. The harness also maintains state, handles failures, records a trace, and decides when the run must stop.

```text
User goal
   ↓
Harness builds bounded model context
   ↓
Model returns a plan, tool proposal, or final response
   ↓
Harness validates proposal and execution policy
   ↓
Tool runs (or human approval is requested)
   ↓
Observation is recorded in state and supplied to the next model turn
   └────────────────────── loop until done or stopped
```

An agent is not automatically a loop just because an LLM is involved. A one-shot model response with no tool feedback is usually a model call, not an agent loop. A harness may run an agent safely even when the model is imperfect, because the harness controls what the model can actually cause.

## 2. Agent loop: plan → act → observe → decide

The loop in this project has four useful teaching labels:

1. **Plan:** The model gives a concise plan summary. This is a progress note, not hidden chain-of-thought. Keep internal reasoning private; logs should record decisions and evidence needed to debug behavior.
2. **Act:** The model proposes a named tool and arguments. The harness checks tool name, argument schema, policy, budgets, and approval before it executes anything.
3. **Observe:** The tool returns a result or a safe error. The harness records it as an observation in the conversation history and trace.
4. **Decide:** The model receives the goal plus the updated observations. It can propose another action or return a final answer. The loop ends only when the harness recognizes a final result or a stop condition.

The model does not directly call JavaScript functions. It returns a structured proposal, then the harness dispatches a validated call. Tool results matter: the model should use what actually happened rather than assuming its previous action succeeded.

## 3. Model context and trusted task state

“State” is often used to describe two different things. Keep them distinct.

| State | What it contains | Trust and lifetime |
| --- | --- | --- |
| **Model context** | Goal, compact history, prior tool observations, current instructions. | Sent to the model; treat as an untrusted, token-limited working view. |
| **Application task state** | Authenticated user, authoritative records, permissions, approval records, budget counters, durable status. | Owned by the application; the model must not authoritatively set it. |
| **Run trace** | Decisions, tool requests, observations, timings, retries, approvals, stop reason. | For debugging and evaluation; redact secrets and personal data. |

The model context is not your database and should not be your source of truth. In this demo, the model sees a task ID and tool results. The actual task records stay in `taskStore`. A call to `complete_task` checks current status in the store before changing it. Production applications should derive identity from authenticated server context, not model arguments.

Context is finite. Too much history raises cost and latency and can bury important facts. A production harness may summarize old observations, retain a compact state snapshot, or retrieve only relevant records. Summaries are lossy: preserve exact identifiers, approval status, decisions, and facts that must not be changed by summarization. Never “summarize away” a security check.

## 4. Task state, run state, and persistence

- **Task state** describes the business task: for example, task 7 is still `TODO`.
- **Run state** describes an execution attempt: current turn, tool-call count, retry count, model history, trace, and stop reason.
- **Session state** may connect multiple user messages into a conversation.
- **Durable state** survives process restarts: database rows, event records, checkpointed run state, or a queue.

The example keeps business records in memory, so changes reset when the process exits. It also keeps run state in one function call. Production work that can take minutes, wait for a human, or survive a deployment should persist a checkpoint and resume from it. Persist only the fields required to continue; version the checkpoint schema and protect sensitive data.

Do not use a model-generated summary as the only durable record of what happened. Store authoritative tool outcomes and human decisions separately.

## 5. Execution control

Autonomy needs explicit limits. This sample harness applies:

- **Maximum model turns:** Caps repeated model decisions.
- **Maximum tool calls:** Caps side effects and tool spend per run.
- **Run deadline:** Stops the run when the time budget is exhausted.
- **Per-tool timeout:** Stops waiting indefinitely for a tool.
- **Bounded retry count:** Retries only errors explicitly marked transient.
- **Tool allowlist and schemas:** Rejects unknown tools and malformed arguments.
- **Approval policy:** Pauses before a tool marked as requiring human approval.

Limits should be visible in results and traces. Reaching a limit is a real outcome, not silent success. A production system may also set token, cost, concurrency, rate, and per-user budgets.

### Retries and idempotency

Retries help with transient failures such as a temporary network error. They do not fix invalid arguments, permission denials, or a business-rule failure. Retry only when the operation is safe to repeat or protected by an **idempotency key**. For example, retrying “read task” is normally safe; retrying a payment/refund without an idempotency design may perform the action twice.

Use bounded exponential backoff with jitter in production. The demo uses a short, fixed delay so the example stays readable. Keep retry policy near the tool executor, and record each attempt. Avoid stacking retries at the model, SDK, harness, and HTTP layers without a shared budget; multiplicative retries can overload a failing service.

### Timeouts and cancellation

A timeout stops the harness from waiting beyond its budget. A timer alone may not stop an underlying operation that ignores cancellation. Production tools should accept an `AbortSignal` or equivalent cancellation mechanism, and remote calls should enforce their own deadlines. After a timeout during a side effect, the result may be unknown; query authoritative state before attempting the action again.

## 6. Human in the loop (HITL)

Some actions should pause for review: sending a message externally, deleting records, changing permissions, purchasing, or issuing a refund. The harness can mark such a tool as approval-required. It presents a human with the exact action and arguments, then executes only after approval.

Approval should be:

- **Explicit:** A human affirmatively approves or rejects.
- **Bound to the proposal:** Show the exact action, target, and important arguments.
- **Authenticated:** Record which human approved it.
- **Fresh:** Expire approvals after a defined period.
- **Revalidated:** Recheck permissions and current business state immediately before execution.
- **Auditable:** Record decision, timestamp, and outcome without leaking unnecessary data.

The sample's callback is an in-process stand-in that returns approve/deny for a scenario. A real UI usually needs a pause/resume workflow: persist the pending run, show the proposal, receive an authenticated decision, validate that the proposal has not changed, then resume. Never let the model approve its own tool call by returning `approved: true`.

Human approval is a control, not a substitute for authorization. An approver should not be able to approve an action the application is not permitted to execute.

## 7. The evaluator loop is separate

The **agent loop** operates within one task: model decision → tool → observation → next model decision. The **evaluator loop** operates across runs or test cases: run the agent on a known task, inspect the real outcome, compare it with expectations, and aggregate results.

```text
Agent loop:      goal → decide → tool → observe → decide → final/stop

Evaluator loop:  case → run harness → inspect authoritative state/trace
                         → score pass/fail → summarize across cases
```

In `src/evaluate.js`, expected results are separate from the model. The evaluator checks the task store after the run; it does not accept “I completed it” as proof. It scores whether the expected task status was reached, whether the run stopped appropriately, and whether a denied approval prevented the change.

Good evaluation practice:

1. Define expected behavior before running the agent.
2. Include normal, ambiguous, denied-approval, transient-failure, and limit cases.
3. Check side effects in the system of record, not only final text.
4. Keep evaluator logic independent of the agent's own claims.
5. Inspect traces and per-case regressions; averages can hide important failures.
6. Version cases, prompts, models, and tool implementations for comparisons.

An LLM judge can score nuanced language, but deterministic checks are better for facts such as whether task status actually changed. Use both when the task requires both semantic quality and exact outcomes.

## 8. Project structure

```text
agent-harness/
├── README.md
├── package.json
├── data/
│   └── evaluation-cases.json
└── src/
    ├── harness.js
    ├── scripted-model.js
    └── evaluate.js
```

## 9. Run the project

Requirements: Node.js 18 or newer. There are no external packages or API keys.

```bash
cd agent-harness
npm run evaluate
```

The evaluator runs scenarios and writes `results.json`, including per-case traces and aggregate metrics. The model adapter is deterministic so a run is repeatable. To use a real LLM, implement the same `decide({ goal, history, tools, signal })` interface in a provider adapter. Keep the harness controls unchanged and do not pass secrets or unnecessary personal data into model context.

## 10. Code walkthrough

### `src/scripted-model.js`

Implements the model interface without calling a real LLM. It examines the goal and observed tool results, then emits a concise plan and either a tool proposal or final answer. This shows that the harness should depend on a small adapter contract rather than being tangled with one provider's API.

### `src/harness.js`

- `toolRegistry` defines allowed tools, schemas, whether approval is required, and the handler.
- `runAgent()` creates run state and loops until final output or a control limit.
- `validateToolArguments()` checks untrusted model proposals before dispatch.
- `executeWithRetry()` retries only explicitly transient failures and observes the retry budget.
- `withTimeout()` bounds how long the harness waits.
- Approval is requested before `complete_task` executes.
- Tool results are added to history as observations and included in the trace.
- Final output reports the stop reason so a limit, denial, or success is distinguishable.

### `src/evaluate.js`

Creates a fresh task store for each case, injects an approval decision, runs the harness, and checks actual state against the expected outcome. It aggregates deterministic pass rate and reports traces for inspection.

## 11. An example loop in pseudocode

```js
while (!finished) {
  const decision = await model.decide({ goal, history, tools });

  if (decision.finalAnswer) {
    return decision.finalAnswer;
  }

  const toolCall = validate(decision.toolCall);
  const observation = await executeToolWithPolicy(toolCall);
  history.push({ role: 'tool', content: observation });
}
```

The production-grade work is hidden inside the apparently small `validate` and `executeToolWithPolicy` functions: authentication, authorization, schema validation, approval, timeouts, retries, idempotency, logging, and state persistence. Never let a concise pseudocode example disguise those responsibilities.

## 12. Advanced design topics

### Planning is not a commitment

A plan is a proposal that can change after observations. Do not execute every item in a model-generated multi-step plan blindly. Prefer one action at a time when later steps depend on the result. For well-understood workflows, use deterministic application code for the sequence and ask the model only where flexible language understanding adds value.

### Tool results are observations, not instructions

Tool output may contain user content, external text, or errors. Treat it as data, not privileged instructions. Limit output size, redact secrets, and clearly label it in context. A malicious web page or document can try to influence the next model decision.

### Parallel tool calls

Independent read-only calls may run concurrently. Writes or calls with dependencies should be ordered. Before parallelizing, define partial-failure behavior, cancellation, rate limits, and whether all results are required. A simple sequential loop is easier to reason about and is the right starting point.

### Multi-agent systems

An orchestrator can delegate subtasks to specialized agents, but each sub-agent adds cost, context, failure modes, and new tool boundaries. Start with one agent and narrow tools. Add delegation only when a measured task needs independent work or specialized capabilities. Keep authorization at the tool/service boundary no matter how many agents are involved.

### Observability

Record run ID, case/task ID, model and prompt version, turn count, tool name, validated arguments or safe summaries, duration, retries, approval result, errors, and stop reason. Use structured events. Redact credentials and personal data; set retention and access controls. A useful trace answers: what did the model propose, what did the harness allow, what actually happened, and why did the run stop?

### Recovery and resumability

For long jobs, persist checkpoints after meaningful events. Make tool operations idempotent where possible. When resuming after a crash, distinguish “tool never ran,” “tool ran and succeeded,” and “tool outcome is unknown.” Use idempotency keys or query the system of record before retrying uncertain side effects.

### Stop conditions

An agent should stop when it has enough evidence to answer, when it cannot safely proceed, when a human decision is pending, when a budget is reached, or when a fatal tool error occurs. “The model says it is done” may be one signal; the application can also require an outcome check before declaring success.

## 13. Common failure patterns

- **Unbounded loop:** The model repeatedly calls a tool. Set turn and call limits.
- **False completion:** The final text claims success, but the side effect failed. Check authoritative state.
- **Retrying a write unsafely:** A timeout hides whether the write succeeded. Use idempotency and reconcile state.
- **Context confusion:** A tool result is mistaken for instruction or stale state. Label observations and re-read authoritative records.
- **Approval mismatch:** A human approves one target, but the proposal changes before execution. Bind approval to exact arguments and revalidate.
- **Evaluator leakage:** The agent sees expected answers or evaluation labels. Keep evaluator data out of runtime context.
- **Overbuilt agent:** A simple deterministic workflow is handed to an autonomous model. Prefer the simplest architecture that meets the task.

## 14. Exercises

1. Change the scripted model to request a nonexistent tool. Confirm the harness stops safely.
2. Set `maxTurns` to one and observe the limit outcome.
3. Make a tool fail with a non-retryable validation error and confirm it is not retried.
4. Deny approval for completion and verify the task remains `TODO`.
5. Add a task owner and derive the user identity from a trusted run context, not model arguments.
6. Add a tool with an idempotency key and simulate a timeout after the write.
7. Add a case where the model claims completion without calling `complete_task`; the evaluator should fail it.
8. Add a persistent checkpoint so a pending human approval can resume after restart.

## Key takeaways

- The **model proposes**; the **harness validates, authorizes, executes, observes, and stops**.
- The agent loop is plan → act → observe → decide; execution control wraps every turn and tool.
- Keep model context, authoritative task state, and run trace separate.
- Use explicit budgets, bounded retries, timeouts, and idempotency for side effects.
- Pause for authenticated human approval before consequential actions, then revalidate.
- Evaluate runs against ground truth and tool outcomes, not the agent's self-reported success.

## Further reading

- [OpenAI Agents SDK: Running agents and the agent loop](https://openai.github.io/openai-agents-js/guides/running-agents/)
- [OpenAI Agents SDK: Human in the loop](https://openai.github.io/openai-agents-js/guides/human-in-the-loop/)
- [OpenAI Agents SDK: Tools and preventing infinite loops](https://openai.github.io/openai-agents-js/guides/agents/)
- [Anthropic: Building effective agents](https://www.anthropic.com/research/building-effective-agents)
