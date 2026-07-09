# LOGH VII 게임 UI 한글화 — 잔여 미번역 전수 감사 (2026-06-26)

## 목표
ko 번역 오버레이에 **아직 일본어로 남은 유저 대면 UI 항목**(스테이터스 패널·拠点/기지 패널·지형명·진영정보·커맨드 라벨·시설 등)을 전수 식별하고, 자연스러운 한국어로 번역해 누락분을 추가한다.

## 번역 소스 위치 확정 (search 결과)

| 트랙 | 파일 | 항목 수 | 인코딩 | 상태 |
|---|---|---|---|---|
| **constmsg.dat 권위 번역맵** | `.omo/localization/tr/constmsg.dat.ko.json` (`translations`) | 3144 | cp949 | **사실상 완료** |
| constmsg 보조(로그인/타이틀/시설) | `server/content/localization/constmsg-ko.json` (`translations`) | 153 | cp949 | 완료 |
| constmsg 글리프픽스 | `server/content/localization/constmsg-glyphfix-ko.json` | 4 | cp949 | 완료 |
| **.rsrc 하드코딩 UI(런처/앱셸 메뉴·다이얼로그)** | `server/content/localization/hardcoded-ui-ko.json` (`strings`) | 143 | UTF-16LE(.rsrc) | 완료 |
| (원문 대조) | `server/content/localization/hardcoded-ui-ja.json` | 145 | — | — |

- 빌드 산출 바이너리(이미 한글화 적용): `.omo/work/logh7-ko-overlay/data/MsgDat/*.dat` (constmsg.dat + messages_0..8 + messages_com_* + messages_tac_*).
- 원본 일본어 마스터(대조 기준): `.omo/work/logh7-extracted/____________s___/____/data/MsgDat/`.
- 빌드 도구: `RE/tools/logh7_build_playable_client.py` (이미 빌드된 ko-overlay MsgDat를 그대로 사용). 인코더: `RE/tools/logh7_msgdat_encode.py` (HFWR = 원본 바이트 + `{record_id: 한국어}` 맵, 미번역 레코드는 원본 바이트 유지).

## 미번역 식별 — 전 트랙 전수 스캔

원본 일본어 MsgDat 전 파일을 디코드(`RE/tools/logh7_msgdat.py`)해 빌드 산출본과 대조하고, EXE 바이너리 문자열 카탈로그(`server/content/extracted/binary-strings-G7MTClient.json`, 16,612 항목)의 `localizable.hardcoded-jp` 153항목도 교차 확인.

### constmsg.dat (HFWR, 3199 레코드 — 인게임 라벨/툴팁/직무/진영/시설/함선/스테이터스 텍스트의 권위 소스)
- 번역맵 수록 3144 / 미수록 55.
- **미수록 55개 = 전부 비일본어**: `YES`/`NO`/`PKG`/기호(`／`,`※`,`％`)/포맷문자열(`%s … %6d%s`)/제어바이트. 유저 대면 일본어 텍스트 **0건**. (그중 1373/1374/1395/1396은 glyphfix 오버레이가 cp949-safe로 이미 처리.)
- 빌드 산출본 잔여 일본어 7건 중 **4건은 캐논 한자 괄호병기**(친정(親政)·제도(帝都)·사령(私領)) = 한국어 정착 표기로 정상.
- 나머지 **3건(id 2739 / 2829 / 3146 = 「揚陸艦」)**: 번역맵에 이미 `"양륙함"`으로 **존재**하나 빌드 산출본·배포본(`client/vendor/logh7-installed`, `client/dist`)에는 원문 일본어가 남아 있음 → **번역 데이터 누락이 아니라 빌드 캐시 stale**. cp949 인코딩 가능 확인됨. 재빌드 시 자동 해소.

### messages_*.dat (HFWR, 미션/커맨드/전술 메시지) — 빌드 산출본 잔여 일본어
- messages_1(3)·_2(5)·_3(3)·_6(3)·_7(5)·_8(1)·com_0(1): **전수 검사 결과 전부 캐논 한자 괄호병기**(戰史·戰局·解役 등) = 정착 표기로 정상, 미번역 아님.
- 그 외 모든 messages 파일 잔여 일본어 0.

### g7sw.dat (GFWR, 14 레코드)
- 내용 = 욕설/차별어 **NG-워드 검열 필터 목록**(유저 대면 UI 아님). ko-overlay 빌드에서 의도적으로 제외(빌드 산출 디렉터리에 부재). 번역 불필요.

### .rsrc 하드코딩 UI (binary-strings hardcoded-jp 153항목)
- 전부 런처/앱셸 **메뉴·버전 다이얼로그·MFC 스트링테이블**(.rsrc). `hardcoded-ui-ko.json` 143 슬롯이 커버, **미번역 7건은 의도적 제외**(Version 1.0 / (C)2004 Bothtec / 상태바 ASCII 토글 EXT·CAP·NUM·SCRL / IME ｶﾅ — `_not_translated` 명시).
- 인게임 패널용 하드코딩 일본어 문자열은 EXE에 **존재하지 않음** → 스테이터스/拠点 패널·지형·진영명은 전부 constmsg/MsgDat 데이터 주도(메모리 일치)이며 이미 번역 완료.

## 결론
**유저 대면 미번역 일본어 항목 = 0건.** 스테이터스 패널·拠点/기지 패널·지형명·진영정보·커맨드 라벨·시설명 텍스트는 전부 constmsg.dat/messages_*.dat 번역맵(3144항)으로 이미 번역되어 있고, 잔여 일본어는 (a) 캐논 한자 괄호병기(정상) (b) 비일본어 기호/포맷(번역 불필요) (c) NG-워드 필터(비-UI) (d) 의도적 제외 ASCII 슬롯 뿐.

추가할 신규 번역 항목 없음 → ko 오버레이 JSON 무수정(누락분 0). 기존 항목 보존.

## 유일한 액션 아이템 (후속 빌드 트랙)
constmsg.dat id 2739/2829/3146(「揚陸艦」→이미 맵에 "양륙함")가 빌드/배포 산출본에 stale로 일본어 잔존. **재빌드**(`python -m RE.tools.logh7_build_playable_client` 경로 또는 `logh7_msgdat_encode`로 constmsg.dat 재인코딩)로 해소. 번역 데이터 자체는 정상.

## cp949 인코딩 검증
스크립트로 전 번역 소스 전 항목 `.encode('cp949')` 통과 확인:
- `constmsg.dat.ko.json`: 3144 / 3144 PASS
- `constmsg-ko.json`: 153 / 153 PASS
- `hardcoded-ui-ko.json`: 143 항목(UTF-16LE .rsrc, cp949 무관)
- **cp949 인코딩 실패 = 0건.**

## 불확실(P) 항목
없음. 신규 날조 번역 미생성(기존 데이터가 완전). 캐논 한자 괄호병기는 정착 표기로 유지.

## 잔여
1. (빌드 트랙) constmsg.dat 재빌드로 揚陸艦 3건 stale 해소 + 배포(`client/vendor`+`dist`).
2. (라이브) 재빌드 후 ui_explorer로 스테이터스/拠点 패널 한글 렌더 라이브 확인(이 트랙은 데이터까지).
