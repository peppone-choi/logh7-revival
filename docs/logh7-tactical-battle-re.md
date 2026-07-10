# LOGH VII — 전술맵(전투) 진입·렌더·명령 와이어 계약 (정적 RE 종합)

**대상 EXE(정본):** `artifacts/logh7-install/…/exe/g7mtclient.exe` sha256 `9c97de2ae426f011…` (ImageBase 0x400000, ASLR off). 이 EXE의 실바이트로 검증. **파일오프셋 → VA 매핑은 이 EXE에서 `VA = fileoff + 0x400000`** (아래 §11 검증 로그로 확정).

**작성 근거:** 이전 사이클 배틀 RE 4종(`docs/reference/legacy-evidence/logh7-proto-battle-core|fire|fleetops.md`, `logh7-mode0-breakthrough-2026-06-26.md`, `logh7-tactical-mode0-o1-resolution-2026-06-29.md`) + 공식 매뉴얼(`docs/reference/gin7manual.pdf`) + **본 사이클 정본 EXE 바이트 검증**. 함수 주소/크기는 이전 Ghidra 함수테이블(`.omo/re-galaxy/functions.tsv`)로 전수 대조 확인. 프레이밍: C→S inner = `[u16 BE code][LE body]`; S→C conn3 = message32 `[u32 0][u16 BE code][LE body]`. 바디 필드는 리틀엔디언, float는 IEEE-754 LE.

---

## 0. 핵심 결론 (TL;DR — 서버가 무엇을 해야 하나)

전술맵(=전투 씬)은 **두 개의 독립 메커니즘**으로 구성된다. 이전 두 문서가 상충한 것은 이 둘을 혼동했기 때문이며, 본 사이클에서 바이트+매뉴얼로 화해시켰다.

1. **씬 진입(전략맵 mode2 → 전술맵 mode0)** — **서버 권위**로 두 적대 함대가 같은 그리드 셀에 공존할 때 발생(매뉴얼 확정). 클라 요청 아님. 클라 내부에서 world-entry 래치(`FUN_004b68f0`)가 셀렉터(`+0x35f35a`)를 보고 전술 필드 임포트(`FUN_004c32a0`)를 돌려 전술 풀(`+0x126718`)을 활성화한다. 서버 레버 = `0x0317` 셀렉터 + 재arm(`0x0b0a`/`0x0f1f`) + 전술 소스 워크(`0x33b`).
2. **전투 데이터 시딩·유지** — 씬이 활성화된 뒤 `0x42f NotifyChangeMode`가 참가 함선의 스폰 포즈/태세를 전술 풀에 심고, 이후 이동/공격/피해 노티파이(`0x423`/`0x426`…)가 전투를 구동한다.

**교정(load-bearing):**
- `mode0-breakthrough`의 "**`0x42f`는 `FUN_004ba2b0` 최상위 switch에 case 부재**" 주장은 **틀렸다.** 정본 EXE에서 case 0x42f는 물리적으로 존재한다(§11 바이트 증거: `DAT_00433694` 참조가 dispatcher 본체 VA `0x4bc177`에 유일 존재). 단, `mode0-breakthrough`가 옳았던 부분은 "**0x42f가 씬을 flip하지 않는다**"는 것 — 0x42f 적용부(`FUN_004c1c30`)는 전술 풀이 **이미 활성**(`+0x126718!=0`)일 때만 동작하고 mode_byte를 쓰지 않는다.
- `proto-battle-core`가 `0x0411/0x42f`를 "the authoritative mode-transition / battle entry"로 라벨한 것은 **부정확.** 매뉴얼로 확정: **`0x0411 CommandChangeMode` = 【態勢変更】(태세 변경, 항행/碇泊/駐留/戦闘 4종)**, `0x42f`의 modeKind 4/5/6/7 = 그 태세 결과. 즉 이 쌍은 **씬 진입이 아니라 전투 내 함선 태세 변경**(+초기 스폰 포즈 시딩)이다.

---

## 1. 두-씬 모델과 진입/종료 트리거 (매뉴얼 확정)

매뉴얼(`gin7manual.pdf`)이 게임 규칙 레벨에서 진입/종료를 확정한다.

