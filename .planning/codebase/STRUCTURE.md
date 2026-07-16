# LOGH VII Revival 저장소 구조 지도

> 정적 분석 스냅샷: 2026-07-16, `main == origin/main`
>
> 대형 binary/capture의 내용을 복제하지 않고 경로와 manifest 역할만 기록한다. 실제 존재 파일을 기준으로 했으며, 문서에만 남은 옛 경로는 별도로 표시한다.

## 1. 빠른 인벤토리

| 범위 | 파일 수 | 줄 수 | 역할 |
|---|---:|---:|---|
| `server/src/application` | 3 | 포함 집계 | command/query와 use case |
| `server/src/domain` | 3 | 포함 집계 | entity, authority, strategy admission |
| `server/src/infrastructure/persistence` | 6 | 포함 집계 | SQLite UoW/catalog/seed, PG 준비 |
| `server/src/presentation` | 2 | 포함 집계 | composition root와 process entry |
| `server/src/server` | 28 | 포함 집계 | legacy TCP/session/wire adapter |
| **`server/src` 합계** | **42** | **10,277** | 현재 backend source |
| **`tools` 합계** | **167** | **35,562** | 추출, RE, patch, live QA, 연구 도구 |

`tools` 집계는 `__pycache__`와 `.pyc`를 제외했다. `tools`에는 현재 main의 tracked pipeline과 로컬 untracked 연구 파일이 함께 있으므로 존재만으로 권위가 생기지 않는다.

## 2. 루트 구조

```text
logh7-revival/
├── AGENTS.md                         현재 프로젝트 운영 계약과 상태 요약
├── artifacts/                        CD/EXE/capture 등 대형 원본·실험 산출물
├── docs/                             현행 요구사항, 아키텍처, 로드맵, 근거 문서
│   ├── reference/                    공식 매뉴얼 PDF 5종
│   └── logh7-*-current.md            현행 문서군
├── server/
│   ├── package.json                  Node >=20, test/start script
│   ├── src/                          backend와 legacy adapter
│   ├── data/seed/                    provenance를 가진 정적 seed
│   ├── content/                      추출/생성/localization/scenario 자료
│   └── migrations/                   PostgreSQL migration 준비
├── tools/
│   ├── extract/                      정적 추출·audit·catalog 구축
│   ├── live/                         Wine/Windows client 라이브 QA와 Frida
│   ├── patch/                        hash/signature guarded patch
│   ├── re/                           Ghidra automation
│   ├── roster-editor/                로컬 roster 편집 UI
│   └── tests/                        Python 도구 regression
├── .omo/plans/                       현재 실행 계획
└── .planning/codebase/               이번 정적 구조 지도
```

현재 루트에는 `src/`가 없고 구현은 `server/src/`에 있다. `.codegraph/`도 없다. `.code-review-graph/`가 있더라도 프로젝트 규칙이 말하는 CodeGraph index로 대체하지 않는다.

## 3. 현재 권위 문서

| 파일 | 용도 |
|---|---|
| [`AGENTS.md`](../../AGENTS.md) | 가장 짧은 현재 상태, 작업 규칙, 완료 gate |
| [`docs/logh7-document-index-current.md`](../../docs/logh7-document-index-current.md) | 현행/역사 문서 라우팅 |
| [`docs/logh7-requirements-current.md`](../../docs/logh7-requirements-current.md) | 기능 요구사항과 milestone 상태 |
| [`docs/logh7-architecture-operations-current.md`](../../docs/logh7-architecture-operations-current.md) | 계층 경계와 운영 기준 |
| [`.omo/plans/logh7-execution-plan-current.md`](../../.omo/plans/logh7-execution-plan-current.md) | M4 이후 실제 실행 순서 |
| [`docs/logh7-roadmap-current.md`](../../docs/logh7-roadmap-current.md) | 전체 milestone과 remaster track |
| [`docs/logh7-reference-haul.md`](../../docs/logh7-reference-haul.md) | 외부 레포/도구 방법론 라우터, 캐논 아님 |
| [`docs/logh7-remaster-prep-current.md`](../../docs/logh7-remaster-prep-current.md) | provenance/fallback/rollback 안전 기준 |

일부 `*-current.md` 아래쪽에는 날짜별 역사 기록이 남아 있다. 파일 상단의 현재 기준과 문서 인덱스를 우선하고, 과거 Unity 경로나 옛 테스트 수치를 활성 구현으로 해석하지 않는다.

