# 로비 앵커 좌표 1920 센터링 재계산 + 후보 빌드 (2026-06-26)

maker 패스. RE+패치, 캐논 미교체. 저장소 E:/logh7-revival.

## 1. 근본 진단 — 왜 쏠리나

- 로비 UI는 원본 **1024×768 논리 캔버스** 좌표로 배치된다(`lobby-res.json`이 백버퍼를 1024×768→1920×1080으로 리타깃).
- 앵커 테이블 `FUN_0051c980`는 위젯 (x,y) **좌상단 절대픽셀**을 `FUN_00507a50(this+0xc=x, this+0x10=y)`로 박는다. **폭/높이는 여기 없다**(위젯 스프라이트 고유 크기, 1024-class 고정).
- 기존 `lobby-native-layout.json`(13패치)은 1024 좌표에 ~1.875배 **스케일**(300→560)을 곱했다. 위젯 폭은 안 커지는데 좌표만 비례 이동 → 1920 진짜 중앙(960)보다 **좌측에 군집** = 쏠림.
- 해법 = 스케일이 아니라 **원본 1024 블록 전체를 캔버스 중앙으로 평행이동(translate)**. 위젯 간격·폭 보존.

## 2. 앵커 테이블 전수 RE (`FUN_0051c980`, 캐논 디컴파일 = 원본값)

배열 `local_50[20]` = 10개 (x,y) 앵커. `FUN_00507a50(local_50 + param_2*2)`가 entry n=(x,y) 선택. 짝수 index=x, 홀수=y. 원본값 pristine(`_pristine.exe` 2848be76) 디스어셈블로 byte-확정.

| VA | 명령 | 축 | 원본 | 의미 |
|----|------|----|------|------|
| 0x0051c983 | mov eax,imm | y | 134 | 공통행 y(2슬롯 공유) |
| 0x0051c990 | mov eax,imm | x | 731 | **우측 컬럼 x**(5슬롯 공유: 우측 서브메뉴) |
| 0x0051c995 | mov ecx,imm | x | 605 | **중앙 컬럼 x**(3슬롯 공유: 중앙 서브메뉴) |
| 0x0051c9ca | mov [esp+8],imm | x | 15 | **좌측 앵커 x**(좌측 메뉴) |
| 0x0051c9d2 | mov [esp+0x10],imm | x | 300 | **메인 로비 패널 앵커 x** |
| 0x0051c9da | mov [esp+0x1c],imm | y | 206 | 서브메뉴 행 y |
| 0x0051c9e2 | mov [esp+0x24],imm | y | 243 | 서브메뉴 행 y |
| 0x0051c9ea | mov [esp+0x2c],imm | y | 276 | 서브메뉴 행 y |
| 0x0051c9f2 | mov [esp+0x34],imm | y | 307 | 서브메뉴 행 y |
| 0x0051c9fa | mov [esp+0x3c],imm | y | 337 | 서브메뉴 행 y |
| 0x0051ca02 | mov [esp+0x44],imm | y | 380 | 서브메뉴 행 y |
| 0x0051ca0a | mov [esp+0x4c],imm | y | 414 | 서브메뉴 행 y |
| 0x0051ca12 | mov [esp+0x54],imm | y | 445 | 서브메뉴 행 y |

**X 컬럼 = 4종**(좌15 / 메인300 / 중앙605 / 우측731). 폭은 RE로 추출 불가(`FUN_00507a50`에 폭 미저장, 위젯 스프라이트 고유). → 폭 불명 시 보수적 1차값 = **블록 평행이동** + 라이브 1컷 미세조정.

## 3. 센터링 재계산 (스케일→평행이동)

- `x_new = x_orig + DX`, `DX = (1920-1024)/2 = **448**`
- `y_new = y_orig + DY`, `DY = (1080-768)/2 = **156**`
- 정수, truncation 무관(가산만). same-length immediate.

| 축 | 원본 | 기존(스케일) | **신(센터링)** |
|----|------|------|------|
| x 우측 | 731 | 1376 | **1179** |
| x 중앙 | 605 | 1136 | **1053** |
| x 메인 | 300 | 560 | **748** |
| x 좌측 | 15 | 32 | **463** |
| y 134 | 134 | 188 | **290** |
| y 206 | 206 | 289 | **362** |
| y 243 | 243 | 341 | **399** |
| y 276 | 276 | 388 | **432** |
| y 307 | 307 | 431 | **463** |
| y 337 | 337 | 473 | **493** |
| y 380 | 380 | 534 | **536** |
| y 414 | 414 | 582 | **570** |
| y 445 | 445 | 601 | **601** |

패치: `RE/tools/client_patches/lobby-native-layout-v2.json` (13패치, originalHex 16B 가드 = pristine 일치, same-length).

## 4. 후보 빌드

- 패치: `lobby-native-layout-v2.json` (DEFAULT_STACK에서 `lobby-native-layout`만 v2로 치환, 나머지 동일)
- 빌드: `python RE/tools/logh7_build_playable_client.py --out .../G7MTClient.playable-lobbycenter.exe --patches <stack with lobby-native-layout-v2>` (**--deploy 금지**)
- **후보 EXE**: `.omo/work/logh7-ko-overlay/exe/G7MTClient.playable-lobbycenter.exe`
- **후보 SHA**: `d6e5e571…`
- **캐논 불변**: `G7MTClient.playable.exe` = `992dc7e2…` (미교체 확인)

### byte-verify (후보 디스어셈블)
- eax(우측) = 0x49b = **1179** ✓ / ecx(중앙) = 0x41d = **1053** ✓
- 좌측 = 0x1cf = **463** ✓ / 메인 = 0x2ec = **748** ✓
- y: 0x122=290, 0x16a=362, 0x18f=399, 0x1b0=432, 0x1cf=463, 0x1ed=493, 0x218=536, 0x23a=570, 0x259=601 ✓
- 모든 originalHex pristine 일치(빌드 가드 통과).

## 5. 라이브 1컷 검증 절차 (logh7-live)

1. 기존 node 종료 → `ui_explorer start --patched-exe .omo/work/logh7-ko-overlay/exe/G7MTClient.playable-lobbycenter.exe --env …`
2. **BOTHTEC 스플래시 ~30초 대기**(포그라운드 유지, 라이브 스킬 경고).
3. 로그인(수동, autologin 금지) → 로비 진입.
4. 스크린샷 1컷: 메인 패널이 화면 가로 중앙(≈960) 부근인지, 좌/중/우 메뉴 컬럼이 균형 배치인지 육안 확인.
5. stop → SHA 복원 확인(캐논 992dc7e2 불변).

## 6. 미세조정 Δ 노브

`lobby-native-layout-v2.json` `knobs:{DX,DY}` + 생성기 `scratchpad/gen_v2.py` 상단 상수.
- **DX**(기본 448): 라이브에서 전체가 좌측이면 DX↑, 우측이면 DX↓. 4개 X 앵커가 동일 Δ로 이동(상대 간격 보존).
- **DY**(기본 156): 상/하 균형. 9개 Y 행이 동일 Δ로 이동.
- 폭 불명 보수값이므로 1컷 후 ±수십px 단위로 DX/DY 조정 → 재생성·재빌드(캐논 불변, same-length).
