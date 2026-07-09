# LOGH VII World Entry — Complete Data Chain Specification
## 성공 월드진입을 위한 전체 정적정보+월드초기화 데이터 체인 명세

**생성일:** 2026-07-10  
**근거:** docs/reference/restored-from-git (logh7-live-world-entry-2026-06-23.md, logh7-inworld-progress.md, SESSION-HANDOFF-2026-06-15-live.md, logh7-live-validation-2026-06-30-grid-info.md) + legacy-evidence (logh7-info-records-wire.md, logh7-render-interaction-contract.md, logh7-opcode-reference-2026-06-28.md)

---

## 성공 월드진입 전체 레코드 체인 (순서대로)

**Context:** 클라이언트가 로그인 → 로비 → 게임시작 → 캐릭터 선택 후, 세션 서버(SS)에 접속하여 월드 진입까지의 정적정보 및 월드초기화 데이터 전송 순서.

### Phase 1: SS 접속 (Strategic Server Login)

| # | Opcode | 방향 | 이름 | 포맷/크기 | 타이밍 | 역할 | 빌더/핸들러 | 인용 |
|---|--------|------|------|---------|--------|------|-----------|------|
| 1 | 0x0200 | C→S | RequestSSLogin | 크기 불명 | 캐릭 선택 후 즉시 | SS 로그인 요청 | 클라: Output_SSLoginRequest | logh7-opcode-reference §0x02 L31 |
| 2 | 0x0201 | **S→C** | **SSLoginOK** | ≤4B | 0x0200 즉후 | **SS 로그인 성공 확인** | server/logh7-login-protocol.mjs:1734 buildSsLoginOkInner | logh7-opcode-reference §0x02 L32 |
| 3 | 0x0203 | C→S | SSCharacterIDRequest | 크기 불명 | SS login OK 후 | 캐릭터 ID 요청 | server not handled | logh7-opcode-reference §0x02 L34 |
| 4 | 0x0204 | S→C | SSCharacterIDResponce | 4B | 0x0203 응답 | 선택 캐릭터 ID 송신 | server/logh7-login-protocol.mjs:213-217 buildSsCharacterIdRe | logh7-opcode-reference §0x02 L35 |
| 5 | 0x0205 | C→S | SSGameLoginRequest | 크기 불명 | 캐릭 ID 수신 후 | 게임 로그인 요청 | server/logh7-login-session.mjs:1628-1652 | logh7-opcode-reference §0x02 L36 |
| 6 | 0x0206 | **S→C** | **SSGameLoginOK** | 1B | 0x0205 응답 | **게임 로그인 성공** | server/logh7-login-protocol.mjs:1738 buildSsGameLoginOkInner | logh7-opcode-reference §0x02 L37 |

---

### Phase 2: 정적정보 동기화 (Static Information Synchronization)

**타이밍:** 0x0206 직후, 월드진입 walk 중 클라가 청크 단위로 요청.  
**패턴:** C→S 요청 (Request) → S→C 응답 (Response), 또는 S→C 푸시.