- **게임 구조(p.9,12):** 「戦略ゲーム」(전략)과 「戦術ゲーム」(전술=전투)의 2모드. 전술 진입 시 그 캐릭터는 전략 코맨드 일체 입력 불가 → 클라의 mode0/mode2 **배타** 렌더 게이트와 정합(`FUN_004b68f0` switch: `mode_byte==0`이면 mode0 소비, `==2`면 mode2 소비, 동일 프레임 배타).
- **발생 조건(p.46):** 「銀河内のひとつのグリッドにおいて、味方勢力のユニットと敵勢力のユニットが同じグリッドに存在した場合」 = **은하 그리드 한 셀에 아군·적군 유닛이 공존하면 전술 게임 발생.** → 서버가 전략 그리드 셀 공존을 감지해 전술 세션을 개시. 클라발 트리거 아님.
- **종료 조건(p.46):** 「敵勢力のユニットが1つも存在しなくなった場合」(적 유닛 전멸) + 「惑星/要塞が存在するグリッドでは…全ての惑星/要塞を占領した場合」(성계/요새 셀은 추가로 전 점령). → 서버가 한 진영만 남으면 전술 세션 종료.
- **시간(p.10):** 전술도 전략과 동일 실시간(실1초=게임24초)으로 흐른다. RTS형. → 전투는 턴제 아님, **실시간**. 명령의 「実行待機時間」(대기)·「実行所要時間」(소요)은 명령 바디의 base/len 시간앵커로 매핑(§5).

---

## 2. 씬 진입 메커니즘 — 전략(mode2) → 전술(mode0) flip

전술 풀·전략 풀은 같은 월드 객체(`DAT_007ccffc`, 이하 `client`)의 별도 영역이다.

| 필드 | 의미 | 라이터 |
|---|---|---|
| `client+0x126710` | 현재 mode word = `(modeKind<<8)\|1`(필드 활성) / `0`(없음). byte `+0x126711` = modeKind. | `FUN_004c45f0` |
| `client+0x126714` | 활성 필드 id | `FUN_004c45f0` |
| `client+0x126718` | **전술 엔티티 풀**(≈0x5fc77 dword ≈1.5MB). byte[0]=전술 활성 플래그, 이후=엔티티 해시테이블. | `FUN_004c45f0(.,modeKind=0)`이 zero+활성 |
| `client+0x2a58f8` | **전략 그리드 풀**(≈0x6959 dword). byte[0]=전략 활성. | `FUN_004c45f0(.,modeKind=2)` |

**필드 할당자 `FUN_004c45f0(client, fieldId, modeKind)` @0x4c45f0 (172B):**
- `modeKind==0` → 전술 풀 `+0x126718` zero+활성, `+0x126710=(0<<8)|1`, `+0x126714=fieldId`. **← "전술 진입".**
- `modeKind==2` → 전략 풀 `+0x2a58f8` 활성. **← "전략".**

**mode_byte(`+0x126711`)의 유일한 실제 라이터 = `FUN_004c45f0`뿐**, 그 호출자는 정확히 2개(redex 전수):
- `FUN_004c4170`(전략 import, @0x4c4170 203B) → `FUN_004c45f0(.,2)`. 호출자 `FUN_004b68f0` 단독(월드진입 latch).
- `FUN_004c32a0`(전술 import, @0x4c32a0 3765B) → `FUN_004c45f0(.,0)`. 호출자 `FUN_004b68f0` + `FUN_004ba2b0`.

**world-entry 래치 `FUN_004b68f0` @0x4b68f0 [A] 블록(1회 self-latch `+0x35837f`):**
```
if (client[0x35837f] == 0) {                 // 1회만
    client[0x35837f] = 1;
    iVar7 = 2;                               // 기본 = 전략(mode2)
    if (client[0x35f35a] != 0) iVar7 = 1;    // ★ selector != 0 → 전술(mode0)
    if (iVar7 == 1) { FUN_0054e570(); FUN_004c32a0(); }  // 전술 import
    else            { FUN_004c4170(); }                  // 전략 import
}
```

**셀렉터 `+0x35f35a`를 쓰는 와이어 = `0x0317 ResponseInformationGrid`.** `FUN_004ba2b0` case 0x317: `*(client+0x35f358) = *param_3`(payload dword 전체). 셀렉터 바이트 `+0x35f35a` = 그 dword의 **byte[2]**. 서버가 `grid=0x00010000`(byte[2]=1)로 emit → `+0x35f35a=1` → 전술 선택.

**래치 재arm(1회 latch를 다시 통과):**
- `0x0b0a NotifyEnterGridEnd` case: `mode_byte==2 && +0x4376ec!=0` → load 재arm(`+0x357e84=0`, `+0x357e88=1.0f`, `*client=1`, `+4=1`). (`0x0b09`가 `+0x4376ec`=begin value 세팅.)
- `0x0f1f NotifyTactics`(→`FUN_004c1b20` @0x4c1b20 262B): `(+0x2a58f8!=0 || +0x126718!=0)` 게이트서 동일 재arm.

> **확신도:** FSM 구조/오프셋 = **높음**(redex+함수테이블 대조). 셀렉터 `+0x35f35a`가 [A]의 실제 mode 선택자인지·재arm이 [A]를 재실행하는지·selector와 0xb0a 도착 타이밍 = **라이브 게이트**(O2/O3/O5, `mode0-breakthrough` §b). 씬 진입은 서버 emit 순서에 민감하므로 **라이브 프로브 필수**(§10).

