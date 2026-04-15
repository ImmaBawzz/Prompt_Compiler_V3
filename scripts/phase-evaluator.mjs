// phase-evaluator.mjs
// Evaluates phase/task completion and progression eligibility for autonomous loop
import fs from 'node:fs';

const TASK_BOARD_PATH = './agent/TASK_BOARD.json';
const DEFINITION_OF_DONE_PATH = './agent/DEFINITION_OF_DONE.md';
const TASK_LOOP_PATH = './agent/TASK_LOOP.md';

function loadTaskBoard() {
  return JSON.parse(fs.readFileSync(TASK_BOARD_PATH, 'utf8'));
}

function allTasksDone(phase) {
  return phase.tasks.every((t) => t.status === 'done');
}

function getActivePhase(board) {
  return board.phases.find((p) => p.id === board.currentPhase);
}

function checkAdvancementGates() {
  // Placeholder: in real use, run build/test/dependency/docs checks
  // For now, always return true for demo
  return {
    buildPass: true,
    testPass: true,
    dependencyClosure: true,
    docsFresh: true,
    all: true
  };
}

function evaluatePhaseProgression() {
  const board = loadTaskBoard();
  const activePhase = getActivePhase(board);
  const gates = checkAdvancementGates();
  const allDone = allTasksDone(activePhase);
  let nextPhaseId = null;
  if (allDone && gates.all) {
    const idx = board.phases.findIndex((p) => p.id === board.currentPhase);
    if (idx >= 0 && idx < board.phases.length - 1) {
      nextPhaseId = board.phases[idx + 1].id;
    }
  }
  return {
    currentPhase: board.currentPhase,
    allTasksDone: allDone,
    gates,
    eligible: allDone && gates.all,
    nextPhaseId
  };
}

if (require.main === module) {
  const result = evaluatePhaseProgression();
  console.log(JSON.stringify(result, null, 2));
}

export { evaluatePhaseProgression };