| # | Opcode | 방향 | 이름 | 포맷/크기 | 타이밍 | 역할 | 빌더/핸들러 | 인용 |
|---|--------|------|------|---------|--------|------|-----------|------|
| 7 | 0x0300 | C→S | RequestStaticInformationSynchronize | 크기 불명 | walk 진행 | 시간 동기 요청 | server/logh7-login-session.mjs:1806-1808 | logh7-opcode-reference §0x03A L41 |
| 8 | 0x0301 | **S→C** | **ResponseStaticInformationSynchronize** | 크기 불명 | 0x0300 응답 | **시간 동기화** | server/logh7-login-protocol.mjs:182-186 buildResponseTimeInner | logh7-opcode-reference §0x03A L42 |
| 9 | 0x0304 | C→S | RequestStaticInformationSession | 크기 불명 | walk 진행 | 세션 커맨드 카드 마스터 요청 | server/logh7-login-session.mjs:511 | logh7-opcode-reference §0x03A L43 |
| 10 | 0x0305 | S→C | ResponseStaticInformationSession | 크기 불명 (또는 0) | 0x0304 응답 또는 skip | 커맨드 카드 마스터 (빈 응답 시 walk 진행) | server/logh7-info-records.mjs:110-139 buildStaticInformationCardInner | logh7-opcode-reference §0x03A L44; SESSION-HANDOFF §미결 1 |
| 11 | 0x0306 | C→S | RequestStaticInformationCardCommand | 크기 불명 | walk 진행 | 커맨드 상세 마스터 요청 | server/logh7-login-session.mjs:521 | logh7-opcode-reference §0x03A L45 |
| 12 | 0x0307 | S→C | ResponseStaticInformationCardCommand | 크기 불명 | 0x0306 응답 | 커맨드 상세 마스터 | server/logh7-info-records-static.mjs:174-202 buildStaticInformationCa | logh7-opcode-reference §0x03A L46 |
| 13 | 0x0308 | C→S | Request | 크기 불명 | walk 진행 | 함선 마력 곡선 요청 | generic walk | logh7-opcode-reference §0x03A L47 |
| 14 | 0x0309 | S→C | ResponseStaticInformationPowerDistribution | 크기 불명 | 0x0308 응답 | 함선 마력 곡선 (진영별 전력 분포) | server/logh7-info-records-static.mjs:217-255 | logh7-opcode-reference §0x03A L48 |
| 15 | 0x030a | C→S | Request | 크기 불명 | walk 진행 | 함선 유닛 마스터 요청 | server/logh7-login-session.mjs:2406-2407 | logh7-opcode-reference §0x03A L49 |
| 16 | 0x030b | S→C | ResponseStaticUnitShip | 크기 불명 | 0x030a 응답 | 함선 유닛 마스터 | server/logh7-info-records-static.mjs:276-327 buildStaticInformation | logh7-opcode-reference §0x03A L50 |
| 17 | 0x030c | C→S | Request | 크기 불명 | walk 진행 | 육전대 유닛 마스터 요청 | generic walk | logh7-opcode-reference §0x03A L51 |
| 18 | 0x030d | S→C | ResponseStaticUnitTroop | 크기 불명 | 0x030c 응답 | 육전대 유닛 마스터 | server/logh7-info-records-static.mjs:340-362 | logh7-opcode-reference §0x03A L52 |
| 19 | 0x030e | C→S | Request | 크기 불명 | walk 진행 | 전투기 마스터 요청 | generic walk | logh7-opcode-reference §0x03A L53 |
| 20 | 0x030f | S→C | ResponseStaticFighters | 크기 불명 | 0x030e 응답 | 전투기 마스터 | server/logh7-info-records-static.mjs:373-389 | logh7-opcode-reference §0x03A L54 |
| 21 | 0x0310 | C→S | Request | 크기 불명 | walk 진행 | 무장 마스터 요청 | generic walk | logh7-opcode-reference §0x03A L55 |
| 22 | 0x0311 | S→C | ResponseStaticArms | 크기 불명 | 0x0310 응답 | 무장 마스터 | server/logh7-info-records-static.mjs:400-410 | logh7-opcode-reference §0x03A L56 |

---

### Phase 3: 전략맵 그리드 데이터 (Strategic Grid)

**타이밍:** 0x0311 후, walk 진행.  
**중요:** 0x0313×2, 0x0315는 "2회 전송"을 의미 — 한 번은 공식적으로, 한 번은 walk 진행 조건 충족.

