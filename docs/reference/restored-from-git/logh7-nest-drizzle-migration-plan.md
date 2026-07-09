# LOGH VII 서버 — Nest.js + Drizzle 마이그레이션 계획

작성: 2026-06-21 KST · 결정: 사용자(2026-06-21) — 코어 와이어/게임 서버까지 Nest.js + Drizzle 채택.
([[logh7-server-stack]]의 2026-06-10 "Node 유지" 결정을 대체. 단 아래 불변식은 유지.)

## 0. 원칙 (불변식 — 모든 단계에서 깨지면 안 됨)

1. **바이트 정확성 보존**: child-codec(Blowfish 변형)·BE transport 프레이밍·0x0313/0x0315/0x0323/0x031f/0x2006 등 와이어 빌더는 **순수 함수 그대로 둔다**. 프레임워크는 이들을 *감쌀 뿐* 재작성하지 않는다.
2. **테스트 그린 유지**: 현재 `node --test tests/server/*.test.mjs` **1069개**(골든-헥스 앵커)가 매 단계 끝에 그린이어야 한다. 이 테스트들은 순수 함수를 검증하므로 변경 불필요 — 깨지면 마이그레이션이 코어를 건드린 것.
3. **점진적·가산적(additive)**: 기존 `src/server/*.mjs`와 `npm start`를 한 번에 제거하지 않는다. Nest 경로를 옆에 세워 동등성 확인 후 전환.
4. **증거-게이팅**: 각 단계는 루프 사이클(explorer→maker→tester→verifier)로 진행하고 라이브/테스트 증거를 남긴다.

## 1. 현재 구조 (마이그레이션 대상)

- 루트 `logh-7-rework`(모노레포): `src/server/*.mjs` 74파일(코어, 의존성 0 ESM), entry `logh7-server.mjs`(subcommands serve/serve-auth/serve-gameplay/health/admin), `tests/server/*.test.mjs` 1069개, Vite/React 데모.
- 독립 `server/` (`@logh7-revival/server`, deps 0): 코어의 자립 사본(repo-split-plan-2026-06-20 대상).
- 런타임: Node **v24.4.0**(네이티브 TS type-strip + `node:sqlite` 내장), npm 11.4.
- 영속화: `content/logh7-content.db`(node:sqlite), `logh7-runtime/state/*.sqlite`(계정/스냅샷).
- 코어 = 3종 서버: TCP 게임/와이어(net.Server), HTTP 리소스, HTTP 어드민(:47910). + 대량 순수 도메인(login-session, command-engine, world-state, combat, personnel, economy, coup, intel, espionage, codec…).

## 2. 토큰 결정 (근거)

- **언어**: 신규 Nest/Drizzle 레이어는 **TypeScript**(Nest 데코레이터=experimentalDecorators+emitDecoratorMetadata 필요). 기존 `.mjs` 도메인 모듈은 그대로 두고 TS에서 import(TS→.mjs import 가능). 빌드=Nest 기본 tsc 또는 SWC. dev=`tsx`/`ts-node`.
- **Nest 범위**: AppModule = 합성 루트. TCP 와이어 서버는 **Nest 관리 서비스(provider)**로 `OnApplicationBootstrap`/`OnApplicationShutdown` 생명주기에 net.Server를 띄움(Nest 컨트롤러가 아님 — 컨트롤러는 HTTP 어드민/리소스 전용). 도메인 모듈은 순수 함수를 감싸는 얇은 provider.
- **Drizzle 드라이버**: 1순위 `node:sqlite`(zero-dep 유지, Node24 내장) 드라이버 지원 확인 → 미지원 시 `better-sqlite3`(성숙, 단 네이티브 빌드). 스키마=accounts/content/runtime-state.
- **테스트 러너**: 순수 코어 골든-헥스는 **node:test 유지**(바이트 회귀의 1차 방어선). Nest 통합/e2e는 별도(jest 또는 node:test). node:test→jest 통합은 선택사항(후순위).

## 3. 단계 (각 단계 = 1+ 루프 사이클, 끝에 1069 그린 확인)

- **Phase 0 — 툴체인 + 스캐폴드 (가산적, 되돌리기 쉬움)** — ✅ **완료 (2026-06-21, verifier PASS)**
  - deps 추가: `@nestjs/core @nestjs/common @nestjs/platform-express reflect-metadata rxjs`, `drizzle-orm drizzle-kit`, `typescript @types/node`, dev `tsx`. → 설치 완료(Nest 11.1.27, drizzle-orm 0.45.2, tsx 4.22.4, typescript 6.0.3).
  - `tsconfig.json`(decorators on, `module:NodeNext`, `allowJs`, `strict`). → 루트 추가, `include:["src/app/**/*.ts"]`로 코어 .mjs 타입체크 제외(+`types:["node"]`, `checkJs:false`, `noEmit`).
  - `src/app/`(Nest 스켈레톤): `main.ts`(`createApplicationContext`+`enableShutdownHooks`), `app.module.ts`, `wire-server.service.ts`. → "기존 `createAuthServer`"의 실체 = `startLogh7AuthServer`. 재작성하지 않고, serve-auth 배선을 **`bootServeAuthServer({argv,env})`**(신규 export, `logh7-server.mjs`)로 추출해 CLI(`serveAuth`)와 Nest provider가 **동일 코드 경로**로 와이어 서버를 start/stop. `start:nest`=`node --import tsx src/app/main.ts` 추가.
  - 게이트(달성): `tools/logh7_nest_phase0_smoke.mjs` — Nest 경로 로그인 응답이 `serve-auth`와 **36B 바이트 동일** + 생명주기(boot→probe→`app.close()`→포트 해제) PASS. `npm run test:server` **1069/1069 그린**(코어 무변경). `tsc --noEmit` 0, `vite build` 무회귀.
  - git(Phase 0 범위 밖): 레포 워킹트리 git이 비어 있었고(.git에 `info/`만) **사용자 지시로 `.git` 삭제 → 현재 non-git**. 커밋/SHA 워크플로우 쓰려면 `git init` 신규 필요.
