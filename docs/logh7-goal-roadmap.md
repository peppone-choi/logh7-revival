# LOGH VII Revival — 구체화된 목표 + 로드맵 (2026-06-19)

> 한 줄 비전: **완전히 플레이 가능 + 리마스터 + 모딩 가능한 은하영웅전설 VII 부활.**
> 권위적 Node.js 서버가 디컴파일된 클라이언트가 파싱하는 와이어 레코드를 emit한다 → 게임플레이 데이터는 우리가 소유한다.
> 데이터 등급 원칙: **P0**(클라/와이어 바이너리 확정) · **P1**(공식 anchor: manual/PDF) · **P2**(IV-EX/넷마블 후보) · **P3**(절차/플레이스홀더). 추측을 원본으로 승격하지 않는다.

## 2026-06-20 상태 정정

이 문서의 2026-06-19 `source+0x320`/code-cave 단일해법 프레임은 낡았다. focus/current-cell
promotion은 진척됐지만 자연 `0x0b01`은 아직 열리지 않았다. 최신 C002 blocker는 `FUN_004fd100`
HUD mode/category gate, `FUN_004f6600` selection row hit-test, `FUN_004f6b00` category resolve,
`FUN_004f5cb0`/`FUN_004f58c0` command row dispatch다. 서버 전면 오픈은 이 live gate가 닫히기 전까지
불가다.

---

## 현재 상태 스냅샷 (검증된 것)

| 영역 | 상태 | 증거 |
|---|---|---|
| 권위적 서버 | ✅ 동작 | 744/744 테스트, `LOGH_AUTHORITATIVE=1`, world-state/command-engine/content-pack |
| 로그인→로비→세션→월드 진입 | ✅ 라이브 | trace 0x7000→0x0020→0x2006→0x0f02→0x0313/0x0315/0x0b09; `ui_explorer create-character` |
| 캐릭터 생성(8단계 폼·진영선택) | ✅ 라이브 | 세션 picker→진영선택 진입; buildInformationSessionInner packed 순차 |
| 한글화 | ✅ 끝장 | 전체 4528개 20.dat, 글로벌 949@0x1fffbe, korean.exe, 메뉴 한글 |
| 데이터 추출 | ✅ 전수 | 이름 725, 함선스탯 63, 갤럭시 80성계/281행성/6요새, 초상화 489 |
| **전략맵 인게임 명령(0x0b01)** | ❌ **미해결** | focus/current-cell과 unit linkage는 증명됐지만 자연 HUD selection/category/command-row admission 미통과. C002 최신 증거는 `g006-c002-command-admission-re-20260620.md` |
| 해상도/리마스터 도구 | ✅ 준비 | `logh7_graphics_config.py` (임의해상도+Path A/B+remaster), `logh7_texture_pipeline.py` |
| 모딩 스캐폴드 | ✅ 준비 | mod-loader(load-order/conflict/cap검증), content-caps, 예제 mod, 작위/봉토 시스템 |

---

## 마일스톤

### M1 — 실제로 플레이 가능 (in-world 조작) 🎯 최우선
모든 컨텐츠 향유의 **키스톤**. 월드 진입은 되지만 아직 함대에 명령을 못 내린다.

- **M1-1 [P0-02] 전략 명령 활성화 (0x0b01 CommandSelectGrid)** — ❌ HUD command-admission 미해결
  - `0x0325` post-load unit stream, PLAYER_INFO linkage, focus/current-cell promotion은 다음 단계로 넘어갈 만큼 증명됐다.
  - 남은 핵심은 자연 입력에서 HUD 선택목록 row가 보이고 hit-test되며, category가 resolve되고, command row가 `FUN_00581c80` SelectGrid factory로 dispatch되는지다.
  - 다음 라이브는 `tools/logh7_selectgrid_snapshot.py`로 `hudModeF4`, `hudState14e0`, selection row rect/gate, `listSelected189`, command row rect를 찍는다.
- **M1-2 in-world 함대 이동/교전 배선** — 0x0400 CommandMoveShip(in)/0x0423·0x0424(broadcast)/0xb09 grid-enter는 서버 구현됨; M1-1의 자연 SelectGrid 진입 뒤 클릭→명령 루프 라이브 검증 필요.

### M2 — 전 컨텐츠 작동 (내정·전투·성장)
- **M2-1 경제/내정 라이브 배선** — 0x031f base economy(population/food/budget) 서버 구현됨; `LOGH_*` 게이트 해제 + 라이브 검증.
- **M2-2 함선마스터(0x30b) 정적 emit** — +4 바이트 버그 수정 완료(744 테스트); `LOGH_STATIC_SHIPS=1` 0x030a 요청 분기 배선.
- **M2-3 작위/봉토(제국)·진급(功績)·인사발령** — imperial-titles 서버 모듈 + canon-posts 데이터 준비; 게임플레이 트리거 배선.
- **M2-4 우주전/지상전·NPC AI** — 전투엔진+NPC AI 구현됨(170 테스트); 전략맵 명령(M1)과 연결.

### M3 — 리마스터 (해상도·텍스처·폰트)
- **M3-1 해상도 (해상도 문제 해결)** — `logh7_graphics_config.py` 완비:
  - **현재 목표**: 4:3 필러박스가 아니라 시스템 해상도 캔버스 + 화면별 좌표/텍스처 재배치. 로비는 `lobby-res` + `lobby-native-layout`로 1920×1080 라이브 검증 완료.
  - **진단용 레거시**: `--widescreen`, `--pathA`, `--fill16x9`, `widescreen-ui.json`은 늘어짐 원인 격리용으로만 유지하고 기본 playable 스택에는 넣지 않는다.
- **M3-2 텍스처 업스케일** — `.tga` AI 업스케일/DXVK 래퍼, EXE 무침습; `logh7_texture_pipeline.py`.
- **M3-3 폰트** — 한글 + 비-심심 폰트; GDI CreateFontA DEFAULT_CHARSET, cp949 String.txt + charset 패치.

### M4 — 모딩 (패러독스급)
- **M4-1 콘텐츠 팩 로더** — mod-loader 구현됨(load-order/conflict/cap검증, `LOGH_MODS_DIR`); 문서화 + 더 많은 도메인 노출.
- **M4-2 초상화 슬롯 신규 생성** — TCF 패커(`logh7_tcf_pack.py`) 라운드트립 검증; face-atlas-expand 슬롯 스펙 → 라이브 적용.
- **M4-3 전 요소 데이터 주도** — 클라+서버 양쪽 데이터 외부화(카탈로그 ~600 메시지).

---

## 우선순위 다음 단계 (now → next)
1. **M1-1 HUD command-admission 스냅샷 라이브** — `tools/logh7_selectgrid_snapshot.py`로 선택목록 row hit, category resolve, command row, SelectGrid factory 진입 전 상태를 잡는다. code-cave/source+0x320 반복은 보류.
2. **M3-1 Path A 즉시 적용** — 무패치로 사용자 모니터 해상도 지원(늘어짐 없음). 지금 검증.
3. **M2-1 경제 라이브 배선** — 내정 화면 실데이터.
4. **M3-1 Path B 위젯스케일 패치** — 네이티브 16:9.

상태/증거의 단일 진실원천은 `docs/logh7-loop-state.md`. 실클라 표면 검증은 `tools/logh7_ui_explorer.py`.
