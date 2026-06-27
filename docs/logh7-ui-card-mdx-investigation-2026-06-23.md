# UI 카드/MDX 조사 보고서 (2026-06-23)

## 1. 관찰 (Observation)

이번 조사에서는 3개의 독립적인 문제 영역을 동시에 추적했다.

- **텍스트 출처**: 클라이언트 내 일본어 잔여 텍스트("게임을 종료합니다", "사운드 설정")의 실제 출처를 확인
- **직무카드(職務カード)**: 전략맵에서 유닛을 선택했을 때 표시되어야 할 직무카드 UI가 렌더되지 않는 근본 원인
- **MDX 검증**: `Null_galaxy.mdx`와 `galaxy.mdx`가 실제 항성 위치를 하드코딩하고 있는지, 아니면 템플릿인지 확인

---

## 2. 조사 방법 (Investigation Method)

각 영역별로 다음 도구/방법을 사용했다.

| 영역 | 도구/방법 | 상세 |
|------|----------|------|
| 텍스트 출처 | `content/extracted/msgdat-full.json` (constmsg.dat), `String.txt` (cp949), `dlgfix.json`, redex 문자열 검색 | constmsg 그룹/인덱스 매핑, String.txt 라인 번호 추적, .rsrc 다이얼로그 문자열 테이블 후보 확인 |
| 직무카드 | `tools/logh7_redex.py` (Ghidra 디컴파일 인덱스) | FUN_004b68f0부터 panelKind 분기 체인을 따라가며, unit panel(직무카드) 생성/렌더 전체 호출 그래프 추적 |
| MDX 검증 | `tools/logh7_mdx_inspect.py` (자체 MDX 파서) | Null_galaxy.mdx 노드 트리, transform matrix, 3D position, node 이름 패턴 분석 |

---

## 3. 텍스트 출처 (Text Source Investigation)

### 3.1 "게임을 종료합니다"

- **msgdat/constmsg**: 그룹 98 인덱스 1에는 "취소"가 있으나, "게임을 종료합니다"는 **constmsg.dat에 없음**
- **String.txt**: cp949 인코딩, 한글화 완료 상태. 라인 4-6에 "로그인에 실패했습니다", "버전이 다릅니다", "게임 종료" 등이 있으나 "게임을 종료합니다"는 **직접 확인 필요**
- **redex**: 원본 EXE에 "終了" / "サウンド" 없음 (한글화된 msgdat에서만 발견)
- **결론**: 이 문자열은 String.txt에 있을 가능성이 높음 (로비/메뉴 텍스트). 실클에서 여전히 일본어로 표시된다면 String.txt의 해당 라인 번호를 찾아 수정하거나, .rsrc 다이얼로그의 문자열 테이블을 수정해야 함

**수정 방법**:
1. String.txt에서 해당 라인을 cp949로 "게임을 종료합니다"로 수정
2. 또는 .rsrc 다이얼로그 ID를 찾아 UTF-16LE로 수정

### 3.2 "사운드 설정"

- **msgdat-full.json**: constmsg.dat 인덱스 3049에 "사운드 설정"이 존재
- **문제**: 이 문자열이 어떤 그룹에 속하는지는 **offsetTable 분석으로 확인 필요**
- **결론**: 그룹 번호를 확인 후, 해당 그룹/인덱스를 참조하는 클라 함수를 redex로 검색. 실클에서 일본어로 표시된다면 constmsg.dat의 해당 그룹/인덱스를 cp949로 수정하거나 String.txt 해당 라인 수정

### 3.3 기타 확인된 케이스

- constmsg.dat 그룹 98 인덱스 0="결정", 1="취소" (dlgfix.json에서 로그인 오류 다이얼로그 버튼으로 사용)
- constmsg.dat 그룹 103 인덱스 0="로그인에 실패했습니다", 1="버전이 다릅니다" (dlgfix.json에서 그룹 98으로 리포인트)
- constmsg.dat 인덱스 3070="게임을 종료하시겠습니까?" (확인 다이얼로그 텍스트)
- dlgfix.json: 다이얼로그 버튼 레이블이 constmsg 그룹 103 -> 98로 리포인트됨

