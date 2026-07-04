# LOGH VII transport-0x0030 (GIN7) application protocol — RE map

작성: 2026-06-10. 대상 `G7MTClient.exe` (image base 0x00400000). 실클라 프로브 + 정적 디스어셈블로 검증.

## 왜 0x0030인가 (검증완료)

핸드셰이크(0x0034→0x0035→0x0036) 이후 클라이언트는 **transport code 0x0030만** 메시지 파이프라인으로
라우팅한다. bare 코드(0x0001/0x0013...)는 연결의 핸들러 맵(`connection+0x14` → `manager+0x14`)이 **비어 있어**
(디스크립터 NULL/count 0로 생성됨, G098) 라우팅되지 않고 첫 프레임에서 소켓이 닫힌다(G095/G103).
0x0030만 빈 맵을 우회하는 **0x30 fast-path**(라우터 `0x006130a0`)로 처리된다(G104).

`cipherGate`/`ssLoginOkFlag` 등 게이트는 별도 암호가 아니라 **로그인 핸들러(0x0200/0x0205)가 set하는 플래그**다.
서버 응답이 수락되지 않으면 게이트는 0으로 남는다(G099: enqueue 0회).

## 수신 파이프라인 (전체 매핑)

```
TCP: [u16 BE len][u16 BE 0x0030][child-codec(decipherKey) 암호화 body]
  └ 라우터 0x006130a0: opcode peek(ntohs, 0x614c70) == 0x30 -> fast-path 0x00613169
    └ 봉투 파서 0x00645db0 (vtable 0x0074572c slot +0x18):
        sub-parser([this+0xc].vtable+0x10)로 body 복호화 -> 검증:
          body = [u16 BE checksum][u32 BE id][u16 BE innerLen][innerLen bytes inner]
          - len >= 8;  (len-8) >= innerLen
          - checksum == fold16(XOR of body[2:8+innerLen] LE-dword + tail-byte), fold16(x)=((x>>16)^x)&0xFFFF
          - id <= client+0x20  (성공 시 client+0x20 = id)
          - 성공: inner payload(innerLen)를 conn+0x18로 복사
    └ 라우터 성공경로 0x006131b7: inner code = ntohs(word[inner + (manager+0x12=0)]) = inner[0:2] BE
        - code == 0x31 -> 디스패치 0x00613202: call [innerHandler] = 0x006140c0
        - code != 0x31 -> store-pending 0x00613222 (conn+0x24=buf, conn+0x2c=len, conn+0x30=1)
    └ inner 0x31 handler 0x006140c0:
        0x613ad0 key schedule(this+0xc/this+0x10) -> 성공 시
        0x614810 key image 저장(버퍼 할당+복사+각 바이트 XOR 0x17 in-place -> [this+4]=buf,[this+8]=len)
```

검증 포인트:
- 봉투 빌더 `src/server/logh7-envelope-0030.mjs`(build0030Body/parse0030Body/compute0030Checksum) — 실클라
  0x0030 메시지를 byte-exact round-trip, checksum 0x5517 재현(5 테스트 통과).
- echo-0x0030(decipherKey)이 봉투 파서에 **수락**됨(조기 close 없음, G106) = 암호·봉투 정합.
- `FORCE_0031`로 inner code를 0x31로 바꾸면 inner 디스패치 0x00613202 **발화**, 핸들러 0x006140c0 확인(G109).
- G115는 이 핸들러가 `AL=1`로 성공 반환하고, 성공 직전 `codec+0x20=1`, `manager+0x14=NULL` 상태임을 확인했다. 즉 실패 지점은 0x31 key/setup 거부가 아니라, 그 다음에 enqueue될 login/session OK inner message가 아직 없다는 점이다.
- G116은 `0x00613210 -> 0x006130a0` 재귀 router call이 실제로 실행되지만 `EAX=0`으로 반환하고, pending pointer/len/flag와 `manager+0x14`가 모두 0인 상태를 확인했다. 현재 forced 0x31 단일 envelope에는 route 가능한 다음 inner message가 없다.
- G117은 forced inner `0x31`이 wrapper `0x006140c0`에 `GIN7...ginei00/dummy` payload 37바이트를 raw key로 넘긴다는 점을 `KLG2` keysetup log로 확인했다. 같은 실행에서 두 번째 `0x0030`을 기존 decipher key로 암호화하면 `illegal cipher param length`가 나지만, 이 GIN7 raw key로 암호화하면 cipher 오류는 사라지고 stream 입력 부족 오류로 바뀐다. 따라서 post-`0x31` 서버->클라 `0x0030`은 새 GIN7 raw key로 encode해야 한다.
- G118은 post-`0x31` key로 암호화한 짧은 `0x7001`/`0x7002` 계열 후보가 모두 `_INF:[mpsCTLobbyMsgParseSystemImp::produce_message] create new message. total 1 counts.` 뒤 `[mtNetStreamInputBuffer] operator >> (uint16_t): no data to input`에서 막힘을 확인했다. 즉 message code 자체는 lobby parser까지 일부 도달하지만, 생성된 message object의 `input_from_stream`이 요구하는 body field가 부족하다.
- G119 정적 인덱스는 post-key lobby parser가 `0x00612357`의 message input call 뒤 `LoginProcessorImp::handle_message 0x004ac700`로 들어가며, 지원 inner message code가 `0x7001`/`0x7002`임을 고정했다. 새 `MIP1` patcher는 `0x00612357`에서 message object, vtable, input method, input stream preview, manager, inner code를 기록한다.
- G120 Ghidra headless decompiler dump는 `0x006122c0` consumer loop, `0x004ac700` login processor, `0x00612510` handler lookup, `0x006140c0` key setup wrapper, `0x004ad780` setup constructor를 함수 단위 C로 추출했다. `0x004ac700`은 `param_2 == 0x7001`에서 `param_5+0x0c`, `param_5+0x04`, `param_5+0x08` 계열 필드를 소비하고, `param_2 == 0x7002`에서 `param_5+0x02` byte를 `DAT_0076bbe4`에 쓴다. `0x006140c0`은 `0x00613ad0(param_1+0x0c,param_1+0x10,key,len)` 성공 후 `0x00614810(key,len)`을 호출한다. 산출물은 `.omo/ulw-loop/evidence/g120-ghidra-focus-dump.json`.

