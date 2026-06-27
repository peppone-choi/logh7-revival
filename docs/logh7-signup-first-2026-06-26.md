# W1 signup-first 실계정 흐름 정합 (2026-06-26)

캐논 서버: `server/`. accept-any 우회가 아니라 **진짜 회원가입 → strict 로그인** 정합 확인 + 오라클 추가. 추측 P0 없음. 직렬 테스트 권위.

## 1. signup / strict 현황 (코드 확인)

- **회원가입(out-of-band)**: `logh7-admin.mjs` `adminCreate(dbPath, account, password)` →
  `createAccountRegistry.register`(scrypt N=cost, salt) 재사용. password는 `buildGin7Credential({account,password})`로
  **byte-exact GIN7 0x7000 블롭**을 만들어 그 블롭 전체를 해싱한다. 따라서 실클라가 같은 id/pw로 보내는 블롭과
  동일 → strict verify 통과. SQLite 전용(`*.sqlite/*.db`), JSON은 seed-only.
- **strict 인증**: `logh7-login-session.mjs` `createAccountStore({acceptAnyGin7=false 기본, registry, allowRegister})`.
  registry가 배선되면 계정 라벨이 권위: `registry.has(account)` → `registry.verify`(timing-safe + 락아웃),
  미등록은 `allowRegister`면 TOFU 등록, 아니면 `dummyVerify`(anti-enumeration) 후 일반 사유로 거부.
- **운영 엔트리**: `logh7-server.mjs` `createServeAuthAccountStore({accountDbPath})`.
  accountDbPath 있으면 `acceptAnyGin7:false` + registry 배선(strict 회원가입 경로),
  없으면 `acceptAnyGin7:false` 시드-only(여전히 strict). accept-any는 `LOGH_ACCEPT_ANY_GIN7=1` 명시 opt-in만.
- `buildGin7Credential('inei00','dummy')` = `700047494e37...640075006d006d00790000` — 문서 캡처와 byte-exact 재확인.

## 2. signup-first 정합 (동작 확인)

`adminCreate(db,'inei00','dummy')` → SQLite 영속 → `createServeAuthAccountStore({accountDbPath:db})`(운영 팩토리)
재적재 → `authenticate(buildGin7Credential('inei00','dummy'))` = `{ok:true, account:'inei00', matchedBy:'password'}`.
회원가입 CLI 쓰기와 라이브 서버 strict 스토어가 **같은 파일에서 상호운용** 확정.

## 3. 빈값 처리 (핸드오프 #2 연관)

- 회원가입 단계: 빈 계정 id → `{ok:false,'account id is required'}`, 빈 password → `{ok:false,'password is required'}`
  (`adminCreate` 가드). 미등록/오답은 strict에서 동일 일반 사유 `'authentication failed'`(계정 존재 누출 방지).
- 로그인 단계: 빈 버퍼·쓰레기 바이트는 GIN7 형식 미통과로 거부. 빈 password 블롭(미등록 계정)도 거부.
- strict 기본 + DB 미지정: 가입 전엔 모든 자격증명 거부(`'credential not registered'`, accept-any 폴백 없음).

## 4. 오라클 (신규)

`tests/server/logh7-signup-first.test.mjs` 6 테스트 — **운영 팩토리 `createServeAuthAccountStore`** 경유:
가입→strict 로그인 PASS / 미등록 거부 / 오답 거부(동일 사유) / 빈 id·빈 pw 가입 거부 / 빈·쓰레기 블롭 로그인 거부 /
DB 미지정 strict 거부. (기존 `logh7-admin.test.mjs`도 adminCreate→strict authenticate 왕복을 이미 커버; 신규는
직접 조립이 아닌 **서버 실엔트리 팩토리**로 W1 계약을 통합·고정.)

## 5. 테스트 (직렬, 권위)

`cd server && node --test tests/server/*.test.mjs` (단일 프로세스 직렬):
**1193 tests / 1175 pass / 0 fail / 18 skipped** (이전 1187/1169 → +6 신규 전부 PASS, 무회귀).

## 6. 라이브 대기 (수동 로그인)

서버측 signup-first 정합·오라클 완료. 라이브 측은 **autologin 금지 = 실유저 수동 로그인** 전제로 대기:
`adminCreate`로 실계정 생성 → `--account-db state/accounts.sqlite`(`npm start` 기본)로 strict 서버 기동 →
실클라 로그인 창(640×480 테두리)에서 같은 id/pw 수동 입력 → strict 통과 검증.
로그인 입력 레이어 클릭/Enter 통과는 기지 미해결 이슈(메모리 logh7-login-input-layer-blocked)로 별도 트랙.