---

## 4. 직무카드 원인 (CardRE — Duty Card Render Root Cause)

### 4.1 호출 체인 (Render Chain)

```
FUN_004b68f0 (main game loop, mode dispatcher)
  -> FUN_0054e570 (panelKind switch: 1=char, 2=unit, 3=base)
    -> FUN_004ff3c0 (panelKind==2, unit panel setup)
      -> FUN_004fc4e0 (param_2 != 0 gate)
        -> FUN_004f6040 (creates panel type 0x67 via FUN_004fe890)
          -> FUN_004f68f0 (fills rows reading PLAYER_INFO+0x270)
```

### 4.2 데이터 의존성

- **0x0323 ResponseInformationCharacter** 레코드 (opcode 0x323 in FUN_004ba2b0 receive dispatcher)
- **0x0323 offset 0x24c (byte)** = officerCount/seatCount, FUN_004c2c80이 PLAYER_INFO+0x270으로 복사
- **panelKind==2** (unit panel)은 FUN_0054e570 switch에서 *param_1로 선택
- **param_2 != 0** gate in FUN_004fc4e0 (zero면 early return)

### 4.3 근본 원인 (Root Cause)

**1차 원인: 텍스처 에셋 누락**

클라 코드(FUN_004fc4e0, FUN_004f4a80, FUN_00590100, FUN_00545cf0)가 하드코딩된 경로로 `data/image/shokumu_card/shokumu_*.tga`를 로드하려 한다. 이 텍스처 파일들이 없으면 카드 패널 UI 요소가 렌더될 수 없다.

**누락된 에셋 목록**:
- `data/image/shokumu_card/shokumu_meirei_teikoku.tga`
- `data/image/shokumu_card/shokumu_meirei_doumei.tga`
- `data/image/shokumu_card/shokumu_shokumu_teikoku.tga`
- `data/image/shokumu_card/shokumu_shokumu_doumei.tga`
- `data/image/shokumu_card/shokumu_parts_1.tga`
- `data/image/shokumu_card/shokumu_parts_2.tga`

**2차 원인: C002 officerCount**

C002 officerCount(0x0323 offset 0x24c -> PLAYER_INFO+0x270)가 unit list 패널(type 0x67)의 행 수를 제어한다. 0이면 패널이 0개 행을 생성한다. 서버는 이미 officerCount=5를 기록하므로 이는 현재 블로커가 아님.

**3차 원인: C002 mode/owner gate**

텍스처가 있음에도 불가시하다면, C002 mode/owner gate(FUN_0050d230 vs FUN_004fef90 mode mismatch)가 프런티어일 수 있다. 이는 [[logh7-c002-this-correction-2026-06-22]]에서 상세히 추적된 바 있다.

---

## 5. MDX 검증 결론 (MdxVerify)

### 5.1 Null_galaxy.mdx

- **성격**: TEMPLATE (템플릿). 79개 항성 노드 + 6개 특수 천체 = 85개 노드
- **transform matrix**: 전부 ZERO
- **3D position**: 전부 ZERO
- **node 이름**: `star_NN_<spectral_class>` 형식으로 spectral class를 인코딩 (예: star_01_G, star_02_K)
- **결론**: 실제 항성 위치를 하드코딩하고 있지 않음. 위치는 전부 원점

### 5.2 galaxy.mdx

- **성격**: 성운(nebula) 배경만 있는 파일. 2개 레이어, 항성 없음
- **결론**: 실제 항성 위치와 무관

### 5.3 실제 항성 위치의 출처

- **80성계 좌표**: `content/galaxy.json` — `gin7manual` PDF 101p 星系図 벡터 dot에서 복원 (Y-flip 보정 적용)
- **100x50 전략 그리드**: 서버 권위적 — 0x0315/0x0313 와이어 레코드로 전달, MDX와 무관

### 5.4 spectral class 불일치

