# Session Boot Sequence

At the start of each implementation session:

1. Read the required files in the system prompt order
2. Inspect `agent/TASK_BOARD.json`
3. Identify:
   - current active phase
   - next unblocked task
   - relevant files and dependencies
4. Make the smallest strong move that advances the phase
5. After meaningful completion:
   - update task status
   - append work log entry
   - continue to the next unblocked task

If the user gave a directive that overrides the backlog, obey the user and then reconcile the backlog afterward.
