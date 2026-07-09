# M2 캐릭터 생성 플로우 — RE 확정 청사진 (2026-07-10)

근거: re-analyst Ghidra 정적 RE (`FUN_0051a370` 로비 시퀀서, `FUN_00594f20` 캐릭터-엔트리 위저드, `FUN_00595ce0` 0x1006 송신, `FUN_004b78a0` 셀렉터 테이블, `FUN_004ba2b0` dispatcher, 사이저 `FUN_004b8b00`), live-qa 라이브 확정(`.omo/live-qa/m2-gate-confirm-20260709-2349/`).

> **한 줄:** 빈 계정의 첫 캐릭터는 커스텀 생성(0x1008, `新キャラクターの作成` item1)이 아니라 **오리지널 추첨(0x1006, `オリジナルキャラクター抽選` item2)**으로 얻는다. item1은 이 클라 빌드에서 정적 disable이다.

---

## 1. 로비 잠금 게이트 (확정)

- 클라 `FUN_0051a370` state 0x16 `IntoLobbyMain`: `if ((char)DAT_02216c88 == 0) setText(0x78677c "セッションサーバーの不具合につき…少々お待ちください")` + 캐릭터 패널 잠금.
- `DAT_02216c88` = **0x2004 ResponseInformationCharacterCharge body[0]** = 계정 캐릭터 count.
- **body[0] ≥ 1 이면 잠금 해제** (라이브 재현). body[0]은 count이지 ready-flag 아님 — 가짜 주입 금지(빈 레코드 파싱 오류).
- 서버 대응: `logh7-character-codec.mjs:594` `encodeLobbyCharCardList` → `payload.writeUInt8(list.length, 0)`. 계정에 캐릭터가 charge되면 자연히 ≥1.

## 2. 로비 메인 메뉴 버튼 (정적 enable)

`IntoLobbyMain` 8아이템 enable = 정적 상수 `{1,0,1,0,1,0,0,0}` (동적 re-enable 경로 없음):

| item | 라벨 | enable | emit |
|---|---|---|---|
| 0 | ゲーム開始 | ✅ | 세션 선택→SS 접속→월드 |
| 1 | 新キャラクターの作成 | ❌ 정적 disable | (0x1008, 이 빌드 로비에서 미노출) |
| 2 | **オリジナルキャラクター抽選** | ✅ | **첫 캐릭터 획득 경로** |
| 3 | キャラクター削除 | ❌ 정적 disable | (0x2008) |
| 4 | セッションの変更 | ✅ | 세션 변경 |
| 5–7 | 環境設定/クレジット/終了 | — | 로컬 UI |

## 3. 첫 캐릭터 획득 시퀀스 (item2 오리지널 추첨)

```
빈 계정 로비(0x2004 count=0, 잠금)
 └ item2 클릭 → state 0x1a PUSH_ORIGINAL → 0x2d (DAT_02217398=0x40)
    ├ 0x2d~0x2f  세션+오리지널 후보 선택 (후보 풀 = 0x2006 세션 데이터, stride 0x14c)
    ├ 0x30~0x35  SS 접속: LB2SS(0x2009류)→CONNECT_SS→CERTIFICATION_SS
    └ 0x35 CERT_OK → state=0x40 → 캐릭터-엔트리 위저드 FUN_00594f20
FUN_00594f20 위저드 (sub-state @ *(DAT_02215e2c+4)):
    0x40 → 0x1000 RequestInformationAccount 송신
    0x45 → 계정 후보 목록 구성
    0x46 → 0x1004 RequestCharEntryState 송신, 0x1005 응답 소비(후보 풀)
    0x47 → ★0x1006 CommandOriginalCharacterCharge 송신★
    0x48 → 0x1006 echo가 만든 UI 이벤트 0x16 감지 → "ORIGINAL_CHARGE_OK"
    → 위저드 종료 → SS2LG(state 0x6d) → 재로그인 → state 0x12에서 0x2003 재송신
    → 0x2004(count+1) 수신 → 로비 해제·새 캐릭터 표시
```

## 4. 와이어 레이아웃 (확정)

