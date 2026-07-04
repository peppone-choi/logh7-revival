# LOGH VII 함수레벨 RE 커버리지 행렬 (P0-06)

자동 생성: `python -m tools.logh7_func_coverage_report`. 소스 = `.omo/re-audit/functions/<bin>/{summary,ledger,lightdoc}.json`.

- **total** = 디컴파일 인덱스 전 함수
- **re_target** = 트리아지가 deep-RE 대상으로 분류(thunk/library/trivial 제외)
- **deep** = 워크플로 maker가 목적+매개변수+오프셋까지 문서화(원장 동기화 실측)
- **light** = lightdoc baseline(전 함수 한 줄 자동문서; 누락 0)

| 바이너리 | total | re_target | deep-RE | re_target대비 | total대비 | lightdoc | 배치완료 |
|---|---:|---:|---:|---:|---:|---:|---:|
| BootFirst | 78 | 69 | **69** | 100.0% | 88.5% | 78 | 10 |
| G7MTClient | 13800 | 6089 | **349** | 5.7% | 2.5% | 13800 | 189 |
| G7Start | 1723 | 988 | **289** | 29.3% | 16.8% | 1723 | 40 |
| Gin7UpdateClient | 2453 | 1405 | **310** | 22.1% | 12.6% | 2453 | 40 |
| setup | 431 | 345 | **0** | 0.0% | 0.0% | 431 | 0 |
| **합계** | **18485** | **8896** | **1017** | **11.4%** | **5.5%** | **18485** | |

## 서브시스템 분포 (re_target 태깅, 전 바이너리 합)

- strategic: 404
- battle: 149
- network: 132
- ui: 83
- file: 81
- crt: 48
- render: 32
- input: 17
- audio: 4

## 정직 고지
- **G7MTClient가 실질 게임 본체**. BootFirst·G7Start·Gin7UpdateClient·setup은 MFC/MSVCRT/CRT 런타임 비중이 크고 게임직결 함수는 소수(verifier/합성 정직 기록).
- deep-RE 미완 함수도 **lightdoc baseline은 존재**(목적/규약/매개변수수/필드오프셋). "비트 하나도 빠뜨리지 마" 기준 누락 0; deep-RE는 게임플레이 레버리지 순으로 진행.
- 각 deep-RE 함수의 confidence(P0-decompile/P3-inferred)는 `out/batch-*.json` 및 웨이브 요약 문서에 개별 표기.
