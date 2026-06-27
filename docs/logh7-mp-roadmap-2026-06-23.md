# LOGH VII 리바이벌 — 멀티플레이 서버 오픈 로드맵 & 현황

> **업데이트(2026-06-24):** `/grid <cell>` 채팅 명령 폼백 구현(`logh7-command-engine.mjs`). 클라이언트가 `0x0f1c CommandGridChat`로 `/grid 8700`을 본냉하면 서버가 권위적으로 함대를 이동시키고 `0x0b07`을 전체(자신+peer)에 브로드캐스트. **서버 코드/테스트 완료(1058 PASS).** 실제 클라 채팅 UI 입력은 여전히 C002와 동일한 입력 레이어 한계로 미확정. 이 폼백이 작동하면 C002 없이도 cross-client 유저-기원 이동이 가능하므로 M2의 (b) relay-경유 originate 경로 후보가 됨.

**목표 정의(한 줄):** "MP 서버 오픈" = **다수 플레이어가 strict 인증으로 가입·로그인하여 제국/동맹 진영으로 나뉘어 월드에 진입하고, 함대 이동·전투·내정·커맨드를 (유저 자기 의사로) 보내며, 그 결과가 서버 권위로 처리되어 영속화되는 상태가 실클라 4클라 컨텍스트에서 end-to-end로 도는 것**(현재 서버 앵커 `npm run test:server` = 1137 pass/0 fail, canonical playable SHA `c1523a5e`).

> **목표 정의에 관한 정직 단서(검증 반영):** 위 정의의 핵심 동사 "(유저가) 보내며"는 실클라가 마우스로 직접 0x0b01 등 in-world 명령을 originate함을 뜻한다. 후술하듯 **유저 기원 in-world 명령(0x0b01 직접 송신)은 현재 C002로 봉쇄**되어 있다. 서버 권위 우회(probe/relay)는 이 동사를 **부분적으로만** 대체하며(서버가 명령을 만들어 push), "데모/관전 수준 MP"와 "유저 기원 인터랙티브 MP"를 이 문서 전반에서 분리해 표기한다.

---

## 현황 요약 매트릭스

상태 범례: ✓완료(라이브 입증) · ◐부분 · ✗블로커 · ○미착수

