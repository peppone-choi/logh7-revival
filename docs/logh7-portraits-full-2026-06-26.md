# 전체 초상화 GFPGAN 복원 + 제자리 배포 (전수) — 2026-06-26

선행: `docs/logh7-ai-portrait-gfpgan-2026-06-26.md` (19장 검증·파이프라인 확립).
이번 작업 = 나머지 전수 복원 + native 재패킹 + 3트리 드롭인 + 무결성 검증.

## 1. 복원 (GFPGAN v1.4, CPU)

- 환경: torch 2.12.1+cpu, gfpgan + facexlib (functional_tensor shim 적용됨, 재현 확인).
- 대상: `artifacts/portrait-gfpgan/_all_raw`의 416 디코드 셀 중 **이미 한 19 제외 나머지 397**.
- 도구: `RE/tools/logh7_portrait_gfpgan.py --indices <397개>` (arch=clean, ch_mult=2, upscale=2,
  bg_upsampler=None, only_center_face=True) → 128x160 복원 PNG → `artifacts/portrait-gfpgan/_gfp_stage`.
- 결과: **`DONE restored=397/397`**. no-face(검출 실패) **0건**.
  RetinaFace 가 스타일라이즈드(애니풍) 초상화 전수에서 안정 검출 (19장 베이스라인과 동일).
- **누적 복원 = 416/416** (19 + 397). `artifacts/portrait-gfpgan/after`에 416장 집결.

## 2. 비-얼굴(non-face) skip — 정직 보고

- GFPGAN no-face skip = **0건**. TCF 디코더의 strict dim 게이트(`18+1024+w*h==len`)가 이미
  비-초상 리전(엠블럼 등 비정형)을 416 집합 단계에서 배제했기 때문. 416 셀은 전부 인물 초상.
- 단, 416 중 **4셀은 64x80 이 아닌 native 소형 셀**(엠블럼 아님, 폭이 좁은 초상):
  slot 7/74/120 = **63x80 (6082B)**, slot 130 = **62x80 (6002B)**. 전부 oem.tcf.
  → 고정 6162B in-place 경로로는 길이가 안 맞아(byte 불변 위반) 통상 배치에서 제외 후
  **native 치수로 별도 인코딩**(`encode_region(img, w, h)`)해 정확히 같은 byte 길이로 재패킹.
  = 실질 skip 0, 4셀은 native-dim 경로로 흡수.

## 3. 재패킹 + 3트리 드롭인

- 백업(필수): `Face.bak-gfpgan-20260626-055248` 3트리 전부 생성(각 8파일).
- 통상 412셀: `scripts/logh7_repack_gfpgan_inplace.py`
  (GFPGAN 128x160 → LANCZOS 64x80 다운스케일 → `encode_region` 6162B byte-exact →
  소유 atlas 슬롯 제자리 덮어쓰기, hed/atlas 길이 불변) → **RESULT: ALL PASS**.
- native 4셀: 전용 패치로 63x80/62x80 인코딩 → 동일 byte 길이 제자리 교체 → **ALL PASS**.
- 3트리: `.omo/work/logh7-installed`(라이브), `client/vendor/logh7-installed`, `client/dist/logh7-client`.

## 4. 무결성 검증 (3트리)

각 트리에서:
- `len_invariant=True` (7 atlas + tcf.hed 파일크기 백업과 동일)
- `hed_identical=True` (tcf.hed 바이트 완전 동일 = 오프셋/사이즈 전부 불변)
- `decodable=416` (전체 슬롯 디코드 라운드트립 성공, 치수 정확)
- `atlases_modified=4/7` (gem/gam/gef/oem = 416 슬롯 보유; gaf/o/oam 미수정 = hed 매핑 정합)
- **INTEGRITY: ALL PASS** (3트리 전부)

## 5. CPU 시간

- 397장 복원 ≈ **9분** (~1.3s/장, 검출+복원+업스케일). 모델 로드 별도.
- 재패킹·검증 = 수초.

## 6. 화질 / 제약 (정직)

- 클라 렌더가 64x80(또는 native) 8bpp/256색 고정이라 **2x 업스케일 이득은 다운스케일에서 소실**.
  남는 이득 = 팔레트 밴딩/지터 감소(소). 고해상도 도약은 셀크기/UV/캡 EXE 패치(B안) 필요·미착수.
- 글로우 효과는 Lanczos 우위(메모): GFPGAN 은 얼굴 디테일 샤픈에 한정. 환각/얼굴변형 없음 = 캐논 보존.

## 7. 라이브 대기

- 본 작업 = 오프라인 복원·재패킹·무결성까지. **실클라 렌더 비교 미수행(대기)**.
- 권장: `logh7-live` ui_explorer(스플래시 ~30초 대기)로 캐릭터 스테이터스/집무실 uu3 패널 초상 렌더
  before/after 비교. 회귀 시 `Face.bak-gfpgan-20260626-055248` 복원.

## 산출물
- `artifacts/portrait-gfpgan/after/*.png` (416 복원 128x160), `_gfp_stage`(397), `_oddsize`(4 native).
- 3트리 `data/image/Face/{gem,gam,gef,oem}.tcf` 갱신 + 백업.
- 도구: `RE/tools/logh7_portrait_gfpgan.py`, `scripts/logh7_repack_gfpgan_inplace.py`, `RE/tools/logh7_tcf_pack.py`(encode_region).
