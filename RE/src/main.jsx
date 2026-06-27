import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { roadmapData } from './roadmapData.js';
import './styles.css';

if (import.meta.env.DEV) {
  const reactInspectionEnabled =
    new URLSearchParams(window.location.search).has('inspect') ||
    localStorage.getItem('logh7.react.inspect') === '1';

  if (reactInspectionEnabled) {
    void import('react-grab');
    void import('react-scan').catch(() => undefined);
  }
}

const ADMIN_ENDPOINT_KEY = 'logh7.admin.endpoint';
const ADMIN_TOKEN_KEY = 'logh7.admin.token';

function stateLabel(state) {
  if (state === 'done') return '완료';
  if (state === 'active') return '진행';
  return '대기';
}

function App() {
  const [endpoint, setEndpoint] = useState(() => localStorage.getItem(ADMIN_ENDPOINT_KEY) ?? roadmapData.defaultAdminEndpoint);
  const [adminToken, setAdminToken] = useState(() => localStorage.getItem(ADMIN_TOKEN_KEY) ?? '');
  const [adminState, setAdminState] = useState({ status: 'idle', data: null, error: null, checkedAt: null });
  const [autoRefresh, setAutoRefresh] = useState(false);

  const saveEndpoint = (value) => {
    setEndpoint(value);
    localStorage.setItem(ADMIN_ENDPOINT_KEY, value);
  };

  const saveAdminToken = (value) => {
    setAdminToken(value);
    localStorage.setItem(ADMIN_TOKEN_KEY, value);
  };

  const refreshAdmin = useCallback(async () => {
    setAdminState((prev) => ({ ...prev, status: 'loading', error: null }));
    try {
      const headers = adminToken ? { authorization: `Bearer ${adminToken}` } : {};
      const response = await fetch(endpoint, { cache: 'no-store', headers });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      setAdminState({
        status: 'online',
        data,
        error: null,
        checkedAt: new Date().toLocaleTimeString('ko-KR', { hour12: false }),
      });
    } catch (error) {
      setAdminState({
        status: 'offline',
        data: null,
        error: error instanceof Error ? error.message : String(error),
        checkedAt: new Date().toLocaleTimeString('ko-KR', { hour12: false }),
      });
    }
  }, [adminToken, endpoint]);

  useEffect(() => {
    void refreshAdmin();
  }, [refreshAdmin]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const handle = window.setInterval(() => {
      void refreshAdmin();
    }, 5000);
    return () => window.clearInterval(handle);
  }, [autoRefresh, refreshAdmin]);

  const adminCounts = adminState.data?.counts ?? null;
  const persistence = adminState.data?.persistence ?? null;
  const serverStatus = useMemo(() => {
    if (adminState.status === 'online') return { label: '어드민 연결됨', tone: 'good' };
    if (adminState.status === 'loading') return { label: '어드민 확인 중', tone: 'warn' };
    return { label: '어드민 오프라인', tone: 'danger' };
  }, [adminState.status]);

  return (
    <main className="app-shell">
      <section className="top-band" aria-labelledby="page-title">
        <div className="top-copy">
          <p className="eyebrow">LOGH VII Revival</p>
          <h1 id="page-title">{roadmapData.headline}</h1>
          <p className="summary">{roadmapData.summary}</p>
        </div>
        <div className="progress-panel" aria-label="종합 진행률">
          <div className="progress-dial" style={{ '--percent': `${roadmapData.overallPercent}%` }}>
            <span>{roadmapData.overallPercent}%</span>
          </div>
          <div>
            <strong>종합 진행률</strong>
            <p>{roadmapData.progressNote}</p>
          </div>
        </div>
      </section>

      <section className="indicator-row" aria-label="현재 판정">
        {roadmapData.indicators.map((item) => (
          <article className={`metric metric-${item.tone}`} key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </article>
        ))}
      </section>

      <section className="main-grid" aria-label="개발 현황">
        <section className="panel panel-wide" aria-labelledby="roadmap-title">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Roadmap</p>
              <h2 id="roadmap-title">큰 로드맵</h2>
            </div>
            <span className="date-tag">업데이트 {roadmapData.updatedAt}</span>
          </div>
          <div className="milestone-grid">
            {roadmapData.milestones.map((milestone) => (
              <article className="milestone" key={milestone.title}>
                <div className="milestone-head">
                  <div>
                    <h3>{milestone.title}</h3>
                    <span>{milestone.status}</span>
                  </div>
                  <strong>{milestone.percent}%</strong>
                </div>
                <div className="bar" aria-label={`${milestone.title} 진행률`}>
                  <span style={{ width: `${milestone.percent}%` }} />
                </div>
                <ul className="check-list">
                  {milestone.items.map((item) => (
                    <li className={`check-${item.state}`} key={item.text}>
                      <span>{stateLabel(item.state)}</span>
                      {item.text}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="panel" aria-labelledby="admin-title">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">Admin</p>
              <h2 id="admin-title">게임 세션 상태</h2>
            </div>
            <span className={`status-pill status-${serverStatus.tone}`}>{serverStatus.label}</span>
          </div>
          <label className="field-label" htmlFor="admin-endpoint">어드민 API</label>
          <div className="endpoint-row">
            <input
              id="admin-endpoint"
              value={endpoint}
              onChange={(event) => saveEndpoint(event.target.value)}
              spellCheck="false"
            />
            <button type="button" onClick={refreshAdmin}>새로고침</button>
          </div>
          <label className="field-label token-label" htmlFor="admin-token">어드민 토큰</label>
          <input
            id="admin-token"
            type="password"
            value={adminToken}
            onChange={(event) => saveAdminToken(event.target.value)}
            autoComplete="off"
            spellCheck="false"
          />
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(event) => setAutoRefresh(event.target.checked)}
            />
            5초마다 갱신
          </label>
          <SessionSummary counts={adminCounts} persistence={persistence} state={adminState} />
        </section>

        <section className="panel" aria-labelledby="content-title">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">Content</p>
              <h2 id="content-title">콘텐츠 커버리지</h2>
            </div>
          </div>
          <div className="coverage-grid">
            {roadmapData.contentCoverage.map((item) => (
              <article className="coverage" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <p>{item.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="panel" aria-labelledby="priority-title">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">Queue</p>
              <h2 id="priority-title">오픈 전 우선순위</h2>
            </div>
          </div>
          <ol className="priority-list">
            {roadmapData.priorityQueue.map((item) => (
              <li key={item.title}>
                <span>{item.rank}</span>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="panel panel-wide" aria-labelledby="ops-title">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">Ops</p>
              <h2 id="ops-title">서버 공지와 EXE 확인</h2>
            </div>
          </div>
          <div className="ops-grid">
            <article>
              <h3>서버 공지</h3>
              <p>ASCII는 CLI 문자열로, 한글은 CP949 hex로 넣습니다. 어드민 포트를 열면 다음 로그인부터 공지를 교체할 수 있습니다.</p>
              <code>{roadmapData.serverNotice.cli}</code>
              <dl>
                <div><dt>환경변수</dt><dd>{roadmapData.serverNotice.env}</dd></div>
                <div><dt>한글 CLI</dt><dd>{roadmapData.serverNotice.cp949Cli}</dd></div>
                <div><dt>어드민</dt><dd>{roadmapData.serverNotice.admin}</dd></div>
                <div><dt>대체키</dt><dd>{roadmapData.serverNotice.fallbackEnv}</dd></div>
                <div><dt>전송 위치</dt><dd>{roadmapData.serverNotice.route}</dd></div>
              </dl>
            </article>
            <article>
              <h3>게임 확인용 EXE</h3>
              <p>기본 playable 스택은 레터박스가 아니라 1920x1080 네이티브 로비 캔버스와 재배치 좌표를 포함합니다.</p>
              <code>{roadmapData.exe.buildCommand}</code>
              <dl>
                <div><dt>결과물</dt><dd>{roadmapData.exe.expectedClient}</dd></div>
                <div><dt>런처 배포</dt><dd>{roadmapData.exe.launcherCommand}</dd></div>
                <div><dt>SHA256</dt><dd>{roadmapData.exe.sha256}</dd></div>
              </dl>
            </article>
          </div>
        </section>

        <section className="panel panel-wide" aria-labelledby="correction-title">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">Notes</p>
              <h2 id="correction-title">이번 정리에서 반영한 보정</h2>
            </div>
          </div>
          <ul className="note-list">
            {roadmapData.corrections.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
      </section>
    </main>
  );
}

function SessionSummary({ counts, persistence, state }) {
  if (state.status === 'loading') {
    return <p className="admin-message">세션 상태를 읽는 중입니다.</p>;
  }
  if (state.status !== 'online') {
    return (
      <p className="admin-message">
        서버가 꺼져 있거나 어드민 포트가 열려 있지 않습니다.
        {state.error ? ` 마지막 오류: ${state.error}` : ''}
      </p>
    );
  }

  return (
    <div className="session-grid" aria-label="세션 카운터">
      {[
        ['플레이어', counts.players],
        ['함선', counts.ships],
        ['성계', counts.systems],
        ['함대', counts.fleets],
        ['인물', counts.characters],
        ['경제 행성', counts.economyPlanets],
        ['저장소', persistence?.backend ?? '없음'],
      ].map(([label, value]) => (
        <article key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </article>
      ))}
      <p className="checked-at">마지막 확인 {state.checkedAt}</p>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
