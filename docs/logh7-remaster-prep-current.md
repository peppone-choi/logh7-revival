# LOGH VII 리마스터 준비 트랙 (현행)

작성: 2026-07-09  
목적: 원본 클라+자체 서버 **플레이 가능 루프와 병행**하되, 원본 자산을 덮어쓰지 않는 가역 리마스터 기반을 문서화한다.

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

플레이어블 서버 최소 루프(로그인→월드→이동) 구현과 **병행 준비 문서** 단계.  
에셋 일괄 업스케일 실행은 루프 라이브 QA 이후 착수한다.
