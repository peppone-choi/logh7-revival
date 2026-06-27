# LOGH VII 루프 사이클 — 엔드포인트 감사 + NO DATA 패널 + 천체 렌더 + 성계 위치 (2026-06-21)

이 사이클은 메인 에이전트가 4개 read-only explorer + 2개 Workflow(엔드포인트 감사, opcode 식별-진위)로
fan-out 조사했다. 모든 단정은 바이너리(redex 디컴파일)/라이브 스크린샷/서버 코드 1차 증거 기반.
"문서·메모리·패치 결론을 전제하지 말고 처음부터 재RE"(사용자 지시)를 적용했다.

## 사용자 질문별 결론

### Q1. 메인의 "캐릭터 스테이터스" 위치 + 옆의 바
- **라벨 위치는 맞음**: 좌하단 전략 HUD = `FUN_0058d140`(caller `FUN_004fef90` STRATEGY SEQUENCE case0, 매프레임).
  slot3 제목 = constmsg group 0x60 sub7 = "캐릭터 스테이터스". 어셈블리 원시바이트(`0x0058d3b9 6a 67`) +
  raw `constmsg.dat` HFWR 독립파싱(group 0x60 sub7=idx2968) + 라이브 A/B(v7 패치전="이미 탈퇴하셨습니다"/v8 패치후="캐릭터 스테이터스") **3중 확정**.
- **옆의 바 = stamina(체력) 게이지**: 캐릭터객체 `+0x1a9`(u8), slot6 `mov al,[ebx+0x1a9]`(VA 0x58d485). 코드 동적 드로우(TGA엔 프레임만).
  옆 "1200" = PCP/MCP(slot8 `[ebx+0x50]`/`[ebx+0x54]`), 능력치 8종 = slot10 `short[ebx+0x1ac..0x1c8]`.
- **★사용자 정정(2026-06-21): "글자가 바를 침범했다"** = 라벨 위치가 아니라 **"캐릭터 스테이터스" 텍스트가 옆/아래 PCP 바 영역과 겹치는 레이아웃/오버랩 버그**.
  → HUD 리마스터 대상. ExplorerHUD가 slot3 텍스트 좌표/폭 vs 바 rect 정밀 진단 중. 원인 후보: (a)Pretendard 폰트 폭/높이가 원 1024×768 고정 슬롯 초과 (b)slot3 y좌표가 바와 너무 근접 (c)한글 라벨 폭.
- 충돌 해소: ExplorerPanels가 짚은 `FUN_0057a1f0`(엔티티 +0x80eb0, group 0x1a)은 **별도 "캐릭터 정보" 상세창**(panel switch `FUN_00579e60` case3). 좌하단 HUD(엔티티 `*(0x7ccffc+8)`)와 별개. "이미 탈퇴"는 `FUN_0058d140` slot3 단독.

### Q2. NO DATA / 깨진 글리프 패널 (패널별 실제 소비 경로)
ExplorerPanels(바이너리+스샷 재RE):
| 패널 | 증상 | 소비경로 | 분류 |
|---|---|---|---|
| 캐릭터 정보 roster(FUN_00539ce0) | NO DATA/??? | 0x1202 row store(+0x4c83a4)만, 이름은 row id로 풀 캐릭터객체(FUN_004b5b80) 재조회 | **레코드부족**(풀 0x0323 미공급) |
| HUD 좌하단 stat(FUN_0058d140) | PCP/MCP/능력치 0 | 엔티티 `*(0x7ccffc+8)` stat 필드 0 | **서버 0x0323 stat 미충전**(엔티티 빌드됨·렌더게이트 아님) |
| "이미 탈퇴하셨습니다"(오문맥) | 인증에러 문구 | slot3 group 0x67 sub7 | constmsg 리포인트(**이미 패치됨** 0x67→0x60) |
| "스폿 불명" | 명령 패널 | 0x0323 spot@0x1c=0 | **레코드부족**(유효 spot 미시드) |
| "NO DATA"/"NO TABLE" 자체 | 공통 | FUN_00522010 group/sub 조회 실패 fallback | (패널별 갈림) |

