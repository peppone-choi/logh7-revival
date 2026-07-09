# Claude Handoff - 2026-06-10

## ★ G132 돌파구 (2026-06-10 후속): 0x7001 = lobby 서버 리다이렉트

`FUN_0060fcc0`(loginIdLookup) Ghidra 디컴파일로 확정: `param_5+4`를 `"%d.%d.%d.%d"`(0x7b5c3c) 포맷으로
**IPv4 주소 문자열**로 변환한다(A=low byte). 즉 **inner `0x7001`은 lobby/game 서버 리다이렉트**다:
`param_5+4`=서버 IP, `param_5+8`(word)=port, `param_5+0xc`=token. handler가
`method+0x14(conn+0x24, IP문자열, port, 1)`로 연결을 지시한다.

**실증(G132, LHE1 ring + trace):** second 0x0030 inner =
`70010000000000000100007fbb1c0000000100000000` (IP 127.0.0.1, port 0xbb1c=47900, token 1) 전송 시:
- LHE1: `param_5+4=0x0100007f`, `param_5+8=0xbb1c`, `param_5+0xc=1` (정확히 일치).
- trace: 연결1(login+0x7001) 후 **클라가 연결1을 닫고 127.0.0.1:47900에 연결2로 재접속**, 연결2에서
  핸드셰이크 후 **0x30 20바이트(연결1의 52바이트 login과 다른 lobby join)** 송신.
- 즉 **0x7001 IP 리다이렉트가 작동하여 클라가 로컬 lobby 서버로 재접속한다.** 핸드오프 핵심 관문 해결.

증거: `.omo/ulw-loop/evidence/g132-ring.json`(LHE1), `g132-trace.jsonl`(2연결). 원본 EXE SHA 복원 확인됨.
필수 env: `LOGH_RESPONSE_KEY=decipher LOGH_ECHO_0030=1 LOGH_FORCE_0031=1 LOGH_SUPPRESS_CANDIDATES=1`
+ `LOGH_SECOND_0030_INNER_HEX=70010000000000000100007fbb1c0000000100000000`
+ `LOGH_SECOND_0030_KEY_HEX=47494e370001000000070069006e006500690030003000000600640075006d006d00790000`.

**연결2 lobby join 디코드 완료:** conn2 0x30(20B) = 봉투(checksum 0x2600, id 1, innerLen 6) +
inner `00200000 0001` → **inner code 0x0020 + ID 0x00000001**. 로그인 연결의 GIN7(52B)과 달리 lobby join은
inner code **0x0020**(6바이트)이다. conn2 0x36은 conn1과 바이트 동일(정적 ready). conn2 0x34는 새 phase1Key.

**다음 관문(lobby 프로토콜):** 서버는 연결을 구분해야 한다 — 클라 0x30 inner가 GIN7 login(52B)이면 0x7001
리다이렉트, inner code 0x0020(lobby join, 20B)이면 **리다이렉트 금지 + lobby/world-init 응답**.

**G133 진행:** 하니스에 연결 구분 게이트 `LOGH_REDIRECT_LOGIN_ONLY=1` 추가(client inner innerLen>8=login→리다이렉트,
innerLen<=8=lobby→리다이렉트 금지). 실클라 확인: conn0(login) frameCount=2(리다이렉트), conn1(lobby join 0x0020)
frameCount=1(리다이렉트 안 됨) — 게이트 동작 + 무한 루프 해소. 단 conn1은 echo만으론 여전히 닫힘.

**G134 발견:** ctor 프로브 — login+lobby **양쪽 연결 모두 빈 핸들러 맵**(descriptor NULL/count 0). 즉 lobby
연결도 동일하게 0x30/0x31 fast-path만 작동(populated map 가설 기각). lobby 응답도 0x0030 forced-0x31(keysetup)
+ GIN7-keyed 후속 0x0030으로 LoginProcessorImp에 메시지를 넣는 구조여야 한다.

목표 = **실서버 기반 수백~수천명 동접**. 다음 작업:
1. lobby 연결에서 0x7002 계열(LoginProcessorImp.handle_message 0x7002: `DAT_0076bbe4=byte[param_5+2]` + list
   cleanup + obj+0x91=1) 테스트 — lobby join(0x0020) 이후 서버가 forced-0x31 + 0x7002 GIN7 메시지를 보내 world/lobby
   진입을 유발하는지. (단 lobby keysetup 키는 lobby join 0x0020 content 기반이라 login GIN7 키와 다를 수 있음.)
2. lobby→world inner message code/포맷 Ghidra RE.
3. 하니스 env-hack을 src/server 연결별 상태머신(login→lobby→world→play) 정식 구현으로 이관 → 동시성/확장.

## 현재 결론 (G132 이전)

아직 게임은 playable session에 들어가지 못했다. 다만 `0x004ad7e0` 세션 매니저 셋업은 현재 관문이 아니다. G113/G119/G120 증거상 GUI 로그인 경로에서 robot/autoclient setup chain은 이미 `0x004ad710/0x004ad780` 쪽으로 도달한다. 현재 실제 관문은 forced inner `0x31` 이후, 두 번째 server->client `0x0030` 안의 post-key lobby inner body다.

`0x004ac700` `LoginProcessorImp::handle_message`는 `param_2 == 0x7001` 또는 `0x7002`만 처리한다. 이번 턴에서 새 `LHE1` handler-entry ring probe로 `0x7001`이 실제 handler까지 도달함을 확인했다.

핵심 신규 발견:

- `0x7001` inner는 handler까지 도달한다.
- `param_5+4`, `param_5+8`, `param_5+0xc`는 클라이언트 주소 포인터가 아니라 서버 payload에서 온 selector/ID 필드다.
- 따라서 다음 작업은 클라이언트 메모리 포인터를 body에 넣는 것이 아니라, `FUN_0060fcc0` / 주변 테이블이 받아들이는 올바른 ID 값을 찾는 것이다.

## 설치/도구 상태

Ghidra는 portable 설치 완료:

- `C:\Users\user\AppData\Local\Programs\Ghidra\ghidra_12.1.2_PUBLIC`
- `GHIDRA_HOME` / `GHIDRA_HEADLESS` 사용자 환경변수 등록됨
- Ghidra local project는 `.omo` 같은 dot-dir에서 실패하므로 기본 project dir은 `%TEMP%\logh7-ghidra-project`를 사용한다.

`omo sparkshell`은 현재 git-bash PATH에서는 `command not found`였다. 일반 git-bash와 Python/Node 명령은 동작한다.

## 이번 턴에 추가한 파일

- `tools/logh7_login_handler_entry_probe_patch.py`
  - hook: `0x004ac726`
  - original: `8b44244025ffff0000`
  - continuation: `0x004ac72f`
  - ring magic: `LHE1`
  - ring VA 예: `0x0066ae15`
  - safe-mode: `param_5` dwords만 기록한다. `param_5+4/+0xc`를 포인터 follow하면 `0xc0000005` 접근 위반이 난다.
- `tools/tests/test_logh7_login_handler_entry_probe_patch.py`

검증:

```powershell
python -m py_compile tools/logh7_login_handler_entry_probe_patch.py tools/tests/test_logh7_login_handler_entry_probe_patch.py
python -m unittest tools.tests.test_logh7_login_handler_entry_probe_patch
```

결과: 2 tests OK.

주의: LSP ruff server는 기존 환경 문제로 계속 `--preview needs to be provided` 오류를 낸다. 실제 py_compile/unittest로 검증했다.

## 핵심 증거 파일

Patch/manifest:

- `.omo/ulw-loop/evidence/g127-login-handler-entry-safe-patch.json`
- `.omo/ulw-loop/evidence/g127-G7MTClient.login-handler-entry-safe.exe`

실제 클라이언트 QA:

- `.omo/ulw-loop/evidence/g128-7001_pattern_lhe1-trace.jsonl`
- `.omo/ulw-loop/evidence/g128-7001_pattern_lhe1-result.json`
- `.omo/ulw-loop/evidence/g128-7001_pattern_lhe1-ring.json`
- `.omo/ulw-loop/evidence/g129-7001_zero-lhe1-trace.jsonl`
- `.omo/ulw-loop/evidence/g129-7001_zero-lhe1-result.json`
- `.omo/ulw-loop/evidence/g129-7001_zero-lhe1-ring.json`

원본 EXE 복원 확인:

- `.omo/ulw-loop/evidence/g128-restore-sha256.txt`
- `.omo/ulw-loop/evidence/g129-restore-sha256.txt`
- 두 파일 모두 `.omo/work/logh7-installed/exe/G7MTClient.exe`와 backup SHA가 `2848be76a7662e25159353463bdfd8ff2f270ac5845ef4cea62983443c155345`로 일치한다.

## G128: 0x7001 pattern body 결과

보낸 second inner:

```text
700100000000112233445566778899aabbccddeeff00
```

필수 env:

```text
LOGH_RESPONSE_KEY=decipher
LOGH_ECHO_0030=1
LOGH_FORCE_0031=1
LOGH_SUPPRESS_CANDIDATES=1
LOGH_SECOND_0030_KEY_HEX=47494e370001000000070069006e006500690030003000000600640075006d006d00790000
```

`LHE1` ring:

```json
{
  "param2Hex": "0x7001",
  "param5DwordsHex": [
    "0x053b1122",
    "0x33445566",
    "0x00007788",
    "0x99aabbcc",
    "0x00000000",
    "0x00000000"
  ]
}
```

해석:

- body payload `11 22`가 `param_5+0` low word에 들어간다. high word는 run-dependent 값이다.
- payload `33 44 55 66`이 `param_5+4`로 들어간다.
- payload `77 88`이 `param_5+8` low word로 들어간다.
- payload `99 aa bb cc`가 `param_5+0xc`로 들어간다.
- 마지막 `dd ee ff 00`은 이 handler가 읽는 첫 0x18 bytes 안에는 나타나지 않았다.

## G129: 0x7001 zero body 결과

보낸 second inner:

```text
70010000000000000000000000000000000000000000
```

`LHE1` ring:

```json
{
  "param2Hex": "0x7001",
  "param5DwordsHex": [
    "0x035d0000",
    "0x00000000",
    "0x00000000",
    "0x00000000",
    "0x00000000",
    "0x00000000"
  ]
}
```

해석:

- zero body도 `0x7001` handler까지 도달한다.
- close는 handler 이후의 semantic failure다.

## G130: 0x7002 결과

보낸 second inner:

```text
700200000000000000
```

결과:

- trace size 0, ringCounter 0.
- 이번 run은 클라이언트 연결/로그인 자동화가 실패한 반복으로 보인다. 이전에도 일부 run에서 trace 0이 간헐적으로 있었다. 이 결과로 `0x7002` body 구조를 판단하지 말 것.

## 중요한 실패/주의

G125:

- `LOGH_RESPONSE_KEY`를 설정하지 않고 기본 phase1 response key로 forced echo를 보내면 클라이언트 stderr:

```text
[mpsCipherManager] decipher_message: illegal cipher param length
```

- handler ringCounter 0. 즉 handler까지 못 간다.

G126:

- `param_5+4/+0xc`를 포인터로 follow하는 aggressive `LHE1` 버전은 `clientExit 3221225477` (`0xc0000005`)로 죽었다.
- 결론: `param_5+4/+0xc`는 클라이언트 주소가 아니다. body에서 온 값이다.

## 다음 작업

1. Ghidra로 `FUN_0060fcc0`, `FUN_004ab3e0`, `FUN_004ac900`, `FUN_004ac960`, `FUN_004ac4f0`를 focus dump한다.
2. 특히 `FUN_0060fcc0(auStack_20, *(param_5 + 4))`가 `param_5+4`를 어떤 ID/table key로 해석하는지 찾아라.
3. `0x7001` body layout을 아래처럼 잠정 모델링하고 후보를 만들 것:

```text
inner:
  70 01
  00 00
  00 00
payload interpreted by handler:
  +0 low word  <- payload[0:2]
  +4 dword     <- payload[2:6]
  +8 word      <- payload[6:8]
  +c dword     <- payload[8:12]
```

4. 올바른 `param_5+4` 후보는 메모리 포인터가 아니라 `FUN_0060fcc0`가 찾을 수 있는 값이어야 한다.
5. `0x7002`는 간헐적 launch 실패를 제거한 뒤 별도 재실행하라. handler branch는 `DAT_0076bbe4 = *(byte *)(param_5 + 2)`라 최소 구조가 훨씬 짧을 수 있다.