## 4. `server/src` 전수 지도

### 4.1 Presentation — 2개

| 파일 | 역할 |
|---|---|
| [`presentation/main.mjs`](../../server/src/presentation/main.mjs) | production CLI entry, runtime start/stop과 signal 처리 |
| [`presentation/createPlayableRuntime.mjs`](../../server/src/presentation/createPlayableRuntime.mjs) | SQLite application, auth registry, legacy TCP/world session, navigation policy, ship slice 조립 |

### 4.2 Application — 3개

| 파일 | 역할 |
|---|---|
| [`application/bus.mjs`](../../server/src/application/bus.mjs) | 동기 command bus와 비동기 query bus |
| [`application/GameApplication.mjs`](../../server/src/application/GameApplication.mjs) | DB open/seed, handler/UoW/catalog wiring, legacy adapter bridge |
| [`application/handlers.mjs`](../../server/src/application/handlers.mjs) | 계정/캐릭터/권한/월드 입장/이동 command와 query handler |

### 4.3 Domain — 3개

| 파일 | 역할 |
|---|---|
| [`domain/entities.mjs`](../../server/src/domain/entities.mjs) | account/character entity, dirty state, authority, unit/cell/online 상태 |
| [`domain/authority-cards.mjs`](../../server/src/domain/authority-cards.mjs) | P0/P1 권한 카드와 navigation factory mapping |
| [`domain/strategy-command-catalog.mjs`](../../server/src/domain/strategy-command-catalog.mjs) | 81 command metadata/admission; outcome은 아직 `not-implemented` |

### 4.4 Persistence — 6개

| 파일 | 역할 |
|---|---|
| [`persistence/Database.mjs`](../../server/src/infrastructure/persistence/Database.mjs) | `node:sqlite` schema/migration/transaction과 기본 repository surface |
| [`persistence/UnitOfWork.mjs`](../../server/src/infrastructure/persistence/UnitOfWork.mjs) | identity map, dirty/new flush, event와 world_fleet projection atomic commit |
| [`persistence/WorldCatalog.mjs`](../../server/src/infrastructure/persistence/WorldCatalog.mjs) | 정적 world catalog query |
| [`persistence/WorldSeedLoader.mjs`](../../server/src/infrastructure/persistence/WorldSeedLoader.mjs) | JSON seed, provenance marker, idempotent load |
| [`persistence/pg/PgConnection.mjs`](../../server/src/infrastructure/persistence/pg/PgConnection.mjs) | async PostgreSQL connection 초안, production 미연결 |
| [`persistence/pg/migrate.mjs`](../../server/src/infrastructure/persistence/pg/migrate.mjs) | PostgreSQL migration runner 초안 |

### 4.5 Legacy protocol adapter — 상위 21개

| 파일 | 역할 |
|---|---|
| [`logh7-account-auth.mjs`](../../server/src/server/logh7-account-auth.mjs) | 개발용 JSON account registry와 GIN7 인증 |
| [`logh7-character-codec.mjs`](../../server/src/server/logh7-character-codec.mjs) | `0x1000/0x2000` character/lobby message codec |
| [`logh7-character-store.mjs`](../../server/src/server/logh7-character-store.mjs) | JSON CRUD/atomic rename; harness/backcompat adapter |
| [`logh7-child-codec.mjs`](../../server/src/server/logh7-child-codec.mjs) | child encryption/key expansion과 `0x0031` material |
| [`logh7-deployment-units.mjs`](../../server/src/server/logh7-deployment-units.mjs) | initial deployment를 `0x0325` unit record로 변환; synthetic ID는 non-canon |
| [`logh7-envelope-0030.mjs`](../../server/src/server/logh7-envelope-0030.mjs) | checksum, envelope, inner-code framing |
| [`logh7-frame-stream.mjs`](../../server/src/server/logh7-frame-stream.mjs) | length-prefixed TCP frame parser/builder |
| [`logh7-galaxy-placement.mjs`](../../server/src/server/logh7-galaxy-placement.mjs) | 전략 palette/cell과 provisional navigability predicate |
| [`logh7-gin7-credential.mjs`](../../server/src/server/logh7-gin7-credential.mjs) | `0x7000` GIN7 credential parser |
| [`logh7-lobby-login.mjs`](../../server/src/server/logh7-lobby-login.mjs) | `0x0020/0x2000` login codec |
| [`logh7-lobby-session.mjs`](../../server/src/server/logh7-lobby-session.mjs) | lobby inner message router와 character create/delete/session |
| [`logh7-login-harness-server.mjs`](../../server/src/server/logh7-login-harness-server.mjs) | 좁은 login/lobby TCP diagnostic harness |
| [`logh7-login-response.mjs`](../../server/src/server/logh7-login-response.mjs) | key setup, login redirect, NG response |
| [`logh7-map-position-ledger.mjs`](../../server/src/server/logh7-map-position-ledger.mjs) | map coordinate 출처/신뢰도 ledger; visual 좌표는 canonical cell 아님 |
| [`logh7-original-candidates.mjs`](../../server/src/server/logh7-original-candidates.mjs) | provisional original-character 후보, non-canon |
| [`logh7-playable-pipeline.mjs`](../../server/src/server/logh7-playable-pipeline.mjs) | 로그인/월드/MP pure transcript regression runner |
| [`logh7-playable-server.mjs`](../../server/src/server/logh7-playable-server.mjs) | 통합 TCP adapter, stage routing, encryption, handoff, redacted trace |
| [`logh7-static-base.mjs`](../../server/src/server/logh7-static-base.mjs) | `0x031d` static base catalog/selector codec; internal ID는 original ID 아님 |
| [`logh7-transport-0030.mjs`](../../server/src/server/logh7-transport-0030.mjs) | envelope와 child codec 결합 encode/decode |
| [`logh7-world-records.mjs`](../../server/src/server/logh7-world-records.mjs) | msg32 opcode 상수, world/admission/grid/ship/card record builders/decoders |
| [`logh7-world-session.mjs`](../../server/src/server/logh7-world-session.mjs) | legacy world FSM/session, EnterWorld/MoveGrid dispatch, move/chat broadcast |