## inner 0x31 key/setup payload (부분 해독)

실클라 0x0030의 inner(디코드, code 제외) 예: `7000 47494e37 0001 0000 0007 [UTF-16 "inei00"] 0006 [UTF-16 "dummy"]`
- `GIN7` 매직 (템플릿 `0x0076bbe8` = "GIN7\0\0\0\0{A4C13748-...GUID...}", GUID=transportKey)
- 이어서 u16 필드들(0001/0000) + 길이접두 UTF-16 문자열(username "inei00", password "dummy")
- XOR 0x17은 특정 필드(아마 password) obfuscation으로 추정 (0x614810).

## inner key/setup 암호 레이어 (발견)

`0x00613ad0`은 메시지 파싱이 아니라 inner handler가 사용하는 **Blowfish-like key schedule**이다(`[0x3350932]` 가드로 1회):
- P-array: `0x7b6ae4`, 0x48바이트 = **18 dword** (Blowfish P[18])
- S-boxes: `0x7b6ba8`..`0x7b7ba8`, 0x1000바이트 = **1024 dword** (4 × 256 = Blowfish S[4][256])
- 바이너리에는 **XOR 0x91 난독화**되어 저장; 첫 사용 시 de-XOR하여 메시지 객체(this+0xc=P, this+0x10=S)로 복사.

즉 inner 0x31 payload는 별도 메시지 처리로 바로 enqueue되는 것이 아니라, 후속 inner 처리에 쓰일 key image를 세팅한다. 정적 테이블은 추출 가능
(`extractChildCodecStaticTables` 패턴 재사용). `0x614810`의 XOR 0x17은 저장 key image 난독화다.

**확정(G111):** de-XOR 0x91한 P-array 18개 전부 = **표준 Blowfish P + 0x01010101 (바이트별 +1)**. 즉 GIN7 cipher
초기 테이블 = 표준 Blowfish 테이블의 바이트별 +1 변형. 추출 결과 `.omo/ulw-loop/evidence/g111-gin7-blowfish-tables.json`.
(아직 미상: GIN7 세션 키 + key schedule, 암호가 적용되는 메시지 필드 범위.)

## 남은 일 (login-OK까지)

0. `0x31` key/setup 이후 route 가능한 후속 inner message를 구성해야 한다. G116 기준 단일 forced-0x31 envelope는 재귀 router에서 `EAX=0`으로 끝난다.
1. 후속 inner 메시지는 post-`0x31` GIN7 raw key로 암호화해야 한다. G117의 `020001`과 G118의 짧은 `0x7001`/`0x7002` 실험은 cipher와 message 생성 일부는 통과하지만 stream read가 부족하다. G120 decompile 기준 다음 후보는 `0x7002`에 최소 3바이트 body, `0x7001`에 `body+0x04/+0x08/+0x0c`를 만족하는 충분한 body를 넣고, `MIP1`로 `0x00612357` 직전 input stream 구조와 실제 message object를 확인하는 것이다.
2. 후속 inner 메시지가 **내부코드(0x0200 SSLoginOK)로 변환되어 enqueue(0x004b8850)** 되는 단계 추적.
3. login-OK inner message 조립 -> 서버 0x0030으로 전송 -> enqueue/게이트(0x0200) 검증.

## 서버 구현 메모 (Node + 타입)

서버 0x0030 송신: `build0030Body({id, innerPayload})` -> `childCodecEncode(keySchedule(tables, decipherKey), body)`
-> `[u16BE 2+enc.len][u16BE 0x0030][enc]`. inner payload = `[u16BE 0x0031 code][GIN7 메시지(XOR 0x17 필드 포함)]`.
하니스 서버 옵션(검증용): `LOGH_RESPONSE_KEY=decipher`, `LOGH_SUPPRESS_CANDIDATES=1`, `LOGH_ECHO_0030=1`,
`LOGH_FORCE_0031=1`. post-`0x31` second frame 실험은 `LOGH_SECOND_0030_INNER_HEX=<inner>`와
`LOGH_SECOND_0030_KEY_HEX=47494e370001000000070069006e006500690030003000000600640075006d006d00790000`를 같이 쓴다.
검증 프로브: factory/ctor/enqueue/router/parser/inner-keysetup/recursive-router/message-input probe (tools/logh7_*_probe_patch.py). 다음 Windows QA 우선순위는 `tools/logh7_message_input_probe_patch.py`로 생성한 `MIP1` 패치다.
