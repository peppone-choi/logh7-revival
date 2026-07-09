# LOGH VII 플레이 가능 상태로 가는 방침

작성일: 2026-06-10

## 목표

최종 목표는 원본 `G7MTClient.exe`가 로그인 이후 닫히지 않고, 실제 게임 화면에서 최소 플레이 루프를 수행하는 것이다. 서버는 추측한 패킷을 기본 동작으로 삼지 않는다. 각 TCP 응답은 실제 클라이언트 바이너리의 분기, 상태 플래그, 요청/응답 증거가 맞물릴 때만 구현한다.

## 현재 판단

지금 서버는 로그인 요청 `0x0034`를 받고 phase3 후보 `0x0035`, session bootstrap 후보 `0x0001/0x0003`, world/grid 후보 `0x0013/0x0014`를 보낼 수 있다. 하지만 실제 클라이언트는 아직 durable session으로 들어가지 못하고 연결을 닫는다.

가장 최근 증거 기준으로 닫힘은 decoded-response dispatcher나 world/grid handler 내부 문제가 아니다. G113은 GUI 로그인 실행만으로도 Claude가 지목한 full-map setup chain `0x0051bd70 -> 0x004b6480 -> 0x004ad3e6 -> 0x004ad710`이 실제로 실행되고 runtime manager global이 세팅됨을 확인했다. 따라서 `0x004ad7e0` 자체가 누락된 것은 아니다.

G114는 bare `0x0001/0x0003` session bootstrap 후보가 `0x00613108` null-list cleanup으로 들어가는 유해 경로임을 확인했다. 반대로 `0x0030` envelope route는 cleanup을 피한다. G115는 `LOGH_RESPONSE_KEY=decipher`, `LOGH_ECHO_0030=1`, `LOGH_FORCE_0031=1` 조건에서 inner dispatch `0x00613202` 뒤의 key/setup wrapper `0x006140c0`이 `AL=1`로 성공 반환함을 확인했다. G116은 그 직후 재귀 router `0x00613210 -> 0x006130a0`가 호출되지만 `EAX=0`으로 끝나고 pending/list 상태가 비어 있음을 확인했다. G117은 forced inner `0x31`이 `GIN7...ginei00/dummy` payload 37바이트를 새 child-codec key로 설치한다는 점을 확인했다. 두 번째 `0x0030`을 기존 decipher key로 암호화하면 `illegal cipher param length`가 나지만, 이 GIN7 raw key로 암호화하면 cipher 오류는 사라지고 `mtNetStreamInputBuffer ... no data to input`으로 바뀐다. 아직 enqueue `0x004b8850`은 0회이므로, 현재 관문은 post-`0x31` key로 암호화된 실제 login/session OK inner body 형식을 찾는 것이다.

G118은 짧은 `0x7001`/`0x7002` 후보들이 모두 lobby message 생성 1회 뒤 `uint16_t` 입력 부족에서 막힘을 확인했다. G119는 이 관측을 정적 인덱스로 고정했다. post-key lobby parser는 `0x00612357`에서 message object input을 호출하고, 이후 `LoginProcessorImp::handle_message 0x004ac700`는 `0x7001`/`0x7002`만 처리한다. 따라서 다음 Windows QA는 새 `MIP1` probe로 `0x00612357` 직전 message object, input method, input stream preview를 캡처해서 부족한 field를 찾는 것이다.

## Ghidra 가속 방침

현재 병목은 TCP 후보를 하나씩 찍어보는 속도가 아니라, 후보를 정하기 전 클라이언트 함수 의미를 복원하는 속도다. 따라서 Ghidra를 사용한다. 단, GUI에서 전체 바이너리를 수동으로 읽는 방식은 금지한다. Ghidra는 다음 세 가지에만 쓴다.

1. headless 분석으로 `G7MTClient.exe`를 한 번 import하고 함수/XREF/문자열 참조 인덱스를 만든다.
2. 현재 관문 함수만 좁혀서 본다: `0x00612357`, `0x004ac700`, `0x00612343`, `0x00612510`, `0x006140c0`, `0x004ad780`.
3. GUI decompiler에서는 위 함수들의 인자, message object type, stream read 순서, switch case body만 보정한다.

Ghidra 결과는 단독 결론으로 서버에 반영하지 않는다. 반드시 기존 루프로 되돌린다: 정적 결론을 Python verifier/test로 고정하고, patcher 또는 real-client QA로 runtime 값이 맞는지 확인한 뒤 서버 응답에 넣는다.

설치 상태는 별도로 관리한다. 2026-06-10 현재 Ghidra 12.1.2 portable 설치를 `C:\Users\user\AppData\Local\Programs\Ghidra\ghidra_12.1.2_PUBLIC`에 구성했고, 사용자 환경 변수 `GHIDRA_HOME`/`GHIDRA_HEADLESS`와 PATH를 등록했다. Ghidra local project는 경로 구성요소가 `.`으로 시작하면 거부하므로 분석 프로젝트는 `%TEMP%\logh7-ghidra-project` 같은 비숨김 disposable path에 둔다. 스크립트와 산출 JSON은 `.omo/ghidra/`와 `.omo/ulw-loop/evidence/`에 남길 수 있다.

