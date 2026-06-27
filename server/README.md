# LOGH VII Revival Server

This is the authoritative server/admin package. It is intentionally separate from the Windows client package.

## Owns

- `src/server/`: login, lobby, session, world/bootstrap, admin CLI/API.
- `content/`: scenario, galaxy, roster, economy, manual-derived data loaded by the server.
- `state/accounts.sqlite`: account registry created by `admin create` or launcher signup.
- `state/world-state.sqlite`: world/session snapshot persistence.
- `logs/` and `traces/`: server runtime evidence.
- `content/crypto/child-codec-tables.json`: committed codec table fixture; the server does not need a client EXE at runtime.

## Does Not Own

- Windows game executable or player data files.
- Pretendard font payload.
- Client installer/launcher packaging.
- Original CD/ISO artifacts and reverse-engineering scratch data.

## Quick Start

```bash
npm run admin -- create test01 --password-stdin --account-db state/accounts.sqlite
npm run serve:auth -- --host 127.0.0.1 --port 47900 --admin-host 127.0.0.1 --admin-port 47910
```

The admin session snapshot is available at `http://127.0.0.1:47910/admin/session-state` when `--admin-port` is enabled.

## Server Notice

`--announcement` and the admin `text` field are for ASCII/Latin-1 probe text only:

```bash
npm run serve:auth -- --admin-port 47910 --announcement "WELCOME"
```

For Korean notices, pre-encode the body as CP949 bytes and pass hex so the legacy client receives ANSI text without mojibake:

```bash
NOTICE_HEX=$(python -c "import sys; print(sys.argv[1].encode('cp949').hex())" "서버 점검 안내")
npm run serve:auth -- --admin-port 47910 --announcement-cp949-hex "$NOTICE_HEX"
```

With the admin port enabled, the notice can be changed at runtime for future lobby logins:

```bash
curl http://127.0.0.1:47910/admin/notice
curl -X PUT http://127.0.0.1:47910/admin/notice -H "content-type: application/json" -d "{\"text\":\"WELCOME\"}"
curl -X PUT http://127.0.0.1:47910/admin/notice -H "content-type: application/json" -d "{\"cp949Hex\":\"$NOTICE_HEX\"}"
curl -X DELETE http://127.0.0.1:47910/admin/notice
```

Environment equivalents are `LOGH_LOBBY_ANNOUNCE_TEXT`, `LOGH_SESSION_ANNOUNCE_TEXT`, `LOGH_LOBBY_ANNOUNCE_CP949_HEX`, and `LOGH_SESSION_ANNOUNCE_CP949_HEX`.

A deployed server should run without any parent workspace, `.omo` directory, or client package.

Some committed content files keep `_source` strings that mention extraction workspaces such as `.omo`; those are audit provenance strings, not runtime file dependencies.

If the committed codec fixture must be regenerated, do it inside this repo with an explicit EXE path:

```bash
npm run extract:codec -- /path/to/G7MTClient.exe
```
