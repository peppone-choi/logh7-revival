# 은영전 VII 리마스터 마스터 로드맵 — 2026-06-26

13개 도메인 병렬 감사(flow-happy-path / wire-received / server-emit / consumption-trace /
map-switch / in-planet-jobcards / npc-ai / strategic-map / tactical-map / fleet-battle /
remaster-hud-ui / mdx-galaxy / references-catalog)를 종합한 **단일 권위 로드맵**.

이 문서는 `docs/logh7-completion-matrix-2026-06-26-v2.md`(완성도)와
`docs/logh7-remaster-roadmap-2026-06-26.md`(리마스터)를 **대체가 아니라 통합·갱신**한다.
캐논: 서버=`server/src/server`, 위치권위=`server/content/galaxy.json`, RE=`.omo/ghidra/export/`,
라이브 도구=`RE/tools`. 라이브 검증은 메인 직렬(수동 로그인, stop 시 SHA `992dc7e2` 복원).

---

## (a) 목표 요약

은영전 VII(`G7MTClient.exe`)를 **실유저가 수동 로그인 → 별개 캐릭터 생성 → 월드 진입 →
전략맵/전술맵/함대전/직무·기지 패널을 상호작용**하는, 캐논 NPC 위계가 자율로 살아 움직이는
리마스터 멀티플레이 게임으로 복원한다. 5대 합격 기준(메모리 logh7-real-game-behavior-2026-06-25):
①autologin 금지=실로그인 ②로그인만 창모드→이후 풀스크린 ③별개 캐릭(초상화·이름 다름)
④캐논 NPC 시드→플레이어 하급사관(자동황제 금지) ⑤매 라이브 테스트 저널 기록.

**핵심 판정(13도메인 종합)**: 서버/시뮬/와이어/콘텐츠 층(pillar A ~80%)은 라이브 무관하게
거의 완성(server 1198 tests / 1180 pass / 0 fail / 18 skip). 미달의 압도적 대부분은 **두 게이트**로 수렴:
- **G0 = 라이브 월드진입 환경 신뢰화**(코드 아닌 환경, 단일 최대 게이트) — 저널 #6에서 1세션 극복 입증.
- **C002 = 클라-로컬 mode byte(`0x35f35a` → `FUN_004b68f0`) 단일 게이트** — 맵전환·전술맵·함대전·
  직무카드·커맨드윈도우·기지패널이 전부 이 라우터에 funnel. 진짜 블로커=own-fleet selectable 렌더
  (case0 `FUN_0058d140` 6-AND 게이트). 9~12 라이브 run으로 force/lever/click/own-cell 전경로 배제.