**0x0356/0x1200/0x1201/0x1202 "맹목 충전 금지" = 바이너리로 확정**(ExplorerConsume, 4함수 직접 디컴파일):
- 0x1200(FUN_004c1dd0)/0x1201(FUN_004c1e50) = 프레이밍/리셋(15 count 워드 리셋, 레코드 미접촉) → "채운다" 부적용.
- 0x1202(복사 FUN_004c1e80=288B memcpy / 소비 FUN_00539ce0·FUN_0052d180) = **id-only가 정답**. record `+0x4c`=filter 바이트 兼 name-kind 바이트, 이름은 인라인 문자열 아니라 `+0x48~0x50` name-token(constmsg group 0x53 룩업). display_name 추측 기입 시 filter/name/nested(`+0x74`) 동시 오염. **P9 라이브 반증을 바이너리로 재확인**.
- 0x0356(파서 FUN_0042c7e0 ↔ 서버 decoder personnel-records.mjs:166-237) = **바이트단위 완전 일치, 갭 없음**. char store(`+0xc`)는 0x1202 store(`+0x4c83a4`)와 별개.
- 클라 패치 11종 54사이트 전부 vanilla EXE 바이트 일치 + 디컴파일 문맥 정합. DEFAULT_STACK 누락 없음.

### Q3. 엔드포인트 4측면 감사 (클라발신/서버수신/서버발신/클라소비) — 부분완료, rate limit으로 7패밀리 미완(resume 진행중)
확정 갭:
- **0x0207 GlobalChat(전역 채팅)**: 클라 수신 디스패처(FUN_004ba2b0 case 0x207)+사이즈(0x108=264B)+렌더(FUN_004be6c0) **완전 배선**, 서버만 빠져 **양방향 dead**. (P1) in-world 채팅 0x0f1c는 별개로 동작. S→C 빌더는 RE 확정(id@0, UTF-16LE text@6, MAX 128), C→S 파서는 라이브 캡처 선행.
- **0x0202 SSLoginNG**: 클라 수신 완비, 서버 항상 OK만 → 로그인 거부 와이어 부재(P2, TOFU/LAN 전제 비블로커, 빌더만으론 dead — 인증은 GIN7 0x7000).
- **0x0337**: 클라 ResponseTacticsCharacter(0x0964)에 base-economy NOTIFY_BASE_PARAMETER 중복 배정(현재 미emit 무해, 우리 소스도 placeholder로 정직 표기).

### Q4. 발굴 opcode 식별 진위 — 부분완료(237 수집/80 검증), rate limit으로 verify 일부 미완
- **confirmed 77 / mismatch 1 / phantom 0 / unverified 2.** **phantom(클라에 없는 가공 opcode) 0건 = 식별 견고.**
- 유일 실오류: **0x0206 SS_GAME_LOGIN_OK 사이즈** — 문서 0x108은 인접 0x207 값 오염. 클라 확정 = 1바이트. 런타임 미러 미반영(무영향). **→ docs/logh7-protocol-master.md:31-32 정정 완료(0x206→1, 0x207→0x108).**
- unverified(0x0031 rekey, 0x0020 lobby-init) = 수신-오브젝트 디스패처가 아닌 transport/C2S 센더 계층이라 검증 보류(오류 아님).

