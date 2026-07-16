# 로그인 화면 글자 깨짐 · 한글화 / 폰트 (현행 2026-07-14)

## 현재 판정

- 원본 텍스트·이미지 자산은 CP932 경로를 전제로 한다. `CreateFontA` charset을 `0x81`(HANGUL)로 바꾼 run은 일본어 자산 모지바케를 일으켜 `0x80`(SHIFTJIS)으로 복귀했다.
- 현재 라이브로 확인한 한글 범위는 창 제목 `은하영웅전설7`과 메뉴 `파일(F)`/`도움말(H)`다. 인게임 전체 한글화 완료로 계산하지 않는다.
- 전체 한글화에는 `msgdat`와 HFWR 계열의 UTF-8 번역 원본, 한글 입력 경로, 그리고 M6 spike에서 선택할 CP949 배포 또는 SJIS tunneling/GDI proxy 경로가 필요하다.
- run9 기준 EXE SHA256은 `825635783a9fb663ae3b9a2ecf8d4b74df648322256c57ee32f6426c42a23f22`다. 근거는 `.omo/live-qa/m3-two-client-persistence-1080p-cp932-20260714-run9/`이다.

아래 2026-07-09 관찰과 `0x81` 제안은 조사 이력이다. 현재 적용 지침은 위 판정을 따른다.

## 2026-07-09 역사적 현상

- 창 제목: `銀河英雄??Ⅶ` (일부 한자는 보이고 일부 `??`)
- 로그인 패널 라벨이 일본어·한글 모두 **모지바케** (스크린샷 `live-client/login-wait-desktop.png`)
- 메뉴 `ﾌｧｲﾙ` 계열도 깨짐

## 2026-07-09 원인 후보 (역사 기록)

1. **설치 트리 `exe/String.txt` 가 0바이트**였음  
   - 클라가 읽는 경로: `artifacts/logh7-install/.../exe/String.txt`  
   - **조치함:** `.omo/work/logh7-installed/exe/String.txt`(965B, cp932)로 복구  
   - 빈 파일이면 UI 문자열이 비거나 쓰레기 버퍼를 읽는다.

2. **GDI 폰트 페이스가 일본 전용 `MS UI Gothic`**  
   - EXE offset `3620908` ASCII 12바이트  
   - **조치함:** `MalgunGothic` 으로 동일 길이 패치 (백업 `g7mtclient.exe.bak-pre-font`)  
   - 한글 글리프는 나아질 수 있으나, **SHIFTJIS 바이트를 한글 폰트로 그리면 여전히 깨질 수 있음**.

3. **문자셋(charset)**  
   - `CreateFontA` 경로에 `push 0x80` (SHIFTJIS_CHARSET) 후보 다수  
   - 한국어 UI를 쓰려면 `0x81` (HANGUL) 또는 `DEFAULT_CHARSET(1)` + **문자열을 cp949로 교체**  
   - 일본어 표시 유지가 목표면 charset `0x80` 유지 + 일본 폰트 설치

4. **본문 데이터 인코딩**  
   - 게임 문자열 상당수는 **cp932** 원본  
   - 이미 한 번 한글화된 리소스는 **cp949** — 추출 시 코드페이지 혼동 시 mojibake  
   - 근거: `docs/reference/legacy-evidence/logh7-localization-audit.md`

## 2026-07-09 로그인 대기 서버 기록

| 항목 | 값 |
|---|---|
| 주소 | `127.0.0.1:47900` (EXE에 이미 박혀 있음) |
| 계정 | `inei00` / `dummy` (`server/data/logh7-accounts.json`) |
| 서버 진입점 | `npm run serve:playable` → `src/presentation/main.mjs` |
| 아키텍처 | 3티어 + CQRS + SQLite ORM |

**수동 로그인:** ID `inei00`, 비밀번호 `dummy`, 로그인 버튼 클릭.

## 한글화 다음 작업 (현행 순서)

1. 창 제목·메뉴 `.rsrc` 한글 패치의 백업·source hash·rollback과 라이브 회귀를 유지한다.
2. `msgdat`/HFWR 원문을 추출해 UTF-8 번역 원본과 배포 인코딩을 분리한다.
3. CP949 자산 변환과 SJIS tunneling/GDI proxy/font 경로를 같은 문자열·입력 시나리오로 A/B 검증한다. CP932 자산에 `0x81`만 단독 적용하지 않는다.
4. 채팅·캐릭터명 입력의 한글 IME/멀티바이트 송수신 경로를 별도 RE하고 두 클라이언트로 검증한다.
5. 실제 화면별 스크린샷이 없는 문자열은 한글화 완료로 승격하지 않는다.

## 2026-07-09 롤백 기록

```text
exe/g7mtclient.exe.bak-pre-font  → g7mtclient.exe
exe/String.txt.empty.bak         → (빈 파일; 사용 금지)
String 원본 복구 경로: .omo/work/logh7-installed/exe/String.txt
```