---

## 3. 전술 필드 데이터 소스 — 풀 채우기 (렌더 데이터)

전술 풀 활성만으로는 화면이 비어있다. `FUN_004c32a0`(전술 import)가 `+0x404xxx` 소스 테이블을 순회해 객체를 alloc(`FUN_004c46a0`)해야 풀이 찬다. **이 소스 테이블의 유일한 외부 라이터 = 인바운드 와이어 디스패처 `FUN_004ba2b0`** (redex 전수: `+0x4040dc`/`+0x4271a8` 라이터는 `FUN_004ba2b0` write + `FUN_004c32a0` read 2개뿐) → **순수 서버푸시 레버.**

| opcode | 이름 | 목적지 | 크기(dword) | 필수? |
|---|---|---|---|---|
| `0x33b` | ResponseTacticsInformationUnitShip | `+0x4271a8` | `0x1e79` | **필수(유닛 풀)** |
| `0x345` | TacticsInformationBase | `+0x4040dc` | `0x81` | 선택(성계/요새 有 셀만) |
| `0x33f` | TacticsInformationCorps | `+0x4044b8` | `0x2329` | 선택(base 하위) |
| `0x341` | TacticsInformationFillShip | `+0x40d15c` | `0x1771` | 선택 |
| `0x347` | InformationObstacle | `+0x4042e0` | `0x76` | 선택(장애물) |

**O1 해소(확정, `tactical-mode0-o1-resolution`):** `FUN_004c32a0` 디컴파일 제어구조상 `0x345 Base` 블록은 `if(count!=0)`로 게이트되어 없으면 통째 스킵(하드 abort 없음). base 하위(corps/obstacle)는 base 블록 내부 중첩. **월드진입 경로에서 `0x33b` unit 블록은 base 유무와 무관하게 실행** → **전술 유닛 풀의 필요충분 소스는 `0x33b` 하나.** 0x345 등은 base/장애물 enhancement이지 blocker 아님.

**`0x33b` 레코드(대응 요청 `0x033a`):** 파서 `FUN_00421f80`(CSV 변형 `FUN_00422190`이 필드 순서 노출), 검산 `4(헤더)+600×52 = 31204 = 0x79e4`. **레코드 52바이트/600함선.** 필드(id, byte, byte, u32, float 런=스탯블록) 순서는 CSV 리더로 확인 가능하나 개별 필드 라벨은 추가 RE 필요 → 서버는 현재 generic zero-fill(빈 유닛함 테이블). 스탯 정본이 없으면 조작 금지.

**3D 필드 빌더:** 풀 활성+충전 후 MainLoop `FUN_004e96f0` → `FUN_004b68f0` → **FieldMake `FUN_004b64c0`**(@0x4b64c0 881B)가 프레임마다 `FUN_004be440/004be520/004be4d0`(유닛당 모델셋업, 최대 600슬롯 stride 0x9ec)로 온스크린 전투를 materialize.

> **주의(전략맵 렌더 크래시):** 전술로 잘못 전환하거나 빈 그리드 역참조 시 전략 렌더러 `FUN_0058ee70`(@0x58ee70 2698B, fault VA 관측 `0x58f83a`)가 access violation. 씬 전환은 데이터가 준비된 뒤에만 트리거.

---

## 4. `0x42f NotifyChangeMode` — 함선 포즈·태세 그랜트 (S→C, 교정된 위상)

case 0x42f는 정본 EXE에 **존재**(§11 검증). dispatch size `0x298`(664B), 적용부 `FUN_004c1c30`(@0x4c1c30 235B) → `FUN_004c1d20`(@0x4c1d20 159B). **전술 풀이 이미 활성일 때만 참가 함선의 스폰 포즈+태세를 심는다**(씬 flip 아님).

**바디(0x298, 와이어는 count만큼 packed):**
| Off | Sz | Type | Field | 의미 |
|---|---|---|---|---|
| 0x00 | 4 | u32 | field0 | 헤더(cookie/seq) |
| 0x04 | 1 | u8 | **modeKind** | `FUN_00610420` low byte. **태세 결과(4/5/6/7)** → §8 매핑. `FUN_004c1d20` param_6. |
| 0x08 | 4 | u32 | **fieldOwnerId** | 필드 앵커(mode0 lookup `FUN_004c7cd0(pool,id,0)`) |
| 0x0c | 1 | u8 | **unitCount** | 참가 포즈 수(1..32) |
| 0x10 | 20×N | struct[] | **participants** | 함선당 스폰포즈 stride 0x14 = `{u32 shipId; f32 heading; f32 x; f32 z; f32 y}` |
| 0x290 | 4 | u32 | tail0 | 새 필드obj `+0x40`(전투클럭/카메라 추정) |
| 0x294 | 4 | u32 | tail1 | 새 필드obj `+0x44` |

