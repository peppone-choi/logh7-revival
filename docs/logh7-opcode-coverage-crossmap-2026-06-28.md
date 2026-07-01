# LOGH VII Opcode Coverage Cross-Map (2026-06-28)

목적: 목표 "opcode 전체와 수신/송신/처리 로직 전부 확인"에 답하는 증거 기반 교차표.
클라이언트가 실제로 보내는 송신(send-side) opcode 전체 집합과 부활 서버의 수신/처리/송신
구현을 대조해 (1) 처리되지 않는(hang) opcode가 있는지, (2) 어떤 opcode가 의도적으로
빈 응답(zero-fill)인지, (3) 다음에 채울 가장 가치 높은 데이터 패널이 무엇인지 고정한다.

이 문서는 코드 변경이 아니라 커버리지 판정이다(작업 등록부 §G "전체 RE 문서화"). 추측
데이터를 기본값으로 승격하지 않는 정책을 유지하므로, 빈 패널을 가짜 데이터로 채우는 것은
RE 확정 + 라이브 검증 후의 별도 작업으로 남긴다.

## 입력 / 출처 (provenance)

- 클라이언트 송신 opcode 권위 출처: `.omo/ghidra/opcode-index.json`
  (`RE/tools/logh7_opcode_index.py`, journal #56/#57 생성). `normalizedOutboundRoutes`
  127개 = 클라 send-side 셀렉터 라우트(`requestInternalHex` → `pairedResponseInternalHex`).
  P1(정적 PE 인덱스). 한계: index 자체가 "tracked inbound subset only; full inbound case
  enumeration remains pending"라고 명시.
- 서버 수신/처리/송신: `server/src/server/*.mjs`. 권위 디스패치/빌더는
  `logh7-login-session.mjs`, `logh7-login-protocol.mjs`, `logh7-auth-server.mjs`,
  `logh7-battle-engine.mjs`, `logh7-base-economy.mjs`, `logh7-account.mjs`.
- 재현 절차: 클라 request 집합에서 서버 소스에 리터럴로 등장하지 않는 코드를 골라,
  각 코드의 짝 응답(req+1)이 `WORLD_RESPONSE_OBJECT_SIZES`에 있는지로 분류.

## 핵심 메커니즘 — sized generic walker

conn3 월드 데이터 핸들러는 명시 분기 뒤에 generic walker로 떨어진다:

- `logh7-login-session.mjs:2418` — `buildWorldDataResponseInner(innerCode + 1)`.
- `logh7-login-protocol.mjs:1644` — `buildWorldDataResponseInner(responseCode)`는
  `WORLD_RESPONSE_OBJECT_SIZES[responseCode]`(login-protocol.mjs:1592~1624)에서 크기를
  찾아 그 크기의 **zero-fill** 객체를 만든다. 없으면 `null`(미응답 → 스톨 지점 관측용).
- `WORLD_OK_STATUS_CODES`(login-protocol.mjs:1634 = `{0x0f01, 0x0f03, 0x0317}`)는
  선두 바이트를 status 1로 채워 init-flag를 래치(빈 count 0이 아니라 "OK").

즉 "request X에 대해 X+1이 크기표에 있으면" 서버는 항상 올바른 크기의 응답을 돌려준다.
데이터 패널은 비어 보이지만 클라이언트는 진행한다(의도된 "empty world" 기준선,
login-protocol.mjs:1587~1588). 로드-베어링 패널만 명시 분기에서 non-empty로 채운다
(예: 0x0322→0x0323 캐릭터 카드 / 0x031c→0x031d, 0x031e→0x031f 기지 / 0x0324→0x0325
유닛테이블 / 0x1000·0x1002·0x1004 로스터 / 0x0313·0x0315 그리드).

## 판정 1 — 수신/처리(inbound): 핸들러 갭 = 0 (hang 위험 없음)

클라 송신 request 127개 중, 서버 소스에 리터럴로 등장하지 않는 코드 14개를 분류:

| REQ | name(index) | →RESP | size | 분류 |
|---|---|---|---|---|
| 0x030e | - | 0x030f | 0x0034 | walker zero-fill(빈 패널) |
| 0x0316 | RequestStaticInformationGridSelector | 0x0317 | 0x0004 | walker **OK-status**(init flag) |
| 0x032c | - | 0x032d | 0x0e14 | walker zero-fill |
| 0x0330 | - | 0x0331 | 0x1814 | walker zero-fill |
| 0x0336 | - | 0x0337 | 0x0964 | walker zero-fill(0x0337=ResponseTacticsCharacter, 전투맥락 별도 빌더 존재) |
| 0x033a | RequestTacticsInformationUnitShip | 0x033b | 0x79e4 | walker zero-fill(전술 유닛함 테이블) |
| 0x033e | - | 0x033f | 0x8ca4 | walker zero-fill |
| 0x0340 | - | 0x0341 | 0x5dc4 | walker zero-fill |
| 0x0344 | - | 0x0345 | 0x0204 | walker zero-fill |
| 0x0346 | - | 0x0347 | 0x01d8 | walker zero-fill |
| 0x0348 | RequestTacticsCharacter | 0x0349 | 0x2ee4 | walker zero-fill(전술 캐릭터) |
| 0x034a | - | 0x034b | 0x0044 | walker zero-fill |
| 0x0f04 | - | 0x0f05 | 0x7214 | walker zero-fill |
| 0x7000 | (GIN7 login) | 0x7001 | (크기표 없음) | **전용 인증 경로**(walker 아님) |

- 13개는 짝 응답이 크기표에 있어 generic walker가 올바른 크기로 응답한다 → hang 없음, 빈 패널.
- 0x7000은 GIN7 자격 로그인. walker 전에 early-return하는 전용 경로로 처리되고, 0x7001은
  의도적으로 방출하지 않는다(`logh7-login-session.mjs:2415~2418`, lobby 0x7001 inert =
  workflow wicdkooh5). 따라서 0x7001이 크기표에 없는 것은 정상(스톨 아님).
- 나머지 113개 request 코드는 서버 소스에 리터럴로 등장(상수/핸들러/빌더/크기표/주석).
  로드-베어링 패널은 명시 non-empty 분기, 그 외는 위 walker가 sized zero-fill.

**결론: 클라가 보내는 어떤 request opcode도 미처리로 hang하지 않는다. 수신/디스패치 커버리지는 구조적으로 완전.** 남은 것은 핸들러가 아니라 빈 패널의 데이터 주입(아래 §4).

## 판정 2 — 송신(outbound): 미빌드 응답 2개

클라가 기대하는 짝 응답(server→client) 54종 중 서버가 빌드하지 않는 것:

| RESP | name(index) | 판정 |
|---|---|---|
| 0x7001 | - | 의도적 inert(lobby GIN7, byte-verified workflow wicdkooh5). 갭 아님. |
| 0x0430 | NotifyUnknown0430 | 0x04xx Notify 계열. 서버 트리거 미확인. P3 unknown — 로드-베어링 아님. |

그 외 52종은 명시 빌더 또는 walker(크기표)로 빌드된다. 0x0b07 NotifyMovedGrid,
0x0325 유닛테이블, 0x031d/0x031f 기지/경제, 0x0201 SSLoginOK, 0x0323 캐릭터 카드 등
핵심 응답은 모두 명시 빌더 보유.

## 판정 3 — 빈 패널(데이터 미주입) = 진짜 남은 작업

위 walker zero-fill 13종은 "구현 안 됨"이 아니라 "정책상 빈 패널". 채우려면 각 코드의
정확한 레코드 레이아웃을 RE 확정하고 라이브로 검증해야 한다(현재 canonical EXE는 Windows
App Control로 라이브 차단 — journal #48~#52). 가치/난이도 태그:

- **P2, needs-live + RE**: `0x033a RequestTacticsInformationUnitShip → 0x033b`(0x79e4),
  `0x0348 RequestTacticsCharacter → 0x0349`(0x2ee4). 전술 전투 진입(P0-08 "전술 mode/pool
  활성화")과 직접 연결. 0x0337(ResponseTacticsCharacter)은 `logh7-battle-engine.mjs:51`에
  이미 `RESPONSE_TACTICS_CHARACTER_CODE=0x0337` 빌더가 있으므로, 전술 패밀리 데이터 주입은
  전투엔진 로스터와 연동해 시작할 수 있다.
- **P2, needs-live + RE**: `0x0316 RequestStaticInformationGridSelector → 0x0317`
  (OK-status). C002 SelectGrid 경계와 명칭상 인접 — C002 admission 추적과 함께 볼 것.
- **P3**: 0x030e/0x032c/0x0330/0x033e/0x0340/0x0344/0x0346/0x034a/0x0f04 — 명칭 미상
  정보 패널들. 레이아웃 RE 미확정. 라이브에서 어떤 화면이 비는지 확인 후 우선순위화.

## 권장 다음 항목(single highest-value)

라이브가 다시 열리면(App Control 해제/서명/허용 경로 확보 후): **전술 패밀리
`0x033a→0x033b`(RequestTacticsInformationUnitShip)** 의 실레코드 레이아웃을 redex로 확정하고
(`FUN_004b8b00` 크기 0x79e4 소비처 + 파서), 전투엔진 시드 함선에서 non-empty 응답을 빌드해
전술 화면 유닛 패널이 채워지는지 라이브 검증. 이는 P0-08(전술 mode/pool)과 직접 맞물린다.
라이브 차단 동안은 위 redex 레이아웃 확정까지만 정적으로 진행하고, 서버 기본값으로는
승격하지 않는다(추측 데이터 금지).

## 재현

```
node -e '...'  # .omo/ghidra/opcode-index.json의 normalizedOutboundRoutes requestInternalHex 집합과
               # server/src/server/*.mjs 리터럴 집합 diff → 14개; 각 (req+1)을
               # logh7-login-protocol.mjs WORLD_RESPONSE_OBJECT_SIZES와 대조
```

(전체 스크립트는 loop-state journal #61 사이클 로그 참조.)

## 부록 A — 전술 UnitShip 패밀리 정적 레이아웃 (journal #63, redex 확정)

§4 권장 다음 항목(`0x033a→0x033b`)의 정적 RE 결과. redex(`cd RE && python -m tools.logh7_redex`)로
파서/요청 빌더를 확정했다. 구조는 HIGH(정적 증명), 개별 필드 의미는 P2(라벨 미확정 → 추측값을
서버 기본으로 승격하지 않음).

- **요청 0x033a RequestTacticsInformationUnitShip**: u16 count + ship id 리스트. id 개수 상한 600
  (`Output_RequestTacticsInformationUnitShip::get_length] id_size[%d] is over than 600`,
  string @0x0076275c / 0x007627b4; 빌더 `FUN_0040cba0`).
- **응답 0x033b ResponseTacticsInformationUnitShip**: 파서 `FUN_00421f80`
  (`Input_ResponseTacticsInformation...`, count 게이트 `if (*param_1 < 0x259)` = ≤600).
  - 헤더: u16 count(+ 정렬). 레코드 stride = `0x1a` ushort = **52바이트**.
  - 검산: 4(헤더) + 600×52 = 31204 = **0x79e4** = `WORLD_RESPONSE_OBJECT_SIZES[0x033b]`
    (`logh7-login-protocol.mjs:1596`)와 정확히 일치 → 레코드 크기/상한 확정.
  - 레코드 필드(파서 vtable 리더 기준, 의미 미라벨 P2): `vtable+0x1c` 리더(넓은 정수형) 3회,
    `vtable+0xc` 리더(좁은 정수형) 8회, `FUN_00610420(...,1,0,2)` 바이트/팩드 리더 3회
    (그 중 하나는 `(int)puVar8+1` 바이트 주소). name 필드(≤13 units)는 Static 형제 파서
    (`Input_StaticInformationUnitShip::input_from_stream] name_size[%d] is over than 13`)에 나타남.
- **형제 패밀리**(같은 디스패치 `FUN_004ba2b0`, 파서 `FUN_00422190`/`FUN_00422620`):
  ResponseTacticsInformationUnitTroop(0x033f=0x8ca4), Corps 등. 동일 방식으로 확장 가능.
- **다음(라이브 필요)**: 위 52바이트 레코드의 필드 의미(shipId/HP/위치/소속 등)는 라이브 trace 또는
  추가 라벨 RE로 확정해야 한다. 그 전엔 서버가 0x033b를 generic zero-fill로 두고(현 동작),
  필드값을 추측해 채우지 않는다. canonical EXE OS-차단 해제 후 라이브로 확정 → 전투엔진 시드
  함선에서 non-empty 빌드 → 전술 유닛 패널 paint 검증(P0-08).