## 재현 명령 골격

원본 교체는 반드시 trap/restore로 감싼다. 예시는 g128 조건:

```bash
python -m tools.logh7_login_handler_entry_probe_patch patch \
  .omo/work/logh7-installed/exe/G7MTClient.exe \
  --out .omo/ulw-loop/evidence/g127-G7MTClient.login-handler-entry-safe.exe \
  --manifest-out .omo/ulw-loop/evidence/g127-login-handler-entry-safe-patch.json

env LOGH_RESPONSE_KEY=decipher \
  LOGH_ECHO_0030=1 \
  LOGH_FORCE_0031=1 \
  LOGH_SUPPRESS_CANDIDATES=1 \
  LOGH_SECOND_0030_INNER_HEX=700100000000112233445566778899aabbccddeeff00 \
  LOGH_SECOND_0030_KEY_HEX=47494e370001000000070069006e006500690030003000000600640075006d006d00790000 \
  python tools/logh7_real_client_world_init_probe.py .omo/work/logh7-installed \
    --trace-out .omo/ulw-loop/evidence/g128-7001_pattern_lhe1-trace.jsonl \
    --result-out .omo/ulw-loop/evidence/g128-7001_pattern_lhe1-result.json \
    --port 47900 \
    --timeout-seconds 16 \
    --memory-dump-out .omo/ulw-loop/evidence/g128-7001_pattern_lhe1-ring.bin \
    --memory-dump-address-hex 0x0066ae15 \
    --memory-dump-bytes 392

python -m tools.logh7_login_handler_entry_probe_patch decode \
  .omo/ulw-loop/evidence/g128-7001_pattern_lhe1-ring.bin \
  --out .omo/ulw-loop/evidence/g128-7001_pattern_lhe1-ring.json
```

## G135 (2026-06-10): 메시지 코드 아키텍처 확정 — `code = familyBase + index`

정적 RE로 **전체 프로토콜의 메시지 코드 체계**를 확정했다. 각 메시지 패밀리 = 하나의
`ParseSystem` 객체로, (a) 이름 문자열 포인터 배열(테이블), (b) 인스턴스 내 핸들러 배열
(`this+offset`), (c) **패밀리 베이스 상수**를 가진다. 이름→코드 lookup 메서드의 꼬리에서
`code = base + index` (u16)로 코드를 산출한다. 두 패밀리에서 동일 패턴을 검증했다.

### SS (로그인 서버) 패밀리 — base `0x200`
- lookup 메서드 `0x0044f120` (테일 `add eax, 0x200; mov word ptr [ecx], ax`), 핸들러 배열 `this+0x24`.
- 이름 테이블 A `0x00766ed0`, 테이블 B(코드가 xref) `0x00766ef0` (참조처 `0x0044f151`).
- 카탈로그(코드 = 0x200 + idx):

| code | name | dir |
|------|------|-----|
| 0x200 | SSLoginRequest | C→S |
| 0x201 | SSLoginOK | S→C |
| 0x202 | SSLoginNG | S→C |
| 0x203 | SSCharacterIDRequest | C→S |
| 0x204 | SSCharacterIDResponce | S→C (원문 오타 그대로) |
| 0x205 | SSGameLoginRequest | C→S |
| 0x206 | SSGameLoginOK | S→C |
| 0x207 | GlobalChat | both |

  → 기존 노트의 "0x0200 SSLoginOK / 0x0205 SSGameLoginOK"는 **오류**. 실제 SSLoginOK=0x201, SSGameLoginOK=0x206.

### Lobby 패밀리 — base `0x2000`
- lookup 메서드 `0x00446b10` (테일 `add eax, 0x2000; mov word ptr [ecx], ax`), 핸들러 배열 `this+0x34`.
- 이름 테이블 A `0x00765c88`, 테이블 B `0x00765cb8` (참조처 `0x00446b41`).
- 카탈로그(코드 = 0x2000 + idx):

| code | name | dir |
|------|------|-----|
| 0x2000 | LobbyLoginRequest | C→S |
| 0x2001 | LobbyLoginOK | S→C |
| 0x2002 | LobbyLoginNG | S→C |
| 0x2003 | LobbyRequestInformationCharacterCharge | C→S |
| 0x2004 | LobbyResponseInformationCharacterCharge | S→C |
| 0x2005 | LobbyRequestInformationSession | C→S |
| 0x2006 | LobbyResponseInformationSession | S→C |
| 0x2007 | LobbyCommandExtensionCharacterCharge | C→S |
| 0x2008 | LobbyCommandDeleteCharacter | C→S |
| 0x2009 | LobbySessionLoginRequest | C→S |
| 0x200a | LobbySessionLoginOK | S→C |
| 0x200b | LobbySessionLoginNG | S→C |

### 코드 레인지 종합(현재 이해)
- `0x0030`~`0x0036`: transport/handshake (envelope/암호 협상).
- `0x0200`~`0x0207`: SS(로그인 서버) 앱 메시지.
- `0x2000`~`0x200b`: Lobby 앱 메시지.
- `0x7000`~`0x70xx`: system/redirect (0x7001=lobby IP redirect, 0x7002 확인됨).
- (미확인) 게임/월드 패밀리: `mpsCTMsg32ParseSystem`가 별도 base를 가진다. 같은 방식으로 그 이름 테이블+`add eax,base` 테일을 찾으면 0x0f01 world / 0x0f03 grid 등 game 코드가 나온다.

### 추정 로그인→로비 시퀀스(코드 기준)
1. (SS conn) C `SSLoginRequest 0x200` → S `SSLoginOK 0x201`.
2. C `SSGameLoginRequest 0x205` → S `SSGameLoginOK 0x206` (또는 `SSCharacterIDRequest 0x203`→`0x204`).
3. S `0x7001` redirect(IP/port/token) → 클라가 lobby 서버로 재접속(검증됨).
4. (lobby conn) C `LobbySessionLoginRequest 0x2009` → S `LobbySessionLoginOK 0x200a`.
5. C `LobbyLoginRequest 0x2000` → S `LobbyLoginOK 0x2001`.
6. C `LobbyRequestInformationSession 0x2005` → S `LobbyResponseInformationSession 0x2006` (캐릭터/세션 목록).
7. 캐릭터 선택 → 월드 진입(게임 패밀리).

### 다음 RE 타깃(코드→와이어 브리지)
- `Output_SSLoginRequest::output_to_stream`(에러 문자열 `0x0076718c`) / `get_length`(`0x00767144`),
  `Input_SSLoginNG::input_from_stream`(`0x007671db`), `Input_LobbySessionLoginNG::input_from_stream`(`0x007662e3`)를
  **Ghidra focus dump로 클린 디컴파일**해서 코드(0x200+idx)가 0x0030 envelope의 어느 필드(u32 id vs inner[0:2])에
  실리는지, 각 메시지 페이로드 레이아웃을 확정한다. (linear capstone로는 에러 문자열이 imm32로 안 잡힘 → Ghidra 권장.)
- lookup 메서드 2개(`0x00446b10`, `0x0044f120`)도 focus 리스트에 추가하여 핸들러 배열(field+0x24/+0x34) 초기화
  생성자를 따라가면 활성 메시지/핸들러를 확정할 수 있다.

## G136 (2026-06-10): 캡처 프레임 오프라인 복호 성공 — 실제 와이어 코드 확정 (GROUND TRUTH)

기존 트레이스(g134-trace.jsonl)의 **암호화된 클라 0x0030 프레임을 오프라인 복호**하는 데 성공했다.
이것이 정적 RE 추정을 실제 바이트로 검증/정정한다. 재사용 도구: `tools/logh7_decode_0030_capture.py`
(`python -m tools.logh7_decode_0030_capture <trace.jsonl> [--out x.json]`). 산출물: `.omo/ulw-loop/evidence/g136-decoded-0030-capture.json`.

### 복호 레시피(검증됨)
1. transportKey = `{A4C13748-0159-4c54-AEB3-1D68575761B3}` (hex `7b41...7d`, GUID 문자열).
2. 클라 `0x0034` body를 transportKey로 schedule한 child-codec(GIN7 Blowfish ECB)으로 decode → phase1 payload
   `[u16 chk][u16 keyLen][encipherKey][u32 seq]` → **encipherKey** 추출.
3. encipherKey로 schedule한 codec으로 그 커넥션의 모든 클라 `0x0030` body를 decode = 평문.

### 실제 와이어 레이어링(확정)
- `0x0030` 평문 body = `[u16 BE checksum][u32 BE id][u16 BE innerLen][inner]`.
- **`inner = [u16 BE innerCode][payload]`** ← 이게 핵심. 앱 메시지 코드는 inner의 첫 u16.

### 복호된 실제 프레임
- **로그인 커넥션 첫 0x0030**: chk=0x5517, id=1, innerLen=39, **innerCode=`0x7000`**,
  payload = `47494e37...` = **"GIN7" 자격증명 블롭** = 길이-프리픽스 UTF-16BE 문자열 2개:
  `"inei00"`(login id, len 7 incl NUL) + `"dummy"`(password, len 6 incl NUL).
  → **즉 로그인 요청 = inner 0x7000 (GIN7 credential)**. 이 블롭은 기존 핸드오프의 `LOGH_SECOND_0030_KEY_HEX`와
  **바이트 동일** — 그동안 "key"로 오분류했으나 실제론 **로그인 자격증명 페이로드**다.
- **로비 커넥션(redirect 후) 첫 0x0030**: chk=0x2600, id=1, innerLen=6, **innerCode=`0x0020`**, payload `00000001`(u32=1).
  → 로비 진입 첫 메시지 = inner 0x0020.

### 0x7000 패밀리 재해석 (auth/session 레이어)
- `0x7000` C→S: GIN7 로그인 자격증명(= 로그인 요청).
- `0x7001` S→C: lobby/game redirect (IP/port/token) — 클라 핸들러 `0x004ac700` 확인됨, redirect 동작 검증됨.
- `0x7002` S→C: (미상, `DAT_0076bbe4 = byte[param_5+2]`).
- 정적 카탈로그의 SS(0x200+)/Lobby(0x2000+) 패밀리는 **상위 앱 메시지**이고, 0x7000/0x0020은 그보다 먼저 흐르는
  **세션/transport 진입 메시지**다. (둘은 다른 레이어 — 정적 카탈로그 G135는 여전히 유효, 단 진입 시퀀스는 0x7000→0x0020이 먼저.)

### 현재 blocker (다음 타깃)
로비 커넥션에서 클라가 inner `0x0020`(payload u32=1)을 보낸 뒤 **올바른 서버 응답이 없어 종료**된다.
harness는 echo(forced0031)만 했다. 다음 단계:
1. 클라의 **로비 inner-0x0020 응답 핸들러** RE — 0x0020 전송 후 어떤 inner 코드의 응답을 기대하는가?
   (post-key 핸들러 맵이 거의 비어 있어 0x31 fast-path / 0x7001 경로만 살아있다는 기존 관측과 교차검증할 것.)
2. 그 응답을 harness로 주입 → 실제 클라가 로비 다음 단계(LobbySessionLoginRequest 0x2009 또는 char-list)로 진행하는지 관측.
3. 동일 복호 도구로 클라의 후속 0x0030을 디코드해 다음 inner 코드를 확인 → 반복.

## G137 (2026-06-10): 디스패치 체인 클린 디컴파일 (Ghidra) — 닫힘 메커니즘·자격증명·라우터 확정

Ghidra 풀 디컴파일(`.omo/ulw-loop/evidence/g137-ghidra-dispatch-dump.json`, focus 20개). 프로젝트 저장됨 →
이후 dump는 `-process` 고속 모드. 핵심:

### 수신 디스패치 체인
- **transportRouter `0x6130a0`**: body decode 후 `innerCode = ntohs(inner[0:2])`.
  - `== 0x31` → keysetup(`vtable[+0xc][+4]`) 후 자기재귀로 다음 처리.
  - `!= 0x31` → **store-pending**: `conn+0x24=conn+0x28=inner데이터ptr, conn+0x2c=len, conn+0x30=1(flag)`, `return &conn+0x24`.
