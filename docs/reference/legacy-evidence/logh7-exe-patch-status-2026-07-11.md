# LOGH VII 정본 EXE 패치 상태 감사 — 2026-07-11

정본 클라이언트를 자체 서버에 붙이기 위한 reversible EXE 패치의 현재 상태를 흩어진 이력 문서와
**정본 EXE 실바이트 대조**로 통합한 정본 감사. 죽은 MMO(2008 종료 "은하영웅전설 VII") 합법 보존 복원 목적.

## 방법

정본 EXE `artifacts/logh7-install/…/exe/g7mtclient.exe`
(**sha256 `9c97de2a…f334bb51`**, 3,956,736 B)를, 우리 패치 이전의 **프리스틴 설치본**
`g7mtclient.exe.bak-pre-font` (**sha256 `2848be76…c155345`**, 동일 크기)와 **전체 바이트 diff**.
추측 없이 실측만. 모든 오프셋 imageBase 0x400000 기준 VA·파일오프셋 동시 표기.

## 결론 (한 줄)

정본 EXE는 **프리스틴 설치본 + 6개 패치(총 39바이트, 전부 `.text`)** 다. 루프백 IP는 패치가 아니라
프리스틴에 이미 있던 컴파일-인 기본값이다. 이력 문서 중 런처 .rsrc 한글화·2004 공식 패치·mode-routing은
정본 g7mtclient.exe에 **적용돼 있지 않거나 무관**하다.

## 정본에 적용된 패치 (6건, 실측)

| # | 패치명 | VA | 파일오프셋 | 프리스틴(원본) | 정본(패치됨) | 바이트 | 상태 |
|---|---|---|---|---|---|---|---|
| 1 | sjis-charset-A | 0x004aedeb | 716267 (0xaedeb) | `6a01` | `6a80` | 1 | **적용됨** |
| 2 | sjis-charset-B | 0x004b0b97 | 723863 (0xb0b97) | `6a01` | `6a80` | 1 | **적용됨** |
| 3 | fsm-scene-active-gate-bypass | 0x0051a39c | 1155996 (0x11a39c) | `0f84d8160000` | `909090909090` | 6 | **적용됨** |
| 4 | session-picker-flag (item1) | 0x0051ab3e | 1157950 (0x11ab3e) | `00` | `01` | 1 | **적용됨** |
| 5 | session-change-opens-picker | 0x0051aded | 1158637 (0x11aded) | `683c…570c0000` (25B) | `e981ffffff90…90` (25B) | 25 | **적용됨** |
| 6 | router-null-result-no-teardown | 0x00613157 | 2175319 (0x213157) | `e8d4190000` | `9090909090` | 5 | **적용됨** |

rollback 바이트 = 각 행의 "프리스틴(원본)" 열. 전부 same-length, 되돌리기 가능.

### 패치별 의미
- **1·2 SJIS 폰트**: `CreateFontA`의 charset push `1`(DEFAULT_CHARSET) → `0x80`(SHIFTJIS_CHARSET). 일본어 텍스트 렌더용. 실변경 바이트는 push 오퍼랜드(0xaedec, 0xb0b98)의 `01→80`.
- **3 fsm-scene-active-gate-bypass**: 로비 FSM(`FUN_0051a370`)의 scene-active 조기이탈 `je 0x51ba7a`를 NOP. state6 이후에도 FSM이 계속 tick → conn2 recv 펌프 생존 → 로비 RPC(0x2001/0x2004/0x2006/0x200a) 수신.
- **4 session-picker-flag (item1)**: session-picker init 영역의 `mov byte ptr [esp+0x15], 0` 즉치값을 `1`로. session-picker 패치(5)에 인접한 1바이트 플래그. 백업 `g7mtclient.exe.pre-item1.bak`이 이 패치 직전 상태.
- **5 session-change-opens-picker**: `FUN_0051a370` case 0x1c no-op을 `jmp 0x0051ad73`(case 0x19 피커 init)로 + NOP 꼬리. 세션 변경 시 세션 피커 오픈. 2026-07-01 라이브 검증됨.
- **6 router-null-result-no-teardown**: transport router(`0x6130a0`)의 teardown `call 0x614b30`(@0x613150)을 NOP. null/미처리 프레임에서 conn2 미해제 → recv 펌프 유지. conn1은 0x4ac726으로 닫히므로 conn1-safe.

