# Codex Handoff — 2026-06-11 (LOGH VII conn3 SSLogin 블로커 + 클라 RE)

이 문서 하나로 작업을 바로 이어갈 수 있게 자기완결적으로 작성했습니다. 목표는 변함없습니다:
**실제 authoritative 서버로 원본 Windows 클라(G7MTClient.exe)를 login → lobby → world → 플레이까지 구동.**
그리고 부수 목표: 클라도 뜯어 밸런스 패치·커스텀·한글화 기반 구축.

---

## 0. TL;DR — 지금 어디까지 왔나

- **★★★ G164 언패치 월드로드 성공 (2026-06-12) — 원본 클라가 클라패치 없이 월드 진입(=proper 서버 fix 완성).** 무수정 G7MTClient.exe(SHA `2848be76`)가 우리 authoritative 서버만으로 login→lobby→캐릭터선택→세션→SS로그인→**WORLD**까지 가서 우주뷰+HUD를 렌더하고 **75초 무크래시**(crash_catcher `exceptionCodeCounts:{}`). G158의 6바이트 클라패치는 이제 **불필요**. **fix=스폰 타이밍**: 로컬 플레이어 PLAYER_INFO를 `LOGH_WORLD_PLAYER=1`로 **0x0f02(RequestGridInitialize)** 응답에 push — `0x0204`(선택 char id→client+0x3584a0) + `0x0325`(unit table, unitCount=1) + `0x0323`(724B record, record[0]=char id, record[9]=unit id) 먼저, `0x0f03` ack 맨 뒤. 월드init 리셋이 **0x0f01**에서 발생(client+0x36a5dc=0, PLAYER_INFO memset)하므로 0x0f00 push는 지워지고(G159/161) 2회차 0x0300은 1프레임 늦었으나(G163), 0x0f02는 리셋 後·HUD 렌더 前이라 count=1이 살아남아 gridInitialized flip 프레임의 `FUN_004c2a80`가 PLAYER_INFO를 재구축한다. **검증도구 `tools/logh7_player_info_probe.py`**: sessionCount=1, playerInfoActiveCount=1, slot0.id==focusCharId, focusMatch=true. 증거 `.omo/ulw-loop/evidence/g164-WORLD-LOADED-UNPATCHED.png` + `g164-world-loaded-unpatched.json`. 다음 프런티어=실제 멀티플레이(in-world 0x0f06/0x0f07·0x0300 루프·grid-enter 0xb09/0xb0a·함선이동, 2번째 동접).
- **★★ G158 월드 진입(클라패치 경유, 이제 G164로 대체) — login→lobby→캐릭터선택→세션→SS로그인→WORLD 풀체인 동작.** 원본 LOGH VII 클라가 우리 서버로 붙어 **게임 월드(우주 뷰 + HUD)를 렌더링**한다. `responseWorldInitialized/responseGridInitialized` 0→64, **75초+ 무크래시**(`tools/logh7_crash_catcher.py` ctypes 디버거로 검증, `exceptionCodeCounts:{}`). 증거 스샷 `.omo/ulw-loop/evidence/g158-WORLD-LOADED-stable.png` (+ `.omo/ui-explorer/session-g158-skipcrash/shots/005-world-stable.png`).
  - **월드 블로커 근본원인 확정(G157, 디버거 1샷):** 빈(count=0) 핸드셰이크 통과 후 클라가 실제 월드 build 시 죽던 건 **클라 버그** — NULL-page read `mov ecx,dword ptr [0x80]` @ **0x0058f83a** (HUD 함수 `FUN_0058ee70`). `FUN_004c7290(...)`이 0(=no-data edge)을 반환하면 `0x58f834 jne 0x58f8c4`의 fall-through로 빠져 매핑 안 된 글로벌 `[0x80]`을 deref. 의도된 경로는 jne-taken(0x58f8c4). 이건 G144가 추정한 `FUN_004c9a80` NULL+0x1c 지점과 **다른 정확한 주소**다(마커 ODS probe는 per-frame 함수 플러드로 오진했음 → 디버거가 정답).
  - **수정 = jne→jmp 6바이트 .text 클라패치:** `0x58f834` `0f858a000000`(jne) → `e98b00000090`(jmp+nop)로 깨진 `[0x80]` read를 항상 스킵. 도구 `tools/logh7_world_crash_patch.py patch <exe> --out <patched>`. **가역적**(끝나면 EXE를 pristine `2848be76…`로 복원). 이건 "월드에 들어가는" 최소 mod이다.
  - **★ G159 proper(언패치) 데이터모델 완전 해독 (증거 `.omo/ulw-loop/evidence/g159-world-spawn-data-model.json`):** `FUN_004c7290(focusId)`는 **PLAYER_INFO 테이블**(clientBase `0x7ccffc`+0xc, stride **0x370**=880B×592슬롯, id=slot+0x24, 태그 "PLAYER_INFO %d")을 스캔해 매칭 슬롯이 없으면 0 → 크래시. 스폰 디스패처 `FUN_004ba2b0`: **case 0x204** `+0x3584a0=payload[0]`(로컬 char id), **case 0x323 ResponseInformationCharacter**(724B 레코드) `record[0]=charId`(0x3584a0과 비교)·`record[9]=unitId`(0x325 유닛테이블 매칭), 싱글턴 `+0x36a5e0`+배열 `+0x36a8b4+count*0x2d4` 기록·count(`+0x36a5dc`)++, **첫 레코드시 `FUN_004c2c80(1,+0x36a5e0,0)`로 PLAYER_INFO 무조건 스폰**; **case 0x325 ResponseInformationUnit**=유닛테이블 `+0x41a368`(count u16 `+0x41a364`). G158이 패치를 요한 이유=stable 설정에서 0x0204/0x0323 push가 `LOGH_WORLD_PUSH=1` 게이트 뒤(기본 OFF, G146 unsolicited push가 SS 핸드셰이크 교란)라 PLAYER_INFO 미스폰. (G145 워크플로의 `FUN_004c9a80`/0x126718 추정은 오진 — 디버거 G157+디스패처 RE가 정답.)
  - **다음 프런티어(task #11) = proper 서버 데이터로 pristine 클라 월드로드:** ① 0x0204 charId=1(구현됨) ② 0x0323 record[0]=1·record[9]=1(빌더 `buildInformationCharacterRecordInner`에 gridUnitId=1) ③ 0x0325 유닛테이블 count≥1, id==1(빌더 TODO) ④ **타이밍**: HUD 첫 read 前(월드빌드 0x0f00/0x0f02 무렵)에 SS req/resp 페어링을 깨지 않고 push(=G146이 틀린 변수). 검증=언패치 EXE로 ui_explorer 월드 진입.
  - **핵심 신규 진단도구:** `tools/logh7_crash_catcher.py`(DebugActiveProcess 기반 ctypes 디버거, **admin 불필요**, first/second-chance 모두 기록 → faulting 주소·fault 데이터주소 1샷 확보). WER LocalDumps(HKLM 필요)·DBWIN 마커보다 결정적. 보조: `tools/logh7_dbwin_capture.py`(OutputDebugStringA 시스템와이드 캡처), `tools/logh7_ods_trace_patch.py`(코드케이브 마커 probe).
- **Cipher(가장 어려운 벽) 해독 완료.** 클라 transport-0x0030 child codec = **Blowfish(8바이트 블록암호)**. 단, 서버→conn2 첫 `0x2001` 로비 OK는 `phase1Key`가 아니라 **decipherKey `5859`**로 암호화해야 한다. `phase1Key`로 보내면 decipher `AL=0` 후 conn2 FIN, `decipher`로 보내면 decipher `AL=1`이고 conn2가 유지된다.
- **전체 디스어셈블 인프라 완성.** Ghidra 헤드리스로 5개 바이너리 디컴파일(G7MTClient 13,800함수). 쿼리도구 `tools/logh7_redex.py`.
- **로비 로그인 블로커 근본원인 확정(2026-06-11 갱신).** conn2가 서버 0x0030 프레임을 디코드 안 하던 이유 = **conn2의 `[transport+0x12]` 헤더크기 필드(hdrOff)=4** (conn1=0). 라우터 `FUN_006130a0`가 frame code를 `readptr+hdrOff`에서 읽으므로(0x6130e4 `mov cx,[esi+0x12]`), conn2는 실제 0x0030 코드를 4바이트 빗나가 **쓰레기값(0x4530/0x8f4c)으로 오독 → 비-0x30 분기 → 디코드 안 됨**. 라이브 라우터-코드 프로브(`logh7_router_code_probe_patch`)로 직접 측정 확인(아래 §3).
- **서버측 우회 적용·검증됨.** `buildEncrypted0030Frame`에 `subheaderLen`(기본 4, `LOGH_LOBBY_SUBHEADER`) 추가 → 로비 0x0030 프레임 앞에 4바이트 제로 서브헤더를 붙여 conn2의 hdrOff=4와 정렬. **프로브 재측정: conn2가 이제 `code=0x0030`을 정확히 읽음(is0x30=True).** 즉 디코드 디스패치까지 도달.
- **★★ 세션 연결(conn3 SSLogin) 돌파 — 2026-06-11 G138 (이번 세션):** conn3 SS 응답을 **conn2와 동일한 message32 래핑** `[u32 0][u16 appCode][u8 status]`으로 보내면 실클라가 전부 소비한다. raw `[u16 code][u8 status]`는 subheader 0/4 둘 다 실패(queue `0x0200->0x0201` pending)였고, message32로 바꾸자 실클라가 `0x0200->0x0201->0x0205->0x0206->0x0304`까지 전진하고 **NOW LOADING(월드 로딩) 화면 진입**. live scan: `ssLoginOkFlag=cipherReadyFlag=sessionReadyFlag=ssGameLoginOkFlag=cipherGate=1`. 즉 **세션 생성/연결/캐릭터 선택이 end-to-end로 동작**한다. 서버 기본값을 `LOGH_SS_FORMAT=message32`로 승격(raw는 A/B opt-in), focused tests GREEN. 증거 `.omo/ulw-loop/evidence/g138-conn3-ss-message32-WIN.json`, 스샷 `.omo/ui-explorer/session-g138-ss-msg32/shots/004-after-ssgame-msg32.png`.
- **월드-init 핸드셰이크 전체 매핑 + 제너릭 워커(G139~G140, 이번 세션):** 월드 로딩 단계는 conn3에서 in-game `Information/Notify` request/response 쌍을 **패밀리별로 길게 순회**한다(0x03/0x04/0x05/0x07/0x09/0x0b/0x0c/0x0e/0x0f/0x10/0x12). 수신객체 팩토리 `FUN_004b8b00`(goto 라벨 해소)에서 **197개 코드 크기 테이블**을 추출(`.omo/ulw-loop/evidence/g140-world-init-factory-sizes.json`), 서버에 `WORLD_RESPONSE_OBJECT_SIZES`(185개) + `buildWorldDataResponseInner`(req X → empty message32 object sized for X+1, leading count 0) + login-session 제너릭 catch-all 구현. 실클라가 `0x0304…0x0300→0x0f00→0x0f02`까지 **빈 데이터로 핸드셰이크를 전부 순회**(`sessionReadyFlag=1`). 워커 EXE 트레이스 `.omo/ulw-loop/evidence/g141-world-walk-trace.jsonl`.
- **현재 경계(다음 프런티어 = 진짜 월드 데이터):** 빈(count=0) 응답으로 핸드셰이크는 통과하나, 클라가 **실제 월드를 build하려는 순간 크래시**(0x0f02 뒤 0x0300 재요청 후 프로세스 종료, `responseWorldInitialized=0`).
- **G142 진단(이번 세션):** 크래시는 **결정적**이고 **세션 데이터 내용과 무관**하다 — `0x0305`를 빈(count0) vs 1-record로 줘도 클라는 **완전히 동일한 17코드**(`0x0304…0x0300→0x0f00→0x0f02→0x0300(2회차)`)를 걷고 같은 지점에서 죽는다. 즉 첫 크래시 객체는 세션이 아니라 **2회차 `0x0300`(→`0x0301`, 4바이트 ack) 처리 또는 월드-씬 전이**다. (1-record `buildWorldInformationSessionInner`는 구조만 맞춘 **미검증** 추정 포맷이라 보류 상태로 유지.)
- **스코프 확정:** 월드 레이어는 단일 객체가 아니라 **게임 전체 데이터 모델**이다. Request/Response `Information*`가 패밀리별로 따로 등록된다 — `FUN_0040a0f0`는 `RequestInformationAccount…`를 **`0x1000+index`**로(SS는 `FUN_0044f120`가 `0x0200+index`), 그 외 `RankUp`(`FUN_0043ecd0`) 등 다수. 종류: Account/Character/Unit/Institution/Warehouse/Outfit(Crew/Transport/Party)/Package/StrategyPlan/Obstacle/DisplayCharacter/… 즉 **프로토콜 메커닉(암호·프레이밍·message32·req/resp 페어링·197코드 맵)은 전부 풀렸고**, 남은 건 각 `Input_Information*` 파서를 로비 0x2006/0x2004처럼 디컴파일해 **실데이터를 채우는 구현 작업**(분량 큼).
- **다음 결정타(두 갈래):** (a) **계측**으로 2회차 `0x0300`/`0x0301` 직후 죽는 지점을 잡는다 — 월드-build 함수(`FUN_004be8f0/004bef70/004bf320/004bfc40`)에 진행 프로브를 박거나 디버거로 fault 주소 확보(WER 이벤트는 안 남음). (b) 또는 `0x0300/0x0301` 컨슈머(internal handler)를 디컴파일해 4바이트 ack가 특정 값/구조를 요구하는지 확인. 그 한 객체를 넘기면 다음 크래시 객체로 전진하는 식으로 **데이터 모델을 점진 구축**.

---

## 1. 연결 토폴로지 (확정)

netstat로 확인: 클라는 우리 서버(127.0.0.1:47900)에 **연결 1개씩**만 가짐.
- **conn1 (로그인)**: 클라 0x7000(GIN7 자격증명) → 서버 keysetup+0x7001 redirect → 클라가 redirect 처리 후 conn1 닫고 conn2 오픈.
- **conn2 (로비)**: phase3 핸드셰이크(0x0035) → 클라 0x0020, 0x2000(lobby login req) → 서버 0x2001(LobbyLoginOK).
- **conn3 (세션/월드 로그인)**: conn2에서 `0x2009 -> 0x200a` 후 클라가 새로 오픈. phase3 핸드셰이크 → 클라 `0x0020 payload=00000000` → 클라 app-level `0x0200`(SSLoginRequest). 서버는 현재 `0x0201`을 보내지만 실클라 handler가 아직 안 먹는다(G137).
- **별도 type-3 로비 소켓은 없음.** 클라는 한 소켓(conn2)에 여러 내부 시스템을 다중화.

서버: `src/server/logh7-auth-server.mjs` (`node src/server/logh7-server.mjs serve-auth --host 127.0.0.1 --port 47900`).
- lobby-login-ok 송신 키 기본값 = **decipherKey `5859`**. `LOGH_LOBBY_OK_KEY=phase1|gin7|decipher`는 비교 실험용 override다. proactive 0x2001(phase3 직후 선제전송)은 `LOGH_LOBBY_PROACTIVE_OK=1` opt-in.

---

## 2. Cipher (해결됨, 재현됨)

- child codec = Blowfish. P-array `0x007b6ae4`(18 dword), 4 S-box `0x007b6ba8`(각 256 dword), 초기값 **XOR 0x91** 난독. 클라 키셋업 `FUN_00613ad0`. 서버 구현 `src/server/logh7-codec.mjs`와 **라인 단위 일치**.
- 0x0030 body(복호 후) = `[u16 BE checksum][u32 BE id][u16 BE innerLen][inner]`. checksum = `fold16(XOR (id+innerLen+inner) LE-dword + 잔여)`, fold16=((x>>16)^x)&0xffff. 서버 `compute0030Checksum`(logh7-envelope-0030.mjs)와 일치.
- decipher = `FUN_00645db0`(mpsCipherManager::decipher_message). 4관문: child복호 / 길이≥8+innerLen / checksum / 시퀀스(id>baseline this+0x20).
- **키 주의:** conn2 첫 로비 OK(`inner=0x2001`)는 `phase1Key`가 아니라 phase3에서 광고된 **decipherKey `5859`**로 암호화해야 한다. 실클라 비교: `phase1Key`는 parser method `0x645db0`까지 도달하되 `decodeAl=0` 후 즉시 FIN, `decipherKey`는 `decodeAl=1`이고 FIN이 사라진다. 서버 기본값도 `decipher`로 변경됨.
- **프레임 길이 주의:** Blowfish는 블록암호라 body 12B → encoded **16B**(8배수 패딩) → 와이어 프레임 **20B, len 0x0012(=18)**. (stream cipher 아님. 과거 16B/len14 계산은 오류였음.) node 재현으로 확정:
  ```
  inner(0x2001)=20010000(4)  body=...(12)  FRAME=0012003081012b12...(20B, lenField18)
  ```

---

## 3. 로비 블로커 — 가장 정밀한 진단 (★ 여기가 핵심)

frida 동적추적(`tools/logh7_frida_trace.py`, frida 17.11)으로 단계별 확인. **EXE는 base 0x400000에 로드(ASLR 없음)이라 Ghidra 주소가 런타임과 직접 일치.**

| 단계 | conn1 | conn2 |
|---|---|---|
| recv (0x615307, EDI=count, ESI=transport) | 36(0x0035)+88(0x0030) ✓ | **56(0x0035)+20(0x0030=0x2001) ✓ 정상 수신** |
| 링버퍼 커밋 (recv워커 `FUN_006152b0`) | ✓ | **✓ — read offset r: 56→76, 즉 20B 소비됨** |
| 디코드 디스패치 `0x613193 call [edx+0x18]` (edx=*frameDesc 코덱 vtable) | **`[edx+0x18]=0x645db0` decipher 2× ret=1** | **decipher 0회 — 호출 안 됨!** |
| 결과 | LoginProc(`FUN_004ac700`) arg=0x7001 ✓ | flag 0 |

**결론:** conn2는 0x2001(20B)을 받고 **링에서 소비(r 전진)까지 하지만 decipher로 디코드되지 않는다.** 바이트가 **decipher 도달 전에 다른 경로로 소비**된다(라우터 `FUN_006130a0`가 conn2 프레임을 디코드 분기로 안 보냄). 즉:

- recv 정상, 프레임 정합 정상, 큐 드레인(`FUN_004b8950`)도 메인루프에서 계속 돎(frida 확인).
- 블로커는 **라우터의 conn2 0x0030 프레임 처리 분기** — `FUN_006130a0`에서 frame code를 읽어(`FUN_00614c70`) `if(code!=0x30)` 비-0x30 분기로 빠지거나, 핸드셰이크 처리가 over-read 하거나, conn2 코덱 객체 vtable[6]≠0x645db0.

### 워크플로(5에이전트)가 낸 상위 구조 (참고; 일부는 frida가 정정)
- 로비 성공 플래그 `*(*(0x7ccffc))+0x35837b` 는 **`caseD_2001`(0x4bdb70)** 만 세움. caseD_2001 ∈ `FUN_004ba2b0`(switch on inner code). 그 호출경로: 로비 큐 `FUN_004b8850`(적재, ring @`*(0x7ccffc)+0x3552b8`, stride0x14, code@+0x3552bc) → `FUN_004b8950`(드레인) → `FUN_004ba2b0`. 적재는 type-3 recv콜백 `FUN_004ae0d0`만 함(비-0x202/0x204 코드 → `FUN_004b8850(code,body)`).
- **단, frida 결과상 conn2의 0x2001은 그 단계(디스패치 루프 `FUN_006122c0` 0x61231b)에 **도달조차 못 함**(decipher가 안 되니까). 그래서 "LoginProcessor가 폐기" 가설보다 2단계 상류가 진짜 원인.**

### ★ 라우터 분기 프로브 — 실행·확정 완료 (2026-06-11)
위 가설을 `tools/logh7_router_code_probe_patch.py`(0x6130fb, frame code+transport+readptr+hdrOff 기록)로 **ui_explorer 안정 로그인** 하에 직접 측정해 확정함. 측정 링(`.omo/ui-explorer/rc-ring.bin` 등) 결과:

| 캡처 | conn | transport | code | hdrOff | is0x30 |
|---|---|---|---|---|---|
| 서브헤더 前(rc-ring) | conn1 | …3100 | 0x0030 | 0 | ✓ |
| 서브헤더 前(rc-ring) | **conn2** | …3810 | **0x4530 / 0x8f4c(쓰레기)** | **4** | **✗** |
| 서브헤더 後(rc2/rc3) | conn2 | …3810 | **0x0030** | 4 | **✓** |

**확정 결론(가설 3번 = 헤더 오프셋 문제로 판명):** conn2는 `[transport+0x12]`(hdrOff)=4라서 라우터가 frame code를 `readptr+4`에서 읽어 **실제 0x0030을 4바이트 빗나가 쓰레기로 오독** → 비-0x30 분기 → 디코드 안 됨. (conn1은 hdrOff=0이라 정상.) hdrOff=4는 `FUN_004e2e30`의 `*(undefined1*)(iVar5+0x12)=4`가 세움.

**서버측 우회 적용·검증:** `buildEncrypted0030Frame({…, subheaderLen})`(기본 4, `LOGH_LOBBY_SUBHEADER`)로 로비 0x0030 앞에 4바이트 제로 서브헤더를 붙임 → 위 표 "서브헤더 後"처럼 conn2가 code=0x0030을 정확히 읽음(디코드 디스패치 도달).

### ★ 2026-06-11 Codex 재측정 — 디코드 실패는 해소, 승격 실패가 남음
`tools/logh7_decode_out_probe_patch.py`와 `tools/logh7_parser_method_probe_patch.py`를 고쳐 재측정했다.

- parser method probe: conn2도 conn1과 같은 vtable `0x0074572c`, method `0x00645db0`를 사용한다. callsite 인자는 `[esp]=inputPtr`, `[esp+4]=payloadLen`, `[esp+8]=outputPtr`였고, conn2 `0x2001` encoded body 길이는 16으로 정상이다. 즉 코덱 객체 미설치가 아니다.
- `phase1Key` 서버 기본값으로 보낸 경우: conn2 record는 `decodeAl=0`, 서버 trace는 `lobby-login-ok-sent` 직후 conn2 FIN이다.
- `LOGH_LOBBY_OK_KEY=decipher`로 보낸 경우: conn2 record는 `decodeAl=1`, conn2 FIN이 사라지고 runtimeManager pointer가 유지된다.
- 서버 기본값을 `decipher`로 변경한 뒤 실클라 기본 실행에서도 trace에 `keyMode:"decipher"`, `subheaderLen:4`, `frameBytes:24`가 찍히고 conn2 FIN은 재현되지 않는다.

**G122 시점 블로커:** decoded `0x2001`이 앱 계층으로 소비되지 않았다. 라이브 스캔상 `ssLoginOkFlag`, `sessionReadyFlag`, `world/grid` 관련 flag는 모두 0이고, transport queue는 `0x2000 -> 0x2001`를 유지했다. 이 판단은 아래 G123에서 갱신됨: `0x2001`은 9B body로 handler return까지 성공했고, 현재 블로커는 `0x2004`다.

### ★ 2026-06-11 G122 — 승격 경로 재측정
`tools/logh7_promotion_probe_patch.py`를 추가해 한 EXE에서 네 지점을 동시에 본다: router non-`0x31` return `0x613222`, dispatch-frame loop `0x61231b`, handler lookup `0x612348`, decoded-message enqueue `0x4b8850`.

- 기본 raw `0x2001`(`20010000`) + decipher + subheader: conn2 `0x2001`은 `routerReturn -> dispatchFrame -> handlerLookup`까지 도달한다. lookup은 **hit**이고 key는 `0x0003`. 즉 이제 map lookup miss도 아니다. 단 `0x4b8850` enqueue는 0회, flags는 여전히 0.
- `tools/logh7_message_input_probe_patch.py`: conn2 key `0x0003`의 handler는 vtable `0x0066c0d8`, input method `0x00404210`이다. Ghidra상 이는 `mpsClientMessage32`류 입력으로, `[u32 field][u16 appCode][payload]`를 읽은 뒤 `FUN_00404610`으로 넘긴다. 기존 raw `20010000`은 이 형식에는 2바이트 부족하다.
- 서버에 opt-in `LOGH_LOBBY_OK_FORMAT=message32` 추가: `0x2001` OK body를 `00000000 2001 0000`으로 보낸다. 실클라 promotion ring에서 conn2 body는 `len=8`, `bodyFirstDword=0`, router/dispatch/lookup hit까지 정상.
- 하지만 `message32`도 아직 세션 flag를 세우지 못한다. `message_input` pre-call은 conn2 `0x00404210` 호출을 기록하지만, `message_input_post`는 conn2 post-call record를 남기지 않고 login conn1 `0x7001`만 기록한다. live scan은 여전히 `ssLoginOkFlag/sessionReady/world/grid=0`, queue `0x2000 -> 0x2001`.

**G122 시점 결론:** 암호, subheader, router return, dispatch loop, handler lookup까지는 해결됐다. 남은 관문은 `0x00404210 -> FUN_00404610` 내부의 app code `0x2001` 처리였다. 이 판단은 아래 G123에서 갱신됨: `0x2001` message object/input/handler는 해결됐고, 다음 대상은 `0x2004`의 pre-`FUN_00404610` 경로다.

### ★ 2026-06-11 G123 — `0x2001` body 길이 확정, 관문은 `0x2004`로 이동
`tools/logh7_message_object_probe_patch.py`를 추가했다. 한 EXE에서 `FUN_00404610` 내부 세 지점을 동시에 본다: app-code lookup 결과 `0x0040467b`, message input 호출 `0x004046b5`, handler vtable+8 호출 `0x004046c7`. 기본 필터 app code는 `0x2001`이고 `--app-code`로 `0x2004` 등 다른 code를 지정할 수 있다.

- 기존 message32 `0x2001` body `0000000020010000`(8B)는 lookup과 input-before까지만 도달한다. 실측: message object `0x053b2eb4`, vtable `0x0066cdb4`, input method `0x0043f830`, streamLen=8, input-after/handler record 없음.
- `0x0043f830` 디컴파일/디스어셈블 결과: `FUN_00610420(param_1,1,0,2)`로 1바이트를 읽고, 이어 vtable+0x20 호출로 `param_1+2`에 uint16을 읽는다. 즉 `0x2001` payload는 2B가 아니라 **3B**가 필요하다.
- `0x2001`의 올바른 inner는 `00000000 2001 00 0000`(`000000002001000000`, 9B)다. 이 형식으로 실클라가 input-after와 handler-before/after까지 기록했고, 서버 trace에서 클라의 다음 요청 `0x2003`이 관측됐다. transport queue도 `0x2003 -> 0x2004`까지 이동한다.
- 서버 기본 message32 `0x2001`도 위 9B body로 갱신했다. 또한 generic lobby 응답 `buildLobbyResponseInner(0x2004/0x2006/...)`와 `0x200a` endpoint 응답은 raw code가 아니라 `mpsClientMessage32` wrapper(`00000000 <appCode> <payload>`)로 싸도록 바꿨다.
- 그러나 `0x2004`는 아직 통과하지 못했다. wrapped `0x2004`(`000000002004`, respLen=6)를 보내면 raw `2004` 때의 즉시 실패 양상은 바뀌지만, `--app-code 0x2004` message-object probe ring counter=0이다. 즉 현재 실패 위치는 `0x2004`가 `FUN_00404610`에 들어가기 전이다.

**G123 결론(이후 G124에서 갱신됨):** 로그인은 아직 완료되지 않았다. 다만 첫 로비 OK(`0x2001`)는 구조적으로 소비되어 클라이언트가 `0x2003`을 보내는 단계까지 전진했다. 다음 결정타는 wrapped `0x2004`를 대상으로 promotion/router probe를 다시 돌려, decoded body가 dispatchFrame/handlerLookup 전에 폐기되는지 또는 다른 message family로 빠지는지 확정하는 것이었다.

### ★ 2026-06-11 G124 — `0x2004` 통과, 관문은 `0x2006`으로 이동

`0x2004`에서 두 가지 문제가 겹쳐 있었다.

- 첫 번째 문제는 framing이었다. `lobby-login-ok`에는 conn2 4바이트 subheader가 붙지만 generic `lobby-response`에는 빠져 있었다. auth-server RED test가 frame size `18 !== 22`로 실패했고, `lobby-response`도 `subheaderLen=4`를 넘기도록 고친 뒤 실클라 promotion ring에서 `0x2004 routerReturn(decodedLen=6)`이 보였다.
- 두 번째 문제는 body 길이였다. `000000002004`는 app-code `0x2004` lookup과 input-before까지만 도달했다. 입력 메서드 `0x0043fd60`는 첫 payload byte를 count로 읽고 `count < 3` 분기를 타므로, 최소 zero-count byte가 필요하다.
- 서버 `0x2003 -> 0x2004` 응답을 `00000000200400`으로 바꾸자 실클라 message-object ring이 `lookupResult -> inputBefore -> inputAfter -> handlerBefore -> handlerAfter`까지 기록했다. handler method는 `0x004a9cf0`, input method는 `0x0043fd60`, streamLen은 7이다.
- 그 결과 서버 trace에서 클라이언트가 실제 다음 요청 `0x2005`를 두 번 보냈다: 첫 번째 inner payload `200502`, 두 번째 inner payload `200501`. 서버는 현재 둘 다 placeholder `0x2006`으로 답한다(`respLen=268`, `subheaderLen=4`, `frameBytes=288`).

**G124 당시 결론:** 아직 로그인/플레이 완료가 아니었다. 당시 다음 관문은 `0x2006` body layout이었다. 이 판단은 아래 G129~G137에서 갱신됨.

### ★ 2026-06-11 G129~G136 — `0x2006`/동적 카드 경로 통과, conn3 진입

`0x2006`과 카드 선택 게이트는 단순 placeholder 문제가 아니라 `0x2004` 캐릭터 스트림과 카드-object enable 조건이 결합된 문제였다.

- `0x2006` 파서 `FUN_00444900`는 leading raw byte, top-level count, per-record `u16 sessionId`, one-byte status, UTF-16LE session name/description을 읽는다. status `1` 또는 `2`가 selectable 조건이다. 서버는 full-size `0x5304` body 안에 record status `1`과 session name을 넣도록 바뀌었다.
- 동적 카드 생성은 서버가 UI object를 직접 만드는 게 아니다. 클라의 카드/object pool이 있고, 서버 `0x2004` character-charge response가 **account/session character list에서 나온 compact sequential record stream**을 내려주면 클라가 카드로 렌더링한다.
- `0x2004` parser `0x0043fd60`의 목적지 record stride는 `0x36c`지만, wire source는 stride-aligned가 아니라 compact sequential이다. name/description 뒤 zero prefix와 nested count blocks를 소비한 뒤 stream offset `0x64/0x65`가 첫 record의 card-kind/detail-count gate로 복사된다. 예전처럼 wire `payload+0x2a0/+0x2a1`를 직접 쓰는 방식은 실클라에서 실패했다.
- `tools/logh7_object_enable_probe_patch.py`(`FUN_005024e0` writer hook)로 확인: 카드 object id `0x0112/0x0113`는 builder에서 만들어지지만, return address `0x0051f282/0x0051f306` 쪽 enable updater가 `object+0x15=0`으로 꺼버렸다. 조건은 top 기준 `DAT_02216c8e in {1,2} && DAT_02216f28 == 2 && DAT_02216f29 != 0`. compact stream fix 후 top card는 `newEnable=1`이 됐다.
- 실클라 surface proof: top card 클릭 좌표 `650,315`에서 client inner `0x2009`(`20090100`)가 서버 trace에 찍혔고, 서버는 `0x200a` world endpoint를 보냈다. 그 뒤 conn2 FIN, conn3 open, phase3, `0x0020 payload=00000000`, `0x0200`까지 관측됐다.

중요 evidence:
- `.omo/ulw-loop/evidence/g136-compact-card-gate-green.txt`
- `.omo/ulw-loop/evidence/g136-compact-test-server.txt` (`npm run test:server` 65 pass)
- `.omo/ulw-loop/evidence/g136-compact-test-tools.txt` (`npm run test:tools` 200 pass)
- `.omo/ui-explorer/session-codex-card-enable-compact/` trace/shots

### ★ 2026-06-11 G137 — 현재 에러: conn3 `0x0201` 서버 응답이 실클라에서 소비되지 않음

현재 구현은 conn3 app-level SSLoginRequest에 응답한다.

- Static anchors:
  - `.omo/ulw-loop/evidence/g033-internal-020x-switch-map.txt`: `internal=0x0201 target=0x004ba347`, `internal=0x0206 target=0x004ba3af`
  - `tools.logh7_redex func 0x004ba347`: `case 0x201` prints `SSLoginOK OK`, first body byte를 `client+0x35f252`에 복사, `client+0x358375`와 `client+0x35837d` set
  - `tools.logh7_redex func 0x004ba3af`: `case 0x206` prints `SSGameLoginOK OK`, first body byte를 `client+0x358384`에 복사, `client+0x35837e` set
  - `tools.logh7_redex func 0x0044f120`: SS message names가 app code `0x0200..0x0207`에 매핑됨
- Server/test changes:
  - `src/server/logh7-login-protocol.mjs`: `SS_LOGIN_REQUEST_CODE=0x0200`, `SS_LOGIN_OK_CODE=0x0201`, `SS_GAME_LOGIN_REQUEST_CODE=0x0205`, `SS_GAME_LOGIN_OK_CODE=0x0206`, `buildSsLoginOkInner()`, `buildSsGameLoginOkInner()`
  - `src/server/logh7-login-session.mjs`: conn3 `0x0020 payload=0`를 `ss-init-silent`로 처리, `0x0200 -> 0x0201`, `0x0205 -> 0x0206`
  - `src/server/logh7-auth-server.mjs`: `action.kind === 'ss-response'` branch 추가, 기본 `LOGH_SS_SUBHEADER=4`로 encrypted `0x0030` frame 송신
  - Focused GREEN: `.omo/ulw-loop/evidence/g137-conn3-sslogin-green.txt` (`node --test tests/server/logh7-login-protocol.test.mjs tests/server/logh7-login-session.test.mjs tests/server/logh7-auth-server.test.mjs`, 35 pass)
- Real-client trace with default `LOGH_SS_SUBHEADER=4`:
  - `0x2009` received, server sent `0x200a`
  - conn3 opened and phase3 completed
  - client sent `0x0020` payload `00000000`; server action `ss-init-silent`
  - client sent `0x0200` payload `020047494e3700570000070069006e00650069003000300000`; server action `ss-response`
  - server sent `respInnerCodeHex=0x0201`, `respLen=4`, `subheaderLen=4`, `frameBytes=24`
  - trace: `.omo/ulw-loop/evidence/g137-real-client-trace-subheader4.json`
- Live scan after that reply:
  - `.omo/ulw-loop/evidence/g137-live-scan-after-sslogin.json`
  - `ssLoginOkFlag=0`, `cipherReadyFlag=0`, `sessionReadyFlag=0`, `ssGameLoginOkFlag=0`, `cipherGate=0`, `responseWorldInitialized=0`, `responseGridInitialized=0`
  - `transportQueueCount=1`, entry `queuedInternalHex=0x0200`, `pairedInternalHex=0x0201`

**현재 해석:** 서버가 conn3 `0x0201`을 보내는 것까지는 구현/테스트/trace로 확인됐다. 그러나 실클라 handler 실행 증거가 없다. `0x0200 -> 0x0201` queue entry가 남고 SS/session flags가 0이므로, `0x0201`이 decode/dispatch/enqueue/handler 중 어딘가에서 막힌다. 즉 현재 에러는 "로그인 이후 서버가 없다"가 아니라 **conn3 S->C response wrapper/subheader 또는 promotion path 미확정**이다.

다음으로 바로 할 일:
1. `LOGH_SS_SUBHEADER=0`으로 같은 실클라 A/B를 돌려라. conn2는 hdrOff=4였지만 conn3가 같은지 아직 확정되지 않았다. subheader=0에서 flags가 set 되거나 다음 `0x0205`가 나오면 기본값을 0으로 바꾸고 테스트를 갱신한다.
2. subheader=0도 실패하면, `tools/logh7_promotion_probe_patch.py` 또는 `tools/logh7_decoded_response_promotion_patch.py`를 conn3 `0x0201`에 맞춰 사용해 router return, dispatchFrame, handlerLookup, decoded-message enqueue 중 어디까지 가는지 본다.
3. conn3에서 `0x0201`이 router까지 안 오면 frame wrapper/subheader/key 문제다. router/dispatch까지 오지만 handler가 안 타면 `0x0201` body 형식 또는 raw-vs-message32 wrapper 문제다. handler가 타는데 flags가 안 세워지면 body status semantics 문제다.

---

## 4. 도구 (이번 세션 신규/핵심)

- `tools/logh7_redex.py` — Ghidra 디컴파일 인덱스 쿼리: `func <addr>` / `grep <regex> [--c]` / `name` / `str` / `xref` / `calls`. 인덱스: `.omo/ghidra/export/<bin>/functions.jsonl`(+strings.tsv, symbols.tsv).
- `tools/ghidra_scripts/Logh7FullExport.java` — 전체 함수 디컴파일+문자열+심볼 익스포트(+vtable 포인터 함수 강제생성). `Logh7DumpAddrs.java` — vtable 전용 함수 온디맨드 덤프.
  - 헤드리스: `C:/Users/user/AppData/Local/Programs/Ghidra/ghidra_12.1.2_PUBLIC/support/analyzeHeadless.bat`. **프로젝트 경로는 점 없는 곳**(`C:/.../Temp/logh7gh/proj`; Ghidra가 `.`-시작 경로 거부).
- `tools/logh7_ui_explorer.py` — 실클라+서버 detached 인터랙티브 구동. `start/shot/click/key/text/trace/info/stop`. `--patched-exe`, `--env KEY=VAL`. **로그인 안정적.** stop이 원본 SHA `2848be76a7662e25159353463bdfd8ff2f270ac5845ef4cea62983443c155345` 복원·검증.
- `tools/logh7_frida_trace.py` — frida 동적추적(spawn→hook→login→capture). 후크 함수+콜스택을 Ghidra VA로 매핑. **주의: 무거운 후크(매 프레임/매 폴) 오버헤드가 타이밍 레이스 교란 → 경량 후크만 쓰고, 안정 로그인 필요.**
- 프로브 패치(코드케이브 트램폴린, 링버퍼 기록): `logh7_promotion_probe_patch.py`(0x613222/0x61231b/0x612348/0x4b8850 조합), `logh7_decoded_response_promotion_patch.py`, `logh7_dispatch_frame_probe_patch.py`(0x61231b), `logh7_decipher_entry_probe_patch.py`(0x645db0), `logh7_recv_data_probe_patch.py`(0x615307), `logh7_lobby_lookup_probe_patch.py`(0x612348), `logh7_lobby_dispatch_probe_patch.py`(0x4bd7d4), `logh7_decode_out_probe_patch.py`(0x613196), `logh7_parser_method_probe_patch.py`(0x613193), `logh7_message_input_probe_patch.py`(0x612357), `logh7_message_input_post_probe_patch.py`(0x61235a), `logh7_message_object_probe_patch.py`(`FUN_00404610` 내부 app-code lookup/input/handler, `--app-code`), `logh7_ui_hit_probe_patch.py`(`FUN_005015f0` hit-state), `logh7_object_enable_probe_patch.py`(`FUN_005024e0` object+0x15 enable writer) 등. 링은 클라 메모리에서 `read_client_memory`로 읽어 decode.
- 클라 패치(레이어링): `logh7_lobby_unblock_patch.py`(router teardown NOP 0x613157 + scene gate NOP 0x51a39c → conn2 유지+FSM 틱), `logh7_lobby_forward_patch.py`(0x61231b에서 로비코드→큐 적재; **단 conn2가 이 지점에 도달 안 해서 무효 — §3 참고**), `logh7_lobby_flag_force_patch.py`(타이밍 이슈로 무효).
- CD 감사: `tools/logh7_cd_extract_audit.py`(archive.org BIN range 파싱), `tools/_cab_diff.py`(unshield CAB vs 설치본).

---

## 5. 부수 발견 (영구 자산)

- **CD 무결성** (`memory/logh7-cd-extract-integrity`): 원본 CD = archive.org `logh-7`(BIN/CUE) = 로컬 `.omo/work/logh7-iso-root/`(InstallShield, unshield로 추출). 설치본 2186/2194 byte-exact. **진짜 소실 2개**: `data/image/planetbattle/` 同盟装甲兵 vs 帝国装甲兵이 같은 mojibake로 충돌→1쌍 소실. 나머지 일본어파일은 이름만 깨짐(데이터 존재).
- **메달**: `data/image/Medal/`은 `m_f001~015`(×png+tga) 한 계열뿐 = CD에 제국 메달 없음(추출 문제 아님). 클라 EXE에 메달 경로 하드코딩 없음(디렉터리 열거/서버 구동).
- **폰트/일본어 표시/한글화** (`memory/logh7-font-localization`): 텍스트 = GDI ANSI `CreateFontA`(charset=**DEFAULT_CHARSET**, 호출부 0x4aee0f/0x4b0bb9) → `TextOutA/ExtTextOutA/DrawTextA`. 폰트파일 없음. UI 문자열 = `exe/String.txt`(Shift-JIS/cp932). **일본어 표시 해결됨(G126):** `tools/logh7_japanese_font_patch.py`가 charset immediate `push 1`(`6A 01`) 두 곳을 `push 0x80`(`SHIFTJIS_CHARSET`, `6A 80`)으로 바꾼다(VA `0x004aedeb`, `0x004b0b97`). 실클라 QA 스크린샷 `.omo/ui-explorer/session-codex-japanese-font/shots/001-after-login.png`에서 `ゲーム開始`, `新キャラクターの作成`, `セッションの変更`, `ゲーム終了` 등이 정상 표시됐다. 원본 설치본은 stop 후 SHA `2848be76...c155345`로 복원된다. **한글화 1차 방침:** 번역 원문은 UTF-8로 관리하되, 클라 교체 파일은 CP949로 산출하고 `--charset hangeul`(`6A 81`, `HANGEUL_CHARSET`) EXE 패치를 쓴다. **UTF-8/ANSI 제거는 2차 목표:** manifest `activeCodePage=UTF-8`는 실험용이고, 제품급은 `TextOutA`/`ExtTextOutA`/`DrawTextA`를 UTF-8→UTF-16 변환 wrapper로 보내 `-W` API를 호출하는 A→W shim이 필요하다. 자세한 방침은 `docs/logh7-localization-pipeline.md`의 “UTF-8/Unicode 포팅 선택지” 섹션.

---

## 6. 운영 주의

- **원본 EXE SHA**: `2848be76a7662e25159353463bdfd8ff2f270ac5845ef4cea62983443c155345`. 모든 도구가 작업 후 복원·검증. 중단되면 `.omo/ghidra/bin/G7MTClient.exe`(검증된 순정)로 복원.
- 설치본 EXE: `.omo/work/logh7-installed/exe/G7MTClient.exe`. 순정 사본: `.omo/ghidra/bin/G7MTClient.exe`.
- 누적 프로세스 정리: leftover auth 서버는 `netstat -ano | grep 47900 | grep LISTENING`의 PID를 taskkill (Claude/MCP node는 건드리지 말 것).
- retool(read-only disasm): `C:/Users/user/AppData/Local/Temp/logh7_re/retool.py` (env `LOGH_PE`로 대상 지정). cmd: range/disasm/xref/imports.
- 메모리 인덱스: `C:/Users/user/.claude/projects/E--logh7-revival/memory/MEMORY.md`. 특히 `logh7-decipher-gate-decoded`(블로커 전모), `logh7-re-index`, `logh7-wire-protocol-decoded`.

---

## 7. 재개 시 첫 행동 (권장 순서)

0. **먼저 cleanup 확인.** 현재 내가 확인한 상태는 OK: `.omo/work/logh7-installed/exe/G7MTClient.exe` SHA = `2848be76a7662e25159353463bdfd8ff2f270ac5845ef4cea62983443c155345`, `.uiexplorer` backup 없음, 47900 LISTEN 없음, `.omo/ui-explorer/session-codex-conn3-sslogin`의 server/client dead. 그래도 시작 전 아래를 다시 확인:
   ```
   sha256sum .omo/work/logh7-installed/exe/G7MTClient.exe
   ls -l .omo/work/logh7-installed/exe/G7MTClient.exe.uiexplorer 2>/dev/null || true
   netstat -ano | grep ':47900 ' | grep LISTENING || true
   python -m tools.logh7_ui_explorer --session .omo/ui-explorer/session-codex-conn3-sslogin info
   ```
1. **stale 문서 주의:** `0x2006`은 더 이상 첫 관문이 아니다. conn2 `0x2001/0x2003/0x2004/0x2005/0x2006/0x2009/0x200a` 경로는 current server로 conn3 진입까지 간다. dynamic card 생성도 동작한다.
2. **첫 실험은 conn3 SS subheader A/B.** 지금 실패한 실클라 증거는 `LOGH_SS_SUBHEADER=4`다. 같은 run을 `LOGH_SS_SUBHEADER=0`으로 반복:
   ```
   python -m tools.logh7_ui_explorer --session .omo/ui-explorer/session-codex-conn3-sslogin-nosub start --port 47900 --env LOGH_LOBBY_OK_FORMAT=message32 --env LOGH_SS_SUBHEADER=0 --settle 4.0
   python -m tools.logh7_ui_explorer --session .omo/ui-explorer/session-codex-conn3-sslogin-nosub click 126 194 --label left0 --settle 2.0
   python -m tools.logh7_ui_explorer --session .omo/ui-explorer/session-codex-conn3-sslogin-nosub click 650 315 --label top-card --settle 4.0
   python -m tools.logh7_ui_explorer --session .omo/ui-explorer/session-codex-conn3-sslogin-nosub trace --all > .omo/ulw-loop/evidence/g137-real-client-trace-subheader0.json
   ```
   그 다음 live scan으로 `ssLoginOkFlag`, `sessionReadyFlag`, `transportQueueCount`, `transportQueueEntries`를 저장한다. 기존 scan 예시는 `.omo/ulw-loop/evidence/g137-live-scan-after-sslogin.json`.
3. **판정 기준.** subheader=0에서 `ssLoginOkFlag` 또는 `sessionReadyFlag`가 set 되거나 다음 `0x0205`/world request가 나오면 `LOGH_SS_SUBHEADER` 기본값을 0으로 바꾸고 server/auth integration test를 갱신한다. subheader=0도 queue `0x0200 -> 0x0201`가 남으면 response가 client handler까지 못 간 것이다.
4. **subheader A/B가 실패하면 promotion probe.** `tools/logh7_promotion_probe_patch.py` 또는 `tools/logh7_decoded_response_promotion_patch.py`를 conn3 `0x0201`에 맞춰 router return, dispatchFrame, handlerLookup, enqueue를 분리한다. conn2에서 썼던 판단법을 그대로 쓰되, app code는 `0x0201`이고 실측 요청은 `0x0200`.
5. **서버 수정은 RED→GREEN 후.** 이미 focused GREEN은 `.omo/ulw-loop/evidence/g137-conn3-sslogin-green.txt`에 있다. 새 원인이 나오면 먼저 `tests/server/logh7-login-protocol.test.mjs`, `tests/server/logh7-login-session.test.mjs`, `tests/server/logh7-auth-server.test.mjs` 중 해당 seam에 RED를 추가하고, 그 다음 최소 수정한다.
6. 병행: 포팅/한글화(§5) — Track A(플레이어블 서버/세션 복구)는 순정 또는 프로토콜 probe EXE만 사용하고, Track B(1차 한글 표시)는 `HANGEUL_CHARSET` 패치 EXE와 CP949 산출물만 사용한다. UTF-8 직접 포팅은 Track C로 분리하고, 로비/세션 전환이 안정화된 뒤 A→W shim으로 진행한다. 세부 규칙은 `docs/logh7-localization-pipeline.md`의 “병렬 포팅 진행 방침”.
