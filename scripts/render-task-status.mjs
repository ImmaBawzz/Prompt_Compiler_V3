import fs from 'node:fs';
import path from 'node:path';

const board = JSON.parse(fs.readFileSync(path.resolve('agent/TASK_BOARD.json'), 'utf8'));

console.log(`Project: ${board.project}`);
console.log(`Current phase: ${board.currentPhase}`);
console.log('');

for (const phase of board.phases) {
  const counts = phase.tasks.reduce((acc, task) => {
    acc[task.status] = (acc[task.status] || 0) + 1;
    return acc;
  }, {});

  console.log(`${phase.id} — ${phase.title}`);
  console.log(`  status: ${phase.status}`);
  console.log(`  tasks: ${phase.tasks.length}`);
  console.log(`  todo: ${counts.todo || 0}, active: ${counts.active || 0}, done: ${counts.done || 0}, blocked: ${counts.blocked || 0}`);
}
