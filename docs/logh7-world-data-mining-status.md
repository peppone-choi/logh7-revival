# LOGH VII 월드 데이터 마이닝 상태

작성일: 2026-06-17 KST

범위: 성계 위치/이름/항성 등급, 행성 위치/궤도/이름, 행성 내 건물/장소/시설 데이터를 다시 판정한다. 결론은 “서버가 임시로 표시할 수 있는가”와 “원본 LOGH VII 데이터로 주장할 수 있는가”를 분리한다.

## 결론

현재 권위 있게 사용할 수 있는 것은 성계/행성/요새의 이름 목록, 행성 궤도순, 전략 마커의 `constmsg` group `0x18` 라벨 ID, UI/도메인 라벨 vocabulary다.

아직 권위 데이터로 묶으면 안 되는 것은 성계 원본 서버 좌표, 이름별 확정 항성 등급, 행성 절대 위치, 행성 경제 수치, 행성 내 건물/장소/시설 좌표와 상태다. 이들은 각각 PDF 성계도 주석, MDX 노드 순서, 서버 절차 생성, 또는 layout-only RE 상태로 분리해야 한다. 다만 전략 마커 렌더링은 색/타입이 세력값으로 접히면 오판을 만들기 때문에, MDX 항성 노드 순서를 `model_node_order_provisional` provenance로 표시한 뒤 서버 렌더용 `byte2` variant에만 사용한다.

## 데이터별 판정

| 데이터 | 현재 원천 | 판정 | 서버 사용 규칙 |
|---|---|---|---|
| 성계 이름 | `content/galaxy.json`, `content/names/systems-ko.json`, `constmsg` group `0x18` | 사용 가능 | 80개 전부 label `contentId`가 복원됨 |
| 성계 위치 | `content/galaxy.json` `rect/cx/cy/page` | 최선의 투영값 | 원본 서버 좌표라고 쓰지 않는다 |
| 항성 등급 | `content/extracted/model-galaxy-stars.json` | 79개 분광형 존재, 이름 직접 링크 미발견 | `model_node_order_provisional`로 표시한 서버 렌더용 임시 연결만 허용 |
| 특수 천체 | `Null_galaxy.mdx` `bh_01..03`, `ns_01..03` | 존재 확인 | 성계명/좌표와 결합하려면 추가 증거 필요 |
| 행성 이름 | `content/galaxy.json`, `content/names/planets-ko.json` | 사용 가능 | 281개 이름/한국어 독음 사용 가능 |
| 행성 궤도 | `content/galaxy.json` `orbit` | 순서/slot으로 사용 가능 | 절대 위치가 아니라 궤도순으로만 표시 |
| 행성 위치 | `logh7-inferred-content.mjs` local polar slot | 절차 생성 | 원본 데이터로 표시하지 않는다 |
| 행성 경제 | `content/planet-economy.json` | 절차 생성 | 정보 패널 seed로만 사용 |
| 시설/장소/방 이름 | `content/client/schema.json`, `constmsg.dat` | vocabulary 사용 가능 | UI label과 0x0321 seed label로 사용 |
| 시설 좌표/상태/점유자 | `0x0321` layout만 확인 | 원본 mapping 없음 | 생성/추정 값을 원본처럼 쓰지 않는다 |

## 수치

- `content/galaxy.json`: 성계 80, 행성 281, 요새 6.
- 현재 content pack: 성계 80, 행성 281, 요새 6, 누락된 성계 `contentId` 0.
- `content/extracted/model-galaxy-stars.json`: 항성 노드 79, 블랙홀 3, 중성자별 3.
- 항성 노드 등급 분포: G 19, O 2, F 8, A 7, B 5, M 21, K 17. O/B 계열은 합계 7개이므로 파란/고온 계열이 하나뿐이라는 판정은 틀렸다.
- `content/extracted/model-planets.json`: 행성/요새/장식 모델 107개.
- `content/client/schema.json`: `planet_record` label 221, `nation_record` label 92, `facilities` label 152.