### 4.6 Legacy record codec — 7개

| 파일 | 역할 |
|---|---|
| [`codec/base-record.mjs`](../../server/src/server/codec/base-record.mjs) | `0x031f` base record |
| [`codec/institution-record.mjs`](../../server/src/server/codec/institution-record.mjs) | `0x0321` institution record |
| [`codec/personnel-action-list.mjs`](../../server/src/server/codec/personnel-action-list.mjs) | `0x0356` personnel action list |
| [`codec/scenario-session.mjs`](../../server/src/server/codec/scenario-session.mjs) | `0x2006` scenario/session record; shared candidate IDs는 provisional |
| [`codec/tactical-entry-sequence.mjs`](../../server/src/server/codec/tactical-entry-sequence.mjs) | `0325/0323/033b/0f1f` tactical sequence 조립, 기본 경로에서는 off |
| [`codec/tactical-position-records.mjs`](../../server/src/server/codec/tactical-position-records.mjs) | `033b/0345/0347/0349/034b/0f1f` position records |
| [`codec/warehouse-record.mjs`](../../server/src/server/codec/warehouse-record.mjs) | `0326/0327` warehouse; stock은 evidence 전까지 zero/unconfirmed |

## 5. 데이터와 content 구조

### `server/data/seed`

현재 seed 영역에는 다음 범주가 있다.

- `ability-schema`, `rank-table`: 규칙/정적 schema
- `characters`, `factions`: 인물과 세력
- `ships`, `fortresses`: 함선/요새 catalog
- `galaxy-systems`: galaxy/system projection
- `initial-deployment`: 초기 배치
- `seed-manifest`: source/provenance와 seed version

`WorldSeedLoader`를 통하지 않은 ad-hoc DB 삽입은 production seed 증거로 취급하지 않는다.

### `server/content`

| 하위 경로 | 역할 |
|---|---|
| `client/`, `crypto/` | client/transport 조사 자료 |
| `extracted/`, `original-data/`, `manual/` | 원본과 공식 문서에서 추출한 근거 |
| `generated/` | 재생성 가능한 projection/manifest; 원본이 아님 |
| `localization/`, `names/`, `roster/` | 표시/이름/인물 편집 자료 |
| `scenarios/` | scenario/session 입력 자료 |

generated 영역에는 remaster provenance, gameplay boundary, source pack, streaming export, original UI image manifest 같은 contract 잔여물이 있다. 현재 대응 generator와 활성 Unity client가 없는 항목은 실행 surface가 아니라 보존된 증거/설계 자산으로 분류한다.

### PostgreSQL 준비

`server/migrations`의 `0001_init`과 README, `persistence/pg/*`는 향후 adapter의 시작점이다. 현재 socket→application 경계가 동기이므로 migration 파일이 있다는 사실만으로 PostgreSQL 지원 완료를 주장할 수 없다.

