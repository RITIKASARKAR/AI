// This deterministic adapter stands in for an LLM so the harness can run offline.
export async function decide({ goal, history }) {
  const taskId = goal.match(/\b\d+\b/)?.[0];
  const wantsCompletion = /complete|finish|done/i.test(goal);
  const latestRead = [...history].reverse().find((item) => item.type === 'tool' && item.name === 'get_task');
  const latestCompletion = [...history].reverse().find((item) => item.type === 'tool' && item.name === 'complete_task');

  if (!taskId) {
    return { plan: 'The request does not include a task identifier.', finalAnswer: 'Please provide a task ID.' };
  }

  if (latestCompletion) {
    return {
      plan: 'Use the completion tool observation to report the result.',
      finalAnswer: latestCompletion.output.message ?? latestCompletion.output.error
    };
  }

  if (latestRead?.output.task) {
    const { id, status } = latestRead.output.task;
    if (wantsCompletion && status === 'TODO') {
      return {
        plan: 'The task is still open; request the completion action, which requires human approval.',
        toolCall: { name: 'complete_task', arguments: { taskId: id } }
      };
    }
    return {
      plan: 'The requested status is available from the tool observation.',
      finalAnswer: `Task ${id} is ${status}.`
    };
  }

  if (latestRead?.output.error) {
    return { plan: 'The task lookup failed; report the observed error.', finalAnswer: latestRead.output.error };
  }

  if (latestCompletion?.output.error) {
    return { plan: 'The completion action was not performed.', finalAnswer: latestCompletion.output.error };
  }

  return {
    plan: 'Look up the task before taking or reporting an action.',
    toolCall: { name: 'get_task', arguments: { taskId } }
  };
}