| # | Opcode | 방향 | 이름 | 포맷/크기 | 타이밍 | 역할 | 빌더/핸들러 | 인용 |
|---|--------|------|------|---------|--------|------|-----------|------|
| 23 | 0x0312 | C→S | RequestStaticInformationGridType | 크기 불명 | walk 진행 | 맵 객체 타입 마스터 요청 | server/logh7-login-session.mjs:1831-1856 (worldPlayer+strat enabled) | logh7-opcode-reference §0x03A L57 |
| 24 | **0x0313** | **S→C** | **ResponseStaticInformationGridType** | **fixed 5004 bytes** | 0x0312 응답 (1회) | **맵 객체 타입 마스터** | server/logh7-login-protocol.mjs:653-674 buildStaticInformationGridTyp | logh7-opcode-reference §0x03A L58; logh7-info-records-wire.md §3 |
| 25 | 0x0314 | C→S | RequestStaticInformationGrid | 크기 불명 | walk 진행 | 맵 셀 그리드(RLE) 요청 | server/logh7-login-session.mjs:1831-1856 | logh7-opcode-reference §0x03A L59 |
| 26 | **0x0315** | **S→C** | **ResponseStaticInformationGrid** | **fixed 5004 bytes (RLE)** | 0x0314 응답 (1회) | **맵 셀 그리드 (행성 위치, RLE 인코딩)** | server/logh7-login-protocol.mjs:576-628 buildStaticInformationGridInn | logh7-opcode-reference §0x03A L60; logh7-info-records-wire.md §3 |
| 27 | 0x0316 | C→S | RequestStaticInformationGridSelector | 크기 불명 | walk 진행 | 현재 그리드셀 요청 | server NOT handled | logh7-opcode-reference §0x03A L61 |
| 28 | 0x0317 | S→C | ResponseStaticInformationGridSelector | 크기 불명 | 선택사항 | 현재 그리드셀 | server/logh7-info-records-static.mjs:421-425 buildInformationGridInne | logh7-opcode-reference §0x03A L62 |

---

### Phase 4: 행성계 정적 정보 (Static Base/System Information)

**타이밍:** walk 진행 중 또는 0x0315 후.

| # | Opcode | 방향 | 이름 | 포맷/크기 | 타이밍 | 역할 | 빌더/핸들러 | 인용 |
|---|--------|------|------|---------|--------|------|-----------|------|
| 29 | 0x031c | C→S | RequestStaticInformationBase | 크기 불명 | walk 진행 (UI-read, 선택사항) | 행성계 정적정보 요청 | server/logh7-login-session.mjs:2202 | logh7-opcode-reference §0x03B L70 |
| 30 | **0x031d** | **S→C** | **ResponseStaticInformationBase** | **stride 0x3c/element** | 0x031c 응답 또는 월드진입 walk 중 (선택) | **행성계 정적 정보 (천문학적 데이터: 이름, 분류, 궤도)** | server/logh7-info-records.mjs buildStaticInformationBaseInner | logh7-opcode-reference §0x03B L71; logh7-info-records-wire.md §2 (StaticInformationBase 0x031d) |

**0x031d 포맷 (parser stream, u16be count 헤더):**
- `id` (u32be)
- `grid` (u16be) — map cell id
- `field06`, `field08` (u16be each, default 0)
- `name_length` (u8, ≤13)
- `name` (u16be[name_len], 또는 LOGH_KO_NAMES=1일 때 KO)
- `class_` (u8) — spectral type (O/B/A/F/G/K/M)
- `diameter` (f32be)
- `revolution_radius` (u32be, truncated)
- `revolution_direction` (u8)
- `revolution_cycle` (f32be)
- `revolution_init_angle` (f32be)

**출처:** logh7-info-records-wire.md §2, 0x031d parser trace (FUN_004142e0 decompile + 2026-06-16 live parser fix).

---

### Phase 5: 캐릭터 및 유닛 정보 (Character & Unit Records)

**타이밍:** 월드진입 walk 진행.