- **dispatch pump `0x612270`**(thin)→`0x614b10`: 루프에서 router 결과를 **handler lookup `0x612510`**으로 넘김.
- **handlerLookup `0x612510`**: `(*(*(*(conn+0x10))+8))(code)` — conn+0x10의 **메시지 시스템 객체**에 코드로 핸들러 질의.
  핸들러 없으면 drop(`0x612378`) = **로그인 직후 닫힘의 정확한 원인**.

### 처리기 종류 (handle_message 3종 + ParseSystem)
- `LoginProcessor::handle_message` `0x004ac700`: **0x7001/0x7002만** 처리. 그 외 "unsupported" 로그 후 drop.
  - 0x7001: `conn+0x94 = msg+0xc(token)`; `FUN_0060fcc0(msg+4)`로 IP 파싱; `(*(mgr+0x14))(conn+0x24, IP, msg+8(port), 1)`로 **로비 서버 재접속**. (redirect 동작 검증됨)
  - 0x7002: 연결 리스트(conn+0xc) cleanup + `conn+0x91=1`.
  - 재접속 시 신규 연결에 lifecycle 콜백 `FUN_004ac4f0`(connect=4/disconnect=0 알림, **메시지 디스패치 아님**) 등록.
- 로비는 **handle_message가 아니라 `mpsCTLobbyMsgParseSystemImp::parse_message`** 패턴(코드→등록핸들러 조회). "not registed handler" → drop.

### 자격증명 하드코딩 확정
- `mpsClientBaseSystem::create_con` `0x004ad780`: 메시지시스템 `FUN_00612030` 생성, 그리고 **계정 `"ginei00"` + 비번 `"dummy"`**
  (`PTR_s_ginei00`/`PTR_s_dummy`)를 만들어 `(*(sys+0x14))(...)`로 송신 = 로그인. (G136 와이어의 "inei00"는 선두 'g' 누락이었음 → 실제 `ginei00`.)

### 메시지 코드 lookup 클린 확인 (G135 재확인)
- 로비 `FUN_00446b10`: name→`{handler=this->field34[idx], code=idx+0x2000}` (idx 0..0xb). 로비 ParseSystem vtable @ `0x0066cd48` 슬롯.
  vtable 메서드 클러스터: 0x4465f0, 0x446760, 0x446910, 0x446930, 0x4469f0, 0x446a00, 0x446a10, 0x446a50, 0x446ab0, 0x446b10, 0x446be0, 0x4471f0, 0x44d9a0.
- SS `FUN_0044f120`: name→`{handler=this->field24[idx], code=idx+0x200}` (idx 0..7). SS vtable @ `0x0066d140`.

### 다음 타깃 (로비 parse_message 디스패치 + 핸들러 등록)
- 로비 vtable 클러스터를 디컴파일해 **parse_message(코드→field34 핸들러)** 와 **시스템 생성자(field34 등록)** 확정.
- `FUN_004ab440`(로비 연결 셋업, 0x7001 redirect가 `FUN_004ab3e0`→`FUN_004ab440`로 생성), `FUN_00612030`(메시지시스템 팩토리),
  `FUN_004aca80`/`FUN_004accf0`(콜백 등록) 디컴파일 → 로비 연결이 어떤 시스템/핸들러를 쓰는지.
- 목표: 클라가 로비 inner `0x0020`(payload u32=1) 송신 후 기대하는 **응답 inner 코드**(non-0x31, field34 등록된 코드)를 확정 →
  harness로 주입 → `logh7_decode_0030_capture.py`로 후속 0x0030 디코드하며 진행.

## G138 (2026-06-10): 로비 ParseSystem 디스패치 확정 + forced0031이 오류임을 입증

`.omo/ulw-loop/evidence/g138-ghidra-lobby-dump.json`(로비 vtable 클러스터+셋업, -process 고속 dump).

### 로비 code→handler 조회 = `FUN_00446ab0` (vtable @0x66cd4c)
```c
uVar = FUN_00446ab0(this, &out, code):
  if ((ushort)(code - 0x2000) < 0xc) { out = this->field34[code-0x2000]; return out==0?1:0; }
  return 1;  // 그 외 코드 = not found
```
→ **로비 ParseSystem은 0x2000~0x200b만 처리.** 클라가 보낸 inner **0x0020은 이 범위 밖** = 로비 앱 메시지가 아니라
**base/세션 레이어 메시지**(payload u32=1). 별도 시스템이 처리.
- `FUN_00446be0`: 코드범위 [p2,p3]에 대해 field34[idx]/field4[idx] 핸들러의 vtable[+0xc] 호출(범위 reset/clear류). field4(+0x4)에 **2차 핸들러 배열** 존재.
- `FUN_00446a00`: `return 0x2000` (패밀리 base 상수 getter).
- 로비 연결 매니저 `FUN_004ab440`: vtable 0x66df5c/df7c/df80, self-ref 리스트(+0x24=alloc 0x20). 메시지 시스템 자체는 아님.
- `FUN_00612030`(msg 시스템 팩토리): `FUN_00611f90`(주 시스템)+`FUN_006127d0`(보조), 링크(sys+0x14=보조).

### **중대 정정: forced0031 전략은 틀렸다**
harness(`logh7_world_init_probe_server.mjs` L170~180)는 "클라는 inner==0x31만 dispatch, 나머지는 store-pending"이라
가정해 모든 응답 inner를 0x31로 강제(LOGH_FORCE_0031). 그러나 G137 router RE상 **inner 0x31 = keysetup 전용 경로**이고,
앱 메시지는 store-pending→pump→**handler-lookup으로 dispatch 가능**하다. 즉 forced0031은 앱 응답을 keysetup 기계로 보내
**연결을 깨뜨린다**(g134 conn2의 close 원인일 가능성 큼). → **응답은 0x31로 강제하지 말고, 클라 시스템에 등록된 핸들러가 있는
코드로 보내야 한다.**

### 다음 (실험으로 0x0020 응답 확정)
1. (정적) inner 0x0020을 처리하는 시스템 확정: handlerLookup `(*(*(conn+0x10))+8)(code)`의 대상 = `FUN_00611f90`이 만든 시스템.
   그 시스템 vtable[2](lookup)이 0x0020을 어떻게 매핑하는지 + 로비 시스템 생성자(field34/field4 등록) 추적.
2. (동적, 권장) **corrected probe**: LOGH_FORCE_0031 끄고, 로비 연결(짧은 inner 0x0020 메시지)에 대해 후보 응답
   (예: base-ACK, 또는 등록된 로비 코드 0x200a/0x2006/0x2001 등)을 주입 → 실클라가 close 없이 후속 0x0030을 보내는지
   `tools/logh7_decode_0030_capture.py`로 관측. trap/restore + SHA 2848be76 필수.

## G139 (2026-06-10): 수정 하니스 동적 검증 — forced0031 게이트는 동작, 그러나 echo로는 로비 종료 못 막음

하니스 수정(forced0031을 login 전용 게이트 + `LOGH_LOBBY_RESPONSE_INNER_HEX` 추가) 후 실클라 프로브(g139,
`.omo/ulw-loop/evidence/g139-corrected-*`). 원본 SHA 2848be76 복원 확인. (TimeoutError는 SUPPRESS_CANDIDATES로 인한 정상.)

결과(트레이스 디코드):
- **conn0(login)**: 응답 inner=`0x31`(forced, 정상) + 0x7001 redirect(frames=2) → 클라가 conn0 닫고 conn1로 재접속(정상).
- **conn1(lobby)**: 응답 inner=**`0x0020`**(=클라 메시지 echo, **0x31로 강제 안 됨 → 수정 동작 확인**) → 그러나 클라가
  응답 수신 **~5ms 후 conn1을 닫음**(타임아웃 kill 아님; 능동 close).

**결론: forced0031이 유일 원인 아님.** 로비 conn은 자기 `0x0020` echo를 되받으면 닫는다 → **echo가 아니라 특정한 다른
응답 코드**가 필요. inner 0x0020은 클라→서버 코드라 그대로 되돌리면 거부/close. 서버는 0x0020에 대해 **올바른 (다른) 응답**
(base/세션 ACK 또는 서버 주도 로비 메시지)을 보내야 한다.

### 다음
- inner `0x0020`의 정체/기대 응답 확정: base 연결 패밀리(CommandMessengerConnection 등) 코드 매핑, 또는 클라의 0x0020
  송신/수신 사이트 RE. 후보 가설: 0x0020→0x0021(+1 패턴), 또는 서버가 로비 ParseSystem 코드(0x200a 등, field34 등록된)로
  주도. `LOGH_LOBBY_RESPONSE_INNER_HEX`로 후보 주입 테스트 가능(단 GUI 런치 비용).
- 정적 우선: 로비 시스템 생성자(ParseSystem vtable @0x66cd20)가 field34[idx]에 등록하는 핸들러 = 유효 응답 코드 집합.

## G140/G141 (2026-06-10): 로비 connect 경로 + 로비 conn은 응답 inner 무관하게 close

- G140(`g140-ghidra-connect-dump.json`): 로비 연결 매니저(`FUN_004ab440` vtable @0x66df5c). connect=`mgrConnect 0x004ab5f0`
  (`connect(IP,port)` 호출; **주의: 기존 "messageDispatchPump 0x612270" 라벨은 사실 connect 래퍼였음**),
  `mgrSetType1 0x004ae960`(this+0x10=type byte). 전체 메시지 패밀리 base 15종 확정([[logh7-message-code-scheme]]).
- G141(`g141-lobby-redirect-*`, 동적): 로비 conn(`0x0020`)에 `0x7001` redirect 주입 → **재접속 안 함, 그냥 close**.
  g139의 `0x0020` echo도 close. 즉 **로비 conn은 서버 0x0030 응답 inner와 무관하게 즉시 close**(~5ms).
- **대비**: conn0(login)은 non-0x31(0x7001)을 LoginProcessor로 정상 처리(redirect). conn1(lobby)은 non-0x31에 close.
  → **두 연결의 processor가 다르다.** 로비 processor는 내가 시도한 코드(0x0020/0x7001)를 거부/close.
  (decryption 문제는 아닐 가능성 큼 — conn0 첫 프레임도 같은 decipherKey 기반으로 정상 복호됨.)
- **미해결 핵심**: 로비 conn의 processor 정체 + 그것이 close 없이 받아들이는 inner 코드. mgrConnect엔 processor 부착이
  명시 안 됨 → 매니저 셋업 다른 지점에서 등록. 후보 다음 RE: 매니저 vtable[0x18]=`0x004abec0`, [0x10]=`0x004ae960`,
  redirect가 등록한 콜백 `FUN_004ac4f0`(lifecycle)와 `FUN_004aca80/004accf0` 경로, 또는 LoginProcessorImp/RobotImp::handle_message.

## G142 (2026-06-10): 정식 authoritative 로그인 서버 골격 구축 (사용자 결정)

로비 0x0020 blocker에 막혀, **해독 완료분(login/transport/crypto/redirect)을 먼저 정식 실서버로 구현**(사용자 선택).
49개 서버 테스트 전부 통과(신규 16: protocol 7 + session 7 + auth-server 2).

- `src/server/logh7-login-protocol.mjs`: GIN7 credential(inner 0x7000) 인식/account-label 파싱, 0x7001 redirect inner 빌더
  (IP@8 BE-u32 octet-pack `(d<<24)|(c<<16)|(b<<8)|a`, port@12 BE-u16; default=검증된 g134 바이트 재현).
- `src/server/logh7-login-session.mjs`: 인메모리 account store(CQRS read model; `acceptAnyGin7` 모드로 실클라 통과,
  exact-match 모드도 지원) + 연결 상태머신(connected→handshake-complete→authenticated→redirected/rejected). 순수.
- `src/server/logh7-auth-server.mjs`: TCP 와이어링. 0x0034→0x0035 핸드셰이크, 0x0030 로그인 복호(phase1Key),
  인증 후 **g134 재현**: keysetup 프레임(inner→0x31, decipherKey 인코딩=GIN7키 설치) + redirect 프레임(inner 0x7001,
  **gin7Key=loginInner[2:]**로 인코딩). `buildRedirectReply`/`takeTransportFrames`/`buildEncrypted0030Frame` export.
- `logh7-server.mjs serve-auth` + npm `server:auth`(기본 127.0.0.1:47900).
- 통합테스트: 공유 codec으로 실클라 프레임 시뮬(실제 encipherKey/GIN7 blob)→서버가 keysetup+redirect 2프레임 응답,
  redirect가 gin7Key로 복호되어 inner 0x7001(lobby 47900) 확인.

