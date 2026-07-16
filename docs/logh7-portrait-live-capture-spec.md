# LOGH VII 초상화 라이브-캡처 복원 스펙 (Windows 세션)

> 사라진 라벨 DB(서버)를 **살아있는 클라이언트 렌더러**로 역질문한다. replacement 서버(이 프로젝트)가 0x0323 캐릭터 레코드의 face 필드 @0xf4에 face값을 주입 → 원본 클라가 초상화를 렌더 → 캡처 → `tools/logh7_portrait_pixelmatch.py`(또는 `logh7_portrait_match.py`, 게이트판)로 디코드된 atlas(`.omo/work/portraits/NNNN.png`)와 픽셀 매칭. **AI vision 금지, 픽셀 증거만.**

## 0. 이 방법이 복원하는 것 / 못 하는 것 (정직)

- ✅ **face값 ↔ tcf 슬롯** 완전 맵 (렌더러 ground truth, sweep으로 전수).
- ✅ 서버의 현재 face 배정 **검증/교정** (§2의 버그 확인).
- ✅ Yang 등 생존 앵커의 **실제 프로토콜 face값** 확정.
- ❌ **이름 ↔ 초상화 바인딩의 대량 복원은 불가** — 그 매핑은 서버가 쥐고 있었고 소실됨. 캡처해도 *우리가 주입한* face가 렌더될 뿐, 원본 인물↔얼굴 배정을 되살리진 못함. 이름 앵커는 생존 공식 초상화 2장(Yang 확정, Schönkopp 모호)이 천장.

## 1. 선결 사실 (Mac측에서 이미 확정)

- 디코드된 atlas 416 슬롯: `.omo/work/portraits/NNNN.png` (`logh7_tcf_decode dumpall`).
- 생존 공식 초상화 2장: `chara/085.jpg`(Schönkopp), `chara/206.jpg`(Yang) — Wayback 전수확인, 이것뿐.
- **Yang 픽셀 확정**: 공식 `chara/206.jpg` → atlas 슬롯 **274** (NCC 0.918, 격차 0.19). = 유일한 hard name↔slot 앵커.
- **face-codec**(`src/server/logh7-face-codec.mjs`): face값 = 복합 자리수. `encodeFace(atlas,index)` / `decodeFace(n)`. atlas: oem/oam/o/gem/gef/gam/gaf, base {0,100000,10000,1000000,1010000,1100000,1110000}.

## 2. ⚠ 확인된 버그: chara번호 ≠ face값

서버 `logh7-content-adapter.mjs`는 공식 12 chara번호(`face-name-map.json`: Reinhard=209, Yang=206…)를 **그대로 portraitIndex(0x0323 face)로** 사용한다. 그러나 `decodeFace`로 12개를 돌리면 **전부 oem(제국)** 으로 디코드되고, 동맹 인물 6명(Yang/Cazerne/Schönkopp/Truniht/Negroponti/Rebelo)은 **진영 불일치 + cap(199) 초과**. → **chara번호는 gineiden 사진 파일명일 뿐 프로토콜 face값이 아니다.** 현재 서버는 canon 인물에 틀린/범위초과 face를 송출 중일 가능성이 높다. 라이브 캡처가 이를 확정한다.

## 3. 캡처 프로토콜 (Windows 세션)

**환경**: 계보가 검증된 `G7MTClient.exe`(CD/설치 원본은 sha `bd19263c`, `2848be76`은
그 원본의 13바이트 서버 주소 슬롯을 loopback으로 바꾼 프로젝트 생성물이며 공식 2004 업데이트본이
아니다 — `docs/logh7-client-lineage-current.md` 참조) + replacement 서버.

### 3a. face 주입 지점
`buildInformationCharacterRecordInner`(724B, `logh7-info-records-static.mjs`)의 **face 필드 @0xf4**. 현재 `login-session.mjs`가 `worldChar.portraitIndex`로 채움. **probe 모드**를 추가: 캐릭터의 face@0xf4를 CLI/env로 받은 임의 값으로 강제 (예: `LOGH_FACE_PROBE=<value>` 또는 `--probe-face <value>`). 한 캐릭터 카드(0x0204+0x0325+0x0323 시퀀스)를 그 face로 렌더시킴.

### 3b. 캡처
초상화가 그려지는 순간을 캡처. 우선순위:
1. **frida**: 초상화 blit/DrawImage 호출(또는 tcf 슬롯 인덱스를 인자로 받는 렌더 함수)을 후킹해 **클라가 고른 슬롯 인덱스 + 픽셀**을 직접 로깅 — 화면캡처보다 결정적. (렌더 함수는 face-codec 디컴파일 `FUN_00592c30`(decompose) 하류를 추적.)
2. **화면캡처**: 카드 초상화 영역(64×80 비율)을 잘라 `captures/<face값>.png`로 저장. (D3D8 표면 캡처 한계 주의 — [[logh7-render-verification-spec]] 참조.)

### 3c. probe 세트
1. **검증 프로브 (필수, 먼저)**: 서버가 현재 Yang에 배정하는 face값을 그대로 주입 → 렌더 캡처 → 슬롯274와 매칭되나? 
   - 매칭되면(NCC≥0.85) → chara번호=face값 가정이 의외로 맞음 → 12개 공식 전부 신뢰 획득.
   - 안 되면 → 가정 틀림 확정 → 3c-2 sweep 필요.
2. **sweep (전체 face값↔슬롯 맵)**: 모든 atlas×index에 대해 `encodeFace(atlas,i)` 주입 → 캡처. oem 0..199, oam 0..95, o 0..99, gem 0..99, gef 0..31, gam 0..99, gaf 0..31 (~653개). 각 캡처를 atlas와 매칭 → **face값→슬롯 완전 맵**.
3. **앵커 역산**: Yang 슬롯274가 sweep에서 어떤 face값으로 렌더됐는지 → Yang의 **진짜 프로토콜 face값** 확정. → 서버 content-adapter 교정.

### 3d. Mac측 매칭
캡처를 Mac으로 가져와:
```
python3 tools/logh7_portrait_pixelmatch.py --captures captures --pool .omo/work/portraits   # topk
# 게이트(오탐 방지, NCC≥0.85 & 격차≥0.10)·이름라벨 원하면:
python3 tools/logh7_portrait_match.py verify --refs <face→capture manifest>.json --portraits .omo/work/portraits --out face-map.json
```

## 4. 수용 기준
- 검증 프로브: Yang face → 슬롯274 매칭(NCC≥0.85, 격차≥0.10)이면 PASS.
- sweep: 각 face값이 정확히 한 슬롯에 강매칭(격차≥0.10). → `content/verified/face-value-to-slot.json` 산출.
- 이름: 생존 앵커(현재 Yang 1건)만 name↔slot 확정으로 인정. 그 이상은 새 1차 출처(당시 캡처/사이트) 없으면 불가 — 환상 금지.

## 5. 산출물
- `content/verified/face-value-to-slot.json` (sweep 결과, 렌더러 ground truth)
- `content/verified/portrait-identities-verified.json` 갱신 (검증된 name↔slot)
- 서버 `logh7-content-adapter.mjs` face 배정 교정 (실제 face값 사용)
