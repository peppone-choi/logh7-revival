#!/usr/bin/env python3
"""LOGH VII Original-Character Portrait Namer — local server with REAL-TIME JSON autosave.

Standalone, stdlib-only. Serves a browser GUI for naming the O-group (original/canon) portraits.
EVERY edit in the browser is POSTed here and written to names.json on disk IMMEDIATELY (atomic).

Duplicate portraits (byte-identical PNGs — the same face reused many times) are grouped: you name
each UNIQUE face ONCE and the name covers every copy. Naming is keyed by a content hash (group id);
GET /api/export expands a group's name to every member image path.

Run:  double-click start.bat   (or:  python serve.py)
Data: names.json  (your registry; rewritten atomically on every debounced edit)
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import threading
import webbrowser
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PORTRAITS_DIR = ROOT / "portraits"
NAMES_PATH = ROOT / "names.json"
SUGGEST_PATH = ROOT / "suggestions.json"
ATLASES = ("o", "oam", "oem")
ATLAS_FACTION = {"oem": "empire", "oam": "alliance", "o": "other"}
FILE_RE = re.compile(r"^[0-9A-Za-z_]+\.png$")

LOCK = threading.RLock()
STATE: dict = {}
GROUPS: list[dict] = []          # one entry per unique face
GID: set[str] = set()            # valid group ids
PORTRAIT_TO_GID: dict[str, str] = {}


def now_iso() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def portrait_files():
    for atlas in ATLASES:
        d = PORTRAITS_DIR / atlas
        if d.is_dir():
            for png in sorted(d.glob("*.png")):
                yield atlas, png.name, png


def build_groups() -> None:
    """Group byte-identical portraits so each unique face is named once."""
    global GROUPS, GID, PORTRAIT_TO_GID
    by_hash: dict[str, dict] = {}
    order: list[str] = []
    for atlas, name, png in portrait_files():
        key = f"{atlas}/{name}"
        h = hashlib.sha256(png.read_bytes()).hexdigest()[:16]
        g = by_hash.get(h)
        if g is None:
            by_hash[h] = {"id": h, "rep": key, "repAtlas": atlas, "members": [key], "atlases": {atlas}}
            order.append(h)
        else:
            g["members"].append(key)
            g["atlases"].add(atlas)
    groups = []
    for h in order:
        g = by_hash[h]
        groups.append({
            "id": h, "rep": g["rep"], "atlas": g["repAtlas"], "atlases": sorted(g["atlases"]),
            "members": g["members"], "count": len(g["members"]),
            "url": f"/portraits/{g['rep']}", "defaultFaction": ATLAS_FACTION[g["repAtlas"]],
        })
    GROUPS = groups
    GID = {g["id"] for g in groups}
    PORTRAIT_TO_GID = {m: g["id"] for g in groups for m in g["members"]}


def load_state() -> None:
    """Load names.json and migrate any legacy per-portrait-key entries to group ids."""
    global STATE
    with LOCK:
        if NAMES_PATH.exists():
            try:
                STATE = json.loads(NAMES_PATH.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                STATE = {}
        else:
            STATE = {}
        STATE.setdefault("_purpose", "LOGH VII O-group portrait names (grouped by face, real-time autosaved).")
        entries = STATE.get("entries", {}) or {}
        migrated: dict = {}
        for key, val in entries.items():
            gid = key if key in GID else PORTRAIT_TO_GID.get(key)
            if gid and gid not in migrated:
                migrated[gid] = val
        STATE["entries"] = migrated


def save_state() -> str:
    """Atomic write: tmp + os.replace so a crash mid-write never corrupts names.json."""
    with LOCK:
        STATE["savedAt"] = now_iso()
        tmp = NAMES_PATH.with_name("names.json.tmp")
        tmp.write_text(json.dumps(STATE, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(tmp, NAMES_PATH)
        return STATE["savedAt"]


def named_count() -> int:
    with LOCK:
        return sum(1 for e in STATE.get("entries", {}).values() if (e or {}).get("name", "").strip())


def load_suggestions():
    if SUGGEST_PATH.exists():
        try:
            return json.loads(SUGGEST_PATH.read_text(encoding="utf-8")).get("items", [])
        except (OSError, json.JSONDecodeError):
            return []
    return []


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):  # quiet
        pass

    def _send(self, code: int, body: bytes, ctype: str) -> None:
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, obj, code: int = 200) -> None:
        self._send(code, json.dumps(obj, ensure_ascii=False).encode("utf-8"),
                   "application/json; charset=utf-8")

    def do_GET(self) -> None:
        path = self.path.split("?", 1)[0]
        if path in ("/", "/index.html"):
            self._send(200, (ROOT / "index.html").read_bytes(), "text/html; charset=utf-8")
            return
        if path == "/api/manifest":
            with LOCK:
                self._json({
                    "groups": GROUPS,
                    "names": STATE.get("entries", {}),
                    "suggestions": load_suggestions(),
                    "totalGroups": len(GROUPS),
                    "totalImages": len(PORTRAIT_TO_GID),
                    "namedCount": named_count(),
                    "savedAt": STATE.get("savedAt"),
                })
            return
        if path == "/api/export":  # expand each group's name to every member image path
            with LOCK:
                gid2name = {gid: (e or {}) for gid, e in STATE.get("entries", {}).items()}
                img = {}
                for g in GROUPS:
                    e = gid2name.get(g["id"])
                    if e and (e.get("name", "") or "").strip():
                        for m in g["members"]:
                            img[m] = {"name": e.get("name", ""), "name_ja": e.get("name_ja", ""),
                                      "faction": e.get("faction", ""), "note": e.get("note", "")}
                self._send(200, json.dumps({"imageNames": img}, ensure_ascii=False, indent=2).encode("utf-8"),
                           "application/json; charset=utf-8")
            return
        if path == "/names.json":
            self._send(200, json.dumps(STATE, ensure_ascii=False, indent=2).encode("utf-8"),
                       "application/json; charset=utf-8")
            return
        if path.startswith("/portraits/"):
            self._serve_portrait(path)
            return
        self._send(404, b"not found", "text/plain; charset=utf-8")

    def _serve_portrait(self, path: str) -> None:
        rel = path[len("/portraits/"):]
        parts = rel.split("/")
        if len(parts) != 2 or parts[0] not in ATLASES or not FILE_RE.match(parts[1]):
            self._send(404, b"bad path", "text/plain; charset=utf-8")
            return
        fp = (PORTRAITS_DIR / parts[0] / parts[1]).resolve()
        if PORTRAITS_DIR.resolve() not in fp.parents or not fp.is_file():
            self._send(404, b"not found", "text/plain; charset=utf-8")
            return
        self._send(200, fp.read_bytes(), "image/png")

    def do_POST(self) -> None:
        path = self.path.split("?", 1)[0]
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw.decode("utf-8") or "{}")
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._json({"ok": False, "error": "bad json"}, 400)
            return

        if path == "/api/save":
            gid = str(body.get("id", ""))
            if gid not in GID:
                self._json({"ok": False, "error": "unknown group id"}, 400)
                return
            with LOCK:
                group = next(g for g in GROUPS if g["id"] == gid)
                entry = STATE["entries"].get(gid, {})
                for field in ("name", "name_ja", "faction", "note"):
                    if field in body:
                        entry[field] = str(body[field])
                entry["rep"] = group["rep"]
                entry["members"] = group["members"]
                entry["count"] = group["count"]
                entry["updatedAt"] = now_iso()
                if not any((entry.get(f, "") or "").strip() for f in ("name", "name_ja", "note")):
                    STATE["entries"].pop(gid, None)
                else:
                    STATE["entries"][gid] = entry
                saved_at = save_state()
                self._json({"ok": True, "savedAt": saved_at, "namedCount": named_count()})
            return

        if path == "/api/backup":
            with LOCK:
                stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
                bak = ROOT / f"names.backup-{stamp}.json"
                bak.write_text(json.dumps(STATE, ensure_ascii=False, indent=2), encoding="utf-8")
                self._json({"ok": True, "backup": bak.name})
            return

        self._json({"ok": False, "error": "unknown route"}, 404)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=0, help="0 = auto (8799..8809)")
    ap.add_argument("--no-browser", action="store_true")
    args = ap.parse_args()

    if not PORTRAITS_DIR.is_dir():
        print(f"[ERROR] portraits/ not found next to serve.py ({PORTRAITS_DIR})")
        return 1
    build_groups()
    load_state()

    ports = [args.port] if args.port else list(range(8799, 8810))
    httpd = None
    for p in ports:
        try:
            httpd = ThreadingHTTPServer(("127.0.0.1", p), Handler)
            port = p
            break
        except OSError:
            continue
    if httpd is None:
        print("[ERROR] no free port in 8799..8809")
        return 1

    url = f"http://127.0.0.1:{port}/"
    # ASCII-only console output: a cmd.exe console may be unable to encode Hangul and would crash
    # print(); the Korean UI lives in the browser GUI. Keep this window's text plain ASCII.
    print("=" * 62)
    print(" LOGH VII - Original Character Portrait Namer")
    print(f"  unique faces: {len(GROUPS)}  (from {len(PORTRAIT_TO_GID)} images; duplicates grouped)")
    print(f"  data file: {NAMES_PATH.name} (auto-saved in real time)")
    print(f"  OPEN IN BROWSER:  {url}")
    print("  stop: press Ctrl+C in this window")
    print("=" * 62)
    if not args.no_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped. All changes are already saved.")
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
