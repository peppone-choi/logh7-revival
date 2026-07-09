# LOGH VII 런처 .rsrc 한글 패치 — Gin7UpdateClient + G7Start (2026-06-26)

> 사용자 지시 "업데이터/스타터 한글화" 실행분. 표면 RE 문서
> (`docs/logh7-localize-re-Gin7UpdateClient-2026-06-26.md`,
> `docs/logh7-localize-re-G7Start-2026-06-26.md`) 기반. **추측 번역 없음**:
> 매핑의 모든 text_ja는 실제 EXE .rsrc 문자열과 byte-exact 일치(G7Start 37/37,
> Gin7 27/27 검증, skip 0). MFC 표준(30721·3841+)·코드참조 리터럴(컨트롤ID·INI키·
> 파일명·버전포맷)은 원문 유지.

## 1. 패치 메커니즘 (왜 인플레이스인가)

기존 `tools/logh7_rsrc_patch.py`(G7MTClient용)는 .rsrc 섹션을 **전체 재직렬화**한다.
그 직렬화기는 전부 ID 엔트리인 G7MTClient에서만 byte-exact 라운드트립이고, 두 런처는
RT_BITMAP에 **이름(named) 디렉터리 엔트리**(`TITLE_BG`, `BITBTN_*`, `BTN_CANCEL_*`)를
가져 전체 재직렬화가 디렉터리/이름풀을 재현하지 못한다(treeRoundTrip=false, ~112–144B 손실).

→ 신규 도구 **`tools/logh7_launcher_rsrc_patch.py`**: 디렉터리 트리·이름 문자열 풀·
DataEntry 영역(첫 blob 이전)을 **바이트 그대로 보존**하고, 변경된 RT_DIALOG/RT_STRING
blob만 8B 정렬로 재배치하며 각 leaf의 DataEntry(RVA/Size)만 제자리 패치한다. .rsrc는
파일 마지막 섹션이라 코드 재배치 없음. 문자열 파싱·blob 재빌드·폰트 슬롯 처리·
write_patched(섹션헤더/SizeOfImage/데이터디렉터리 갱신)는 기존 모듈 재사용.
**selftest(무편집 라운드트립) = 두 EXE 모두 byte-identical(True).**

## 2. 패치 항목 수

| EXE | applied | skip | 대상 |
|---|---|---|---|
| **G7Start.exe** | **36** | 0 | DLG 100(버전정보)·129(DirectX설치확인)·130(재시작확인)·131(제거확인) 캡션/버튼/본문 + STRING 101–105·108–116(메인 4버튼 라벨·오류·완료 메시지) |
| **Gin7UpdateClient.exe** | **27** | 0 | DLG 130(진행) 캡션 + STRING 블록1·2(타이틀·닫기·취소·서버접속/다운로드/완료/실패/중단 상태·디스크용량·점검중·중지확인 등) |

매핑: `RE/content/localization/launcher-{g7start,gin7update}-ko.json`. 자연스러운 한국어
(기계번역 톤 배제), 캐논 표기 "은하영웅전설 VII".

## 3. 폰트 교체 (폰트 함정)

다이얼로그 폰트 face가 DLGTEMPLATE에 per-template로 `ＭＳ Ｐゴシック`로 박혀 있어
문자열만 바꾸면 ja 폰트+ACP에서 모지바케 위험. → 폰트 face 슬롯도 **`맑은 고딕`으로
동반 교체**(G7Start DLG 100/129/130/131 4슬롯, Gin7 DLG 130 + STRING font 슬롯).
폰트 슬롯은 .rsrc의 'str' 필드라 일반 문자열과 동일 경로로 패치됨.

## 4. byte-verify

- **16B 시그니처 가드**: 두 EXE 모두 선두 16B(`4d5a9000…`) 원본 동일, MZ/PE 유지.
- **재파싱·로드가능**: pefile 풀 파싱 성공(fast_load=False). origCheckSum=0(EXE라 무시),
  재계산 불필요.
- **이름 리소스 보존**: 패치 후에도 `TITLE_BG`/`BITBTN_*`/`BTN_CANCEL_*` 전원 잔존 —
  인플레이스 방식의 핵심 검증.
- **영역 한정 diff**(원본 백업 대비): 변경 바이트가 **(a) PE 헤더의 .rsrc 섹션
  VirtualSize·SizeOfImage·리소스 데이터디렉터리(0x174/0x194/0x260/0x280)와
  (b) .rsrc 섹션 본문**에만 분포. **.text/.rdata/.data = 0바이트 변경(코드 무손상).**
  파일 크기 델타 0(한글이 원본 raw 크기 내 수용).
- **한글 슬롯 존재 확인**(배포본 재파싱): G7Start 36, Gin7 27 슬롯에 한글(가–힣) 렌더.

## 5. 배포

패치 산출을 두 배포 타겟에 드롭(백업: `.omo/backup/launcher-rsrc-20260626/`):
- `client/dist/logh7-client/{G7Start,Gin7UpdateClient}.exe`
- `client/vendor/logh7-installed/{G7Start,Gin7UpdateClient}.exe`

dist·vendor 사본은 EXE별 sha 동일(G7Start `0e0d83bf…`, Gin7 `76c5a359…`).

## 6. 라이브 렌더 대기 (남은 게이트)

폰트 face를 `맑은 고딕`으로 교체했으나, GDI가 ja-JP 리소스 언어의 다이얼로그에서
한글 face를 charset/ACP에 맞게 매핑해 실제 깨짐 없이 렌더하는지는 **실 Windows 셸 기동
1회 라이브 검증 필요**(logh7-localize 폰트 함정 원칙·단일 호스트 ACP 함정 동일 적용).
정적/바이트 검증은 전부 PASS. 다이얼로그 1개(예: G7Start 메인 102 또는 버전정보 100)
먼저 띄워 한글 렌더 확인 후 동일 패치를 신뢰하면 됨.

## 7. 산출물

- 도구: `RE/tools/logh7_launcher_rsrc_patch.py` (selftest/dump/patch, 이름엔트리 보존 인플레이스)
- 매핑: `RE/content/localization/launcher-g7start-ko.json`, `…/launcher-gin7update-ko.json`
- 배포 EXE 4종(dist+vendor) + 백업 4종
- 본 문서
