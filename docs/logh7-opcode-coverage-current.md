# LOGH7 프로토콜 API 커버리지 (현행)

> 최종 갱신: 2026-07-17. 근거: 서버 코드 정적 조사 + g7mtclient 디컴파일(RE). 라이브가 ground truth — 미확정 필드는 라이브 A/B로 확정.

## 방법론 — 프로토콜은 웹 API다

클라↔서버 opcode 쌍은 웹 REST 엔드포인트와 동형이다:

- **요청 opcode → 응답 opcode** = `GET /resource` → 응답. 요청이 파라미터, 응답 레코드의 바이너리 레이아웃이 **DTO 스키마**.
- **UI "NO DATA"/빈 패널** = 십중팔구 서버가 그 응답을 **zero-fill**(빈 200)로 때우는 **미구현 엔드포인트**. 클라 파서 크래시 = **DTO 스키마 불일치**.
- 세션 상태 기반 push(예: 전술 시퀀스)는 단일 GET이 아니라 **다단계 트랜잭션**(선행상태·순서가 있는 플로우). 잘못된 상태에서 push하면 계약 위반 → 크래시.

이 표는 "빈 데이터" 부류 버그를 개별 발견이 아니라 **미구현 엔드포인트 백로그**로 체계 처리하기 위한 커버리지 지도다. 도구 중립적 — 어느 세션(Claude/Codex)이든 이어받아 처리 가능.

## Zero-fill 메커니즘

`buildEmptyWalkerInner` (`server/src/server/logh7-world-records.mjs:1070`): `STATIC_INFO_BODY_SIZES`에서 응답 크기 조회 → `Buffer.alloc(size)`로 0 초기화 바이트 반환. 클라 고정크기 프레이밍이 안전하게 소비(over-read 차단)하지만 데이터가 전부 0이라 UI는 공란.

## 전수 표면 요약 (2026-07-17 스윕 완료)

서버가 다루는 opcode 총 **60+개**: 실데이터 빌더 **32+**, zero-fill **10+**, handler-only(요청 수신만) **18+**. 계열별:

| 계열 | opcode | 상태 |
|---|---|---|
| 세션/로그인 | 0x0200~0x0206 (login/character/game-login) | ✅ 실데이터 (0x0202 NG는 의도적 빈 응답) |
| 로비 | 0x2000~0x200b, 캐릭터 관리 0x1000~0x1008 | ✅ 실데이터 |
| heartbeat | 0x0300→0x0301 (4B LE timestamp) | ✅ |
| world/grid 초기화 | 0x0f00~0x0f03 (init/grid-init-spawn) | ✅ — 0x0f02→[0x0204,0x0325,0x0323]+0x0313+0x0315+상세들+0x0f03+0x0356 |
| **이동★** | 0x0b01(move cmd)→0x0b07(580B 브로드캐스트), 0x0b09/0x0b0a(grid enter 브래킷) | ✅ 핸들러·빌더 존재 — **라이브 검증이 다음 관문** |
| **Warp★** | 0x2b/0x2d는 와이어 opcode가 아니라 **authority card/command ID**(authority-cards.mjs:8). 실행은 0x0b01 MoveGrid + 0x2b 권한 검사 경유 | 구조 확인됨 |
| 정적 맵 | 0x0312~0x0315(grid type/cells RLE) | ✅ |
| 전술 | 0x033b, 0x0345/0x0347/0x0349/0x034b, 0x0f1f | ✅ 빌더 존재 — **단 battle-enter 핸드셰이크 선행 필수**(아래 상태전이 절) |
| 채팅 | 0x0f1c grid chat | ✅ |
| Information 계열 | 아래 상세 표 | 혼재 |
| messenger | 0x0f06→0x0f07(29900B) | ➖ zero-fill(의도) |

**핵심 독해**: 게임플레이 직접 opcode(이동 0x0b01/0x0b07, 스폰 0x0f02/0x0f03, 맵 0x0313/0x0315)는 **이미 실데이터로 구현돼 있다**. 남은 갭은 (a) 정보/정적 테이블 zero-fill 9종(아래), (b) 전술 진입 핸드셰이크(상태전이), (c) 이동·Warp의 라이브 검증이다.

> ⚠️ 검증 노트: 0x031d는 이 스윕에서 상수 정의(logh7-world-records.mjs:853)가 확인됐으나 Information 스윕에선 zero-fill로 분류됨 — 구현 착수 시 실제 방출 경로(빌더 vs buildEmptyWalkerInner)를 코드로 재확인할 것.