### 다음
1. (검증) 실클라 e2e: 클라를 auth 서버(47900)로 향하게 해 실제 redirect/재접속 관측. (auth 서버는 g134와 바이트 동치라 신뢰도 높음.)
2. (RE) 로비 서버 단계: inner 0x0020 처리 — 로비 conn의 processor가 받아들이는 응답 코드(G141 미해결).
3. (확장) CQRS tick/인메모리 월드/이벤트로그 영속성(docs/logh7-server-architecture.md) — world 진입 이후.

## G143 (2026-06-10): 실클라 e2e 성공 + 로비 게이트 돌파 (서버 골격이 RE를 풀었다)

`tools/logh7_auth_server_e2e.py`로 실클라를 authoritative 서버(serve-auth)에 직접 붙여 검증.
`.omo/ulw-loop/evidence/g143-auth-e2e-*`. 원본 SHA 2848be76 복원 확인.

**결과 (loginRedirectConfirmed=true):**
- conn0(login): connection→phase3→login-message(**0x7000**)→**redirect-sent**→close.
  → **실클라가 우리 실서버에 로그인하고 0x7001 redirect로 재접속함. 마일스톤.**
- conn1(lobby 재접속): connection→phase3→login-message(**0x0020**)→login-message(**0x2000**)→socket-error→close.

**돌파: 로비 conn은 0x0020에 즉답을 기대하지 않는다.** auth 서버가 0x0020에 **침묵**(login credential 아니므로 무응답)하자,
클라가 다음 메시지 **inner 0x2000 = LobbyLoginRequest**(로비 앱 패밀리 base)를 보냈다. 기존 G139/G141의 즉시 close는
**harness가 0x0020에 잘못 응답(echo/0x7001/forced0031)**했기 때문이었다. (서버를 직접 만든 게 RE를 풀었다.)

**로비 시퀀스(확정):** handshake → C `0x0020`(세션init, payload u32=1; 서버 즉답 불필요) → C `0x2000` LobbyLoginRequest
→ 서버는 **`0x2001` LobbyLoginOK** 응답해야 함 → (이후 0x2005 ReqInfoSession→0x2006, char select…).

### G144 캡처된 로비 메시지 (auth 서버 트레이스 innerPayloadHex)
- conn2 `0x0020`: payload `002000000001` (code+ u32=1, 세션 init).
- conn2 `0x2000` LobbyLoginRequest: payload `200047494e3700040000070069006e00650069003000300000`
  = `2000` + "GIN7" + version `0004` + `0000` + `07` + "inei00"(UTF-16BE) + NUL. (로그인 0x7000과 유사 GIN7, version만 4, 비번 없음.)
  → 서버는 `0x2001` LobbyLoginOK 응답 필요. **0x2001 payload 포맷 = 다음 RE 타깃**(Input_LobbyLoginOK::input_from_stream).

### 다음
1. `0x2001` LobbyLoginOK payload 포맷 RE(Input_LobbyLoginOK 역직렬화) → auth 서버에 로비 핸들러 추가(0x2000→0x2001, decipherKey 인코딩).
2. `0x2001` LobbyLoginOK 응답 빌드(로비 ParseSystem field34에 등록된 코드, [[logh7-message-code-scheme]] 0x2000+idx).
   로비 conn 응답은 phase3 decipherKey 인코딩(0x0030, non-0x31). 실클라로 다음 단계 진행 관측.
3. 로비 상태머신을 auth 서버/별도 lobby 서버에 추가(login→lobby→world).

## G145/G146/G147 (2026-06-10): 로비 핸들러 맵 확정 + LobbyLoginOK 포맷 + 서버 로비 핸들러 구현

- 로비 ParseSystem 생성자 `0x43f0c0`→init `0x43f130`(vtable @0x66cd18). **field34[idx] 핸들러 등록 = 메시지 방향과 일치:**
  - 등록(S→C, 핸들러 있음): field34[1]=0x2001 LobbyLoginOK(vtable 0x66cdb4), [2]=0x2002 NG, [4]=0x2004, [6]=0x2006,
    [7]=0x2007, [8]=0x2008, [10]=0x200a, [11]=0x200b.
  - null(C→S, outgoing): field34[0]=0x2000, [3]=0x2003, [5]=0x2005, [9]=0x2009. (내 C→S 카탈로그와 일치 ✓)
- **LobbyLoginOK(0x2001) 포맷 확정**: `Input_LobbyLoginOK::input_from_stream 0x43f830` = 코드 뒤 **2바이트만** 읽음
  (그 후 vtable[0x20]=0x43f7c0은 콜백 세팅만, 스트림 미read). → **inner = `[u16 0x2001][u16 status]` = 4바이트**.
- **auth 서버에 로비 핸들러 구현**(50 테스트 통과): session.onInnerMessage가 0x0020→`lobby-init-silent`(무응답, G143),
  0x2000→`lobby-login-ok`(0x2001 inner, decipherKey 인코딩). `buildLobbyLoginOkInner({status})`.
  로비 conn은 keysetup 없어 server→client = decipherKey 인코딩. (g147 e2e로 클라 진행 검증 중.)

### G147/G148 결과: LobbyLoginOK 두 형태 모두 클라가 거부(즉시 close)
- g147(bare 0x2001 = `20010000`, decipherKey 인코딩): 클라 4ms 후 close.
- g148(keysetup[force 0x31 on 0x2000] + 0x2001, gin7Key=0x2000 blob 인코딩): 클라 5ms 후 close.
- → LobbyLoginOK 응답이 아직 틀림. 미해결 가설(다음 RE 타깃):
  1. **0x2001 포맷/값**: deserializer 0x43f830이 `0x610420(...,1,0,2)`로 N바이트 읽음 — 정확한 N과 status 의미 RE 필요
     (0x610420 디컴파일). status 0x0000이 NG일 수 있음.
  2. **keysetup 키 파생**: 로그인 conn keysetup(0x613ad0)은 동작했으나 로비 GIN7 blob은 version 4(로그인은 1) →
     키 파생이 달라 gin7Key(raw blob) 인코딩이 안 맞을 수 있음. keysetup 키 파생 RE 필요.
  3. **진단 실험**: 0x2000에 keysetup만(0x2001 없이) 보내고 침묵 → 클라가 keysetup 수락하고 다음 메시지 보내는지 관측
     (G143/G144의 silence 기법 재사용).
- **이번 세션 마일스톤(확정):** 실클라가 우리 authoritative 서버에 로그인→0x7001 redirect 성공(loginRedirectConfirmed),
  로비 게이트 돌파(silence→0x2000), 로비 field34 핸들러 맵 + LobbyLoginOK 핸들러 위치 확정, 서버 골격 50 테스트 통과.

## G149/G150: LobbyLoginOK 포맷 확정 + 로비는 keysetup 안 씀 (3가지 응답 모두 거부)

- G149: `Input_LobbyLoginOK 0x43f830` 클린 디컴파일 = `FUN_00610420(stream,1,0,2)`(2바이트 읽기) + `vtable[0x20]`(0x43f7c0, 스트림 미read).
  → **LobbyLoginOK body = 코드 뒤 2바이트** (내 4바이트 inner `20010000`의 크기는 맞음).
- G150: 로비 `0x2000`에 **keysetup-only**(force 0x31, 0x2001 없음) 응답 → 클라 5ms 후 close. **로비 conn은 login conn의
  forced-0x31 keysetup을 안 쓴다**(0x2000 blob ver4는 유효 keysetup 페이로드 아님). 로비 응답 3종 모두 거부됨:
  g147(bare 0x2001/decipherKey), g148(keysetup+0x2001/gin7Key), g150(keysetup-only).

### 남은 정밀 blocker + 다음 RE 타깃 (로비 LobbyLoginOK)
로비 conn이 0x2000 후 기대하는 정확한 응답 미상. 가설(우선순위):
1. **0x2001 2바이트 값**: 내 값 0x0000이 실패/NG로 해석될 수 있음. LobbyLoginOK **핸들러**(field34[1] sub-obj @param_1[0x25],
   vtable 0x66cdb4의 process 슬롯)가 2바이트로 무엇을 하는지 RE → 필요한 값 확정. (keysetup 안 쓰므로 0x2001은 decipherKey 인코딩.)
2. **로비 cipher 확립**: 로비 conn server→client 키가 decipherKey가 맞는지(handshake phase3 기준) 재확인. keysetup 없음.
3. (대안) 로비 응답이 0x2001이 아닐 가능성 — 0x2002(NG)는 아닐 것; 0x2000 후 다른 흐름일 수 있음. 핸들러 RE로 확정.

진단 도구: `LOGH_LOBBY_KEYSETUP_ONLY=1`로 keysetup-only e2e 가능. `tools/logh7_auth_server_e2e.py`.

## G151: LobbyLoginOK 핸들러는 값 검증 안 함 → 닫힘은 cipher/decode 문제 (다음 세션 시작점)

- LobbyLoginOK 핸들러 두 메서드 모두 **파서**(값 검증기 아님): `0x43f860`=콤마구분 텍스트→숫자 파싱(param_1[0]=byte, param_1[2]=u16),
  `0x43f8c0`=바이트로 콜백만 세팅. → **2바이트 값으로 거부 안 함.**
- ∴ 로비 0x2000 응답에 클라가 닫는 건 **값 거부가 아니라 cipher/decode 실패**다. 즉 로비 conn의 server→client **앱 프레임 키**가
  내가 쓰는 키(decipherKey, 또는 0x2000-blob keysetup)와 다르다.
- **다음 세션 핵심 타깃: 로비 conn의 server→client 세션 키(앱 프레임 암호) 확립 메커니즘.** 후보:
  1. keysetup 키 파생 함수 `0x613ad0`(GIN7 keysetup) 디컴파일 — login conn은 동작(0x7000 ver1 blob), 로비(0x2000 ver4 blob)는 왜 안 되는지.
  2. 로비 conn이 0x2000(GIN7 credential) 전송 후 자체적으로 server→client 디코드 키를 그 credential 기반으로 바꾸는지(클라측 키 스위치).
  3. 로비 keysetup 재료가 0x2000 blob이 아니라 redirect 토큰/원본 login blob일 가능성.
- 검증 인프라 준비됨: authoritative 서버(serve-auth)는 login→redirect 완전 동작, 로비 0x0020 침묵→0x2000 유도까지 OK.
  `tools/logh7_auth_server_e2e.py`로 실클라 e2e(트레이스 innerPayloadHex 로깅). 로비 응답만 바로잡으면 진행.

## G153/G154/G155: 로비 응답은 cipher 거부 — 침묵=14s 유지, 모든 응답=즉시 close (방법론 전환 필요)

- g153(bare 0x2001 status=1, decipherKey), g154(bare 0x2001 gin7Key) 모두 클라 ~5ms 후 close.
- **G155 결정적 타이밍 진단**: g144(0x2000에 침묵)는 conn2가 **14.4s 유지**(probe 타임아웃까지)=클라가 인내심 있게 대기.
  반면 모든 응답(g147/148/150/153/154)은 ~5ms 후 close. → **클라는 응답을 기다리는데, 내 응답이 전부 거부됨(decode/cipher 실패).**
- **소진된 server→client 키 가설(전부 실패):** decipherKey, gin7Key(0x2000 blob), keysetup(forced 0x31), keysetup+0x2001.
- → 로비 conn의 server→client cipher 키를 정적/추론으로는 못 구함. **방법론 전환 필요:**
  - **(A) 런타임 계측**: 클라 로비 연결의 S→C decode 경로(child-codec decode 진입)에 code-cave 훅을 걸어 실제 사용 키를
    캡처. 이 프로젝트의 probe-patch 패턴(logh7_*_probe_patch.py) 재사용. **가장 신뢰도 높음.**
  - (B) 토큰/세션연속성 키 가설: 로비 conn이 redirect 토큰(0x0020 payload=1=토큰) 또는 원본 login GIN7 blob을 S→C 키로
    쓸 가능성. (추측, 낮은 확률.)
  - (C) 클라 로비 연결 cipher 상태머신 정밀 RE(handshake 후 S→C 키가 어떻게 정해지는지).
- 진단 인프라: `LOGH_LOBBY_OK_KEY`(decipher|gin7), `LOGH_LOBBY_OK_STATUS`, `LOGH_LOBBY_KEYSETUP_ONLY`로 e2e 스윕 가능.