| 영역(도메인) | 상태 | 핵심 증거 | MP 필수 |
|---|:---:|---|:---:|
| **클라 RE 커버리지 (P0-06)** | ◐ | **coverage-report 산출 문서(`docs/logh7-function-re-coverage-matrix.md`)는 deep-RE 277/945/10.6%** (게임본체 G7MTClient 277/6089=4.5%). ledger는 294까지 갔으나 wave3 +17이 **coverage 도구로 미재산출**(매트릭스 셀과 ledger 불일치). lightdoc 18,485/18,485(100%). file-RE 9패밀리 중 7 P0 | 부분(핵심경로만) |
| **와이어 프로토콜** | ◐ | 옵코드 양방향맵 P0(recv FUN_004ba2b0 169행+send FUN_004b78a0). 0x0323/0x0b07/0x0313/0x0315/0x0b09/0x0b0a/0x0423 = byte-correct(크기 일치 검증). 0x0325 슬롯시맨틱·0x031f/0x0321 스칼라명 PROVISIONAL. **0x0b01→0x0b07 왕복은 서버측 코드/테스트만**(4클라 라이브 trace 부재) | 예 |
| **서버 권위 게임 엔진 (P0-04)** | ◐ | command-engine processCommand 완성(0x0b01→self-ACK+0x0b07 all-broadcast, `logh7-command-engine.mjs:397-422`). world-state/combat/battle/economy/personnel done. **test:server 1137 pass**. coup/intel/espionage/relations는 인바운드 라우팅 미배선(클라 명령 opcode 미확정) | 예 |
| **콘텐츠/데이터 (P0-02)** | ◐ | content DB(80성계/281행성/6요새/97인물/64함급)+canon-801-07(2:2 진영 24함대) 배선. **소속(faction) 80/80 보유하나 맵·패널 어디에도 미표시**(맵 byte2=spectralClass 우선, 패널 owner=class_ 파생; 소비처 미확정 deep-RE). 천체 0/80·rooms 0·institutions 0 미보유(안전 degrade) | 부분(시나리오만) |
| **멀티플레이 (MP 메커니즘)** | ◐ | 동시세션가드·distinct-unit·교차가시성(0x0325 broadcast)=done+라이브확정(단 0x0325 빌더 88B vs 네이티브 756B 불일치—officer 필드 누락이 가시성 품질에 무영향인지 미검증). 진영 reconcile=partial(node 재현 정상, 라이브 미실증·좌표 빗나감). strict 동일성=partial(기본 acceptAnyGin7=true). **유저 기원 in-world 명령(C002)=blocked** | 예 |
| **라이브 클라/월드진입/렌더 (P0-04)** | ◐ | autologin 월드진입 done(0x7000→…→0x0f02). **0x0b07 서버푸시: 와이어 크기 일치(580B)+디스패치 경로 정적 RE+무크래시 생존만 입증; 클라측 소비/적용은 라이브 미측정**(프로젝트 자체 maker≠checker 검증자가 강등, `loop-state.md` 2026-06-23). C002 유저 송신=blocked. 리마스터/전술맵=partial | 부분 |
| **현지화(한글화)** | ◐ | 이름IME=done(라이브 RESOLVED, 게임 네이티브). 폰트 Pretendard=done. rsrc/MsgDat=partial(라이브 큐). 채팅 cp932 송신=partial(code-cave 미인코딩). **MP 코어에 한글화 비필수(mpBlockers 없음)** | 아니오 |
| **build-ops-deploy-harness** | ◐ | multiclient harness·playable build SHA parity=done. 패키징 단일커맨드 부재·서버 localhost 바인드·exact-cred 로그인 미검증·**리포 non-git**(`git rev-parse` fatal 확인) | 부분 |

---

## 멀티플레이 서버 오픈 로드맵

조사 evidence 기반. **MP critical-path가 아닌 트랙(전수 deep-RE·천체/장소 복구·전술맵 풀렌더·C002 유저송신·리마스터)은 "MP 오픈 후/병행" 트랙으로 분리**한다. 단, 검증 결과를 반영해 **C002는 "데모/관전 MP"의 게이트는 아니나 "유저 기원 인터랙티브 MP"의 게이트임**을 명시한다.

### M0 — 현재 (확정된 기반) ✓

**라이브/테스트로 입증된 상태만 ✓로 기재**(검증 반영, 0x0b07 "클라 소비 입증"은 ✓에서 제외):
- 서버 권위 엔진 코드 완성 + **test:server 1137 pass/0 fail**(앵커).
- autologin 월드진입 풀체인 라이브(`0x7000→0x0020→0x2009→0x0200→0x0313/0x0315→0x0323/0x0325→0x0b09/0x0b0a→0x0f02`). *단, 실행 EXE는 `G7MTClient.autologin.emp1.exe` 부트스트랩 변종(`runClientSha=8a2a2c33`); `c1523a5e`는 expectedSha로, stop 시 복원 검증됨.*
- MP 메커니즘 라이브 확정: 동시세션가드 / connection별 distinct 함대 / 함대 교차 가시성(0x0325 broadcast).
- canon-801-07 2:2 진영 시나리오 기본 배선(loadScenarioInto).
- **0x0b07 서버푸시(부분 입증, ✓ 아님):** 와이어 크기 일치(서버 580B=클라 0x91 dword) + 소비 디스패치 경로 정적 RE(FUN_004ba2b0 case 0xb07→FUN_004bee20→`+0x2a58f8` grid-active 게이트→FUN_00517cd0→FUN_00501e30(0x16) ring enqueue) + 전략맵 무크래시 생존. **클라측 실제 소비/적용·시각 반영은 라이브 미측정.**

**잔여 effort 합:** 0 (단, "0x0b07 클라 적용 라이브 측정"은 M0 완료 항목이 아니라 **M1 critical-path의 실제 선결로 이관** — 아래 의존성 정정 참조).