### Q5. 엔티티/천체 렌더
ExplorerPanels(파이프라인) + ExplorerConsume(데이터 정합):
- **성계 천체 = 최신 빌드(earlygrid-ringclear + strat-camera-focus, canonical playable)에서 렌더됨**. 라이브 스샷 `session-text-re/shots/002`: 청색="베룰라", 황색="발할라", 적색 1개 = 최소 3개 천체가 glow 텍스처+분광형 색+한글 라벨로 렌더. 그리드 라인도. **검은 빈 그리드 아님.** 구 "81/81 미재빌드 갭"은 구 빌드(e75486ef, earlygrid 미적용) 맥락.
- 렌더 체인(redex 재확인, 정정 없음): `FUN_004b68f0`→`004b64c0`→`004c8a10`→**`004d3bd0`(builder, render table DAT_009d1510)**→`004d1e70`(D3D 노드), drawer `004d6b70`. 셀 walker `FUN_004c8b70`: cell=`+0x2c03cc`, objectTable=`+0x2c1755` stride3. **byte1=클래스(3=항성마커), byte2=분광형→glow slot(0..6,8→7), byte0=라벨(group 0x18)**. 항행성 게이트 `FUN_004d6310`(byte1∈{1,3}).
- 서버↔클라 데이터 정합 표 전부 ✅(stride3/byte0 group0x18/byte1 클래스/byte2 분광형/grid100×50). login-protocol.mjs:659-662,790.
- **미확정(새 라이브 캡처 필요)**: 81개 전부 동시 가시화(현재 뷰포트 내 3~4개), 블랙홀/사르가소/플라스마, 함대마커(별도 레이어).
- **분광형 출처 충돌**: galaxy.json(p101 raster색, **O=0개**) vs model-galaxy-stars.json(MDX, O=2). content-adapter는 galaxy.json 우선 → **라이브에서 O형 항성 안 뜸**. 둘 다 originalServerData:false. **이름↔확정 등급 미복원**(MDX node순서=성계순서 가정 provisional). → 권위 출처 결정 필요(사용자).
- **terrain 배경**: `LOGH_STRAT_TERRAIN=1`일 때만 배경 항행공간 생성(기본 OFF). OFF면 빈 배경 셀값0→byte1=0→FUN_004d6310 차단 = 전 배경 항행불능. 마커(byte1=3)는 정상 배치.

### Q6. 전체 성계 위치 정확히 + "페잔 한 칸 아래"
ExplorerGalaxy(좌표 출처 체인 직접 확인):
- **현재 content/galaxy.json 좌표 이미 정확**: 진짜 원천=`content/galaxy-raster-star-centers.json`(2026-06-21 사람 감사, page101-bg.jpg 실제 별점 중심). content↔raster **80/80 일치**. DB도 일치.
- **페잔 "한 칸 아래"는 구 PDF 벡터값(폐기) 착시**: 현재 페잔 canon col51/row38. task가 준 (49,38)은 구 벡터 추출(래스터 감사로 폐기, coordinate-provenance.md:25에 "현재 사용 안 함" 명시). 실제 어긋남은 **col +2(2칸 오른쪽), row는 그대로** — 이미 수정 완료. 페잔=row38 회랑 정확(passable, ±1행 차단), 이젤론=row12 회랑. **회랑 의미 안 깨짐.**
- 구 벡터 vs 래스터 어긋남: 80/80 전부 col +2~+3(row 대부분 0). 잔존 어긋남 **없음**.
- **투영 공식 = identity, Y-flip/축교환 없음(P0 확정)**: login-protocol.mjs:715-721 `col=canonCol,row=canonRow`. 클라 검증기 `FUN_004d6310` = `cellIndex=row*100+col`(col 빠른축 %100, row 느린축 /100). 서버와 정확 일치. (coordinate-provenance 문서의 displayX=contentCy 변환식은 구 벡터 잔재, 현재 코드 미적용.)
- 좌표 등급 = **P2**(화면 별점 투영, 원 서버 좌표 미증명). 원 캐논 승격은 라이브 투영검증 or 원 서버데이터 발굴 선행.
- **주의: 라이브 투영검증 미수행.** 사용자가 라이브 화면에서 페잔 어긋남을 봤다면 ui_explorer로 페잔 셀 클릭→target panel 확인 필요(메인 직렬).

## 바로 고친 것 (이 사이클)
1. **0x0206/0x0207 사이즈 문서 정정** — `docs/logh7-protocol-master.md:31-32` (0x206 0x108→1, 0x207 —→0x108). 클라 FUN_004b8b00 P0 확정.

## 바로 고칠 수 있는 것 (증거 충분, 다음)
- `docs/logh7-coordinate-provenance.md` 본문(40-53행)의 구 (49,38)/displayX=contentCy 변환식 → 현행(identity, col51) 정정(P3, 혼동 제거). 코드/데이터는 무수정.
- 0x0207 GlobalChat S→C 빌더(buildGlobalChatInner, 264B id@0/text@6 UTF-16LE MAX128) — C→S 파서·브로드캐스트는 라이브 캡처 선행.