적용: 각 참가함선 `ship+0x14=x`, `+0x1c=z`, `+0x24=heading`(연속 float XZ, `NotifyMovedShip 0x423`과 동일 좌표계), 앵커 상대오프셋 `+0x50/+0x58`, 태세 `ship+0x5c4 = modeKind맵`. 첫 배치 시 필드/턴 객체 alloc.

**echo:** case 0x411(C→S CommandChangeMode의 OK echo)은 0x98 struct 152B를 `DAT_004335fc`에 복사(북키핑). 실제 상태변화는 0x42f로.

---

## 5. 전투 명령 계약 (C→S) — 전술 코맨드 전량

공통 헤더(모든 명령): `0x00 u32 time/base`, `0x04 u32 wait/len`, `0x08 u32 field8`(슬랙). `base+len - now()` = 명령 타이머 `entity+0x5c0/0x5bc`(매뉴얼 「実行待機時間」과 정합). count는 대개 `@0x0c u8`(≤32), id배열 `@0x10 u32 stride4`. 스트림 게터 폭: `+0x0c`=f32, `+0x1c`=u32, `+0x20`=u16, `+0x24`=u8, `FUN_00610420(dst,1,0,2)`=1바이트 raw.

| code | 이름(매뉴얼 커맨드/키) | size | 파서 | 바디 핵심 |
|---|---|---|---|---|
| **0x0400** | CommandMoveShip(이동) | — | `FUN_0049a5d0` | 참조 `docs/logh7-moveship-wire.md`. entry 20B `{id,heading,x,z,y}` |
| **0x0401** | CommandTurnShip(방향전환) | 0x114 | `FUN_0049b040`→`FUN_004bef70` | entry 8B `{u32 id; f32 heading}`, tail f32@0x110. 순수 회전(entity+0x62=3) |
| **0x0403** | CommandReverseShip(후진) | 0x114 | (relay, TurnShip형) | 8B/entry `{id,f32}`. 클라 relay만 |
| **0x040a** | CommandStop(정지) | 0x114 | (relay) | 8B/entry `{id,f32≈0}`. id리스트가 본질 |
| **0x0404** | CommandWarpShip(워프) | 0x90 | `FUN_0049c5a0`→`FUN_004bfc40` | id리스트만(목적지 없음→서버가 결정) |
| **0x0405** | **CommandAttackShip**(攻撃命令 r) | 0x98 | `FUN_0049ca30`→`FUN_004bfc40` | count@0xc + attackerIds@0x10 + `weaponType@0x90` + `targetId@0x94`. **지속/자동 공격** |
| **0x0406** | **CommandShootShip**(射撃命令 e) | 0x98 | `FUN_0049cf90` | Attack과 동일 + `aimMode@0x91`. **지정 1회 사격** |
| **0x0407** | CommandFight(백병/보딩) | 0x24 | `FUN_004c1070` | `attackerId@0x0c` + `targetId@0x20`. 공격자 fight latch(+0x5c4=3) |
| **0x040e** | **CommandAirBattle**(空戦命令 w) | 0x98 | `FUN_004c0a80` | count@0xc + attackerIds@0x10 + `targetId@0x94`. 대상종별로 対艦戦/迎撃戦 자동(faction byte +0xa/+0xb로 kind 4/5) |
| **0x0408** | CommandSuggestion(제안) | 0x18 | `FUN_004b81ae send` | `targetId@0x0c`+`type@0x10`+`arg@0x14`. 응답 0x0430 unwired |
| **0x0409** | CommandEncourageFlagship(격려) | 0x10 | (simple) | `flagshipId@0x0c`. → 0x42c |
| **0x040b** | CommandAdmission(입항) | 0x94 | `FUN_0049e340` | 4-dword hdr, `targetId@0x0c` + `target_size@0x10` + ids@0x14 |
| **0x040c** | CommandControl(操船パネル) | 0x20 | text `FUN_00495b70` | `unit@0x0c`, `condenser@0x10 u16`, `beam@0x12`, `shield[6]@0x14`, `engine@0x1a`, `warp@0x1b`, `sensor@0x1c`. 서브시스템 전력배분 |
| **0x040d** | CommandFileFleet(隊列命令 v) | 0x294 | `FUN_0049ec60`→`FUN_004bf0c0` | MoveShip형 20B entry × N + `flag@0x290`(0=해제,1=편성). **진형 그룹화+이동** |
| **0x040f** | CommandSortieTroops(陸戦隊出撃) | 0x94 | `FUN_0049f860`→`FUN_004be8c0` | count@0xc + unitIds@0x10 |
| **0x0410** | CommandEvacuateTroops(陸戦隊撤収) | 0x90 | 〃 | 동일 레이아웃 |
| **0x0411** | **CommandChangeMode(態勢変更)** | 0x98 | `FUN_004a01e0`→`FUN_004be8c0` | count@0xc + unitIds@0x10 + `tail0@0x90`(sub-mode) + `tail1@0x94`. **태세 4종(항행/碇泊/駐留/戦闘)** — 클라는 타이머만 스탬프, 실제 태세는 0x42f로 |
| **0x0412** | CommandSortie(함선 출격) | 0x90 | 〃 | id리스트 |
| **0x0413** | CommandRepairFleet(수리) | 0x14 | `FUN_004c13a0` | `targetId@0x0c` + `sourceId@0x10`. tag entity+0x5c4=2 |
| **0x0414** | CommandSupplyFleet(보급) | 0x14 | `FUN_004c14a0` | 〃 tag=1 |
| **0x0419** | CommandShootFortress(요새포) | 0x14 | `FUN_004bfa10` | `fortressId@0x0c`(base table) + `angle@0x10 f32`. 射線상 전 유닛 자동명중(우군오사 가능) |
| **0x041a/1b/1c** | Admission/Repair/SupplyBase | 0x94 | (admission형) | base 대상 |
| **0x041f** | CommandMoveFortress(이동요새) | 0x1a4 | `FUN_004a35b0` | `fortressId@0x0c` + 시작 xyz + `count@0x20` + waypoints@0x28 stride12 |
| **0x0420** | CommandChangeAuthority(지휘권) | 0x94 | `FUN_004a3d60`→`FUN_004c08e0` | count@0xc + unitIds@0x10 + `newCommanderId@0x90` |
| **0x0421** | CommandMission(임무) | 0x98 | `FUN_004a4250` | count@0xc + unitIds@0x10 + `flagA@0x90` + `flagB@0x91` + `missionTarget@0x94` |
| **0x0422** | CommandEmergencySupply(긴급보급) | 0x14 | (simple) | targetId@0x0c(추정) |
| **0x0b01** | CommandMoveGrid(전략 이동, 전술과 별개) | — | `FUN_004b3b20`→`FUN_004b78a0 case0x3a` | reply 0x0b07. `+0x35837e` ready 게이트 |
| **0x0b06** | CommandSwitchMode(전략 그리드 뷰 스위치) | 0x164 | `FUN_0044a880` | unitIds≤70@0x18 + charIds≤10@0x13c. **전투 진입 아님** |