---

### M1 — 서버 권위 MP "관전/데모 이동" 오픈 (C002 불필요 경로) — effort ≈ M+L

**핵심 통찰(Critical Path 판정 참조): server-authoritative 이동/전투/내정 처리 *코드*는 C002 없이 성립한다.** command-engine이 0x0b01 인바운드를 self-ACK+0x0b07 all-broadcast로 처리하고(완성, test 검증), relay가 0x0b01을 fanout 코드로 보유한다. **다만 현 우회 probe는 own 연결에 self-push할 뿐 진짜 유저-기원/peer-가시 이동을 만들지 못한다**(아래 정직 고지·gap). M1은 **서버푸시 데모/관전 루프를 라이브 입증**하는 단계로 한정한다.

포함 작업:
- **strict 인증 운영 표준화** (멀티플레이/계정등록, *partial→done*, effort M): `acceptAnyGin7=false` + `--account-db` + registry scrypt verify를 운영 기본으로 고정. 4클라 E2E에서 strict 라이브 검증. *선결: 없음(서버 코드 존재).*
- **서버 멀티계정 ops + 비-localhost 바인드** (build-ops, *partial→done*, effort M): exact-credential 폼 로그인 라이브 검증, LAN 바인드(현 localhost only). *선결: strict 인증.*
- **★0x0b07 클라 적용 라이브 측정** (서버엔진/라이브, *미측정→측정*, effort M): **M0에서 강등된 항목.** canonical SHA 컨텍스트 + 4점 메모리 probe(버퍼 도착 / `+0x2a58f8` 게이트값 / 0x16 ring enqueue / 유닛테이블 셀 또는 own-cell A·B)로 "0x0b07이 실제 클라 상태에 적용되는가"를 라이브 측정. *선결: 없음(probe 도구 필요).*
- **0x0b07 서버푸시 데모 가시화 라이브** (라이브, effort S+M): self-push probe로 "서버가 푸시한 이동이 클라에 적용·반영되는지" 데모 검증. **fleet-render own-fleet 마커 case0 1회성 타이밍**이 시각 반영의 추가 조건임을 명시. *선결: 0x0b07 클라 적용 측정.*
- **live20/21 문서화** (라이브, effort S): `loop-state.md`에 정식 등록(현재 cycle 기록은 있으나 evidence 앵커로 미정리), trace.jsonl이 **서버 SEND만** 기록함을 함께 명기.

**M1 산출물 = "다수 플레이어가 strict로 로그인 → 진영 월드진입 → 서버가 푸시하는 이동/전투/내정이 클라에 적용·관전되는 데모 MP"** (유저가 마우스로 직접 명령하는 인터랙티브 입력 및 peer-가시 유저 이동은 미포함 — M2/병행 트랙).

선결 의존성: strict 인증 → 멀티계정 ops/LAN 바인드. 0x0b07 클라 적용 측정은 인증과 병행 가능.
**잔여 effort 합 ≈ M(인증)+M(ops)+M(0x0b07 측정)+S(데모)+S(문서) ≈ 중대 규모.**

---

### M2 — 진영 분리(2:2) + cross-client 이동 가시화 라이브 실증 — effort ≈ L+XL

