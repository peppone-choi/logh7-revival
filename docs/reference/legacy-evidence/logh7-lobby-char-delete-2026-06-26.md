# 로비 메뉴 핸들러 현황 + 캐릭터 삭제 영속 구현 (2026-06-26)

목표(W5/W4): 사용자 "Reinhard 삭제→새로". 로비 메뉴 5종 서버 핸들러 현황 점검 +
캐릭터 삭제를 계정 프로필에 영속 반영(재로그인 부활 방지) + 재생성 distinct 보장. 캐논 `server/`.

## 1. 로비 메뉴 5종 서버 핸들러 현황 (RE-확정 근거)

메모리 좌표 vs 와이어 핸들러 대조. 메뉴 라벨(클라 진입)과 실제 C->S opcode는 별개 축이다.

| 메뉴(좌표)              | 와이어 opcode                          | 서버 핸들러 위치                          | 상태 |
|------------------------|----------------------------------------|------------------------------------------|------|
| 게임 시작(150,200)     | 0x2009 LobbySessionLoginRequest→0x200a | login-session `LOBBY_SESSION_LOGIN_REQUEST_CODE` | 구현됨 |
| 새 캐릭 작성(150,255)  | 0x1008 CommandGenerateCharacterCharge  | login-session `CMD_GENERATE_CHARGE_CODE`(2235) | 구현됨 |
| 캐릭 삭제(150,375)     | **0x2008 LobbyCommandDeleteCharacter** | login-session `LOBBY_CMD_DELETE_CHARACTER_CODE`(2362) | **이번 보강** |
| 세션 변경(150,435)     | 0x2005 RequestInformationSession→0x2006| login-session `LOBBY_REQ_INFO_SESSION_CODE` | 구현됨 |
| 환경 설정(150,495)     | 클라-로컬(GraphicConfig.txt 등)        | 서버 와이어 없음(클라 설정 파일)          | N/A(서버 무관) |

- **RE 확인(redex)**: 클라 문자열 `LobbyCommandDeleteCharacter`@0x00765d2c, 빌더
  `FUN_0043f070`이 단일 필드 `session_id`(=`*param_1`=캐릭 id)를 [u32]로 직렬화.
  로비 패밀리 idx+0x2000 ⇒ opcode **0x2008**(login-protocol.mjs:109와 일치).
- "환경 설정"은 D3D8/해상도 등 클라-로컬 설정이라 서버 와이어 핸들러 대상이 아니다(추측 P0 금지 — 없는 opcode를 만들지 않음).

## 2. 캐릭터 삭제 — 구현/배선

**진단(근본)**: 기존 0x2008 핸들러는 작업용 `lobbyCharacters` 배열만 splice 하고
계정 프로필(영속)은 건드리지 않았다. 캐릭 생성(0x1008)은 `saveGeneratedProfile`→
`registry.addProfileCharacter`로 영속되므로, 삭제 후 재로그인하면
`loadAccountProfileCharacters`가 프로필에서 다시 로드 → **삭제한 캐릭이 부활**(사용자 증상).

**변경(3곳, 모두 캐논 `server/`)**:
1. `logh7-account-registry.mjs` — `removeProfileCharacter(account, characterId)` 추가:
   대상 있으면 영속(persist) 제거 후 `true`, 없으면 no-op `false`(멱등).
2. `logh7-login-session.mjs` 스토어 어댑터 — `removeProfileCharacter` 위임 메서드 추가.
3. `logh7-login-session.mjs` 0x2008 핸들러 — ①로비 로스터 splice ②프로필 영속 제거
   ③활성/추첨 선택이 삭제 대상이면 비움 ④`nextCharId` 단조 증가 보호. 삭제 id를
   trace(`deletedCharacterId`)로 노출.

## 3. distinct 재생성

`nextCharId`는 절대 되돌아가지 않는다(삭제 시 `Math.max(nextCharId, max+1)` 가드).
따라서 삭제 직후 0x1008 재생성은 옛 id를 재사용하지 않고 **새 id**를 발급 →
별개 캐릭(다른 id·다른 이름). 오라클 3에서 Reinhard(oldId) 삭제 → Yang(newId≠oldId) 검증.

## 4. 오라클(테스트, `tests/server/logh7-login-session.test.mjs` 말미 + 레지스트리 단위)

1. 0x2008 삭제가 로비 카드 목록 + 영속 프로필 **둘 다**에서 제거(`loadAccountRecords` 0건).
2. 삭제 후 재로그인 시 로스터가 빈 채로 유지(부활 없음).
3. 삭제→재생성 distinct(newId≠oldId, 새 이름, 프로필 1건).
4. 레지스트리 단위: `removeProfileCharacter` 영속 제거 + 멱등(미존재 false).

와이어 바디는 RE-확정 형태 `[u16 BE 0x2008][u32 LE characterId]`로 합성.

## 5. 테스트(직렬, 권위)

`cd server && node --test --test-concurrency=1 tests/server/*.test.mjs`
→ **tests 1197 / pass 1179 / fail 0 / skipped 18**. 무회귀(이전 베이스라인 1187에서 신규 오라클만 증가).

## 6. 라이브 대기

서버 측은 byte-correct + 직렬 테스트로 확정. 실클라 삭제 버튼(150,375) 클릭→0x2008 송신→
카드 재렌더는 in-world/로비 입력 레이어 검증이 필요(logh7-live, autologin 금지=실유저 수동).
로비 영역은 C002 비게이트라 라이브 검증 가능 — 다음 사이클에서 ui_explorer로 삭제→재생성 왕복 확인.
