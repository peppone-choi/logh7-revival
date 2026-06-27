# LOGH VII 오리지널 인물 ↔ 포트레잇 인덱스 레지스트리 (독립 실행본)

협업용 단독 도구. **`logh7_face_registry.py` 한 파일 + 로스터 JSON** 만 있으면 됩니다.
Python 3.10+ (표준 라이브러리만, 추가 설치 불필요).

## 무엇을 하나
은하영웅전설 VII의 **얼굴(face) 코드 ↔ 캐릭터** 매핑을 관리합니다. 게임의 face 값은 복합 인코딩:

```
face = (O/G)×1,000,000 + (E/A)×100,000 + (M/F)×10,000 + 로컬인덱스
아틀라스: oem oam o (O군=원작 전용)  /  gem gef gam gaf (G군=플레이어 생성용)
```

- **O군(oem/oam/o)** = 오리지널(canon) 캐릭터 얼굴. 캐릭터 생성 피커엔 **안 나옴** → 원작 인물 전용.
- **G군(gem/gef/gam/gaf)** = 플레이어가 생성 시 고르는 얼굴(자기 진영·성별).

협업 포인트: **O군 슬롯마다 어떤 원작 인물인지 + 한글 이름(name_kr)을 채우는 것**.

## 사용법
```bash
# 현황
python logh7_face_registry.py --roster roster.json stats
python logh7_face_registry.py --roster roster.json --face-dir <Face_폴더> stats   # 실아트 개수까지

# 목록 (O군=원작, G군=플레이어)
python logh7_face_registry.py --roster roster.json list --group O
python logh7_face_registry.py --roster roster.json list --atlas oam

# 한글 이름 배정(협업 핵심) — atlas_slot 예: oam_0274
python logh7_face_registry.py --roster roster.json set-name oam_0274 "양 웬리"

# 플레이어 생성 face 검증(서버용): G군+진영/성별 일치만 통과
python logh7_face_registry.py --roster roster.json validate 1000005 --faction empire --sex male

# 서버 주입용 export (O군 calibrated face-code)
python logh7_face_registry.py --roster roster.json export --out canon-face-registry.json
```

## 로스터 JSON 형식
프로젝트 `content/character-roster.json` 과 호환:
```json
{ "characters": [
  { "name_ja": "ヤン", "name_kr": null, "name_romaji": "Yang Wen-li",
    "faction": "alliance", "atlas_slot": "oam_0274", "face_value": 274,
    "portrait_confidence": "proven" }
] }
```
`set-name` 은 이 파일의 `name_kr` 을 채워 그 자리에 다시 씁니다.

## 알려진 한계
- `atlas_slot` 인덱스는 **글로벌 tcf.hed 슬롯 번호**입니다. per-atlas 로컬 인덱스 캘리브레이션이 끝난 슬롯만 `face_code` 가 계산되고(stats의 withFaceCode), 나머지는 `needs_calibration`. 라이브 클라 렌더로 캘리브레이션하면 전수 변환 가능.
- 초상화 이미지 디코드는 포함 안 함(레지스트리 관리 전용). 이미지가 필요하면 프로젝트의 `tools/logh7_tcf_decode.py` 사용.

## (선택) 단일 실행파일(.exe)
```bash
pip install pyinstaller
pyinstaller --onefile logh7_face_registry.py     # dist/logh7_face_registry.exe
```