포함 작업:
- **진영 reconcile 라이브 실증** (MP, *partial→done*, effort M): 서버 `reconcileWorldNation`/`createFactionKey(power===3→alliance)`는 node 재현으로 정상(no-op 확정). 블로커=**하네스 진영클릭 좌표(598,429)가 1920×1080 캐릭생성 라디오를 빗나감**(P3 절차). → 진영선택 화면 캡처 → alliance 좌표 재교정 → `conn powerId 1281` + `world-nation-reconciled` trace 수집.
- **소속(faction) 맵/패널 투영** (콘텐츠/MP UX, *blocked→done*, effort M): **MP의 "진영 나뉘어"가 화면에 보이려면 필수.** 현재 맵 마커 색(0x0313 byte2)은 spectralClass 우선이라 faction 폴백 미발동, 패널 owner는 class_ 파생. 소비처(byte2가 spectral·faction 겸용인지, iVar9+0xa faction-색 해석 여부) **deep-RE 확정 후** 투영. 데이터(faction 80/80)는 보유, 소비처만 미확정 → 추측 승격 금지. *이 항목은 검증이 지적한 "병행 분리가 사용자 체감 진영성과 상충" 갭의 해소로, 병행이 아닌 M2 코어로 승격.*
- **★cross-client 유저-가시 이동 라이브** (MP/라이브, effort XL): "유저 A가 이동 → 유저 B가 봄"은 **A가 실제 0x0b01을 originate해야** 하며 이는 C002로 봉쇄. 따라서 이 항목은 (a) C002 해결 또는 (b) per-connection probe→relay fanout→peer 경로 신설 중 하나를 **새 선결**로 가진다(현 self-target probe는 relay를 경유하지 않음). **순수 self-push probe로는 충족 불가**(검증 dependency 정정).
- **라이브 4클라 2:2 E2E** (MP/라이브, *partial→done*, effort L): 진영분리 + 월드진입 + (서버권위)이동 + 전투 + 영속이 end-to-end로 도는 trace.
- **더티체킹 영속 long-run round-trip** (서버/MP, effort S): 4클라 재시작 후 국고/세수/위치 복구 라이브 E2E.

선결 의존성: M1(strict 인증·관전 데모) → 진영좌표 재교정·소속 투영. cross-client 유저 이동은 C002 또는 relay-경유 probe 신설에 의존.
**잔여 effort 합 ≈ M(reconcile)+M(소속투영)+XL(cross-client 유저이동)+L(2:2 E2E)+S(영속) ≈ 최대 규모.**

---

### M-final — MP 서버 오픈 (배포) — effort ≈ L

> **게이트 정직 단서:** M-final "오픈"이 목표 정의의 "(유저가) 이동·전투·커맨드를 보내며"를 충족하려면 M2의 **cross-client 유저-가시 이동(=C002 또는 relay-경유 originate)** 이 통과해야 한다. 그것 없이 배포하면 "서버 권위 관전/데모 MP"로 범위가 한정됨을 배포물 문서에 명기한다.

포함 작업:
- **패키징 단일 커맨드** (build-ops, *partial→done*, effort L): `player_runtime.py` CLI/main 부재 해소, D3D8.dll+Pretendard TTF+install-pretendard.ps1 동봉 단일 배포물.
- **git 버전관리 복구** (build-ops, *blocked→done*, effort S): `git init`(현 `.git` 비어 있어 non-git; 사용자 지시 시).
- **(선택) P0-05 필러박스 dgVoodoo** (build-ops, effort M): `stretched_4_3` + 와이드 스크린샷 라이브.

선결 의존성: M2(진영분리 E2E + cross-client 가시화 또는 범위 한정 명시).
**잔여 effort 합 ≈ L(패키징)+S(git) ≈ 중간 규모.**

---

### "MP 오픈 후 / 병행" 트랙 (Critical Path 아님)

이들은 **데모/관전 MP의 게이트가 아니다.** 단 C002는 "유저 기원 인터랙티브 MP"의 게이트이므로 병행이되 **목표 정의의 핵심 동사를 닫는 트랙**으로 별표.