## 라이브/추가 RE 선행 필요 (맹목 수정 금지)
- **캐릭터 스테이터스 글자-바 침범**: slot 좌표 진단 중(ExplorerHUD). 슬롯 좌표 immediate 패치 or 폰트/줄간격.
- **NO DATA 패널 충전**: 0x0323 stat(pcp/mcp/stamina/능력치)·spot 시드. 엔티티↔와이어 오프셋 풀체인 P1 + early-seed 클라 종료 전례(P10) → 라이브 검증 선행.
- **분광형 출처 결정**: galaxy.json(O=0) vs MDX(O=2) 권위 선택 — 사용자 결정.
- **terrain 기본화**(LOGH_STRAT_TERRAIN=1) 라이브 회귀 검증.
- **성계 라이브 투영검증**(페잔 등 셀 클릭→target panel).
- **81개 천체/블랙홀/함대마커 새 캡처**.

## HUD 리마스터 백로그 (ExplorerHUD)
- HUD 텍스처 거의 8bpp 팔레트, senryaku_mainpanel.tga만 32bpp. `.omo/work/logh7-installed/data/image/**`.
- **P0 종횡비 보정**: `FUN_004ea460` X/Y 독립 스케일 → 16:9에서 가로 늘어남. 클라패치(B), 위험 높음(native-layout 패치와 충돌 주의).
- **P0 mainpanel 리디자인**(A, 32bpp 드롭인). P1 커맨드/시스템 아이콘·레이더·Field 마커 업스케일(A). 폰트 Pretendard 적용됨(배포 TTF 동봉 확인).
- **차단요소(P0 RE 필요)**: 텍스처 로더가 8bpp→32bpp/업스케일 드롭인을 받는지(D3DXCreateTextureFromFile import 미검출). 이게 "드롭인 업스케일 가능 여부"의 핵심.

## 한계/메모
- endpoint-audit, opcode-provenance 두 Workflow는 동시 호출 과다로 **rate limit** 발생 → 부분완료. endpoint-audit resume 진행중. provenance는 phantom 0 결론 충분(나머지 chunk 미검증).
- 모든 explorer/워크플로우 read-only. 저장소 코드 수정은 위 "바로 고친 것" 1건(문서)뿐.

## 라이브 검증 (2026-06-21, 사이클 후반) — ★클라 기동 P0 블로커 해결
- 사용자 "게임 실행해서 HUD를 봐" → 라이브 3회 클라 크래시(연결 전, trace 232B/opcode 0). settle 40초·strat-camera-focus 제외해도 재현.
- **진단**: Windows 이벤트로그 Application Error = `G7MTClient.exe 모듈 G7MTClient.exe 예외 0xc0000005 오프셋 0x0010cf52`(imagebase 0x400000 → VA 0x50cf52). dgVoodoo/d3d8 아님 = 코드/detour 손상. (6:34 frida-agent 크래시는 다른 세션, 무관.)
- **격리**: v8 세션(SHA `7c3abbade961…`, 정상 기동) launchStack과 현재(`321aafcf`, 크래시) 비교 → 유일 차이 = **`chat-target-labels-ko`**(code-cave detour 0x516038→0x76e72d). 빼고 재빌드 → SHA가 정확히 `7c3abbad`로 복귀 + 클라 정상 기동.
- **픽스**: `tools/logh7_build_playable_client.py` DEFAULT_STACK에서 chat-target-labels-ko 제거(주석으로 사유, 스펙 보존). 메모리 [[chat-target-labels-ko-crash]]. canonical SHA = 7c3abbad.
- **라이브 월드 진입 성공**: create-character → trace `0x2009/0x0f02/0x0313×2/0x0323×2/0x0325×2/0x0b09`. shot `hud-live-fix/shots/023-world.png`.
- **천체 렌더 라이브 확인**: 청색 항성 2 + 황색 1 + 그리드(검은 빈 그리드 아님).
- **캐릭터 스테이터스 글자-바 침범 라이브 재확인**: crop `.omo/work/hud-live-crop.png` — "캐릭터 스테이터스" 제목·PCP/항속 게이지 줄 빽빽 침범(Pretendard 메트릭), 능력치 8종 전부 0(서버 0x0323 stat 미충전, 엔티티는 빌드됨).
- stop으로 SHA 복구 검증(shaVerified:true, 7c3abbad).
- **이 사이클 "바로 고친 것" 갱신**: ① 0x0206/0x0207 사이즈 문서 ② chat-target-labels-ko DEFAULT_STACK 제거(클라 기동 복구).

