import { createServer } from 'node:http';

import { isValidAccountLabel } from './logh7-account-registry.mjs';
import { buildGin7Credential } from './logh7-gin7-credential.mjs';

const BODY_LIMIT_BYTES = 16 * 1024;

export function isClientSignupPassword(password) {
  return (
    typeof password === 'string'
    && password.length >= 1
    && password.length <= 8
    && password.trim() === password
    && /^[\x20-\x7e]+$/.test(password)
  );
}

function writeJson(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(`${JSON.stringify(body, null, 2)}\n`);
}

function writeHtml(response, status, html) {
  response.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(html);
}

function readRequestJson(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    request.on('data', (chunk) => {
      total += chunk.length;
      if (total > BODY_LIMIT_BYTES) {
        reject(new Error('request body too large'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text.length === 0 ? {} : JSON.parse(text));
      } catch {
        reject(new Error('invalid JSON body'));
      }
    });
    request.on('error', reject);
  });
}

function publicSignupHtml({ serverName }) {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${serverName} 회원가입</title>
  <style>
    :root { color-scheme: dark; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #101418; color: #f5f7fa; }
    main { width: min(420px, calc(100vw - 32px)); }
    h1 { font-size: 24px; font-weight: 700; margin: 0 0 20px; letter-spacing: 0; }
    form { display: grid; gap: 14px; padding: 22px; border: 1px solid #2c3844; background: #171e25; border-radius: 8px; }
    label { display: grid; gap: 7px; font-size: 13px; color: #b8c3cc; }
    input { box-sizing: border-box; width: 100%; height: 42px; border-radius: 6px; border: 1px solid #3a4855; background: #0f1419; color: #fff; padding: 0 12px; font-size: 15px; }
    button { height: 42px; border: 0; border-radius: 6px; background: #d8b35a; color: #14100a; font-size: 15px; font-weight: 700; cursor: pointer; }
    output { min-height: 22px; font-size: 13px; color: #d9e2ea; }
  </style>
</head>
<body>
  <main>
    <h1>${serverName}</h1>
    <form id="signup">
      <label>계정 ID<input name="account" autocomplete="username" maxlength="32" required></label>
      <label>비밀번호<input name="password" type="password" autocomplete="new-password" maxlength="8" required></label>
      <button type="submit">가입</button>
      <output id="result"></output>
    </form>
  </main>
  <script>
    const form = document.querySelector('#signup');
    const result = document.querySelector('#result');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      result.value = '';
      const body = Object.fromEntries(new FormData(form).entries());
      const response = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      result.value = payload.ok ? '가입 완료. 클라이언트에서 바로 로그인할 수 있습니다.' : (payload.error || '가입 실패');
    });
  </script>
</body>
</html>`;
}

function sessionSummary(sessionRegistry) {
  return typeof sessionRegistry?.listSessions === 'function'
    ? sessionRegistry.listSessions().map((session) => ({
      sessionId: session.sessionId,
      sessionName: session.sessionName,
      status: session.status,
      beginDay: session.beginDay,
    }))
    : [];
}

function validateCredentials(body) {
  const account = typeof body?.account === 'string' ? body.account.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!isValidAccountLabel(account)) return { ok: false, status: 400, error: 'invalid account id' };
  if (!isClientSignupPassword(password)) {
    return {
      ok: false,
      status: 400,
      error: 'password must be 1-8 printable ASCII characters without surrounding spaces',
    };
  }
  return { ok: true, account, password };
}

export async function startPublicAccountWeb({
  host = '127.0.0.1',
  port = 47901,
  registry,
  sessionRegistry = null,
  serverName = '이제르론 서버',
} = {}) {
  if (!registry || typeof registry.register !== 'function' || typeof registry.verify !== 'function') {
    throw new Error('public signup requires a live account registry');
  }

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', `http://${host}:${port}`);
    try {
      if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/signup')) {
        writeHtml(response, 200, publicSignupHtml({ serverName }));
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/sessions') {
        writeJson(response, 200, { ok: true, sessions: sessionSummary(sessionRegistry) });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/signup') {
        const body = await readRequestJson(request);
        const validated = validateCredentials(body);
        if (!validated.ok) {
          writeJson(response, validated.status, { ok: false, error: validated.error });
          return;
        }
        if (registry.has(validated.account)) {
          writeJson(response, 409, { ok: false, error: 'account already exists' });
          return;
        }
        const credential = buildGin7Credential({ account: validated.account, password: validated.password });
        registry.register(validated.account, credential, { createdAt: new Date().toISOString() });
        if (typeof registry.setSelectedSession === 'function') registry.setSelectedSession(validated.account, 1);
        writeJson(response, 201, {
          ok: true,
          account: validated.account,
          selectedSessionId: 1,
          loginReady: true,
          sessions: sessionSummary(sessionRegistry),
        });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/login') {
        const body = await readRequestJson(request);
        const validated = validateCredentials(body);
        if (!validated.ok) {
          writeJson(response, validated.status, { ok: false, error: validated.error });
          return;
        }
        const credential = buildGin7Credential({ account: validated.account, password: validated.password });
        const result = registry.has(validated.account)
          ? registry.verify(validated.account, credential)
          : registry.dummyVerify(credential);
        if (!result.ok) {
          writeJson(response, 401, { ok: false, error: 'authentication failed' });
          return;
        }
        writeJson(response, 200, {
          ok: true,
          account: validated.account,
          selectedSessionId: registry.getSelectedSession?.(validated.account) ?? 1,
          sessions: sessionSummary(sessionRegistry),
        });
        return;
      }
      writeJson(response, 404, { ok: false, error: 'not found' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeJson(response, message === 'request body too large' ? 413 : 400, { ok: false, error: message });
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  const boundPort = typeof address === 'object' && address !== null ? address.port : port;

  return {
    host,
    port: boundPort,
    url: `http://${host}:${boundPort}/signup`,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
  };
}