- **★C002 유저 기원 0x0b01 직접 송신** (라이브/MP, *blocked*, effort XL): **검증 반영 — "함수RE 100% 완결·순수 구현만 잔존"은 과대 표기였다.** 최신 저널(`.debug-journal.md:4540`)의 C002 결론은 **"근본 블로커는 command send 이전·0x0b07 이전 단계이며, 다음 판별자는 selectable player-owned fleet / command-state population 경로"**로 **근본원인이 아직 열려 있다.** 6-레이어 전략-명령 서브시스템(씬-셋업 패널구성 → catGate → 0x0325 officer 데이터 → 함대선택 hit-test → 명령 카탈로그 빌더 → dispatch)에서 입력 5~8종 우회는 read-only로 광범위 배제됐으나, **command-table category record count=0(`FUN_004f5cb0`가 읽는 `record+0x14` 정렬·원샷 promote 타이밍 미충족)이 현 frontier**(loop-state 2026-06-23). = 실클라 마우스로 직접 명령하는 인터랙티브 UX 및 cross-client 유저 이동의 게이트.
- **전수 deep-RE 8896 전부** (클라RE, effort XL): 사용자 "비트 하나도 빠뜨리지 마" 충족용 장기 캠페인. 데모 MP 게이트 아님.
- **커버리지 행렬 동기화** (클라RE, effort S): 277→ledger 294(wave3 +17 미반영), `tools.logh7_func_coverage_report` 재실행으로 매트릭스 셀 재산출.
- **wave3 verifier partial 16건 정정** (클라RE, effort M): 라벨 swap/throw 주소/opcode tier(0x0323 코어는 별도 확정).
- **천체 astronomy 0/80 · rooms 0 · institutions 0 복구** (콘텐츠, effort M×3): 정보패널/내정 깊이용. 빌더가 []/zero-padded로 안전 degrade. (소속 투영은 검증 반영으로 M2 코어로 이관됨.)
- **전술맵 풀렌더** (라이브/배틀, effort XL): 완전 전술시드 + 클라 mode-render 게이트 deep-RE.
- **생성형 리마스터 / 채팅 cp932 code-cave / constmsg mojibake 5종** (리마스터/현지화, effort L): 표시 레이어, MP 직교.
- **coup/intel/espionage/relations 인바운드 배선** (서버, effort M×4): 클라 명령 opcode 미확정이라 배선 불가(전략 플레이 깊이용).

---

## Critical Path (최단 경로)

MP 서버 오픈에 **반드시** 필요한 항목만 의존성 순서로. **"데모/관전 MP"와 "유저 기원 인터랙티브 MP"를 분기 표기**(검증 반영).

1. **strict 인증 운영 고정** (`acceptAnyGin7=false` + `--account-db` + scrypt verify) → 4클라 strict 라이브 검증. *선결: 없음.*
2. **서버 멀티계정 ops + LAN 바인드** (exact-cred 로그인 검증, localhost→LAN). *선결: 1.*
3. **0x0b07 클라 적용 라이브 측정** (4점 메모리 probe: 버퍼도착/`+0x2a58f8` 게이트값/0x16 enqueue/유닛셀 A·B, canonical SHA). **— M0의 self-push "입증"은 라이브 미측정이라 이 측정이 실제 선결이다(순환 제거).** *선결: probe 도구.*
4. **진영 분리 좌표 재교정 + reconcile 라이브 실증 + 소속 투영** (alliance 라디오 좌표 핀 → power3→alliance trace; faction 소비처 RE→맵/패널 투영). *선결: 1, 2.*
5. **(데모 MP 게이트) 라이브 4클라 2:2 E2E** (진영분리+월드진입+서버권위 이동 적용+전투+영속 round-trip). *선결: 3, 4.*
6. **(유저 기원 MP 게이트) cross-client 유저-가시 이동** = C002 해결 **또는** per-connection probe→relay→peer 경로 신설. **순수 self-push probe로는 불가.** *선결: 5 + (C002 또는 relay-originate 신설).*
7. **단일 커맨드 패키징** (player_runtime CLI + 의존성 동봉). *선결: 5(데모 오픈) / 6(유저 기원 오픈).*

> **C002는 데모/관전 MP critical path(1–5,7)에는 포함되지 않으나, 유저 기원 인터랙티브 MP(6)의 critical path에는 포함된다**(아래 판정).

---

## 알려진 블로커 + 정직 고지

### C002 critical-path 판정 (명시 요청 사항 — 검증 결론 반영)

**판정(이중):**
- **데모/관전 수준 MP** (서버가 명령을 만들어 push, 타 플레이어 함대를 관전): **C002 불필요** — 서버푸시/relay 코드로 우회 가능(방향 타당, 반증 못 함).
- **유저 기원 인터랙티브 MP** (유저가 자기 의사로 이동/전투를 보냄 = 목표 정의의 핵심 동사): **C002 필요** — critical path에 포함.