| # | Opcode | 방향 | 이름 | 포맷/크기 | 타이밍 | 역할 | 빌더/핸들러 | 인용 |
|---|--------|------|------|---------|--------|------|-----------|------|
| 31 | 0x0322 | C→S | RequestInformationCharacter | 크기 불명 | walk 진행 (또는 UI-read) | 캐릭터 상세정보 요청 | server/logh7-login-session.mjs:2159 | logh7-opcode-reference §0x03B L76 |
| 32 | **0x0323** | **S→C** | **ResponseInformationCharacter** | **724 bytes (0x2d4)** | 0x0322 응답 또는 월드진입 walk 중 (×2회) | **캐릭터 정보 레코드** | server/logh7-login-protocol.mjs:224 buildInformationCharacterRecordIn | logh7-opcode-reference §0x03B L77; logh7-info-records-wire.md §1 |
| 33 | 0x0324 | C→S | RequestInformationUnit | 크기 불명 | walk 진행 (또는 UI-read) | 유닛 정보 요청 | server/logh7-login-session.mjs:2341 | logh7-opcode-reference §0x03B L78 |
| 34 | **0x0325** | **S→C** | **ResponseInformationUnit** | **array, count at clientBase+0x41a364** | 0x0324 응답 또는 월드진입 walk 중 (×2회) | **유닛 레코드** | server/logh7-login-protocol.mjs:501 buildInformationUnitRecordInner | logh7-opcode-reference §0x03B L79; logh7-render-interaction-contract §2 |

**0x0323 포맷 (724 bytes, 47 fields):**
- Core: `id@0x00`, `power@0x04`, `state@0x06`, `fame@0x10`, `spot@0x1c`, `spot_owner@0x20`, `flagship@0x24`
- Names: `flagship_name_len@0x28`, `flagship_name[13]@0x2a`
- Abilities: `ability_8[8]@0x188` (8×{point u16, experience u16} = PCP/MCP)
- Parentage: `parentage_len@0x7d`, `parentage[2]@0x80` (stride 0x84, full names/blood/rank/face)
- Cards: `card_len@0x24c`, `card[16]@0x254` (u32 id/kind each)
- Seats: determined by flags below

출처: logh7-info-records-wire.md §1, serializer FUN_00419300.

---

### Phase 6: 그리드 진입 (Grid Entry Begin/End)

**타이밍:** 모든 정적정보 수신 후.

| # | Opcode | 방향 | 이름 | 포맷/크기 | 타이밍 | 역할 | 빌더/핸들러 | 인용 |
|---|--------|------|------|---------|--------|------|-----------|------|
| 35 | **0x0b09** | **S→C** | **NotifyEnterGridBegin** | **크기 불명** | walk 진행, 0x0323/0x0325 전송 직전 | **그리드 진입 시작** | server/logh7-login-protocol.mjs:1187-1191 buildNotifyEnterGridBeginInner | logh7-opcode-reference §0x0b L211 |
| 36 | 0x0323 | S→C | ResponseInformationCharacter | 724 bytes | 0x0b09 직후 (2회째 — 캐릭 데이터 refresh) | 캐릭터 재전송 | server/logh7-login-protocol.mjs:224 | logh7-inworld-progress.md §LOG P7 |
| 37 | 0x0325 | S→C | ResponseInformationUnit | array | 0x0b09 직후 (2회째 — 유닛 데이터 refresh) | 유닛 재전송 | server/logh7-login-protocol.mjs:501 | logh7-inworld-progress.md §LOG P7 |
| 38 | **0x0b0a** | **S→C** | **NotifyEnterGridEnd** | **크기 불명** | 0x0325 재전송 직후 | **그리드 진입 완료** | server/logh7-login-protocol.mjs:1193-1196 buildNotifyEnterGridEndInner | logh7-opcode-reference §0x0b L212 |

**주의:** 0x0b09와 0x0b0a 사이에 0x0323×2/0x0325×2를 삽입하는 것이 중요 (client mode 게이트 관련, logh7-inworld-progress.md §LOG P7 A6 root cause 참고).

---

### Phase 7: 월드 초기화 (World Initialize)

**타이밍:** 0x0b0a 직후.

