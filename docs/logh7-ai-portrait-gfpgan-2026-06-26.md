# AI 초상화 얼굴복원 (GFPGAN) — 캐릭터 초상화 리마스터

날짜: 2026-06-26
산출 도구: `RE/tools/logh7_portrait_gfpgan.py` (신규), 기존 `RE/tools/logh7_tcf_decode.py` / `logh7_tcf_pack.py`
가중치: `RE/weights/GFPGANv1.4.pth` (332MB, TencentARC v1.3.0 릴리스)
산출물: `artifacts/portrait-gfpgan/{_all_raw,before,after,compare_sheet.png,zoom_209.png,tcf_roundtrip_209.png}`

## 1. GFPGAN 설치 — 성공 (정직 보고)

환경: Python 3.11.0, torch **2.12.1+cpu**(CUDA 없음=CPU 추론), pip 22.3.

설치 단계와 함정:
1. **torchvision 부재** → torch 2.12.1 짝 버전 `torchvision==0.27.1+cpu` 설치
   (`--index-url https://download.pytorch.org/whl/cpu`). 메모에 적힌 "0.27.1 설치됨"과 달리 실제로는
   미설치 상태였고 새로 설치함.
2. `pip install gfpgan` → gfpgan + basicsr + facexlib + realesrgan 의존성 설치.
3. **★알려진 함정 재현**: `import gfpgan` 시
   `ModuleNotFoundError: No module named 'torchvision.transforms.functional_tensor'`
   (basicsr/degradations.py 가 제거된 경로를 하드코딩).
   **해결 = shim 모듈 생성**:
   `site-packages/torchvision/transforms/functional_tensor.py` 에
   `from torchvision.transforms.functional import rgb_to_grayscale` 재노출. (1줄)
   → `from gfpgan import GFPGANer` 클린 임포트 확인.
4. 첫 구동 시 facexlib 가 검출/파싱 모델 자동 다운로드
   (`detection_Resnet50_Final.pth` 104MB, `parsing_parsenet.pth` 81MB → `RE/gfpgan/weights/`).

CPU 추론 속도: 초상화 1장 ~수초(검출+복원+업스케일). 소수 검증엔 충분, 전수(416장)는 수십 분 예상.

## 2. 초상화 복원 — 19장 검증 (전부 성공)

파이프라인: `Face/*.tcf` → `logh7_tcf_decode dumpall`(416장 PNG, 64x80) →
`logh7_portrait_gfpgan`(GFPGANer: arch=clean, channel_multiplier=2, upscale=2, bg_upsampler=None,
only_center_face=True) → 복원 PNG **128x160**.

- 앵커(원작 식별 가능): Reinhard(209), Yang(206), Schenkopp(85) — 전부 얼굴 검출 성공·복원.
- 아틀라스 전역 스프레드 16장 추가 → **16/16 복원** (`DONE restored=16/16`).
- 얼굴 검출 실패(no-face) 0건. 스타일라이즈드(애니풍) 초상화에도 RetinaFace 가 안정 검출.

품질(육안, `compare_sheet.png` / `zoom_209.png`):
- **명확한 개선**. 원본 64x80 8bpp 의 팔레트 밴딩·계단 픽셀이 매끄러운 피부/머리 그라데이션으로 정리,
  눈·입 디테일 샤픈. **원작 라인아트 정체성·애니 화풍 보존**(환각/얼굴변형 없음).
- AI 복원이 캐논 인물 외형을 바꾸지 않음 = 리마스터 용도로 안전.

## 3. TCF 재인코딩 / 배포 가능성

**재인코딩 도구 이미 존재**: `RE/tools/logh7_tcf_pack.py` (decode 의 역함수, 바이트정확 검증됨).
GFPGAN 출력을 native 64x80 로 다운스케일 → `encode_region()` 로 **6162B 리전 바이트정확 인코딩 확인**.

★핵심 제약(정직): **TCF = 8bpp 팔레트(256색) 고정 64x80 셀**. 클라는 이 셀 크기로 렌더한다.
- 따라서 배포하려면 복원본을 **64x80 + 256색으로 되돌려야** 한다 → **2x 업스케일 이득은 소실**.
- 단, native 해상도로 되돌려도(`tcf_roundtrip_209.png`) 밴딩/지터 감소분은 **일부 잔존** = 제자리
  소폭 개선은 가능. 큰 화질 도약(고해상도)은 클라 렌더가 64x80 고정이라 불가 — 더 큰 셀 렌더는
  face-atlas 캡/스트라이드(`G_ATLAS`/`O_ATLAS`, FUN_005924c0) 및 렌더 좌표 deep-RE 필요.

배포 경로 2안:
- **A. 제자리 리마스터(저위험)**: 복원 → 64x80/256색 → `logh7_tcf_pack add --in-place` 로
  G/O 아틀라스 슬롯 덮어쓰기 + tcf.hed 갱신. 백업 후 설치본 3곳
  (`.omo/work/logh7-installed`, `client/vendor/logh7-installed`, `client/dist/logh7-client`)에 드롭인.
  이득=밴딩 감소(소). **라이브 미검증(대기)**.
- **B. 고해상도(고위험)**: 128x160 셀 렌더 = 아틀라스 셀크기/UV/캡 EXE 패치 + 라이브. 미착수.

## 4. 라이브 대기

이번 작업은 **오프라인 파이프라인 검증까지**. 실클라 드롭인 적용·렌더 확인은 미수행
(`logh7-live` ui_explorer, 스플래시 ~30초 대기 절차). 권장 다음 단계: 앵커 3장만 A안으로 패킹→
설치본 백업→드롭인→라이브 초상화 렌더 비교(캐릭터 스테이터스/집무실 uu3 패널).

백업: 원본 TCF/hed 무수정(덤프는 읽기전용). 패킹 적용 전 `Face/` 전체 백업 필수.