## 커버리지 표 (Information / StaticInformation)

## 커버리지 표 (Information / StaticInformation)

| Req | Resp | 응답명 | 크기 | 상태 | 위치 |
|---|---|---|---|---|---|
| **Information 계열** ||||||
| 0x0322 | 0x0323 | ResponseInformationCharacter | 0x2d4 | ✅ 실데이터 | logh7-world-records.mjs:256 |
| 0x0324 | 0x0325 | ResponseInformationUnit | 0xce44 | ✅ 실데이터 | logh7-world-records.mjs:372 |
| 0x0326 | 0x0327 | ResponseInformationWarehouse | 0x300 | ✅ 실데이터 | warehouse-record.mjs:109 |
| 0x0328 | 0x0329 | ResponseInformationPackage | 0x154 | ❌ zero-fill | logh7-world-records.mjs:1070 |
| 0x032a | 0x032b | ResponseInformationOutfit | 0xaf4 | ✅ 실데이터 | logh7-world-records.mjs:706 |
| 0x032c | 0x032d | ResponseGridInformationOutfit | 0xe14 | ❌ zero-fill | logh7-world-records.mjs:1070 |
| 0x032e | 0x032f | ResponseInformationOutfitParty(함대 멤버리스트) | 0x8b04 | 🚧 구현 중 | logh7-world-records.mjs:1070 |
| 0x0330 | 0x0331 | ResponseOutfitInformationUnit | 0x1814 | ❌ zero-fill | logh7-world-records.mjs:1070 |
| 0x031e | 0x031f | ResponseInformationBase | 0x604 | ✅ 실데이터 | base-record.mjs:99 |
| 0x0320 | 0x0321 | ResponseInformationInstitution | 0x8de4 | ✅ 실데이터 | institution-record.mjs:69 |
| **Static Information (마스터 테이블 — ❌ 4종은 EXE-embedded 데이터, 선행 추출 필요)** ||||||
| 0x0304 | 0x0305 | ResponseStaticInformationCard | 0x520a | ✅ 실데이터 | logh7-world-records.mjs:1037 |
| 0x0306 | 0x0307 | ResponseStaticInformationCardCommand | 0xe5b2 | ✅ 실데이터 | logh7-world-records.mjs:1043 |
| 0x0308 | 0x0309 | ResponseStaticInformationPowerDistribution | 0x55c | ❌ zero-fill | logh7-world-records.mjs:1070 |
| 0x030a | 0x030b | ResponseStaticInformationUnitShip | 0x6d64 | ✅ 실데이터 | logh7-world-records.mjs:1053 |
| 0x030c | 0x030d | ResponseStaticInformationUnitTroop | 0x184 | ❌ zero-fill | logh7-world-records.mjs:1070 |
| 0x030e | 0x030f | ResponseStaticInformationFighters | 0x34 | ❌ zero-fill | logh7-world-records.mjs:1070 |
| 0x0310 | 0x0311 | ResponseStaticInformationArms | 0x1b0 | ❌ zero-fill | logh7-world-records.mjs:1070 |
| 0x0312 | 0x0313 | ResponseStaticInformationGridType | 0x138c | ✅ 실데이터 | logh7-world-records.mjs:921 |
| 0x0314 | 0x0315 | ResponseStaticInformationGrid | 0x138c | ✅ 실데이터 | logh7-world-records.mjs:778 |
| 0x031c | 0x031d | ResponseStaticInformationBase(astronomy — **행성/항성 비주얼**) | 0x520c | ❌ zero-fill ⭐ **검은 행성 원인** | logh7-world-records.mjs:1070 |
| **전술/기타** ||||||
| 0x033a | 0x033b | ResponseTacticsInformationUnitShip | 0x79e4 | ✅ 실데이터 | tactical-position-records.mjs:118 |
| 0x0f06 | 0x0f07 | ResponseInformationMessengerStatus | 0x74cc | ➖ zero-fill(의도) | logh7-world-records.mjs:632 |

## 미구현 백로그 (우선순위 제안)

**정보 패널 (플레이어 상호작용 직접):**
- `0x032f` OutfitParty(함대 멤버리스트) — 🚧 진행 중. 전략맵 함대 선택 → 이동/Warp 게임플레이의 관문.
- `0x032d` GridInformationOutfit, `0x0331` OutfitInformationUnit, `0x0329` Package.

