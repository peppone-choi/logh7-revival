# 전수 텍스처 리마스터 스윕 — 2026-06-26

저장소 `E:/logh7-revival`. `client/dist/logh7-client/data/image`(+model) 전수 텍스처를
열거→잔여 식별→Lanczos/ESRGAN 분리 업스케일→3 배포 트리(dist/vendor/.omo 라이브)에
백업 후 드롭인 배포. 추측 P0 금지, 모든 산출 byte-magic 검증.

## 1. 전체 텍스처 열거

`data/image` 하위 전체 이미지(tga/bmp/png/jpg) **785개**.
- tga 652 · bmp 72 · png 16 · jpg 45
- model textures: `data/model`은 .mdx(406)/.mds/.dat 등 지오메트리·바이너리이며 별도 이미지
  텍스처를 트리에 노출하지 않음(이미지 텍스처는 전부 `data/image`에 존재) → 이미지 트리가 전수 대상.

이미 리마스터(누적, 트리 내 존재): **76개** = HUD 20(`logh7_remaster_hud_tga --set hud`)
+ 패널 40(`--set panel`) + AI텍스처 16(`logh7_ai_texture_sr` HIVALUE_SET).
(함선 178·초상화 416은 `data/image` 밖 Face/TCF·model 트랙으로 별집계, 본 스윕 범위 외.)

## 2. 잔여 식별 (tga/bmp 648개 → 업스케일 대상 240개)

| 분류 | 수 | 처리 |
|---|---|---|
| ≤32px 아이콘 글리프(icon_*, icon_none 등) | **408** | **스킵**(업스케일 무의미, 기록만) |
| >32px 업스케일 대상 | **240** | 업스케일 |

업스케일 대상 240개 색심도: 8bpp 팔레트 175 · 24bpp 49 · 32bpp 16.
치수 버킷(최대변): ≤128px 199 · ≤256px 27 · ≤512px 12 · ≤1024px 2.

## 3. 업스케일 (Lanczos / ESRGAN 분리)

라우팅 근거(정직): 글로우·평활·UI프레임·아이콘·썸네일·메달·성운글로우 = **Lanczos 우위**;
폭발·구름·전투배경 등 디테일 = **ESRGAN**. 단 ESRGAN은 PIL 가독(BMP/type-2 TGA)만
가능(8bpp 팔레트 TGA는 자체 디코더 경유 Lanczos 전용).

### Lanczos 2x — 220개 (0 에러)
도구: `tools/logh7_remaster_sweep_2026_06_26.py`(신규). TGA type-1(8bpp 팔레트)/type-2 자체
디코드 + BMP/PNG PIL, Lanczos 2x + 언샤프(r1.2/70%), **원포맷 드롭인**(TGA→type-2 32bpp,
BMP→24bpp, PNG→PNG). 2048² 캡(초과 시 1x).
- Thumbnail 130(행성/인물 64·36px→2x) · Medal 15(80→160) · effect 글로우/플레어/스러스터/빔 25
  · Field 9 · strategy 7 · lens 5(렌즈플레어) · icon_*(>32px) 16 · Face 2 · rader/trush/soukan/
  gamemenu/senryaku_panel 6.

### ESRGAN x4(2048 캡, RealESRGAN_x4plus, CPU) — 20개 (0 에러)
도구: `tools/logh7_remaster_sweep_esrgan_2026_06_26.py`(신규, `logh7_ai_texture_sr` 재사용).
- effect 폭발 16(`exp_b/c/e/f/g`·`f_exp` 512→2048, `*_low` 256→1024, `exp_a_low`)
  · map_obj 구름 2(256→1024) · planetbattle 전투배경 2(120→480) · Stream/ImageA 1(128→512).
- outscale 동적: 512px=4x→2048(캡 정합), 256px=4x→1024, 120px=4x→480.

## 4. 스킵 / 실패

- 스킵 **408**(≤32px 아이콘 글리프) — 업스케일 시 게이밍 이득 없음, 원본 유지.
- 실패 **0**(Lanczos 0 / ESRGAN 0).
- 이미 리마스터로 제외 76(중복 작업 방지).

## 5. 3 트리 배포 + 백업

배포 트리(원본 존재 시에만 드롭인, 신규 생성 안 함):
1. `client/dist/logh7-client/data/image`
2. `client/vendor/logh7-installed/data/image`
3. `RE/.omo/work/logh7-installed/data/image` ★라이브

- Lanczos: 220×3 = **660** 배포 / ESRGAN: 20×3 = **60** 배포 / **합 720**.
- 백업: 덮어쓰기 전 원본을 트리별 네임스페이스로 보존
  `RE/.omo/work/remaster/sweep-original-backup-2026-06-26/{dist,vendor,live}/` — **각 240개(720)**.
- 패키지 비대: Lanczos +136MB, ESRGAN +320MB(2048² 폭발 BMP 16종이 대부분).
  2048² 캡 준수, 그 이상 확대 없음.

## 6. 검증 (byte-magic + 치수)

라이브 트리 샘플 디코드 확인:
- `effect/beam.tga` → 128x64@32bpp type-2 ✓
- `Thumbnail/Planet/ip000.tga` → 72x72@32bpp type-2 ✓
- `Medal/m_f001.tga` → 160x160@32bpp ✓
- `effect/ef_thruster01.bmp` → 256x256@24bpp BM ✓
- `effect/exp_b.bmp` → 2048x2048@24bpp BM(ESRGAN) ✓
- `map_obj/mo_cloud01.tga` → 1024x1024@32bpp(ESRGAN) ✓

## 7. 누적 리마스터 커버리지

- `data/image` 785개 중 **316개 리마스터**(76 기존 + 240 본 스윕) = **40%**.
- 비-tiny 적격 텍스처 기준 **~84%**(나머지 408은 ≤32px 아이콘으로 의도적 원본 유지).

## 8. 라이브 대기

본 스윕은 에셋레벨 드롭인(D3DX8 content-magic 로드)이라 EXE/코드 무수정.
라이브 검증(`logh7-live`)은 ★월드진입 좌표 블로커(#8 / 입력 레이어)와 무관하게
전략맵·HUD·effect 렌더 시 향상된 텍스처가 표시되는지 실클라 스크린샷으로 확인 대기.
백업으로 즉시 롤백 가능(`sweep-original-backup-2026-06-26/`).
