# LOGH VI -> VII portrait comparison, 2026-06-14

## Conclusion

전작 포트레잇 비교는 유효하지만, 현재 자료에서는 자동 신원 확정용이 아니라 후보 생성 및 재랭킹용 증거층으로 써야 한다.

근거:

- `content/roster/idkit/vi-labeled/_labels.json`에는 VI 라벨 포트레잇 112장이 있다. 각 항목은 한국어 이름, `char_id`, `face_res`, 진영을 가진다.
- VII 비교 대상은 `content/roster/portraits/*.png` 416장이다.
- 엄격한 NCC 픽셀 매칭 결과: 112장 중 confirmed 0건.
- deterministic ensemble 결과: accepted 0건, candidate 0건, rejected 112건.
- 다만 상위권은 score 0.82-0.85까지 올라오며, 대부분 gap이 0.00-0.03으로 낮다. 즉 얼굴/팔레트/구도 유사성은 잡히지만, 2등과 충분히 벌어지지 않아 자동 확정하면 오염된다.

## Produced Artifacts

- `.omo/work/logh7-prior-game/vi-labeled-refs.json`
- `.omo/work/logh7-prior-game/vi-labeled-manifest.json`
- `.omo/work/logh7-prior-game/vi-vii-ncc-verify.json`
- `.omo/work/logh7-prior-game/vi-vii-ensemble-rankings.json`
- `.omo/work/logh7-prior-game/vi-vii-top20-contact.png`

## Verification Commands

```bash
python3 tools/logh7_portrait_match.py verify \
  --refs .omo/work/logh7-prior-game/vi-labeled-refs.json \
  --portraits content/roster/portraits \
  --out .omo/work/logh7-prior-game/vi-vii-ncc-verify.json

python3 tools/logh7_portrait_ensemble_match.py \
  --refs .omo/work/logh7-prior-game/vi-labeled-manifest.json \
  --portraits content/roster/portraits \
  --out .omo/work/logh7-prior-game/vi-vii-ensemble-rankings.json \
  --topk 8
```

## Top Ensemble Rows

These are not confirmed identities. They are review candidates only.

| Rank | VI file | VI name | VII slot | Score | Gap |
| --- | --- | --- | --- | ---: | ---: |
| 1 | `vi_089_empire.png` | 뷔로 | `0027` | 0.854581 | 0.007096 |
| 2 | `vi_063_unknown.png` | 진처 | `0025` | 0.851906 | 0.031024 |
| 3 | `vi_011_unknown.png` | 알트린겐 | `0074` | 0.850250 | 0.020106 |
| 4 | `vi_026_unknown.png` | 카르나프 | `0065` | 0.848202 | 0.021344 |
| 5 | `vi_027_unknown.png` | 키슬링 | `0092` | 0.845506 | 0.010124 |
| 15 | `vi_133_alliance.png` | 양 | `0274` | 0.830143 | 0.009639 |

`vi_133_alliance.png` -> VII `0274` is especially useful because existing anchor material already links VII `oam/0274` with Yang, but the image score alone is not discriminating enough to become the proof.

## Practical Rule

Use prior-game portraits as a three-part evidence layer:

1. Prior-game name label proposes the character name.
2. VII image score proposes candidate slot(s).
3. Canon roster, faction/attribute checks, official/site/server evidence, or manual review must confirm before writing an identity.

Do not stamp a VI name onto a VII portrait from image score alone unless it passes a strict best-score and gap criterion, or unless another independent source confirms the same slot.
