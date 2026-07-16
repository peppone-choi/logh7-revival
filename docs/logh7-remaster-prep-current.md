# LOGH VII 리마스터 준비 트랙 (현행)

작성: 2026-07-09  
목적: 원본 클라+자체 서버 **플레이 가능 루프와 병행**하되, 원본 자산을 덮어쓰지 않는 가역 리마스터 기반을 문서화한다.

## 2026-07-14 run9 판정

- SHA256 `825635783a9fb663ae3b9a2ecf8d4b74df648322256c57ee32f6426c42a23f22` 클라이언트에서 로그인 내부 644×484를 유지하고, 로그인 후 1920×1080 네이티브 레이아웃을 검증했다(창 캡처 1924×1084).
- `postlogin` 패치 59개는 `lobby-res` 8개 + layout 13개 + `charsel` 38개다. 로그인 화면 확대를 시도한 `login-native-layout` 33개는 제거했다.
- 이 결과는 **1080p 레이아웃 경로의 입증**이다. 고해상도 텍스처, 초상·아이콘 업스케일, 3D·이펙트·사운드 리마스터 완료를 뜻하지 않는다.
- in-place 패치에도 원본 백업, source-hash guard, rollback 경로를 유지한다.

## 원칙

| 규칙 | 설명 |
|---|---|
| 원본 fallback (R0) | `artifacts/logh7-install/**/data/` 및 CD 추출본은 **읽기 전용** |
| 산출물 분리 | 리마스터 결과는 `server/content/generated/*remaster*` 또는 별도 remaster 루트만 |
| provenance 필수 | 파일마다 원본 해시, 도구, 파라미터, 적용 위치 기록 |
| 정본 승격 금지 | 업스케일/AI 생성물을 “원본”으로 표기 금지 |
| 좌표/히트박스 | UI 좌표를 깨는 리마스터는 적용 보류 |

## provenance 등급

- **R0** 원본 무수정 fallback  
- **R1** 원본 파생 업스케일/정리  
- **R2** 수작업 교체  
- **R3** 생성/커뮤니티 placeholder  

## 원본 자산 인벤토리 (유저 설치 트리)

실경로 예 (InstallShield 추출 후 깨진 폴더명 가능):

```
artifacts/logh7-install/.../data/
  image/face/*.tcf          — 초상 TCF
  image/Thumbnail/Ship/*.tga
  image/spot/*.jpg          — 로비/스팟 배경
  image/gamemenu/title.tga
  image/medal/*.tga
  model/Ship/GE/*.mdx       — 제국 함선 (117 MDX 계열)
  model/strategy/*.mdx
  sound/bgm/*.ogg
  sound/se/*.wav
```

CD 원천: `artifacts/logh7-cd/Logh7.bin|.cue` (hash 검증 후 재추출).

## 1차 리마스터 백로그 (플레이 루프 안정 후)

1. **초상** — TCF 디코드 → 4x 업스케일(`image-upscaling`) → face id 매핑 유지  
2. **함선 썸네일** — TGA 바이트카피 매니페스트 고정 → R1 업스케일  
3. **UI/스팟 배경** — title.tga, bg005.jpg 등 640×480 앵커 유지  
4. **제국 문장/메달** — `docs/reference/remaster-art/` 기존 mining 문서 계승  
5. **폰트 가독성** — GDI 슬롯 패치와 병행 (한글화 트랙)

## 매니페스트 스키마 (초안)

```json
{
  "packId": "remaster-hd-v0",
  "enabled": false,
  "assets": [
    {
      "id": "title.tga",
      "originalPath": "data/image/gamemenu/title.tga",
      "originalSha256": "...",
      "outputPath": "generated/remaster/title-4x.png",
      "grade": "R1",
      "tool": "image-upscaling",
      "params": { "scale": 4 },
      "rollback": "use originalPath"
    }
  ]
}
```

## 스킬 라우팅

| 작업 | 스킬 |
|---|---|
| 원본 업스케일 | `image-upscaling` |
| 플레이스홀더 2D/3D | `game-assets` / `game-3d-assets` / `meshyai` (승인 시에만) |
| 브라우저 미리보기 | `game-engine` (런타임 대체 금지) |

## 완료 조건 (리마스터 팩)

- [ ] 원본 asset manifest + remaster manifest 동시 존재  
- [ ] 자산마다 원본 해시·도구·파라미터·적용 위치  
- [ ] 실클라 또는 플레이어블 루프에서 깨짐 없는 스크린샷  
- [ ] 기본 off, 플래그로만 활성  

## 현재 상태

run9에서 로그인→월드→두 클라이언트 이동 반영→재로그인·서버 재시작 영속까지 통과했다. 리마스터는 여전히 준비 단계이며, 완료된 것은 1080p 네이티브 레이아웃 경로다. 에셋 일괄 업스케일과 고해상도 texture 교체는 미착수다.
