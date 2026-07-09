# LOGH VII Revival — 저장소 레이아웃 정리 (2026-06-26)

이 문서는 저장소 최상위(top-level) 항목을 **server-needed / client-needed / misc(deletable)** 세 갈래로
분류한다. 목적은 사용자가 큰 디렉터리를 직접 안전하게 가지치기(prune)할 수 있게 근거를 한 줄씩 제공하는 것.

> 안전 원칙: 이 정리에서는 **명백히 버려도 되는 최상위 스크래치 파일만** `misc/`로 옮겼다.
> 큰 needed 디렉터리(src/client/content/tools/tests/docs/.omo 등)는 **자동 이동하지 않았다.**
> 다른 에이전트가 src/server를 편집 중이고 `npm run test:server`가 그린이어야 하므로,
> 경로가 살아 있는 항목은 손대지 않았다.

## 이번 작업에서 `misc/`로 옮긴 것 (전부 untracked = git 추적 안 됨, 삭제해도 이력 영향 없음)

루트 스크래치/덤프 산출물:
- `.omc_*.txt` (33개) — 과거 세션 RE 디컴파일 덤프(redex 캐시 조각)
- `.tmp_*.c`, `.tmp_b78a0_calls.txt` (7개) — 임시 디컴파일 스니펫
- `.tmp_trace*.json` (3개) — 임시 라이브 trace 캡처
- `E:logh7-revival.omcf356/357.txt`, `E:logh7-revivalfactory_dump.txt` — 경로가 파일명에 박힌 깨진 산출물
- `C:UsersuserAppDataLocalTempfrida_out.txt` — frida 임시 출력(깨진 경로명)
- `logh7-revival.omoworkchatdebug.log` — 깨진 경로명 로그
- `_strategic_sim_decoded.txt` — 일회성 디코드 덤프
- `String.txt` — 루트의 빈(0B) 더미 덤프 (실데이터는 `.omo/work/.../exe/String.txt`)
- `ROOT-GIT-RETIRED.md` — 폐기 안내 메모
- `NUL`, `bash.exe.stackdump`, `popup_crop.png` — OS/셸 부산물 + 크롭 이미지 1장

`misc/_ai_tool_dirs/`로 옮긴 미참조 AI 툴 스킬 미러(설정/스크립트 어디서도 참조 안 됨, grep 확인):
- `.kiro/`, `.windsurf/`, `.agents/` — `skills/react-doctor` 미러만 들어있음
- `.kimi-code/` — `skills/logh7-*` + `react-doctor` + `AGENTS.md` 미러

→ `misc/`는 "나중에 통째로 삭제" 용 다락(attic). 삭제 전 한 번 훑어보면 됨.

## 남겨둔 것 + 이유

### server-needed
| 항목 | 이유 |
|---|---|
| `src/` | 서버/클라 소스 본체 (가드레일·라이브 편집 중) |
| `content/` | galaxy.json 등 서버 권위 콘텐츠 데이터 |
| `tools/` | 서버 빌드·와이어·RE·라이브 드라이버 (`logh7_*.py/.mjs`) |
| `tests/` | 테스트 스위트 (`npm run test:server` = **1151 PASS**) |
| `package.json`, `package-lock.json` | npm 스크립트/의존성 |
| `node_modules/` | 설치된 의존성 |
| `drizzle/`, `drizzle.config.ts` | Drizzle ORM 마이그레이션/설정 (영속성) |
| `.env`, `.env.example` | 런타임 환경설정 |
| `start_server.py`, `start-server.bat` | 서버 기동 진입점 |
| `logh7-runtime/` | 런타임 state 디렉터리 (서버 영속 상태) |
| `tsconfig.json` | TS 컴파일 설정 |

### client-needed
| 항목 | 이유 |
|---|---|
| `client/` | 실제 D3D8 게임 클라이언트 + 추출 에셋 (1.5G) |
| `index.html`, `vite`/`playwright.config.js` | 대시보드 프런트엔드 빌드/E2E |
| `fonts/` | Pretendard 등 클라 한글화 폰트 |
| `mods/` | 모드 콘텐츠 (example-add-officer 등) |
| `play_logh7.py`, `play-logh7.bat`, `play-logh7.spec` | 클라 실행 런처/PyInstaller spec |
| `DESIGN.md` | 운영 대시보드 디자인 스펙 (현행·클라 UI 근거) |
| `artifacts/` | 빌드 산출물 (가드레일) |

### 공통 인프라 (server+client 양쪽 needed)
| 항목 | 이유 |
|---|---|
| `docs/` | 핸드오프·RE 리포트·이 레이아웃 문서 (가드레일) |
| `.omo/` | Ghidra 디컴파일 인덱스 + 작업 산출물 (17G, RE 권위 소스) |
| `.claude/` | OMC 스킬/에이전트/커맨드 (가드레일, 활성) |
| `.codex/` | 루프 서브에이전트 정의 원본 — `docs/logh7-loop-engineering.md`·`.claude/agents/logh7-loop-*.md`가 **참조함** (이동 금지) |
| `.debug-journal.md` | RE 디버그 저널 (563K, 핵심 RE 이력 — 유지) |
| `.git`, `.gitignore`, `.gitattributes` | 버전관리 (가드레일) |
| `AGENTS.md`, `README.md`, `CLAUDE.md` | 프로젝트 지침 (가드레일) |

### misc 후보 (이동 안 함 — 사용자 판단 필요)
| 항목 | 이유 / 주의 |
|---|---|
| `server/` | **루트의 별도 중첩 git repo**(자체 `.git`/package.json/tests 보유, 부모는 untracked). 워크트리 아님. 다른 에이전트가 쓰는 스냅샷일 수 있어 **이동 안 함** — 사용자가 사용여부 확인 후 정리 권장 |
| `run_g001_cycle*.sh` (7개) | g001-c002 fleetmove 세션용 일회성 실행 스크립트(untracked). 해당 작업 종료 시 `misc/`로 보내도 무방 |
| `g001-c002-fleetmove-20260623/` | 위 세션의 로그/trace/shots 산출물. 보존 불필요해지면 삭제 가능 |
| `.omc/` (200M) | OMC 상태/캐시. 재생성 가능하나 활성 세션 상태 포함 가능 — 비활성 확인 후 정리 |
| `.codegraph/` (42M), `.bkit/` (17M) | 외부 툴(코드그래프/bkit) 캐시·플러그인 데이터. 해당 툴 미사용 시 삭제 가능 |
| `.ruff_cache/`, `__pycache__/` | 파이썬 린트/바이트코드 캐시 — 언제든 재생성, 삭제 안전 |
| `build/`, `dist/`, `test-results/` | 빌드/테스트 산출물 — 재생성 가능, 삭제 안전 (단 `artifacts/`는 가드레일이라 유지) |

## 검증 (이동 후)
- `npm run test:server` → **1151 PASS / 0 FAIL** (경로 손상 없음 확인)
- `python -c "import tools.logh7_launch_config"` → exit 0 (정상 임포트)
- `python -c "import tools.logh7_ui_explorer"` → exit 0 (라이브 래퍼 정상 임포트)

> needed 항목은 하나도 옮기지 않았다. `misc/`로 간 것은 전부 untracked 스크래치/덤프와 미참조 스킬 미러뿐.