이력상 도구: 1·3·5·6은 `tools/live/apply_session_picker_patch.py`·`logh7_lobby_unblock_patch.py`가 정의한 것과 오프셋·바이트 일치. 2(sjisB)는 같은 스크립트의 두 번째 SJIS 사이트. 4(item1)는 스크립트에 없는 별도 1바이트 패치(백업 명칭으로만 추적됨).

## 정본에 없는/무관한 이력 항목

| 이력 항목 | 오프셋/대상 | 정본 실바이트 | 판정 | 근거 문서 |
|---|---|---|---|---|
| 루프백 IP 127.0.0.1 | 3599932 (0x36ee3c) | `3132372e302e302e31` = "127.0.0.1" | **패치 아님 — 프리스틴 기본값** | manifest note (구 sha) |
| 포트 47900 | 3599924 (0x36ee34) | `3437393030` = "47900" | **패치 아님 — 프리스틴 기본값** | 동상 |
| 원본 서버 IP 202.8.80.179 | — | 바이너리에 부재(0건) | **무관 — 런타임 config에서 로드 추정** | — |
| mode-routing (mode2→mode0) | 0x004b6afd (0xb6afd) | `b802…` (mov eax,2) | **미적용** (원본 그대로) | `restored-from-git/logh7-mode-routing-patch-2026-06-26.md` (문서상 "미교체") |
| lobby state7 je-NOP | 0x0051a834 (0x11a834) | `740e` | **미적용** (원본 그대로; 문서상 INERT 폐기안) | `logh7_lobby_unblock_patch.py` docstring |
| 런처 .rsrc 한글화 | G7Start.exe / Gin7UpdateClient.exe | — | **범위 밖 — 다른 EXE** (리셋 때 client/dist·vendor 삭제) | `restored-from-git/logh7-launcher-rsrc-patch-2026-06-26.md` |
| 2004 공식 패치 스택 | 서버 게임로직/데이터 | — | **범위 밖 — EXE 바이트 패치 아님** | `legacy-evidence/logh7-2004-official-patch-stack.md` |
| G7UPD040514.exe 공식 패치 | galaxy/grid .mdx (데이터) | — | **범위 밖 — data-only 인스톨러** | `legacy-evidence/logh7-official-patch-analysis.md` |

## sha 계보 (혼동 주의)

과거 여러 "정본" sha가 혼용됐다. 정본은 오직 `9c97de2a`.

| sha (앞8) | 파일 | 정본 대비 |
|---|---|---|
| `2848be76` | `.bak-pre-font` / `.pre-font` | **프리스틴 설치본** (우리 패치 이전 base). 구 manifest·구 Ghidra 참조가 이 sha를 targetExe로 잘못 지정했었음 |
| `8f5c2dad` | `.bak-pre-session-picker` | 프리스틴 + SJIS(1·2)만 적용 |
| `95d8ed11` | `.pre-item1.bak` | 프리스틴 + 패치 1·2·3·5·6 (item1 직전) |
| `9c97de2a` | `g7mtclient.exe` | **정본** = 프리스틴 + 6패치 전부 |
| `7dabc336` | `.bak-current` | 무관 변종 백업 — 0x37402d 근처 5바이트만 다르고 위 6패치 없음. 정본 계보 아님 |
| `bd19263c` | `.omo/re-galaxy/g7mtclient.exe` | 별개 사본(구 manifest schemaExample sha). 정본 아님 |
| `992dc7e2` | (구) `.omo/…/G7MTClient.playable.exe` | mode-routing 문서의 구 canon. 정본 아님 |

## manifest 재작성

`server/content/generated/logh7-exe-patch-manifest.json` 재작성 완료:
- `targetExe.sha256` = `9c97de2a…` (정본, 이미 패치된 상태)
- `sourceExe.sha256` = `2848be76…` (프리스틴, originalBytes/rollbackBytes 출처)
- `status` = `"applied"`, `patches[]` = 위 6건 실측 (originalBytes/patchedBytes/rollbackBytes)
- 루프백 IP는 patches에서 제거하고 targetExe.note에 "프리스틴 기본값"으로 기록
- policy(sameLengthOnly·requireOriginalBytes·requireRollbackBytes·supportsDryRun) 유지

*감사 수행 2026-07-11. 정본 EXE는 수정하지 않음(문서/manifest만 갱신).*
