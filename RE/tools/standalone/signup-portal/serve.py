#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Literal, TypeAlias, TypedDict

ROOT = Path(__file__).resolve().parent
# repo root = tools/standalone/signup-portal -> up 3
REPO_ROOT = ROOT.parents[2]
SERVER_MJS = REPO_ROOT / "src" / "server" / "logh7-server.mjs"
# Account labels: printable ASCII, <=32, matching isValidAccountLabel in logh7-account-registry.mjs.
ACCOUNT_RE = re.compile(r"^[\x20-\x7e]{1,32}$")
PASSWORD_RE = re.compile(r"^[\x20-\x7e]{1,8}$")

# Module-level config set in main(); read by the handler.
ACCOUNT_DB: Path = ROOT / "accounts.sqlite"

class SignupSuccess(TypedDict):
    ok: Literal[True]
    account: str


class SignupError(TypedDict):
    ok: Literal[False]
    error: str


SignupResult: TypeAlias = SignupSuccess | SignupError


INDEX_HTML = """<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LOGH VII - 계정 회원가입</title>
<style>
  :root { color-scheme: dark; }
  body { font-family: system-ui, sans-serif; background:#0b1020; color:#e6ecff;
         display:flex; min-height:100vh; align-items:center; justify-content:center; margin:0; }
  .card { background:#141a30; padding:32px 36px; border-radius:14px;
          width:min(340px, calc(100vw - 32px)); box-sizing:border-box;
          box-shadow:0 12px 40px rgba(0,0,0,.5); border:1px solid #25304f; }
  h1 { font-size:20px; margin:0 0 4px; }
  p.sub { margin:0 0 22px; color:#9fb0d6; font-size:13px; }
  label { display:block; font-size:12px; color:#9fb0d6; margin:14px 0 5px; }
  input { width:100%; box-sizing:border-box; padding:10px 12px; border-radius:8px;
          border:1px solid #2c3a60; background:#0d1326; color:#e6ecff; font-size:14px; }
  button { width:100%; margin-top:22px; padding:11px; border:0; border-radius:8px;
           background:#3a6df0; color:#fff; font-size:15px; font-weight:600; cursor:pointer; }
  button:disabled { opacity:.6; cursor:default; }
  .msg { margin-top:16px; font-size:13px; min-height:18px; }
  .ok { color:#67e08a; } .err { color:#ff8a8a; }
</style>
</head>
<body>
<div class="card">
  <h1>LOGH VII 계정 회원가입</h1>
  <p class="sub">게임 클라이언트 로그인 화면에서 사용할 계정과 비밀번호를 등록합니다.</p>
  <form id="f" autocomplete="off">
    <label for="account">계정 ID</label>
    <input id="account" name="account" maxlength="32" placeholder="예: p001flow" required>
    <label for="password">비밀번호</label>
    <input id="password" name="password" type="password" required>
    <button id="submit" type="submit">등록</button>
  </form>
  <div id="msg" class="msg"></div>
</div>
<script>
const f = document.getElementById('f'), msg = document.getElementById('msg'),
      btn = document.getElementById('submit');
f.addEventListener('submit', async (e) => {
  e.preventDefault();
  msg.textContent = ''; msg.className = 'msg';
  const account = f.account.value, password = f.password.value;
  btn.disabled = true;
  try {
    const r = await fetch('/api/signup', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ account, password }),
    });
    const data = await r.json();
    if (data.ok) { msg.className = 'msg ok'; msg.textContent = '계정 "' + data.account + '" 등록이 완료되었습니다. 이제 게임 클라이언트에서 로그인할 수 있습니다.'; f.reset(); }
    else { msg.className = 'msg err'; msg.textContent = data.error || '등록에 실패했습니다.'; }
  } catch (err) { msg.className = 'msg err'; msg.textContent = '네트워크 오류가 발생했습니다.'; }
  finally { btn.disabled = false; }
});
</script>
</body>
</html>
"""


