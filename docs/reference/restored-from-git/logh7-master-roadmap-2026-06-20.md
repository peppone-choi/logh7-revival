# LOGH VII 부활 통합 로드맵

Updated: 2026-06-21

## 기준

목표는 "매뉴얼대로 플레이 가능한 은하영웅전설 VII"이다. 단순 접속 성공이 아니라, 성계/행성/천체/소속/요직/커맨드/세션 상태가 서버 권위 상태로 맞고, 실제 클라이언트에서 확인 가능한 상태를 서버 오픈 기준으로 삼는다.

현재 종합 진행률은 `docs/logh7-status-and-plan.md`의 55%를 기준값으로 두되, 2026-06-20 로비 네이티브 리마스터, 배포 EXE, 2026-06-21 성계 실제 별점 재추출/콘텐츠 DB 재빌드, 로그인 부트스트랩, post-load 유닛/focus-cell 기본값, 폰트 ClearType 보정분을 반영해 65%로 보정한다. 단, 서버 오픈 판정은 자연 `0x0b01 -> 0x0b07` 명령 루프, 함선 표시, 전술맵 진입, HUD HD 리마스터 전까지 아직 불가다.

## 최신 정정

- [x] 그리드 클릭은 더 이상 블로커가 아니다.
- [x] 이동 가능/불가능 전략 그리드는 서버가 `0x0313`/`0x0315`로 내려준다.
- [x] 현재 성계 좌표/회랑은 PDF 주석/반올림 기반 산출을 폐기하고 `page101-bg.jpg` 실제 별점 원 중심으로 재추출했다.
- [x] Iserlohn은 래스터 기준 `canonCol=53, canonRow=12`, UI 기준 `54,13`으로 재잠금했다. Fezzan은 `51,38`, UI 기준 `52,39`.
- [ ] 새 좌표로 Iserlohn/Fezzan 회랑을 실클라 미니맵/명령 루프에서 재검증한다.
- [ ] 행성/천체/소속 데이터는 "있다/없다"가 아니라 필드별 출처 등급까지 확정해야 한다.
- [x] `content/*.json`은 초기 시드/추출 원본, `content/logh7-content.db`와 `logh7-runtime/state/*.sqlite`는 배포/영속 상태 파일로 분리한다.
- [x] 4:3 레터박스/필러박스 기본안은 폐기한다. 현재 배포 EXE의 로비는 `lobby-res` + `lobby-native-layout`로 실제 1920x1080 캔버스와 네이티브 좌표 재배치를 쓴다. 다른 해상도는 `logh7_encode_lobby_res.py`와 `logh7_encode_lobby_native_layout.py`로 같은 크기의 패치를 다시 생성해야 한다.
- [x] 최신 playable EXE SHA256은 `7922ac365d219b3419e8c769dc4364d0cfd8a9e94578cb98f04c04bb0634ef7f`이며 클라이언트 패키지(vendor EXE + uiexplorer 백업)에도 반영했다. (2026-06-21: `strat-camera-focus` cave를 제국 수도 ヴァルハラ 셀 2588=0xa1c로 갱신; 이전 `15ed8a35…`는 중립역 2550 cave.)
- [x] `0x0325` post-load parser stream과 focus-cell 기본값은 들어갔다. 단, 자연 `0x0b01`은 여전히 실패하며 잔여 블로커는 좌표가 아니라 HUD 선택목록/명령 category admission 경로다.
- [x] `tools/logh7_selectgrid_snapshot.py`가 이제 `hudModeF4`, `hudState14e0`, 선택목록 row rect/gate, 명령 row rect를 함께 덤프한다.

## M1 실제 플레이 세션

진행률: 68%

- [x] 로그인 핸드셰이크와 로비 진입.
- [x] 월드 진입과 전략 그리드 표시.
- [x] 그리드 클릭 입력.
- [x] 로비 버튼 비활성화 패치(`menufix`) 기본 적용.
- [x] 로비 메인→게임 시작→뒤로→환경 설정 라이브 클릭 확인.
- [ ] NewChar/Lottery/Delete/Session을 실제 클라이언트에서 전부 클릭 회귀 확인.
- [ ] 서버 공지 수신을 실제 로비 화면에서 확인.
- [ ] 게임 세션 상태 어드민 API와 대시보드 연결.
- [ ] 월드 내 마우스 입력/커서 클립/듀얼 모니터 이슈 확인.

## M2 매뉴얼 콘텐츠 완성

진행률: 50%

