# LOGH VII UI 화면 체크리스트 (현행)

- Status: **OPEN / 관측 체크리스트** — 구현 완료 주장 아님. Ultragoal `ui-checklist-p0-p1-p2` G001–G008 반영.
- Updated: **2026-07-21** (sole, Barat cell **2014**)
- **Fresh live RE:** `_workspace/liveqa-20260721-ui-checklist-re/` — world **1924×1084**, 18 shots, client alive, join `emitted031f` (04:09Z). See `LIVE-RE-FINDINGS.md`.
- **Code pass (G001/G002 skeptic fix):** 0x031f **no owner→class_ invent** (+0x175 = message template only when explicit). 0x0323 stats sticky on player through enterWorld→0x0f02 grid-init + `buildPlayerCharacterRecord`. Seeds without pcp/stamina leave 0 (honest). Live non-NO-DATA = **Blocked** until seed has fields **and** re-shot.
- Purpose: 전략·전술·기타 화면에서 **무엇이 / 어디에** 떠야 하는지 고정하고, **Live / Evidence / Gap** 을 채운다.
- Sources: 매뉴얼 JSON · original-ui-reference · server-data-audit · join-debug · known-issues

### 상태 코드

| 코드 | 의미 |
|------|------|
| **OK** | 기대에 가깝게 관측 (기능 성립) |
| **PARTIAL** | 일부만 (라벨만, 깨진 이름, 색만, 조작만) |
| **EMPTY** | UI 자리 있음·데이터 공백/NO DATA/미표시 |
| **UNSEEN** | 해당 화면·패널 미진입 (이 호스트 관측 없음) |
| **N/A** | 원작 미구현 또는 현재 모드 비대상 |
| **BLOCKED** | 선행 조건 미달 (선택·opcode·게이트) |

### 증거 약어