## G156: 런타임 계측 설계 확정 (사용자 선택 "런타임 계측") — keysetup 키 캡처 훅

목적: 로비 conn이 server→client decode에 쓰는 실제 키를 캡처. child-codec(GIN7 Blowfish) 키 스케줄 = `FUN_00613ad0`.
모든 키 설정(핸드셰이크 S→C decipherKey 스케줄 + 0x31 keysetup)이 여기를 통과하므로, 여기를 훅하면 로비 conn S→C 키가 잡힌다.

### 훅 스펙 (구현 즉시 가능)
- HOOK_VA `0x00613AD0`, HOOK_LENGTH 5, 원본 바이트 `a0 32 09 35 03`(`mov al,[0x03350932]`), CONTINUATION `0x00613AD5`.
- 호출규약 __cdecl: `FUN_00613ad0(P_dest, Sbox_dest, keyPtr, keyLen)`. **진입 시 keyPtr@[esp+0xc], keyLen@[esp+0x10].**
  훅의 `pushfd;pushad`(36바이트) 후 → **keyPtr@[esp+0x30], keyLen@[esp+0x34]**.
- 레코드(64바이트 stride, capacity 16): +0x00 magic, +0x04 callIndex(counter), +0x08 keyPtr, +0x0c keyLen,
  +0x10..0x37 keyBytes 40(=10 dword, `mov esi,[esp+0x30]; for i in 0..40 step4: mov eax,[esi+i]; mov [edi+0x10+i],eax`), +0x38 pad.
- 트램펄린: `9c 60 fc`(pushfd/pushad/cld) → counter check(cap 16, 초과시 `61 9d`+jmp cont) → edi=records_va+counter*64
  (`shl ecx,6`=`c1 e1 06`) → magic/`ff 05`(inc counter)/callIndex/keyPtr/keyLen/40바이트 복사 → `61 9d` → 원본 5바이트 재생 → jmp 0x613ad5.
- 모델: `tools/logh7_login_handler_entry_probe_patch.py`(완전 동형) + 인프라 `logh7_runtime_patch_targets`(find_runtime_probe_code_cave,
  enable_section_write_for_virtual_address) + `logh7_x86_patch`(X86Builder, hook_jump). 신규 파일 `tools/logh7_keysetup_key_probe_patch.py`.

### 오케스트레이션
1. 패치 적용 → patched exe(trap/restore, SHA 복원). 2. `logh7_auth_server_e2e.py`를 확장(또는 신규)해 patched exe로 실클라 실행
   + 종료 후 ring VA(cave 주소+8) 메모리 덤프(probe 드라이버 `dump_client_memory` 재사용, `logh7_real_client_world_init_probe`의 --memory-dump 패턴).
3. ring decode → keysetup 호출별 (keyPtr, keyLen, keyBytes) 목록. 로비 conn 시점의 S→C 키 = 정답. 그 키로 0x2001 인코딩 → 진행.

### 검증 인프라(준비됨)
serve-auth는 login→redirect 완전 동작, 로비 0x0020 침묵→0x2000 유도 OK. 침묵 시 conn2 14s 유지(클라 대기), 응답 시 cipher 거부로 close(G155).

## G157: 런타임 키 캡처 성공 — conn2 S→C 키 = decipherKey "XY" (cipher 무죄, G155 정정)

`tools/logh7_keysetup_key_probe_patch.py`(FUN_00613ad0 훅) + e2e `--patched-exe/--memory-dump`로 실클라가 스케줄하는
**모든 키 캡처 성공**(`.omo/ulw-loop/evidence/g156-keysetup-ring.bin`, 7 calls). keysetup은 `param_4 & 0xffff`로 키길이 사용:
- call0/1: transportKey `{A4C13748-...}`(38B, 핸드셰이크).
- call2: conn1 C→S encipherKey(16B). **call3: conn1 S→C = "XY"(2B)=decipherKey.** call4: conn1 S→C가 forced-0x31 후 GIN7 blob로 전환.
- call5: conn2 C→S encipherKey(16B). **call6: conn2 S→C = "XY"(2B)=decipherKey.**

**핵심(G155 정정): conn2의 server→client 키 = `decipherKey "XY"` = 내가 쓴 키.** 내 childCodecKeySchedule("XY")는
클라 keysetup("XY")와 일치 검증됨(conn1 keysetup 프레임이 정상 디코드되어 redirect 동작). **즉 cipher는 문제가 아니었다.**
내 decipherKey-인코딩 0x2001은 클라에서 **정상 디코드**되며, 클라는 이를 **논리/시퀀스 이유로 거부**한다(G151: deserializer 값검증
안 함 → 메시지 순서/타입 문제). G155의 "cipher 거부"는 오판.

### 다음 (cipher 배제됨 → 시퀀스/내용)
- 가장 유력: **클라가 0x0020 먼저 응답받길 기대**. 클라는 0x0020→0x2000 순서로 보냈는데 서버가 0x0020 무시하고 0x2000만 응답 →
  out-of-order로 거부 가능. 0x0020에 "XY"-인코딩 응답 후 0x2000에 0x2001 시도. (0x0020 응답 내용 = 다음 RE.)
- 또는 0x2000 응답이 0x2001이 아닐 가능성(서버 주도 메시지/다른 코드). 클라 로비 상태머신(0x2000 송신 후 기대 코드) RE.
- 런타임 도구 준비됨: 키캡처 훅 + e2e --patched-exe. 같은 방식으로 다른 함수도 훅 가능(예: parse_message 진입에서 받은 코드/상태 캡처).

## G158: 병렬 RE 워크플로(ultracode) — 로비 응답 거부 원인 다각도 규명

워크플로 `lobby-login-response-re`(5 병렬 RE + 종합). 결과(`tasks/wxe6qviw6.output`):
- **0x2001(LobbyLoginOK)이 0x2000에 대한 올바른 응답 코드, decipherKey "XY" 인코딩, 0x0020에는 응답 불필요**(확정).
  - Angle E: 0x0020은 base CommandMessenger 메시지(FUN_004ac670, lobby connect-success 시 토큰 송신). 0x0021 ack는 바이너리에 없음. 응답 기대 안 함. → **서버는 0x0020에 침묵 유지**.
  - Angle D: SSLoginOK(0x201) = 단일 status 바이트. LobbyLoginOK도 status 1바이트(wire 2바이트=read 1 + add edi,2 정렬). 핸들러는 값 검증 안 함, close 안 함.
  - Angle A/B: 0x2001 수신경로(deserializer 0x43f830 / consumer 0x4bdb70 jump-table 0x4be324)는 값 검증/close 전혀 안 함.
- **close 메커니즘(Angle B)**: recv 워커 0x6152b0가 recv()<=0(peer FIN) 또는 recv 에러 시 [conn+0x78]=0 설정+closesocket; main tick 0x4add70(state!=2)가 disconnect.
- **내 0x2001 프레임은 transport 검증 통과**(decipher_message 0x645db0 직접 디컴파일 확인): len>=8, decoded_len-8>=innerLen, fold16 체크섬(id+innerLen+inner 범위), **시퀀스 게이트 `cmp id,[conn+0x20]; ja`(id=2 > 0 통과, conn2 첫 S→C)**. 모두 통과.
- **내 Node 서버는 예외 없음**(serverStderr 빈값). 즉 프레임은 수락되고 핸들러는 close 안 하는데 conn2가 닫힘.
- **미해결 핵심**: 누가 conn2를 닫는가? G158 진단 = auth 서버에 `socket.on('end')`(peer-FIN) 추가 → 'end' 발생=클라가 능동 close(상위 로비 로직/UI 결정), 'end' 없이 'close'=내 서버가 닫음. (Angle C: produce_message 0x402b60 `cmp ax,4`=로비 메시지 version/type 4 필요 — 응답이 GIN7+version4 헤더를 요구할 가능성, 추가 검토.)

## G159: LobbyLoginOK 후 클라 능동 disconnect — 상태머신은 성공 시 advance(끊지 않음)

- G158 진단: conn2 [peer-fin] CLIENT-FIN(hadError=False) — 클라가 0x2001 수신 ~4ms 후 **정상 disconnect**(재접속 안 함, 총 2연결).
- 내 응답이 close를 **유발**(g144 무응답=14s 유지 vs 응답=4ms close). status 값(0 또는 1)과 무관(g159 status byte=1도 동일).
  (버그: buildLobbyLoginOkInner가 status를 u16 BE로 써서 deserializer가 읽는 inner[2]가 늘 0x00이었음 — env override `LOGH_LOBBY_OK_INNER_HEX`로 임의 inner 스윕 가능.)
- LobbyLoginOK consumer 0x4bdb70: msg에서 1 dword를 global+0x359654에 저장(다른 곳에서 안 읽힘) + 성공플래그 `*(0x7ccffc)+0x35837b=1`.
- 성공 getter 0x51be40(`return flag!=0`)의 유일 caller=0x51a82d(로비 상태머신 ~0x51a800, switch on [ebp+4], tail 0x51ba5d).
  **성공 분기(0x51a82d): success면 [ebp+4]=[0x2217398]로 전이(advance), 실패면 0x51a844(NG 처리).** 즉 성공 경로는 disconnect 안 함.
- → **disconnect는 성공 후 진입하는 next-state([0x2217398]) 처리 또는 연결레벨 핸들러에 있음.** 미해결.
- **다음(워크플로 wl0krbnls 진행중)**: (1) next-state [0x2217398] 핸들러가 뭘 하는지(0x2005 송신? 서버 push 대기? reconnect?), (2) disconnect 트리거 경로, (3) 0x2000 후 기대 시퀀스(서버가 0x2006 session list를 즉시 push해야 하는지). 종합 후 서버 변경 적용·e2e 검증.

## G160: 로비 RPC 구현해도 conn2가 0x2001 직후 즉시 teardown (RPC 도달 전) — 런타임 close-trace 필요

워크플로 권고대로 로비 RPC(0x2003→0x2004, 0x2005→0x2006(262B), 0x2009→0x200a, conn 유지) 구현(50테스트 통과).
g160 e2e: conn2가 여전히 **0x2001 수신 ~5ms 후 peer-FIN**, **0x2003/0x2005 보내기 전에** 종료. 재접속 없음(2연결).
→ RPC 시퀀스 도달 못함. 워크플로의 "state 0x13 block" 가설은 4ms FIN과 불일치.

**소진된 시도(전부 즉시 FIN):** 0x2001 decipherKey(g147/153/158/160), gin7Key(g154), keysetup(g148/150), status 0/1.
무응답만 conn 유지(14s). → **클라는 디코드되는 0x2001을 받으면 무조건 conn2를 정상 teardown한다(의도적).** 재접속은 안 함.

**미해결 핵심**: 클라가 LobbyLoginOK 수신 후 왜 conn2를 즉시 끊는가(그리고 재접속 안 하는가). 정적 RE(워크플로 2회)+
경험적 6+ 테스트+런타임 키캡처로도 미해결. **다음 = 런타임 close-trace 훅**: 클라의 shutdown(ord22)/closesocket 호출
사이트에 code-cave 훅을 걸어 conn2 teardown 시 **return address(caller)** 캡처 → 종료 결정 지점 규명. 도구
`tools/logh7_keysetup_key_probe_patch.py` 패턴 재사용. 후보 가설: (a) 0x2001이 redirect(다음 게임서버 주소)를 담아야
재접속, (b) 의도적 teardown + 별도 연결에서 LobbySessionLogin(0x2009), (c) 0x0020 응답/lobby 핸드셰이크 누락.

**현 상태(확정):** 실클라가 우리 서버로 login→0x7001 redirect→lobby connect→LobbyLoginRequest까지 완주, LobbyLoginOK
수락(성공플래그 set). 인프라(auth 서버 + e2e + 런타임 훅 + 디코더) 완비. 로비 post-login teardown 한 단계만 남음.

### G161 재해석(중요): 클라는 0x2001을 **기다린다**(필요), 받으면 성공처리 후 conn2를 **의도적 teardown**
- g144(0x2000에 침묵): conn2가 0x2000 송신 후 **~14s 아무것도 안 보내고 대기**하다 kill됨. 즉 클라는 0x2001 응답을
  **블로킹 대기**한다(필요함). 무응답으로는 진행 안 함.