근거(코드, 강함):
- command-engine이 0x0b01 인바운드를 받으면 `parseInboundMoveGrid → ownership → self-ACK + NotifyMovedGrid 0x0b07(all-broadcast)`로 완전 처리(`logh7-command-engine.mjs:397-422`, test:server 1137 pass).
- world-relay `RELAY_COMMAND_CODES`가 0x0b01 포함(`logh7-world-relay.mjs:21`) — 단 **originating connection이 0x0b01을 보낼 때만** fanout; 클라가 안 보내면 relay 입력이 빔.
- `FLEET_MOVE_PROBE`(`login-session.mjs:1557-1564`)는 C002 없이 서버가 0x0b07을 push할 수 있음을 보임 — **단 own 연결에 self-push(deferredBattleInners)일 뿐, peer relay가 아님.**

근거(라이브, 검증으로 하향됨):
- **0x0b07 "클라 소비/적용"은 라이브 미측정.** 프로젝트 자체 maker≠checker 검증자 패스(`loop-state.md` 2026-06-23): (1)와이어 크기 일치 PASS (2)소비 경로 디스패치 PASS는 **정적 RE뿐** (3)**"클라측 소비/적용은 라이브 미측정(trace는 서버 송신만)"**. 즉 입증된 것은 *디스패치 경로 존재 + 무크래시 생존*이며, "C002 없이 이동이 화면에 반영된다"는 **라이브 미증명**이다.

**정직 고지(우회 경로의 한계):**
- **probe = 데모일 뿐 진짜 유저-기원 MP 이동을 못 만든다.** 현 우회는 own fleet에 server self-push만 한다. "A가 이동→B가 봄"은 A가 0x0b01을 originate해야 하고 그게 C002로 막혀 있다 → **C002는 "인터랙티브 유저 이동"의 critical path가 맞다.**
- own-fleet 마커의 실제 시각 이동은 미확정(fleet-render case0 1회성 타이밍; own-cell +0x11178은 8함수에서 read-only라 0x0b07로 안 바뀜 — 불변은 정합이나 시각 반영 입증은 아님).
- **결론:** C002는 "서버권위 관전/데모 MP"의 게이트는 아니나 "유저가 자기 의사로 이동/전투를 보내는 인터랙티브 MP"의 게이트다. **C002 함수RE 100%·순수 구현만이라는 이전 진술은 철회**(저널 최신 결론=근본원인 열림, 다음 판별자=selectable player-owned fleet/command-state population).

### 통합 mpBlockers

- **C002 (XL, blocked):** in-world 전략 명령 emit 봉쇄. 입력 5~8종 우회 read-only 배제(live8 enqueue 프리미티브 FUN_00501e30 0회, live19 직접구동 시 패널 0x67 미생성 access violation). **현 frontier = command-table category record count=0**(`FUN_004f5cb0` `record+0x14` 정렬·원샷 promote 미충족). 근본원인 미종결. → 데모 MP critical path 아님 / 유저 기원 MP critical path 맞음.
- **0x0b07 클라 적용 라이브 미측정 (M):** 와이어·디스패치·생존만 입증, 실제 상태 적용·시각 반영 미측정. critical path 3번.
- **진영 분리 라이브 미실증 (M, P3):** 서버 로직 정상(node 재현), 하네스 진영클릭(598,429) 빗나감 → 4클라 전부 제국 → reconcile 정상 no-op → 동맹 2명 라이브 미실증. critical path 4번.
- **소속(faction) 맵/패널 미표시 (M):** 데이터 80/80 보유하나 맵 byte2=spectral 우선·패널 owner=class_; 소비처 미확정. "진영 나뉘어"의 체감 게이트. critical path 4번(검증 반영 승격).
- **동일성/인증 운영기본 미고정 (M):** 현 기본 `acceptAnyGin7=true`는 라벨을 비번검증 없이 통과 → 동일성 미보장. strict 표준화 미라이브검증. critical path 1번.
- **cross-client 유저 이동 부재 (XL):** relay 0x0b01 fanout은 코드/단위테스트(`tests/server/logh7-world-relay.test.mjs` 4 tests, stub sendInner)만. 2클라+ 실클라 동시 in-world relay 라이브 trace 부재. self-push probe로 충족 불가. critical path 6번.
- **패키징 단일 커맨드 부재 / 서버 localhost-only 바인드 / exact-cred 로그인 미검증 / non-git (build-ops):** M-final/critical path 2·7번.
- **0x0325 unit record 88B builder vs 756B 네이티브 불일치:** officer 필드(0x24c/0x250) 미기록. **C002 레이어3·직무패널 데이터 소스이면서 동시에 MP 함대 교차가시성(mpVisibility C1)의 와이어이기도 함** — officer 누락이 가시성 레코드 품질에 영향 없는지 미검증(교차가시성 "done+라이브확정"과 0x0325 불완전 사이 검증 공백).