| 약어 | 출처 |
|------|------|
| U-orb | 사용자 2026-07-21: 궤도 헤더·이름 깨짐·숫자 없음·NO DATA·점령/함선수 없음·검은 구 |
| J-ok | join-debug: `playerCell=2014`, `selectedBaseId=7` バーラト, `emitted031f=true`, codes incl. 0x31f/0x321 |
| W-rev | reverify-b stdout: world-enter 0x0313/0315/031c→031d/0323/0325; spawn 당시 0x031f **없음**(cell 2015 시절) |
| KI | `.ai/known-issues.md` |
| AUD | server-data-audit 2026-06-28 |
| REF | original-ui-reference stay.jpg / strategy 스샷 |
| MAN | server/content/manual/* |

---

## 0. 모드 구분 (MAN session-rules p.12)

| 모드 | 다루는 일 | 진입/종료 | Live | Evidence |
|------|-----------|-----------|------|----------|
| **전략** | 국가경영·생산·군사 이동·인사·이동 | 세션 내 상시 | **OK** (진입·맵 조작) | U-orb, W-rev, J-ok |
| **전술** | 함대전·행성 점령 | 적과 동 그리드; 한 진영만 남으면 종료(+점령) | **UNSEEN** / **N/A** 기본 | KI: `LOGH7_TACTICAL_ENTRY` default OFF, world-enter arm 크래시 |

전술 중 전략 커맨드 입력 불가 (MAN).

---

## 1. 전략 화면

### 1.1 메인 뷰 ① — 은하 그리드

| # | 떠야 할 것 | 위치 | 매뉴얼/REF | 와이어·데이터 | Live | Evidence | Gap (한 줄) |
|---|------------|------|------------|---------------|------|----------|-------------|
| S-MV-01 | **그리드** (1변 100광년) | 중앙 | MAN layout | 0x0315 RLE | **OK** | L-re 청 격자 | — |
| S-MV-02 | **성계 마커** (클릭) | 그리드 셀 | MAN+REF | 0x0313 klass=3 | **OK** | L-re 유색 항성 다수 | — |
| S-MV-03 | **성계명 라벨** | 마커 근처 | REF strategy | constmsg / 마커 | **OK** | L-re ヴァンステイド·アルタイル 등 가나 정상 | 맵 OK ≠ 패널 |
| S-MV-04 | **점령/진영 표시** | 마커·색 | REF; 진영 약칭 | 0x031f owner; 소유 테이블 | **EMPTY** | L-re 오버레이 없음 (스펙트럼 색만) | **G003 Unknown**: 맵 오버레이 소비자 미특정 — 서버 구현 금지 |
| S-MV-05 | **함선/전력 숫자** | 성계 옆 | REF ★73000류 | 소비 경로 **미특정** | **EMPTY** | L-re 숫자 0건 | **G003 Unknown**: ship-count wire 후보 없음 |
| S-MV-06 | **함대 마커** (자/타) | 그리드 | REF | 0x0325 | **BLOCKED** | L-re 아이콘 0; join 0x325 송신; commander=cell 코드 경로 | **G004**: 0x032e=0; 선택 선행 |
| S-MV-07 | **항행 궤도선** | 메인 뷰 | REF | 이동 후 | **BLOCKED** | 선택 선행 | 함대 선택 후 재관측 |
| S-MV-08 | **4방향 가장자리 스크롤** | 조작 | MAN layout | 클라 로컬 | **OK** | 조작 성립 (세션 관측) | — |
| S-MV-09 | **휠 확대/축소** | 조작 | MAN layout | 클라 로컬 | **OK** | 동상 | — |
| S-MV-10 | **궤도 행성 메시** | 성계 줌 | wire §D | `p%03d_low.mdx`+mask | **BLOCKED** | U-orb 검은 구; 이 패스 줌 미진입 | **G005** 궤도 줌 후 재관측 |
| S-MV-11 | **궤도 행성 이름** | 뷰/툴팁 | content planets[] | 목록 와이어 **미확정** | **BLOCKED** | U-orb; 0x031d=성계 1줄만 | **G005** planetNames 미encode |

### 1.2 은하 맵 ② — 하단 중앙

| # | 떠야 할 것 | 위치 | 매뉴얼 | Live | Evidence | Gap |
|---|------------|------|--------|------|----------|-----|
| S-GM-01 | **은하 전체도** | 하단 중앙 | MAN ui-panels ② | **OK** | HUD 존재 (월드 진입 공통) | — |
| S-GM-02 | **에리어 커서** (메인 뷰 범위) | 미니맵 | 동상 | **PARTIAL** | HUD 일부 관측 | 드래그 연동 세밀 미기록 |
| S-GM-03 | 커서 **드래그→메인 이동** | 조작 | 동상 | **UNSEEN** | 전용 A/B 없음 | 라이브 한 줄 관측 필요 |

### 1.3 정보 뷰 ③ — 좌하단

| # | 떠야 할 것 | 위치 | 매뉴얼/REF | 와이어 | Live | Evidence | Gap |
|---|------------|------|------------|--------|------|----------|-----|
| S-IV-01 | **초상** | 좌하 | MAN 정보뷰 | 0x0323 face | **OK** | L-re 얼굴 CG | — |
| S-IV-02 | **이름·계급·직책** | 좌하 | REF | 0x0323 parentage@0x80 | **PARTIAL** / **Blocked** | L-re **皇帝**+이름깨짐 | **Binding map**: lastname@0x81, firstname@0x9c, rank@0xd6, title@0xd8(strip 皇帝). JC 皇帝=직무카드. Live re-shot 전 EMPTY 잔존 가능 |
| S-IV-03 | **체력·PCP** | 좌하 | REF | 0x0323 pcp@0x50 LE stamina@0x1a9 | **BLOCKED** | L-re PCP **0**; canon seed 무 pcp | 시드 필드 없으면 0 정직; sticky 경로 테스트 green |
| S-IV-04 | **능력 8종** | 좌하 | MAN character-params | 0x0323 ability@0x188 u16×8 | **BLOCKED** | L-re NO DATA; ability8 시드 0 가능 | 시드 non-zero면 enter+grid-init 바인드 검증됨 |

### 1.4 직무권한 카드 ④

| # | 떠야 할 것 | 위치 | 매뉴얼 | Live | Evidence | Gap |
|---|------------|------|--------|------|----------|-----|
| S-JC-01 | **탭 UI** | 우측 | MAN ④ | **PARTIAL** | HUD 버튼 영역 존재 (세션) | 열림 여부 미기록 |
| S-JC-02 | **보유 카드 목록** | 풀업 | MAN | **UNSEEN** | — | 0x0305/0307 카드 |
| S-JC-03 | 카드 설명·**일일 공적** | 카드 면 | MAN 스크린샷 400 | **UNSEEN** | — | 카드 콘텐츠 |
| S-JC-04 | **커맨드 그리드** (워프 등) | 카드 면 | MAN+REF | **BLOCKED** | KI 0x032e=0; G004 선행 | **G005** 함대 선택 후 |
| S-JC-05 | **명령/제안** | 카드 면 | MAN | **BLOCKED** | G004/G005 | 동상 |

### 1.5 동일 스폿 캐릭터 ⑤

| # | 떠야 할 것 | Live | Evidence | Gap |
|---|------------|------|----------|-----|
| S-SC-01 | 탭 UI | **UNSEEN** | — | 탭 클릭 관측 |
| S-SC-02 | 동 스폿 캐릭 목록 | **UNSEEN**/**EMPTY** | 스폿 캐릭 푸시 약함 | 0x0323 다수/스폿 키 |

