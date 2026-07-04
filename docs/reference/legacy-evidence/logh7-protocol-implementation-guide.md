# LOGH VII 프로토콜 구현 가이드 (미래 AI 핸드오프)

작성: 2026-06-13 (G201). 목적: **어떤 AI 세션이든 이 레시피만 따르면 203개 in-world 메시지 중 아직
미구현인 것을 안전하게(증거 기반) 서버에 추가**할 수 있게 한다. 우주전쟁(전투) 구현을 워크드 예제로 쓴다.

> 핵심 원칙(프로젝트 정책 `docs/playable-revival-policy.md`): **추측 금지.** 모든 와이어 필드는 Ghidra
> 디컴파일 증거(주소)로 뒷받침하고, 서버 반영 전 단위 테스트로 고정한다. 고정 hex 반환 금지.

---

## 0. 한 장 요약 — 지금 어디까지 됐나

| 레이어 | 상태 | 위치 |
|---|---|---|
| 로그인→로비→월드로드(무수정 클라) | ✅ done (G164) | auth-server, login-protocol |
| 전술 이동 MoveShip/Turn/Grid | ✅ done | command-engine, login-protocol |
| **우주전쟁(전투): ChangeMode/Attack/Shoot/Fight/damage/격침** | ✅ **done (G201)** | **combat-engine, command-engine, world-state** |
| 내정(정보레코드/인사/전략/병참/사회) | 🟡 spec (RE 문서 보유) | `docs/logh7-proto-*.md` |
| 메시지 카탈로그(203개, 상태 포함) | ✅ done | `content/client/message-catalog.json` |

`content/client/message-catalog.json`의 `status` 필드: `done`(41) / `spec`(154, RE문서있음) / `todo`(8).
새 작업을 고를 땐 이 파일에서 `status:"spec"`인 코드를 고르면 와이어 레이아웃이 이미 `doc` 필드의 문서에 있다.

---

## 1. 도구 (RE를 grep으로)

모두 repo 루트 `E:\logh7-revival`에서. **`python` 사용 (python3 은 깨진 Windows 스텁).**

```bash
# 메시지 카탈로그 재생성 (Ghidra FUN_004ba2b0 코드↔클래스 + FUN_004b8b00 크기/파서에서)
python -m tools.logh7_msg_catalog --print

# Ghidra 풀 디컴파일 인덱스 질의 (.omo/ghidra/export/G7MTClient/)
python -m tools.logh7_redex func 0x4bfc40        # 함수 디컴파일 C
python -m tools.logh7_redex str  "CommandShootShip"   # 문자열(클래스명/에러) + 주소
python -m tools.logh7_redex xref "NotifyAttackedShip" # 그 문자열을 참조하는 함수
python -m tools.logh7_redex grep "0x8d4" --c     # C 본문 정규식 검색
python -m tools.logh7_redex calls 0x4c0df0       # FUN_004c0df0 을 호출하는 함수
```

핵심 인덱스 자산:
- `.omo/ghidra/export/G7MTClient/functions.jsonl` — 전 함수 디컴파일 C (16MB)
- `…/strings.tsv`, `…/symbols.tsv` — 문자열/심볼 (클래스명이 그대로 남아있음: C++ Input_/Output_ 직렬화)

---

## 2. 한 메시지를 역공학하는 5단계

LOGH VII 클라는 C++ 직렬화 클래스로 메시지를 다룬다. 이름이 심볼에 남아있어 RE가 쉽다.

1. **코드·크기 확정.** `message-catalog.json`에서 클래스명→`code`/`size`/`parser` 확인. (예: `CommandShootShip`
   = `0x406`, size `0x98`, parser `FUN_004bfc40`.)
2. **파싱(C→S) 레이아웃.** dispatch가 가리키는 parser(`FUN_004bfc40`)를 `redex func`로 열어 stream read
   순서를 읽는다 → 각 필드의 offset/size/type. (예: count = body[12], id 배열 = body[16] stride 4.)
   또는 `Input_<Class>::input_from_stream`을 `redex xref`로 찾아 읽는다.
3. **빌드(S→C) 적용 의미.** 클라의 apply/handler를 읽어 각 필드가 **무슨 일을 하는지**(어떤 entity offset에
   쓰는지) 확인한다. in-world Notify는 보통 `FUN_004ba2b0`의 `case 0xNNN:`에서 N개 dword를 복사 후
   apply 함수 호출. (예: 0x426 → 7 dword 복사 → `FUN_004c0df0` = 피해 적용.)
