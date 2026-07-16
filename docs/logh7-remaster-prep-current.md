# LOGH VII 리마스터 준비 트랙 (현행)

작성: 2026-07-09 (현행화: **2026-07-16**)
목적: 원본 클라이언트+자체 서버 **플레이 가능 루프와 병행**하되, 원본 자산을 덮어쓰지 않는 가역 리마스터와 엔진 중립 장기 재이식 기반을 문서화한다. 원본 클라이언트는 계속 1차 제품 경로이자 호환 오라클이다.

## 현재 판정과 재검증 한계

- 2026-07-14 run9 기록은 SHA256 `825635783a9fb663ae3b9a2ecf8d4b74df648322256c57ee32f6426c42a23f22` 클라이언트에서 로그인 내부 644×484를 유지하고 로그인 후 1920×1080 네이티브 레이아웃을 관측했다고 판정했다(창 캡처 1924×1084).
- `postlogin` 패치 59개는 `lobby-res` 8개 + layout 13개 + `charsel` 38개다. 로그인 화면 확대를 시도한 `login-native-layout` 33개는 제거했다.
- 현재 checkout에는 run9/run3/run5 evidence directory와 run9 exact patch EXE/lineage receipt가 없다. 직접 확인 가능한 EXE는 `bd192...` 계열뿐이므로 위 판정은 완료 이력이지 현재 재현 가능한 gate가 아니다.
- 격리 Wine prefix에서 exact client lineage, screenshot, protocol/FSM trace, cleanup을 복구하기 전에는 1080p 경로를 새 변경의 기준선으로 인용하지 않는다. 고해상도 텍스처, 초상·아이콘 업스케일, 3D·이펙트·사운드 리마스터는 여전히 미완료다.
- in-place 패치에도 원본 백업, source-hash guard, rollback 경로를 유지한다.

## 원칙

| 규칙 | 설명 |
|---|---|
| 원본 fallback (R0) | `artifacts/logh7-install/**/data/` 및 CD 추출본은 **읽기 전용** |
| 산출물 분리 | 리마스터 결과는 별도 overlay/pack과 manifest에만 저장 |
| provenance 필수 | 파일마다 원본 해시, 도구, 파라미터, 적용 위치 기록 |
| 정본 승격 금지 | 업스케일/AI 생성물을 “원본”으로 표기 금지 |
| 좌표/히트박스 | UI 좌표를 깨는 리마스터는 적용 보류 |
| 기본 off | 모든 pack과 신규 client PoC는 기본 비활성, 명시적 feature flag로만 실행 |
| rollback | original fallback, patch receipt, output hash, 제거/복구 절차를 함께 검증 |
| 관측 분리 | PCAP/proxy는 host 계층, 게임·Win32 입력·Frida·렌더 acceptance는 Wine 계층 |

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

## 1차 리마스터 백로그 (복원과 병렬, 적용은 gate 뒤)

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
| 브라우저 미리보기/PoC | `game-engine` (원본 런타임 대체 금지) |

스킬·생성 도구의 산출물은 R1/R2/R3 provenance와 rights 상태를 남겨야 하며, 자동 생성만으로 게임 적용 후보가 되지 않는다.

## 장기 신규 클라이언트 선택 게이트

Unity로 미리 고정하지 않는다. 1차 비교는 Godot와 Unity가 같은 작은 전략 화면 PoC를 구현하고, Unreal은 같은 계약으로 전술·전투 렌더 수직 슬라이스를 구현한다. Stride와 Bevy는 현재 전체 제품 후보로 승격하지 않고 릴리스·도구 성숙도를 주기적으로 재평가한다.

공통 PoC 계약:

- server의 shared command/query/event/outcome DTO
- protocol과 분리된 asset manifest/loader 및 original fallback
- 동일 galaxy scene, unit marker, Warp 입력, outcome 렌더 fixture
- deterministic replay와 legacy client 관측 결과의 parity report

비교 rubric:

- protocol/domain parity와 테스트 자동화
- 2D UI, 3D 전략/전술, localization/IME, asset pipeline 적합성
- 지원 플랫폼, 배포 크기, 성능/메모리, 접근성
- 라이선스, 장기 유지보수성, 팀/도구 성숙도, migration 비용

후보별 역할은 사전 우승 판정이 아니다. Godot는 공개형 2D/3D 전략 UI 기준점, Unity는 C#·상용 생태계 기준점, Unreal은 고품질 전술 렌더 기준점으로 같은 fixture를 측정한다. 엔진별 서버 분기 수는 0이어야 하며, replay 결과가 다르면 엔진 기능 개발보다 shared contract 불일치를 먼저 고친다.

선택 전에는 삭제된 `client-unity/` 경로와 오래된 generated manifest를 활성 제품 계약으로 복원하지 않는다. 신규 클라이언트는 legacy client를 폐기하는 조건이 아니라 같은 서버 snapshot과 command/event 의미를 재현하는 별도 adapter다.

## 적용·검증 계층

1. host 계층에서 overlay manifest/hash와 proxy/PCAP byte parity를 검증한다.
2. 격리 Wine 계층에서 로그인 644×484 → 본게임 1920×1080, lobby/world/dialog/strategy/tactical, 9-slice, 입력, 폰트/IME, D3D8 렌더를 확인한다.
3. original 대 remaster A/B에서 client/proxy/server protocol/FSM trace가 동일하고 screenshot/metric만 의도대로 달라야 한다.
4. 실패 시 feature flag off와 rollback recipe로 R0 원본 상태를 복구한다.

## 완료 조건 (리마스터 팩)

- [ ] 원본 asset manifest + remaster manifest 동시 존재  
- [ ] 자산마다 원본 해시·도구·파라미터·적용 위치  
- [ ] 격리 Wine의 original/remaster A/B에서 깨짐 없는 스크린샷과 동일 protocol/FSM trace
- [ ] 기본 off, 플래그로만 활성  
- [ ] rollback 후 R0 hash·화면·동작 복귀

## 현재 상태

run9의 1080p 및 두 클라이언트 판정은 완료 이력으로 유지하지만 현재 checkout에서는 evidence/EXE lineage 부재로 재검증할 수 없다. 리마스터는 준비 단계이며 에셋 일괄 업스케일과 고해상도 texture 교체, shared contract PoC, engine 비교는 미착수다. 다음 실제 적용은 P0 격리 Wine/lineage/evidence와 P1 client+proxy+server correlation을 통과한 뒤에만 한다.