| # | Opcode | 방향 | 이름 | 포맷/크기 | 타이밍 | 역할 | 빌더/핸들러 | 인용 |
|---|--------|------|------|---------|--------|------|-----------|------|
| 39 | 0x0f00 | C→S | RequestWorldInitialize | 크기 불명 | walk 진행 | 월드 초기화 요청 | server/logh7-login-session.mjs:2418 buildWorldDataResp | logh7-opcode-reference §0x0f L232 |
| 40 | 0x0f01 | S→C | ResponseWorldInitialize_OK | 크기 불명 | 0x0f00 응답 | 월드 초기화 OK | server/logh7-login-protocol.mjs buildWorldDataResponseInner | logh7-opcode-reference §0x0f L233 |
| 41 | 0x0f02 | C→S | RequestGridInitialize | 크기 불명 | walk 진행 | 그리드 초기화 요청 | server/logh7-login-session.mjs:113 SS_REQ_GRID_INITIALIZE_CODE | logh7-opcode-reference §0x0f L234 |
| 42 | **0x0f03** | **S→C** | **ResponseGridInitialize_OK** | **크기 불명 (body[0]=1)** | 0x0f02 응답 | **월드 진입 성공 신호** | server/logh7-login-protocol.mjs buildWorldDataResponseInner | logh7-opcode-reference §0x0f L235; logh7-live-world-entry-2026-06-23.md |

---

### Phase 8: 재동기 및 최종 상태 (Resynchronization & Final State)

**타이밍:** 0x0f03 직후, 또는 월드 렌더링 후 클라가 요청.

| # | Opcode | 방향 | 이름 | 포맷/크기 | 타이밍 | 역할 | 빌더/핸들러 | 인용 |
|---|--------|------|------|---------|--------|------|-----------|------|
| 43 | 0x0f04 | C→S | RequestInformationMailAddress | 크기 불명 | walk 진행 (선택) | 메일 주소 요청 | server/logh7-login-session.mjs:2418 | logh7-opcode-reference §0x0f L236 |
| 44 | 0x0f05 | S→C | ResponseInformationMailAddress_OK | 0x7214 bytes | 0x0f04 응답 | 메일 주소 정보 | server/logh7-login-protocol.mjs (generic walker) | logh7-opcode-reference §0x0f L237 |
| 45 | 0x0f06 | C→S | RequestInformationMessengerStatus | 크기 불명 | 월드 진입 후, 주기적 | 메신저 상태 요청 | server/logh7-login-session.mjs:256 SS_REQ_MESSENGER_STAT_CODE | logh7-opcode-reference §0x0f L238 |
| 46 | **0x0f07** | **S→C** | **ResponseInformationMessengerStatus_OK** | **0x74cc bytes (29900 B)** | 0x0f06 응답 | **메신저 상태/재동기** | server/logh7-login-protocol.mjs (generic walker) | logh7-opcode-reference §0x0f L239 |

---

## 미방출 8코드 명세 (Missing Emitters)

### Summary: 현재 서버가 방출하지 않는 코드

