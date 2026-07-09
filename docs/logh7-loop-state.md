# LOGH VII 루프 상태

## M3 크래시 해소 확인 → 유효 그리드가 워크 조기종료, NOW LOADING 정지 (2026-07-10)

- **크래시 해소 확인**(`.omo/live-qa/m3-stratmap-render-20260710-0441/`): 0x0323 실 캐릭터 + 유효 0x0315 RLE 커밋 후, 직전 2.16초 만에 터지던 크래시(0x0058f83a) **미발생**. 클라 **55초+ 생존**, 새 WER 없음. 빈 오브젝트 테이블 널 역참조 실제로 차단됨.
- **새 거동(크래시→정지)**: 클라가 **NOW LOADING 영구 정지**(스크린샷 4장 바이트 동일). 전략맵 미렌더.
- **핵심 관측(대조)**: world-enter 코드셋은 두 런 동일. 이번엔 **레코드 내용만** 바뀜(0x0323 빈→실캐릭터, 0x0315 빈→유효). 그런데 클라 거동 갈림:
  - 빈 그리드: 워크 14요청(0x0304~0x0f02) 걸어가다 렌더에서 크래시.
  - 유효 그리드: 0x0314→0x0315(유효) 응답 직후 **워크 조기 중단**(3요청만), 크래시 없이 정지.
  - → **유효 0x0315 그리드 응답이 클라 요청 루프를 조기 종료시킨다.** 클라가 0x0300/0x0f00/0x0f02 요청에 도달 못 한 채 0x0314에서 멈춤. world-enter가 미리 push한 0x0f01/0x0f03/0x0315 OK 코드들은 **클라 자신의 0x0f00/0x0f02 요청 상관 응답으로 와야** NOW LOADING이 풀리는데, 클라가 그 요청 전 정지.
- **가설(RE 확정 필요)**: (a) 유효 그리드 셀이 참조하는 오브젝트/유닛(0x0325 유닛 테이블 최소 count만) 미충전 → 클라 로더가 안 오는 오브젝트 레코드 대기, (b) world-enter의 0x0f01/0x0f03/0x0315 조기 push가 request-driven 워크 교란.
- **다음 축**: re-analyst로 "유효 0x0315 그리드 수신 + 채워진 오브젝트 테이블 상태에서 클라 로더(FUN_0058ee70 이후 상태머신)가 NOW LOADING 벗어나려면 무엇을 기다리는가" 확정. 그 근거로 server-dev가 (0x0325 유닛 채우기 / 0x0f01·0x0f03·0x0315 enter 배치에서 빼 응답전용화 등) 수정.

## M3 크래시 확정: 빈 오브젝트 테이블(0x0323) — 그리드 아님 (2026-07-10, RE)

- **정정**: 전략맵 크래시(0x0058f83a `FUN_0058ee70`)는 그리드 셀이 아니라 **빈 오브젝트 테이블** 때문. 크래시 바이트 검증 `8b 0d 80 00 00 00` = `MOV ECX,[0x00000080]`(널 페이지 절대 read). 직전 `FUN_004c7290(focusId)`가 오브젝트 테이블(clientBase+0xc, 600엔트리 stride 0x370)에서 focus id를 못 찾으면 0 반환 → JNZ 미통과 → 버그난 분기 크래시.
- **그 테이블을 채우는 레코드 = `0x0323 ResponseInformationCharacter`**(dispatcher case 0x323 → `FUN_004c2c80` → clientBase+0xc 오브젝트 등록). **현재 0x0323이 빈 스텁이라 테이블이 비어 크래시.** 그리드 셀(0x0315)은 빈 셀도 non-null 반환(`FUN_004c8b70`)이라 직접 원인 아님.
- **크래시 해소 = 0x0323에 플레이어 실 캐릭터(count≥1, 실레코드)**. 시드 캐릭터가 스토어에 있으니 world-enter의 0x0323을 실 캐릭터로 인코딩.
- **0x0315 StaticInformationGrid RLE 포맷(FUN_004abbb0 확정)**: body 0x138c 고정. `[u8 width=100][u8 height=50][u16 rleLen(1<rleLen<0x1389)][RLE: (u8 runLen, u8 cellType)…]`. 각 쌍이 runLen개 셀을 cellType으로. **제약 ΣrunLen==5000(=100×50)**, 나머지 0패딩. **cellType은 systemId 아님 = 0x0313 팔레트 인덱스**(stride 3, clientBase+0x2c1755). (로드맵 "cell=systemId"는 부정확 — cell=타입인덱스, 시스템 위치는 별도 오버레이.) 워킹그리드 clientBase+0x2c03cc, 렌더러 `+y*100+x`.
- **0x0313 StaticInformationGridType 팔레트**: 와이어 0x138c, 실사용 301B. `[u8 count][3바이트 타입레코드×N]`, clientBase+0x2c1754. 빈 우주 zero-fill 안전(cellType 0→type[0]).
- **FUN_004c5350**(그리드 활성, 1회): 0x0315(5004B)+0x0313(5004B) 워킹테이블 복사 — 둘 다 풀 고정크기여야(over-read도 방지).
- **server-dev 지침**: (1) **0x0323 플레이어 실 캐릭터**(크래시 게이트), (2) 0x0315 유효 RLE(빈 우주=전부 type0, 예 (250,0)×20=5000), (3) 0x0313 팔레트 최소(zero-fill). 크래시 해소 후 갤럭시 GREEN 데이터를 0x0315 RLE에 실 systemId-타입으로 인코딩(별도).
- **미확정 축**: focus id가 플레이어 본인 오브젝트인지 커서 오브젝트인지 완전 확정 못 함 — 0x0323 플레이어 캐릭터로 해소 안 되면 다음 축은 map cursor/selection focus 상태 추적.

## M3 마일스톤: 핸드셰이크 완주 → 크래시는 빈 그리드 콘텐츠(0x0315 RLE 필요) (2026-07-10)

- **핸드셰이크 완주**(`.omo/live-qa/m3-gridinit-20260710-0408/`): 0x0f02→0x0f03 배선으로 클라가 **전체 어드미션+world-init 핸드셰이크를 opcode 정지 없이 완주**. 시퀀스: world-enter 8종 → static-info 10종(0x0304~0x030c) → 0x0300→0x0301 → 0x0f00→0x0f01 → **0x0f02→0x0f03(정지 해소, 재전송 0)** → 0x0300 → **크래시**. "알 수 없는 코드" 0건, 서버 unhandled/error 0건.
- **크래시 = 콘텐츠 이슈(배선 아님)**: 핸드셰이크 완주 ~2.16초 후 클라 **APPCRASH 0xc0000005 access violation, fault VA `0x0058f83a`**(module g7mtclient.exe, `FUN_0058ee70`). 이 오프셋은 문서에 실재(`loop-state:2797`, `restored-from-git/logh7-tactical-033b-fix-2026-06-30.md:97`) — 전략맵 렌더러가 **빈/널 그리드 테이블 역참조** 크래시 지점. 이번엔 0x0f1f 방출 안 했으므로 **0x0f03 이후 그리드 초기화 경로 재진입**이 원인.
- **근본원인**: 서버 그리드 응답이 전부 빈 스텁 — 0x0f03 status-only, 0x0313 grid-type `objects:[]`, 0x0315 grid `cells:[]`. 클라가 셀/오브젝트 없이 렌더 루틴 진입 → 널 크래시. 위치 `logh7-world-records.mjs:637-641`.
- **성격 전환(중요)**: **프로토콜 핸드셰이크 계층은 사실상 완료. 이제 콘텐츠(갤럭시 맵) 계층.** 로드맵 M3.5 KEYSTONE "갤럭시 RLE 맵 0x0315(100×50, cell=systemId)"가 바로 이 지점. **갤럭시 정본은 이미 GREEN**(85성계/79좌표, M0.5 audit) — 데이터 보유, 0x0315에 RLE 인코딩만 필요.
- **다음 축**: (a) re-analyst로 `FUN_0058ee70`(0x0058f83a) 디컴파일 → 역참조하는 정확한 테이블과 그것을 채우는 레코드(0x0315 grid cells / 0x0313 grid-type / 0x0f03 body) + 0x0315 RLE 포맷(100×50 cell=systemId, roadmap) 확정, (b) server-dev가 GREEN 갤럭시 데이터를 0x0315 RLE로 인코딩(빈 cells→실 systemId 맵). 크래시 회피 최소 = 렌더러가 비어있지 않은 테이블 받기.

## M3 0x0300/0x0f00 배선 검증 → 다음 정지: 0x0f02 (클라 요청, 문서 정정) (2026-07-10)

- **검증 성공**(`.omo/live-qa/m3-worldinit-20260710-0351/`): 0x0300→0x0301, 0x0f00→0x0f01 배선으로 클라가 2코드 더 전진. "알 수 없는 코드 0x0300/0x0f00" 소멸. 크래시 없음.
- **새 정지: 0x0f02** — 서버 미배선. **문서 정정(중요)**: `logh7-inworld-progress.md`는 0x0f02를 서버 push(S→C)로 기술했으나 **실측상 클라가 0x0f02를 요청으로 보낸다**(0x0f00 직후). → 0x0f03 응답 기대(파이프라인 테스트 `logh7-playable-pipeline.mjs:303`가 이미 0x0f03을 world-enter 필수코드에 포함 = 빌더 존재).
- **전환(효율)**: 단일 코드 증분 배선은 코드마다 라이브+RE+구현+라이브 왕복이라 비쌈. 이전 사이클 문서에 전체 world-init 핸드셰이크가 있으므로 **문서화된 req→resp 쌍 전체를 한 번에 포괄 배선**(기존 빌더/문서 근거만, 추측 금지) → 라이브 한 번으로 도달점 측정. 문서 순서(P28/P30): static-info→0x0300→0x0f00→0x0f02(→0x0f03)→0x0f06(→0x0f07)→전략 HUD.
- 도달 최대: `MAXREACHED-nowloading-stuck-0x0f02.png`.

## M3 어드미션 완주 → 다음 정지: 0x0300 RequestResponseTime (2026-07-10)

- **static-info 포괄 배선 검증 성공**(`.omo/live-qa/m3-admission-full-20260710-0334/`): 클라가 어드미션 요청 10종(0x0304/0x0306/0x0314/0x0312/0x030a/0x0310/0x030e/0x031c/**0x0308**/**0x030c**) 전부 통과("알 수 없는 코드" 없음), 신규 0x0308→0x0309·0x030c→0x030d 정상. 크래시 없음.
- **새 정지: 0x0300**(클라 3회 재전송) — RequestResponseTime. 0x0301(ResponseTime, 4B LE start time, `world-records.mjs:61`)을 응답으로 기대. `handleWorldInner`에 0x0300 분기 없어 lobby 라우터로 새어 unhandled. (world-entry에서 0x0301이 unsolicited로 1회 나갔으나, 클라는 어드미션 후 **명시적 0x0300 요청**에 새 0x0301을 받아야 로딩 해제.)
- **수정**: `handleWorldInner`(world-session.mjs:284~343)에 `code===0x0300` 분기 추가 → `buildResponseTimeInner()`(world-records.mjs:420 존재, import만) 반환. `isAdmissionRequestCode`/라우팅이 0x0300을 world로 잡도록. world-entry의 unsolicited 0x0301 emit은 유지(제거 금지).
- **패턴**: 월드-init 핸드셰이크는 클라가 코드를 하나씩 요청하며 진행(수렴). 각 라이브가 한 스테이지 전진. 다음: 0x0300 후 추가 계열(0x0f02 notify 등) 나오는지 재검증.
- 도달 최대 화면: `MAXREACHED-nowloading-stuck-0x0300.png`(크래시 없는 NOW LOADING).

## M3 크래시 해소 → 다음: 미배선 어드미션 코드 0x0308 (포괄 배선 필요) (2026-07-10)

- **크래시 완전 해소**(`.omo/live-qa/m3-crashfix-20260710-0319/`): 풀사이즈 0채움 body로 클라가 어드미션 응답 8개를 무사 수신, 프로세스 생존. `MAXREACHED-nowloading-clean-no-crash.png`(크래시 다이얼로그 없는 깨끗한 NOW LOADING) vs 직전 크래시 화면 대조로 확정.
- **훨씬 전진한 어드미션열**(conn 월드): `0x0304→0x0306→0x0314→0x0312→0x030a→0x0310→0x030e→0x031c→0x0308(정지)`. 앞 8개는 전부 `kind=admission` 풀사이즈 응답 정상 수신.
- **새 정지: 0x0308** — `buildAdmissionResponseInner`(world-records.mjs:583)에 case 없음 → lobby 라우터로 새어 "알 수 없는 코드" → 응답 미전송 → 클라 0x0309 영구 대기. **크기는 이미 표에 있음(0x0309=0x55c=1372B).**
- **패턴 확립(기계적)**: static-info 요청→응답 = req(짝수)→resp(req+1, 홀수), 응답 크기는 `STATIC_INFO_BODY_SIZES`에 전부 등재. 관측된 요청 전체(0x0304/0x0306/0x0308/0x030a/0x030c/0x030e/0x0310/0x0312/0x0314/0x031c) → 응답(0x0305~0x031d)을 **포괄 배선**하면 static-info 어드미션 버스트 일괄 해결(라이브 왕복 절약). 프레이밍 로직은 이번에 검증됨.
- **다음**: server-dev가 static-info req→resp 쌍 포괄 배선 → live-qa 재검증(전략맵 렌더 또는 static-info 이후 새 계열 코드).
- 하네스 노트: 클라 첫 기동 시 로그인 직후 조용히 종료되는 flaky 관측(재기동 시 정상, M3와 무관한 기동 불안정).

## M3 크래시 확정: static-info는 고정크기 프레이밍 — 풀사이즈 0채움 body 필요 (2026-07-10, RE)

- **RE 확정**(re-analyst, 클라 사이저 `FUN_004b8b00` + enqueue `FUN_004b8850` + dispatcher `FUN_004ba2b0` + walker `FUN_004c4a10` 4곳 교차): 0x0305 크래시는 walker 헤더/count 문제가 **아니라 고정크기 프레이밍 over-read**. 클라가 opcode별 **하드코딩 고정크기**를 사이저에서 얻어 `malloc(size)` 후 **길이검사 없이 그 크기만큼 recv 버퍼에서 복사**. 빈 body(0바이트)면 21KB(0x520a) over-read → 매핑 안 된 페이지 → access violation → CRT "abnormal termination".
- **정본 크기표(static-info 계열, 클라 사이저 switch 직접 인용)**:
  | opcode | 이름 | body 크기 |
  |---|---|---|
  | 0x0305 | StaticInformationCard | 0x520a (21002) |
  | 0x0307 | StaticInformationCardCom | 0xe5b2 (58802) |
  | 0x0309 | StaticInformationPowerDivision | 0x55c (1372) |
  | 0x030b | StaticInformationUnitShip | 0x6d64 (28004) |
  | 0x030d | StaticInformationUnitTroop | 0x184 (388) |
  | 0x030f | StaticInformationFighter | 0x34 (52) |
  | 0x0311 | StaticInformationArms | 0x1b0 (432) |
  | 0x0313 | StaticInformationGridType | 0x138c (5004) ✓이미 |
  | 0x0315 | StaticInformationGrid | 0x138c (5004) ✓이미 |
  | 0x031d | StaticInformationBase | 0x520c (21004) |
- **zero-fill 안전**: walker `FUN_004c4a10`이 고정 300엔트리×24 루프에 clientBase/stack 상대 포인터만 쓰고 **body에서 count/포인터 유도 안 함** → 전부 0이면 빈 테이블을 무해 처리. 0x0313/0x0315가 이미 안 죽는 이유 = 이미 풀사이즈(5004B). **핵심: 빈/짧은 body 금지, opcode별 풀 고정크기 0채움이 정답.**
- **server-dev 수정**: `buildEmptyWalkerInner(opcode)`를 opcode→size 룩업으로 바꿔 `[u32 0][u16 opcode][N바이트 0채움]`(N=위 표) 반환. static-info 계열 일괄 해결.
- **다음**: server-dev 풀사이즈 0채움 구현 → live-qa 재검증(크래시 해소 후 전략맵 렌더 또는 다음 프론티어 코드).

## M3 어드미션 정지 해소 → 다음: 빈 0x0305가 클라 크래시, 최소 walker body 필요 (2026-07-10)

- **진전**(`.omo/live-qa/m3-stratmap-final-20260710-0257/`): 어드미션 배선으로 0x0304 정지(freeze)는 해소. 그러나 서버가 보낸 **빈 0x0305(body 0바이트, `00000000 0305`)를 받은 즉시 클라 크래시** — VC++ 런타임 "abnormal program termination" 모달. 전략맵 미렌더. 실패 모드가 정지→크래시로 전진, 원인 0x0305 하나로 격리.
- **인과 격리**: 직전 라이브(픽스 전)와 유일한 차이가 0x0305 응답 추가 하나. 픽스 전엔 0x0304에서 정지만, 이번엔 0x0305 받고 크래시. → **`buildEmptyWalkerInner`의 "빈 walker는 클라 decode no-op라 안전" 주석 라이브 반증.** 클라 0x0305 핸들러가 walker 헤더(최소 count 필드)를 기대하는데 0바이트라 버퍼 밖 read → 힙 크래시.
- **영향 범위**: 같은 empty-walker를 쓰는 0x0307/0x030b/0x030f/0x0311도 동일 크래시 위험. 반면 문서 확정 포맷인 0x0313(5004B)/0x0315(grid)는 실바디라 안전.
- **관측 시퀀스**(conn3): `0x0200→0x0201→0x0205→월드레코드 8종(2회)→0x0304→admission 0x0305 응답→크래시`. 클라는 0x0306/0x0312/0x0314를 보내지 못하고 죽음.
- **버그 위치**: `logh7-world-records.mjs` `buildEmptyWalkerInner`/`buildAdmissionResponseInner` — 0바이트 body가 크래시 원인.
- **다음 축**: (a) re-analyst로 클라 0x0305 수신 핸들러 디컴파일 → 기대하는 **최소 walker 구조**(헤더/count 필드/고정 크기) 확정, (b) server-dev가 0x0305 및 형제를 실바디(최소 count=0 walker 헤더)로 교체, (c) 재라이브로 다음 프론티어 코드 관측.

## M3 재바인딩 성공 → 다음 게이트: 월드 진입 후 어드미션 핸드셰이크(0x0304→0x0305 등) (2026-07-10)

- **재바인딩 수정 작동 확인**(`.omo/live-qa/m3-strategic-map-20260710-0234/`): `enterWorld: no session player` 예외 소멸. 실클라가 캐릭터 선택→월드 진입 프로토콜 완주, **8종 월드레코드가 conn3로 정본 순서 방출**: `0x0206→0x0204→0x0323→0x0325→0x0301→0x0f01→0x0f03→0x0315`(codes 518,516,803,805,769,3841,3843,789 — 정본 일치). (참고: `world-rebind` 이벤트는 안 뜸 — conn3의 0x0200 로그인이 이미 conn3 키로 플레이어 등록해 재바인딩 가드 단락. 진입은 정상, 더 견고한 경로.)
- **다음 블로커**: 월드레코드 수신 직후 클라가 **0x0304**(2바이트, 페이로드 없음, post-world-entry 어드미션 요청) 송신 → 서버 미처리("handleLobbyInner: 알 수 없는 코드 0x0304") → 클라가 0x0305 응답 대기하며 **NOW LOADING 영구 정지**.
- **답은 문서에 있음(RE 불필요)**: `docs/reference/restored-from-git/logh7-inworld-progress.md` — 이전 사이클(리셋 전)은 이 지점을 통과해 전략맵을 렌더했다. 정상 부트스트랩 어드미션 핸드셰이크: `0x0205→0x0206`, **`0x0304→0x0305`(빈 InformationSession walker 응답, L1232)**, `0x0306→0x0307`, `0x0314→0x0315`, `0x0312→0x0313`, `0x0f02`. 리셋 때 `logh7-world-session.mjs` `handleWorldInner`에 이 핸드셰이크 재구현이 누락됨(현재 0x0205/0x0b01/0x0f1c/0x2009만 라우팅).
- **수정(server-dev)**: `handleWorldInner`(L258~)에 월드 진입 후 어드미션 코드 라우팅 추가. 최소 착수=0x0304→빈 0x0305. 후속=0x0306→0x0307, 0x0314→0x0315, 0x0312→0x0313. 정확한 포맷은 `logh7-inworld-progress.md`·`logh7-render-interaction-contract.md`(0x0322→0x0323, 0x034e→0x034f 등)에 기록됨.
- **진척 요약**: M3 정지점이 캐릭터선택 → NOW LOADING → (씬전환·레코드완주) → **어드미션 핸드셰이크**로 스테이지별 전진 중. 로그인~월드레코드 방출까지 전 구간 실클라 통과.

## M3 돌파: 씬 전환 성공 + NOW LOADING 도달 — 마지막 블로커는 connectionId 키잉 (2026-07-10)

- **두 수정(0x200a msg32 + 0x0206-before-0x0204)이 실효.** 실클라가 캐릭터 선택 침묵을 **완전히 뚫고** 씬 전환 → **"NOW LOADING — Legend of the Galactic Heroes" 월드 로드 화면(기함 3D 렌더)** 도달. 전략맵 직전 단계. 증거: `.omo/live-qa/m3-world-msg32-20260710-0218/shots/DECISIVE-now-loading-hung-0x0205-no-session-player.png`.
- **재접속 모델 재확인(정정)**: 클라는 0x200a(msg32) 수신 시 **로비 소켓(conn2)을 닫고 새 소켓(conn3)으로 월드 세션 재접속**한다. re-analyst의 원래 재접속 FSM(states 0x30~0x35)이 맞았고, 직전 실패는 **오직 0x200a raw 드롭** 때문이었다(동일-endpoint 소켓 재사용 가설은 틀림 — 클라는 새 TCP를 연다). 실측 시퀀스: `conn2 0x2009→0x200a(msg32)→conn2 close → conn3: 0x0200→0x0201→0x0205`.
- **마지막 블로커(진전이 드러낸 자체 버그)**: `enterWorld: no session player for connection 3`. 월드 세션이 플레이어를 **TCP connectionId로 키잉**하는데, `handleSessionLogin`은 conn2에 등록, 클라는 conn3로 재접속 → `enterWorld({connectionId:3})`이 conn3 player 맵 비어 예외. 이전엔 침묵으로 여기 못 왔던 다음 계층 버그.
  - 위치: `logh7-world-session.mjs:133-137`(enterWorld no-player throw), 호출 `:247-259`(handleWorldInner CODE_SS_GAME_LOGIN_REQ), dispatch `playable-server.mjs:479-485`.
  - **수정 방향**: 월드 플레이어를 connectionId가 아니라 **account(또는 0x200a token)** 기준 추적. 0x0205 도착 시 서버는 이미 account 앎(`ss-login-ok-sent account:"inei00"`, `lastLobbyAccount` 폴백) → player 없으면 그 account 캐릭터로 재등록 후 enterWorld. 합성 캐릭터 금지 가드는 유지(실 시드 캐릭터를 가진 known account만 재진입 허용).
- **다음**: server-dev가 재접속-재등록 구현 → 0x0205→0x0206(선두)+0x0204+0x0323/0x0325 흐름 → NOW LOADING이 전략맵으로 완료 예상 → live-qa 최종 재검증. 검증된 좌표: 게임개시 125,191 / 캐릭터카드 655,305.

## M3 완전 재조정: message32 프레이밍 + 0x0206-before-0x0204 (2026-07-10, RE 확정)

- **recv 필터 `FUN_004ae0d0`(mps 메시지 콜백, vtable 0x66e0f0)로 전체 메커니즘 규명.** 두 고확신 수정:
  1. **0x200a를 message32로** 보내야 함. 모든 인바운드 앱 메시지는 mps **message32 유닛**으로 와야 recv 콜백에 도달. **raw(isMsg32=false)는 트랜스포트가 프레임을 못 만들어 드롭** → 클라가 0x200a 리다이렉트를 못 받아 LB2SS 대기 실패 → 캐릭터 선택 복귀(=침묵). **이것이 M3 재검증 침묵의 직접 원인.**
  2. **0x0206 SSGameLoginOK를 0x0204보다 먼저**. recv 필터: 0x35837e(0x0206) 미세팅 시 0x0204를 enqueue 안 하고 char id만 stash + **0x0205 재송신**. 0x0204를 먼저 보내면 0x0205 재요청 루프만 돌고 데이터 미저장.
- **0x0205 트리거 정체(수정 전 관측 설명)**: 클라 recv 필터가 0x0204(SSCharacterIDResponce)를 0x0206 전에 받으면 char id stash 후 **즉시 0x0205 SSGameLoginRequest 송신**. 수정 전 "인라인 레코드 후 클라가 0x0205 송신"은 레코드 속 0x0204가 트리거한 것.
- **씬 게이트 체인(단일 메시지 아님, 순서 필수)**: `0x0201 SSLoginOK`(→0x35837d + 0x358375, FSM state0x35 통과→0x3f→**0x35837a=1**) → 클라 `0x0205` → `0x0206 SSGameLoginOK`(→**0x35837e=1**) → 월드레코드(0x0204는 0x0206 뒤) → 월드데이터 시퀀스 완료(0x35837f) → **씬 전환(전략맵)**. 이전 0x201 삽입이 무효였던 건 0x200a raw 드롭으로 클라가 0x0200을 아예 안 보내 0x201 핸들러 미도달.
- **정본 시퀀스(전부 message32, 같은 로비 소켓)**:
  ```
  recv 0x2009 → send 0x200a(msg32)[addr/port/token]
   ← 클라(동일 endpoint 소켓 재사용) 0x0200 GameLogin
  recv 0x0200 → send 0x0201 SSLoginOK(msg32, ≥1B)   // 씬 FSM 게이트
   ← 클라 0x0205 SSGameLoginRequest
  recv 0x0205 → send 0x0206 SSGameLoginOK(msg32,1B)  ★0x0204보다 먼저★
             → send 0x0204 + 월드레코드(0x0323/0x0325/0x0301/0x0f01/0x0f03/0x0315) 전부 msg32
   ← 씬 전환
  ```
- **server-dev 수정(2건)**: (1) 0x200a message32화, (2) 0x0206을 0x0204·월드레코드보다 먼저. 0x0201 삽입은 유지(이제 클라가 0x0200을 보내면 유효). **미결(라이브 확인)**: 동일 endpoint 소켓 재사용 실동작 — 0x200a(msg32) 후 클라가 0x0200을 같은 소켓에 보내는지 트레이스로 판정.

## M3 재검증 반증: 0x201 수정 실패 — 클라는 같은 소켓 인라인 0x0205 경로 (2026-07-10)

- **라이브 결과**(`.omo/live-qa/m3-world-retry-20260710-0129/`): 0x201 SSLoginOK 삽입 커밋 후에도 **월드 진입 실패**, 캐릭터 선택 잔류. 결정적: **0x0200 핸들러(0x201 삽입 지점)에 클라가 도달조차 안 함.**
- **모델 반증**: 수정 후 클라는 0x2009 → 0x200a(리다이렉트만) 수신 후 **완전 침묵**(재접속·0x0200 없음, conn3 없음). 반면 **수정 전(0x2009에 월드레코드 인라인 푸시)엔 클라가 로비 소켓에서 0x0205 SSGameLoginRequest를 실제 송신**했다. 즉 인라인 푸시 제거가 클라를 더 못 가게 했다.
- **재구성(유력)**: 동일 endpoint(127.0.0.1:47900) 리다이렉트라 클라는 재접속 경로(states 0x30~0x35, 0x0200→0x0201, 씬게이트 0x35837d)를 **타지 않고**, 같은 소켓 **인라인 0x0205/0x0206 경로**로 진행한다. re-analyst의 0x0200/0x0201 모델은 **다른 endpoint 리다이렉트 시에만** 타는 경로일 수 있다. 씬 게이트 0x35837d를 인라인 경로에서 어떻게(혹은 다른 플래그로) 세팅하는지가 미해결.
- **부가 의심**: 0x200a가 raw로 송신됨(`responseIsMsg32:false`)인데 `world-session.mjs:67` 주석은 생성 경로가 message32라 명시 — 클라 0x200a 핸들러가 message32를 요구하면 raw는 조용히 드롭될 수 있음.
- **정지**(Blocked-Loop): 월드 전환 없음 동일 증상 2회(단 매번 새 증거) → live-qa 중단, 정적 RE 라우팅.
- **다음 축(재조정 RE)**: (a) 동일-endpoint 리다이렉트 시 클라 실제 경로(0x0205 SSGameLoginRequest 처리·기대 응답 0x0206) vs 다른-endpoint 재접속 경로(0x0200/0x0201)를 분기 조건으로 확정, (b) 인라인 경로에서 씬 전환(로비→월드) 게이트가 무엇인지(0x35837d가 아니면 무슨 플래그/메시지), (c) 0x200a raw vs message32 요구. 그 근거로 서버 흐름 재설계(인라인 유지 + 올바른 게이트 메시지). 0x201 수정은 재접속 경로용으로 유지(다른-endpoint 시 유효할 수 있음).

## M3 수정 확정(부분): 누락된 0x201 SSLoginOK가 재접속 경로 씬 게이트 (2026-07-10, RE)

- **근본원인 한 줄**(re-analyst Ghidra 확정): 서버가 **0x201 SSLoginOK 응답을 누락**. 씬 전환 게이트 플래그 `0x35837d`는 **오직 0x201만** 세팅(dispatcher case 0x201: `[0x358375]=1; [0x35837d]=1`). 클라 state 0x35(CERTIFICATION_SS, `FUN_0051bf90`)가 이 플래그를 폴링 → 1이면 월드 상태(`DAT_02217398`)로 전이. 서버는 0x206+월드레코드를 보냈으나 0x201이 없어 클라가 캐릭터 선택에 잔류.
- **연결 모델(확정)**: 클라는 **연결 싱글톤 1개**(`DAT_007c25f4`)만 사용. 0x200a 리다이렉트가 로비와 **동일 host:port**(127.0.0.1:47900)면 **같은 소켓 재사용**(conn3·mps 크립토 재핸드셰이크 불필요, 라이브 일치). 서버는 별도 SS 리스너 불필요.
- **SS 핸드셰이크 시퀀스(정본, states 0x30~0x35)**:
  1. 0x30 LB2SS: C→S 0x2009 SessionLogin(u16 sessionId) → S→C 0x200a([u32 addr][u16 port][u32 token], flag 0x35837c=1)
  2. 0x32 CONNECT_SS: 동일 endpoint면 소켓 재사용, on-connect 콜백이 token 핸드셰이크 프레임 송신
  3. 0x34 CERT_SS: C→S **0x200 GameLogin**(body: "GIN7"+u16 0x57('W')+account, LG 로그인과 동일 포맷) → 기대 S→C **0x201 SSLoginOK**
  4. 0x35: flag 0x35837d(0x201이 세팅) 확인 → 월드 상태 전이
- **필수 순서**: `0x200 수신 → **0x201 SSLoginOK**(→0x35837d, 씬 전이) → 0x206 SSGameLoginOK(→0x35837e, 월드 파이프라인 활성) → 월드레코드 8종(0x204/0x323/0x325/0x301/0x0f01/0x0f03/0x315) → 전략맵 렌더`.
- **왜 인라인 실패**: 프레임 디싱크 아님(레코드는 정상 버퍼링, 0x35837e도 세팅됨). 오직 **0x201 누락**으로 씬 상태머신이 state 0x35에서 정지.
- **server-dev 수정(정확)**: 현재 `[0x200a → world records + 0x206]`에서 **클라의 0x200 GameLogin 수신 시 0x201 SSLoginOK(최소 1바이트 성공 플래그, dispatcher가 param_3[0]만 읽음)를 0x206·월드레코드 이전에 삽입**. 위치: `logh7-playable-server.mjs:463-479`, `logh7-world-session.mjs:59-119`.
- **다음**: server-dev가 0x201 삽입 구현(TDD) → live-qa 월드 진입 재검증.

## M3 근본원인: 월드 진입은 SS-tier 재접속 필요 — 서버 인라인 숏컷이 씬 전환 미유발 (2026-07-10)

- **라이브 결과**(`.omo/live-qa/m3-world-entry-20260710-0048/`): 시드 캐릭터로 로그인→로비 해제→**캐릭터 선택까지 완전 정상**(Reinhard 統率80 렌더). 그러나 캐릭터 선택 후 **월드 씬으로 전환 안 됨** — 전략맵/성계/함대 미렌더, 선택 화면에 머묾. `DECISIVE-STOP-character-select-no-world-transition.png`.
- **핵심 근본원인**: 클라는 **3계층 아키텍처(로그인 conn1 → 로비 conn2 → 세션서버 SS conn3)**를 기대. 0x2009 세션로그인 → 서버 0x200a 리다이렉트(127.0.0.1:47900, token=1, IP 인코딩 정상) 수신 시, 클라는 **로비 연결을 닫고 SS로 새 TCP를 열어** SS 핸드셰이크(LB2SS/CONNECT_SS/CERTIFICATION_SS)를 기대한다. 그런데 서버(`logh7-playable-server.mjs:463-479`, `logh7-world-session.mjs:59-119`)는 기존캐릭 숏컷으로 **0x200a + 월드레코드 8종(0x204/0x323/0x325/0x301/0x0f01/0x0f03/0x315/0x206)을 로비 연결에 한 배치로 인라인 푸시** → 씬 전환 트리거(SS 재접속)가 발생 안 함.
- **관측 nuance**: 클라가 0x200a 후 SS 게임로그인을 **로비 연결 위로** 인라인 송신하고 월드레코드를 재수신했으나 여전히 미렌더. SS-tier 별도 연결(conn3)은 **라이브에서 한 번도 관측 안 됨**(서버가 유도 안 함). 이 숏컷은 유닛 테스트(이중세션)는 통과하나 실클라 3계층 기대와 불일치.
- **정상 확인(회귀 아님)**: 로그인·로비잠금해제·캐릭터선택·시드 렌더·서버 월드레코드 생성·0x200a 리다이렉트 인코딩 모두 정상.
- **참고 문서**: `docs/logh7-server-architecture-3tier.md`(3계층 설계 문서화됨) — playable-server가 이를 완전 구현하지 않고 숏컷.
- **다음 축**: re-analyst로 클라의 0x200a 후 동작 확정 — (a) 새 TCP 재접속 여부, (b) SS 핸드셰이크(LB2SS/CONNECT_SS/CERTIFICATION_SS = states 0x30~0x35) 정확 opcode 시퀀스, (c) 씬 전환 트리거 조건. 그 근거로 server-dev가 SS-tier 연결 수락+핸드셰이크→월드레코드를 별도 연결에 푸시하도록 구현. (추측 구현 금지.)

## M2 온보딩 판단: 세션-진입-시 캐릭터 선택 + 시작 캐릭터 프로비저닝으로 우회, M3 피벗 (2026-07-10)

- **결정적 외부 근거**(경향게임스 2004 프리뷰, `docs/reference/legacy-evidence/logh7-character-creation-research.md:26`): 캐릭터 선택은 **"세션 진입 시(on session join)"** — 원작 캐릭터(파라미터 고정) 또는 커스텀 작성 중 택1. 즉 캐릭터는 로비 메인에서 직접 만드는 게 아니라 **세션에 참가하면서** 만든다.
- **닭-달걀 잔존**: 그럼에도 count=0에선 세션 참가/추첨 버튼(item0/item2/item4)이 모두 잠긴다. m2-gate-confirm이 증명하듯 잠금은 **0x2004 body[0]==0에만 좌우**(0x2006 세션 데이터와 무관 — 시드로 body[0]=1만 바꿔도 해제). 따라서 신규 계정(count=0)은 항상 이 잠금에 걸리고, 원작이 이를 어떻게 벗어났는지(계정 등록 시 캐릭터/슬롯 프로비저닝? 별도 첫-생성 화면?)는 **미해결 — 더 깊은 RE 필요**.
- **판단(Blocked-Loop 전환)**: 빈 계정 첫 생성 RE를 계속 파기보다, **count≥1이면 로비 완전 작동**(선택 라이브 확인)이라는 견고한 사실을 활용해 **복원판은 시작 캐릭터를 프로비저닝**(계정 생성 시 오리지널 캐릭터 1개 부여)해 우회한다. 이는 리바이벌에서 합리적 설계이며, 플레이어를 실제 월드에 넣는 M3 진척이 미션에 더 값지다. 빈-계정 커스텀 온보딩(0x1006/0x1008 실클라)은 원작 온보딩 RE 확정 후 재개.
- **다음**: M3 — 시드 캐릭터(count≥1) → ゲーム開始 → 캐릭터 선택 → 세션/SS 접속 → **월드 진입** 라이브 검증. 서버 0x1006 charge 구현은 유지(향후 온보딩 확정 시 즉시 활용).

## M2 온보딩 닭-달걀 확정: count=0이면 추첨 버튼도 잠김 — RE 정적배열 모델 반증 (2026-07-10)

- **라이브 반증**(`.omo/live-qa/m2-lottery-20260710-0026/`): **진짜 빈 계정(count=0, 잠긴 로비)에서 모든 서버경로 메뉴 항목(item0 ゲーム開始/item1 新規作成/item2 オリジナル抽選/item4 セッション変更)이 전부 inert(비활성)**. item5 環境設定(로컬)만 작동. 입력 경로는 정상 증명됨(같은 클릭 기법으로 設定 다이얼로그 오픈, `diag-settings.png`). item2 3회 클릭 무반응 → 클릭 정밀도 아님, 버튼 자체 disable.
- **정적배열 모델 반증**: 앞 항목(2026-07-09)의 "item2는 정적 enable {1,0,1,0,1,...}" 주장은 틀렸다. 그 근거였던 m2-gate-confirm은 **캐릭터를 시드해 count=1로 이미 잠금이 풀린** 상태였다 — 그 상태에선 버튼이 켜져 있었을 뿐, **진짜 빈 계정에서 item2 동작은 확정된 적 없었다**. 실측: 서버경로 버튼은 count≥1(잠금 해제)에 함께 묶여 enable/disable된다.
- **진짜 닭-달걀**: 첫 캐릭터를 얻으려면 item2 추첨이 필요한데, item2는 캐릭터 0개(count=0)면 비활성. 클라는 0x2003→0x2004(count=0)·0x2005→0x2006 수신 후 idle 정지, 0x1000/0x1004/0x1006 전무. `store.addCharacter` 0회.
- **견고한 사실(변함없음)**: **count≥1 → 로비 완전 작동**(캐릭터 표시·선택까지, 라이브 2회 확인). **count=0 → 하드 잠금**. 서버 0x1006 charge 구현·유닛(166/166)은 정상이나 클라가 위저드에 도달 못 해 라이브 미검증.
- **미해결 핵심**: 원작에서 신규 플레이어(count=0)가 첫 캐릭터를 만든 경로. 가설 (1) 원작 서버는 신규 계정 로비에 count=0을 안 보냈다(계정 생성 시 캐릭터/슬롯 프로비저닝, 또는 첫 로그인이 강제 생성화면으로 라우팅), (2) 0x2005/0x2006 세션 데이터가 클라가 "세션서버 정상"으로 인정할 형식이 아니어서 서버경로 메뉴가 봉인됨("세션서버 불량" 문구가 문자 그대로일 가능성).
- **다음 축**: (a) 매뉴얼/RE 문서에서 원작 신규 온보딩 경로 조사(값싼 문서 리서치), (b) re-analyst로 버튼 enable이 count 잠금과 함께 묶이는지·count=0 전용 경로가 있는지 재확정, (c) 라이브는 지금 도달 가능한 **M3 월드 진입(시드 캐릭터 count≥1 → 선택 → 월드)**으로 피벗해 가시 진척 확보.
- 서버 버그 없음 — 클라 로비 게이트 RE 모델 gap. QA 하네스 추가: `tools/live/_m2_lottery_launch.mjs`(계측 store), `tools/live/_m2_click.py`(D3D8 표면 SendInput 클릭).

## M2 게이트 라이브 확정 + 진짜 블로커 분리: 첫 생성은 오리지널 추첨(0x1006) (2026-07-09)

- **라이브 확정**(`.omo/live-qa/m2-gate-confirm-20260709-2349/`): 계정 `inei00`에 캐릭터 1개 **프리시드**(스토어 JSON만, 코드 무수정)하니 0x2004 body[0]=1 → 로비 잠금 완전 해제. 「不具合…お待ち」 사라지고 ゲーム開始→캐릭터 선택 패널에 프리시드 캐릭이 이름(Reinhard/20歳)·능력치 8종(統率80…防御45, 시드값과 정확 일치)까지 렌더. `DECISIVE-lobby-unlocked-seeded.png`, `DECISIVE-character-select-seeded.png`.
- **판정**: **0x2004 body[0]은 캐릭터 count**(ready-flag 아님). body[0]≥1이 로비 잠금 해제의 충분조건. 오프라인 결정론(빈=0 / 프리시드=1, 둘 다 1762B 고정, byte0만 상이) + 라이브 이중 확인. **가짜 count 주입 금지** — count=0 잠금은 클라의 "0캐릭" 정상 처리이고, 실제 캐릭이 1개 있으면 자연 해제됨.
- **진짜 M2 블로커 분리**: 잠금 풀린 로비에서도 `新キャラクターの作成`(item1) 클릭 시 서버 프레임 0건·UI 무전환 = 로비 잠금과 **무관한 독립 블로커**. 원인: item1은 정적 배열 `{1,0,1,0,1,0,0,0}`의 **item1=0 = 정적 disable**. item0=ゲーム開始, item2=オリジナルキャラクター抽選(정적 enable).
- **온보딩 경로 가설**: 빈 계정 첫 캐릭터는 커스텀 생성(0x1008, item1 disable)이 아니라 **item2 オリジナルキャラクター抽選 → 0x1006 CommandOriginalCharacterCharge**로 얻는다(원작 "오리지널 추첨" 메커닉과 정합). 서버 `_handleOriginalCharge`는 현재 **0x1006 echo만** 하고 캐릭터를 생성·영속하지 않음 → 다음 구현 갭. (0x1008 커스텀 생성은 item1을 enable하는 선행조건 확정 후 별도 트랙.)
- **다음**: re-analyst로 item2 클릭이 emit하는 opcode/body·0x1006 추첨 왕복(클라가 무엇을 받고 로스터 재요청하는지)·item1 enable 조건 확정 → server-dev가 0x1006 핸들러를 실제 생성으로 구현 → live-qa 재검증.
- 참고: 프리시드 캐릭 **선택→월드 진입**(0x2009→0x200a→월드)은 3분 예산으로 미실행, 다음 사이클 world-session 단독 검증 대상.

## M2 근본원인 확정: 로비 잠금 게이트는 0x2004 body[0]==0 (2026-07-09, RE)

- **RE 확정**(re-analyst, Ghidra `FUN_0051a370` state 0x16 IntoLobbyMain 디컴파일): `if ((char)DAT_02216c88 == 0) setText(0x78677c "セッションサーバーの不具合につき…少々お待ちください")` — 여기서 `DAT_02216c88` = **0x2004 ResponseInformationCharacterCharge body[0]**(dispatcher case 0x2004가 `clientBase+0x35975c`에 0x6dc B 복사 → state 0x12 `FUN_0051be80`가 `DAT_02216c88`로 사본). 즉 **0x2004 body[0]==0 이면 클라가 캐릭터 패널을 "대기"로 잠근다.**
- **서버 대응**: `logh7-character-codec.mjs:594` `encodeLobbyCharCardList`가 `payload.writeUInt8(list.length, 0)` — 빈 계정이면 `list.length==0` → byte[0]=0 → 정확히 그 잠금. **M2가 첫 캐릭터를 만들려는 빈 계정이라 100% 이 경로.**
- **가설 반증**: 앞서 의심한 0x2006 payload[0]=0은 원인 아님(파서 `FUN_00444900`이 payload[0] 미검증, count는 payload[1]≤64, 서버 0x2006 레이아웃 파서와 완전 일치). 0x1005 CharEntryState는 다운스트림 캐릭터-선택 서브화면(`FUN_00594f20` state 0x40~0x69) 게이트로 별개 — 현재 로비 잠금의 원인 아님(단 로비 해제 후 선택 단계에서 재점검 필요, 현재 0x20B stub).
- **문자열 정정**: 「不具合…」은 SJIS가 아니라 **UTF-16LE @ VA 0x0078677c**로 exe에 실재(첫 검색이 SJIS만 봐서 "exe에 없음"으로 오판했던 것 정정). 클라의 "캐릭터 로딩 대기" UI 문자열.
- **버튼 게이트**: 로비 메인(state 0x16) 정적 enable 배열 `{1,0,1,0,1,0,0,0}` — item0(→state0x18)/item2(オリジナル抽選)/item4(セッション変更)는 0x2004와 무관하게 정적 enable. 개별 create/delete 재-enable 세부는 라이브 매핑 권장(미확정).
- **다음(라이브 확정 중)**: (A) 빈 계정에서 item0(작성) 정적버튼 도달 여부, (B) 프리시드 1캐릭터로 byte[0]=1 → 로비 잠금 해제 확인. body[0]이 count인지 ready-flag인지 확정 후 server-dev가 0x2004 교정.

## M2 블로커(초기 관측): 로비 "세션 서버 불량" 잠금 — 0x2006 의심(반증됨) (2026-07-09)

- **증상**: 실클라가 로그인→로비까지 오지만, 로비 우측 패널이 「セッションサーバーの不具合につき、只今キャラクターを表示することができません」로 고착되고 **캐릭터 작성/선택/삭제·게임시작·세션변경 버튼이 전부 비활성**. 環境設定/クレジット/ゲーム終了만 동작(클릭 자체는 유효 — `shots/06-settings-click.png`로 입증). 0x1008(생성)은 GUI로 도달 불가 → M2 진행 차단.
- **M1 재평가(정직)**: 직전 M1.6 "로비 진입 성공"은 로비 **렌더링**까지만 사실이었다. 그때 관측한 お知らせ 패널 텍스트가 바로 이 불량 잠금 메시지다. 로비는 표시되나 캐릭터 조작이 전면 차단된 **비기능 상태** — M1의 실질 완성이 아니라 M2의 병목이 여기 있었다.
- **관측 시퀀스** (`.omo/live-qa/m2-character-create-20260709-2254/trace.jsonl`): conn2 `0x2001(characterCount:0)→0x2003→0x2004(1762B, 카드 0개)→0x2005→0x2006(21258B 세션목록)×2`. 이후 세션 피커/생성 버튼 클릭해도 **새 프레임 0건**(클라가 잠겨 재요청 안 함). `store.json` 미생성 = `store.addCharacter` 미호출.
- **유력 가설(RE 확정 대기)**: `server/src/server/codec/scenario-session.mjs:112`가 0x2006 payload **선두 바이트를 0**으로 쓴다(`payload[0]=0, payload[1]=count=2`, 총 0x5304=21252B 고정). 클라의 0x2006 파서(`FUN_00444900` 추정)가 payload[0]을 세션서버 ready/status로 읽어 **0=불량**으로 판정하는 것으로 보임. 21258B 크기 자체는 버그 아님(고정 포맷, 대부분 0-패딩).
- **처리 원칙**: "추측 프로토콜 3회 고착" 규칙에 따라 바이트를 추측 변경하지 않는다. **re-analyst가 Ghidra로 클라의 정확한 검사 오프셋·조건·정본 status 값을 확정 → wire-engineer가 scenario-session.mjs 교정 → live-qa 재검증** 순서로 진행.
- **호출 지점**: `logh7-lobby-session.mjs:160 _handleReqInfoSession` → scenario-session 인코더. 병행 점검: 0x2004 빈 로스터(`encodeLobbyCharCardList`) 유효성.
- **QA 도구 추가**: `tools/live/_m2_launch.mjs`(격리 store+trace 기동).

## M1.6 달성: 실클라 로그인 → 로비 진입 라이브 증거 확보 (2026-07-09)

- **결론**: 원본 클라 `g7mtclient.exe`가 자체 서버(`logh7-playable-server.mjs`, 127.0.0.1:47900)에 붙어 계정 `inei00`으로 로그인하고 **로비 화면까지 실제 렌더링**되었다. 2026-07-07 conn2가 `0x2000` 무응답으로 죽던 블로커는 해소됨.
- **증거** (`.omo/live-qa/m16-login-lobby-20260709-2201/`):
  - `trace.jsonl` — conn1: `0x0034→0x0035→0x0036→0x7000(GIN7, authOk=true)→login-response-sent(keysetup 0x0031 + redirect 0x7001)→peer-fin(clean)`; conn2: `0x0020(무응답)→0x2000→lobby-login-ok-sent(0x2001, message32)→0x2003(1762B)/0x2005(21258B) 클라 자발 요청→세션 유지, ECONNRESET 0건`.
  - `ui-session/shots/01-login-before.png` (GDI 로그인 화면), `03-lobby-live.png` (D3D8 PrintWindow, 8메뉴 + サーバーからのお知らせ 패널).
- **정본 판정**: 실클라가 서버 로비 프레임을 수용·파싱·렌더했으므로 서버 와이어 출력이 정본. 로비 우측 お知らせ 텍스트는 서버 0x2003/0x2005가 담아 보낸 공지 문자열(`characterCount=0`과 정합) — 클라가 서버 콘텐츠를 정상 표시한 추가 증거.
- **테스트 정합**: 로비 S→C 프레임의 4바이트 subheader(`frame0030WithSubheader`) 도입으로 낡은 테스트 2건(`logh7-lobby-harness-dispatch.test.mjs`, `logh7-playable-server.test.mjs`)이 복호 오프셋 미스킵으로 실패하던 것을 `.subarray(4)` 오프셋 정정으로 수리. 서버 코드는 무수정(실클라가 정본 증명). 전체 스위트 **159/159 통과**.
- **다음 검증 축**: `inei00`에 캐릭터가 0개라 월드 진입은 미확인. 다음 라이브 QA = 캐릭터 생성(0x1008 경로) → 월드 세션 진입(서버는 이미 0x2009→0x200a create-pending까지 응답).

## M0.5 감사 재실행: 갤럭시 GREEN, broken-ref는 리셋 전 잔재 (2026-07-09)

- `audit_galaxy_provenance.mjs`: `readyForUse=true`, 85 성계 / 게임좌표 79 + 매뉴얼전용 1(フォルセティ) + 가상오버레이 5, MDX 대조 미스매치 **0**, 좌표변환 90° 회전 R²=0.99990. 로드맵의 "5성계 좌표 미확정, 날조 금지" 규칙과 정합.
- `audit_data_decode.mjs`: 170 엔트리, 파싱에러 0, reviewQueue 60(브로큰-레퍼런스 59). 진단 결과 broken refs 732건은 전부 (a) 리셋 전 경로 잔재이거나 (c) 서버 비소비 외부/클라 에셋 경로. portrait 매니페스트 1068 refs = Unity 에셋 경로, 서버 미참조. **수리 대상 없음 — 감사 이력으로 유지가 정답.**
- `audit_exe_re_coverage.mjs`: 11,593 함수 중 351 문서화(3.0%). 서버 차단 도메인(transport-login 92, character-lobby 101, strategic-map 115)은 집중 해석돼 진행 병목 아님.

## 18px-ish readable font canonical build (2026-06-30)

- User requested the client font be made larger than the current readable-font build; 16px-ish was still too small.
- Updated `RE/tools/client_patches/font-readable-size.json`: primary GDI size `0x000ea1c6` now patches `6a0c -> 6a12` (12 -> 18), D3D glyph atlas size `0x000b0869` now patches `25feff0000 -> 83c0059090` (`add eax,5; nop; nop`, 96DPI 18px-ish).
- Rebuilt and deployed canonical playable with `cd RE; python -m tools.logh7_build_playable_client --deploy`.
- New canonical playable SHA: `e0b3fcf29adf799005ce28ede165a9344807e042a3197618852dbc733770c54c`.
- Byte-verified `RE/.omo/work/logh7-ko-overlay/exe/G7MTClient.playable.exe`, installed `RE/.omo/work/logh7-installed/exe/G7MTClient.exe`, and `G7MTClient.exe.uiexplorer`: all have SHA `e0b3fcf29adf799005ce28ede165a9344807e042a3197618852dbc733770c54c`, font bytes `6a12`, `83c0059090`, atlas quality `6a04`.
- Live smoke verification: session `.omo/ui-explorer/font18-20260630`, screenshots `shots/002-font18-initial.png` and `shots/003-font18-game-start.png`. Lobby menu and character picker text are visibly larger, and menu/card/back-button text has no immediate clipping. Stop restored SHA `e0b3fcf29adf799005ce28ede165a9344807e042a3197618852dbc733770c54c` with `shaVerified:true`; post-stop process/listener checks found no `G7MTClient`/launcher process and no 47900 listener.
- Residual issue found during the same live smoke: the character card still shows `신참 0세`. Treat the earlier server-side 0x2004 age-seconds change as insufficient until RE/live proves the actual displayed field.
- Remaining visual verification: strategy HUD, tactical GUI, and modal text clipping are still unchecked.

## Minimap candidate review board numbered for human rejection (2026-06-29, journal #100)
- **User hypothesis accepted for review**: the strategy-mode HUD minimap may contain a static star distribution that can generate candidate positions for the 5 coordinate-pending systems. This supersedes the narrower #94 wording only for the screenshot/HUD-reference path: the earlier RE target was not a star minimap, but the retained strategy HUD screenshot/crop does show map dots useful for hypothesis generation.
- **Action performed**: created a numbered human-review candidate board from the existing minimap subtraction artifacts. Inputs were `docs/reference/ui-catalog/toshichan.my.coocan.jp/976091_map.jpg`, `RE/.omo/ghidra/minimap/976091_map_fit_unmatched.json`, and the full-strategy crosscheck crop `RE/.omo/ghidra/minimap/74fcc3_strategy_minimap_crop.png` / `74fcc3_strategy_minimap_crosscheck.json`.
- **Generated outputs**: `RE/.omo/ghidra/minimap/976091_map_review_candidates_numbered.png`, `RE/.omo/ghidra/minimap/74fcc3_strategy_minimap_review_candidates_numbered.png`, `RE/.omo/ghidra/minimap/minimap_review_candidates_numbered_board.png`, `RE/.omo/ghidra/minimap/minimap_review_candidates_zoom_sheet.png`, and machine-readable `RE/.omo/ghidra/minimap/minimap_review_candidates_numbered.json`.
- **Candidate policy**: numbered 27 crosschecked unmatched bright clusters after subtracting the 80 already-positioned systems. Deliberately retained questionable bottom-edge, right-edge, and center-strip candidates so the user can reject them visually. Impossible out-of-board/zero-score projections were excluded.
- **Important guardrail**: this is still P3 visual inference support, not canon. No `server/content/galaxy.json`, DB, or wire emitter data was changed. Coordinates remain null until the review set is narrowed and either corroborated by stronger evidence or explicitly used as an experimental overlay.

## Minimap 10-to-5 reconciliation: central strip is likely correction/noise, not five new systems (2026-06-29, journal #101)
- **User correction**: if ten accepted minimap clusters remain but only five systems are coordinate-pending, then at least five accepted clusters must be parsing/projection mistakes or existing-80 coordinate corrections. Reframed the work from "assign all accepted clusters" to "separate missing candidates from existing-coordinate corrections."
- **Manual/json recheck**: re-ran `RE.tools.logh7_galaxy_star_extract --inventory-only` on `docs/reference/gin7manual-saved-starchart.pdf` page 101. Result remains `acceptedStarDots=80`, `rejectedAnnotationMarkers=80`. Name-based comparison between `server/content/galaxy.json` and `RE/content/galaxy-raster-star-centers.json` matches 80/80 except the known Fezzan row adjustment (`galaxy.json` row 38 vs raster row 39).
- **User accepted candidates**: `9,11,12,13,14,15,16,17,18,19`. All ten are blank versus the current 80 positioned `galaxy.json` cells, so `blank-cell` alone is not enough evidence.
- **Reconciliation result**: most likely missing-system candidate set is `9,11,12,13,19` (all passable and non-overlapping). The block `14,15,16,17,18` is most likely central-boundary parse noise or an existing-80 correction/duplicate block because it forms a vertical strip near existing Empire/corridor systems (`ビルロスト`, `アムリッツァ`, `ヴァンステイド`, `トラーバッハ`, `アルメントフベール`); candidate `17` is also blocked by the current passable mask.
- **Artifacts**: added `docs/logh7-minimap-star-inference-2026-06-29.md`, generated `RE/.omo/ghidra/minimap/minimap_reconciled_five_candidates.png`, `RE/.omo/ghidra/minimap/minimap_missing_system_assignment_p3_v2.json`, `RE/.omo/ghidra/minimap/minimap_candidate_count_reconciliation.json`, and `RE/.omo/ghidra/minimap/minimap_existing80_cluster_match.json`.
- **Guardrail**: the earlier P3 assignment using ten accepted clusters is superseded. Do not write coordinates into `server/content/galaxy.json` yet. The remaining 5-candidate set creates a 4-left/1-right distribution, which conflicts with the weak name-theme prior for `ニーベルング`/`モンサルヴァール`; name assignment remains unresolved pending another screenshot, live A/B overlay, or explicit experimental policy.

## Missing-system name-theme classification (2026-06-29, journal #102)
- **User read**: "maybe all except `ニーベルング` are not Empire-side." Rechecked against the existing 80-name pattern rather than coordinates.
- **Theme split**: current best P3 name-theme read is `アンウレガルラ` = ancient Mesopotamian/Sumerian-like myth → alliance-like; `ケープホーン` = real geography/toponym → alliance-like; `コブラヴェルデ` = Verde/geography-flavored and echoes alliance `リオ・ヴェルデ` → alliance-like; `ニーベルング` = Germanic/Wagneric Nibelung → strongly empire-like; `モンサルヴァール` = Grail/Parsifal/Montsalvat, Wagner-adjacent but broader mythic-place → ambiguous, alliance-leaning if the reconciled five-candidate geometry has only one right-side slot.
- **Implication**: if the five candidate cells stay `9,11,12,13,19`, then the cleanest P3 classification is four left-side names (`アンウレガルラ`, `ケープホーン`, `コブラヴェルデ`, `モンサルヴァール`) and one right-side name (`ニーベルング`). Exact left-side ordering remains unresolved. Artifact: `RE/.omo/ghidra/minimap/missing_system_name_theme_classification.json`; doc updated: `docs/logh7-minimap-star-inference-2026-06-29.md`.
- **External refinement**: user supplied `https://en.wikipedia.org/wiki/Montsalvat`. The page frames Montsalvat as a real artists' community/place name in Australia, with etymology tied to Grail/Parsifal/Wagner and Catalan "Saved Mount." This strengthens the "mixed place/myth name, not strictly Germanic Empire" read, so `モンサルヴァール` remains alliance-leaning under the 4-left/1-right candidate constraint.

## Official-source/data-sweep pass: lawful public BOTHTEC hunt + delivery map (2026-06-29, journal #99)
- **User push**: stop circling on "reverification"; use every lawful method to hunt BOTHTEC/server source data for the five coordinate-pending systems and keep every action documented. Scope explicitly excludes unauthorized private-server intrusion; it includes local EXE/assets/DB/PDF, official Wayback/public downloads, and raw byte searches.
- **New machine-readable sweep**: added `RE/tools/logh7_data_sweep.py`, wired `RE/tools/logh7_pipeline.py data-sweep`, added `RE/tools/tests/test_logh7_data_sweep.py`, and generated `RE/.omo/ghidra/data-sweep.json`. Current facts: `galaxy.systems=85`, `positionedSystems=80`, `coordinatePendingContentIds=[13,32,34,52,75]`, `planets=281`, `planetlessSystems=8`, passable cells `3627`, adjacency nodes `80`, content mirrors `server=1100 / RE=1102 / common=1100 / different=0`, RE-only launcher localization files `2`.
- **Gate/default correction**: the sweep now parses the actual `PLAYABLE_ENV_DEFAULTS` object instead of substring-matching `logh7-config.mjs`. This fixes a misleading read: `LOGH_STATIC_SHIPS` is **not** in playable defaults (`off-unless-1`) though the launcher can enable it; `LOGH_WORLD_IMPORT_BASES` and `LOGH_BASE_ECONOMY` are not in the object but are **implicit-on-unless-0** by login-session code and launcher-enabled.
- **Official/public source hunt recorded**: created `RE/.omo/ghidra/official-source-hunt.json` and downloaded the only official `gineiden.com` public download candidate to `RE/.omo/ghidra/official/G7UPD040514.wayback.exe` (`sha256=0bd0cd52eca4050e8045cf9e469788f222333e0509b8259f64ce93736a2e489c`, 10,913,837 bytes). The `gineiden.com/*` CDX inventory produced 3,087 rows / 3,082 unique rows and exactly one `.exe` download candidate: `G7UPD040514.exe`; byte search in that official snapshot finds **no** hits for `アンウレガルラ`, `ケープホーン`, `コブラヴェルデ`, `ニーベルング`, or `モンサルヴァール`. This matches #97: the patch is client asset/InstallShield content, not server/scenario coordinates.
- **Subagent convergence**: three read-only agents independently checked (1) public official/Wayback/web sources, (2) EXE/Ghidra raw bytes and coordinate-table structures, and (3) local source artifacts/PDF/DB/patch extraction. All found canonical **name** evidence only and no coordinate-bearing server/scenario/map table. Local raw name hits remain only in generated/recovered mirrors (`galaxy.json`, `client/msgdat.json`, `logh7-content.db`); installed raw `constmsg.dat` confirms the labels but not coordinates.
- **Doc hygiene**: updated `docs/logh7-server-data-audit-2026-06-28.md` so it no longer reads as "80 systems total"; it now states the live split explicitly: 85 names / 80 positioned markers / 5 coordinate-pending names.
- **Actionable next work is delivery, not fabricated placement**: use `RE/.omo/ghidra/data-sweep.json` as the backlog map. Highest-value real-game blockers remain player/account binding, default full `0x0325` fleet delivery, safe `0x030b` ship-master delivery, static-catalog recovery before non-zero emits, and C002 client UI admission for natural `0x0b01`. The five coordinates stay null unless a lawful original server capture/source appears.

## ★ DEFINITIVE: galaxy positions are SERVER-RLE-map; 5 missing systems = game-original, permanently lost (2026-06-29, journal #98)
- **User push** ("그리드값만 있으면 / mdx좌표 변환 / subId 파봐 / exe 따로 파봐"): exhaust every static source for the 5 coordinate-pending systems' grid (col,row). Ran workflow `wf_3ae36d38-93a` (8-agent: EXE-RE + manual + Wayback + 5×canon) + direct subId/EXE binary digs. All converge.
- **★EXE has NO static system→position table — placement is SERVER-delivered (full RE trace, confirms #95)**: the original game receives galaxy placement as an **RLE-compressed 100×50 byte map over the wire**, where **each cell's byte VALUE = the systemId occupying that (col,row)**. Chain (G7MTClient redex): recv-queue drain `FUN_004b8950` (queue@blob+0x3552b8) → opcode dispatch `FUN_004ba2b0` (sel=param_2&0xffff) → **RLE decoder `FUN_004abbb0`** (w=p[0],h=p[1],total≤0x1389; (runLen,fillByte) pairs) → copy 0x4e3 dwords `FUN_004c5350` (blob+0x3f4448→blob+0x2c03c8) → **systemId↔cell reverse-index `FUN_004c8bc0`** (scan 100×50 @blob+0x2c03cc; for 2<b<0x59 store row*100+col at out[8+b*4]) → cell color `FUN_004c8b70` + cell→world float `FUN_004d3540` (x=col−DAT, z=DAT−row). The map region is **BSS-style** (.data VA 0x75E000 VirtualSize ~0x2BF4FA8 ≫ RawSize 0x63000; `FUN_004c2a30` zero-fills, runtime-populates). constmsg group-0x18 `FUN_00522010` is **name-only**; system entity records (blob+0x2c1a78, stride 0x2a8, nameId@+0x21c) carry **NO (col,row)** field.
- **Corroborating direct digs (this session)**: (a) **subId = Japanese gojūon (alphabetical) order**, non-spatial — subId↔col r=−0.03, subId↔row r=+0.40(noise from 40 fuzzy matches), and subId-adjacent systems are spatially scattered (sub73=(24,2), sub74=(34,45), sub77=(63,40)); interpolation impossible. (b) **mdx files = mesh geometry only** — galaxy.mdx byte-identical to install (skydome), g_board/grids.mdx = LightWave board/grid/star-sprite-template meshes (`W:\Gin7\CG\g\galaxy_map\`), Null_galaxy.mdx points at ±99,328 model units map 1–2/80 to known cells (no correlation). (c) **EXE binary scans** (cellID/col-row/float, value-match + structural) = only noise/code/UTF-16 ramps, no clean 80–85 table.
- **★The 5 missing systems are GAME-ORIGINAL, not LOGH canon → external lore cannot place them either** (web research, all `lost`): sub13 **アンウレガルラ** = Anwuregalla (Sumerian myth "first man"); sub32 **ケープホーン** = Cape Horn (real Earth geography); sub34 **コブラヴェルデ** = Cobra Verde (not canon; only canon "Verde" is unrelated リオヴェルデ星域); sub52 **ニーベルング** = Nibelung (Gineipaedia: LOGH uses "Nibelungen" ONLY as a Wagner reference, NOT a star system); sub75 **モンサルヴァール** = Montsalvat (Wagner/Parsifal Grail castle). Zero hits in Gineipaedia, JA Wikipedia 銀河英雄伝説の舞台, karintougames fan interpolation map, the 80 manual 星系図 dots, and the local Wayback archive (848 files, zero byte-hits for any of the 5 names/fragments).
- **★FINAL VERDICT**: all 5 stay `coordinatePending` (verdict `lost`). Their grid cells lived ONLY in the now-dead BOTHTEC server's RLE map packet; not in client EXE / mdx / manual / canon / community. **Structurally unrecoverable** (not a search gap). Live observation is moot — no authoritative server exists (original dead; ours is the one lacking them). Do NOT fabricate. Count authority stays 85 (constmsg P0); coordinate authority stays manual P2 (80 plotted).
- **★SILVER LINING for the revival (actionable)**: we now know the EXACT original placement mechanism — **server emits an RLE-compressed 100×50 byte map, cell value = systemId** (decoded by `FUN_004abbb0`, indexed by `FUN_004c8bc0`). The revival server can faithfully reproduce this for the 80 known systems (place each systemId at its canonCol/canonRow; the 5 simply leave their cells empty). This is the canonical galaxy-map wire format — a concrete next wiring target.
- Workflow note: 1 of 9 agents (manual re-exam) hit the StructuredOutput retry cap, but #95 already established the 5 are not among the 80 manual dots, so the verdict is unaffected. Tokens 536k / 163 tool-calls / 9 agents.

## Official patch G7UPD040514.exe = CLIENT ASSET-ONLY (no canonical data) (2026-06-29, journal #97)
- **User question**: 최신 패치(`G7UPD040514.exe`, 2004-05-14 official update)가 있는데 적용해야 하나? + (follow-up) unshield도 깔아서 추출하라.
- **Container identified**: 10.9 MB InstallShield 6 PackageForTheWeb self-extractor. Markers: `ISc(` cabinets @0x19229 / 0x59d0f (desc_size=0x1d85 = **data1.hdr** w/ file table) / 0x6200d (**data1.cab** data) ; MSCF engine cab @0x969a9d (carved earlier = ikernel/IScript/IUser/etc. = **InstallShield runtime, not game data**). The @0x9db41f `ISc(` is a false match (version dword 0x810c75df = garbage in compressed data).
- **★Full file-table dump (data1.hdr @~0x61e06) = 102 names, ALL client assets + IS runtime; ZERO `.dat`, ZERO `G7MTClient.exe`, ZERO server data:**
  - **3D models**: `galaxy.mdx`, `grid.mdx`, **`grids.mdx`**, **`g_board.mdx`** (last two NOT in our install).
  - **galaxy/grid textures**: `galaxy_all.bmp`(2MB), `galaxy_alpha.bmp`, `grid01/02.bmp`, `star001/002.bmp`, `neb000..006.bmp`, `line.bmp`, `point.bmp`, `th_02..07.bmp`.
  - **unit/face icons**: EH###/EM###/FH###/FM###`.bmp` (Empire/FPA heavy/medium ship icons), `d_000..015.bmp`.
  - **effect tex**: m_smoke, shockwave, spark, f005_in.tga, f001op.bmp, p000.bmp.
  - **InstallShield runtime (not game)**: setup.exe/inx/ini, iKernel.dll, iuser.dll, iscript.dll, isrt.dll, _IsRes.dll, objectps.dll, ctor.dll, IGDI.dll, Setup.dll, YourApp.exe(PFTW placeholder), DotNetInstaller.exe, corecomp.ini, license.txt.
- **Install diff**: our `.omo/.../logh7-installed` has `galaxy.mdx`(16508B)+`grid.mdx`(44140B) at `data/model/strategy/`; **lacks `grids.mdx` + `g_board.mdx`** → our install is the BASE game and this patch ADDS those two + refreshes galaxy/grid models + textures + unit icons. (File mtimes all 2026-06-27 = our copy date, useless for version compare.)
- **★Verdict on "적용해야 하나"**: This is a **client-side visual/asset refresh**, NOT a data patch. It (1) **cannot** recover the 5 missing systems' coordinates or any canonical numbers (consistent with #95 KEYSTONE: authoritative numbers were server-side, never in client assets); (2) **does not touch `G7MTClient.exe`** → our canonical SHA `bc5e9322…` is unaffected (safe); (3) targets a registry-registered retail install we don't have, so the *installer* won't run against our copied tree anyway. So we do **not** "apply" it via setup; instead we **extract its assets** to (a) examine `g_board.mdx` (game-board mesh — the one unexamined long-shot for baked node layout, low probability per #95) and (b) optionally adopt the newer galaxy/grid visuals + unit icons.
- **Extraction tooling (DONE)**: 7-Zip cannot open IS6 `ISc(` cabs. Built **unshield 1.6.2 from source** in MSYS2 (winget MSYS2 → toolchain via repo.msys2.org single mirror+ParallelDownloads=1 after kakao mirror served stale/sig-invalid packages → cmake/gcc/zlib → manual `-liconv` re-link for the CLI). Carved `data1.hdr`(0x59d0f) + `data1.cab`(0x6200d→EOF). unshield reported **multi-volume**: files 25–274 (game assets) want **volume 2 (data2.cab)** which has offsets 0 in vol1 header — actually a single-disk build mis-flagged as 2 volumes, so `cp data1.cab data2.cab` aligned the offsets. **259/266 files extracted** to `.omo/work/patch-extract/extracted/` (7 missing = vol1-only IS support files, not game data).
- **★Extraction RESULTS (definitive)**: game payload = **246 images (Hi/Lo/Mid 3 resolution tiers of unit/face icons + textures incl. `galaxy_all.bmp` galaxy backdrop) + 7 tga + 4 strategy `.mdx`** (galaxy/grid/grids/g_board). All BMP valid (BM magic).
  - **`galaxy.mdx` BYTE-IDENTICAL to our install** (sha `cfde6e8d…`, 16508B) → patch does NOT change galaxy data.
  - **`g_board.mdx`(7982B) + `grids.mdx`(32818B) = NEW (install lacked them); `grid.mdx`(11934B) differs from install's (44140B).** Internal strings prove these are **LightWave render meshes** from the original BOTHTEC build tree `W:\Gin7\CG\g\galaxy_map\objects\` (`g_boards.lwo`, `star_01s.lwo`/`star_02s.lwo`, `grid_super.lwo`). **★Coordinate long-shot = NEGATIVE**: g_board has 0 coord-like float triples; grids/grid triples are normal vectors (−0.71 = 1/√2), not 85 system positions. The galaxy map renders **board mesh + grid overlay + star-sprite templates**, with star placement driven by SERVER grid data — confirming #95 KEYSTONE (positions are server-side, in NO client asset).
- **★FINAL VERDICT on "적용해야 하나" = NO need.** The patch is a **client-side visual asset refresh** (galaxy-map render meshes + Hi/Lo/Mid icon textures). It contains **zero canonical data** (no `.dat`, no positions/stats/economy), **does not touch `G7MTClient.exe`** (canonical SHA `bc5e9322…` unaffected), and **cannot recover the 5 missing systems' coords or any number-data**. The installer can't run against our copied tree anyway (needs a registry-registered retail install). Extracted assets are archived at `.omo/work/patch-extract/extracted/` if the newer visuals are ever wanted (our `grid.mdx` is actually larger than the patch's, so adopting could regress). **Net: patch analysis closed — no data gain, EXE safe, KEYSTONE reconfirmed.**

## Canon system count corrected 80→85, implemented + propagated (2026-06-29, journal #96)
- **Implemented (E2 `wf_66e51af3`, verified pass)**: added the 5 missing systems to `server/content/galaxy.json` with name_ja from constmsg group-0x18 (sub13 アンウレガルラ / sub32 ケープホーン / sub34 コブラヴェルデ / sub52 ニーベルング / sub75 モンサルヴァール), each `coord=null, positionAuthority=UNVERIFIED_P3, coordinatePending=true, nameAuthority=constmsg-group-0x18-P0, faction=null`. sub45 タンホイザーゲート (gate) NOT added as a system. **No coords fabricated.**
- **Roster 85 / coordinate-confirmed markers 80**: `buildStrategicGalaxyGrid` gains a `coordinatePending`/canon-cell-null guard so the 5 are excluded from 0x0315 markers (same policy as BH/NS special bodies) and never reach the min-max fallback. Strategic adjacency graph (`logh7-galaxy-adjacency.mjs`) excludes the 5 (no NaN edges; 80-node connectivity invariant holds).
- **Blast radius handled**: content-db count, content-adapter count, strategic-sim node/graph, login-protocol canon-oracle, provenance test all updated to 85-roster/80-confirmed.
- **Verification**: full `node --test tests/server/*.test.mjs` = **1231 tests / 1213 pass / 0 fail / 18 skip**. Verifier: pass, `fabricatedCoords=false`, `gridStillEmits80=true` (independent wire decode confirms exactly 80 class-3 markers, 5000 occupied cells).
- **content.db rebuilt + all mirrors synced**: ran `node src/server/logh7-content-db.mjs build` → on-disk `server/content/logh7-content.db` now `star_systems=85` (5 with `canon_col NULL`). Copied galaxy.json + content.db to `RE/content` and `.omo/work/.../logh7-runtime/content`; **all three galaxy.json = 85 and all three content.db star_systems = 85**. This closes the verifier-flagged live-runtime gap (runtime would otherwise have served the stale 80-system .db).
- **Remaining needs-sync (lower priority)**: `server/content/scenarios/canon-801-07.json` is a frozen 80-system scenario snapshot (separate from the roster). Pre-existing nuance: on the raw default `buildStrategicGalaxyGrid` path the 80 confirmed systems have no explicit contentId → byte0 = positional index fallback (the content-pack path resolves correct constmsg subIds); not introduced by this change.
- **Net**: the count-authority correction (constmsg P0 = 85) is now live across canonical + mirrors + DB, tested, with zero coordinate fabrication. Coordinate authority remains the manual P2 (80 plotted); the 5 stay coordinate-pending per #95 (unrecoverable from static assets).

## ★ KEYSTONE: authoritative POSITION data does NOT exist in the assets (2026-06-29, journal #95)
- **User question**: 성계/행성 위치를 다시 찾아야/전면 재RE 해야 하나? Ran workflow F (`wf_d14d022e`) — game position table × MDX star nodes × manual re-check, adversarially verified. Also directly confirmed: the original game `data/` tree has NO scenario/map/position FILE (only image bmp/tga, model mdx/mds, MsgDat, window dats).
- **★Definitive finding — positions are NOT statically recoverable beyond the manual**: (1) **No authoritative game position table** in EXE/scenario (the assumed P0 source does not exist). (2) **MDX models carry no system coordinates** — `Null_galaxy.mdx` = celestial nodes (BH/NS, no system XY), `galaxy.mdx` = skydome floats. (3) **Manual 星系図 has only 80 dots**; the 5 missing systems (13/32/34/52/75) have **no label and no dot on page 101** — earlier "finds" for 코브라베르데/몬살바르 were substring FALSE POSITIVES (ヴェルデ inside リオ・ヴェルデ; サルバ inside サルバドル). So the manual P2 (80 dots) is the ONLY static coordinate authority and it is NOT superseded by any game data.
- **5 missing systems' coords: UNRECOVERABLE (recoverable=false), UNVERIFIED_P3.** Their only future path is LIVE observation (server 0x0315 emitter ↔ original-client render). Static assets do not contain them.
- **★Strategic answer to "전면 재RE 해야 하나" (positions)**: NO — re-RE cannot conjure data that is not in the client assets. The authoritative game-balance NUMBERS (system positions, ship stats, planet economy) lived in the original BOTHTEC **server/scenario data**, which is NOT in the client install we have. The client assets hold names/models/strings (P0/P1) but not the authoritative numbers. So the manual P2 reconstruction is the honest CEILING for positions; the 80 dots are it, +5 permanently unknown. (Final confirmation that no EXE static content/position table exists will come from the running func-RE wave — per-function RE of the whole client; F's "no game table" was verifier-flagged as not-100%-exhaustive, but MDX-no-coords + manual-80-only make the conclusion strong.)
- **Implication for the broader content audit** (systems/planets/ships/characters): same structure — names/models authoritative (client), but NUMBERS (positions P2, ship stats P2-manual, planet economy unrecovered) are manual reconstructions because the authoritative numbers were server-side. B (`wf_b23fb9fd`) confirms this for economy; ships' stats are already known P2 (gin7 manual). **The revival's number-data ceiling is the manual, unless original BOTHTEC server data or a live original-game capture surfaces.**
- **Action**: keep the 5 at `coord=null / positionAuthority=UNVERIFIED_P3 / coordinatePending=true`, excluded from 0x0315 grid markers (same policy as BH/NS special bodies). Separate **count authority (constmsg P0 = 85 systems)** from **coordinate authority (manual P2 = 80 plotted)**. Do NOT fabricate the 5 coords. Doc: `docs/logh7-missing-system-coords-2026-06-29.md`. E2 (`wf_66e51af3`) roster fix is consistent with this (5 added coordinate-pending).
- **Caveat (index confusion to avoid)**: constmsg sub (13/32/34/52/75) ≠ galaxy.json array idx (80..84). galaxy.json idx13 = マローヴィア (a fully-plotted system). Keep the two index spaces distinct.

## Minimap-vs-mainmap coord: NO projection bug — premise corrected (2026-06-29, journal #94)
- **User report**: 성계 위치가 미니맵이랑 다른 것 같다. Ran workflow D (`wf_86b03766`) — minimap projection × main-map projection × server cell source, adversarially verified.
- **★Premise corrected**: the function I guessed as "minimap" (`FUN_005123b0`) does NOT draw star positions — it's a static 3-tab info-window layout builder (hardcoded widget rects); `rader_bar.tga` is a decorative status-bar sprite; the tactical radar (`FUN_004ede60`/`Rader_parts.tga`) is not the main-map star projection either. So **there is no minimap star-coordinate source to compare** — "minimap vs main-map mismatch" is non-comparable at the projection level.
- **Main-map projection IS consistent with the server (confirmed)**: both use `row*100+col` (N=100) cell space; client decodes cell id (selection rec +0x10) via `FUN_004c8b70` → `FUN_004d3540` (`worldX=col-50`, `worldZ=25-row`) → `FUN_004d2fe0` D3D matrix; server `buildStrategicGalaxyGrid` places `canonCol/canonRow` directly in that space. **No projection-formula mismatch.** (server-coords aspect was verifier-refuted → that sub-RE is low-confidence, but the client-side projection consistency is confirmed.)
- **Coverage/guard complete FOR galaxy.json's 80**: all 80 systems have `canonCol/canonRow` + `canonGameCol/canonGameRow`; the provenance test guards `canonCol∈0..99 / canonRow∈0..49 / no dup cells / 80 markers via byte0`, so the min-max fallback (login-protocol.mjs:1044-1045) is never taken for these 80.
- **⚠ THE 80 COUNT ITSELF IS UNDER VERIFICATION (user challenge, valid)**: galaxy.json's 80 and the test's 80 are a **circular P2 source** (both from manual-PDF dot extraction), never cross-checked against the original game's system-name table. Clue that 80 may be WRONG: prior evidence has `ルンビーニ = constmsg group-0x18 subId 86` — subIds reach ≥86, so the authoritative game string table may hold MORE than 80 system names (minus grid-type/fortress labels). Workflow E (`wf_47bcfb0b-80d`) is independently counting constmsg group-0x18 system names × manual dots × EXE table caps to settle the true canon count. **Until E returns, treat "80" as a provisional P2 assumption, not confirmed.** If the true count is higher, galaxy.json is incomplete (missing systems) — a content gap, not a projection gap.
- **Real remaining risk = DATA accuracy, not projection**: the coords are **P2** (gin7manual PDF raster dot centers + annotation match). If a dot↔system match is wrong, a system renders in the wrong (but valid) cell. Closing this needs (a) the `logh7-galaxy-positions` canon-dot re-extraction workflow, and (b) **live** Frida verification (`FUN_004d2fe0`/`FUN_004d3580` boundary probe capturing real (col,row)→screen vs rendered dots). Both beyond a code edit; live-gated for the final binding check.
- **Doc**: `docs/logh7-minimap-mainmap-coord-2026-06-29.md`.
- **Net**: no projection bug to fix; perceived mismatch is either a non-star widget or P2 data-accuracy. Position-accuracy is a data + live-verification track (galaxy-positions + Frida), not a server/client projection change.

## Full opcode emit-map (131 op) + first verified wiring: 0x421 CommandMission OK echo (2026-06-29, journal #93)
- **Context**: user directive "전체 옵코드 RE + 배선 다 구현". Ran the opcode-emit-map workflow (C, `wf_41ae1802`) to completion after fixing a synth-input truncation bug (was synthesizing only 26/166 opcodes) and re-running the full synth.
- **Full S→C opcode map** (`docs/logh7-opcode-emit-map-2026-06-29.md`, 484 lines, all 8 groups): 131 opcodes — **implemented 60, stub 23, missing 4 (0x202/0x207/0x410/0x425), wrong 2 (0x421), conditional 1, C→S 44.** Honest correction vs the buggy first pass: SimpleInfo 0x1202–0x120e builders ALL exist (codec/simple-info.mjs) → stub, not missing. The logistics family (0xb02–0xc02) was verifier-**refuted** → flagged LOW-CONFIDENCE, excluded from the backlog (func-RE re-check needed).
- **★Key honest finding**: a STRICT filter (missing/stub AND high-prio AND P0/P1-confirmed) yields **few items — most high-prio opcodes are already emitted; remaining gaps are content-seed / live / RE, not missing emit code.** Forcing the rest risks the client. The 7-item high-prio backlog's "blockedBy: none" claims were partly optimistic vs the actual code (e.g. 0x30b's gate is a deliberate world-init safety per its own comment).
- **Implemented (the one genuinely-safe, RE-confirmed item)**: **0x421 CommandMission OK echo.** RE-confirmed: client sends 0x421 (body 0x98) via FUN_004b78a0 and blocks on the 0x421 "CommandMission_OK" echo (receive dispatcher FUN_004ba2b0 case 0x421; size table FUN_004b8b00 case 0x421 = 0x98). The handler (`server/src/server/logh7-battle-ops.mjs` mission case) emitted only 0x43c/0x442 result notifies, never the OK → mission send could hang. Fix: prepend a byte-faithful `wrapRawInnerAsMessage32(inner)` echo with `target:'self'` (same convention as the command-engine move ACK, logh7-command-engine.mjs:477). Added the import + extended the mission test.
- **NOT implemented (honest, blocker per actual code, not forced)**: 0x30b static-ship default-on (its gate is a deliberate world-init safety; needs **live** re-verify), 0x427 NotifyFought (auto-resolve path, not the manual processFight path — context mismatch), 0x305/0x307/0x309 (need **content** seed — tied to recovery workflow B), 0x410 CommandEvacuateTroops (needs **inbound-body RE** before writing the parser).
- **Verification**: `node --check logh7-battle-ops.mjs` passed; focused mission test 2/2; full `node --test tests/server/*.test.mjs` = **1231 / 1213 pass / 18 skip / 0 fail** (no regression). The opcode-map workflow's verify phase independently vetted the 0x421 'wrong' classification.
- **Live gate**: the 0x421 echo's end-to-end effect (mission completes in real client) is a future live check; this entry verifies the byte-exact server emit + no regression, not the live mission UX.
- **Parallel**: content-recovery (B, `wf_b23fb9fd`) and minimap-vs-mainmap coord (D, `wf_86b03766`) workflows still running; their verified outputs will drive the next wiring/coordinate fixes.

## ★ LIVE A/B resolves 0x0b07 layout = @0x13 BE — #89 reversal OVERTURNED (2026-06-29, journal #92)
- **Cycle item**: P0-04 — the decisive live A/B for the 0x0b07 record layout (#88→#89 had flip-flopped statically). User authorized live. Canonical playable EXE SHA `bc5e9322...`, windowed, no preseed.
- **Live session** `.omo/ui-explorer/abc-live-20260629`: started windowed (clientPid 25396, runClientSha `bc5e9322...`), `create-character empire/abctwo/livetwo` → world entry (`0x0f02`, `0x0b0a` grid-enter, `0x0325`, `0x0323`×26, `0x0313`×2, `0x031f`×1). `LOGH_FLEET_MOVE_PROBE=1 DELAY_MS=180000 DELTA=9`; **watcher attached BEFORE the probe fired** (the journal #82 capture had no watcher).
- **★Decisive result**: the watcher caught exactly one fleet-move `0x0b07` (`bee20-enter=1`, `dispatch-b07=1`). `clientBase+0x437714` decoded to **server intent (unitId=1, cell=2597=2588+9) ONLY at @0x13 BIG-ENDIAN**; `@0x14 LE` gave garbage (65536 / 2427392). So a CLEAN capture is `@0x13 BE` too — the **#89 "dense buffer was a confound → @0x14 LE" conclusion is REFUTED.** Cycle #1's `@0x13 BE` was right; #89's static reversal was wrong. The live evidence is authoritative.
- **Net**: data arrives at the client correctly (1, 2597). `verdictCode = applied-transient-selectgrid-change` — only transient SelectGrid state changed, so **visible fleet relocation still unproven** (per #84). The server builder writes `@0x14 LE` in-memory yet the client reads `@0x13 BE` → an unresolved server↔wire serialization detail, but **no functional data loss** (client decodes correctly), so no server change forced.
- **Code re-corrected** (`RE/tools/logh7_0b07_location_watch.py`): watcher primary decode back to `@0x13 BE` (`readU32BE` @ +0x13), `@0x14 LE` kept as discredited static-only alt; `RE_CONFIRMED_0B07.recordLayout.layoutResolved=true`, primary `@0x13 BE`; added `liveResolution` note; `decode_move_record` default → `@0x13 BE`.
- **Cleanup**: `ui_explorer stop` → first stop `shaVerified:true`; EXE on disk re-verified `bc5e9322...` (canonical-playable); no `G7MTClient`/`G7Start`/`Gin7UpdateClient` process, no `47900` listener.
- **Verification**: `cd RE; python -m py_compile tools/logh7_0b07_location_watch.py` passed; `python -m unittest tools.tests.test_logh7_0b07_location_watch` **6/6** (incl. real-capture decode → (1,2597) at @0x13 BE default, garbage at @0x14 LE alt). Wire doc §3.1 updated with the LIVE RESOLUTION header (two-cycle history preserved).
- **Lesson**: a static-RE chain (even verifier-confirmed) can be overturned by a clean live capture — #88/#89 thrashed on the layout precisely because no live capture had the watcher attached before the single probe. The live A/B is what settled it.
- **Next**: visible-relocation (the actual goal) is still gated on the SelectGrid result→persistent-placement path (#84) — separate from the now-resolved record layout. Planet/ownership rendering is covered by the parallel content-recovery (B, `wf_b23fb9fd`) + opcode-emit-map (C, `wf_41ae1802`) workflows still running.

## P0-08 mode0 import O1 resolved — 0x345 etc. are NOT prerequisites (2026-06-29, journal #91)
- **Cycle item**: P0-08 tactical transition. Non-live static RE (redex); no client launched, process/port scan clean. No code change (RE/doc only).
- **Context**: P0-08's RE is already deep (`docs/logh7-mode0-breakthrough-2026-06-26.md`). My task premise ("0x42f → mode 2→0") is already a confirmed **dead path** there (`0x42f` has no `FUN_004ba2b0` case; server push cannot flip the mode byte). I therefore targeted the one **non-live, open** item: **O1** — "are the missing `0x33f/0x341/0x345/0x347` tactical-source builders required before mode0 can fill, since `FUN_004c32a0` reads both `+0x4040dc`(0x345) and `+0x4271a8`(0x33b)?"
- **★O1 resolved = NEGATIVE**: from `FUN_004c32a0` (`@0x4c32a0`) decompile, the `+0x4040dc` (0x345 Base) build block is gated `if (count != 0) { do … } while(count<5)` and **skipped with no return/abort when empty**; its nested corps/obstacle sources (`+0x40443c/+0x4042e4/+0x4042f8/+0x40430c/+0x404428` = 0x33f/0x341/0x347) only run when a base exists. The `+0x4271a8` (0x33b unit) block is **common code after the base branch** and runs on the world-entry (`param_2==0`) path regardless of bases. The only abort (`goto LAB_004c4140`) is in the `param_2!=0` (0xb0a own-fleet-add) path when `+0x126718==0`, not world entry.
- **Implication**: no new server builder is a prerequisite for the (live-gated) mode0 transition. The existing **0x33b `buildResponseTacticsInformationInner` (`LOGH_TACTICS_UNIT=1`)** is the necessary-and-sufficient source for the mode0 **unit** pool; `0x345/0x33f/0x341/0x347` are base/obstacle enhancements, not blockers. This shrinks the pre-live server work for `mode0-breakthrough` L2 to "0x33b only, add bases later if needed."
- **Caveat flagged**: `logh7-battle-engine.mjs:189` notes 0x33b was dropped from a **battle** path for client mis-consumption; whether it is consumed on the **mode0 import** path (`FUN_004c32a0` `+0x4271a8` read) is an L2 **live** check, not settled here.
- **Doc**: `docs/logh7-tactical-mode0-o1-resolution-2026-06-29.md` (decompile structure + verdict + reproducible redex).
- **Verification (self-adversarial)**: read `func 0x004c32a0` lines 95–105/360–400 directly; confirmed base block is count-gated (no abort on 0) and the unit block is common-path; confirmed `buildResponseTacticsInformationInner`/0x33b exists in the canonical server. Reproducible from `RE/`.
- **Next**: P0-08's remaining work is the live L1 (`mode0-breakthrough` selector + re-arm) and L2 (0x33b fill) — both **live-gated** (need a user-approved canonical session). Non-live RE on the tactical-transition thread is now exhausted.

## P0-07 faction-name (constmsg group-1) consumer map confirmed (2026-06-29, journal #90)
- **Cycle item**: P0-07 — "group-1 진영명 접근자 xref → 맵/패널 소비처 확정". Non-live static RE (redex only); no client launched, process/port scan clean.
- **Accessor**: constmsg text accessor is `FUN_00522010(group, subId)`; faction name = **group 1** (`2=제국`, `3=동맹`). Same accessor serves system names (group 0x18), origin (0xf), title (3/5).
- **★Full literal xref of `FUN_00522010(1, …)` = exactly 2 consumers, both UI (not the strategic map)**: (1) `FUN_00597b20` — character info/profile panel (window-2 text slots `FUN_00502780(2,n)`/`FUN_00503560`), faction subId from the packed char-state global `_DAT_02227f68` low byte (same global feeds origin group-0xf high byte; panel also shows rank group-5, title group-3); (2) `FUN_0059df00` — gamemenu/window builder (`data/image/gamemenu/menu_par`, `window/window_par` atlases) with a hardcoded `FUN_00522010(1, 2)` (Empire) fixed label.
- **★Map/panel faction display does NOT use group-1 names (confirmed by absence)**: the sector-map unit renderer `FUN_004ef0d0` makes **zero** `FUN_00522010` calls — faction is shown as **color** (commander char-table `+0xa/+0xb`, authority 0x0323 power@0x04; [[logh7-faction-projection-2026-06-26]]). The base panel `FUN_0057aa90` reads the faction-name **value** from the dynamic `0x031f` record `elem+0x04`, and only calls `FUN_00522010` with group **0x5f**/0x4e for static field-**labels**, never group 1 ([[base-panel-re-report]]).
- **Conclusion**: group-1 constmsg faction-name text is consumed only by the character-info panel (`FUN_00597b20`) and a fixed gamemenu label (`FUN_0059df00`). The strategic map expresses faction by color; the base panel by the dynamic 0x031f field. P0-07's "맵/패널 소비처" is now fully classified.
- **Doc**: `docs/logh7-faction-name-consumers-2026-06-29.md` (consumer table + the map=color / base-panel=0x031f distinction + scope note that the xref is for literal group==1).
- **Verification (self-adversarial, reproducible)**: `redex calls 0x00522010` (39 callers) + `grep "FUN_00522010\(1,"` → 2; `func 0x004ef0d0 | grep FUN_00522010` → none; `func 0x0057aa90 | grep FUN_00522010` → group 0x5f/0x4e only. All commands reproducible from `RE/`. No code change (RE/doc only), so no test run needed.
- **Next non-live candidates**: P0-06 (function-level RE coverage wave — note: the func-RE Workflow requires explicit opt-in), P0-08 tactical mode static layout. Live-gated items (P0-04 0x0b07 A/B, P0-05 fullscreen, P0-09/10 remaster) await a user-approved live session.

## 0x0b07 record layout: #88 BE13 claim RETRACTED — transport is verbatim, layout UNRESOLVED (2026-06-29, journal #89)
- **Cycle item**: P0-04 / C002 — continued the `0x0b07` thread by resolving the byte-mapping contradiction #88 flagged (server writes entries `@0x14 LE`; the journal #82 live record decoded cleanly only at `@0x13 BE`). This pass was RE + tooling + docs only; **no live client launched** (no `ui_explorer stop` needed). Process/port scan clean.
- **★Transport fully traced (the decisive new evidence)**: `FUN_00645db0` (message32 decipher) `ntohs/ntohl`-swaps **only the 8-byte outer transport header** (checksum/seq/len) and copies the message **body verbatim** — a `*puVar13 = *(u32*)puVar12` dword loop + byte tail, **no swap, no Feistel decrypt**. Chain `FUN_004ae0d0 → FUN_004b8850/FUN_004b8b00 (fixed 0x244) → FUN_004ba2b0 case 0xb07` then raw-copies `0x91` dwords to `clientBase+0x437714` (`local_18==param_1==clientBase`). ∴ client `param_3` == server payload **byte-for-byte, no transform**.
- **★#88 RETRACTION**: since (1) the server fleet-move probe emits `buildNotifyMovedGridInner` with entries `@0x14 little-endian` into a **sparse** zero-filled 580B payload (`logh7-login-protocol.mjs:1353`), and (2) transport is verbatim, a **clean** `clientBase+0x437714` record must read `@0x14 LE`. The journal #82 r2 capture was **DENSE** (carried dwords `2312/2313/49` the probe never sends) and matched intent `(unitId=1, cell=2597)` only under `@0x13 BE`. That means the watcher did **not** read a fresh fleet-move copy — the capture was **confounded**, and #88's "`@0x13 BE` is the layout" was an **overclaim from one confounded capture**. The `(0x13 BE)→(1,2597)` match is coincidental, not a confirmed layout.
- **Correction applied (`RE/tools/logh7_0b07_location_watch.py`)**: the watcher now emits **both** decodes per entry — primary `@0x14 LE` (server+transport-aligned) and alt `@0x13 BE` (journal-#82 reading) — plus raw bytes (`rawEntry14`, `altBE13.rawEntry13`). `RE_CONFIRMED_0B07.recordLayout.layoutResolved=false`; added `transportEvidence` (verbatim raw copy) and `captureConfound` notes; `decode_move_record()` is now parameterized (`entry_offset`, `byte_order`) so both candidates are testable off-line. **No server wire change** — flipping it is unjustified until a clean A/B.
- **Docs**: rewrote the `docs/logh7-strategic-input-wire.md` §3.1 correction (was "#88 `@0x13 BE` authoritative") to the two-cycle reconciliation: `@0x14 LE` leading hypothesis (server+transport), `@0x13 BE` confounded alternate, layout unresolved.
- **Verification**: `cd RE; python -m py_compile tools/logh7_0b07_location_watch.py` passed. `cd RE; python -m unittest tools.tests.test_logh7_0b07_location_watch tools.tests.test_logh7_0b07_apply_probe tools.tests.test_logh7_selectgrid_state_watch tools.tests.test_logh7_hud_hit_test_gate_watch` passed **14/14** (incl. `test_decode_move_record_both_candidate_layouts`: primary `@0x14 LE` reproduces the journal #82 garbage `65536`, alt `@0x13 BE` gives `(1,2597)`). A separate `logh7-loop-verifier` adversarial pass returned **REVERSAL-CORRECT** with C1–C4 all CONFIRMED (decipher raw-copy; case-0xb07 verbatim; `FUN_0044b460` zero call sites / off the path; server `writeUInt32LE@0x14` sparse) and its own 6/6 unittest pass.
- **Net for #88**: keep #88's correct parts (record location `clientBase+0x437714`; `FUN_0044b460` not on the runtime path; `staticPersistentWriterKnown=false`); **retract** its `@0x13 BE` layout assertion.
- **Next (unchanged, now sharper)**: a **single clean live A/B** — canonical windowed `ui_explorer`, no preseed, `LOGH_FLEET_MOVE_PROBE=1` — that dumps the server-emitted `0x0b07` frame bytes **and** `clientBase+0x437714` **in the same session, capturing the record the instant `FUN_004bee20` is entered for THAT push**. If the clean record reads `@0x14 LE` → watcher primary is right, server stays. If `@0x13 BE` → both watcher and server need the offset/endianness change. Until then do not promote either layout and do not claim visible fleet movement (path remains SelectGrid-result-only per #82/#84).

## 0x0b07 NotifyMovedGrid record layout corrected: watcher reads +0x13 big-endian (2026-06-29, journal #88) [SUPERSEDED by #89 — the +0x13 BE layout claim is retracted; see #89]
- **Cycle item**: P0-04 / C002 — advanced the `0x0b07 NotifyMovedGrid` record-application chain by closing the open lead from #82 (the live watcher parsed `unitId=65536` / `position=2427392` where server intent was `unitId=1` / `cell=2597`). This pass was RE + tooling + docs only; **no live client was launched**, so no `ui_explorer stop` was required. Post-check process/port scan found no `G7MTClient`/`LOGH7Launcher`/`G7Start`/`Gin7UpdateClient` and no `47900`/`47910` listener.
- **Evidence pass (explorer + relay + 2 child tasks)**: confirmed the runtime `0x0b07` record is the **raw verbatim wire-body copy** — `FUN_004ba2b0` case `0xb07` copies `0x91` dwords (`0x244`=580B) from the received body to `clientBase+0x437714` (`local_18==param_1==clientBase`), then `FUN_004bee20(clientBase, clientBase+0x437714)` → `FUN_00517cd0(0xb07, record)` → enqueue event `0x16` → `FUN_005751b0` SelectGrid ReceiveResult FSM. The decipher (`FUN_00645db0`) swaps only the 8-byte header; the body is copied raw end-to-end. **`FUN_0044b460` (which #84 and `docs/logh7-strategic-input-wire.md` §3.1 treated as "the parser") is a SEPARATE serialization registry (`FUN_0044b1e0`, vtable `PTR_FUN_0066d09c`) and is NOT on the runtime path** (`redex calls 0x0044b460` does not list `FUN_004ba2b0`).
- **★Root cause pinned with hard bytes**: from `.omo/ui-explorer/0b07-location-watch-r2-20260629/0b07-location.jsonl`, the captured `recordPtr 0xd2c8734` == `clientBase 0xce91020 + 0x437714` (exact). The 64-byte `rawHead` decodes to the server intent (`unitId=1`, `cell=2597 = empire 2588 + delta 9`) **ONLY** under `unitId/cell @ +0x13, big-endian`. Competing layouts all fail: `@0x14 LE` = (65536, 2427392) = the #82 garbage; `@0x14 BE` = (256, 664832); treating count as `u16@0x12` does not move the entries to a working offset. Two independent values matching under the same rule rules out coincidence.
- **Watcher fix (`RE/tools/logh7_0b07_location_watch.py`)**: JS `recordUnitEntries` now reads entries at `+0x13` via a new `readU32BE` helper (big-endian) and emits `rawEntry` ground-truth bytes per entry. Added a Python `decode_move_record()` mirror so the layout is unit-testable off-line. Rewrote `RE_CONFIRMED_0B07`: `recordLocation=clientBase+0x437714`, `unitEntryOffset=0x13`, `unitEntryByteOrder=big-endian`, dropped the false `parser=FUN_0044b460` claim (kept as a "NOT on runtime path" note), corrected `consumerPath`, and added a `serverEncodingDiscrepancy` note.
- **Server deliberately NOT changed (no-fabrication)**: `buildNotifyMovedGridInner` (`server/src/server/logh7-login-protocol.mjs:1353`) writes `count@0x12` then entries `@0x14 little-endian`. That does not match the live record's `@0x13 big-endian`, BUT (a) the server↔client byte relationship crosses the untraced message32 decipher/transport, (b) the captured global carried dense non-zero tail dwords (`01 00 00 00` runs, `0x31`, `0x0908`, `0x0909`) unlike the zero-filled-except-one-entry shape the builder produces — i.e. the buffer may be a reused global — and (c) `count@0x12` matches between server-LE and the capture while entries do not, which a pure verbatim copy cannot explain. This is a **candidate server-encoding bug, not a confirmed fix**; flipping the server wire encoding is gated on a controlled live A/B.
- **Docs**: added a dated correction block to `docs/logh7-strategic-input-wire.md` §3.1 (FUN_0044b460 not on runtime path; live `@0x13 BE` reading authoritative for the watcher; open server question as the next `0x0b07` frontier).
- **Verification**: `cd RE; python -m py_compile tools/logh7_0b07_location_watch.py` passed. `cd RE; python -m unittest tools.tests.test_logh7_0b07_location_watch tools.tests.test_logh7_0b07_apply_probe` passed **9/9** (incl. new `test_decode_move_record_matches_real_capture` proving the real r2 bytes decode to `unitId=1`/`cell=2597`, and a regression guard that the old `0x14 LE` read still yields `65536`). A separate `logh7-loop-verifier` adversarial pass (44 tool-uses) investigated and returned no refutation; my own re-derivation independently ruled out every competing layout.
- **Next**: the decisive open step is a **controlled live A/B** — one canonical windowed `ui_explorer` session (no preseed) with `LOGH_FLEET_MOVE_PROBE=1` that simultaneously dumps (i) the server-emitted `0x0b07` frame bytes and (ii) `clientBase+0x437714`, to settle whether the server must change `count@0x12 + entries@0x14 LE` to match the client's `@0x13 BE`. Until then, do not flip the server wire encoding, and do not claim visible fleet movement (the path is still SelectGrid-result-only per #82/#84).

## Lobby confirm-container strict inset retune (2026-06-29, journal #87)
- **User request**: re-check the lobby UI, especially the content container position, and adjust it so the container stays inside the panel.
- **Context used**: re-read the active `logh7-patch` and `logh7-live` procedures, then inspected current lobby patch descriptors, automation coordinates, and retained live screenshots. This pass focused only on the final registration confirm container, because normal faction/name/flagship containers were already inside the right native panel.
- **Patch change**: `RE/tools/logh7_confirm_dialog_inset_patch.py` now uses `X_INSET=180` for the caller-gated final registration confirm dialog (`type==5`, caller return `0x00595bc0`). The first implementation exposed an important x86 detail: `83 40 0c imm8` treats `0xb4` as signed `-76`, so the widget field could not represent `+180`. The trampoline now emits `81 40 0c imm32`, and tests assert the 32-bit widget add.
- **Build/deploy**: rebuilt and deployed the canonical playable EXE. Current authority SHA is `bc5e932212e790981c648c7b60acfbba06c0fdd5b8d7f583ef123fac71b098ad`. RE/root overlay and installed `G7MTClient.exe` all hash to that value; the `.uiexplorer` backup was absent after the stopped live session, which is expected for the current stop/restore path.
- **Live proof**: session `.omo/ui-explorer/lobby-confirm-inset-bc5e-final-20260629` started windowed, `runClientKind=canonical-playable`, run/source/expected SHA all `bc5e9322...`, no `LOGH_PRESEED_PLAYER_CHAR`. `create-character --session-row 1 --faction empire --lastname panel --firstname fit --flagship canon --settle 3.0 --lobby-wait 10` reached the final registration confirm screen. `shots/022-register.png` shows the confirm container inside the right panel; `shots/023-confirm-register-decide.png` showed that the temporary automation click `(1079,596)` hit the cancel/right button area, so the correct decision button coordinate remains `(1015,596)`.
- **Harness/docs**: restored `CREATE_REGISTER_CONFIRM_POINT` and `test_create_character_uses_current_native_lobby_coordinates` to `(1015,596)`. Updated `docs/logh7-ui-coordinate-map.md` with the current SHA, final confirm-container retune note, and `bc5e` live screenshot evidence. Updated current-authority SHA references in `AGENTS.md`, live skills/commands/agents, roadmap/current-authority docs, `RE/tools/logh7_client_exe.py`, `RE/tools/logh7_launch_config.py`, and the affected tests.
- **Verification**: `cd RE; python -B -m unittest tools.tests.test_logh7_confirm_dialog_inset_patch tools.tests.test_logh7_client_exe tools.tests.test_logh7_installed_tree tools.tests.test_logh7_ui_explorer` passed **48/48**. Installed/overlay EXEs hash to `bc5e9322...`. `ui_explorer stop` returned `shaVerified:true`. Post-check process scan found no `G7MTClient.exe`; port scan found no `47900`/`47910` listener.
- **Caveat**: this verifies the lobby confirm-container containment and corrected automation coordinate, not the broader multiplayer/strategic movement roadmap. Next gameplay work should resume from #86's server/wire fleet-move rebuild candidate.

## Fleet-move rebuild candidate locked server-side (2026-06-29, journal #86)
- **Context used**: continued the active roadmap after #84/#85. Re-read `logh7-re`, `logh7-wire`, and `logh7-live`. No live client session was launched; this pass stayed server/wire/test-only so there was no `ui_explorer stop` requirement.
- **Subagent results**: Huygens confirmed the server already had an opt-in branch for `LOGH_FLEET_MOVE_REBUILD_PROBE=1`, but no dedicated test. Banach confirmed the RE boundary: `0x0b07` is `FUN_004bee20 -> FUN_00517cd0(0xb07) -> FUN_00501e30(0x16) -> FUN_005751b0` SelectGrid/result-state only; visible movement must not be claimed without persistent row/cell diffs and screenshot agreement.
- **Server bug fixed**: `server/src/server/logh7-login-session.mjs` `localFleetRecord()` treated `cell=null` as an explicit cell because `Number(null) === 0`. That regressed default full `0x0325` records to cell `0`. It now falls back to `fleetCellId()` unless `cell` is actually provided and finite. This restores `LOGH_FULL_UNIT_LOCATION=1` and `LOGH_PLAYER_FOCUS_CELL=1` 0x0325 cell/commander fields.
- **Probe coverage added**: `server/tests/server/logh7-login-session.test.mjs` now covers `LOGH_FLEET_MOVE_REBUILD_PROBE=1`. The test pins the delayed diagnostic sequence as `[0x0b07, 0x0325, 0x0b0a]`, verifies the `0x0b07` payload unit id/destination, verifies the appended full `0x0325` unit replay carries the same destination cell, and verifies `0x0b0a` value `0` for the strategic no-reset rebuild path. Existing native 0x0325 tests were also hardened to clear stream-wire env knobs before asserting native layout.
- **Docs**: `docs/logh7-strategic-input-wire.md` now documents `LOGH_FLEET_MOVE_REBUILD_PROBE=1` as a follow-up placement candidate that extends `[0x0b07]` to `[0x0b07, 0x0325, 0x0b0a]`. It explicitly remains an opt-in live candidate, not proof that visible fleet movement is fixed.
- **Verification**: `cd server; node --check src/server/logh7-login-session.mjs` passed. `node --check tests/server/logh7-login-session.test.mjs` passed. Focused `node --test --test-name-pattern "full current location fields|own-fleet|FLEET_MOVE_REBUILD_PROBE|fleet move probe" tests/server/logh7-login-session.test.mjs` passed **4/4**. Full `node --test tests/server/logh7-login-session.test.mjs` passed **136/136**. Full `node --test tests/server/*.test.mjs` passed **1231 total / 1213 pass / 18 skipped / 0 fail**. One initial PowerShell `&&` check command failed syntactically and was rerun as separate commands.
- **Next**: the next live candidate can use canonical windowed `ui_explorer`, no preseed, `LOGH_FLEET_MOVE_PROBE=1 LOGH_FLEET_MOVE_REBUILD_PROBE=1` with a long delay, attach `logh7_0b07_location_watch.py`, and compare unit/PLAYER_INFO/cell diffs plus screenshot before promoting any visible movement claim.

## Lobby content-container re-audit: no extra coordinate shift (2026-06-29, journal #85)
- **User request**: re-check the lobby UI, especially the content/content-container placement, and adjust it so containers stay inside the panel.
- **Context used**: re-read the active `logh7-patch`, `logh7-localize`, and `logh7-live` procedures. Used two read-only subagents: one audited retained canonical lobby screenshots, the other audited the coordinate patch stack. No live client session was launched in this pass, so no `ui_explorer stop` was needed.
- **Current EXE state**: verified the RE overlay, root overlay, RE installed, and root installed playable EXEs all hash to canonical SHA256 `365b7e98110251b94e2c3c4668561f4dd36c10f375d1f7d5891e704cdc1c1bef`. The playable manifest/default stack includes `lobby-res`, `lobby-native-layout-v2`, `charsel-recenter`, `charsel-content-inset`, `charsel-content-y-inset`, and `charsel-confirm-dialog-inset`.
- **Patch audit**: `charsel-content-inset` finalizes creation-form X anchors at `720` and input/right subgroup X at `1025`; `charsel-content-y-inset` finalizes the two stale create-step Y anchors from `242` to `280`; `charsel-confirm-dialog-inset` is the gated appended-section patch for the final registration confirm only. No active final-stack lobby/create content anchor remains at an old out-of-panel coordinate.
- **Visual audit**: inspected the latest canonical live screenshots from `.omo/ui-explorer/lobby-confirm-canonical-365b-20260629`, especially `003-create-menu-new-character.png`, `009-origin-next.png`, and `022-register.png`. Session cards, name-entry content, buttons, final registration summary, and the final confirm overlay are inside the right native panel. The confirm overlay's left edge is close to the panel boundary, but still contained; a further blind X shift is not justified without a fresh defect screenshot.
- **Decision**: no new coordinate patch was applied. The correct current adjustment is the already-promoted stack from #83; extra movement would reduce working margins and could regress other lobby-derived steps.
- **Verification**: `cd RE; python -m py_compile tools/logh7_build_playable_client.py tools/logh7_confirm_dialog_inset_patch.py tools/logh7_client_exe.py tools/logh7_installed_tree.py tools/logh7_ui_flow.py tools/logh7_ui_explorer.py` passed. `cd RE; python -m unittest tools.tests.test_logh7_confirm_dialog_inset_patch tools.tests.test_logh7_client_exe tools.tests.test_logh7_installed_tree tools.tests.test_logh7_ui_explorer` passed **48/48**. Post-check process/port scan found no `G7MTClient`, `LOGH7Launcher`, `G7Start`, `Gin7UpdateClient`, or `47900`/`47910` listener.

## 0x0b07 static consumer closure + watcher contract hardening (2026-06-29, journal #84)
- **Context used**: continued after #83 lobby confirm-container containment proof. Re-read the active LOGH7 procedures for `logh7-re`, `logh7-wire`, `logh7-live`, `logh7-patch`, and `logh7-localize`. No live client session was launched in this pass, so no `ui_explorer stop` was needed.
- **Subagent results**: Pauli recommended closing the `0x0b07` persistent-application question before more MP claims. Bernoulli found session selection, deletion, GridChat endian, and web session admin already implemented/tested; remaining small server-admin gap is offline CLI session management, while Korean name IME remains client-side RE work.
- **Static RE recheck**: `FUN_0044b460` confirms `0x0b07` layout as size `0x244`, `unit_count @ +0x12`, entries at `+0x14` stride 8, `{u32 unitId, u32 positionOrCell}`. The known consumer path is `FUN_004bee20 -> FUN_00517cd0(0xb07) -> FUN_00501e30(0x16) -> FUN_005751b0` SelectGrid ReceiveResult FSM. No persistent unit table, PLAYER_INFO, cell/object, or own-cell writer was found on that path.
- **Tooling change**: `RE/tools/logh7_0b07_location_watch.py` now reports `reEvidence`, `knownConsumerEffect:"selectgrid-result-fsm"`, and `staticPersistentWriterKnown:false` in classifier results, so future live JSON is not misread as visual relocation proof just because event `0x16` arrived.
- **Docs/tests**: added watcher tests for the static RE contract. Updated `docs/logh7-strategic-input-wire.md` so `0x0b07` is protocol/control notification only until a placement writer is RE-pinned. Updated `docs/logh7-live-test-standard.md` to include `charsel-confirm-dialog-inset` in the current UI stack.
- **Verification**: `cd RE; $env:PYTHONDONTWRITEBYTECODE='1'; python -B -m unittest tools.tests.test_logh7_0b07_location_watch tools.tests.test_logh7_0b07_apply_probe` passed **8/8**. `python -B -m tools.logh7_0b07_location_watch --help` passed. Corrected `python -B -c` AST parse passed after an initial PowerShell heredoc syntax mistake.
- **Next**: do not repeat bare server-pushed `0x0b07` as movement proof. Next MP/gameplay slice should RE and then live-test the persistent placement trigger after result acceptance; a separate small server slice can add offline CLI session-admin commands backed by the existing session registry.

## Lobby final-confirm container inset promoted on canonical EXE (2026-06-29, journal #83)
- **User request**: re-check the lobby UI, especially content-container placement, and make sure containers stay inside the native right panel.
- **Context used**: continued from #81/#82 and re-read the active `logh7-patch`, `logh7-re`, and `logh7-live` procedures. Used the two available read-only subagents as independent sanity checks for the lobby screenshots and the confirm-dialog RE/patch risk. No `LOGH_PRESEED_PLAYER_CHAR` was used.
- **Visual diagnosis**: normal lobby/session/create/name/flagship containers were already inside the right panel after `charsel-content-inset` + `charsel-content-y-inset`. The remaining visual defect was the final generic registration confirm dialog, which still opened too far left and partially covered the left edge of the panel area.
- **Rejected unsafe patch**: removed the stale broad descriptor body from `RE/tools/client_patches/charsel-confirm-dialog-inset.json`; its `FUN_00570340` `db467c -> db466c` coordinate patch was too general and could shift unrelated type-5 dialogs.
- **RE finding**: final registration confirm follows `FUN_00594f20` case `0x69` into `FUN_0054ed00(type=5, ...)`, returning to VA `0x00595bc0`. A sibling caller also uses type 5, so a type-only hook would be too broad; the patch must also gate on the caller return address.
- **Client patch**: added/promoted `RE/tools/logh7_confirm_dialog_inset_patch.py`. It appends `.lg7c`, hooks return site `0x0054ed41`, checks `[esp+0xc] == 5` and `[esp+8] == 0x00595bc0`, then shifts the confirm dialog `+116` px on X by adjusting manager/widget X fields. Non-matching dialogs run the original `pop edi; xor eax,eax; pop esi; ret 0xc` path unchanged.
- **Build integration**: added `charsel-confirm-dialog-inset` to the default playable stack as an appended-section patch, after resource localization, and to installed-tree stack validation. Rebuilt/deployed the canonical playable. Current canonical SHA256 is `365b7e98110251b94e2c3c4668561f4dd36c10f375d1f7d5891e704cdc1c1bef`; RE/root overlay and installed copies all hash to this value.
- **Harness/docs**: updated the final register confirm click coordinate to `(1015,596)` in `RE/tools/logh7_ui_flow.py`, `RE/tools/tests/test_logh7_ui_explorer.py`, and `docs/logh7-ui-coordinate-map.md`. Updated current-authority SHA references in `AGENTS.md`, live skills/commands/agents, `RE/tools/logh7_client_exe.py`, `RE/tools/logh7_launch_config.py`, and roadmap/live docs.
- **Static verification**: `cd RE; python -m py_compile tools/logh7_confirm_dialog_inset_patch.py tools/logh7_build_playable_client.py tools/logh7_client_exe.py tools/logh7_installed_tree.py tools/logh7_ui_flow.py tools/logh7_ui_explorer.py` passed. `cd RE; python -m unittest tools.tests.test_logh7_confirm_dialog_inset_patch tools.tests.test_logh7_client_exe tools.tests.test_logh7_installed_tree tools.tests.test_logh7_ui_explorer` passed **48/48**.
- **Live proof**: canonical session `.omo/ui-explorer/lobby-confirm-canonical-365b-20260629` started windowed from `RE/` with `runClientKind=canonical-playable`, run/source/expected SHA all `365b7e98...`, and no preseed. `create-character --session-row 1 --faction empire --lastname PANEL --firstname GATED --flagship CANON --settle 3.0 --lobby-wait 10` completed 21 steps. `shots/022-register.png` shows the final registration summary and caller-gated confirm dialog inside the right panel; `shots/023-confirm-register-decide.png` shows world entry after clicking the new coordinate.
- **Wire proof**: trace emitted accepted create steps through `0x1008 requestCategory:4 createAccepted:true`, then progressed through `0x0205`, `0x0304/0x0305`, `0x0306/0x0307`, `0x0313/0x0315`, `0x0f02`, postload `0x0f06/0x0f07`, `0x0204`, `0x0325`, `0x0323`, `0x0b0a`, and `0x0356`.
- **Cleanup**: `ui_explorer stop` returned restored SHA `365b7e98110251b94e2c3c4668561f4dd36c10f375d1f7d5891e704cdc1c1bef`, `restoredClientKind:"canonical-playable"`, and `shaVerified:true`. Final process/port checks found no `G7MTClient`, `LOGH7Launcher`, `G7Start`, `Gin7UpdateClient`, or listeners on `47900`/`47910`.
- **Status**: lobby content-container containment now includes the final registration confirm dialog in the default canonical playable EXE. Remaining lobby work is separate behavior/text work: session localization/selection semantics, character deletion, and Korean IME input.

## 0x0b07 location watcher canonical live proof: transient only (2026-06-29, journal #82)
- **Context**: continued the active roadmap after the lobby container re-audit. Re-read `logh7-live`, `logh7-re`, `logh7-wire`, latest loop-state #80/#81, the server `LOGH_FLEET_MOVE_PROBE` path, and the watcher tests. Two read-only subagents independently checked the watcher and canonical live command recipe.
- **Live session**: `.omo/ui-explorer/0b07-location-watch-r2-20260629`, started from `RE/` on port `47900`, display mode `windowed`, no `LOGH_PRESEED_PLAYER_CHAR`. Start receipt showed run/source/expected SHA all `0ceee9aa3d3defa7513cd9991719b8ca1634adf95a9c8cfa18490aff992420fc`, `runClientKind=canonical-playable`, Korean menu mode ok, font registration ok, and `LOGH_FLEET_MOVE_PROBE=1 LOGH_FLEET_MOVE_DELAY_MS=120000 LOGH_FLEET_MOVE_DELTA=9`.
- **World proof**: lobby reached `0x2006`, game start/card click produced `0x2009 -> 0x200a`, conn3 `0x0200 -> 0x0201`, and world entry `0x0f02`. Postload sequence included `0x0f06 -> 0x0f07`, `0x0b09`, `0x0204`, `0x0325`, `0x0323`, `0x0b0a`, and `0x0356`. `shots/004-before-0b07-watch.png` shows a live strategic map with HUD and planet labels.
- **Server push proof**: trace emitted `0x0b07` at `2026-06-28T19:28:22.416Z` with `respLen=586`, `frameBytes=608`, followed by `deferred-battle-pushed delayMs=120000`. `shots/005-after-0b07-watch.png` was captured immediately afterward and is visually unchanged from the pre-push map.
- **Watcher result**: `0b07-location.json` captured `bee20-enter=1`, `dispatch-b07=1`, `enqueue-16=2`, `result-node-enter=13834`, and `result-node-leave=13834`. The original classifier returned `applied-location-state-changed`, but the only changed section was `selectResult`; `unitRowChanged=false`, `playerInfoChanged=false`, `cellObjectChanged=false`, `ownCellChanged=false`, and `anyPersistentLocationChanged=false`. The record parser saw `unitId=65536` and `recordPosition=2427392`, which does not line up with the expected live unit row (`id00=1`) and needs further RE of the copied `0x0b07` record layout/endianness or pointer stage.
- **Tool correction**: updated `RE/tools/logh7_0b07_location_watch.py` so persistent movement is not conflated with transient SelectGrid state. Reclassifying the same JSONL now yields `verdictCode:"applied-transient-selectgrid-change"`, `locationStateChanged:false`, `watchedStateChanged:true`, `changedSections:["selectResult"]`.
- **Docs/server wording corrected**: updated `docs/logh7-strategic-input-wire.md` and server comments so `0x0b07` is described as a client-accepted event path, not as proven direct unit/PLAYER_INFO mutation or visible relocation.
- **Verification**: `$env:PYTHONDONTWRITEBYTECODE='1'; cd RE; python -B -m unittest tools.tests.test_logh7_0b07_location_watch tools.tests.test_logh7_0b07_apply_probe` passed **7/7**. Reclassification command on the live JSONL produced `applied-transient-selectgrid-change`. First `ui_explorer stop` hit transient Windows EXE lock (`WinError 32`); process checks showed no remaining client/server PIDs, retry succeeded with `shaVerified:true`.
- **Next**: RE the real `0x0b07` copied-record layout and consumer after event `0x16`. Start from `FUN_0044b460` parser byte order, `FUN_005751b0` event consumption, and the mismatch between server payload `unitId=1/cell=2597` intent and live watcher record bytes `unitId=65536/position=0x250a00`.

## Lobby content-container official EXE re-audit (2026-06-29, journal #81)
- **User request**: re-check the lobby UI, especially the content container position, and adjust it so the container stays inside the panel.
- **Procedure refreshed**: re-read `logh7-patch` and `logh7-localize`; reused the current loop-state and UI coordinate map instead of launching the client unnecessarily. No live game session was started in this pass, so no `ui_explorer stop` was needed.
- **Visual evidence checked**: inspected the latest retained live screenshots from `.omo/ui-explorer/lobby-content-y-inset-fc70-20260629`: `006-faction-empire.png`, `009-origin-next.png`, and `020-flagship-text.png`. The faction, name-entry, and flagship content groups sit inside the right native panel. Also inspected `.omo/ui-explorer/0b07-location-watch-20260629/shots/003-game-start.png`; the session-card container remains inside the same panel.
- **Installed EXE verification**: byte-checked the current official installed/overlay EXEs. `RE/.omo/work/logh7-ko-overlay/exe/G7MTClient.playable.exe`, `.omo/work/logh7-ko-overlay/exe/G7MTClient.playable.exe`, and `.omo/work/logh7-installed/exe/G7MTClient.exe` all hash to canonical SHA256 `0ceee9aa3d3defa7513cd9991719b8ca1634adf95a9c8cfa18490aff992420fc`. The two Y-inset patch sites in the installed EXE are applied: file offset `0x198bda` is `c744242c18010000` and file offset `0x195e8b` is `c744240c18010000`.
- **Stack check**: the playable manifest tail is `font-face`, `font-atlas-face`, `font-cleartype`, `font-atlas-antialias`, `font-readable-size`, `login-title-ko`, `login-blank-password-local-ok`, `lobby-res`, `lobby-native-layout-v2`, `charsel-recenter`, `charsel-content-inset`, `charsel-content-y-inset`. This confirms the previously promoted containment fix is in the default official EXE, not only a runtime experiment.
- **Decision**: no new coordinate patch is needed. The current adjustment already moves the stale create-step anchors from `Y=242` to panel-aligned `Y=280`; moving further would reduce the safe bottom margin on name/flagship steps.
- **Verification**: `cd RE; python -m py_compile tools/logh7_build_playable_client.py tools/logh7_installed_tree.py tools/logh7_ui_flow.py tools/logh7_ui_explorer.py` passed. `cd RE; python -m unittest tools.tests.test_logh7_client_exe tools.tests.test_logh7_installed_tree tools.tests.test_logh7_ui_explorer` passed **47/47**. Final process/port check found no `G7MTClient`, `LOGH7Launcher`, `G7Start`, `Gin7UpdateClient`, or `47900`/`47910` listener.

## 0x0b07 fleet-move probe server prerequisite locked (2026-06-29, journal #80)
- **Context**: continued the roadmap item from #79 without launching the live client. Re-read `logh7-wire`, the server `LOGH_FLEET_MOVE_PROBE` implementation in `server/src/server/logh7-login-session.mjs`, existing `0x0b07` command-engine/protocol tests, and the post-load `0x0f06` grid-enter tests.
- **Gap found**: `buildNotifyMovedGridInner` and command-engine `0x0b01 -> 0x0b07` were already tested, but the exact live-diagnostic lever planned for the next canonical session (`LOGH_FLEET_MOVE_PROBE=1`) did not have a focused server test. That made the new apply-probe's live verdict dependent on an unpinned deferred-push setup.
- **Test added**: `server/tests/server/logh7-login-session.test.mjs` now has `login session can opt into a server-driven fleet move probe (LOGH_FLEET_MOVE_PROBE)`. It sets `LOGH_GRID_ENTER=1`, `LOGH_WORLD_CHAR_ID=209`, `LOGH_WORLD_UNIT_ID=77`, `LOGH_POSTLOAD_PLAYER_RECORD=1`, `LOGH_FLEET_MOVE_PROBE=1`, `LOGH_FLEET_MOVE_DELAY_MS=1234`, `LOGH_FLEET_MOVE_DELTA=9`, and also turns on `LOGH_STATE_TRANSITION_PROBE=1` as a conflict discriminator.
- **Assertion**: the normal post-load grid-enter `extraInners` stay `[0x0b09, 0x0204, 0x0325, 0x0323, 0x0b0a]`; the deferred slot contains exactly one message32 `0x0b07` frame of `6 + 0x244` bytes; payload `unit_count@0x12 == 1`, unit id `@0x14 == 77`, destination `@0x18 == 2597` (default empire cell 2588 plus delta 9), and no `0x0f1f` state-transition notify is present.
- **Docs**: updated `docs/logh7-strategic-input-wire.md` section 3.3 to state this server-side prerequisite, so the next live session has both a server oracle and the client apply-probe oracle.
- **Verification**: `cd server; node --check src/server/logh7-login-session.mjs` passed. Focused `node --test --test-name-pattern "FLEET_MOVE_PROBE|NotifyMovedGrid|buildNotifyMovedGridInner" tests/server/logh7-login-session.test.mjs tests/server/logh7-login-protocol.test.mjs tests/server/logh7-command-engine.test.mjs` passed **4/4**. Full `node --test tests/server/logh7-login-session.test.mjs` passed **135/135**. Full `node --test tests/server/*.test.mjs` passed **1212 pass / 18 skipped / 0 fail**.
- **Next**: the next canonical live run can now isolate client-side consumption cleanly: if `0b07-apply.json` says `record-missing`, the problem is live scheduling/transport; if it reaches `dispatch/enqueue`, the server lever is no longer suspect and the remaining proof is marker/object visual application.

## 0x0b07 apply probe verdict hardening (2026-06-29, journal #79)
- **Context re-read**: continued the full-doc/roadmap goal after the lobby content-container fix. Re-read the current live standard, master roadmap authority note, C002 admission discriminator, `docs/logh7-strategic-input-wire.md`, the existing `RE/tools/logh7_0b07_apply_probe.py`, and the server `LOGH_FLEET_MOVE_PROBE` path in `server/src/server/logh7-login-session.mjs`. No live client was launched in this pass.
- **Reason**: the roadmap still needs a real-client proof that server-pushed `0x0b07 NotifyMovedGrid` is not merely byte-built but actually reaches the client apply/dispatch/enqueue path. The old probe had the right hook addresses but mixed mojibake prose with a top-level `frida` import, so its decision logic was not safely unit-testable outside a live session.
- **Tooling fix**: rewrote `RE/tools/logh7_0b07_apply_probe.py` as a read-only, testable probe. The RE hook points are unchanged: `FUN_004bee20`, `FUN_00517cd0`, `FUN_00501e30`, and `DAT_007cd04c+0x11178`. `frida` is now imported lazily only when `run_probe()` attaches to a live PID, so `--help` and classifier tests do not require a running client or Frida import.
- **Output contract**: added stable `verdictCode` values: `record-missing`, `grid-gate-closed`, `dispatch-missing`, `enqueue-missing`, `applied-no-owncell-change`, and `applied-owncell-changed`. The JSON still includes the older human-readable fields such as `record_arrived`, `grid_active_gate_2a58f8_*`, `dispatch_517cd0_b07`, `enqueue_501e30_evt16`, and own-cell timeline, but future docs/tests should key on `verdictCode`.
- **CLI improvement**: added `--pid`, `--image-name`, and `--out` so the next standard live session can write `.omo/ui-explorer/<session>/0b07-apply.json` without relying on terminal capture.
- **Docs**: added `docs/logh7-strategic-input-wire.md` section 3.3 with the probe command and verdict-code meanings. This keeps the next live `LOGH_FLEET_MOVE_PROBE=1` run mechanically comparable.
- **Tests**: added `RE/tools/tests/test_logh7_0b07_apply_probe.py` for JS hook coverage, no-write guard, verdict ordering, and CLI help without live/Frida dependency.
- **Verification**: `cd RE; python -m py_compile tools/logh7_0b07_apply_probe.py` passed. `cd RE; python -m unittest tools.tests.test_logh7_0b07_apply_probe tools.tests.test_logh7_selectgrid_state_watch tools.tests.test_logh7_hud_hit_test_gate_watch` passed **8/8**.
- **Next**: run a canonical windowed live session only when needed, with no preseed and `LOGH_FLEET_MOVE_PROBE=1`, then execute the probe with `--out`. Passing evidence for MP observer movement should be either `applied-owncell-changed` or `applied-no-owncell-change` plus a separate fleet/object or screenshot proof that the marker moved.

## Lobby create-step content Y inset promoted (2026-06-29, journal #78)
- **User request**: re-check the lobby UI, especially the right-side content container position, and adjust it so every content container stays inside the native panel.
- **Context/actions**: re-used the already-loaded `logh7-patch`, `logh7-localize`, and `logh7-re` procedures; inspected current fc703 screenshots from `hud-spot-static-fc70-20260629` and `lobby-title-inset-fc70-20260629`; re-read `FUN_0051f8b0`, `FUN_005989f0`, `FUN_00595e70`, and related create-step builders through redex/disasm evidence from the prior pass. A subagent sanity check independently identified the two remaining stale post-stack Y sites: `0x00598bda` and `0x00595e8b`.
- **Root cause**: `charsel-recenter` had moved the main native panel/container to Y=280, but two create-step content anchors still carried Y=242. Live screenshots showed the panel blue top around y=293 while several instruction/title glyphs rendered around y=276, above the panel. The rejected one-site `charsel-step-title-inset` runtime trial only fixed the first faction transition screen, so it was deleted.
- **Client patch**: added `RE/tools/client_patches/charsel-content-y-inset.json`, applied after `charsel-content-inset`. It changes `FUN_005989f0` and `FUN_00595e70` anchors from `Y=242` to `Y=280` with same-length immediate patches (`c744242cf2000000 -> c744242c18010000`, `c744240cf2000000 -> c744240c18010000`).
- **Harness/doc coordinates**: moved affected create-flow hit points by +38 px: faction `(1021,464)/(1021,580)`, next/register `(1184,731)`, name fields `(1080,462)/(1080,543)`, portrait first slot `(444,344)`, flagship `(781,506)`, confirm `(1015,629)`. Updated `RE/tools/logh7_ui_flow.py`, `RE/tools/tests/test_logh7_ui_explorer.py`, and `docs/logh7-ui-coordinate-map.md`.
- **Live proof before promotion**: session `.omo/ui-explorer/lobby-content-y-inset-fc70-20260629` launched from `RE/` with canonical playable SHA `fc703145...`, windowed, no `LOGH_PRESEED_PLAYER_CHAR`, runtime patch `charsel-content-y-inset`. Runtime receipt showed both byte sites `beforeOk:true` and `ok:true`. `create-character --settle 3.0` completed 21 steps using the +38 coordinates. `006-faction-empire.png`, `009-origin-next.png`, and `020-flagship-text.png` visually show the instruction/form/button content inside the right panel. `ui_explorer stop` restored SHA `fc703145...` with `shaVerified:true`.
- **Stack/build promotion**: appended `charsel-content-y-inset` to `RE/tools/logh7_build_playable_client.py` `DEFAULT_STACK` and `RE/tools/logh7_installed_tree.py` required stack. Rebuilt/deployed the canonical playable EXE; RE and root overlay/installed copies all hash to `0ceee9aa3d3defa7513cd9991719b8ca1634adf95a9c8cfa18490aff992420fc`. Updated current-authority SHA references in `AGENTS.md`, live skills/commands, live standard, roadmap notes, `logh7_client_exe.py`, `logh7_launch_config.py`, and focused tests.
- **Tooling fix discovered during build**: `python -m tools.logh7_build_playable_client --deploy` twice failed on Windows with `OSError: [Errno 22] Invalid argument` while `apply_byte_patches(tmp, tmp, patches)` reopened the same `.exe.tmp` path for writing. Fixed `RE/tools/logh7_codepage_patch.py` so same-path patch application writes a sibling `.patchwrite` file and atomically replaces the destination.
- **Verification**: `python -m json.tool RE/tools/client_patches/charsel-content-y-inset.json` passed. `cd RE; python -m py_compile tools/logh7_codepage_patch.py tools/logh7_build_playable_client.py tools/logh7_client_exe.py tools/logh7_installed_tree.py tools/logh7_ui_flow.py tools/logh7_ui_explorer.py` passed. `cd RE; python -m unittest tools.tests.test_logh7_client_exe tools.tests.test_logh7_installed_tree tools.tests.test_logh7_ui_explorer` passed **47/47**. `ui_explorer stop` from the live proof returned `shaVerified:true`.
- **Status**: lobby/create-step content containment is now fixed in the default playable EXE. Remaining issues are separate: session/delete semantics, Korean IME input, and the C002/world gameplay roadmap.

## 0x0f02 synth fallback HUD stats byte-guard (2026-06-29, journal #77)
- **Context re-read**: after the lobby-container live verification, continued the roadmap item from #76/#74: the world-entry player `0x0323` must not render as a stale 황제/zero-stat placeholder. Re-checked `AGENTS.md`, the latest loop-state, `logh7-wire`/`logh7-re` procedure surfaces already loaded in this continuation, `docs/logh7-info-records-wire.md`, and `docs/logh7-server-data-audit-2026-06-28.md`.
- **Finding**: created/profile player records already received early `0x0323` abilities and stamina, and content-backed original/canon characters correctly stayed minimal. The missing lane was the no-real-player anti-emperor `synthFallbackPlayer`: it had seeded abilities/stamina on the JS object, but the early HUD-field spread only looked at `lobbyCharacters`, so the fallback still serialized ability bytes as zero.
- **Server fix**: marked `synthFallbackPlayer` with `syntheticPlayer:true` and changed `earlyPlayerHudFields` to use either the active lobby/profile record or that synthetic fallback only. This keeps the G215/G011 content-backed original-character guard intact while making the anti-emperor fallback non-zero on `ability_8 @0x188` and `stamina @0x1a9`.
- **Wire/test fix**: strengthened the basic `LOGH_WORLD_PLAYER` test to assert `0x0323` card/seat count at raw `+0x24c` as well as the `+0x250` gap. Added a regression where contentPack char id 1 is a canon sovereign, no real player is bound, and `0x0f02` still emits fallback stats `48/55/50` plus stamina `100` without opening early card/seat slots.
- **Verification**: `cd server; node --check src/server/logh7-login-session.mjs` passed. Focused `node --test --test-name-pattern "synth fallback|LOGH_DIAG_PLAYER|DEFECT 1|world spawn" tests/server/logh7-login-session.test.mjs` passed **4/4**. Full `node --test tests/server/logh7-login-session.test.mjs` passed **134/134**. Full `node --test tests/server/*.test.mjs` passed **1211 pass / 18 skipped / 0 fail**.
- **Live status**: no client was launched in this pass; this was a server byte-oracle correction after the lobby UI live proof. Next live run should stay on the canonical playable EXE, no `LOGH_PRESEED_PLAYER_CHAR`, and visually confirm the in-world lower-left HUD name/stats plus spot/base panel.

## Lobby container live re-check + 0x0f02 diagnostic crash fixed (2026-06-29, journal #76)
- **User request**: re-check the lobby UI content containers, especially that every right-side content block stays inside the panel. Keep using the canonical playable EXE and document each action.
- **Residual from #75 re-read**: the previous live run did not truly prove the client failed to send `0x0f02`. Subagent trace comparison found both `.omo/ui-explorer/session-flowfix-20260628` and `.omo/ui-explorer/lobby-content-coords-2d96-20260629` ended around `0x0f01`, and `server.log` showed `ReferenceError: writeTrace is not defined` in `server/src/server/logh7-login-session.mjs` when `LOGH_DIAG_PLAYER=1` tried to write trace directly from the pure session layer.
- **Server fix**: `logh7-login-session.mjs` now returns a `traceEvents` array for the opt-in `diag-player-record` instead of calling transport-layer `writeTrace`. `logh7-auth-server.mjs` writes those events beside the normal connection trace. Added a regression test so `LOGH_DIAG_PLAYER=1` on `0x0f02` returns a trace event without doing transport-layer IO.
- **Static verification**: `cd server; node --check src/server/logh7-login-session.mjs` and `node --check src/server/logh7-auth-server.mjs` passed. Focused `LOGH_DIAG_PLAYER` test passed. `cd server; node --test tests/server/logh7-login-session.test.mjs` passed **133/133**. Full `cd server; node --test tests/server/*.test.mjs` passed **1210 pass / 18 skipped / 0 fail**. `cd RE; python -m py_compile tools/logh7_ui_flow.py tools/logh7_ui_explorer.py` passed. `cd RE; python -m unittest tools.tests.test_logh7_ui_explorer` passed **33/33**.
- **Live session**: `.omo/ui-explorer/lobby-container-2d96-20260629`, launched from `RE/` with `python -m tools.logh7_ui_explorer --server-root ..\server --port 47900 --display-mode windowed --env LOGH_DIAG_PLAYER=1`. No `LOGH_PRESEED_PLAYER_CHAR`. Run/source/expected SHA all `2d96061ff4ec772df8ec8bfdcc427ac9e1aaf249fe634a6a5d1e58b2af32edf7`. Launch stack ended with `lobby-res`, `lobby-native-layout-v2`, `charsel-recenter`, `charsel-content-inset`.
- **Lobby visual proof**: `002-lobby-ready.png` shows the main lobby content box inside the right panel. `003-open-new-character.png` and `005-open-original-character.png` show the session-card content blocks inside the right panel. `004-new-character-back.png` and `006-original-character-back.png` confirm the back button returns cleanly to the lobby.
- **Create-flow visual proof**: the current `create-character` automation completed using the calibrated coordinates. `012-faction-next.png` (gender step), `015-lastname-click.png` (name-entry fields), and `024-flagship-click.png` (flagship input) show the content controls inside the right panel, not floating over the left menu. The flagship input is left-of-center but still within the panel boundary.
- **Wire proof**: creation emitted accepted `0x1008` steps for `profileKey:"dummy:2"` categories 0..4. World entry continued past the previous diagnostic crash: trace contains `0x0f02` at line 76, `diag-player-record` at line 77 (`charId:2`, `hasRealPlayerChar:true`, `playerName:"PANEL"`), `0x0f03` at line 107, and post-load `0x0356` at line 117.
- **Cleanup**: `ui_explorer stop` returned `shaVerified:true`; installed EXE hash remained `2d96061f...`. Final process/port checks found no `G7MTClient`, `G7Start`, `LOGH7Launcher`, or `47900` listener.
- **Status**: the lobby/session/create content-container placement is live-confirmed on the canonical playable EXE. No additional client layout patch was required in this pass; the necessary patch stack was already present. Remaining separate issues: session-selection text is still Japanese, and Korean input/IME handling remains a separate localization/input RE task.

## Lobby content-container coordinates re-aligned to the inset panel (2026-06-29, journal #75)
- **User request**: re-check the lobby UI, especially the content container position, and adjust it so content stays inside the right panel.
- **Evidence re-read**: compared the failed DEFECT-1 live screenshots from `.omo/ui-explorer/defect1-diag-2d96-20260629` with the #73 inset verification screenshots at `.omo/ui-explorer/lobby-content-inset-2d96-20260628`. The current canonical EXE layout already places the main lobby notice, session cards, faction/gender/origin steps, and name-entry panel inside the right panel. The immediate mismatch was the automation: `RE/tools/logh7_ui_flow.py` still clicked old pre-inset points such as `(766,581)` and `(640,313)`, which belonged to the left-overlapping layout from `.omo/ui-explorer/session-flowfix-20260628`.
- **Harness fix**: updated `RE/tools/logh7_ui_flow.py` with named current-layout points: step next/register `(1184,693)`, faction radios `(1021,426)/(1021,542)`, name fields `(1080,424)/(1080,505)`, portrait first slot `(444,306)`, flagship field `(781,468)`, and register confirm `(1015,591)`. The session-card row anchor remains `(1090,425)` with 115 px row stride.
- **Tests/docs**: strengthened `RE/tools/tests/test_logh7_ui_explorer.py` so the create-character flow asserts the new right-panel hit points, and updated `docs/logh7-ui-coordinate-map.md` with the calibrated coordinates and the boundary that portrait/flagship points should be re-checked on the next live flow.
- **Static verification**: `cd RE; python -m py_compile tools/logh7_ui_flow.py tools/logh7_ui_explorer.py` passed. `cd RE; python -m unittest tools.tests.test_logh7_ui_explorer` passed **33/33**.
- **Live verification**: canonical EXE session `.omo/ui-explorer/lobby-content-coords-2d96-20260629` started windowed on port `47900`, no `LOGH_PRESEED_PLAYER_CHAR`, run/source/expected SHA all `2d96061ff4ec772df8ec8bfdcc427ac9e1aaf249fe634a6a5d1e58b2af32edf7`. `002-lobby-ready.png` confirms the main lobby content box is inside the right panel. The patched `create-character` flow advanced through the right-panel faction/name forms; `008-faction-next.png` and `011-lastname-click.png` show the content inside the panel. Trace now includes multiple accepted `0x1008` create-step records for `profileKey:"dummy:2"`, proving the old stale-coordinate break was fixed.
- **Residual non-UI blocker**: after final register, the client reached the loading screen and trace reached `0x0300 -> 0x0f00 -> 0x0f01`, but no `0x0f02` arrived within 40 seconds (`wait-trace --code 0x0f02` returned `matched:false`). This is the existing world-init stall class, not a lobby container placement failure. The live run was stopped cleanly; `ui_explorer stop` restored canonical SHA with `shaVerified:true`.

## DEFECT 1 server path: conn3 created-player binding + early HUD stats test-green (2026-06-29, journal #74)
- **Context**: continued the roadmap after #73. Re-read the active live/wire/RE skill procedures and the latest loop-state. Used all three existing subagents for read-only audits: player-binding/server test audit, safe canonical live diagnostic sequence, and 0x0323/0x0356 wire risk boundary. All converged on the same narrow fix: early `0x0f02 -> 0x0323` may carry created-player abilities/stamina, but must not turn into a full post-load rich/card/action-list record.
- **Root found by test**: the same-session DEFECT 1 collision case already passed after `playerRecord()` precedence, but the live-shaped conn2->conn3 path still had a missing state bridge in the no-DB `LOGH_ACCEPT_ANY_GIN7` store. `createAccountStore({acceptAnyGin7:true})` authenticated both connections but had no registry-backed `getProfileCharacters/addProfileCharacter`, so a character created on conn2 was not reloadable by conn3 unless a DB registry was wired.
- **Server fix**: `server/src/server/logh7-login-session.mjs` now gives the no-registry account store a shared in-memory generated-character profile map using the same account-profile normalizer as the DB registry. Registry-backed mode still wins when present; strict/no-registry mode still does not invent accounts. This matches the project rule that authoritative state is memory first and DB is durability.
- **Wire fix**: the early `0x0f02` player `0x0323` record now adds `abilities` and `characterHudFields(...).stamina` only when the active player is a created/profile record in `lobbyCharacters`. Content-backed original/canon characters keep the G215/G011 minimal early record guard: no rich card/action-list fields, no unsafe `0x24c/0x254` mutation.
- **Tests added/strengthened**: DEFECT 1 same-session and live-shaped conn3 tests now assert the initial player card is the created "Lohengram" record and carries ability seeds at `0x188 + i*4` plus stamina `0x1a9 == 100`. The existing content-backed original-character test still proves early ability fields remain zero for canon `LOGH_WORLD_CHAR_ID=209`.
- **Verification**: `cd server; node --check src/server/logh7-login-session.mjs` passed. Focused `node --test --test-name-pattern "DEFECT 1" tests/server/logh7-login-session.test.mjs` passed 2/2. Related `node --test tests/server/logh7-account-registry.test.mjs` passed 15/15 and `node --test tests/server/logh7-login-session.test.mjs` passed 132/132. Full `node --test tests/server/*.test.mjs` passed **1209 pass / 18 skipped / 0 fail**.
- **Live status**: not yet live-claimed. Next canonical-EXE run should use the #72 reliable create flow plus `LOGH_DIAG_PLAYER=1`, no `LOGH_PRESEED_PLAYER_CHAR`, and verify the trace `diag-player-record` plus the bottom-left HUD name/stats on installed playable SHA `2d96061ff4ec772df8ec8bfdcc427ac9e1aaf249fe634a6a5d1e58b2af32edf7`. If live confirms, DEFECT 1 can be promoted from server-test fixed to live fixed; then verify DEFECT 2 spot panel and all-fleets visuals.

## Lobby creation-form content inset live-verified on canonical EXE (2026-06-28, journal #73)
- **User request**: re-check the lobby UI, especially the content container position; the container must sit inside the right panel. Re-read the active live/patch procedure surfaces and used the current canonical playable path only. Read-only subagent audits also completed this cycle: roadmap audit (next gameplay blocker remains DEFECT 1), server/RE audit (create-character reliability + player diag next), and prompt audit (no true UTF-8 mojibake; PowerShell display can misdecode).
- **Visual root**: the main lobby notice panel was already correct. The still-bad area was the 8-step character creation content family: faction/gender/origin/name forms had their label/input/button group centered around x=963 while the native right panel center is about x=1080, so buttons and input containers hugged the left panel edge. The session-card list was already OK and should not move.
- **Client patch**: added `RE/tools/client_patches/charsel-content-inset.json`, applied after `charsel-recenter`. It does only X-coordinate same-length immediate patches: step-form anchors `604 -> 720` (+116) and input sub-group `909 -> 1025` (+116). It intentionally leaves the main lobby notice and session-card anchors unchanged.
- **Stack/authority update**: added `charsel-content-inset` to `RE/tools/logh7_build_playable_client.py` `DEFAULT_STACK` and `RE/tools/logh7_installed_tree.py` required playable stack. Rebuilt/deployed canonical playable; new canonical EXE SHA256 is `2d96061ff4ec772df8ec8bfdcc427ac9e1aaf249fe634a6a5d1e58b2af32edf7`. Updated `AGENTS.md`, live skills/prompts, live standard, UI coordinate map, roadmap SHA notes, `logh7_client_exe.py`, `logh7_launch_config.py`, and focused tests.
- **Static verification**: byte-checked build passed and produced the same new SHA. `python -m unittest tools.tests.test_logh7_client_exe tools.tests.test_logh7_installed_tree tools.tests.test_logh7_ui_explorer` passed **46/46**. `python -m py_compile tools/logh7_build_playable_client.py tools/logh7_client_exe.py tools/logh7_installed_tree.py tools/logh7_ui_explorer.py` passed. Root and RE overlay/installed EXEs all hash to `2d96061f...`.
- **Live verification**: started `.omo/ui-explorer/lobby-content-inset-2d96-20260628` with `ui_explorer start --server-root ../server --port 47900 --display-mode windowed`; run/source/expected SHA all matched `2d96061f...`, launch stack included `lobby-res`, `lobby-native-layout-v2`, `charsel-recenter`, `charsel-content-inset`, no `LOGH_PRESEED_PLAYER_CHAR`.
- **Screenshots**: `002-lobby-ready.png` confirms the main lobby notice container is still inside the right panel. `003-new-character.png` confirms the session cards remain inside and were not over-shifted. `004-session-row-1.png`, `005-faction-next.png`, `006-gender-next.png`, and `007-origin-next.png` confirm the faction/gender/origin/name-entry content containers now sit inside the native right panel.
- **Pixel receipt**: old name-entry input boxes were `x=862..1064` (center 963); new name-entry input boxes are `x=978..1180` (center 1079). Old bottom buttons were `x=760..955` and `971..1166`; new bottom buttons are `x=876..1071` and `1087..1282`. This is exactly the intended +116 px inset.
- **Closure**: `ui_explorer stop` restored canonical playable SHA `2d96061ff4ec772df8ec8bfdcc427ac9e1aaf249fe634a6a5d1e58b2af32edf7` with `shaVerified:true`; cursor clip released; no `G7MTClient` process and no `47900` listener remained.
- **Next**: UI container placement is fixed for the tested lobby/create screens. Gameplay frontier remains the roadmap item from #72: clean live run with `LOGH_DIAG_PLAYER=1` to settle DEFECT 1 player binding, then planet/spot and all-fleets visual verification.

## Create-character flow reliability: settle was the cause; defaults bumped (2026-06-28, journal #72)
- **Root cause of the meta-blocker found**: the `ui_explorer create-character` flow stalled at the lobby because the per-step `--settle` default was **1.0** — too short for the 8-step form to render before the next blind click, so clicks landed on un-rendered screens and the flow desynced. With a 12s lobby wait + `--settle 3.0` the flow **reached world entry** (`0x0f02:1, 0x1008:10, 0x2009:1, 0x0323:26`). The lobby session catalog/account state is fine (`lobby_sessions` table has session 1 "Amritsar" open; `LOGH_ACCEPT_ANY_GIN7` → fresh account, no char-cap). It was a pure timing problem.
- **Tooling fix (RE/tools)**: `cmd_create_character` now waits for splash/lobby render before driving (`--lobby-wait`, default 10s) and the `--settle` default is raised 1.0 → 3.0 (`logh7_ui_explorer.py`). `python -m py_compile` + `python -m unittest tools.tests.test_logh7_ui_explorer` = 33/33.
- **RESIDUAL flakiness (environmental, not server code)**: after several restarts, the world-init handshake began intermittently stalling at `0x0f00`→`0x0f01` (client sends RequestWorldInitialize, gets OK, then does NOT send `0x0f02 RequestGridInitialize`). The SAME server code reached world earlier this session (defect1/2-verify) and once this cycle, so it is not the DEFECT-1/currentSpotId/all-fleets changes (`currentSpotId` is only called in base-record paths AT/after 0x0f02, never during 0x0300–0x0f01). Likely environmental (repeated server restarts / port TIME_WAIT / client state). Needs a clean-environment retry.
- **DEFECT 1 live diagnosis still open**: added an opt-in `LOGH_DIAG_PLAYER=1` server trace (`diag-player-record`: charId/generatedCharacterId/hasRealPlayerChar/lobbyChars/playerName) at 0x0f02 to pin why the live player renders 황제 despite the unit-verified collision fix — but could not capture it because world entry stalled this session. The one good live run (DEFECT-1 fix loaded, world reached) still showed 황제, so the live root differs from the collision case (candidate: conn3 `lobbyCharacters` lacking the created char, or empty created-name → client 황제 fallback). The gated trace remains for the next clean-environment run.
- **Verification**: full `cd server; node --test tests/server/*.test.mjs` = **0 fail / 18 skipped** (diag gated off by default → no regression). All live sessions stopped `shaVerified:true`, EXE canonical, no stray process/port.
- **Next**: clean-environment live run with `LOGH_DIAG_PLAYER=1` + the now-reliable settle defaults → capture `diag-player-record` → pin & fix DEFECT 1 live root → then 스폿불명/all-fleets-markers/HUD visual confirm + promote.

## Single-client galaxy fleet visibility (0x0325 all-fleets) — server-verified live (2026-06-28, journal #71)
- **Goal item (ultrawork loop)**: proper multiplayer = a populated galaxy. The data-audit's top delivery gap was that the default world-entry 0x0325 sends only the player's own fleet (unitCount:1), so a solo player sees no enemy/ally fleets even though the runtime worldState holds 24 scenario fleets (`canon-801-07`). The all-fleets path existed only behind `LOGH_MP_VISIBILITY` (the 2:2 cross-player sync, C2).
- **Implementation (server/, gated default-OFF)**: added `LOGH_WORLD_ALL_FLEETS` gate (`relayEnabled && env`) + `pushWorldFleetsToJoiner()` in the auth-server connection handler. On world entry (registeredInWorld), it pushes the session runtime's FULL fleet table to the joiner via the proven `buildInformationUnitRecordInner({wireLayout:'parser-stream', fleets: listFleets()})`, preceded by each fleet commander's 0x0323 record (faction color, so markers draw). One-way push to the joiner (no peer broadcast — distinct from mpVisibility's C2), one-shot (`worldFleetsPushed`). No fabrication (projects only real worldState fleet entities).
- **Verification**: `node --check` passed; full `cd server; node --test tests/server/*.test.mjs` = **1208 pass / 18 skipped / 0 fail** (gate default-OFF → no regression). **LIVE (canonical EXE)**: `ui_explorer ... --env LOGH_RELAY=1 --env LOGH_AUTHORITATIVE=1 --env LOGH_WORLD_ALL_FLEETS=1` → trace `{"event":"world-all-fleets-push","connectionId":3,"fleets":24}` + `0x0325` emitted. **The server pushed all 24 scenario fleets to the joining solo player.** Stopped `shaVerified:true`, EXE canonical.
- **Client-visual PENDING (meta-blocker)**: the client did not reach the rendered world map (`0x0f02`=0, screen stayed at lobby) in this run, so the 24 fleets-as-markers visual is unconfirmed. This is the SAME recurring blocker: server changes verify (trace), but client visual confirmation needs a reliable create-character→world flow, which has been flaky this session (stalls at lobby / empty right panel).
- **META-BLOCKER identified as #1 priority**: the `ui_explorer create-character` blind-click flow is the bottleneck for ALL client-facing verification (DEFECT 1 real-name confirm, 스폿 불명 clear, all-fleets markers, UI HUD fit). Next loop focus: make the live create-character→world flow reliable so the substantial (now test/trace-verified) server work can be visually confirmed and promoted to defaults.

## DEFECT 1 collision fix UNIT-VERIFIED via deterministic repro (2026-06-28, journal #70)
- **Resolved the journal #69 unknown deterministically (no flaky GUI needed)**: added a server-level regression test `tests/server/logh7-login-session.test.mjs` "DEFECT 1: 충돌하는 캐논 id가 있어도 월드진입 0x0323 플레이어는 생성 캐릭(황제 아님)이다". It builds a content pack with a CANON char at id 1, creates a player char (lobby empty → created id = 1, colliding), drives 0x0f02 world entry, and reads the pushed 0x0323 player record's lastname (offset 0x81/0x82). **It passes with the fix (lastname = 'Lohengram', the created char) and would fail without it (lastname = 'CanonSovereign', the colliding canon).** This unit-verifies that `playerRecord()`'s created/lobby-over-contentPack precedence (journal #69 edit #1) actually resolves the collision.
- **Conclusion**: the server-side DEFECT 1 collision bug (created char id collides with a low canon contentPack id; contentPack-first `activeCharacterRecord` shadowed the created player → HUD showed the canon character, e.g. 황제) is FIXED and unit-tested. For the actual user (who types a real character name in the UI), the world-entry player record will now bind to the created character instead of the colliding canon char.
- **Live 황제 in the test harness = separate artifact (not the server bug)**: the ui_explorer blind-click create-character does not type a real name, so the created char's name is empty → the client HUD falls back to a default "황제" string (login-session.mjs:1748 stale-string warning). That is a harness limitation, not the server binding bug. To confirm end-to-end with a real name needs a reliable live create flow that actually inputs the name (the blind-click flow stalled this session).
- **Verification**: full `cd server; node --test tests/server/*.test.mjs` = **1208 pass / 18 skipped / 0 fail** (incl. the new DEFECT 1 regression). `currentSpotId()`→playerRecord (journal #69 edit #2) kept for spot-key consistency (world-path only).
- **Next**: live-confirm with a real typed name (player renders as Reinhard, 스폿 불명 clears as the downstream follows); then strategic-fleets 0x0325 full table + promote LOGH_WORLD_IMPORT_STATIC_BASE + in-world HUD patch.

## DEFECT 1 attempt: player-record collision fix applied (test-green) but live-UNCONFIRMED (2026-06-28, journal #69)
- **Hypothesis pursued**: the world-join trace resolves the player to `characterId: 2`; created-char ids are session-local (`nextCharId = lobbyCharacters max+1`, low) so a fresh account's created char gets a LOW id that COLLIDES with a canon contentPack char id. `activeCharacterRecord(id) = contentPack.characterById(id) ?? lobbyCharacters.find(...)` is contentPack-FIRST, so a created player (id 2) is shadowed by canon char 2 → HUD shows the canon character.
- **Fixes applied (both world-path-only, all 1207 server tests green, no regression)**:
  - `playerRecord()` (logh7-login-session.mjs ~1096): when `hasRealPlayerChar()`, prefer the player's own created/lobby/profile record (`lobbyCharacters`) over a colliding canon contentPack id — `return lobbyRec ?? activeCharacterRecord(id)`. Precedence reversal is scoped to playerRecord only (global activeCharacterRecord/NPC lookups unchanged).
  - `currentSpotId()` (~1460): now uses `playerRecord(activeCharacterId())` instead of `activeCharacterRecord(...)` so the base-record spot key matches the 0x0323 player location (line ~1706 also uses playerRecord) — for the 스폿 불명 (DEFECT 2) spot-match. Confirmed `currentSpotId` is only called in world/base paths (not the lobby session-list), so it cannot break lobby→world.
- **LIVE RESULT — NOT fixed**: the run that reached world WITH the playerRecord fix (pre-currentSpotId) STILL showed "황 제" + stats 0 + "스폿 불명", `characterId: 2`. So edit #1 alone did not change the symptom.
- **Most consistent remaining hypothesis (unconfirmed)**: since the HUD shows the canon 황제 and NOT the anti-fallback "신임 사관", `hasRealPlayerChar()` is true and the created char IS loaded (generatedCharacterId set + pushed into conn3 lobbyCharacters) → playerRecord likely DOES return the created char, but its **name is empty/invalid** (the ui_explorer blind-click create-character did not capture "Lohengram"/"Reinhard"), so `characterDisplayName()` is empty and the client HUD falls back to a default "황제" string (the login-session.mjs:1748 warning: "otherwise the lower-left HUD can fall through to stale client strings"). Stats 0 = world-entry 0x0323 omits abilities (deferred to post-load). This would make DEFECT 1 partly a TEST-HARNESS artifact (no real typed name) rather than purely a server bug — but it is NOT proven.
- **Diagnostic blocker**: added a temporary `diag-player-record` server trace (charId/generatedCharacterId/hasRealPlayerChar/lobbyChars/playerName/title) at the 0x0f02 world-entry to settle this, but the ui_explorer create-character blind-click flow became UNRELIABLE this session — it repeatedly stalled at the lobby (empty session list) without sending 0x0f02, so the diag never fired (verified the stall is NOT my code: `currentSpotId` is world-path-only; server.log clean; closes hadError:false). Removed the temp trace after.
- **Verification**: full `cd server; node --test tests/server/*.test.mjs` = **1207 pass / 18 skipped / 0 fail**. Live sessions all stopped `shaVerified:true`, EXE canonical, no stray process/port.
- **Decisive next step**: capture the `diag-player-record` trace under a RELIABLE world entry (fix the create-character flow flakiness, e.g. confirm the session list populates before selecting; or drive world entry deterministically), OR write a server-level unit test that injects a created char id colliding with a canon contentPack id and asserts the world-entry 0x0323 name = created char. The single unknown is `playerName`: empty (client-fallback 황제 → fix = ensure created char carries a real name on the wire) vs the canon char's name (server binding bug → fix = thread created id / break the collision by allocating created ids above the canon max).

## Live verify: 0x031d push is stall-safe but DEFECT 2 ⊂ DEFECT 1 (2026-06-28, journal #68)
- **Context**: live-verified the journal #67 DEFECT 2 fix on the canonical EXE (server-side change, no EXE rebuild; `ui_explorer --server-root ../server` with `LOGH_WORLD_IMPORT_STATIC_BASE=1`). Drove signup→world entry, cropped the base/planet panel + player portrait, then stopped clean (`shaVerified:true`, EXE canonical, port free).
- **0x031d world-import push is LIVE-SAFE (promotable)**: with the gate ON, trace shows `0x031d` count 2 (PULL + new world-import PUSH) and **`socket-error: 0`** — the client survived world entry with NO early-walk stall. So the investigator's stall risk did NOT materialize; the push can be promoted to `PLAYABLE_ENV_DEFAULTS` once it is actually load-bearing.
- **BUT DEFECT 2 ("스폿 불명") is NOT fixed by 0x031d alone — it is DOWNSTREAM of DEFECT 1**: the base/planet panel still rendered "행성/요새 궤도상 → 스폿 불명" for 발할라 even with the static name table pushed. This confirms the data-audit institutions-domain theory over the static-name theory: the panel's spot lookup (client matches `spot.field04` against `PLAYER_INFO+0x40/+0x44`, copied from the player char source `+0x20`) cannot resolve because the PLAYER is the wrong/placeholder character, so the spot key is wrong. Fix DEFECT 1 → fixes both 황제 AND 스폿 불명. (Keep the 0x031d push: it correctly fills the name table and is harmless, just not the gate.)
- **DEFECT 1 live diagnostic (player=황제)**: portrait still shows "황 제" with all stats 0. Trace resolves the player to **`characterId: 2`** (one `world-join`), yet the HUD name renders 황제 — i.e. the just-created "Lohengram Reinhard" is NOT bound as the player; an emperor/placeholder record is. Effective env: `LOGH_WORLD_CHAR_ID`=unset, `LOGH_ACCOUNT_DB`=unset, `LOGH_ACCEPT_ANY_GIN7`=1, `LOGH_SEED_CANON_NPCS`=1; char was created (`0x1008`×10, profile×53, account×112, loopback-account-bound×1). So `hasRealPlayerChar()` is somehow true while the player record is not the created char. The exact culprit (generatedCharacterId vs accountIdentity().char vs the SEED_CANON_NPCS 황제-stamp landing on the player slot) needs a **server-side trace** of `activeCharacterId()`/`generatedCharacterId`/`hasRealPlayerChar()`/`playerRecord().name` at the 0x0f02 world-entry on conn3 — that is the next focused diagnostic before the fix.
- **Stats-0 sub-issue**: even the correct player would paint 0 because the world-entry `0x0323` deliberately omits abilities/stamina (deferred to post-load `0x0356`); the live `LOGH_POSTLOAD_RICH_CHARACTER=1` did not visibly refresh the bottom-left bars. The DEFECT 1 fix must also deliver real abilities on world-entry (or confirm the post-load refresh reaches the HUD).
- **Verification**: `shaVerified:true`, installed EXE canonical `79142d12…`, no `47900` listener, no game process after stop. The journal #67 server tests remain green (1207 pass / 0 fail).
- **Next (focused)**: server-trace the conn3 player-record resolution → fix DEFECT 1 (bind created char + deliver abilities) → re-verify live that the player is Reinhard AND 스폿 불명 clears (DEFECT 2 follows) → then promote `LOGH_WORLD_IMPORT_STATIC_BASE` + wire strategic-fleets 0x0325 + live-verify in-world HUD patch.

## Full opcode RE + server-data audit + chat/planet fixes (2026-06-28, journal #67)
- **Context**: user directives — RE ALL opcodes (command/proposal/orders/tactical-move), comprehensively check the data the server must provide + what's MISSING, and fix the world-entry defects incl. UI mismatch. Ran three background workflows (`logh7-opcode-full-re` 27 agents/3.3M tok, `logh7-server-data-audit` 10 agents/1.2M tok, `logh7-worldentry-defects`) and landed two verified server fixes.
- **Opcode reference (NEW doc `docs/logh7-opcode-reference-2026-06-28.md`)**: all 13 families RE'd with redex re-verification + many opcode-index naming corrections. Key: **0x0b01 = CommandMoveGrid** (not "SelectGrid") → 0x0b07 NotifyMovedGrid, REAL handler `command-engine.mjs:447`; 0x0b00/02/03/04/05/06 are REAL logistics handlers (`logh7-logistics.mjs`); 0x04xx combat / 0x07xx personnel / 0x09xx strategy-plan / 0x0cxx logistics are nearly all REAL handlers. **제안/進言/提案 system located**: tactical **0x0408 CommandSuggestion** (`battle-ops.mjs:878`, resp 0x0430 dead/unwired) + order-mail **0x0f13/0x0f14 CommandOrderSuggestMail** (`social.mjs:47`) → 0x0f15 NotifyCommandMail. Gaps: 0x0410 CommandEvacuateTroops not authoritatively handled (P2); 0x0430 ResponseSuggestion unwired (P3).
- **Server-data audit (NEW doc `docs/logh7-server-data-audit-2026-06-28.md`)**: 9 domains, content↔delivery↔gaps. Highest-value DELIVERY gaps (server HAS data, doesn't send): planet 0x031d static-name push (DEFECT 2), player-record binding (DEFECT 1), strategic fleets 0x0325 (24 held, 1 sent), ship master 0x030b (63 held, gated off), static catalogs 0x030d/0f/11/09/07 (builders exist, unwired — but arms/fighters/troop/power CONTENT not recovered → keep empty, no fabrication), galaxy grid 0x0313/0x0315 (real grid blocked by a client run-once snapshot race → needs a client binary patch). CONTENT gaps (do not fabricate): arms/fighter/troop/power tables, per-planet economy scalars (P3), card factory-id map, officer stats (P2), faces (only 12 P0).
- **FIX 1 — chat 0x0f1c GridChat endianness (verified)**: `parseInboundChat` read time/chars BE while the client serializes LE and the server's own `buildCommandGridChatInner`/SpotChat sibling use LE → Korean chat was byte-swapped to mojibake (low-ASCII hid it; the BE test fixture was self-consistent). Fixed `command-engine.mjs:259/266` BE→LE, fixed the test fixture to LE, added a Korean ('안녕하세요 은하제국') round-trip regression test that fails under the old BE parser. `node --test logh7-command-engine.test.mjs` 32/32.
- **FIX 2 — planet panel "스폿 불명" / DEFECT 2 (verified, gated)**: precise root (worldentry investigator) — the base panel `FUN_0057aa90` reads names from the static table fed ONLY by 0x031d, which is emitted ONLY on the on-demand 0x031c PULL, not in the world-import PUSH → empty until pulled (NOT a flag/planetless issue; `LOGH_PLANET_BASE_RECORDS` is already default-ON no-op). Factored the PULL's base-list into `staticBaseListForSpot()` and added a gated 0x031d push to `worldImportBaseSourceInners()` (gate `LOGH_WORLD_IMPORT_STATIC_BASE`, default OFF until live-verified for no early-walk stall). Regression test asserts the world-import push leads with a real 0x031d. `node --test logh7-login-session.test.mjs` 130/130.
- **Verification**: full `cd server; node --test tests/server/*.test.mjs` passed **1207 pass / 18 skipped / 0 fail** after both fixes. (The worldentry-defects player-emperor investigator did not emit a structured result; DEFECT 1 root cause is taken from the 4-domain data-audit consensus.)
- **DEFECT 1 (player=황제) — pinned, NOT yet fixed**: conn3 world session has `generatedCharacterId=0`; with no `LOGH_ACCOUNT_DB` (live uses `LOGH_ACCEPT_ANY_GIN7`) the created char isn't carried → `hasRealPlayerChar()` false → `activeCharacterId()` falls to `worldCharId()=1` = Friedrich IV (황제); world-entry 0x0323 also omits abilities (stats 0). Fix plan: thread created/charged char id into the conn3 session (+persist accounts in the live path) and deliver real abilities on the world-entry 0x0323; keep title:null. Needs live verification.
- **UI mismatch (user: "UI가 안맞는것도 해결") — pinned, needs live**: only the LOBBY is remastered in DEFAULT_STACK; in-world HUD builders (soukan FUN_005123b0 / officer FUN_004ff3c0 / base-planet FUN_0051ca30) still use 1024-class immediates on the 1920 canvas. The `soukan-hud-native-layout.json` patch (verifiedFlag:false) is the candidate; promote to DEFAULT_STACK only after a live world shot confirms fit (confirm config-native world resolution first to avoid the 640-trap). exe/window*.dat are NOT layout sources (runtime heap dumps).
- **Next**: (1) implement DEFECT 1 player binding + test + live-verify; (2) live-verify DEFECT 2 (`LOGH_WORLD_IMPORT_STATIC_BASE=1`: panel paints names, no stall) → promote to defaults; (3) wire strategic-fleets 0x0325 full table; (4) live-verify in-world HUD patch and promote; (5) live-verify Korean chat round-trip with two clients/harness.

## Live world-entry defects confirmed: player=Emperor placeholder, planet panel "스폿 불명", UI audit (2026-06-28, journal #66)
- **Context**: with live unblocked (#65), the user reported three defects to fix and corrected #65's stability claim (the run-A close was a USER-initiated window close, not a flag-induced socket-error — #65 stability finding retracted). Drove a fresh stable live session (canonical EXE, §A flags + `LOGH_PLANET_BASE_RECORDS=1` + `LOGH_BASE_ECONOMY=1`) to world entry and captured cropped full-res HUD evidence; stopped clean (EXE SHA canonical restored).
- **DEFECT 1 — player enters as Emperor placeholder, not the created character (P0)**: bottom-left commander panel reads **"황 제" (Emperor)** with all leadership stats ZERO (체력 100, PCP 1200, MCP 0, 항속 0, 통솔/정치/운영/정보 = 0). The just-created character (empire, Lohengram Reinhard) is NOT bound as the in-world player; the world entry shows the faction-leader/default placeholder with empty stats. This is the headline gameplay bug now that world entry works. Root-cause RE in progress (Workflow `logh7-worldentry-defects`): server player-record seeding vs created-char id threading vs client current-char slot default.
- **DEFECT 2 — planet data not delivered/rendered (P0)**: bottom-right "행성/요새 궤도상" (planet/fortress orbit) panel shows **"스폿 불명" (spot unknown)** for the current system 발할라(Valhalla, imperial capital). Trace had `0x031c:1 0x031d:1 0x031f:1` (base records sent once) even with the planet/base flags on, but the planet/orbit panel stayed empty. So either the records are for the wrong target/empty, or the "spot" panel needs a different record than 0x031d/0x031f. Root-cause RE in progress.
- **DEFECT 3 — UI position audit (P1)**: HUD renders at 1920×1080 native with bottom-left portrait panel, bottom-center circular minimap (X.Y readout + zoom), bottom-right command+info panel; Korean localization renders correctly (황제/체력/발할라성계/행성·요새 궤도상). The user wants UI element positions re-checked against the reference catalog. Layout-source survey in progress.
- **Evidence**: session `.omo/ui-explorer/session-live-defects-20260628` shots `024-world.png` (galaxy grid map) + full-res crops of the BL portrait (황제, stats 0), BR command panel (행성/요새 궤도상 → 스폿 불명, 발할라성계), BC minimap. Trace markers: world entry `0x0f02/0x0313×2/0x0323×26/0x0325×2/0x031c/0x031d/0x031f/0x0356`.
- **Next**: implement evidence-justified fixes from the Workflow synthesis — bind the created character as the in-world player (DEFECT 1), deliver real planet/orbit data for systems that have planets without fabricating planetless data (DEFECT 2), and a UI-position checklist (DEFECT 3) — then live re-verify each on the canonical EXE.

## ★★★★★ OS App Control UNBLOCKED — live world entry reproduced on canonical EXE (2026-06-28, journal #65)
- **Headline**: the Windows Application Control / Smart App Control block on the canonical `G7MTClient.exe` (the #1 project blocker since journals #48–#52) is now LIFTED. `LOGH7Launcher.exe --client-preflight` returns **exit 0** (was exit 1 + Smart App Control message). The entire live-gated completion path is unblocked again. The user confirmed they cleared the OS block.
- **Live world entry (canonical EXE, SHA `79142d12290c3956f79dd38774bc809c21913a228ae9928bf77ef9486cd895df`), reproduced TWICE**: windowed `ui_explorer start --server-root ../server --port 47900` → splash cleared → lobby → `create-character` (signup→login→character→session-select) → world entry. Trace markers: `0x7000`→`0x0020`→`0x2000..0x2006`→`0x2009/0x200a`→`0x0200/0x0201/0x0204`→`0x1008`×10→`0x0f00..0x0f07`(world init)→`0x0300..0x031f`(info/grid/base)→`0x0313`×2/`0x0315`(grid markers)→`0x0323`×26(character cards)→`0x0325`×2(unit table)→`0x031c/0x031d/0x031f/0x0321`(base/economy/institution)→`0x0356`(action list)→`0x033b`(tactics UnitShip, generic-walker-answered — cross-confirms #61/#63). Screenshots: run A `024-after-create.png` = strategic SYSTEM view (sun + orbital planets + full HUD); run B `024-world-stable.png` = galaxy STRATEGIC GRID map (multiple star systems on the sector grid + HUD). Canvas is 1920×1080 native (PNG 1924×1084).
- **Stability finding RETRACTED (user correction)**: journal #65's first draft claimed the run-A post-world `socket-error`/`close hadError:true` was caused by the skill's heavier flag set (`LOGH_STRAT_GRID_EARLY`/`LOGH_POSTLOAD_PLAYER_RECORD`/`LOGH_FULL_UNIT_LOCATION`). That is WRONG — the user manually closed the client after viewing the world, so the `hadError:true` close was a user-initiated window close, not a flag-induced ECONNRESET. No flag-stability conclusion should be drawn from run A. Both runs reached world entry; the flag-set difference is not evidenced as a stability factor. (Run B used the leaner §A set and reached the galaxy grid map; that remains a fine flag set, but not because the heavier set is unstable.)
- **C002 status on the unblocked EXE — still blocked, reproduced**: on the live galaxy grid map, natural star clicks **pan the camera** (map scrolled, star positions shifted between `024` and `026` shots) and produced **no wire opcodes** — `0x0b01: 0`, `0x0b07: 0`, and not even `0x0f08/0x0f09` for those clicks. This matches journals #54–#61 ("자연 클릭은 카메라 팬/정보 트래픽만, SelectGrid 선택자 `0x003b`→`0x0b01` 미도달"). Blind clicking will not crack C002; the decisive next step is the instrumented frida-watcher chain (HUD admission / SelectGrid / `FUN_005015f0` / `FUN_005751b0` / `FUN_004f9600` / `FUN_005737d0`) now runnable against the live unblocked client.
- **Cleanup/verification**: both live sessions `stop`ped with `shaVerified: true`; final state has no `47900` listener, no `G7MTClient`/`G7Start` process, and both installed trees' EXE remain canonical SHA. No blanket `node.exe` kill used.
- **Project-state shift**: the standing "live is OS-blocked" caveat in journals #48–#64 is now OUTDATED — live verification is available. The previously deferred EXE-gated items (live C002 proof, font/visual A/B, fullscreen pillarbox, tactical data population) are approachable again. Next live frontier: C002 via watcher instrumentation (not blind clicks), using the stable §A flag set.

## Strat persistence verification boundary CLOSED — EXE-free integration test (2026-06-28, journal #64)
- **Context/actions**: journal #62 left the auth-server-level strat persistence round-trip as an EXE-gated verification boundary (code-confirmed but not runtime-exercised, because the strat-in-auth-server tests `skip` when the client EXE fixture is absent). This cycle probed whether that gate is actually required and found it is NOT: the strat sim boots without the real EXE (codec tables resolve from committed JSON; the galaxy comes from the content DB). So the boundary can be — and now is — closed by a runnable integration test.
- **Probe result (no real EXE)**: booting `startLogh7AuthServer` with `process.env.LOGH_STRAT_SIM=1` + relay/auth/contentDb via `loadConfig` yields `stratSimEnabled=true` and 12 default strat fleets. After 10 `stratTickOnce()` calls a fleet moved アイゼンヘルツ→シヴァ; `persist()` wrote `entities.strat.fleets` (12) + `tickNo=10`; a reboot from the same in-memory repository restored `stratTickNo=10` and the moved fleet at シヴァ (not home). Root cause the existing strat tests are EXE-gated: convention/caution, not a real strat dependency (and `stratSimEnabled` reads `process.env.LOGH_STRAT_SIM` directly — not yet migrated to structured config — so it must be set as an env var, not via the config object).
- **New integration test (runs here, not skipped)**: `server/tests/server/logh7-auth-server.test.mjs` adds "per-session strategic persistence: strat fleets + tick survive a restart for default AND session 2 (journal #62, EXE-free)". It boots strat (no EXE), creates a session-2 runtime, advances BOTH via `tickAllStrategicRuntimes()` until each has a fleet off home, `persist()`, asserts default strat is at top-level `entities.strat.{fleets,tickNo}` and session 2 strat is under `sessions[].entities.strat.fleets`, then reboots from the same repo and asserts both runtimes' moved fleets resume at their mid-war systems (≠ home) and the default `stratTickNo` is restored. It saves/restores `process.env.LOGH_STRAT_SIM` in `finally`.
- **Verification**: focused new test passed 1/1. Full `cd server; node --test tests/server/*.test.mjs` passed **1223 total / 1205 pass / 18 skipped / 0 fail**. The journal #62 "EXE-gated verification boundary" for auth-server strat persistence is now runtime-verified and removed; the SIM-level unit test (#62) plus this auth-server integration test together cover the full round-trip.
- **Note**: the 18 remaining skips are other genuinely EXE-dependent tests (real-client frame fixtures), unrelated to strat persistence.

## Tactical UnitShip (0x033a/0x033b) static layout confirmed via redex (2026-06-28, journal #63)
- **Context/actions**: continued the goal's "계속 RE" on the cycle #61/#62 recommended next item — the tactical `0x033a→0x033b` family — without launching the live client (OS-blocked). Used `cd RE && python -m tools.logh7_redex` (static Ghidra decompile index) to confirm the record layout the existing generic zero-fill walker leaves empty. No server code change: per the no-fabrication policy, field values are not promoted to defaults until RE-labeled or live-confirmed.
- **Request 0x033a RequestTacticsInformationUnitShip**: u16 count + ship-id list, id count capped at 600 (`Output_RequestTacticsInformationUnitShip::get_length] id_size[%d] is over than 600`, strings @0x0076275c/0x007627b4; builder `FUN_0040cba0`).
- **Response 0x033b ResponseTacticsInformationUnitShip**: parser `FUN_00421f80` (`Input_ResponseTacticsInformation...`, count gate `*param_1 < 0x259` = ≤600). Record stride `0x1a` ushort = **52 bytes**. Arithmetic cross-check: 4 (header) + 600×52 = 31204 = **0x79e4** = `WORLD_RESPONSE_OBJECT_SIZES[0x033b]` (`server/src/server/logh7-login-protocol.mjs:1596`) — exact match confirms record size + 600 cap. Per-record fields (vtable readers, semantics unlabeled = P2): three `vtable+0x1c` wide-int reads, eight `vtable+0xc` narrow-int reads, three `FUN_00610420(...,1,0,2)` byte/packed reads; name field (≤13 units) appears in the Static sibling parser (`Input_StaticInformationUnitShip ... name_size over than 13`).
- **Siblings**: same dispatch `FUN_004ba2b0`, parsers `FUN_00422190`/`FUN_00422620` → ResponseTacticsInformationUnitTroop (0x033f=0x8ca4), Corps, etc. — extendable by the same method.
- **Verification**: redex output is the evidence; the binding cross-check is the byte arithmetic matching the committed `WORLD_RESPONSE_OBJECT_SIZES[0x033b]=0x79e4` (4 + 600×52). Pure static RE-finding cycle — no maker code change, so no separate verifier pass; the size-table match self-validates the structural claim. Field semantics remain P2 (structure HIGH, labels pending).
- **Doc**: `docs/logh7-opcode-coverage-crossmap-2026-06-28.md` 부록 A.
- **Next (live-gated)**: confirm the 52-byte record's field semantics (shipId/HP/position/owner...) via live trace or further label-RE, then build a non-empty 0x033b from battle-engine seeded ships and live-verify the tactical unit panel paints (P0-08). Until live is unblocked, keep 0x033b as the generic zero-fill (current behavior); do not guess field values into server defaults.

## Strategic sim per-session persistence (2026-06-28, journal #62)
- **Context/actions**: closed journal #60's stated remaining gap — strat sim internal state was not part of the snapshot, so a restart re-seeded strategic fleets at their HOME systems, losing mid-war fleet positions even though conquered system ownership persisted in worldState. Server-only patch; live client not launched (OS-blocked).
- **Sim capability (verified)**: `server/src/server/logh7-strategic-sim.mjs` `createStrategicSim` now accepts `opts.restoreFleets` — when present it rebuilds `simState.fleetsById` from the saved fleets (rebuilding each `profile` via `behaviorProfile(stats)` since the sim is `(baseSeed,tickNo,fleetId)`-deterministic with no hidden RNG state) and SKIPS `seedStrategicFleets`, so it does not re-place fleets at home or re-upsert worldState fleets (the caller's worldState restore owns positions). Added `serialize()` returning `{fleets}` with the rebuildable `profile` stripped.
- **Auth-server wiring**: `createRuntimeStrat(ws,{trace,restoreFleets})` threads restore through; the default runtime loads `snapshot.entities.strat.{fleets,tickNo}` and restores (incl. `stratTickNo`); the per-session restore block (from #60) replaces `runtime.strat` from `row.entities.strat.fleets` AFTER `worldState.restore(row.world)` (so the rebuilt graph reflects restored ownership) and restores `runtime.stratTickNo`; `buildRuntimeSnapshot` now adds `entities.strat = {...serialize(), tickNo}` only when `stratSimEnabled && runtime.strat` (so the dirty-check tests with `loadConfig({})` still see `entities:null`).
- **Regression test (verified here)**: `server/tests/server/logh7-strategic-sim.test.mjs` adds "serialize/restore: keeps mid-war fleet positions (no home reset), rebuilds profile, skips seeder (journal #60)". It advances a 12-tick war, serializes, restores into a fresh world+sim, and asserts: serialize drops `profile`; `seedResult === null` (no home seeder); `worldState.fleetCount()` unchanged (no re-seed); a moved fleet keeps its mid-war `system`/`strength`/`order` (≠ home); every fleet round-trips exactly minus profile; profile is rebuilt (`typeof profile.aggression === 'number'`); the restored sim ticks without throwing.
- **Verification**: `cd server; node --check` on strategic-sim + auth-server passed. Focused new test passed 1/1. Full `cd server; node --test tests/server/*.test.mjs` passed **1222 total / 1204 pass / 18 skipped / 0 fail**. Independent `logh7-loop-verifier` (read-only, no client) returned **OVERALL PASS — all four claims CONFIRMED** (serialize/restore field symmetry, no home-reset/no double-seed with world-before-strat ordering, backward-compat dirty-check preserved, no regression).
- **Verification boundary (honest)**: the SIM-level serialize/restore is fully unit-verified here. The auth-server-level strat persistence round-trip (boot → war ticks → persist → reboot restores fleet positions) is **EXE-gated** — the strat-in-auth-server tests `skip` when the client EXE fixture is absent (this env), so that end-to-end path is code-confirmed (verifier) but not runtime-exercised here. Re-run with the EXE present (or once live is unblocked) to runtime-verify the full server round-trip. This is a verification boundary, not a known failure.
- **Remaining**: strat persistence now covers fleet positions + tick counter per session. The monthly age-drift/promotion side effects are applied to worldState (persisted) so they survive; only the deterministic-from-seed sim internals (no extra state) are intentionally not stored. Live C002 interactive proof remains the separate OS-blocked blocker.

## Opcode coverage cross-map: inbound/handling/outbound verified complete (2026-06-28, journal #61)
- **Context/actions**: continued the standing goal "opcode 전체와 수신/송신/처리 로직 전부 확인" without launching the live client (canonical EXE still OS-blocked). Cross-checked the client's full send-side opcode set (`.omo/ghidra/opcode-index.json` `normalizedOutboundRoutes`, 127 routes, from journals #56/#57) against the actual server receive/dispatch/build implementation in `server/src/server/*.mjs`. Two read-only subagents (`logh7-loop-explorer`) were used for independent mapping; their report files came back empty (these custom agents do not surface inline output in this harness), so the binding evidence is the reproducible diff + file:line citations gathered directly.
- **Method (reproducible)**: extracted all 127 `requestInternalHex` (client send → server receive) + paired `pairedResponseInternalHex`, then diffed against every opcode literal `0x0200..0x2100` appearing in `server/src/server/*.mjs`. 113/127 request codes appear as literals; 14 do not. Each of the 14's paired response (req+1) was checked against `WORLD_RESPONSE_OBJECT_SIZES` (`logh7-login-protocol.mjs:1592`).
- **Inbound/handling verdict — zero hang-risk handler gaps**: the conn3 world-data handler ends in a sized generic walker `buildWorldDataResponseInner(innerCode+1)` (`logh7-login-session.mjs:2418`; builder `logh7-login-protocol.mjs:1644`) that returns a correctly-sized zero-fill object whenever `req+1` is in the size table (status byte 1 for `WORLD_OK_STATUS_CODES` `{0x0f01,0x0f03,0x0317}`). 13 of the 14 unreferenced requests have their `req+1` in the size table → answered (empty panel, not a hang). The 14th, `0x7000` (GIN7 credential login), is handled by a dedicated early-return auth path; its `0x7001` is intentionally not emitted on the lobby (byte-verified inert, `logh7-login-session.mjs:2415~2418`). So **no client request opcode stalls**; receive/dispatch coverage is structurally complete.
- **Outbound verdict — 2 unbuilt responses, neither load-bearing**: of 54 paired responses, only `0x7001` (intentionally inert) and `0x0430` (NotifyUnknown0430, no confirmed server trigger, P3) are never built. All core notifies/responses (0x0201, 0x0323, 0x0325, 0x031d/0x031f, 0x0b07, ...) have explicit builders.
- **Reframing**: the 13 walker-answered requests are NOT unimplemented handlers — they are intentionally-empty data panels (the no-fabrication policy: real per-opcode data is filled only when RE-confirmed + live-verified). Named ones of interest: `0x033a RequestTacticsInformationUnitShip → 0x033b` (0x79e4), `0x0348 RequestTacticsCharacter → 0x0349` (0x2ee4), `0x0316 RequestStaticInformationGridSelector → 0x0317`. Tactical family ties to P0-08.
- **Doc**: full table + provenance + next-item analysis written to `docs/logh7-opcode-coverage-crossmap-2026-06-28.md`. This advances the §G RE-coverage matrix goal for the protocol layer (converts ad-hoc opcode hunting into a reproducible cross-map).
- **No code change this cycle**: the evidence shows no safe server change is justified — every client request is already handled, and populating the empty tactical/info panels requires RE-confirmed record layouts + live verification (live currently OS-blocked), and must not be promoted to default with guessed data.
- **Recommended next item (`next`)**: when live is unblocked, RE-confirm the `0x033b` (RequestTacticsInformationUnitShip, size 0x79e4) record layout via redex (`FUN_004b8b00` sizer + parser/consumer) and build a non-empty response from the battle-engine seeded ships (0x0337 ResponseTacticsCharacter builder already exists at `logh7-battle-engine.mjs:51`), then live-verify the tactical unit panel paints. Until then, advance only the static redex layout, not server defaults.

## Per-session timers + snapshot persistence (2026-06-28, journal #60)
- **Context/actions**: continued journal #59's `sessionId -> runtime` registry without launching the live client (canonical EXE still OS-blocked; this is a synthetic-test server patch). #59 isolated `worldState`/`worldRelay`/`economyState` per session but left `economyTickOnce`, `stratTickOnce`, admin snapshot, and `persist()` describing/advancing only the default (session 1) runtime. This entry closes exactly that gap.
- **Per-session strategic timer**: moved strat config (`LOGH_STRAT_SIM`/interval/seed/coup) above the registry and added `createRuntimeStrat(worldState)` so each runtime owns its own strat sim. `runStrategicTickOnce` was parameterized into `tickStrategicRuntime(runtime, {force})`; the scheduler is now `tickAllStrategicRuntimes()` which ticks every runtime and stops the interval only when ALL runtimes are over (`maybeStopStratInterval`). A runtime that reaches §1.6 ending is marked `stratOver` and skipped by the scheduler, but `force:true` (manual `stratTickOnce`/test hooks) still ticks it — preserving the old single-runtime behavior where manual ticks continued past ending.
- **Per-session economy timer**: `runEconomyTickOnce` parameterized into `tickEconomyRuntime(runtime)`; the scheduler is now `tickAllEconomyRuntimes()`. Turn advance, decisive-victory eval, and operation-issue lifecycle all use the runtime's own `worldState`/`economyState`. Default (session 1) `economyTickOnce()` unchanged for the existing contract.
- **Per-session snapshot persistence**: `composeSnapshot` gained an optional `sessions` field. `saveSnapshot()` now serializes session 1 at top-level `world`/`entities` (backward compatible with existing restore) and session 2+ under `sessions[{ sessionId, world, entities }]`. `currentRevision()` composites all runtime revisions (any session's mutation wakes persistence) and still only calls `.revision()` (idle fast-gate stays O(1), never `toSnapshot`). On boot, after the registry is built, `snapshot.sessions` rows are restored into their runtimes (created lazily + seeded, then `restore()` overwrites the seed, mirroring the default path).
- **Admin snapshot**: `buildAdminSessionSnapshot` now takes `sessionRuntimes` and emits a `sessions[]` summary (per-runtime connections/players/ships/fleets/systems/turn/economy/strategicActive) plus `counts.sessionRuntimes`. Default `world`/`economy`/`counts` unchanged.
- **Exposed test hooks**: `stratTickOnceForSession(id)`, `economyTickOnceForSession(id)`, `tickAllStrategicRuntimes`, `tickAllEconomyRuntimes` added to the returned server object (internal test/diagnostic surface, no client wire change).
- **Regression test**: `server/tests/server/logh7-auth-server.test.mjs` adds "per-session timers + snapshot persistence: economy ticks every session runtime and persist/restore round-trips session rows". With a shared in-memory repository it asserts (1) `tickAllEconomyRuntimes()` advances both session 1 and session 2 turns, (2) `persist()` writes a session-2 row carrying a session-2-only fleet that is absent from the top-level default row, and (3) a fresh boot from the same repository restores the session-2 runtime + fleet while the default runtime does not have it.
- **Verification**: `cd server; node --check src/server/logh7-auth-server.mjs` and `node --check src/server/logh7-repository.mjs` passed. Focused `node --test tests/server/logh7-repository.test.mjs tests/server/logh7-auth-server.test.mjs` passed (33 pass / 15 skipped — skips are the client-EXE-gated tests, EXE absent in this env). Full `cd server; node --test tests/server/*.test.mjs` passed **1221 total / 1203 pass / 18 skipped / 0 fail**. An independent read-only `logh7-loop-verifier` (separate checker pass, did not launch the client) challenged the four claims and returned **PASS — all four CONFIRMED** (per-session economy timer, per-session strategic timer, per-session snapshot persistence, no-regression/backward-compat incl. the O(1) idle revision gate not calling `toSnapshot`).
- **Remaining gap**: strat sim internal state still is not part of the snapshot (only world+economy persist; strat re-seeds on boot) — same as the default runtime before this patch, so per-session parity is maintained but full strat persistence is still open. The scheduler does not auto-restart if it stopped because all runtimes ended and a new session is then created (extreme edge, opt-in only). Live client-originated `0x0b01` interactive C002 proof remains the separate blocker, unaffected by this server-substrate work.

## Session runtime registry first split (2026-06-28, journal #59)
- **Context/actions**: continued the server-side multiplayer/CQRS track without launching the live client. Rechecked `server/src/server/logh7-auth-server.mjs` and confirmed the pre-existing split: lobby session catalog/selection exists, but authoritative `worldState`, `worldRelay`, economy, strategic sim, and persistence were still default-process global.
- **Runtime registry added**: `server/src/server/logh7-auth-server.mjs` now creates a `sessionId -> runtime` registry. Each runtime owns a distinct `{ worldState, worldRelay, economyState }`. Session `1` keeps the existing default objects for compatibility; session `2+` are created lazily with the same authoritative content/scenario seed helper.
- **Connection routing**: TCP connections now choose `activeRuntime` from the bound account's selected session. The relay registration, multiplayer fleet sync, nation reconciliation, authoritative command processing, relay broadcast/test path, and close/unregister cleanup now use the active runtime's `worldState`/`worldRelay` instead of always using the process-global defaults. This is the first concrete step toward real session-isolated multiplayer instead of one shared global room.
- **Test surface**: the returned auth-server object exposes `runtimeForSession`, `runtimeForAccount`, and `sessionRuntimes` for deterministic server tests. This is an internal test/diagnostic surface, not a client wire change.
- **Regression test**: `server/tests/server/logh7-auth-server.test.mjs` adds `auth server keeps authoritative world runtimes isolated per lobby session id`. It asserts session 1 and session 2 have different world/relay/economy objects, `runtimeForAccount()` follows the account-selected session, and a fleet inserted into session 2 is absent from session 1.
- **Verification**: `cd server; node --check src\server\logh7-auth-server.mjs` passed. `node --test --test-name-pattern "world runtimes isolated" tests\server\logh7-auth-server.test.mjs` passed 1/1. Full `node --test tests\server\logh7-auth-server.test.mjs` passed 26/26 with 15 skipped because the local client EXE fixture is absent from that test environment.
- **Remaining gap**: this is not the full CQRS/session-runtime completion. Default `economyTickOnce`, `stratTickOnce`, admin snapshot, and `persist()` still describe/save the default runtime; per-session timers and per-session snapshot rows remain the next server patch.

## Lobby 0x2009 closed/missing session redirect guard (2026-06-28, journal #58)
- **Context/actions**: after the C002 callsite pass, inspected the canonical server path for proper multiplayer/session behavior without launching the live client. The audit confirmed the larger remaining design issue: `startLogh7AuthServer` still creates one process-global `worldState`, `worldRelay`, economy loop, and strategic loop, while the lobby session catalog/account selected-session state already exists.
- **Small server fix before runtime split**: tightened `server/src/server/logh7-login-session.mjs` `0x2009` handling. A requested open session is still accepted, persisted to the account registry, and routed to its `worldBySession` endpoint. A requested closed or missing session now keeps the requested id in trace, but resolves the actual `0x200a` world redirect to the persisted open session or first open catalog session instead of falling through to an arbitrary default endpoint.
- **Trace contract**: `0x2009` actions now include `selectedSessionId` (requested id), `resolvedSessionId` (actual open session used for redirect), `sessionAccepted`, and `sessionReject` (`closed-session` / `missing-session`). This preserves old diagnostics while making the effective route explicit.
- **Tests updated**: `server/tests/server/logh7-login-session.test.mjs` now asserts that closed session `2` and missing session `9` are not persisted and do not route to their supplied `worldBySession` endpoints; both fall back to open session `1`.
- **Verification**: `cd server; node --check src\server\logh7-login-session.mjs` passed. `node --test --test-name-pattern "0x2009" tests\server\logh7-login-session.test.mjs` passed 5/5. Full `node --test tests\server\logh7-login-session.test.mjs` passed 129/129. `node --test tests\server\logh7-auth-server.test.mjs` passed 25/25 with 15 skipped because the local client EXE fixture is absent from that test environment.
- **Current implication**: session selection is less fake, but proper multiplayer still requires the next larger patch: `sessionId -> runtime` isolation for `worldState`, `worldRelay`, economy state, strategic timers, and snapshot persistence. This entry deliberately does not claim that larger runtime split is complete.

## C002 outbound callsite map + planetless-system rule reaffirmed (2026-06-28, journal #57)
- **Context/actions**: continued the standing roadmap/RE loop without launching the live client. Answered the user's correction that planetless star systems can exist and reaffirmed journal #55: a strategic system/cell can be valid without planet rows; only systems with content-backed planets/fortresses should be expected to populate `0x031d/0x031f` planet/base records.
- **Raw callsite mapper**: extended `RE/tools/logh7_opcode_index.py` so the normalized opcode index no longer stops at the `FUN_004b78a0` selector table. It now scans direct raw x86 `call 0x004b78a0` sites from the redex function export, reads the newest immediate `push` args before each call, and records caller function, call VA, mode arg, selector arg, payload operand, and joined request/response route.
- **C002 callsite proof**: generated `.omo\ghidra\opcode-index.json` now reports 105 outbound callsites and 103 selector-resolved callsites. C002 is exactly `FUN_004b48d0 @ 0x004b490e` with newest pushes `1`, `0x3b`, `eax`: queued mode, selector `0x003b`, payload `eax`, request `0x0b01`, paired response `0x0b07`, target `0x004b7ed0`, gate `client+0x35837e`.
- **Off-by-one cleanup**: pinned the nearby confusion as a regression test: `FUN_004b4600 @ 0x004b4642` pushes selector `0x003a`, but that route is request `0x0412`, not C002. Updated `RE/tools/logh7_selectgrid_state_watch.py` labels so `0x30` remains the observed info path, `0x3a` is a non-C002 selector, and `0x3b` is the SelectGrid move route.
- **Docs updated**: `docs/logh7-c002-admission-discriminator-2026-06-28.md` now corrects the old selector wording and adds the outbound callsite-map follow-up. Older journal prose that says "case 0x3a" should be read as "case index 0x3a / selector 0x3b" unless a newer static tool output says otherwise.
- **Verification**: `cd RE; python -m py_compile tools\logh7_opcode_index.py tools\logh7_outbound_request_dispatch.py tools\logh7_selectgrid_state_watch.py tools\logh7_pipeline.py` passed. `python -m unittest tools.tests.test_logh7_opcode_index tools.tests.test_logh7_outbound_request_dispatch tools.tests.test_logh7_selectgrid_state_watch tools.tests.test_logh7_inbound_response_dispatch tools.tests.test_logh7_disasm_range` passed 18/18. `python tools\logh7_pipeline.py opcode-index .omo\ghidra\bin\G7MTClient.exe --out .omo\ghidra\opcode-index.json` regenerated the normalized index.
- **Current implication**: the next C002 RE step is no longer to ask which selector sends `0x0b01`; it is to trace why the natural UI path does not reach `FUN_004b48d0` / selector `0x003b`. The next server/world-data step must keep planetless systems valid while separately verifying marker/grid data and planet/base records for systems that actually have planets or fortresses.

## Outbound opcode spine + normalized opcode index (2026-06-28, journal #56)
- **Context/actions**: continued the full-doc/roadmap-driven goal without launching the live client. Re-read the active RE/wire/patch/live skills and current roadmaps, then used two read-only subagents: one audited opcode/route tooling, the other audited multiplayer/session/admin/CQRS server state. The opcode audit independently recommended a normalized `FUN_004b78a0` send-side index; the server audit identified session-scoped authoritative runtimes as the next high-value server-side multiplayer task.
- **New outbound index**: added `RE/tools/logh7_outbound_request_dispatch.py`. It disassembles `FUN_004b78a0`, reads the selector jump table at `0x004b864c`, records all 128 selector routes, and extracts request/paired-response internal codes, state gates, side effects, target VAs, and the queue layout (`client+0x357ec0` count, request at `client+0x357ec4 + index*0x0c`, response at `client+0x357ec8 + index*0x0c`).
- **C002 static proof**: the new send-side index pins C002 as selector `0x003b` / case index `0x003a`, target VA `0x004b7ed0`, request `0x0b01`, paired response `0x0b07`, gated by `client+0x35837e`. This is now tool output, not only prose in the C002 notes.
- **Normalized opcode index**: added `RE/tools/logh7_opcode_index.py` and pipeline command `opcode-index`. The first schema joins the outbound selector table, tracked inbound response dispatcher, transport dispatch subset, and message-family metadata into one JSON. Current coverage is explicit: 128 outbound selector routes, 7 tracked inbound responses, 9 tracked transport routes, 3 message families. Limitations are also explicit: full inbound case enumeration and `FUN_004b78a0` callsite-to-selector mapping remain pending.
- **Generated evidence**: `cd RE; python tools/logh7_pipeline.py opcode-index .omo\ghidra\bin\G7MTClient.exe --out .omo\ghidra\opcode-index.json` produced the normalized index. Its `c002Route` confirms `0x003b -> 0x0b01/0x0b07`.
- **Verification**: `cd RE; python -m py_compile tools/logh7_opcode_index.py tools/logh7_outbound_request_dispatch.py tools/logh7_pipeline.py` passed. `python -m unittest tools.tests.test_logh7_opcode_index tools.tests.test_logh7_outbound_request_dispatch` passed 7/7. Focused routing regression `python -m unittest tools.tests.test_logh7_opcode_index tools.tests.test_logh7_outbound_request_dispatch tools.tests.test_logh7_inbound_response_dispatch tools.tests.test_logh7_disasm_range` passed 14/14. Existing `tools/tests/test_logh7_transport_dispatch.py` passes when run directly; it fails under package-style `python -m unittest tools.tests.test_logh7_transport_dispatch` because that pre-existing test imports `test_logh7_pipeline` as a top-level module.
- **Server audit result**: proper multiplayer still needs session-scoped authoritative world runtimes. Current lobby sessions can be listed/selected/persisted, but auth-server still has one process-global `worldState`, `worldRelay`, economy loop, and snapshot stream. The recommended next server implementation is `sessionId -> { worldState, worldRelay, economyState, timers, repository }`, with per-session snapshot rows and closed/missing `0x2009` session selection rejection. This does not depend on solving C002 and should be tested with synthetic protocol/server assertions, not live mouse clicks.
- **Current implication**: the next RE task is no longer "find whether 0x0b01 exists"; it is "find which caller naturally reaches selector `0x003b` and why the UI admission path does not." The next server task is separate: isolate world runtimes per lobby session so multiplayer is not only a shared global room.

## Planetless system correction reaffirmed (2026-06-28, journal #55)
- **Context/actions**: answered the user's correction that some star systems can legitimately have no planets, then checked canonical `server/content/galaxy.json`, existing loop evidence, and the focused server regression test instead of treating a planetless selected-system view as a bug by default.
- **Content fact**: current canonical galaxy content has 80 systems, 281 planets, and 77 systems with planets. The three planetless systems in `server/content/galaxy.json` are `マローヴィア`, `フォルセティ`, and `イゼルローン` (the last has the fortress entry but no planet rows).
- **Diagnostic rule**: "no planet visible" is not a standalone failure. For a selected system, first classify the content row: if `system.planets.length === 0` and no fortress/derived base is expected, an empty planet list is valid. If the row has planets/fortresses, then verify the `0x031c -> 0x031d` static base response and `0x031e -> 0x031f` dynamic base/economy response before blaming the UI or renderer. Strategic-map presence itself remains a separate `0x0313/0x0315` marker/grid question.
- **Verification**: `cd server; node --test --test-name-pattern "planetless system" tests/server/logh7-login-session.test.mjs` passed 1/1. The test asserts both `0x031d` and `0x031f` do not fabricate a synthetic orbit-1 planet for a planetless system.
- **Current implication**: the "행성 없는 성계" correction is now part of the live/RE standard. Future C002 or world-data checks must distinguish legitimate planetless systems from missing planet/base projection.

## C002 state-block scanner + prompt authority cleanup (2026-06-28, journal #54)
- **Context/actions**: continued the user's standing request to read the loop state, docs, prompts, and reference context, document every action, use all available subagents, keep live proof on the real canonical game EXE, and avoid guessing. Re-read the active `logh7-re`, `logh7-live`, `logh7-wire`, `logh7-patch`, and `logh7-localize` skill instructions; re-read `AGENTS.md`, current roadmaps/session docs, live-test standard, and the C002 discriminator. No game client was launched in this pass.
- **Subagents used**: four read-only subagents audited docs/roadmaps, `.claude`/`.codex` prompts, multiplayer/session/admin persistence, and the C002 frontier. Combined result: current authorities are `AGENTS.md`, `docs/logh7-live-test-standard.md`, this loop state, and the 2026-06-27/28 C002 docs. Interactive MP remains blocked on real client-originated `0x0b01`; server-side MP state mutation is not enough. Session/account persistence exists but full CQRS remains coarse snapshot persistence. The prompt audit found stale instructions for blanket `node.exe` cleanup, root `tools`/`src/server` paths, and single-slot font assumptions.
- **C002 frontier decision**: stopped treating the next move as another HUD/event22 live click sweep. The highest-value non-live task is now the static producer search for the `0x009d2a30..0x009d2a80` state block, especially the missing `state+0x0c` (`DAT_009d2a3c`) and `state+0x10` (`DAT_009d2a40`) producers.
- **Static scanner implementation**: extended `RE/tools/logh7_disasm_range.py` beyond direct absolute xrefs. New CLI/API supports `--xref-range 0x009d2a30:+0x50`, `--access read|write|all`, `--all-functions --export RE/.omo/ghidra/export/G7MTClient`, function-context output, simple `mov/lea reg, imm` followed by `[reg+offset]` tracking, and `rep movs*` destination candidates. This is a candidate scanner, not proof-grade dataflow; results still need redex and live confirmation before promotion.
- **Inbound index integration**: `RE/tools/logh7_inbound_response_dispatch.py` now adds `stateBlockRange` and `stateBlockWriterCandidates` using the new scanner. The generated index records writer candidates alongside the decoded-response dispatch table so future opcode sweeps can see the C002 state-block frontier without rerunning ad hoc grep.
- **New RE finding**: running the scanner on the client found writer candidates within `0x009d2a30:+0x50`: `FUN_004c8b10` writes `state+0x01`, `FUN_004f9600` clears `state+0x44/0x4c`, `FUN_0058ee70` writes `state+0x3e`, and most importantly `FUN_005751b0` writes `state+0x44/0x4c` around `0xb01/0xb07` result handling. Redex confirms `FUN_004bee20` wraps `0x0b07` through `FUN_00517cd0(0xb07, body)`, while `FUN_005751b0` is the result-node path that tests/sets `DAT_009d2a7c`. The direct writer for `state+0x0c/0x10` is still not found.
- **Prompt cleanup**: updated `.claude` and `.codex` prompt/skill surfaces so future agents use `server/` and `RE/tools`, not stale root `src/server`/`tools`; live proof now names canonical SHA `79142d12290c3956f79dd38774bc809c21913a228ae9928bf77ef9486cd895df`, `RE/tools/logh7_ui_explorer.py`, `--server-root ..\server`, no blanket `node.exe` kill, no default `LOGH_PRESEED_PLAYER_CHAR`, and mandatory `stop`/`shaVerified:true`. Localization prompts now say two Pretendard face slots and UTF-16LE `.rsrc`, not a single global font or cp949 resources.
- **Docs updated**: `docs/logh7-c002-admission-discriminator-2026-06-28.md` now records the new `0x009d2a30` scanner result and narrows the missing static target to the producer of `state+0x0c/0x10`, with `FUN_005751b0` and `FUN_004f9600` as next positive-control hook candidates.
- **Verification**: `cd RE; python -m py_compile tools/logh7_disasm_range.py tools/logh7_inbound_response_dispatch.py` passed. `cd RE; python -m unittest tools.tests.test_logh7_disasm_range tools.tests.test_logh7_inbound_response_dispatch` passed 7/7. The scanner command `python tools/logh7_disasm_range.py .omo/ghidra/bin/G7MTClient.exe --range 0x00401000:+0x10 --xref-range 0x009d2a30:+0x50 --access write --all-functions --export .omo/ghidra/export/G7MTClient --json` produced 10 writer candidates including `FUN_005751b0 @ 0x00575248 -> 0x009d2a7c`.
- **Current implication**: the next live C002 run should hook `FUN_005751b0`, `FUN_004f9600`, `FUN_005737d0`, and the existing command-row/SelectGrid chain rather than repeating generic map clicks. A real completion claim still requires the canonical client to originate `0x0b01`, receive/apply `0x0b07`, mutate authoritative server state, and render the result.

## Planet/base record boundary + 0x0337 collision cleanup (2026-06-28, journal #53)
- **Context/actions**: continued from the user's "planetless systems can exist" correction and the ongoing request to document every action. Re-read the active `logh7-re`, `logh7-wire`, and `logh7-patch` skill instructions, inspected the current loop state, server/login code, launcher env, and live-test standard, then kept live execution deferred.
- **Planetless-system rule**: retained the new default `LOGH_PLANET_BASE_RECORDS=1` path for real content-backed planet/base records, but locked the boundary that a system with no `planets`/`fortresses` in content must not receive fabricated derived planet IDs. The server test `login session does not fabricate planet base records for a planetless system` verifies both static `0x031c -> 0x031d` and dynamic `0x031e -> 0x031f`.
- **0x0337 RE proof**: re-ran redex checks against the live client export. `FUN_004b8b00` sizes opcode `0x0337` as `0x964`, `FUN_004ba2b0` logs `ResponseTacticsCharacter_OK` and copies `0x259` dwords to `client+0x431ab4`, and `FUN_00421740` is `Input_ResponseTacticsCharacter`. `FUN_00438390` still parses `Input_NotifyBaseParameter`, but no dispatcher-pinned opcode was identified for it in this pass.
- **Server opcode fix**: stopped emitting the provisional `NotifyBaseParameter` builder on `0x0337` by default. `LOGH_BASE_ECONOMY` remains default-ON for the RE-confirmed `0x031f` economy arrays; only the scalar diagnostic builder is moved behind explicit `LOGH_PROVISIONAL_BASE_PARAMETER_NOTIFY=1`. Tests now assert default PUSH/PULL paths omit `0x0337`, opt-in paths can still build the diagnostic record, and `LOGH_BASE_ECONOMY=0` suppresses it even when the provisional gate is on.
- **Session/CQRS fix**: tightened `0x2009` selection persistence so the account DB is updated only when the selected session exists and is open. Redirect behavior remains conservative for client compatibility, but closed/missing session IDs no longer poison `selected_session_id`. Added coverage for successful open-session persistence and rejected closed/missing persistence.
- **Launcher/runtime state fix**: official `LOGH7Launcher.cs` now passes `--session-db <runtime>/state/lobby-sessions.sqlite` and `LOGH_SESSION_DB` alongside the existing account/world DB paths. `RE/tools/logh7_launch_config.py` documents `LOGH_SESSION_DB` as launcher-only, and launcher parity tests now require it.
- **Verification**: `node --check src/server/logh7-login-session.mjs src/server/logh7-base-economy.mjs src/server/logh7-config.mjs` passed from `server/`. `python -m py_compile tools/logh7_launch_config.py` passed from `RE/`. Focused server tests passed 141/141, then full `cd server; node --test tests/server/*.test.mjs` passed 1219 total / 1201 pass / 18 skipped / 0 fail. `cd RE; python -m unittest tools.tests.test_logh7_ui_explorer tools.tests.test_logh7_installed_tree` passed 38/38. Rebuilt the official installed launcher with `python -m tools.logh7_build_player_launcher`; root and RE installed game EXEs plus overlay playable EXE all still hash to canonical `79142d12290c3956f79dd38774bc809c21913a228ae9928bf77ef9486cd895df`, and copied launcher sources contain `--session-db`/`LOGH_SESSION_DB`.
- **Current implication**: do not chase "missing planets" by inventing planet records. Some systems are legitimately star/system-only in the strategic map. The next opcode sweep should find the real `NotifyBaseParameter` route before any live scalar-economy emission is promoted.

## Windowed sharp profile + authoritative 0x0b01 state mutation (2026-06-28, journal #52)
- **Context/actions**: continued the full audit requested by the user: re-read project authority docs/skills, used four read-only subagents for C002/MP, font/UI, canonical package parity, and docs/reference coverage, then kept live verification deferred because the canonical `G7MTClient.exe` is still blocked by Windows Application Control / Smart App Control before a game window exists.
- **Font/UI audit result**: the canonical installed and overlay game EXEs still carry the Pretendard face bytes in both known font slots, with Hangul charset and ClearType/antialias patches already present. The remaining blur was not treated as a missing font claim. The actionable package difference was dgVoodoo windowed presentation: active configs were still using `ScalingMode=stretched` and `Resampling=lanczos-3`, which can blur 2D UI and glyph edges in a windowed login/player flow.
- **Windowed display fix**: `RE/tools/logh7_ui_explorer.py` and `RE/tools/launcher/LOGH7Launcher.cs` now configure every windowed presentation (`windowed` and `borderless`) with `FullScreenMode=false`, `ScalingMode=centered`, `Resampling=pointsampled`, `Filtering=appdriven`, `Antialiasing=off`, `RTTexturesForceScaleAndMSAA=false`, and `SmoothedDepthSampling=false`. Plain `windowed` keeps `WindowedAttributes=` blank so the login window remains a normal bordered window. Borderless remains opt-in after login and still uses cursor clip auto.
- **Packaged runtime fix**: `RE/tools/logh7_player_runtime.py` now normalizes copied `dgVoodoo.conf` files to the same sharp windowed defaults during package rebuilds. This prevents the launcher/harness source fix from being overwritten by an old installed config.
- **Installed proof**: rebuilt both `RE/.omo/work/logh7-installed` and root `.omo/work/logh7-installed`. Both active `exe/dgVoodoo.conf` files now show `ScalingMode=centered`, `Resampling=pointsampled`, watermark off, blank `WindowedAttributes`, `Filtering=appdriven`, and `Antialiasing=off`. Both installed and overlay game EXEs remain canonical SHA `79142d12290c3956f79dd38774bc809c21913a228ae9928bf77ef9486cd895df`; the packaged runtime server still hashes to canonical `7735e3df1b06f65344e80cf2057b1c07c77170f55f569f25a9895044be018235`. Rebuilt launcher binary SHA is only a compile receipt: `3df706214b7e22556876f1aab3029c69b6ac63b1878f6e368ace539b4b7a60b3`.
- **MP server fix**: `server/src/server/logh7-command-engine.mjs` now mutates authoritative world state on inbound `0x0b01` by calling `state.moveFleet(unitId, destCell)` when a matching fleet exists, while preserving the existing ACK-to-self and `0x0b07 NotifyMovedGrid` broadcast behavior. This closes a server-side gap found by the C002/MP audit: before this entry, the real grid-move command could be acknowledged/broadcast without changing the server fleet cell. A strict `fleet.owner` rejection was not added yet because current `fleet.owner` values still mix faction/power ownership and connection ownership; the existing ship-owner gate remains the active anti-cross-player guard.
- **Docs/reference audit**: current authorities are `AGENTS.md`, this loop state, `docs/logh7-live-test-standard.md`, `docs/logh7-master-roadmap-2026-06-26.md`, `docs/logh7-session-2026-06-27-canonical-playable-c002-mp-font-audit.md`, `docs/logh7-reference-visual-catalog-2026-06-25.md`, and `docs/logh7-mp-roadmap-2026-06-23.md`. Stale docs identified for later cleanup include `docs/AGENTS.md`, `docs/SESSION-HANDOFF-2026-06-26.md`, `docs/logh7-remaster-roadmap-2026-06-26.md`, `docs/logh7-completion-matrix-2026-06-26-v2.md`, and old path notes in `docs/logh7-live-flow-plan-2026-06-26.md`. The actual reference image corpus is under `docs/reference/ui-catalog`, not the older `.omo/reference` wording; `gamemeca/en010.gif` is a placeholder and `en010.jpg` is the useful reference.
- **Verification**: `cd RE; python -m py_compile tools/logh7_player_runtime.py tools/logh7_ui_explorer.py tools/logh7_build_player_launcher.py` passed. `cd RE; python -m unittest tools.tests.test_logh7_ui_explorer tools.tests.test_logh7_installed_tree tools.tests.test_logh7_dgvoodoo_nowatermark` passed 39/39. `cd RE; python -m unittest tools.tests.test_logh7_ui_explorer tools.tests.test_logh7_installed_tree tools.tests.test_logh7_dgvoodoo_nowatermark tools.tests.test_logh7_client_exe` passed 47/47. `cd server; node --test tests/server/logh7-command-engine.test.mjs` passed 31/31. `cd server; node --test tests/server/logh7-world-relay.test.mjs tests/server/logh7-mp-fleet-visibility.test.mjs` passed 10/10. `cd server; node --test tests/server/*.test.mjs` passed with 1208 tests total, 1190 pass, 18 skipped, 0 fail. `RE/tools/tests/test_client_package_client.py` remains un-runnable in the current split repo because root `client/` is absent; this is existing restructure drift, not a regression from the display or MP patches.
- **Current implication**: no fresh live visual/font claim is made in this entry. Once OS policy permits the canonical game EXE, the next live run should compare official launcher windowed vs harness windowed using the same installed EXE and confirm whether `centered/pointsampled` removes the remaining blur. After that, resume C002 admission proof without `LOGH_PRESEED_PLAYER_CHAR` and verify real client-originated `0x0b01` changes server fleet state and remote client state.

## Launcher/harness env parity locked without treating launcher SHA as authority (2026-06-28, journal #51)
- **Purpose**: follow-up to #50 and subagent parity audit. The official launcher and `ui_explorer` should be equivalent where it matters for the real game path, while still allowing documented player-runtime-only and harness-only differences.
- **Launcher env alignment**: `RE/tools/launcher/LOGH7Launcher.cs` now sets `LOGH_POSTLOAD_PLAYER_RECORD=1` and `LOGH_SEED_CANON_NPCS=1` in the official player launcher path, matching the current harness standard for post-load player records and canonical NPC seed. `LOGH_ACCEPT_ANY_GIN7` remains harness-only because the official launcher provisions/uses its SQLite account DB.
- **Config contract**: `RE/tools/logh7_launch_config.py` now declares `HARNESS_ONLY_SERVER_ENV_KEYS`, `LAUNCHER_ONLY_SERVER_ENV_KEYS`, and `SHARED_LAUNCHER_ENV_KEYS`. This turns the earlier prose parity rule into inspectable data.
- **Contract test**: `RE/tools/tests/test_logh7_ui_explorer.py` now parses `LOGH7Launcher.cs` for `psi.EnvironmentVariables[...]`. It asserts every shared harness key is present in the launcher with the same literal value, every harness-only key is absent from the launcher, every launcher-only key is explicitly allowed, and no surprise env keys are introduced. The test immediately caught `NODE_NO_WARNINGS`, which is now documented as launcher-only.
- **Package test**: `RE/tools/tests/test_logh7_installed_tree.py` now asserts the packaged launcher source contains `LOGH_POSTLOAD_PLAYER_RECORD` and `LOGH_SEED_CANON_NPCS`.
- **Launcher SHA cleanup**: stale docs that looked like they promoted `LOGH7Launcher.exe` binary SHA as a stable authority were softened. The canonical authority remains the game EXE SHA `79142d12290c3956f79dd38774bc809c21913a228ae9928bf77ef9486cd895df`; launcher binary SHA is only a compile-output receipt and may vary across C# compiles.
- **Installed rebuild**: rebuilt both `RE/.omo/work/logh7-installed` and root `.omo/work/logh7-installed`. Both launcher source copies contain the new env keys. Both installed game EXEs and both overlay playable EXEs still hash to canonical `79142d12290c3956f79dd38774bc809c21913a228ae9928bf77ef9486cd895df`.
- **Official preflight proof**: running root `.omo/work/logh7-installed/LOGH7Launcher.exe --client-preflight` after the rebuild still exits `1` before server startup with the Windows Application Control / Smart App Control message naming installed `exe/G7MTClient.exe`.
- **Verification**: `cd RE; python -m py_compile tools/logh7_launch_config.py tools/logh7_ui_explorer.py tools/logh7_build_player_launcher.py tools/logh7_player_runtime.py tools/logh7_windows_runtime.py` passed. `cd RE; python -m unittest tools.tests.test_logh7_ui_explorer tools.tests.test_logh7_installed_tree tools.tests.test_logh7_client_exe` passed 46/46. Final checks showed no `47900/47910` listener and no `G7MTClient`, `G7Start`, or `LOGH7Launcher` process.
- **Current implication**: once OS policy permits the canonical game EXE again, the official launcher and harness will enter the next live session with the same core game-enabling flags, plus documented account/admin/runtime deltas. This reduces one more source of false differences in future font/UI/C002 proof.

## App Control diagnostics packaged + harness/launcher parity rechecked (2026-06-28, journal #50)
- **Context/actions**: continued from #49, used three read-only subagents for independent checks: C002/MP/preseed, font/UI/display/mouse confinement, and canonical EXE/package/harness parity. No subagent edited files or launched the client.
- **C002/MP conclusion from audit**: current interactive MP blocker remains user-originated `0x0b01`. Prior live evidence already filled `0x0356`, unit/list slot `0x67`, `PLAYER_INFO+0x270`, and command rows; the next blocker is still UI admission (`FUN_005015f0` / selection-to-command-root activation), not missing server data. Server-side `0x0b01 -> 0x0b07` handling exists, but real clients still have not originated the command in the current canonical flow.
- **Preseed decision**: do not delete `LOGH_PRESEED_PLAYER_CHAR` yet. It remains a diagnostic bypass only and is off in the standard playable env. Removing it would throw away an isolator while current live is blocked by OS policy; normal C002/MP proof must continue without it.
- **Font/UI conclusion from audit**: current canonical stack patches both primary GDI and D3D glyph atlas font faces to Pretendard and includes atlas antialias/size work. Fresh visual proof cannot be taken while `G7MTClient.exe` is OS-blocked. Remaining blur/small-text work should next compare display mode, dgVoodoo filtering, font size, and lobby/create-character clipping, not assume a missing Pretendard face.
- **New packaged diagnostic**: `RE/tools/logh7_windows_runtime.py` now emits `diagnose-appcontrol.ps1`. It records client SHA256, Authenticode signature status, Zone.Identifier presence, launcher SHA256, `LOGH7Launcher.exe --client-preflight` exit code, recent CodeIntegrity Operational events, and launcher log tail.
- **Rebuild coverage fixed**: `RE/tools/logh7_build_player_launcher.py` now refreshes Windows runtime files (`setup-local.ps1`, `launch-client.ps1`, `diagnose-appcontrol.ps1`, `WINDOWS-COMPATIBILITY.txt`) before rebuilding the player launcher/runtime. This prevents `ui_explorer`/official package helper scripts from drifting.
- **Installed tree proof**: rebuilt both active trees: `RE/.omo/work/logh7-installed` and root `.omo/work/logh7-installed`. Both contain `diagnose-appcontrol.ps1` (2321 bytes), both installed `exe/G7MTClient.exe` hashes are canonical `79142d12290c3956f79dd38774bc809c21913a228ae9928bf77ef9486cd895df`, and both packaged `logh7-runtime/src/server/logh7-server.mjs` hashes match canonical server `7735e3df1b06f65344e80cf2057b1c07c77170f55f569f25a9895044be018235`.
- **Diagnostic run proof**: `diagnose-appcontrol.ps1` on `RE/.omo/work/logh7-installed` and root `.omo/work/logh7-installed` reports client `NotSigned`, Zone.Identifier absent, and preflight exit code `1`. Root run captured CodeIntegrity events `3033` and `3077`; event text says `LOGH7Launcher.exe` attempted to load `exe/G7MTClient.exe` and the file did not meet Enterprise signing level requirements / violated policy `{0283ac0f-fff1-49ae-ada1-8a933130cad6}`.
- **Harness proof**: `cd RE; python -m tools.logh7_ui_explorer --session .omo/ui-explorer/session start --server-root ..\server --port 47900 --no-login --display-mode windowed` failed before server start with the same Smart App Control message. `client-preflight.json` recorded `attempted=true`, `exitCode=1`, installed launcher path, and installed run EXE path. Afterward no `47900/47910` listener and no `G7MTClient`, `G7Start`, or `LOGH7Launcher` process remained; installed EXE SHA was still canonical. The old unrelated `G7MTClient.exe.uiexplorer.bak` remains ignored.
- **Canonical-source guard**: `RE/tools/logh7_ui_explorer.py` now rejects a drifted canonical overlay playable before copying it into the installed path. Explicit `--patched-exe` remains a separate diagnostic override; canonical default now requires source SHA `79142d12290c3956f79dd38774bc809c21913a228ae9928bf77ef9486cd895df`.
- **Parity doc correction**: `RE/tools/logh7_launch_config.py` and `docs/logh7-live-test-standard.md` now state the real contract: harness and launcher parity means same installed game EXE, same port `47900`, and same canonical server code hash. The C# launcher intentionally adds player-runtime-only SQLite/admin/client-path settings, so process arguments/env are not byte-identical.
- **Verification**: `cd RE; python -m py_compile tools/logh7_ui_explorer.py tools/logh7_launch_config.py tools/logh7_build_player_launcher.py tools/logh7_windows_runtime.py tools/logh7_player_runtime.py` passed. `cd RE; python -m unittest tools.tests.test_logh7_ui_explorer tools.tests.test_logh7_installed_tree tools.tests.test_logh7_client_exe` passed 45/45. `cd server; node --test tests/server/*.test.mjs` passed 1190 tests, 18 skipped. Final port/process check was clean.
- **Current implication**: live gameplay, font screenshots, and C002 progression remain blocked by Windows Application Control / Smart App Control on the actual canonical game EXE. The project state is cleaner: official launcher, package scripts, and harness now all fail before server startup with evidence, and the next real progress requires making this canonical EXE acceptable to the OS policy or using a user-approved launch/signing/allow path.

## Official launcher and package notes now preflight before server startup (2026-06-28, journal #49)
- **Purpose**: journal #48 made `ui_explorer` fail fast. This entry makes the official player-facing launcher path do the same by default, and updates generated package notes so users know how to run the check.
- **Launcher default change**: `RE/tools/launcher/LOGH7Launcher.cs` now calls `RunClientPreflight(paths)` after `ConfigureWindows(paths)` and before local server startup for normal launches and `--client-smoke`. `--server-smoke` skips it because that command tests only the local server. `--no-client-preflight` is available only to reproduce the old path.
- **Generated package docs updated**: `RE/tools/logh7_windows_runtime.py` now writes `WINDOWS-COMPATIBILITY.txt` and `setup-local.ps1` guidance that names `LOGH7Launcher.exe --client-preflight`, Smart App Control, CodeIntegrity Operational, and events `3033`/`3077`. `RE/tools/logh7_player_runtime.py` now writes `LOGH7-RUNTIME.txt` and `LOGH7-FILE-LAYOUT.txt` with the same fast Windows Application Control check.
- **Contract tests**: `RE/tools/tests/test_logh7_installed_tree.py` now asserts the official launcher source contains the automatic preflight guard and that generated `setup-local.ps1`, `WINDOWS-COMPATIBILITY.txt`, `LOGH7-RUNTIME.txt`, and `LOGH7-FILE-LAYOUT.txt` mention `--client-preflight` / Smart App Control / CodeIntegrity as appropriate. `RE/tools/tests/test_client_package_client.py` locks the launcher-source contract too.
- **Installed runtime rebuild**: `cd RE; python -m tools.logh7_build_player_launcher` regenerated the installed tree. `LOGH7Launcher.exe` is rebuilt from `RE/tools/launcher/LOGH7Launcher.cs`; do not treat its binary SHA as stable across C# compiles. Installed and overlay `G7MTClient.exe` remain canonical `79142d12290c3956f79dd38774bc809c21913a228ae9928bf77ef9486cd895df`.
- **Official path proof**: running `.omo/work/logh7-installed/LOGH7Launcher.exe --client-smoke` now exits `1` at `client launch preflight ... G7MTClient.exe` with the Smart App Control message and no local server startup. `server.log` byte length did not change, no `47900/47910` listener existed afterward, and no game/launcher process remained. `ConfigureWindows` still runs first, so the log can contain Pretendard registration before preflight; the important change is that Node/server startup is skipped.
- **Verification**: C# compile via PowerShell `Add-Type` passed. `cd RE; python -m py_compile tools/logh7_player_runtime.py tools/logh7_windows_runtime.py tools/logh7_ui_explorer.py tools/logh7_installed_tree.py tools/logh7_build_player_launcher.py` passed. `cd RE; python -m unittest tools.tests.test_logh7_installed_tree tools.tests.test_logh7_ui_explorer tools.tests.test_logh7_client_exe` passed 43/43. `cd server; node --test tests/server/logh7-server.test.mjs` passed 25/25.
- **Current implication**: the official launcher, PowerShell wrapper package, and ui_explorer now all converge on a cheap, documented, canonical-EXE preflight. The remaining obstacle is still the OS policy that blocks `G7MTClient.exe`; this work reduces noise and protects the server/runtime while that policy is being resolved.

## ui_explorer now fails fast on App Control before starting the server (2026-06-28, journal #48)
- **Purpose**: journal #47 added `LOGH7Launcher.exe --client-preflight`. This entry wires the same official installed-EXE preflight into the live harness so `ui_explorer start` does not waste time starting Node or registering a session when Windows will block `G7MTClient.exe` anyway.
- **Harness change**: `RE/tools/logh7_ui_explorer.py` now calls `.omo/work/logh7-installed/LOGH7Launcher.exe --client-preflight` after selecting/copying the run EXE and before font registration, dgVoodoo display patching, or server startup. The receipt is written to `client-preflight.json` in the session and, on success, is included in the session state as `clientPreflight`.
- **Escape hatch**: `start --no-client-preflight` skips this check for rare reproductions that need the old behavior. Disabled/skipped checks still write a receipt explaining why they did not run.
- **Failure cleanup**: if preflight fails after a launch-plan backup was created, the harness immediately restores `G7MTClient.exe` from `G7MTClient.exe.uiexplorer` and removes that backup before raising `SystemExit`. This prevents a server-less App Control failure from leaving the current ui_explorer backup path behind.
- **Live harness proof without game window**: `cd RE; python -m tools.logh7_ui_explorer --session .omo/ui-explorer/preflight-appcontrol-20260628 start --server-root ../server --port 47900 --no-login --display-mode windowed` exited `1` with `client preflight failed before server start: Windows Application Control / Smart App Control blocked the game client ...`. The session `client-preflight.json` recorded `attempted=true`, `exitCode=1`, and the same Smart App Control stderr. No `server.log` was created for that session, no `47900/47910` listener existed afterward, no game/launcher process remained, and installed `G7MTClient.exe` still hashed to canonical `79142d12290c3956f79dd38774bc809c21913a228ae9928bf77ef9486cd895df`. Current ui_explorer backup `G7MTClient.exe.uiexplorer` was absent afterward. An older unrelated `G7MTClient.exe.uiexplorer.bak` from 2026-06-27 remains in the installed exe directory and was not touched.
- **Tests**: added unit coverage for disabled preflight receipts and mocked Smart App Control failure before server start. `cd RE; python -m unittest tools.tests.test_logh7_installed_tree tools.tests.test_logh7_ui_explorer tools.tests.test_logh7_client_exe` passed 43/43. `cd server; node --test tests/server/logh7-server.test.mjs` passed 25/25.
- **Current implication**: future live attempts should fail quickly and cleanly while this OS policy remains active. The game itself is still not live-runnable under the current Windows Smart App Control policy; this change improves the diagnostic loop and protects server/process hygiene.

## Launcher client preflight added for fast App Control diagnosis (2026-06-28, journal #47)
- **Purpose**: journal #46 proved the installed local server/launcher path is repaired, but the launcher had to register fonts, bootstrap accounts, and start the local server before reaching the OS-level `G7MTClient.exe` block. This entry adds a cheaper official-EXE diagnostic that checks the same installed canonical game EXE before any server startup.
- **Launcher change**: `RE/tools/launcher/LOGH7Launcher.cs` now supports `--client-preflight`. It calls Win32 `CreateProcessW` with `CREATE_SUSPENDED` on `.omo/work/logh7-installed/exe/G7MTClient.exe`; if process creation succeeds it logs `client launch preflight ok: process created suspended`, terminates the suspended process immediately, and exits `0`. If Windows returns native error `4551`, it reuses the Smart App Control / CodeIntegrity error path from #46 and exits `1`.
- **Automation behavior**: `--client-preflight` is now treated as automation mode, so it writes the concise error to stderr/logs instead of showing a message box. The diagnostic does not start Node, does not open `47900/47910`, and does not need the game to draw a window.
- **Source contract tests**: `RE/tools/tests/test_logh7_installed_tree.py` and `RE/tools/tests/test_client_package_client.py` now assert that the packaged launcher source contains `--client-preflight`, `RunClientPreflight`, `CreateProcess`, `CreateSuspended`, `client launch preflight`, and `process created suspended`.
- **Installed runtime rebuild**: `cd RE; python -m tools.logh7_build_player_launcher` rebuilt `.omo/work/logh7-installed/LOGH7Launcher.exe` from source; the launcher binary SHA is not used as a stable authority. Installed and overlay game EXEs remain canonical SHA `79142d12290c3956f79dd38774bc809c21913a228ae9928bf77ef9486cd895df`.
- **Preflight proof**: running `.omo/work/logh7-installed/LOGH7Launcher.exe --client-preflight` exited `1`, appended `client launch preflight ... G7MTClient.exe`, then the same Windows Application Control / Smart App Control message. `server.log` byte length did not change, no `47900/47910` listener existed afterward, and no `G7MTClient`, `LOGH7Launcher`, `G7Start`, or `Gin7UpdateClient` process remained.
- **Latest Windows evidence**: CodeIntegrity Operational again recorded events `3033`, `3077`, and `3118` at `2026-06-28 11:56:58`. The `3077` event says `LOGH7Launcher.exe` attempted to load `.omo/work/logh7-installed/exe/G7MTClient.exe` and it did not meet Enterprise signing level requirements or violated policy `{0283ac0f-fff1-49ae-ada1-8a933130cad6}`.
- **Verification**: C# compile via PowerShell `Add-Type` passed. `cd RE; python -m py_compile tools/logh7_player_runtime.py tools/logh7_installed_tree.py tools/logh7_build_player_launcher.py tools/logh7_ui_explorer.py tools/logh7_client_exe.py` passed. `cd RE; python -m unittest tools.tests.test_logh7_installed_tree tools.tests.test_logh7_ui_explorer tools.tests.test_logh7_client_exe` passed 41/41. `cd server; node --test tests/server/logh7-server.test.mjs` passed 25/25.
- **Current implication**: before doing any future live run, use `LOGH7Launcher.exe --client-preflight` (or the equivalent direct CodeIntegrity check) to avoid wasting time on server startup when this Windows policy is still active. This does not solve the OS policy block; it makes the official installed-EXE path fail fast and record clean evidence.

## Canonical launcher/server path repaired; current blocker is Smart App Control on G7MTClient.exe (2026-06-28, journal #46)
- **Context and authority rechecked**: continued from journal #45 with the same rule: diagnostics must use the installed canonical playable game EXE, not an overlay-only shortcut. Verified installed `.omo/work/logh7-installed/exe/G7MTClient.exe` and overlay `.omo/work/logh7-ko-overlay/exe/G7MTClient.playable.exe` both hash to `79142d12290c3956f79dd38774bc809c21913a228ae9928bf77ef9486cd895df`.
- **Launcher App Control logging fixed**: `RE/tools/launcher/LOGH7Launcher.cs` now catches `Win32Exception` native error `4551` and `InvalidOperationException` messages containing Application Control, logs a concise Windows Application Control / Smart App Control explanation, and writes any top-level launcher exception plus inner exception to `logh7-runtime/logs/launcher.log`. While compiling this source, fixed the nested Win32 `Point` struct name collision by renaming it to `NativePoint`.
- **Server CLI exit root cause fixed**: direct installed-server starts were importing the module but exiting before `main()` because `process.argv[1]` used the linked `RE/.omo/...` path while Node resolved `import.meta.url` to the root `.omo/...` target. `server/src/server/logh7-server.mjs` now compares canonical `realpathSync.native()` file URLs in `isCliEntrypoint()`. `server/tests/server/logh7-server.test.mjs` now locks the realpath/file-URL comparison.
- **Missing runtime content root cause fixed**: after the CLI guard fix, the next direct-server failure was missing runtime content (`content/galaxy.json` / `logh7-content.db`). Rebuilt `server/content/logh7-content.db` from canonical `server/content` via `node src/server/logh7-content-db.mjs build content/logh7-content.db`; row counts were `TOTAL 10718` (`star_systems=80`, `planets=281`, `characters=97`, `client_strings=9582`, etc.). The same DB hash `1921cce64ccdf68b7b058a692b07bf0ac82cc1abc237a5876b63233f3b2066c5` is now present in `server/content`, `RE/content`, and installed runtime content.
- **RE duplicate source drift fixed**: `RE/tools/logh7_player_runtime.py` was still packaging `RE/src/server` and `RE/content`, even though `AGENTS.md` says canonical server/content live under `server/`. The builder now prefers `../server/src/server` and `../server/content`, falling back to the old RE paths only if the canonical split repo is absent. `RE/tools/tests/test_logh7_installed_tree.py` now asserts that player runtime sources resolve to the canonical `server/` repo.
- **Installed runtime rebuilt from canonical server**: `cd RE; python -m tools.logh7_build_player_launcher` now succeeds with runtime content included. Installed `.omo/work/logh7-installed/logh7-runtime/src/server/logh7-server.mjs` hashes exactly like canonical `server/src/server/logh7-server.mjs` (`7735e3df1b06f65344e80cf2057b1c07c77170f55f569f25a9895044be018235`). Installed `LOGH7Launcher.exe` was rebuilt from source; its binary SHA is compile-output evidence, not a stable canonical value.
- **Direct server proof**: starting installed `logh7-runtime/src/server/logh7-server.mjs serve-auth` with launcher-equivalent env now stays alive after 3 seconds and listens on `127.0.0.1:47900` and admin `127.0.0.1:47910`. The direct verification process was stopped by exact PID only. No blanket `node.exe` cleanup was used.
- **Official launcher smoke proof**: `.omo/work/logh7-installed/LOGH7Launcher.exe --skip-update --client-smoke` starts the local server successfully, logs `LOGH7 authoritative login server listening on 127.0.0.1:47900 ... [admin: http://127.0.0.1:47910/admin/session-state]`, then fails only when launching canonical `exe/G7MTClient.exe`. Exit code is `1`; afterward no `47900/47910` listener remains and no `G7MTClient`, `LOGH7Launcher`, `G7Start`, or `Gin7UpdateClient` process remains.
- **Latest Windows policy evidence**: `Microsoft-Windows-CodeIntegrity/Operational` recorded fresh `3033`, `3077`, and `3118` events at `2026-06-28 11:51:09`. Event `3077` says `LOGH7Launcher.exe` attempted to load `.omo/work/logh7-installed/exe/G7MTClient.exe`, which did not meet Enterprise signing level requirements or violated policy `{0283ac0f-fff1-49ae-ada1-8a933130cad6}`.
- **Verification**: `node --check server/src/server/logh7-server.mjs` passed; `cd server; node --test tests/server/logh7-server.test.mjs` passed 25/25; `cd RE; python -m py_compile tools/logh7_player_runtime.py tools/logh7_installed_tree.py tools/logh7_build_player_launcher.py tools/logh7_ui_explorer.py tools/logh7_client_exe.py` passed; C# launcher compile check via PowerShell `Add-Type` passed; `cd RE; python -m unittest tools.tests.test_logh7_installed_tree tools.tests.test_logh7_ui_explorer tools.tests.test_logh7_client_exe` passed 41/41. One earlier `py_compile` invocation incorrectly included the C# source and failed with Python `SyntaxError`; that was a command mistake, not a source failure.
- **Current implication**: the server/launcher path is now repaired and canonical-source aligned. Fresh live visual/font/C002 diagnosis is still blocked before the game window exists because Smart App Control blocks the actual canonical `G7MTClient.exe`. Next progress requires an explicit allow/signing/reputation path for that EXE, or a user-approved policy/workflow change; server guesses or preseed changes cannot bypass this OS-level launch block.

## Canonical 79142d12 live launch blocked by Windows Application Control + cleanup fix (2026-06-28, journal #45)
- **Context re-read**: re-read `logh7-live` and `logh7-localize` skill bodies before touching live tooling. Current live rule remains canonical playable SHA `79142d12290c3956f79dd38774bc809c21913a228ae9928bf77ef9486cd895df`, installed EXE path, windowed login/start, optional later borderless, cursor clip auto, and no blanket `node.exe` kill.
- **Preflight cleanup**: checked for `G7MTClient`, `G7Start`, `Gin7UpdateClient`, and `47900` listeners before launch; none were present. Installed `RE/.omo/work/logh7-installed/exe/G7MTClient.exe` and overlay `RE/.omo/work/logh7-ko-overlay/exe/G7MTClient.playable.exe` both still hashed to `79142d12...`.
- **Live attempt**: `cd RE; python -m tools.logh7_ui_explorer --session .omo/ui-explorer/visual-79142d12-20260628 start --server-root ../server --port 47900 --no-login --display-mode windowed --settle 8` started the server and registered fonts, but client `CreateProcess` failed with `WinError 4551` (`Application Control policy has blocked this file`). Because the old start path failed before `session.json`, `stop` could not run. Verified the leftover server command line was exactly `node src/server/logh7-server.mjs serve-auth --host 127.0.0.1 --port 47900 ...`, then killed only that recorded PID (`16040`), not all node processes. Post-cleanup checks showed no game process, no `47900` listener, and SHA still `79142d12...`.
- **App Control diagnostics**: `Zone.Identifier`/MOTW was absent. `Get-AuthenticodeSignature` reported the current `G7MTClient.exe` is `NotSigned`. Direct `Start-Process` on current canonical `G7MTClient.exe` failed with `Application Control policy has blocked this file`. Official root `RE/.omo/work/logh7-installed/G7Start.exe` does start under the same system policy, proving the block is specific to the current modified game EXE/reputation/signing path, not every LOGH executable.
- **Launch-policy matrix**: short `Start-Process` probes with immediate exact-family cleanup showed `current-79142d12` blocked, `original-noauto-c1523a5e` blocked, `official-G7Start` allowed, and `revival-LOGH7Launcher` allowed. After the matrix, no `G7MTClient`, `G7Start`, `Gin7UpdateClient`, or `LOGH7Launcher` remained and no `47900` listener remained. This means the launcher shell can run, but the actual game-client EXE family is still blocked when invoked directly.
- **CodeIntegrity evidence**: `Microsoft-Windows-CodeIntegrity/Operational` is enabled and recorded recent events `3033`/`3077`/`3118`. The `3077` entries name both `G7MTClient.exe` and `G7MTClient.noauto.exe` and say they did not meet Enterprise signing level requirements or violated policy `0283ac0f-fff1-49ae-ada1-8a933130cad6`. The event properties include scenario `VerifiedAndReputableDesktop`, product strings `G7MTClient.EXE` / `G7MTClient MFC ...`, and the blocked device paths under `.omo/work/logh7-installed/exe`.
- **Harness defect fixed**: `RE/tools/logh7_ui_explorer.py` now has `_taskkill_pid()` and `_cleanup_failed_start()` so failed starts kill only the recorded client/server PIDs. Server readiness timeout and ordinary client spawn failure now clean up the session server the same way runtime-patch failures already did. `cmd_stop` also routes server cleanup through the PID helper.
- **Harness error message**: `RE/tools/logh7_ui_explorer.py` now also recognizes client-spawn `WinError 4551` and exits with a concise Windows Application Control / Smart App Control message pointing at CodeIntegrity events `3033`/`3077`, instead of dumping a raw Python traceback.
- **Tests**: `cd RE; python -m py_compile tools/logh7_ui_explorer.py tools/logh7_launch_config.py` passed. `cd RE; python -m unittest tools.tests.test_logh7_ui_explorer tools.tests.test_logh7_client_exe` passed 37/37, including new assertions that cleanup targets only the recorded PID, kills client before server on failed start, and recognizes `WinError 4551`.
- **Real cleanup verification**: reran the blocked path as `.omo/ui-explorer/appcontrol-cleanup-20260628`. It failed at the same `WinError 4551`, but this time no `47900` listener remained afterward and no game process was alive. Evidence files show server readiness and seed only: `server.log` listened on `127.0.0.1:47900`, `trace.jsonl` recorded `scenario-seed` and `economy-seed`, and `font-registration.log` recorded `AddFontResourceExW`, `57` font files, `135` loaded faces. Installed and overlay EXEs still hashed to `79142d12...`.
- **Message verification**: reran the blocked path as `.omo/ui-explorer/appcontrol-message-20260628`. It now exits with `client launch blocked by Windows Application Control / Smart App Control ... Check Microsoft-Windows-CodeIntegrity/Operational events 3033/3077 ...`. Afterward no game/launcher process, no `47900` listener, and installed/overlay SHA remained `79142d12...`.
- **Current implication**: fresh visual/font/UI live proof on the current canonical playable EXE is blocked by Windows Application Control before the client window exists. C002 was not advanced in this session. Next path must either make the current canonical game EXE acceptable to Windows policy (allowlist/signing/new canonical hash decision), or explicitly choose a launcher/runtime-patch route that preserves the evidence boundary instead of pretending the blocked EXE launched.

## Full-current audit + harness parity cleanup (2026-06-28, journal #44)
- **Scope actually checked**: reread the current LOGH7 skills (`logh7-re/live/patch/wire/localize`), inventoried `docs/` (206 markdown docs), reference PDFs (`docs/reference/gin7manual*.pdf`, 3 files), and the UI reference catalog. Static image metadata read found 134 local reference files: 133 load as images (116 JPG/JPG + 17 GIF) and 1 known placeholder (`docs/reference/ui-catalog/gamemeca/en010.gif`) whose bytes start with XML `AccessDenied`, matching `docs/logh7-reference-visual-catalog-2026-06-25.md`.
- **Subagents used**: three read-only subagents audited (1) docs/prompts/roadmaps, (2) server/wire/MP completion state, and (3) client/font/UI/harness parity. None launched the game or edited files. Server/wire subagent additionally ran safe narrow server tests and reported 231 pass / 0 fail for command-engine, world-relay, MP visibility, combat, battle, and login-session slices.
- **Prompt drift fixed**: `.claude/commands/logh7-live.md`, `.claude/commands/logh7-loop.md`, `.claude/agents/logh7-loop-explorer.md`, and `.claude/agents/logh7-loop-verifier.md` no longer name `98ca4acd...` as current authority. They now require canonical SHA `79142d12290c3956f79dd38774bc809c21913a228ae9928bf77ef9486cd895df`, windowed login, optional `display --mode borderless`, cursor clip auto, no blanket `node.exe`, and no preseed by default.
- **Harness parity fix**: `RE/tools/logh7_launch_config.py` was rewritten as an ASCII single source of truth: port `47900`, canonical SHA `79142d12...`, standard ENV with `LOGH_POSTLOAD_RICH_CHARACTER=1`, and diagnostic flags (`LOGH_PRESEED_PLAYER_CHAR`, `LOGH_POSTLOAD_ACTION_LIST_SEATS`) explicitly opt-in. `RE/tools/logh7_live_env.sh` now calls `ui_explorer stop` for cleanup, starts with `--server-root ../server --port 47900 --no-login --display-mode windowed`, exposes `display`, and avoids direct taskkill/node cleanup. `RE/tools/logh7_ui_explorer.py` stale comment was corrected.
- **Docs drift fixed**: `docs/logh7-live-test-standard.md`, `.codex/.claude logh7-live` skill examples, `docs/logh7-ui-coordinate-map.md`, `docs/logh7-master-roadmap-2026-06-26.md`, and `docs/logh7-reference-visual-catalog-2026-06-25.md` now point readers at the `79142d12...` baseline and mark old coordinate/SHA references as historical. `LOGH_POSTLOAD_ACTION_LIST_SEATS=1` remains a C002 diagnostic lever, not a general playable default, because it can alter command/admission UI state.
- **Canonical EXE/static proof**: installed `G7MTClient.exe`, overlay `G7MTClient.playable.exe`, and `.uiexplorer` all hash to `79142d12290c3956f79dd38774bc809c21913a228ae9928bf77ef9486cd895df`. Byte checks on installed EXE pass: atlas quality `0x000b0b91=6a04`, primary font size `0x000ea1c6=6a10`, atlas size `0x000b0869=83c0039090`, primary face and atlas face both `Pretendard`.
- **dgVoodoo/static proof**: active installed `dgVoodoo.conf` has `FullScreenMode=false`, `ScalingMode=centered`, `Resampling=pointsampled`, `WindowedAttributes=borderless`, `FullscreenAttributes=fake`, `Filtering=appdriven`, `Antialiasing=off`, `RTTexturesForceScaleAndMSAA=false`, `SmoothedDepthSampling=false`, `dgVoodooWatermark=false`, `3DfxWatermark=false`, `3DfxSplashScreen=false`, and `WatermarkDisplayDuration=1`.
- **Verification**: `cd RE; python -m py_compile tools/logh7_launch_config.py tools/logh7_ui_explorer.py` passed. `cd RE; python -m unittest tools.tests.test_logh7_ui_explorer tools.tests.test_logh7_client_exe` passed 34/34. `bash -n tools/logh7_live_env.sh` could not run because the Windows Bash/WSL registration path returns `Bash/CallMsi/Install/REGDB_E_CLASSNOTREG`; this is an environment verifier failure, not a live/game launch.
- **Current completion judgment**: no live game session was launched in this audit. The next live gap is still fresh canonical `79142d12...` visual verification (16px-ish font, windowed login, optional borderless/cursor clip, no logo), followed by C002 user-originated interaction with `LOGH_POSTLOAD_ACTION_LIST_SEATS=1` only for that diagnostic run. MP remains server-substrate strong but interactive completion is unproved until real clients originate/consume/render `0x0b01 -> 0x0b07`.

## Live environment parity + canonical 79142d12 font/display update (2026-06-28, journal #43)
- **ui_explorer vs real EXE environment**: same EXE SHA alone is not enough. The harness is equivalent to the official/player path only when it uses the installed `RE/.omo/work/logh7-installed/exe` CWD, the same sidecars (`dgVoodoo.conf`, `D3D8.dll`, bundled fonts), and the fixed server port `47900`. A live attempt on `47902` launched the canonical game EXE but produced `NO DATA` because the client still looked at empty `47900`.
- **Live correction**: reran `ui_explorer start` on `47900` with the installed canonical game EXE and runtime `font-atlas-antialias`. Trace reached `0x7000` login redirect, lobby `0x0020/0x2000 -> 0x2001`, character list `0x2003 -> 0x2004`, and session list `0x2005 -> 0x2006`. Screenshot `.omo/ui-explorer/font-atlas-antialias-runtime-98ca-47900-20260628/shots/002-lobby-after-settle.png` showed lobby UI without `NO DATA`. `stop` restored and verified the session-start SHA.
- **Font/display decision**: user accepted the atlas-antialias look but requested larger text and reminded that login must be windowed. The default playable stack now promotes `font-atlas-antialias` and raises `font-readable-size` to the previously documented 16px-ish bytes: primary `0x000ea1c6 = 6a10`, atlas `0x000b0869 = 83c0039090`.
- **New canonical playable**: rebuilt and deployed `.omo/work/logh7-ko-overlay/exe/G7MTClient.playable.exe`, `.omo/work/logh7-installed/exe/G7MTClient.exe`, and `.omo/work/logh7-installed/exe/G7MTClient.exe.uiexplorer`. All three now hash to **`79142d12290c3956f79dd38774bc809c21913a228ae9928bf77ef9486cd895df`**.
- **Harness/launcher behavior**: `ui_explorer start` now defaults to `--display-mode windowed`. Use `display --mode borderless` after login/lobby/world when needed. `cursor-clip=auto` confines the cursor only in borderless/fullscreen and releases it in windowed/stop. The C# launcher now defaults to `DefaultDisplayMode="windowed"` and `DefaultCursorClip="auto"` with `--cursor-clip auto|on|off` and `--no-cursor-clip`.
- **Port guard**: `ui_explorer --runtime-patch` now rejects non-`47900` before launch, preventing the wrong-port `NO DATA` failure mode.
- **Verification**: `python -m py_compile tools/logh7_ui_explorer.py tools/logh7_build_playable_client.py tools/logh7_client_exe.py tools/logh7_installed_tree.py` passed. `python -m unittest tools.tests.test_logh7_ui_explorer tools.tests.test_logh7_client_exe` passed 33/33. Byte check on installed EXE passed: atlas quality `6a04`, primary size `6a10`, atlas size `83c0039090`. Broader install/package tests remain blocked by missing local artifacts (`RE/content/logh7-content.db`) and absent `client/` package in this checkout, not by the changed font/display code.

## Subagent audits resolved + C002 next target tightened (2026-06-28, journal #42)
- **Subagents used**: two read-only subagents audited the runtime patch path and C002 static next step. Both were instructed not to launch the game, start `ui_explorer`, edit files, or kill processes.
- **Runtime patch audit result**: the suspended `ui_explorer --runtime-patch` path was confirmed to keep the clean runtime launch on canonical on-disk 98ca and to gate `resume()` on a successful receipt. Two residual risks were found in the shared runtime patch helper: missing `originalHex` could allow an unguarded future descriptor, and the standalone attach helper could partially patch if a later site failed.
- **Runtime patch fix**: `RE/tools/logh7_runtime_patch_apply.py` now requires `originalHex`, enforces equal even byte lengths, preflights all sites before any write, and emits `preflightOk`. If any site mismatches, no sites are written. `RE/tools/tests/test_logh7_ui_explorer.py` now covers missing `originalHex` and all-before-write JS markers. Verification: `python -m py_compile RE\tools\logh7_runtime_patch_apply.py RE\tools\tests\test_logh7_ui_explorer.py` passed; `cd RE; python -m unittest tools.tests.test_logh7_ui_explorer` passed 24/24.
- **C002 subagent result**: the next live target should be the positive-control command-row/SelectGrid path, not another event22 payload run. Event22 is already classified as a `FUN_00517cd0` status/domain wrapper; the movement path remains `FUN_00581c80 -> FUN_005737d0 -> FUN_004b48d0 -> FUN_004b78a0 case 0x3a`.
- **C002 missing static target**: redex `grep DAT_009d2a3c` and `grep DAT_009d2a40` still find only `FUN_00570a10`. `docs/logh7-movemode-re.md` remains the current correction: these globals are read-only consumer channels in the client, not a direct client writer. The next non-live RE target is the server-response decoder or memcpy source that fills the `0x009d2a30` state block, especially `state+0x0c` (`DAT_009d2a3c`) and `state+0x10` (`DAT_009d2a40`).
- **Next live, still deferred**: when live is allowed, use canonical installed 98ca and resume from the command-row positive-control flow that reaches `FUN_00581c80`. Do not repeat generic map/system clicks or treat `0x0f08/0x0f09` as movement progress.

## Runtime-patch guard + C002 static recheck (2026-06-28, journal #41)
- **User boundary**: live verification is explicitly deferred until the end. This update is background-safe only: file reads, redex queries, Frida API introspection, code guard changes, unit tests, and documentation. No game client was launched.
- **Runtime-patch guard**: `RE/tools/logh7_runtime_patch_apply.py` now preserves descriptor `originalHex` in `_load_patch()`. The generated Frida JS reads process bytes before writing, emits `original`, `before`, `beforeOk`, and `wrote`, skips the write on an original-byte mismatch, and marks the patch event `ok=false`.
- **Runtime launch safety**: `RE/tools/tests/test_logh7_ui_explorer.py` now checks three more non-live cases: incomplete runtime-patch receipts fail, descriptor loading keeps the `originalHex` guard, and a suspended Frida-spawned client is killed without `resume()` if the guard fails before patch completion.
- **Verification**: Frida Python import is available (`17.15.3`) and `Device.spawn(program, ..., cwd=...)` supports the cwd argument used by `ui_explorer`. `python -m py_compile RE\tools\logh7_runtime_patch_apply.py RE\tools\logh7_ui_explorer.py RE\tools\tests\test_logh7_ui_explorer.py` passed. `cd RE; python -m unittest tools.tests.test_logh7_ui_explorer` passed 23/23.
- **C002 redex recheck**: `FUN_00581c80` builds the SelectGrid tree, including `SelectGrid`, `TARGET_GRID`, `TARGET_BASE_GRID`, `SendWarpCommand`, `GoReceive`, and `ReceiveResult` where request/response are `0x0b01/0x0b07`. `FUN_005737d0` is still the command execution node that calls `FUN_004b48d0`, and `FUN_004b78a0` case `0x3a` maps to request `0x0b01`, response `0x0b07`.
- **Event22 boundary**: redex re-read of `FUN_00517cd0` confirms it builds a local `0x34`-byte payload and calls `FUN_00501e30(0x16, FUN_00502780(0,0), local_34)`. Its direct callers wrap many domain/status codes, including `FUN_004c2620 -> 0x0f08`, `FUN_004c2660 -> 0x0f09`, and `FUN_004bee20 -> 0x0b07`. Therefore the latest `eventCode=22` observation is a domain/status wrapper path, not the user-originated SelectGrid sender.
- **Next live, when allowed**: do not repeat generic map/system clicks. Use canonical installed 98ca plus watchers already capable of `payloadBytes34`, or return to the older positive-control command-row path and trace `FUN_00581c80 -> FUN_005737d0`. The font A/B should use canonical 98ca with `--runtime-patch font-atlas-antialias`, not a new disk EXE.

## Runtime patch launch path for live-deferred font A/B (2026-06-28, journal #40)
- **Latest note**: live verification remains deferred per user direction, but the tooling path to test the atlas font candidate without creating a new blocked EXE hash is now implemented.
- **Background worker result**: `RE/tools/logh7_ui_explorer.py` now accepts repeatable `start --runtime-patch NAME`. It rejects combinations with `--patched-exe` and `--lobby-unblock-patch`, keeps the installed on-disk client canonical, and applies descriptor `patchedHex` bytes through Frida `spawn -> attach -> script load/write -> resume`.
- **Receipt behavior**: start state records `runtimePatch` with method `frida-spawn-resume`, patch names, byte events, `ok`, and raw events. `runClientSha` remains the canonical installed EXE SHA because disk bytes are unchanged.
- **Safety boundary**: the helper requires installed `G7MTClient.exe` to remain canonical `98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc`. If runtime patching fails before resume, the spawned client is killed and the session server is cleaned up.
- **Non-live verification**: `python -m py_compile RE\tools\logh7_runtime_patch_apply.py RE\tools\logh7_ui_explorer.py RE\tools\tests\test_logh7_ui_explorer.py` PASS. `cd RE; python -m unittest tools.tests.test_logh7_ui_explorer` PASS, 23 tests. No live game launch was run for this verification.
- **Next font A/B when live is allowed**: run canonical installed EXE with `--runtime-patch font-atlas-antialias`, capture lobby/world screenshots, and use GDI watcher to confirm atlas `CreateFontA` is `quality=4` while primary UI remains `quality=5`.

## Font raster root cause + live-deferred fix plan (2026-06-28, journal #39)
- **Latest note**: the current font symptom is now narrowed from "Pretendard is not applied" to "the D3D glyph-atlas path uses Pretendard 14px with ClearType, then LOGH VII extracts only a 4-bit alpha nibble from the 16bpp DIB." This explains the user's report that glyphs look too small and like outlines with hollow centers.
- **RE proof**: redex re-read `FUN_004b0960` and `FUN_004b07c0`. `FUN_004b0960` creates a 16bpp DIB, calls `CreateFontA`, draws via `ExtTextOutA`, then builds glyph alpha from `byte >> 4`. `FUN_004b07c0` supplies the atlas face and size. Canonical 98ca bytes prove primary UI quality is `6a05` at file `0x000aeddc`, atlas quality is also `6a05` at file `0x000b0b91`, primary size is `6a0e`, and atlas size patch is `83c0019090`.
- **GDI/live proof retained**: prior canonical 98ca watcher `.omo/ui-explorer/font-gdi-spawn-98ca-20260628/gdi-font.jsonl` showed `font-created` 31/31 face `Pretendard`; atlas font samples are height `14`, weight `400`, quality `5`, charset `-127`, pitch `1`; primary UI samples include height `-19`, weight `700`, quality `5`.
- **Raster comparison tooling**: added `RE/tools/logh7_font_raster_compare.py`, a non-live Windows GDI comparison tool. It registers bundled Pretendard fonts, draws cp949 text into 16bpp/32bpp DIBs, and reproduces LOGH's alpha extraction. Verification: `python -m py_compile RE\tools\logh7_font_raster_compare.py` PASS.
- **Raster result**: output `.omo/font-raster-compare-20260628/font-raster-compare.png` and JSON show `Pretendard 14 q5 w400 atlas-current` has only `solidRatioPermille=393` for "game start" text, while `Pretendard 14 q4 w400 atlas-no-cleartype`, `Pretendard 16 q4`, and `Gulim 14 q4` all produce `solidRatioPermille=1000`. Additional Korean label samples show the same pattern (`Pretendard 14 q5` around 400-430/1000; q4 paths 1000/1000).
- **Patch candidate**: added `RE/tools/client_patches/font-atlas-antialias.json`. It is intentionally narrow: when applied after `font-cleartype`, it changes only atlas `FUN_004b0960` quality `6a05 -> 6a04` at `VA 0x004b0b91/file 0x000b0b91`, keeping primary UI ClearType, Pretendard face, HANGEUL_CHARSET, and the current 14px-ish size.
- **Candidate build**: built `.omo/work/logh7-ko-overlay/exe/G7MTClient.font-atlas-antialias.exe` with SHA `b11c6ad31891f038577728fbbba5c35155a5d091a27c9e6887d9c02070efa95a`. Byte check passed: primary quality `6a05`, atlas quality `6a04`, atlas face `Pretendard`, primary size `6a0e`, atlas size `83c0019090`.
- **Execution boundary**: attempting to launch the candidate via `ui_explorer start --patched-exe` failed with Windows `WinError 4551` Code Integrity / Smart App Control. No live font verdict was claimed from that failed candidate launch.
- **User direction**: live verification is now explicitly deferred until the end. Next work should be background-safe only: implement a Frida spawn/resume runtime-patch path so canonical on-disk 98ca can stay unchanged while the atlas antialias candidate is written to memory before resume. Only after RE/tooling/tests/docs are complete should a short final live A/B be run.

## ★★★★★ C002 event22 payload decode + dgVoodoo no-logo answer (2026-06-28, journal #38)
- **Latest note**: canonical installed `G7MTClient.exe` session `.omo/ui-explorer/c002-event22-payload-98ca-20260628` re-ran mode2 with no `LOGH_PRESEED_PLAYER_CHAR`, captured the 0x34-byte event22 payload, and stopped with canonical SHA `98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc` restored.
- **Env/session**: launch used `RE/tools/logh7_ui_explorer.py` from `RE/`, `--server-root ..\server`, `--display-mode borderless`, and env `LOGH_ACCEPT_ANY_GIN7=1`, `LOGH_POSTLOAD_RICH_CHARACTER=1`, `LOGH_POSTLOAD_ACTION_LIST_SEATS=1`, `LOGH_STRAT_GALAXY=1`, `LOGH_STRAT_GRID_EARLY=1`, `LOGH_STRAT_TERRAIN=1`, `LOGH_WORLD_PLAYER=1`, `LOGH_FULL_UNIT_LOCATION=1`, `LOGH_GRID_ENTER=1`.
- **World/data proof**: trace received `0x0356=1` and `0x0f02=1`. `logh7_selectgrid_snapshot` showed `fieldMode126711=2`, `gridActive126710=1`, `worldActive2a58f8=65537`, `focusChar3584a0=1`, `selection.listCount188=1`, `payloadCount270=1`, `currentPayloadCount270=1`, one primary/secondary row, and `command.rowCountD4=24`.
- **Click/watch result**: blue-system/map clicks produced `0x0f08 -> 0x0f09` pairs but no `0x0b01`/`0x0b07`. The watcher saw thousands of `FUN_005015f0`/dequeue samples and selection row role samples, but selection-primary/secondary event-kind 2 still returned `retvalLow8=0`; no SelectGrid event `2/9/0xb` was queued.
- **Payload decode**: event enqueue sample had `eventCode=22`, `returnVa=0x00517d2d`, and `payloadBytes34=2806350309334277000f7105010000000000000000000000ffffff7fdcfa1a00285c6000280635032020e70c090f000030902c0d`. Interpreting dwords little-endian proves `payload+0x2c == 0x00000f09` and `payload+0x30` is the domain/object pointer.
- **Static RE proof**: redex confirmed `FUN_00517cd0` copies the wrapper code into a local 0x34-byte event payload and calls `FUN_00501e30(0x16, target, local_34)`. `FUN_004c2620` wraps `0x0f08`; `FUN_004c2660` wraps `0x0f09`; `FUN_004bee20` wraps `0x0b07` separately. Therefore the observed event22 is an info/status wrapper, not SelectGrid movement.
- **C002 conclusion**: `0x0356`, slot/list payload, and command rows are present; the current user-click path still lands in event22/`0x0f08` status handling. The next C002 target should not be more generic map clicks. Resume the command-row positive-control path that reaches `FUN_00581c80`, or instrument the row/controller path until `DAT_009d2a3c`/`FUN_005737d0` is either reached or the missing transition is proven.
- **dgVoodoo logo answer**: active installed `dgVoodoo.conf` has `dgVoodooWatermark=false`, `3DfxWatermark=false`, `3DfxSplashScreen=false`, `WatermarkDisplayDuration=1`, `ScalingMode=centered`, `Resampling=pointsampled`, `Filtering=appdriven`, and `Antialiasing=off`. The latest lobby/world screenshots and start receipt showed no dgVoodoo logo. If the user still sees the logo, they are almost certainly launching a path/cwd that does not load the installed `D3D8.dll` + `dgVoodoo.conf` sidecars.
- **Prompt/doc cleanup**: `.claude`/`.codex` live prompts were updated to say `RE/tools/logh7_ui_explorer.py`, canonical SHA `98ca4acd...`, no blanket `node.exe` kill, and no preseed by default. `AGENTS.md`, `docs/logh7-live-test-standard.md`, and `docs/logh7-live-flow-plan-2026-06-26.md` now carry the current authority addendum.

## ★★★★★ C002 static RE: valid selection tab requires HUD mode 2 (2026-06-28, journal #36)
- **Latest note**: after journal #35 proved that live `FUN_004f6680(1)` closes the selection root because tab1 is invalid, redex re-read of `FUN_004fd7a0` and `FUN_004fd100` narrowed the natural reopen condition. The valid tab path is not a direct server `0x0356` issue: it requires HUD mode `2`.
- **`FUN_004fd7a0` structure**: every accepted mode change first stores `param_2` into `HUD+0xf4`, then unconditionally resets command/selection tabs with `FUN_004f59e0(1)` and `FUN_004f6680(1)`. That explains the observed root close. Only after that, when `HUD+0xf4 == 2`, it executes `FUN_004f6680(3 - bVar9)`, which chooses valid selection tab `2` or `3`.
- **`bVar9` source**: `bVar9 = *(char *)(*(int *)(&DAT_0150c250 + HUD) + 0x28) != 0x02`. Thus the valid tab is selected from current context object state, not from `0x0356` count directly. The exact tab2-vs-tab3 split still needs live context logging.
- **Import path implication**: `FUN_004fc4a0` calls `FUN_004f68f0(*(DAT_007ccffc+8))`, then saves `HUD+0xf4`, sets `HUD+0xf4=0`, and calls `FUN_004fd7a0(savedMode,0)`. Therefore the #35 live `requestedMode=1` means the HUD was already in mode 1 before the `0x0356` refresh replayed it.
- **Natural mode2 trigger in `FUN_004fd100`**: per-frame HUD consumer tail gates mode2 on `DAT_00c9e2f8==0`, `HUD+0x128 <= 0`, and `FUN_005015f0(2, *(HUD+0x14), buf, 0) != 0`; it can also reach mode2 through the `HUD+0x28` fallback when current `HUD+0xf4==1`. The already-documented older live evidence said these HUD mode targets had empty event queues / `b00=0`, so mouse-only target clicks did not produce `FUN_004fd7a0(2)`.
- **Reframed next live**: do not spend the next run only clicking populated selection rows. The next decisive watcher should capture HUD mode target state for `HUD+0x14` and `HUD+0x28`: `valid08`, controller `+5`, target `+0x15`, event queue keys at `+0x470`, `+0xb00`, and writer callers `FUN_00501e30`, `FUN_005024b0`, `FUN_005024e0`, `FUN_00507f20`. Pass condition is a natural `FUN_004fd7a0(2,1)` followed by `FUN_004f6680(2/3)` and selection root `+4/+5` staying open.
- **Server lever boundary retained**: `LOGH_ACTION_LIST_CATEGORY` can still be run as a documented A/B, but the direct RE target is now the HUD mode2 event producer. If category A/B does not produce `FUN_004fd7a0(2)`, it is not the primary C002 fix.

## ★★★★★ C002 early-root live: tab 1 definition closes the selection root (2026-06-28, journal #35)
- **Latest note**: journal #35 attached a lifecycle-only Frida watcher in the lobby, before game-start/card-entry, so the first selection-root open/close timing was captured instead of missed post-world. The run used the installed canonical game EXE path and restored playable SHA `98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc`; `LOGH_PRESEED_PLAYER_CHAR` was not used.
- **Session**: `.omo/ui-explorer/c002-earlyroot-98ca-20260628`. Env included `LOGH_ACCEPT_ANY_GIN7=1`, `LOGH_POSTLOAD_RICH_CHARACTER=1`, `LOGH_POSTLOAD_ACTION_LIST_SEATS=1`, `LOGH_STRAT_GALAXY=1`, `LOGH_STRAT_GRID_EARLY=1`, `LOGH_STRAT_TERRAIN=1`, `LOGH_WORLD_PLAYER=1`, `LOGH_FULL_UNIT_LOCATION=1`, `LOGH_GRID_ENTER=1`. `GRID_SELECTOR_PROBE` stayed off so mode2 was preserved.
- **Tooling change**: `RE/tools/logh7_hud_hit_test_gate_watch.py` now supports `--lifecycle-only` and `--max-events`, so it can attach before world entry without exhausting on noisy hit-test frames. It also logs `FUN_00506280` layout open/update, `FUN_004fc4a0` HUD information refresh, `FUN_004fd100` HUD frame-consumer changes, `selection-root` classification, and `payload+0x270` state. Verification: `cd RE; python -m py_compile tools/logh7_hud_hit_test_gate_watch.py` and `python -m unittest tools.tests.test_logh7_hud_hit_test_gate_watch tools.tests.test_logh7_hud_admission_watch tools.tests.test_logh7_hud_event_queue_watch` passed 11/11.
- **Data proof**: trace reached `0x0200`, `0x0204`, `0x0f02`, `0x0325`, `0x0b0a`, and `0x0356 compact-0356`. The `0x0356` record carried `recordSeatCount250=1`, `recordSeatKind254=1`, `recordSeatChar254=1`, `recordSeatRole258=0`, proving the post-load seat/list data is still present.
- **Snapshot proof**: `selectgrid-snapshot-earlyroot.jsonl` showed `fieldMode126711=2`, `gridActive126710=1`, `worldActive2a58f8=65537`, `focusChar3584a0=1`, `unitCount41a364=1`, `selection.listPage187=1`, `selection.listCount188=1`, `payloadCount270=1`, `currentPayloadCount270=1`, one primary/secondary row, and `command.rowCountD4=24`.
- **Breakthrough**: the lifecycle watcher caught selection root `0xf240e40` opening through `FUN_00506280` at returnVa `0x004f658f`; `FUN_00502ea0` returnVa `0x0050658b` and `FUN_005024b0` returnVa `0x00506594` moved root `+4/+5` from `0/0` to `1/1`. Immediately afterward `FUN_004f6680(1)` ran and closed the same selection root back to `0/0`.
- **0x0356 import timing**: later `0x0356 -> FUN_004fc4a0 -> FUN_004f68f0` imports filled the payload count from `0` to `1`, but the import path repeatedly invoked `FUN_004f6680(1)` while the root remained `0/0`. Thus the list data is imported, but the active root/controller stays closed.
- **Static table explanation**: canonical EXE bytes at `DAT_0066f130 + tab*0x208` show tab0 first dword `0xffffffff`, tab1 first dword `0xffffffff`, tab2 first dword `0x00000000`, and tab3 first dword `0x00000000`. `FUN_004f6680` closes root `+4/+5` when the selected tab's first dword is `-1`. The live requested tab is `1`, so the close is expected; tabs `2/3` are the valid table candidates.
- **Mode clue**: live `FUN_004fd7a0` requested mode `1`, which drives `FUN_004f6680(1)`. The static mode2 branch would call `FUN_004f6680(3 - bVar9)`, i.e. a valid tab `2` or `3`. The next problem is therefore why the natural post-load HUD/category mode is still requesting tab/mode `1`, not simply whether `0x0356` exists.
- **Click result**: full watcher after world saw 403 samples each for `selection-primary-0` and `selection-secondary-0`; all were event kind 2 with `retvalLow8=0`, controller `+5=0`, row `flag15=1`, and `b00=0`. Selection-row click produced `0x0f08/0x0f09`, but no `0x0b01`/`0x0b07`.
- **Server lever boundary**: `LOGH_ACTION_LIST_CATEGORY`, `LOGH_ACTION_LIST_SEATS`, and `LOGH_POSTLOAD_ACTION_LIST_SEATS` are real server levers in `server/src/server/logh7-login-session.mjs`; they alter action-list seat/category bytes in `0x0323`/`0x0356`. They are not yet proven to alter the client UI tab index that selected invalid tab 1. Treat category A/B as the next live discriminator, not as a solved fix.
- **dgVoodoo/logo note**: this session's start receipt again reported the sharp no-logo sidecar config (`dgVoodooWatermark=false`, `3DfxWatermark=false`, `3DfxSplashScreen=false`, `ScalingMode=centered`, `Resampling=pointsampled`, `Filtering=appdriven`, `Antialiasing=off`), and inspected screenshots showed no logo.
- **Next target**: run a narrow A/B with `LOGH_ACTION_LIST_CATEGORY` values only if it is documented as a discriminator, while hooking `FUN_004fc4a0`, `FUN_004fd100`, `FUN_004fd7a0`, `FUN_004f6040`, `FUN_004f6680`, `FUN_004f68f0`, and the root writers. Pass condition is natural `FUN_004f6680(2/3)` or selection root `+4/+5` staying open long enough for `listSelected189 -> command.activeGate04 -> 0x0b01`.

## ★★★★★ C002 root-gate live + dgVoodoo no-logo confirmation (2026-06-28, journal #34)
- **Latest note**: journal #34 re-ran the C002 discriminator on the installed canonical playable EXE, SHA `98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc`, with preseed off. `0x0356` and `PLAYER_INFO+0x270` still fill the selection list, but the selection/controller root remains closed, so no user-originated `0x0b01` appears yet.
- **Canonical live session**: `.omo/ui-explorer/c002-rootgate-98ca-20260628`, launched via `RE/tools/logh7_ui_explorer.py` from the installed game EXE path, not an isolated overlay EXE. Env included `LOGH_POSTLOAD_RICH_CHARACTER=1`, `LOGH_POSTLOAD_ACTION_LIST_SEATS=1`, `LOGH_STRAT_GALAXY=1`, `LOGH_STRAT_GRID_EARLY=1`, `LOGH_STRAT_TERRAIN=1`, `LOGH_WORLD_PLAYER=1`, `LOGH_FULL_UNIT_LOCATION=1`, `LOGH_GRID_ENTER=1`. `LOGH_PRESEED_PLAYER_CHAR` was not used.
- **World/data proof**: natural character creation created character `2` and reached world entry. Trace included `0x0204`, `0x0325`, `0x0b0a`, and `0x0356 compact-0356`; the `0x0356` record carried `recordSeatCount250=1`, `recordSeatChar254=2`, `recordSeatRole258=0`.
- **Snapshot proof**: `selectgrid-snapshot-rootgate.jsonl` showed `fieldMode126711=2`, `gridActive126710=1`, `worldActive2a58f8=65537`, `focusChar3584a0=2`, `unitCount41a364=1`, `selection.listPage187=1`, `selection.listCount188=1`, `payloadCount270=1`, `currentPayloadCount270=1`, one primary/secondary selection row, and `command.rowCountD4=24`. The data path is filled.
- **Root-gate live result**: `logh7_hud_hit_test_gate_watch.py` recorded 1102 selection row `FUN_005015f0(2, row, ...)` samples. All returned `retvalLow8=0`; row `flag15=1`, event keys were empty, and the selection controller/root state was `gate04=0`, `gate05=0`. No `selectionImportApply`, `selectionTabApply`, or `hudModeSet` calls occurred while the watcher was attached, so no late `FUN_004f6680`/`FUN_004fd7a0` reopened the root.
- **Click result**: selection-row click produced `0x0f08 -> 0x0f09`, but no `0x0b01`/`0x0b07`. Command-row click produced no movement trace. `listSelected189`, `command.selectedD5`, and `command.categoryD6` stayed closed.
- **Static RE consolidation**: `FUN_005015f0` event kind 2 first checks target `+8`, queued-event fast path, controller/root `+5`, target `+0x15`, geometry/occlusion, then final click pulse `target+0xb00` near VA `0x005018cd`. `FUN_004f6600` selects a row only after this succeeds and writes `selectionList+0x624`; `FUN_004f58c0` scans command rows only when active command root `+4` is open. Current live failure is before row selection and before SelectGrid factory dispatch.
- **Subagent consensus**: the natural path is `0x0356 -> FUN_004f68f0 -> FUN_004f6600 -> FUN_004f6b00/FUN_004f5cb0 -> FUN_004f58c0 -> FUN_004f93c0 -> FUN_00581c80 -> FUN_005737d0 -> FUN_004b78a0 case 0x3a -> 0x0b01`. The current missing producer is the event/controller/root opening path (`FUN_005024b0`/`FUN_00502ea0`/`FUN_00507f20`), not `0x0356` data fill.
- **dgVoodoo logo answer**: canonical installed path is already configured with `dgVoodooWatermark=false`, `3DfxWatermark=false`, `3DfxSplashScreen=false`, and `WatermarkDisplayDuration=1`; the rootgate start receipt also reported the sharp borderless preset (`ScalingMode=centered`, `Resampling=pointsampled`, `Filtering=appdriven`, `Antialiasing=off`). If a logo appears, the likely cause is launching from a cwd that does not load the installed `D3D8.dll` + `dgVoodoo.conf` sidecars.
- **Closure**: `ui_explorer stop` restored and verified canonical playable SHA `98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc`. Final checks showed no `G7MTClient` and no `47900` listener.
- **Next target**: attach before or exactly at `0x0356` import to catch the first `FUN_004f68f0`/`FUN_004f6680` root-open timing, then hook `FUN_00507f20`, `FUN_00502510`, `FUN_005024b0`, `FUN_00502ea0`, `FUN_004fd100`, `FUN_004f5cb0`, `FUN_004f58c0`, and `FUN_004f93c0` until either `listSelected189` changes or the exact missing root/open producer is proven.

## ★★★★★ C002 postload action-list seats proof + next UI admission wall (2026-06-28, 저널 #29)
- **Previous note**: journal #33 recorded the dgVoodoo no-logo/sharp generator fix and the canonical C002 latch live run. `0x0356`/`PLAYER_INFO+0x270`/selection rows were filled, but selection rows still returned false in `FUN_005015f0` and command root `+4/+5` stayed closed; no user-originated `0x0b01` appeared.
- **Canonical live session**: `.omo/ui-explorer/c002-postload-seats-98ca-20260628`, launched through `RE/tools/logh7_ui_explorer.py` with the installed game EXE path and canonical playable SHA `98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc`. No `LOGH_PRESEED_PLAYER_CHAR` was used. Natural create-character flow created character `2` (`TEST S028 / FLAG`) and reached post-load world entry.
- **Critical env delta**: this run added `LOGH_POSTLOAD_ACTION_LIST_SEATS=1` together with `LOGH_POSTLOAD_RICH_CHARACTER=1`, `LOGH_STRAT_GALAXY=1`, `LOGH_STRAT_GRID_EARLY=1`, `LOGH_STRAT_TERRAIN=1`, `LOGH_WORLD_PLAYER=1`, `LOGH_FULL_UNIT_LOCATION=1`, `LOGH_GRID_ENTER=1`. This proves the prior #28 run was missing the action-list seat lever, not the rich `0x0356` lever itself.
- **RE correction**: `FUN_004f68f0` imports the PLAYER_INFO pointer, stores it at selection-list `+0x18a`, then reads `*(payload+0x270)` into `selectionList[0x188]`. `FUN_004f6040` can build slot `0x67`, but the live row count is overwritten by this `payload+0x270` value. In server code, the existing lever is `LOGH_POSTLOAD_ACTION_LIST_SEATS=1` (or related explicit action-list seat/category env), not merely `LOGH_POSTLOAD_RICH_CHARACTER=1`.
- **Live data proof**: post-load trace sent `0x0356 compact-0356` with `recordSeatCount250=1`, `recordSeatChar254=2`, `recordSeatRole258=0`. SelectGrid snapshot `postload-seats-before-clicks` showed `fieldMode=2`, `focusChar=2`, `unitCount=1`, `listCount188=1`, `payloadCount270=1`, `currentPayloadCount270=1`, and one `0x67` selection row. This is the first canonical no-preseed proof that `PLAYER_INFO+0x270` and active selection row count can be filled.
- **Click/admission result**: after info-panel, command-oval, own-cell, selection-row, and command-button coordinate probes, trace still had `0x0b01=0`, `0x0b07=0`, `0x0f08=5`, `0x0f09=5`, `0x0356=1`. Snapshots stayed `listSelected189=-1`, `command.selectedD5=-1`, `command.categoryD6=-1`; map selection cells changed, but fleet/command admission did not.
- **HUD watcher result**: `logh7_hud_admission_watch.py` reached `MAX_EVENTS=24000`. It saw `selectionHitTest` and `commandRowHit` every frame, but `command-row-*` target roles were never hit. `FUN_004f58c0` RE explains why: it only loops command rows when `*(activeCommandRoot+4) != 0`; live `command.activeGate04=0`, `activeGate05=0`, `rowCountD4=24`. Selection targets were present but `FUN_005015f0(..., selection-primary/secondary)` returned false, so `listSelected189` never became `0`.
- **Tooling/server update**: `server/src/server/logh7-auth-server.mjs` now logs `recordSeatCount24c` for fixed `0x0323`, while keeping `recordSeatCount250` for compatibility. This records the RE distinction: `0x0323` seat/card count is at raw `+0x24c`; `0x0356` compact stream expands to native object count at `+0x250`. Verified with `cd server; node --test tests/server/logh7-login-session.test.mjs tests/server/logh7-server.test.mjs` = 146/146 PASS.
- **Conclusion**: C002 is no longer blocked by missing `0x0356`, slot `0x67`, or `PLAYER_INFO+0x270`. The remaining wall is client UI admission: why the visible/created selection row does not hit-test into `listSelected189`, and why the command root stays inactive (`activeGate04=0`) so command rows cannot dispatch into `FUN_004f93c0` / `FUN_00581c80` / `FUN_005737d0`. Next RE target: `FUN_005015f0` coordinate/parent transform (`FUN_00501d60`, `FUN_00502060`, `FUN_005025f0`) and the caller that flips command root `+4`.
- **dgVoodoo note**: active installed config/code already disables the logo with `dgVoodooWatermark=false`, `3DfxWatermark=false`, `WatermarkDisplayDuration=1`. If the logo is visible, the likely cause remains launching an isolated overlay EXE or wrong cwd without the installed sidecar `D3D8.dll` + `dgVoodoo.conf`; no safe static D3D8 watermark byte patch is available because the wrapper is packed.
- **Closure**: `ui_explorer stop` restored and verified canonical playable SHA `98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc`. Final checks showed no `G7MTClient`, no session `node`, no `47900` listener, and installed/overlay EXEs both matched the canonical SHA.

## ★★★★★ dgVoodoo no-logo sharp generator + C002 latch live (2026-06-28, journal #33)
- **dgVoodoo logo answer**: canonical installed/game-EXE path shows no dgVoodoo logo. Live screenshot `.omo/ui-explorer/c002-latch-loop-98ca-20260628/shots/006-logo-recheck-live.png` has no bottom-right watermark. Active config had `dgVoodooWatermark=false`, `3DfxWatermark=false`, `3DfxSplashScreen=false`, and `WatermarkDisplayDuration=1`; dgVoodoo's own comment says `0`/undefined means infinite duration if a watermark is enabled, so `1` is intentional.
- **Blur regression found/fixed**: `RE/tools/logh7_dgvoodoo_nowatermark.py` still generated the old `stretched/lanczos-3/Filtering=16/Antialiasing=4x` remaster preset. That could reintroduce the exact blurry 2D UI/font path while removing the logo. It now matches `ui_explorer` and `LOGH7Launcher`: `FullScreenMode=false`, `ScalingMode=centered`, `Resampling=pointsampled`, `WindowedAttributes=borderless`, `FullscreenAttributes=fake`, `Filtering=appdriven`, `Antialiasing=off`, `RTTexturesForceScaleAndMSAA=false`, `SmoothedDepthSampling=false`.
- **Descriptor/test update**: `RE/tools/client_patches/dgvoodoo-nowatermark.json` was rewritten as readable ASCII and now documents `sharpBorderless`. New test `RE/tools/tests/test_logh7_dgvoodoo_nowatermark.py` locks the no-logo + sharp preset. Verification: `cd RE; python -m json.tool tools/client_patches/dgvoodoo-nowatermark.json`, `python -m py_compile tools/logh7_dgvoodoo_nowatermark.py`, and `python -m unittest tools.tests.test_logh7_dgvoodoo_nowatermark tools.tests.test_logh7_ui_explorer` = 18/18 PASS. Generator output reports `watermarkOff=PASS`, `sharpBorderless=PASS`, SHA `0622de26d90d325046be2b8af8ba552e2aca85b4e292dfdf6b096a176c5aa6b9`.
- **Canonical C002 live**: session `.omo/ui-explorer/c002-latch-loop-98ca-20260628` used installed `G7MTClient.exe` restored from canonical playable SHA `98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc`. No `LOGH_PRESEED_PLAYER_CHAR` was present. Env included `LOGH_POSTLOAD_RICH_CHARACTER=1`, `LOGH_POSTLOAD_ACTION_LIST_SEATS=1`, `LOGH_STRAT_GALAXY=1`, `LOGH_STRAT_GRID_EARLY=1`, `LOGH_STRAT_TERRAIN=1`, `LOGH_WORLD_PLAYER=1`, `LOGH_FULL_UNIT_LOCATION=1`, `LOGH_GRID_ENTER=1`.
- **World/data proof**: lobby -> game start -> character card entered world. Trace included `0x0f02`, `0x0f06/0x0f07`, `0x0b09/0x0b0a`, and `0x0356 compact-0356` once. Snapshot `selectgrid-snapshot-world.json` showed `fieldMode126711=2`, `gridActive126710=1`, `worldActive2a58f8=65537`, `selection.listCount188=1`, `payloadCount270=1`, `payloadCount270U8=1`, one primary/secondary selection row, and `command.rowCountD4=24`.
- **Latch/gate live result**: `hud-hit-test-gates-live.jsonl` recorded `selection-primary-0=135` and `selection-secondary-0=135` `FUN_005015f0` samples. All had `gate05=0`, `flag15=1`, empty event queue keys, no `hasEvent2`, and `retvalLow8=0`. `hud-event-queue-live.jsonl` saw dequeue codes `2/9/11/13`; the only enqueue was event `22`, not SelectGrid move. `hud-admission-live.jsonl` kept `selection.listSelected189=-1`, `command.selectedD5=-1`, and `command.categoryD6=-1`. No `0x0b01`/`0x0b07` appeared.
- **Runtime caveat**: after the first selection-row click the client process closed before the remaining command click sequence could run (`client window not found for pid 10108`). The watcher logs were complete and cleanup-free, so the session still gives useful evidence up to the failure. The client close itself is a separate stability datum to reproduce only after the gate path is better isolated.
- **Closure**: `ui_explorer stop` returned `shaVerified:true`, restored SHA `98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc`. Final checks showed no `G7MTClient`, no server PID `4344`, no `47900` listener, and installed/overlay game EXEs both matched the canonical SHA.
- **Next RE target**: selection rows do enter `FUN_005015f0` but remain event-queue/controller closed. Find the producer that should call `FUN_005024b0`/`FUN_00501e30` or otherwise open the controller/event path for selection rows, then the caller that flips command root `+4` (`FUN_00502ea0`) so `FUN_004f58c0` can scan command rows.

## ★★★★★ C002 admission discriminator: 0x67 exists, active selection still empty (2026-06-28, 저널 #28)
- **Canonical live session**: stopped `.omo/ui-explorer/c002-admission-discriminator-98ca-20260628` cleanly. `ui_explorer stop` returned `shaVerified:true`, restored SHA256 `98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc`, kind `canonical-playable`. Final process/port check showed no `G7MTClient`, no `node`, and no `47900` listener; installed and overlay game EXEs both matched the same canonical SHA.
- **No-preseed path preserved**: session used no `LOGH_PRESEED_PLAYER_CHAR`; it entered via natural create-character flow and reached `0x0204`, `0x0325`, `0x0b0a`, `0x0356`. `0x0356` was `compact-0356`, character `2`, `recordGridUnit24Le=1`, `recordGridUnit28Le=1`.
- **Click discriminator result**: trace has two `0x0f08 -> 0x0f09` pairs and no `0x0b01`. SelectGrid snapshots before/after every click stayed `fieldMode126711=2`, `focusChar3584a0=2`, `unitCount41a364=1`, `command.rowCountD4=24`, `selectedD5=-1`, `categoryD6=-1`, `selection.listCount188=0`, `payloadCount270=0`, `payloadCount270U8=0`, `rows=[]`.
- **Watcher evidence**: `hud-admission.jsonl` saw `hudGate`, `selectionHitTest`, and `commandRowHit`, but no `selectionImport`, `commandBuild`, `factoryDispatch`, or `selectGridFactory` runtime calls. `selectgrid-state.jsonl` saw two `sendCorrelator-004b78a0` entries, both `arg2=48 (0x30)`, not movement case `0x3a`; command row state stayed inactive.
- **Tooling update**: `RE/tools/logh7_selectgrid_state_watch.py` now emits `dispatchCaseInfo(arg2)` so future logs label `0x30` as the observed info path and `0x3a` as the grid-move case (`0x0b01` request / `0x0b07` response). Verified with `python -m py_compile tools/logh7_selectgrid_state_watch.py` and `python -m unittest tools.tests.test_logh7_selectgrid_state_watch` = 2/2 PASS.
- **Conclusion**: current C002 blocker is no longer "0x0356 missing" or "slot 0x67 null". It is the admission/import step from the existing unit-list/HUD state into active selection and SelectGrid command factory. Next RE target: why `FUN_004f68f0`/`FUN_004f5cb0`/`FUN_004f93c0`/`FUN_00581c80` are not reached from `FUN_004f6600`/`FUN_004f58c0` despite one owned unit and a populated command table.

## ★★★★★ dgVoodoo logo removal recheck + official launcher rebuild (2026-06-28, 저널 #27)
- **Live logo check on canonical game EXE**: ran `.omo/ui-explorer/dgvoodoo-logo-check-98ca-20260628` through `RE/tools/logh7_ui_explorer.py` with `--display-mode borderless --no-login`. The harness copied canonical playable `G7MTClient.playable.exe` into installed `exe/G7MTClient.exe` and launched it from installed/exe. Both game EXEs stayed SHA256 `98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc`.
- **Result**: screenshots `shots/001-initial.png` and `shots/002-logo-after-10s.png` show the login screen with no bottom-right dgVoodoo watermark. `dgVoodoo.conf` receipt was `FullScreenMode=false`, `ScalingMode=centered`, `Resampling=pointsampled`, `WindowedAttributes=borderless`, `FullscreenAttributes=fake`, `WatermarkDisplayDuration=1`, `dgVoodooWatermark=false`.
- **Stop/restore**: first stop hit transient `WinError 1224` while copying the EXE back after the process exited; immediate state check already showed no `G7MTClient`, no port `47900`, and both EXE hashes restored. A second `ui_explorer stop` completed with `shaVerified:true`.
- **Official launcher binary**: source `RE/tools/launcher/LOGH7Launcher.cs` already defaulted to `DefaultDisplayMode="borderless"` and writes the same no-watermark/sharp dgVoodoo keys. Recompiled installed `LOGH7Launcher.exe` directly with PowerShell `Add-Type` because the full player-runtime builder still failed on missing `RE/content/logh7-content.db` at that time. The launcher binary SHA was treated only as compile-output evidence; `LOGH7Launcher.exe --check` and `--client-smoke` both exited 0.
- **Current config after launcher smoke**: installed `exe/dgVoodoo.conf` has `FullScreenMode=false`, `ScalingMode=centered`, `Resampling=pointsampled`, `WindowedAttributes=borderless`, `FullscreenAttributes=fake`, `Filtering=appdriven`, `Antialiasing=off`, `RTTexturesForceScaleAndMSAA=false`, `SmoothedDepthSampling=false`, `3DfxWatermark=false`, `3DfxSplashScreen=false`, `dgVoodooWatermark=false`. Old `WatermarkDisplayDuration=0` remains only in backup conf files, not active code/config.
- **Next**: if a logo is still visible to the user, the likely path is launching `G7MTClient.playable.exe` directly from the overlay folder or another cwd without the installed `D3D8.dll` + `dgVoodoo.conf` sidecars. Diagnostics should keep using installed `exe/G7MTClient.exe` or the rebuilt `LOGH7Launcher.exe` path, not an isolated overlay EXE.

## ★★★★★ C002 0x67 생성 live 확정 + 블로커 후단 이동 (2026-06-27, 저널 #26)
- **no-preseed natural live 성공**: canonical 98ca 세션 `.omo/ui-explorer/c002-slot67-watch-98ca-20260627`를 preseed 없이 실행했다. 기존 `dummy:1`은 `0x2004` trace에는 있었지만 카드 UI가 비어 보여, ASCII `create-character` 플로우로 `TEST C002 / FLAG` characterId `2`를 자연 생성했다. `0x1008` category `0..4` 모두 `createAccepted:true`, 이후 world-entry와 `0x0204/0x0325/0x0b0a/0x0356`까지 확인했다.
- **mode/R1 상태**: R1 probe 결과 `selector_35f35a=0`, `selectedChar_3584a0=2`, `mode_byte_126711=2`, `own_cell_11178=2588`. `0x0356`는 `recordId04Le=2`, `recordGridUnit24Le=1`, `recordGridUnit28Le=1`.
- **0x67 생성 가설 반증**: 보강 `logh7_hud_lifecycle_watch.py`가 1025개 이벤트를 남겼다. `unitListPanelBuild 0x004f6040` 1회, `widgetListCreate 0x004fe890 slotId=0x67` 1회(`retval=0xf230918`), `widgetSlotLookup 0x0050cf40 idx=0x67` 878회(`retval=0xf230918`)를 live로 확인했다. 즉 "0x67 슬롯이 null이라 C002가 안 된다"는 이 세션 기준 반증됐다.
- **새 블로커 위치**: post-world `logh7_selectgrid_snapshot`은 `unitCount41a364=1`, `char0.id00=2`, `unit0.id00=1`이지만 active selection은 `listCount188=0`, `payloadCount270=0`, `payloadCount270U8=0`, `rows=[]`였다. own-cell click은 trace 없음, 우하단 `소속 함대` panel click은 `0x0f08` request / `0x0f09` response만 만들었다. trace 전체 `0x0b01` 검색은 출력 없음.
- **결론/다음**: C002 프런티어는 `0x0356` 송신 또는 `0x67` 생성이 아니라, 생성된 0x67/list가 post-world active selection payload/command row/SelectGrid submode latch로 이어지지 않는 후단이다. 다음 RE/live 대상은 `FUN_004f68f0`, `FUN_004f6600`, `FUN_004f5cb0`, `FUN_004f58c0`, `FUN_004f93c0`, `FUN_005015f0`, `FUN_00581c80`, 그리고 `FUN_005737d0` 호출자다.
- **정리**: stop 결과 `shaVerified:true`, restored SHA `98ca4acd...`. 마지막 확인에서 `G7MTClient` 프로세스와 `47900` listener 없음. installed/overlay EXE SHA 모두 `98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc`.

## ★★★★★ 한글 입력 movzx 반증 + C002 0x67 watcher 보강 (2026-06-27, 저널 #25)
- **한글 입력 live 반증**: canonical 98ca 세션 `.omo/ui-explorer/hangul-name-movzx-98ca-20260627`에서 no-preseed + runtime `charsel-recenter` + 신규 `input-edit-char-movzx`를 적용했다. `FUN_004fff60`의 VA `0x004fff65` / file `0x000fff65`에서 `0f be 06 -> 0f b6 06` 메모리 patch OK를 확인했다. 그러나 `text 라인`은 여전히 blank(`shots/009-hangul-lastname-after-movzx.png`)였고 ASCII `TEST`는 정상 표시(`shots/010-ascii-after-movzx.png`)됐다. 결론: `movsx->movzx`는 standalone fix가 아니며, 실제 블로커는 `FUN_004e7200`의 `WM_CHAR` 1바이트 truncate, `WM_IME_CHAR` no-append, `FUN_004ffcd0` single-byte append 쪽이다. stop으로 SHA `98ca4acd...` 복원 검증.
- **문서화**: `docs/logh7-korean-name-input-re-2026-06-27.md`에 live `movzx` 음성 결과를 추가했다. `docs/logh7-session-2026-06-27-canonical-playable-c002-mp-font-audit.md`에는 행동 #44~#46으로 descriptor, 세션, screenshot, watcher 보강, 검증 결과를 기록했다.
- **C002 watcher 보강**: `RE/tools/logh7_hud_lifecycle_watch.py`가 이제 read-only로 `0x004f6040` unit-list panel build, `0x004fe890` slot `0x67` widget/list create, `0x0050cf40(idx=0x67)` slot lookup을 직접 잡는다. `payload+0x270`은 S32와 U8을 같이 기록하고, `slot67ByFormula`/`slot67ByLegacyOffset` 둘 다 남겨 오프셋 혼선을 피한다. `RE/tools/logh7_selectgrid_snapshot.py`와 `RE/tools/logh7_hud_admission_watch.py`에도 `payloadCount270U8` 계열 필드를 추가했다.
- **검증**: `cd RE; python -m py_compile tools/logh7_hud_lifecycle_watch.py tools/logh7_selectgrid_snapshot.py tools/logh7_hud_admission_watch.py` PASS. `cd RE; python -m unittest tools.tests.test_logh7_hud_lifecycle_watch tools.tests.test_logh7_selectgrid_snapshot tools.tests.test_logh7_hud_admission_watch` = 10/10 PASS.
- **다음 live**: canonical 98ca, no blanket node kill, no `LOGH_PRESEED_PLAYER_CHAR` 기본, `LOGH_POSTLOAD_RICH_CHARACTER=1`, mode2 유지, world-entry 전에 보강 watcher 선부착. 목표는 `0x0356` 수신 뒤 `0x004f6040`이 실제 호출되는지, `0x004fe890(slot=0x67)`이 생성되는지, `0x0050cf40(idx=0x67)` 반환이 null인지 non-null인지 live trace로 확정하는 것이다.

## ★★★★★ no-preseed 캐릭터 생성 UI/한글 입력/launcher 기본 borderless 재점검 (2026-06-27, 저널 #24)
- **정식 EXE 기준 유지**: 이번 live 진단도 설치 트리 `RE/.omo/work/logh7-installed/exe/G7MTClient.exe`와 overlay canonical `RE/.omo/work/logh7-ko-overlay/exe/G7MTClient.playable.exe` SHA256 **`98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc`**만 기준으로 했다. 모든 세션 stop 후 `shaVerified:true`, 마지막 확인에서 `G7MTClient` 프로세스와 `47900` listener 없음.
- **preseed 제거 방향 재확인**: `LOGH_PRESEED_PLAYER_CHAR`는 off-default이고 launcher/default에는 없다. no-preseed live에서 보인 `dummy:1`은 preseed가 아니라 기존 account profile 잔존이므로, 진짜 signup-first 검증은 fresh account 또는 account-db 격리로 해야 한다.
- **현재 native lobby 좌표 보정**: no-preseed 세션 `.omo/ui-explorer/nopreseed-create-input-20260627`에서 기존 `새 캐릭터 작성` 좌표 `(155,305)`는 빈 공간이었다. live 기준 버튼은 `(574,407)`, session row1 중심은 `(1090,425)`로 보정했고 `RE/tools/logh7_ui_flow.py`와 `test_create_character_uses_current_native_lobby_coordinates`에 반영했다. `python -m unittest tools.tests.test_logh7_ui_explorer` = 17/17 PASS.
- **캐릭터 생성 UI 상태**: canonical 98ca 원본 name screen은 screenshot `shots/035-maybe-name-screen-current.png`에서 성/이름 입력 패널이 오른쪽 배경 밖으로 밀렸다. `charsel-recenter`를 디스크 후보로 빌드한 SHA `253f27778aa86ad11b9d34e7fa29aaf7d62134473b686b42af227cbe35f5f1d4`는 WinError 4551/Code Integrity로 live blocked. 대신 신규 `RE/tools/logh7_runtime_patch_apply.py`로 live canonical 98ca 프로세스 메모리에 `charsel-recenter`를 적용해 38/38 patch OK를 확인했다.
- **runtime charsel-recenter 판정**: mempatch 세션 `.omo/ui-explorer/charsel-mempatch-98ca-20260627`에서 세션 선택/이름 입력 패널은 배경 안으로 들어왔다(`shots/003-new-character-mempatch.png`, `shots/014-mempatch-name-screen-newpos.png`). 그러나 patch는 broad 38-site이고 descriptor/live 라디오 X 불일치가 남아 DEFAULT_STACK 승격은 보류한다. 디스크 canonical 98ca는 바꾸지 않았다.
- **한글 입력 판정**: 같은 이름 입력 field에서 ASCII `TESTABC`는 보였지만(`shots/022-ascii-lastname.png`), `ui_explorer text`의 CP949/WM_CHAR 한글과 직접 `SendInput(KEYEVENTF_UNICODE)` 한글은 보이지 않았다(`shots/019-mempatch-korean-name-entered.png`, `shots/024-024-after-unicode-sendinput.png`). 즉 좌표/field focus/폰트가 아니라 캐릭터 생성 edit widget의 IME/문자 수집 경로 문제다. `docs/logh7-korean-name-input-re-2026-06-27.md`에 `FUN_004e7200`, `FUN_004fff60`, `FUN_004ffcd0`, `FUN_00516bf0` 디컴파일과 raw bytes를 기록했다. 핵심은 `WM_IME_CHAR`는 append하지 않고, `WM_CHAR`는 1바이트 truncate + `movsx` 검증 + single-byte append를 탄다는 점이다.
- **dgVoodoo 로고/흐림 후속**: current conf는 `WatermarkDisplayDuration=1`, `dgVoodooWatermark=false`, borderless sharp setting으로 확인. 하네스 기본이 borderless인데 launcher 기본이 fullscreen이라 정식 실행이 더 흐릴 수 있어 `RE/tools/launcher/LOGH7Launcher.cs`의 `DefaultDisplayMode`를 `borderless`로 맞췄다. `Select-String`으로 default/display watermark 값 확인. `test_client_package_client`는 현재 checkout의 `client` package 부재로 import fail, `test_logh7_installed_tree`는 기존 `RE/content/logh7-content.db` 부재로 fail.
- **MP/C002 우선순위 유지**: proper MP의 기준은 strict-auth 2~4 real clients, faction split, world-entry, user-originated command, server-authoritative processing, persistence proof다. 현재 C002는 `0x0356` 송신 확인 뒤 `0x67` unit-list/HUD admission 미확인이 남은 핵심 블로커다. 다음 live는 fresh account/no-preseed로 가능한 한 자연 캐릭터 생성 경로를 보되, C002는 canonical 98ca + `LOGH_POSTLOAD_RICH_CHARACTER=1` + `logh7_hud_lifecycle_watch.py` 선부착으로 `FUN_004fc4a0/FUN_004fd7a0/FUN_004f6680`과 slot `0x67`을 잡는다.

## ★★★★★ dgVoodoo 로고/보더리스 선명도 A/B + launchable canonical 98ca 고정 (2026-06-27, 저널 #23)
- **정식 실행 기준 재갱신**: launchable canonical playable은 `.omo/work/logh7-ko-overlay/exe/G7MTClient.playable.exe` / `.omo/work/logh7-installed/exe/G7MTClient.exe` / `.omo/work/logh7-installed/exe/G7MTClient.exe.uiexplorer` 모두 SHA256 **`98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc`**로 맞췄다. stack은 `font-atlas-face`, `font-readable-size`, `lobby-res`, `lobby-native-layout-v2` 포함, `charsel-recenter`는 `verifiedFlag=false`와 최신 라디오 패널 값 불일치 때문에 DEFAULT에서 제외하고 후보로 보류했다.
- **dgVoodoo 로고 제거 실증**: `.omo/ui-explorer/borderless-sharp-98ca-20260627` live에서 canonical 98ca EXE를 borderless로 실행했고, screenshot `shots/001-after-login.png`, `shots/002-lobby-wait.png` 모두 우하단 dgVoodoo 로고가 보이지 않았다. `WatermarkDisplayDuration=0`은 "무한 표시"라 false가 무시될 때 로고가 계속 남는 조건이었으므로 `ui_explorer`, no-watermark 생성기, `logh7_graphics_config --no-watermark`, C# launcher 모두 `WatermarkDisplayDuration=1`로 고정했다.
- **보더리스 선명도/비율 수정**: borderless는 dgVoodoo `FullScreenMode=false`, `ScalingMode=centered`, `Resampling=pointsampled`, `Filtering=appdriven`, `Antialiasing=off`, `RTTexturesForceScaleAndMSAA=false`, `SmoothedDepthSampling=false`로 바꾸고, 창 자체를 16:9 aspect-fit으로 배치한다. live 모니터 1920x1200에서 windowRect `[0,60,1920,1140]`, clientRect `[0,0,1920,1080]` 확인. 로비 UI는 중앙 배치, 2D 텍스트/패널 blur는 기존 stretched/lanczos/AA보다 줄어든 상태로 확인.
- **폰트 크기 판정**: `font-readable-size`는 raw-byte로 primary GDI `VA 0x004ea1c6/file 0x000ea1c6: 6a0c -> 6a0e`, D3D atlas `VA 0x004b0869/file 0x000b0869: 25feff0000 -> 83c0019090`를 적용해 12px-ish→14px-ish. 16px-ish 후보(`6a10`, `83c0039090`)도 빌드해 SHA `e49749a9a825c8599a414bf6fdb23e99d40ad4cb8ba89df4608c3c8960286edc`까지 만들었지만 Smart App Control/Code Integrity가 unsigned EXE 실행을 차단해 live 검증 불가. 실행 가능한 정식 기준을 우선해 98ca(14px-ish)로 되돌렸다.
- **검증/정리**: `python -m unittest tools.tests.test_logh7_client_exe tools.tests.test_logh7_ui_explorer` = 24/24 PASS. `test_logh7_installed_tree`는 기존처럼 `RE/content/logh7-content.db` 부재로 첫 케이스 실패(이번 변경 회귀 아님). 임시 서명 cert/테스트 EXE는 삭제했고, 고아 ui_explorer node PID 23704도 command line 확인 후 개별 종료했다. 마지막 확인에서 node/G7MTClient 프로세스 없음.
- **다음**: 폰트 16px 후보는 Smart App Control/서명 정책을 먼저 해결해야 live 판정 가능. C002는 다시 canonical 98ca, no-preseed 기본, `LOGH_POSTLOAD_RICH_CHARACTER=1`로 `0x67` unit-list/HUD lifecycle 확인으로 복귀한다.

## ★★★★★ 폰트 raw-byte 재검증 + atlas face 패치 + 입력경로 분리 (2026-06-27, 저널 #22)
- **canonical playable 기준 SHA 갱신**: 정식 진단/유저/어드민 EXE는 계속 `.omo/work/logh7-ko-overlay/exe/G7MTClient.playable.exe` / `.omo/work/logh7-installed/exe/G7MTClient.exe` 단일 기준으로 유지한다. 다만 DEFAULT_STACK에 신규 `font-atlas-face` 패치를 추가해 canonical playable SHA가 `992dc7e25c4d7c3c982f1d2e6d9de904c733208ae9b28ddab162ef51aa076a0c`에서 **`a7f4f80ff334cf01b81df1f5cfe75366f480400d373355e6631be01bb038f5a8`**로 갱신됐다. 설치 EXE, `.uiexplorer`, overlay playable 모두 같은 SHA로 동기화했다.
- **폰트 raw-byte 정정**: 기존 문서/skill의 "전역 face 슬롯 하나" 판정은 불완전했다. primary GDI UI face는 `VA 0x0077402c/file 0x0037402c = Pretendard`였지만, 별도 D3D glyph atlas face가 `VA 0x0076e240/file 0x0036e240 = b1 bc b8 b2 00...`(CP949 `굴림`)로 남아 있었다. `FUN_004b07c0`의 원시 명령 `bf 40 e2 76 00`(`mov edi,0x0076e240`)과 `FUN_004b0960`의 `CreateFontA(..., face=object+8)` 경로를 확인했고, 코드 포인터 패치 대신 더 좁은 데이터 패치 `font-atlas-face`로 `0x0076e240` 슬롯을 `Pretendard`로 바꿨다.
- **구현/배포**: 신규 `RE/tools/logh7_encode_font_atlas_face.py`와 descriptor `RE/tools/client_patches/font-atlas-face.json` 추가. `RE/tools/logh7_build_playable_client.py` DEFAULT_STACK, `logh7_client_exe.py` SHA 상수, `logh7_installed_tree.py`, 관련 테스트 기대값을 갱신했다. 배포 중 `String.txt` merge가 손상된 installed 파일을 기준으로 삼아 5B까지 줄어드는 버그를 발견해, 원본이 비었거나 overlay보다 짧으면 overlay 전체를 쓰도록 수정했다. installed `String.txt`는 다시 866B.
- **live GDI 증거**: 정식 installed EXE를 `RE/tools/logh7_gdi_font_watch.py --spawn-exe .omo/work/logh7-installed/exe/G7MTClient.exe`로 띄워 `.omo/ui-explorer/font-gdi-after-atlas-20260627/gdi-font-spawn.jsonl`에 8초 캡처했다. `fontRegistration.attempted=true`, `ok=true`, `fontCount=57`, `loaded=135`. `font-created` 31건 모두 face=`Pretendard`, faceHex=`50726574656e6461726400`; `굴림` hex(`b1bcb8b2`)는 0건. callstack도 primary UI `0x4aee13`, atlas `0x4b0bbd` 양쪽이 Pretendard로 확인됐다. 즉 "하네스에서도 Pretendard가 아니었다"의 직접 원인은 atlas 슬롯 잔존 `굴림`이었고, EXE 기준으로 수정 완료.
- **하네스/정식 실행 차이**: 하네스는 installed tree의 `exe/G7MTClient.exe`를 cwd `installed/exe`로 실행하고 `data/`, `GraphicConfig.txt`, `D3D8.dll`, `dgVoodoo.conf`, 앱-로컬 fonts를 갖춘다. overlay의 `G7MTClient.playable.exe`만 직접 실행하면 sidecar 리소스가 빠져 UI 이미지가 깨질 수 있다. `window_parts.tga`가 과거 32bpp upscale본(4194322B)으로 바뀌어 9-slice UI를 깨던 것도 확인했고, 현재 installed tree는 원본 8bpp 크기(263186B)로 복구돼 있다.
- **남은 흐림 축**: GDI face 혼용은 live로 해결됐지만, borderless/dgVoodoo 설정(`ScalingMode=stretched`, `Resampling=lanczos-3`, `Filtering=16`, `Antialiasing=4x`, `FullscreenAttributes=fake`)은 여전히 2D UI를 부드럽게 만들 수 있다. 다음 visual A/B는 같은 `a7f4f80f...` EXE로 windowed/fullscreen/borderless, point-sampled/no-AA/app-driven filter를 비교한다.
- **한글 입력/출력/진행 분리**: 폰트 출력 문제와 입력 진행 문제는 별개다. 로그인/캐릭터 생성 automation은 ASCII `keybd_event`, 비ASCII는 CP949 byte pair를 `WM_CHAR/PostMessageA`로 보낸다. 반면 인월드/채팅 입력은 `GetAsyncKeyState`/`GetKeyboardState` 계열 polling이라 `WM_CHAR` 주입이 보이지 않을 수 있다. 기존 P0-03 RE도 채팅 송신이 `setlocale("Japanese")`→CP932 변환을 타 한글 wire가 손상되는 hazard를 이미 확정했다. 캐릭 생성 후 "안 넘어감"은 입력 텍스트 자체보다 등록 확인 다이얼로그/GenerateCharacterFinish 경로 블로커와 결합돼 있다. 사용자 방침대로 preseed는 기본 운영에서 제거하고, 필요하면 진단용으로만 명시 사용한다.
- **검증 상태**: `python -m tools.logh7_encode_font_atlas_face --selftest` PASS, `python -m unittest tools.tests.test_logh7_client_exe tools.tests.test_logh7_encode_font_face` 11/11 PASS. 확장 unittest(`test_logh7_client_exe`, `test_logh7_installed_tree`, `test_logh7_encode_font_face`)는 13/14 PASS, 1건은 `RE/content/logh7-content.db` 부재로 `PlayerRuntimeError` 발생(환경 입력 누락, 이번 패치 회귀 아님).
- **다음**: ① 한글 입력 RE는 `FUN_004e7200` WndProc/IME, `FUN_004fff60` WM_CHAR edit routing, `FUN_004ffdc0` keydown, `FUN_00516bf0` chat send/setlocale 경로를 raw byte + 디컴파일로 재확인한다. ② 캐릭 생성 finish/confirm opcode와 0x1008 후속 UI 라우터를 역추적한다. ③ 폰트/보더리스 visual A/B는 canonical installed EXE에서만 수행하고 stop으로 SHA `a7f4f80f...` 복원 검증한다. ④ C002는 #21의 `0x67` unit-list live slot 확인으로 복귀한다.

## ★★★★★ canonical playable 기준 재정렬 + C002 rich 0x0356/MP/폰트 감사 (2026-06-27, 저널 #21)
- **운영 원칙 정정**: 진단·유저·어드민 진입은 모두 정식 canonical playable EXE 기준으로만 한다. 기준 파일은 `.omo/work/logh7-ko-overlay/exe/G7MTClient.playable.exe`, 설치 실행 파일은 `.omo/work/logh7-installed/exe/G7MTClient.exe`, 둘 다 SHA256 `992dc7e25c4d7c3c982f1d2e6d9de904c733208ae9b28ddab162ef51aa076a0c`로 확인. `.omo/ghidra/bin/G7MTClient.exe`는 바닐라 RE reference, `.omo/work/logh7-ko-overlay/exe/G7MTClient.exe` 등은 중간 산출물이라 라이브 진단 기준에서 제외.
- **이번 live(C002 rich 0x0356)**: 세션 `.omo/ui-explorer/c002-rich-0356-20260627`, `--patched-exe` 없이 canonical playable launch plan 사용. env는 `LOGH_PRESEED_PLAYER_CHAR=1`, **`LOGH_POSTLOAD_RICH_CHARACTER=1`**, `LOGH_STRAT_GALAXY=1`, `LOGH_STRAT_GRID_EARLY=1`, `LOGH_STRAT_TERRAIN=1`, `LOGH_WORLD_PLAYER=1`, `LOGH_FULL_UNIT_LOCATION=1`, `LOGH_GRID_ENTER=1`, mode2 유지(`LOGH_GRID_SELECTOR_PROBE=0`, `LOGH_STRAT_SEQ_START=0`). 로비→게임시작 `(155,248)`→카드 클릭 `(883,348)`→월드 진입 성공. trace에서 `0x0f02` 및 **`0x0356` 1회** 확인(`recordWire:"compact-0356"`, `recordWireLength:161`, `recordId04Le=1`, `recordGridUnit24Le=1`, `recordGridUnit28Le=1`). R1 probe: `selector_35f35a=0`, `selectedChar_3584a0=1`, `mode_byte_126711=2`, `poller_126718=0`, `own_cell_11178=2588`. stop으로 canonical SHA 복원 검증 완료.
- **C002 현재 빈칸**: rich `0x0356` 송신은 live 확정됐지만, 클라가 그 뒤 `FUN_004fc4a0/FUN_004fd7a0/FUN_004f6680`을 통해 위젯슬롯 `0x67` unit-list를 실제 채우는지는 아직 미확정. 뒤늦은 custom Frida one-shot은 client 종료 후라 `no pid`. 다음 live는 canonical EXE로만 띄우고 `logh7_hud_lifecycle_watch.py` 계열 훅을 선부착해 `FUN_004fc4e0`, `FUN_004fc4a0`, `FUN_004fd560`, `FUN_004fd7a0`, `FUN_004f6680`, `FUN_005024b0` 호출 및 0x67 slot을 세션 중 캡처한다.
- **MP 점검**: 서버/하네스 레벨은 통과. `python -m tools.logh7_multiclient_test selftest` = 18/18 pass, `node --test tests/server/logh7-mp-fleet-visibility.test.mjs tests/server/logh7-command-engine.test.mjs tests/server/logh7-world-relay.test.mjs` = 41/41 pass. 단 이는 live EXE 2~4클라 실증이 아니므로, 다음 MP smoke는 `LOGH_AUTHORITATIVE=1 LOGH_RELAY=1 LOGH_MP_VISIBILITY=1` + canonical playable clone으로 world-entry/peer fleet visibility trace를 확인해야 한다.
- **폰트 판정**: canonical playable의 GDI face slot은 `Pretendard`지만 workspace에는 실제 `.ttf/.otf/.ttc` 폰트 파일이 없음. `RE/fonts`와 `.omo/work/logh7-installed/fonts`에는 `.gitkeep`, `OFL.txt`, `PRETENDARD-MANIFEST.json`만 있고, ui_explorer가 `fonts-not-found`를 보고하는 이유와 일치. Windows에는 Malgun Gothic이 있지만 EXE는 Pretendard를 요구하므로 fallback만 가능. 정식 해결은 EXE 교체가 아니라 Pretendard payload/설치/등록 복구 후 canonical EXE live 렌더 확인.
- **추가 live(동일 기준)**: `.omo/ui-explorer/c002-rich-0356-hudlife-20260627`도 canonical playable SHA `992dc7e2...`로 실행. `logh7_hud_lifecycle_watch.py` 선부착 후 로비→게임시작까지 성공했지만 카드 클릭 전 클라가 종료(`ECONNRESET`)되어 월드/C002 lifecycle은 미확보. stop 결과 `shaVerified:true`. 이 세션 스크린샷에서 작은 한글 폰트 흐림을 육안 확인. 설정상 `GraphicConfig=1920x1080`, screenshot `(1924,1084)`, dgVoodoo `ScalingMode=stretched`, `Resampling=lanczos-3`, `Filtering=16`, `Antialiasing=4x`, `FullscreenAttributes=fake`라 2D UI 텍스트가 후처리/스케일링으로 부드럽게 번지는 조건. 즉 폰트 문제는 **Pretendard payload 부재 + dgVoodoo stretch/filter** 두 축으로 분리해 A/B 필요.
- **정리**: 사용자 정정 전 만든 Malgun 진단 산출물은 폐기(`RE/tools/client_patches/font-face-malgun.json`, `.omo/work/G7MTClient.malgun-playable.exe`, `.omo/work/G7MTClient.malgun-playable.playable-manifest.json` 삭제). 상세 행동 기록은 `docs/logh7-session-2026-06-27-canonical-playable-c002-mp-font-audit.md`.

## ◆ 세션 진행 상태 (2026-06-26, 압축 대비 핸드오프)
**완료/전진**:
- charsel 정합: 근본=다중 패널 독립 앵커. charsel-recenter.json **38 사이트**(배경+12 step-builder+SUB+라디오패널). (A)라디오 over-move(0x595e83 X=676)로 제목·라디오·버튼 중앙 컬럼 정렬 라이브확정(shot 389, 빌드 6245c37c). **잔여(deferred)**: 라디오 미세값 육안튜닝, **(B)좌측 메뉴 근접**(메뉴=로비씬 FUN_0051c980, 라이브 far-left와 테이블 605/731 불일치→출처 라이브 trace 필요), charsel-recenter DEFAULT_STACK 승격 결정.
- 마스터 로드맵 재작성(13도메인)·mdx 하드코딩 바이트 반증(권위=galaxy.json 80성계)·메모리 정정.
- mode-dispatcher 프런티어 RE(`docs/logh7-mode-dispatcher-re-2026-06-26.md`): selector 0x35f35a writer 0건→항상 mode2. R3=서버 advance opcode 갭없음 확정→C002 근본=클라 case0 own-fleet 렌더 타이밍=**라이브 R1(real-login+read-only Frida watchpoint) 전용**.
- **리마스터 SR 자율 가동중**(background bash, ship/model 텍스처 SR --deploy, 원본백업 가역). 완료시 무결성+라이브 렌더 검증.

**와이어 교차검증 완료(2026-06-26, `docs/logh7-wire-crosscheck-2026-06-26.md`)**: 10 옵코드 서버emit↔클라파서 바이트 적대대조 → **6 완전정합**(0x0323/0x0313/0x0315/0x031d/0x2006/0x0b07)+0x031f(live). 불일치 4건 전부 LOW~MED·무해/라이브게이트: #1 0x0325 mapSection u16↔u32=emit바이트/read값 동일(무변화), #2 0x0325 tail=클라소비 라이브확인, #3 0x030b 0x36=항상0 정렬무손상, #4 0x0426 sinkByte=전투 보조게이지 값미확정(추측금지→미주입). **와이어 계층 견고성 검증됨**. 4건은 라이브 battle/render 세션으로 이관(추측없이 닫을 것 없음).

**NPC AI/갤럭시 시뮬 = 구현 확인(2026-06-26)**: `logh7-strategic-sim.mjs`(시드+strategicTick 사령관AI+전략전투)+`logh7-galaxy-adjacency.mjs`(캐논 회랑 인접) **완전 구현·배선(auth-server:1124~ LOGH_STRAT_SIM 게이트)·테스트 18+16 PASS**. "NPC AI 구현" 도메인 완료.
**★P1 그래프 단일화 = 완료(2026-06-26)**: 시뮬이 이제 캐논 회랑 토폴로지 소비. 신규 `buildCanonGraph(systems, adjacencyData)`(strategic-sim.mjs)가 `buildStrategicGraph`의 nodes+distance를 재사용하고 neighbors만 `galaxy-adjacency.json`으로 교체(인터페이스 동일=world-state API·와이어·게이트 불변). auth-server에서 `loadCanonAdjacency()`(CONTENT_DIR=../../content, 파일부재시 null→euclidean 폴백)로 로드해 1139서 주입. **검증(실데이터): 80노드 완전연결·cross-faction 엣지 4개 전부 corridor 경유(이젤론/페잔)·illegal 0·대칭·폴백 정상.** 오라클 5 신규, server 1207: **1189 pass/0 fail/18 skip**(회귀 0). 순수성 유지(I/O는 auth-server, strategic-sim은 인자로만).

## ★★ 라이브 자동 세션 — 캐릭생성→월드 블로커 재확인 (2026-06-26, 저널 #17, 사용자 입원으로 무간섭 자동구동)
- **사용자 수동로그인 불가(입원)** → ui_explorer로 전 플로우 자동구동(부트스트랩 autologin EXE 아님=실제 UI 화면 경유). 캐논 server/ 직접 지정(--server-root, buildCanonGraph 포함), 안전점검(실행 node 10개 전부 MCP/하네스=blanket kill 금지, _kill_game_processes는 게임만).
- **라이브 작동 확정**: 0x7000 로그인→0x0020 로비(블루 HUD, 한글 메뉴 완벽: 게임시작/새캐릭터작성/오리지널추첨/캐릭터삭제/세션변경/환경설정/크레딧/게임종료)→세션연결(0x2009/0x0200 world-join)→0x1008 캐릭생성(**Reinhard Lohengram, 제국, char id 2, 서버 createAccepted=True, 응답 134B**).
- **★블로커(재현가능·서버무관): 등록 확인 다이얼로그 "완료/이 캐릭터를 등록하시겠습니까?"(결정 1015,590 / 취소 1085,590)가 어떤 합성입력으로도 안 닫혀 월드진입(0x0f02) 불가.** mouse_event 클릭=0x1008 발사되나 다이얼로그 미닫힘, 하드웨어 Enter/Space(포그라운드 확정 fg-match)도 무이벤트. 캐논 server/·RE/src/server **둘 다 동일**(8× 0x1008, 0x0f02=0) → 서버 regression 아님.
- **★RE 확인**: 클라 case 0x1008(FUN_004ba2b0, "CommandGenerateCharacterCharge_O")=응답 0x20 dword(128B) 복사→`FUN_00517cd0(0x1008,payload)` 씬 라우터 전달. 서버응답 134B≥128B라 데이터 충분. 다이얼로그 닫힘=라우터의 0x1008 UI 핸들러 의존(미전이). **0x0f02는 C→S(클라 RequestGridInitialize, login-session.mjs:113)**=클라가 월드뷰 못 들어가 미발신.
- **근본 판정**: 신규캐릭 생성→월드 경로가 **인-월드/UI DirectInput 마우스 입력 프런티어**(C002 60+사이클 근본과 동형)에 막힘 — mouse_event/keybd_event가 DirectInput UI 버튼을 못 누름. journal #6 월드진입 성공은 다른 경로(기존 persisted char 세션더블클릭=생성 우회) 추정.
- **C002 R1 probe 미실행**: 월드 미진입이라 read-only Frida R1(셀렉터/selectedChar/own_cell) 못 돌림. 단 **RE 사전확인 완료**: own_cell 0x11178=base **DAT_007cd04c**(셀렉터·selectedChar의 DAT_007ccffc와 별개 객체!) → probe를 dual-base로 확장(`logh7_c002_mode_probe.py --r1`, frida 17.11). 셀렉터 0x35f35a write 0건·디스패처 FUN_004b68f0 iVar7 분기 redex 재확인 일치.
- **다음 후보**: (a) 기존-캐릭 세션더블클릭 경로(생성 다이얼로그 우회)로 월드진입 재시도 — 단 같은 마우스레이어 위험. (b) 서버가 캐릭 pre-seed→세션목록에 떠 더블클릭. (c) 등록 다이얼로그 닫힘의 클라 UI 핸들러(FUN_00517cd0 0x1008 라우팅) deep-RE. (d) DirectInput 마우스 주입(미해결 프런티어). 캐논 SHA 992dc7e2 복원·검증 2회.

## ★★★★★ 라이브 월드진입 돌파(pre-seed 우회) + C002 R1 라이브 확정 (2026-06-26, 저널 #18)
- **★생성 다이얼로그 블로커 우회 성공 = 라이브 월드진입**: 신규캐릭 등록 다이얼로그(결정)가 안 닫히는 근본을 **서버 pre-seed 레버**(`LOGH_PRESEED_PLAYER_CHAR=1`, login-session.mjs, off-default, 빈 계정에 캐논 캐릭 1개 시드)로 **완전 우회**. 흐름: 로그인→로비→**"게임 시작"(155,248)**→캐릭 카드 표시(초상화 렌더, pre-seed char가 슬롯1)→**카드 더블클릭(883,348)**→풀 월드 시퀀스 발사: **0x0200→0x0204×2→0x0f02(클라가 보냄!)→0x0f03→0x0313 그리드×2→0x0323×26 NPC시드→0x0325×2**. 전략맵 시각 렌더 확정(다색 항성·HUD·미니맵, `docs/logh7-live-world-preseed-2026-06-26.png`). server 122 pass/0 fail(레버 off-default 무영향). **= 60+사이클 막혔던 라이브 월드진입을 캐릭생성 다이얼로그 없이 신뢰성 있게 도달하는 경로 확보.**
- **★C002 R1 read-only probe 라이브 성공**(`logh7_c002_mode_probe --r1`, dual-base): DAT_007ccffc=0xf302020·DAT_007cd04c=0xf5a7918 **둘 다 해소 = own_cell이 셀렉터와 별개 base라는 내 RE 정정 라이브 검증**. 라이브 값: **selector 0x35f35a=0(mode2)·selectedChar 0x3584a0=1(pre-seed char 정상선택)·mode_byte=2·poller_126718=0·own_cell 0x11178=2588(0xa1c, 세팅됨=C002 차단값0 아님)·dispatch_latch[358374..380]=[1,1,1,1,1,0,1,1,1,1,1,1,0]**(0x358379·0x358380 미advance). mode-snap: mode2_active=0x10001·mode0_active=0·mode0_region 0/64(빈).
- **★C002 근본 라이브 재확정(실 플레이어 캐릭으로)**: 전략맵 클릭 2곳 → **0x0b01 미발생·selector/mode/own_cell 전부 불변**. = mode2(enqueue) / mode0(consume) **배타**, 클릭이 mode2→mode0 미플립이라는 60+사이클 근본을 **selectedChar=1·own_cell=2588 세팅된 실 플레이어 상태로 라이브 입증**. 0x0b09/0x0b0a(grid begin/end)는 발생, 0x0b01만 부재.
- **★Track B RE(병렬 에이전트) 확정**: 0x1008(CommandGenerateCharacterCharge)=**월드진입 트리거 아님**(유일 클라효과=이벤트0x16 enqueue→FUN_0050d230서 "스탯패널 값 새로고침"만, 진입플래그 DAT_007ccffc[0x3583XX] set 0건). 등록 완주엔 별도 **`SysSessionRequestGenerateCharacterFinish`+`GenerateCharacterCheckMultiplay{FlagShipName,DisplayName}` 핸드셰이크** opcode 필요(0x1008 응답바디는 죽은 데이터). 2차=결정버튼 클릭이 **DirectInput8 폴링**(FUN_00525780→DirectInput8Create, DAT_022142xx)이라 합성 mouse_event 비반영 가능. **다이얼로그 close 경로=서버가 GenerateCharacterFinish 푸시 권장**(추후 트랙).
- **잔여/다음**: (1) pre-seed 캐릭 이름 "1"(id)·스탯0 렌더(카드 name/abilities 필드 미정합, 월드진입엔 무관) 정합 — 0x2004/0x0323 캐릭 레코드 필드 보정. (2) GenerateCharacterFinish opcode 번호 확정→서버 푸시로 정식 캐릭생성→월드(pre-seed 불요화). (3) C002 mode2→mode0 자연 플립(원작 함대선택→명령메뉴 흐름) or L1 레버(LOGH_GRID_SELECTOR_PROBE)로 in-world 0x0b01. **캐논 SHA 992dc7e2 복원·검증(3회), 모든 세션 클린 종료.**

## ★★★★ C002 L4 라이브 — mode0 도달했으나 0x0b01 미발생(프런티어 이동) (2026-06-27, 저널 #19)
- **pre-seed + L1 레버 결합 라이브**: `LOGH_PRESEED_PLAYER_CHAR=1` + `LOGH_GRID_SELECTOR_PROBE=1 GRID_SELECTOR_VALUE=65536 STRAT_SEQ_START=1`로 월드진입(0x0f02×2·0x0323×51·0x0b09/0x0b0a) **+ mode0 라이브 달성**: selector 0x35f35a=**1**(mode0)·mode_byte 0x126711=**0**(consume)·poller 0x126718=**1**·mode0_active=1·mode2_active=0. **= L1 레버가 mode2→mode0 플립을 pre-seed 신뢰 월드진입과 결합해 재현.**
- **★그러나 0x0b01 미발생**: mode0(consume FUN_0050d230 활성)인데도 **전략맵 클릭 4곳(mouse_event)·하드웨어 키(화살표+Enter+Space) 둘 다 0x0b01 미발사**, mode 불변. selectedChar=1 유지, own_cell은 None(DAT_007cd04c null — L1 경로는 비-레버 런의 2588과 달리 own_cell 객체 미해소).
- **★mode0(L1) 화면 = 3D 기함 뷰**(흑배경+백색 전함, dgVoodoo) — **전략 fleet-선택 화면이 아님**(journal #11 "전략맵→전술/3D 함선뷰 전환" 일치). = L1의 selector=1 mode0은 ship/tactical 뷰이지 0x0b01을 쏘는 interactive 전략맵이 아님.
- **★C002 프런티어 이동(중요)**: 60+사이클의 "mode 게이트"는 L1으로 해결. 이제 진짜 블로커 2분기 = (a) **선택 가능 own-fleet 부재**(0x67 unit-list FUN_004f6680 미구성 / own_cell 미세팅) — mode0 consume 활성이어도 선택 대상이 없음, or (b) **in-world DirectInput8 마우스**(메뉴/카드 클릭=윈도우메시지라 작동했으나 in-world 전략맵 클릭=DirectInput 폴링이라 mouse_event 비반영). 키 경로도 0x0b01 무반응이라 (a) 비중 높음. **Track B 에이전트(a7476ac0…)가 0x0b01 송신 체인+전제조건 RE 중**(결과로 (a)/(b) 분리).
- **다음**: Track B RE 결과로 (a)면 own-fleet selectable 만드는 서버/씬 조건(unit-list 충전·own_cell 세팅) 구현, (b)면 DirectInput 마우스 주입(미해결) or L4 서버 0x0b07 직접푸시 우회([[logh7-server-authoritative-move-0b07-2026-06-23]]). 캐논 SHA 992dc7e2 복원·검증.

## ★★★★ C002 0x0b01 송신체인 완전 RE + 근본 정밀화 (2026-06-27, 저널 #20, Track B 에이전트)
- **0x0b01 송신 체인(P0 디컴파일)**: `FUN_005737d0`(SelectGrid 위젯 vtable 메서드, 유일 caller)→`FUN_004b48d0`(0x0b01 래퍼, local_4=5/event0x2b)→`FUN_004b78a0` case 0x3a(`iVar1=0xb01` req·`iVar5=0xb07` resp=NotifyMovedGrid). 위젯 팩토리=`FUN_00581c80`(문자열 SelectGrid/TARGET_GRID/TARGET_BASE_GRID, vtable PTR_FUN_00676b30/b74), 등록 `_DAT_00c9e3a8=FUN_00581c80`@FUN_0058c750.
- **`FUN_005737d0` 3분기**: `FUN_004f8ee0()`=5/6 → 0x42(0x0b01 아님) / `widget+0x28==0` → TARGET_SELECT 순회 → **0xb00**(SelectGridBase) / `widget+0x28!=0` → TARGET_BASE_GRID 순회(히트테스트 FUN_00575510) → **0xb01**. (0xb00/b01/b02 = FUN_0058fef0 테이블 {0xb01,0xb02,0xb00}, index=event-0x2b 교차확인.)
- **★0x0b01 전제조건(AND)**: ①위젯슬롯 **0x67(unit-list) 비-null** — `FUN_004f6680` 진입 `FUN_0050cf40(0x67)==0`이면 bail(`FUN_0050cf40(p,idx)=*(p+4+idx*4)=*(p+0x19c)`, p=HUD매니저 thiscall). ②**`FUN_004fd7a0`(HUD mode 전이) 실행** + param_2∈{1,2,3}(`FUN_004f6680` 범위)·`param_2!=[mgr+0x187]`(현 mode) → `FUN_004f6680` 도달해 0x67 충전. ③`FUN_004f8ee0`≠5/6. ④`widget+0x28!=0`(거점타깃 latch, 아니면 0xb00만). ⑤own_cell[007cd04c+0x11178]·selectedChar[007ccffc+0x3584a0]=히트테스트 입력.
- **★근본 정밀화(1순위)**: mode0 진입해도 **0x67 unit-list 미구성** → `FUN_005737d0`가 순회할 리스트 비어 0x0b01 미도달. = 메모리 [[logh7-c002-input-layer-verdict-2026-06-21]] "FUN_004fd7a0 0회=fail"과 동근. **FUN_004fd7a0가 올바른 param_2로 안 불려 unit-list 미충전**이 진짜 근본. (L4 라이브 #19의 mode0-but-no-0x0b01과 정합.) 단 FUN_004fd560은 `FUN_004fd7a0(_,0)` 호출(param_2=0→bail)이라 그 경로는 unit-list 미충전 — **올바른 param_2로 FUN_004fd7a0 호출하는 트리거가 미확정**(callers=FUN_004fc4a0/c4e0/fd100/fd560, 한단계 위 RE 필요=백그라운드 진행).
- **다음 분기**: 트리거가 (i)서버 inbound opcode 또는 (ii)키보드면 → 자율 해결 가능(서버푸시/keybd_event). (iii)DirectInput 마우스 전용이면 → DirectInput 주입 미해결 or 0x0b07 직접푸시 우회([[logh7-server-authoritative-move-0b07-2026-06-23]]). **이 (i/ii/iii) 판별이 C002 자율 해결 가능성을 결정** = 백그라운드 RE 중.

## ★★★ mode 게이트 돌파 + 전술 NOW LOADING 음영 진단 (2026-06-26, 저널 #11~#16)
- **mode2→mode0 전환 = 라이브 돌파**(L1: `LOGH_GRID_SELECTOR_PROBE=1 GRID_SELECTOR_VALUE=65536 STRAT_SEQ_START=1`, selector 0x0317 byte[2]+0xb0a 재arm으로 FUN_004b68f0 1회 latch 재통과). 캐논 server/서도 재현. EXE force 無. 60+사이클 최난관 무너짐. `docs/logh7-mode0-breakthrough-2026-06-26.md`.
- **서버 픽스(test-verified 1184/0)**: 0x33b 전술유닛 stride 47→52(battle-engine, 클라 reader 정합) + 갭2 참가 0x325/0x323 로스터 prepend(login-session). **단 라이브로 NOW LOADING 통과 못함**.
- **★전술 NOW LOADING = 순수 대기(음영 진단 확정)**: Frida로 NOW LOADING 중 측정 → 파일I/O·네트워크recv·wire디스패처(FUN_004ba2b0)·world디스패처(FUN_004b68f0)·전술import(FUN_004c32a0)·FieldMake **전부 0회**. = wire/파일/네트워크 전부 배제, **스레드 플래그/D3D/입력대기 영역**. 갭1/갭2 서버픽스는 stall 진범 아님(import 미도달, 유효 버그수정이나 NOW LOADING 무관).
- **전술맵 완성 다음 진단(fresh 세션)**: ~~①NOW LOADING 입력테스트~~(완료: 클릭+Enter+Space 무반응=입력-게이트 아님, 저널 #16b) ②D3D/D3DX9 로드 hook ③스레드 enumerate+블록 backtrace ④NOW LOADING 렌더루프 폴링조건 RE. = NOW LOADING은 wire/파일/네트워크/입력 전부 배제된 **진짜 stuck**(스레드/D3D/플래그), 깊은 계측 필요. 도구: `tools/logh7_c002_tactics_import_probe.py`·`logh7_fileio_probe.py`·`logh7_c002_mode_probe.py`.
- **★mode 돌파가 여는 다른 트랙(전술 배틀필드 불요)**: mode2↔mode0 전환 자체는 작동하므로 (a)자유 맵전환의 strategic↔(전술SCREEN) 전환 UI (b)mode0 인터랙션(직무패널/커맨드가 mode0서 열리는지) (c)C002 0x0b01(mode0 consume 경로)을 전술 배틀필드 로드와 별개로 시험 가능.

**다음 자율 행동(우선순위)**:
1. 리마스터 SR 완료 검증 + 추가 타겟(모델 BMP 전수/JPG배경/스플래시) 확대(no-live, drop-in).
2. 라이브 C002 R1: real-login→월드→0x35f35a/+0x11178/+0x3584a0 read-only Frida watchpoint(동적 라이터·G1~G6 실패게이트 캡처). 도구=tools/logh7_c002_mode_probe.py 확장.
3. full-flow 최종검증(real-login→캐릭생성→월드) + charsel-B 메뉴 출처 trace.
4. 막히면 우회: 서버/콘텐츠 no-live 잔여(0x031d LOGH_STATIC_BASE_PUSH 레버 등) + 리마스터 병행.
**라이브 절차**: `python -m tools.logh7_ui_explorer start --patched-exe <exe> --display-mode windowed --env LOGH_ACCEPT_ANY_GIN7=1` → 새캐릭(150,**310**)→세션더블클릭(800,320). stop시 G7MTClient taskkill→stop→SHA 992dc7e2 확인. 캐논 playable=`RE/.omo/work/logh7-ko-overlay/exe/G7MTClient.playable.exe`.

## ★★ 캠페인 단일 권위 로드맵 (2026-06-26)
**`docs/logh7-master-roadmap-2026-06-26.md` 정독 = loop 소비 순서.** 13도메인 감사→합성. P0 10개·마일스톤 9·우회경로 완비. 핵심: Pillar A(서버/시뮬/와이어/콘텐츠) ~80%·server 1198 pass/0 fail(라이브 무관); 미달 대부분이 **G0(라이브 월드진입 환경)+C002(클라-로컬 mode byte 0x35f35a→FUN_004b68f0, own-fleet selectable 렌더 case0 6-AND 게이트 FUN_0058d140)** 2게이트로 수렴. **MDX 좌표 하드코딩=바이트로 반증**(Null_galaxy.mdx 부재, 실존 4 MDX=LWO 3D 래퍼, 위치권위=galaxy.json 80성계). 라이브 막히면 no-live(P1/P2) 병렬 전진.

## ★★ mode-dispatcher 프런티어 재정의 (2026-06-26, deep-RE) — `docs/logh7-mode-dispatcher-re-2026-06-26.md`
C002/맵전환/다이얼로그/전술/직무패널 5개가 **FUN_004b68f0**(월드-인 디스패처, esi=월드객체)로 funnel. latch selector `[esi+0x35f35a]`가 mode0(interactive)↔mode2(strategy) 초기선택, 매프레임 poller `[esi+0x126711]`이 case0(consume FUN_0050d230)/case2(enqueue FUN_004fef90) 분기, outer-else가 예/아니오 다이얼로그.
- **★근본(정적 확정)**: selector `[esi+0x35f35a]` writer = **18k 함수 전체 0건** → 기본 0 유지 → 항상 mode2 = "전략맵만, interactive 미발화". own_cell(+0x11178)도 WRITE 0건(유일 라이터=strat-camera-focus force).
- **★autologin vs real-login**: autologin은 char-select 시퀀스(FUN_0051a370) 스킵 → 다이얼로그 미arm·own-fleet 미시드·mode flip 미발생. real-login은 시퀀스 경유 → 게이트 자연발생(저널 #10 +0xb00 latch). **= 모든 라이브 검증은 real-login으로.**
- **종결 플랜(리스크순)**: R1 real-login esi 캡처+read-only Frida write-watchpoint(0x35f35a/0x11178/g_StrategyClient+4)로 동적/별칭 라이터 backtrace. R2 0x0b0a 수신 직전 +0x126711==0 윈도우 확정(자연 flip FUN_004c2a80+FUN_004c32a0). R3 char-select 시퀀스 advance에 필요한 recv-queue(+0x3552b8) opcode 확정→서버 자연푸시(no-live 조사가능). R4 다이얼로그 필드 진단. R5(최후·동의·화면깨짐 전례) moderoute/dialog force 1회 진단.
- **죽은 경로(재시도 금지)**: EXE-force·event-9force·+4=0force·mode0force = 60+사이클 라이브 반증(화면깨짐/무효).
- **★★★돌파(2026-06-26, 저널 #11)**: mode2→mode0 전환 **라이브 개방**. `docs/logh7-mode0-breakthrough-2026-06-26.md`. **L1 레시피=`LOGH_GRID_SELECTOR_PROBE=1 LOGH_GRID_SELECTOR_VALUE=65536 LOGH_STRAT_SEQ_START=1`**(selector 0x0317 byte[2]=1 + 0xb0a value=1 재arm으로 FUN_004b68f0 latch 재통과). 라이브 mode_byte=0·mode0_active=1·mode2_active=0 확정, shot 416=전략맵→**전술/3D 함선뷰 전환**(서버푸시 단독·EXE force 無·크래시0). journal #6 selector-단독 실패(post-entry latch)를 재arm 조합으로 해소. = "자유 맵전환"+"전술맵" 도메인 개방. **잔여**: L2(mode0 소스 충전 0x33b 기존+0x345 신설 서버푸시→+0x126718 완전충전→완전 전술맵), 전술 인터랙션, 0x0b01(L4=서버 0x0b07 직접푸시 우회). 레버 랭킹 L1~L5 문서 (e)절.
- **★L2 라이브(저널 #12)**: L1 + `LOGH_BATTLE_ENTRY_PROBE=1`(+DELAY) = mode 전환 재현 + **전술맵 로드 트리거**(shot 421/422 "NOW LOADING — Legend of the Galactic Heroes" + 3D 기함). 단 **NOW LOADING 정체** = 완전 전술 배틀필드 데이터 부족(0x33b 기존은 푸시되나 **0x345 Base 빌더=신설 미구현**). **mode 게이트(60+사이클 핵심)=완전 돌파, 이제 순수 데이터 충전 문제**로 환원. **다음=0x345 전술-필드 데이터 서버 구현**(buildResponseTactics 계열 확장+푸시 배선)→NOW LOADING 통과→완전 전술맵. RE 진행중.
- **★R3 판정(2026-06-26, 서버측 조사 완료)**: 시퀀스 advance latch = `FUN_004ba2b0` 디스패처가 set(`DAT_007ccffc+0x35837b`←0x2001 LobbyLoginOK→case7, `+0x35837c`←0x200a→case8, `+0x35837d`←0x0201, `+0x35837e`←0x0206, `+0x3584a0`←0x0204 selectedChar=own-fleet 3-way 매칭키). **서버는 이 advance opcode 전부 real-login서 게이트 없이 자연 푸시**(login-session.mjs:1470/1474/1481/2460), 0x0204·0x0323·0x0325도 byte-correct 배선·#6 run 발사확인. **= 서버 갭 없음·수정 불필요.** 막힘 = 클라 **case0 own-fleet 렌더 타이밍**(G1~G6). **다음 = R1 read-only Frida(real-login)로 0x0204 수신 후 +0x3584a0 실값+FUN_004c2a80 3-way 매칭 결과 캡처**. account latch(DAT_007c25f0 등)는 디스패처 직접 set 없음=간접경로(라이브 watchpoint로만). **R3는 서버로 프런티어 못 닫음 확정 → 라이브 전용 프런티어.**

## ★ no-live 갭 소진 판정 (2026-06-26)
서버/콘텐츠/와이어 pillar A ~80%(1198 pass)·**추가로 blind 구현할 의미있는 no-live 갭 소진**. 전략맵 항성충진 조사(P1 "유일 저비용 시각전진") 결과:
- **항성 NAME**: 0x031d ResponseStaticInformationBase(info-records.mjs:172, galaxy.json 배선 OK). 단 **요청-응답(0x031c→0x031d)**, 월드진입 자동푸시 아님(login-session.mjs:2006). 빈-라벨 원인 후보 = 클라가 전략맵서 0x031c 자동발신 안 함 or 0x031d→라벨 렌더 미배선. **서버 emit 갭 없음**. 저위험 레버 후보=0x0f02 push에 0x031d 동반(`LOGH_STATIC_BASE_PUSH=1` off-default) 단 라이브 선결(0x031c trace + 라벨 shot).
- **전력숫자**(FUN_0058d140 +0x54 float)·**셀렉션/커맨드 리스트**(위젯 0x67 FUN_004f6680, 클라 내장 리소스): **own-fleet/C002 게이트 종속**(로드맵 "mode게이트 무관" 표기 부정확).
→ **결론: 남은 고가치 unlock 전부 라이브 전용 수렴**(① C002 case0 R1 Frida ② 항성라벨 0x031c 라이브 trace ③ charsel 8단계 폼 육안). 다음 진전 = 라이브 1세션(real-login).

## 로비/캐릭생성 UI 센터링 (2026-06-26, 사용자 요청)
- **쏠림 근본**: 기존 lobby-native-layout이 1024좌표를 1.875x **스케일**(위젯폭 고정→좌측군집). 해법=스케일 아닌 **평행이동**으로 블록 중앙배치.
- **로비**: `lobby-native-layout-v2.json`(13패치, DX=448·DY=156 평행이동). 후보 `playable-lobbycenter.exe`. **라이브 확정=메뉴+패널 가로중앙 균형, 렌더 깨짐 0**(shot 334). 좌표패치=same-length라 안전.
- **캐릭생성(charsel) ★2026-06-26 갱신**: 사용자 라이브 보고 "배경만 옮겨가고 내용 안 따라옴" → 근본=charsel 화면은 **FUN_0051ca30 다중 패널(독립 앵커)**, charsel-recenter가 배경 1패널(FUN_0051e580)만 +304/+146 이동. **수정 완료**: 내용 앵커 **8 사이트**(FUN_0051dc00·FUN_0051dd80·FUN_0051f8b0 MAIN+행레이아웃 상대베이스) `charsel-recenter.json`에 추가(총 10 사이트), 폭 즉치 2개 640트랩 제외. **빌드 drift-check 10/10 PASS**(테스트 EXE fff62ac1). **라이브: 캐릭터 picker 패널 배경↔내용 정합 확인**(shot 363, 중앙 ~938px). 8단계 생성 폼 화면 자체는 로비 메뉴/빈슬롯 네비 플래키로 미캡처=육안 1확인 잔여. 문서 `docs/logh7-charsel-recenter-fix-2026-06-26.md`+저널 #7.
- **합본 후보**: `playable-uicenter.exe`(lobby-v2 + charsel-recenter, byte-verify PASS). **캐논 992dc7e2 불변.** Δ노브: 로비 v2 JSON {DX,DY}, charsel X=604+dx/Y=280+dy.
- **다음**: 사용자 로비 정렬 확인 → OK면 두 패치 DEFAULT_STACK 승격(캐논 재빌드), 아니면 Δ 조정. charsel 폼 시각확인.

## ⚠️ 인시던트 (2026-06-26) — 리마스터가 로비 깨뜨림, 복구 완료
- **증상**: 캐논 EXE(992dc7e2 무변경)인데 로비 중앙 패널 렌더 깨짐(shot 330). **원인=이 세션이 `window_parts.tga`(로비 9-slice 프레임)를 원본 8bpp(263186)→4x/32bpp(4194322)로 리마스터해 라이브 트리(.omo/work/logh7-installed)에 배포**. 게임의 9-slice 프레임 렌더가 깨짐. (전략맵만 검증하고 로비 화면을 재검증 안 한 실수.)
- **복구**: 백업(`hud-original-backup/client/vendor/.../window_parts.tga`=263186)에서 라이브 트리 원본 복원 → 로비 정상(shot 332 확인). 내 세션 리마스터로 깨진 텍스처는 원본 복원, 이전 세션 작동상태(various_window 1049618 등)는 보존(원본 백업 없음=그게 baseline).
- **★교훈/방침**: (1)리마스터를 런타임(라이브) 트리에 배포 전 **영향받는 각 화면(로비·다이얼로그·월드·전술)을 개별 렌더검증** 필수. (2)백업이 트랙간 오염될 수 있음(나중 백업이 이미 리마스터된 상태 캡처)→ **per-file 최소크기=원본 복원** robust 도구 필요. (3)화면 깨뜨릴 위험 테스트(EXE force·hot-함수 Frida hook)는 **사용자 명시 동의 없이 금지**. (4)EXE는 무변경(canonical 보존).

최종 갱신: 2026-06-26 KST

## 2026-06-26 레포 재구조화 + 런처 (working-tree 변경 ★중요)
- **루트 = `server/` + `client/` + `docs/` + `RE/`** (+ 루트 `.omo`=RE 데이터, dot-하네스). 상세 `docs/logh7-repo-restructure-2026-06-26.md`.
- **캐논 서버 = `server/`** (자가완결·검증; `cd server && node --test tests/server/*.test.mjs` = 1147: 1128 pass/1 fail/18 skip).
  1 fail = "월드진입 0x0f02 최근캐릭" = 캐릭선택 버그(핸드오프 #3, 미수정). serve-auth 단독 기동 검증됨(node_modules 불필요).
- **캐논 클라 = `client/`** (자가완결: vendor/logh7-installed + dist/logh7-client 패키지). **`client/play-logh7.exe`** 빌드:
  게임아이콘+UAC자동상승+(①Gin7UpdateClient ②G7Start) 순차.
- **dev/RE 도구 = `RE/tools`** + 루트 `.omo`. 라이브/redex는 RE/ 기준 경로(점진 정합 필요). 루트 .git 삭제됨; server/·client/ 각자 레포.
- **핸드오프 #3 캐릭선택 버그 = 서버 레이어 RESOLVED(반전)**: 프로덕션 버그 아니라 **테스트 헬퍼 버그**였음.
  서버는 이미 2번째 0x1008에 distinct id(=2) 생성·영속(`characters=[1,2]`) + 월드진입 최근캐릭(createdAt) active(0x0204/0x0323) 스폰
  올바르게 구현돼 있었음. 결함은 `server/tests/server/logh7-login-session.test.mjs`의 `lobbyCardIds`가 0x2004 카드를 고정
  스트라이드(0x36e)로 읽은 것 — 실제 와이어=컴팩트 순차 스트림(이름길이 가변). 헬퍼를 컴팩트 워커로 수정. **프로덕션 .mjs 무변경.**
  **server 전체 1147: 1129 pass / 0 fail / 18 skip**(fail 1→0). 검증 PASS(서버 레이어), 테스트-게이밍 아님(영속 length===2 독립 입증).
  ⚠ **라이브 미확정**: 실클라 0x2004 picker 2개 distinct 카드 렌더 + 월드진입 최근캐릭 스폰 = logh7-live(2×0x1008 생성→카드목록 캡처→0x0323 이름)로 확인 필요.
- **런처 RE+한글화 표면 완료**(we2t3scj8): `docs/logh7-localize-re-{Gin7UpdateClient,G7Start}-2026-06-26.md`(검증 반영). 업데이트서버=SERVER.INI [UPDATE](디폴트 202.8.80.179:47902).
  실제 .rsrc 한글 패칭(폰트 face 함정·라이브 렌더)은 후속. play-logh7 update-server UX(4787 미가동 시 일본어 실패창)는 사용자 결정 대기(A=update서버 기동/B=소켓선체크 후 스킵).
## 2026-06-26 캠페인 Phase 0 완료 (wj20c22uk, 6 도메인 문서)
- **★MDX 위치 = "없음" 적대검증 확정 [P0]** (`docs/logh7-mdx-position-verify-2026-06-26.md`): Null_galaxy.mdx=씬그래프(노드명=분광형만), 좌표 float 런 0개. galaxy.mdx=반경~50000 배경 구면. **위치 권위=galaxy.json(p101).** 사용자 "MDX 하드코딩" 의심은 증거로 기각.
- **로드맵 재작성** `docs/logh7-remaster-roadmap-2026-06-26.md`: critical path **G0 라이브 월드진입 신뢰화 → G1 상태전환(0x0f1f 서버푸시) → G2 별개캐릭 라이브 → G3 C002**. ★최대 게이트=G0(포그라운드 락), C002 아님. 상태전환=C002와 decoupled(서버푸시 우회 가능).
- **완성도** `...completion-matrix-2026-06-26.md`: 동작로직 ~72% / 리마스터 플레이가능 ~44%.
- **리마스터 갭** `...remaster-gap-2026-06-26.md`: HUD 20종 업스케일본 존재하나 미배포, 모델 0%. 원본 에셋 전부 보유.
- **라이브 계획** `...live-flow-plan-2026-06-26.md`: ★도구 경로깨짐(RE/tools REPO_ROOT=RE/ vs .omo 루트) → **RE/.omo 정션 생성으로 수정 완료**. 단계 S1~S8(수동 로그인/캐릭생성, 자동 wait/shot/trace/stop).
- **RE/C002** `...re-coverage-c002-status-2026-06-26.md`: deep-RE ~15%, C002 9함수 deep 미완(목록), 상류근본=전략명령 패널(0x67) 미구성. 서버푸시 우회=0x0f1f/0x0b07/0x0b0a.
### 자율 트랙 1 완료 (wy099oe5l, 2026-06-26)
- **C002 9함수 deep-RE 완결**(`docs/logh7-c002-deep-re-2026-06-26-{A,B}.md`): dispatch 체인 전부 정상 함수. ★**단일 상류근본 = `FUN_004b68f0` mode 디스패처가 mode2(0x126718=1)로 전이 못 함 → 씬 KIND==2(FUN_0054e570 param_2=2) 미점화 → 빌더 FUN_004f6040 미실행 → 0x67 unit-list(FUN_004f6680, 게이트 FUN_0050cf40) 미구성 → rowCount 0.** 입력/마우스 아님. 종결후보=mode2 전이를 자연경로(전략맵 클릭→mode전환)로 발화 + src+0x270 unit count 출처 라이브 확인.
- **NPC 로스터 정제 완료**(server/, `docs/logh7-npc-roster-refine-2026-06-26.md`): rank 클램프(wireRank→clampRankId 1..14) + unmask(manualDocumented=manual-roster.json 70명만 canon명, 나머지 "Character N" 마스크) + 회귀가드. login-session/content-adapter/content-pack.mjs 수정. **server 1130 pass / 0 fail / 18 skip.** (RE/src dup은 미수정=캐논 server/ 기준.)
### 자율 트랙 2 완료 (wdxptj8qz, 2026-06-26)
- **★C002 근본 결정적 확정**(반환, 문서 docs/logh7-c002-deep-re-2026-06-26-{A,B}.md): `FUN_004b68f0` iVar7 기본=2(mode2), `if(param_1[0x35f35a]!=0) iVar7=1`(mode0).
  **0x35f35a 셀렉터 = read 1회·write 0회** → 월드진입 시 메모리값으로 latch, 클릭/서버로 못 바꿈. mode2-setter(FUN_004c4170)는 dispatcher 1회뿐 = 전략맵 클릭→mode2 경로 없음.
  **★서버푸시 mode2 불가 확정**(mode0만 FUN_004ba2b0:1354서 서버푸시 가능). C002 종결 = **읽기전용 라이브 probe로 0x35f35a 실값 확인**(tools/logh7_c002_base_probe.py 변형, ecx=DAT_007ccffc=0x5473830 라이브확정) → 비-0이면 off-default 클라 force `LOGH_C002_MODE2_FORCE`(서버 무수정). 잔여: 셀렉터 초기화처(BSS?)·force 후 빌더 실데이터(src+0x270) 여부.
- **★G1 0x0f1f 레버 완성**(server/, docs/logh7-state-transition-0f1f-push-2026-06-26.md): `buildNotifyTacticsInner`(battle-engine.mjs:439) byte-correct(byte0=1→클라 FUN_004c1b20→+0x357e88=0x3f800000·+0x357e8c=2 load-arm). 신규 lever `LOGH_STATE_TRANSITION_PROBE=1`(off-default, deferredBattle 공유=배타). **server 1132 pass / 0 fail**(+오라클 2).
- **★★캠페인 라이브 경계 도달**: critical path RE·서버준비 완료. C002 종결·G1 데모·G0(월드진입)·G2(별개캐릭)·#2(한글입력)이 **전부 라이브 1세션(수동 로그인)으로 수렴**. 라이브 런북=`docs/logh7-live-flow-plan-2026-06-26.md`. 준비물(완료): RE/.omo 정션, 0x0f1f 레버, C002 probe 설계.
### 자율 트랙 3 완료 (ws6ujki9q, 2026-06-26)
- **0x030b 빌더 이미 완성**(매트릭스 "부재"=stale 정정): `buildStaticInformationUnitShipInner`(info-records-static.mjs:276), 클라 파서(FUN_004ba2b0 case 0x30b, stride0x8c×200) 재RE 교차검증 일치. **와이어 11/11 빌더 전부 존재.** `docs/logh7-wire-030b-builder-2026-06-26.md`.
- **★C002 0x35f35a 발견**: 셀렉터=0x0317(ResponseInformationGrid) 수신 시 grid dword(0x35f358) **byte[2]로 간접 기록**(직접 write 0건 설명). ctor(FUN_004b6000) zero-init=0=**기본 mode2**. **캐논 서버 0x0317 미발신**(login-session은 0x0315만)→mode2 고정이 정적상 맞음. 메모리 "mode0 관측"과 상충→라이브 probe로 (i)실값 (ii)FUN_004b68f0 param_1=DAT_007ccffc 여부(오인 2회 전례) (iii)0x35f35a vs +0x126711 실제 mode분기 확정 필요. ★우회후보=서버 `buildInformationGridInner`(0x0317) 의도적 emit(코드 무수정).
- **다음(라이브 1세션, critical)**: server/→client/→수동로그인→[캐릭2개/picker/월드진입 G0,G2·0x0f1f 상태전환 G1·C002 0x35f35a+126711 probe(상충해소)·한글입력 #2·HUD20 배포렌더]. 런북=docs/logh7-live-flow-plan-2026-06-26.md.
### 자율 트랙 4 완료 (wjbmytj0g, 2026-06-26) — 병합 검증 server 1158: **1140 pass / 0 fail / 18 skip**
- **★faction 진짜 갭 수정**(server, `logh7-faction-projection.mjs`+syncMultiplayerFleets): 함대 push 시 사령관 0x0323(power@0x04) 동반 push 안 해 수신 클라 char-table 엔트리 부재→마커 색 이전에 미렌더였음. 소비처 FUN_004ef0d0 +0xa/+0xb 비교(다르면 ENEMY 0x1000/같으면 FRIENDLY 0x800). +5 오라클. 라이브 색렌더=함대가시화 선결(후속). `docs/logh7-faction-projection-2026-06-26.md`.
- **galaxy 특수천체/지형**(server): bh3/ns3 식별(개수 P1) 단 노드↔성계 매핑 없음→셀좌표 P3 미주입(추측 금지). 0x0315 빌더 bh/ns impassable 인코딩 능력 추가(off-default), plasma/sargasso 확정(매뉴얼 p30-32). +3 오라클. `docs/logh7-galaxy-special-terrain-2026-06-26.md`.
### 자율 트랙 5 완료 (wu6xlg6ty, 2026-06-26) — 권위 병합 server **1172 / 1154 pass / 0 fail / 18 skip**
- **0x0325 officer 배선**(server, login-session.mjs `fleetOfficerProjection`): 레이아웃 정정(element stride 0x58=88B, 전체 0xce44), officer=troop_units(@B+0x14 count, @B+0x18 u32[] cap10)+commander@B+0x08. worldState 함대 boats/commander 투영(엔티티 없으면 빈값, 날조 금지). `docs/logh7-unit-0325-officer-2026-06-26.md`. 잔여: B+0x44~0x54 미심볼(P3), 캐논 officer 명부 출처 부재.
- **작전(作戦) 결과정산 구현**(server, operation-plan.mjs+strategy.mjs): 스텁이던 占領/防衛/掃討 보너스 + 격침누적 정산. 規則 P1·수치 P2(미승격). `docs/logh7-operations-server-2026-06-26.md`. 잔여: 정산→功績 적립·world-state 점령상태 공급(메인 배선), 발령 opcode/CP 미확정(off-default).
- **자율 8트랙 누계**: 와이어11/11·faction렌더수정·galaxy특수천체·officer·작전·C002근본(0x35f35a/0x0317)·G1(0x0f1f레버)·NPC정제·로드맵·MDX판정. server 1057→**1172, 0 fail 불변**.
### 평가 완료 (wlmu3k8wg, 2026-06-26)
- **매트릭스 v2**(`docs/logh7-completion-matrix-2026-06-26-v2.md`): 와이어 90→97·faction 50→62·officer NEW 60·작전 NEW 55·C002 30→32. **동작로직 ~74% / 리마스터 플레이가능 ~45%. 최대게이트=G0 라이브 월드진입**(C002 아님), 시각 실증 0건.
- **완결성 비평**(`docs/logh7-campaign-remaining-2026-06-26.md`): autonomous 미고갈(A1 C002서브시스템·A2 0x0325네이티브·A3 HUD배포·A5 작전→功績). **사용자 체감 최대=L2 AXIS2 상태전환(라이브 직렬만)**. 권고=메인 L1→L2 라이브 + 병렬 A 트랙. "라이브가 유일경로"=거짓.
- **★A3 완료(리마스터 0%→20종)**: 업스케일 HUD 20 TGA(live9 검증자산)를 client/vendor+dist 양쪽 드롭인(검증 window_parts 263KB→4.19MB). 원본 백업 `.omo/work/remaster/hud-original-backup-2026-06-26`(복구가능).
### 자율 트랙 6 완료 (w1cj87mqy, 2026-06-26) — 직렬 권위 server **1180 / 1162 pass / 0 fail / 18 skip**
- **작전→功績 적립**(server, personnel.mjs `addAchievement` + strategy.mjs `creditOperationMerit` + auth-server 경제틱 world-state 점령상태 공급): 만료 작전 bonusPoints→발령 사령관 功績(draft 제외). 規則 P1·수치 P2. +8 오라클. `docs/logh7-operations-merit-2026-06-26.md`.
- **0x0317 grid emit 레버**(server, login-session.mjs): `LOGH_GRID_SELECTOR_PROBE`+`LOGH_GRID_SELECTOR_VALUE`(off-default). 0x0317 grid dword byte[2]=(grid>>16)&0xff=0x35f35a mode selector(byte-correct). C002 mode2 라이브 실험용(객체 식별오인 2회 전례라 동작 단정 금지, byte-correct emit만). `docs/logh7-grid-0317-lever-2026-06-26.md`.
- ⚠ **테스트 경합 주의**: 워크플로 병렬 test 실행은 프로세스 경합 플레이키 fail 유발 — **권위 카운트는 항상 직렬 재실행**(`cd server && node --test tests/server/*.test.mjs`).
### 자율 트랙 7 완료 (wcccxy160, 2026-06-26)
- **게임 클라 한글화 = 데이터 완성 확정**: 유저 대면 미번역 JP **0건**(constmsg 3144 매핑·.rsrc 153, cp949 0 fail, 날조 0, 회귀 0). 검증 PASS. `docs/logh7-localize-game-ui-2026-06-26.md`.
- 유일 잔여(빌드, 데이터 아님): 揚陸艦 id 2739/2829/3146가 번역맵엔 "양륙함"인데 client/vendor·dist 산출본만 stale → **재빌드(RE/tools/logh7_build_playable_client.py)로 해소**. 라이브 렌더 미검증.

### ★★ 자율 고가치 소진 — 라이브 경계 (2026-06-26 결론)
11 워크플로 + A3로 server/client/데이터/RE 자율 트랙 사실상 완료. server **1180/1162 pass/0 fail/18 skip**. 남은 일 분류:
- **L(라이브 직렬, 수동 로그인 필수=사용자 사양)**: G0 월드진입 신뢰화 · L2 AXIS2 상태전환 시각(0x0f1f/0x0317 레버 준비됨) · L3 별개캐릭 picker 렌더 · L4 C002 0x0b01(0x35f35a probe로 상충해소 선결) · L5 한글입력 첫글자 · HUD20 UV 렌더 · 한글화 재빌드 렌더. **= 사용자 체감 최대가치, 라이브로만 닫힘.**
- **A(잔여, 마진/고위험/도구부재)**: C002 6레이어 서브시스템 구현(고위험·라이브 L4 선결) · 모델/초상화 업스케일(생성형 도구 부재) · 추가 HUD 업스케일(패키지 비대 우려) · 런처 .rsrc 한글패치(운영상 우회·저우선).
- **U(사용자 결정)**: play-logh7 업데이트서버 UX(A 서버기동/B 소켓선체크 스킵).
### ★★★ 라이브 검증 대성공 (2026-06-26, 자율) — 저널 #6
- **G0 풀 플로우 라이브 작동**: 재구조화 후 깨끗한 1세션(`ui_explorer start`, RE/ cwd)으로 0x7000 로그인→0x0020 로비(블루 HUD)→**0x1008 캐릭생성(클릭 닿음)→0x0f02 월드진입**→0x0313 그리드→0x0323×26 NPC시드→0x0325. **#5 포그라운드 락 블로커 극복.** (shot 027 로비/049 전략맵.)
- **전략맵 렌더 확정**: 다색 항성(청/주황/적=분광형)·그리드·HUD(플레이어 초상화+스탯·미니맵·커맨드패널, 리마스터 텍스처).
- **★C002 RE 라이브 입증**: in-world 클릭 닿으나 0x0b01 미발생 = 마우스 아닌 **mode2 게이트**(RE 결론 정확). "마우스 블로커" 가설 정정.
- **★L2 상태전환 부분 확정**: 캐논 서버 동기화+`LOGH_STATE_TRANSITION_PROBE`→월드(0x0323×51·기지경제 0x031f·시설 0x0321)→**0x0f1f 푸시→중앙 모드전환 UI 패널 출현**(shot 075→076). 완전 전술렌더는 추가데이터 필요. **서버푸시 상태전환 라이브 작동.**
- stop SHA 992dc7e2 복원·verified(2회). node 보존.
- **다음 라이브**: 완전 전술 렌더(전술시드+mode byte) · G2 별개캐릭 picker 2카드 · C002 0x35f35a Frida probe(상충해소) · HUD20/한글 렌더 확대 확인.
- **권고**: 라이브 경로 입증됨 — `cd RE && python -m tools.logh7_ui_explorer ... start` (server/→RE/src/server 동기화 후). 자율로 추가 라이브(전술/별개캐릭/probe) 또는 잔여 A 트랙 계속.

### ★C002 프런티어 라이브 정밀화 + candidate 반증 (2026-06-26, 5 run + Frida)
- **mode probe ground-truth**: 월드=mode2(0x126711=2, mode2_active=0x10001), mode0_active=0·grid 빈(0/64). 메모리 "mode0" 오류 정정.
- **candidate(b) 반증**: 0x0317 셀렉터 레버(VALUE=65536)로 0x0317 발사돼도 mode_byte 여전히 2 = **mode 결정 FUN_004b68f0은 월드진입 1회 latch**, post-entry 변경 무효.
- **★C002 closure 정확한 위치**: 자연 mode2↔mode0 전환은 **함대선택→명령메뉴(FUN_004f6040 패널빌더) 흐름**으로만 발생하는데, autologin/서버푸시 흐름엔 이 UI 상호작용 시퀀스가 부재(패널빌더 미실행). = C002 = **명령메뉴/선택 서브시스템 구현 or 자연 트리거 발견**(A1, 깊은 프런티어). 단순 force/레버 전부 라이브 반증.
- **전 라이브 시퀀스 데이터는 작동**(0x042f·0x0341·0x0343·0x0f1f·0x0317 전부 발사) — 막힌 건 클라 mode 플립뿐.
- **★C002 own-fleet 라이브 최종(6차 run)**: `LOGH_PLAYER_FOCUS_CELL=1 LOGH_FULL_UNIT_LOCATION=1`→own-fleet **여전히 미렌더**(case0 타이밍), own-cell 클릭→0x0b01/mode 무변경. **C002=4층 깊은 프런티어 최종 확정**(own-fleet렌더 case0·선택latch·명령메뉴 FUN_004f6040 미구축·mode2/mode0 배타). server-push/lever/click 전부 6 run 라이브 반증. **종결=명령메뉴 서브시스템 구현(A1, 멀티데이 고위험 클라패치, 과거 크래시 전례) or 원작 상호작용 흐름 복원.** 그라인딩 중단이 합리적.

## ★★ 캠페인 현 상태 종합 (2026-06-26, 14 워크플로 + 라이브 5 run)
- **서버/시뮬/데이터: ~거의 완성** — server **1187/1169 pass/0 fail**, 와이어 11/11, NPC AI, 자율 갤럭시 시뮬, 전투/작전(功績), 경제, faction 투영, officer, 행성 내 장소, 특수천체/지형, 한글화 **데이터 완성**(0 미번역).
- **클라 렌더 + 풀 플로우: 라이브 작동** — 로그인→캐릭생성→월드진입→전략맵(다색항성·그리드·HUD) 실증. 창모드 클릭 작동.
- **리마스터**: HUD 20 + 패널 40 배포(리마스터 자산 시각). 모델/초상화=생성형 도구 부재로 보류.
- **한글화 = 완성**(트랙10): 게임 클라 완전번역 빌드 배포(client/vendor+dist, 잔존 JP 0) + 런처 .rsrc 63항목 패치+폰트 맑은고딕(byte-verify PASS). 라이브 폰트렌더만 잔여.
- **단일 최대 미해결 = C002 mode 게이트**(player 시각 상호작용: 맵전환·명령·직무/기지 패널 전부 funnel). 깊은 프런티어=명령메뉴 서브시스템 or 자연트리거.
- **C002 자연경로 가설**: own-fleet 스프라이트가 전략맵에 미렌더(shot 049/101 = 항성만, 함대 없음). own_cell(+0x11178)/case0 타이밍 이슈. **own-fleet 렌더→fleet-click 선택 latch→명령메뉴 자연 트리거**(클릭 작동 확인됨)가 C002 자연 종결 후보. 서버측 own-fleet 렌더 선결.
- **잔여 autonomous**: own-fleet 렌더(서버) · 라이브 렌더검증(한글/HUD/런처폰트) · 모델 리마스터(생성형 도구). **나머지 시각 상호작용은 C002 프런티어.**
- **★정정(2026-06-26): 생성형/AI 도구 부재 단정은 오류** — **torch 2.12.1(CPU)+cv2+PIL 설치됨**, Real-ESRGAN/GFPGAN pip 설치 가능 = **AI 초해상 리마스터 실제 가능**(CPU라 느리나 동작). C002 그라인딩 중단(6 run 소진) → **AI 리마스터로 우회**(사용자 명시 "이미지 도구 자유사용+모델/초상화"). 텍스처(Real-ESRGAN)·초상화(GFPGAN face restore) 업스케일+배포.
- **★AI 리마스터 완료(w7214qa5l)**: Real-ESRGAN 설치(functional_tensor shim)+텍스처 16종 SR 배포(글로우는 Lanczos 우위·디테일만 ESRGAN, 정직). GFPGAN 설치+초상화 19장 복원(밴딩→그라데이션, 환각0, 라인아트 보존). 신규 도구 logh7_ai_texture_sr.py·logh7_portrait_gfpgan.py. ★제약: TCF 256색 셀·텍스처 포맷이 고해상 deploy 제한(EXE 아틀라스/UV deep-RE 필요), 전수 AI는 GPU 필요. `docs/logh7-ai-{texture-sr,portrait-gfpgan}-2026-06-26.md`.
- **잔여 autonomous 프런티어(정직)**: ①C002 player 상호작용(고위험 A1 클라패치/원작흐름) ②고해상 자산 deploy(EXE 아틀라스/UV deep-RE) ③전수 AI 업스케일(GPU) ④라이브 렌더검증(리마스터/한글). = 깊은 RE·GPU·라이브 영역. server/data/한글화/렌더 층은 완성.
- **★리마스터 deliverable 완료+라이브 검증(7차 run, shot 174)**: HUD20+패널40+AI텍스처16+**초상화 416 전수** 3트리(라이브 포함) 배포, 전략맵 무손상 렌더 확정. 함선 텍스처 178 ESRGAN 배치 진행중(PID 30892, ~2hr 자동배포). docs/logh7-{remaster-deploy-reconcile,portraits-full,ship-textures-sr,portrait-tcf-deploy}-2026-06-26.md.
- **★프런트엔드 로비 흐름 완료(server)**: W5 캐릭삭제 근본수정(0x2008 영속 미반영 버그→removeProfileCharacter+nextCharId 단조, 삭제→재생성 distinct) + W1 signup-first(adminCreate scrypt→strict, 빈값거부, 운영팩토리 계약고정). W4 메뉴 핸들러 검증(게임시작/세션변경/새캐릭 done, 환경설정=클라로컬). **server 1197/1179 pass/0 fail.** docs/logh7-{lobby-char-delete,signup-first}-2026-06-26.md. 라이브=로비 입력레이어(수동 로그인) 대기.
- **남은 프런트엔드**: W3 로비 네이티브 레이아웃(라이브 반증=정렬트랩, 640 유지) · W9 로그인버튼 배경스프라이트 · 라이브 로비흐름 검증(수동). W4 환경설정=클라로컬.

## ★★★ 캠페인 종합 완료 상태 (2026-06-26, 28 워크플로 + 라이브 9 run)
- **🟢 autonomous-achievable = 사실상 완성·검증**:
  - 레포 재구조화(server/+client/+docs/+RE/ 별도 레포)·play-logh7.exe·로드맵·MDX위치검증(없음=p101)
  - **server 1197 tests / 0 fail** (와이어11/11·NPC AI·자율시뮬·우주/지상전·작전→功績·경제·faction·officer·행성내장소·갤럭시·캐릭 생성/삭제/signup)
  - **한글화** 게임+런처 완성(잔존 JP 0) · **리마스터** HUD20+패널40+텍스처(316/785 비-tiny 84%)+**초상화416 전수**+함선178, 3트리 배포+라이브 렌더검증
  - **★게임 라이브 작동**: 로그인→캐릭생성→월드진입→전략맵 렌더(다색항성·그리드·HUD·초상화) 실증
- **🔴 깊은 프런티어(autonomous 빠른승리 불가, 정밀 스코프)**:
  - **C002 player 시각 상호작용**(맵전환·전술맵·함대전·직무카드/커맨드·기지패널 = 단일 게이트): 진짜 블로커=**own-fleet/기지 마커 selectable 렌더 미발생(case0 1회성 타이밍)**. 9 run으로 mode/event-9/latch/force/click/own-cell/lever/candidate 전경로 정밀 배제. 종결=case0 deep-RE/실유저 수동로그인(autologin이 렌더 스킵 추정)/고위험 src-force(크래시 전례).
  - 고해상 셀확대=EXE 아틀라스 deep-RE · 전수 AI=GPU · W3 1920=정렬트랩.
- **결론**: 게임 라이브 작동 + server/data/한글화/렌더/리마스터 증거기반 완수. 미달분 전부 C002 단일 selectable-render 게이트(깊은 client-render). 가장 유망 종결=②실유저 수동 로그인(사용자 mandate autologin금지와 정합).

### ★C002 정밀 수렴 + mode-force 반증 (11-12 run, 2026-06-26)
- **단일 root = `FUN_004b68f0` mode 라우팅** (다이얼로그·명령·own-fleet·맵전환·전술맵·직무패널 전부 funnel). RE: 0x126711==0 interactive/consume(TacticsImport)·==2 strategic. mode2가 정상.
- **★mode-force 라이브 반증(12 run)**: 1바이트 `02→01`(mode0 강제) 후보 EXE → mode_126711=0 됐으나 **mode0·mode2 둘 다 비활성=렌더 깨짐**(전략맵에 mode0 강제 시 전술데이터 미비). = mode 강제 불가, **mode2가 맞음** 확정. 후보 EXE는 stop서 canonical 992dc7e2 복원·삭제(영구손상 0). **★교훈: 화면 깨뜨리는 EXE force 테스트 금지.**
- **★진짜 블로커 재확정 = own-fleet selectable 렌더**(case0 FUN_0058d140 6 AND 게이트: HUD 0x6b·char ptr·own_cell 3·PLAYER_INFO 매칭 G6). 서버 데이터는 6게이트와 정합(코드 무변경, server 1180/0). own_cell=strat-camera 패치(하드코딩 제국 2588)+FOCUS_CELL. **남은=6게이트 중 라이브 실패 게이트 read-only Frida 진단**(case0 호출 여부 우선). docs/logh7-ownfleet-render-fix-2026-06-26.md.
- **다음**: 병렬 A 트랙 계속(A1 C002서브시스템·A2 0x0325네이티브·A4 모델업스케일·런처 한글 패치) / **L 트랙=라이브 1세션 대기**(런북 docs/logh7-live-flow-plan-2026-06-26.md, "라이브 가자"로 G0→L2→L3→L4). 캐논=server/·client/.

이 파일은 루프 엔지니어링의 상태 파일이다. 모든 장기 실행 작업은 이 파일을 먼저 읽고, 한 사이클을 마친 뒤 갱신한다.

## 현재 전체 상태

상태: `active`

현재 목표: 실제 `G7MTClient.exe` 기준으로 회원가입부터 캐릭터 생성, 접속, 월드 렌더, 한글 UI/채팅, 성계 좌표, 전략 상호작용, 풀스크린 필러, 전체 RE 문서화를 완료한다.

현재 완료로 세지 않는 것:

- Vite/React 데모 화면
- `0x0f08->0x0f09` 메일/HUD 트래픽
- P2/P3 추정 콘텐츠 기반 좌표
- 서버 테스트만 통과하고 실제 클라이언트 화면/trace가 없는 작업

## 2026-06-24 리마스터 로드맵 동기화

통합 로드맵 `docs/logh7-remaster-roadmap-2026-06-24.md` 작성. P0 블로커/게이트 재정렬:

| id | 상태 | 항목 | 다음 증거 |
|---|---|---|---|
| P0-00 | in_progress | 기반 정리: git init, `.gitignore` 갱신, RE 커버리지 행렬 동기화 | `git log`, `docs/logh7-function-re-coverage-matrix.md` 최신화 |
| P0-01 | done | 회원가입부터 실제 유저 흐름 고정 | 기존 증거 유지 |
| P0-02 | blocked | C002 전략 명령 서브시스템 unblock | `c002-force-scene-setup.json` 라이브 → unit-list 0x67 → `0x0b01/0x0b07` trace |
| P0-03 | in_progress | UI/채팅 한글 완복 검증 | cp949 code-cave 패치 빌드 후 실클 송수신 왕복 |
| P0-04 | blocked | 실제 전략 명령 루프 검증 | P0-02 종결 후 자연 `0x0b01→0x0b07` 및 시각 반영 |
| P0-05 | next | 로비 풀스크린 좌우 필러 | dgVoodoo fullscreen screenshot |
| P0-06 | next | 클라이언트/DLL/데이터 RE 커버리지 행렬 | `docs/logh7-function-re-coverage-matrix.md` 11.4% → 핵심 경로 우선 확장 |
| P0-07 | next | 소속(faction) 맵/패널 표시 소비처 RE | group-1 진영명 접근자 xref → 맵/패널 소비처 확정 |
| P0-08 | next | 전술 mode byte/전술 pool 활성화 | `0x42f` 수신 후 mode `2→0` 및 tactical pool 채움 라이브 |
| P0-09 | next | 전 화면 네이티브 리마스터 | charsel/gamemenu/window-dialog/soukan-hud 1920×1080 live |
| P0-10 | next | bulk 텍스처/모델 리마스터 | HUD/UI/배경/성운/함선/전투기 드롭인 live |

**참조**: M0(기반정리) → M1(전략 플레이 게이트) → M2(매뉴얼 콘텐츠) → M3(인월드 시스템) → M4(전투/전술) → M5(리마스터/현지化/배포) → M6(전수 RE).

## 2026-06-22 Claude 사이클 (2) — 함수 전수 RE 캠페인 착수 (P0-06 본격화)

사용자 지시: "RE 전부 다시 해. 모든 클라이언트의 모든 파일의 바이트코드 하나까지. 각 함수가 뭘 하는지·무슨 매개변수를 받는지 확인. 비트 하나도 빠뜨리지 마." → 그동안 **포맷/옵코드/데이터구조 레벨은 P0**(docs/logh7-file-re-coverage.md, logh7-re-coverage-matrix.md)인데 **함수 단위 RE가 미착수**임을 ground-truth로 확인(g085 카탈로그 게임함수 6개뿐).

- **트리아지 도구 신설**: `tools/logh7_func_triage.py` — 5개 네이티브 바이너리의 functions.jsonl를 라이브러리/씬크/게임로직 분류 + 호출자/문자열/DAT/critical 가중 중요도 랭킹 + 서브시스템 태깅(network/strategic/battle/render/ui/file/audio/input/crt). 게임플레이 티어(서브시스템태깅·명명됨·핵심게이트) 우선 정렬. 산출: `.omo/re-audit/functions/<bin>/{catalog,worklist,summary,ledger}.json` + `work/batch-####.jsonl`(에이전트 1명당 함수묶음, 디컴파일 c 포함).
- **RE 대상 규모**(thunk/library/trivial ~10,500 제외 후): G7MTClient **6,089**(926배치)·Gin7UpdateClient 1,405(123)·G7Start 988(78)·setup 345(31)·BootFirst 69(10) = **~8,896 함수 / ~1,168 배치**. 전수는 다회 웨이브 캠페인.
- **웨이브 워크플로 신설**: `.claude/workflows/logh7-func-re-wave.js` — 배치별 pipeline(RE maker[general-purpose] → 적대적 검증[logh7-loop-verifier] → 합성). 각 함수에 purpose·**모든 매개변수(의미)**·반환·**모든 DAT 오프셋**·옵코드·confidence(P0-decompile/P3-inferred) 강제. 결과 `.omo/re-audit/functions/<bin>/out/batch-####.json`, 원장 ledger.json 누적, 웨이브 요약 `docs/logh7-function-re-<bin>-wave-NN.md`.
- **스모크 검증 통과**: batch-0014 단일 에이전트 = FUN_004e96f0(메인 프레임 루프 FrameMove+Draw+RecvQue 드레인)·FUN_0058d140(전략맵 패널 텍스트 빌더) 고품질 문서화 확인.
- **웨이브 1 실행 중(백그라운드)**: G7MTClient 배치 0–63(≈185함수, 최우선 게이트 — 옵코드 디스패처 FUN_004ba2b0/event-9 소비 FUN_0050d230/StrategySequence FUN_004fef90/mode 분기 FUN_004b68f0/click dequeue FUN_00507f20/grid validator FUN_004d6310/입력 hit-test FUN_004f6f60/로비렌더 FUN_0051a370 등). 첫 런 args 문자열전달 버그→객체전달+가드로 수정 후 재런(task `wuxhva91w`).
- **별도 갭(워크플로 미포함)**: LOGH7Launcher.exe = .NET IL(Ghidra 인덱스 없음). 이 호스트는 **.NET SDK 미설치(런타임만)**라 ilspycmd 설치 불가 → 후속(SDK 설치 또는 수동 IL 파서 도구). 저레버리지.
- **웨이브1 완료(G7MTClient, task wuxhva91w)**: 64배치/**176함수**(P0 175·P3 1), fail 0·partial 38. `docs/logh7-function-re-g7mtclient-wave-0001.md`. ★수신 디스패처 FUN_004ba2b0(169행)+송신 FUN_004b78a0=**와이어 양방향 옵코드 맵 동시 확보**.
- **BootFirst 완료(w9lbd8bbn)**: 69/69(100%). 실함수 1개(FUN_00401000), 나머지 MSVC6 CRT. `docs/logh7-function-re-bootfirst-wave-0001.md`.
- **G7Start 웨이브1 완료(wvymsmowi)**: 289/988(29.3%). MFC 런처/부트스트랩 — 게임직결 5~7함수(레지스트리/SETUP실행/DX9체크/타이틀)뿐, 나머지 MFC/MSVCRT. 옵코드 표 N/A 정직처리. `docs/logh7-function-re-g7start-wave-0001.md`. 잔여 배치 40~77.
- **LOGH7Launcher.exe 완료**: .NET SDK 8.0.422+ilspycmd 8.2 설치→전수 디컴파일 `docs/logh7-launcher-re.md`(P0). file-re-coverage 갭 #2 RESOLVED.
- **C002 메커니즘 RE — maker 분석 후 verifier가 핵심 반증(FAIL)**: maker 문서 `docs/logh7-c002-mechanism-2026-06-22.md` + 정정 `docs/logh7-c002-verifier-refutation-2026-06-22.md`. **★중대 정정(디스어셈블 ecx 추적): enqueue(FUN_004fef90)·consume(FUN_0050d230)의 this는 `DAT_007ccffc`가 아니라 `DAT_02215e2c`(활성씬, 별개 객체).** enqueue=win 9번자식/cat1·0xa, consume=0x41번자식/cat0, dequeue(FUN_00507b10)=win 직접/cat{0,2,1,3,4} — 셋 다 다른 노드. 권장 mode-toggle 레시피=**NO-GO**(타깃 오인+mode2 의존로직 파괴). **진짜 frontier=FUN_00501e30 7개 호출자(FUN_004ba2b0/004c1700/00508f60/00517cd0·db0) 중 latch 위젯에 쌓는 경로 + 읽기전용 라이브 probe로 세 위젯 base 실주소 대조.** 몇 주간의 "this=DAT_007ccffc" 가정 폐기. (디스어셈블 원본 `.omo/ghidra/bin/G7MTClient.exe` imagebase 0x400000.)
- **워크플로 개선**: verifier 적발을 `_wave-NN-verifier-corrections.json` 영속화+합성 강제주입(웨이브2부터).
- **G7MTClient 웨이브2 완료(task w6lszjis6)**: 배치 64–127, +101함수(누적 277/6089=4.55%). **단 합성 에이전트가 세션한도로 실패** → ledger 동기화로 복구.
- **Gin7UpdateClient 웨이브1 완료(task w9b9apoj2)**: 40배치, 310함수(22.06%). 합성+verifier 13건 세션한도 실패 → ledger 동기화로 복구.
- **★세션 한도 도달(3:20am Asia/Seoul 리셋)**: 에이전트/워크플로 spawn 불가 구간. RE 출력 batch JSON은 전부 디스크 보존(malformed 0).
- **결정론적 복구 도구 신설**: `tools/logh7_func_ledger_sync.py`(out/batch에서 ledger 재구성, 멱등) + `tools/logh7_func_coverage_report.py`(P0-06 함수레벨 행렬 `docs/logh7-function-re-coverage-matrix.md`). 합성 에이전트 실패와 무관하게 진실원 확보.
- **누적 커버리지(실측)**: deep-RE **945/8896(10.6%)** + lightdoc baseline **18,485/18,485(100%)**. 바이너리별: BootFirst 69/69(100%)·G7Start 289/988(29.25%)·Gin7UpdateClient 310/1405(22.06%)·G7MTClient 277/6089(4.55%)·setup 0.
- **다음(세션 리셋 후 에이전트 재개)**: ① G7MTClient 웨이브3.. (startBatch=128) 소진 — post-handler FUN_004be*/FUN_004c* 군 우선. ② 실패한 합성 2건(G7MTClient w2·Gin7 w1) 웨이브 요약문서 재생성(에이전트) 또는 결정론 스텁. ③ setup 웨이브1. ④ C002는 FUN_00501e30 호출자 latch-경로 RE→읽기전용 라이브 probe(mode-toggle 레시피 금지). 워크플로는 `.claude/workflows/logh7-func-re-wave.js`(verifier 영속 개선 적용됨), resumeFromRunId로 캐시 재개 가능.

## 2026-06-23 Claude 사이클 (3) — ★라이브 월드진입 해결 (#8, P0-04 게이트)

증거 `docs/logh7-live-world-entry-2026-06-23.md`, 세션 `.omo/ui-explorer/live3-auto/`(trace 74줄). 세션한도(에이전트 불가) 중 메인루프 Bash로 실클라 직접 구동.

- **★#8 월드진입 블로커 해결**: `G7MTClient.autologin.emp1.exe`(부트스트랩 변종, `--patched-exe --no-login`) + **PowerShell SetForegroundWindow ~35초 유지** → **무클릭 풀 월드진입**. 트레이스 `0x7000→0x0020→0x2009→0x0200→0x0313×2/0x0315→0x0323×2/0x0325×2→0x0b09/0x0b0a→0x0f02→0x0f06/0x0f07`. 렌더(shots/002-auto-state.png): 전략맵 다색항성(청/주황/적)+100×50 그리드+HUD(초상화·미니맵·한글패널). stop shaVerified:true.
- **★#8 진짜 근본 = 포그라운드 의존 스플래시**(코드/EXE 아님): D3D8 부트루프가 창 비포그라운드면 스플래시서 정체(접속 0건). **2026-06-22 전 라이브 세션이 모두 trace 2줄로 실패한 원인** = 좌표/타이밍 블로커로 오인돼 옴.
- **수신 데이터 검증(라이브)**: 클라 소비 레코드 = 0x0313×2·0x0315·0x0323×2·0x0325×2·0x031d·0x031f·0x0b09·0x0b0a·0x0f02·0x2009. 서버송신→클라소비 체인 입증.
- **D3D8 입력 미반영 확정**: 로그인 폼 클릭/키 등록 안 됨(WM_CHAR 무시·keybd_event 별도프로세스 포그라운드절도). run_login_flow 로그인 좌표(325,333)=640×480 기준이라 1920×1080 렌더서 빗나감.
- **잔존 라이브 프런티어**: ①in-world 마우스(C002 0x0b01·수동 캐릭생성; autologin은 우회) — DPI-aware 런치/단일프로세스 입력/cursor-clip ②live3-auto trace 0x0313/0x0323 바디 디코드 vs 서버빌더 대조 ③맵전환/행성내장소/직무카드/커맨드는 월드 위에서 단계진행.
- **★in-world 클릭 라이브 소견(live4-click, 2026-06-23)**: DPI=100%(가상화 아님), `_click`=SetCursorPos+mouse_event(하드웨어, 방식 정상), AppCompatFlags HIGHDPIAWARE 세팅. **단일프로세스 포그라운드유지 클릭** 4발(960,540 등) 주입 → **커서 렌더+시야 이동(=마우스 위치는 게임 도달)** 하나 **0x0b01/0x0b07/0x0400 미발신**. 즉 in-world 입력은 "미도달"이 아니라 **C002 명령발신 게이트**([[logh7-c002-this-correction]] verifier mode/widget 불일치)에서 막힘. 이전 "마우스 입력레이어 블로커"([[logh7-inworld-input-blocked-2026-06-20]])는 부분 정정: 위치/시야는 반응, 전략 emit만 막힘. **리마스터(graphics) 라이브 확정**: live conf=lanczos-3+4x MSAA+16x aniso+maxLOD+워터마크OFF로 전략맵 렌더(런타임 비침습 리마스터 완료; 에셋레벨/생성형은 AI도구 부재로 보류). C002 종결=verifier 권고 읽기전용 메모리 probe(Frida) 경로(에이전트/심층 도구 필요).

### 2026-06-23 실행: mouse-free 서버푸시 deliverable (맵전환·직무카드)

계획 제시가 아니라 라이브 실행. autologin emp1 + 포그라운드 유지 위에 서버푸시.

- **★자유로운 맵 전환 — 서버푸시 실행(live5-maptrans)**: `LOGH_BATTLE_ENTRY_PROBE=1 LOGH_BATTLE_ENTRY_DELAY_MS=14000` → 서버가 grid-enter 후 openBattleField 시퀀스 푸시. 트레이스에 **0x0349·0x0341·0x0343·0x042f(NotifyChangeMode)·0x0f1f(NotifyTactics)** + event `deferred-battle-pushed`. **클라 생존(124→207MB=전술데이터 로드, 크래시 없음)**. 단 **시각 전환 미완**(여전히 전략맵 렌더) = 완전 전술 시드 데이터 + 클라 mode-render 게이트 필요. **서버푸시 맵전환 경로=작동 확정, 전술 렌더 완성이 잔여.**
- **★직무카드/로스터 — 서버푸시 실행(live6-dutycard)**: `LOGH_ROSTER_PUSH=1 LOGH_DUTY_CARDS=1` → 새 데이터 **0x1200·0x1201·0x120f**(로스터/직무 패밀리, 이전 세션 무) 클라 수신. 0x0707은 조건부(C002 discriminator)라 미발생. 직무 패널 시각표시는 UI 클릭(마우스) 필요.
- **★공통 키스톤 확정**: 맵전환 렌더·직무패널 오픈·커맨드 emit의 시각 완성은 모두 **클라 mode/command-emission 게이트(C002)**에 막힘. 서버→클라 데이터 경로는 작동(mouse-free), 클라측 모드활성/패널오픈/명령emit만 게이트. **C002(읽기전용 Frida probe) 종결 = 셋 다 시각 해금.** 증거: `.omo/ui-explorer/live5-maptrans/`, `live6-dutycard/` trace + shots, `docs/logh7-live-world-entry-2026-06-23.md`.

### 2026-06-23 실행: ★C002 메커니즘 라이브 확정 (read-only Frida probe)

신규 `tools/logh7_c002_base_probe.py`(read-only onEnter ecx 캡처, 쓰기 없음, 클라 무해 확인). live7-probe(autologin 월드)에서 캡처:
- **enqEcx=`0x5473830` == DAT_02215e2c_value=`0x5473830`(정확 일치)** → **verifier 정정 라이브 확정**: enqueue(FUN_004fef90) this=**DAT_02215e2c(활성씬)**, DAT_007ccffc(=`0xf307020`) 아님. 수개월 "ecx=g_StrategyClient(DAT_007ccffc)" 가정 폐기 확정.
- **enqN=734**(전략모드 매프레임 enqueue) / **conN=0**(consume FUN_0050d230 한 번도 안 뜸) = **mode2/mode0 배타 라이브 입증** → event-9 적재만·소비 0 = C002 근본 라이브 확정.
- **latchN=6606, latchEcx=`0x1100dcc8`** ≠ enqueue 0x5473830 = 클릭래치 위젯 ≠ enqueue 위젯(verifier 확정).
- **C002 종결 경로(증거확정)**: consume(FUN_0050d230, mode0)이 enqueue와 같은 객체(DAT_02215e2c)에서 돌게 하거나(클릭 시 mode2→mode0 전환), 또는 FUN_00501e30 7호출자 중 latch 위젯(0x1100dcc8)에 쌓는 자연경로를 켜기. 이게 풀리면 맵전환 렌더·직무패널·전략클릭 0x0b01 동시 해금.
- **★★결정적 근본 라이브 확정(`tools/logh7_c002_enqueue_trace.py`, live8)**: enqueue 프리미티브 **FUN_00501e30이 idle·전략클릭 모두 0회 호출**. FUN_004fef90 734회 진입·FUN_00507b10 9개객체×867회 디큐인데 enqueue 0회. = **상태머신이 case0(event-9 enqueue 유일지점)에 자연 진입 못 함**(state≠0·빈 task리스트) → event-9 아예 미적재 → 디큐는 빈 큐 순회 → 0x0b01 불가. "enqueue widget≠latch widget"보다 깊은 근본. **FUN_004c1700 자연 enqueuer 아님**(0x0323/0x0325 데이터 컨슈머) ruling. 종결 본질 = StrategySequence를 case0에 자연 1회 부트스트랩(task seed FUN_004f9030/FUN_004f96d0) + latch 타깃 동시해결. ecx+4=0 강제는 enqueue 생성하나 latch 미픽업(b01=0, 메모리/verifier 정합)이라 부족. 안전 종결 = case0 자연 트리거 조건 다각 RE(서브에이전트, 한도 리셋 후). 상세 `docs/logh7-c002-verifier-refutation-2026-06-22.md`.

### 2026-06-23 실행: ★에셋레벨 HUD/UI 리마스터 (디코드→업스케일→라이브 드롭인 검증)

런타임 graphics(dgVoodoo)만이 아니라 **실제 텍스처 에셋** 리마스터를 실행. 신규 `tools/logh7_remaster_hud_tga.py`.
- 게임 TGA = type-1(256색 BGRA 팔레트·8bpp·bottom-up)이라 PIL 미독 → **자체 디코더**로 인덱스→RGBA 디코드(팔레트+bottom-up 처리), 미리보기로 정확성 검증(system_window=SF HUD 패널 정상).
- **20개 HUD/UI 텍스처**(com_bar/com_window/window_parts/system_window/various_window/soukan/rader/unit_statusbar 등) **4x LANCZOS+언샤프 업스케일 → type-2 32bpp TGA 재인코딩**(D3DX8 content-magic 드롭인). window_parts 512→2048 등. 0 에러. 오버레이 `.omo/work/remaster/hud-overlay/`.
- **★라이브 드롭인 검증(live9-remaster)**: 오버레이 배포 후 autologin 월드 진입 — 클라 생존(208→**349MB**=4x 텍스처 로드), 월드+HUD 렌더 무손상(레이아웃 유지·고해상 샘플링), 크래시 없음. **D3DX8 업스케일 드롭인 경로 라이브 입증.** stop SHA복원·원본 복원(md5 일치)·오버레이 보존(온디맨드 배포).
- 잔여: 진짜 AI 생성형 리마스터(업스케일러/생성도구 부재)·픽셀 UI 샤프엣지(LANCZOS는 평활). 폰트/모델은 별도.

### 2026-06-23 실행: ★수신 데이터 바이트레벨 검증 (메타→바이트 격상)

신규 `tools/logh7_decode_0323_verify.mjs`. 서버 빌더(buildInformationCharacterRecordInner)로 실필드 채운 0x0323 생성 → RE 확정 오프셋(docs/logh7-info-records-wire.md)으로 디코드 → **15/15 필드 바이트 정합**(id@0x00·power@0x04·fame@0x10·spot@0x1c·flagship@0x24·pcp@0x50·mcp@0x54·money@0x68·ability_8@0x188(8×u16)·influence@0x1a8·stamina@0x1a9), payload 724=0x2d4 정확. 오라클 `logh7-login-protocol.test.mjs` **61 pass/0 fail**(라이브 캡처 Reinhard/Lohengramm 0x1008 디코드 포함). **라이브(live3-auto: 클라 730B 0x0323 수신+HUD 초상화 렌더)와 결합 = 서버생성→바이트정합→클라소비·렌더 전 체인 검증.** hook "수신 데이터 메타 레벨·페이로드 디코드 미시작" 해소.

### 2026-06-23 실행: ⑤ 맵전환 — 완전 전술 데이터로 클라 전환 UI 응답 유발 (서버측 SAFE)

근본: 배틀진입 probe(login-session:1528)가 openBattleField에 **단일 placeholder 함선 1기만** 전달 → 전술 데이터 불완전 stall(메모리 확정). 수정(SAFE, forcing/패치 불요): probe가 **worldState.listShips()의 전술 함선(LOGH_NPC_SEED 양진영 8함대 포함)을 participants로 전달**(상한 12, 좌표 ×8). **서버 test:server 1137 pass/0 fail**(회귀 없음).
- **라이브(live10-tactical)**: 이전 단일함선(live5)은 순수 전략맵 유지였으나, **완전 전술 데이터 푸시 시 중앙에 모드전환 UI 패널 출현**(0x42f가 시각 반응 생성) — ⑤ 한 단계 전진. 단 풀 전술 배틀필드 렌더는 미완(메모리 deep-RE 프런티어: 정확 전술 시퀀스/좌표/mode-render). stop SHA복원.
- 잔여: 풀 전술 렌더(deep-RE), ⑥ 직무패널 오픈·⑦ 0x0b01 커맨드(C002 종결 게이트).

### 2026-06-23 ★에이전트 복구 + C002 메커니즘 완전 매핑 (3-에이전트 병렬 RE)

세션 한도 리셋 확인(에이전트 재가용). 3-에이전트 병렬 RE로 C002 전 체인 디스어셈블 확정 → `docs/logh7-c002-mechanism-complete-2026-06-23.md`. 핵심:
- **마우스 입력 도달 확정(블로커 아님)**: 클릭엣지 DAT_022142b0/b4 = **Win32 GetAsyncKeyState(1)**(FUN_00500b70←FUN_00500580←FUN_004e96f0 매프레임)로만 채워짐. DirectInput enum만(GetDeviceState 0회). 합성 mouse_event 잡힘. GetFocus 게이트(포그라운드). 메모리 "마우스 입력레이어/DirectInput 블로커" 가설 디컴파일 반증.
- **own-fleet 셀(+0x11178) 채울 수 있음**: writer 0개, 0x0325 commander 슬롯 struct-copy(FUN_004c2c80). LOGH_PLAYER_FOCUS_CELL=1(기본 ON)→라이브 2550 확정. validator FUN_004d6310 통과 가능.
- **latch FUN_00507f20이 +0xb01/+0xb02 set**(owner this+5=PASS·scene·클릭엣지 게이트, 유일 writer).
- **★진짜 단일 블로커 = mode2/mode0 배타(FUN_004b68f0 +0x126711)**: +0xb02 소비처 **FUN_0050d230(mode0)이 전략 mode2에선 안 돔**(conN=0). 0x0b01=SelectGrid(FUN_00581c80), 응답 0x0b07(FUN_005751b0). mode byte immediate writer 없음→0x42f 등 구조체 경유.
- **종결 = 전략 클릭이 mode2→mode0 전환을 일으켜 FUN_0050d230 소비**. 입력·own-cell·latch 다 해결, mode 전환이 관건.
- **★mode 전환 writer 확정(5번째 에이전트)**: mode byte writer=**FUN_004c45f0 단일**(0x126710 dword 통째 set), 호출자 FUN_004c4170(mode2)/FUN_004c32a0(mode0)←**FUN_004b68f0 월드진입 1회뿐**. 셀렉터 0x35f35a writer 0→**mode=2 세션 고정, 런타임 자연 전환 없음**. **서버 0x42f 핸들러 FUN_004c1c30은 mode byte 미변경**(unit plot만)→서버코드 battle-engine.mjs:41-43 주석 디스어셈블 반증, **서버푸시로 mode 전환 불가**.
- **★클린 토글 NO(live11 read-only)**: mode2서 mode2_active(0x2a58f8)=0x10001 채워짐, **mode0_active(0x126718)=0·grid 0/64 비어있음** → mode-byte 토글해도 FUN_0050d230 게이트 false. FUN_004c45f0(_,_,0)은 grid zero-fill.
- **★★C002 아키텍처 크럭스(60+사이클 근본)**: mode0/mode2 grid 물리 분리 + 전략 0x0b01 task는 mode0 consume 아닌 **StrategySequence case0**(자연 미진입, live8) seed. (latch +0xb02)·(mode0 consume)·(case0 task) 세 경로가 자연 상태선 미연결. 종결=단순 toggle/forcing 아님(verifier NO-GO+메모리 60+사이클 b01=0). 후보=(a)원작 전략 상호작용 흐름 복원 (b)합성 브리지(case0 부트스트랩+위젯 라우팅+mode0 grid+1프레임 consume, 고위험 다각검증). 완전 매핑 `docs/logh7-c002-mechanism-complete-2026-06-23.md`.
- **★★★C002 결정적 해결(live12 + 6번째 에이전트)**: case0/event-9 강제 → FUN_004f96d0 1055회·enqueue 1055회 실행되나 0x0b01=0. 근본 확정: **case0 seed task = 수신확인 전용 노드**(vtable+8=FUN_005751b0, 송신코드 0) → forcing이 b01=0이던 정확한 이유. **실제 0x0b01 송신 = FUN_005737d0(SendWarpCommand)←FUN_00581c80←FUN_004f93c0←FUN_004f58c0←FUN_004fd100(case1)**, 트리거 = **명령 메뉴 ROW 클릭(FUN_005015f0(2) hit, 위젯 0x65, rowCount>0·selectedD5<0)**. **★60+사이클 헛클릭 근본 = "별/그리드 셀 클릭"은 SelectGrid 타깃조회일 뿐 dispatch 트리거 아님 — 진짜는 명령 메뉴 row 클릭.** 자연흐름=함대선택→명령메뉴 출현→이동명령 row클릭→목적지셀. **C002 종결 = 명령패널(0x65) 활성+row채움(factory this+0x1c)+명령 row 클릭.**
- **★합성 단축경로 전수 배제(live12/13/14, 결정적)**: ①case0/event-9 강제(1055회)→수신확인 노드만, 송신0 ②+0xb01/+0xb02 latch 강제(541k회)→FUN_005737d0/FUN_004b78a0=0·0x0b01=0 ③명령메뉴 rowCount=0, 클릭이 함대선택/메뉴populate 안 함. **3종 모두 0x0b01 미발생.** → **C002 종결은 자연 명령메뉴 흐름만 통과 가능**: 함대선택(SelectGrid latch on 함대위젯)→명령메뉴 빌더(FUN_004f5cb0, rowCount>0)→명령 row 클릭→FUN_004f93c0→SendWarpCommand(FUN_005737d0)→0x0b01. **단일 근본 게이트=함대선택 latch가 mode2서 발화 + 명령 카탈로그 빌드.** 함수RE 100% 완결, 종결=명령메뉴/선택 서브시스템 구현(메모리 command-table v3~v14 스레드 + 서버 명령카탈로그 배선).
- **★키보드 경로도 P0 배제(7번째 에이전트)**: 키보드는 전략 명령/선택 미구동(텍스트위젯/토글/디버그 전용), catGate(+0xf4) writer=FUN_004fd7a0도 마우스 의존. **선택 latch=+0xb00**(case2, 명령 row 검사), set점 0x0050801b, 게이트=좌클릭안정 or 우클릭. (live14가 +0xb01 강제했으나 selection은 +0xb00이라 무효였던 이유.)
- **★★C002 최종 결말**: 입력 2종(마우스·키보드)+합성force 3종(case0·+0xb01·+0xb02) **5종 전수 배제**. 0x0b01 단일 게이트=마우스 클릭이 함대/명령 위젯 rect hit→+0xb00 발화 + 명령메뉴 rowCount>0. 둘 다 mode2 자연 미충족. **종결=명령메뉴/선택 서브시스템 구현/복원(함대선택 hit-test rect + 명령 카탈로그 빌더 FUN_004f5cb0 + 서버 명령목록). 함수RE·경로배제 100% 완결, 남은 건 순수 구현.** 다음=명령 카탈로그 빌더 트리거 + 함대선택 hit-test rect 구현→명령메뉴 populate→명령 row 클릭 라이브 0x0b01.

## 루프 시작 규칙

각 사이클은 선택한 항목의 RE 프리패스로 시작한다. P0-02처럼 성계/행성/전략 grid를
다룰 때는 manual/PDF 101쪽, `content/galaxy.json`, 설치 DB, MsgDat group `0x18`,
MDX star/body node, `G7MTClient.exe`의 `0x0312/0x0314/0x0f02/0x0f06/0x0b01`
소비 경로, 직전 실클라 trace/스크린샷을 먼저 대조한다. P0-03은 채팅/UI 문자열 RE,
P0-05는 로비 렌더/Direct3D/fullscreen 경로 RE, P0-06은 파일별 parser/consumer RE를
먼저 수행한다. RE 프리패스 결과 없이 서버 payload나 번역 문자열을 기본값으로 승격하지 않는다.

## P0 작업 큐

| id | 상태 | 항목 | 완료 증거 |
|---|---|---|---|
| P0-01 | done | 회원가입부터 실제 유저 흐름 고정 | `.omo/evidence/task-9-logh7-p0-01-signup-user-flow-account-db-after-world.json`, `.omo/evidence/task-9-logh7-p0-01-signup-user-flow-world-trace.json`, `.omo/evidence/task-9-logh7-p0-01-signup-user-flow-cleanup.json`, `.omo/evidence/task-9-logh7-p0-01-signup-user-flow-verification.json`; negative path: `.omo/evidence/task-10-logh7-p0-01-signup-user-flow-missing-account-trace.json` |
| P0-02 | in_progress | 성계 위치 섞임 원인 확정 및 전략 선택/명령 활성화 | `docs/logh7-world-data-mining-status.md`, `docs/logh7-coordinate-provenance.md`, `.omo/evidence/task-3-p0-02-coordinate-evidence-provenance.json`, `.omo/ulw-loop/evidence/g006-c002-compact-0356-selection-hit-summary.json`, `.omo/ulw-loop/evidence/g006-c002-category-retarget-and-0707-rebuttal-20260617.txt`, `.omo/ulw-loop/evidence/g006-c002-category-apply-rowcount-zero-20260617.txt`, `.omo/ulw-loop/evidence/g006-c002-command-table-lifecycle-20260617.txt`, `.omo/ulw-loop/evidence/g006-c002-command-table-positive-control-compare-20260617.txt`, `.omo/ulw-loop/evidence/g006-c002-wire-zero-body-residue-20260617.txt`, `.omo/ulw-loop/evidence/g006-c002-original-static-command-table-scan-verdict-20260617.txt`, `.omo/ulw-loop/evidence/g006-c002-command-table-preload-v3-20260617.md`, `.omo/ulw-loop/evidence/g006-c002-command-menu-activation-v5-20260617.md`, `.omo/ulw-loop/evidence/g006-c002-direct-category-apply-v7-20260617.md`, `.omo/ulw-loop/evidence/g006-c002-row-active-gate-v8-20260617.md`, `.omo/ulw-loop/evidence/g006-c002-gate-pair-v9-20260617.md`, `.omo/ulw-loop/evidence/g006-c002-factory-return-v10-20260617.md`, `.omo/ulw-loop/evidence/g006-c002-selectgrid-child-v12-20260617.md`, `.omo/ulw-loop/evidence/g006-c002-target-confirm-v13b-20260617.md`, `.omo/ulw-loop/evidence/g006-c002-d2a3c-positive-control-v14b-20260617.md`, `.omo/ulw-loop/evidence/g006-c002-root-source-v35-v36b-20260618.md`, `.omo/ulw-loop/evidence/g006-c002-root-current-v37-20260618.md`; remaining: `DAT_009d2a3c=2` positive-control은 confirm dialog, `FUN_005737d0`, `FUN_004b48d0`, inbound `0x0b01`까지 열었지만 자연 writer/state transition이 미확인이고, v36b는 `LOGH_WORLD_IMPORT_BASES=1`로 root list count를 4까지 채웠지만 `DAT_007cd04c+0x11178=0`이었다. v37은 `FUN_004c4170`의 current source가 `[mainState+8]+0x320`이고 실제 값이 0이며, `FUN_0048fb80` parser가 이 경계 전에 호출되지 않음을 확인했다. 유효 current/focus와 payload 확인 뒤 `LOGH_RELAY=1`/`LOGH_AUTHORITATIVE=1`에서 `0x0b01->0x0b07` 또는 동등 명령 루프를 검증해야 한다. |
| P0-03 | in_progress | UI/채팅 한글 왕복 검증 | 진단 완료: `.omo/ulw-loop/evidence/p0-03-chat-cp932-send-hazard-20260622.md`. **★채팅 송신이 한글을 cp932로 디코드해 와이어 손상(verdict b)** — 서버는 무수정 정상(1137 PASS). 라이브 왕복은 #8 월드진입 좌표 블로커에 막힘(아래 블록 참조) |
| P0-04 | next | 실제 전략 명령 루프 검증 | `0x0b01->0x0b07` 또는 동등 명령/응답 trace, 선택/이동 화면 변화 |
| P0-05 | next | 로비 풀스크린 좌우 필러 | dgVoodoo 설정 diff, fullscreen screenshot, 와이드 화면 pillarbox 확인 |
| P0-06 | next | 클라이언트/DLL/데이터 RE 커버리지 행렬 | 파일별 hash/format/parser/consumer/status 문서 |

P0-02 최신 보강 증거: v38은 canonical playable EXE
`1f7fad439af2fc7f775b4cdfb2a8e10111ebd5209f98dab8905c9b3b238cc00c`에서
`+0x320` 정적 참조 7개를 재스캔하고, `FUN_0048ffd0`
`commandCreateOutfitTextParser-0048ffd0` hook을 추가한 뒤 실클라를 재실행했다. 결과는
`FUN_0048fb80`/`FUN_0048ffd0` 모두 `FUN_004c4170` 경계 전 호출 0회,
`currentSource320=0`, root `listCount1117c=4`, root `currentRaw11178=0`이다.
다음 추적 대상은 서버 push 변형이 아니라 `[mainState+8]` source object의 네이티브 생성/초기화
경로와 parser가 아닌 `+0x320` writer다. 증거:
`.omo/ulw-loop/evidence/g006-c002-root-current-v38-20260618.md`,
`.omo/ulw-loop/evidence/g006-c002-root-current-v38-20260618.jsonl`,
`.omo/ulw-loop/evidence/g006-c002-root-current-v38-cleanup.txt`.

P0-02 최신 보강 증거: v39는 `[mainState+8]` source identity를 확정했다.
`FUN_004c4170` entry에서 `[mainState+8]=0xf34402c`이고 이는 `mainState+0xc`였다.
첫 바이트는 `01 6e 61 6d 65`, 즉 `\x01name` 헤더였으므로 `sourceVtable=0x6d616e01`은
진짜 vtable이 아니라 inline data head다. `currentSource320=0`,
`FUN_004b5bb0` return 0, `field126714_u32=0`, `strategyCurrent2b6a70=0`,
root `currentRaw11178=0`, `listCount1117c=4`로 남았다. 추가 hook
`candidateSourceFactoryA-0040a700`/`candidateSourceFactoryB-004a49c0`는 live flow에서
enter/leave 0회였고, `FUN_0048fb80`/`FUN_0048ffd0`도 계속 0회였다. 다음은
`mainState+8 = mainState+0xc` inline source를 세팅하는 writer와 그 inline source의
`+0x320` non-parser writer를 찾는다. 증거:
`.omo/ulw-loop/evidence/g006-c002-root-current-v39-20260618.md`,
`.omo/ulw-loop/evidence/g006-c002-root-current-v39-20260618.jsonl`,
`.omo/ulw-loop/evidence/g006-c002-root-current-v39-trace-all.json`,
`.omo/ulw-loop/evidence/g006-c002-root-current-v39-cleanup.txt`.

P0-02 최신 보강 증거: v52는 항성 타입 오판과 SelectGrid 클릭 실패를 분리했다.
설치 자산과 MDX 추출 분포상 O/B/A/F/G/K/M 슬롯은 다색이며, 실제 미니맵 이동 후
`베큘라`는 주황/황색, `발할라`는 청색/청록 계열로 보였다. 따라서 "파란 항성 하나뿐"은
현재 증거와 맞지 않는다. 다만 이름별 항성 등급은 계속 `model_node_order_provisional`이다.
같은 세션에서 보이는 `발할라`/`베큘라`를 클릭해도 `0x0b01/0x0b07`은 발생하지 않았다.
정적 분석상 `FUN_004d3580`은 world vector를 grid X/Y로 모두 쓰는 함수이고, 런타임에서
다른 branch는 `(84,31)` 같은 정상 grid를 만들 수 있었다. 그러나 실제 star-click branch는
`state.p24ProjX=0x007b360c`, `p28ProjY=25/23`으로 남아 `FUN_004d6310`이 `-256`을 반환했다.
root current/list는 `DAT_007cd04c+0x11178=0`, `+0x1117c=0`, command state는
`selectedD5=-1`, `categoryD6=-1`이었다. 다음은 star click 반복이 아니라 current/list writer,
`p24ProjX` source/caller local, action-state writer를 추적한다. 증거:
`.omo/ulw-loop/evidence/g006-c002-selectgrid-upstream-v52-20260618.md`,
`.omo/ulw-loop/evidence/g006-c002-selectgrid-upstream-static-v52-20260618.md`,
`.omo/ulw-loop/evidence/g006-c002-selectgrid-state-v52-20260618.jsonl`,
`.omo/ulw-loop/evidence/g006-c002-selectgrid-upstream-v52-cleanup-20260618.txt`.

P0-02 최신 보강 증거: v53은 v52 판정을 정적으로 보강했다. 항성 타입은
`model-galaxy-stars.json` 분포 `O=2,B=5,A=7,F=8,G=19,K=17,M=21` 및
`fs_glow_000..006` 다색 텍스처 기준으로 "파란 항성 하나"가 아니다. 다만
성계명별 등급 연결은 계속 `model_node_order_provisional`이다. 직접 절대 참조 스캔에서
`DAT_007cd04c`, `DAT_009d2a30`, `DAT_00c9eabc`, `DAT_00c9eac0` write는 0건이었다.
`0x004d7a6c..0x004d7b13` callsite는 `FUN_004d3580` xOut/yOut을 `state+0x24/+0x28`에
복사하는 정상 경로라, v52의 `p24ProjX=0x007b360c`은 click-gated runtime local/source
문제로 본다. v41/v45의 current/source 경계도 유지된다. 다음은 optional record `+0x08`
writer/origin과 클릭 한정 projection watcher다. 증거:
`.omo/ulw-loop/evidence/g006-c002-selectgrid-source-static-v53-20260618.md`.

P0-02 최신 보강 증거: v54는 클릭 한정 projection을 writepoint로 정정했다. 항성 타입은
다시 `O=2,B=5,A=7,F=8,G=19,K=17,M=21` 및 7개 텍스처 슬롯으로 검산되어
"파란색 하나"가 아님을 확인했다. 실클라 화면에서도 `베큘라`는 주황/황색,
`발할라`는 청색/청록으로 보였다. `FUN_004d3580` entry hook은 폐기했고,
X는 `0x004d359c`, Y는 Frida가 거부한 `0x004d35aa/35ac` 대신 `0x004d35a6`
pre-write 지점으로 관측한다. click-gated watcher는 `발할라` 클릭을 grid `(85,22)`,
`베큘라` 클릭을 grid `(79,20)`으로 변환했다. 그러나 trace는 여전히 heartbeat/info
경로이며 `0x0b01/0x0b07`은 없다. C002는 pending이다. 다음은 같은 항성 클릭 반복이
아니라 grid `(85,22)`/`(79,20)`이 `FUN_004d6310`, root current/list,
`DAT_007cd04c+0x11178/+0x1117c`, `selectedD5/categoryD6`와 어떻게 연결되는지
한 click event id로 추적한다. 증거:
`.omo/ulw-loop/evidence/g006-c002-selectgrid-v54-runtime-20260618.md`,
`.omo/ulw-loop/evidence/g006-c002-selectgrid-upstream-v54-writepoint-prep-20260618.jsonl`,
`.omo/ulw-loop/evidence/g006-c002-selectgrid-v54-cleanup-20260618.txt`.

P0-02 최신 보강 증거: v55는 보이는 항성 클릭의 projection과 실제 validator callsite를
한 click id로 묶었다. 항성 타입은 여전히 `O=2,B=5,A=7,F=8,G=19,K=17,M=21`이라
"파란색 하나"가 아니다. `발할라` 클릭 `(1179,448)`에서 writepoint path는 grid
`(85,22)`를 만들었지만, 실제 validator 분기는 기존 `0x004d7b13`이 아니라
`0x004d7bba`였다. 그 callsite의 push 값은 `sp00=0x007b361c`, `sp04=22`,
`sp08=0xffffffff`였고 `FUN_004d6310=-256`, pass branch `0x004d7bc3` 0회였다.
`DAT_007cd04c+0x11178/+0x1117c`는 `0/0`, `selectedD5/categoryD6`는 `-1/-1`로
남았다. 정적 disasm상 `0x004d7a80/8c/9c/aa9`가 `FUN_004d3580` output을
`state+0x24/+0x28`로 복사하는 경계이므로, 다음 fresh client run은 업데이트된
correlation watcher의 `projectionStack`, `projectorWriteArgs`,
`projection-state-written-after-004d7aa9` 증거를 수집한다. C002는 pending이다. 증거:
`.omo/ulw-loop/evidence/g006-c002-selectgrid-v55-click-correlation-20260618.md`,
`.omo/ulw-loop/evidence/g006-c002-selectgrid-click-correlation-v55-realcall-20260618.jsonl`.

P0-02 최신 보강 증거: v56은 사용자 지적대로 항성 타입/색상이 단일 파란 fallback이
아님을 다시 확인했고, `0x004d7aa9` state-copy 직후 X가 이미 깨진다는 것을 증명했다.
데이터는 `O=2,B=5,A=7,F=8,G=19,K=17,M=21`이며 O/B만 7개다. 실클라 화면에서도
`베큘라`는 주황/황색, `발할라`는 청색/청록으로 보였다. `발할라` 중심 클릭
`(723,545)`에서 `FUN_004d3580` writepoint는 grid `(87,25)`를 만들었지만,
`projection-state-written-after-004d7aa9` 시점의 `state+0x24/+0x28`은
`0x007b361c/25`였다. 실제 `0x004d7bba` validator callsite도
`sp00=0x007b361c`, `sp04=25`, `sp08=0xffffffff`를 push했고
`FUN_004d6310=-256`으로 탈락했다. trace는 `0x0300->0x0301`과 `0x0f08->0x0f09`
뿐이며 `0x0b01/0x0b07`은 없다. C002는 pending이다. 다음은 같은 항성 클릭 반복이
아니라 `0x004d7a80` 전후 `sp70` source/caller local writer를 추적한다. 증거:
`.omo/ulw-loop/evidence/g006-c002-selectgrid-v56-copy-state-20260618.md`,
`.omo/ulw-loop/evidence/g006-c002-selectgrid-click-correlation-v56-long-20260618.jsonl`.

P0-02 최신 보강 증거: v57-v60은 v56의 `state+0x24=0x007b361c` 판정을
unsafe Frida hook artifact로 정정했다. `0x004d7a7b` call instruction hook은
callee return address를 trampoline `0x512062f`로 바꾸고 X out target도
`0x512061f`처럼 오염했다. return-gated `0x004d3581` watcher는 28회 모두
`returnAddress=0x004d7a80`, `xOutPtr=[esp+0x70]=0x19fc98`, X write target
`0x19fc98`, copy-state X `87/88/89/90`, Y `25`를 보였다. validator 근처
`0x004d7bba`/`0x004d7bb8`/`0x004d6310` Frida hook도 클라이언트를
perturb/crash하므로 제거했다. 정적 `FUN_004d6310`상 v59의
`selectedCell=(87,25), object1=3, range=-1`은 통과 경로다. Frida 없는 v60
자연 클릭은 `발할라` 셀 하이라이트와 clientAlive=true를 보였지만 trace는
`0x0300->0x0301`뿐이고 `0x0b01/0x0b07`은 없다. 다음은 projection/validator가
아니라 하이라이트된 선택 뒤 command/action state 또는 자연 `0x0b01` 생성 경계다.
증거: `.omo/ulw-loop/evidence/g006-c002-selectgrid-v57-v60-return-gated-20260618.md`,
`.omo/ulw-loop/evidence/g006-c002-selectgrid-sp70-source-v58-return-gated-20260618.jsonl`,
`.omo/ulw-loop/evidence/g006-c002-selectgrid-click-correlation-v59-return-gated-20260618.jsonl`,
`.omo/ui-explorer/session-g006-selectgrid-v60-natural-47900-20260618/shots/006-v60-natural-click-valhalla.png`.

P0-02 최신 보강 증거: 항성 타입과 `발할라` 한글화를 다시 점검했다. 현재 추출 분포는
`O=2,B=5,A=7,F=8,G=19,K=17,M=21,unassigned=1`이고, `ヴァルハラ`는 임시
`model_node_order_provisional` 기준 `B`, 전략 마커 `byte2=1`이다. 이는 원본 서버의
이름별 확정 등급이 아니다. 화면/`constmsg` 기준 표기는 `발할라`이므로
`content/names/systems-ko.json`과 `content/roster/ivex-reference.json`의 `발하라`를
`발할라`로 통일했다. 관련 node:test 64개와 SelectGrid watcher unittest 15개가 통과했다.
증거: `.omo/ulw-loop/evidence/g006-star-type-ko-valhalla-20260618.md`.

P0-02 최신 보강 증거: v61은 사용자 지적대로 로그인 후 실제 미니맵 클릭부터 다시
확인했다. 월드 진입 직후 스냅샷은 `proj=(0,0)`, `selected=(-1,-1)`이고 화면도
초기 검은 영역이었다. 미니맵 중앙 클릭 뒤 `알타이르` 적색과 `트라바흐` 계열
황색/주황 항성이 보였고, 미니맵 오른쪽 아래 이동 뒤 `발할라` 청색/청록과 `베루라`
황색/주황 항성이 같은 화면에 보였다. content pack 기준 visible 후보는
`알타이르=M`, `트라바흐=K`, `베루라=K`, `발할라=B`, `니플헤임=A`지만 모두
`model_node_order_provisional`이다. `발할라` 클릭 뒤 안전 스냅샷은
`selected=(87,25)`, `selectedCell.cellValue=73`, `selectedCell.object=(17,3,1)`,
`camera=(37.5,0,-0.5)`를 보였다. 그러나 `selectedD5/categoryD6=-1/-1`,
`selection.listCount188=0`, 자연 `0x0b01/0x0b07` 없음으로 남았다. 따라서 다음은
항성 색상이나 projection 재반복이 아니라 하이라이트된 valid star cell 이후
command/action state writer를 찾는다. 증거:
`.omo/ulw-loop/evidence/g006-c002-selectgrid-snapshot-v61-20260618.md`,
`.omo/ulw-loop/evidence/g006-c002-selectgrid-snapshot-v61-20260618.jsonl`,
`.omo/ui-explorer/session-g006-snapshot-v61-47900-20260618/shots/008-008-click-minimap-valhalla-area.png`,
`.omo/ui-explorer/session-g006-snapshot-v61-47900-20260618/shots/009-009-click-valhalla-star.png`.

P0-02 최신 보강 증거: v61 추가 RE/상호작용 확인. `tools/logh7_disasm_range.py`에
절대 메모리 xref 스캔을 추가했고, `.text` 함수 범위에서 `DAT_00c9eabc/eac0`는
모두 read, direct write 0건으로 확인됐다. `DAT_007cd04c+0x11178/+0x1117c/+0x11180`
직접 displacement 접근도 read만 확인됐다. 하단 우측 정보 아이콘과 캐릭터 행 클릭은
월드 위 정보 패널을 열고 자연 `0x0f06->0x0f07` 재동기화를 유발했지만,
`0x0b01/0x0b07`은 발생하지 않았다. 패널에는 `접속하고 싶은 캐릭터를 선택해 주세요.`,
`NO DATA`, `???`가 남아 있어 UI 문맥/한글화도 미완료다. 다음은 항성 색상/projection이
아니라 `0x0323/0x0356` payload 또는 네이티브 mode/category 조작이 UI/root action
container를 채우는 경계를 추적한다.

## 2026-06-18 Claude 세션 — 루프 이식 + 유령 그리드/카논 로스터 + 전수 RE

이 세션은 Claude Code에서 진행했다. 주요 결과:

- **루프 엔지니어링 Claude 이식**: `.claude/agents/logh7-loop-{explorer,verifier}.md`(Codex toml의 1:1 대응, 읽기전용), 슬래시 커맨드 `/logh7-loop`(`.claude/commands/logh7-loop.md`), 결정론 Workflow `logh7-loop`(`.claude/workflows/logh7-loop.js`, explorer→maker→tester→verifier). `docs/logh7-loop-engineering.md`에 "Claude Code 실행" 섹션. maker/checker 분리 유지.
- **유령 "공간 그리드" 성계 = 플레이어 함대 마커로 확정·수정**(검증됨). 0x0313 byte0는 constmsg group 0x18 LABEL 인덱스(FUN_00522010)이며 sub-id 0/1/2가 그리드 타입 라벨(플라스마/공간/항행불능), 실제 성계는 sub-id 3부터. 함대가 `charId & 0xff`(기본 1→sub-id1=공간 그리드)를 byte0로 보내 발생. 수정: `safeMarkerContentId` 클램프(클래스3 byte0 0/1/2→3) + 함대 라벨을 홈 성계 contentId로(`logh7-login-protocol.mjs`/`logh7-login-session.mjs`). 함대 셀 used-set 가드 추가.
- ~~**항행불능 배치(Front 2)는 반박**: 클라에 통행불가 평면 없음, FUN_004abbb0는 RLE 디코더.~~ **[2026-06-19 정정/SUPERSEDED]** 이 반박은 틀렸다. 항행성은 **있다** — 단 raw 셀값이 아니라 **objectTable[V].byte1∈{1,3}** 게이트(`FUN_004d6310`, 클라측). byte1=1=空間 항행/3=마커 항행, 그 외 차단. 셀값은 objectTable 인덱스일 뿐. 매뉴얼 p31도 プラズマ嵐/サルガッソ/航行不能=진입불가 확정. 빈셀=값0=byte1 0=차단이라 **전 배경이 항행불능**이었던 게 0x0b01 이동 블로커 추정. 수정=terrain 인코딩(空間 byte1=1). 상세: [[logh7-terrain-navigability-model]], docs/logh7-strategic-map-wire.md(2026-06-19 블록). (스냅샷 가드 0x2c03c0는 별개 이슈로 유효.)
- **오리지널(原作=카논) 캐릭터 = O군 포트레잇 로스터로 구현**. 사용자 정정 반영: 오리지널=전부 카논, 포트레잇은 게임 내 O군(oem/oam/o ~446장)이나 신원(이름) 미복원·중복 존재. 신규 `logh7-original-officers.mjs`(`buildCanonPortraitRoster`): O군 얼굴 enumerate(faction=아틀라스에서, oem→제국/oam→동맹/o→중립), 이름 플레이스홀더("1".."N"), 기본 스탯, 실제 포트레잇(P1), 이름/스탯 P3. **모든 카논 표시 이름을 플레이스홀더로 마스킹**(maskCanonNames, 후보명 보존) — 명명된 카논 이름도 미검증이라 어떤 이름도 검증된 것으로 주장하지 않음. 플레이어 생성은 G군(별개).
- **0x0323 card 레이아웃 RE-확정·수정완료**: `docs/logh7-data-structures-re.md` §1/§4 — card_len 카운트는 **0x24c**(FUN_00417390, gate <0x11), 배열 @0x254 stride 8 = {u32,u32}, max 16. 0x250은 count와 배열 사이 4B gap. 0x0356 델타만 별도로 count@0x250(personnel.mjs 자체 빌더). `buildInformationCharacterRecordInner` count 0x250→**0x24c** 수정(이전엔 클라가 card_len=0으로 읽어 카드 전부 드롭). login-protocol/login-session 0x0323 테스트 3개 RE 레이아웃으로 갱신.
- **전수 파일 RE 원장**: `docs/logh7-file-re-coverage.md`(8 패밀리 ~2200파일, G7MTClient 파일-소비자 맵, LOGH7Launcher.exe=.NET 어셈블리). `.omo/re-audit/**`.
- **데이터 구조 RE 완료** → `docs/logh7-data-structures-re.md`: 0x0323 전 필드/제약(이름 ≤13 UCS-2, ability_8 고정8 stride4, parentage ≤1, special_ability ≤80), **함대 오너십 확정**(세션당 파워 **2 고정**=제국/동맹, 페잔=중립은 3번째 파워 불가; 국가당 함대 로스터 **≤14**(InformationSessionPower); char.flagship@0x24==unit.id@0x00 1:1 월드진입 앵커; 함대 진영=지휘관 power@0x04, unit+0x10은 nation id 아님), 로스터 캡(entry 5/card 16/card-char 64/세션 64/world ~600/budget 6/base 4), 캐릭터 id 무제한(0x4000+ OK). §5에 서버 정합 TODO 10항목.
- **그래픽 RE 완료** → `docs/logh7-graphics-remaster.md`: 임의 해상도=GraphicConfig.txt(무검증)만으로 무패치, 3D는 aspect-correct Hor+(FUN_005a6d10) 무패치, **UI 늘어짐 근원=FUN_004ea460**(X/Y 독립 스케일). 무왜곡 와이드: Path A(4:3+dgVoodoo centered_4_3 무패치) / Path B(16:9+FUN_004ea460 uniform min 패치). 업스케일 드롭인 가능(D3DX8 헤더 치수). 도구 `tools/logh7_graphics_config.py`(해상도/리마스터 설정 생성), 스펙 `tools/client_patches/widescreen-ui.json`(Path B, 바이트패치 보류).
- 테스트: 서버 **724/724 통과**. 신규 `logh7-original-officers.test.mjs`.

### P0 작업 큐 재정렬 (2026-06-18 synthesis)

1. **#1 corrupted grid-X**: `sp70→state+0x24`가 포인터성 `0x007b360c`가 되어 `FUN_004d6310`이 -256 반환→자연 클릭 거부. `0x004d7a80` 상류 writer를 함수경계 훅으로 추적(중간훅 금지).
2. **#2 빈 current-source/focus cell**(병렬): `[mainState+8]+0x320` 및 `DAT_007cd04c+0x11178`=0. 0x0325 optional-record+0x08(FUN_004c2c80 param_4[2])이 공급. `FUN_004b5bb0` 재탐색 말고 optional-record producer 계측. 서버: 플레이어 자기 함대를 mode==2에서 0x0325 유닛으로 전달. **중앙고정(Front 3)** 클라 패치(`0x11178` 시드)와 연계.
3. **#3 mode/ordering**: `FUN_004c2a80(1)`이 `0x126711==2`에서 실행되도록; 0x0b09/0x0325/0x0323/0x0b0a를 0x0f06 tick에 재전송.
4. **#4 run-once staging→live 스냅샷 가드**(`clientBase+0x2c03c0`): 빈 0x0314 walker에 arm되어 garbage 동결. 첫 0x0312/0x0314에 실제 grid로 응답하거나 빈 walker 억제; 0x0315를 5004B로 패딩. (Front 2 대체 — 실제 "섞임/항행불능" 항목)
5. **#5 전투 진입→전투→결과 렌더** 라이브 미증명.
6. **#6 한글 UI/채팅 왕복 + 풀스크린 필러**(P0-03/P0-05) — 그래픽 RE와 연계.

남은 미적용(RE 대기): 중앙고정 서버 focusCell+클라패치(Front 3), 궤도/경제 와이어링(Front 5), 국가관리 함대(Front 10).

## 2026-06-18~19 모딩/컨텐츠 인프라 + 전수 RE (Claude 세션 2)

전 클라/서버를 모딩 가능하게 만드는 작업. 서버 테스트 **738/738 그린**.

- **모딩 아키텍처 4레이어** 문서화 `docs/logh7-modding-architecture.md`: A=서버 콘텐츠(우리 소유)·B=루스 에셋·C=텍스트/폰트(셰임 DLL+UTF-8)·D=클라 패치/셰임. 서버 규칙 스크립트 레이어(defines/effects/rules)까지 "완전 분해" 설계.
- **모딩 키스톤 구현(Layer A)**: `src/server/logh7-content-caps.mjs`(RE 검증 클라 제약 코드화 + `validateContentPack`) + `src/server/logh7-mod-loader.mjs`(id 병합·로드순서·충돌검출·캡검증) + auth-server에 **opt-in `LOGH_MODS_DIR`** 연결(검증 실패 시 베이스 유지=클라 무파손). 예시 `mods/example-add-officer/` + 검증 CLI `tools/logh7_validate_mod.mjs` + `mods/README.md`. 테스트 logh7-content-caps/logh7-mod-loader.
- **포트레잇 추가 실현**: `tools/logh7_tcf_pack.py`(없던 TCF 인코더, 라운드트립 검증) + `tools/client_patches/face-atlas-expand.json`(새 슬롯 생성 RE 타깃: FUN_005924c0 캡/베이스 immediate). **텍스처** `tools/logh7_texture_pipeline.py`(TGA↔PNG, D3DX8 content-dispatch).
- **전수 RE 문서**: `docs/logh7-content-catalog.md`(9 카테고리 + 추가 쿡북), `docs/logh7-data-structures-re.md`(0x0323/함대오너십/캡), `docs/logh7-file-re-coverage.md`(전 파일), `docs/logh7-graphics-remaster.md`(해상도/와이드/리마스터; 로비=1024x768 하드코딩 FUN_0051a370), `docs/logh7-font-remaster.md`(GDI ANSI/cp949 강제·내장 `hangeulmenu` win.ini 토글·셰임 DLL·로그인=Win32 다이얼로그 리소스), `docs/logh7-post-permissions.md`(직무권한카드+직위 매트릭스).
- **텍스트 전수 추출/분류**: `tools/logh7_text_classify.py`(데이터파일 9,708·119 도메인) + `tools/logh7_binary_strings.py`(.rsrc 정밀 파싱 → 하드코딩 일본어 UI 153: File/Help/New/Open/About + `ＭＳ Ｐゴシック` 다이얼로그 폰트). 브루트 SJIS 스캔은 데이터섹션 오탐으로 폐기.
- **카논 직위 추출**: `content/roster/canon-character-posts.json`(우리 소스 282명/직위 77) + `content/roster/canon-posts-web.json`(웹 P2, 128명 전원 직위, +68 신규). **새 유저 직위 = 개인(무직)→0x0707 CardAppointment 발령**(unit+0x270 좌석 ≤16). 직위 카탈로그=constmsg g0x03(261).
- **제국 작위/봉토 시스템 확인** `content/manual/imperial-titles.json`: 6단계 세습귀족(공작~남작+제국기사)·봉토(=행성/요새 소유+세수)·자치영주·작위/봉토 수여·세율 명령. **서버 미구현 백로그**.

## 2026-06-19 구현-블로커 RE + P0-02 후보 + 라이브 시도

`docs/logh7-implementation-specs.md`(구현-블로커 RE 워크플로, 6블로커 정밀 RE+검증) 결과:

- **궤도 +0x2c**: 렌더 소비자 없음(링=고정식 `(ordinal+1)*0.25`, FUN_004d3bd0) → **NO-OP**. 추측 안 쓴 것이 정답.
- **함대 로스터 0x2006**: FUN_00444900에 roster 필드 없음(그 u8count+u16[]은 FUN_004301d0의 **card 배열**, 다른 opcode) → **세션 빌더 절대 불가**. 안 건드린 것이 정답.
- **경제**: 0x0337 = ResponseTacticsCharacter와 **하드 충돌**(601dw 오염) → 절대 발신 금지. 라이브 0x031f(buildResponseInformationBaseInner)에 budget/supply 배열로 라우팅. base-economy.mjs는 offline/test-only.
- **0x30b 함선마스터**: 빌더 **+4 버그**(이름@0x0c→0x0a, name_len@0x08, float 4개@0x38/0x3c/0x5c/0x60인데 2개@0x6c/0x74) — 게이트 LOGH_STATIC_SHIPS, 0x030a 요청 핸들러. 미적용(2차).
- **flagship 바인딩**: 체인 확정, 단 0x0323 gridUnitId(BE) vs 0x0325 unit.id(LE) 비대칭(값1로 마스킹). Part A 게이트 LOGH_UNIT_BIND_BE(기본 OFF). 라이브 실험: LOGH_WORLD_UNIT_ID=0x02000000 비대칭 id로 FUN_004c2a80 INNER 매치 관측.

**P0-02 (0x0b01 활성화) — 진짜 블로커 = 빈 current-source 확정**: dispatcher case 0x325가 `FUN_004c2c80(mode=1)`로 호출→ optional record가 slot `mainState+0x80e8c`로 가고 inline source `mainState+0xc`(source+0x320)가 안 써짐 → `+0x126714`=0 → root `+0x11178`=0 → FUN_004d6310 거부 → 0x0b01 없음.
- **후보 A(클라, 바이트검증)**: `tools/client_patches/strat-source-mode.json` — `0x004bb173: 01→00`(push 1→push 0, mode 1→0). EXE에서 `6A 01 E8` 확인 완료.
- **후보 B(서버, 무패치, 적용됨)**: `LOGH_PLAYER_FOCUS_CELL=1`(기본 OFF) — `localFleetRecord`의 commander 슬롯(+0x08==source+0x320)에 홈셀(row*100+col) 시드. **744/744 그린**.
- **라이브 런(2026-06-19) — 깨끗한 환경에서 월드 진입 성공**: 1차 시도는 잔류 서버 10+개로 trace.jsonl 0바이트(관측 불가). **전 node kill → fresh start로 trace 캡처 복구**. 2차(p602b): 캐릭터생성 폼 완주 → **월드+전략맵 진입(NOW LOADING 통과)**. trace에 `0x0f02 world-init / 0x0313·0x0315 마커 / 0x0b09 grid-enter / 0x031c·0x031d base / 0x0323·0x0325`. **중앙(960,540) 클릭은 0x0b01 미발생** — 예상대로(서버 `LOGH_PLAYER_FOCUS_CELL`만으론 부족, 클라 case 0x325가 mode=1로 optional을 `+0x80e8c`에 라우팅 → inline source 미기록). 스크린샷 022/024-*.png(실렌더 870KB) 사용자 전송. stop으로 SHA 복구. **결정적 다음**: 클라패치 `strat-source-mode`(0x004bb173:01→00, mode→0) 적용 + 실제 별 셀 클릭 → 0x0b01; 또는 사양 §6 함수경계 Frida positive-control(FUN_004c4170 onEnter서 src320=홈셀 write)로 두 후보 판가름. 블라인드 클릭이 유일 제약(D3D 렌더라 windowText 미노출).

**P0-02 돌파(2026-06-19) — 메커니즘 증명 + 정답 경로 확정**: `tools/logh7_p0_02_focus_pc.py`(함수경계 Frida positive-control)로 라이브 결정. (1) **`FUN_004c4170`(__fastcall ecx=mainState) onEnter서 `src320=*([mainState+8]+0x320)=0` 확인 → 홈셀 2550 write** → onLeave `+0x126714=2550`, mode `+0x126711=2`, **root `*(DAT_007cd04c+0x11178)=2550`(이전 항상 0!), `FUN_004d6310` PASS(이전 항상 -256)**. **즉 source+0x320=셀 → 0x126714 → 0x11178 → 검증기통과 메커니즘 증명.** 0x11178은 카메라(FUN_004d4e90)도 읽으므로 **Front 3(항상 1,1) 동시 해결**. (2) **후보 검증**: 서버 `LOGH_PLAYER_FOCUS_CELL` 단독=무효(셀이 optional+0x08 가지만 case 0x325 mode=1이 slot `+0x80e8c`로 오라우팅). **1바이트 클라패치 `strat-source-mode`(mode 1→0)=라이브에서 월드진입 깨짐**(0x325는 월드로드 유닛전달 공용→오라우팅, 세션 0x2006까지만 가고 0x0f02 없음). **정답 = surgical code-cave**(`strat-camera-focus.json`): 전략-init서 source+0x320/0x11178=자기유닛셀만 기록(공용 0x325 미변경). positive-control이 이미 동작 증명. 남은 구현 = 그 code-cave 바이트 인코딩 1건. 0x0b01 실발생은 카메라가 셀로 센터된 뒤 그 셀 클릭이면 나옴(positive-control은 카메라센터 이후 write라 클릭셀 불일치로 0x0b01 미발생, 타이밍만 issue).

**P0-02 code-cave 인코딩+빌드+검증 완료(2026-06-19, 라이브검증 대기)**: `tools/logh7_encode_strat_cave.py`+`tools/client_patches/strat-camera-focus.json`. 바이트 확정: detour `FUN_004c4170`@0xc4170 `a0 54 a5 7c 00`(mov al,[0x7ca554])→`e9 60 6b 1a 00`(jmp cave). cave @VA 0x66acd5(fileoff 0x26acd5, .text슬랙 811B제로, 실행가능, 38B): `push eax;mov eax,[ecx+8];test;jz;cmp [eax+0x320],0;jnz;mov [eax+0x320],0x9F6;pop eax;mov al,[0x7ca554];jmp 0x4c4175`. CELL=2550=서버 fleetCellId(row25*100+col50) 일치→카메라 함대셀 센터. 빌드 `.omo/work/G7MTClient.cave.exe`, 양사이트 바이트검증 OK. 검증기 `FUN_004d6310` 해독: cur=*(DAT_007cd04c+0x11178)와 클릭셀 거리→range내 통과(0x0b01=이동목적지), 클릭==cur면 0 → **cave가 cur=2550 채우면 함대 근처 클릭이 0x0b01**. 라이브시퀀스: start --patched-exe G7MTClient.cave.exe +canonical+LOGH_PLAYER_FOCUS_CELL=1→create-character→월드(센터확인)→중앙+인접셀 클릭→0x0b01. 잔여=프로덕션 robust(--cell-mem로 실제 own-fleet셀 읽기, cave-source RE).

**P0-02 cave 위치 버그 수정 + 라이브검증 블로커(2026-06-19)**: (1) **.text-END 슬랙(0x66acd5)은 안전하지 않았음** — 그 페이지에 271개 포인터 참조, cave 시작 직전(0x66accb/0x66acc3)에 참조되는 read-only 데이터. 그 슬랙에 cave를 넣으니 클라가 깨짐. **안전한 cave = .text 내부 0xCC int3 정렬패딩 @VA 0x5d5290(fileoff 0x1d5290, 48B, 참조 0)** 로 이전. 인코더/디스크립터/빌드 갱신, detour `e9 1b 11 11 00`→0x5d5290, 바이트검증 OK. (2) **라이브검증은 별개 하니스 회귀로 블록**: p602c(positive-control 직전 런) 이후 create-character가 세션리스트(0x2006)까지만 가고 **0x2009(세션 진입/새캐릭 클릭)를 안 보냄** → 월드 미진입. **전수 격리로 원인 배제**: cave 아님(canonical 클라도 동일 실패), 서버 아님(src/server mtime 178분+ 전 불변 + 744테스트 통과 + 0x2006 respLen 21258 p602c와 동일), 워크플로 아님(서버 미편집), dgVoodoo Path A 아님(centered_4_3→unspecified 되돌려도 동일), 지속상태 아님(accounts.json 40h 전). 남은 후보=create-character 드라이브 좌표/타이밍(블라인드 클릭이 0x2009 버튼 미스). **다음 세션: 클린 환경서 create-character 좌표 재캘리브 또는 수동 비전유도로 월드 도달 후 cave 라이브검증**. cave 자체는 정확/준비완료.

## 2026-06-22 Claude 사이클 — P0-03 채팅 한글 왕복: cp932 송신 해저드 진단

상세: `.omo/ulw-loop/evidence/p0-03-chat-cp932-send-hazard-20260622.md`. maker/checker 분리(explorer×2 + cp932 심화 → maker(메인) → node tester → verifier 별도 패스).

- **★pivotal 발견(verdict b, verifier PASS)**: 채팅 **송신**이 한글을 cp932로 디코드해 와이어에서 손상시킨다. 체인 = `FUN_00516bf0`(채팅 Enter) → `setlocale(LC_ALL,"Japanese")` → `FUN_004eac60`(ANSI→UTF-16) → `MultiByteToWideChar(932, flag9)` → `FUN_004b5600`(0x0f1c) wire u16[] emit. 게임 전체 LC_ALL setlocale = 2곳 전부 "Japanese", "Korean" 0건. 손상 양상 2종(결정론 재현 `.omo/_verify_mbtwc.txt`, `tools/_cp932_chat_proof.py`): "안녕하세요/로엔그람"=변환 FAIL(GLE 1113)→텍스트 통째 손실, "은하제국/한글"=반각가나 모지바케. **재부팅 후 ACP=949 확정**이라 라이브선 verdict(b) 발현 조건 성립([[logh7-korean-ime-input-utf8beta-2026-06-22]]).
- **서버는 무수정 정상**: 0x0f1c(command-engine)/0x0f1d·0x0f1e(social.mjs) 라이브 권위 배선 완료(`auth-server.mjs:1545-1576`, `world-relay.mjs:24-45`, LOGH_RELAY+LOGH_AUTHORITATIVE 기본 on), UTF-16LE 한글 파싱 테스트 기존재, **서버 1137 PASS**(회귀 없음). P0-03은 클라 송신 인코딩 문제지 서버 문제 아님.
- **P0-03 재정의**: "라이브 검증하면 됨" → **"클라 패치 필요"**. 패치 타깃 식별 = VA 0x0076e3fc(파일오프셋 0x36e3fc) "Japanese\0"→"Korean\0"(byte 확정, canonical playable c1523a5e). **단 리터럴 swap 비권장**(verifier 회귀분석): `FUN_004eb100`이 이 리터럴 공유 = 게임 단일 비트맵폰트 렌더 진입점, setlocale→`WideCharToMultiByte(932)`→`CreateFontA`로 일본어 글리프 래스터화에 실사용 → 949로 바꾸면 **일본어 캐논 메뉴 회귀**. **정답 = code-cave**(채팅 송신만 Korean, FUN_004eb100은 Japanese 유지; 안전 cave @VA 0x5d5290 참조0). 심화 미해결: 채팅 수신도 FUN_004eb100 렌더 → 송신만 고치면 표면처치 가능성, **패치 레이어 확정은 라이브 측정 필요**.
- **라이브 미완(정직)**: 단일 클라(`ko-chat-2026-06-22`) create-character 23단계 클릭 전부 로그인화면 정체, trace conn3/0x0f1c 0건. = **#8/v245 월드진입 좌표 블로커**(별도 항목)에 막힘. stop으로 c1523a5e SHA 복구(shaVerified:true).
- **★전략 권고**: **#8 월드진입 좌표 재교정이 P0-03(채팅)·P0-04(전략명령) 라이브의 공통 게이팅 블로커** → 다음 사이클에서 먼저 닫으면 다전선 라이브 해금. 그 후 P0-03 = baseline 한글 채팅 송신 0x0f1c body 디코드(손상 실측) → code-cave 패치 빌드 → 패치 EXE로 정상 한글 wire + 일본어 메뉴 무손상 스크린샷(회귀가드).

## P1 작업 큐

| id | 상태 | 항목 | 완료 증거 |
|---|---|---|---|
| P1-01 | pending | 서버/클라이언트 레포 분리 설계 확정 | 분리 대상 목록, 제외 대상, 공통 문서 소유권 |
| P1-02 | pending | 자동화 스케줄 실제 등록 | Codex Automation 설정 또는 동등 스케줄 기록 |
| P1-03 | pending | 반복 절차 skill 승격 | skill 또는 plugin 후보 문서와 재사용 지침 |

## 최근 검증 기록

- 2026-06-18: P0-02 v52 실클라 검증. 미니맵 이동 후 실제 화면에서 `베큘라` 주황/황색,
  `발할라` 청색/청록 항성이 보였고, 이는 항성 타입 다색 슬롯 판정과 맞았다. 보이는 항성
  클릭은 validator까지 갔지만 X가 `0x007b360c`로 남아 `FUN_004d6310=-256`으로 탈락했다.
  자연 `0x0b01/0x0b07`은 없었다. 세션 stop 후 canonical playable SHA 복구, 잔여
  `G7MTClient.exe`/Frida/Python watcher와 `4787/47900/47901` listener 없음 확인.
- 2026-06-18: P0-02 v54 실클라 검증. `FUN_004d3580` entry hook 대신 X writepoint
  `0x004d359c`와 Y pre-write `0x004d35a6`을 사용해 보이는 항성 클릭 projection을
  확인했다. `발할라`는 grid `(85,22)`, `베큘라`는 grid `(79,20)`으로 변환됐지만
  trace는 `0x0300->0x0301` 또는 `0x0f08->0x0f09`에 머물렀고 `0x0b01/0x0b07`은 없었다.
  watcher test 8개와 py_compile 통과, 세션 stop 후 canonical playable SHA 복구 및 잔여
  프로세스/포트 없음 확인.
- 2026-06-18: P0-02 v55 실클라 검증. `tools/logh7_selectgrid_click_correlation_watch.py`
  를 추가해 click id별 projection/validator/current/command 상태를 묶었다. `발할라`
  클릭은 writepoint grid `(85,22)`를 만들었지만 실제 `0x004d7bba` validator callsite는
  `sp00=0x007b361c`, `sp04=22`, `sp08=0xffffffff`를 push했고
  `FUN_004d6310=-256`으로 탈락했다. 테스트 11개와 py_compile 통과, 세션 stop 후
  canonical playable SHA 복구 및 잔여 프로세스/포트 없음 확인.
- 2026-06-18: P0-02 v56 실클라 검증. 미니맵 이동 후 `베큘라` 주황/황색,
  `발할라` 청색/청록이 다시 보였고, 항성 데이터도 O/B만 7개라 "파란색 하나"가 아니다.
  업데이트된 watcher는 `projection-state-written-after-004d7aa9=1`을 기록했다.
  `FUN_004d3580` writepoint는 grid `(87,25)`였지만 state-copy 직후와 validator
  callsite의 X는 `0x007b361c`, Y는 `25`였고 `FUN_004d6310=-256`으로 탈락했다.
  자연 `0x0b01/0x0b07`은 없었다. 세션 stop 후 canonical playable SHA 복구 및 잔여
  프로세스/포트 없음 확인.
- 2026-06-18: P0-02 v57-v60 실클라 검증. `0x004d7a7b` call-instruction hook과
  validator 근처 Frida hook을 unsafe로 판정하고 watcher를 return-gated
  `0x004d3581` 기반으로 고쳤다. corrected watcher는 발할라 projection/copy-state가
  정상 X/Y임을 보였고, Frida 없는 v60 자연 클릭은 발할라 셀 하이라이트와
  `clientAlive=true`를 보였다. trace는 아직 `0x0300->0x0301`뿐이라 C002는
  pending이며, 다음은 post-selection command/action state 전이를 추적한다.
  검증: py_compile 통과, watcher unittest 15개 통과, 세션 stop 후 canonical playable
  SHA 복구.
- 2026-06-18: P0-02 항성 타입 재판정 완료. `content/extracted/model-galaxy-stars.json`의 O=2, B=5, A=7, F=8, G=19, K=17, M=21 분포를 재확인했고, “파란/고온 계열이 하나뿐”이라는 화면 판정은 서버가 분광형이 아니라 세력 fallback variant를 내보낸 오판으로 정정했다. `src/server/logh7-content-adapter.mjs`는 분광형을 `model_node_order_provisional` provenance로 싣고, `src/server/logh7-login-protocol.mjs`는 `O/B/A/F/G/K/M -> 0..6`, 명시적 unknown은 `8`로 `0x0313.byte2`를 만든다. 실제 `LOGH_STRAT_GALAXY=1` login-session raw fallback도 같은 분광형을 싣도록 고쳤고, absent-vs-explicit-null semantics를 테스트로 고정했다. 추가로 설치 트리 자산 `fs_glow_000..006` / `fs000_f..fs006_f`를 샘플링해 byte2 0..6이 청자색/청색/청록/황색/주황/적주황/적색 순서임을 확인했다. 이름별 확정 원본 서버 데이터로는 주장하지 않는다. 검증: `node --test tests/server/logh7-content-pack.test.mjs tests/server/logh7-login-session.test.mjs tests/server/logh7-login-protocol.test.mjs tests/server/logh7-strategic-grid-provenance.test.mjs` 145개 통과, `npm run test:server` 716개 통과. 증거: `.omo/ulw-loop/evidence/g006-p002-star-spectral-variant-20260618.md`, `.omo/ulw-loop/evidence/g006-star-slot-texture-contact-20260618.png`.
- 2026-06-17: `docs/logh7-current-work-register-2026-06-17.md` 작성. 현재 해야 할 일을 완료 기준과 검증 루프로 정리했다.
- 2026-06-17: 안전 실행 세션 종료 시 canonical playable SHA `1f7fad439af2fc7f775b4cdfb2a8e10111ebd5209f98dab8905c9b3b238cc00c` 복구 확인.
- 2026-06-17: 안전 플래그 조합으로 로비, 캐릭터 선택, 월드 진입, `0x0f06`, `0x0b09`, `0x0325`, `0x0323`, `0x0356`, `0x1200`, `0x1202`, `0x1201`, `0x0305`, `0x0307` 계열 trace 관측.
- 2026-06-17: `LOGH_NPC_AI=1`/relay 계열을 과하게 켠 실행은 월드 진입 후 `ECONNRESET`/클라이언트 종료 위험이 있어 기본 검증 플래그에서 제외.
- 2026-06-17: P0-01 회원가입 우선 흐름 완료. `p001flow`를 회원가입 포털로 먼저 생성했고, 실제 `G7MTClient.exe`에서 마스킹된 8자 ASCII 비밀번호로 로그인해 `Flow Lee` 캐릭터와 `Echo` 함선명을 입력했다. Trace는 `0x1008`, `0x2004`, `0x0204`, `0x0323`, `0x0356`, `0x0f06->0x0f07`를 포함했고 cleanup은 `shaVerified=true`였다. 증거: `.omo/evidence/task-9-logh7-p0-01-signup-user-flow-world-trace.json`, `.omo/evidence/task-9-logh7-p0-01-signup-user-flow-account-db-after-world.json`, `.omo/evidence/task-9-logh7-p0-01-signup-user-flow-cleanup.json`.
- 2026-06-17: P0-01 no-bypass 검증 완료. 중복 가입은 한국어 오류로 거절됐고, 미가입 계정 socket auth는 redirect 없이 `reject` trace만 남겼으며, wrong password 전후 DB hash/account/character count가 유지됐다. 증거: `.omo/evidence/task-10-logh7-p0-01-signup-user-flow-duplicate.json`, `.omo/evidence/task-10-logh7-p0-01-signup-user-flow-missing-account-trace.json`, `.omo/evidence/task-10-logh7-p0-01-signup-user-flow-wrong-password-dbdump.json`.
- 2026-06-17: P0-02 데이터 마이닝 재분류 완료. 성계/행성 이름과 궤도순은 `content/galaxy.json` 및 KO sidecar에서 사용 가능하고, 성계 marker `byte0`은 `constmsg` group `0x18` sub-ID로 복원됐다. 성계 좌표는 manual/PDF 주석 투영, 항성 등급은 미결합 MDX 노드, 행성 위치/경제와 시설 상태는 절차 생성 또는 layout-only로 분리했다. 증거: `docs/logh7-world-data-mining-status.md`, `.omo/ulw-loop/evidence/g006-world-data-mining-source-shape.json`, `.omo/ulw-loop/evidence/g006-world-data-mining-dataset.json`, `.omo/ultraresearch/20260617-g006-data-mining/*.md`.
- 2026-06-17: 오리지널 캐릭터 이름/능력치/포트레잇 결합 자료 재채굴 완료. 설치본 `G7MTClient.exe`, `MsgDat`, `Face/*.tcf`, `tcf.hed`에서 joined roster 표는 발견되지 않았고, 클라이언트에는 character record layout과 포트레잇 atlas만 있는 것으로 판정했다. 공식 face-number anchor 12개 외의 `character-roster.json`/ability seed/face assignment는 mixed-provenance 부활 데이터로 유지한다. 증거: `docs/logh7-character-origin-data-mining-status.md`, `.omo/ulw-loop/evidence/g006-character-origin-data-mining-summary.json`, `.omo/ulw-loop/evidence/g006-character-origin-no-roster-verifier.txt`.
- 2026-06-17: 캐릭터 하우스룰/부활용 roster가 런타임에서 원본처럼 보이지 않도록 `contentPack.characters[*].source`와 `provenance.{name,stats,portrait}`를 보존한다. 실제 pack shape는 97명 모두 provenance를 갖고, stats authority는 `revival_roster`, portrait authority는 `official_anchor` 8명 / `house_rule` 89명이며 `originalServerClaims=[]`다. 증거: `.omo/ulw-loop/evidence/g006-character-provenance-data-shape.json`, `.omo/ulw-loop/evidence/g006-character-provenance-focused-tests.txt`.
- 2026-06-17: P0-02 실클라 좌표 런 2차 재판정. `0x0313/0x0315` staging/live marker table 81개 증거는 유효하지만, `ルンビーニ` cell `(42,2)`/`(97,21)`와 `イゼルローン` cell `(25,25)`/`(48,13)` 화면 위치/렌더 라벨 판정은 raw/mirror PDF annotation 좌표 기반이라 철회했다. PDF 저장 rect와 `content/galaxy.json` 정규화 프레임을 분리해, 서버 grid에는 `displayX=contentCy`, `displayY=contentCx`를 적용한다. 새 기대값은 `ルンビーニ` cell `(2,21)`, `イゼルローン` cell `(51,13)`, `シロン` cell `(3,15)`, `フェザーン` cell `(49,38)`이다. 증거: `docs/logh7-coordinate-provenance.md`, `.omo/evidence/task-3-p0-02-coordinate-evidence-provenance.json`, `.omo/ulw-loop/evidence/manual-pdf-coordinate-recheck-20260617/page101-transform-fit-to-annotation-icons.json`, `.omo/ulw-loop/evidence/g006-redatamine-manual-20260617/manual-content-frame-recheck.json`.
- 2026-06-17: corrected-cell 실클라 런 완료. canonical playable EXE로 `inei00` 로그인, 캐릭터 선택, 월드 진입을 재현했고 trace는 `0x0206`, `0x0313`, `0x0315`, `0x0323`, `0x0356`, `0x0f06->0x0f07`를 포함한다. `ルンビーニ (2,21)` / `イゼルローン (51,13)` 단일 클릭, 더블 클릭, 우클릭, 패널 후보 클릭은 `0x0300` 또는 무트레이스에 머물렀으며 `0x0b01/0x0b07`은 없었다. cleanup은 canonical playable SHA를 확인했다. 증거: `.omo/ulw-loop/evidence/g006-redatamine-manual-20260617/corrected-client-trace-summary.json`, `.omo/ulw-loop/evidence/g006-redatamine-manual-20260617/corrected-client-stop.txt`.
- 2026-06-17: G006 C002 current-character/actionability 재계측 완료. `0x0356`은 native LE 고정 레코드가 아니라 `FUN_0042c7e0`/`FUN_004c0400`가 소비하는 compact stream이고, wire 숫자 필드는 BE여야 한다. 실클라 Frida에서 compact BE `0x0356`이 current slot을 `seatCount=1`로 만들고 selection refresh가 `listAfterCount188=1`, `selectionPayloadSeatCount270=1`을 만들었음을 확인했다. 그러나 targeted click 및 `mouse_event(MOVE|ABSOLUTE)` full-window 1564점 sweep에서도 `selectionSelected189=-1`, `hudModeF4=1`, `commandD6=-1`, `commandCount620=0`, row-hit true 0회, mode/category/command activation 0회였다. 증거: `.omo/ulw-loop/evidence/g006-c002-compact-0356-selection-hit-summary.json`, `.omo/ui-explorer/session-g006-selection-hit-sweep-20260617/selection_hit_probe_mouseevent_grid.jsonl`, `.omo/ui-explorer/session-g006-selection-hit-sweep-20260617/selection_mouseevent_grid_moves.jsonl`.
- 2026-06-17: `0x0305/0x0307` 직무카드 주입 가설 반박. direct runtime positive control은 category 0에 command factory 값을 직접 쓰면 `FUN_004f5cb0(0)`가 행을 만들 수 있음을 보였지만, corrected Frida `FUN_004ba2b0` thiscall 훅은 conn3 월드 로그인 `0x0304->0x0305`, `0x0306->0x0307` dispatcher body pointer가 직무카드 builder byte가 아니라 `Friedrich IV`류 tail을 가리킴을 확인했다. 뒤의 wire/body residue 정정 기준으로 이 tail은 실제 server wire가 아니라 수신 객체 잔여 바이트다. 서버 trace가 extra `0x0305/0x0307`을 보냈어도 클라이언트 디스패처는 이를 의도한 static-card/command table로 소비하지 않았다. 기본 서버/런처에서 `LOGH_DUTY_CARDS_*` 플래그는 더 이상 쓰지 않는다. 증거: `.omo/ui-explorer/session-g006-duty-rebuild-guard-20260617/dispatcher_card_hook_corrected.jsonl`, `.omo/ui-explorer/session-g006-duty-rebuild-guard-20260617/card_pattern_scan_probe.jsonl`, `.omo/ulw-loop/evidence/g006-c002-duty-card-collision-correction-20260617.txt`, `docs/logh7-inworld-progress.md` P56.
- 2026-06-17: G006 C002 범주 재타깃 비교 완료. `LOGH_ACTION_LIST_CATEGORY=0`은 compact `0x0356`에서 selection payload entry가 0으로 내려갔고, `LOGH_ACTION_LIST_CATEGORY=1`로 entry가 1이어도 이 당시 훅에서는 row hit 뒤 선택/범주 적용을 충분히 잡지 못했다. 선부착 훅은 `LOGH_ACTION_LIST_APPOINTMENT=1`의 S->C `0x0707`이 trace에는 보이지만 `dispatcher-0707-enter`/`appointment-apply-*`로 도달하지 않음을 확인했다. 이 항목의 selection-setter 추정은 바로 다음 final gate 항목으로 정정됐다. 증거: `.omo/ulw-loop/evidence/g006-c002-category-retarget-and-0707-rebuttal-20260617.txt`.
- 2026-06-17: G006 C002 final gate 정정 완료. 범주 0 final 세션에서 `listSelected189 -1->0`, `FUN_004f6b00 retval=0`, `FUN_004f5cb0(0)` 호출/반환 `1`까지 확인했지만 `rowCountD4 24->0`으로 접혔고 `0x0b01`은 없었다. 범주 1도 prior safe 세션에서 `listSelected189 -1->0`, `FUN_004f6b00 retval=1`까지 갔으며, 재실행 snapshot은 `categoryD6=1,rowCountD4=0`이었다. 이전 crash `0x005034e9`는 `FUN_005034d0` invalid label/widget pointer 분기로 보존하되 현재 blocker는 아니다. 다음 blocker는 selection setter가 아니라 `FUN_004c8700()` runtime command table의 `record+0x14` row count / `record+0x16` factory population이다. 증거: `.omo/ulw-loop/evidence/g006-c002-category-apply-rowcount-zero-20260617.txt`.
- 2026-06-17: G006 C002 command table lifecycle 계측 완료. safe full-world 세션에서 live `0x0305/0x0307` dispatcher는 staging `+0x3e0c8c/+0x3e5e96`에 문자열성 세션/캐릭터 바디를 넣었지만 `count00=0`, category0 `commandCount14=0`이었다. `FUN_004c2a30 -> FUN_004c4a10`은 그 빈 count를 runtime `+0x3416d8/+0x3468ea`로 복사하고 guard를 1로 세웠다. 이후 `FUN_004f5cb0(0)` 직전에도 `runtime305.category0.commandCount14=0`이라 `rowCountD4=0`으로 접혔다. 증거: `.omo/ulw-loop/evidence/g006-c002-command-table-lifecycle-20260617.txt`, `.omo/ui-explorer/session-g006-command-table-lifecycle-47900-20260617/command_table_lifecycle.jsonl`.
- 2026-06-17: G006 C002 positive-control 비교 완료. 과거 runtime table 직접 패치는 `tableBase+0x1e=2`, `+0x20=0x002b`, `+0x22=0x0041`만으로 `FUN_004f5cb0(commandMenu,0)`가 `rowCountD4=2`를 만들었지만, safe full-world 경로는 같은 category 0 record의 `commandCount14=0` 상태로 `FUN_004c4a10`에 승격된다. 따라서 native UI command row 생성은 동작하고, 미해결점은 one-shot 승격 전 staging source다. 증거: `.omo/ulw-loop/evidence/g006-c002-command-table-positive-control-compare-20260617.txt`.
- 2026-06-17: G006 C002 wire/body residue 정정 완료. 서버 trace 계측으로 live `0x0304->0x0305` generic wire body 21002B와 `0x0306->0x0307` generic wire body 58802B의 앞 256B가 모두 0이고 count도 0임을 확인했다. 같은 세션의 Frida dispatcher body pointer에는 `Friedrich IV`류 tail이 보였으므로, 이전 "실제 body가 세션/캐릭터 문자열" 표현은 wire가 아니라 수신 객체 잔여 메모리로 정정한다. 증거: `.omo/ulw-loop/evidence/g006-c002-wire-zero-body-residue-20260617.txt`, `.omo/ui-explorer/session-g006-wire-body-residue-47900-20260617/trace.jsonl`, `.omo/ui-explorer/session-g006-wire-body-residue-47900-20260617/command_table_lifecycle.jsonl`.
- 2026-06-17: G006 C002 원본 static command table raw scan 완료. 설치/추출 트리의 MsgDat, Face TCF, window dat, EXE 후보 96개를 스캔했지만 authoritative 원본 command table은 찾지 못했다. 구조 후보는 PE/MsgDat/TCF raw-byte false positive로 판정했고, positive-control형 literal `0x0041,0x002b` 1건은 설치 트리 `G7Start.exe`에만 있어 원본 게임 클라 staging source로 인정하지 않는다. 증거: `.omo/ulw-loop/evidence/g006-c002-original-static-command-table-scan-verdict-20260617.txt`, `.omo/ulw-loop/evidence/g006-c002-original-static-command-table-scan-20260617.json`, `.omo/ulw-loop/evidence/g006-c002-command-factory-literal-scan-20260617.txt`.
- 2026-06-17: G006 C002 command-table preload v3 실클라 검증 완료. `LOGH_COMMAND_TABLE_PRELOAD_PROBE=1`에서 `0x0304`의 정상 empty `0x0305`를 유지한 뒤 compact nonzero `0x0305`를 추가 전송하고, `0x0306`에는 compact nonzero `0x0307`을 직접 응답했다. 실제 `G7MTClient.exe` Frida 계측은 `staging305.count00=1`, `category0.commandCount14=2`, factory `0x002b/0x0041`, `staging307.count00=1`을 확인했고, `FUN_004c4a10` 이후 `runtime305.guard00=1`, `bodyCount08=1`, `runtime305.category0.commandCount14=2`, `runtime307.count00=1`로 승격됐다. 다만 이후 bottom-right 명령 리스트 클릭은 time sync만 만들었고 `category-apply`/`0x0b01`은 아직 발생하지 않았다. 증거: `.omo/ulw-loop/evidence/g006-c002-command-table-preload-v3-20260617.md`, `.omo/ui-explorer/session-g006-command-table-preload-probe-v3-47900-20260617/command_table_lifecycle.jsonl`, `.omo/ui-explorer/session-g006-command-table-preload-probe-v3-47900-20260617/trace.jsonl`.
- 2026-06-17: G006 C002 command-menu activation v5 실클라 검증 완료. `LOGH_COMMAND_TABLE_PRELOAD_PROBE=1`은 v5에서도 `runtime305.category0.commandCount14=2`로 승격됐다. 하지만 `1146,948/985` 우측 메뉴 클릭은 `idB04=11`의 system/info-panel 행(`1. 국가관리`)을 맞혔고 command-menu target row가 아니었다. `modeButton24/28` 후보도 실제로는 우측 상단 `게임 중단`/`사운드 설정` 버튼 rect였다. category hook은 `categoryResolve=0`, `categoryApply=0`, `rowHit=0`, trace는 `0x0300` heartbeat와 사전 push `0x0b09/0x0b0a`만 보였고 inbound `0x0b01`/`0x0b07`은 없었다. 증거: `.omo/ulw-loop/evidence/g006-c002-command-menu-activation-v5-20260617.md`, `.omo/ui-explorer/session-g006-command-table-menu-activation-v5-47900-20260617/command_table_lifecycle.jsonl`, `.omo/ui-explorer/session-g006-command-table-menu-activation-v5-47900-20260617/category0_0356_apply.jsonl`, `.omo/ui-explorer/session-g006-command-table-menu-activation-v5-47900-20260617/trace.jsonl`.
- 2026-06-17: G006 C002 direct category apply v7 검증 완료. `FUN_004f5cb0(commandMenu,0)` 직접 호출은 `rowCountD4=2`, `categoryD6=0`, factories `0x002b/0x0041`과 command row object `idB04=23/650`을 만들었다. 그러나 화면의 `1. 국가관리`는 direct apply 전부터 보이던 별도 `idB04=11` system/info-panel row였고, `1146,985` hit-route는 `object=0x133a4f10`, rect `1084,977..1244,993`, `isMenuRow=false`, trace `0x0f08->0x0f09`만 남겼다. `FUN_005015f0(kind=2)`는 force 전/후 35개 hit를 기록했지만 command rows는 0회였고, `modeF4=2`, `selectionAb0=0` 강제도 route attach를 만들지 못했다. 증거: `.omo/ulw-loop/evidence/g006-c002-direct-category-apply-v7-20260617.md`, `.omo/ui-explorer/session-g006-command-table-direct-apply-v7-47900-20260617/direct_category_apply.jsonl`, `.omo/ui-explorer/session-g006-command-table-direct-apply-v7-47900-20260617/menu_row_route_only.jsonl`, `.omo/ui-explorer/session-g006-command-table-direct-apply-v7-47900-20260617/fun5015_command_row.jsonl`, `.omo/ui-explorer/session-g006-command-table-direct-apply-v7-47900-20260617/fun5015_after_force_mode.jsonl`.
- 2026-06-17: G006 C002 row active gate v8 검증 완료. v8은 `FUN_004f5cb0(commandMenu,0)` 후 `rowCountD4=2`, `categoryD6=0`을 다시 만들었고, row refs는 `commandMenu+0x30/+0x34` 및 같은 메모리의 `hud+0x160/+0x164`에만 남았다. `row_scan_gate_dump`는 `commandMenu.activePtr=0x0fba0e40`, `activePtr+4=0`, `rowListCount620=0`, `rowBuffer628=null`을 확인했다. 진단용으로 `activePtr+4`를 `0->1`로 쓰자 row0/row1이 `FUN_005015f0(kind=2)`에 들어왔지만 둘 다 `hit=false`였고, `1146,985` 재클릭도 `0x0f08->0x0f09`뿐이었다. 증거: `.omo/ulw-loop/evidence/g006-c002-row-active-gate-v8-20260617.md`, `.omo/ui-explorer/session-g006-row-attach-v8-47900-20260617/row_attach_probe.jsonl`, `.omo/ui-explorer/session-g006-row-attach-v8-47900-20260617/row_scan_gate_dump.jsonl`, `.omo/ui-explorer/session-g006-row-attach-v8-47900-20260617/post_gate_row_hit_probe.jsonl`, `.omo/ui-explorer/session-g006-row-attach-v8-47900-20260617/post_gate_row_hit_click_probe.jsonl`.
- 2026-06-17: G006 C002 gate pair v9 검증 완료. `FUN_00502ea0(activePtr,1)`와 `FUN_005024b0(activePtr,1)`를 같이 호출해 active object `+4/+5=1`을 만들자 row0/row1의 global rect가 각각 `(12,136)..(103,157)`, `(113,136)..(204,157)`로 잡혔다. row0 center `(57,146)` 클릭은 `selectedD5=0`, `FUN_004f93c0(factoryIndex=0x2b, category=0)` 호출/반환 `1`까지 갔고 화면에는 `워프 항행` 설명이 보였다. 그러나 목표 grid click은 `FUN_00581c80` SelectGrid, `FUN_0058fef0` command gate, `FUN_005737d0` SendWarpCommand 모두 0회였고 `FUN_004b78a0(arg2=48)` 및 `0x0f08->0x0f09` 정보 트래픽만 남았다. `0x0b01/0x0b07`은 없다. 증거: `.omo/ulw-loop/evidence/g006-c002-gate-pair-v9-20260617.md`, `.omo/ui-explorer/session-g006-active-gate-v9-47900-20260617/gate_pair_probe_fixed2.jsonl`, `.omo/ui-explorer/session-g006-active-gate-v9-47900-20260617/row_center_click_probe_filtered2.jsonl`, `.omo/ui-explorer/session-g006-active-gate-v9-47900-20260617/selectgrid_target_probe.jsonl`.
- 2026-06-17: G006 C002 factory-return v10 정정 완료. v9의 "SelectGrid 0회"는 row0 클릭 뒤에 관찰기를 붙인 타이밍 문제였다. v10b는 row0 클릭 전부터 `0x004f93c0`, `0x00581c80`, `0x0058fef0`, `0x005737d0`, `0x004b78a0`을 붙였고, runtime `slot2b=0x581c80`이 실제 `FUN_00581c80`임을 확인했다. row0 center `(57,146)` 클릭은 `FUN_004f93c0(index=0x2b, category=0)`에서 `FUN_00581c80(arg1=row0,arg2=commandMenu)`를 1회 호출했고, SelectGrid 객체 `0x544db60` vtable `0x6702b8`을 만들어 manager current dialog에 연결했다. 그러나 target click `(833,545)`은 `FUN_004b78a0(arg1=1,arg2=0x45,...)`만 탔고, 정적 switch case `0x44`에 따라 `0x0f08/0x0f09` 정보 경로로 빠졌다. row0 재클릭, Enter, target 반복 클릭도 `FUN_0058fef0` command gate와 `FUN_005737d0` SendWarpCommand를 0회로 남겼고 `0x0b01/0x0b07`은 없다. 증거: `.omo/ulw-loop/evidence/g006-c002-factory-return-v10-20260617.md`, `.omo/ui-explorer/session-g006-factory-return-v10-47900-20260617/factory_return_probe_v10b.jsonl`, `.omo/ui-explorer/session-g006-factory-return-v10-47900-20260617/trace.jsonl`, `.omo/ui-explorer/session-g006-factory-return-v10-47900-20260617/shots/007-v10-target-grid.png`.
- 2026-06-17: G006 C002 SelectGrid child/object v12b 검증 완료. `session-g006-selectgrid-v12b-47900-20260617`에서 canonical playable `G7MTClient.exe`로 row0 `(57,146)` 클릭을 재현했고, `FUN_004f93c0(index=0x2b)`가 `FUN_00581c80`을 호출해 SelectGrid root `0x551db60` vtable `0x6702b8`을 current dialog로 연결했다. Arena scan은 `ReceiveResult 0x551d930/0x551dd70(p28=0xb07,p2c=0xb01)`, `GoReceive 0x551d9a0(slot2=0x581570)`, `SendWarpCommand 0x551d9d0(vtable 0x676aec, slot2=0x5737d0)`, `SelectGrid.targetRoot 0x551dac0(slot2=0x570a10)`, `TargetGrid.child 0x551dae8(slot3=0x573cd0)`를 확인했다. 그러나 target click `(833,545)`은 계속 `FUN_004b78a0(arg2=0x45)` 및 trace `0x0f08->0x0f09`만 남겼고, `0x0058fef0`, `0x005737d0`, `0x00573cd0`, `0x004b48d0`, inbound `0x0b01`, outbound `0x0b07`은 없었다. 증거: `.omo/ulw-loop/evidence/g006-c002-selectgrid-child-v12-20260617.md`, `.omo/ui-explorer/session-g006-selectgrid-v12b-47900-20260617/selectgrid_v12b_probe.jsonl`, `.omo/ui-explorer/session-g006-selectgrid-v12b-47900-20260617/selectgrid_v12b_arena_scan.jsonl`, `.omo/ui-explorer/session-g006-selectgrid-v12b-47900-20260617/trace.jsonl`.
- 2026-06-18: G006 C002 v30/v31 전역 슬롯/힙 슬롯 계측 완료. `DAT_007cd04c` root는 `0x0f02` world-init bundle 뒤, `0x0f06` 요청 전에 생성된다. v30c stage2는 root `0xf5e7918`이 `2026-06-18T01:42:12.139Z`에 처음 나타나고, guard `DAT_007cd048=1`은 `01:42:12.327Z`, `FUN_004d3a40` 진입은 `01:42:12.352Z`로 root/guard 뒤임을 확인했다. `MemoryAccessMonitor`는 page read 1회만 잡고 write 0회라 writer 식별에는 실패했다. v31b는 root `0xf5f0918`이 `2026-06-18T01:51:44.227Z`에 나타났지만, 178개 allocator hook event 중 root exact/near allocation match가 0임을 확인했다. v31c wide retry는 `0x0f07`에 못 도달한 불완전 시도라 completion evidence가 아니다. 증거: `.omo/ulw-loop/evidence/g006-c002-global-heap-slot-v30-v31-20260618.md`, `.omo/ulw-loop/evidence/g006-c002-global-heap-slot-timeline-v30-v31-20260618.json`, `.omo/ulw-loop/evidence/g006-c002-global-slot-watch-v30c-stage2-summary.json`, `.omo/ulw-loop/evidence/g006-c002-heap-slot-watch-v31b-summary.json`, `.omo/ulw-loop/evidence/g006-c002-heap-slot-watch-v31c-cleanup.txt`.
- 2026-06-17: G006 C002 target/confirm v13b 검증 완료. v13에서 v12b의 `LOGH_LOBBY_OK_FORMAT=message32`, `LOGH_LOBBY_EARLY_OK=1`, `LOGH_SS_FORMAT=message32` 플래그를 빠뜨리면 trace상 로그인은 성공해도 UI가 로그인 화면에 머물렀고, v13b에서 플래그를 복원하자 로비/캐릭터 선택/월드 진입이 정상 재현됐다. row0 `(57,146)`은 warp target UI를 열었고 target `(833,545)`은 `90 LY`를 표시했다. 이 상태에서 `SelectGrid.targetRoot 0x00570a10`은 `DAT_009d2a34=257`, `DAT_009d2a3c=1`, `DAT_009d2a40=0xffffffff`, `selectedD5=0`으로 return `1`만 반복했다. 두 번째 target click, `SPACE`, right click은 명령을 만들지 않았고, `ENTER`는 `FUN_004b78a0(arg1=1,arg2=0x45,...)` 및 trace `0x0f08->0x0f09` 정보 경로였다. `0x00573cd0`, `0x005737d0`, `0x00575510`, `0x004b48d0`, `0x004b4920`, `0x004b49d0`, `0x0b01/0x0b07`은 없었다. 증거: `.omo/ulw-loop/evidence/g006-c002-target-confirm-v13b-20260617.md`, `.omo/ui-explorer/session-g006-selectgrid-v13b-47900-20260617/selectgrid_v13_confirm_only_probe.jsonl`, `.omo/ui-explorer/session-g006-selectgrid-v13b-47900-20260617/trace.jsonl`.
- 2026-06-17: G006 C002 v14b positive-control 검증 완료. target `(833,545)`로 `90 LY`가 표시된 상태에서 `DAT_009d2a3c=2`를 단발 주입하자 `FUN_00570a10`이 return `3`을 냈고 확인창, `FUN_005737d0`, `FUN_004b48d0`, inbound `0x0b01`이 이어졌다. 다만 `DAT_009d2a40=0xffffffff`와 `sendGridMove(arg1=0xffffffff,arg2=0,arg3=0)` 때문에 유효 목적지/대상 writer는 아직 미확인이다. 이 safe run은 `LOGH_RELAY`/`LOGH_AUTHORITATIVE`를 끈 상태라 서버는 generic `0x0b02`로 답했고, `0x0b07` 권위 루프는 아직 검증하지 않았다. 증거: `.omo/ulw-loop/evidence/g006-c002-d2a3c-positive-control-v14b-20260617.md`, `.omo/ui-explorer/session-g006-selectgrid-v14-positive-control-47900-20260617/selectgrid_v14b_force_d2a3c2_probe.jsonl`, `.omo/ui-explorer/session-g006-selectgrid-v14-positive-control-47900-20260617/trace.jsonl`.
- 2026-06-18: G006 C002 v21-v26 writer/projection 분리 완료. v21은 left-click writer branch가 실제로 `0x004d7b13` validator까지 도달함을 보였지만 자연 인자는 `x=0,y=0,range=5`라 pass/target/phase2가 없었다. v22는 `FUN_004d3580` 뒤 projection writer가 `state+0x24=0x007b360c`, `state+0x28=0`을 반복해서 쓰는 것을 확인했다. v24/v26의 `(42,25)` 강제 주입은 call-site stack까지 들어갔지만 pass 없이 v26에서 클라이언트가 `ECONNRESET`으로 죽었다. 따라서 최신 blocker는 강제 좌표가 아니라 `FUN_004d3580`/`0x004b25a0`의 projection output 의미와 `FUN_004d6310` 기대 표현이다. 증거: `.omo/ulw-loop/evidence/g006-c002-selectgrid-writer-branch-v21-v26-20260618.md`, `.omo/ulw-loop/evidence/g006-c002-selectgrid-writer-branch-v21-v26-cleanup-20260618.txt`.
- 2026-06-18: G006 C002 v27 projection/camera 정정 완료. v22의 `state+0x24=0x007b360c,state+0x28=0`은 침습적 mid-function/caller-stack probe 결과라 다음 주 blocker로 쓰지 않는다. 정적 `FUN_004d3540`/`FUN_004d3580`와 safer v20 function-level probe 기준, projection 수식 자체는 `gridX=ftol(worldX+50)`, `gridY=ftol(25-worldZ)`로 정상이다. 자연 세션의 문제는 `DAT_007cd04c+0x11178`이 0이고 camera/focus가 top-left `(-49.5,24.5)`에 남아 있어 `(0,0)/(1,0)`으로 투영되는 것이다. raw-only `2539` force도 camera/focus를 움직이지 못했다. 다음 blocker는 서버/클라 데이터 경로가 현재 위치 raw와 `FUN_004d4e90`/`FUN_004d5030` focus writer를 언제 초기화하는지다. 증거: `.omo/ulw-loop/evidence/g006-c002-projection-camera-v27-20260618.md`.
- 2026-06-18: G006 C002 v28 current-grid raw 정적/서버 경로 대조 완료. `DAT_007cd04c+0x11178` 즉시값은 바이너리에서 6회만 나오고 모두 read이며, direct store 패턴은 발견되지 않았다. `0x0317 ResponseInformationGrid`는 현재 grid 값을 담지만 native landing field가 `clientBase+0x35f358`로 확인되어 `DAT_007cd04c+0x11178`과 동일시할 수 없다. `FUN_004d3a40`은 `DAT_007cd04c+8`의 100x50, stride 14 확장 grid writer/initializer 후보지만 `+0x11178` writer는 아니다. 다음은 `0x0f06`/`0x0b09`/`0x0325`/`0x0323`/`0x0356`/`0x0b0a` 직후 watchpoint timeline이다. 증거: `.omo/ulw-loop/evidence/g006-c002-current-grid-raw-v28-20260618.md`.
- 2026-06-18: G006 C002 v29 current-grid watch baseline 완료. 재사용 가능한 Frida attach 도구 `tools/logh7_current_grid_watch.py`를 추가했고, baseline 실클라 세션에서 `0x0325`, `0x0323`, `0x0f06->0x0f07`까지 도달한 상태를 로그인 전 attach로 관측했다. 결과는 `DAT_007cd04c+0x11178=0`, `+0x1117c=0`, `+0x11180` zero sample, `FUN_004d4e90` 후 camera/focus `(-49.5,0,24.5)`로 유지였다. hook failure는 0개, watcher event는 2086개였고 cleanup은 `shaVerified=true`, baseline server/client PID 종료, `4787/47900/47901` LISTENING 없음. `npm run test:tools` 247개도 float 수정 후 재통과했다. 증거: `.omo/ulw-loop/evidence/g006-c002-current-grid-watch-v29-20260618.md`, `.omo/ulw-loop/evidence/g006-c002-current-grid-watch-v29-baseline-summary.json`.
- 2026-06-18: G006 C002 v29 `LOGH_GRID_ENTER=1` 변형 실클라 관측 완료. trace는 `0x0f06->0x0f07` 뒤 `0x0b09`와 `0x0b0a`까지 도달했지만 watcher 6188 event 전체에서 `DAT_007cd04c+0x11178=0`, `+0x1117c=0`, `+0x11180` zero sample, `+8` zero sample이었다. `FUN_004d4e90`/`FUN_004d5030`은 각각 1회, `FUN_0058ee70`은 3086회 enter/leave를 기록했지만 current raw는 계속 0이고 camera/focus는 `(-49.5,0,24.5)`였다. cleanup은 `shaVerified=true`, grid-enter server/client PID 종료, `4787/47900/47901` LISTENING 없음. 증거: `.omo/ulw-loop/evidence/g006-c002-current-grid-watch-v29-gridenter-summary.json`, `.omo/ulw-loop/evidence/g006-c002-current-grid-watch-v29-gridenter-trace.json`, `.omo/ulw-loop/evidence/g006-c002-current-grid-watch-v29-gridenter-stop.json`.
- 2026-06-18: G006 C002 v29 `LOGH_GRID_ENTER=1 + LOGH_POSTLOAD_PLAYER_RECORD=1` 변형 실클라 관측 완료. trace는 `0x0f06->0x0f07` 뒤 `0x0b09`, 추가 `0x0325`, 추가 `0x0323`, `0x0b0a`까지 도달했지만 watcher 5750 event 전체에서 `DAT_007cd04c+0x11178=0`, `+0x1117c=0`, `+0x11180` zero sample, `+8` zero sample이었다. `FUN_004d4e90`/`FUN_004d5030`은 각각 1회, `FUN_0058ee70`은 2867회 enter/leave를 기록했고 camera/focus는 `(-49.5,0,24.5)`였다. cleanup은 `shaVerified=true`, player-record server/client PID 종료, `4787/47900/47901` LISTENING 없음. 증거: `.omo/ulw-loop/evidence/g006-c002-current-grid-watch-v29-playerrecord-summary.json`, `.omo/ulw-loop/evidence/g006-c002-current-grid-watch-v29-playerrecord-trace.json`, `.omo/ulw-loop/evidence/g006-c002-current-grid-watch-v29-playerrecord-stop.json`.
- 2026-06-18: G006 C002 v29 `LOGH_GRID_ENTER=1 + LOGH_POSTLOAD_RICH_CHARACTER=1` 변형 실클라 관측 완료. trace는 `0x0f06->0x0f07` 뒤 `0x0b09`, 추가 `0x0325`, 추가 `0x0323`, `0x0b0a`, compact `0x0356`, `0x1200`, `0x1202`, `0x1201`까지 도달했지만 watcher 4336 event 전체에서 `DAT_007cd04c+0x11178=0`, `+0x1117c=0`, `+0x11180` zero sample, `+8` zero sample이었다. `FUN_004d4e90`/`FUN_004d5030`은 각각 1회, `FUN_0058ee70`은 2160회 enter/leave를 기록했고 camera/focus는 `(-49.5,0,24.5)`였다. cleanup은 `shaVerified=true`, rich-character server/client PID 종료, `4787/47900/47901` LISTENING 없음. v29 분리 server-delivery 후보는 모두 current raw/list를 채우지 못했다. 증거: `.omo/ulw-loop/evidence/g006-c002-current-grid-watch-v29-richcharacter-summary.json`, `.omo/ulw-loop/evidence/g006-c002-current-grid-watch-v29-richcharacter-trace.json`, `.omo/ulw-loop/evidence/g006-c002-current-grid-watch-v29-richcharacter-stop.json`.
- 2026-06-17: 이번 정정은 `omo ulw-loop steer --kind annotate_ledger`로 기록하려 했으나 CLI가 현재 스레드 하위 `.omo/ulw-loop/019ed2ae-8d4b-7123-97c5-006b6d494778/goals.json`을 요구해 `ULW_LOOP_PLAN_MISSING`으로 실패했다. 공용 루프 상태는 이 파일과 `.omo/ulw-loop/evidence/g006-c002-duty-card-collision-correction-20260617.txt`에 고정한다.
- 2026-06-18: G006 C002 v32/v33 page writer 판별 완료. copy/fill overlap watcher는 `0x0f07`까지 도달했지만
  `overlap-write=0`이었고, page-guard watcher가 `0x007cd04c` write fault를 잡았다. 루트 writer는
  `FUN_004c8a10` 내부 `0x004c8a23`의 `*(param_1+4)=param_2` 대입으로 확정했다. 다만 root 대입 뒤에도
  `currentRaw11178=0`, `listCount1117c=0`이라 C002는 계속 pending이다. 다음 판별은 `FUN_004c8a10`
  entry args와 `param_2` 출처, `FUN_004d3bd0`/`FUN_004c8bc0`/`FUN_004d3a40` 전후 root field snapshot이다.
  증거: `.omo/ulw-loop/evidence/g006-c002-pageguard-v32-v33-20260618.md`,
  `.omo/ulw-loop/evidence/g006-c002-pageguard-v33-20260618.jsonl`,
  `.omo/ulw-loop/evidence/g006-c002-pageguard-v33-stop.json`.
- 2026-06-18: G006 C002 v34 root initializer boundary 판별 완료. `FUN_004c8a10` entry에서
  `rootParam2=0xf5ef918`은 이미 `byte0=1`, `currentRaw11178=0`, `listCount1117c=0`, grid head zero였다.
  `FUN_004d3bd0`, `FUN_004c8bc0`, `FUN_004d3a40` entry/leave 모두 current/list/grid head를 채우지 않았다.
  따라서 다음 blocker는 root assignment가 아니라 `FUN_004c8a10`에 들어오기 전 `rootParam2` 객체의 생성/채움
  경로다. 다음 판별은 `FUN_004c4170` 내부 `FUN_004b5bb0 -> FUN_004c45f0(uVar2,2)`와
  `FUN_004b64c0` entry `edx` root candidate guard다. 증거:
  `.omo/ulw-loop/evidence/g006-c002-root-init-v34-20260618.md`,
  `.omo/ulw-loop/evidence/g006-c002-root-init-v34-20260618.jsonl`,
  `.omo/ulw-loop/evidence/g006-c002-root-init-v34-stop.json`.
- 2026-06-18: G006 C002 v35/v36b root source 판별 완료. v35 safe env는 `0x0f02` 뒤
  `0x0313/0x0315/0x0325/0x0323/0x033b/0x0f03`을 보내고 `0x0f07`까지 도달했지만,
  `FUN_004c4170`의 base/institution source와 copied buffers가 모두 zero였고
  `rootAssign-004c8a10` entry도 `currentRaw11178=0`, `listCount1117c=0`이었다. v36b는
  `LOGH_WORLD_IMPORT_BASES=1`로 `0x031f`와 `0x0321`을 `0x0f03` 전에 추가했고,
  source/copy buffers와 `DAT_007cd04c+0x1117c` list count를 4까지 채웠다. 그러나
  `mainState+0x126714`, `mainState+0x2b6a70`, `DAT_007cd04c+0x11178` current raw는 계속 0이라
  C002는 pending이다. 첫 v36 misconfigured 실행은 safe flags 누락으로 폐기했고 cleanup SHA만 확인했다.
  증거: `.omo/ulw-loop/evidence/g006-c002-root-source-v35-v36b-20260618.md`,
  `.omo/ulw-loop/evidence/g006-c002-root-source-v35-20260618.jsonl`,
  `.omo/ulw-loop/evidence/g006-c002-root-source-v36b-20260618.jsonl`,
  `.omo/ulw-loop/evidence/g006-c002-root-source-v36b-trace.json`.
- 2026-06-18: G006 C002 v37 current-source watcher 완료. watcher는 `0x0048fb80`
  `commandCreateOutfitParser` hook과 `mainState+8` source sampler를 추가했다. 실클라 v37은 canonical
  playable SHA로 로비/캐릭터 선택/전략 화면까지 진입했고 trace에는 `0x0f06->0x0f07`과 post-load
  `0x0b09/0x0325/0x0323/0x0b0a/0x0356/0x1200/0x1202/0x1201`이 남았다. 그러나
  `FUN_004c4170` entry에서 `currentSourcePtr8=0xf34502c`,
  `currentSourceFields.currentSource320=0`, `FUN_004b5bb0` return 0,
  `field126714_u32=0`, `strategyCurrent2b6a70=0`이었다. 같은 경계 전
  `commandCreateOutfitParser-0048fb80-enter/leave`는 발생하지 않았다. 전략 화면 하단 UI는
  `NO DATA` 상태였다. C002는 pending이며 다음 blocker는 `mainState+8` source object의 `+0x320`
  writer/parser다. 증거: `.omo/ulw-loop/evidence/g006-c002-root-current-v37-20260618.md`,
  `.omo/ulw-loop/evidence/g006-c002-root-current-v37-20260618.jsonl`,
  `.omo/ulw-loop/evidence/g006-c002-root-current-v37-trace-all.json`,
  `.omo/ulw-loop/evidence/g006-c002-root-current-v37-stop.json`,
  `.omo/ulw-loop/evidence/g006-c002-root-current-v37-cleanup.txt`.
- 2026-06-18: G006 C002 v38 text-parser 보강 판별 완료. canonical playable EXE의 `+0x320`
  직접 참조는 7개였고, `0x0048fb80` binary parser 외에 `0x0048ffd0` adjacent text parser/body도
  watcher에 추가했다. 실클라 v38은 `0x0f06->0x0f07` 및 post-load
  `0x0b09/0x0325/0x0323/0x0b0a/0x0356/0x1200/0x1202/0x1201`까지 도달했지만,
  `commandCreateOutfitParser-0048fb80`와 `commandCreateOutfitTextParser-0048ffd0`는 모두 0회였고
  `currentSource320=0`, `field126714_u32=0`, `strategyCurrent2b6a70=0`,
  root `currentRaw11178=0`, `listCount1117c=4`로 남았다. C002는 pending이고 다음은
  `[mainState+8]` source object의 native 생성/초기화 경로와 non-parser writer다. 증거:
  `.omo/ulw-loop/evidence/g006-c002-root-current-v38-20260618.md`,
  `.omo/ulw-loop/evidence/g006-c002-root-current-v38-20260618.jsonl`,
  `.omo/ulw-loop/evidence/g006-c002-root-current-v38-cleanup.txt`.
- 2026-06-18: G006 C002 v39 source identity 판별 완료. `[mainState+8]`는 별도 heap object가 아니라
  `mainState+0xc` inline source/header였고, head는 `01 6e 61 6d 65`(`\x01name`)였다.
  `sourceVtable=0x6d616e01`은 vtable이 아니라 data head로 정정한다. `currentSource320=0`,
  `FUN_004b5bb0` return 0, `field126714_u32=0`, `strategyCurrent2b6a70=0`,
  root `currentRaw11178=0`, root `listCount1117c=4`였으며, factory wrapper
  `0x0040a700`/`0x004a49c0`와 parser `0x0048fb80`/`0x0048ffd0`는 모두 enter/leave 0회였다.
  C002는 pending이고 다음은 `mainState+8 = mainState+0xc` writer 및 inline source `+0x320`
  non-parser writer 추적이다. 증거: `.omo/ulw-loop/evidence/g006-c002-root-current-v39-20260618.md`,
  `.omo/ulw-loop/evidence/g006-c002-root-current-v39-20260618.jsonl`,
  `.omo/ulw-loop/evidence/g006-c002-root-current-v39-trace-all.json`,
  `.omo/ulw-loop/evidence/g006-c002-root-current-v39-cleanup.txt`.

- 2026-06-18: G006 C002 v40 setter/accessor cluster 판별 완료. `mainStateConstructor-004b6000`,
  `sourceDirect31eSetter-004b5bd0`, `sourceRelated324Setter-004b5cf0`,
  `sourceRelated31eSetter-004b5db0`, `sourceRelated358Setter-004b5e80`를 watcher에 추가했다.
  실클라 trace는 `0x0f06->0x0f07`과 post-load `0x0b09/0x0325/0x0323/0x0b0a/0x0356/0x1200/0x1202/0x1201`
  까지 도달했다. 새 hook 중 `sourceDirect31eSetter-004b5bd0`만 enter/leave 각 1회였고,
  이때 `0xf34002c`는 같은 run의 `fieldImport` source와 같았다. 그러나 이 함수는 `+0x31e`
  주변 setter로 보이며 `currentSource320`, `field126714_u32`, `strategyCurrent2b6a70`,
  root `currentRaw11178`을 채우지 않았다. `fieldImport`는 계속 `[mainState+8]=mainState+0xc`,
  `sourceHeadHex=016e616d65...`, `currentSource320=0`, root `listCount1117c=4`를 보였다.
  C002는 pending이고 다음은 `mainState+8` slot store, inline `\x01name` header init,
  inline source `+0x320` writer를 찾는다. 증거:
  `.omo/ulw-loop/evidence/g006-c002-root-current-v40-20260618.md`,
  `.omo/ulw-loop/evidence/g006-c002-root-current-v40-20260618.jsonl`,
  `.omo/ulw-loop/evidence/g006-c002-root-current-v40-trace-all.jsonl`,
  `.omo/ulw-loop/evidence/g006-c002-root-current-v40-cleanup.txt`.
- 2026-06-18: G006 C002 v41 source import 판별 완료. 정적으로 `0x004c2a80` wrapper와
  `0x004c2c80` copy/import 경계를 확인했고, `0x004c2c80`은 `0x00771074` `"name"`을
  이용해 inline `\x01name` source를 구성한다. `0x004c2f0e`의 optional record
  `rep movsd`가 source `+0x318` 블록을 채우므로, source `+0x320`은 optional record
  `+0x08`에서 복사된다. 실클라 v41 watcher는 `sourceImportCallsite-004b780e-hit`에서
  `[mainState+8]=mainState+0xc`가 이미 성립함을 보였고, `sourceOptionalCopyAfter-004c2f18-hit`에서
  `source320MatchesOptional08=true`, `predictedSource320=0`, `optionalRecordPlus08=0`,
  `sourceHeadHex=016e616d65...`를 기록했다. 따라서 `+0x320` writer 자체는 좁혔지만
  현재 데이터에서는 optional record `+0x08`이 0이라 C002는 pending이다. 다음은
  optional record 생성/채움 경로와 `[mainState+8]` slot writer를 추적한다. 증거:
  `.omo/ulw-loop/evidence/g006-c002-source-import-v41-20260618.md`,
  `.omo/ulw-loop/evidence/g006-c002-source-import-v41-20260618.jsonl`,
  `.omo/ulw-loop/evidence/g006-c002-source-import-v41-trace.jsonl`,
  `.omo/ulw-loop/evidence/g006-c002-source-import-v41-cleanup.txt`.
- 2026-06-18: G006 C002 v42-v45 `0x0325` parser-stream 판별 완료. 정적으로
  `FUN_00419ca0`은 native output에 count를 `+0`, unit0 id를 `+4`에 두지만 wire stream은
  count 뒤에 unit id가 바로 이어지는 parser-stream 형태임을 확인했다. v42 baseline은 early
  native `0x0325`가 parser에서 count=256/unit0=256으로 읽히며 early source import가
  optional unit index 1/id0으로 빗나간다는 것을 보였다. v43/v44처럼 global
  `LOGH_UNIT_STREAM_WIRE=1`을 켜면 early parser count=1/unit0=1이 맞아지지만
  exact-count branch `0x004bb15c -> 0x004bb179`로 들어간 뒤 ECONNRESET/클라이언트 종료가
  재현됐다. v45는 `LOGH_POSTLOAD_UNIT_STREAM_WIRE=1`만 켜서 early native-safe 형태를
  유지하고 post-load `0x0325`만 parser-stream으로 보내 전략 HUD를 유지했다. postload
  import는 primary id=1/`primaryUnit24=1`, optional unit0 id=1/index0으로 맞았지만
  `optionalRecord+8=0`이라 `source+0x320`은 아직 0이다. 후보 grid/minimap 클릭은
  `0x0300` heartbeat 또는 무반응만 만들었고 `0x0b01/0x0b07`은 없었다. 화면에는
  문맥과 맞지 않는 `이미 탈퇴하셨습니다.`가 보여 UI 메시지 매핑도 미해결이다. C002는
  pending이다. 증거:
  `.omo/ulw-loop/evidence/g006-c002-source-import-v45-postload-stream-minunit-20260618.md`,
  `.omo/ulw-loop/evidence/g006-c002-source-import-v45-postload-stream-minunit-20260618.jsonl`,
  `.omo/ui-explorer/session-g006-source-import-v45-postload-stream-minunit-47900-20260618/trace.jsonl`,
  `.omo/ui-explorer/session-g006-source-import-v45-postload-stream-minunit-47900-20260618/shots/003-v45-character-row1.png`,
  `.omo/ulw-loop/evidence/g006-c002-source-import-v45-cleanup-20260618.txt`.
- 2026-06-18: G006 manual-grid v48-v50 판정 갱신. 매뉴얼 PDF 101쪽과
  `content/galaxy.json`을 다시 대조해 서버 표시 좌표는 `displayX=contentCy`,
  `displayY=contentCx`로 고정했고, 대표 cell은 `イゼルローン (51,13)`,
  `ルンビーニ (2,21)`, `シロン (3,15)`, `フェザーン (49,38)`이다. 설치 DB는 성계
  80개, 행성 281개, 요새 6개를 제공하며 행성은 절대 좌표가 아니라 궤도순으로
  성계 안에 붙인다. `ルンビーニ`은 KO `룬비니`, orbit 1 `バグタプール`/`바구타푸루`,
  orbit 2 `カライヤ`/`카라이야`, orbit 3 `バドガオン`/`바도가온`이다. 항성 등급과
  `bh_01..03`/`ns_01..03` 특수 천체는 아직 named system에 권위 join하지 않는다.
  canonical playable stack은 `menufix + dlgfix + earlygrid-ringclear`, SHA
  `e75486ef762787448d91e38a612103f6d11691833c36a6bcb30d13a9cbdb2366`로 갱신했다.
  v48/v49의 `0x0f03` 직후 ECONNRESET은 early grid live table 뒤 late `0x0313/0x0315`
  duplicate replay 때문이었고, 서버는 `LOGH_STRAT_GALAXY=1 && LOGH_STRAT_GRID_EARLY=1`
  때 post-`0x0f02` galaxy/grid replay를 생략한다. v50은 실제 클라이언트가 살아남아
  미니맵 우측 클릭 후 푸른 항성 마커와 한국어 라벨 `베큘라`, `발할라`를 표시했고,
  `0x0f06 -> 0x0f07 -> 0x0b09/0x0b0a` grid-enter notify가 도달했다. 다만 `발할라`
  좌/우클릭은 아직 native `0x0b01`을 만들지 못해 C002 명령 writer는 pending이다.
  증거: `.omo/ui-explorer/session-g006-manual-grid-v50-fixed-47900-20260618/shots/008-v50-minimap-right.png`,
  `.omo/ui-explorer/session-g006-manual-grid-v50-fixed-47900-20260618/trace.jsonl`,
  `.omo/ulw-loop/evidence/g006-playable-ringclear-build-20260618.json`.
- 2026-06-18: G006 C002 v51 SelectGrid watcher 판정. `tools/logh7_selectgrid_state_watch.py`
  와 `tools/tests/test_logh7_selectgrid_state_watch.py`를 추가했고, red-first 결손 확인 뒤
  focused unittest/py_compile 및 기존 watcher 3종 6 tests OK를 통과했다. 실제 클라이언트
  v51은 v50과 같은 canonical playable SHA
  `e75486ef762787448d91e38a612103f6d11691833c36a6bcb30d13a9cbdb2366`와 accept-any GIN7
  경로로 로그인/로비/첫 캐릭터/월드에 진입했다. strict
  `LOGH_ACCOUNT_DB=.omo/work/e2e-accounts.json` 경로는 현재 DB가 `inei00`만 갖고 자동 로그인
  클라이언트가 `ginei00/dummy`를 보내므로 정상 reject되어 C002 클릭 재현에는 쓰지 않았다.
  v51에서도 미니맵 우측 이동 후 `베큘라`, `발할라`, `니플헤임` 항성 라벨이 보였다.
  `발할라` 중심 좌클릭은 `0x0f08 -> 0x0f09` 정보 경로로 빠졌고, 우클릭/`니플헤임`
  클릭은 native `0x0b01`을 만들지 않았다. 새 watcher는 projection path
  `0x004d7a7b/80/8c/9c/a9`와 `writerBranch-state-check-004d7acc`까지 자연 도달함을
  확인했지만, `FUN_004d6310` validator 인자가 `발할라`에서 `x=8074780(0x007b360c),y=23,range=0xffffffff`,
  `니플헤임`에서 `x=8074780(0x007b360c),y=19,range=0xffffffff`로 들어가 둘 다
  `retval=-256`으로 탈락했다. `DAT_007cd04c+0x11178`과 `+0x1117c`는 여전히 0이고,
  `DAT_009d2a3c=0`, `DAT_009d2a40=0xffffffff`, `selectedD5=-1`이다. 따라서 현재 blocker는
  “항성이 안 보임”이 아니라 stack `sp70 -> state+0x24` upstream writer가 X grid 값을
  주지 못해 pointer-like `0x007b360c`이 validator X로 들어가는 문제다. 증거:
  `.omo/ulw-loop/evidence/g006-c002-selectgrid-state-v51-20260618.md`,
  `.omo/ulw-loop/evidence/g006-c002-selectgrid-state-v51-throttled-20260618.jsonl`,
  `.omo/ui-explorer/session-g006-selectgrid-state-v51-47900-20260618/shots/014-v51-minimap-right.png`,
  `.omo/ui-explorer/session-g006-selectgrid-state-v51-47900-20260618/shots/018-v51-throttled-click-valhalla-center.png`,
  `.omo/ui-explorer/session-g006-selectgrid-state-v51-47900-20260618/trace.jsonl`.

## 2026-06-21c/d 최신 C002 입력 게이트 정정

`tools/logh7_hud_admission_watch.py`의 read-only mode-target run은 C002 blocker를 `FUN_005015f0`
내부의 object `+5` gate로 더 좁혔다. 세션
`.omo/ui-explorer/session-g006-c002-mode-target-state-20260621c/`에서 `inputHitTest-leave-005015f0`
18,630회가 모두 `retvalLow8=0`이었다. 네 mode target은 모두 `valid08=1`, rect 존재,
`eventQueueCount3f4=0` 상태였고, `gate05=0`이 전 구간 유지됐다. fallback target들은 `flag15=1`이므로
현재 즉시 실패 조건은 `FUN_005024a0`이 읽는 byte `+5`다.

`--force-interaction-target-gate` debug run
`.omo/ui-explorer/session-g006-c002-force-gate-20260621d/`는 `hudTarget24 +5`를 한 번 1로 썼지만
모든 hit-test low byte가 계속 0이었고, trace는 `0x0b01/0x0b07` 없이 `read ECONNRESET`으로 끝났다.
따라서 단일 `+5` force나 active gate write를 해결책으로 반복하지 않는다. 다음 사이클은
`FUN_005024b0(1)`을 정상 호출하는 owner path와 주변 상태를 추적한다. 우선순위는
`FUN_004fc4e0 -> FUN_004fd7a0(1,0)` 초기화 직후 mode target `+5`가 왜 자연 활성화되지 않는지,
그리고 `FUN_004fd100`의 mode-entry 조건이 어떤 UI state를 요구하는지다. 증거는
`.omo/ulw-loop/evidence/g006-c002-input-gate-classification-20260621d.md`와
`.omo/ulw-loop/evidence/g006-c002-mode-target-state-summary-20260621c.json`을 따른다.

## 2026-06-21e `FUN_005015f0` this-context gate 정정

정적 디스어셈블리로 위 판단을 한 단계 수정했다. `FUN_005015f0`는 진입 시 `ecx`를 `esi`에 저장하고,
`FUN_005024a0` 호출 직전 `ecx=esi`를 다시 세팅한다. `FUN_005024a0`는 `byte ptr [ecx+5]`를 읽는다.
즉 첫 early-return gate는 hit-test target pointer의 `+5`가 아니라 `thisEcx+5`다. target pointer는
그 뒤 `FUN_005025c0`의 stack arg로 들어가 `target+0x15` 검사를 받는다.

`DAT_006703c0` mode table dump 기준 `FUN_004fd7a0`는 mode별 child index의 `+0x18/+0x1b/+0x15`를
켜지만 child `+5`는 직접 켜지 않는다. child object는 생성 시 `+5=0`으로 시작한다. 따라서 기존
`--force-interaction-target-gate` target-only 강제는 해결책이 아니며 반복하지 않는다.

`tools/logh7_hud_admission_watch.py`는 이제 `inputHitTest-leave-005015f0`에 `thisState`를 기록한다.
non-default debug force도 `thisEcx+5`에만 적용되며 `force-this-gate05`로 기록된다. 세션
`.omo/ui-explorer/session-g006-c002-this-gate-20260621e/`는 starfield에서 멈춰 trace가
`scenario-seed`/`economy-seed`뿐이었고 `FUN_005015f0` 이벤트가 없었으므로 gate 증거로 쓰지 않는다.
다음 실행은 먼저 전략 HUD 진입을 확인한 뒤 `thisState.gate05`가 0인지 1인지 판별한다. 증거:
`.omo/ulw-loop/evidence/g006-c002-this-gate-static-correction-20260621e.md`.

## 2026-06-21f live HUD admission 재정정

`login-commandline-bootstrap` playable EXE는 `127.0.0.1:47900`으로 고정 접속한다. 이전 starfield 재시도는
`ui_explorer start --port 47912`가 이 사실을 검증하지 않고 `loggedIn=true`로 처리한 도구 오류였다.
`tools/logh7_ui_explorer.py`는 이제 commandline bootstrap + non-47900 조합을 거부한다.

47900 재실행 세션 `.omo/ui-explorer/session-g006-c002-this-gate-live-20260621f-port47900/`는 실제 전략 HUD에
도달했다. trace는 `0x7000`, `0x200a`, `0x0201`, `0x0f02`, `0x0325/0x0323`, `0x0f03`, `0x0f07`,
`0x0b09/0x0b0a`, `0x0356`, `0x1200/0x1202/0x1201`까지 갔고, 화면은 terrain/star label을 렌더했다.
그러나 입력 후 `0x0b01/0x0b07`은 없고, 정보 경로 `0x0f08->0x0f09`만 1회 관측됐다.

read-only watcher `.omo/ulw-loop/evidence/g006-c002-this-gate-live-20260621f.jsonl`는
`FUN_005015f0` 22,487회를 남겼고 전부 `retvalLow8=0`이었다. `thisState.gate05`는 17,737회가 1,
4,750회가 0이라 "this gate가 전부 0"은 아니다. role별로는 selection row hit-test에서만
`selectionList[0]+5=0`이 고정됐고, 그래서 `listSelected189=-1`이 유지됐다. 정적 디스어셈블리 기준
`FUN_004f6600`은 `mov ecx,[selectionList]` 뒤 `FUN_005015f0`를 호출하므로 이 selection owner gate가
첫 predicate다. `FUN_004f6680(selectionList,mode)`는 mode 1..3일 때만 `FUN_005024b0(1)`로 이를 켠다.

두 번째 watcher `.omo/ulw-loop/evidence/g006-c002-mode-target-live-20260621f.jsonl`에서 상단 mode-target
후보 좌표 `(82,18)` 클릭 후에도 `hudModeF4=1`, `hudAb0=-1`, `hudModeSet=0`이 유지됐다.
다음 실행은 더 이상 broad `thisEcx+5` force나 서버 payload 반복이 아니다. `FUN_004fd100`의
`HUD+0x24/+0x28` mode activation hit-test가 좌표/마우스 입력/target state 중 어디에서 false가 되는지
watch해야 한다. 필요하면 2026-06-20 cursor clip / DirectInput mouse TODO와 연결한다. 증거:
`.omo/ulw-loop/evidence/g006-c002-this-gate-live-20260621f.md`.

## 다음 사이클 입력

다음 실행은 P0-02 좌표 반복, raw resource scan, command-table admission, direct category apply, active `+4/+5` gate, factory slot 확인, SelectGrid object-existence scan, 단순 target/Enter/Space/right-click 반복, `DAT_009d2a3c=2` branch positive-control 반복, raw-only current-location force, `(42,25)` forced coordinate 주입, `0x0317`을 `DAT_007cd04c+0x11178` fix로 취급, v29 server-delivery 변형, 또는 v36b `0x031f/0x0321` preload를 completion evidence처럼 반복하는 일을 하지 않는다. P0-01은 실제 `G7MTClient.exe` 증거로 닫혔고, P0-02 corrected-cell 좌표는 실클라 런에서 자연 `0x0b01/0x0b07` 미발생까지 확인됐다. v10/v12b는 runtime factory table slot `0x2b`가 실제 `FUN_00581c80`이고 row0 클릭이 SelectGrid 객체와 child command objects를 만든다는 것을 확인했다. v13b는 target UI에서 `DAT_009d2a3c=1`일 때 `FUN_00570a10`이 return `1`만 반복하고, `ENTER`가 `FUN_004b78a0(arg2=0x45) -> 0x0f08/0x0f09` 정보 경로로 빠진다는 것을 확인했다. v14b는 `DAT_009d2a3c=2`가 confirm branch와 inbound `0x0b01`을 실제로 여는 값을 증명했다. v21-v26은 left-click writer branch가 도달 가능하지만 forced coordinate injection은 crash/ECONNRESET으로 끝남을 확인했다. v27은 `FUN_004d3580` 수식 자체가 아니라 자연 `DAT_007cd04c+0x11178=0` 및 top-left camera/focus가 projection을 `(0,0)/(1,0)`으로 묶는 주 원인임을 정정했다. v28은 `0x0317`이 별도 `clientBase+0x35f358` 필드임을 확인했고, `DAT_007cd04c+0x11178` 직접 writer는 아직 미확인임을 고정했다. v29 baseline, plain grid-enter, player-record, rich-character는 모두 current raw/list를 0으로 남겼다. v35/v36b는 `0x031f/0x0321` preload가 base/institution source와 root list count를 채우지만 current raw를 채우지 못한다는 것을 확인했다. v37은 current/focus source가 `mainState+0x126714` 자체보다 한 단계 앞선 `[mainState+8]+0x320`이며 이 값도 0임을 확인했고, `FUN_0048fb80` parser는 해당 경계 전에 호출되지 않았다. 다음 실행은 `mainState+8` source object의 `+0x320` writer/parser를 정적/런타임 양쪽에서 찾는다.

v38은 위 v37 판정을 보강해 `FUN_0048ffd0` text/adjacent parser도 같은 경계 전 호출되지 않음을 확인했다.
따라서 다음 실행은 `FUN_0048fb80`/`FUN_0048ffd0` 반복 hook이 아니라, canonical EXE의 `+0x320`
7개 참조 중 native object creation/vtable setup, `0x0040a816`/`0x004a4cc8` constructor-style write,
그리고 `0x0049086b` parser 외부 byte write가 `[mainState+8]` source object에 닿는지 판별한다.

v39는 이 경계를 다시 정정했다. `[mainState+8]`는 별도 생성자 object가 아니라 `mainState+0xc`
inline `\x01name` source다. `0x0040a700`/`0x004a49c0` factory wrapper는 live flow에서 0회였으므로,
다음 실행은 `mainState+8 = mainState+0xc`를 쓰는 초기화 경로와 inline source `+0x320` writer를
정적/런타임 양쪽에서 찾는다.

v40은 이 경계에 constructor/setter/accessor cluster를 붙였다. `0x004b5bd0`은 live 1회였지만
`+0x31e` 주변 신호일 뿐 `+0x320` writer가 아니었고, `0x004b6000` 및 `0x004b5cf0/0x004b5db0/0x004b5e80`
는 attach 이후 0회였다. 다음 실행은 `0x004b5bd0` 반복이 아니라 `mainState+8` slot store,
inline `\\x01name` header init, inline source `+0x320` writer를 정적으로 찾고 그 후보에 동적 watcher를 붙인다.

v41은 inline source `+0x320`이 `0x004c2c80` import path의 optional record `+0x08`에서
복사된다는 것을 확인했다. 현재 run의 optional record `+0x08`은 0이므로 C002는 pending이다.
v42-v45는 이 optional record가 `0x0325` unit table parser 형태와 연결됨을 좁혔다.
early `0x0325`는 native-safe wire를 유지해야 클라이언트가 살고, post-load replay에만
parser-stream wire를 적용하면 postload import가 unit0/index0으로 맞는다. 그래도
`optionalRecord+8`은 0이고 자연 클릭에서 `0x0b01/0x0b07`은 없다. 다음 실행은
`0x0325` wire layout 반복이 아니라 실제 클릭 가능한 object/camera/grid cell 경로, 잘못 매핑된
UI 메시지 source, postload optionalRecord `+0x08` writer를 추적한다.

v48-v51은 manual page 101 좌표 재판정, playable ringclear 기본화, visible star hit-test
projection 도달 여부를 완료했다.
`LOGH_STRAT_GRID_EARLY=1`은 이제 기본 QA 경로에서 금지하지 않는다. 단, early grid가 live
table을 소유할 때 post-`0x0f02` `0x0313/0x0315` 중복 replay를 다시 켜면 v48/v49처럼
클라이언트가 닫힌다. v50 기준으로 항성 마커와 한국어 라벨은 실제로 보이고, grid-enter notify도
도달한다. 다음 실행은 이미 보이는 `베큘라`/`발할라` 마커의 hit-test, native `0x0b01`
writer, `0x0b07` 응답 루프를 추적한다. v51 기준으로 hit-test는 projection writer와
validator까지 도달하지만 X 인자가 `0x007b360c`로 깨져 validator가 `-256`을 반환한다.
다음 실행은 star click 반복이 아니라 `0x004d7a7b` 직전 stack `sp70` writer, `FUN_004b25a0`
world output, `DAT_007cd04c+0x11178/+0x1117c` current/list source writer를 정적/런타임
양쪽에서 추적한다.

P0-02의 첫 단계:

1. `tools.logh7_ui_explorer stop`과 canonical SHA 확인을 먼저 한다.
2. `.omo/ulw-loop/evidence/g006-c002-current-grid-raw-v28-20260618.md`, `.omo/ulw-loop/evidence/g006-c002-current-grid-watch-v29-20260618.md`, v21-v26 raw JSONL, v14b positive-control evidence, v13b target/confirm evidence, v12b arena scan을 먼저 읽는다.
3. 서버 outbound builders만 보고 completion을 주장하지 않는다. `0x0317`은 `clientBase+0x35f358` landing field라 `DAT_007cd04c+0x11178`과 별개로 취급한다.
4. baseline, `LOGH_GRID_ENTER=1`, `LOGH_GRID_ENTER=1 + LOGH_POSTLOAD_PLAYER_RECORD=1`, `LOGH_GRID_ENTER=1 + LOGH_POSTLOAD_RICH_CHARACTER=1`은 이미 v29에서 `+0x11178=0`, `+0x1117c=0`, camera/focus `(-49.5,0,24.5)`로 끝났다. v30/v31은 root 생성 시점이 `0x0f02` 뒤와 `0x0f06` 전 사이임을 좁혔고, v33은 root slot writer가 `FUN_004c8a10` 내부 `0x004c8a23`임을 확정했다. v34는 `FUN_004c8a10`에 들어온 `rootParam2`가 이미 empty current/list 상태이며 `FUN_004d3bd0`/`FUN_004c8bc0`/`FUN_004d3a40`도 이를 채우지 않는다고 확정했다. v35/v36b는 `FUN_004c4170`의 base/institution source-copy 경계가 `0x031f/0x0321`로 채워질 수 있고 root `listCount1117c=4`까지 전파됨을 확인했지만, `field126714_u32`/`strategyCurrent2b6a70`/`currentRaw11178`은 계속 0이었다. v37은 `field126714_u32`가 `FUN_004b5bb0([mainState+8])` 결과이고, live `[mainState+8]+0x320`도 0임을 확인했다. 다음은 서버 payload 변형이 아니라 `mainState+8` source object의 `+0x320` writer/parser를 추적한다.
5. v38은 `FUN_0048ffd0`도 호출 0회로 반박했고, v39는 `[mainState+8]`가 `mainState+0xc` inline `\x01name` source임을 확인했다. 다음은 parser payload 추가나 factory wrapper 반복이 아니라 `mainState+8 = mainState+0xc` writer 및 inline source `+0x320` writer를 추적한다.
6. v40은 `0x004b5bd0` live 호출이 `+0x31e` 주변 신호일 뿐 `+0x320` writer가 아님을 확인했다. 위 5번의 parser/factory 반복 금지에 `0x004b5bd0` 반복 금지를 추가하고, 다음은 `mainState+8` slot store, inline header init, inline source `+0x320` writer를 추적한다.
7. v41은 inline source `+0x320`이 optional record `+0x08`에서 복사됨을 확인했다. v42-v45는
   early parser-stream `0x0325`가 crash 경로이고, postload-only parser-stream이 안정적인
   최소 적용점임을 확인했다. 다음은 optional record `+0x08` writer와 postload source import 뒤
   실제 clickable object/camera/grid cell 경로를 추적한다.
8. v48-v50은 매뉴얼 좌표, 행성 궤도순 이름, playable ringclear SHA, early grid 기본화를
   갱신했다. 다음은 미니맵에서 실제로 보이는 `베큘라`/`발할라` hit-test와 native
   `0x0b01 -> 0x0b07` command loop를 추적한다.
8a. v51은 보이는 항성 클릭이 projection writer와 validator에 도달함을 확인했다. 다음은
   같은 좌표 클릭 반복이 아니라 `sp70=0x007b360c`의 upstream writer와 `FUN_004d6310`
   call-site 인자 준비를 추적한다. `0x004d7a7b` 이후 값만 보거나 `DAT_009d2a3c=2`를
   강제하는 실험은 이미 답이 있으므로 반복하지 않는다.
8b. v52/v53은 항성 다색 렌더와 SelectGrid 실패를 분리했다. `O/B/A/F/G/K/M` 슬롯은
   다색이며 "파란 항성 하나뿐"은 틀렸지만, 성계명별 등급은 아직 provisional이다.
   `0x004d7a6c..0x004d7b13` 정적 callsite는 정상이다. 다음은 보이는 항성 클릭에
   한정해 `FUN_004d3580` entry/leave와 `0x004d7a80/8c/9c/b13` local/state 값을
   하나의 event id로 묶고, 별도 pass에서 optional record `+0x08` writer/origin을 찾는다.
8c. v54-v56은 `FUN_004d3580` entry/leave hook을 폐기하고 writepoint/copy-state
   증거로 좁혔다. 보이는 항성 클릭의 grid 변환 자체는 된다. v56 기준 `(723,545)`
   클릭은 writepoint grid `(87,25)`였지만, `0x004d7aa9` 직후 `state+0x24`가
   `0x007b361c`로 바뀌어 `0x004d7bba` validator가 `(0x007b361c,25,-1)`을 검사하고
   `-256`을 반환한다. 다음은 항성 색/클릭 도달 재증명이 아니라 `0x004d7a80` 전후
   `sp70` source/caller local writer를 정적/런타임 양쪽에서 찾는다.
9. `이미 탈퇴하셨습니다.`처럼 화면 문맥과 맞지 않는 UI 메시지는 완료 전 별도 localization blocker로
   추적한다. 메시지 파일/상태 코드 매핑 증거 없이 임의 번역 문자열로 덮지 않는다.
10. camera/focus가 `(-49.5,24.5)`에서 캐릭터의 실제 성계 쪽으로 움직인 뒤에만 `DAT_009d2a3c` 자연 writer와 `DAT_009d2a40`/SendWarpCommand 목적지 writer를 다시 본다.
11. 유효 목적지 필드가 확인되기 전에는 `LOGH_RELAY=1`/`LOGH_AUTHORITATIVE=1` end-to-end를 완료로 세지 않는다. 유효 payload가 나온 뒤에만 relay/authoritative로 `0x0b01->0x0b07`을 검증한다.
12. 정보 패널/행성 orbit 검증은 SelectGrid target/confirm 경계와 명령 payload writer가 분리된 뒤, 부모 성계 선택 패널이 실제로 열릴 때만 수행한다.

## 열린 위험

- 설치 트리와 한글 오버레이가 dirty 상태이므로, 작업 전 현재 파일 소유권을 다시 확인해야 한다.
- `content/galaxy.json` 좌표는 원본 서버 권위 좌표로 확정되지 않았다.
- `Null_galaxy.mdx` 항성 등급은 79개 노드로만 확인됐고 80개 성계명과 매핑되지 않았다.
- 행성 위치/경제와 시설/방 상태는 원본 데이터가 아니라 deterministic projection, procedural seed, 또는 byte layout-only 상태다.
- 현재 작업 PC 해상도는 1440x1080이라 와이드 pillarbox를 직접 볼 수 없다. wide 검증은 별도 디스플레이 또는 강제 해상도 환경이 필요하다.
- 자동화는 아직 실제 스케줄로 등록하지 않았다. 사용자가 주기와 실행 환경을 확정하면 등록한다.

## 2026-06-21 루프 추가 기록 v61

- `tools/logh7_hud_mode_activation_watch.py`와
  `tools/tests/test_logh7_hud_mode_activation_watch.py`를 추가했다. 새 watcher는
  `FUN_004fd100`, `FUN_004fd7a0`, `FUN_005015f0`을 read-only로 관찰하고
  `0x004fd492/0x004fd4c0/0x004fd4ee/0x004fd525` 네 return site를 각각
  `hudMode2Primary`, `hudMode4Primary`, `hudMode2Fallback`, `hudMode6Fallback`으로 라벨링한다.
- 테스트는 red-first로 모듈 부재 실패를 확인한 뒤 구현했고,
  `python -m unittest tools.tests.test_logh7_hud_mode_activation_watch` 2 tests OK,
  `python -m py_compile tools\logh7_hud_mode_activation_watch.py tools\tests\test_logh7_hud_mode_activation_watch.py` OK,
  `python tools/logh7_hud_mode_activation_watch.py --help` OK,
  admission/ui_explorer 포함 focused suite 20 tests OK였다.
- 실제 클라이언트 세션
  `.omo/ui-explorer/session-g006-c002-mode-activation-20260621g/`는 canonical playable SHA
  `15ed8a35...`, port `47900`, `client-commandline-bootstrap`으로 전략 HUD에 도달했다.
  watcher `.omo/ulw-loop/evidence/g006-c002-mode-activation-watch-20260621g.jsonl`은
  총 3513 events, mode activation hit-test 1068회를 기록했다.
- 네 mode activation site 모두 자연 도달하지만 return low byte는 전부 0이었다.
  `hudMode2Primary`, `hudMode4Primary`, `hudMode2Fallback`, `hudMode6Fallback`은 각각 267회씩
  관찰됐고, 네 target 모두 `gate05=0`이었다. fallback 두 target은 `flag15=1`이지만
  primary target은 `flag15=0`이었다. `hudModeSet=0`, `selectionSelected189=-1`,
  `commandSelectedD5=-1`, `commandCategoryD6=-1`도 유지됐다.
- trace는 `0x7000`, `0x200a`, `0x0201`, `0x0f02`, `0x0f03`, `0x0f07`,
  `0x0b09/0x0b0a`, `0x0325/0x0323`, `0x1200/0x1202/0x1201`까지 보였지만,
  입력 뒤에는 `0x0300/0x0301` heartbeat뿐이었고 native `0x0b01`/`0x0b07`은 없었다.
- C002는 계속 fail이다. 최신 blocker는 서버 응답 부재나 클릭 미도달이 아니라
  HUD mode target object 활성화 lifecycle이다. 다음 루프는 `FUN_004fd7a0` 또는 동등 경로가
  `HUD+0x14/+0x18/+0x24/+0x28` 대상에 `FUN_005024b0(1)` 같은 활성화를 거는 위치를
  정적/런타임 양쪽에서 찾는다. 직접 gate forcing과 broad 서버 payload 변형 반복은 금지한다.
- 증거:
  `.omo/ulw-loop/evidence/g006-c002-mode-activation-watch-20260621g.md`,
  `.omo/ulw-loop/evidence/g006-c002-mode-activation-watch-20260621g.jsonl`,
  `.omo/ui-explorer/session-g006-c002-mode-activation-20260621g/trace.jsonl`,
  `.omo/ui-explorer/session-g006-c002-mode-activation-20260621g/shots/002-before-mode-activation-watch.png`.

## 2026-06-21 루프 추가 기록 v62

- `tools/logh7_hud_mode_lifecycle.py`와
  `tools/tests/test_logh7_hud_mode_lifecycle.py`를 추가했다. 새 도구는 canonical
  `.omo/work/logh7-installed/exe/G7MTClient.exe`를 Capstone으로 읽고, HUD mode lifecycle의
  고정 VA anchor를 byte drift guard처럼 검증한 뒤 JSON index를 남긴다.
- JSON 증거:
  `.omo/ulw-loop/evidence/g006-c002-hud-mode-lifecycle-static-20260621h.json`.
  사람이 읽는 증거:
  `.omo/ulw-loop/evidence/g006-c002-hud-mode-lifecycle-static-20260621h.md`.
- 정적 RE 결론:
  `FUN_004fd100`의 네 pre-activation hit-test는 각각 `HUD+0x14`, `HUD+0x18`,
  `HUD+0x28`, `HUD+0x24`를 검사한다. 성공 시 `FUN_004fd7a0(2/4/6,1)`로 들어가며,
  `FUN_004fd7a0`은 mode table `DAT_006703c0`을 적용하고 active row에서
  `FUN_005024b0(1)`로 owner gate를 켠다.
- 초기화 경로 `FUN_004fc4e0`은 `0x004fcfc9`에서 `FUN_004fd7a0(1,0)`을 호출한다.
  `FUN_004fc4a0`과 `FUN_004fd560`도 mode refresh/history 경로로 `FUN_004fd7a0`에
  재진입하지만, 이 static pass만으로 `2/4/6` target 활성화는 증명되지 않았다.
- C002는 계속 fail이다. 최신 live v61과 이번 static v62를 합치면, 다음 live probe는
  서버 payload 변형이 아니라 `FUN_004fc4e0`, `FUN_004fc4a0`, `FUN_004fd560`,
  `FUN_004fd7a0`, `FUN_005024b0`에 붙어서 `HUD+0x14/+0x18/+0x24/+0x28` target이
  자연 활성화되는지 추적해야 한다.
- 검증:
  `python -m py_compile tools\logh7_hud_mode_lifecycle.py tools\tests\test_logh7_hud_mode_lifecycle.py` OK,
  `python -m unittest tools.tests.test_logh7_hud_mode_lifecycle tools.tests.test_logh7_hud_mode_activation_watch tools.tests.test_logh7_hud_admission_watch tools.tests.test_logh7_ui_explorer` 22 tests OK,
  `python -m tools.logh7_hud_mode_lifecycle .omo\work\logh7-installed\exe\G7MTClient.exe --out .omo\ulw-loop\evidence\g006-c002-hud-mode-lifecycle-static-20260621h.json` OK.

## 2026-06-21 루프 사이클 — 재추출 좌표 stale 잔재 수정 (수도/카메라 cave + 풀컨디션 EXE 리빌드)

선택 항목: 마스터 로드맵 P0 큐 #1(재추출 좌표 전파/실클라 검증). explorer RE 프리패스 결과 데이터→서버→0x0313/0x0315 와이어는 이미 일관이나, **재추출(2026-06-21 09:33) 좌표가 전파되지 못한 stale 잔재 3개**를 발견하여 수정했다(maker/tester/verifier 분리).

- **#1 진영 수도 좌표 stale (수정완료)**: `FACTION_CAPITAL`(`src/server/logh7-login-session.mjs:230`) 제국 `(86,25)→(88,25)`, 동맹 `(12,21)→(14,20)`. galaxy.json canon(ヴァルハラ empire 88,25 / バーラト alliance 14,20)과 정합. `export const`화. cellId(row*100+col): 제국 2588, 동맹 2014.
- **#2 faction 폴백 (수정완료)**: `activePlayerFactionKey()`가 해석 실패 시 중립역(50,25=2550) 대신 부트스트랩 기본 `'empire'`로 폴백(`?? 'empire'`). 명시적 `fleetCell(null)` 테스트 경로는 불변.
- **#3 카메라 cave CELL stale (수정완료+바이트검증)**: `tools/client_patches/strat-camera-focus.json` cave immediate `0x9f6`(2550 중립역)→`0xa1c`(2588 제국 수도). `tools/logh7_encode_strat_cave.py --cell 0xA1C --show`로 인코딩, disasm `mov [eax+0x320],0xa1c` 확인. 빌드 EXE fileoff 0x1d5290에 `...1c0a0000...` 박힘, detour 0xc4170=`e91b111100`, cave originalHex=all-0xCC(pristine) 검증 통과.
- **체인 정합**: 서버 fleetCellId(empire)=2588 = cave 2588 = LOGH_PLAYER_FOCUS_CELL 시드 → 동일 셀 수렴(이전엔 cave가 2550을 써서 currentRaw11178=2550으로 관측됐던 것).
- **풀컨디션 EXE 리빌드+배포**: `tools/logh7_build_playable_client --deploy`. 신 canonical playable SHA256 = **`7922ac365d219b3419e8c769dc4364d0cfd8a9e94578cb98f04c04bb0634ef7f`** (이전 `15ed8a35…`). DEFAULT_STACK 12패치(풀컨디션). 런타임 installed EXE + uiexplorer 백업 + client/vendor EXE·uiexplorer + 클라 패키지 매니페스트(SHA 4/4 신규) + `tools/logh7_client_exe.py:23` 상수 + 테스트 모두 신 SHA로 동기화.
- **테스트**: 서버 node 1069/1069 그린. 신규 회귀 `tests/server/logh7-faction-capital-canon.test.mjs`(2/2, FACTION_CAPITAL↔galaxy.json 대조). stale oracle 정정 `tests/server/logh7-login-protocol.test.mjs:793-794`([86,25]/[12,21]→[88,25]/[14,20] — 재추출 후 이미 깨져 있던 것). 파이썬 `test_logh7_client_exe`+`test_logh7_installed_tree` 11/11.
- **적대적 검증(logh7-loop-verifier)**: A 좌표 PASS, B cave 바이트 PASS, C 체인 PASS, D 과장없음 PASS(cave needsLive 정직 유지), F alliance 폴백 저위험. **초기 FAIL=리빌드가 `PLAYABLE_CLIENT_SHA256` 상수+테스트를 구 SHA로 남김** → 수정 후 재검증 그린.
- **남은 blocker (이번 사이클 범위 밖, 다음 항목)**:
  1. **페잔 회랑 광폭 stale**: `content/galaxy-passable-cells.json` row33-48 중앙 gap(col48-57) 전부 개방 = 1칸 회랑 아님(사용자 "회랑은 한칸"·로드맵 `[x] one-cell` 주장과 모순). page101-bg-corridor-* 산출물로 1칸 채널 재정제 필요.
  2. **라이브 end-to-end 미검증**: cave needsLive 유효. 신 EXE(7922ac36)로 월드 진입 후 `currentRaw11178==2588`(이전 2550)·카메라가 제국 수도(col88,row25) 센터·그 셀 클릭 시 자연 0x0b01 trace 확인 필요. (자연 0x0b01은 C002 HUD admission lifecycle 블로커와 별개 의존 — v62 참조.)
  3. **C002 HUD mode 활성화**(v61/v62): `FUN_004fd7a0(2/4/6,1)` 자연 미발생(gate05=0). 라이브 probe = `FUN_004fc4e0/004fc4a0/004fd560/004fd7a0/005024b0` 훅으로 `HUD+0x14/+0x18/+0x24/+0x28` 활성화 추적.
- 다음 항목: 위 (1) 페잔 1칸 회랑 재정제 또는 (2) 신 EXE 라이브 검증(currentRaw11178=2588).

## 2026-06-21 루프 사이클 — Nest.js + Drizzle 마이그레이션 **Phase 0** (툴체인 + 스캐폴드)

선택 항목: 마스터 핸드오프 P0 큐 #0(헤드라인 트랙, 사용자 2026-06-21 확정). 계획서 `docs/logh7-nest-drizzle-migration-plan.md`의 Phase 0(가산적·되돌리기 쉬움). maker/verifier 분리.

- **explorer 프리패스**: 계획서의 `createAuthServer`는 실제로는 `startLogh7AuthServer`(`logh7-auth-server.mjs:837`)이고, `serveAuth()`(`logh7-server.mjs`)가 env/arg/codec/account/repository를 배선해 호출한 뒤 `new Promise(()=>undefined)`로 영구 대기하는 데몬임을 확인. 핸들 반환형 = `{host,port,admin,close(async),...}`(`:1615-1668`). `tests/server/logh7-server.test.mjs`는 `serveAuth`를 import하지 않음(`createServeAuthAccountStore`/`startLogh7Server`/`startLogh7GameplayServer`/`isFetchForbiddenPort`만) → serveAuth 위임 리팩터는 1069에 영향 없음.
- **maker 산출물 (가산적)**:
  1. `src/server/logh7-server.mjs`: serve-auth 배선을 재사용 가능 **`export async function bootServeAuthServer({argv,env})`**로 추출(핸들 반환, 검증실패는 prefix 동일 `throw`). `serveAuth`는 이를 호출하고 throw를 잡아 **기존과 동일한** `console.error(메시지)+return 1`로 변환 → CLI 동작 불변. `process.env` 직접읽기를 주입 `env` 파라미터로 치환(기본 process.env, DIP 점진이행). JSDoc `@param` 추가.
  2. `tsconfig.json`(루트, `include:["src/app/**/*.ts"]`로 코어 .mjs 74개는 타입체크 제외): NodeNext, experimentalDecorators+emitDecoratorMetadata, types:["node"], allowJs+checkJs:false, strict, noEmit.
  3. `src/app/` Nest 스켈레톤(TS): `main.ts`(`createApplicationContext`+`enableShutdownHooks` — HTTP 플랫폼 없이, 코어 와이어는 raw TCP라 불필요), `app.module.ts`(provider 1개), `wire-server.service.ts`(`@Injectable` `OnApplicationBootstrap`→`bootServeAuthServer` / `OnApplicationShutdown`→`handle.close()`; argv=`process.argv.slice(2)`로 serve-auth 동일 플래그 통로).
  4. `package.json`: `start:nest`=`node --import tsx src/app/main.ts`. deps `@nestjs/{core,common,platform-express}@11.1.27`·`reflect-metadata`·`rxjs`·`drizzle-orm@0.45.2`, dev `drizzle-kit`·`typescript@6.0.3`·`@types/node@26`·`tsx@4.22.4`.
  5. `tools/logh7_nest_phase0_smoke.mjs`(재현 게이트): ①생명주기(in-process Nest boot→라이브 포트 0x0034 probe→`app.close()`→핸들 null+포트 닫힘, OS 시그널 무의존 결정론) ②동일 와이어 동작(real `serve-auth` subprocess와 로그인 응답 **바이트 동일** 비교).
- **게이트(maker 측정)**: `npm run test:server` **1069/1069 그린**(코어 무변경). 스모크 **PASS**(lifecycle 36B probe + 포트해제 + serve-auth와 36B 바이트 동일). `npx tsc --noEmit` **EXIT 0**. `npm run build`(vite) **성공**(루트 tsconfig가 React 프런트 미회귀, include 스코프 덕분).
- **적대적 검증(logh7-loop-verifier, 별도 컨텍스트)**: A 리팩터 가산성/CLI prefix 5종 동일 PASS · B 1069/0 독립 재현 PASS · C Phase 0 윈도우(11:31+) 변경파일=주장 집합뿐, codec/wire .mjs 무변경 PASS · D 스모크 비-허위(real subprocess+바이트비교) PASS · E 툴체인 clean PASS · F Drizzle 미배선(과장없음) PASS. **OVERALL PASS**.
  - 검증 환경 캐비엇(코드 결함 아님): 검증자 샌드박스에서 git 미동작(.git에 `info/`만). 메인 환경에서도 동일 — **레포 git 워킹트리에 .git objects/refs/HEAD 부재(2026-06-20 20:17 이전부터, Phase 0과 무관)**. 커밋 프로토콜 재가동하려면 git 복구 필요(사용자 확인 전 비파괴적으로 미수행).
- **다음(Phase 1)**: Drizzle accounts/runtime-state/content 스키마 → 기존 account store / world-state 스냅샷 인터페이스 뒤에 Drizzle 구현(node:sqlite 드라이버 우선), node:sqlite 경로는 패리티까지 폴백 유지, Drizzle repo 테스트 추가. 1069 그린 유지.

## 2026-06-21 루프 사이클 — Phase 1 RE 프리패스 → **blocked-needs-decision** (Drizzle 드라이버 충돌)

선택 항목: 헤드라인 트랙 "계속 진행" → Phase 1(Drizzle 영속화) 첫 슬라이스=accounts. explorer(logh7-loop-explorer) RE 프리패스 수행, 구현 전 **결정적 차단 발견** → 구현 보류, 사용자 결정 대기.

- **결정적 발견(P0, node_modules 직접 검증)**: **`drizzle-orm@0.45.2`에 node:sqlite 드라이버 없음.** SQLite 드라이버 = `better-sqlite3`/`libsql`/`bun-sqlite`/`op-sqlite`/`d1`/`expo-sqlite`/`sqlite-proxy`뿐(`package.json` exports + 디렉터리 확인, `grep node:sqlite|DatabaseSync node_modules/drizzle-orm` 0히트). Drizzle의 `better-sqlite3` 세션은 `stmt.raw()` 호출(better-sqlite3/session.js)인데 Node `node:sqlite`의 `StatementSync`엔 `.raw`가 없음(라이브 probe: `typeof stmt.raw==='undefined'`, 대신 `setReturnArrays`) → **`DatabaseSync`로 Drizzle 구동 불가.** `better-sqlite3`는 node_modules에 미설치(네이티브 빌드 dep).
- **충돌**: 계획서의 ①"node:sqlite 우선·의존성 0"과 ②"Drizzle ORM 채택"이 0.45.2에서 양립 불가. 계획서가 둔 조건부 포크("미지원 시 better-sqlite3, 단 네이티브 빌드")의 트리거 발생.
- **기존 인터페이스(감쌀 대상, 재작성 금지)**: `createAccountRegistry({persistPath,seedPath,maxAccounts,maxFailedAttempts,lockoutMs,now})`. 덕타입 surface = `has/verify/register/dummyVerify/getProfileCharacters/addProfileCharacter`(+ export `loadAccountRecords`). SQLite 테이블 `accounts(account TEXT PK, salt TEXT, hash TEXT, created_at TEXT, characters_json TEXT DEFAULT '[]')`, **PRAGMA journal_mode=DELETE**(repository는 WAL — 불일치 주의), persist=`BEGIN IMMEDIATE`→`DELETE`→bulk INSERT(업서트 아님). 소비처 `createAccountStore`(login-session.mjs:386-465), 와이어링 `logh7-server.mjs:129-141`(`--account-db`).
- **테스트 영향 0 평가**: 1069은 account-registry/repository를 *행위/shape*로만 검증(`loadAccountRecords().map(account)`, `verify()`/`authenticate()` 객체) — raw SQLite 바이트 미검증. 인터페이스 뒤 가산적 Drizzle 추가는 1069 무위험(단 registry를 Drizzle 기본경로로 *재작성*하면 journal mode/write semantics/createdAt 포맷이 깨질 수 있음). `test:server` glob은 `*.test.mjs`만 → 신규 `.ts` 테스트는 tsx 별도 레인 필요.
- **트랩(explorer)**: 스키마 drift(Drizzle 모델 vs 손작성 SQL), `created_at`은 plain `text`(Drizzle `mode:'timestamp'` 금지), persist=truncate-rewrite(naive onConflict 부적합), `characters_json` default `'[]'`.
- **결정 필요(사용자)**: 드라이버 방향 — (A) Drizzle=스키마/마이그레이션만+런타임 node:sqlite 유지(zero-dep, 추천) / (B) better-sqlite3 추가해 풀 Drizzle ORM(네이티브 빌드) / (C) Drizzle 폐기+node:sqlite 타입 리포지토리. **AskUserQuestion으로 질의함.** 답 확정 전 Drizzle 코드 미작성(낭비 방지).
- 증거: explorer 보고(이 사이클), `node_modules/drizzle-orm/package.json` exports, `src/server/logh7-account-registry.mjs:69-166`.
- 실클라 표면: N/A(순수 서버 영속성 슬라이스 — 라이브 클라 항목 아님). EXE/세션 미기동.

## 2026-06-21 루프 사이클 — Phase 1 accounts 슬라이스 **구현 완료** (Drizzle 영속화, verifier 7/7 PASS)

위 blocked-needs-decision 해소: **사용자 결정 = (B) better-sqlite3 추가, 풀 Drizzle ORM.** 그 위에서 accounts 영속성 Drizzle 백엔드를 가산적으로 구현하고 node:sqlite와 byte/스키마 패리티를 증명했다(라이브 레지스트리 미스왑 — 패리티 확정까지 폴백 유지).

- **게이팅 해소**: `better-sqlite3@12.11.1` 설치+네이티브 빌드 OK(Win10/Node24, prebuilt — node-gyp 불필요). `node -e` 쿼리 `row 42` 확인.
- **maker 산출물(가산적, 코어 .mjs 무수정)**:
  1. `src/app/persistence/accounts.schema.ts` — Drizzle `sqliteTable('accounts',…)`, 기존 테이블과 동일(account PK·salt/hash NOT NULL·created_at nullable text·characters_json TEXT NOT NULL DEFAULT '[]').
  2. `src/app/persistence/drizzle-account-persistence.ts` — `loadAccountRecordsDrizzle`/`persistAccountRecordsDrizzle`(drizzle(better-sqlite3) 풀 ORM). `logh7-account-registry.mjs:69-177`의 영속화 의미를 드롭인 미러: 동일 DDL·`journal_mode=DELETE`·`synchronous=NORMAL`·전체 DELETE 후 bulk INSERT(`behavior:'immediate'`=BEGIN IMMEDIATE)·`characters_json=JSON.stringify(profileRecords(record))`·`parseCharactersJson`. `parseCharactersJson/profileRecords`는 .mjs 비공개라 동일 로직 복제(드리프트는 cross-parity 테스트가 가드).
  3. `drizzle.config.ts` + `drizzle/0000_accounts_init.sql`(drizzle-kit generate) — 스키마→SQL 유효성 검증, DDL이 레지스트리와 일치(런타임은 self-create라 미적용).
  4. `tests/server/drizzle/accounts-persistence.test.ts`(5 테스트) + `package.json` `test:drizzle`=`node --import tsx --test "tests/server/drizzle/**/*.test.ts"`. dev `@types/better-sqlite3`.
- **패리티 증명(5/5)**: ①Drizzle 왕복 ②node:sqlite-기록 DB를 Drizzle 로더가 동일 판독 ③Drizzle-기록 DB를 node:sqlite `loadAccountRecords`가 동일 판독 ④`PRAGMA table_info(accounts)`가 두 라이터 간 byte-동일 ⑤스키마 컬럼명 일치. → on-disk 포맷 동일 = 다음 슬라이스에서 안전 스왑 가능.
- **게이트**: `npm run test:server` **1069/1069**(신 `.ts`는 `tests/server/drizzle/`+`.ts`라 `*.test.mjs` glob 밖 → 코어 카운트 불변). `npm run test:drizzle` **5/5**. `npx tsc --noEmit` **EXIT 0**. `npm start`(plain node) 부트경로 무영향(.ts/drizzle import 없음).
- **적대적 검증(logh7-loop-verifier, 별도 컨텍스트)**: A 네이티브빌드 PASS · B 패리티 비-허위(real cross-impl, self-compare 없음) PASS · C 1069 불변+`.ts` 격리 PASS · D 코어 무변경(registry에 drizzle/better-sqlite3 import 없음·라이브경로 node:sqlite 유지) PASS · E 의미 미러(DELETE 저널 -wal 없음 실증) PASS · F tsc 0+마이그레이션 DDL 일치 PASS · G 과장없음(라이브 미스왑 명시) PASS. **OVERALL 7/7 PASS**.
- **다음(Phase 1 후속 슬라이스)**: 라이브 레지스트리를 Drizzle로 플립(또는 createAccountRegistry에 persistence 주입점 추가) — 단 `npm start`(plain node)는 .ts/drizzle 직접 import 불가 → 빌드 스텝(.ts→js)이나 Nest/tsx 부트로만 Drizzle 활성. 플립 시 라이브 serve-auth 부트로 계정 생성·영속 + 1069 재확인. 이후 runtime-state/content 스키마로 확장.
- 실클라 표면: N/A(서버 영속성 슬라이스). EXE/세션 미기동, SHA 복구 N/A.

## 2026-06-21 루프 사이클 — C002 정적 RE: HUD mode-entry = **이벤트 큐 dequeue** 구조 규명 (verifier 보정 반영)

선택 항목: 사용자 지시 "RE를 계속 해서 게임을 할 수 있게" → 플레이 최심 블로커 C002(전략 HUD mode 자연 활성화→자연 0x0b01). 정적 RE(redex 디컴파일)로 mode-entry 게이트 사슬을 규명. **데이터 등급: P-static(디컴파일), 라이브 미확인.** 코드 변경 없음(localization 사이클).

**규명한 사슬(FUN_004fd100 tail)**: 자연 `FUN_004fd7a0(2,1)`(mode2 활성화) 게이트 = `DAT_00c9e2f8==0` → `*(param_1+0x128)<=0` → `FUN_005015f0(2, *(param_1+0x14), buf, 0)!=0`. 분기: `+0x18`→mode4, **`+0x24`→mode6, `+0x28`→mode2**(둘 다 `param_1+0xf4==1` 게이트; ⚠초기 maker 오독 +0x24/+0x28↔mode 스왑을 verifier가 정정). 이 tail 앞에 `FUN_005015f0(4,…)/(5,…)` probe·top gate `FUN_004fc470`도 있음(이번 심화 범위 밖).

**핵심 재프레임(verifier CONFIRMED)**: `FUN_00501ed0`은 기하학적 hit-test가 **아니라 keyed 이벤트 큐 dequeue**. 타깃 객체의 큐를 스캔: count `target+0x3f4`, key 배열 `target+0x470`, 13-dword(52B) 레코드 `target+0x4e8`(stride 0x34), 병렬 seq `target+0x3f8`/`+0x3f0`, 용량 0x1c. key==param_2(=2)면 레코드 복사 후 dequeue. 미러 enqueue = **`FUN_00501e30(eventCode, target, record)`**(같은 오프셋에 기록·count++), 게이트 `*(FUN_00502770()+0x34)==0`.

**FUN_005015f0 전체 술어(verifier 보정)**: top 사전체크 `*(target+8)!=0`; 그다음 (a) `FUN_00501ed0`(dequeue) 성공시 즉시 true, 아니면 (b) fallback: **gate05 `*(this+5)`**[`FUN_005024a0` — ⚠**타깃 아닌 컨트롤러 param_1**] AND `*(target+0x15)`[`FUN_005025c0`] AND `FUN_00500820` AND `FUN_005025f0`; 끝 `switch(param_2)`에서 **case 2는 `*(target+0xb00)!=0` 추가 요구**.

**라이브 FUN_005015f0=0 원인 = 가설 ≥4개(verifier 정밀 플래그: "큐 비어서"는 추론, 미증명)**: ①큐에 code-2 이벤트 없음 ②gate05 `*(this+5)=0` ③`*(target+0x15)=0` ④`*(target+8)=0` ⑤mode2 전용 `*(target+0xb00)=0`. 디컴파일만으론 판별 불가 → 라이브 필요.

**enqueue 7 콜러(이벤트 포스트 사이트)**: `FUN_004ba2b0/004c1700/004fef90/00508f60/0050d230/00517cd0/00517db0`. **FUN_004fef90가 FUN_005015f0·FUN_00501e30 둘 다 호출 → code-2 producer 1순위 용의자**(verifier 추천).

- **적대적 검증(logh7-loop-verifier, 별도 패스)**: 재프레임(dequeue/enqueue·사슬) SOUND. 오독 3건 정정(offset→mode 스왑·gate05는 컨트롤러·"큐 비어서"는 추론). 스코핑 정직(static-only, fix 주장 없음). 본 항목은 보정본.
- **다음 후보**: (a) `FUN_004fef90` 디컴파일 — code-2 enqueue 조건/입력경로 확인. (b) 라이브 probe로 mode-entry 순간 `param_1+0x128`·`DAT_00c9e2f8`·`*(this+5)`·`*(target+0x15)`·`*(target+8)`·`*(target+0xb00)`·큐 count `target+0x3f4` 읽어 5가설 판별. (c) 또는 더 가시적 플레이 win(페잔 1칸 회랑 재정제·신 EXE 라이브검증·NO DATA 패널)으로 다양화.
- 실클라 표면: N/A(정적 사이클, EXE/세션 미기동). 증거=redex 디컴파일 출력(FUN_004fd100/005015f0/005024a0/005025c0/00501ed0/00501e30/00502770).

## 2026-06-21 루프 사이클 — C002 code-2 producer 추적(정적 천장 확인) + 라이브 probe 와치 도구 확장

선택 항목: C002 계속(code-2 producer 찾기). 정적 RE로 1순위 용의자 반증 후, **정적 천장 확인** → 다음은 라이브. 라이브 준비로 와치 도구를 검증된 RE로 확장(신뢰성 있는 가산 작업, 라이브 불요).

- **code-2 producer 추적(정적, 반증 위주)**: `FUN_004fef90`는 code-2 producer 아님 — **STRATEGY_SEQUENCE 상태머신**(`param_1+4` state: Init→Ready→Waiting; `s_STRATEGY_SEQUENCE_*` 문자열; case0서 code `0x9` enqueue·`FUN_004fc4a0` 등 init, case1서 `FUN_005015f0(…0x16…)`로 0x356 NotifyInformationCharacter 대기). `FUN_00517db0`는 `FUN_00501e30(0x18, FUN_00502780(2,1))` = code **0x18** 포스트. `FUN_00517cd0`는 `*DAT_02215e2c`(1/2/3)로 분기. → 빠른 용의자들은 code-2 미포스트. code-2(=mode2 트리거)는 대형 입력 디스패처(`FUN_0050d230`/`FUN_00508f60`/`FUN_004ba2b0`)에 있을 것으로 좁혀짐(미확정). **정적 천장 = 라이브 판별 필요 재확인.**
- **maker 산출물(가산적, 신뢰성)**: `tools/logh7_hud_mode_activation_watch.py` `uiObjectState` 확장 — 검증된 RE 기반 5게이트 discriminator 추가: `gateB00`(=`*(target+0xb00)` mode-2 전용 게이트, verifier 발견), 큐 전체 키 덤프 `eventKeys470`(@+0x470, cap 0x1c) + `hasMode2Event`(code-2 큐잉 여부), gate05/valid08/flag15 주석 정합. **`python -m py_compile` OK, `test_logh7_hud_mode_activation_watch` 2/2 OK.** → 다음 라이브 probe가 mode-entry 순간 `{valid08, gate05, flag15, gateB00}` 중 어느 0이고 code-2 이벤트 큐잉됐는지 즉시 표시(turnkey).
- **상태/다음**: C002 구조 모델 완성·검증됨(이벤트 큐). **순수 정적은 천장** — unblock은 **라이브 Frida probe**(확장 와치로 turnkey). 라이브는 finicky·자율 루프서 stale-process 위험 → 감독 세션 권장. 자율 대안(reliable): 대형 디스패처 정적 추적(FUN_0050d230/004ba2b0) 계속 또는 다른 정적/데이터 작업. 페잔 회랑은 audit 이미지 모호 → 추측 편집 금지(보류).
- 실클라 표면: N/A(정적 사이클). 증거=redex 디컴파일(FUN_004fef90/00517cd0/00517db0) + 확장 와치 + 단위테스트 2/2.

## 2026-06-21 루프 사이클 — C002 **라이브 probe 판별(감독 세션, 사용자 "라이브 돌려")** ★결정적

신 canonical EXE(SHA 7922ac36)로 월드 자동 진입(0x0f02·0x0313·0x0315·0x0323·0x0325 확인, 0x0b01 없음). 확장 와치(`logh7_hud_mode_activation_watch.py`)를 client(pid)에 Frida attach, 55초간 전략화면 폴링 + star/HUD 클릭. **증거: `.omo/ulw-loop/evidence/g006-c002-live-discriminator-20260621.jsonl`(6060줄, modeActivationHitTest 5178 + hudGate 439).**

- **결정적: `FUN_004fd7a0`(hudModeSet) 0회** — mode 활성화가 단 한 번도 안 일어남(C002 fail 라이브 확정). `FUN_004fd100`은 439회 진입, mode-entry block까지 도달(=`DAT_00c9e2f8==0`·`param+0x128<=0` 가드는 통과 — 블로커 아님).
- **게이트 판별(mode-entry `FUN_005015f0(2,…)` 438회×4타깃, 전부 `retvalLow8=0`)**:
  - `this+5` **gate05 = 1 (항상)** → ✅ 통과. **★장기 가설(gate05/this+5=0이 블로커) 라이브 반증.** v37~v61f가 쫓던 gate05는 실제로 set돼 있다.
  - `target+8` valid08 = 1 → ✅ 통과.
  - 이벤트 큐 `count(+0x3f4)=0`, `hasMode2Event=false` (클릭 후에도 0) → ❌ **큐가 비어 path(a) FUN_00501ed0 dequeue 실패 = 1차 게이트.**
  - `target+0x15` flag15: hudMode2**Primary**(HUD+0x14)=0 → fallback `FUN_005025c0`서 차단 / hudMode2**Fallback**(HUD+0x28)=1.
  - `target+0xb00` **gateB00 = 0 (전부)** → Fallback은 flag15 통과해도 switch case2(`*(target+0xb00)`)서 차단.
- **결론(라이브 검증)**: mode2 활성화는 EITHER (a) 타깃 큐에 **code-2 이벤트 enqueue**(가장 깨끗 — 들어오면 dequeue가 즉시 true, fallback 게이트 무관) OR (b) Primary는 `target+0x15`, Fallback은 `target+0xb00` set. **클릭은 카메라 팬만 만들고 큐에 code-2 미투입** → **진짜 크럭스 = 입력→code-2 enqueue 라우팅**(어떤 입력/버튼이 `FUN_00501e30(2, HUD+0x14/0x28, …)`를 부르는가, 그리고 왜 전략화면 클릭이 거기로 안 가는가).
- **세션 정리**: `stop` shaVerified=True, post-stop SHA=canonical 7922ac36, node/client kill 완료(stale 없음).
- **다음**: (a) enqueue 콜러 중 code-2 producer 확정(`FUN_0050d230`/`FUN_004ba2b0` 정적 + 어느 화면요소/버튼이 트리거인지) → 라이브로 그 요소 클릭해 큐 투입 확인. (b) 또는 `target+0xb00`/`target+0x15` writer 추적(대안 경로). (c) HUD mode 타깃(HUD+0x14/+0x18/+0x24/+0x28)이 화면 어느 버튼인지 rect로 역매핑해 정확히 클릭.
- 증거 등급: **P0-live**(실클라 Frida 측정). 와치 확장은 이 세션서 라이브 검증됨.

## 2026-06-21 루프 사이클 — C002 라이브 후속: mode-타깃 rect 클릭도 무효 → **입력-레이어 근본원인과 통합(★중대 수렴)**

위 라이브 판별의 후속. 와치 데이터에서 mode 타깃 4개의 화면 rect를 추출(hudMode2Fallback `(0,0,165,32)`, hudMode2Primary `(0,34,331,26)`, hudMode6Fallback `(171,0,157,32)`, hudMode4Primary `(0,540,331,26)` — 모두 좌상단/좌측 소형 UI). 이전 클릭이 이 rect들을 빗나갔던 것 확인 → 두 번째 라이브 세션(`g006-c002-modeclick-20260621`)서 **정확한 rect 중심 4곳 클릭**.

- **결과(증거 `.omo/ulw-loop/evidence/g006-c002-modeclick-20260621.jsonl`, modeActivationHitTest 4790)**: 정확한 mode-타깃 클릭에도 `eventQueueCount3f4=0`·`hasMode2Event=false`·`eventKeys=NONE`·`retvalLow8=0`·`hudModeSet 0회`. **즉 인-월드 마우스 클릭은 mode 타깃 큐에 code-2를 못 넣는다.**
- **★수렴(근본원인 통합)**: 이는 이미 라이브 확정된 입력-레이어 한계([[logh7-inworld-input-blocked-2026-06-20]])와 정확히 일치 — 인-월드 **마우스**는 SetCursorPos/mouse_event로 이벤트시스템(FUN_00502780/enqueue 게이트 `*(FUN_00502770+0x34)`)에 **안 닿는다**(cursor-clip/DirectInput 미해결). 반면 **키보드 `--hw`(keybd_event)는 뚫려 catGate 0x1→0x2→0x6=mode1→2→6 전이 라이브 확정**.
- **∴ C002는 mode/게이트 RE 문제가 아니라 입력-주입 레이어 문제로 판명.** v37~v61f의 gate05 추적은 red herring(gate05=1). HUD mode 큐 활성화 = 모든 인-월드 마우스 명령(0x0b01 포함)과 동일 근본원인.
- **세션 정리**: 두 세션 모두 `stop` shaVerified=True, SHA canonical 7922ac36, node/client kill.
- **다음(실제 프런티어)**: (a) **인-월드 마우스 주입 해결** = DirectInput 레벨 Frida 주입(IDirectInputDevice8::GetDeviceState/GetDeviceData 후킹) 또는 cursor-clip/커서셀 매핑(메모리 How-to-apply, `tools/logh7_frida_movemode_probe.py`, `docs/logh7-movemode-re.md`). (b) 또는 **키보드로 구동 가능한 경로** 탐색(catGate가 키보드로 전이되므로 mode 활성화→0x0b01을 키보드 시퀀스로 시도). 마우스 클릭 기반 인-월드 RE는 더 이상 라이브 사이클 낭비 금지(메모리 지침 재확인).
- 증거 등급: **P0-live**.

## 2026-06-21 루프 사이클 — 0x0b01 입력경로 RE 수렴(마우스버튼=GetAsyncKeyState·클릭주입 작동·진짜블로커=move-mode-open 제스처)

C002 라이브 판별 후속 정적 RE(`docs/logh7-movemode-re.md` 캐논 + 입력 API 추적). "마우스가 안 닿는다"의 정확한 층을 규명.

- **마우스 버튼 = 키보드와 동일 메커니즘**: 게임 입력 폴러 `FUN_00500b70`이 `GetAsyncKeyState(1)=VK_LBUTTON`·`(2)=VK_RBUTTON`을 폴링(키 0x08/09/0d/11/1b/25-28/70/72/73과 함께). movemode 문서의 버튼 뱅크 `DAT_022142db`(L)/`DAT_022142dc`(R, bit0x40=edge)가 이걸로 채워짐. → 인-월드 마우스 **버튼**은 하드웨어 mouse_event로 주입 가능(keybd_event가 키 정복한 것과 동일 원리).
- **커서 위치 read**: `GetCursorPos` import + 사용(`FUN_005db3b0`=WndProc 메뉴팝업용, `FUN_006560f6`), `ScreenToClient` import, `DirectInput8Create`(`FUN_00525780`)도 존재. `_click`(tools/logh7_window_login.py)은 이미 **절대 MOVE glide + LEFTDOWN/UP을 1px move·0.05s로 페어링**해 GetCursorPos 폴 + GetAsyncKeyState edge에 맞추는 정교한 하드웨어 주입 — **로비 버튼 발화 라이브 확인**. 즉 클릭 주입 자체는 작동.
- **★진짜 0x0b01 블로커(수렴)**: 인-월드 맵 좌클릭이 카메라 패닝(`FUN_004f6f60`)으로 빠지는 건 위젯이 목적지선택 sub-state(`+0xc==1`, mode=2)가 아니기 때문. mode=2는 `FUN_00570a10`(카테고리 다이얼로그)서 **함대 선택됨(`widget+0x48!=0`) + "이동" 항목 선택 → `FUN_004d51d0(this,2)`** 일 때만 열림(movemode 문서 §122-124 P1·최유력). 단순 맵클릭으로는 절대 안 열림(라이브 일치). 즉 **누락 제스처 = "함대 선택 → 명령 카테고리 다이얼로그 → 이동"**(키 게임코드 0x19/0x3f/0x40 via `FUN_004c8700` 키바인딩, 또는 우클릭 컨텍스트). 그 후 목적지 좌클릭→navGate `FUN_004d6310`→confirm `FUN_0050d230`→`FUN_004b4600(1)`→`FUN_004b78a0(0x3a→0xb01)` 36B 송신.
- **다음 라이브 실험(정의 완료)**: movemode 프로브(`tools/logh7_frida_movemode_probe.py` 17훅: catGate/moveHandler/modeSetter/navGate/pan)를 attach하고 (1)함대 선택 시도(catGate 키시퀀스 or own-fleet 클릭) → (2)우클릭/후보키(0x19/0x3f/0x40 매핑 VK)로 카테고리 다이얼로그 open 시도 → `FUN_00570a10`/`FUN_004d51d0(2)` 발화 + `widget+0x14`(mode)·`+0xc`(sub-state) 캡처로 §122-124 차단점 확정. 미해결: 함대 선택 인-월드 제스처, 게임코드 0x19/0x3f/0x40↔VK 매핑(`FUN_004c8700` 또는 라이브).
- 실클라 표면: N/A(정적 RE 사이클). 증거=redex(FUN_00500b70/005db3b0/006560f6/00525780) + symbols import + `_click`/movemode 문서. 등급 P0-static(API)/P1(제스처 가설).

## 2026-06-21 루프 사이클 — move-mode 라이브 probe(감독 "지금 깨어나"): **키보드가 HUD mode+셀항행 구동(마우스는 패닝만)** ★

신 EXE 월드진입 후 movemode 프로브(`tools/logh7_frida_movemode_probe.py`) attach + 제스처(좌클릭·우클릭·키 F1/F3/F4/Enter/Tab/화살표 --hw). 증거: `.omo/ulw-loop/evidence/g006-movemode-20260621.json`(749,690행). 세션 stop shaVerified=True·SHA canonical.

- **★positive(키보드 포함 시)**: `catGate`(FUN_004fd100) **state +0xf4 = 0x1→0x2→0x6 전이**(0x1:1362, 0x2:40, 0x6:31), `cellStatePush`(FUN_004fd7a0) **4회 발화**. → **HUD mode 활성화가 키보드로 일어남.** (마우스-only였던 직전 hud-watch probe에선 FUN_004fd7a0 0회였던 것과 대조 = mode 활성화의 입력은 키보드.) `navGate`(FUN_004d6310) **passed:true**(셀 (0x4a,0x4)=(74,4), ret=513) — 목적지 항행검증 통과. `eventMatch` type4 "좌클릭 통과", `inputAccessor` idx 0x6a active.
- **negative(여전히)**: `moveHandler`(FUN_00570a10 명령 카테고리 다이얼로그)=**0**, `modeSetter`(FUN_004d51d0)=**0**, 0x0b01/0x0400 없음. `PAN`(FUN_004f6f60) 92회 = 좌클릭이 카메라 패닝으로. GetAsyncKeyState 훅은 실패(probe HOOK_FAIL — 키 식별엔 영향, mode 전이 관측엔 무관).
- **해석(정제)**: 입력경로가 두 층으로 분리됨 — ①**HUD mode(catGate/FUN_004fd7a0, mode 1/2/6)는 키보드로 활성화**됨(이번 확인). ②**move COMMAND(0x0b01 송신: FUN_00570a10 카테고리→FUN_004d51d0(2)→confirm)** 는 별개 경로로 미개방. FUN_00570a10은 `widget+0x48!=0`(함대 선택)이어야 진행하므로, 다음 블로커는 **인-월드 함대 선택**(own_cell +0x11178 / own-fleet 스프라이트 [[logh7-fleet-render-rootcause-2026-06-20]])일 공산. 즉 "이동시킬 내 함대가 선택 가능 상태인가"가 선결.
- **다음 실험**: (a) catGate 0x2/0x6 전이를 일으킨 **정확한 키 식별**(단일키 probe + 타임스탬프). (b) **own 함대 선택 가능 여부 확인**(probe로 `widget+0x48`·own_cell +0x11178·선택 후 FUN_00570a10 진입). (c) 함대 선택+카테고리 다이얼로그 open되면 navGate-passed 셀로 confirm→0x0b01 시도. mouse-only 반복 금지(패닝 확정).
- 증거 등급: **P0-live**(catGate 전이·navGate passed 실측).

## 2026-06-21 루프 사이클 — ★핸드오프#1 라이브검증(currentRaw11178==2588) + 진짜 블로커=**own-fleet 리스트 빈 상태** ★중대

신 EXE(7922ac36) 월드진입 후 `tools/logh7_root_init_watch.py`로 root 상태 스냅샷(pid 24420). 증거: `.omo/ulw-loop/evidence/g006-rootinit-20260621.jsonl`. 세션 stop shaVerified=True·SHA canonical.

- **★핸드오프 #1 CLOSED(라이브 검증)**: `globalRootFields`: **`currentRaw11178 = 2588`**(`currentX=88, currentY=25` = 제국 수도 ヴァルハラ, `byte0=1`). 2026-06-21 좌표 수정(신 EXE cave 0xa1c=2588 + 서버 fleetCellId(empire)=2588)이 **라이브로 정합 확정**(이전 2550). 카메라/현재셀 = 수도.
- **★진짜 블로커 발견**: **`listCount1117c = 0`**, `listHead11180Hex`=전부 0, `gridHead0008Hex`=전부 0. = **own-fleet 리스트가 비어 있음.** 그래서 `fleetRender`(FUN_0058d140) 0회(직전 movemode probe와 일치)·선택 가능한 함대 없음·`FUN_00570a10`(카테고리 다이얼로그, `widget+0x48` 함대선택 요구) 진행 불가·0x0b01 불가.
- **재오리엔트**: 0x0b01(인-월드 이동 명령)의 선결 블로커는 "입력 제스처"가 아니라 **전략 함대 리스트 채우기**다. 카메라는 수도(2588)를 보지만 그 셀에 **선택할 함대 엔티티가 리스트(+0x1117c/+0x11180)에 없음.** 0x0313(object table)·0x0325(unit)은 trace에 떴지만 클라 fleet 리스트(+0x1117c)는 0 → 서버가 플레이어 함대를 그 리스트에 넣는 레코드를 안 보내거나, 클라 파서가 +0x1117c로 안 올림. **이건 finicky 입력이 아니라 서버/와이어 문제 = 더 tractable.**
- **다음(서버/와이어, 입력 무관)**: (a) 클라가 +0x1117c/+0x11180 own-fleet 리스트를 채우는 파서/소비 함수 RE(어느 메시지 0x0313/0x0315/0x0325/0x031f가 그 리스트에 기여하는지) → logh7-re/logh7-wire. (b) 서버가 플레이어 own-fleet을 셀 2588에 그리드 오브젝트로 emit하는지 확인(`logh7-login-protocol.mjs` 0x0313/0x0315 빌더 + 함대). (c) 채워지면 fleetRender 발화→함대 선택→카테고리 다이얼로그→(이미 검증된) navGate 셀→0x0b01. 체인의 나머지(키보드 mode활성화·navGate)는 이미 라이브 확인됨.
- 증거 등급: **P0-live**(root 스냅샷 실측).

## 2026-06-21 루프 사이클 — own-fleet/선택 리스트(+0x1117c) 빈 원인 추적 → **LOGH_WORLD_IMPORT_BASES 플래그 누락 유력**(정적+v36b)

자율 루프(동적 페이싱). 빈 `listCount1117c=0`의 원인 RE(정적, 라이브 무관).

- **리스트 소비자**: `+0x1117c`(count, byte)·`+0x11180`(head)을 참조하는 건 `FUN_0057bbc0` 단 1곳 — 읽기(소비). `FUN_0057bbc0`은 `+0x11180`을 **stride 0x180(0x60 dword)** 로 순회하며 선택 가능 UI 리스트 빌드(엔트리마다 `FUN_004c8de0`/`FUN_00577050`), 이후 `DAT_00c9eabc`(0x18 bound 선택 idx) 사용 = 전략 셀의 선택/정보 리스트 패널. 호출자 `FUN_00577e70`. 쓰기는 literal-offset에 없음(서버 recv memcpy, own_cell과 동일 난점).
- **★유력 원인(v36b 선례 연결)**: 작업등록부 v36b — `LOGH_WORLD_IMPORT_BASES=1`이 `FUN_004c4170`(fieldImport)로 `DAT_007cd04c+0x1117c` list count를 **4로** 만들었다(당시 +0x11178 current는 0). 내 라이브 run들은 이 플래그 **미설정** → 리스트 빈 상태. 플래그 확인: `src/server/logh7-login-session.mjs:157`(`worldImportBaseRecordsEnabled`), `logh7-config.mjs:163`(importBases). 서버가 0x031f/0x0321 base 레코드를 0x0f03 전에 emit → 클라 FUN_004c4170 import → 리스트 채움.
- **연결**: 이 빈 리스트 = 전략 정보 패널 "NO DATA"(핸드오프 TODO)와 동일 증상일 가능성. 단 이 리스트는 v36b 기준 **base/institution**(0x031f/0x0321)이라, 0x0b01 fleet-move 선택(movemode 문서의 widget+0x48)과는 별개 위젯일 수 있음(검증 필요).
- **다음 라이브 실험(정의 완료)**: 신 EXE + **`LOGH_WORLD_IMPORT_BASES=1`** 추가해 재기동 → root 스냅샷으로 `+0x1117c` 채워지는지 확인(기대 >0) + `FUN_0057bbc0` 발화/패널 NO DATA 해소 + `fleetRender`/widget+0x48 변화 관찰. 채워지면 (a) NO DATA 패널 fix 가능성, (b) 선택→카테고리 다이얼로그 체인 재시도. 부작용(ECONNRESET) 주의하되 v36b는 클라 생존.
- 증거 등급: P0-static(소비자 RE) + P1(플래그 원인, v36b 선례).

## 2026-06-21 루프 사이클 — ★`LOGH_WORLD_IMPORT_BASES=1`로 전략 리스트(+0x1117c=4) 라이브 채움 확정 (빈 리스트 블로커 해소)

자율 루프. 직전 가설(빈 리스트 = 플래그 누락) 라이브 검증. 신 EXE + `LOGH_WORLD_IMPORT_BASES=1` 추가 기동(pid 12356). 증거: `.omo/ulw-loop/evidence/g006-importbases-rootinit-20260621.jsonl`. 세션 stop shaVerified=True·SHA canonical.

- **★확정**: 트레이스에 **0x031f·0x0321 base 레코드 등장**(이전 run엔 없음). root 스냅샷: `currentRaw11178=2588`(수도) **+ `listCount1117c=4`**(이전 0!), `listHead11180Hex`=`01000000…00000100…`(엔트리 4개 실데이터). → **own_cell(2588) + 전략 리스트(채움) 가 동시에 맞는 새 상태 최초 달성**(v36b는 리스트만·own_cell=0 / 직전 run들은 own_cell만·리스트=0). 빈 리스트 블로커 = **플래그 누락이 원인**으로 확정.
- **함의**: `LOGH_WORLD_IMPORT_BASES=1`이 전략 셀의 base/institution 리스트(FUN_0057bbc0가 빌드)를 채운다 → "NO DATA 패널" 해소 후보 + 선택 대상 생성. 클라 생존(ECONNRESET 없음, 30초+ 샷 캡처). **playable 기본 스택 편입 후보**(단 회귀·부작용 추가검증 + 사용자 확인 필요).
- **미확정(다음)**: (a) NO DATA 패널이 시각적으로 채워지는지(전략 정보 패널 샷). (b) 리스트 4엔트리(base/institution)가 **fleet-move 선택**(movemode widget+0x48)과 같은 위젯인지 별개인지 — 0x0b01엔 fleet 선택 필요. (c) movemode 프로브 attach + 리스트 엔트리 선택 시 FUN_0057bbc0/FUN_00570a10 발화 추적.
- **다음 실험**: 플래그 ON을 베이스라인으로, 전략 정보 패널/선택 UI 상호작용 + movemode 프로브로 선택→카테고리 다이얼로그→0x0b01 체인 재시도. 동시에 base 리스트≠fleet 선택이면 fleet emit(0x0325 own-fleet) 경로 별도 확인.
- 증거 등급: **P0-live**(리스트 population 실측).

> **루프 케이던스 지시(사용자 2026-06-21)**: 이제부터 ScheduleWakeup delaySeconds=**60초**(하한, "1분 간격 이하"). 매 fire 유지.

## 2026-06-21 루프 사이클 — IMPORT_BASES 베이스라인 상호작용: 리스트 채움(데이터)≠선택 surface(제스처), catGate 키 narrowing

자율 루프(60s 케이던스). IMPORT_BASES=1로 기동(+0x1117c 채움 상태 재확인)·movemode 프로브 + 전략셀/리스트 상호작용(클릭·Enter/Tab/F1). 증거 `.omo/ulw-loop/evidence/g006-basesel-20260621.json`(403,590행). 세션 stop shaVerified=True·SHA canonical.

- **결과**: `catGate state_ecx_pf4` 전부 0x1(이번엔 mode 전이 **없음**) — 직전 돌파 run(F1/F3/F4/Enter/Tab/화살표)과 달리 이번(Enter/Tab/F1)은 전이 안 됨 → **catGate mode 전이 키 = {F3(0x72)/F4(0x73)/화살표} 후보**로 좁혀짐(Enter/Tab/F1 아님). `moveHandler`(FUN_00570a10)·`modeSetter`·`fleetRender` 여전히 0. navGate 2× passed(셀 84,23). 클릭/키로 base 리스트 패널 surface/선택 안 됨.
- **해석**: 데이터층(IMPORT_BASES로 +0x1117c 채움)은 해결됐으나 **인-월드 선택/패널 surface는 미지의 입력 제스처에 막힘**(동일 입력 프런티어). 무작정 클릭/키 라이브는 저수익 → **정적 키바인딩 RE로 정확한 키 식별 우선**.
- **다음(정적, rapid 케이던스 적합)**: `FUN_0052f700`(키→`FUN_004c8700` 키바인딩 조회)·`FUN_005312b0`(keycode 0x19→0x903/0x3f→0xc02/0x40→0xc05 매핑, `*(+0x2c8)=2` 전략상태2) RE → 게임 keycode 0x19/0x3f/0x40의 **물리 VK** 확정 → 라이브 타겟 키 입력. 그 후 catGate/move 카테고리 다이얼로그 정밀 시도.
- 증거 등급: P0-live(catGate 키의존성) + 다음 P0-static(키바인딩).

## 2026-06-21 루프 사이클(정적) — ★move 모드 트리거 정정: 0x19/0x3f/0x40 = **명령 테이블 TYPE**(키코드 아님) → C002가 런타임 명령테이블 빈 블로커(v9~v14)와 직결

자율 루프(60s). `FUN_005312b0` 디컴파일(movemode 문서 §57 "키코드 0x19/0x3f/0x40" 정밀화).

- **정정**: `FUN_005312b0`은 `FUN_005015f0(0x17,…)`(이벤트 code **0x17** dequeue)가 통과하면, **`FUN_004c8700()`(런타임 명령 테이블) + iVar1*0x46 + 0x20 + DAT_00c9eabc*2**에서 ushort를 읽어(=선택된 명령의 type), 그게 `0x19→0x903`/`0x3f→0xc02`/`0x40→0xc05`이면 `*(param_1+0x2c8)=2`(전략상태2=move). → **0x19/0x3f/0x40은 키코드가 아니라 명령 테이블의 명령 TYPE**(`DAT_00c9eabc`=선택 인덱스, `DAT_00c9eac0`=iVar1). movemode 문서 §57의 "키코드" 표현 정정.
- **★연결**: move 모드(상태2) 진입 = **명령 테이블(FUN_004c8700)이 채워지고 + move-type(0x19/3f/40) 명령이 선택(DAT_00c9eabc) + 이벤트 0x17 발화**. 이는 v9~v14의 **런타임 명령 테이블 빈(rowCountD4=0) 블로커**와 직결(work-register: FUN_004c4a10이 commandCount=0 staging을 guard=1로 확정 → 행 0). IMPORT_BASES가 채운 base 리스트(+0x1117c)와는 **별개 데이터 경로**.
- **종합(C002 다층 데이터 블로커)**: ①전략 선택/정보 리스트(+0x1117c) = IMPORT_BASES로 해결됨 / ②**런타임 명령 테이블(FUN_004c8700) = 여전히 빈(rowCount=0)** → move 명령 선택 불가 → 0x0b01 불가. 입력 제스처보다 **명령 테이블 population이 핵심 잔여 데이터 블로커**.
- **다음**: 런타임 명령 테이블(FUN_004c8700) population 경로 재검(staging source FUN_004c4a10 이전, 어느 메시지가 record+0x14 rowCount/+0x16 factory를 nonzero로 채우나 — work-register positive-control은 가능 증명). + 이벤트 0x17 발생원. 이게 채워지면 명령 선택→0x17→상태2→navGate(이미 passed)→0x0b01.
- 증거 등급: P0-static(FUN_005312b0 디컴파일).

## 2026-06-21 루프 사이클(정적) — ★C002 종합: 잔여 블로커=**명령 테이블 source**(v9~v14), 단 길은 보임(스키마+move type RE확정 → 서버 emit)

자율 루프(60s). 명령 테이블 population 추적.

- **명령 테이블 위치/populator**: `FUN_004c8700` = `[DAT_007ccffc]+0x3416d8`(게이트 byte). 채우는 건 `FUN_004c4a10` 단 하나(staging→runtime 승격, +0x3416d8 rowCount/+0x3468ea factory). staging source = 0x0305/0x0307 body인데 work-register상 **zero(빈)** → 명령 0행 → move 명령 선택 불가. = v9~v14 미해결 "명령 테이블 source" 벽.
- **서버측(2026-06-21 당시 판정, 2026-06-28 정정됨)**: `LOGH_ACTION_LIST_CATEGORY/SEATS/POSTLOAD_ACTION_LIST_SEATS`는 `recordTraceFields`(auth-server.mjs:263-343)서 **trace echo만**(실제 emission 아님)이라고 적었으나, 2026-06-28 서버 재확인 결과 이는 stale이다. 현재 `server/src/server/logh7-login-session.mjs`의 `activeSeatEntries()`가 이 env들을 실제 `0x0323`/`0x0356` seat/category bytes로 emission한다. 단, 이 payload lever가 클라 UI tab1->tab2/3 전환을 만든다는 증거는 아직 없다. 0x0305/0x0307은 당시처럼 별도 명령테이블 source 문제로 남는다.
- **★길(이번 세션 RE 종합)**: 스키마 known(positive-control: record+0x14=rowCount, +0x16=factory, type array @+0x20 stride2 per FUN_005312b0). **move 명령 type RE확정 = 0x19/0x3f/0x40**(FUN_005312b0). ∴ 경로 = **서버가 0x0305/0x0307로 move 명령(type 0x19/3f/40) 1행짜리 명령 테이블 emit**(IMPORT_BASES 패턴, 근거있는 RE — fabricate 아님). 채워지면 명령 선택(DAT_00c9eabc)→event 0x17→FUN_005312b0→상태2(move)→navGate(이미 passed)→0x0b01.
- **선행 RE(다음)**: 0x0305/0x0307 **body→staging→FUN_004c4a10** 정확한 와이어 매핑(staging 구조체 오프셋, body가 record+0x14/+0x16/+0x20를 어떻게 채우나) = logh7-wire/RE. 이게 확정돼야 서버 emit을 byte-correct로 구현 가능. + event 0x17 발생원.
- **C002 전체 상태 종합**: 입력=키보드로 mode/navGate 구동됨(마우스 패닝). 데이터=own_cell(2588)✓·base리스트(IMPORT_BASES)✓·**명령테이블 ✗(핵심 잔여)**. 명령테이블만 채우면 체인 완주 가시권.
- 증거 등급: P0-static(FUN_004c8700/004c4a10/server 추적).

## 2026-06-21 루프 사이클(정적) — ★C002 명령테이블 체인 end-to-end 매핑 완료 (남은 건 0x0305 body 와이어 포맷 하나)

자율 루프(60s). staging populator 추적.

- **staging writer = `FUN_004ba2b0`(인바운드 메시지 파서/디스패처)**: staging `+0x3e0c8c`·`+0x3e5e98`을 기록(`FUN_004ba2b0` 1+3 hit). FUN_004c4a10(promote)은 `FUN_004c2a30`이 호출.
- **★완성된 체인(end-to-end)**: 서버 `0x0305/0x0307` → **`FUN_004ba2b0`**(body 파싱→staging `+0x3e0c8c`/`+0x3e5e98`) → `FUN_004c2a30`→**`FUN_004c4a10`**(변환·승격→런타임 명령테이블 `+0x3416d8`, guard=1) → `FUN_004c8700`(접근) → **`FUN_005312b0`**(선택 명령 type 읽음; 0x19/3f/40=move → 상태2) → navGate(`FUN_004d6310`, 이미 passed) → confirm(`FUN_0050d230`) → **0x0b01**.
- **남은 RE 단 하나**: `FUN_004ba2b0`의 0x0305/0x0307 **body→staging 기록 포맷**(어떤 바이트가 staging record의 count/type(0x19/3f/40)/factory를 채우나). 이게 확정되면 서버가 move 명령 1행을 byte-correct로 emit 가능 → 체인 완주. (work-register상 현 서버는 zero-body로 보냄.)
- **다음**: `FUN_004ba2b0`의 0x0305/0x0307 케이스 디컴파일(staging +0x3e0c8c/+0x3e5e98 write 포맷) → logh7-wire로 서버 0x0305 빌더 설계(move type 0x19) → 라이브 검증(명령테이블 rowCount>0 → 선택→0x0b01).
- 증거 등급: P0-static(staging writer 확정).

## 2026-06-21 루프 사이클(정적) — ★명령테이블 와이어 포맷 확정: 0x0305=21002B 이미지, **0x0307=명령 레코드(count+300×196B)**

자율 루프(60s). `FUN_004ba2b0` 0x305/0x307 케이스 디컴파일.

- **case 0x0305** (`ResponseStaticInformationCard_OK`): body→staging `+0x3e0c8c`에 **통째 복사**(`0x1482` dword + u16 = **21002B**). 카드 static 이미지(work-register 0x305=21002B 일치).
- **case 0x0307** (`ResponseStaticInformationCardCommand`): `body[0]` u16 = **count**→`+0x3e5e96`; 이어 **300레코드(0x12c) × 0x62 u16(196B)** → `+0x3e5e98`(내부 0x18=24 서브레코드 8B 재배열). = **명령 레코드 리스트(58802B)** = **명령테이블 데이터의 진짜 출처**(work-register 0x307=58802B 일치).
- **∴ 명령테이블 채우는 법**: 서버가 **0x0307을 count≥1 + move-type 명령 레코드로 emit**(현재 zero-body). 그러면 FUN_004ba2b0→staging→FUN_004c4a10→런타임테이블 rowCount>0 → 선택→FUN_005312b0 type(0x19/3f/40)→상태2→0x0b01.
- **남은 정밀 RE**: 0x0307 staging 레코드(0x62 u16/196B)의 어느 필드가 FUN_004c4a10 변환 후 런타임 `+0x20` type(FUN_005312b0이 0x19/3f/40로 읽는 위치)에 매핑되나 — 0x0307 inner 0x18 루프 + FUN_004c4a10 transform 대조 필요. 그게 확정되면 서버 0x0307 빌더(move 1행) byte-correct 구현 → 라이브 검증.
- 증거 등급: P0-static(0x305/0x307 staging 복사 포맷 직접 디컴파일).

## 2026-06-21 루프 사이클(정적) — ★★0x0b01로 가는 구체 경로 확보: 서버 0x305/0x307 빌더 이미 존재, move 명령 = descriptor `id`=0x19

자율 루프(60s). 서버 0x305/0x307 emit 현황 확인.

- **서버 빌더 이미 구현됨**: `buildStaticInformationCardInner`(0x305, `logh7-info-records.mjs:110`, card master/command-grant, 300×70B) + `buildStaticInformationCardCommandInner`(0x307, `logh7-info-records-static.mjs:174`, per-card command descriptor). 단 빈 `cards:[]`/라이브 미배선 → zero-body(work-register 일치). **밑바닥 구현 불요 = 채움+배선 문제.**
- **0x307 레코드 레이아웃(빌더 확정)**: 196B/레코드, `card_id u16@0x00`·`command_count u8@0x02(≤24)`·8B descriptor[] @0x04 = `{id u16@0, packed u24@2, w u16@5, flag u8@7}`. **descriptor `id` u16 = FUN_005312b0이 읽는 명령 type** → **move 명령 = `id`∈{0x19,0x3f,0x40}**.
- **★구체 경로(근거 확보)**: 서버가 `buildStaticInformationCardCommandInner({cards:[{cardId, commands:[{id:0x19,...}]}]})`(+ 매칭 0x305 card)로 **move 명령 1행 emit** → 라이브 conn3 reply에 배선 → FUN_004ba2b0→staging→FUN_004c4a10→명령테이블 rowCount>0 → 선택→event0x17→FUN_005312b0(0x19)→상태2(move)→navGate(✓passed)→**0x0b01**. C002 캠페인의 마지막 조각.
- **주의(미라벨 필드)**: descriptor `packed/w/flag`(cost/target/cooldown 추정, unlabeled) + 0x305 card 70B 레이아웃 + cardId 값은 라이브 검증 필요(최소 move엔 placeholder 가능성). 라이브 reply 경로 변경이라 **정식 maker 사이클(explorer 와이어확정→maker 배선+오라클테스트→1069→verifier→라이브)** 로 진행, 사용자 제안 후.
- **다음**: (구현 사이클) 0x0304→0x0305 / 0x0306→0x0307 conn3 reply 배선 지점 확정(login-protocol/login-session) + 최소 move-card 채움 + 오라클 테스트 + 라이브(명령테이블 rowCount>0 → 0x0b01). 커버리지 워크플로(war0lxvis) 완료 시 매트릭스와 함께 사용자에 제안.
- 증거 등급: P0-static(빌더 레이아웃 직접 read).

## 2026-06-21 루프 사이클(정적) — 0x0b01 구현 배선 지점 확정(explorer 완료, maker 준비됨)

자율 루프(60s). conn3 0x0305/0x0307 reply 배선 지점 확인.

- **배선 지점**: conn3 0x0305 reply = `logh7-login-protocol.mjs:162`("Minimal … 0x0305 reply … leading count 0"), 0x0307 reply = `:928`(count 0). 둘 다 현재 **zero-fill** → 클라가 0x0307을 CardCommand(명령테이블)로 파싱 → 빈 테이블. 사이즈테이블(`:1393`) 0x0305=0x520a·0x0307=0xe5b2(=58802, CardCommand staging 일치).
- **구현 스코프 확정(maker 준비)**: 그 reply를 `buildStaticInformationCardInner`(0x305 card master) + `buildStaticInformationCardCommandInner({cards:[{cardId, commands:[{id:0x19,…}]}]})`(0x307, move 명령)로 채워 배선. 빌더 존재(info-records*.mjs), move id=0x19 RE확정, 와이어 포맷 확정. **플래그 게이트(IMPORT_BASES 패턴)로 opt-in 후 라이브 검증** 권장.
- **주의**: login-session/login-protocol = 루프 소유권 제한 파일(담당 사이클만). descriptor packed/w/flag·cardId·0x305 70B content 미라벨 → 최소 move엔 placeholder + 라이브 검증. 라이브 reply 경로 변경이라 사용자 go-ahead 후 maker 진행.
- **상태**: C002/0x0b01 = explorer 전부 완료(WHERE/WHAT/빌더/move id/와이어/배선). 남은 건 maker 구현(채움+배선+오라클+1069+라이브) 1사이클 = **사용자 결정 대기**(커버리지 매트릭스와 함께 제안).
- 증거 등급: P0-static.

## 2026-06-21 루프 사이클(정적) — ★기존 명령테이블 프리로드 인프라 발견+결함 규명 → 0x0b01 구현 완전 스코핑

자율 루프(60s). conn3 0x0305/0x0307 reply 핸들러 정독.

- **기존 인프라 발견**: `LOGH_COMMAND_TABLE_PRELOAD_PROBE=1` 플래그 + `buildCommandTablePreloadCardInner`(login-session:339, 0x0305 extra)·`buildCommandTablePreloadCommandInner`(:350, 0x0306→0x0307) 이미 존재. 즉 명령테이블 프리로드 시도가 선행돼 있음(미완).
- **결함 2가지(왜 안 됐나)**: ① `COMMAND_TABLE_PRELOAD_COMMAND_IDS=[0x002b,0x0041]` = v9~v14 **positive-control id**(행 생성용)이지 **move(0x19/3f/40) 아님** → 설령 채워도 FUN_005312b0가 상태2(move) 전이 안 함. ② 빌더가 **BE + 오프셋(id@0x05 stride8)** 인데 canonical RE확정 `buildStaticInformationCardCommandInner`(info-records-static)는 **LE + record stride 0xc4·descriptor{id u16 LE@base+0x04+j*8}** → 와이어 포맷 불일치(클라 FUN_004ba2b0 case0x307 파싱과 어긋남).
- **conn3 reply 정체**: `buildWorldInformationSessionInner`(0x0305,0x520a)·`buildWorldInformationCharacterInner`(0x0307,0xe5b2)은 이름과 달리 **클라가 card/CardCommand staging으로 bulk-copy**(크기 일치). 현재 count=0. 코멘트(login-session:1469-1476): 빈 응답은 proven world-load와 묶임(populated-body 과거 stall) → **플래그 게이트 필수**.
- **★구현 완전 스코핑(maker 준비)**: 프리로드 빌더를 canonical(`buildStaticInformationCard(Command)Inner`, LE 정확 포맷)로 교체 + 명령 id에 **0x19(move)** 포함, `LOGH_COMMAND_TABLE_PRELOAD_PROBE` 게이트 유지(기본 off→world-load 무회귀), 오라클 테스트(와이어 바이트), 1069 그린, **라이브 검증**(명령테이블 rowCount>0 & type 0x19 → 선택→event0x17→상태2→navGate(✓)→0x0b01). 잔여 불확실: FUN_004c4a10 변환 후 descriptor id가 런타임 +0x20에 정확히 매핑되는지 = 라이브로 확정.
- **다음**: maker 사이클 시작(canonical 빌더+move id, 플래그게이트, 오라클+1069) → 라이브. login-session 수정이라 신중. 커버리지 매트릭스와 함께 사용자 보고/제안.
- 증거 등급: P0-static(프리로드 빌더+id 상수 직접 read).

## 2026-06-21 루프 사이클(maker) — ★0x0b01 FE-BE 연결: 서버 명령테이블 emit을 클라 포맷으로 수정(코드+테스트 완료, 라이브 검증 남음)

사용자 프레이밍 확정("인-월드 = FE↔BE 연결; 클라(컴파일EXE)=불변 계약, 서버가 byte-exact로 맞춰야"). 그에 따라 명령테이블 emit을 수정.

- **수정(maker)**: `src/server/logh7-login-session.mjs`의 프리로드 빌더 2개를 buggy hand-rolled(BE·offset 0x14/0x15) → **canonical**(`buildStaticInformationCardInner`/`buildStaticInformationCardCommandInner`, RE확정 LE)로 교체. import 추가. 클라 `FUN_004f5cb0`가 읽는 포맷 = LE + record-relative(레코드 base=2: card_id@+0, command_count@record+0x14=0x16, factory ids@record+0x16=0x18). 플래그 `LOGH_COMMAND_TABLE_PRELOAD_PROBE` 게이트 유지 → **기본 world-load 불변**.
- **stale oracle 정정**: `tests/server/logh7-login-session.test.mjs:2062` 프리로드 테스트가 구 BE 포맷을 expected로 박아둠 → canonical LE 오프셋(count LE@0, card_id@0x02, command_count@0x16, ids@0x18 / 0x307 ids@0x06,0x0e)으로 정정. **`npm run test:server` 1069/1069 그린**(플래그 off 기본이라 회귀 없음).
- **상태**: FE-BE의 **BE측 코드 작성 완료**. 명령 factory id는 현재 positive-control(0x2b/0x41) — 행 렌더 확인용. 남은 것: ① **라이브 검증**(플래그 on→월드진입→런타임 명령테이블 `[DAT_007ccffc]+0x3416d8` rowCount>0 실측, FUN_004c4a10 promote 확인) ② **move factory id 매핑**(FUN_005312b0이 +0x20에서 0x19/3f/40로 읽는 id가 어느 factory id인지 라이브 매핑) → move 명령으로 교체 → 선택→상태2→0x0b01.
- **다음**: 라이브 검증 — `[DAT_007ccffc]+0x3416d8`(rowCount+type array) 읽는 작은 Frida probe + 플래그 on 월드진입. rowCount>0면 FE-BE 연결 절반 성공(행 렌더), 이후 move id 매핑.
- 증거 등급: maker(코드+1069 그린) / 라이브 검증 대기.

## 2026-06-21 루프 사이클(라이브) — ★★명령 데이터가 런타임 명령테이블에 사상 처음 도달 (v9~v14 빈테이블 블로커 데이터층 돌파)

maker 수정(프리로드→canonical LE) 후 라이브 검증. `LOGH_COMMAND_TABLE_PRELOAD_PROBE=1` + 신 EXE 월드진입(0x0305×2·0x0307×1 전송). 신규 probe `tools/logh7_command_table_watch.py`(py_compile OK)로 `[DAT_007ccffc]+0x3416d8` 실측. 증거 `.omo/ulw-loop/evidence/g006-cmdtable-20260621.jsonl`. 세션 stop shaVerified=True·SHA canonical.

- **★결과**: `guard_3416d8=1`(FUN_004c4a10 promote 완료) + dump에 **count=2 + ids 0x2b/0x41**가 `tbl+0x40`(count byte@+0x40, id0 u16 LE@+0x43, id1@+0x45)에 **존재**. → **LE 와이어 수정으로 명령 데이터가 런타임 테이블에 도달**(이전엔 항상 빈). v9~v14 "rowCount=0/빈 명령테이블" 블로커 **데이터층 돌파**.
- **남은 정렬 이슈**: 내 probe가 읽은 `tbl+0x14`(count)/`+0x16`(ids)/`+0x20`(type)는 0 — 실제 데이터는 `tbl+0x40` 영역. FUN_004c4a10 변환이 데이터를 transform-specific 오프셋(+0x40, ids odd-aligned +0x43/+0x45)으로 재배치. **클라 FUN_004f5cb0(card+0x14 count)/FUN_005312b0(+0x20 type)가 읽는 정확한 런타임 오프셋과 정렬돼야 행 렌더/이동 판정**. 현재 card0 base 추정 tbl+0x2c(→+0x14=tbl+0x40)이나 ids +1 shift 등 변환 미세구조 미확정.
- **다음**: (a) FUN_004f5cb0 디컴파일/라이브 훅으로 런타임 테이블 read 정확 오프셋 확정 → 와이어를 그 위치에 데이터가 떨어지게 정렬(또는 변환 역산). (b) 정렬되면 rowCount>0 행 렌더 → move id 0x19로 교체 → FUN_005312b0 상태2 → 0x0b01. 명령 id는 현재 positive-control 0x2b/0x41(행 확인용).
- 증거 등급: **P0-live**(런타임 테이블에 데이터 도달 실측).

## 2026-06-21 루프 사이클(정적+분석) — 정밀 정렬: FUN_004f5cb0는 tbl+0x1e(cat0)를 읽고, 채운 0x305가 거기 안 떨어짐(walker가 이김)

직전 라이브 dump 분석 + FUN_004f5cb0 디컴파일.

- **클라 read 확정**: `FUN_004f5cb0`(명령행 빌더): `puVar7 = FUN_004c8700() + 0x0a + category*0x46`; rowCount = `(byte)puVar7[10]` = **byte @ `tbl + 0x0a + cat*0x46 + 0x14`**. cat0 = **tbl+0x1e**. (FUN_005312b0의 type read +0x20도 같은 0x46-grid.)
- **0x305는 straight copy**: FUN_004c4a10가 staging `+0x3e0c8c`(=0x305 body bulk-copy)를 런타임 `+0x3416e0`(=tbl+0x08)로 직카피. 따라서 body[X]→tbl+0x08+X(관측상 1바이트 shift로 body[0]→tbl+0x09). canonical 빌더의 command_count@body0x16 → tbl+0x1e ← FUN_004f5cb0. **이론상 정렬됨.**
- **그런데 라이브 dump**: tbl+0x09=01(=빈 walker `buildWorldDataResponseInner(0x0305)`가 박는 status byte body[0]=1) + tbl+0x0a..0x3f 전부 0 → **채운 0x305 카드 레코드가 staging/런타임에 없음**. 즉 빈 walker(okInner)가 채운 extra를 이기고 남음(전송 순서는 okInner먼저·extra나중이라 채운 게 이겨야 하는데 아님 = 미해결). count=2/ids는 tbl+0x40(0x307 reshape)에만 있고 FUN_004f5cb0는 거길 안 읽음.
- **남은 미해결**: 왜 채운 0x305 extra가 staging `+0x3e0c8c`를 차지 못하나(또 다른 빈 0x305가 뒤에 오나 / promotion 타이밍 / extra 미반영). **다음**: (a) 채운 0x305에 distinctive card id(예 0xABCD) 마커 넣고 라이브로 staging/런타임 도달 추적, 또는 (b) 채운 카드를 **okInner 자체**로 보내(빈 walker 제거) tbl+0x1e=2 되는지 검증(플래그게이트). 되면 행 렌더 → move id 0x19.
- 증거 등급: P0-static(FUN_004f5cb0 read formula) + 라이브 dump 분석.

## 2026-06-21 루프 사이클(maker+라이브) — 채운 0x305를 okInner로 변경 시도 → tbl+0x1e 여전히 0(정렬 미해결, 깊은 변환문제 확인)

가설(빈 walker가 채운 0x305를 이김) 검증 위해 채운 카드를 walker okInner로 직접 전송하게 수정(`login-session.mjs` REQ_INFO_SESSION_CODE 핸들러, 플래그게이트). 테스트도 갱신. **1069 그린**.

- **라이브 결과(flag on, 신규 probe)**: `guard=1`(promote) 이지만 **`tbl+0x1e`(FUN_004f5cb0 cat0 count) 여전히 0**. tbl+0x08 영역 = `00 01 00 ...`(body[0]=count=1이 tbl+0x09에 1바이트 shift로만 남음, 카드 레코드 command_count@body0x16=2는 런타임 부재). 게다가 **이전에 tbl+0x40에 있던 0x307 데이터가 사라짐**(okInner 변경이 walk 시퀀스/promote 타이밍을 바꾼 듯).
- **함의(중요)**: 0x305 staging→runtime이 **단순 straight-copy가 아님**(body[0]만 보존). FUN_004c4a10 변환 또는 promote **타이밍**(FUN_004c2a30이 staging 채워지기 전 실행?)이 개입. 즉 "와이어 포맷"만으론 부족 — 변환·타이밍을 라이브 트레이스로 규명해야 명령행이 tbl+0x1e에 뜸.
- **남은(정밀 트레이스 필요)**: ① FUN_004ba2b0 case0x305 수신 시 `param_3` 바이트(클라가 실제 받은 0x305 body) ② FUN_004c4a10 진입 시 `+0x3e0c8c` 내용 + `+0x3416e0` 결과 + 호출 시점(0x305/0x307 수신 대비) ③ FUN_004c2a30(promote 트리거) 시퀀스. → 어느 단계에서 카드 데이터가 유실/미반영되는지 특정.
- **현 코드 상태**: canonical 빌더 fix는 유지(sound, 1069 그린). okInner 변경은 플래그게이트라 기본 무영향이나 0x307 데이터 유실 → 필요 시 card-extra 형태로 되돌리면 0x307 데이터는 복원됨(둘 다 tbl+0x1e 미달성).
- **다음**: FUN_004ba2b0/004c4a10/004c2a30 트레이스 probe(수신 body·copy 전후·타이밍) → staging→runtime 매핑+타이밍 확정.
- 증거 등급: P0-live(tbl+0x1e=0 실측, 변환 비-straight-copy 확인).

## 2026-06-21 루프 사이클(정적) — ★★0x0b01 진짜 블로커 = 원샷 promote **타이밍 레이스**(v9~v14 정체 규명)

`FUN_004c4a10`/`FUN_004c2a30` 정적 재분석.

- **`FUN_004c4a10` = 원샷 promote**: 본문 시작에서 staging `+0x3e0c8c`(0x305)·`+0x3e5e98`(0x307)을 스택으로 복사하지만, **`if (*(char*)(+0x3416d8) != 0) return;`** — guard 세워져 있으면 스택→런타임 복사 전에 early-return. 즉 런타임 테이블은 **딱 한 번**(guard=0일 때) 채워진다.
- **`FUN_004c2a30`(월드-init, caller `FUN_004b76e0`)**: ① 월드매니저 `+8`부터 `0xd54ab` dword 제로화(범위 +8..+0x355534 → guard `+0x3416d8`·런타임 `+0x3416e0` **포함**, 단 staging `+0x3e0c8c`(>+0x355534)는 **보존**) → ② `FUN_004c4a10` promote 호출(guard=0이라 복사). 즉 promote는 **월드-init 시점의 staging 스냅샷**.
- **∴ 진짜 블로커 = 타이밍 레이스(v9~v14 "FUN_004c4a10이 빈 staging을 guard=1로 확정"의 정체)**: 명령 데이터(0x305/0x307)가 **그 promote 순간 staging에 있어야** 런타임에 들어간다. 와이어 포맷(canonical LE)은 맞췄으나, 데이터가 promote 전에 staging되는지가 관건. 내 okInner 변경이 walk 순서를 흔들어 0x307까지 promote 전에서 후로 밀린 것(tbl+0x40 사라짐)이 이 레이스의 증거.
- **다음(타이밍 트레이스)**: FUN_004c2a30(또는 FUN_004c4a10) enter + FUN_004ba2b0 case0x305/0x307 enter를 같이 훅 → promote가 0x305/0x307 수신 **전인지 후인지** 실측. 후면 와이어만 정렬, 전이면 (a) 데이터를 더 일찍/반복 송신해 staging 선점, (b) 자연 게임플로우의 promote 트리거 시점 RE, (c) 최후수단 클라 패치로 guard 리셋/재promote(프로젝트 norm상 회피).
- **현 코드**: canonical 빌더 fix 유지(1069 그린). okInner 변경은 플래그게이트(기본 무영향).
- 증거 등급: P0-static(원샷 promote + 월드-init 제로화 범위 디컴파일 확정).

## 2026-06-21 루프 사이클(라이브) — ★결정: 0x0b01 명령테이블 = 원샷 promote가 walk보다 먼저 → 서버-only 클린 해결 난망(전략 결정 필요)

신규 probe `tools/logh7_promote_timing_watch.py`(FUN_004c4a10 promote 진입 시 staging 읽기)로 타이밍 레이스 실측. 신 EXE+flag on, +9s에 early-attach. 증거 `.omo/ulw-loop/evidence/g006-promote-20260621.jsonl`. 세션 stop shaVerified=True.

- **결과**: attach(+9s) 시점 이미 `guard_3416d8=1` = **promote가 +9s 전(스플래시 중)에 1회 실행됨**. 40s 윈도우(+9~+49s, 월드로드·0x0305/0x0307 walk 포함)에 **promote-enter 0회**(원샷, 재실행 없음). 0x0305/0x0307은 walk(~30s+)에 송신 → **promote(<9s)가 walk보다 먼저 = 빈 staging 캡처(레이스 패배, 설계상)**.
- **추가 정황**: 월드로드 후 staging `+0x3e0c8c` = `00 01 00…`(byte1=01만), `staging305_cmdcount16=0`, `staging307_count=256(0x100)` — populated 0x305 카드가 staging에 **거의 안 닿음**(전달/오프셋 이슈 별도). 즉 (1)promote 타이밍 + (2)staging 전달 + (3)변환 오프셋 = 다층.
- **∴ 전략 결정 필요(사용자)**: 서버-only(walk 중 송신)로는 원샷 promote를 못 이김. 옵션 — **(A) 클라 바이트패치**: FUN_004c4a10 원샷 guard 제거(매 호출 재promote) 또는 promote를 walk 후로 재트리거(프로젝트의 확립된 patch 기법 — menufix/cave류; 단 게임로직 패치라 더 침습적). **(B) 자연 플로우 RE**: 실게임이 명령데이터를 promote 전에 staging하는 정확한 메시지/시퀀스 발굴(자율 가능하나 깊고 불확실). **(C) 0x0b01을 문서화된 깊은 블로커로 두고 다른 기능 우선**(단 다수는 설계결정 필요).
- **현 코드**: canonical 빌더 fix 유지(1069 그린). okInner 변경 플래그게이트(기본 무영향). 프리로드는 옵션 (A) 채택 시 의미 생김.
- **다음(자율 가능분)**: FUN_004ba2b0 case0x305 훅으로 populated 0x305가 왜 staging에 안 닿는지(전달/오프셋) 규명 = (B)의 일부. 그래도 (A) 결정이 클린 해결엔 핵심.
- 증거 등급: P0-live(promote 선행 실측).

## 2026-06-21 루프 사이클(정적) — 0x0b01 결정 대기 중 grounded 갭으로 피벗 판단: 전투 능력치(#2) 구현 가능

0x0b01 staging-debug는 promote 타이밍(A) 선행이라 premature → 결정 대기 중 비-블로커 grounded 갭 탐색.

- **커버리지 #2(攻擊/防御 전투 미반영) grounding 확인**: 매뉴얼 `docs/logh7-manual-canon.md:122-123`(p15)이 **방향 명시** — 攻擊→함대 공격력, 防御→함대 방어, 指揮→예하함 반응/지휘원 재생(p48), 機動→조함/반전속도(p53). **정확 배율은 미명시=서버 설계**. `src/server/logh7-combat-engine.mjs`는 지휘관 능력치를 피해 계산에 **미참조**(computeDamage가 함급 스탯만; 훅 지점 존재). → **방향=매뉴얼 grounded, 배율=라벨된 서버설계**로 구현 가능(추측 데이터 승격 아님; 프로젝트 "밸런스=서버권위" 부합).
- **상태**: 남은 고임팩트 둘 다 결정 요소 — 0x0b01=(A)클라패치 결정 대기, 전투능력치=배율 설계. 0x0b01 대기 중 #2를 자율 진행(보수적·라벨·기존 골든테스트 보존)이 productive.
- **다음**: #2 maker — combat-engine computeDamage에 attacker 攻擊 / defender 防御 modifier 추가(보수적 공식, 라벨 "server-design balance", 기본값 중립으로 기존 combat 골든테스트 보존 + 능력치 반영 신규 테스트). 1069 그린 유지. ("A 가도 돼" 시 0x0b01 promote-guard 클라패치로 전환.)
- 증거 등급: P1(매뉴얼 방향 grounded) / 배율=서버설계.

---

## 사이클 (2026-06-21) — 전술맵(in-battle) 진입 RE+라이브 + 지연-푸시 스캐폴드

**질문**: 사용자 "전술맵도 들어갈 수 있나?" + "deep-RE도 하고 할대로 다 해".

**RE 확정**: 전술맵 진입 = `0x0411 CommandChangeMode`(FUN_004be8c0) → command-engine → `openBattleField`(logh7-battle-engine.mjs) 11단계 S→C: 0x349 위치 → 0x33b/0x341/0x343 전술상태 → **0x42f NotifyChangeMode(modeKind=0)** → 0x0f1f NotifyTactics. 0x42f는 Notify라 **서버 푸시로 클라 입력 없이 모드 전환 가능**(0x0b01 입력블로커 우회).

**구현(off-by-default, test:server 1071 그린)**:
- login-session: `LOGH_BATTLE_ENTRY_PROBE` → grid-enter(0x0f06 rich postload) 응답에 `action.deferredBattleInners`(+`deferredBattleDelayMs`, 기본 8000) 부착. ★즉시 inline 푸시는 렌더를 깸 → 반드시 deferred.
- auth-server: `scheduleDeferredBattle(action, subheaderLen)` = setTimeout 후 `sendExtraInners`로 같은 소켓 푸시(lobby/ss-response 두 분기). timer.unref.
- 테스트 2개(probe on=deferred 시퀀스 [0x349,0x33b,0x341,0x343,0x42f,0x0f1f] + extraInners는 grid-enter 레코드만 / probe off=무영향).

**라이브 결과(SHA 복원 확인)**:
- 컨트롤(probe OFF): 전략 갤럭시 맵 정상 렌더 ✓ (.omo/ui-explorer/ctrl-noprobe/shots/022-ctrl-world.png)
- probe inline: 전략 렌더 stall(로비 stuck), 클라 생존.
- probe deferred(8s): 클라 크래시.

**근본**: 시퀀스는 정확/전달되나 **placeholder 전술데이터 불완전**(단일 유닛@임의좌표·빈 shield/beam)이라 클라 전술 씬 빌드 stall/crash.

**다음(deep-RE)**: NPC_SEED는 `worldState.upsertShip`로 함선 넣고 클래스 스탯이 shield/beam을 채움(완전 데이터, AI-vs-AI 0x0426 라이브 입증). → **수정 = auth-server에서 `worldState.getShip(unitId)` 완전 스탯으로 openBattleField 구성**(전제: authoritative + 플레이어 함선이 world-state에 존재). 그 뒤 전략맵 렌더 후 지연 푸시로 라이브 재검증. 메모리 [[logh7-tactical-map-entry-2026-06-21]].

---

## 사이클 (2026-06-21) — 갭 #2: 사령관 統率 → 전투 변조 (flag-gated, maker→verifier PASS)

**대상**: 로드맵 갭 #2(능력치→전투). 자율 틱(사용자 away) 중 server-only·테스트게이트·가역 작업으로 선택.

**구현(off-by-default, test:server 1072 그린)**:
- `logh7-combat-engine.mjs::computeDamage(a,t,kind,opts={})` 4번째 opts 추가. attackerCommand>0 → raw*=(1+L/400); targetCommand → def+=L/4. opts 미주입=무효(기존 동작 100% 보존).
- `logh7-command-engine.mjs`: `LOGH_COMBAT_LEADERSHIP=1` 게이트 `commandModifierOpts(state,aId,tId)` → 사격(0x405/0x406)·교전(0x0407) 두 호출부에 양측 기함 사령관 leadership 주입.
- `logh7-npc-ai.mjs`: 동일 헬퍼 복제로 NPC 사격(line 114)도 대칭 적용(플레이어/NPC 비대칭 제거).
- 테스트 1개(opts 미주입 불변·공격 가산·방어 경감).

**verifier(logh7-loop-verifier) PASS + caveat 2 반영**:
- (1) 캐논 정직성: 매뉴얼(logh7-manual-canon.md:116, p14-15)상 統率 효과는 **艦隊最大士気·降伏勧告成功率**이지 직접 피해 아님(그 캐논 효과는 lowerMorale·resolveBattleSurrenders에 기구현). → 주석을 "P3 설계 확장, 캐논 메커니즘 아님"으로 정정.
- (2) NPC 비대칭: npc-ai computeDamage 미배선 지적 → 대칭 배선으로 해결.
- 검증 증거: 실 processCommand 0x0406 구동 — off/on-leadership0=피해 동일, on+공격統率100=피해↑, on+방어統率100=피해↓.
- 부기: COMMAND_FIGHT_CODE=0x0407(0x40f 아님, 0x40f=지상 SortieTroops).

**남은 로드맵(server-only, 자율 진행 가능)**: #5A 쿠데타 배선(createCoupState DEAD), #4 승패 4티어(evaluateEnding 기구현 — 확장 검토), #8 요새, #7 임명, #3 생산. #2처럼 flag-gated·라벨·maker→verifier로 1개씩.

---

## 사이클 (2026-06-21) — G006 C002 SelectGrid snapshot 재확인: 자연 세션의 직접 gate는 명령테이블 count=0

**대상**: 사용자 목표 "`tools/logh7_selectgrid_snapshot.py`와 최신 handoff 증거로 SelectGrid 앞 selection/category gate 확정".

**라이브 스냅샷**: 기존 살아 있던 실클라 세션 `.omo/ui-explorer/session-g006-c002-hit-test-gate-20260621j/`의 PID 22032에
`tools/logh7_selectgrid_snapshot.py --pid 22032 --label g006-c002-live-current-20260621`로 read-only attach.
증거: `.omo/ulw-loop/evidence/g006-c002-selectgrid-snapshot-current-20260621.jsonl`.

**관측값**:
- 전략/링크 기본 게이트는 열림: `fieldMode126711=2`, `worldActive2a58f8=65537`, `charCount36a5dc=1`, `unitCount41a364=1`.
- current cell은 맞음: `root.currentRaw11178=2588` (`x=88,y=25`).
- 하지만 이 자연 세션은 `LOGH_WORLD_IMPORT_BASES=1`이 아니므로 `root.listCount1117c=0`.
- selection payload 자체는 있음: `selection.payloadCount270=1`, `listCount188=1`.
- 선택/범주는 닫힘: `listSelected189=-1`, `selectedIndexGlobal=-1`, `categoryGlobal=-1`, command `selectedD5=-1`, `categoryD6=-1`.
- command rows는 객체만 있고 비활성: `rowCountD4=24`, row rects exist, but row `gate05=0`.
- 런타임 명령테이블 직접 gate: `table305.guard00=1` but `table305.commandCount14=0`, `firstFactory16=0`.
  반면 `table307.commandCount14=3`은 다른/static 쪽 데이터이고 `FUN_004f5cb0`/`FUN_005312b0`의 선택 row source가 아니다.

**RE 재확인**:
- `FUN_004f5cb0`는 `FUN_004c8700()+10+category*0x46`에서 category record를 잡고, `record+0x14`의 count를 `param_1[0xd4]` row count로 쓴다.
- `FUN_005312b0`는 `FUN_004c8700()+category*0x46+0x20+selectedIndex*2`의 u16 type이 `0x19/0x3f/0x40`일 때만 move state로 들어간다.
- `FUN_004c4a10`은 staging을 변환한 뒤 `client+0x3416d8` guard가 이미 1이면 runtime copy 전에 early-return한다.

**판정**: 이 세션의 SelectGrid 앞 blocker는 좌표/projection이 아니라 `FUN_004c8700()` 런타임 명령테이블의 category record count가 0인 것이다. 최신 handoff의 `LOGH_COMMAND_TABLE_PRELOAD_PROBE=1` 라이브는 데이터가 `tbl+0x40`까지 도달함을 보였지만, `FUN_004f5cb0`가 읽는 `record+0x14` 정렬과 원샷 promote 타이밍을 아직 만족하지 못했다. 따라서 첫 실제 `0x0b01/0x0b07` 루프의 남은 조건은 명령테이블을 promote 전에, 그리고 `FUN_004f5cb0`/`FUN_005312b0`가 읽는 record layout에 맞춰 채우는 것이다.

---

## 사이클 (2026-06-23) — ⑤⑦ 서버 권위적 함대이동(0x0b07): 와이어 byte-correct + 전달·소비 확정, 적용은 grid-active 게이트 의존

**대상**: C002(클라 명령-UI)가 ⑤⑤⑦를 게이팅하므로, 클라 입력 없이 **서버가 직접 이동을 푸시**하는 권위적 경로로 ⑤(맵 전환)·⑦(커맨드)를 닫을 수 있는지 증거 기반 검증.

**구현(off-by-default, test:server 1137 그린)**: `src/server/logh7-login-session.mjs`
- `buildNotifyMovedGridInner` import 추가(buildNotifyEnterGridEndInner 뒤).
- env 헬퍼: `LOGH_FLEET_MOVE_PROBE=1`(게이트), `LOGH_FLEET_MOVE_DELAY_MS`(기본 10000), `LOGH_FLEET_MOVE_DELTA`(기본 1).
- gridEnterAction(배틀 프로브 블록 뒤): 게이트 ON이면 `deferredBattleInners=[buildNotifyMovedGridInner({units:[{unitId, cell: fleetCellId()+delta}]})]` + `deferredBattleDelayMs`. 게이트 OFF=불변(회귀 0).

**RE 확정(④ 소비 레코드·메소드 추적)**:
- 0x0b07 핸들러 = 디스패처 `FUN_004ba2b0` case 0xb07("NotifyMovedGrid_OK"). 수신 본문을 **0x91 dword=580B** 고정 복사 → 정적버퍼 `&DAT_00437714+local_18` → `FUN_004bee20`.
- `FUN_004bee20`: `if (*(char*)(param_1+0x2a58f8)!=0) { ...; FUN_00517cd0(0xb07,param_2); }` — **적용은 grid-active 플래그 `+0x2a58f8`에 게이트됨**. (이 플래그는 g006 스냅샷의 `worldActive2a58f8=65537`과 동일 글로벌.)
- 0x0b07 record-size 룩업: `FUN_004b8b00` 테이블(핸들러 아님).

**★와이어 크기 정확 일치(③ 서버 송신 생성 byte-correct)**: 서버 `NOTIFY_MOVED_GRID_BYTES=0x244=580` == 클라 복사 `0x91 dword=580`. per-unit {unitId@(0x14+i*8), cell@+4}, count@0x12.

**라이브(live21-owncell, autologin emp1, FLEET_MOVE_PROBE=1 DELAY=16000 DELTA=5)**:
- trace: **0x0f02·0x0313·0x0323·0x0325·0x0b09·0x0b0a 정상 + 0x0b07 1회 푸시 + "deferred" 이벤트 1회**. 클라 생존(크래시 0, ~207MB).
- own-cell watch(`tools/logh7_owncell_watch.py`, +0x11178 read-only): **2588 불변**(changed=false).
- 해석: +0x11178은 **카메라/own-fleet 포커스 셀**(grid-enter가 set)이지 relayed move-notify가 갱신하는 필드가 아님 → 불변은 정합. 0x0b07은 유닛테이블 엔트리를 갱신하나 `+0x2a58f8` 게이트와 fleet-render 가시성([[logh7-fleet-render-rootcause-2026-06-20]])에 시각 반영이 의존.
- `stop` shaVerified:true(canonical c1523a5e 복원).

**판정(정직 framing)**: 서버 권위적 0x0b07 이동 = **레코드 byte-correct(580B 일치) + 서버→클라 전달·소비(핸들러 로그·deferred·생존) 라이브 확정**. 단 "시각적 마커 이동 달성"은 **미확정** — 적용 게이트 `+0x2a58f8` 충족 여부 + fleet-render 가시성이 남은 조건. 과대주장 금지: 이동 *명령 데이터 체인*은 닫혔고, *시각 반영*은 C002와 동일한 전략-서브시스템 init/렌더 잔여에 묶여 있다.

**도구**: `tools/logh7_owncell_watch.py`(신규). 검증=`logh7-loop-verifier` 별도 패스(3주장 PASS/FAIL).

**다음**: ① `+0x2a58f8` grid-active 게이트가 autologin 월드서 set되는 조건 RE(g006 스냅샷=65537이었으므로 자연 세션선 ON일 수 있음 — live21에서 0x0b07 적용 여부를 유닛테이블 엔트리 셀 직접 probe로 재확인). ② fleet-render 가시성([[logh7-fleet-render-rootcause-2026-06-20]] own-fleet case0 타이밍)과 합쳐 마커 시각 이동 라이브. ③ C002 6-레이어(전략-명령 서브시스템) — 단발 forcing 금지, 서브시스템 구성.

---

## 사이클 (2026-06-23) — ②③⑥ 성계 행성/천체/소속/장소 데이터 미투영 진단 + 0x0b07 검증자 정정

**검증자 정정(0x0b07, maker≠checker)**: 앞 사이클 "소비 확정"은 과대. 판정 — (1)와이어 크기 일치 PASS(서버 580B=클라 0x91dword, trace respLen 586 실측 4단계 정합), (2)소비 경로 디스패치 PASS(정적 RE), (3)적용 게이트 PASS+**추가발견**: 단일 `+0x2a58f8` 아니라 **다단계**(grid-active +0x2a58f8 AND 활성씬 DAT_02215e2c scene-type1/2/3 AND `FUN_00517cd0`→`FUN_00501e30(0x16,...)` scene event ring enqueue 소비). own-cell(+0x11178)은 8함수에서 **읽기전용**(%100 행/열). **클라측 소비/적용은 라이브 미측정**(trace는 서버 송신만; own-cell 불변은 별도 probe 산물). 완전확정엔 canonical SHA + 4점 메모리 probe(버퍼도착/게이트값/0x16 enqueue/own-cell A·B) 필요.

**데이터 미투영 진단(사용자 질문 "성계 행성/천체/소속/장소가 안 들어간다 어떻게 해결?")**:
- **빌더·오프셋은 전부 존재(byte-correct)**, 빠진 건 시드 데이터. `staticBaseRecords()`(logh7-login-session.mjs:1080)는 성계당 `id/grid/name/class`만 채움.
- **천체**: 0x031d(`buildStaticInformationBaseInner`, 20,996B) 슬롯(diameter/revolutionRadius/Cycle/Direction/InitAngle) 보유하나 **전부 0** — galaxy.json에 astronomy **0/80** = 소스 자체 없음(매뉴얼p101/IV-EX/클라기본 복구 필요).
- **행성**: galaxy.json 281개(name+orbit)+planet-economy.json(인구/식량/산업) **있으나** 성계당 이름 1개만 투영. 0x0337 경제는 `LOGH_BASE_ECONOMY=1`일 때 name 조인 경로 존재.
- **소속**: galaxy.json `faction` **80/80**(제국39/동맹40/중립1) 보유하나 owner field04는 `class_` 파생(faction 미사용) — **투영만 하면 즉시 해결**.
- **장소(rooms)**: contentPack.rooms(galaxy.json data.rooms) → galaxy.json에 rooms 없어 빈 배열. 직무카드⑥와 연결, 데이터모델 정의 선행.
- 제약: 0x031f 배열 max 4(선택 성계 상세, 전80 아님), 0x031d/0x031f는 PULL(0x031c/0x031e).
- **사용자 확인 "나중엔 리스폰스로 채워야겠지?"=맞음**(서버 권위적: 클라는 리스폰스 실린 것만 렌더). 해결 우선순위: ①소속(무비용, faction→owner) ②행성/경제(데이터 있음) ③천체(소스 복구 선행) ④장소(소스 정의 선행).

**렌더링 현황 재확인**: 그리드/카메라(strat-camera-focus DEFAULT_STACK)✅ + 리마스터(HUD20+dgVoodoo)✅ + own-fleet 마커 스프라이트(case0 1회성, 배치패치 byte-verified·cave 0x5d5290 충돌로 미스택, **별도 cave 분리** 선결)❌.

**다음(사용자 선택 대기)**: ①소속 faction→0x031f owner 투영(flag-gated, 즉시) / ③④ 천체·장소 소스 복구 / 렌더 own-fleet 스프라이트 별도 cave 분리.

---

## 사이클 (2026-06-23) — 소속(faction) 표시 정밀 RE + RE 전체 진척(웨이브3 가동)

**사용자 질문 "전부 복구?/RE 전체 된거지?"**: RE 전체 **미완 정직고지** — deep-RE 945/8896=10.6%, **게임본체 G7MTClient 277/6089=4.5%**, setup 0%; lightdoc는 18,485/18,485=100%(누락0). "바이트 하나까지" 수준은 95% 잔여. → **deep-RE 웨이브3 가동**(Workflow logh7-func-re-wave, bin=G7MTClient startBatch=128 count=16, 백그라운드). 전부 복구=목표 확정, 트랙별 난이도 상이.

**소속(faction) 표시 정밀 RE(클린 투영 불가 확정)**:
- 맵 마커 색축 = 0x0313 objectTable byte2 variant. 서버 `strategicMarkerVariantForSystem`은 **spectralClass 우선**, faction(empire=1/alliance=2/neutral=0)은 폴백. **galaxy.json 80/80 전부 spectralClass 보유** → byte2=항성색, **faction 폴백 미발동** → 맵에 소속 미표시.
- 상세 패널 owner = 0x031f elem+0x04(local_34d) → 월드엔티티 iVar9+0xa(FUN_004c32a0 world-import 라인 167). 현 서버 `informationBaseSeed`는 field04=`class_`(faction 아님).
- **결론: 소속은 현재 맵(항성색 우선)·패널(class_) 어디에도 미표시.** 클린 투영의 선행조건 = (a) byte2가 spectral·faction 겸용인지 or 별도 faction-색 필드인지, (b) iVar9+0xa 소비처(faction 색 해석?) = **미확정 deep-RE**(웨이브가 strategic/render 태그로 커버 가능). 추측 승격 금지 원칙상 소비처 확정 전 투영 보류.
- faction 인코딩은 확정: empire=1/alliance=2/neutral(phezzan)=3(login-session 847-850), NATION_ID empire 0x500/alliance 0x501/neutral 0x502(content-adapter).

**다음**: 웨이브3 결과 수신 → strategic/render 함수에서 faction-색 소비처 확정 → 소속 투영(맵 byte2 분기 or 패널 owner). 데이터(faction 80/80)는 보유, 소비처만 미확정.

---

## 사이클 (2026-06-23) — MP 서버 오픈 로드맵 종합 작성 + 웨이브3 + coverage 동기화

**사용자 "멀티플레이 서버 열 때까지 모든 로드맵·현황 업데이트"** → **`docs/logh7-mp-roadmap-2026-06-23.md`** 산출(Workflow `logh7-mp-roadmap`: 8도메인 병렬조사 logh7-loop-explorer → 합성 → 적대검증 logh7-loop-verifier → 최종, 11 에이전트). MEMORY.md([[logh7-mp-roadmap-2026-06-23]])·핸드오프 배너·이 로그 갱신.

**핵심 산출**:
- **C002 critical-path 이중 판정**: 데모/관전 MP=C002 불필요(서버푸시 0x0b07+world-relay 우회) / 유저 기원 인터랙티브 MP=C002 필수(유저 0x0b01 originate 필요).
- **마일스톤** M0(현재 test1137·autologin 월드진입)→M1(strict인증+LAN+0x0b07 클라적용 라이브측정 4점probe+관전데모)→M2(진영2:2 좌표재교정+reconcile 라이브+소속 faction 투영[소비처 RE선결]+cross-client 유저이동[C002 or relay-originate 신설]+4클라 E2E)→M-final(단일커맨드 패키징+git init).
- **적대검증 정정 4건 반영**: ①0x0b07 클라소비 라이브 미측정(M0서 강등, M1 선결로 이관) ②C002 "함수RE 100%·순수구현만"=과대, 근본 미종결(.debug-journal:4540 frontier=command-table count=0) ③FLEET_MOVE_PROBE=self-push지 peer-relay 아님 ④faction 80/80 보유하나 맵(spectral우선)·패널(class_) 미표시.

**부수 작업**:
- deep-RE **웨이브3 완료**(Workflow): G7MTClient 배치128-143, +17 함수(277→294), 0 하드페일·13 partial. 내용=input_from_stream 디시리얼라이저. 메이커 과대 1건(0x0f07 P0 오승격) 검증자 적발. corrections=out/_wave-0003-verifier-corrections.json.
- **coverage 행렬 동기화**: `tools.logh7_func_coverage_report` 재실행 → G7MTClient 294/6089(4.8%)·합계 962/8896(10.8%) 반영(이전 stale 277 정정).

**다음(로드맵 Critical Path 순)**: 1.strict인증 운영고정 4클라 검증 → 2.LAN바인드 → 3.**0x0b07 클라적용 라이브측정**(4점 probe) → 4.진영좌표 재교정+소속 투영(소비처 RE) → 5.4클라 2:2 E2E(데모MP 게이트). 유저기원MP(6)=C002 or relay-originate 신설.

---

## 사이클 (2026-06-23) — ★0x0b07 클라 적용 라이브 측정 성공 + 페잔 위치 한 칸 위로(사용자)

**①0x0b07 클라 적용 라이브 측정(검증자 "미측정" 해소)**: 4점 probe `tools/logh7_0b07_apply_probe.py`(읽기전용)로 live24 측정 — record 도착✓(FUN_004bee20 1회) + grid-active 게이트 **+0x2a58f8=1(통과)** + dispatch **FUN_00517cd0(0xb07)=1** + scene-event **FUN_00501e30(0x16)=1**. = **서버 0x0b07이 클라에서 소비·적용됨 라이브 확정**(다단계 게이트 전부 통과). own-cell 불변=렌더 read-only 정합. → 데모/관전 MP(로드맵 M1) viable 입증.
- **★측정 함정**: D3D8 클라는 포그라운드 상실 시 게임루프 정지 → bash probe로 포커스 넘어가면 디스패치 안 됨(live22/23 enqueue 총0 실패). 해법=백그라운드 PowerShell SetForegroundWindow 유지 + frida probe 동시(frida 포그라운드 불요)=live24 성공. grid-enter 서버측 +4s라 FLEET_MOVE_DELAY는 probe arm 이후로 충분히(55s) 둬야 측정창 포함.
- 라이브 세션 live22/23/24 전부 stop·SHA복원(c1523a5e shaVerified:true).

**②페잔(フェザーン) 위치 한 칸 위로(사용자 "페잔이 한칸 내려갔다, 그것만 고쳐")**: 사용자 결정="페잔만 위로(회랑 불변 완화)".
- **제약**: 페잔(col 51)은 중앙갭(48-57) 안 → 회랑행에만 놓일 수 있음(테스트 invariant: 갭은 회랑행 12,38에서만 통항·모든 마커는 통항셀 위). narrow 단독 이동 불가 → 사용자에 3옵션 질의 → "페잔만+불변완화" 선택.
- **적용**: galaxy.json 페잔 canonRow 38→37·canonGameRow 39→38(**cx/cy 불변→인접그래프 영향0**). galaxy-passable-cells.json (51,37) 예외 개방·_count 3626→3627·_method note. 회랑 row38·アイゼンヘルツ(57,38) 불변(페잔은 회랑 위 1칸 stub, (51,38)로 연결).
- **테스트 갱신**: strategic-grid-provenance(페잔 51,38→51,37; 디코드된 0x0315 와이어로 확인), galaxy-star-extraction one-cell-high에 (51,37) 페잔 예외. **test:server 1137 그린**(회귀0). 인접/회랑/플라즈마 전부 그린(cx/cy·corridorRows 불변).
- 증거: provenance 테스트가 실제 0x0315 와이어 그리드 디코드→페잔 cell index=37*100+51 확인(서버가 한 칸 위 emit). 라이브 시각은 1칸(~10px)이라 와이어 디코드가 더 정밀한 증거.

**다음(로드맵 Critical Path)**: M1 잔여(strict 인증 운영고정→4클라 검증·LAN 바인드) / 소속 faction 투영(소비처 RE 선결) / fleet-render case0 별도 cave(시각 마커 이동).

---

## 사이클 (2026-06-23) — 소속(faction) 소비처 deep-RE: 골격 P0 확정, 그러나 투영 NO-GO(needs-more-RE)

**Workflow `logh7-faction-consumer-re`(3각도 RE→합성→적대검증). 검증 판정 projectionSafe=needs-more-RE — 투영 착수 불가.** 합성이 과대주장 4건(문서 자기모순·추측승격·풀혼동·byte-correct 미확정)을 안아 검증자가 FAIL.

**디스어셈 확정 골격(P0, 환각 아님)**:
- 전략맵 **항성 마커 색 = 0x0313 byte2=variant=spectralClass**(소속 아님). faction을 byte2에 넣으면 분광형색 깨짐 → 금지.
- 기지 패널: `switch(*(u8)(elem+0x175))` 0/1/2/3 → group 0x5f 텍스트(디스어셈 0x57abd9~0x57ac00); `elem+0x04`==2/==3 → group 0x4e token 0x2d/0x2e(0x57ae32~0x57ae4a). **읽기 위치는 확정, 의미(=faction?)는 미확정.**
- world-import `FUN_004c32a0`: base elem+0x04/+0x05 → base 엔티티 +0xa/+0xb 복사(확정).
- `FUN_004ef0d0`: fleet 풀(stride 0x9ec) 엔티티 +0xa/+0xb **동등성**으로 친/적색(0x800 vs 0x1000) 가름(절대색 아닌 "내==타깃" 비교).

**투영 NO-GO 사유(검증)**: (a) elem+0x175/group 0x5f index가 'faction(제국/동맹/중립)'이라는 의미는 **런타임 문자열 테이블(ecx=0x2217400) 미확인**(strings.tsv에 진영명 0건). (b) **docs §2.254는 진영=0x0323 char power@+0x04/spot_owner라 RE 결론** — 합성의 0x031f elem+0x175 진영설과 정면 충돌. (c) fleet +0xa의 char-power 출처 미증명(base import를 함대색 근거로 오인). (d) base-record.mjs field04/178/179 전부 PROVISIONAL + docs/코드 오프셋 표기 불일치(+0x174 float vs u8).

**투영 안전화(projectionSafe=yes)에 필요한 다음 RE(검증자 명시 A~E)**:
- **(A) 라이브 read-only 문자열 그룹 덤프**: 문자열매니저(ecx=0x2217400)에서 group 0x5f index 0~3 + group 0x4e token 0x2d/0x2e 문자열 → 어느 인덱스가 제국/동맹/중립(or base-state)인지. **결정적·tractable·다음 착수.**
- (B) 서버 A/B: 0x031f elem+0x175 vs 0x0323 power 차등 세팅 → 패널이 어느 걸 읽는지(단 기지패널 오픈=C002 게이트).
- (C) fleet 엔티티(0x9ec) +0xa writer를 0x0323 char import 경로서 추적.
- (D) writeStreamElement cursor vs FUN_00414c70 packed 파서 콜백 순서 대조(field179→dest +0x175 byte-correct oracle).
- (E) 함대/베이스 친적색 라이브 A/B(정적 인과만, 라이브 색 증거 없음).

**정직 결론**: 데이터(faction 80/80)·인코딩(empire1/alliance2/neutral3)은 보유하나, **소비처 단일 확정 필드 없음** → 추측 투영 금지. 맵 마커는 spectral 전용 확정. 다음=(A) 라이브 문자열 덤프. EXE/세션 미변경(SHA 복원 대상 없음).

---

## 사이클 (2026-06-23) — ★소속 진영명 테이블 = group 0x1 라이브 확정, 합성 가설(group 0x5f) 라이브 반증

**라이브 read-only 문자열 테이블 덤프(`tools/logh7_strgroup_dump.py`, 신규)로 faction 소비처 RE 결정적 진전(live25).**
문자열매니저 = 고정주소 **0x2217400**(디스어셈 `mov ecx,0x2217400; call 0x522010` 확정). FUN_00522010(this,group,idx)=this+0x297c groupTable[group]→start, this+0x2980 strPtrArray[start+idx]. 함수호출 없이 순수 read로 재현.

- **★진영명 테이블 = group 0x1** (flat 183~187 = constmsg.dat id와 1:1): **idx 0=통일·1=중립·2=제국·3=동맹·4=해적**. 인코딩 확정: **1=중립(neutral)/2=제국(empire)/3=동맹(alliance)**(서버 power enum empire=1/alliance=2/neutral=3와 **다름** — 표시 index는 별도 매핑).
- **★합성 가설 라이브 반증**: 검증자가 의심했던 대로, 기지패널 FUN_0057aa90의 `switch(+0x175)→group 0x5f idx 0~3`은 **진영 텍스트가 아니라 `%s` 메시지 템플릿**(예 "%s 커맨드를...신청..."), group 0x4e도 UI 라벨(가입/커맨드/세력/등)이지 진영명 아님. **즉 기지패널 +0x175는 faction 아님** → docs §2.254(진영=0x0323 char power) 유지, 0x031f 투영설 폐기.
- 맵 마커 색 = spectralClass(byte2) 재확인(진영 아님).
- **결론**: 진영명(group 0x1)은 존재·인코딩 확정. 표시 소비처는 group-1 접근자 경유(정확한 화면/필드는 추가 RE — 직접 `522010(1,)` 호출 없음=래퍼/간접). faction은 0x031f base 필드가 아니라 char(0x0323 power) 레벨이 정설. **0x031f faction 투영 강행 안 한 것이 옳았음**(검증자+라이브 둘 다 반증).

**사용자 "소속 안 들어간다" 재정의 필요**: 진영 채널이 (a)캐릭터 진영(0x0323 power, 서버 채움) (b)함대 친/적색(엔티티+0xa 동등성) (c)맵=spectral (d)기지패널=faction 미표시 로 갈림. 어느 화면에서 안 보이는지 확정해야 타깃 픽스 가능.

**다음**: 사용자에 "소속이 어느 화면서 안 보이는지" 확인 → 해당 채널 소비처 RE/투영. 또는 group-1 접근자(522010 wrapper) xref로 진영 표시 화면 특정. EXE/세션 미변경(SHA c1523a5e 복원).

---

## 사이클 (2026-06-23) — 진영 4채널 표시 deep-RE+plan (Workflow, 적대검증 PASS조건부)

**사용자 "전부"(진영 4채널 표시) → Workflow `logh7-faction-display-allchannels`(5각도 RE→합성→적대검증). 검증 PASS(조건부) — 이번엔 group 0x5f 오인 안 함(명시적 배제).**

**채널별 판정**:
- **C 함대 친/적 색 = ★유일 server-data-only, safeToImplementNow**: 소비처 `FUN_004ef0d0`(+0xa/+0xb 동등성 → +0x1000 적/+0x800 친, 거리플래그 0x10000/0x20000와 구분 확정). 함대엔티티(stride 0x9ec, FUN_004c7fc0) +0xa = 0x0323 char power@+0x04(char_table +0x36a8b4 join, FUN_004c32a0). 동등성만 보므로 **remap 불필요**. 현 동작=본인 0x0323만 push(login-session:1317)·NPC_SEED는 함선만(auth-server:1035) → 적 진영 비교대상 부재로 색분리 안 됨. **수정=적 사령관 0x0323 push(power 다른값, char id=함대 commander id 일치), flag-gate, 클라패치0.** ★가드레일(검증): **0x34f buildCardCharacterInner 금지**(store +0x4271a8로 가서 함대색 join +0x36a8b4에 안 닿음) — **개별 buildInformationCharacterRecordInner(0x323)만**.
- **A 인물패널 진영**: 소비처 `FUN_00597b20`=`FUN_00522010(1, DAT_02227f68&0xff)`. 단 DAT_02227f68=패널 **탭필터 인덱스(하드코딩 =2/=3)**, char power 안 읽음 → 패널은 누른 탭(제국/동맹) 표시지 char별 진영 아님. server-data-only 불가, 클라 detour 필요.
- **B 기지/성계 패널 진영**: 소비처 **부재**(group1 호출은 char-create 2곳 FUN_00597b20/FUN_0059df00뿐). FUN_0057aa90은 group0x5f/0x4e=비-faction. server-data-only **불가**, 클라 detour 신규작성.
- **D 전략맵 영토색**: **infeasible(server-only)**. 0x0313 셀=3바이트(byte0 라벨/byte1 type/byte2 spectral), faction 바이트 없음·faction-keyed fill 소비처 없음·오버레이 텍스처 없음. 영토 메커니즘 게임 미구현 추정. (셀 byte2에 faction 주입=분광형 파괴 금지.)
- **E power→group1-index remap**: group1={0통일,1중립,2제국,3동맹,4해적}, power enum(empire1/alliance2/neutral3)≠index → remap(empire→2/alliance→3/neutral→1) 필요하나 **변환 단일함수 인덱스서 미발견(P1)**. A/B 게이팅. FUN_004ba2b0 case 0x323 store 경로 추적 선결.

**검증 적발 overclaim(전부 C 디테일)**: ①0x34f≠0x323 도착테이블(위 가드레일) ②함대 +0xa writer 2경로(char_table join vs world-import unit element +0x04, PROVISIONAL) — **어느 걸 NPC 함대가 타는지 미확정=C 구현 전 선결 RE** ③D loader 셀분해 표현 부정확(결론은 유효).

**다음**: 채널 C writer-경로 fork RE(FUN_004c32a0 함대 +0xa: char_table join vs unit element) → 확정 후 서버 구현(flag-gate)+테스트. 라이브 색분리 실증은 멀티진영 함대 가시화(own_cell+카메라/fleet-render case0) 선결. A/B/D는 client-RE/infeasible로 분류.

---

## 사이클 (2026-06-23) — G001: C002 전략 명령 0x0b01 활성화, 사이클 1 (RE 프리패스 + 실클 베이스라인)

**목표**: M1-1 전략 명령 활성화 — 자연 클릭 또는 동등 흐름으로 `0x0b01` 송신 → 서버 `0x0b07` 응답 → 클라 수신, 선택/이동 화면 변화 실클 스크린샷.

**산출물**:
- 마스터 로드맵: `docs/logh7-remaster-master-roadmap-2026-06-23.md` (8개 Goal 분할: G001~G008)
- Goal 등록: G001 active (`LOGH VII G001: C002 전략 명령 0x0b01/0x0b07 활성화`)
- RE 프리패스 병렬 스웜 10개: C002 메커니즘, Ghidra 5함수(FUN_004f5cb0/005015f0/004f93c0/00581c80/005737d0), 서버 0x0305/0x0307/0x0b01/0x0b07 구현, 실클 도구/플래그/종료 절차, 안전 code-cave, 직무/커맨드 데이터, 테스트 커버리지, wire 레이아웃, 최근 live 증거, latch/rect/activePtr 오프셋.

**핵심 RE 재확인**:
- 0x0b01 단일 게이트 = 마우스 클릭이 함대/명령 위젯 rect hit → `+0xb00` 발화 + 명령메뉴 rowCount>0 (`docs/logh7-c002-mechanism-complete-2026-06-23.md` 2026-06-23 블록).
- 최종 블로커 = **전략 widget이 `FUN_00507f20` latch loop에 등록되지 않아 `+0xb00`가 발화하지 않음**. catGate→unit-list populate→함대선택→명령메뉴 build→row dispatch 전체 중단.
- 서버 0x0b01/0x0b07 구현은 완료(`logh7-command-engine.mjs`). 클라가 본낼 0x0b01만 있으면 ACK + 0x0b07 broadcast.
- 안전 code-cave는 48B `@0x005d5290` 단 1개. `strat-camera-focus`가 DEFAULT_STACK에 포함(칸바라/focus 셀 seed). 복잡한 패치는 cave 용량 부족.

**실클 베이스라인**:
- 세션: `.omo/ui-explorer/g001-c002-20260623/`
- EXE: `G7MTClient.autologin.emp1.exe` + canonical playable SHA `c1523a5e...`
- 플래그: `LOGH_LOBBY_OK_FORMAT=message32`, `LOGH_LOBBY_EARLY_OK=1`, `LOGH_SS_FORMAT=message32`, `LOGH_STRAT_GALAXY=1`, `LOGH_STRAT_GRID_EARLY=1`, `LOGH_STRAT_TERRAIN=1`, `LOGH_WORLD_PLAYER=1`, `LOGH_POSTLOAD_PLAYER_RECORD=1`, `LOGH_FULL_UNIT_LOCATION=1`, `LOGH_GRID_ENTER=1`, `LOGH_PLAYER_FOCUS_CELL=1`.
- trace: `0x7000→0x0020→0x2009→0x0200→0x0313/0x0315→0x0323/0x0325→0x0b09/0x0b0a→0x0356→0x0f02→0x0f06/0x0f07`. **0x0b01 없음**.
- 스크린샷: `shots/024-world.png` — 전략맵 + HUD(초상화·미니맵·한글 패널) 정상 렌더.
- 종료: `stop` → `shaVerified:true`, canonical playable SHA 복원 확인.

**다음(사이클 2)**:
- 0x0305/0x0307 정적 카드/커맨드 카탈로그를 `LOGH_COMMAND_TABLE_PRELOAD_PROBE=1`로 전달 + C002 probe(`+0xb00`, catGate, commandMenu rowCount/selectedD5/categoryD6, selectionList) 동시 캡처.
- `LOGH_POSTLOAD_UNIT_STREAM_WIRE=1` 변형으로 0x0325 파서-stream 정합성 실험.
- 0x0305/0x0307 payload에 move-type factory id(0x19/0x3f/0x40) 배치 가능성 RE.

**상태**: G001 active, 사이클 1 완료, 사이클 2 pending.

---

## 사이클 (2026-06-23) — G001 사이클 2: 0x0305/0x0307 명령 카탈로그 preload + C002 probe

**실험**: `LOGH_COMMAND_TABLE_PRELOAD_PROBE=1` 추가로 0x0305/0x0307에 factory `0x002b/0x0041` 카탈로그를 채워 전송.

**실클 세션**: `.omo/ui-explorer/g001-c002-preload-20260623/`
- trace: 월드 진입 성공, 0x0b01/0x0b07 **없음**.
- cmdmenu probe: `rowCount_350=0`, `selectedD5_354=0`, `factory_nonzero=6`.
- catgate probe: `catGate_f4=0`→0 (변화 없음), `state_4=1`, `cmdRowCount_480=0`, `sel_624=0.
- 스크린샷: `shots/024-world.png` — 전략맵 HUD 유지, 명령 메뉴/선택 UI 미출현.
- 종료: `shaVerified:true`.

**판정**: 0x0305/0x0307 preload는 factory 배열에 값을 주입할 수 있으나, **명령 메뉴 rowCount를 0 이상으로 만들지 못함**. catGate가 0(비활성) 상태로 유지되며, 함대선택/명령메뉴 서브시스템 전체가 여전히 미초기화. 이는 이전 G234/G235 실험 결과와 일치.

**원인 추정**: 
- 0x0305/0x0307은 conn3 월드 로그인 워커 응답(0x0304→0x0305, 0x0306→0x0307)으로 전달되지만, **runtime command table(`clientBase+0x3416d8`)로의 승격 시점/조건**이 맞지 않거나,
- preload된 명령이 move-type(`0x19/0x3f/0x40`)이 아니어서 실제 0x0b01 dispatch 경로와 연결되지 않거나,
- 가장 근본적으로 **전략 widget이 latch loop에 등록되지 않아 +0xb00가 발화하지 않음** (사이클 1 RE 결론).

**다음(사이클 3)**:
- `LOGH_FLEET_MOVE_PROBE=1` 실험: 서버가 0x0b07 지연 푸시로 함대 이동을 권위적으로 발생시킬 수 있는지 재확인(이전 live20-24에서 작동).
- 0x0305/0x0307 preload에 move-type factory id(0x19/0x3f/0x40)를 추가/매핑하는 RE/실험.
- 0x0325 unit stream wire format(`LOGH_POSTLOAD_UNIT_STREAM_WIRE=1`) 변형으로 함대선택 데이터 정합성 실험.
- 만약 위 모두 실패하면, 안전 code-cave 확보(새 `.text` 섹션 또는 추가 cave 탐색) 후 전략 widget latch loop 등록/강제 패치 설계로 전환.

**상태**: G001 active, 사이클 2 완료, 사이클 3 pending.

---

## 사이클 (2026-06-23) — G001 사이클 3: LOGH_FLEET_MOVE_PROBE 지연 푸시

**실험**: autologin patch가 `127.0.0.1:47900`에 고정되어 있음을 재확인. 포트 47900 + `LOGH_FLEET_MOVE_PROBE=1` + `LOGH_COMMAND_TABLE_PRELOAD_PROBE=1`로 세션 실행.

**실클 세션**: `.omo/ui-explorer/g001-c002-cycle3-20260623/`
- trace: 월드 진입 성공, 서버가 `0x0b07 NotifyMovedGrid`를 grid-enter 후 10s 지연 푸시함(05:11:22.661).
- `0x0b01` 클라이언트 송신 **미관측**.
- cmdmenu/catgate probe 파일 생성 실패(스크립트가 세션 라이프사이클 타이밍/Frida attach 문제로 출력하지 못함).
- 스크린샷: `shots/001-initial.png`만 존재(자동 `post-world` shot 실행 시점에 이미 클라이언트 종료 또는 attach 실패).
- 종료: `shaVerified:true`, canonical-playable SHA 복구 확인.

**핵심 발견**:
- `LOGH_FLEET_MOVE_PROBE=1`은 서버 권위 0x0b07 푸시를 재현함. 이는 `0x0b07` 송신 경로 자체는 살아 있음을 의미.
- 그러나 클라이언트는 여전히 함대선택/명령메뉴 서브시스템이 구성되지 않아 `0x0b01`을 발신하지 않음.
- C002 종결은 `0x0b07` 푸시만으로는 불가. **unit-list 패널 0x67 생성 → officer 데이터 안착 → 함대선택 → 명령메뉴 build → row dispatch** 전체 체인이 필요.

**다음(사이클 4)**: `S-011` 0x0325 ResponseInformationUnit native 756B 레이아웃 officer 필드 실험. 현재 wire는 88B지만 클라 네이티브는 756B; officer count(0x24c) 및 관련 필드(0x250)를 채워 unit-list populate를 유도.

**상태**: G001 active, 사이클 3 완료, 사이클 4 준비 중.

---

## 사이클 (2026-06-23) — 로드맵 확장

**산출물**: `docs/logh7-remaster-master-roadmap-expanded-2026-06-23.md`
- 기존 8 goal → 8 Phase / 80+ milestone 확장.
- `.omo/reference` 134장 스크린샷 기반 UI milestone(⑤맵전환 ⑥행성내장소·직무카드 ⑦커맨드) 반영.
- RE 문서(`logh7-c002-mechanism-complete` 등), 서버/툴 문서, 콘텐츠 문서 종합.
- 캐릭터 스테이터스 = 체릅(health/HP) 반영(R-010).
- P0 우선순위 큐 10개 정의, G001 세부 사이클 8단계 확장.

**상태**: 문서화 완료. G001은 여전히 active.

---

## 사이클 (2026-06-23) — G001 사이클 3 추가 발견

**스크린샷**: `.omo/ui-explorer/g001-c002-cycle3-20260623/shots/002-post-world.png`
- 전략맵 렌더: 3개 항성(베를린, 발할라 등) 한국어 라벨 정상 표시.
- 하단 좌측 캐릭터 스테이터스: HP/MP 바, 8능력치(전부 0), 캐릭터 초상화 — 사용자 피드백 "캐릭터 스테이터스 = 체릅" 확인. HP 바가 체릅(health)임.
- 하단 우측 명령 메뉴 영역: 버튼(스폿 불명, 발할라성계, 성계 내 우주)만 존재, **명령 row 리스트 없음**.
- 함대 마커 미출현.
- 우측 상단 "게임을 중단합니다" 메시지 — 클라이언트 종료 직전 상태로 추정.

**결론**: `LOGH_FLEET_MOVE_PROBE=1`로 서버가 0x0b07을 별도 푸시할 수는 있으나, 클라이언트 UI 상에서는 함대 이동/선택/명령 row가 나타나지 않음. C002 종결은 서브시스템 구성이 필수.

**probe 스크립트 교정**: `run_g001_cycle3.sh`에서 `--session` 인자 제거하고 출력을 세션 디렉토리 파일로 리다이렉트하도록 수정.

---

## 사이클 (2026-06-23) — G001 사이클 4 준비: C002 6-layer 서브시스템 RE

**RE 재확인** (`tools/logh7_redex.py`):
- `FUN_0054e570` (scene setup): `*param_1 == 2`일 때 `FUN_004ff3c0()` 호출 → 전략 씬 셋업.
- `FUN_004ff3c0`: 마지막에 `FUN_004fc4e0(*(param_1 + 0xc))` 호출.
- `FUN_004fc4e0`: 초기에 `FUN_004f6040(param_2)` 호출 → unit-list 패널 위젯 0x67 생성.
- `FUN_004f6040`: `param_2 != 0` 조건 하에 위젯 생성; `param_2 == 0`이면 즉시 `return false`.
- `FUN_004f68f0`: `param_2`로부터 `*(byte *)(param_2 + 0x270)` officer count 읽어 row 데이터 채움.

**해석**:
- `FUN_004fc4e0`은 `param_2`가 0이면 early return. `FUN_004ff3c0`이 `*(param_1 + 0xc)`를 넘기는데, 이 값이 0이면 전체 패널 생성 체인이 묵살.
- `FUN_004f68f0`의 `param_2`는 PLAYER_INFO 슬롯(stride 0x370)로 추정; `+0x270` officer count 필드 필요.
- 현재 서버 0x0325 builder는 88B stride로 unit id/owner/cell/faction/boats만 제공. officer count/리스트를 유도할 추가 데이터 경로(0x0325 확장 또는 0x0323/0x0356/0x1207 등)가 필요.

**Cycle 4 방향**:
1. `FUN_004ff3c0` 호출 조건 `*(param_1 + 0xc) != 0`을 만족시키는 데이터/와이어 식별.
2. `PLAYER_INFO+0x270` officer count를 채우는 서버 메시지/레코드 식별(0x0325 native 메모리 매핑 vs 0x0323 character record vs 0x0356 notify).
3. 두 조건을 동시에 만족하는 실험 설계 후 실클.

**상태**: G001 active, 사이클 4 준비 중, RE 진행 중.
## Current C002 instrumentation update (2026-06-28, journal #30)
- **Context read**: re-read the current LOGH VII skills for RE, wire, live, patch, localization, and extraction, then re-indexed `docs/`, `.claude/` prompts/workflows, and `docs/reference/ui-catalog` from the current worktree. Three subagents independently checked roadmap/prompt state, font/UI/reference-image state, and the C002 RE/server path.
- **Roadmap conclusion**: the current game-completion bottleneck is still C002 user-originated interaction. `LOGH_POSTLOAD_ACTION_LIST_SEATS=1` has already proven `0x0356`, slot `0x67`, and `PLAYER_INFO+0x270`; the next wall is `FUN_005015f0` returning false for populated selection rows and command root `+4` staying closed.
- **RE confirmation**: `FUN_005015f0` first checks target `+8`, event queue dequeue `FUN_00501ed0`, controller `+5`, target `+0x15`, geometry hit `FUN_005025f0`, occlusion/peer gates `FUN_0050c180` / `FUN_00501d60`, then event-kind-specific gates such as target `+0xb00` for event 2. `FUN_00502ea0` is the direct writer for object/root `+4`; `FUN_005024b0` writes `+5`; `FUN_005024e0` writes target `+0x15`.
- **Tooling change**: `RE/tools/logh7_hud_hit_test_gate_watch.py` now classifies not only HUD mode targets but also `selection-primary-*`, `selection-secondary-*`, `command-root`, and `command-row-*`. It also logs selection and command summaries around every watched hit test.
- **Writer watch**: the same watcher now hooks `FUN_00502ea0` and `FUN_005024e0`, recording caller VA, target pointer, before/after `+4` / `+0x15`, `listSelected189`, `activeGate04/05`, `rowCountD4`, `selectedD5`, and `categoryD6`. This makes the next live run discriminate whether C002 is failing at row geometry/latch, target enablement, or command-root activation.
- **Verification**: `cd RE; python -m py_compile tools/logh7_hud_hit_test_gate_watch.py` passed. `cd RE; python -m unittest tools.tests.test_logh7_hud_hit_test_gate_watch tools.tests.test_logh7_hud_admission_watch tools.tests.test_logh7_hud_event_queue_watch` passed, 10/10.
- **Font/UI/reference-image audit**: current canonical 98ca stack already patches both primary UI and D3D atlas font faces to Pretendard and has live GDI watcher evidence with no Gulim fallback. Remaining blur reports should first compare display mode/filtering/size, not assume a font slot regression. The 134-image reference catalog lacks a clear original character-name input panel reference; current visual comparison targets remain strategy/world, command/card/dialog, and current 98ca windowed-vs-borderless screenshots.
- **Next live run**: canonical installed EXE only, no preseed by default, include `LOGH_POSTLOAD_ACTION_LIST_SEATS=1`, attach `logh7_hud_admission_watch.py`, `logh7_hud_hit_test_gate_watch.py`, and `logh7_hud_event_queue_watch.py`, then click the known selection row and command region. Stop with SHA verification.

## Current canonical gate-writer discriminator + font proof (2026-06-28, journal #31)
- **Canonical C002 session**: `.omo/ui-explorer/c002-gate-writers-98ca-20260628`, launched through `RE/tools/logh7_ui_explorer.py` from installed `RE/.omo/work/logh7-installed/exe/G7MTClient.exe`, source canonical playable `RE/.omo/work/logh7-ko-overlay/exe/G7MTClient.playable.exe`, SHA256 `98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc`. No `LOGH_PRESEED_PLAYER_CHAR` was set.
- **Env and world entry**: used `LOGH_ACCEPT_ANY_GIN7=1`, `LOGH_POSTLOAD_RICH_CHARACTER=1`, `LOGH_POSTLOAD_ACTION_LIST_SEATS=1`, `LOGH_STRAT_GALAXY=1`, `LOGH_STRAT_GRID_EARLY=1`, `LOGH_STRAT_TERRAIN=1`, `LOGH_WORLD_PLAYER=1`, `LOGH_FULL_UNIT_LOCATION=1`, `LOGH_GRID_ENTER=1`. Existing account profile `dummy:1` entered world and received `0x0204`, `0x0325`, `0x0b0a`, and `0x0356`.
- **Snapshot proof**: `selectgrid-snapshot.jsonl` before clicks showed `fieldMode126711=2`, `gridActive126710=1`, `worldActive2a58f8=65537`, `focusChar3584a0=1`, `unitCount41a364=1`, `selection.listCount188=1`, `payloadCount270=1`, `payloadCount270U8=1`, one primary/secondary selection row, and `command.rowCountD4=24`.
- **Click result**: clicked visible own cell, selection-list candidate, command oval, command row candidates, red planet, and empty-grid candidate. Final trace counts: `0x0356=1`, `0x0f08=4`, `0x0f09=4`, `0x0b01=0`, `0x0b07=0`.
- **Gate-writer watcher result**: `logh7_hud_hit_test_gate_watch.py` recorded `selection-primary-0=249`, `selection-secondary-0=249`, but `inputHitTest-gate-005015f0` returned `retvalLow8=0` for all 3478 samples and never changed `listSelected189`. It recorded no command-row target roles. `selectionChanges=0`, `commandChanges=0`.
- **Admission watcher result**: `selectionHitTest` itself returned `1` for all 249 samples, but the higher-level `FUN_005015f0` gate rejected the event. `commandRowHit` returned `0` for all 249 samples, consistent with command root inactive state (`activeGate04=0`, `activeGate05=0`) despite `rowCountD4=24`.
- **Event queue result**: event queue dequeue codes stayed in non-move UI polling paths (`2`, `9`, `11`, `13`). Only two enqueue entries were seen, both event code `22`, not a SelectGrid movement event. No `0x0b01` originated.
- **Conclusion**: C002 is now isolated past data population. Server-side `0x0356`, slot `0x67`, and `PLAYER_INFO+0x270` are live-filled. The remaining client wall is the event admission bridge from a detected selection row to `listSelected189` and then to command-root `+4` activation.
- **dgVoodoo/logo check**: active installed `dgVoodoo.conf` and both launcher paths already set `dgVoodooWatermark=false`, `3DfxWatermark=false`, `3DfxSplashScreen=false`, and `WatermarkDisplayDuration=1` (`0` would mean infinite if the watermark were enabled). If a logo appears, the likely path is a wrong cwd or isolated overlay launch without the installed sidecar `D3D8.dll`/`dgVoodoo.conf`.
- **Fresh font proof**: spawned the installed canonical `G7MTClient.exe` through `logh7_gdi_font_watch.py --spawn-exe` into `.omo/ui-explorer/font-gdi-spawn-98ca-20260628`. Font registration succeeded (`57` font files, `135` faces loaded). GDI log: `font-created` 31/31 face `Pretendard`; `ExtTextOutA` 125/125 current face `Pretendard`; primary height mostly `14`, quality `5`, charset `-127`. Therefore current blur/small-text reports are not a face-slot regression; next work is size/layout/display-mode filtering.
- **Tooling receipt update**: `RE/tools/logh7_ui_explorer.py` now records `resampling`, `dgVoodooWatermark`, `3DfxWatermark`, `3DfxSplashScreen`, `Filtering`, `Antialiasing`, `RTTexturesForceScaleAndMSAA`, and `SmoothedDepthSampling` in the `dgVoodooDisplay` receipt. `tools.tests.test_logh7_ui_explorer` was updated accordingly.
- **Verification and closure**: `ui_explorer stop` returned `shaVerified:true`. Final checks showed no `G7MTClient`, no `node`, no `47900` listener. Installed and overlay EXEs both matched SHA `98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc`. `cd RE; python -m py_compile tools/logh7_ui_explorer.py` passed. `cd RE; python -m unittest tools.tests.test_logh7_ui_explorer` passed 17/17.

## Current C002 controller-gate refinement (2026-06-28, journal #32)
- **Context and prompts re-read**: re-indexed current `docs/`, `.claude/commands`, `.claude/workflows`, `.claude/agents`, and project LOGH7 skills from the current worktree. The active roadmaps still make C002 user-originated interaction the blocker for interactive MP; observer/server-push MP remains a separate smoke path.
- **Subagent cross-check**: three read-only subagents audited roadmap drift, C002 RE, and font/UI/dgVoodoo state. They agreed that current authority is canonical SHA `98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc`, `0x0356`/slot `0x67`/`PLAYER_INFO+0x270` are no longer the C002 blocker, and Pretendard is live-active in the canonical registered path.
- **Raw-byte/decompile recheck**: `FUN_005015f0` was re-read by redex and disassembled from the canonical playable EXE bytes. The event-2 path checks, in order: target `+8`, queued event fast path, controller `+5`, target `+0x15`, point-rect geometry, occlusion/peer gates, then the event-2 latch `target+0xb00` at VA `0x005018cd` / later case table path.
- **Existing live-log refinement**: re-parsed `.omo/ui-explorer/c002-gate-writers-98ca-20260628/hud-hit-test-gates.jsonl`. For `selection-primary-0` and `selection-secondary-0`, 498 total `FUN_005015f0(2, row, ...)` samples all had `retvalLow8=0`. Their row state was good enough to pass the first two target gates (`valid08=1`, `flag15=1`), but `controllerBefore.controllerGate05=0` in every sample. No nested `FUN_005025f0`, `FUN_0050c180`, or `FUN_00501d60` events were observed for those selection rows, proving the rejection occurs before geometry/occlusion and before the final `row+0xb00` latch check.
- **Writer evidence**: the same log saw `FUN_005024b0` (`+5` writer) only for other controllers at caller `0x00506594` inside `FUN_00506280`; the selection input controller `0xf260e40` was not opened. `FUN_00502ea0` active writes likewise sampled other targets, not the command root role. This explains why `listSelected189` and command root `+4` never changed.
- **RE correction**: `FUN_004f6600` is `void`; the meaningful success signal is the write to `selectionList+0x624` (`listSelected189`) after either primary or secondary row passes `FUN_005015f0(2, row, ...)`. Previous shorthand such as "`selectionHitTest` returned 1" must not be read as selection admission success.
- **Tooling update**: `RE/tools/logh7_hud_hit_test_gate_watch.py` now records row event queue keys (`target+0x470`) and `hasEvent2`/`hasEvent9`/`hasEvent0b`, and hooks `FUN_00507f20` as `interactionLatchLoop`. It logs controller state, row state, selection/command summaries, input globals, and before/after `+0xb00/+0xb01/+0xb02` for classified selection/command/HUD targets.
- **Verification**: `cd RE; python -m py_compile tools/logh7_hud_hit_test_gate_watch.py` passed. `cd RE; python -m unittest tools.tests.test_logh7_hud_hit_test_gate_watch tools.tests.test_logh7_hud_admission_watch tools.tests.test_logh7_hud_event_queue_watch` passed, 10/10.
- **Next live discriminator**: canonical installed EXE only, no preseed by default, with `LOGH_POSTLOAD_ACTION_LIST_SEATS=1`. Attach the updated gate watcher plus admission/event-queue watchers. Pass/fail split: if selection rows never enter `FUN_00507f20`, the row is not registered in the latch update loop; if they enter but controller `+5`/`row+0xb00` stays closed, the failure is inside the latch/event globals path; if `listSelected189` changes, continue to command root `+4` and `0x0b01`.

## C002 mode-target live: 0x0356/list filled, natural clicks still take event22/0x0f08 path (2026-06-28, journal #37)
- **Latest note**: canonical installed `G7MTClient.exe` session `.omo/ui-explorer/c002-mode2-target-98ca-20260628` preserved mode2 (`selector_35f35a=0`, `mode_byte_126711=2`) and received `0x0356 compact-0356`, but user-originated clicks still did not reach SelectGrid `0x0b01`. This run did not use `LOGH_PRESEED_PLAYER_CHAR`.
- **Session/env**: start used `--display-mode borderless`, canonical playable SHA `98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc`, and env `LOGH_ACCEPT_ANY_GIN7=1`, `LOGH_POSTLOAD_RICH_CHARACTER=1`, `LOGH_POSTLOAD_ACTION_LIST_SEATS=1`, `LOGH_STRAT_GALAXY=1`, `LOGH_STRAT_GRID_EARLY=1`, `LOGH_STRAT_TERRAIN=1`, `LOGH_WORLD_PLAYER=1`, `LOGH_FULL_UNIT_LOCATION=1`, `LOGH_GRID_ENTER=1`.
- **World/data proof**: trace reached world and post-load `0x0f02`, `0x0f06->0x0f07`, `0x0b09`, `0x0204`, `0x0325`, `0x0323`, `0x0b0a`, and `0x0356`. The `0x0356` record carried `recordSeatCount250=1`, `recordSeatKind254=1`, `recordSeatChar254=1`, `recordSeatRole258=0`. Snapshot `selectgrid-snapshot-mode2-before.jsonl` showed `selection.listCount188=1`, `payloadCount270=1`, `currentPayloadCount270=1`, one primary/secondary selection row, `command.rowCountD4=24`, `gridActive126710=1`, and `fieldMode126711=2`.
- **Mode-target watcher result**: `watch-ready` showed `HUD+0x14` `hudMode2Primary` and `HUD+0x18` `hudMode4Primary` valid but invisible/disabled, while `HUD+0x28` `hudMode2Fallback` and `HUD+0x24` `hudMode6Fallback` were visible/enabled. Clicks on mode fallback targets, visible systems, fleet panels, and logical command rows did not produce `0x0b01`/`0x0b07`.
- **Wire result**: the session produced `0x0f08 -> 0x0f09` pairs, not C002 movement. Final trace had `0x0f08=3`, `0x0f09=3`, `0x0b01=0`, `0x0b07=0`, `0x0356=1`.
- **Event queue proof**: both watcher passes recorded thousands of `FUN_005015f0` and `FUN_00501ed0` samples but only one `FUN_00501e30` enqueue per pass. The enqueue was `eventCode=22` (`0x16`), `returnVa=0x00517d2d`, target with no known HUD/selection/command role, and no event `2/9/0xb` was queued on the mode2 target. This rules out a natural SelectGrid click-confirm event in this run.
- **Static RE reconciliation**: subagent/redex confirmed `0x00517d2d` is inside `FUN_00517cd0`, immediately after `FUN_00501e30(0x16, target, local_34)`. Direct callers include `FUN_004c2620 -> FUN_00517cd0(0x0f08, ...)` and `FUN_004c2660 -> FUN_00517cd0(0x0f09, ...)`. This is a local event22 wrapper carrying an info/mail/domain code, not the SelectGrid path. The SelectGrid path remains `FUN_005737d0 -> FUN_004b48d0 -> FUN_004b78a0(arg2=0x3b -> case 0x3a) -> 0x0b01/0x0b07`.
- **Server/wire boundary**: subagent/server inspection confirmed current `0x0f08` falls through to a generic response and `0x0f09` is a 1-byte status body (`respLen=7` in trace), so it should not be counted as strategic gameplay. The next wire family to keep in view is still `0x0307`/`ResponseStaticInformationCardCommand` and command-table admission, but prior notes show this alone has timing/admission caveats.
- **Tooling update**: `RE/tools/logh7_hud_hit_test_gate_watch.py` now hooks `FUN_00501e30`/`FUN_00501ed0`, reports mode target summaries in `watch-ready`, and keeps the legacy `modeTargets` field for log consumers. After this session it was further extended to dump `payloadBytes34` from the enqueue payload pointer, so the next event22 run can decode the copied 0x34-byte domain payload instead of only the wrapper return VA.
- **Font/dgVoodoo note**: this canonical session had no dgVoodoo logo. Start receipt had `dgVoodooWatermark=false`, `3DfxWatermark=false`, `3DfxSplashScreen=false`, `ScalingMode=centered`, `Resampling=pointsampled`, `Filtering=appdriven`, `Antialiasing=off`. The remaining small/blurred complaint is most likely 1920x1080 native canvas plus the current 14px-ish `font-readable-size`, not missing Pretendard; the next visual A/B should test the 16px-ish candidate and/or 4:3/windowed diagnostics.
- **Closure**: first `ui_explorer stop` hit a transient Windows file-lock during EXE restore copy after the game process had exited. A second `ui_explorer stop` completed with `shaVerified=true`, restored kind `canonical-playable`, and restored SHA `98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc`. Final checks showed no `G7MTClient` and no `47900` listener.
- **Next target**: do not repeat generic map/system clicks as if they were C002 movement. Next live should either capture `payloadBytes34` for event22 and identify the exact 0x0f08 caller/payload, or return to the proven older positive-control flow: create/select a command row that calls `FUN_00581c80`, then trace the state transition that should move `DAT_009d2a3c` into the send-confirm phase and call `FUN_005737d0`.

## Lobby UI regression pass: back/delete/session text/font follow-up (2026-06-28, journal #38)
- **Context refresh**: re-read active LOGH VII skills `logh7-live`, `logh7-re`, `logh7-wire`, `logh7-patch`, and `logh7-localize`. Current rules remain: canonical installed playable EXE only for live diagnosis, start/login windowed, no `LOGH_PRESEED_PLAYER_CHAR` by default, and always `ui_explorer stop` with SHA verification.
- **Subagent split**: dispatched four read-only subagents: lobby Back/Delete opcode and server handling, MsgDat/session-selection localization, font/dgVoodoo pipeline, and harness-vs-official launch environment. Main thread keeps live control and final integration.
- **Preflight**: checked for stale `G7MTClient`, `LOGH7Launcher`, `G7Start`, `Gin7UpdateClient`, and `47900/47910` listeners before launching the diagnostic session. No stale process or listener was found.
- **Live start**: launched `.omo/ui-explorer/lobby-back-delete-79142d12-20260628` with `RE/tools/logh7_ui_explorer.py start --server-root ../server --port 47900 --display-mode windowed --settle 8`. The installed run EXE and canonical playable source both matched SHA256 `79142d12290c3956f79dd38774bc809c21913a228ae9928bf77ef9486cd895df`; `LOGH_PRESEED_PLAYER_CHAR` was absent; login reached `0x7000`, `0x0020`, `0x2000`, and `0x2001`.
- **Lobby-ready shot**: after the splash wait, `shots/002-lobby-ready.png` showed the localized lobby and trace received `0x2003 -> 0x2004` plus two `0x2005 -> 0x2006` session-list pairs. The dgVoodoo logo was still visible in the lower-right corner despite `dgVoodooWatermark=false`.
- **Delete button first click**: clicked `575,523` (`캐릭터 삭제`). The client changed to a local character-selection delete screen and emitted no new wire event yet, so delete is a two-step local UI flow rather than immediate network send. The screen showed duplicate-looking cards for the same seeded profile and a long Korean warning line that exceeds the visual panel width.
- **Delete-card click result**: clicked the first visible card at `1100,470`. Instead of a delete request, the client sent `0x2009`, received `0x200a`, closed lobby connection 2, opened connection 3, and proceeded into the normal world-login path with `0x0020`, `0x0200`, and `0x0201`. The screen still visually looked like the delete-card picker. This proves the current delete UI card activation is routed as "game start/select character", not as character deletion.
- **Back-after-card click**: clicked the visible `뒤로` button at `1105,742` after the accidental world-login routing. It produced no wire event and did not return to the lobby within the settle window. This mixed state is not a clean back-button test, so the next run will retest back before selecting any card.
- **Stop after delete misroute**: stopped `.omo/ui-explorer/lobby-back-delete-79142d12-20260628`; `shaVerified:true`, restored kind `canonical-playable`, restored SHA256 `79142d12290c3956f79dd38774bc809c21913a228ae9928bf77ef9486cd895df`.
- **Back-only live start**: launched `.omo/ui-explorer/lobby-back-only-79142d12-20260628` windowed with the same canonical playable SHA `79142d12290c3956f79dd38774bc809c21913a228ae9928bf77ef9486cd895df` and no preseed. Login again reached `0x7000`, `0x0020`, `0x2000`, and `0x2001`.
- **Back-only lobby proof**: after the splash wait, lobby again received `0x2003 -> 0x2004` and `0x2005 -> 0x2006`.
- **Clean delete back proof**: clicked `캐릭터 삭제` at `575,523`, then clicked `뒤로` at `1105,742` before selecting a card. It produced no wire event and returned visually to the lobby (`shots/004-delete-back-clean.png`). Therefore the Back button itself works; the delete bug is specifically card activation routing to game start (`0x2009`) instead of a deletion flow.
- **New-character session screen**: clicked `새 캐릭터 작성` at `575,407`. The client requested sessions again (`0x2005 -> 0x2006`) and displayed the session picker. The title/header strings remained Japanese, including `プレイするセッションを選んで下さい。` and `選択可能セッション`; `뒤로` at `1105,742` returned visually to the lobby with no wire event.
- **Original-character session screen**: clicked `오리지널 캐릭터 추첨` at `575,465`. It reused the same session picker and the same Japanese strings, again via `0x2005 -> 0x2006`.
- **Stop after back/session-text proof**: stopped `.omo/ui-explorer/lobby-back-only-79142d12-20260628`; `shaVerified:true`, restored kind `canonical-playable`, restored SHA256 `79142d12290c3956f79dd38774bc809c21913a228ae9928bf77ef9486cd895df`.
- **User correction**: session change must not stop at "session picker opens"; the selected session must actually update server-side state. Also, session name/info should come from the DB/read-model under the agreed CQRS shape, not an ad-hoc fallback list. Next static pass checks whether `0x2006` is still fed by in-memory defaults and whether `0x2009`/delete/session-change commands persist to the account/session read model.
- **Server static finding**: `server/src/server/logh7-login-session.mjs` still builds `0x2006` from the `sessions` option, or from a hardcoded fallback `{ sessionId:1, sessionName:'LOGH VII', beginDay:'UC 796' }`. The `0x2009` handler reads `[u32 LE @+2]` as `sessionId` only to choose `worldBySession[sessionId] || world || lobby`; it does not persist the selected session to an account/session read model. This violates the CQRS rule for session change: command must update authoritative state/DB, and later reads must come from that read model.
- **Opcode RE restart #1**: re-read `FUN_004b78a0`, `FUN_004b8b00`, `FUN_00444900`, and `FUN_0043f070` from redex. The authoritative pair table maps selector case 6 to `0x2005 -> 0x2006` and selector case 7 to `0x2009 -> 0x200a`. `FUN_004b8b00` gives `0x2006` payload size `0x5304`, `0x2009` request size `2`, and `0x200a` payload size `0x0c`. `FUN_0043f070` is a serializer/logger for `INF_LobbyCommandDeleteCharacter` with field `session_id = *param_1`, but `0x2008` is not visible in `FUN_004b78a0`; delete routing still needs caller/case proof before changing server semantics.

## Lobby content-container recenter promoted to canonical playable (2026-06-28, journal #39)
- **User request**: re-check the lobby UI, especially whether the content containers stay inside their panel.
- **Context and skill refresh**: re-read `logh7-live`, `logh7-patch`, `logh7-localize`, and `logh7-re` before touching the client stack. Kept the live rule: canonical installed EXE, windowed start/login, no blanket `node.exe`, no default preseed.
- **Screenshot audit**: inspected existing live shots instead of launching a new session first. `session-lobbyui-20260628/shots/002-lobby-current.png` showed the main lobby notice container inside the right panel. `session-diag2-20260628/shots/014-name-next.png` showed the character creation content/inputs floating over the left lobby menu and outside the right panel. Prior runtime patch proof `charsel-mempatch-98ca-20260627/shots/014-mempatch-name-screen-newpos.png` showed the same content block moved back inside the right panel.
- **Patch decision**: promoted `RE/tools/client_patches/charsel-recenter.json` into `RE/tools/logh7_build_playable_client.py` `DEFAULT_STACK`, after `lobby-native-layout-v2`. This keeps the already-good lobby notice layout and fixes the lobby-derived character/session/create content containers using the existing RE-confirmed same-length anchor patches.
- **Source updates**: updated `RE/tools/logh7_client_exe.py` canonical SHA, `RE/tools/logh7_installed_tree.py` required playable stack, and focused tests. Updated current authority surfaces in `AGENTS.md`, `.codex/skills/logh7-live/SKILL.md`, `.codex/agents/logh7-loop-*.toml`, `.claude` live/loop prompts, `docs/logh7-live-test-standard.md`, `docs/logh7-live-flow-plan-2026-06-26.md`, `docs/logh7-master-roadmap-2026-06-26.md`, `docs/logh7-mp-roadmap-2026-06-23.md`, `docs/logh7-ui-coordinate-map.md`, `docs/logh7-font-remaster.md`, `docs/logh7-session-2026-06-27-canonical-playable-c002-mp-font-audit.md`, and `RE/tools/logh7_launch_config.py`.
- **Build/deploy**: temporary byte-checked build with `DEFAULT_STACK + ['charsel-recenter']` produced SHA `5aa1e00a35bd62c065bab3d3144496747d907b10a05ea80a54b82a1bb03bd443`. A first `--deploy` attempt failed on stale `G7MTClient.playable.exe.tmp`; removed only that exact temp file, then the default build and `--deploy` both passed. Deployed RE overlay playable, RE installed `G7MTClient.exe`, and RE `G7MTClient.exe.uiexplorer`; also synchronized the root `.omo` mirror copies to avoid "official EXE" drift.
- **Verification**: all checked EXE copies now hash to `5aa1e00a35bd62c065bab3d3144496747d907b10a05ea80a54b82a1bb03bd443`. The playable manifest stack ends with `login-blank-password-local-ok`, `lobby-res`, `lobby-native-layout-v2`, `charsel-recenter`. `cd RE; python -m py_compile tools/logh7_build_playable_client.py tools/logh7_client_exe.py tools/logh7_installed_tree.py tools/logh7_launch_config.py` passed. `cd RE; python -m unittest tools.tests.test_logh7_client_exe tools.tests.test_logh7_installed_tree tools.tests.test_logh7_ui_explorer` passed, 46/46.
- **Live status**: no new game session was launched in this pass; visual confidence comes from existing canonical screenshots plus prior runtime mempatch proof. The next live pass should start the new `5aa1e00a...` installed EXE windowed and capture lobby, session picker, and name-entry panels to confirm disk-build parity.

## Planetless system assumption check (2026-06-28, journal #40)
- **User concern**: some star systems can legitimately have no planets, so do not treat "star-only" as automatically broken.
- **Content check**: parsed `server/content/galaxy.json`. It has 80 systems and 3 planetless systems: `マローヴィア` at canon game cell `(25,3)`, `フォルセティ` at `(42,26)`, and `イゼルローン` at `(54,13)`.
- **Server path check**: `server/src/server/logh7-economy.mjs` `seedEconomyFromSystems` iterates `Array.isArray(system.planets) ? system.planets : []`; planetless systems register zero planets and pass through. `server/src/server/logh7-login-session.mjs` `planetBaseSeeds` uses the same empty-array guard, so base/planet seed emission also tolerates planetless systems.
- **Conclusion**: a star/system rendered without orbiting planets is not by itself a bug. The bug criterion must be stricter: expected planet data missing for a system that has planets in `galaxy.json`, or a UI path that incorrectly requires planets before rendering/selecting a valid system/fortress.

## Canonical instruction cleanup after lobby recenter promotion (2026-06-28, journal #41)
- **Reason**: after the current-authority SHA changed to `5aa1e00a35bd62c065bab3d3144496747d907b10a05ea80a54b82a1bb03bd443`, several project instruction files needed to keep the new EXE rule without inheriting mojibake from Windows encoding-sensitive rewrites.
- **Files normalized**: restored readable current-authority text in `AGENTS.md`, `.codex/skills/logh7-live/SKILL.md`, `.claude/skills/logh7-live/SKILL.md`, `.codex/agents/logh7-loop-explorer.toml`, `.codex/agents/logh7-loop-verifier.toml`, `.claude/agents/logh7-loop-explorer.md`, `.claude/agents/logh7-loop-verifier.md`, `.claude/commands/logh7-live.md`, `.claude/commands/logh7-loop.md`, `.claude/CLAUDE.md`, `docs/logh7-live-test-standard.md`, and `docs/logh7-ui-coordinate-map.md`.
- **Scope kept narrow**: no game code or server code was changed in this cleanup. The canonical client change remains the `charsel-recenter` promotion in the playable build stack.
- **Re-verification**: all checked RE/root overlay and installed EXE copies hash to `5aa1e00a35bd62c065bab3d3144496747d907b10a05ea80a54b82a1bb03bd443`. Manifest tail is `font-readable-size`, `login-title-ko`, `login-blank-password-local-ok`, `lobby-res`, `lobby-native-layout-v2`, `charsel-recenter`.
- **Tests**: `cd RE && python -m py_compile tools/logh7_build_playable_client.py tools/logh7_client_exe.py tools/logh7_installed_tree.py tools/logh7_launch_config.py` passed. `cd RE && python -m unittest tools.tests.test_logh7_client_exe tools.tests.test_logh7_installed_tree tools.tests.test_logh7_ui_explorer` passed, 46/46.

## Lobby recenter disk-build live verification (2026-06-28, journal #42)
- **Session**: started `.omo/ui-explorer/lobby-recenter-5aa1-20260628` from `RE/` with `--server-root ../server`, port `47900`, display mode `windowed`, no `LOGH_PRESEED_PLAYER_CHAR`, and installed canonical playable SHA `5aa1e00a35bd62c065bab3d3144496747d907b10a05ea80a54b82a1bb03bd443`.
- **Launch receipt**: preflight passed through `LOGH7Launcher.exe --client-preflight`; run client SHA/source SHA/expected SHA all matched `5aa1e00a...`. Launch stack included `lobby-res`, `lobby-native-layout-v2`, and `charsel-recenter`. Font registration loaded 57 files / 135 faces. Windowed dgVoodoo receipt used centered/pointsampled/appdriven/off AA settings and cursor clipping was released in windowed mode.
- **Lobby proof**: `shots/002-lobby-ready.png` reached lobby with `0x2003 -> 0x2004` and `0x2005 -> 0x2006`. The main server-notice/content container stayed inside the right panel.
- **Session picker proof**: clicked new-character at `(575,407)`. `shots/003-new-character.png` produced another `0x2005 -> 0x2006`; the session cards, back button, and header content stayed inside the right panel. Some session/header text remains Japanese, which is a localization/data issue, not this layout fix.
- **Character creation panel proof**: after selecting session row 1, the client emitted `0x2009 -> 0x200a` and displayed creation subpanels. `shots/004-session-row-1.png` faction selection, `shots/006-faction-next.png` gender selection, `shots/007-gender-next.png` origin selection, and `shots/008-origin-next.png` name-entry all stayed inside the right panel. The previously failing surname/given-name block no longer floats over the left lobby menu.
- **Observed remaining issue**: the dgVoodoo logo is still visible in the lower-right of the screenshots even though the receipt says watermark flags are false. This was observed but not fixed in this layout pass.
- **Closure**: `ui_explorer stop` restored canonical playable SHA `5aa1e00a35bd62c065bab3d3144496747d907b10a05ea80a54b82a1bb03bd443` with `shaVerified:true` and released cursor clipping. Post-stop checks found no `G7MTClient` process and no `47900` listener. `cd RE && python -m unittest tools.tests.test_logh7_client_exe tools.tests.test_logh7_installed_tree tools.tests.test_logh7_ui_explorer` passed, 46/46.

## Lobby/session localization environment alignment (2026-06-29, journal #43)
- **User request**: continue from the loop state, keep all actions documented, and re-check lobby UI content containers with the official playable EXE path. Also investigate why the session-selection/new-character text still looked Japanese or garbled while the harness path looked better.
- **Current playable state**: the latest canonical playable overlay is SHA256 `2d96061ff4ec772df8ec8bfdcc427ac9e1aaf249fe634a6a5d1e58b2af32edf7`, with manifest tail `font-atlas-antialias`, `font-readable-size`, `login-title-ko`, `login-blank-password-local-ok`, `lobby-res`, `lobby-native-layout-v2`, `charsel-recenter`, `charsel-content-inset`. This is newer than the #42 live-verification SHA and carries the lobby/content inset stack.
- **Data check**: inspected installed and overlay `data/MsgDat` records for the session picker. The relevant `constmsg.dat` entries are already localized as CP949 Korean, including id `2469` `플레이할 세션을 선택해 주십시오.`, `2470` `이 세션에서는 다음 캐릭터를 플레이할 수 있습니다.`, `2471` `오리지널 캐릭터 선택`, `2521` `선택 가능 세션 수`, and `2526` `경과 시간`. Therefore the earlier Japanese-looking session picker is not explained by missing MsgDat localization bytes.
- **RE-linked hypothesis promoted to fix**: `docs/logh7-font-remaster.md` already records the RE-confirmed `FUN_00641b90` menu-mode gate: `win.ini [windows] kanjimenu=kanji` selects Japanese menu mode, while `hangeulmenu=hangeul` selects Korean menu mode. The official launcher and ui_explorer were registering fonts and registry keys, but were not setting this profile gate.
- **Tooling changes**: added Korean menu-mode setup to `RE/tools/launcher/LOGH7Launcher.cs` via `WriteProfileString("windows", "hangeulmenu", "hangeul")` and `WriteProfileString("windows", "kanjimenu", "roman")` before font registration. Added the same profile writes to `RE/tools/logh7_windows_runtime.py` generated `setup-local.ps1`, and to `RE/tools/logh7_ui_explorer.py` start receipts as `_configure_korean_menu_mode`.
- **Tests added**: `RE/tools/tests/test_logh7_installed_tree.py`, `RE/tools/tests/test_logh7_ui_explorer.py`, and `RE/tools/tests/test_client_package_client.py` now assert that the launcher/setup/ui_explorer paths preserve the Korean menu-mode writes. The standalone `test_client_package_client` module still cannot run in this worktree because the expected `client` Python package is absent; this is a pre-existing repository-structure gap.
- **Launcher rebuild**: rebuilt the installed player runtime with `cd RE; python -m tools.logh7_build_player_launcher --installed-root .omo/work/logh7-installed`. The compiled installed `LOGH7Launcher.exe` now hashes to `BA98C50D278211C133E23F308B31A099098FC1C771DA2ED87ADD34B04A6EFA39`, `LOGH7Launcher.exe --check` exits successfully, `setup-local.ps1` contains both profile writes, and the staged launcher source under `logh7-runtime/launcher/LOGH7Launcher.cs` contains `ConfigureKoreanMenuMode`.
- **Verification**: `cd RE; python -m py_compile tools/logh7_ui_explorer.py tools/logh7_windows_runtime.py` passed. `cd RE; python -m unittest tools.tests.test_logh7_ui_explorer tools.tests.test_logh7_installed_tree tools.tests.test_logh7_client_exe` passed, 47/47. No new live game session was launched in this pass, so the next live pass should confirm whether the session picker now renders the Korean MsgDat bytes under the official launcher/ui_explorer environment.

## Latest lobby container visual audit (2026-06-29, journal #44)
- **Session artifacts checked**: inspected existing latest canonical session `.omo/ui-explorer/lobby-container-2d96-20260629`. `session.json` records installed official run client SHA/source SHA/expected SHA all as `2d96061ff4ec772df8ec8bfdcc427ac9e1aaf249fe634a6a5d1e58b2af32edf7`, display mode `windowed`, launch stack ending in `charsel-recenter` and `charsel-content-inset`, successful launcher preflight, successful font registration, and `stopped:true`.
- **Lobby panel result**: `shots/002-lobby-ready.png` shows the server notice/content container inside the right panel. The left menu remains separate and no content block overlaps the left menu panel.
- **Session picker result**: `shots/003-open-new-character.png` shows session cards, header, and back button inside the right panel. The visible header still renders Japanese text in that pre-`hangeulmenu` session, which is now tracked as a menu-mode/localization environment issue, not a container-position issue.
- **Name-entry result**: `shots/014-origin-next.png` shows the surname/given-name labels, input widgets, instruction text, and Next/Cancel buttons inside the right panel. The input widgets are still visually small/awkward and Korean IME behavior remains a separate text-input RE task, but the content container no longer escapes the panel.
- **Cleanup check**: after inspecting artifacts, checked for stale `G7MTClient`, `LOGH7Launcher`, `G7Start`, and `Gin7UpdateClient` processes and for `47900`/`47910` listeners; none were present.

## Lobby container official-EXE recheck on fc703 stack (2026-06-29, journal #45)
- **User request**: re-check the lobby UI, especially the content container position, and adjust it so the container stays inside the panel.
- **Context refresh**: re-read `logh7-live`, `logh7-localize`, `logh7-re`, and `logh7-patch`. Confirmed the current rule: use the installed official playable EXE, windowed start/login by default, no blanket `node.exe` kill, and no default `LOGH_PRESEED_PLAYER_CHAR`.
- **Subagent status**: attempted to spawn a fresh read-only explorer for the lobby-container question, but the agent thread limit was already reached. Reused/waited on the six existing completed subagents, found no direct contradiction for the lobby-layout result, then closed them to free slots.
- **Current build state**: verified RE and root installed/overlay EXE copies all hash to canonical playable SHA256 `0ceee9aa3d3defa7513cd9991719b8ca1634adf95a9c8cfa18490aff992420fc`. The launch stack includes `session-select-hardcoded-ko`, `lobby-res`, `lobby-native-layout-v2`, `charsel-recenter`, `charsel-content-inset`, and `charsel-content-y-inset`.
- **Patch review**: inspected `RE/tools/client_patches/charsel-content-inset.json`, `charsel-recenter.json`, and `lobby-native-layout-v2.json`. `charsel-content-inset` moves only the creation-form content groups from X `604` to `720` and the input subgroup from X `909` to `1025`, leaving the already-good main notice panel and session list anchors unchanged.
- **Official live session**: started `.omo/ui-explorer/lobby-container-fc70-20260629` from `RE/` with `--server-root ../server`, port `47900`, display mode `windowed`, no preseed, and the standard lobby/world env gates. Start receipt showed run/source/expected SHA all `fc703145...`, `runClientKind=canonical-playable`, Korean menu mode writes succeeded, font registration succeeded, and cursor clipping was released in windowed mode.
- **Lobby proof**: `shots/002-lobby-ready.png` received `0x2003 -> 0x2004` and `0x2005 -> 0x2006`; the server-notice content container remains inside the right panel.
- **Session picker proof**: clicked new character at `(575,407)`. `shots/003-open-new-character.png` received another `0x2005 -> 0x2006`. The session header text is now Korean due to `session-select-hardcoded-ko`, and the session cards plus Back button sit inside the right panel. Remaining card labels such as the stray kanji faction/header glyphs are a separate hardcoded-string localization task, not a container-position problem.
- **Character creation proof**: clicked session row 1 at `(1090,430)`, then advanced with Next at `(1185,694)`. `shots/004-session-row-1-first-click.png` showed the faction-selection content inside the panel. `shots/006-faction-next.png`, `shots/007-gender-next.png`, and `shots/008-origin-next.png` showed the gender and name-entry content groups inside the right panel; surname/given-name labels, input boxes, help text, and Next/Cancel buttons no longer escape into the left lobby menu area.
- **Adjustment decision**: no new coordinate patch was applied. The current `charsel-content-inset` placement is the correct adjustment for the observed panel bounds; further X/Y movement would reduce the balanced left/right margins and risk pushing controls toward the opposite panel edge.
- **Stop/cleanup**: `ui_explorer stop` restored SHA `fc703145...` with `shaVerified:true` and released cursor clipping. Post-stop checks found no `G7MTClient`, `LOGH7Launcher`, `G7Start`, or `Gin7UpdateClient` processes and no `47900`/`47910` listeners.
- **Verification**: `cd RE; python -m py_compile tools/logh7_build_playable_client.py tools/logh7_client_exe.py tools/logh7_installed_tree.py tools/logh7_launch_config.py tools/logh7_ui_explorer.py` passed. `cd RE; python -m unittest tools.tests.test_logh7_client_exe tools.tests.test_logh7_installed_tree tools.tests.test_logh7_ui_explorer` passed, 47/47.

## Server-pushed 0x0b07 client-apply proof on canonical EXE (2026-06-29, journal #46)
- **Context**: continued after the lobby container #45 pass. The lobby/content-container coordinate state was not changed further: the latest official-EXE proof already keeps the lobby notice, session picker, faction/gender/origin, and name-entry content groups inside the right panel. This pass focused on the next multiplayer blocker, proving whether a server-originated `NotifyMovedGrid` reaches the live client apply path.
- **Live rule observed**: used the installed official playable EXE through `RE/tools/logh7_ui_explorer.py` from `RE/`, windowed mode, no `LOGH_PRESEED_PLAYER_CHAR`, and no blanket `node.exe` kill. Both live runs restored the canonical playable SHA256 `0ceee9aa3d3defa7513cd9991719b8ca1634adf95a9c8cfa18490aff992420fc` with `shaVerified:true`.
- **Server prerequisite**: prior server-side tests locked `LOGH_FLEET_MOVE_PROBE=1` as a deferred `0x0b07` push after grid enter. The full server suite had passed (`node --test tests/server/*.test.mjs`: 1212 pass, 18 skipped, 0 fail), and the focused move-probe tests confirmed a single message32 `0x0b07` frame of `6+0x244` payload bytes.
- **First live run**: `.omo/ui-explorer/goal-0b07-apply-20260629` used `LOGH_FLEET_MOVE_DELAY_MS=12000`. The client entered world and trace proved the server emitted `0x0b07` at `2026-06-28T18:52:13.820Z` with `respLen=586` and `frameBytes=608`. The Frida probe was attached too late, so `0b07-apply.json` correctly returned `verdictCode:"record-missing"`, `apply_gate_FUN_004bee20_calls=0`, and `dispatch_517cd0_b07=0`. This run is server-push proof only, not client-apply proof.
- **Second live run**: `.omo/ui-explorer/goal-0b07-apply-probefirst-20260629` used `LOGH_FLEET_MOVE_DELAY_MS=45000` so the probe could attach before the push. World entry reached `0x0f02`, then post-load `0x0f06`, `0x0b09`, `0x0204`, `0x0325`, `0x0323`, `0x0b0a`, and `0x0356`. Trace emitted `0x0b07` at `2026-06-28T18:57:13.648Z` with `respLen=586`, `frameBytes=608`, followed by `deferred-battle-pushed delayMs=45000`.
- **Probe-before-world result**: `.omo/ui-explorer/goal-0b07-apply-probefirst-20260629/0b07-apply.json` returned `verdictCode:"applied-no-owncell-change"`, `record_arrived:true`, `apply_gate_FUN_004bee20_calls=1`, `grid_active_gate_2a58f8_min=1`, `grid_active_gate_2a58f8_max=1`, `dispatch_517cd0_b07=1`, `enqueue_501e30_evt16=1`, and `enqueue_501e30_total=2`. The watched own-cell timeline moved from `-1` to `2588`, but did not change as a result of the `0x0b07` record.
- **Probe-after-world result**: `.omo/ui-explorer/goal-0b07-apply-probefirst-20260629/0b07-apply-world.json` independently returned `verdictCode:"applied-no-owncell-change"`, `record_arrived:true`, `apply_gate_FUN_004bee20_calls=1`, `dispatch_517cd0_b07=1`, `enqueue_501e30_evt16=1`, and `enqueue_501e30_total=1`; own-cell stayed `2588`.
- **Conclusion promoted**: live client receipt/application of server-pushed `0x0b07 NotifyMovedGrid` is now confirmed through `FUN_004bee20`, the grid-active gate, `FUN_00517cd0(0xb07)`, and `FUN_00501e30(event 0x16)`. This is a real multiplayer transport/apply milestone.
- **Conclusion not promoted**: visual fleet marker movement is still not proven. The watched `owncell` field is not the moved-unit visual/state indicator. A screenshot after `0x0b07` was attempted too late and failed because the client window was already gone. Trace still shows a heartbeat at `2026-06-28T18:57:46.667Z` after the `0x0b07` push and only later `read ECONNRESET` at `2026-06-28T18:58:18.110Z`, so do not claim an immediate crash caused by `0x0b07`.
- **Cleanup**: after the probe-first run, `ui_explorer stop` restored SHA `0ceee9aa3d3defa7513cd9991719b8ca1634adf95a9c8cfa18490aff992420fc` with `shaVerified:true`, released cursor clipping, and post-stop checks found no `G7MTClient`, `LOGH7Launcher`, `G7Start`, `Gin7UpdateClient`, or `47900` listener.
- **Next RE task**: build or extend a live watcher for the actual unit/object cell state rather than `owncell`. Candidate starting points are `RE/tools/logh7_selectgrid_snapshot.py`, `RE/tools/logh7_endpoint_cache_snapshot.py`, and `RE/tools/logh7_player_info_probe.py`, especially around the `clientBase+0x41a368` unit array and PLAYER_INFO location fields before/after `0x0b07`.

## 0x0b07 location/result watcher prepared before next live run (2026-06-29, journal #47)
- **Goal continuation**: after #46 confirmed `0x0b07` reaches apply/dispatch/enqueue, continued toward proper multiplayer proof by preparing a watcher for the still-open visual/persistent movement question. No new live game session was launched in this pass.
- **Subagent audits**: two read-only subagents checked the next critical path. Both agreed the correct next task is a unit/object-location watcher, not more blind map clicks. They also flagged that older roadmap text saying "`0x0b07` client apply is unmeasured" is superseded by #46; the remaining gap is row/cell/render proof.
- **RE recheck**: re-read `FUN_004bee20`, `FUN_00517cd0`, `FUN_005751b0`, `FUN_004bee60`, `FUN_004beaa0`, `FUN_004c2a80`, and `FUN_004c2c80` through redex. Confirmed `FUN_004bee20` only gates on `client+0x2a58f8` then calls `FUN_00517cd0(0xb07, record)`. `FUN_00517cd0` enqueues event `0x16`. `FUN_005751b0` is the SelectGrid receive-result state machine touching `DAT_009d2a7c` / `_DAT_009d2a74`. Sibling notify paths (`FUN_004bee60` / `FUN_004beaa0`) show the direct PLAYER_INFO `+0x40/+0x44` write pattern, so the previous "0x0b07 directly mutates PLAYER_INFO/unit table" wording was too strong.
- **New tool**: added `RE/tools/logh7_0b07_location_watch.py`. It is read-only Frida instrumentation. It parses the `0x0b07` record pointer at `FUN_004bee20`/`FUN_00517cd0`, reads `unit_count @ +0x12` and `{u32 unitId, u32 position}` entries at `+0x14` stride 8, then snapshots the matching `clientBase+0x41a368` unit row, PLAYER_INFO slot by `+0x24`, candidate `clientBase+0x2c03cc` cell values and `+0x2c1755` object triples, own-cell `DAT_007cd04c+0x11178`, and SelectGrid result globals/state.
- **Verdicts**: the new watcher reports path verdicts (`record-missing`, `dispatch-missing`, `enqueue-missing`, `result-node-missing`) and a second state layer: `unitRowChanged`, `playerInfoChanged`, `cellObjectChanged`, `selectGridStateChanged`, `ownCellChanged`, plus `entryDiffs` keyed by record `unitId`. This separates "server 0x0b07 reached the client" from "persistent movement state changed".
- **Documentation correction**: updated `docs/logh7-strategic-input-wire.md` so section 3.2 now says confirmed path is `FUN_004bee20 -> FUN_00517cd0(0xb07) -> FUN_00501e30(0x16)` and section 3.4 documents the new location/result watcher. Added corrections to older shorthand that implied direct mutation/render was already proven.
- **Verification**: `cd RE; $env:PYTHONDONTWRITEBYTECODE='1'; python -B -m unittest tools.tests.test_logh7_0b07_location_watch tools.tests.test_logh7_0b07_apply_probe tools.tests.test_logh7_selectgrid_snapshot tools.tests.test_logh7_endpoint_cache_snapshot` passed 11/11. AST parse for `tools/logh7_0b07_location_watch.py` and its test passed. `python -B -m tools.logh7_0b07_location_watch --help` succeeded. Plain `py_compile` was not used because OneDrive/pycache locking produced a transient bytecode rename `WinError 5`; the `-B` checks avoid bytecode writes.
- **Next live recipe**: canonical installed EXE only, windowed, no preseed, `LOGH_FLEET_MOVE_PROBE=1` with long delay. Attach `logh7_0b07_location_watch.py --seconds 90 --session .omo/ui-explorer/<session> --out .../0b07-location.json` before the server push, then capture an early post-`0x0b07` screenshot while the window is still alive. Promote visual movement only if row/cell diffs and screenshot agree.

## Tactical entry safe-default correction (2026-06-30)
- **User-facing answer**: warp/navigation into the world route is real enough to reach the strategy map, and `0x042f NotifyChangeMode` can be delivered without crashing. This is not a playable tactical GUI yet.
- **Crash split**: live bisection showed `0x042f` alone is safe, while `0x0f1f NotifyTactics` crashes the client with APPCRASH `c0000005`, fault offset `0x0018f83a` (VA `0x0058f83a`, inside `FUN_0058ee70`) when emitted with current prerequisites.
- **Server change**: default battle-entry probes now filter out `0x0f1f`; it is opt-in only with `LOGH_BATTLE_ENTRY_NOTIFY_TACTICS=1` or explicit `LOGH_BATTLE_ENTRY_CODES=0x0f1f`. The natural `0x0348` tactical-table request path now applies the same filter to bundled follow-up steps.
- **Live proof**: `.omo/ui-explorer/tactical-safe-default-47900-20260630` reached the world/strategy UI and emitted `0x0349`, `0x033b`, `0x0341`, `0x0337`, then delayed `0x042f` once. Trace count: `0x042f=1`, `0x0f1f=0`. Screenshot: `.omo/ui-explorer/tactical-safe-default-47900-20260630/shots/005-after-safe-042f.png`.
- **Cleanup**: `ui_explorer stop` restored installed EXE SHA `e0b3fcf29adf799005ce28ede165a9344807e042a3197618852dbc733770c54c` with `shaVerified:true`; post-stop checks showed no `47900` listener and no session client/server PIDs.
- **Still open**: tactical GUI/render remains unfixed; the selected in-world character still presents as "황제", so character identity/profile binding is still a separate blocker.
## World-entry retry loop triage: login/tooling fixed, 0x033b crash isolated (2026-07-01)
- **Question answered**: repeated world-entry attempts were wasting signal until the harness and port assumptions were fixed. The canonical playable `window-login` path reaches the local server only on `127.0.0.1:47900`; non-47900 bisection sessions showed `NO DATA` and zero TCP trace. `RE/tools/logh7_ui_explorer.py` now rejects non-47900 window-login sessions unless `--no-login` is used.
- **Harness fixes**: `RE/tools/logh7_window_login.py` now closes the initial `NO DATA` panel, then types `ginei00` without first-key duplication and `dummy` as password. `RE/tools/logh7_ui_flow.py` also closes the panel before the scripted login flow. `LOGH_BATTLE_ENTRY_STEP_CODES` is accepted as an alias for `LOGH_BATTLE_ENTRY_CODES` in `server/src/server/logh7-login-session.mjs`, so live bisection commands no longer silently send every battle-entry table.
- **Live bisection A**: `.omo/ui-explorer/mode0-bisect-033b0349-47900-fixedlogin-20260701` used `LOGH_BATTLE_ENTRY_DEFER_TABLES=1` and `LOGH_BATTLE_ENTRY_STEP_CODES=0x033b,0x0349`. Trace confirmed the intended minimal preseed: `0x0325 -> 0x033b -> 0x0349 -> 0x0f03`, followed by post-load `0x0f06`. The client crashed with WER `0xc0000005`, fault offset `0x000c9b0b` (VA `0x004c9b0b`).
- **Live bisection B**: `.omo/ui-explorer/mode0-bisect-033b-only-47900-20260701` used `LOGH_BATTLE_ENTRY_STEP_CODES=0x033b`. Trace confirmed `0x0325 -> 0x033b -> 0x0f03` with no `0x0349`, and it still crashed at the same WER fault offset `0x000c9b0b`.
- **RE conclusion**: `0x0349` position is not the direct trigger. The crash is already induced after `0x033b` tactical unit/ship data is accepted. Rechecked crash path remains `FUN_004c9a80` (VA `0x004c9a80`) via tactical/render object lookup `FUN_004c96c0`; `FUN_004c32a0` imports `0x033b` from `clientBase+0x4271a8` and cross-checks it against the `0x0325` unit table at `clientBase+0x41a364`. Next work should inspect/fix the `0x033b` row ids/ship ids/map-section fields against the `0x0325` table, not repeat full world-entry clicks.
## Tactical preseed cross-record fix before next live retry (2026-07-01)

- **RE basis**: `FUN_004c32a0` imports `0x033b` from `clientBase+0x4271a8`, finds the matching `0x0325` unit row by id at `clientBase+0x41a368`, and then uses the UnitShip row's `+0x08` key to find the character table entry under `clientBase+0x36a5dc`.
- **Bug found by byte dump**: when active `charId` was `209`, the battle-entry replay had `0x0323.characterId=209`, but `0x033b +0x08` still defaulted to unit id `1`; the tactical replay `0x0325` also had `cell=0`, `owner=0`, so the spot fallback path in `FUN_004c32a0` could not help.
- **Server fix**: `buildTacticsInformationUnitShipInner` now writes `character/characterId/commander` at `0x033b +0x08` before falling back to mapSection/unit id. The battle-entry `0x0325` preseed now fills faction, commander/focus-cell, cell, owner, spotResolverBase, and mapSection instead of only id/character.
- **Character replay fix**: battle-entry `0x0323` replay now falls back to content/lobby character records when `worldState` has no character, so power/camp are not overwritten with zero during tactical preseed.
- **Server verification**: `node --check server/src/server/logh7-battle-engine.mjs`, `node --check server/src/server/logh7-login-session.mjs`, `node --check server/tests/server/logh7-login-session.test.mjs`, and `node --test server/tests/server/logh7-login-session.test.mjs` passed. New guard: `battle-entry tactical preseed links UnitShip rows to active character and fleet cell`.
- **Not yet claimed**: this is not a live tactical GUI fix until the canonical client is rerun once with `LOGH_BATTLE_ENTRY_STEP_CODES=0x033b` and the previous `0x004c9b0b` crash is checked.

## Tactical 0x033b offset fixed; next gate is 0x0b0a/mode ordering (2026-07-01)

- **Static/RE fix**: re-read `FUN_00421f80` and `FUN_004c32a0`. `0x033b` UnitShip is fixed `0x79e4` bytes with record0 at payload `+4`, stride `0x34`, character/mapSection at record `+8`, and pose at `+0x0c..+0x18`. Server builder and tests now use this layout.
- **Live proof, one run only**: session `.omo/ui-explorer/tactical-033b-offset-47900-20260701` reached world entry with generated character `dummy:2`. Trace sent `0x033b` at `23:21:48.040Z` (`respLen=31210`) and did not reset immediately on that packet.
- **Remaining crash**: delayed `0x042f`/`0x0f1f` were sent at `23:21:56.066Z/067Z`; client then sent a second `0x0f02`, server answered ack-only `0x0f03`, and only later got `read ECONNRESET` at `23:22:07.017Z`. Verified level: `0x033b` immediate crash is cleared; tactical GUI is still not playable.
- **Ordering hypothesis refuted**: RE of dispatcher `0x0b0a` shows `FUN_004c32a0(1)` only runs on the mode-0 path, but RE of `FUN_004c1c30` shows `0x042f` requires `client+0x126718 != 0` and therefore cannot create the pool. Live session `.omo/ui-explorer/tactical-defer-gridend-47900-20260701` sent delayed `0x042f -> 0x0b0a`; before delay probe was `modeByte=2`, `poolHead=0`, `tacticsInfoCount=12`, and after both packets it remained `modeByte=2`, `poolHead=0`, `tacticsInfoCount=12`. Keep `LOGH_BATTLE_ENTRY_DEFER_GRID_END=1` explicit-only; next work should find the real natural writer for mode byte/pool creation, not repeat world-entry.
## Tactical pool gate RE/probe update (2026-07-01)
- **No new live world-entry loop in this pass**: after the `0x042f -> 0x0b0a` ordering hypothesis was refuted, this pass stayed static/read-only except for improving the probe tool and tests.
- **CodeGraph check used**: `.codegraph/codegraph.db` shows canonical `server/src/server/logh7-battle-engine.mjs:buildTacticsInformationUnitShipInner` feeds through `openBattleField`, with incoming server paths from `server/src/server/logh7-login-session.mjs:createLoginSession` and command processing. This confirms the server has a 0x033b delivery route, but not the missing client-side tactical-pool state transition.
- **Mode selector RE**: `FUN_004b68f0` reads `client+0x35f35a`. When nonzero it takes the tactical-entry branch (`FUN_004b63c0(2)`, `FUN_0054e570(1)`, `FUN_004c32a0(0)`). Otherwise it takes the strategic branch (`FUN_004b63c0(0)`, `FUN_0054e570(2)`, `FUN_004c4170(1)`). Static grep finds `client+0x35f35a` only in this function, so treat it as a derived/runtime selector until a writer is proven.
- **Pool writer RE**: `FUN_004c32a0` still hard-gates on `client+0x126711 == 0`. It reads 0x033b data at `client+0x4271a8` / records `+0x4271ac`, cross-checks 0x0325 unit records at `client+0x41a364` / `+0x41a368`, then writes active tactical-pool records under `client+0x126718`. Therefore 0x033b/0x0325 are necessary data, not sufficient by themselves.
- **0x0317 selector write confirmed**: dispatcher `FUN_004ba2b0` case `0x0317 ResponseInformationGrid` writes the incoming body dword to `client+0x35f358`. The mode selector byte is `client+0x35f35a`, i.e. byte 2 of that little-endian dword. Therefore `buildInformationGridInner({ grid: 0x00010000 })` is the byte-correct server-side way to make the next probe read selector byte `1`; generic walker `0x0317` with only body byte0/status `1` leaves selector byte 0.
- **0x0b0a remains non-default**: dispatcher `FUN_004ba2b0` calls `FUN_004c32a0(1)` only when `client+0x126711 == 0`; in mode 2 it only runs `FUN_004c2a80(1)` when begin value `client+0x4376ec == 0`. Do not promote `LOGH_BATTLE_ENTRY_DEFER_GRID_END` without a proven selector/mode transition.
- **Probe improvement**: `RE/tools/logh7_tactical_poke.py probe` now opens only a read handle and reports raw address/hex plus LE/BE for ambiguous 0x0325 and 0x033b counts, first-record dwords, and transition fields `0x126710`, `0x126711`, `0x126718`, `0x2a58f8`, `0x35f358`, `0x35f35a`, `0x357e84`, `0x357e88`, `0x357e8c`, `0x358382`. `poke` remains the only RW path. Next live run should capture this read-only probe before and after any battle-entry push before trying writes.
