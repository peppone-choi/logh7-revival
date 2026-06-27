# LOGH VII Revival Development Workspace

This root is not a product repository. It is the parent development-data workspace used for reverse engineering, extraction evidence, handoffs, and migration scratch.

Use the independent product repositories:

- `server/`: authoritative server/admin repo.
- `client/`: player client packaging repo.

Each product repo has its own `AGENTS.md`, `.gitignore`, `package.json`, and Git root. Server and client checks must pass from inside those directories without reading this parent workspace.

The former parent `.git` directory has been retired outside this workspace at `E:\logh7-revival-parent-git-backup-20260620` for recovery only. The active Git roots are `server/.git` and `client/.git`.

Keep root-level reverse-engineering assets, extraction artifacts, `.omo/`, `.omc/`, `.debug-journal.md`, and handoff docs here until the split is fully reproducible. Do not treat the root npm package as a deployment boundary.

Any use of root `.omo/` or extraction outputs is a migration-time input only. Copy the needed artifact into the relevant repo or pass it explicitly.