| 출처 | G | O | F | A | B | M | K | 합계 |
|------|---|---|---|---|---|---|---|------|
| Null_galaxy.mdx (템플릿) | 19 | 2 | 8 | 7 | 5 | 21 | 17 | 79 |
| galaxy.json (캐논) | 32 | 0 | 3 | 4 | 8 | 10 | 23 | 80 |

- **불일치 이유**: MDX는 제네릭 템플릿이지 실제 갤럭시 레이아웃과 매칭되지 않음
- **서버 판정**: 서버는 galaxy.json의 spectralClass를 사용해야 함. MDX 템플릿의 spectral class는 참고용일 뿐

### 5.5 남은 갭 (Gaps)

- MDX 노드 인덱스(1-79) -> galaxy.json 성계명 매핑 미확정 (MDX 템플릿 순서가 캐논 갤럭시 순서와 다를 수 있음)
- 79 vs 80의 1개 누락 항성: galaxy.json의 한 성계에 대응하는 MDX 템플릿 노드가 없음
- spectral class 불일치 — 서버는 galaxy.json 기준으로 사용
- MDX에 3D position이 없으므로 클라이언트는 서버 와이어(0x0315)나 그리드 좌표로부터 위치를 계산해야 함

---

## 6. 다음 행동 (Next Actions)

### 6.1 텍스트 출처 (TextSource)

| 우선순위 | 행동 | 담당 | 방법 |
|---------|------|------|------|
| P1 | String.txt에서 "게임을 종료합니다" / "사운드 설정" 라인 번호 확인 | logh7-localize | `grep` 또는 redex 문자열 검색으로 String.txt 라인 번호 확정 |
| P1 | 확인된 라인이 일본어이면 cp949로 한글 번역 수정 | logh7-localize | String.txt 해당 라인 수정 후 playable EXE 재빌드 |
| P2 | .rsrc 다이얼로그 문자열 테이블 후보 확인 | logh7-localize | PE 리소스 뷰어로 ID 추적 |

### 6.2 직무카드 (CardRE)

| 우선순위 | 행동 | 담당 | 방법 |
|---------|------|------|------|
| P0 | `shokumu_card_*.tga` 텍스처 파일 원본 CD/설치본에서 복구 | logh7-extract | 원본 CD `data/image/shokumu_card/` 경로에서 추출 |
| P0 | 복구된 텍스처를 playable 클라이언트에 배치 후 라이브 검증 | logh7-live | `ui_explorer`로 전략맵 진입 -> 유닛 선택 -> 직무카드 패널 캡처 |
| P1 | 텍스처 복구 후에도 불가시하면 C002 mode/owner gate 재검증 | logh7-re | FUN_0050d230 vs FUN_004fef90 mode mismatch 확인 |

### 6.3 MDX (MdxVerify)

| 우선순위 | 행동 | 담당 | 방법 |
|---------|------|------|------|
| P2 | MDX 노드 인덱스 -> galaxy.json 성계명 매핑 확정 | logh7-extract | MDX node 이름 순서와 galaxy.json 순서를 수동 대조 |
| P2 | 79 vs 80 누락 항성 식별 | logh7-extract | 매핑 대조에서 누락된 성계 확인 |
| P3 | 서버 0x0315 레코드에 spectral class 필드 추가 검토 | logh7-wire | 현재 0x0315에 spectral class가 없다면, galaxy.json 기준으로 추가 필요 여부 판정 |

---

## 7. 종합 판정

- **텍스트**: String.txt 또는 .rsrc에서의 한글화 누락 — 수정 난이도 낮음, 라이브 검증으로 확정 가능
- **직무카드**: 텍스처 에셋 누락이 1차 블로커 — 원본 CD 추출로 해소 가능. 추출 후 C002 gate가 2차 블로커일 수 있음
- **MDX**: 하드코딩 위치 없음 — 템플릿 확인. 실제 위치는 서버 권위적(galaxy.json + 0x0315 와이어). 추가 조사 필요 없음, 단 매핑 갭은 남아있음

---

*작성일: 2026-06-23*
*태그: UI, 카드, MDX, 텍스처, 직무카드, 한글화, RE*
