# LOGH VII 리마스터 갭 감사 — UI/HUD/이미지/모델 (2026-06-26)

레퍼런스(원본 UI 134장: `docs/reference/ui-catalog/`, 서술 `docs/logh7-reference-visual-catalog-2026-06-25.md`)와
현재 캐논 클라 에셋(`client/dist/logh7-client/data/image/`, `.../model/`)을 전수 대조.

> 핵심 판정: **원본 에셋은 전부 보유**(누락 0). 리마스터(고해상도화)는 거의 미배포.
> `.omo/work/remaster/hud-overlay/`에 HUD 20종 2배 업스케일본이 **존재하나 클라에 미배포** → 배포 리마스터 = 사실상 0%.

---

## 0. 측정 사실 (P0 — 바이트/헤더 확인)

| 항목 | 값 | 출처 |
|---|---|---|
| 레퍼런스 원본 스크린샷 | 134장 (4gamer 35·toshichan 팬·gamemeca 12·impress·itmedia·dengeki) | `ui-catalog/CATALOG.md` |
| 클라 image/ 파일 | 795 (tga 652·bmp 72·jpg 45·png 16·tcf 7) | `find` |
| 클라 image TGA bpp | 8bpp **476** / 32bpp 173 / 24bpp 3 | tga 헤더 |
| 모델 | mdx 406·mds 12 / 함선 MDX 261 / 텍스처 BMP 921 (Hi/Mid/Lo LOD 각 ~307) | `find` |
| 모델 텍스처(Hi) 해상도 | 512² 116·512×256 71·1024² 25·… **거의 전부 8bpp 페일렛** | bmp 헤더 |
| 초상화 | TCF 7종(gem/gef/gam/gaf/o/oam/oem, 원본 압축) | `image/Face/` |
| 기존 업스케일본 | HUD **20종** `.omo/work/remaster/hud-overlay/` (8bpp 512² → **32bpp 1024² RGBA**) — **미배포** | tga 헤더 대조 |

업스케일 검증례: `window/system_window.tga` = 원본 512×512 8bpp / 오버레이 1024×1024 32bpp / **현재 배포본은 여전히 512×512 8bpp**.
(주의: 배포본의 32bpp TGA 173종은 *업스케일이 아님* — 원본과 동일 해상도의 RGBA 원본 에셋, 예 `icon_kj/com_window.tga` 358×112 그대로.)

---

## 1. 카테고리별 현황표 (레퍼런스 ↔ 현재)

| 카테고리 | 레퍼런스 근거 | 현재 에셋(보유) | 리마스터 배포% | 방법 | 우선순위 |
|---|---|---|---|---|---|
| **HUD/UI 텍스처 (TGA)** | compnel1-3 커맨드윈도우·stay 기지패널·strategy 전략맵 HUD (toshichan) | window/·icon_*/·senryaku_panel/·soukan/·rader/ (8bpp 476종) | **~0%** (20종 2x 업스케일본 미배포) | ① 20종 즉시 배포(드롭인 완성품) ② 나머지 ~456종 8bpp→2x 업스케일(ESRGAN/Real-ESRGAN, 페일렛이라 깔끔) | **P0** |
| **함선/전투기 모델 (MDX+텍스처)** | uu1 3D 브륀힐트·en001/004/008 전술전투 함선 | MDX 261·텍스처 921(Hi/Mid/Lo) 8bpp 256–1024² | **0%** | 텍스처 8bpp→AI 업스케일(메시 불변, BMP 교체만). 메시 재생성은 불요(원본 폴리곤 충분) | **P1** |
| **배경/성운/우주 (Field/Space/effect)** | strategy.jpg 전략맵 배경·en10101010 우주전투 성운 | effect/(45)·model/Space/·Field/ | 부분(effect 32bpp 원본) | 성운/배경 jpg·tga 2x 업스케일 + 생성형 보강 가능 | **P1** |
| **초상화 (TCF)** | uu3 집무실 인물초상화·직무카드 | Face/*.tcf 7종(489장 디코드 완료) | 0% | TCF 디코드→PNG→AI 얼굴 업스케일(GFPGAN/얼굴 특화)→재인코드 or 클라 PNG 경로 | **P2** |
| **타이틀/로고/메뉴** | gamemenu 타이틀 화면 | gamemenu/(title*·logo) 301KB 8bpp | 일부 한글타이틀 교체됨 | title_korea.tga 존재(현지화). 고해상도 재생성 권장 | **P2** |
| **아이콘셋 (icon_*)** | 커맨드/직무 아이콘 | icon_normal/down/kj/mover/… ~500종 16–32² | 일부 32bpp 원본 | 소형이라 업스케일 효과 낮음. 생성형 재드로잉 선택 | **P3** |
| **훈장/메달 (Medal)** | — | Medal/(30) | 0% | 저우선 | **P3** |

---

## 2. 방법론 / 한계

- **8bpp 페일렛 TGA/BMP (대다수)**: 업스케일에 가장 적합. 페일렛이라 노이즈 적고 Real-ESRGAN 2x/4x가 깨끗. 기존 HUD 20종이 검증 사례(8bpp 512²→32bpp 1024²).
- **업스케일 한계**: 순수 SR은 디테일을 *창작*하지 못함(저해상 원본의 정보 한계). HUD 프레임·텍스트 바는 SR로 충분하나, **함선 디테일/성운/배경**은 생성형(img2img, ControlNet tile) 보강이 시각적 효과 큼.
- **생성형 도구 필요 항목**: ①성운/우주 배경(strategy.jpg, 성운 텍스처) ②함선 헐 텍스처 디테일 ③초상화 얼굴 복원(GFPGAN). 순수 SR로 충분: HUD 프레임/패널/아이콘.
- **배포 경로**: 모두 드롭인(클라 `data/image/`·`data/model/images/` 파일 교체). EXE 무침습. 32bpp 변환은 클라 TGA 로더가 이미 32bpp 처리(배포본에 32bpp 173종 존재 = 호환 확인).

---

## 3. 즉시 실행 가능 (이미 만들어진 자산)

`.omo/work/remaster/hud-overlay/data/image/` 의 20종 2x HUD 업스케일본을 `client/dist/logh7-client/data/image/` 동일 경로에 드롭인하면
배포 HUD 리마스터가 0%→해당 20종 100%. **단 라이브 검증 필수**(클라 1024² 32bpp 로드·UV 정합 확인 — 미검증).

---

## 4. 미해결 / 주의

- 20종 HUD 오버레이는 **라이브 미검증**(클라가 2배 텍스처를 올바른 UV로 렌더하는지 미확인). 추측을 P0 승격 금지 — 배포 전 `logh7-live` 1회.
- 모델 텍스처 업스케일은 메시 UV가 0–1 정규화면 해상도 무관하게 안전(일반적). MDX UV 좌표계 확인 후 진행.