### 라이브 미검증 / 추측 / 미확정 항목 (정직 고지)

(문서 말미 "정직성 고지"에 재집계)

---

## 즉시 다음 작업

1. **strict 인증 운영 표준화 + 4클라 라이브 검증** (critical path 1, effort M): `acceptAnyGin7=false` + `--account-db` + scrypt verify를 운영 기본으로 고정하고, exact-credential 폼 로그인을 4클라로 라이브 검증(현재 미검증). 동시에 서버 LAN 바인드(현 localhost only) 확인.

2. **0x0b07 클라 적용 라이브 측정 probe 구축** (critical path 3, effort M): canonical SHA 컨텍스트에서 4점 메모리 probe(버퍼 도착 / `+0x2a58f8` 게이트값 / 0x16 ring enqueue / 유닛테이블 셀 또는 own-cell A·B)로 "0x0b07이 실제 클라 상태에 적용되는지"를 라이브 측정. **이전 self-push '소비 입증'은 라이브 미측정이므로 이 측정이 데모 MP의 실제 선결.** live20/21을 `loop-state.md`에 정식 등록하되 trace.jsonl이 서버 SEND만 기록함을 명기.

3. **진영선택 화면 캡처 → alliance 라디오 좌표 재교정 + 소속 투영 RE** (critical path 4, effort M): 캐릭생성 진영선택 화면을 1920×1080에서 캡처해 동맹 라디오 좌표를 핀하고(현 598,429 빗나감), 재교정 좌표로 4클라 2:2 생성 → `conn powerId 1281` + `world-nation-reconciled` trace 수집(reconcile 로직 자체는 정상, 좌표만 블로커). 병행으로 faction 색 소비처(맵 byte2 / 패널 iVar9+0xa) deep-RE를 진행해 "진영 나뉘어"의 맵 표시를 확정.

---

## 정직성 고지

검증이 지적한 과대주장·갭·미확정을 한곳에 재집계한다. **라이브 미검증은 "구현됨(라이브 미검증)", 추측은 추측으로 표기.**

**과대주장 정정(이 문서에서 하향한 항목):**
- **0x0b07 "클라 소비 입증"** → *와이어 크기 일치 + 디스패치 경로 정적 RE + 무크래시 생존*으로 하향. **클라측 실제 소비/적용·시각 반영은 라이브 미측정**(프로젝트 자체 maker≠checker 검증자가 강등, `loop-state.md` 2026-06-23; trace.jsonl은 서버 SEND만 기록). 따라서 M0 "확정 기반"에서 제외하고 critical path 3번(라이브 측정)으로 이관.
- **C002 "함수RE 100% 완결·입력 우회 전수 배제·순수 구현만 잔존"** → 철회. 최신 저널(`.debug-journal.md:4540`) 결론은 **근본 블로커가 command send 이전·0x0b07 이전이며 다음 판별자=selectable player-owned fleet/command-state population**으로 **근본원인 열림**. 현 frontier=command-table category record count=0.
- **canonical SHA c1523a5e 라이브 증거 맥락** → 실행 EXE는 `runClientSha=8a2a2c33`(autologin emp1 부트스트랩 변종); `c1523a5e`는 expectedSha이며 stop 시 복원 검증. 변종은 무클릭 월드진입 vehicle(치명적 아님)이나 "canonical SHA가 실행됐다"로 읽히지 않게 명시.
- **클라 RE 커버리지** → coverage-report 산출 문서 기준 **277/945/10.6%**(G7MTClient 277/6089=4.5%). ledger 294는 wave3 +17이 coverage 도구로 **미재산출**이라 매트릭스 셀과 불일치(추정/전방투영 수치를 현재값처럼 쓰지 않음).

