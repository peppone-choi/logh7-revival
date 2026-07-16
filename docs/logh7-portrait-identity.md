# LOGH VII 인명 ↔ 초상화(face slot) 매핑 — 엄밀 검증 (2026-06-14)

> 사용자 요구: **"AI 슬롭이나 환상으로 틀리면 안 된다."** → 신원은 오직 **키 있는 공식 초상화 ↔ 디코드된 tcf 슬롯의 픽셀 상관(NCC)** 으로만 부여. AI vision "닮았다" 추정 전면 금지.

## 결론 (요약)

| 항목 | 결과 |
|---|---|
| 디코드된 VII 얼굴 슬롯 | **416** (`tools/logh7_tcf_decode.py dumpall`, `.omo/work/portraits/NNNN.png`) |
| 생존한 공식 VII 참조 초상화 | **단 2장** (Wayback CDX 확인: `chara/085.jpg`, `chara/206.jpg`) |
| **픽셀-확정 신원** | **1건 — ヤン(Yang Wen-li) → tcf 슬롯 274** (NCC 0.9175, 2등 0.728, 격차 0.19) |
| 판별 불가 | シェーンコップ(085) — 최고 NCC 0.60, 근소차 무더기 → 거부 |
| 폐기 | AI `canon-face-registry.json` / `portrait-identities.json` 전량 (근거: 아래 슬롭 증명) |

산출물: `content/verified/portrait-identities-verified.json` (확정 1 + 거부 1, 점수 증거 포함), 도구 `tools/logh7_portrait_match.py`.

## AI 매핑이 슬롭인 증거

기존 AI roster는 공식 `chara/NNN.jpg` 번호(`face_index`)를 **tcf 슬롯 인덱스와 동일시**했다. 이는 틀렸다:

- 공식 Yang = `chara/206`. 그러나 Yang의 실제 얼굴은 **tcf 슬롯 274** (전체 416장 랭킹 1위, NCC 0.918).
- 즉 **chara 번호 206 ≠ tcf 슬롯 206**. 두 넘버링은 별개이며 상수 오프셋도 아니다(Yang +68, Schönkopp는 +68(=153) 불일치).
- 따라서 `face_index`를 슬롯으로 쓴 모든 초상화 할당은 무근거. `_WARNING`/`confidence:"assigned"`로 스스로 추정임을 인정한 것과 일치.

## 검증 방법 (재현 가능, 무슬롭)

1. **공식 출처 직접 수집** (AI JSON 불신):
   - `gineiden.com/st_char.html` (Wayback `20040115095030`) → name→chara/NNN 매핑 12개. HTML이 정확히 `[41,48,69,85,125,195,206,209,268,270,285,286]` 참조 — 공식 ground truth 확정.
   - 생존 초상화: Wayback CDX `url=gineiden.com/picture/chara*` → **85, 206 둘만** status 200.
2. **결정론적 매칭** (`tools/logh7_portrait_match.py`): 참조를 64×80 그레이로, 전체 416 슬롯과 NCC(미러 포함). **수용 기준: best≥0.85 AND (best−2등)≥0.10.** Yang 통과(0.918/0.19), Schönkopp 거부(0.60/~0).
3. **시각은 진단용으로만** 사용(매칭이 fluke 아닌지 확인 — 슬롯 274 = 206.jpg와 동일 베레모 청년). 신원 주장은 픽셀 점수가 근거.

## 한계 & 남은 무슬롭 경로

- 공식 초상화 **2장만 생존** → 픽셀-확정 가능 신원의 상한이 사실상 2(그 중 1만 판별 성공). 나머지 11 공식 인물은 초상화 미생존 + chara≠tcf라 슬롯 매핑 불가.
- VII 얼굴 슬롯 ~1000 ≫ 명명 canon ~70-180 → **대부분 슬롯은 생성용 generic 얼굴**(특정 인물 아님).
- **확장 후보 (현재 미채택)**:
  - IV EX `face.mrg`(전작 얼굴 아카이브): DLL/아카이브 패킹돼 디스크 직접 부재 + 1994↔2004 cross-era art라 픽셀 재사용 불확실 → 디코드해도 신뢰 매칭 난망.
  - Gineipaedia 이미지: 애니/공식 일러스트 = 게임 픽셀아트와 **다른 art** → 픽셀 매칭 무효(슬롭 위험).
  - **인게임 바인딩 관찰(Windows 세션)**: 서버가 알려진 캐릭터에 부여하는 face_id를 직접 관찰 = 유일한 대량 무슬롭 확장 경로.

## 원칙

**날조 180건보다 검증 1건.** 픽셀 증거 없는 신원은 부여하지 않는다.
