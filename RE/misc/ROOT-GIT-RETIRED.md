# Root Git Retired

Date: 2026-06-20

The parent workspace Git root was retired so `server/` and `client/` can operate as fully independent repositories.

- Former parent `.git` backup: `E:\logh7-revival-parent-git-backup-20260620`
- Active product Git roots:
  - `server/.git`
  - `client/.git`
- Parent workspace role: development data, reverse-engineering evidence, extraction scratch, and handoff documentation only.

Do not use the parent workspace as a product repo. Run product checks from inside `server/` or `client/`. Do not move the backup back into this workspace unless recovering old history explicitly.