상세 데이터셋은 `.omo/ulw-loop/evidence/g006-world-data-mining-dataset.json`에 있다. 이 파일은 성계 80개와 행성 281개를 모두 나열하고, 항성 등급/행성 모델/시설 라벨은 `unjoined` 또는 `not-coordinate-state`로 표시해 원본 데이터처럼 잘못 결합하지 않도록 한다.

## ID 공간 주의

`MsgDat`의 큰 record ID와 전략 지도 marker ID를 섞으면 성계명이 틀어진다.

- `content/client/msgdat.json`: `id 1417 = イゼルローン`, `id 1489 = ルンビーニ`.
- 전략 지도 `0x0313.byte0`: `イゼルローン = 14`, `ルンビーニ = 86`.
- `0x0313.byte0`은 `constmsg` group `0x18`의 one-byte sub-ID다.
- 서버의 성계 marker는 이 one-byte sub-ID만 사용해야 한다.

## Wire 경계

- `0x0313 ResponseStaticInformationGridType`: object table. `byte0`은 group `0x18` content ID, `byte1`은 class gate, `byte2`는 sprite/faction variant.
- `0x0315 ResponseStaticInformationGrid`: cell grid. grid cell value가 object table index다.
- `0x031d ResponseStaticInformationBase`: 정적 system/base 정보. 이름, grid, class, astronomy-like slot을 싣는다.
- `0x031f ResponseInformationBase`: 동적 base/economy/defense/ownership 계열. 배열 layout은 확인됐지만 scalar 이름은 아직 provisional이다.
- `0x0321 ResponseInformationInstitution`: 기관/건물/방 layout. 원본 좌표, 점유자, 상태 값은 아직 미마이닝이다.

## 현재 코드 영향

- `src/server/logh7-content-adapter.mjs`는 `constmsg` group `0x18`에서 성계 marker `contentId`를 복원한다.
- `src/server/logh7-content-adapter.mjs`는 `model-galaxy-stars.json`의 79개 분광형을 성계 index에 임시 연결하고, `provenance.spectralClass.authority=model_node_order_provisional`로 보존한다. 80번째 manual system은 매칭 항성 노드가 없어 `spectralClass=null`로 남는다.
- `src/server/logh7-inferred-content.mjs`는 성계 좌표 provenance를 `content/galaxy.json manual star-chart annotations`로 고정하고, 행성 위치 provenance를 `content/galaxy.json orbit order, deterministic local polar slots`로 고정한다. 전략 grid 투영은 PDF 101쪽 annotation on/off 렌더 차분 재검증 이후 두 프레임을 분리한다. 직접 PyMuPDF PDF 저장 좌표는 렌더 기준 `displayX=842-pdfCy`, `displayY=pdfCx`에 맞지만, `content/galaxy.json`은 이미 y축 반전/아이콘 anchor 기준으로 정규화되어 서버에서는 `displayX=contentCy`, `displayY=contentCx`를 적용한다.
- `src/server/logh7-login-protocol.mjs`는 분광형이 있을 때 `O/B/A/F/G/K/M -> 0/1/2/3/4/5/6`으로 `0x0313.byte2` marker variant를 만든다. 분광형 필드가 명시적으로 `null`인 성계는 unknown/special slot `8`을 쓴다. 분광형 필드가 아예 없는 레거시 probe 입력만 기존 세력 fallback을 유지한다.
- `content/planet-economy.json`은 `_purpose`와 `_method`에서 절차 생성임을 명시한다.
- `tests/server/logh7-strategic-grid-provenance.test.mjs`는 성계 marker `byte0`과 좌표 provenance가 섞이지 않도록 회귀 검사한다.

## 2026-06-18 항성 타입 재판정 업데이트

사용자 지적대로 “파란 항성이 하나뿐”처럼 보이는 판정은 현재 서버 렌더 경로가 항성 분광형이 아니라 세력 fallback variant를 사용해서 생긴 오판이었다.

