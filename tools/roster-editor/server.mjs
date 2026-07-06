// LOGH VII 인물 데이터 편집기 로컬 서버 — 의존성 없음(node:http)
// 초상화 PNG 서빙 + 로스터 JSON 자동저장(원자적 write). 단일 사용자 로컬 전용.
// 실행: node tools/roster-editor/server.mjs  → http://localhost:8790
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const GEN = path.join(ROOT, 'server', 'content', 'generated');
const ROSTER = path.join(GEN, 'canon-roster-numbered.json');
const PORTRAITS = path.join(GEN, 'portraits');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8790;

const MIME = { '.png': 'image/png', '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8' };

function send(res, code, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

// 원자적 저장: .tmp 기록 후 rename (데이터 파일 손상 방지)
function saveRoster(jsonText) {
  JSON.parse(jsonText); // 유효성 검증 — 깨진 본문이면 여기서 throw
  const tmp = ROSTER + '.tmp';
  fs.writeFileSync(tmp, jsonText, 'utf8');
  fs.renameSync(tmp, ROSTER);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;

  if (p === '/' || p === '/index.html') {
    return send(res, 200, fs.readFileSync(path.join(HERE, 'index.html')), MIME['.html']);
  }
  if (p === '/api/roster' && req.method === 'GET') {
    return send(res, 200, fs.readFileSync(ROSTER), MIME['.json']);
  }
  if (p === '/api/roster' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try { saveRoster(body); send(res, 200, '{"ok":true}', MIME['.json']); }
      catch (e) { send(res, 400, JSON.stringify({ ok: false, error: String(e) }), MIME['.json']); }
    });
    return;
  }
  if (p === '/api/candidates' && req.method === 'GET') {
    // 자동완성 후보(참고용, 비권위): 행성/성계명(한글) + 고유기함 3D 모델
    // 인명(rival)은 클라가 로스터에서, 기함 대분류는 SCHEMA 하드 select라 여기서 안 준다.
    const out = { planets: [], shipmodels: [], flagships: [] };
    try {
      // 위치/성계 datalist = 실제 게임 추출본 constmsg.dat group 0x18(id 1403-1491, HFWR cp932).
      // galaxy.json(매뉴얼 PDF)·translit ko(conf 0.5)는 비권위 → 캐논 일본어를 앵커로 쓰고,
      // 음역 한글은 있으면 힌트로만 병기("한글 (日本語)"). 전문가가 캐논 한글을 확정.
      const cm = JSON.parse(fs.readFileSync(path.join(GEN, 'msgdat-constmsg.json'), 'utf8'));
      const rd = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'content', 'names', rel), 'utf8'));
      const tl = new Map([...rd('planets-ko.json'), ...rd('systems-ko.json')].map((x) => [x.jp, x.ko]));
      const list = [];
      for (let id = 1403; id < 1492; id++) {
        const ja = cm.records[id];
        if (!ja) continue;
        const ko = tl.get(ja);
        list.push(ko && ko !== ja ? `${ko} (${ja})` : ja);
      }
      out.planets = [...new Set(list)];
    } catch {}
    try {
      // 정본 고유 기함명 45종(schema.json ship_classes 유래). 한글명을 datalist로.
      const fg = JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'content', 'names', 'flagships-ko.json'), 'utf8'));
      out.flagships = [...new Set((fg.flagships || []).map((x) => x.ko).filter(Boolean))];
    } catch {}
    try {
      // 고유 기함 지정용 3D 함선 모델 목록(코드+진영 태그). 코드→고유기함명 매핑은 미RE.
      const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'content', 'extracted', 'model-ship.json'), 'utf8'));
      out.shipmodels = [...new Set(m.map((x) => x.faction ? `${x.name} (${x.faction})` : x.name).filter(Boolean))];
    } catch {}
    return send(res, 200, JSON.stringify(out), MIME['.json']);
  }
  if (p.startsWith('/portraits/')) {
    const f = path.join(PORTRAITS, path.basename(p));
    if (fs.existsSync(f)) return send(res, 200, fs.readFileSync(f), MIME['.png']);
    return send(res, 404, 'not found');
  }
  send(res, 404, 'not found');
});

server.listen(PORT, () => console.log(`roster-editor: http://localhost:${PORT}  (roster=${ROSTER})`));