4. **총 길이 교차검증.** 필드 합 == dispatch size 인지 확인. 안 맞으면 패딩/배열 재확인.
5. **문서화 + 신뢰도.** `docs/logh7-proto-*.md`에 필드 표(off/size/type/name/meaning/evidence) + 신뢰도
   (high/medium/low) 기록. 불확실하면 low로 표기하고 추측하지 않는다.

> 좌표계: 연속 월드 float, XZ 평면, Y 수직(~0), heading=라디안 Y축 yaw. NotifyMovedShip 0x423의
> dword3..5(x,y,z)와 동일 공간. 바디는 **리틀엔디안**, in-world inner 코드 prefix만 빅엔디안 u16.

---

## 3. 서버에 구현하는 패턴 (파일별 책임)

| 파일 | 책임 | 추가하는 것 |
|---|---|---|
| `src/server/logh7-login-protocol.mjs` | 와이어 빌더(S→C) | `buildNotify<X>Inner(...)` — `buildLobbyResponseInner(code, bytes)` 후 `inner.subarray(6)`에 LE 기록 |
| `src/server/logh7-combat-engine.mjs` (또는 새 도메인 모듈) | 파서(C→S) + 도메인 규칙 | `parseInbound<X>(inner)` (`inner.subarray(2)`가 바디), `compute…` 순수함수 |
| `src/server/logh7-world-state.mjs` | 권위적 인메모리 상태 | 엔티티 필드 + 변이 메서드(`applyDamage`, …) |
| `src/server/logh7-command-engine.mjs` | `processCommand` 디스패치 | `if (innerCode === CMD) { parse→검증→state변이→build notify→{accept,notifies} }` |
| `src/server/logh7-world-relay.mjs` | 릴레이 게이트 | `RELAY_COMMAND_CODES`에 C→S 코드 추가(없으면 auth-server가 engine까지 전달 안 함) |
| `tests/server/logh7-<x>.test.mjs` | 검증 | 파서/빌더 오프셋 + processCommand + 엔드투엔드 |

`processCommand` 반환 계약: `{ accept, reject?, notifies: [{ inner, target:'others'|'all' }] }`.
auth-server가 `dispatchNotifies`로 각 notify를 프레이밍해 브로드캐스트한다(`target:'all'`=행위자 포함).

빌더 프레이밍(검증됨): inner = `[u32 BE prefix=0 @0][u16 BE code @4][LE payload @6]`. 파서 입력(raw C→S):
`[u16 BE code @0][LE body @2]`.

---

## 4. 워크드 예제 — 우주전쟁(전투) 전체 (G201, 복제용)

목표 루프: **ChangeMode(배틀진입) → ShootShip/AttackShip(사격) → 서버 피해판정 → NotifyAttackedShip(피해)
→ 격침**. 멀티플레이는 릴레이가 다른 플레이어에게 전파.

### 4.1 RE 증거 (이 구현의 근거)
- dispatch `FUN_004b8b00`: 0x405/0x406 size `0x98`, parser `FUN_004bfc40`; 0x426 size `0x1c`.
- `FUN_004bfc40`: `count=body[12]`, 공격자 id 배열 `body[16]` stride 4(`piVar3+=1`), 각 공격자에 사격
  타이머(entity+0x5c0/0x5bc) 스탬프. → **공격 명령은 공격자 함선들만 싣고 타겟/피해는 서버 권위.**
- targetId는 **고정 오프셋 0x94**(`param_2[0x25]`), 가변 트레일러 아님 (battle-fire 문서 §1).
- 0x426 apply `FUN_004c0df0`: body @0x04 attackerId, @0x08 weaponType(→빔이펙트 `FUN_004b3460`),
  @0x0c targetId, @0x10 u16 durability, @0x12 u16 zanki(残機), @0x14 u8 hitLoc(<6), @0x16 u16 shield.
  클라는 각 풀을 **(max − wireValue)**로 세팅 → 와이어는 **누적 피해**, 0/0xffff = 변화없음.
  엔티티 풀: armor=entity+0x8d4, zanki=entity+0x8d8(둘 다 max=함급템플릿+0x218), shield max=+0x288.
- ChangeMode 0x411 → apply `FUN_004c1c30`(664B): body[4]=mode, body[8]=leader, body[12]=count,
  유닛 stride 20 — **함대 진형/스탠스 변경**(전략↔전술 모드바이트 0x126711은 grid-enter FSM 별개).

