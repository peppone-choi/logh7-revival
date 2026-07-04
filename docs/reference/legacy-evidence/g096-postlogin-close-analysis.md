# G096 — 로그인 직후 연결 닫힘 정적 RE 분석

작성일: 2026-06-10
대상: `G7MTClient.exe` (PE32 x86, image base `0x00400000`)
방법: 정적 디스어셈블(capstone) + G095 런타임 ring 증거 교차검증 + 5-에이전트 워크플로(적대적 검증 포함)

## 결론 (검증됨)

로그인/world 응답 직후 클라이언트가 TCP 연결을 닫는 이유는 **에러가 아니라
"등록된 메시지 핸들러가 0개"** 이기 때문이다.

- 각 연결 객체는 `connection+0x14`에 **메시지-핸들러 매니저** 객체 포인터를 갖는다.
  이 매니저는 **존재하고 non-null** (클라가 생성).
- 매니저 내부 `manager+0x14`는 **`std::map<u16 opcode, handler>`(MSVC 레드블랙 트리)의 root**.
  런타임에 이 root가 **null(빈 맵)** 이다. (G095 ring: `loadedEsi=0`, `branchTaken=1`)
- 메시지 라우터 `0x006130a0(reader, manager)`는 reader에서 BE u16 opcode를 읽어
  매니저 맵에서 핸들러를 찾는다. 맵이 비면 `0x00613150` →
  `0x00614b30`(closesocket ord3 + free) → 0 반환 → 디스패치 루프 종료 → **연결 종료**.

opcode `0x30`만 맵 없이 처리되는 특수(부트스트랩) 경로(`0x00613169` → vtable `[edx+0x18]`)이며,
서버가 보내는 `0x0001/0x0003/0x0013/0x0014`는 전부 맵 경유라 맵이 비면 즉시 닫힌다.

## 핵심 주소 맵

| 주소 | 역할 |
|------|------|
| `0x006122c0` | 디스패치 루프. `[conn+4]`=transport reader, `[conn+0x14]`=핸들러 매니저를 라우터에 넘기며 반복 |
| `0x006130a0` | 메시지 라우터(닫기 아님). `mov esi,[esp+0x1c]`=arg2=매니저. 내부 `0x00613108 mov esi,[esi+0x14]`로 맵 root 로드 |
| `0x00613108` | `mov esi,[manager+0x14]; test; je 0x613150` — root null이면 닫기 분기 |
| `0x00613920` | `std::map::lower_bound` — node: `[node]`=left,`[node+8]`=right,`[node+4]`=parent,`word[node+0xc]`=opcode key; nil sentinel 전역 `0x03350928` |
| `0x00613150` | cleanup: `0x00614bb0`(pending 폐기) + `0x00614b30`(closesocket+free) → 닫힘 |
| `0x00614c70` | opcode peek: BE u16 `ntohs`(`0x00640b36`=WS2_32 ord15) |
| `0x00612100` | 연결 초기화. `0x0061213d`에서 `[conn+0x14]=0`(null로 시작) |
| `0x00612030` | 팩토리. 가드 통과 시 `0x006120b2 mov [conn+0x14], eax`로 매니저 부착 |
| `0x006127d0` | 매니저 생성자. 맵 채움 `0x006129e3 mov [mgr+0x14], esi`; **null 분기 `0x00612af7`** (descriptor `[esp+0x44]==0` 또는 count `[esp+0x48]<=0`) |
| `0x006136b0` | `std::map::insert`(노드 할당 `operator new(0x14)`); 호출 3곳 모두 파서 `0x006124f4`대 내부 |
| `0x004ac0c9` / `0x004ad864` | 팩토리 호출부. arg4 = `[ebp+0x14] & mask` 또는 0 (조건부 `0x004ac095`) |

## 남은 단일 미지수 = 런타임 값

정적으로는 메커니즘이 완전히 규명됐다. 맵이 비는 직접 원인은 **런타임 값**이라 정적 RE로는
더 좁힐 수 없다. 둘 중 하나(또는 복합):

