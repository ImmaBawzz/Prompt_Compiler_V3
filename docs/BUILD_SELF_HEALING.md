# Automated Build Self-Healing

This project uses automated self-healing for missing module/type errors in CI/CD and local development. The system will auto-detect missing dependencies, install them, and update lockfiles. On dev branches, changes are auto-committed; on main, a PR or review is required.

## How it works

1. **Detection:**
   - The build pipeline runs a type check (`tsc --noEmit`) before building.
   - If a missing module/type is detected, the automation attempts to install it (e.g., `npm install <missing>`).
2. **Auto-fix:**
   - After installation, the check is re-run. If successful, the build continues.
   - On dev branches, the updated `package.json`/lockfile is auto-committed.
   - On main, a PR or review is triggered for the update.
3. **Escalation:**
   - If auto-fix fails, a clear error is surfaced and maintainers are notified.

## Local workflow
- A pre-commit/pre-push hook runs the same check and auto-fix logic.
- Developers are encouraged to let the automation handle missing dependencies, but can also run `npm install` manually if needed.

## Security & Safeguards
- Auto-commits are performed by a bot account in CI.
- Infinite commit loops are prevented by only committing once per error.

## Extending
- This pattern can be extended to other automatable build errors in the future.

See CONTRIBUTING.md for more details.