def localized_admin_error(message: str) -> str:
    if message.startswith("account already exists:"):
        account = message.removeprefix("account already exists:").strip()
        return f"이미 등록된 계정입니다: {account}" if account else "이미 등록된 계정입니다."
    if message.startswith("invalid account label:"):
        return "계정 ID는 1~32자의 출력 가능한 ASCII 문자만 사용할 수 있습니다."
    if message == "account id is required":
        return "계정 ID를 입력하세요."
    if message == "password is required":
        return "비밀번호를 입력하세요."
    if message in {
        "password must be 1-8 printable ASCII characters",
        "password must be 1-8 non-space printable ASCII characters",
        "password must be 1-8 printable ASCII characters without surrounding spaces",
    }:
        return "비밀번호는 앞뒤 공백 없이 1~8자의 출력 가능한 ASCII 문자만 사용할 수 있습니다."
    if message.startswith("account limit reached"):
        return "등록 가능한 계정 수를 초과했습니다."
    return "등록에 실패했습니다. 입력값을 확인하세요."


def register_account(account: str | None, password: str | None) -> SignupResult:
    """Delegate to the Node admin CLI so hashing + GIN7 encoding are reused, never reimplemented."""
    if not isinstance(account, str) or not ACCOUNT_RE.match(account):
        return {"ok": False, "error": "계정 ID는 1~32자의 출력 가능한 ASCII 문자만 사용할 수 있습니다."}
    if not isinstance(password, str) or password == "":
        return {"ok": False, "error": "비밀번호를 입력하세요."}
    if not PASSWORD_RE.match(password) or password.strip() != password:
        return {"ok": False, "error": "비밀번호는 앞뒤 공백 없이 1~8자의 출력 가능한 ASCII 문자만 사용할 수 있습니다."}
    if not SERVER_MJS.is_file():
        return {"ok": False, "error": "서버 실행 파일을 찾을 수 없습니다."}
    env = {**os.environ, "NODE_NO_WARNINGS": "1"}
    proc = subprocess.run(
        [
            "node",
            str(SERVER_MJS),
            "admin",
            "create",
            account,
            "--password-stdin",
            "--account-db",
            str(ACCOUNT_DB),
        ],
        cwd=str(REPO_ROOT),
        env=env,
        input=password,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if proc.returncode == 0:
        return {"ok": True, "account": account}
    # The CLI prints "create failed: <reason>" to stderr; prefer that line over any stray warnings.
    lines = [ln.strip() for ln in (proc.stderr or proc.stdout or "").splitlines() if ln.strip()]
    failed = next((ln for ln in lines if ln.startswith("create failed:")), None)
    message = (failed or (lines[-1] if lines else "registration failed")).replace("create failed: ", "")
    return {"ok": False, "error": localized_admin_error(message)}


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
            self._send(200, INDEX_HTML.encode("utf-8"), "text/html; charset=utf-8")
            return
        self._send(404, b"not found", "text/plain; charset=utf-8")

    def do_POST(self) -> None:
        path = self.path.split("?", 1)[0]
        if path != "/api/signup":
            self._json({"ok": False, "error": "알 수 없는 경로입니다."}, 404)
            return
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw.decode("utf-8") or "{}")
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._json({"ok": False, "error": "요청 JSON을 읽을 수 없습니다."}, 400)
            return
        result = register_account(body.get("account"), body.get("password"))
        self._json(result, 200 if result.get("ok") else 400)


def main() -> int:
    global ACCOUNT_DB
    ap = argparse.ArgumentParser(description="LOGH VII 계정 회원가입 포털")
    ap.add_argument("--account-db", type=Path, default=ACCOUNT_DB,
                    help="인증 서버와 공유할 계정 DB 경로(.sqlite 권장)")
    ap.add_argument("--port", type=int, default=0, help="0 = 자동 선택 (8710..8720)")
    ap.add_argument("--no-browser", action="store_true", help="브라우저를 자동으로 열지 않습니다")
    args = ap.parse_args()

    ACCOUNT_DB = args.account_db.resolve()

    ports = [args.port] if args.port else list(range(8710, 8721))
    httpd = None
    for p in ports:
        try:
            httpd = ThreadingHTTPServer(("127.0.0.1", p), Handler)
            port = p
            break
        except OSError:
            continue
    if httpd is None:
        print("[오류] 8710..8720 범위에서 사용 가능한 포트가 없습니다.")
        return 1

    url = f"http://127.0.0.1:{port}/"
    print("=" * 62)
    print(" LOGH VII - 계정 회원가입 포털")
    print(f"  계정 DB: {ACCOUNT_DB}")
    print(f"  브라우저에서 열기: {url}")
    print("  종료: 이 창에서 Ctrl+C를 누르세요")
    print("=" * 62)
    if not args.no_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n종료되었습니다.")
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