1. 팩토리 `0x00612030` 가드 실패 — 특히 **arg4(`[ebp+0x14] & mask`)가 0**이면 첫 가드(`0x00612037`)에서
   실패해 매니저/맵이 아예 안 만들어진다. (워크플로 prime suspect)
2. 생성자 `0x006127d0`에 넘기는 **handler descriptor 포인터(`[esp+0x44]`)가 0 또는 count(`[esp+0x48]`)<=0** →
   `0x00612af7` null 분기 → 빈 맵.

## 런타임 확인 (G097/G098, 실클라 QA)

정적 미지수를 실제 클라이언트 프로브로 확정했다.

- **G097 (팩토리 진입 `0x00612030` 인자 프로브)**: 세션당 팩토리 2회 호출, **두 호출 모두 가드(arg5~9) 통과** →
  팩토리 가드 실패는 원인이 아니다. (주의: 초기 디코더가 가드 오프셋을 arg10으로 오라벨해 "arg10 bails"로 잘못
  표기 → arg5/6/7/8/9로 수정함.)
- **G098 (생성자 `0x006128f5` descriptor/count 프로브)**: ctor 2회 호출, **두 호출 모두 `descriptor=NULL`, `count=0`**
  (managerThis `0x05423810`, `0x05423100`) → ctor가 null 분기 `0x00612af7`를 타 **핸들러 맵을 빈 채로 생성**.

결론: **핸들러 맵은 생성 시점에 의도적으로 비어 있다(descriptor=NULL/count=0).** 핸들러는 이후 `std::map::insert`
(`0x006136b0`, 파서 `0x006124f4` 내부 3곳)로 **동적 등록**되어야 한다. 등록이 일어나지 않아 맵이 빈 채 남고,
첫 non-0x30 프레임 라우팅이 실패해 닫힌다.

### descriptor 출처 추적 (정적)

- 팩토리 호출부 `0x004ac0c9`/`0x004ad864`: descriptor 인자 = `&[session+0x14]` (session this 비-null이라 포인터 자체는
  non-null; G097 프로브의 arg5=0x053b3434와 일치).
- ctor가 본 descriptor=NULL/count=0(G098)은 ctor가 `[session+0x14]`가 가리키는 **컨테이너를 역참조했더니 비어 있음**(요소 0개).
- insert `0x006136b0`의 호출자 3곳은 **전부 ctor `0x006127d0` 내부**(count>0 build 경로). 즉 별도 동적 등록 경로가 없고,
  맵은 **`[session+0x14]` 디스크립터에서만** 채워진다 — 그게 비어 있다.

**재구성된 결론:** 핸들러 맵은 **서버가 채우는 것이 아니라 클라가 자신의 session state `[session+0x14]`에서 채운다.**
그 session 핸들러 테이블이 빈 것은 **클라가 "핸들러를 가진 로그인된 session"으로 초기화되지 못했다**는 뜻이다.
핸드셰이크(0x0034~0x0036)는 진행되지만 직후 session 초기화/핸들러 로드가 일어나지 않는다.

다음 미지수: **무엇이 `[session+0x14]` 핸들러 테이블을 채우는 session 초기화를 유발하는가.** 서버가 직접 핸들러를
주입할 수는 없으므로, 클라가 로그인된 session을 구성하도록 만드는 응답 시퀀스/상태 전이를 찾아야 한다(G084의
"프레임이 decoded-response dispatcher 미도달"과 동일 상류 원인).

### G099: 응답 수락 검증 (실클라 enqueue 프로브) — 결정적

decoded-message enqueue `0x004b8850`(`enqueue(ecx=client, [esp+4]=internalCode, [esp+8]=body)`)을 후킹.
세션 내내 **enqueue 0회 호출, 수락된 내부 코드 0개**. → 서버의 어떤 응답도(0x0035/0x0001/0x0003/0x0013/0x0014)
**내부 메시지로 디코드·수락되지 않는다.** 응답이 내부 디스패치 파이프라인에 전혀 도달하지 못함.

