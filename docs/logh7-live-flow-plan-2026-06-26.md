# LOGH VII 라이브 검증 계획 — 처음 로그인 → 캐릭 생성 → 월드 진입 전체 (2026-06-26)

사용자 임무: "처음 로그인부터 캐릭터 생성, 월드 진입을 거쳐 전체 확인."
이 문서 = 재구조화(2026-06-26) 이후 경로를 반영한 **단계별 라이브 검증 시나리오** + 깨진 경로 식별.

라이브 표준 근거: `docs/logh7-live-test-standard.md` (포트 47900 고정 · 수동 로그인 · canonical EXE 992dc7e2 · accept-any · node 안 죽임).

---

## 0. 재구조화로 인한 경로 유효성 점검 (★실행 전 반드시 해소)

재구조화로 `tools/` → `RE/tools/`, dev 워크스페이스 → `RE/` 로 이동했으나 **`.omo`는 루트 `E:/logh7-revival/.omo`에 그대로 남았다**(restructure 문서 §.omo 처리: 핸들 점유 + 수백 참조 위험으로 루트 유지 결정). 그런데 라이브 도구의 `REPO_ROOT`는 `RE/`로 해석된다 → **`.omo` 참조 전부 깨짐.**

| 경로/항목 | 도구가 기대하는 위치 | 실제 위치 | 상태 |
|---|---|---|---|
| `REPO_ROOT` (`logh7_client_exe.py:10` parents[1]) | `RE/` | — | RE/ 로 해석됨 |
| canonical playable EXE | `RE/.omo/work/logh7-ko-overlay/exe/G7MTClient.playable.exe` | `E:/logh7-revival/.omo/...`(루트) | ❌ **깨짐** |
| installed EXE | `RE/.omo/work/logh7-installed/exe/G7MTClient.exe` | 루트 `.omo/...` | ❌ **깨짐** |
| Ghidra 인덱스 (redex) | `RE/.omo/ghidra/export/G7MTClient` | 루트 `.omo/...` | ❌ **깨짐** |
| 라이브 세션 `.omo/ui-explorer/live` | `RE/.omo/ui-explorer/live` | (생성 시 RE/ 아래) | ⚠ 신규생성은 되나 루트 `.omo`와 분리됨 |
| trace `.omo/ui-explorer/live/trace.jsonl` | `RE/.omo/...` | — | ⚠ 위와 동일 |
| 서버 entry `src/server/logh7-server.mjs` | `RE/src/server/...` | `RE/src/server/...` **존재**(이주 스냅샷) | ✅ 단 **캐논은 `server/`** (drift 주의) |
| `content/galaxy.json` 등 | `RE/content/...` | `RE/content/...` 존재 | ✅ (스냅샷) |
| `python -m tools.X` 네임스페이스 | `RE/tools/` (no `__init__.py`=암묵 네임스페이스) | 존재 | ✅ |

**유효성 결론**:
- `bash RE/tools/logh7_live_env.sh start` 를 **`cd RE`** 에서 실행하면 서버 기동(`RE/src/server`)·네임스페이스·content 는 동작하나, **EXE 해석이 `RE/.omo`를 못 찾아 클라 실행 실패**한다.
- **해소(택1, 비파괴 우선)**:
  - **(A 권장)** `RE/.omo` → 루트 `E:/logh7-revival/.omo` 로 향하는 **junction/symlink** 생성:
    `cmd //c mklink //J "E:\logh7-revival\RE\.omo" "E:\logh7-revival\.omo"` (디렉터리 정션, 핸들 점유 무관). 이러면 도구 0수정.
  - (B) `logh7_client_exe.py`의 `REPO_ROOT`를 루트로 재지정(`parents[2]`)하고 `src/server`/`content`만 RE 상대 유지 — 부분 수정이라 회귀 위험.
