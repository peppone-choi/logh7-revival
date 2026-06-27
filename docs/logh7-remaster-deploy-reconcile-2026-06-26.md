# 리마스터 deploy 3트리 정합 (2026-06-26)

자산(TGA/BMP)만 대상. EXE/SHA 무관. P0 추측 없음 — 전부 파일 크기·md5 측정 기반.

## 3트리
- `client/dist/logh7-client/data/image` (dist)
- `client/vendor/logh7-installed/data/image` (vendor)
- `.omo/work/logh7-installed/data/image` (★live, 라이브 하네스 INSTALLED_ROOT)

## 리마스터 세트 (오버레이 소스 = `.omo/work/remaster/{hud,panel,ai-texture}-overlay`)
- HUD 20종 (`logh7_remaster_hud_tga.py --set hud`)
- PANEL 40종 (`--set panel`, 2026-06-26 대형 패널)
- AI 텍스처 16종 (`logh7_ai_texture_sr.py`, Real-ESRGAN x4 — strategy.tga·fs00x_f.bmp·grid_glow·lens 등)
- 합계 76종

## 점검 전 현황 (deploy 도구 DEPLOY_DIRS가 dist+vendor만 타깃 → live 누락이 근본)
| 세트 | dist | vendor | live(점검전) |
|---|---|---|---|
| HUD 20 | OK | OK | OK (기배포) |
| PANEL 40 | OK | OK | **전부 누락**(원본 크기, DIFF) |
| AI 16 | OK | OK | **전부 누락**(원본 크기, DIFF) |

→ 라이브 트리에 56종(40 패널 + 16 AI) 미배포.

## 조치
1. 백업: `.omo/work/remaster/livetree-backup-2026-06-26/`에 라이브 원본 56종 보존(최초 1회).
2. 배포: 오버레이에서 라이브 트리로 56종 드롭인 복사(deployed=56, backed_up=56).

## 검증
- 재점검: 76/76 `live=OK` (DIFF·MISSING 0).
- 3트리 md5 패리티 샘플(세트별 1개) 전부 동일:
  - `shokumu_card/shokumu_parts_1.tga` → 3aec1d3a…
  - `strategy/fs000_f.bmp` → d9286b17…
  - `effect/strategy.tga` → 445016ce…

## 잔여
- 라이브 렌더검증(전략맵/패널 실클라 표시)은 별도 — `logh7-live`로 스플래시 대기 후 드라이브. 자산은 D3DX8 magic 로드라 더 큰 치수 드롭인 호환(EXE 경로 보존).
- (선택) deploy 도구 `DEPLOY_DIRS`에 live 트리 추가하면 향후 자동 정합.