**end-to-end 확정 체인:** 전송 핸들러 맵 빈 상태(G098) → 전송 계층 라우팅 불가(G095) → 내부 디코드/enqueue 미도달
(G099) → 로그인 핸들러 미실행(게이트 0) → 닫힘.

**전략적 함의:** 서버가 메시지 바이트를 바꿔도 클라가 그것을 라우팅하지 못하므로(빈 맵) 직접적 해결이 안 된다.
핸들러 맵은 클라가 자기 session state에서 채우는 것이라 서버가 주입할 수 없다. 클라가 핸들러를 로드하는
내부 상태에 도달해야 한다.

**유력한 다음 가설:** opcode `0x30`은 빈 맵을 우회하는 특수 vtable 경로(`0x00613169` → `[edx+0x18]`)다.
클라는 0x0030을 **보낸다**. 서버가 응용 메시지를 0x0001/0x0013로 보내지 말고 **0x30 봉투로 감싸 보내면**
vtable 핸들러가 demux/등록할 수 있다(가설). 다음 RE: 0x30 vtable 핸들러 `[edx+0x18]`가 핸들러를 등록하는지 확인.

### G101: cipher 키 가설 제거 + 0x30/GIN7 채널 확정

- 클라의 0x0030(client->server)을 서버 phase1Key로 복호화 성공: `GIN7` 매직 + UTF-16 `inei00`/`dummy`
  (로그인 자격증명). → **클라는 phase1Key로 송신(encipher)**. phase3가 encipherKey/decipherKey 2개를 주는
  **비대칭 설계**.
- 가설 검증(env `LOGH_RESPONSE_KEY=decipher`로 응답을 decipherKey 인코딩): **enqueue 여전히 0건.**
  → **암호 키는 원인이 아니다.** 거부는 본문 복호화 이전, **전송 라우팅 계층(빈 맵, 평문 opcode 0x0001 읽고
  핸들러 없음)에서** 발생.
- 템플릿 `0x0076bbe8` = `"GIN7\0\0\0\0" + "{A4C13748-0159-4c54-AEB3-1D68575761B3}"`(=transportKey GUID).
  세션 셋업 `0x004ac070`(팩토리 동일 함수)이 GUID를 복사. GIN7 ref 1곳 `0x004ac1d2`.

**확정 결론(매우 중요):** **bare 0x0001/0x0013 전송코드는 절대 안 된다.** 클라가 처리하는 것은 핸드셰이크 코드 +
**0x0030**뿐. 응용 프로토콜은 **transport 0x0030의 `GIN7`+GUID 봉투**다. 서버는 0x0001/0x0013이 아니라
**0x0030/GIN7 봉투로 응답해야 한다.** 현재 서버 접근(bare 코드)은 근본적으로 틀렸다.

**남은 경로(확정):** (1) 0x0030 GIN7 봉투 포맷 완전 디코드, (2) 클라의 0x0030 수신 핸들러 RE로 기대하는
login-OK 응답 포맷 확보, (3) 서버 0x0030/GIN7 응답 빌더 구현, (4) enqueue 프로브로 검증(enqueue 발화 + 게이트 전환).

### G102~G105: 0x0030 봉투 = 서버가 보내야 할 채널 (실증 + 포맷 확정)

런타임 프로브로 확정:
- **bare 0x0001/0x0013은 첫 프레임에서 빈 맵에 걸려 소켓을 닫음** → 서버는 **0x0030만** 보내야 함
  (G103: 라우터가 0x0001 1회만 받고 닫힘; G104: 후보 억제 시 echo-0x0030이 라우터에 **opcode 0x0030,
  fastPath0x30=True**로 도달 = 빈 맵 우회).
- 0x30 fast-path 파서 = **`0x00645db0`** (vtable `0x0074572c` slot +0x18; G105 런타임 캡처).

