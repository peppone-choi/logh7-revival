# 함선/디테일 텍스처 Real-ESRGAN SR + 3트리 배포 (2026-06-26)

## 목표
ESRGAN이 Lanczos보다 이득인 *디테일* 텍스처(함체 UV 아틀라스·범프맵)를 Real-ESRGAN으로
신경망 초해상하여 원포맷(BMP) 보존 재인코딩 → 3트리 드롭인 배포. 글로우/평활은 제외.

## 대상 선정 (디테일 vs 글로우)
함선 텍스처는 `data/model/images/{Hi,Mid,Lo}` 에 LOD별로 존재. Hi LOD 기준:
- **디퓨즈 함체 아틀라스 130장** (`EH/EM/FH/FM###[_i##].bmp`) — 제국/동맹 함선 함체 UV 아틀라스.
  패널라인·그리블·휘장이 살아있는 하드엣지 디테일 → ESRGAN 우위. 대부분 512×512/512×256, 8bpp 팔레트(mode P).
- **범프맵 48장** (`*_BUMP.bmp`) — 그레이스케일(mode L) 함체 디테일. ESRGAN 우위.
- 합계 **178장** = SR 대상.

### ★제외(Lanczos 우위라 본 작업 대상 아님)
- 항성 글로우 `fs*` / `fs_glow_*`, 렌즈플레어 `lens/`, `BackLight`, 평활 광원/플레어.
  이들은 부드러운 방사형 그라디언트라 신경망 디테일 환각이 오히려 해가 되고 Lanczos가 우위
  (정직: 글로우는 별도 LANCZOS 파이프라인 `logh7_remaster_hud_tga` / 패널 리마스터가 담당).

## 처리
- 도구: `tools/logh7_ship_texture_sr.py` (신규). Real-ESRGAN x4plus, CPU, tile=256, half=off.
- 배율: **scale 2** (512→1024, 256→512). max_dim 2048 캡. CPU에서 scale 4(2048²)는 장당 ~3분이라
  가시 이득 대비 비용이 커 scale 2 채택(장당 ~47초).
- P(팔레트)/L(그레이스케일) → RGB 변환 후 SR → **24bpp BMP** 재인코딩.
  D3DX8 `CD3DXImage` 는 content magic 으로 로드하므로 더 큰 치수·다른 bpp 드롭인 가능
  (2026-06-26 패널 리마스터 8bpp→32bpp 드롭인 선례로 검증됨).

## ★소스 오염 함정(해결)
라이브 트리(`.omo/work/logh7-installed`)는 배포 *대상*이면서 동시에 잠재 소스라,
1차 시도에서 smoke 배포가 소스를 덮어써 배치가 이미 1024로 업스케일된 이미지를 또 2048로
재업스케일하는 오염이 발생(로그 `1024x1024->2048x2048`로 적발). 해결:
- 배포 대상이 아닌 **프리징 소스 스냅샷** `.omo/work/remaster/ship-texture-source-2026-06-26/Hi/` 178장 생성,
  도구가 여기서만 읽도록 고정. 오염된 EH001은 백업에서 복원.

## 백업 (필수, P0 무손상)
- `.omo/work/remaster/ship-texture-backup-2026-06-26/{dist,vendor,live}/Hi/` — 배포 전 원본 자동 보존.
- 프리징 원본 스냅샷 `.omo/work/remaster/ship-texture-source-2026-06-26/Hi/` 178장(8bpp/L 원본).

## 3트리 배포
1. `client/dist/logh7-client/data/model/images`
2. `client/vendor/logh7-installed/data/model/images`
3. `.omo/work/logh7-installed/data/model/images`  ← **라이브 트리**

## before/after
- `docs/img/logh7-ship-texture-sr-EH001-before-after.png` (좌: 원본 NN, 중: Lanczos 2x, 우: ESRGAN 2x).
  ESRGAN이 함체 외곽선을 매끈하게 재구성(Lanczos 계단현상 제거)·추진기 노즐 링 선명화·
  좌상단 휘장 텍스트 가독성 회복 = 디테일 텍스처에서 ESRGAN 이득 확인.

## 라이브 검증 (대기)
- 자산은 D3DX8 content-magic 로드라 EXE/코드 수정 불필요(드롭인). 라이브 함선 렌더 검증은
  실클라 전술맵 진입 블로커(월드진입 포그라운드 스플래시)에 게이트됨 → **라이브 대기**.
  배포물은 3트리 모두 반영 완료, 다음 실클라 기동 시 함선 텍스처가 자동 적용됨.

## 결과 수치
- (배치 완료 후 `result.json` 에서 자동 기록: upscaled / total_min / deploy.deployed)