**마스터 테이블 (2026-07-18 정정: 데이터가 CD 아니라 EXE-embedded → 선행 추출 필요):**
> `0x0309`/`0x030d`/`0x030f`/`0x0311`의 와이어 레이아웃은 RE 확정(`docs/reference/legacy-evidence/logh7-proto-info-records.md` §2b-2e)이나, **숫자 데이터가 CD 추출 카탈로그에 없고 클라 EXE 내부에 박혀 있다**(RVA: PowerDistribution `+0x4130a4`·UnitTroop `+0x412f20`·Fighters `+0x3f5ab4`·Arms `+0x3f5902`, image base 0x400000). CD 추출은 텍스트/메시지 데이터만. → **선행 EXE 추출 태스크**(extract-miner, PE 섹션 RVA→파일오프셋 매핑, fail-closed lineage 검증)로 카탈로그화한 뒤 빌더는 0x031d처럼 기계적. 추출 전엔 zero-fill 유지(무날조).
- ⭐ `0x031d` StaticBase(astronomy) — **검은 행성 원인**. 성계별 `class_`(spectral 인덱스, dest +0x26 u8, 0이면 검은 항성구)·`diameter`(+0x28 f32be)·`revolution_*`를 정본 galaxy 데이터로 채워 방출. 와이어=u16be count 접두 + 순차 레코드(파서가 dest stride 0x3c 전개). 근거: `docs/reference/legacy-evidence/logh7-info-records-wire.md` §2. class_→항성색 LUT는 라이브/타 export 재확인 권장.
- `0x0309` PowerDistribution(세력 분포), `0x030d` UnitTroop(육전대), `0x030f` Fighters(전투정), `0x0311` Arms(병기).

> **정정**: 이전 "성계 상세 = 0x0326→0x0327(base=u32BE)" 가정은 **창고(warehouse) 상세**였고 행성 비주얼과 무관(0x0327은 이미 실데이터 구현). 검은 행성은 오직 **0x031d astronomy** 미방출/0-fill이 원인. 0x0327 payload를 채워도 행성은 고쳐지지 않는다.

## 채움 정책 — 데이터 원천 사다리 (2026-07-17 사용자 결정: "추출 우선, 창작은 건별 승인")

미구현 엔드포인트를 채울 때 원천 우선순위:
1. **원작 데이터** (CD 추출 캐논 / 도메인 실데이터) — **무조건 채움, 승인 불요.**
2. **설정**(LOGH 세계관·공식 자료) 근거 — 창작 콘텐츠. **도달 시 근거와 함께 건별 승인.**
3. **게임 레벨 디자인** 근거 — 창작 콘텐츠. **건별 승인.**

**전제(호환 오라클)**: 원작 클라가 **렌더 파서·UI 경로를 가진 것만** 채운다. 클라가 라우팅조차 안 하는 것은 서버가 채워도 표시 안 됨.

**채우면 안 되는 것:**
- **경제 관련 = 보류(정본)**: 매뉴얼 p9 「経済関連は現在未実装」. 게다가 클라가 경제 파라미터(NotifyBaseParameter 0x4a)를 **라우팅조차 안 함** → 서버 구현해도 렌더 경로 없음. 클라 차원 부재이므로 0x031f 등 경제 필드는 0 유지.
- 사다리 어느 단계로도 근거 없는 값 = **날조 금지**, count 0.

## 상태전이 부류 (zero-fill 아님)

전술맵 진입은 미구현 엔드포인트가 아니라 **핸드셰이크 플로우**다: 클라 전술 arena(`client+0x126718`, ~1.57MB)는 full battle-enter(`FUN_004c32a0(0)`)에서만 구축되고, 이는 씬 게이트 `client+0x35f35a`가 배틀로 세팅돼 Field_Import FSM이 배틀 분기를 타야 진입한다. 전략맵 문맥(`FUN_004c32a0(1)`)에 전술 arm(0x033b/0x0f1f)을 push하면 빈 arena 역참조로 크래시(라이브 2/2 확정, PR #178에서 기본 OFF 격리). 올바른 순서: 전략맵 데이터 → 함대 이동/Warp → **battle-enter 트리거 규명(다음 RE 타깃)** → 전술맵.