### 1.6 시스템 아이콘 ⑥

| # | 떠야 할 것 | Live | Evidence | Gap |
|---|------------|------|----------|-----|
| S-SI-01 | 메신저 | **UNSEEN** | — | 아이콘 클릭 |
| S-SI-02 | 정보 → 7종 창 | **UNSEEN** | — | 1.7 |
| S-SI-03 | 메일 | **UNSEEN** | — | 메일 opcode |
| S-SI-04 | 시스템(종료/사운드/설정) | **UNSEEN** | — | 클라 로컬 위주 |

### 1.7 정보 윈도우 7종

| # | 창 | Live | Evidence | Gap |
|---|-----|------|----------|-----|
| S-IW-01 | 캐릭터 정보 | **UNSEEN** | — | 정보 아이콘 미클릭 |
| S-IW-02 | 기함 정보 | **UNSEEN** | — | 0x032a 등 |
| S-IW-03 | 전대 정보 | **UNSEEN** | — | — |
| S-IW-04 | 부대 정보 | **UNSEEN** | — | 0x0325 연계 |
| S-IW-05 | 행성·요새 정보 | **PARTIAL** | U-orb 궤도 패널 쪽 | = S-BP-* |
| S-IW-06 | 국가 정보 | **UNSEEN** | — | — |
| S-IW-07 | 지형 정보 | **UNSEEN** | — | 0x0313 라벨 |

### 1.8 채팅 ⑦

| # | 떠야 할 것 | Live | Evidence | Gap |
|---|------------|------|----------|-----|
| S-CH-01 | 상단 시스템 메시지 | **PARTIAL** | HUD 채팅 영역 존재 | 내용 품질 미기록 |
| S-CH-02 | 하단 채팅 | **PARTIAL** | 동상 | 입력/동스폿 범위 미검증 |
| S-CH-03 | 같은 스폿 메시지 범위 | **UNSEEN** | — | MP/동스폿 |
| S-CH-04 | 탭 全体/艦隊/同陣営 | **PARTIAL** | 레이아웃 스샷·HUD | 탭 동작 미기록 |

### 1.9 기지/궤도 패널 (拠点·惑星／要塞軌道上)

| # | 떠야 할 것 | 와이어 참고 | Live | Evidence | Gap |
|---|------------|-------------|------|----------|-----|
| S-BP-01 | 헤더 **궤도상** | UI 문자열 | **OK** | L-re **惑星／要塞軌道上** 일본어 정상 | — |
| S-BP-02 | 성계/행성 **이름** (정상) | 0x031d name (성계) | **PARTIAL** | L-re **バーラト星系** (접미 보임) | 행성 행 목록 없음 |
| S-BP-03 | **支配陣営名** | 0x031f +0x04 owner | **BLOCKED** | L-re NO DATA; server owner=0x02 송신 | **G001**: owner@+0x04 송신 확정; 진영 **문자열** 소비 경로 미확정. +0x175≠진영(템플릿) — owner→class_ 날조 제거 |
| S-BP-04 | **統治者名** | 0x0323 spot | **BLOCKED** | L-re **NO DATA** | spot 캐릭 매칭 미구현 |
| S-BP-05 | **守備隊長名** | 0x0323 | **BLOCKED** | L-re NO DATA | 동상 |
| S-BP-06 | **人口 등 수치** | 0x031f scalars provisional | **BLOCKED** | L-re 숫자 없음; 서버 P3 비영 | 스칼라 오프셋 provisional — 소비자 RE 전 완료 금지 |
| S-BP-07 | 군수·**함선 재고** 등 | 0x031f/0321/0327 | **EMPTY** | L-re | 창고 캐시 FUN_0057aa90 경로 |
| S-BP-08 | 시설 수 | 0x0321 | **EMPTY** | join 0x321 빈 institutions | 시드 |
| S-BP-09 | 궤도 함선 수 | 유닛 집계 | **EMPTY** | L-re | 집계 |

