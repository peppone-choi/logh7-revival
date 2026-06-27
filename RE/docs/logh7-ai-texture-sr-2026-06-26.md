# AI 텍스처 초해상(Real-ESRGAN) 설치·업스케일·배포 — 2026-06-26

## 1. Real-ESRGAN 설치 (정직 확인: 동작함)

- `pip install realesrgan basicsr` 성공. 부수로 **torchvision 0.27.1** 끌려 들어옴.
- **알려진 깨짐 재현**: 신 torchvision은 `torchvision.transforms.functional_tensor`를 제거 →
  `basicsr.data.degradations` import가 `ModuleNotFoundError`.
- **shim 해결(코드에 내장)**: basicsr import 전에 `sys.modules`에
  `torchvision.transforms.functional_tensor` 더미 모듈을 꽂고 `rgb_to_grayscale`를
  `torchvision.transforms.functional`로 우회. import OK.
- 모델 가중치 다운로드(`.omo/work/remaster/weights/`):
  - `RealESRGAN_x4plus.pth` (63.9MB, HTTP 200) — 일반/사진(사용)
  - `RealESRGAN_x4plus_anime_6B.pth` (17.1MB, HTTP 200) — 애니/일러스트(예비)
- **end-to-end 검증**: 32x32 테스트 타일 → 128x128 0.21s, 512x512 → 2048x2048 32s. CPU(CUDA 없음) 정상 구동.

## 2. 업스케일한 고가치 텍스처 — 16종 (Real-ESRGAN x4, CPU)

기존 `logh7_remaster_hud_tga.py`(LANCZOS)는 **type-1 팔레트 TGA(HUD/패널)만** 처리.
이번엔 그 파이프라인이 안 건드리는 **truecolor BMP/TGA(함성/배경/항성글로우/전략)** 를
신규 도구 `RE/tools/logh7_ai_texture_sr.py`로 신경망 초해상.

| 그룹 | 파일 | 원본 → 산출 |
|---|---|---|
| 항성 글로우 | strategy/fs000~006_f.bmp (7종) | 512² → 2048² |
| 전략 글로우/플레어 | strategy/grid_glow.bmp, bh_flare.bmp | 512²→2048², 256²→1024² |
| 렌즈/백라이트 | lens/fs000a.bmp, fs000b.bmp, BackLight.bmp | 512²→2048², 256²→1024² |
| 전투 effect | effect/exp_a.bmp, CarrierCraft.tga, light.tga | 512² → 2048² |
| 전략 대형 | effect/strategy.tga (RGBA) | 1024×768 → 4096×3072 |

- 알파 채널은 NN(RGB 전용)과 별도로 LANCZOS 업스케일 후 재합성(strategy.tga RGBA 보존).
- 원포맷 보존 재인코딩(BMP→BMP, TGA→TGA). D3DX8 CD3DXImage는 content magic 로드라 더 큰 치수 드롭인 OK.

## 3. 품질 (Lanczos 대비 — 정직 평가)

- downscale-restore PSNR 프록시(fs000_f, x2): **Lanczos 50.4dB vs Real-ESRGAN 41.5dB**.
  → 이 텍스처군(부드러운 글로우/그라데이션)에서는 **PSNR상 Lanczos가 높음**. 정상이다:
  Real-ESRGAN은 고주파 디테일을 *합성*하므로 매끈한 그라데이션에선 GT와의 PSNR이 낮게 나오고,
  **디테일 있는 텍스처(함성 CarrierCraft 등)에선 선명도/질감 이득**이 시각적으로 크다.
- 따라서 권장: **글로우/플레어/항성 본체 = Lanczos로 충분**, **함성·폭발·전략맵 디테일 텍스처 = Real-ESRGAN**.
  비교 패널: `.omo/work/remaster/ai-sr-compare-carriercraft.png` (원본크롭 | Lanczos×2 | ESRGAN×4).
- 미리보기 PNG 16종: `.omo/work/remaster/ai-texture-overlay/data/image/_preview/`.

## 4. 배포 (백업 후 드롭인)

- 두 캐논 트리에 32 파일 배포(16×2): `client/dist/logh7-client/data/image` + `client/vendor/logh7-installed/data/image`.
- 원본 백업: `.omo/work/remaster/ai-texture-backup-2026-06-26/{dist,vendor}/` (512px 원본 보존 확인).
- 용량 증가 ~394MB(32bpp 비압축 대형 텍스처). 패키지 비대 주의 — 선별 배포 권장.

## 5. CPU 속도 / 전수 계획

- 512² → 2048²: **약 32s/장**, 256²: ~8s, 1024×768: ~94s. 16종 총 ~9분.
- 전수(수백~수천 텍스처) CPU는 비현실적(장당 30s). 계획:
  1. **선별 우선**(이번처럼 고가치 truecolor만) — 글로우는 Lanczos, 디테일만 ESRGAN.
  2. tile=256으로 메모리 안정(적용됨). 대형은 tile 유지.
  3. 전수 필요 시 CUDA GPU(또는 야간 배치) 권장. anime 모델은 셀/일러스트(초상화 Face/*.tcf 디코드본)에 시도 여지.

## 6. 라이브 렌더 대기

- 실클라 in-world 렌더 확인은 **#8 월드진입(스플래시 ~35초 포그라운드)** 경로로 별도 라이브 검증 필요.
  (전략맵 항성/그리드/effect가 실제로 고해상 텍스처를 끌어 쓰는지 ui_explorer 스크린샷으로 확인 대기.)

## 도구
- `RE/tools/logh7_ai_texture_sr.py` — `--list / --scale 4 / --model {x4plus,anime} / --only <부분일치> / --deploy`
