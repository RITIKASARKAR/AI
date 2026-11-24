import { decide } from './scripted-model.js';

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function createTransientError(message) {
  const error = new Error(message);
  error.retryable = true;
  return error;
}

function validateTaskId(taskId) {
  if (typeof taskId !== 'string' || !/^\d{1,8}$/.test(taskId)) {
    throw new Error('taskId must be a numeric string with up to eight digits.');
  }
}

function buildToolRegistry(taskStore, controls) {
  return {
    get_task: {
      description: 'Read one task by ID.',
      requiresApproval: false,
      validate: (args) => validateTaskId(args?.taskId),
      async run(args) {
        const remainingFailures = controls.readFailures.get(args.taskId) || 0;
        if (remainingFailures > 0) {
          controls.readFailures.set(args.taskId, remainingFailures - 1);
          throw createTransientError('Temporary task-store error.');
        }
        const task = taskStore.get(args.taskId);
        if (!task) return { error: 'Task not found.' };
        return { task: { id: task.id, title: task.title, status: task.status } };
      }
    },
    complete_task: {
      description: 'Mark an open task as complete. Requires human approval.',
      requiresApproval: true,
      validate: (args) => validateTaskId(args?.taskId),
      async run(args) {
        const task = taskStore.get(args.taskId);
        if (!task) return { error: 'Task not found.' };
        if (task.status !== 'TODO') return { error: `Task is already ${task.status}.` };
        task.status = 'DONE';
        return { message: `Task ${task.id} was marked DONE.` };
      }
    }
  };
}

function withTimeout(promise, timeoutMs, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs} ms.`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function executeWithRetry({ tool, args, limits, trace, toolName }) {
  for (let attempt = 0; attempt <= limits.maxRetries; attempt += 1) {
    try {
      return await withTimeout(tool.run(args), limits.toolTimeoutMs, toolName);
    } catch (error) {
      const canRetry = error.retryable === true && attempt < limits.maxRetries;
      trace.push({ type: 'tool_error', tool: toolName, attempt: attempt + 1, message: error.message, retrying: canRetry });
      if (!canRetry) throw error;
      // This readable demo uses a fixed delay; production commonly adds exponential backoff and jitter.
      await wait(limits.retryDelayMs);
    }
  }
}

export async function runAgent({
  goal,
  taskStore,
  approvalDecision = async () => false,
  failFirstRead = false,
  limits = {}
}) {
  const configuredLimits = {
    maxTurns: 6,
    maxToolCalls: 4,
    maxRetries: 1,
    runTimeoutMs: 5000,
    toolTimeoutMs: 1000,
    retryDelayMs: 20,
    ...limits
  };
  const taskId = goal.match(/\b\d+\b/)?.[0];
  const controls = { readFailures: new Map(failFirstRead ? [[taskId, 1]] : []) };
  const toolRegistry = buildToolRegistry(taskStore, controls);
  const history = [];
  const trace = [];
  const startedAt = Date.now();
  let toolCallCount = 0;

  for (let turn = 1; turn <= configuredLimits.maxTurns; turn += 1) {
    if (Date.now() - startedAt > configuredLimits.runTimeoutMs) {
      return { finalAnswer: 'Run stopped because its time budget was reached.', stopReason: 'run_timeout', history, trace };
    }

    let decision;
    try {
      decision = await withTimeout(decide({ goal, history, tools: Object.keys(toolRegistry) }), configuredLimits.toolTimeoutMs, 'model decision');
    } catch (error) {
      return { finalAnswer: `Run stopped: ${error.message}`, stopReason: 'model_error', history, trace };
    }

    trace.push({ type: 'model_decision', turn, plan: decision.plan });

    if (typeof decision.finalAnswer === 'string') {
      return { finalAnswer: decision.finalAnswer, stopReason: 'completed', history, trace };
    }

    if (!decision.toolCall || typeof decision.toolCall.name !== 'string') {
      return { finalAnswer: 'Run stopped because the model returned neither a tool call nor a final answer.', stopReason: 'invalid_decision', history, trace };
    }

    if (toolCallCount >= configuredLimits.maxToolCalls) {
      return { finalAnswer: 'Run stopped because the tool-call budget was reached.', stopReason: 'tool_budget', history, trace };
    }
    toolCallCount += 1;

    const toolName = decision.toolCall.name;
    const tool = toolRegistry[toolName];
    if (!tool) {
      return { finalAnswer: `Run stopped because tool "${toolName}" is not allowed.`, stopReason: 'unknown_tool', history, trace };
    }

    try {
      tool.validate(decision.toolCall.arguments);
    } catch (error) {
      history.push({ type: 'tool', name: toolName, output: { error: error.message } });
      trace.push({ type: 'tool_rejected', tool: toolName, message: error.message });
      continue;
    }

    if (tool.requiresApproval) {
      const approved = await approvalDecision({ tool: toolName, arguments: decision.toolCall.arguments, goal });
      trace.push({ type: 'approval', tool: toolName, approved });
      if (!approved) {
        history.push({ type: 'tool', name: toolName, output: { error: 'A human did not approve this action; no change was made.' } });
        continue;
      }
    }

    try {
      const output = await executeWithRetry({ tool, args: decision.toolCall.arguments, limits: configuredLimits, trace, toolName });
      history.push({ type: 'tool', name: toolName, output });
      trace.push({ type: 'tool_observation', tool: toolName, output });
    } catch (error) {
      history.push({ type: 'tool', name: toolName, output: { error: error.message } });
      trace.push({ type: 'tool_failed', tool: toolName, message: error.message });
    }
  }

  return { finalAnswer: 'Run stopped because the model-turn budget was reached.', stopReason: 'turn_budget', history, trace };
}

export function createTaskStore(taskId, status = 'TODO') {
  return new Map([[taskId, { id: taskId, title: `Example task ${taskId}`, status }]);
}