첫 headless 산출물은 `.omo/ulw-loop/evidence/g120-ghidra-focus-dump.json`이다. 이 덤프는 `0x004ac700`의 `0x7001`/`0x7002` 분기와 `0x006140c0` key setup wrapper를 함수 단위로 확인했다. 다음 패킷 실험은 이 덤프를 바탕으로 post-key `0x7002` 최소 3바이트 body와 `0x7001`의 `body+0x04/+0x08/+0x0c` 필드를 채운 후보를 만든 뒤, `MIP1` real-client QA로 실제 stream cursor/remaining bytes를 확인한다.

## 직접 플레이 가능한 최소 루프

우선 구현 대상은 "모든 기능"이 아니라 실제 조작 가능한 최소 루프다.

1. 로그인 후 연결 유지
2. `SSLoginOK` / `SSGameLoginOK`에 해당하는 세션 플래그 전환
3. world/grid 초기화 플래그 전환
4. 지도 또는 로비 화면 진입 확인
5. 이동 명령 1개 실행 및 서버 상태 반영

이 5단계가 되기 전에는 전투, 보급, 편성, 요새, 사회 기능을 구현 완료로 보지 않는다.

## TCP 응답 수집 원칙

각 TCP 응답은 다음 항목이 모두 확인되어야 서버에 넣는다.

- 클라이언트 요청 transport code
- 서버 응답 transport code
- 대응 internal code
- 암호화 여부와 사용 key
- decoded body layout
- 응답 후 바뀌는 client state 또는 handler
- 서버 상태 머신에서 변경해야 하는 도메인 상태
- split/coalesced TCP frame에서도 같은 순서로 처리되는지

고정 hex를 무조건 반환하는 방식은 금지한다. 상태 전이와 묶이지 않은 응답은 동기화 문제를 만든다.

## 구현 순서

1. bare bootstrap 기본 송신 금지
   - `0x0001/0x0003/0x0013/0x0014`는 현재 timing에서 cleanup을 유발하므로 기본 서버 동작에 넣지 않는다.
   - 실험은 `LOGH_SUPPRESS_CANDIDATES=1`로 시작한다.

2. `0x0030` inner message 체인 확정
   - `0x0030` envelope는 decipher key로 encode한다.
   - inner `0x31`은 `0x006140c0` key/setup 성공까지는 증명됐다.
   - inner `0x31` 뒤 서버->클라이언트 `0x0030`은 `GIN7...ginei00/dummy` raw payload 37바이트로 key schedule을 다시 해야 한다.
   - G116 기준 단일 forced-`0x31` envelope는 재귀 router에서 `EAX=0`으로 끝난다. G117/G118 기준 두 번째 inner 후보는 새 key에서는 cipher와 lobby message 생성 일부를 통과하지만 stream 입력 부족 오류를 내므로, `0x00612357` message-input probe로 후속 login/session OK body 구조를 찾아야 한다.

3. 세션 유지 응답 고정
   - 연결이 닫히지 않는 최소 응답 순서를 찾는다.
   - `ssLoginOkFlag`, `ssGameLoginOkFlag`, `cipherGate`, runtime manager/queue 상태를 live scan으로 확인한다.

4. world/grid 초기화
   - `0x0f01` / `0x0f03` handler 실행을 증거로 확인한다.
   - UI가 지도/월드 상태로 들어가는지 실제 클라이언트 화면으로 확인한다.

5. 이동 기능부터 플레이 가능화
   - 현재 응답 후보가 있는 기능은 이동 계열 `0x0031/0x0032/0x0033`이다.
   - 이동 요청 capture, command OK body, entity state update, 클라이언트 반영을 한 루프로 묶는다.

6. 나머지 기능 확장
   - 전투, 보급, 편성, 요새, 사회 기능은 각각 요청/응답 쌍을 새로 찾아야 한다.
   - 매뉴얼 PDF의 기능 목록을 QA 매트릭스로 나누고, 기능별 증거가 있는 것만 서버에 활성화한다.

## 동기화 방침

서버는 connection별 상태 머신을 유지한다. 같은 세션에서 phase가 맞지 않는 요청은 무시하거나 명시적으로 trace한다. duplicate login, late write, client close 이후 write, frame split/coalesce는 모두 regression test 대상이다.

응답은 반드시 ordered write queue를 통해 나간다. 한 기능의 응답이 다른 기능의 pending state를 덮어쓰면 안 된다. 서버 로그는 각 응답에 `connectionId`, phase, request code, response code, internal code, state version을 남긴다.

## 완료 판정

다음 증거가 있어야 "게임을 직접 할 수 있다"고 말한다.

- 실제 Windows client 로그인 UI에서 로그인한다.
- 서버 trace에 로그인, 세션, world/grid, 최소 1개 플레이 명령이 순서대로 남는다.
- 클라이언트 live scan에서 session/world/grid 플래그가 전환된다.
- 화면이 닫히지 않고 조작 가능한 상태로 유지된다.
- 동일 흐름을 두 번 반복해도 포트, 프로세스, EXE 교체, String.txt 복구가 깨지지 않는다.

테스트 통과만으로는 완료가 아니다. 실제 클라이언트 surface QA가 최종 게이트다.
