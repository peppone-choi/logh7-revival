# LOGH VII 서버 — 모딩/커스텀 시스템 가이드 (Phase C)

코어를 수정하지 않고 **데이터만으로** 콘텐츠와 시작상태를 확장하는 법. 설계 배경/검증 규칙은
`docs/logh7-modding-architecture.md`, 본 문서는 **워크드 예제**다.

확장 표면은 두 축이다:

1. **콘텐츠 오버레이** (`logh7-mod-loader`) — 인물/함급/성계/국가/유닛 등 **카탈로그**를 추가·덮어쓴다.
2. **시나리오** (`logh7-scenario`) — 월드 **시작상태**(게임클록 기준점 + 함선/함대/지상부대 배치 + 소유/진영)를
   데이터로 정의해 한 번에 시드한다.

둘 다 코어(world-state/command-engine/codec)를 건드리지 않는다. mod-loader는 기존 콘텐츠팩 위에
Paradox식 additive 머지(같은 id=덮어쓰기, 새 id=추가, load-order 순)를 하고, 시나리오 로더는
기존 world-state 시드 API(`seedSystems`/`upsertShip`/`upsertFleet`/`upsertTroop`)만 호출한다.

---

## 1. 콘텐츠 모드 — 새 함급 추가

`mods/<모드이름>/` 디렉터리에 매니페스트 + 콘텐츠를 둔다. `LOGH_MODS_DIR`(또는 `config.content.modsDir`)로
모드 루트를 가리킨다.

```
mods/
  my-ships/
    mod.json
    content/
      shipClasses.json
```

`mods/my-ships/mod.json`:

```json
{ "name": "my-ships", "loadOrder": 10, "enabled": true }
```

`mods/my-ships/content/shipClasses.json` (배열 또는 `{ "shipClasses": [...] }`):

```json
[
  { "id": "custom_dread", "name": "커스텀 드레드노트", "beamPower": 9000, "armor": 5000 }
]
```

로드는 `loadMods(baseData, modsDir)`가 한다:

```js
import { loadMods } from './logh7-mod-loader.mjs';
const { data, appliedMods, validation, conflicts } = loadMods(baseContentPack, modsDir);
// data.shipClasses 에 custom_dread 추가됨. validation.ok=false 면 클라 파서 캡 초과 → 적용 거부 권장.
```

- **id가 기존과 같으면** 그 엔트리를 필드 단위로 덮어쓴다(부분 패치 가능: 바꾸려는 필드만 적어도 됨).
- **`__remove: true`** 를 주면 그 id를 삭제한다.
- `validation`은 RE'd 클라 파서 캡(`logh7-content-caps`)을 강제한다 — 모드가 클라를 bail시키는 데이터를
  만들 수 없다. `conflicts`는 두 모드가 같은 id를 쓸 때 경고(load-order last-wins).

> 커스텀 진영(3번째+ 플레이 교전국)도 `nations` 콜렉션으로 데이터 추가 가능하다. 다만 동시 교전 진영이
> 2를 넘는 시나리오는 클라 세션수 패치가 별도로 필요하다(복구된 feasibility — `[[logh7-custom-nation-feasibility]]`).

---

## 2. 시나리오 — 커스텀 시작상태

시나리오 JSON은 월드의 시작 배치를 정의한다. 포맷(전 필드 선택, `name`만 필수):

```json
{
  "name": "my-scenario",
  "clockStartMs": 0,
  "systems": [{ "name": "오딘", "faction": "empire", "planets": [{ "name": "오딘" }] }],
  "fleets": [{ "id": 1001, "owner": 1, "faction": 1, "commander": 0, "cell": 40, "supply": 100 }],
  "ships":  [{ "id": 110001, "owner": 1, "faction": 1, "shipClass": "battleship" }],
  "troops": []
}
```

출하 예제: `content/scenarios/example-skirmish.json` (제국 vs 동맹 소규모 교전, 포맷 시연용).

로드:

```js
import { loadScenarioFile, loadScenarioInto } from './logh7-scenario.mjs';
import { createWorldState } from './logh7-world-state.mjs';

const { scenario, errors } = loadScenarioFile('content/scenarios/example-skirmish.json');
if (!scenario) throw new Error(`시나리오 로드 실패: ${errors.join(',')}`);

// 게임클록 기준점은 생성시 결정이므로 world 생성에 넘긴다.
const world = createWorldState({ clockStartMs: scenario.clockStartMs ?? 0 });
const { ok, counts } = loadScenarioInto(world, scenario);
// counts = { systems, ships, fleets, troops } 시드 개수
```

주의:
- `validateScenario`/`loadScenarioFile`는 throw하지 않고 `errors` 배열로 보고한다(부팅 폴백 용이).
- `systems[].faction`은 world 내부에서 `owner`로 저장된다(`getSystem(name).owner`로 조회).
- 부분 구현 도메인은 world가 지원하는 만큼만 시드된다(메서드 없으면 스킵).

> 캐논 801-07 시작은 **검증된 배치 데이터**로 기본 시나리오를 별도 출하 예정
> (`content/initial-deployment.json` 후보는 적대적 검증 후 적용 — `docs/logh7-content-verify.md`).

---

## 3. 합치기 — 콘텐츠 모드 + 시나리오

커스텀 함급을 추가하고 그 함급으로 시작 함대를 배치하는 완전 예제:

1. `mods/my-ships/`에 `custom_dread` 함급 추가(§1).
2. 시나리오 `ships[].shipClass: "custom_dread"`로 참조(§2).
3. 부팅: 콘텐츠팩에 모드 머지 → world 생성 → 시나리오 시드.

```js
const { data: content } = loadMods(baseContentPack, modsDir);   // custom_dread 포함
const { scenario } = loadScenarioFile(scenarioPath);            // custom_dread 함선 배치
const world = createWorldState({ clockStartMs: scenario.clockStartMs ?? 0 });
loadScenarioInto(world, scenario);
// (함급 스탯은 content.shipClasses에서 upsertShip stats로 연결 — 배선은 부팅 경로 책임)
```

---

## 현황 / 잔여

- ✅ 콘텐츠 오버레이(`logh7-mod-loader`): additive 머지 + 캡 검증 + 충돌 감지, fs 로더.
- ✅ 시나리오(`logh7-scenario`): 검증 + 실 world 시드 배선(systems/ships/fleets/troops/characters + A7 메타) +
  fs 로더 + 출하 예제. characters는 전투 캐릭터 레지스트리에 시드(戦死/降伏 사령관 데이터).
- ✅ **부팅 경로 배선 (e196c24)**: `PLAYABLE_ENV_DEFAULTS.LOGH_SCENARIO=canon-801-07.json` → 제로설정
  `npm start`가 캐논 시나리오를 데이터파일에서 로드→world 시드(80성계/24함대/14사령관). `LOGH_SCENARIO`로
  커스텀 시나리오 출하 가능. 부팅 합성·시드 체인은 auth-server 테스트로 고정.
- ⏳ 룰 훅(모드가 커맨드 핸들러/이벤트 reducer를 코어 수정 없이 등록) — Phase A3 핸들러 레지스트리 위에 구축
  (A3 핸들러 레지스트리 미완 → 이 훅도 미완; 현재는 콘텐츠/시나리오 데이터 모딩만 지원).