리마스터(pillar D)는 문서가 "~9% 무변동"으로 stale; 실제는 6-26 전수 스윕으로 텍스처 ~420개+
ESRGAN+GFPGAN 초상화 416 배포·라이브 무손상 렌더 확정(저널 #6 7차 run). MDX 좌표 하드코딩
의심은 **바이트 증거로 기각**((d)·(e) 참조).

---

## (b) 현재 라이브 확정 동작 (저널 #1~#7, shot 인용)

- **수동 로그인**: 640 창모드 프레임+ID/PW칸 → 0x7000 발신 → 0x0020 로비 → 0x2005, 창모드→풀스크린
  자동전환 (저널 #1/#10).
- **로비 진입**: 블루 HUD 로비메뉴 (shot 027).
- **캐릭생성 picker**: charsel-recenter 후 picker 카드 렌더 (저널 #7, shot 357/363).
- **월드 진입 풀플로우**: 0x7000→0x0020→0x1008→0x0f02→0x0313 그리드→0x0323×26 NPC 위계 시드→
  0x0325 (저널 #6, shot 049). 자동황제 아닌 캐논 NPC 시드 라이브 작동.
- **전략맵 렌더(골격)**: 다색 항성(청/주황/적 분광형)·전략그리드·성운배경·하단 HUD(초상화+스탯·미니맵·
  커맨드패널 프레임). strategy.jpg 레퍼런스와 골격 1:1 일치 (shot 049).
- **리마스터 렌더**: HUD20+패널40+AI텍스처16+초상화416 배포, 무손상 렌더, 크래시 0 (shot 174).
- **L2 상태전환 부분**: `LOGH_STATE_TRANSITION_PROBE`→0x0f1f 푸시→중앙 모드전환 UI 패널 출현
  (shot 075→076). 서버푸시 상태전환 arm 라이브 작동(완전 전술렌더는 추가데이터 필요).
- **C002 라이브 입증**: in-world 클릭 닿으나 0x0b01 미발생 = 마우스 아닌 mode2 게이트(RE 결론 정확).

**라이브 미실증(전부 G0/C002 종속)**: faction 함대색·own-fleet 마커·완전 전술맵·함대전 피해바/격침·
拠点패널·직무카드·커맨드윈도우·집무실·인물 스테이터스·strict 로그인·별개 캐릭 2카드.

---

## (c) 마일스톤 (범위=전체: 리마스터+컨텐츠+플레이가능)

| MS | 이름 | 범위 | 게이트/완료조건 |
|---|---|---|---|
| **M0** | 기반/재구조화 | server/+client/ 자가완결 별도 레포, RE/.omo 정션, server 1198/0fail | ✅ done |
| **M1** | 실플레이 게이트(현 집중) | §(a) 5조건: 실 credential·별개캐릭·캐릭생성 확인 다이얼로그·charsel 정합 | 라이브 직렬 (P0 백로그 1~6) |
| **M2** | 상태전환/맵전환(AXIS2) | 0x0f1f/0x0b09·0x0b0a 서버푸시로 전략↔전술 시각전환 | L2 부분 확정, 완전 전술렌더 잔여 |
| **M3** | 인월드 상호작용(C002) | own-fleet selectable 렌더→fleet-click→명령메뉴→0x0b01 | 깊은 프런티어 (P0 백로그 7~9) |
| **M4** | 전투/전술 렌더 | 완전 전술 시드→배틀필드 렌더, 0x426 피해바/격침 시각 | M3 종속 |
| **M5** | 콘텐츠/캐논 | 시설/장소 데이터·직무카드 배선·officer 명부·작전 수치·NPC 조인 | 병렬, 일부 라이브 |
| **M6** | 리마스터/한글화/배포 | UI 아틀라스 내성·1920 패널·신규 SR 타겟·dgVoodoo 프리셋·런처 한글 | 병렬, 일부 라이브 |
| **M7** | 전수 RE | G7MTClient ~5.7%→임계경로(C002 case0·credential 빌드·post-handler) | 병렬 |
| **M-final** | 패키징 | play-logh7.exe·풀스크린 필러·전 화면 라이브 회귀·릴리스 | 전 MS 종속 |

**Critical path(직렬)**: G0(월드진입 신뢰화) → 캐릭생성 확인 다이얼로그+strict credential →
own-fleet 렌더 진단(C002) → M2 완전 전술 → M4 함대전 시각. M2(상태전환)는 C002와 decoupled라
먼저 시각 진전을 만든다.

---

## (d) 도메인별 갭 → 다음스텝 표

| 도메인 | 핵심 갭 | 다음스텝 | grade | liveNeeded |
|---|---|---|---|---|
| flow-happy-path | 캐릭생성 확인 다이얼로그(예/아니오) EXE버그(FUN_0056f960 +0xde0) | dialog-inputgate.json 후보A 별도빌드→real-login 진단 | P0 | yes |
| flow-happy-path | strict 0x7000 account 라벨 빈값 전송 | 클라 credential 빌드 경로 RE→strict 라이브 | P0 | yes |
| flow-happy-path | **charsel 배경(1920)↔내용(640 anchor) 어긋남** | charsel-recenter 전 패널 recenter→DEFAULT_STACK→라이브 정렬 | **P0** | yes |
| flow-happy-path | ui_flow.py stale 640 좌표 | 644×484 기준 좌표로 교정 | P1 | no |
| wire-received | 와이어 레코드 시각 실증 0건(layout만 닫힘) | G0 후 0x0325+0x0323 push→마커·색 trace | P0 | yes |
| wire-received | 0x0325 중간필드 value semantics(commander/cell/owner) | 라이브 1슬롯 변조→HUD 반응 | P1 | yes |
| wire-received | DEPRECATED 0x031f/0x0321 빌더 잔존 | @deprecated throw로 단일화 | P3 | no |
| server-emit | 0x0317 grid emit mode 전환 라이브 미확정 | LOGH_GRID_SELECTOR_PROBE→0x35f35a watch | P0 | yes |
| server-emit | 0x0f1f 상태전환 push 라이브 미실증 | LOGH_STATE_TRANSITION_PROBE→load-arm watch | P0 | yes |
| server-emit | faction 색 mpVisibility 게이트 뒤에만 | 단일/관전 경로에도 동반 0x0323 또는 2클라 실증 | P1 | yes |
| consumption-trace | 수신되나 효과 미실증(0x0f1f/0x0323/0x0325) | 서버푸시 시각 실증 | P1 | yes |
| consumption-trace | 송신 FUN_004b78a0 응답쌍 일부 추론 | 라이브 trace로 요청→응답 캡처 | P2 | yes |
| map-switch | C002 0x0b01 클릭확정 라이브 0건 | own-fleet 6게이트 read-only Frida 진단 | P0 | yes |
| map-switch | own_cell 진영 불일치(패치 하드코딩 2588) | LOGH_PLAYER_FOCUS_CELL write-watch | P1 | yes |
| in-planet-jobcards | **시설/장소 콘텐츠 데이터 부재(더미 1개 폴백)** | facility-spots.json 신설→content-pack 로드 | P0 | yes |
| in-planet-jobcards | 직무카드 0x0305 기본 비활성 | canon-initial-cards+strategy-commands 배선 | P0 | yes |
| in-planet-jobcards | 한글 시설명↔nameCatalogId 미매핑 | 매핑 테이블→정확 nameCatalogId 주입 | P1 | yes |
| npc-ai | 쿠데타 상태머신 라이브 미연결(누적만) | 전략틱 임계초과→자동 declareRingleader→execute | P2 | no |
| npc-ai | 전략층 함대↔전술 NPC AI 분리 | 전략 함대를 전술 ship 엔티티로 브리지 | P1 | no |
| npc-ai | 전략 사령관 charId↔위계 시드 NPC 미조인 | 동일 캐논 charId 통일 | P1 | no |
| strategic-map | own-fleet 스프라이트 미출현(case0/own_cell) | LOGH_PLAYER_FOCUS_CELL 시드→스폿 차분 | P0 | yes |
| strategic-map | 항성 NAME 라벨·전력숫자·셀렉션/커맨드 리스트 빔 | 0x0313 성계명 라벨+0x0325 마커 라이브 캡처 | P1 | yes |
| strategic-map | 특수천체 셀 배치 캐논 매핑 부재 | (추측금지) 미주입 유지 | P3 | no |
| tactical-map | **mode byte 시각전환 게이트(0x35f35a client-local)** | moderoute 패치 재빌드→라이브 mode0 강제 | P0 | yes |
| tactical-map | moderoute 패치 EXE 디스크 부재 | VA 0x4b6afd 02→01 재빌드 | P0 | yes |
| tactical-map | 전술 좌표/스케일 휴리스틱 | 전술 필드 좌표공간 소비처 RE | P2 | no |
| fleet-battle | 전 전투 도메인 라이브 시각 0건 | G0 후 0x426 피해바/격침 캡처(LOGH_NPC_AI) | P0 | yes |
| fleet-battle | 배틀진입 전략→전술 전환 미실증 | 0x42f+0x0f1f openBattleField 라이브 | P0 | yes |
| fleet-battle | computeDamage 밸런스 P3 추정치 | 매뉴얼 캐논 대조 or design 명시 | P3 | no |
| remaster-hud-ui | **문서 stale(~9% 무변동)** | 6-26 전수 스윕 실적으로 재산정 | P2 | no |
| remaster-hud-ui | UI 아틀라스 rect-math 업스케일 내성 미실증 | 2x 단일자산 spot-check 라이브 | P1 | yes |
| remaster-hud-ui | 1920 네이티브 패널 정렬 실패(8차 run) | 패널별 정밀 recenter 재시도 | P2 | yes |
| remaster-hud-ui | 모델/MDX 메시 지오메트리 0% | 폴리곤 배열 매핑(고난도) | P3 | no |
| remaster-hud-ui | 고해상 셀확대 EXE 아틀라스 deep-RE 미착수 | FUN_005b51fa 호출원·셀 rect RE | P2 | no |
| mdx-galaxy | **메모리가 부재 파일(Null_galaxy.mdx) 인용** | 실존 strategy/4 MDX 바이트로 근거 교체 | P3 | no |
| mdx-galaxy | spectralClass 권위 이원화(80 vs 79) | galaxy.json 단일 권위 확정 | P2 | no |
| references-catalog | 미재현 화면 다수(拠点/직무카드/커맨드/전술/우주전/집무실/스테이터스) | C002·G0 종속, 데이터 충진은 와이어로 | P0/P1 | yes |

---

## (e) 우선순위 백로그 (loop 소비 순서)

각 항목: `grade` · `liveNeeded` · `증거` · `담당도메인`. P0은 위→아래 순으로 소비.

### P0 (플레이가능 필수)

1. **★charsel 패널 전수 recenter(배경↔내용 정합)** — `liveNeeded:yes` · 증거: `RE/tools/client_patches/charsel-recenter.json`
   (앵커 0x51e94e 300→604/0x51e956 134→280, byte-verify PASS), `logh7_build_playable_client.py:159`
   (DEFAULT_STACK lobby-native-layout 포함·charsel-recenter 미포함), 저널 #7. · 담당: flow-happy-path.
   → charsel-recenter를 DEFAULT_STACK 편입(또는 별도 후보빌드), real-login→세션picker/캐릭생성 진입→
   진영라디오/초상화4슬롯/이름칸/능력치행이 1920 배경과 시각 중앙정렬·잘림0 라이브 확인. 로비/login
   다이얼로그 회귀 동시 점검.

2. **캐릭생성 확인 다이얼로그(예/아니오) EXE버그** — `liveNeeded:yes` · 증거: `docs/logh7-dialog-bug-2026-06-26.md:37-67`
   (FUN_0056f960 +0xde0 게이트), 저널 #10/#11. · 담당: flow-happy-path.
   → dialog-inputgate.json 후보A(VA 0x56f9ac 0f85→90×6, same-length, originalHex 가드) 별도빌드→
   real-login 캐릭생성 완주→버튼 살아나는지 진단. 무반응이면 패치전선을 FUN_004b68f0 mode게이트로 이동.

3. **strict 0x7000 credential 빈값 픽스** — `liveNeeded:yes` · 증거: `server/src/server/logh7-login-session.mjs:604-647`,
   저널 #3. · 담당: flow-happy-path. → 클라 0x7000 credential 빌드 경로 RE(FUN_0051bc20 인근)→
   빈 라벨 원인 확정→strict `--account-db` 로그인 trace account≠null.

4. **own-fleet selectable 렌더 case0 6-AND 게이트 read-only Frida 진단** — `liveNeeded:yes` · 증거:
   `docs/logh7-ownfleet-render-fix-2026-06-26.md:14-44`(FUN_0058d140 G1~G6), loop-state:121. · 담당: map-switch/strategic-map.
   → case0(FUN_004fef90) 호출 여부 우선→own_cell *(DAT_007cd04c+0x11178) 실값→FUN_004c7290 miss 확인.
   화면 안 깨짐(read-only). **C002 단일 정밀블로커.**

5. **own_cell 진영별 시드(LOGH_PLAYER_FOCUS_CELL)** — `liveNeeded:yes` · 증거: ownfleet-render-fix:50-59
   (동맹2014/제국2588 불일치), `RE/tools/logh7_launch_config.py:37`(PLAYER_FOCUS_CELL 미포함). · 담당: strategic-map.
   → LOGH_PLAYER_FOCUS_CELL=1 write-watchpoint으로 own_cell이 COMMANDER 슬롯(source+0x320)에서 흐르는지 확정.

6. **시설/장소 콘텐츠 + 직무카드 0x0305 배선** — `liveNeeded:yes` · 증거: `logh7-inferred-content.mjs`
   buildInstitutionSeedElements(더미 폴백), grep institutions=0건, `login-session.mjs:2102`(0x0305 probe off),
   `canon-initial-cards.json`·`strategy-commands.json`(72명령). · 담당: in-planet-jobcards.
   → facility-spots.json 신설(nameCatalogId↔constmsg-ko 83 집무실 매핑)→content-pack 로드, 직무카드 기본 배선→
   월드진입→0x0320 req→0x0321/0x0305 패널 렌더 캡처.

7. **moderoute 패치 재빌드 + mode byte 라이브 측정** — `liveNeeded:yes` · 증거: `docs/logh7-mode-routing-patch-2026-06-26.md:14-32`
   (VA 0x4b6afd 02→01, EXE sha 0fda544e 디스크 부재). · 담당: tactical-map/map-switch.
   → 패치 재빌드→월드 도달 시 [esi+0x126711]·[esi+0x35f35a] 실값 캡처→own-fleet·전술전환 shot.
   **⚠ EXE force는 화면 깨뜨림 전례(12 run mode0 강제=렌더 깨짐) → 사용자 동의 전제, read-only 우선.**

8. **0x0317/0x0f1f 서버푸시 시각 실증** — `liveNeeded:yes` · 증거: `login-session.mjs:260-269`(GRID_SELECTOR_PROBE),
   `:292,1859`(STATE_TRANSITION_PROBE), 저널 #6 L2 부분확정. · 담당: server-emit/consumption-trace.
   → LOGH_GRID_SELECTOR_PROBE→0x35f35a watch로 mode 분기 측정, LOGH_STATE_TRANSITION_PROBE→
   +0x357e88=0x3f800000 load-arm watch. 객체 식별오인 2회 전례라 단정 금지.

9. **함대전/배틀진입 라이브 시각** — `liveNeeded:yes` · 증거: `logh7-login-protocol.mjs:1219-1239`(0x426 28B),
   `battle-engine.mjs:561-665`(openBattleField), 저널 전투항목 0건. · 담당: fleet-battle.
   → G0+LOGH_NPC_AI 후 우주전 사격→0x426 피해바/격침 캡처, 0x42f+0x0f1f 전략→전술 전환·스폰포즈 렌더.

10. **와이어 레코드 클라 실파싱 라이브 실증** — `liveNeeded:yes` · 증거: server 1198 단위테스트뿐, 클라 파싱 0건.
    · 담당: wire-received. → 0x0325+동반 0x0323 push→마커 렌더·아/적 색분기(+0x800/+0x1000) trace.

### P1 (중요, 비필수)

- **항성 NAME 라벨·전력숫자·셀렉션/커맨드 리스트 데이터 충진** — `yes` · strategy.jpg 대비 빔(shot 049) · references-catalog/strategic-map. **mode게이트에 안 막히는 유일 저비용 시각 전진.**
- **faction 색을 단일/관전 경로에도 적용** — `yes` · `faction-projection.mjs:35-90` · server-emit.
- **UI 아틀라스 2x rect-math 내성 spot-check** — `yes` · graphics-remaster §3.1 verifier hedge · remaster-hud-ui.
- **0x0325 중간필드 value-to-slot 라이브 변조** — `yes` · B+0x44~0x54 미심볼 · wire-received.
- **전략층 함대↔전술 NPC AI 브리지 + charId 조인** — `no` · strategic-sim.mjs:212 vs login-session seedableCanonNpcs · npc-ai.
- **ui_flow.py 640 stale 좌표 교정** — `no` · `logh7_ui_flow.py:114-117` vs ui-coordinate-map.md · flow-happy-path.
- **한글 시설명↔nameCatalogId 매핑** — `yes` · constmsg-ko.json 83 집무실 · in-planet-jobcards.
- **拠点패널/직무카드/커맨드윈도우/전술맵 화면 재현** — `yes` · toshichan stay/card/compnel/tactics · references-catalog (C002 종속).

### P2 (보강)

- 리마스터 문서 stale 재산정(9%→실적) — `no` · completion-matrix-v2:37 · remaster-hud-ui.
- 1920 네이티브 패널 정렬 재시도 — `yes` · 저널 8차 run shot 176 · remaster-hud-ui.
- 신규 SR 타겟(스플래시/성계글로우/미니맵/직무카드배경/한글타이틀) — `no` · 로더 무게이트 · remaster-hud-ui.
- 고해상 셀확대 EXE 아틀라스 deep-RE — `no` · FUN_005b51fa · remaster-hud-ui.
- 0x2006 per-power d0/d1/d2·ending body 의미 — `yes` · scenario-session.mjs · wire-received.
- 쿠데타 자율 트리거 라이브 배선 — `no` · coup.mjs(클라 opcode 미확정) · npc-ai.
- 송신 응답쌍 trace 검증 / post-handler RE 웨이브 — `yes/no` · consumption-trace.
- 0x42a/0x0425 warp 레이아웃·spectralClass 정렬 — `no` · fleet-battle/mdx-galaxy.
- 행성내장소 로비·집무실·인물 스테이터스 화면 — `yes` · gamemeca uu3/lobby · references-catalog.

### P3 (정리/낮은 우선순위)

- DEPRECATED 0x031f/0x0321 빌더 @deprecated throw — `no` · info-records.mjs:212 · wire-received.
- 메모리 mdx-no-hardcoded-coords 근거 교체(부재파일→실존 4 MDX) — `no` · mdx-galaxy.
- computeDamage 밸런스 캐논 대조 / officer 명부 결정론 생성 — `no` · fleet-battle/npc-ai.
- 모델/MDX 메시 지오메트리 리마스터 / dgVoodoo 프리셋 — `no/yes` · remaster-hud-ui.
- 특수천체 셀 배치(추측금지 미주입 유지) — `no` · strategic-map.

---

## (f) MDX-galaxy 감사 결론 (하드코딩 확정/반증)

**반증 확정**: 메모리 [[logh7-mdx-no-hardcoded-coords]]의 결론(성계/행성 좌표 MDX 하드코딩 없음)은
**바이트 증거로 옳다**. 단 인용 소스 `Null_galaxy.mdx`는 저장소에 **물리적으로 부재**(find /e 0건).
실존 MDX는 `RE/content/original-data/patch-2004-05-14/strategy/`의 4개(galaxy.mdx 16508B/grid.mdx/
grids.mdx/g_board.mdx)뿐이며 전부 **Lightwave(.lwo) 3D 렌더 래퍼**(메시 float 정점/UV/행렬+BMP/TGA 참조).
g_board.mdx에는 star_01·star_02 빌보드 프로토타입 2종만 있고 80성계 노드 부재 → **좌표 인코딩 물리적 불가**.
어느 MDX에도 ~80쌍 연속 좌표 float 런 없음.

**권위 확정**: 좌표/타입 권위 = `server/content/galaxy.json`(80성계, cx/cy+canon* 픽셀좌표+spectralClass,
_source=PDF p101 星系図). MDX 파생 유일 산출물 = `model-galaxy-stars.json`(79노드, spectral_class만, 좌표 0,
node order≠system order). **spectralClass 이원화 미해소**(galaxy.json 픽셀색 80 vs MDX 노드 79)는 P2.
→ 리마스터/3D복원 시 **메시=MDX, 전략좌표=galaxy.json** 별개 취급(혼동 방지). 성계수=**80 확정**(메모리 86=오기).

---

## 막힘 시 우회 경로

- **G0 라이브가 플래키**(포그라운드 락) → 서버/콘텐츠/리마스터 병렬 트랙(P1/P2 no-live)으로 전진.
  데이터 경로는 이미 동작, 라이브 무관. 환경 리셋 후 keep_foreground 1회 홀드(연속 SetForeground 금지).
- **C002(P0 4·7)가 깊으면** → M2(0x0f1f 서버푸시 상태전환, P0 8)으로 시각 진전 확보(클릭 불요, decoupled).
  그래도 막히면 own-fleet 렌더 deep-RE 또는 (사용자 동의 시) moderoute 패치.
- **EXE force가 화면 깨면**(12 run 전례) → read-only Frida probe + 자연경로(실유저 수동 로그인이 case0
  렌더 살리는지)만 허용. EXE 무변경(canonical 992dc7e2 보존).
- **strict credential RE가 깊으면** → accept-any로 라이브 진행하되 strict는 별도 RE 웨이브로 격리.
- **시설/직무카드 캐논 명부 부족** → 매뉴얼 조직도(post)는 있으나 시설 스폿 물리배치는 원본 클라
  데이터(MDX/constmsg) 추가 추출 필요(추측금지). 추출 전까지 nameCatalogId 매핑 가능분만 채움.
- **라이브 자체가 막히면** → 서버 테스트(1198/1180 pass/0 fail)로 회귀 가드하며 데이터/와이어/콘텐츠
  완성도 끌어올림.

---

최종 갱신: 2026-06-26 KST. 통합 대상: completion-matrix-v2, remaster-roadmap-2026-06-26, loop-state.
이 문서가 캠페인 단일 권위 로드맵. 다음 갱신은 라이브 1세션(G0→P0 백로그) 결과 반영.