**서버 대비 (Barat, 코드 덤프):** 0x031f id=7, **owner@+0x04=0x02** (동맹), field08/14/18·budget·commodity **비영(P3)**. **class_@+0x175 제품 기록 없음**(static-base `class_` undefined; 템플릿은 explicit 시에만). Live S-BP-03~06 = **BLOCKED** (진영 문자열 소비 경로 미확정 + 스칼라 오프셋 provisional). 바인딩: `_workspace/g001-g002-binding-map.md`.

### 1.10 멤버 리스트

| # | 떠야 할 것 | Live | Evidence | Gap |
|---|------------|------|----------|-----|
| S-ML-01 | 멤버/파티 목록 | **BLOCKED** | KI 0x032e=0 전 런 | 함대 선택 선행; 0x032f 서버 준비 |

---

## 2. 전술 화면 (G006 — `LOGH7_TACTICAL_ENTRY` default OFF)

| # | 요소 | 위치 | Live | Evidence | Gap |
|---|------|------|------|----------|-----|
| T-LY-01 | 메인 3D | 중앙 | **UNSEEN** | KI tactical entry OFF; world-enter arm 크래시 이력 | 인간 승인 후 ON |
| T-LY-02 | 레이더 | 좌상 | **UNSEEN** | 전술 미진입 | 동상 |
| T-LY-03 | 커맨드 윈도우 | 우하 | **UNSEEN** | REF en004 | C002 체인 |
| T-LY-04 | 조함 패널 | 우상 | **UNSEEN** | MAN energy | 동상 |
| T-LY-05 | 시스템 아이콘 | 커맨드 하 | **UNSEEN** | — | 동상 |
| T-LY-06 | 채팅/로그 | 좌하 | **UNSEEN** | MAN tactical-chat | 동상 |

### 2.2 조함 에너지 채널

| # | 채널 | Live | Evidence |
|---|------|------|----------|
| T-EN-01~06 | BEAM/GUN/SHIELD/ENGINE/WARP/SENSOR | **UNSEEN** | 전술 미진입 — 진입 계약 전 구현 금지 |

### 2.3 조작

| # | 조작 | Live | Evidence |
|---|------|------|----------|
| T-IN-01~04 | 좌클릭/더블/드래그 | **UNSEEN** | 전술 미진입 |
| T-IN-05 | 선택→커맨드 좌클릭 | **BLOCKED** | 전술+선택 미달 |

### 2.4 종료 조건

| # | 조건 | Live |
|---|------|------|
| T-END-01 | 한 진영만 잔존 | **UNSEEN** / **N/A** (전술 OFF) |
| T-END-02 | 행성/요새 완전 점령 | **UNSEEN** / **N/A** |

---

## 3. 행성 내부 / 시설 (G006 — 기지 입실 미관측)

| # | 시설/스폿 | Live | Evidence | Gap |
|---|-----------|------|----------|-----|
| P-F-01 | 政庁 정청 | **UNSEEN** | MAN place-facilities; 입실 플로 미검증 | 기지 입실 선행 |
| P-F-02 | 防衛司令部 | **UNSEEN** | 동상 | 동상 |
| P-F-03 | 広場/公園 | **UNSEEN** | 동상 | 동상 |
| P-F-04 | 宇宙港 | **UNSEEN** | REF lobby | 동상 |
| P-F-05 | エネルギープラント | **UNSEEN** | 동상 | 동상 |
| P-S-01~05 | 스폿 접근 유형 | **UNSEEN** | MAN | 입실 후 |
| P-UI-01~03 | 로비 목록·초상·직무카드 | **UNSEEN** | REF uu3 | 동상 |

---

## 4. 로비 / 세션