- **서버 drift 주의**: RE/src/server 는 **이주 시점 스냅샷**. 캐논 검증/수정은 `server/`(`cd server && node --test tests/server/*.test.mjs`). 라이브가 RE/src/server 로 서버를 띄우면 **server/ 의 최신 수정이 라이브에 반영 안 될 수 있다** → 라이브 직전 `server/src/server` → `RE/src/server` 재동기화하거나, ui_explorer `--server-root E:/logh7-revival/server` 로 캐논 서버를 직접 가리키는 것을 권장(단 `server/`에 `.omo` 세션/EXE 없음 → EXE는 여전히 정션 필요).

> ★ 메인(운영자)은 라이브 시작 전 위 (A) 정션을 1회 생성하고, `git`/`node` 프로세스를 죽이지 않는다(라이브 표준).

---

## 1. 검증 시나리오 (단계별 · trace 코드 · 스크린샷 기대값)

전제: `cd E:/logh7-revival/RE` (live_env.sh 의 `cd ..` 기준). 포트 47900. 표준 ENV(accept-any, LOGH_SEED_CANON_NPCS 등)는 launch_config 가 자동 주입.

### S0. 사전 (자동화 가능)
- `RE/.omo` 정션 확인/생성(위 §0-A).
- (권장) 캐논 서버 동기화: `server/src/server` 최신을 `RE/src/server`에 반영, 또는 `--server-root .../server`.
- `bash tools/logh7_live_env.sh stop` 로 잔여 G7MTClient 정리(node 보존).

### S1. 서버+클라 기동 (자동화 가능)
- 실행: `bash tools/logh7_live_env.sh start`
- 동작: `taskkill G7MTClient` → serve-auth(47900, 표준 ENV, trace 시작) → canonical playable 클라(창모드) 기동.
- 기대: 클라 창 표시, BOTHTEC 스플래시. **★스플래시 통과까지 ~30초 대기**(logh7-live 스킬: 포그라운드 의존). node 살아있음.
- 스크린샷(`shot --label 01-login`): 640×480 창모드 **로그인 폼**(프레임+ID/PW칸+로그인/종료 버튼 중앙정렬).

### S2. 수동 로그인 (★사람이 직접 — 자동화 불가)
- 사람이 ID/PW 아무거나 입력 → 로그인 클릭(accept-any 통과).
- trace 기대: `0x7000`(GIN7 자격) → `0x7001`(lobby redirect).
- `wait --code 0x7001` 후 `shot --label 02-lobby`: 로비 메뉴(새 캐릭/추첨/세션/정보). 로그인 후 게임이 자동 1920 풀스크린 전환.