| # | Opcode | 상태 | 포맷/근거 | 해결 방안 | 우선 |
|---|--------|------|---------|---------|------|
| 1 | **0x0201** SSLoginOK | 미방출 | 빌더 있음: buildSsLoginOkInner (logh7-login-protocol.mjs:1734) — 포맷은 작음(≤4B), 근거 P0 | logh7-login-protocol.mjs에서 SS 로그인 성공 경로에 빌더 호출 추가 | **높음** |
| 2 | **0x0301** ResponseTime | 미방출 | 빌더 있음: buildResponseTimeInner (logh7-login-protocol.mjs:182-186) — 근거 P0 | 월드진입 walk 중 시간 동기 경로에 빌더 호출 추가 | 중간 |
| 3 | **0x0313** GridType ×2 | 부분 방출 | 빌더 있음: buildStaticInformationGridTyp (logh7-login-protocol.mjs:653-674), 크기 5004B 고정 — 근거 P0 | walk 진행 시 0x0312 요청에 응답, 그리고 early-grid 경로에서 추가 전송 (LOGH_STRAT_GRID_EARLY=1) | **높음** |
| 4 | **0x031d** StaticBase | 미방출 | 빌더 있음: buildStaticInformationBaseInner (logh7-info-records.mjs) — 포맷 parser stream (u16be count + stride 0x3c elements), 근거 P0 | walk 중 0x031c 응답 또는 world-init 조건부 (LOGH_WORLD_IMPORT_STATIC_BASE=1?) | 높음 |
| 5 | **0x031f** Base Economy | 부분 방출 | 빌더 있음: buildResponseInformationBaseInner (logh7-base-record.mjs) — 크기 0x604 고정 (1540B), 근거 P0/P1 | UI-read 경로에만 응답, 월드진입 walk 중 조건부 추가 | 중간 |
| 6 | **0x0f02** GridInitialize | 미확인 | 클라는 C→S RequestGridInitialize로 보냄, 서버는 처리만 함 (응답 0x0f03) — walk-stall 관련 (markerfix binary patch 논의) | 실제 0x0f02 body 포맷 확인 필요 (C→S vs S→C 구분) | 낮음 |
| 7 | **0x0f06** MessengerStatus | 요청만 처리 | C→S 요청 처리만 있음 (logh7-login-session.mjs:256) — S→C 응답 0x0f07 포맷 0x74cc (29900B), 근거 P0 | 0x0f06 요청에 대한 0x0f07 응답 구현 (또는 지연 resend 로직) | 높음 |
| 8 | **0x0f07** MessengerStatus_OK | 미방출 | 크기 0x74cc (29900B) 고정, 포맷 generic walker zero-fill — 근거 P0 | 0x0f06 요청 처리 후 0x0f07 응답 생성 | **높음** |

---

## Push vs Reactive 분류

| Opcode | 방향 | 타입 | 설명 |
|--------|------|------|------|
| 0x0201, 0x0204, 0x0206 | S→C | **Reactive** | C→S 요청(0x0200/0x0203/0x0205)에 대한 응답 |
| 0x0301 | S→C | **Reactive** | C→S 0x0300 요청에 대한 응답 (시간 동기) |
| 0x0313, 0x0315 | S→C | **Reactive** | C→S 0x0312/0x0314 요청에 대한 응답 (walk 진행 조건) |
| 0x031d | S→C | **Hybrid** | C→S 0x031c 요청 응답이지만, 월드진입 walk 중 조건부 push도 가능 (미구현) |
| 0x031f | S→C | **Hybrid** | C→S 0x031e 요청 응답이지만, 월드진입 walk 중 조건부 push도 가능 (미구현) |
| 0x0323, 0x0325 | S→C | **Both** | (1) C→S 0x0322/0x0324 요청 응답 (reactive), (2) 0x0b09/0x0b0a 직전 자동 재전송 (push), (3) 월드진입 walk 중 정기 push |
| 0x0b09, 0x0b0a | S→C | **Push** | walk 진행 조건 충족 시 자동 전송 (클라 요청 없음) |
| 0x0f01, 0x0f03 | S→C | **Reactive** | C→S 0x0f00/0x0f02 요청에 대한 응답 |
| 0x0f05 | S→C | **Reactive** | C→S 0x0f04 요청에 대한 응답 (또는 generic walker) |
| 0x0f07 | S→C | **Reactive** | C→S 0x0f06 요청에 대한 응답 |

---

## 인용 목록 (파일:라인)

### Restored-from-Git Documents
- `docs/reference/restored-from-git/logh7-live-world-entry-2026-06-23.md:9` — 성공 트레이스 체인
- `docs/reference/restored-from-git/logh7-inworld-progress.md:256-265` — A0 marker snapshot fix + walk stall root cause
- `docs/reference/restored-from-git/logh7-inworld-progress.md:305-308` — A6 HUD post-load 0x0f06 resend strategy
- `docs/reference/restored-from-git/SESSION-HANDOFF-2026-06-15-live.md:37-40` — world-entry NOW LOADING 블로커 해결 (0x0304 env-gate)