> 확신도: 카운트/id배열/타깃/무기바이트 오프셋 = **높음**(파서+적용부 일치). 단일-id simple 명령(0x408/0x409/0x422)의 개별 필드 = **중간**(count 루프·에러문자열 없음, dispatch size+형제 형태로 추론).

---

## 6. 전투 해소 모델 — 피해/파괴 노티파이 (S→C)

노티파이는 **결과값(델타 아님)**을 싣는다. 서버가 새 HP/실드를 결정해 보내고, 클라는 델타를 팝업 텍스트용으로만 재계산. u16 스탯은 와이어에 **`maxStat − 목표값`**으로 인코딩(클라가 다시 뺌), `0xffff`(-1)=변화없음.

| code | 이름 | size | 적용부 | 핵심 필드 |
|---|---|---|---|---|
| **0x0423** | NotifyMovedShip(이동결과) | — | — | 권위적 포즈 채널(연속 float XZ). `docs/logh7-moveship-wire.md` |
| **0x0424** | NotifyTurnedShip(회전결과) | — | — | Turn 결과 |
| **0x0425** | NotifyWarpedShip(워프결과) | 0x90 | `FUN_004a5cc0` | `field0c@0xc u16`+`count@0xe`+ids@0x10. 목적지 없음→후속 0x423로 위치 |
| **0x0426** | **NotifyAttackedShip(피해)** | 0x1c | `FUN_004c0df0` | `attackerId@4`+`weaponType@8`+`targetId@0xc`+`newDurability@0x10`+`newArmor@0x12`+`hitSlot@0x14`+`newShield@0x16`+`statusByte@0x18`. **핵심 데미지 브로드캐스트** |
| **0x0427** | NotifyFought(백병결과) | 0x10 | `FUN_004c1130` | `attackerId@4`+`targetId@8`+`resultByte@0xe`. fight latch clear |
| **0x0428** | NotifyAirBattle(공전피해) | 0x18 | `FUN_004c0c80` | `attackerId@4`+`targetId@8`+`showVisual@0xd`+`newDurability@0xe`+`newShield@0x10`+`hitSlot@0x12`+`sectionShield@0x14`+`statusByte@0x16` |
| **0x043d/0x043e** | NotifyConfusion(Recovered)Unit | 8 | `FUN_004c0c00/40` | `unitId@4`. `entity+0x956` set/clear(混乱) |
| **0x0440** | NotifyMoraleDown(사기저하) | 0xc | `FUN_004c0bc0` | `unitId@4`+`moraleValue@8` → `entity+0x954`(士気) |
| **0x0436** | NotifyShootFortress(요새포발사) | 0x8c | `FUN_004a8c10` | `fortressId@0`+`arg@4`+`count@8`+targetIds@0xc. 킬 시 HP/실드/섹션 zero + 9999마커 |
| **0x0429** | NotifyMovedTroop | 0x14 | — | `[troopId, xyz]`(추정) |
| **0x042a** | NotifyLandCombat(지상전) | 0xc | — | 지상전 틱 결과 |
| **0x0437** | NotifySortie | 0x1c | — | 출격 확인 |
| **0x042c** | NotifyEncourageFlagship | 0xfc | `FUN_004a7260` | ids + `move_morale s16@0xf8` |
| **0x042d/2e/38** | NotifyRepair/Supply/EmergencySupply | 0x10 | — | `[target,source,amount,_]` |
| **0x0435** | NotifyMovedFortress | 0x14 | — | `[fortressId, xyz]` |
| **0x0439** | NotifyChangedAuthority | 0x88 | `FUN_004a94d0` | `newCommanderId@0`+count@4+ids@8 |
| **0x043c** | NotifyMissionResult | 0x10 | — | `[unitId, missionId, result, _]` |
| **0x0442** | NotifyFinishOccupation(점령완료) | 8 | — | `[baseId, newOwner]` |