- 0x2001 수신 시: 성공플래그 set + conn2 즉시 정상 teardown(재접속 X). → **로비-로그인 conn은 단명 핸드셰이크(by-design)**.
- **두 가설(다음 검증):**
  - (a) **이미 성공**: 클라가 LobbyLoginOK 후 로컬 **캐릭터선택 UI**로 진입(네트워크는 유저가 캐릭터 선택해야 재개).
    e2e의 login() 자동화는 로그인 버튼만 누르고 캐릭터선택은 안 함 → "멈춤"처럼 보일 뿐 실제론 성공일 수 있음.
    **검증: e2e 종료 직전 클라 윈도우 스크린샷 캡처**(현재 window rect만 기록) → 캐릭터선택 화면인지 확인.
  - (b) **재접속 타깃 누락**: teardown 후 게임/월드 서버로 재접속해야 하는데 주소가 없어 종료. → 런타임 close-trace로
    teardown 직후 재접속 시도/타깃 확인.
- **권장 다음**: (1) e2e에 스크린샷 캡처 추가(가설 a 검증, 가장 저렴), (2) 아니면 런타임 close-trace 훅(가설 b).

### G162 스크린샷 검증 결과: 가설 (a) 기각 — 클라는 로그인/접속 다이얼로그로 복귀
e2e에 `--screenshot-out` 추가(PrintWindow+PIL, `_capture_window`). g162: 로비 disconnect 후 클라 화면 =
**파란 다이얼로그 + 비번 필드(`*****`) + 버튼 2개 = 로그인/접속 다이얼로그**(캐릭터선택 아님). 텍스트는 mojibake(폰트/로컬라이즈 이슈).
→ **로비 disconnect는 성공-후-캐릭터선택이 아니라 로그인 화면으로 리셋(실패 경로).** 가설 (b)가 유력.
- **다음 RE(런타임 close-trace 권장)**: 클라가 LobbyLoginOK 수신 후 conn2를 teardown하고 로그인으로 돌아가는 정확한
  결정 지점/이유를 런타임으로 추적(closesocket/shutdown ord22 호출 caller 캡처, IAT 훅). 도구 패턴: `logh7_keysetup_key_probe_patch.py`.
  또는 mojibake 다이얼로그 텍스트를 디코드(String.txt/폰트 RE)해 정확한 메시지(예: "로비 로그인 실패/연결 끊김") 확인.
- e2e 스크린샷 도구 완비(`tools/logh7_auth_server_e2e.py --screenshot-out`) — 향후 단계 시각 검증에 재사용.

### G163/G164: 0x2006 unsolicited push도 teardown / 윈도우텍스트=커스텀UI(읽기불가)
- G163(`LOGH_LOBBY_PUSH_SESSION=1`): 0x2001 직후 0x2006(264B) push해도 conn2 5ms FIN. → **teardown은 0x2001 수신 자체로
  무조건 발생**(후속 메시지 무관). 모든 0x2001 변형/RPC/푸시 소진.
- G164: e2e에 `_dump_window_text`(EnumChildWindows+GetWindowText) 추가. 클라 = MFC frame(Afx:400000) + view뿐,
  **자식 컨트롤 없음 = 커스텀 렌더 UI**(스크린샷의 파란 다이얼로그는 게임엔진 직접 그림). GetWindowText로 못 읽음 → dead-end.
- **확정: 클라는 어떤 0x2001을 받아도 conn2를 무조건 teardown하고 로그인 화면(커스텀 다이얼로그, 비번필드)으로 복귀, 재접속 안 함(2연결).**
- **다음 = 런타임/딥RE만 남음**: (a) conn2 teardown의 정확한 코드경로+조건(상태머신 0x3d-0x3f / conn destructor 0x51c210 /
  closesocket caller), (b) teardown 후 클라 거동(재접속 타깃? 로그인 복귀=에러?), (c) login(conn1)→lobby(conn2) 연결 토폴로지
  (conn1 유지 필요? 게임서버 redirect 필요?). 내 서버는 login→lobby를 같은 포트 47900으로 redirect(단일 서버).

## G165/G166 (2026-06-11): 로비 redirect 가설(w8fyp5tg1) e2e 기각 — 3변형 모두 동일 teardown

워크플로 w8fyp5tg1의 고신뢰 가설("로비 응답은 terminal 0x2001이 아니라 world로의 0x7001 redirect hop")을 구현·검증:
세션 0x2000 분기 → `lobby-redirect`(`buildRedirectInner(world ?? lobby)`), auth-server에 `lobby-redirect` arm 추가
(기본 `bare-decipher`=decipherKey로 inner 0x7001; `LOGH_LOBBY_KEYSETUP=1`=conn1과 동일한 keysetup+redirect pair),
serveAuth에 `world` 타깃(기본=lobby=127.0.0.1:47900) 추가. world 미설정 시 redirect는 lobby로 폴백.

- **G165(bare-decipher 0x7001):** conn2가 0x2000 직후 redirect 받고도 **conn3 미개설**, peer-fin. (`g165-lobby-redirect-*`)
- **G166(keysetup+redirect, conn1과 동일 메커니즘):** 역시 **conn3 미개설**, peer-fin. (`g166-lobby-keysetup-*`)
- **타임스탬프 대조(결정적):** conn1(login) redirect-sent(.072)→peer-fin(.074,+2ms)→**즉시 conn2 개설(.075)**.
  conn2(lobby) redirect-sent(.096)→peer-fin(.100,+4ms)→**conn3 없음**. 즉 conn1의 0x7001은 "FIN+재접속"으로 작동,
  conn2의 응답(0x2001/bare-0x7001/keysetup-0x7001 **3변형 전부**)은 "FIN, 재접속 없음"으로 동일.
- **해석:** conn2의 S→C 응답이 redirect 로직 도달 전에 **드롭/무시**됨. conn1에서 통한 redirect 메커니즘을 그대로
  복제해도 conn3가 안 생기므로 **"로비=0x7001 redirect hop" 가설 기각.** 유력 원인: 로비 세션은 login과 **다른
  핸들러 테이블** → inner 0x7001(및 강제 0x31)이 로비 세션에서 라우팅 안 됨. 로비→world redirect는 **0x7001이 아닌
  다른(로비-패밀리?) inner code**가 FUN_0x004adbe0로 매핑될 가능성. 또는 decode/state-gating 차원의 거부.
- **착수(ultracode 병렬 RE 워크플로 wicdkooh5):** 4 finder(핸들러 라우팅/decipher 검증/상태머신/teardown 트리거)
  +synthesis로 (1) conn2가 응답을 무시하는 근본원인, (2) 0x2000 후 클라가 수락·작동하는 정확한 응답(inner code/key/id/구조),
  (3) RE 불확실 시 런타임 훅(주소+로그 대상) 규명 중. 코드 변경분 테스트 그린(52 pass), 원본 EXE SHA 2848be76 복원 확인.

## G167/G168 (2026-06-11): 정확한 로비 프로토콜 구현 + 런타임 계측으로 conn2 드롭 지점 확정

워크플로 wicdkooh5(고신뢰, 바이트 검증)가 로비 프로토콜을 해독: **inner 0x7001은 로비 세션에서 무효**(case
0x4bdca6, 단순 blob 저장). 전진은 success flag `*(0x7ccffc)+0x35837b`로만 게이트되고 이 플래그는 **inner 0x2001
소비자 0x4bdb70**만 세팅. 월드 redirect는 **0x7001이 아니라 inner 0x200a**(소비자 0x4bdc2e가 endpoint를
+0x35f144에 채우고 flag 0x35837c 세팅 → FSM 0x51bec0/0x51bee0이 conn3 connect). decipher 시퀀스 게이트
0x645eda는 `id > [cipher+0x20]`(strict) 요구 → S→C id는 **단조증가** 필요.

- **구현(g167):** 0x2000→0x2001(status 0, decipherKey, 단조 id), 0x2009→0x200a(world endpoint 14B:
  `[200a][u32 octetIP][u16 port][u16 pad][u32 token]`), 0x2003→0x2004, 0x2005→0x2006 유지. auth-server에
  per-conn `nextReplyId` 카운터 추가(매 S→C 프레임 id 단조증가). protocol에 `buildLobbySessionLoginOkInner`.
  테스트 갱신 그린(login-session 11, protocol 7, auth 2). 0x7001 경로는 `LOGH_LOBBY_REPLY=redirect7001` 디버그용만.
- **e2e(g167) 결과:** 정확한 0x2001(id=3>baseline0)에도 conn2가 0x2001 직후 즉시 FIN, **0x2003 미전송**(전진 실패).
- **런타임 계측(g168) — 결정적:** 신규 `tools/logh7_lobby_dispatch_probe_patch.py`로 로비 앱 디스패처 head
  **0x4bd7d4(`cmp eax,0x2000`, eax=innerCode)** 훅(코드케이브 0x66acd5, ring 0x66ad75, magic "L7DP").
  실클라 e2e 후 ring 디코드 = **counter=0, 전 레코드 empty.** 즉 conn2 인바운드 프레임이 **로비 앱 디스패처에
  도달조차 못함.** 우리의 0x2001(및 모든 인바운드)은 **앱 레이어 이전(decipher_message 0x645db0 또는 전송 라우터
  핸들러맵 lookup 0x612510→drop 0x612378)에서 드롭됨.** 정적 분석으로 찾은 소비자 0x4bdb70은 런타임 conn2에선 dead.
- **재해석:** G096-G101의 "빈 수신 핸들러맵" 가설이 **로비 연결에 대해 런타임 확정.** conn1(login)은 0x7001
  인바운드가 처리됨(redirect 작동) ↔ conn2(lobby)는 인바운드가 디스패처 전에 죽음. **다음 = decipher reject vs
  router-miss 판별** (decipher 정확 주소 재RE 필요 — finder B의 0x645eda/0x645f07는 linear-disasm 오정렬로 부정확).
  그리고 **로비 수신 핸들러맵이 언제/무엇으로 채워지는지**(0x2001 등록 트리거) RE → 비프로브 fix 가능성.
- 증거: `g167-lobby-2001-200a-*`, `g168-dispatch-*`/`g168-ring.bin`/`g168-lobby-dispatch-probe-manifest.json`. EXE SHA 2848be76 복원 확인.

## G169/G170/G171 (2026-06-11): 5중 런타임 계측 — conn2는 인바운드를 아예 복호조차 안 함 (수신 파이프라인 비활성)

워크플로 wmbudvx8e(고신뢰): decipher는 우리 0x2001(id=3)을 **수락**(seq gate `ja`, baseline 0). 드롭은 라우터
핸들러맵 miss(0x61234c→0x612378). 근본은 **로비 Processor가 lazy 인스턴스화**(ctor 0x4ad580, factory 디스크립터
0x74fdb0, 직접 xref 0) → 로비 scene 진입 전엔 conn+0x10 수신맵 미배선. 이를 5개 프로브로 런타임 검증:

- **g169(pump 핸들러 lookup 0x612348):** 세션 전체 lookup **1회**(key=0x0004=**login 채널**, HIT) = conn1 redirect.
  **conn2는 lookup 0회.** → conn2 인바운드가 pump 이전에 죽음.
- **g170(decipher seq gate 0x645eda):** **2회**(둘 다 conn1, 동일 cipherObj, id=1/baseline=0/accept = keysetup+redirect;
  keysetup이 baseline 재시드해 둘 다 id=1). **conn2는 gate 0회.** → conn2 인바운드가 seq gate 이전에 죽음.
- **g171(decipher_message ENTRY 0x645db0):** **2회**(둘 다 conn1, 동일 this 0x053e4ed0/baseline 0). **conn2는 ENTRY 0회.**
- **결정적 결론:** conn2의 인바운드 0x2001은 **decipher가 호출조차 안 됨** = 클라가 conn2에서 앱 프레임을 **수신처리 안 함.**
  타이밍상 race 아님(0x2000 수신 .432 → 우리 0x2001 .433 → FIN .437, 4ms 여유). 즉 **어떤 응답을 보내도 conn2에선
  무용** — 클라 conn2 수신 파이프라인(로비 Processor @conn+0x10)이 비활성. FSM(0x51a3a2)은 state6에서 0x2000을
  send만 하고(직접 send 경로 0x51bde0→0x4b78a0), 수신 핸들러는 미배선이라 state7 대기 → 응답 영영 못 받음 →
  watchdog가 ~12ms에 conn2 close.