## 6. `tools` 전수 역할 지도

### 6.1 `tools/extract` — 28개

| 계열 | 파일 | 역할 |
|---|---|---|
| Audit | `audit_data_decode.mjs`, `audit_docs_requirements.mjs`, `audit_exe_re_coverage.mjs`, `audit_galaxy_provenance.mjs`, `audit_ui_coordinates.mjs` | decode/문서/RE coverage/provenance/UI coordinate consistency 점검 |
| CD/toolchain | `logh7-cd-extract.mjs`, `logh7-cd-reextract-run.mjs`, `logh7-cd-toolchain.mjs` | CD image 추출과 재현 가능한 toolchain |
| EXE/data mining | `logh7_exe_string_miner.py`, `logh7_exe_table_miner.py`, `logh7_exe_table_sweep.py`, `logh7_msgdat_decode.py`, `logh7_stat_tables_catalog.mjs` | 정본 EXE/MsgDat/stat table 후보 추출 |
| Asset/manual | `build-assets-index.mjs`, `build_celestial_model_catalog.mjs`, `logh7_decode_tcf_portraits.mjs`, `manual_pdf_dump.py` | asset index, model catalog, portrait decode, manual text dump |
| MDX investigation | `mdx_recon.py`, `mdx_parse_all.mjs`, `mdx_galaxy_coords.py`~`coords6.py`, `mdx_galaxy_align.py`, `mdx_galaxy_register.py`, `mdx_galaxy_finalize.py` | MDX 구조와 galaxy 좌표를 단계적으로 탐색/정렬/승격 |

MDX 계열의 숫자 suffix는 탐색 단계다. 최종 파일 이름만 보고 앞 단계의 오류/가정을 건너뛰면 안 된다.

### 6.2 `tools/patch`와 `tools/re`

| 파일 | 역할 |
|---|---|
| [`tools/patch/exe-patch.mjs`](../../tools/patch/exe-patch.mjs) | source hash, signature, expected bytes를 검사하는 manifest patch engine |
| [`tools/patch/logh7_rsrc_patch.py`](../../tools/patch/logh7_rsrc_patch.py) | PE resource 재직렬화 기반 UTF-16 UI patch, source hash 필수 |
| [`tools/re/Logh7ExportSelectedDecomp.java`](../../tools/re/Logh7ExportSelectedDecomp.java) | 선택 함수 Ghidra decompile export 자동화 |

patch는 원본 백업/해시/rollback과 함께 써야 하고, RE export는 정본 EXE hash와 address mapping을 매 실행에서 기록한다.

### 6.3 `tools/live` — 111개

#### 안정된 진입점과 준비 도구

| 파일/계열 | 역할 |
|---|---|
| `prepare_direct_client.mjs` | 해시 가드된 원본 direct client patch, idempotent manifest 적용 |
| `prepare_1080p_client.mjs` | 로그인 원본 크기를 유지하며 post-login 1080p patch/config 적용 |
| `prepare_hangul_charset_client.mjs` | 명시적 gate 하 CP949 asset 경로 준비 |
| `prepare_strategy_ui_client.mjs` | 격리된 copied client에 strategy UI 실험 환경 구성 |
| `apply_session_picker_patch.py`, `patches/session-change-opens-picker.json` | session picker patch 실험 |
| `logh7_lobby_unblock_patch.py` | 옛 lobby unblock 직접 patch 실험; 정상 manifest 경로 아님 |
| `logh7_capture.mjs` | tshark capture와 session manifest 생성 |
| `logh7_login_harness_launch.mjs` | 좁은 login harness bootstrap |
| `logh7_agent_drive.py`, `logh7_drive_robust.py`, `logh7_create_step.py`, `logh7_probe_create_menu.py` | Windows UI 자동화/입력 재현 |

#### 멀티클라이언트와 지속성 gate

- `m3_multiclient_support.py`
- `_m3_multiclient_probe.py`, `test_m3_multiclient_probe.py`
- `_m3_close_probe.py`, `test_m3_close_probe.py`
- `_m3_walkstate_drive.py`, `_frida_m3_walkstate.js`
- `tests/test_liveqa_harness_gates.py`

두 client의 입장, 이동 broadcast, close/relogin, server restart persistence를 하나의 실제 QA 흐름으로 검증한다.

#### 네트워크/wire Frida