**엔티티 전투스탯(전술 풀 레코드, `FUN_004c7cd0(pool,id,kind)`; kind1=함선 stride0x9ec/kind0=요새 stride0x8cc):**
`+0x8d4 durability(HP)`, `+0x8d8 armor(残機)`, `+0x8e0..5 onFire[6]`, `+0x8e8.. sectionDamage[6] f32`, `+0x954 status/morale`, `+0x956 confused`, `+0x8bc shipTypeId`(→템플릿 `client+0x2c1a78 + type*0x2a8`; 템플릿 `+0x218 maxDurability`, `+0x288 maxShield`). `+0x5c4 fightState`, `+0x5c0/0x5bc fireCooldown`.
**무기바이트→데미지클래스(`FUN_004c7790`):** 0x00–07=1(빔/주포), 0x08–0b=3(미사일), 0x0c–0f=2(보조), 0x10–1a=0(특수), 0xff=상태핑. 매뉴얼(p.50): 빔/건=중근거리, 미사일=원거리, 전투정=이동속도 저하. **射線判定**(LOS): 우군/장애물이 사선에 있으면 발사 불가.

**파괴:** HP=0 & 실드=0 & 섹션 클리어 = 격파 상태. 서버가 `newDurability`를 HP=0로 인코딩한 0x426 전송 → 클라가 death FX(weaponType 키).

---

## 7. 전투 종료·결과·전략 복귀

- **함선 격파:** §6 0x426(HP=0). 지상전/점령: 0x40f 출격 → 0x42a LandCombat → 전멸 시 **0x442 NotifyFinishOccupation**(직무권한카드 이양·守備隊 항복·緊急出撃, 매뉴얼 p.51).
- **씬 teardown(전술→전략 복귀):** `FUN_004c2a80(client, param)` @0x4c2a80(472B), `param==0`이면 전술 풀+전략 풀+월드버퍼 zero(전략 복귀). 호출: `FUN_004ba2b0` case `0xb0a NotifyEnterGridEnd` → `FUN_004c2a80(1); FUN_004c32a0(1)`.
- **세션 종결:** `0x35a NotifyEnding`(body 0x434) — 게임 승패조건 도달 시 세션 종료(매뉴얼 p.11: 首都점령/3星系이하/801년7월27일 타임아웃 → 決定的/限定的/局地的勝利·敗北 4종 평가). 서버 빌더 `buildNotifyEndingInner`(info-records-static.mjs:649)는 존재하나 현재 0-emit(end-of-game flow 미구현). **최저우선(P2).**

> 확신도: 격파/teardown 경로 = **높음**(함수 확인). 소형 노티파이(0x429/0x42a/0x435/0x43c/0x438/0x442) 내부 레이아웃 = **중간**(size는 ground truth, 필드는 형제 명령+dispatch size로 추론) — `FUN_004ba2b0` 해당 case 라인추적 시 상향 가능.

---

## 8. 태세(態勢) 매핑 — 0x0411/0x42f modeKind (매뉴얼 확정)