| # | 화면 | Live | Evidence | Gap |
|---|------|------|----------|-----|
| L-01 | 로그인 | **OK** | W-rev 0x2000→; sole bat | — |
| L-02 | 캐릭터 목록 | **OK** | 0x2003/2004 | — |
| L-03 | 세션 선택 | **OK** | 0x2005/2006, 0x2009/200a | — |
| L-04 | 캐릭터 생성 | **OK** | 기존 플로 (aa 보유) | — |
| L-05 | 월드 진입 | **OK** | 0x0200→0x0f02 spawn; J-ok | — |

---

## 5. 서버 송신 스냅샷 (2026-07-21 join 성공 후)

grid-init-spawn codes (J-ok):

`0x204, 0xb09, 0x325, 0x323, 0xb0a, 0x313, 0x315, **0x31f**, **0x321**, 0xf03, 0x356`

| 레코드 | 송신 | UI 연결 |
|--------|------|---------|
| 0x0313/0315 | 예 | S-MV-01/02 |
| 0x031d | 예 (0x031c pull W-rev; spawn 경로 별도) | S-BP-02 이름 |
| 0x031f | 예 (J-ok); owner@+0x04; **class_ 제품 미기록** | S-BP-03~06 **BLOCKED** (표시 NO DATA + 소비자/오프셋) |
| 0x0321 | 예 (빈 institutions) | S-BP-08 EMPTY |
| 0x0323 | 예; sticky 시드 스탯 경로 | S-IV **BLOCKED**/PARTIAL (시드 무 pcp → 0); S-BP-04/05 BLOCKED |
| 0x0325 | 예 | S-MV-06 **BLOCKED** |
| 0x032e/032f | 라이브 0건 | S-ML-01 BLOCKED |
| 0x0b01 / Warp | 미도달 | S-MV-07, S-JC-04 BLOCKED |

---

## 6. Fresh live RE 요약 (2026-07-21 world-hd 픽셀 + 코드 게이트)

| 우선 | IDs | Live / 게이트 | 다음 행동 |
|------|-----|---------------|-----------|
| **P0** | S-BP-03~06 | **BLOCKED** (픽셀 NO DATA; owner 송신 OK) | 진영 문자열 소비 RE; 스칼라 오프셋; 재라이브 |
| **P0** | S-BP-07~09 | **EMPTY** | 창고/시설/집계 |
| **P0** | S-MV-04, S-MV-05 | **EMPTY** / G003 **Unknown** | 점령/함선수 오버레이 소비자 RE — 구현 금지 |
| **P0** | S-MV-06, S-ML-01 | **BLOCKED** | 함대 마커; 0x032e |
| **P0** | S-IV-02~04 | **BLOCKED**/PARTIAL | sticky 검증됨; 시드 pcp 없으면 0 정직; 재샷 |
| **P1** | S-JC-04 | **BLOCKED** (G004) | 선택 후 커맨드 그리드 |
| **P1** | S-MV-10/11 | **BLOCKED**/UNSEEN | 성계 궤도 줌 |
| **OK** | S-MV-01~03, S-GM-01, S-IV-01, S-JC-01, S-SI, S-BP-01 | **OK/PARTIAL** | 맵 성계명 일본어 **정상** (패널과 대비) |

### 맵 라벨 vs 패널 (RE 핵심)

- **맵**: ヴァンステイド / アルタイル 등 **가나 정상** → constmsg/마커 경로 OK.  
- **패널 バーラト星系 + 惑星／要塞軌道上 NO DATA** → 헤더·성계 접미 부분 OK, **동적 칸 BLOCKED**.  
- 서버 `emitted031f=true` + owner@+0x04 → **미송신 아님**; 진영 문자열/스칼라 소비자 미확정. **class_@+0x175 제품 승격 없음.**

---

## 7. 관련 문서

- 행성/에디터 갭: `docs/logh7-content-editor-gap-current.md`
- 조인 증거: `_workspace/liveqa-20260721-orbit-data-join/`
- 데이터 감사: `docs/reference/legacy-evidence/logh7-server-data-audit-2026-06-28.md`
- 기지 패널 RE: `docs/reference/legacy-evidence/base-panel-re-report.md`
- 매뉴얼 PDF: `docs/reference/gin7manual.pdf`