- `_frida_wiretap_probe.js`, `_wiretap_drive.py`
- `_frida_wiretap_fade_probe.js`, `_wiretap_fade_drive.py`
- `_frida_wire0323.js`
- `_dump0323_cmp.mjs`, `_dump0323char.mjs`, `_dump0325count.mjs`

암복호화 전후 buffer, opcode, 길이, 방향을 서버 trace/pcap과 맞춘다.

#### `0x0325`/dispatch/reader 계측

- Probe: `_frida_ab0325_probe.js`, `_frida_codec0325_probe.js`, `_frida_dispatch_probe.js`, `_frida_dispatch610_probe.js`, `_frida_gate600_probe.js`, `_frida_handler0325_probe.js`, `_frida_msg32reader0325_probe.js`, `_frida_pump0325_probe.js`, `_frida_readeraddr0325_probe.js`, `_frida_readerlen0325_probe.js`, `_frida_recvque0325_probe.js`, `_frida_stager_probe.js`
- Driver/diagnostic: `_ab0325_diag.py`, `_codec0325_diag.py`, `_dispatch_drive.py`, `_dispatch_repull.py`, `_dispatch610_diag.py`, `_gate600_diag.py`, `_handler0325_diag.py`, `_msg32reader0325_diag.py`, `_pump0325_diag.py`, `_readeraddr0325_diag.py`, `_readerlen0325_diag.py`, `_recvque0325_diag.py`, `_stager_diag.py`

이 계열은 record가 socket에 도착했다는 사실과 client reader/dispatcher/handler가 실제 소비했다는 사실을 분리한다.

#### Lobby/session/create UI

- `_frida_lobby_fsm.js`, `_frida_lobby_probe.py`
- `_frida_picker.js`, `_frida_picker2.js`, `_frida_force_picker.py`
- `_open_session_picker.py`, `_drive_session_picker.py`, `_session_pick.py`, `_scan_session_card.py`
- `_careful_create.py`, `_drive_create_entry.py`, `_drive_create_form.py`, `_drive_create_to_form.py`, `_force_create_mode.py`
- `_m2_click.py`, `_m2_e2e_drive.py`, `_m2_launch.mjs`, `_m2_lottery_launch.mjs`, `_test_no1001.py`

#### World load/scene/render/marker

- `_frida_worldenter_probe.js`, `_worldenter_diag.py`
- `_frida_worldload_base.js`, `_frida_worldload_probe.js`, `_frida_worldload_final.js`, `_frida_worldload_drive.py`
- `_frida_scene_state.py`, `_frida_render_probe.js`, `_frida_marker_count.js`, `_marker_count_attach.py`
- `_marker_precise_click.py`, `_click_shot.py`, `_clickmap_probe.py`, `_shot_client.py`, `_spot_dialog_geometry.py`
- `_frida_charstage_probe.js`, `_charstage_diag.py`, `_frida_crash_probe.js`, `_crash_click_drive.py`

#### Strategy/FSM/master-data

- `_frida_strategy_snapshot.js`: factory/cache join, selection, `SendWarp`, UI geometry, warehouse까지 한 session에서 관측하는 중심 probe
- `_frida_stratmap_verify.js`, `_stratmap_idle_watch.py`
- `_strategy_b71_probe.py`, `_strategy_ready_gate.py`, `_strategy_table_probe.py`
- `_frida_baseinfo_probe.js`, `_baseinfo_discovery.py`
- `_flagship_click_drive.py`, `_flagship_menu_hunt.py`, `_flagship_probe.py`, `_menu_probe.py`
- `_dump_1200_sites.py`, `_dump_fsm_table.py`, `_find_1200.py`, `_find_session_table.py`, `_post_origin_probe.py`
- 보조 실행기: `_e_drive.py`, `_run_drive_now.py`

파일명 앞의 `_`는 다수가 좁은 진단 probe임을 나타낸다. 이를 normal player launcher 또는 production service로 취급하지 않는다.

### 6.4 `tools/roster-editor`

- `server.mjs`: 로컬 roster/portrait data의 제한된 read/save와 atomic write
- `index.html`: 편집 UI

운영 admin surface가 아니라 수동 data preparation 도구다.

### 6.5 root `tools`와 tests

tracked `tools/logh7_ui_explorer.py`는 Win32 UI automation diagnostic이며 정상 플레이 경로가 아니다. `tools/tests/test_logh7_ui_explorer.py`, `test_logh7_rsrc_patch.py`가 해당 도구/patch regression을 담당한다.