- **진짜 blocker(다음 RE):** **무엇이 로비 Processor(0x4ad580 / factory 0x74fdb0)를 인스턴스화하며, conn2 열릴 때 왜
  안 일어나는가.** 추정: conn1 login redirect가 클라를 로비 scene으로 전이시키는 신호/데이터가 부족, 또는 별도 트리거.
  서버 응답 인코딩(0x2001/0x200a/단조 id)은 원리상 정확하나 수신 파이프라인 활성화 전엔 무의미.
- **신규 프로브 도구 5종(전부 비파괴, 코드케이브 0x66acd5, SHA 2848be76 복원확인):**
  `tools/logh7_{lobby_dispatch,lobby_lookup,seqgate,decipher_entry}_probe_patch.py`. 패턴: 5~6B 훅→케이브 트램펄린
  (pushfd/pushad→ring 기록→popad/popfd→원복원 replay[조건부 분기 포함]→jmp back), ring@cave+BUFFER_OFFSET, magic별 식별.
  증거 `g168~g171-*` (trace/result/ring.bin/manifest).

## G172 (2026-06-11): 돌파 — 0x7002 serverlist가 로그인을 통과시켜 클라가 타이틀/로딩 화면 진입

워크플로 ws2xffdw9 정정: 로비 Processor는 **이미 인스턴스화됨**(0x74fdb0은 RTTI factory 아니라 MSVC EH 메타데이터,
0x4ad580은 catch funclet). 실제 인스턴스화 체인 = FSM state4 → 0x51bd70("GIN7W") → 0x4b6480 → **0x4ad120
mpsClientBaseSystem::create_instance**(create_connection 0x611ed0 + ctor 0x4ad710/0x4ad780, singleton 0x7c25f4).
conn2 열림+0x2000 send가 관측되므로 Processor는 존재. 진짜 문제는 **수신 펌프 미활성** + conn1의 bare 0x7001이
cross-module 신호 `*(0x76bbe4)=0xFFFFFFFF`(FSM의 -1 실패 sentinel @0x51a7b6)를 찍는 것. 유효 채널 인덱스는
**inner 0x7002 serverlist 분기(0x4ac758: `[0x76bbe4]=byte[inner+2]`)**만 설정.

- **수정:** protocol에 `buildServerListInner({index})`(inner=`[u16 0x7002][u8 index]`), auth-server redirect arm에
  `LOGH_SEND_SERVERLIST=1`이면 keysetup+redirect **뒤에** 0x7002 프레임(gin7Key, 단조 id) 추가(인덱스 LOGH_SERVERLIST_INDEX, 기본 0).
- **e2e 결과(g172/b/c) — 돌파:** `LOGH_SEND_SERVERLIST=1`로 **클라가 로그인 다이얼로그 폴백(G162) 대신 타이틀/로딩
  화면(銀河英雄伝説 VII)으로 진입**, conn2가 **닫히지 않고 유지**(이전 ~12ms FIN → 이제 40s+ 유지, 종료는 하니스 timeout
  kill ECONNRESET). 즉 **0x7002 serverlist가 로그인 단계를 통과시킴.**
- **남은 것:** conn2가 40s간 **완전 침묵**(0x0034 핸드셰이크조차 안 보냄), decipher 여전히 0회(conn1만 3회=keysetup+redirect+serverlist).
  즉 클라가 타이틀 화면에서 **대기** 중 — (a) conn2에서 **서버가 먼저 말하길** 기다리거나, (b) 타이틀/메뉴에서 **유저 입력**
  대기(하니스는 login 다이얼로그만 처리, 이후 클릭 안 함), (c) 로딩 타이머. 스크린샷은 커스텀 렌더라 12s/40s 동일.
- 증거 `g172-serverlist-*`, `g172b/c-*`(스크린샷 포함). SHA 2848be76 복원확인.

## G173 (2026-06-11): 타이틀 화면 = WSEQ02 캐릭터 선택 FSM + conn2 송신O/수신X (수신 멀티플렉서 문제)

워크플로 wnw4onp2n: 로그인 후 화면 = **WSEQ02 char-select 씬 FSM** `0x51a370`(dispatcher 0x51a3a2, state=[ebp+4],
jumptable 0x51ba98). 상태: 0(다이얼로그 빌드)→1(**char-select 다이얼로그; 유저 confirm 이벤트(control 0x54, prop
0xd) + 선택 캐릭터 이름 2개 non-empty여야 state4 진행**, 아니면 state1 대기)→ 또는 2(FULLSCREEN, 외부진입)→3(**60틱
자동타이머**)→4(conn2 open 0x51bd70→0x4b6480→create_instance 0x4ad120)→5(connect poll 0x51bdc0)→6(0x2000 send).
FSM은 0x4b698a에서만 tick(one-shot [esi+0x35837a]==0 + 씬-active 바이트 [[ebp+0xc]+0x3a0] @0x51a392 게이트).

- **arm vs non-arm(핵심):** login 핸들러 0x4ac700에서 **0x7001 ARM 분기(0x4ac7f3)**가 conn2 트랜스포트+recv-set 등록
  (0x4ac900→[0x7c24c8]) + Processor 펌프 arm([conn+0xaa], 펌프 0x4ac350) + login-complete 콜백([edi+0x24]) 실행.
  **0x7002 분기(0x4ac758)는 non-arming**(0x76bbe4=byte[inner+2], [edi+0xc] 리스트 prune, [edi+0x91]=1만).
  conn2 핸드셰이크(0x0034)는 트랜스포트 connect-complete 콜백 0x4adfd0(word[msg+6]=0x20)이 펌프로 dispatch될 때 송신.
  트랜스포트 async connect 타임아웃=30000ms(0x7530 @0x4ad93e) → 40s 침묵 소켓 설명.
- **[0x76bbe4] 정정:** connect 게이트 아님(성공경로서 안 읽음; state5 FAIL 분기 0x51a7b6서 에러 다이얼로그용으로만 읽음).
  → G172의 "[0x76bbe4] 실패 sentinel" 해석은 **부정확**.
- **실증 A/B(정적 synthesis와 충돌):** bare 0x7001(g171) → conn2가 0x0034+0x0020+0x2000 **송신**하나 **수신 전무**
  (decipher 0회) → 로비로그인 실패 → 로그인 폴백. 0x7001+0x7002(g172) → conn2 **침묵**(0x0034도 안 보냄) +
  **char-select 화면 도달**. 즉 0x7002가 UI는 진행시키나 conn2 arm은 깨뜨림(arm 콜백 prune 추정). synthesis는
  "0x7001-only 권장, 0x7002 무관"이나 실측은 0x7002가 UI를 char-select까지 전진시킴 → **정적 분석 over-reach.**
- **핵심 잔여 blocker(0x7002 무관):** Regime 1(bare 0x7001)에서 **conn2는 송신O 수신X.** conn1 receiver는 recv-set
  ([0x7c24c8], arm 0x4ac900)에 등록되나 conn2 receiver([0x7c248c], create_instance 0x4ad120 생성)는 미등록 추정 →
  conn2 수신 바이트가 decipher로 dispatch 안 됨. **다음 = conn2 수신 멀티플렉서/recv-set 등록 경로 RE 또는 수신경로 프로브.**
- 증거 `g172/b/c-*`(스크린샷=銀河英雄伝説 VII 타이틀/char-select). SHA 2848be76 복원확인. `LOGH_SEND_SERVERLIST` 기본 OFF(=Regime 1).

## G174/G175 (2026-06-11): conn2 수신 게이트 = 검증 아님. 트랜스포트는 connect+검증+arm하나 펌프가 안 돎

워크플로 wdk4vaor3(고신뢰): conn2 수신경로 게이트 = **트랜스포트 CONNECTED 상태 [transport+0x78]==2**(connect-completion
worker 0x615460이 설정; 검증 0x615d40=ioctlsocket(FIONBIO) 통과 시 유지, 실패 시 0x6154ea서 0으로 revert). 수신 펌프
0x615290(→recv worker 0x6152b0→frame decode 0x6153b0→0x6130a0 0x0030감지→decoder vtable 0x74572c slot6 0x745744→
decipher 0x645db0). 두번째 게이트: frame-poll 콜백 0x4add60이 [transport+0x30](0x4adf60/0x4adfd0이 set) 체크.
**송신은 별도경로**([transport+0x44] send buffer, conn-proc 큐 0x61231b→0x614bb0) → conn2 송신O 수신X 설명.
**수신셋 등록은 차이 아님**: create_instance 0x4ad120이 conn2 receiver([0x7c248c])+transport를 [0x7c24c8]에 등록(0x4ad3b0/0x4ad414).

- **런타임 측정(프로브 2종 신규):** connect worker 0x615460(`logh7_connect_complete_probe`) → **2 트랜스포트 모두 진입**
  (entry [+0x78]=1, vtable 0x681ff0). 검증결과 0x6154e3(`logh7_connect_validate_probe`) → **2 트랜스포트 모두 validResult=1
  (FIONBIO 통과 → [+0x78]=2 유지 → 수신 펌프 arm)**. this 0x053e3160/0x053e3870 일치.
- **모순(핵심):** 두 트랜스포트 모두 수신 arm하는데 decipher는 conn1만(g171 conn2=0). 즉 conn2 트랜스포트는 **arm되나
  수신 펌프 0x615290이 실제로 실행되어 0x2001을 읽기 전에** conn2가 닫힘(Regime1 ~12ms FIN). 펌프는 [transport+4]=
  0x615290 상태머신(0x615240 WaitForSingleObject overlapped [+0x84])로 구동 — conn2의 짧은 수명/오버랩 폴 미구동 추정.
- **평가:** synthesis 고신뢰 결론 = **서버 페이로드로 못 고침**(검증은 클라 자기 소켓 FIONBIO, connect-completion은 OS/
  Winsock 결과). conn1은 동작, conn2는 arm되나 펌프 미실행. **남은 가설**: (a) conn2가 너무 빨리 닫혀(FSM state7 타임아웃)
  펌프가 첫 수신 사이클 전에 종료; (b) 클라가 conn2 overlapped recv를 post/구동 안 함; (c) 게임루프 수신펌프가 비포커스
  스로틀. **다음 결정타 = 수신 펌프 0x615290(또는 recv worker 0x6152b0) 프로브로 conn2 펌프 실행여부 측정**, 또는 토폴로지
  재고(conn1 유지? 원서버 I/O 모델?).
- 신규 도구 `tools/logh7_{connect_complete,connect_validate}_probe_patch.py`. 증거 `g174/g175-*`. SHA 2848be76 복원확인.

## G176/G177/G178 (2026-06-11): conn2 수신 펌프는 돌고 프레임도 읽으나 0x2001만 디코드 안 됨 (타이밍 아님)

프로브 3종 추가 — **이전 "펌프 미실행" 결론을 뒤집음**:
- **G176(수신 펌프 0x615290):** counter=19, **2 트랜스포트 모두 펌프 실행**(8회/11회). conn2 수신 펌프 돈다.
- **G177(수신 결과 0x6152a0, recv worker al):** 2 트랜스포트 모두 **framesReady==runs**(8/8, 11/11). 즉 매 펌프 실행마다
  recv worker가 프레임을 읽어 frame decode 0x6153b0 호출. conn2도 프레임 디코드함.
- **모순:** conn2는 프레임을 디코드하나 decipher(g171)는 0회 → **conn2가 디코드하는 프레임은 0x0030 앱프레임이 아님**
  (핸드셰이크/제어 프레임만; 0x0030 감지 0x6130fb는 평문 transport code라 0x2001이 도달했다면 통과해야 함). 즉
  **conn2의 수신 디코드가 0x2001(0x0030)을 아예 못 봄.**
- **G178(타이밍 가설 검증·기각):** `LOGH_LOBBY_EARLY_OK=1`로 0x0020에 0x2001 조기 전송(.357, conn2 .362 종료=5ms,
  펌프 2~3회 구동 여유). 그래도 conn2 decipher 0회. **→ 타이밍 race 아님.** 0x2001을 언제 보내도 conn2 수신 디코드가
  처리 안 함. (세션에 `LOGH_LOBBY_EARLY_OK` env 추가, 기본 OFF.)