- 원본 모델 추출물 기준 분광형은 O 2, B 5, A 7, F 8, G 19, K 17, M 21이다.
- 서버 content pack은 이 79개 분광형을 `model_node_order_provisional` provenance와 함께 싣는다. 이는 원본 서버의 이름별 확정 항성 등급이 아니라, `Null_galaxy.mdx star_<NN>_<spectralClass>` 노드 순서를 전략 마커 렌더용으로 쓰는 임시 연결이다.
- `0x0313.byte2` 분포는 렌더용으로 O/B/A/F/G/K/M/unknown = `0/1/2/3/4/5/6/8`이 된다. 따라서 성계 마커가 세력색 0/1/2에만 접히지 않는다.
- 설치 트리의 실제 자산 `fs_glow_000..006` / `fs000_f..fs006_f`를 샘플링하면 슬롯 0..6은 청자색, 청색, 청록/청백, 황색, 주황, 적주황, 적색 순서다. 따라서 `O/B/A/F/G/K/M -> 0..6` 방향은 자산 색상과도 맞는다. 다만 named system 직접 연결은 아직 없으므로, 화면에 보이는 특정 성계 이름의 등급은 임시 연결로만 표기한다.
- 회귀 검증: `node --test tests/server/logh7-content-pack.test.mjs tests/server/logh7-login-session.test.mjs tests/server/logh7-login-protocol.test.mjs tests/server/logh7-strategic-grid-provenance.test.mjs` 145개 통과, `npm run test:server` 716개 통과.

## 2026-06-18 발할라 표기/임시 등급 재확인

추가 확인 결과, 현재 content pack에서 `ヴァルハラ`는 `model_node_order_provisional`
기준 `B`, 전략 마커 `byte2=1`로 나간다. 이는 원본 서버의 이름별 확정 항성 등급이
아니라 임시 렌더 연결이다. 화면/`constmsg` 추출 문자열은 `발할라`인데
`content/names/systems-ko.json`과 `content/roster/ivex-reference.json` 일부가
`발하라`로 남아 있어 `발할라`로 통일했다.

검증:

- `node --test tests/server/logh7-strategic-grid-provenance.test.mjs tests/server/logh7-content-db.test.mjs tests/server/logh7-content-pack.test.mjs tests/server/logh7-login-protocol.test.mjs` 64개 통과.
- `python -m unittest tools.tests.test_logh7_selectgrid_sp70_source_watch tools.tests.test_logh7_selectgrid_click_correlation_watch tools.tests.test_logh7_selectgrid_upstream_watch tools.tests.test_logh7_selectgrid_state_watch` 15개 통과.

## 2026-06-18 v61 실클라 화면 재확인

실제 로그인, 캐릭터 카드 선택, 월드 진입 후 미니맵을 클릭해 초기 `0/0` 검은 영역에서
항성 지도로 이동했다. 같은 세션에서 적색 `알타이르`, 황색/주황 `트라바흐`/`베루라`
계열, 청색/청록 `발할라`가 보였으므로 “파란 항성 하나” 판정은 화면 기준으로도
틀렸다. content pack의 임시 등급 조회는 `알타이르=M`, `트라바흐=K`, `베루라=K`,
`발할라=B`, `니플헤임=A`이지만, 모두 `model_node_order_provisional`이며 원본 서버의
이름별 확정값이 아니다.

증거:

- `.omo/ulw-loop/evidence/g006-c002-selectgrid-snapshot-v61-20260618.md`
- `.omo/ulw-loop/evidence/g006-c002-selectgrid-snapshot-v61-20260618.jsonl`
- `.omo/ui-explorer/session-g006-snapshot-v61-47900-20260618/shots/006-006-click-minimap-center.png`
- `.omo/ui-explorer/session-g006-snapshot-v61-47900-20260618/shots/008-008-click-minimap-valhalla-area.png`

추가 RE:

- `tools/logh7_disasm_range.py`의 절대 메모리 xref 스캔 기준, command renderer가 읽는
  `DAT_00c9eabc/eac0` 직접 접근은 모두 read이고 direct write는 없다.
