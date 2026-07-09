# LOGH VII — 텍스트 데이터 깨짐 진단·즉시 수정 (2026-06-23)

## 증거

- 실클 세션 `.omo/ui-explorer/goal-20260623-01/`:
  - `shots/002-world-entry.png` 전략맵 렌더 + 한글 HUD 하단 패널 확인.
  - `trace.jsonl` 0x0f02 월드진입, 0x0313/0x0315/0x0323/0x0325/0x0356/0x0b09/0x0b0a 정상 수신.
  - 클라이언트는 13:30:32 ECONNRESET로 종료(후속 click 시점).

## 진단

1. **String.txt 헤더 손상**: `.omo/work/logh7-ko-overlay/exe/String.txt` 873B/128줄.
   - 첫 7바이트 `fd e5 f5 f3 aa b7 20`가 쓰레기 → 병합 후 설치본 `String.txt` 1번 라인이 깨짐.
   - `content/extracted/strings-index.json` 기록: 설치본 String.txt 127개 레코드 중 index 1 `"���� start"`.
2. **번역 커버리지 부족**: 오버레이가 128줄뿐. 원본 String.txt는 ~59,550줄이며 대부분 일본어(cp932) 상태.
3. **MsgDat 한글화**: `.omo/localization/batches/*.ko.json` 58파일·4,535개 항목으로 MsgDat 한글화는 완료.

## 수정

- `.omo/work/logh7-ko-overlay/exe/String.txt` 첫 7바이트 제거 → 1번 라인 `start` 복원.
- `python -m tools.logh7_build_playable_client --deploy` 재실행 → 설치본 `G7MTClient.exe` + `String.txt` 재배포.
- 설치본 `String.txt` 첫 라인 `start` 확인, 백업 `String.txt.original` 유지.

## 남은 과제

- String.txt 나머지 59,400+ 라인의 한글 번역 소스 부재. 자동 추출·번역 파이프라인 필요.
- 텍스트 외 C002 명령 서브시스템(전략 widget latch/명령메뉴) 구현이 다음 프런티어.

## 관련 파일

- `tools/logh7_build_playable_client.py` (line-by-line String.txt 병합 로직)
- `.omo/work/logh7-ko-overlay/exe/String.txt`
- `.omo/work/logh7-installed/exe/String.txt`
- `content/extracted/strings-index.json`