- [x] 성계 점 위치를 원본 별점/매뉴얼 지도 기준으로 재추출.
- [x] 서버 fallback `Math.round` 의존 대신 출처 있는 `canonCol/canonRow`와 래스터 감사 파일을 사용.
- [x] one-cell 회랑과 통행 불가 셀을 `0x0315` 지형 마스크에 반영.
- [ ] 80성계의 소속을 출처 등급별로 확정.
- [ ] 행성/천체 데이터: 이름, 소속 성계, 궤도, 인구/경제, 특수 천체, 요새 연결을 분리 저장.
- [ ] 시작 세션: 진영, 원수, 요직, 함대, 주둔지, 수도, 승리 조건을 매뉴얼 기준으로 고정.
- [ ] 미구현 매뉴얼 커맨드 전체 목록을 `Command*`/`Notify*` 와이어 상태와 연결.
- [ ] 원작에서 미구현이라고 명시된 항목도 서버 게임플레이 규칙으로 구현 여부를 결정.

## 매뉴얼 기능 계약

기준 문서는 `docs/logh7-manual-canon.md`다. "현재 미구현"이라고 적힌 원작 기능도 부활 서버에서는 구현 대상으로 본다. 단, 매뉴얼이 생산 불가/제외라고 명시한 항목은 전투/기존 배치 데이터로는 지원하되 생산 커맨드는 잠근다.

| 도메인 | 매뉴얼 기준 | 현재 판정 | 다음 게이트 |
|---|---|---|---|
| 세션/계정/공지 | 2000명 세션, 재입장 제한, 서버 권위 처리, 공지 | 부분 구현. SQLite 계정/런처 자동 계정/어드민 공지 API 있음 | 로비 공지 실클라 표시, 세션 상태 대시보드 연결 |
| 전략 지도/이동 | 100광년 그리드, 통행 가능/불가, 워프 이동, `0x0b01 -> 0x0b07` | 지형/그리드 서버 downlink와 focus-cell은 구현. 자연 명령 발신 실패 | HUD selection row -> category -> SelectGrid factory admission 라이브 증명 |
| 성계/행성/천체 | 80성계, 행성/요새/소속/초기 배치 | 성계/초기배치/요새 데이터는 있으나 좌표/행성명 하류 전파와 소속 등급 정리가 필요 | 별점 재추출, one-cell 회랑, 행성 sidecar/소속 출처 등급 |
| 캐릭터/인사 | 8능력, 계급/요직/인사권, 평가/명성, 자동진급 | 다수 순수로직 구현. 연령/birth_year와 일부 라이브 opcode가 빈칸 | 캐논 연령 복구, character model 통일, 인사/요직 실클라 검증 |
| 경제/정치 | 세금, 지원율, 치안, 예산/정치 커맨드 | 경제 core와 일부 tick 구현. 정치 sub-action은 라이브 미확정 | `0x0900` plan/sub-action 캡처 후 approval/security 배선 |
| 작전/지휘 | 작전계획 입안/발령, CP, command-range, 함대 재편 | 순수 모듈 일부와 CP/비용 모델 있음. 입안/발령 lifecycle 미완 | operation-plan 라우팅, command-engine 통합, 라이브 커맨드 캡처 |
| 전투/공중전/지상전 | 전술전, 함선 피해, 전투정, 항복, 전사/부상 | 전투 core 다수 구현. 전투정 sub-action과 전사 토글은 라이브/디자인 필요 | `0x040e` 판별자 RE, 전투정/전사 원작 미구현 항목 서버 규칙화 |
| 통신/사회 | 메일/주소록/메신저/채팅/명함교환 | 메일 cap/주소록 cap/defection wipe 등 구현. 메신저 FSM wire 미확정 | `0x0f0e` 메신저 payload 캡처, 2클라 한글 왕복 |
| 첩보/쿠데타/페잔 | 수색/침투/귀환, 반란/설득/참가, 페잔 점령 페널티 | 첩보 3종 순수로직 추가. coup/world 배선과 페잔 규칙 남음 | coupState world 배선, `0x0f13/0x0f14` order-type 캡처 |
| AI/NPC | 미선택 원작 캐릭터 AI | 원작 미구현이지만 부활 범위에는 포함 | 최소 NPC strategic tick, 시나리오 AI 정책 문서화 |
| 배포/리마스터 | 클라이언트 설치 없이 실행, 해상도별 UI, Pretendard | 클라/서버 분리 패키지와 최신 EXE 있음. 로비만 네이티브 리마스터 검증 | 전 화면 native layout, 런처 폰트/서버/어드민 자동 배선 |

## M3 리마스터와 현지화

진행률: 62%