현재 working tree의 다음 research 계열은 untracked다.

- localization: `logh7_codepage949_recipe.py`, `logh7_strings_worksheet.py`
- portrait/source mining: `logh7_deep_portrait_match.py`, `logh7_fuse_portrait_classification.py`, `logh7_gineipaedia_extract.py`, `logh7_portrait_ensemble_match.py`, `logh7_portrait_match.py`, `logh7_prior_game_assets.py`, `logh7_reference_image_harvest.py`, `logh7_reference_region_harvest.py`
- review/verification: `logh7_build_verified_db.py`, `logh7_portrait_review_server.mjs`, `logh7_portrait_review.html`, `logh7_render_audit.py`
- matching untracked tests: codepage, MsgDat integrity, portrait ensemble, render audit

이 파일들 중 일부는 현재 main에 없는 module을 import하므로 current pipeline 또는 실행 가능성의 근거로 사용하지 않는다. 별도 review와 dependency 복구, provenance gate 후 tracked pipeline으로 승격해야 한다.

## 7. Capture와 binary 취급

| 경로/종류 | 문서화 방식 | 금지 사항 |
|---|---|---|
| `artifacts/logh7-cd/Logh7.bin/.cue` | URL, md5, local path | repo에 binary 복제 |
| client EXE/patch copy | source hash, output hash, patch manifest, rollback path | 원본 덮어쓰기 후 증거 누락 |
| pcap/session capture | session manifest, 시간, port, client/server hash, 관련 trace 경로 | 대형 capture를 Markdown에 embed |
| Frida dump | probe version/hash, address/signature, output path | 다른 EXE build offset 재사용 |
| screenshots/video | scenario/gate와 artifact path | 화면만 보고 DB/wire 성공 추정 |

대형 산출물은 내용 대신 manifest와 상대/절대 경로를 남기고, 원본/수정본/해시/실행 조건을 연결한다.

## 8. 활성 경로와 역사/잔여 경로 구분

### 활성 production 경로

```text
original direct client
  → server/src/server legacy adapter
  → server/src/presentation composition
  → server/src/application/domain
  → SQLite UnitOfWork/catalog
```

### 활성 QA/RE 경로

```text
tools/extract + tools/re
tools/patch + tools/live prepare/capture/Frida/UI drivers
server pure pipeline + TCP harness + dual-client live gate
```

### 현재 활성으로 간주하지 않는 것

- `client-unity/`: 현재 트리에 없음; 과거 제거된 client 경로
- generated remaster manifest: provenance/contract 보존물, 실행 runtime 아님
- JSON run3 store: production SQLite CQRS 증거 아님
- untracked portrait/localization research files: 검토 전 로컬 작업물
- synthetic deployment/original candidate IDs: canonical game data 아님

## 9. 알려진 구조 drift와 다음 정리점

1. 문서 인덱스 일부가 현재 없는 root `package.json`, `server/README.md`, `server/AGENTS.md`를 가리킨다.
2. 일부 remaster 문서/manifest가 현재 없는 generator module 또는 제거된 Unity tree를 가리킨다.
3. `.codegraph/`가 없어 코드 위치/영향 분석은 이번에 `rg`와 직접 source read로 수행했다.
4. root에 untracked 연구 도구와 문서가 많아 tracked current main과 로컬 실험을 반드시 구분해야 한다.
5. `server/src/server`라는 이름이 domain server처럼 보이지만 실제로는 legacy protocol adapter이므로 향후 `adapters/legacy` 성격을 문서와 module boundary로 더 분명히 할 필요가 있다.
6. future remaster용 `shared-core/` 디렉터리는 아직 없다. 현재 application/domain을 adapter-neutral하게 만드는 작업이 선행되어야 한다.

## 10. 이번 지도의 검증 범위

- `server/src` 실제 파일 42개와 각 역할 확인
- `tools` 실제 파일 167개와 각 family/entrypoint 역할 확인
- 현행 문서 7종과 server composition/domain/persistence/legacy adapter 교차 확인
- 대형 capture는 열거나 복제하지 않고 manifest/도구 경계만 확인

runtime 테스트는 실행하지 않았다. 현재 shell에 `node`와 `omx` executable이 없고, 사용자 기본 Wine prefix에 side effect를 만들지 않기 위해 Wine 계열 명령을 실행하지 않았다. 현행 문서의 테스트 기준선은 이전 검증 기록이며 이번 정적 지도에서 새로 입증한 수치가 아니다.
