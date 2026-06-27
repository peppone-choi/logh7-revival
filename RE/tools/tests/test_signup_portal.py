from __future__ import annotations

import importlib.util
import json
import sqlite3
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
from types import ModuleType
from typing import Mapping
from unittest.mock import patch


REPO_ROOT = Path(__file__).resolve().parents[2]
PORTAL_PATH = REPO_ROOT / "tools" / "standalone" / "signup-portal" / "serve.py"


class PortalImportError(RuntimeError):
    def __init__(self, path: Path) -> None:
        super().__init__(f"cannot import signup portal: {path}")


def load_portal_module() -> ModuleType:
    spec = importlib.util.spec_from_file_location("logh7_signup_portal_serve", PORTAL_PATH)
    if spec is None or spec.loader is None:
        raise PortalImportError(PORTAL_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def read_url(url: str) -> str:
    with urllib.request.urlopen(url, timeout=10) as response:
        return response.read().decode("utf-8")


def post_json(url: str, payload: Mapping[str, str]) -> tuple[int, str]:
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return response.status, response.read().decode("utf-8")
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode("utf-8")


class Logh7SignupPortalTests(unittest.TestCase):
    def test_register_account_sends_password_through_stdin_not_argv(self) -> None:
        portal = load_portal_module()
        captured: dict[str, object] = {}

        class FakeCompletedProcess:
            returncode = 0
            stdout = "created account: portaluser"
            stderr = ""

        def fake_run(args, **kwargs):  # noqa: ANN001, ANN202
            captured["args"] = args
            captured["input"] = kwargs.get("input")
            return FakeCompletedProcess()

        with patch.object(portal.subprocess, "run", side_effect=fake_run):
            result = portal.register_account("portaluser", "FlowPw17")

        self.assertEqual(result, {"ok": True, "account": "portaluser"})
        self.assertIn("--password-stdin", captured["args"])
        self.assertNotIn("FlowPw17", captured["args"])
        self.assertEqual(captured["input"], "FlowPw17")

    def test_signup_card_uses_viewport_constrained_width(self) -> None:
        portal = load_portal_module()
        html = str(getattr(portal, "INDEX_HTML"))
        card_css = html.split(".card {", 1)[1].split("}", 1)[0]

        self.assertIn("width:min(340px, calc(100vw - 32px));", card_css)
        self.assertIn("box-sizing:border-box", card_css)
        self.assertNotIn("width:340px", card_css)

    def test_api_signup_writes_target_account_db_and_duplicate_error_is_korean(self) -> None:
        with TemporaryDirectory(prefix="logh7-signup-portal-") as temp_dir:
            db_path = Path(temp_dir) / "accounts.sqlite"
            portal = load_portal_module()
            setattr(portal, "ACCOUNT_DB", db_path.resolve())
            handler = getattr(portal, "Handler")
            server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
            port = int(server.server_address[1])
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()

            try:
                base_url = f"http://127.0.0.1:{port}"
                html = read_url(f"{base_url}/")

                self.assertIn('lang="ko"', html)
                self.assertIn("회원가입", html)
                self.assertIn("계정", html)
                self.assertIn("비밀번호", html)
                self.assertIn("등록", html)
                self.assertNotIn("Create your account", html)
                self.assertNotIn(">Register<", html)

                status, body = post_json(
                    f"{base_url}/api/signup",
                    {"account": "portaluser", "password": "FlowPw17"},
                )
                created = json.loads(body)
                db = sqlite3.connect(db_path)
                try:
                    stored_account = db.execute(
                        "SELECT account FROM accounts WHERE account = ?",
                        ("portaluser",),
                    ).fetchone()
                finally:
                    db.close()

                self.assertEqual(status, 200)
                self.assertEqual(created, {"ok": True, "account": "portaluser"})
                self.assertEqual(stored_account, ("portaluser",))

                duplicate_status, duplicate_body = post_json(
                    f"{base_url}/api/signup",
                    {"account": "portaluser", "password": "FlowPw17"},
                )
                duplicate = json.loads(duplicate_body)

                self.assertEqual(duplicate_status, 400)
                self.assertEqual(duplicate["ok"], False)
                self.assertIn("이미 등록된 계정입니다", duplicate["error"])

                invalid_status, invalid_body = post_json(
                    f"{base_url}/api/signup",
                    {"account": "toolongpw", "password": "FlowPw17!"},
                )
                invalid = json.loads(invalid_body)
                self.assertEqual(invalid_status, 400)
                self.assertEqual(invalid["ok"], False)
                self.assertIn("비밀번호는 앞뒤 공백 없이 1~8자", invalid["error"])
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=10)
                server.server_close()
                thread.join(timeout=5)


if __name__ == "__main__":
    unittest.main()