- `DAT_007cd04c+0x11178/+0x1117c/+0x11180`도 직접 displacement 접근 기준 write는
  확인되지 않았다. 따라서 성계 색상/projection 반복이 아니라, 서버 payload가 UI/root
  action container로 import되는 경계를 추적해야 한다.

## 2026-06-17 P0-02 라이브 검증 업데이트

이번 실클라 런은 데이터 마이닝 판정을 바꾸지 않는다. 성계 좌표 권위는 여전히 manual/PDF projection이며 original-server 좌표로 확정하지 않는다. 추가 PDF 확인 결과, 이전 live 좌표 표기는 raw PDF annotation 좌표를 그대로 투영한 오류였으므로 화면 위치/렌더 라벨 판정은 철회한다.

- marker gate에서 `0x0313/0x0315` staging/live table 모두 81개 marker를 유지했다.
- `シロン` raw-grid cell `(30,2)` 양성 대조 클릭은 과거 투영에서 `0x0f08->0x0f09`를 냈다. 이 증거는 marker click path가 살아 있음을 보이지만, 새 좌표계의 위치 증거로 재사용하지 않는다.
- 2차 PDF 재확인에서 PyMuPDF 직접 좌표와 `content/galaxy.json` 좌표가 다른 프레임임을 분리했다. PDF 저장 rect는 `displayX=842-pdfCy`, `displayY=pdfCx`로 렌더 아이콘에 맞고, `content/galaxy.json`은 이미 y축 반전/아이콘 anchor 기준으로 정규화되어 서버에는 `displayX=contentCy`, `displayY=contentCx`를 적용한다.
- `ルンビーニ`은 PDF annotation 차분 재검증 후 cell `(2,21)`, objectValue `4`, contentId `86`이 새 기대값이다. 이전 cell `(42,2)`와 `(97,21)` 라벨 판정은 철회하고 재실행해야 한다.
- `イゼルローン`은 PDF annotation 차분 재검증 후 cell `(51,13)`, objectValue `45`, contentId `14`가 새 기대값이다. 이전 cell `(25,25)`와 `(48,13)` 라벨 판정은 철회하고 재실행해야 한다.
- corrected-cell 실클라 런은 `ルンビーニ (2,21)` / `イゼルローン (51,13)` 단일 클릭, 더블 클릭, 우클릭, 패널 후보 클릭을 수행했다. trace는 `0x0300` 또는 무트레이스에 머물렀고 `0x0b01/0x0b07`은 없었다.
- `バグタプール`은 독립 전략 좌표가 아니라 `ルンビーニ` 내부 orbit order 1번이므로 부모 성계 선택 패널이 먼저 증명되어야 한다.
- 증거: `docs/logh7-coordinate-provenance.md`, `.omo/evidence/task-3-p0-02-coordinate-evidence-provenance.json`, `.omo/ulw-loop/evidence/g006-redatamine-manual-20260617/manual-content-frame-recheck.json`, `.omo/ulw-loop/evidence/g006-redatamine-manual-20260617/world-data-source-recheck.json`, `.omo/ulw-loop/evidence/g006-redatamine-manual-20260617/corrected-client-trace-summary.json`.

## 다음 마이닝 과제

1. `Null_galaxy.mdx` 노드 순서와 named system의 연결 증거를 찾는다. 없으면 항성 등급은 계속 미결합으로 둔다.
2. 실제 클라이언트에서 성계/요새/행성 선택 후 `0x031d`, `0x031f`, `0x0321` 요청/응답과 화면 패널을 한 세션에서 캡처한다.
3. `0x0321`의 기관/건물/방 값이 `schema.json` label ID인지, 별도 서버 테이블 ID인지 live trace로 분리한다.
4. `planet-economy.json`과 deterministic polar slot을 UI에 노출할 때는 반드시 “임시 seed/projection” 경계를 유지한다.
5. 다음 루프는 좌표가 아니라 명령 활성화 경로다. corrected-cell 런이 `0x0b01/0x0b07`을 만들지 못했으므로, `0x0323/0x0356` action-list seat/category가 native runtime에서 무시되는 지점과 `SelectGrid`/`CommandMoveGrid` 진입 조건을 계측한다.