- [x] `String.txt` cp949와 `.rsrc` UTF-16LE 한글화 경로 확보.
- [x] GDI 전역 폰트 face 패치(`font-face`) 사양 확보.
- [x] 기본 playable EXE 스택에 `font-face`와 `font-cleartype` 포함.
- [x] Pretendard, Pretendard JP, Pretendard Std를 배포물에 포함하고 per-user 설치 자동화.
- [x] 로비 1920x1080 네이티브 좌표 재배치(`lobby-native-layout`)와 라이브 검증.
- [ ] 어색한 한국어 문구와 일본어 잔존 메뉴를 재검수.
- [ ] 전 게임 화면을 시스템 해상도 기준 좌표/텍스처로 리마스터. 현재 검증 완료 범위는 1920x1080 로비다.
- [ ] CJK/Latin/JP 혼용 문구가 잘림 없이 표시되는지 확인.

## M4 배포와 모딩

진행률: 55%

- [x] 로컬 authoritative Node 서버 런타임 포함.
- [x] 플레이어 런처 컴파일 경로 포함.
- [x] 계정 등록 CLI/런처 경로 포함.
- [x] 확인용 playable EXE를 최신 기본 스택으로 재빌드.
- [x] 클라이언트 배포 패키지에 최신 EXE, `String.txt`, MsgDat, Pretendard 폰트를 반영.
- [ ] 런처가 어드민 포트와 폰트 설치를 자동 배선.
- [ ] 콘텐츠 DB, 시나리오, 모드 경로를 런처 환경변수로 명시.
- [x] 서버 스냅샷 저장소 기본을 SQLite로 둔다. JSON 스냅샷은 개발/디버그 호환 경로로만 남긴다.
- [ ] AWS/Docker 운영용 설정과 로컬 테스트용 설정을 분리.

## P0 큐

1. 새 좌표 실클라 검증: 래스터 기준 `0x0313/0x0315`로 Iserlohn/Fezzan 회랑, 미니맵, 자연 명령 발신을 다시 확인한다.
2. 행성/천체/소속 데이터: `content/galaxy.json`의 현재 존재 여부와 별개로, 필드별 출처 등급을 붙여 매뉴얼 플레이에 필요한 데이터를 채운다.
3. 어드민 관측: 인메모리 월드 상태를 로컬 HTTP API로 노출하고 대시보드에서 표시한다.
4. 전 화면 네이티브 리마스터: 로비처럼 설정/캐릭터/세션/월드 패널도 시스템 해상도 기준으로 재배치한다.
5. 폰트/문구: Pretendard fallback과 어색한 문구를 제거하고 CJK/Latin/JP 혼용을 확인한다.
6. 로비 라이브 회귀: 버튼 클릭, 공지, 세션 선택, 캐릭터 생성/삭제 흐름을 실클라에서 다시 확인한다.

## 서버 공지 사용

- ASCII/Latin-1 CLI: `npm run server:auth -- --announcement "WELCOME"`
- 한글 CLI: `NOTICE_HEX=$(python -c "import sys; print(sys.argv[1].encode('cp949').hex())" "서버 점검 안내")` 후 `npm run server:auth -- --announcement-cp949-hex "$NOTICE_HEX"`
- ASCII/Latin-1 환경변수: `LOGH_LOBBY_ANNOUNCE_TEXT="WELCOME"`
- 한글 환경변수: `LOGH_LOBBY_ANNOUNCE_CP949_HEX=<cp949 hex>`
- 대체 환경변수: `LOGH_SESSION_ANNOUNCE_TEXT`
- 대체 한글 환경변수: `LOGH_SESSION_ANNOUNCE_CP949_HEX`
- 런타임 어드민: `Authorization: Bearer <token>` 헤더와 함께 `GET/PUT/DELETE http://127.0.0.1:47910/admin/notice`; `PUT` body는 `{"text":"WELCOME"}` 또는 `{"cp949Hex":"<cp949 hex>"}`.
- 동작: 로비 `LobbyLoginOK` 이후 conn2 extra inner로 세션 공지 notify를 추가 전송한다.
- 주의: Node 서버는 런타임 CP949 인코더를 내장하지 않는다. 한글 문자열을 `text`로 직접 넣으면 거절하고, CP949 hex만 허용한다.

## 어드민 툴 기준

- 기본은 꺼짐.
- 로컬 실행 예: `npm run server:auth -- --admin-port 47910 --admin-token <12자 이상 토큰>`
- 기본 URL: `http://127.0.0.1:47910/admin/session-state`
- 공지 URL: `http://127.0.0.1:47910/admin/notice`
- 인증: `/health`를 제외한 `/admin/*` 경로는 `Authorization: Bearer <token>` 또는 `x-logh7-admin-token`이 필요하다.
- 노출 범위: 서버 포트, 기능 플래그, 연결 수, 플레이어 수, 함선/함대/성계/경제 카운터, 최근 전투/채팅.
- 비노출 범위: 계정 비밀번호, GIN7 원문 credential, 암호 키, 원시 패킷 페이로드.
