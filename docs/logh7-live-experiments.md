# LOGH VII 라이브 클라이언트 실험 런북 (G201)

> 2026-06-30 update: split tactical-entry experiments into a safe default probe and a crash/RE probe.
> Default `LOGH_BATTLE_ENTRY_PROBE=1` now omits `0x0f1f` and stops at `0x042f NotifyChangeMode`.
> `0x0f1f NotifyTactics` must be enabled explicitly with `LOGH_BATTLE_ENTRY_NOTIFY_TACTICS=1`
> or `LOGH_BATTLE_ENTRY_CODES=0x0f1f`; current live result is APPCRASH `c0000005`
> at VA `0x0058f83a` (`FUN_0058ee70`), not a playable tactical GUI.

작성: 2026-06-14. 서버측은 테스트로 검증됐으나 **두 가지는 실클라 라이브 확인이 필요**하다. 인터랙티브
Win32 GUI는 헤드리스로 자동화가 깨지므로(foreground-steal가 클릭을 막음, 멀티플레이 로드맵 boundary 참조),
이 문서는 **사용자/라이브 QA 세션이 직접 실행**하는 절차다. 각 실험은 가설·절차·성공판정·계측을 명시한다.

도구: `tools/logh7_ui_explorer.py`(실클라+서버 구동/관찰), `tools/logh7_player_info_probe.py`(live
PLAYER_INFO/grid/mode 스캔), `tools/logh7_crash_catcher.py`(폴트 주소). EXE는 매 세션 후 SHA 복구.

---

## 실험 A — 전투 배틀 진입 (controllable 전술전투 확인)

**가설**: 서버가 ChangeMode 배틀진입 시퀀스를 푸시하면 클라의 모드바이트 `client+0x126711`이 2(전략)→0(전술)로
전환되고 전술 함선 풀(`FUN_004c32a0`, gate `0x126711==0`)이 populate되어 사격 명령을 ISSUE할 수 있게 된다.

**배틀 진입 시퀀스 (서버 → 클라, 로드맵 Phase1 순서)**:
1. 전술 셋업 데이터 푸시: `0x349 ResponsePositionUnit`(함선 위치) → `0x33b ResponseTacticsInformationUnitShip`
   (전투스탯) → `0x341 FillShield` → `0x343 FillBeamGun` → (`0x345/0x34b/0x347` 기지/장애물).
2. `0x42f NotifyChangeMode` — **스폰포즈 grant** (이미 구현: `buildNotifyChangeModeInner`, modeKind=0,
   참가자별 {shipId,heading,x,z,y}). 이게 `FUN_004c1c30`로 각 함선을 전술 필드에 배치.
3. `0x0f1f NotifyTactics` — 전술 트리거.

**절차**:
```bash
# 1) 권위적 전투 서버 (배틀진입 오케스트레이션 활성 — 통합 후 LOGH_BATTLE=1 등으로 게이트 예정)
LOGH_RELAY=1 LOGH_AUTHORITATIVE=1 LOGH_CONTENT_DB=1 npm run server:auth
# 2) 실클라 구동 + 검증된 월드로드 플래그
LOGH_LOBBY_OK_FORMAT=message32 LOGH_SS_FORMAT=message32 LOGH_WORLD_PLAYER=1 python tools/logh7_ui_explorer.py
# 3) 월드 로드 후, 배틀진입 시퀀스를 트리거(서버 콘솔 명령 또는 CommandChangeMode 0x411 수신 시 자동)
# 4) 계측: 모드바이트 + 풀 상태 스캔
python tools/logh7_player_info_probe.py   # 기대: mode(0x126711)=0, tacticalPoolCount>0, gridActive=1
```

**성공판정**: `0x126711==0` 전환 + 전술 함선 풀 비제로 + 화면이 전술 배틀뷰 + 클릭→사격 명령(0x406) 송신
관측. crash_catcher 무폴트.

**미해결(이 실험이 잠그는 것)**: 셋업 테이블의 정확한 푸시 타이밍(0x0f02 윈도우 vs grid-enter 0xb09/0xb0a
직후), 그리고 `0x126711=0`을 무엇이 쓰는지(NotifyChangeMode 적용 경로 vs SwitchMode 0xb06 vs grid-enter
FSM) — `docs/logh7-proto-battle-core.md §3` FSM 표 + live probe로 확정.

---

## 실험 B — 포트레잇 face_number 인덱스 보정 (정체성 잠금)

**가설**: face-id 인코딩의 atlas 선택(진영/성별/계급)은 크랙됐으나 per-atlas 로컬 인덱스 base가 미보정이다.
known face_number를 가진 인물의 0x0323 레코드를 클라에 보내 **실제 렌더되는 포트레잇**을 캡처하면 face_number↔
atlas 인덱스 매핑이 잠긴다(`tools/logh7_face_id_decode.py` OPEN ITEM).

**입력 (검증된 12개 official face_number, `content/roster/face-name-map.json`)**:
Reinhard 209 · Mittermeyer 195 · Kessler 69 · Friedrich IV 270 · Ofresser 41 · Remscheid 286 · Caselnes
48 · Trunicht 125 · Negroponti 268 · Rebello 285 (+ 앵커 Yang 206 · Schenkopp 85 = 이미 픽셀확정).

**절차**:
```bash
# 1) 서버가 캐릭터 레코드(0x0323)의 face 필드(@0xf4)에 테스트 face_number를 넣어 송신
#    (logh7-login-protocol buildInformationCharacterRecordInner의 face 인자)
# 2) 실클라가 그 인물 카드/초상 렌더 → 화면 캡처
LOGH_TEST_FACE=209 python tools/logh7_ui_explorer.py --capture-portrait
# 3) 캡처를 디코드된 아틀라스(content/roster/canon-portraits/<atlas>/*.png)와 NCC 비교
python tools/logh7_portrait_pixelmatch.py --probe capture.png --atlas oem
# 4) face_number 209 → 렌더된 atlas 슬롯 기록 → 인덱스 base 산출
```

**성공판정**: 각 known face_number가 정확한 디코드 아틀라스 슬롯으로 매핑되고, 인덱스 base 공식이 12개 모두
에서 일관 → `tools/logh7_face_id_decode.py`에 base 반영 → **모든 face_number 보유 인물의 포트레잇 결정론적 확정**.
이는 소실된 라벨 데이터를 라이브 RE로 우회하는 유일 경로다(공식 JPG는 2장만 생존).

**확장**: 인덱스 base가 잠기면, 캐릭터 레코드에 face_number를 1개씩 넣어 순회 렌더 → 캡처 → AI/픽셀 분류로
**아틀라스 전 슬롯의 정체성 라벨**을 라이브로 복원 가능(반자동 배치 검증).

---

## 안전/복구
- 모든 실험은 EXE 무수정 우선; 패치가 필요하면 별도 `.exe` 사본 + SHA 기록, 세션 후 원본 복구.
- 포트(4787 등)·프로세스·String.txt(한글화) 상태는 매 실험 후 복구 검증(완료판정의 일부, playable-revival-policy).
- 서버측 전투/내정 로직은 이 실험들과 **독립**으로 이미 테스트 검증됨 — 실험은 클라 surface 확정용.
