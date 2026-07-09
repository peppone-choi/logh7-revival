# LOGH VII 우주전쟁(전투) 런북 (G201)

작성: 2026-06-13. 서버측 **권위적 전술 전투**를 구동/검증하는 방법. 무엇이 검증됐고 무엇이 라이브 RE
경계인지 정직하게 구분한다.

## 무엇이 됐나 (서버 권위 전투, 테스트 검증됨)
- `CommandChangeMode 0x411` → 배틀세션 오픈 + `NotifyChangeMode 0x42f` 전체 브로드캐스트.
- `CommandShootShip 0x406`(빔 일제)·`CommandAttackShip 0x405`(지속) → 서버가 타겟 결정(적 진영 최근접 생존
  함선) + 권위적 피해판정(`computeDamage`: 실드→장갑→선체 cascade) → `NotifyAttackedShip 0x426` 전체
  브로드캐스트(행위자 포함) → 선체(残機) 0 = 격침 → 그리드에서 제거 + 전투로그.
- `CommandFight 0x407` → 교전 자동판정 + `NotifyAttackedShip` + `NotifyMoraleDown 0x440`.
- `CommandWarpShip 0x404` → 전술 워프(이동 notify로 대체, 0x425 정식 레이아웃은 spec 대기).
- 안티치트: 자기 소유 함선만 사격 가능(소유권 검증). 서버가 최종 위치/피해 결정.

검증: `node --test tests/server/*.test.mjs` → **159 통과** (전투 16개 포함, 엔드투엔드 우주전쟁 루프 포함).
와이어 레이아웃은 독립 RE 패스(`docs/logh7-proto-battle-fire.md`)와 교차검증 일치.

## 서버 단독 전투 시뮬레이션 (클라 없이)
순수 인메모리라 클라 없이 전투 루프를 돌릴 수 있다. 예시는 테스트 참조:
`tests/server/logh7-combat-engine.test.mjs` → "END-TO-END space war" (함대가 적 격침까지 사격).

```bash
node --test tests/server/logh7-combat-engine.test.mjs   # 16개 전투 테스트
```

프로그램적으로:
```js
import { createWorldState } from './src/server/logh7-world-state.mjs';
import { processCommand } from './src/server/logh7-command-engine.mjs';
const s = createWorldState();
s.addPlayer({ connectionId: 1, powerId: 1 });
s.upsertShip({ id: 101, owner: 1, faction: 1, shipClass: 'flagship', x: 0, y: 0, z: 0 });
s.upsertShip({ id: 201, owner: 2, faction: 2, shipClass: 'destroyer', x: 5, y: 0, z: 0 });
// 0x406 사격 명령 inner: [u16 BE 0x406][body: count@12=1, id@16=101, target@0x94=201]
const decision = processCommand({ state: s, connectionId: 1, innerCode: 0x406, inner: shootInner });
// decision.notifies = [{ inner: NotifyAttackedShip, target: 'all' }], s.battleLog() 에 피해 기록
```

## 실클라 + 서버 라이브 (멀티플레이 경로)
```bash
# 1) 권위적 전투 서버 (relay + authoritative + content DB)
LOGH_RELAY=1 LOGH_AUTHORITATIVE=1 LOGH_CONTENT_DB=1 npm run server:auth

# 2) 무수정 원본 클라 구동 + 로그인→월드로드 (검증된 G164 플래그)
LOGH_LOBBY_OK_FORMAT=message32 LOGH_SS_FORMAT=message32 LOGH_WORLD_PLAYER=1 \
  python tools/logh7_ui_explorer.py   # 실클라+서버 인터랙티브 구동/관찰
```
- 콘텐츠 유닛에 faction/shipClass가 있으면 `upsertShip` 시 전투스탯이 부여돼 사격 명령이 적 진영을
  타겟한다(`logh7-auth-server.mjs` 시딩). 없으면 중립(0)/cruiser 기본.
- 두 클라가 월드에 있으면 한쪽의 `0x405/0x406` 사격이 권위 판정 후 `0x426`으로 **양쪽 화면에 피해 렌더**.

## 라이브 경계 (정직한 한계)
서버측 전투는 완전 검증됐다. 그러나 **실클라가 전술 사격 명령을 ISSUE하려면 전술 배틀그리드가
controllable** 해야 한다 — 클라 모드바이트 `client+0x126711 == 0`(전술)이어야 전술 함선 풀
(`FUN_004c32a0`)이 populate된다(라이브 측정 ==2 = 전략모드). 이 전환은 grid-enter FSM의 라이브 RE
과제다(`docs/multiplayer-roadmap-2026-06-12.md`의 boundary, `docs/logh7-proto-battle-core.md` 참조).

따라서 현 단계:
- ✅ 서버는 사격 명령을 받으면 권위적으로 피해를 판정하고 `0x426`을 브로드캐스트한다(테스트로 증명).
- ✅ 두 클라 사이 in-world 명령 릴레이 인프라 완비.
- 🟡 실클라가 전술 사격을 UI로 ISSUE하는 것은 모드바이트 전환(라이브 RE)이 남았다 — 서버 구현과 독립.

다음 라이브 실험: grid-enter 직전 `0x126711=0` 전환 경로 확정(ChangeMode 또는 SwitchMode 0x0b06 또는
grid-enter 시퀀스) → 전술 풀 populate → 사격 UI 활성화 → 두 클라 라이브 전투.

## 환경 변수 요약
| 변수 | 효과 |
|---|---|
| `LOGH_RELAY=1` | in-world 명령 릴레이 활성(전투 코드 포함) |
| `LOGH_AUTHORITATIVE=1` | 릴레이 대신 권위적 `processCommand` 경로(전투 판정) |
| `LOGH_CONTENT_DB=1` | 복원 콘텐츠(갤럭시/로스터/함선)로 시딩 |
| `LOGH_WORLD_PLAYER=1` | 0x0f02에 플레이어 스폰 푸시(G164 월드로드) |