### 4.2 피해 공식은 "서버 설계"다 (중요)
클라 바이너리만 남아있고 클라는 서버가 보낸 숫자를 **렌더링만** 한다(current = max − wire). 따라서 원본
서버의 피해 공식은 RE 불가 → `computeDamage`는 **결정적·튜너블한 서버 설계**다(실드→장갑→선체 cascade,
defense 경감). 와이어 3풀(shield/armor/zanki)에는 충실하되 수치는 밸런스 결정. (`logh7-combat-engine.mjs`)

### 4.3 구현 산출물 (참고 커밋)
- `logh7-combat-engine.mjs`: 코드상수, `parseInboundAttack`/`parseInboundChangeMode`, `computeDamage`,
  `shipClassStats`(함급별 스탯).
- `logh7-world-state.mjs`: ship 전투필드 + `applyDamage`/`pickTarget`/`removeShip`/`lowerMorale` +
  battle 세션(`openBattle`/`joinBattle`/`logCombat`) + `setPlayerMode`.
- `logh7-login-protocol.mjs`: `buildNotifyAttackedShipInner`(0x426/28B), `buildNotifyChangeModeInner`
  (0x42f/664B), `buildNotifyFoughtInner`, `buildNotifyMoraleDownInner`.
- `logh7-command-engine.mjs`: 0x405/0x406(fire)·0x404(warp)·0x407(fight)·0x411(changemode) 핸들러.
- `logh7-world-relay.mjs`: `RELAY_COMMAND_CODES` += {0x404,0x405,0x406,0x407,0x411}.
- `tests/server/logh7-combat-engine.test.mjs`: 16 테스트(파서/공식/빌더/processCommand/엔드투엔드 우주전쟁).

검증: `node --test tests/server/*.test.mjs` → **159 통과**. 와이어 레이아웃은 독립 RE 패스
(`docs/logh7-proto-battle-fire.md`)와 적대적 교차검증 일치.

---

## 5. 다음에 구현할 것 (우선순위 — 미래 AI 착수 지점)

`message-catalog.json`에서 `status:"spec"`을 고르고 해당 `doc`를 읽어 §3 패턴으로 추가한다.

1. **전투 보조** (combat 확장, 같은 패턴): NotifyWarpedShip 0x425, NotifyAirBattle 0x428,
   CommandShootFortress 0x419/NotifyShootFortress 0x436 → `docs/logh7-proto-battle-fleetops.md`.
2. **내정 — 정보레코드(S→C 읽기모델)**: 0x305 Card/0x321 Institution/0x327 Warehouse/0x32b Outfit 등
   → `docs/logh7-proto-info-records.md`. 콘텐츠 데이터(`content/`) 필요. economy 필드(인구/보급/생산) 우선.
3. **내정 — 행동(C→S)**: 인사 0x704-0x709(임명/진급), 전략 0x900-0x906(작전/편성), 병참 0x0c00-0x0c0c
   (보급/재편성) → `docs/logh7-proto-personnel-strategy.md`, `docs/logh7-proto-strategic-logistics.md`.
4. **상태동기화 0x12xx** (NotifySimpleInformation* 델타 브로드캐스트): 모든 클라 상태 일치의 핵심 →
   `docs/logh7-proto-social-account.md`. 틱 기반 델타 푸시로 구현(server-architecture 문서 참고).
5. **라이브 검증 경계**: 서버측 권위 전투는 테스트로 검증되나, **실클라가 명령을 ISSUE하려면 전술 배틀그리드가
   controllable**해야 한다(모드바이트 client+0x126711==0). 이는 grid-enter FSM의 라이브 RE 과제
   (`docs/multiplayer-roadmap-2026-06-12.md`의 boundary). 서버 구현과 독립적으로 진행 가능.

---

## 6. 완료 판정 (모든 구현 공통)
1. 단위 테스트(파서 오프셋·빌더 크기·processCommand·엔드투엔드) 통과.
2. `node --test tests/server/*.test.mjs` 전체 그린(회귀 없음).
3. 와이어 레이아웃이 RE 문서 증거와 일치(가능하면 독립 패스로 교차검증).
4. 라이브 클라 surface QA(해당되면) — `tools/logh7_ui_explorer.py`로 실클라+서버 구동.
5. `message-catalog.json`의 status 갱신 + 해당 `docs/logh7-proto-*.md` 갱신.