매뉴얼 p.54 【態勢変更】= 「航行」「碇泊」「駐留」「戦闘」 4종. 0x42f `modeKind` low byte → `ship+0x5c4`:

| modeKind | ship+0x5c4 | 매뉴얼 태세(추정 매핑) |
|---|---|---|
| 4 또는 6 | 0 | 航行(통상) 계열 |
| 5 | 5 | 碇泊/駐留 계열(정지·궤도) |
| 7 | 6 | 戦闘(공격력↑·索敵↓·士気↓) 계열 |

정확한 4↔4값 대응은 **라이브 캡처 게이트**(각 태세로 0x42f 캡처 시 확정). 「戦闘」 태세는 攻撃力↑·索敵範囲↓·士気減少↑(p.54) → 서버 전투해소 파라미터에 반영.

---

## 9. 매뉴얼 교차검증 요약 (item 5)

| 매뉴얼(page) | 규칙 | 대응 와이어/RE |
|---|---|---|
| p.46 발생조건 | 아군·적군 동일 그리드 공존 | §1/§2 서버 감지 → 씬 flip |
| p.46 종료조건 | 적 전멸 + (성계셀)전 점령 | §7 0x426 격파 + 0x442 점령 |
| p.54 隊列命令(v) | 그룹화+지정 진형 | 0x40d CommandFileFleet |
| p.54 攻撃命令(r) | 사정내 적 자동공격 | 0x405 CommandAttackShip |
| p.54 射撃命令(e) | 지정 적 일시공격 | 0x406 CommandShootShip |
| p.54 空戦命令(w) | 전투정 공격(対艦/迎撃 자동) | 0x40e CommandAirBattle(kind 4/5) |
| p.54 陸戦隊出撃/撤収 | 강하/회수(소요20초) | 0x40f/0x410 |
| p.54 態勢変更 | 航行/碇泊/駐留/戦闘 4종 | 0x411/0x42f modeKind §8 |
| p.49 索敵 | 자동·SENSOR배분·정지시 정밀↑·아군공유 | Control 0x40c sensor byte + 서버 fog |
| p.50 射線判定 | 우군/장애물 사선차단 | 서버 LOS 판정, 요새포 관통명중 |
| p.50 兵装 | 빔/건(중근), 미사일(원거리), 전투정(속도저하) | weaponType 클래스 `FUN_004c7790` |
| p.51 地上戦/占領 | 강하→자동지상전→점령시 카드이양 | 0x40f/0x42a/0x442 |
| p.46 유닛분류 | 陸戦隊/旗艦/艦艇(1유닛=300척,11종) | shipTypeId+0x8bc, 템플릿 stride0x2a8 |

---

## 10. 서버 구현 요약 + 확신도 + 라이브 프로브

**정규 경로(서버가 흉내낼 것):**
1. **전략 그리드 셀 공존 감지** → 전술 세션 개시(서버 권위). 참가 함대 양측 스폰 포즈 결정(연속 float XZ, 0x423과 동일 좌표계).
2. **씬 flip 유도(라이브 검증 필요):** `0x0317` 셀렉터(byte[2]=1) + 재arm(`0x0b0a` value!=0 또는 `0x0f1f`) → 클라 [A] 래치가 전술 import 선택. **순서 민감** — selector가 재arm보다 먼저 latch돼야(O3).
3. **전술 유닛 풀 충전:** `0x33b ResponseTacticsInformationUnitShip` 푸시(필요충분, O1 확정). 성계/요새 셀은 `0x345` 추가.
4. **함선 배치:** `0x42f NotifyChangeMode`(modeKind=태세, participants=양측 전 함선 포즈).
5. **전투 구동:** 명령 수신(§5) → 권위적 해소 → 노티파이 브로드캐스트(§6). 이동 0x423 / 피해 0x426 / 사기 0x440 / 混乱 0x43d·0x43e / 요새포 0x436 / 점령 0x442.
6. **종료:** 한 진영 전멸/점령 → teardown(전략 복귀). 세션 종결 시 0x35a.

**확신도 총괄:**
- **높음:** 모든 명령/노티파이 코드·size·파서주소·바디 오프셋(카운트/id/타깃/스탯), FSM 함수구조, 엔티티 스탯 오프셋, 진입/종료 게임규칙, 태세=0x411/0x42f, case 0x42f 존재.
- **중간:** modeKind 4/5/6/7↔태세 정확 대응, 소형 노티파이 내부 레이아웃, weaponType 세부 무기명, per-hit 데미지 공식(클라에 없음—서버가 스탯블록+캐논으로 재구성, 결과값만 전송).
- **라이브 게이트(정적으로 못 닫음):** ① 셀렉터 `+0x35f35a`가 [A] 실제 선택자인지 + selector/재arm 도착 타이밍(O2/O3/O5) — read-only HW write-watch로 정규 로그인~월드진입 전구간 캡처. ② `0x33b` 유닛만으로 consume 경로(`FUN_0050d230`) 진입하는지. ③ 각 태세별 0x42f 캡처로 modeKind enum 확정. ④ `0x33b` 52바이트 레코드 개별 필드 라벨(스탯). → **실행은 live-qa. 캐논 EXE 구동은 사용자 go 필요.**