- **종합 결론(11 프로브+10 워크플로 소진):** conn2는 connect+검증+수신arm+펌프실행+프레임디코드까지 모두 정상이나,
  서버가 보낸 0x2001(0x0030)이 conn2 수신 디코드 경로(0x6130a0→0x613169→decipher 0x645db0)에 **도달 자체를 안 함.**
  서버 페이로드/타이밍으로 못 고침(워크플로 고신뢰). **클라 내부 수신 동작의 구조적 한계**로, 같은 transport 클래스인데
  conn1은 0x0030을 받고 conn2는 못 받음. **다음 = 토폴로지/접근 재고**(클라 패치 없이 가능한지, 원서버 I/O 모델 차이,
  conn1 유지, 또는 마일스톤 수용 후 다른 작업) — 사용자 방향 결정 권장.
- 신규 도구 `tools/logh7_{recv_pump,recv_result}_probe_patch.py`. 증거 `g176/g177/g178-*`. SHA 2848be76 복원확인.

## G179/G180 (2026-06-11): 그라운드 트루스 — conn2 recv가 0x2001을 아예 안 받음; 5가지 서버수정 전부 실패

**G179(recv 바이트 프로브 0x615307, 결정적):** recv() 실제 반환 바이트 캡처. conn1=phase3(0x0035)+**0x0030 프레임(len50, n=88)**
수신(keysetup+redirect). **conn2=phase3(0x0035)만 수신, 이후 전부 n=-1(WSAEWOULDBLOCK), 0x0030 프레임 절대 안 옴.**
타이밍(trace): 서버 0x2001 전송 .357 → conn2 FIN .362(5ms 후). conn2 recv 펌프는 핸드셰이크 창(~.346-.351)에만 폴링하고
**0x2001 전송(.357) 전에 멈춤.** conn1은 app메시지(0x7000) 후에도 폴링 지속해 redirect(.518) 잡음 ↔ conn2는 app준비(.351)
시점에 폴링 정지 = **로그인 vs 로비 연결의 구조적 recv-펌프 캐던스 차이.**

**G180(proactive 0x2001, env LOGH_LOBBY_PROACTIVE_OK):** phase3 직후(connId>=2) 0x2001 선전송 시도(핸드셰이크 창에 넣기).
→ conn2 decipher 여전히 0회 + **conn2 더 빨리 닫힘(.536, open후 14ms).** app세션 준비(0x0020) 전 app프레임이라 거부/조기종료.

**서버수정 5종 전부 실패:** 늦은 0x2001(G171) / serverlist(G172) / early-on-0x0020(G178) / proactive-post-phase3(G180).
유효 창 = app준비(0x0020 후)이면서 펌프 폴링중 — 그런데 펌프가 0x0020 직전(.351)에 멈춰 **창이 없음.**

**최종 결론(프로브 13종+워크플로 10종 소진):** conn2 로비 수신 불가는 **클라 내부 recv-펌프 캐던스의 구조적 한계**로,
서버 페이로드/타이밍으로 못 고침(고신뢰, 실증). **전략 분기(사용자 결정 필요):** (1) 최소 클라 패치(conn2 recv 펌프 지속
또는 FSM state7 타임아웃 연장)로 로비 돌파 — "커스텀 클라+커스텀 서버" 모델(이미 클라 설치/패치 중이라 부합), (2) 마일스톤
수용(로그인+캐릭터선택 도달)하고 다른 작업, (3) 토폴로지 근본 재고. env 추가 `LOGH_LOBBY_PROACTIVE_OK`(기본 OFF).
신규 도구 `logh7_recv_bytes_probe_patch.py`. 증거 `g179/g180-*`. SHA 2848be76 복원확인.

## G181/G182 (2026-06-11): 클라 패치 착수 — FSM은 state6에서 동결(state7 미도달), 닫힘은 트랜스포트 레벨

사용자 선택=최소 클라 패치. 신규 `tools/logh7_lobby_unblock_patch.py`(state7 je NOP, 0x51a834: 74 0e→90 90).
- **G181:** state7 패치한 클라로 e2e → conn2 거동 **변화 없음**(여전히 0x2000 후 ~5ms 닫힘). state7 패치 무효.
- **G182(FSM 상태 트레이스 프로브 `logh7_fsm_state_probe_patch.py`, 순환링 32):** counter=116, 마지막 상태열 =
  `1(x25)→4→5(x5)→6`. **FSM이 state6(0x2000 송신)에서 멈춤; state7 영영 미도달.** → state7 패치가 무효였던 이유.
  state6 후 WSEQ02 씬이 **비활성화**(디스패처 0x51a3a2가 scene-active 게이트 0x51a392 통과 못함 = 호출 자체가 중단),
  conn2는 FSM과 무관하게 **~5ms 후 트랜스포트 레벨로 닫힘.**
- **재해석:** state6(0x2000 송신)이 씬을 "응답 대기" 상태로 전환→씬 비활성→FSM 동결. 0x2001 수신 시 재활성 의도이나
  conn2 recv가 0x2001 못 받아 영영 동결, conn2 트랜스포트가 ~5ms에 닫힘. **키스톤 = conn2 트랜스포트 닫힘 방지**(닫힘 막으면
  recv worker가 계속 폴링→0x2001 읽음→flag set→씬 재활성 가능). 부수: 씬-active 유지(0x51a392), state7 advance(0x51a834).
- **다음 = conn2 트랜스포트 닫힘 트리거 RE/패치**(closesocket/shutdown caller, lobby Processor 연결 타임아웃/워치독).
  그 후 씬-active+state7 패치 조합으로 로비 전진 시도. 증거 `g181/g182-*`. SHA 2848be76 복원확인.

## 하지 말 것

- **state7(0x51a834)만 패치하면 안 됨** — FSM이 state6에서 동결돼 state7 미도달(G182). 닫힘은 트랜스포트 레벨.
- **conn2 0x2001 미수신을 서버에서 고치려 더 시도하지 말 것** — 늦은/serverlist/early/proactive 5종 전부 실패(G171-G180).
  conn2 recv가 0x2001 바이트를 아예 안 받음(G179). 클라 패치 또는 전략 결정 필요.
- **conn2 0x2001 미수신을 타이밍/펌프 문제로 보지 말 것** — 펌프 돌고 프레임 읽고 조기전송해도 conn2가 0x2001(0x0030)을
  수신 디코드 안 한다(G176/G177/G178). 구조적 클라 수신 문제다.
- **conn2 수신 미동작을 검증/등록 문제로 보지 말 것** — 트랜스포트는 connect+FIONBIO검증+수신arm 모두 통과한다(G174/G175).
- **[0x76bbe4](serverlist 인덱스)를 connect 게이트로 오해하지 말 것** — 성공경로서 안 읽힌다(에러 다이얼로그 코드용만). (G173)
- **conn2 앱 응답(0x2001/0x200a)은 conn2가 수신을 시작(decipher 호출)하기 전엔 무용.** 먼저 conn2 receiver를 recv-set에
  등록시켜야(송신O 수신X 문제). (G171/G173)
- **응답 inner를 0x31로 강제하지 말 것**(LOGH_FORCE_0031). keysetup 경로로 가서 앱 연결이 깨진다. (G138)
- **로비 conn(0x2000)에 forced-0x31 keysetup 쓰지 말 것** — 거부됨. 로비는 login conn과 다른 메커니즘. (G150)
- **로비 conn의 0x0020에 즉답하지 말 것** — 잘못 응답하면 close. 침묵하면 클라가 0x2000 LobbyLoginRequest로 진행. (G143)
- **로비 conn(0x0020)에 0x7001/echo로 응답하지 말 것** — 재접속 없이 close. 로비 processor 전용 코드 필요. (G141)
- **로비 conn에 자기 메시지(0x0020)를 echo하지 말 것** — 클라가 즉시 닫는다. 특정 응답 코드 필요. (G139)
- `0x004ad7e0`만 계속 파지 말 것. 현재 blocker는 post-key `0x0030`/`0x7001` body semantics다.
- bare `0x0001`/`0x0003` session bootstrap 후보를 기본 서버 응답으로 승격하지 말 것. 기존 증거상 harmful/no-progress다.
- `param_5+4/+0xc`를 클라이언트 메모리 포인터로 취급하지 말 것.
- 원본 `.omo/work/logh7-installed/exe/G7MTClient.exe`를 임시 교체한 뒤 SHA 복원 확인 없이 끝내지 말 것.

## G185-G193 (2026-06-11): 클라 패치 — conn2 닫힘 키스톤 해결(라우터 teardown), decode/dispatch 레이어 잔존

사용자 선택=최소 클라 패치. **핵심 진전**:
- **G187(teardown-chain 프로브, 결정적):** teardown 0x6151d0 진입 호출체인 캡처. conn1=0x4ac726(login 핸들러, by-design),
  **conn2=0x61315c(=라우터 0x6130a0의 0x613157).** 즉 conn2 닫힘 = 라우터가 null-result 프레임(non-0x0030, 예 phase3)에서
  0x613150→0x613157 `call 0x614b30`(teardown). conn1은 이 경로 안 씀 → **conn2-specific.** (FSM/disconnect-콜백 아님: G185/G186 기각.)
- **G188/G189 키스톤:** `tools/logh7_lobby_unblock_patch.py` = **0x613157 `call 0x614b30` NOP×5**(프레임 release, teardown만 차단)
  + scene-active gate 0x51a39c NOP. → **conn2가 안 닫히고 20초+ 유지(이전 ~5ms FIN 탈출).** conn1-safe. 0x613144 je만 NOP은
  부족(0x613150 다중 진입; teardown call 자체 NOP 필요).
- **G190-G193 잔여:** conn2 유지돼도 lobby app dispatcher 0x4bd7d4 counter=0, decipher 0회. recv-data 프로브는 conn2가
  phase3+0x0030 1프레임 read 확인(recv O). 그러나 0x0030 핸들러 0x613169 decode([edx+0x18]@0x613193) null→drop. 즉 conn2의
  0x0030 프레임이 recv는 되나 **decode/dispatch가 app(decipher/0x4bd7d4)에 미도달**(G168/G174 레이어 잔존).
- **다음:** conn2 0x0030 decode 실패 원인(cipher 키 상태/decode loop 0x6122c0 미구동) RE → app dispatch 도달.
  신규 도구: `logh7_{close_caller,teardown_chain,disconnect,recv_data}_probe_patch.py`, `lobby_unblock_patch.py`. 증거 g185~g193. SHA 2848be76 복원확인.

## G194-G196 (2026-06-11): 인코딩 변형 무관 — conn2 0x0030이 decode/decipher에 미도달 (구조적 decoder 레이어)

conn2 유지(라우터 패치) 후에도 0x2001 미처리 원인 추적:
- **G194(gin7 키):** `LOGH_LOBBY_OK_KEY=gin7`(0x2000 blob으로 0x2001 인코딩) → conn2 decipher 0회.
- **G195(transport-attributed recv-data):** conn2(T2)가 phase3(0x0035 n=36)+**0x0030(n=20, len 0x12=18)** read 확인.
  그러나 서버 0x2001은 **16바이트(len 14)**(node 검증). 즉 conn2가 읽는 0x0030(20B)≠서버 0x2001(16B) — 4바이트 불일치(framing desync 의심).
- **G196(keysetup+0x2001):** `LOGH_LOBBY_OK_KEYSETUP=1`(conn1처럼 keysetup 0x31 + 0x2001 gin7Key) → conn2 decipher 여전히 0회.
- **종합:** 인코딩(XY/gin7/keysetup) **전부** conn2 decipher 미도달. = **인코딩/키 문제 아님.** conn2의 0x0030 프레임이
  0x613169→decode 0x613193(`call [edx+0x18]`)에서 실패→null→drop(이제 teardown 없이). decipher 0x645db0(decoder vtable
  0x74572c slot6) 미호출. **conn2의 decoder 서브오브젝트/decode loop가 구조적으로 0x0030 body decode를 못함**(키 무관).
  4바이트 framing 불일치가 단서. = G096("빈 핸들러맵")의 decoder판.
- **다음:** conn2의 0x0030 decode([edx+0x18]@0x613193) 실패 원인 RE — decoder 서브오브젝트 설치 여부 / 4바이트 framing
  desync 원인(phase3 미drain?) / decode loop 0x6122c0 구동. 그 후 decipher→0x4bdb70(flag)→FSM 전진.
  env: `LOGH_LOBBY_OK_KEY=gin7`, `LOGH_LOBBY_OK_KEYSETUP=1`(둘 다 기본 OFF, 무효 확인됨). 증거 g194~g196. SHA 복원확인.
