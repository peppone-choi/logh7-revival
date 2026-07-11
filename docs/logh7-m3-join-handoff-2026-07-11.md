# M3 핸드오프 — char↔unit 조인 오프셋 시프트 (2026-07-11)

세션 중단 시점 상태 스냅샷. 다음 세션은 이 문서 하나로 재개 가능해야 한다.

## 현재 위치

- **M3 월드진입 하드크래시(exit 0xc0000005)는 해소 완료.** 근본원인 = 0x0325 유닛
  count 필드 엔디안 — 클라 게이트 FUN_00419ca0(0x419cda `cmp ax,600`)이 count를
  바이트스왑해 읽으므로 서버가 **BE**로 보내야 한다. 커밋 `93fcf150`. 라이브 생존
  5/5 확인(evdir `m3-close-BEtree-20260711-164722`).
- **남은 마지막 블로커 = 유닛 미표시.** 크래시는 없지만 전략맵에 유닛이 안 뜨고
  旗艦情報가 "NO TABLE". 원인은 char↔unit 조인 실패로 국소화 완료(아래).

## 조인 실패 — 확정된 사실 (정적 RE + 라이브 실측 수렴, 2026-07-11)

정적(re-0325-handler, 정본 EXE 실바이트 capstone)과 라이브(qa-marker2, Frida)가
독립적으로 수렴한 결론:

1. **양쪽 테이블 모두 정상 적재된다.** 클라 unit 테이블 ucnt=25, char 테이블
   ccnt=1, emit 순서도 정상(0x0b09→0x0325→0x0323→0x0b0a). 0x0b09가 char count
   (session+0x36a5dc)를 0 리셋하므로 이 순서는 필수.
2. **조인 로직(FUN_004c2c80):** `0x4c2b55 mov edi,[ebp+0x24]`(char.flagship@0x24)
   ↔ `0x4c2b5e cmp edi,[edx]`(unit.id@0x00). 둘 다 read-U32, 엔디안 무관.
3. **실측 미스매치:** unit.id@0x00=1인데 char struct **@0x24=0** → 조인 실패
   ("unit not found" 0x770f9c) → 미스테이징 → NO TABLE.
4. **핵심 발견 — 4바이트 시프트:** 서버 0x0323 wire는 spot@0x1c=1, @0x20=0,
   flagship@0x24=1(BE)로 정상 송신(`_dump0323char.mjs`로 실덤프 확인,
   `buildInformationCharacterInner` logh7-world-records.mjs:257). 그런데 클라
   char struct는 @0x20=1, @0x24=0. **서버가 wire@0x24에 쓴 flagship이 클라
   struct@0x20에 안착** — 클라 0x0323 파서(FUN_00417390)의 wire→struct 필드
   매핑이 서버 레이아웃과 4바이트 어긋난다. id@0x00=1, faction@0x04=2는 정확히
   안착하므로 어긋남은 중간 필드부터 시작(가변 필드 or 오프셋 해석 차이).
   - 정적 단서: FUN_00417390 vtable7 @0x417471이 `[stream+0x1c]` read-U32/BE로
     struct+0x24를 채움 — stream 기준점이 payload 시작과 다를 가능성.
   - 증거 evdir: `m3-charstage-20260711-171320` (charstage.jsonl).
   - 주의: 앞선 "char 레코드 전부 0" 보고는 qa-marker2 프로브의 g_base 오프셋
     버그(핸들러 this를 clientBase로 오인)였고 정정 완료. 신뢰할 것은 이 문서.

## 다음 액션 (재개 시 이 순서대로)

1. **re-analyst(opus)에 위임:** FUN_00417390 내부의 0x0323 wire→struct 전체 필드
   매핑을 정본 EXE 실바이트로 확정. 특히 struct@0x24(조인키)가 wire 어느 오프셋에서
   오는지. Ghidra 주소는 드리프트 있으니 capstone/라이브 대조 필수.
2. **fix 방향 두 후보 중 매핑 결과로 택1:**
   - (a) 조인이 실제로 char@0x20을 읽는다면 → 서버 그대로 OK(값 1이 이미 @0x20에
     안착) — 단 정적 근거(0x4c2b55는 +0x24)와 상충하므로 가능성 낮음.
   - (b) 조인이 @0x24를 읽는다면(정적 근거) → 서버가 flagship을 **struct@0x24로
     매핑되는 wire 오프셋**에 써야 함. 빠른 경험적 후보: 시프트가 +4이므로
     wire@0x28에 unitId를 써보는 A/B 라이브 테스트가 최단 판별.
3. 서버 수정 → `_dump0323char.mjs`로 wire 재확인 → live-qa로 struct@0x24=1,
   activeCount>0, 유닛 렌더, 旗艦情報 테이블 채워짐 확인.
4. 성공 시 M3 6항목 전체 재검증 → ultragoal `G001-m3` 체크포인트.

## 라이브QA 제약 (반복 함정 — 어기면 세션 낭비)

- 클라 서버포트 47900 고정 → **라이브 에이전트 동시 1개만.**
- g7mtclient는 **함수 경계 훅만** 허용 — 함수 중간 인라인 훅은 자체 크래시
  (0x4046c2 오탐 사례). 크래시 보고는 훅 아티팩트인지 먼저 의심.
- Ghidra DB는 -sjis 사본 기반이라 주소 드리프트 — 정본 EXE
  (`artifacts/logh7-install/…/exe/g7mtclient.exe`, sha256 9c97de2a…) 실바이트로
  검증. 라이브 측정이 ground truth.
- 라이브 위임 브리프에 방어적 맥락(죽은 게임 보존·자체서버 호환) 명시 —
  누락 시 안전필터로 에이전트 거절.

## 이번 세션 커밋 (시간순)

`0e7238f7`(얼굴 플레이스홀더 시드) → `5663185a`(0x0f07 유휴사망 해소) →
`1327855c`(CD 재추출 툴체인+테스트, 무결 판정) → `83a52a5e`(count LE — **오판**,
이후 되돌림) → `3ed32b1e`(EXE 패치 감사 매니페스트) → `ec242304`(emit 순서) →
`27aadfaa`(0x0b09/0x0b0a 괄호) → `93fcf150`(count BE 복원 — 크래시 해소).

## M3 이후 대기 중인 것

- **M4 전략 커맨드:** 0x0b01↔0x0b07 이동은 문서+핸들러 준비됨. 나머지 0x0b 계열
  wire RE 필요. SelectGrid HUD H1–H5 게이트가 잠재 블로커. 전략맵 출력 필드
  백로그(거점 패널·캐릭 스탯·함대 수치 — 서버 미충전)는
  `docs/reference/legacy-evidence/logh7-strategic-output-fields.md`.
- **M5 전술:** 프로토콜 문서화 완료(`logh7-tactical-movement-wire.md`), 동시성
  설계 방침 확정(전략=이벤트+동기 projection, 전술=틱 단일라이터 — 메모리
  `server-concurrency-design`).
- **게임규칙 스펙:** 2004 일본 공식 패치 로그가 M4~M6 정답
  (`logh7-2004-official-patch-stack.md`). 추측 구현 금지.
- **리마스터 Phase R:** 자산 인벤토리 완료(`logh7-remaster-asset-inventory.md`),
  2D부터 착수, 3D는 MDX 디코더 선행 필요.
- **M6 오픈이슈:** 언팩 String.txt 3개 0바이트(추출 무결은 확인됨 — 커밋
  `1327855c`).
