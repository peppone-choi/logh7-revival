# LOGH VII "初期化" 다이얼로그/마커 클릭 크래시 RE (2026-07-11)

전략맵 성계 렌더 후, 사용자가 마커/버튼을 클릭하면 "初期化(초기화)…" 관련 증상과 함께 클라가 팅긴다. re-analyst 정적 RE(정통 EXE 9c97de2a)로 근본 원인 확정.

## 한 줄 결론
**마커/유닛 클릭 → 없는 유닛 id 조회(`FUN_004c96c0` 0 리턴) → `FUN_004c9a80`가 널체크 없이 `[0+0x88c]` 역참조 → 액세스 위반 팅김.** 원인 = 서버가 0x0325 유닛 테이블을 count만 보내고 **실 유닛 레코드를 안 채움** → 마커가 참조하는 유닛 id가 클라 레지스트리에 부재. 해법 = 0x0325에 실 유닛(실 id) 적재 + 0x033b 전술 UnitShip id를 그 집합과 일치. 신규 메시지 불필요(바디 내용 문제).

## "初期化" 문자열 = 디버그 로그 2개 (모달 아님)
EXE·constmsg.dat·msgdat.json·.rsrc 전수 검색(SJIS + UTF-16LE) 결과 딱 2개, 둘 다 `OutputDebugStringA`/포매터 경유 **비가시 로그**:
1. `初期化されてないバグ` @VA 0x00770b48 — xref 0x4bfe93 → formatter 0x5923a0 → event 0x517cd0.
2. `ユニット初期化しようと思ったけど、そんなユニットは無いらしいよ？` @VA 0x00771e64 — xref 0x4c976f → `call [0x66b1c0]`(KERNEL32!OutputDebugStringA).

→ 사용자가 "초기화" 텍스트를 봤다면 디버그 콘솔/로그 캡처. 게임이 실제로 띄우는 클릭-실패 모달은 별개이나, 팅김의 실제 원인은 아래 null-deref.

## 크래시 메커니즘 (디스어셈 확정)
- **유닛 조회 `FUN_004c96c0`(0x4c96c0):** 클라 유닛 레지스트리 테이블 **@0x7db3c8**(범위 ~0x982dec, stride **0xb4c**, **600 엔트리**, `active@+0`, `id@+4`). `active!=0 && id==인자` 매칭. 미스 → 위 디버그 로그 + **return 0**.
- **크래시 `FUN_004c9a80`:** 전술/렌더 오브젝트의 `[edi+4]=유닛id`로 `FUN_004c96c0` 호출(0x4c9a8d). 0x4c9a95 `mov esi,eax`(=0) 후 0x4c9acf `lea ecx,[esi+0x88c]; call 0x5dd6b0`을 **널체크 없이** 실행 → 0x88c 접근 위반.
- **콜러 8곳**: 0x4be461/0x4be4ac, 0x4c94fb, **0x4c9a8d(크래시)**, 0x4ca36b, 0x4e449e/0x4e44fd/0x4e6afa(렌더/업데이트 — 존재 유닛만 조회돼 자동런선 무사).

## 서버 해법 (최소 세트)
1. **0x0325 유닛 테이블을 실 레코드로 채워 전송** (현재 count만 추정 — loop-state:487/515). 각 유닛 id가 정본. 데이터: `server/data/seed/initial-deployment.json`(제국12+동맹 초기 함대, system→cell 해석됨).
2. **0x033b 전술 UnitShip의 유닛/함선 id·map-section을 0x0325 id 집합과 일치**시켜 방출. 불일치 id가 마커에 실리면 클릭 시 조회 실패→크래시.
3. 신규 메시지 구현 불필요 — 이미 카탈로그의 0x0325/0x033b **바디 내용(id 일관성)** 수정. (0x0f06/0x0f07 messenger-stat는 이 크래시와 무관.)

## 교차확인
- loop-state:3341 선행 RE 동일 결론: crash path=FUN_004c9a80 via FUN_004c96c0; FUN_004c32a0가 0x033b를 clientBase+0x4271a8(0x8271a8)에서 임포트해 0x0325 유닛 테이블 clientBase+0x41a364(0x81a364)와 대조. 다음 작업=0x033b row/ship/map-section을 0x0325에 맞추기.
- loop-state:487/515: "0x0325가 최소 count만 → 클라가 실 유닛/함대 데이터 대기" 경고.

## 확신도
| 항목 | 확신도 |
|---|---|
| "初期化" 문자열=디버그 2개(모달 아님) | 높음(바이트+디스어셈) |
| null-deref 크래시 메커니즘(FUN_004c9a80 널체크 부재) | 높음 |
| 트리거=마커 클릭→없는 id | 중상(클릭→FUN_004c9a80 엣지는 라이브 프로브로 확정) |
| 0x033b↔0x0325 정확 필드 오프셋 | **미확정** — 라이브/실측 필요 |

## 라이브 프로브 (미확정 해소)
Frida `Interceptor.attach(0x4c96c0)`에서 인자 `[esp+4]=유닛id`·retval 로깅 + `0x4c9a80`에서 `[edi+4]` 로깅. 마커 클릭 시 **어떤 id로 조회→0 리턴**되는지 찍으면, 클라 기대 id vs 서버 0x0325 id 집합의 갭이 드러남.

## 관련
- [[전략맵 렌더 게이트 — 0x0315 RLE 엔디안]] · docs/logh7-strategic-map-placement-re.md(마커 클릭 경로) · docs/logh7-db-seed-catalog.md(initial-deployment) · docs/logh7-client-dispatch-catalog.md(0x0325/0x033b).
