# C002 대체 경로: `/grid <cell>` 채팅 명령으로 서버 권위 이동

**날짜**: 2026-06-24  
**목표**: 클라이언트 클릭 FSM(`0x0b01 SelectGrid`)이 여전히 막혀 있으므로, 이미 증명된 서버 권위 `0x0b07 NotifyMovedGrid` 경로를 채팅 명령으로 우회한다.  
**상태**: 서버 로직 구현 + 단위테스트 통과. 실제 클라이언트 채팅 UI 주입은 기존 입력 레이어 한계로 미증명.

## 배경

C002(전략맵 함대 이동)의 근본 블로커는 클라이언트 낮:

- `FUN_004b68f0` 메인 틱의 mode2(전략맵) / mode0(메뉴) 배타 구조.
- 전략 위젯이 `DAT_02215e2c+0x14` 래치 루프에 등록되지 않음.

직접 클라이언트 함수를 invoke 하거나 패치하는 여러 시도가 크래시를 낳았다(요약 참조).  
대신 **서버가 직접 `0x0b07 NotifyMovedGrid`를 푸시**하는 경로는 이미 라이브에서 증명됐다([[logh7-server-authoritative-move-0b07-2026-06-23]]). 이 경로를 플레이어가 사용할 수 있게 하는 가장 빠른 방법은 채팅 명령 평백이다.

## 구현

`server/src/server/logh7-command-engine.mjs`의 `CommandGridChat 0x0f1c` 처리기에서 `/grid <cell>`를攔截한다.

```js
const gridMatch = parsed.text.match(/^\/grid\s+(\d+)$/i);
if (gridMatch) {
  const destCell = Number(gridMatch[1]);
  const fleets = state.listFleets();
  const fleet = fleets.find((f) => f.id === player.charId) ?? fleets[0] ?? null;
  if (!fleet) return { accept: false, reject: 'no-fleet', notifies: [] };
  state.moveFleet(fleet.id, destCell);
  const notify = buildNotifyMovedGridInner({ units: [{ unitId: fleet.id, cell: destCell }] });
  return { accept: true, units: [fleet.id], notifies: [{ inner: notify, target: 'all' }] };
}
```

- 플레이어 함대 선택: `player.charId`와 일치하는 fleet 우선, 없으면 세계의 첫 번째 fleet.
- 이동 후 `0x0b07`을 **전체 클라이언트에 브로드캐스트**(`target: 'all'`)하여 자신도 마커 이동을 본다.
- 일반 채팅 로그에는 남기지 않는다.

## 테스트

`server/tests/server/logh7-command-engine.test.mjs`에 신규 테스트 추가:

```
✔ processCommand /grid chat fallback moves player fleet via NotifyMovedGrid 0x0b07
```

전체 서버 테스트:

```
ℹ tests 1058
ℹ pass 1058
ℹ fail 0
```

## 라이브 시도

세션: `.omo/ui-explorer/c002-grid-fallback-20260624`  
실행 클라이언트: `G7MTClient.autologin-bootstrap-emp1.exe`  
환경: `LOGH_AUTHORITATIVE=1 LOGH_RELAY=1 LOGH_STRAT_GALAXY=1 ...`

1. 클라이언트 자동 로그인 → 로비 → 세션 선택 → 월드 진입 성공.
2. 전략맵 렌더 확인(스크린샷 `002-world-ready.png`).
3. 채팅 입력을 시도:
   - `Enter`, `/`, `Y` 등 단축키로 채팅창이 열리지 않음.
   - 하드웨어 키 이벤트(`keybd_event`)로 `/grid 8700` 입력 시도.
   - 하단 우측 패널 여러 좌표 클릭 시도.
4. 결과: 서버 trace에 `0x0f1c` inbound가 **한 번도 기록되지 않음**.

결론: 채팅 UI 자체가 기존 C002 마우스/키보드 입력 레이어 블로커와 동일한 한계를 가진다. 채팅 명령 서버 처리는 준비됐지만, **클이언트가 `0x0f1c`를 본냉할 수 있는 입력 경로**가 아직 없다.

## 다음 단계

1. 채팅 UI 열기/입력 방법을 RE 또는 원본 UI 레퍼런스로 확인.
2. 확인되면 동일한 `/grid` 명령으로 라이브 재검증:
   - `trace.jsonl`에 `0x0f1c` inbound + `0x0b07` outbound.
   - 전/후 스크린샷에서 함대 마커 이동.
3. 또는 채팅 대신 다른 클라이언트-발신 경로(예: 키보드 단축키 → `0x0b01` 직접)를 여는 것이 더 나을 수 있다.

## 관련 파일

- `server/src/server/logh7-command-engine.mjs`
- `server/tests/server/logh7-command-engine.test.mjs`
- `tools/grid_chat_type_probe.py` — 하드웨어 키 주입용 임시 프로브
- `.omo/ui-explorer/c002-grid-fallback-20260624/`
