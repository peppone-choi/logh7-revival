# 로그인 화면 글자 깨짐 · 한글화 / 폰트 (2026-07-09)

## 현상 (라이브)

- 창 제목: `銀河英雄??Ⅶ` (일부 한자는 보이고 일부 `??`)
- 로그인 패널 라벨이 일본어·한글 모두 **모지바케** (스크린샷 `live-client/login-wait-desktop.png`)
- 메뉴 `ﾌｧｲﾙ` 계열도 깨짐

## 원인 후보 (우선순위)

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

## 로그인 대기 시 서버

| 항목 | 값 |
|---|---|
| 주소 | `127.0.0.1:47900` (EXE에 이미 박혀 있음) |
| 계정 | `inei00` / `dummy` (`server/data/logh7-accounts.json`) |
| 서버 진입점 | `npm run serve:playable` → `src/presentation/main.mjs` |
| 아키텍처 | 3티어 + CQRS + SQLite ORM |

**수동 로그인:** ID `inei00`, 비밀번호 `dummy`, 로그인 버튼 클릭.

## 한글화 다음 작업 (순서)

1. **라이브에서** 복구된 String.txt + MalgunGothic 적용 후 재기동 → 깨짐 정도 비교 스크린샷  
2. `.rsrc` 메뉴/캡션 UTF-16LE 한글 패치 (`hardcoded-ui-ko.json` / rsrc 패처 — audit 문서 P1)  
3. `constmsg.dat` cp949 재추출로 P0 mojibake 5종  
4. CreateFont charset 슬롯 RE 후 한글 경로만 `0x81` 로 한정 패치 (전역 0x80→0x81 무분별 금지)  
5. 채팅 입력: cp932 해저드 문서 유지, 한글 입력은 별도 RE

## 롤백

```text
exe/g7mtclient.exe.bak-pre-font  → g7mtclient.exe
exe/String.txt.empty.bak         → (빈 파일; 사용 금지)
String 원본 복구 경로: .omo/work/logh7-installed/exe/String.txt
```