### S3. 캐릭터 1 생성 (수동, 한글 이름)
- 새 캐릭 → 세션 picker → 세션 더블클릭 → 진영선택 → 초상화 선택 A → 이름 입력(한글) → 진행.
- trace: `0x2006`(세션레코드) → `0x0200`(세션연결) → `0x1008`(CommandCreateCharacter, 캐릭1).
- ⚠ **관찰 포인트(한글 첫글자 씹힘, 핸드오프 #2)**: 이름칸 **포커스 직후 첫 1키가 소모**된다(자동로그인은 compensate_first로 보정하나 수동은 보정 없음). **첫 글자를 의도적으로 1회 더 누르거나, 더미 키 1타 후 본 입력** 권장. 입력 위젯은 확정 음절만 렌더(끝음절=다음 자음+백스페이스로 확정). ACP=949 전제(UTF-8 베타 OFF) — 모지바케면 ACP 의심.
- `shot --label 03-char1-name`: 캐릭1 이름(예 "로엔그람") 클린 렌더, 모지바케 0.

### S4. 캐릭터 2 생성 (수동, **다른** 이름/초상화)
- 로비로 복귀 → 새 캐릭 다시 → **다른 초상화 B** + **다른 이름** 입력.
- trace: 두 번째 `0x1008`(캐릭2). 서버는 distinct id(=2) 생성·영속(`characters=[1,2]`) — 핸드오프 #3 서버레이어 RESOLVED(테스트 헬퍼 버그였음, 프로덕션 무변경).
- `shot --label 04-char2-name`: 캐릭2 이름/초상화가 캐릭1과 **다름**.

### S5. picker 2 distinct 카드 확인 (★캐릭선택 라이브 미확정 — 핵심 검증)
- 세션/캐릭 picker 로 이동(`0x2004` 카드 목록).
- trace: `0x2004`(세션/캐릭 카드 스트림 — **컴팩트 순차**, 이름길이 가변. 고정 스트라이드 아님).
- `shot --label 05-picker`: **2개 distinct 카드**(이름 2개 다름 + 초상화 2개 다름) 렌더.
- ★ **이것이 loop-state 의 "라이브 미확정" 항목**: 서버는 영속 length===2 독립 입증됐으나 **실클라 2카드 렌더는 미검증**. "한 캐릭터만" 버그가 클라단에 남았는지 여기서 판정.

### S6. 월드 진입 (수동 트리거 → 서버푸시)
- picker 에서 최근 생성 캐릭(캐릭2) 선택 → 게임시작.
- trace: `0x0200`→…→ **`0x0f02`**(월드 진입 완료). `wait --code 0x0f02 --timeout 50`.
- `shot --label 06-world`: 전략맵(다색 항성 + 그리드 + HUD), NPC 위계 시드(자동황제 아님).

### S7. 0x0323 최근 캐릭 이름 확인 (★최종 검증)
- trace: 월드 진입 시 `0x0323`(캐릭터 레코드) 캡처. active 캐릭 = **최근 생성(createdAt 최신)=캐릭2**.
- 기대: `0x0323` 이름 필드 = **캐릭2 이름**(캐릭1 아님). 0x0204/0x0323 active 스폰이 최근캐릭이어야 "옛 강제 캐릭 진입"(한 캐릭터만) 버그 부재.
- `trace` 덤프에서 0x0323 byte offset 이름(클라파서 확정 오프셋, logh7-wire)으로 확인. 모지바케 0.

### S8. 종료 (자동화 가능)
- `bash tools/logh7_live_env.sh stop`: G7MTClient kill + **canonical SHA(992dc7e2) 복원 검증**(라이브 표준 필수). node 보존.

---

## 2. 미확정/관찰 포인트 요약

| 항목 | 상태 | 어디서 판정 |
|---|---|---|
| 캐릭선택 "2 distinct 카드" | 서버 RESOLVED / **라이브 미확정** | S5 picker shot |
| 최근캐릭 월드진입(옛 강제캐릭 아님) | 서버 RESOLVED / **라이브 미확정** | S7 0x0323 이름 |
| 한글 이름 첫글자 씹힘 | 버그 존재(핸드오프 #2) | S3/S4 입력 — 첫키 보정 필요 |
| 한글 모지바케 | ACP=949면 클린(검증완료) | S3/S4/S7 — 베타 OFF 확인 |
| 풀스크린 전환 | 정상(이번 세션 확정) | S2 이후 |

---

## 3. 메인이 수동 로그인 후 자동화 가능한 범위

- **자동화 가능**: S0 정션/동기화 · S1 기동 · `wait`(코드 폴링) · `shot`(라벨 캡처) · `trace`(덤프) · S8 stop+SHA복원. → 라이브 골격 스크립트화 가능.
- **수동 필수(D3D8 포커스 의존, 자동 클릭 신뢰불가)**: S2 로그인 클릭 · S3~S6 의 캐릭생성 폼 클릭/한글 입력/세션 더블클릭/게임시작 클릭. 특히 **한글 이름칸 첫글자 씹힘 보정**은 사람이 직접.
- **권장 운용**: 메인이 사람 입력 단계 사이마다 `wait --code <trace> → shot → trace` 를 자동 삽입(예: 로그인 후 `wait 0x7001`, 캐릭2 생성 후 `wait 0x1008` 2회, 진입 후 `wait 0x0f02` → 0x0323 덤프). 사람은 클릭/타이핑만, 캡처·검증은 자동.