- **Phase 1 — Drizzle 영속화**: accounts/runtime-state/content 스키마 정의 → 기존 account store / world-state 스냅샷 인터페이스 뒤에 Drizzle 구현. node:sqlite 경로는 패리티 확인까지 폴백 유지. Drizzle repo 테스트 추가.
  - **드라이버 결정(2026-06-21)**: drizzle-orm 0.45.2엔 **node:sqlite 드라이버 없음**(better-sqlite3/libsql/bun-sqlite 등만; better-sqlite3 세션은 `stmt.raw()` 호출 → Node `DatabaseSync`로 구동 불가). 사용자 결정 = **better-sqlite3 추가(풀 Drizzle ORM)**. `better-sqlite3@12`(prebuilt, node-gyp 불필요) + `@types/better-sqlite3` 설치.
  - **accounts 슬라이스 ✅완료(verifier 7/7)**: `src/app/persistence/{accounts.schema,drizzle-account-persistence}.ts` — 기존 `logh7-account-registry.mjs` node:sqlite 영속화의 드롭인 미러(동일 DDL·DELETE 저널·DELETE+bulk INSERT·characters_json). **byte/스키마 패리티 5/5**(cross-read 양방향·`PRAGMA table_info` 동일). 코어 무수정·라이브 경로 node:sqlite 유지. `drizzle.config.ts`+`drizzle/0000_accounts_init.sql`. 테스트 `npm run test:drizzle`(tsx 레인, `test:server` 1069 불변). 사이클 로그 `docs/logh7-loop-state.md`.
  - **후속**: 라이브 레지스트리 Drizzle 플립(주의: `npm start`=plain node는 .ts/drizzle 직접 import 불가 → 빌드 스텝 또는 Nest/tsx 부트 전제) → runtime-state/content 스키마.
- **Phase 2 — 도메인 Nest 모듈화**: login-session/command-engine/world-state/combat/personnel/economy/coup/intel/espionage를 DI provider로(순수 모듈 위 얇은 래퍼). 어드민/리소스 HTTP를 Nest 컨트롤러로.
- **Phase 3 — 설정/생명주기**: `logh7-config.mjs`의 LOGH_* 플래그를 Nest ConfigModule로. graceful shutdown, health 엔드포인트.
- **Phase 4 — server/ 패키지 + 레포 분리**: 독립 `server/`를 Nest 앱으로 재생성, repo-split-plan 갱신, CI.
- **Phase 5 (선택) — 테스트 러너 통합**: 통합/e2e 추가. 순수 골든-헥스는 node:test 유지 권장.

## 4. 트레이드오프 (정직 기록)

- 현재 코어는 **의존성 0**이고 바이트 정확 + 1069 테스트로 안정적. Nest+TS+Drizzle는 **큰 의존성·빌드 툴체인**을 더하고, Nest의 HTTP-중심 모델은 **raw TCP 바이너리 프로토콜에 직접적 이득이 적다**(와이어 서버는 "Nest가 관리하는 서비스"로 들어갈 뿐). 동접이 낮아 성능 이득도 미미.
- 따라서 가치는 주로 **구조화/DI/타입/영속화(Drizzle)와 향후 웹 어드민 확장**에 있다. 이 점을 감안해 **코어 순수 로직은 보존**하고 프레임워크는 합성/생명주기/영속화/HTTP에 한정하는 것이 리스크 대비 효용 최적.
- 위험: 마이그레이션 중 바이트 회귀(→ node:test 골든-헥스가 방어), 빌드 복잡도, server/ 미러 동기화.

## 5. 즉시 다음 (Phase 1 착수)

Phase 0 완료(2026-06-21, verifier PASS). **다음 = Phase 1(Drizzle 영속화)**: accounts/runtime-state/content 스키마 정의 → 기존 account store / world-state 스냅샷 인터페이스 뒤에 Drizzle 구현. node:sqlite 드라이버 우선(Node24 내장, zero-dep 유지), 미지원 시 better-sqlite3. node:sqlite 경로는 패리티 확인까지 폴백 유지. Drizzle repo 테스트 추가, 매 단계 1069 그린.