### Legacy-Evidence Documents
- `docs/reference/legacy-evidence/logh7-info-records-wire.md:§1-§2` — 0x0323 (724B) + 0x031d/0x031f parser offsets
- `docs/reference/legacy-evidence/logh7-info-records-wire.md:§2a` — 0x0321 Institution (36KB, 3-level nested)
- `docs/reference/legacy-evidence/logh7-opcode-reference-2026-06-28.md:§0x02-§0x0f` — 모든 opcode wire 명세 + 빌더/핸들러 위치
- `docs/reference/legacy-evidence/logh7-render-interaction-contract.md:§2` — world admission HUD contract, 0x0323/0x0325 역할

### Server Source
- `server/src/server/logh7-login-protocol.mjs:52-57, 182-186, 213-217, 224, 340-344, 501, 653-674, 576-628, 1187-1196, 1251-1285, 1303-1328, 1353-1371, 1734, 1738` — 모든 빌더 위치
- `server/src/server/logh7-login-session.mjs:113, 256, 511, 521, 2102-2428, 2606-2643` — 모든 요청 핸들러 위치
- `server/src/server/logh7-info-records.mjs:110-139, 174-202` — 정적정보 빌더
- `server/src/server/codec/base-record.mjs, institution-record.mjs` — 기지/시설 빌더

---

## 구현 체크리스트

- [ ] **0x0201 SSLoginOK** — logh7-login-protocol.mjs SS 로그인 성공 경로에 buildSsLoginOkInner 호출 추가
- [ ] **0x0301 ResponseTime** — walk 중 시간 동기 경로에 buildResponseTimeInner 호출 추가
- [ ] **0x0313×2 early-grid** — LOGH_STRAT_GRID_EARLY=1 환경변수 조건 하에 walk 시작 시 한 번, 그리고 0x0312 응답으로 한 번 더 전송 (현재는 0x0312 응답만 함)
- [ ] **0x031d static-base** — walk 중 조건부 전송 (또는 0x031c 응답 경로)
- [ ] **0x031f base-economy** — world-init walk 중 조건부 전송 (또는 0x031e 응답 경로, 현재는 UI-read만)
- [ ] **0x0323×2, 0x0325×2 refresh** — 0x0b09 직후 강제 재전송 (logh7-inworld-progress.md §LOG P7 A6 패턴)
- [ ] **0x0f06/0x0f07 messenger** — 클라가 0x0f06을 보낼 때 0x0f07 응답 생성 (현재 미구현)
- [ ] **테스트** — 성공 월드진입 e2e 재현, 정적정보 데이터 바이트 대조, 화면 렌더 확인

---

## 참고: 현재 알려진 미해결 사항

1. **0x0313 staging→live 전환 (marker render)** — 성공 트레이스에서 0x0313 데이터가 클라 staging 테이블에 도달하는지 미확인 (markerfix binary patch 시도 중, logh7-inworld-progress.md §LOG P8-P11 참고)
2. **세션선택 0행 (0x2006 factory drop)** — 21KB 0x2006이 클라 수신은 하나 parser 후 drop 됨 (logh7-inworld-progress.md §LOG P17-P21 진행 중)
3. **0x0f06/0x0f07 메신저 상태 실제 데이터** — 포맷 29900B 고정이지만 서버 빌더 없음, generic walker로 zero-fill만 하고 있음 (구현 필요)

---

## 버전 정보

- **작성일:** 2026-07-10
- **근거 문서 일자:** 2026-06-23 (world-entry live) ~ 2026-06-30 (grid-info validation)
- **opcode reference:** 2026-06-28 full-RE wave
- **confidence level:** P0 (wire layout 모두 확정), P1 (live walk 부분), P2 (빌더 일부 미호출), P3 (데이터 값 seed/provisional)

