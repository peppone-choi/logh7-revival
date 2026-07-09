# LOGH VII 한글화 빌드 재생성 + client 산출본 배포 (2026-06-26)

## 목표
완성된 ko 오버레이(`RE/.omo/work/logh7-ko-overlay`)의 MsgDat/String.txt를 stale 상태인
`client/vendor/logh7-installed` 와 `client/dist/logh7-client` 양쪽 산출본에 반영한다.

## 1. 재생성 (빌드)
- `python -m tools.logh7_build_playable_client --deploy` 실행 (REPO_ROOT=RE, `.omo` 정션 확인).
- 빌드는 ko 오버레이를 설치 정션(`RE/.omo/work/logh7-installed`)에 배포:
  - `data/MsgDat/*.dat` ← 오버레이 MsgDat 그대로 복사.
  - `exe/String.txt` ← 원본 String.txt에 오버레이를 라인 단위 병합(여기선 원본도 128줄이라 결과 = 오버레이 String.txt와 동일).
- 빌드 산출 playable EXE/매니페스트는 정상(SHA 불변 스택), 한글화 산출물 갱신 확인.

## 2. stale 진단 (배포 전)
빌드된 설치 정션 산출본을 기준으로 `client/vendor`·`client/dist`와 비교:
- **constmsg.dat**: vendor==dist 였으나 오버레이와 **24개 레코드 stale**. 구버전은 전각 일본어
  문장부호/깨진 cp949 글리프(예: id 1373 `／`→`/`, id 1374 `※`(cp932)→cp949 `※`,
  id 1395/1396 전각공백 패딩→ASCII 공백, id 1301 `적재량` 글리프 보정 등).
- **String.txt**: vendor는 line 1만 stale(`吸出し start`→`start`). dist는 ~40줄 미번역 cp932
  일본어 잔존(`タイトル`/`メッセージスペース`/`艦艇在庫`/`乗船可能兵員数`/`ラジオボタン` 등) = 심하게 stale.
- **messages_N / com / tac (.dat)**: 이미 오버레이와 바이트 동일(=최신). 갱신 불필요.
- 과제가 지목한 `揚陸艦`(id 2739/2829/3146)은 vendor/dist/오버레이/정션 어느 .dat에도
  cp932 바이트로 존재하지 않음 = 이전 오버레이 생성에서 이미 번역 완료. 실제 stale 본체는
  위 constmsg 24레코드 + String.txt 잔존 일본어였다(추측 번역 미수행, P0 준수).

## 3. 배포 (백업 후)
- 백업: `RE/.omo/work/remaster/loc-backup-2026-06-26/{vendor,dist}/` 에 기존 String.txt +
  MsgDat/*.dat 전부 보존(각 23파일).
- 배포: 설치 정션의 `String.txt` + `MsgDat/*.dat`(22개) → vendor·dist 양쪽 덮어쓰기.

## 4. 검증
- constmsg.dat: vendor·dist 모두 오버레이와 md5 동일, 차이 레코드 **0**.
- String.txt: vendor·dist 모두 정규본과 md5 동일, line 1 = `start`(일본어 제거).
- 전 MsgDat 컨테이너 스캔(HFWR 22종/트리): **cp949 디코드 실패 + 일본어 잔존 레코드 = 0**,
  `揚陸艦` 잔존 = 0 (vendor·dist 양쪽). g7sw.dat은 GFWR(UTF-16LE)라 HFWR 스캔 제외(정상).
- cp949 정합: 갱신 레코드 전부 cp949 디코드 성공.

## 잔여
- 라이브 렌더 검증 대기: 실제 클라(`ui_explorer`) 기동→해당 UI(적재량/탑재병력/전술 라디오 등)
  에서 갱신 문자열이 깨짐 없이 한글로 표시되는지 라이브 확인 필요(logh7-live).
- 런처 `Gin7UpdateClient`/`G7Start` .rsrc 일본어는 별건(RE 완료: docs/logh7-localize-re-*),
  본 작업 범위 아님.
