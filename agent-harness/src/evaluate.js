import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createTaskStore, runAgent } from './harness.js';

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  const cases = JSON.parse(await readFile(path.join(projectDirectory, 'data/evaluation-cases.json'), 'utf8'));
  const results = [];

  for (const testCase of cases) {
    // Ground truth belongs to the evaluator, not to the model's prompt or final answer.
    const taskStore = createTaskStore(testCase.taskId);
    const run = await runAgent({
      goal: testCase.goal,
      taskStore,
      failFirstRead: testCase.failFirstRead ?? false,
      approvalDecision: async (proposal) => testCase.approval === 'approve' && proposal.arguments.taskId === testCase.taskId
    });
    const actualStatus = taskStore.get(testCase.taskId)?.status ?? 'MISSING';
    const passed = actualStatus === testCase.expectedStatus && run.stopReason === testCase.expectedStopReason;

    results.push({
      id: testCase.id,
      passed,
      expectedStatus: testCase.expectedStatus,
      actualStatus,
      stopReason: run.stopReason,
      finalAnswer: run.finalAnswer,
      trace: run.trace
    });
    console.log(`${passed ? 'PASS' : 'FAIL'} ${testCase.id}: status=${actualStatus}, stop=${run.stopReason}`);
  }

  const passedCount = results.filter((result) => result.passed).length;
  const report = {
    evaluator: 'deterministic ground-truth checks',
    caseCount: results.length,
    passedCount,
    passRate: Number((passedCount / results.length).toFixed(2)),
    results
  };

  await writeFile(path.join(projectDirectory, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nEvaluator: ${passedCount}/${results.length} cases passed. Wrote results.json.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