### 4.1 C→S 0x1006 CommandOriginalCharacterCharge (24B, sizer 0x18)
```
[u32LE count][u32LE char_id ×5]   // count=선택 수(1~5), 뒤 id들, 나머지 0
```
- 송신 `FUN_00595ce0`: 5슬롯 배열 `DAT_0222846c`(미선택=-1)에서 비(-1) id를 `DAT_0222835c`로 모아 count와 함께 송신.
- **char_id는 서버가 0x2006 세션 데이터에 실어준 후보 캐릭터 id** — 서버 0x1006 처리 시 이 id들이 0x2006에 넣은 값과 정합해야 한다.

### 4.2 S→C 0x1006 응답 = echo (24B)
- dispatcher `FUN_004ba2b0` case 0x1006: 24B를 `DAT_0043241c`에 복사 → `FUN_00517cd0(0x1006)` → 현재 씬 위젯에 **UI 이벤트 0x16 post**.
- 위저드 0x48이 이벤트 0x16 → return 1 "ORIGINAL_CHARGE_OK". **echo 내용 무관, 형식(24B)만 맞으면 성공 처리.**

### 4.3 0x1004→0x1005 RequestCharEntryState (응답 0x20/32B)
- 위저드 0x46이 후보 풀 구성에 소비. 현 서버 stub 크기(0x20)는 맞음, body 필드 의미는 미확정(우선순위 낮음 — 첫 캐릭터 결정 게이트는 0x1006+0x2004).

### 4.4 0x1007 CommandExtensionCharacterCharge — 이 빌드 미사용
- 셀렉터 존재하나 송신 콜사이트 없음. 첫 캐릭터 흐름에 역할 없음.

## 5. server-dev 구현 지침 (즉시)

1. **0x1006 수신 처리** (현재 echo만 → 실제 charge로):
   - request body `[u32 count][u32 id×5]` 파싱.
   - 그 id들에 해당하는 오리지널 캐릭터를 계정 로스터에 charge(스토어 영속).
   - **0x1006를 24B로 echo 응답** (클라는 이벤트 0x16으로 무조건 성공 처리).
2. **0x2004 갱신**: 이후 0x2003 재요청에 `encodeLobbyCharCardList`가 charge된 캐릭터를 실어 **body[0]=count(≥1)** 로 응답. → 로비 해제 최종 트리거.
3. **0x2006 후보 정합**: 오리지널 후보 id 풀은 서버가 0x2006 세션 데이터에 실어야 하고(현 `scenario-session.mjs`의 세션 `powers`/레코드), 0x1006에 담겨 오는 id가 그 풀과 일치해야 한다.
4. **선행 핸드셰이크**: 위저드 도달 전 SS 접속(0x2009→0x200a→LB2SS/CONNECT_SS/CERT_SS)과 0x1000/0x1004 응답이 필요. playable-server의 기존 0x2009/world-session 경로와 정합 확인.

## 6. 확신도 / 미확정

| 항목 | 확신도 |
|---|---|
| 로비 게이트 = 0x2004 body[0] count | **높음** (RE 4중 + 라이브) |
| item1 정적 disable / item2가 첫 캐릭터 경로 | **높음** (정적 배열 + 라이브) |
| 0x1006 body `[u32 count][u32 id×5]` 24B | **높음** (FUN_00595ce0 + 사이저) |
| 0x1006 echo→이벤트 0x16→OK, SS2LG로 0x2004 갱신 | **높음** (디컴파일) |
| 0x1004→0x1005 body 필드 의미 | **미확정** (후속, 우선순위 낮음) |
| 오리지널 후보 풀의 0x2006 정확한 stride/필드 | **부분** (stride 0x14c 확인, 필드 매핑 라이브 권장) |

## 7. 검증 게이트 (M2 완료 정의)

- [ ] 서버 0x1006 핸들러가 계정에 캐릭터 charge + 영속 (유닛 테스트)
- [ ] 0x2003 재요청에 0x2004 body[0]≥1 (유닛 테스트)
- [ ] **실클라: 빈 계정 → item2 오리지널 추첨 → 캐릭터 획득 → 로비 해제 → 캐릭터 표시** (라이브 trace + 스크린샷)
- [ ] (후속) 캐릭터 선택 → 월드 진입