**라이브 미검증(코드/테스트만 존재):**
- 0x0b07 클라 적용/시각 반영(4점 메모리 probe 미실행), 0x0b01→0x0b07 4클라 왕복 trace, strict 모드 4클라 E2E, exact-cred 폼 로그인, 진영 분리(동맹 2명 실현), 소속(faction) 맵/패널 표시, cross-client 유저-가시 이동(2클라+ relay 라이브), 더티체킹 long-run 영속 round-trip, NPC 함대전 4클라 재검증, P0-05 필러박스, 서버 LAN 바인드.
- **probe ≠ 유저 기원 MP:** FLEET_MOVE_PROBE는 own 연결 self-push(`login-session.mjs:1557`)일 뿐 peer relay가 아니다. relay 0x0b01 fanout은 stub sendInner 단위테스트(4 tests)만. "A가 이동→B가 봄"은 라이브로 한 번도 입증된 적 없다.

**추측 / P3(원본 서버데이터 아님 — 과장 금지):**
- 전투/피해/지상전 공식(SERVER DESIGN; 클라는 current=max-wire 렌더만이라 RE 불가), planet-economy 전체(절차생성), canon-801-07 fleet.commander 대부분 0(캐논 char-id 매핑 부재)·supply=100·troop 수치, plasma storm 셀(의도적 랜덤), command-range 상한/충전속도, 0x0325 슬롯 시맨틱(commander/owner/cell/faction), NotifyMovedGrid header dword0-3(서버 기본 0).

**PROVISIONAL(라이브 핀 권장):**
- 0x031f base 스칼라 ~25개 NAME↔offset, 0x0321 institution/spot 스칼라명, 분광형 이름별 등급(model_node_order_provisional), 0x0325 officer 필드(0x24c/0x250) 누락의 교차가시성 영향, `+0x2a58f8` grid-active 게이트가 autologin 자연 세션서 set되는 조건.

**미확정(deep-RE 필요):**
- faction 색 소비처(맵 0x0313 byte2가 spectral·faction 겸용인지 / 패널 owner iVar9+0xa faction-색 해석), C002 command-table `record+0x14` 정렬·원샷 promote 타이밍, fleet-render own-fleet case0 1회성 타이밍, cross-client relay-originate 경로(C002 외 대안 존재 여부).

**문서/리포 상태:**
- 커버리지 행렬 G7MTClient 277 stale(ledger 294, wave3 +17 미반영) — `tools.logh7_func_coverage_report` 재실행 필요.
- live20/21은 `loop-state.md` 2026-06-23 사이클에 기록되어 있으나 evidence 앵커로 미정리(trace는 서버 SEND만).
- **리포가 non-git 상태**(`.git`에 `info/`만, `git rev-parse --git-dir` = fatal). 버전관리 복구는 `git init` 사용자 지시 대기.

---

> 생성: Workflow `logh7-mp-roadmap`(8도메인 병렬조사→합성→적대검증→최종, 11 에이전트). 현황 앵커는 2026-06-23. 검증자 정정 반영(0x0b07 라이브 미측정·C002 근본 미종결·self-push≠peer-relay·coverage stale). 이어가기 시작점=이 문서 + `docs/logh7-loop-state.md` 최신 사이클 + `docs/SESSION-HANDOFF-2026-06-23.md`.