## endpoint-audit resume 결과 (확정 갭 54)
- 0x0207 GlobalChat = C→S 핸들러 + S→C 빌더 **양쪽 다 부재**(이전 문서의 "spec'd"는 오류 정정). 클라는 송수신 완전배선 → 서버만 비어 dead. P1.
- 0x7002 LGLoginNG = 서버가 로그인 실패 통지 안 함(reject가 socket write 없이 fall-through). P3.
- 0x7002 serverlist = env-gated dead path(LOGH_SEND_SERVERLIST). 나머지 51갭은 task 출력 파일 참조.

## 본체(맵전환·기지진입·커맨드) 진행 — C002 입력 레이어 단일 관문 (2026-06-21 후반)
- 본체 3개가 **단일 근본 블로커 = C002 인-world 입력 레이어**로 수렴 확정. 메모리 [[inworld-body-converges-c002-input-2026-06-21]].
- 모드 풀 2종(전술0=placeholder 데이터로 crash / 전략2=정상). "행성 내 장소" = 별도 모드 아니라 **기지 오버레이**(panelKind=5, `FUN_00577e70` __thiscall, 데이터 0x031d/0x031f/0x0321 world-init 슬롯 설치 완료). ESC 메뉴(거점/유닛/결정/취소)=키 네비게이션 부재, 항목 확정이 마우스 event-9/event-2 의존.
- **근본 = 마우스가 DirectInput immediate `GetDeviceState`(+0x24 DIMOUSESTATE, `FUN_00525c80` 매프레임)+buffered로 읽힘** → `SetCursorPos`/`PostMessage` 미반영, **OS HID(`SendInput`/`mouse_event`)만 DI가 봄**. active→edge(`DAT_02214c00`→`DAT_022142b0`) 변환은 디컴파일 부재(콜백/인라인). 클릭 확정 `FUN_00507f20`: 좌edge && hit(+0xb01) → `+0xb02=1`.
- **`tools/logh7_window_login.py:_click` 수정 적용**: `SetForegroundWindow`(GetFocus 게이트) + `ClientToScreen`(좌표 정합) + LEFTDOWN 후 6프레임 hold/±1px 지글(immediate 폴링이 버튼 눌림 연속 프레임 포착). **라이브 검증(cmd3): 천체 클릭이 `0x0323` 2회 유발**(수정 전엔 in-world 클릭이 0x0300/0x0f08만) = **클릭이 in-world UI를 실제 선택하기 시작 = 수정 효과 증명**. 단 `0x0b01`(이동)/selectgrid 미발생 = 좌표가 마커에 정확히 안 맞았거나 edge 추가 강화 필요.
- **다음(본체 닫기 마지막)**: (1) shot으로 성계 마커/ESC 메뉴 결정버튼 정확 픽셀 확인 → 정밀 클릭, (2) `_click`을 `mouse_event`→`SendInput(INPUT_MOUSE)`로 교체(타이밍/원자성 안정, ExplorerConsume 권장), (3) 안 되면 Frida positive-control(`DAT_022142b0` 좌edge 또는 `+0xb02=1`을 `FUN_00507f20` 진입 직전 1프레임 write)로 메커니즘 증명 후 자연 입력 역추적. **이 관문 하나가 뚫리면 본체 3개(맵전환·기지진입·커맨드)가 모두 자연 입력으로 열린다.**
