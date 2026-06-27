# MDX 성계 좌표/타입 하드코딩 재검증 — 2026-06-25 (메인 삼각검증)

사용자 지시로 "성계 위치/타입/행성 위치가 MDX에 하드코딩"인지 raw 재검증. 이전 메모
`logh7-mdx-no-hardcoded-coords-2026-06-23`("하드코딩 없음, 템플릿")을 정면 재검토.

## 독립 확인 (메인 에이전트, 도구 직접 실행)

- 도구: `tools/logh7_mdx_extract.py --root .omo/work/logh7-installed`
- 결과 카운트: `mdx:406, strategy_models:7, galaxy_stars:79, galaxy_special_bodies:6, planet_models:107, ship_models:254`.
- `content/extracted/model-galaxy-stars.json`:
  - **79개 성계 노드 각각 분광형 태그**(`star_<NN>_<spectralClass>` 씬그래프 노드명).
  - 히스토그램 `{G:19, M:21, K:17, F:8, A:7, B:5, O:2}` — loop-state v53~v56 인용치와 정확히 일치.
  - 특수천체 6: `bh_01..03`(블랙홀), `ns_01..03`(중성자별).
- 원본: `data/model/strategy/Null_galaxy.mdx` (galaxy.mdx 16,508B; `galaxy:Layer1/Layer2…` 레이어 노드 + 포인터형 헤더).

## 판정 (P0, 부분 확정)

1. **성계 타입(분광형)은 MDX에 하드코딩** = 확정. 79 노드가 O/B/A/F/G/K/M로 명명됨.
   → 이전 메모의 "타입 권위 부재/provisional"은 **name↔index 매핑만 provisional**이지
   타입 자체는 MDX 보유. 이 부분 메모 정정 필요.
2. **성계 위치(x,y,z) 하드코딩 여부 = 열린 질문**. 현 추출기는 분광형만 출력하고
   **노드 transform(좌표)은 미출력**. 씬그래프 노드는 통상 transform을 보유하므로
   위치도 하드코딩되어 있을 개연성이 높으나 **raw 좌표 덤프로 확정 필요**.
3. 행성 위치: `planet_models:107` 노드 존재 — 위치 포함 여부 동일하게 미확정.

## 최종 확정 (2026-06-25 포인터-체이스 — 메인 직접)

적대적 verifier(`wrom96m62`)는 노드 레코드의 inline transform이 0임을 확인했으나 **힙 포인터를
따라가지 않았다**. 메인이 base-relocation(base=`0x01e300a0`=파일오프셋0의 vaddr)으로 직접 추적:

- 헤더 10×(ptr,count): off 0/19720/20510/20060/20196/41930/74570… count 85/85/765/1/1/85/0 — 정상 변환.
- **전 파일 비-LOD float 삼중쌍(좌표 후보) 스캔 = 0개.** 위치 테이블 부재.
- region1 노드 레코드 포인터(+0x88/+0x94)→대상 오프셋(0x1234a 등) = **전부 0x00 또는 denormal
  (8.38e-38) 구조 바이트**, 좌표 아님.

→ **포인터를 끝까지 추적해도 MDX엔 성계/특수천체/행성 위치가 없다. 결론 확정(재검증 불필요).**
- 노드 정체/성격 = **이름**으로 확정(`star_NN_<분광형>`, `bh_NN`/`ns_NN`).
- 위치 권위 = `content/galaxy.json`(canonGameCol/Row, gin7manual p101 星系図). bh/ns 6개 특수천체
  위치는 galaxy.json 보강 필요(매뉴얼 출처).
- 메모 `[[logh7-mdx-no-hardcoded-coords-2026-06-23]]` 정정: 위치 없음은 맞고, **타입(분광형)은 MDX 노드명에 있음**.

남은 (저레버리지): MDX 노드 순서 vs galaxy.json 성계 순서 정렬 확인 → per-system 분광형 부착 가능 여부.
도구 `$TEMP/mdx_ptr_chase.py`(포인터 추적 + float 스캔).