**0x0030 봉투 와이어 포맷 (파서 `0x00645db0` 검증 로직에서 확정):**
```
transport frame:  [u16 BE len][u16 BE 0x0030][encrypted body]
body (복호화 후):  [u16 BE checksum][u32 BE id][u16 BE innerLen][innerLen bytes inner payload]
```
- 검증1: 디코드 길이 >= 8
- 검증2: (길이 - 8) >= innerLen
- 검증3: `checksum(@0)` == XOR-fold-to-u16( body[2 : 8+innerLen] )  (dword XOR 후 byte XOR, `(x>>16)^x`)
- 검증4: `id(@2)` <= `client+0x20` (시퀀스 상한; 성공 시 `client+0x20 = id`로 갱신)
- 성공: inner payload(innerLen)를 `connection+0x18` 버퍼로 복사 → 라우터가 inner 메시지 디스패치
- 클라 0x0030 디코드 `5517 00000001 0027 [payload]`와 일치 (checksum 0x5517, id 1, innerLen 0x27=39,
  payload `7000` + `GIN7` 매직 + ...).

**남은 일:** (1) sub-parser(`[this+0xc].vtable+0x10`) 복호화 키 확인, (2) inner payload 포맷(`7000`+GIN7+...)
및 login-OK 응답 메시지 해독, (3) 서버 0x0030 빌더 구현(checksum 포함) → enqueue/게이트 검증.

### G106: cipher + 봉투 실클라 정합 확인 (echo 수락)

`src/server/logh7-envelope-0030.mjs` 구현(build/parse/checksum) + 테스트 5개 통과(클라 메시지 byte-exact round-trip,
checksum 0x5517 재현).

**결정적 검증:** echo-0x0030(클라 자신의 0x0030을 decipherKey로 재인코딩) 전송 후 g104 트레이스에서 **조기 close
없음** — 연결이 25.5초간 유지되다 하니스 타임아웃 kill(ECONNRESET). 파서 거부 시 즉시 `0x614b30` closesocket이
발동하므로, 조기 close 부재 = **파서가 echo-0x0030을 수락**. → **decipherKey 암호 + 0x0030 봉투 포맷이
실클라에 정합 확정.** 서버가 클라가 수락하는 0x0030을 보낼 수 있음이 증명됨.

남은 단 하나: **올바른 inner 메시지(login-OK)**. echo는 클라 자신의 로그인 *요청*(inner `7000`+GIN7+inei00/dummy)이라
무반응. inner 메시지 디스패치: 라우터가 `payload[hdr]` ntohs 코드를 0x31과 비교(특수) 또는 vtable `[ebp+4]` 처리.
다음: inner 메시지 타입 → 내부코드(0x0200 SSLoginOK) 매핑 해독 → 서버가 보낼 login-OK inner 조립.

## 다음 액션 (정책 문서 2~3단계)

**타깃 런타임 프로브**: `0x00612030`(팩토리)와 `0x006127d0`(생성자) 진입을 후킹해
`arg4`, `[esp+0x44]`(descriptor ptr), `[esp+0x48]`(count), 그리고 `[ebp+0x14]`를 캡처한다.
→ 맵이 비는 정확한 트리거(클라 상태 vs 서버 응답 부족)를 확정한다.

그 결과에 따라 서버 수정 방향이 갈린다:
- 트리거가 **핸드셰이크 미완성(클라 상태 0)** 이면 → 암호/프레이밍을 맞춰 로그인을 실제로 성사시키는 것이 우선.
- 트리거가 **서버 응답이 핸들러 등록을 유발하지 못함** 이면 → 등록을 유발하는 응답 시퀀스를 찾는다.

## 서버 스택 (확정)

런타임 **Node.js 유지** + 메시지 바이너리 레이아웃에 **JSDoc/TS 타입 보강**.
근거: 병목은 서버 성능이 아니라 프로토콜 정확도이며, child-codec 암호·BE 프레이밍·핸드셰이크가
이미 구현되어 동작(서버 테스트 25개 통과)하므로 언어 교체 이득이 없다.