---

## 11. 검증 로그 (본 사이클, 정본 EXE 바이트)

`0x42f` case 존재 여부 상충(mode0-breakthrough vs proto-battle-core)을 정본 바이트로 판정:
```
파일오프셋→VA 자기검증: 점프테이블 참조 0x004bde7c → fileoff 0xba343 (FUN_004ba2b0 시작 0x4ba2b0+0x93 내부)
  ⇒ VA = fileoff + 0x400000 확정.
LE immediate 스캔(정본 EXE g7mtclient.exe, sha 9c97de2a…):
  DAT_00433694 (0x42f가 166dword 복사하는 버퍼)  = fileoff 0xbc177 → VA 0x4bc177  (1회)
  DAT_004335fc (0x411 echo 152B 복사 버퍼)        = fileoff 0xbb6b9 → VA 0x4bb6b9  (1회)
  DAT_004332b4 (0x426 데미지 7dword 복사 버퍼)     = fileoff 0xbc2de → VA 0x4bc2de  (1회)
FUN_004ba2b0 범위: 0x4ba2b0 ~ 0x4ba2b0+15264(0x3ba0) = 0x4bde50.
  ⇒ VA 0x4bc177 / 0x4bb6b9 / 0x4bc2de 전부 dispatcher 본체 내부. case 0x42f/0x411/0x426 존재 확정.
```
함수테이블 대조(`.omo/re-galaxy/functions.tsv`, 이전 Ghidra런): 본 문서가 인용한 모든 함수(FUN_004ba2b0/004b8b00/004c45f0/004c1c30/004c1d20/004be8c0/004be7c0/004c32a0/004c4170/004b68f0/004c7cd0/004c0df0/004c2a80/004b64c0/004c1b20/0058ee70 …)가 주장 주소에 존재·크기 일치. (functions.tsv는 -sjis 변형 기반일 수 있으나 함수 레이아웃은 정본과 동일 — 36바이트 패치영역 밖.)

**미완(비차단):** 정본 EXE 전체 디컴파일 export는 `.omo/ghidra/export/decompiled`로 재빌드 중(Ghidra 12.1.2 headless; 프로젝트 경로 `.`시작 거부 이슈로 scratchpad 경유 재기동). 개별 case 라인추적으로 소형 노티파이 레이아웃 상향에 사용 가능하나, 본 와이어 계약 확정에는 위 바이트+함수테이블+매뉴얼 검증으로 충분.

## 12. 증거 인덱스 (함수 주소)
- 디스패치/사이즈: `FUN_004b8b00`(inner dispatch/size). 인바운드 적용: `FUN_004ba2b0`(15264B, 전 노티파이 case).
- FSM: `FUN_004c45f0`(필드할당 mode0/2), `FUN_004c32a0`(전술 import), `FUN_004c4170`(전략 import), `FUN_004b68f0`([A]래치), `FUN_004c2a80`(teardown), `FUN_004b64c0`(FieldMake), `FUN_004c1b20`(0x0f1f 재arm), `FUN_004e96f0`(MainLoop).
- 진입/포즈: `FUN_004a01e0`(Input_CommandChangeMode), `FUN_004a79b0`(Input_NotifyChangeMode), `FUN_004be8c0`→`FUN_004be7c0`(태세 적용), `FUN_004c1c30`→`FUN_004c1d20`(포즈 시딩).
- 명령 파서: §5 표 각 행. 피해 적용: `FUN_004c0df0`(0x426), `FUN_004c0c80`(0x428), `FUN_004c1130`(0x427), `FUN_004c0bc0`(0x440), `FUN_004c0c00/40`(混乱).
- 공용: `FUN_004c7cd0`(엔티티 lookup), `FUN_004c7790`(weaponType→class), `FUN_004b3460/3500`(전투 VFX/데미지텍스트), `FUN_00610420`(스트림 1바이트 read), `FUN_004c53b0`(글로벌 클럭).
- 상세 근거: `docs/reference/legacy-evidence/logh7-proto-battle-core.md`(진입·이동), `…-fire.md`(공격·피해), `…-fleetops.md`(함대·요새·임무), `logh7-mode0-breakthrough-2026-06-26.md`(씬 flip·셀렉터), `logh7-tactical-mode0-o1-resolution-2026-06-29.md`(O1 소스), 매뉴얼 `gin7manual.pdf` p.9-12,45-54.
