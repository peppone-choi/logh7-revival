---
title: LOGH VII 경제 미구현 판정 — 정본(Canon) 근거
aliases:
  - 경제 부재 판정
  - logh7-economy-unimplemented
tags:
  - logh7
  - canon
  - verdict
  - economy
  - 2026-07-14
status: final
updated: 2026-07-14
---

> **복원 목표는 "원본 경제 수치 복구"가 아니다 — 그런 대상은 애초에 존재하지 않았다.** 원본 게임이 경제 기능을 미구현 상태로 출시했으며, 현재 `server/content/planet-economy.json`의 모든 수치는 절차생성(P3)일 뿐 캐논이 아니다. 채워야 할 것은 경제가 아니라 보급 물자·시설·요새라는 원본이 실제로 구현한 기능들이며, 경제 스칼라(세수·인구·GNP·산업)는 `0`으로 남기는 것이 정본에 부합한다.

---

## 근거 5건

| # | 판정 항목 | 신뢰 등급 | 출처 & 위치 | 결론 |
|---|---|---|---|---|
| **1** | **공식 매뉴얼 명시 경제 미구현** | P1 | `docs/reference/legacy-evidence/logh7-manual-canon.md` 19행, §1.2 Victory requires more than military force; 원문: `経済関連は現在未実装` | 원본 게임이 공식적으로 경제 관련 기능을 미구현 상태로 선언했음. 참고: §8/§14 재확인. |
| **2** | **경제 수치의 정본 부재** | P0 | `docs/reference/legacy-evidence/logh7-content-recovery-economy-2026-06-29.md` §1 소스A(MsgDat) + 소스B(EXE) + 소스C(설치본) | CD 이미지·설치본·MsgDat 22개 파일 9,582 레코드 전수 검색: 행성별·성계별 경제 수치 레코드 0건. EXE 바이너리에 281 행성/80 성계의 정적 stride 배열 없음. 모든 수치는 서버 런타임 와이어 레코드로만 전달됨. |
| **3** | **경제 값이 들어갈 공간은 있지만 정본은 없음** | P1 | `docs/reference/legacy-evidence/logh7-content-recovery-economy-2026-06-29.md` §2 Recoverable R5; `docs/reference/legacy-evidence/logh7-info-records-wire.md` | 클라이언트 와이어 메시지 `NotifyBaseParameter`(74바이트)는 경제 필드를 담는 레이아웃을 정의했으나, 값을 채운 정본 데이터는 없음. 현재 `server/content/planet-economy.json`은 자체 헤더로 절차생성(`_method: "deterministic per-planet seed"`)임을 선언함. |
| **4** | **반면 보급·시설·요새는 정본 구현** | P1 | `docs/reference/legacy-evidence/logh7-manual-canon.md` §2.3+ (함선·명령 정의); `server/content/manual/place-facilities.json` (P1, pp.32-34); `server/data/seed/fortresses.json` (6개 요새 완전히 정의됨) | 매뉴얼 명시: CP 160 명령 `完全補給`(full supply refill), `燃料補給`(fuel resupply, wait 8, persistent command); 함선 스탯 `物資搭載量`(supply capacity), `修理消費物資`(repair supply cost) 캐논 컬럼. 21개 시설(정청/창고/군수공장/조병공창/훈련소 등)과 6개 요새(이제르론/가이에스부르크/렌텐베르그/가르미슈/류드밀라/다얀 한) 완전 정의. |
| **5** | **renderer가 읽는 대상은 경제가 아니라 창고** | P1 | `server/src/server/codec/warehouse-record.mjs` (구현); 바이너리 오프셋 `FUN_0057aa90` VA `0x57aa90` (클라 캐시 읽기) | 클라이언트 창고 캐시(`base + 0x3e098c`, 768바이트): 재고 엔트리 수(`+0xC` u8), 재고 배열(`+0x10` stride 6), 카테고리 수(`+0x260` u8), 카테고리 배열(`+0x262` stride 6, u16 tag + u16 값), 스칼라(`+0x2F4` u32). 이 구조는 보급 물자 재고이지 경제 수치(세수/인구/GNP)가 아님. |

---

## 이 판정이 바꾸는 것

### 1. 상세 응답의 "빈 경제 스칼라"는 열린 병목이 아니라 닫힌 항목

전략맵 성계 상세 정보 패널(`0x0327` 응답)의 경제 필드(population/food/industry/…)가 공란인 것은 **서버 구현 미완이 아니라 원본의 정본 동작**이다. 실제 문제는 보급 물자 재고 렌더링 오프셋의 엔디안·tag 의미를 확정하는 것에만 있다.

### 2. 남은 진정한 작업은 세 가지뿐

1. **보급 물자 재고를 renderer 오프셋에 결합**: `warehouse-record.mjs`가 생성한 보급 데이터를 클라 캐시 구조(`FUN_0057aa90` 오프셋)에 맞게 인코딩
2. **시설·요새 정본 데이터 결합**: `place-facilities.json`(P1) + `fortresses.json`(P1)의 캐논 데이터를 클라 레이아웃에 직렬화
3. **오프셋·엔디안·tag 의미 라이브 확정**: live-qa로 실제 EXE에서 패널이 올바르게 렌더되는지 검증 (현재 미확정 등급 C)

### 3. 로드맵 파급

- **wave-3 todo 20 (경제·물류)**: 경제 부분("경제 수치 채우기")은 **"정본 부재 확정 — 원본 미구현"으로 판정 완료**. 보급·시설·요새는 P1 캐논이므로 별도 작업 항목으로 승격.
- **wave-3 todo 22 (미해결 공식 9건)**: 경제 관련 의문은 **종료(closed—no-canon)**. 보급 물자 초기값 원천 추적은 계속.

---

## 여전히 열려 있는 것

### 1. 보급 물자의 초기값 원천 (grade C, 미확정)

`server/content/auto-production.json`(매뉴얼 pp.76–78에서 추출한 행성별 자동생산 수량)이 보급 재고의 초기 시드인지, 아니면 별도 정본이 있는지 미확정.

**현황**:
- `logh7-content-recovery-economy-2026-06-29.md` §2 R3에서 자동생산은 **비경제 캐논**(P1)으로 확정
- 그러나 이 값이 실제로 클라 창고 캐시(`FUN_0057aa90`)에 채워지는지는 **라이브 미검증**

**다음 단계**: live-qa에서 실제 클라를 구동하고 스크린샷·메모리 덤프로 창고 패널의 수량이 `auto-production.json`과 일치하는지 확인.

### 2. Renderer 오프셋의 엔디안·tag 의미 (grade C, 라이브 미확정)

`warehouse-record.mjs`에서 생성한 보급 레코드를 `FUN_0057aa90`의 캐시 구조에 인코딩할 때, 다음이 미확정:

- **엔디안**: 스칼라(`+0x2F4` u32)와 카테고리(`+0x262` u16) 값이 리틀엔디안(x86)인지 빅엔디안인지
- **tag 의미**: 카테고리 배열의 u16 tag(현재 `commodity_id` 추정)가 클라 내부 용어인지, 서버 wire 용어인지, 아니면 별도 매핑 테이블이 필요한지
- **재고 단위**: 렌더된 수량이 절대값인지, 스케일된 값(`*1000`/`/100` 등)인지

**현황**: `logh7-m4-strategy-system-detail-handoff-2026-07-13.md`에서 "0327 상세 렌더 미완"으로 기록. 구조는 근거 5번(RE confidence 0.82)이지만 실제 값 채우기는 미검증.

**다음 단계**: live-qa에서 보급 패널을 스크린샷하고 메모리 덤프(`warehouse-record.mjs` 출력 + 클라 캐시)를 대조 — 엔디안/tag 값을 마커로 고정.

---

## 관련 문서 위키링크

- [[logh7-strategy-system-detail-current]] — 전략 시스템 현황(2026-07-13)
- [[logh7-m4-strategy-system-detail-handoff-2026-07-13]] — M4 전략 상세 핸드오프
- [[logh7-manual-canon]] — 공식 매뉴얼 캐논 레퍼런스
- [[logh7-content-recovery-economy-2026-06-29]] — 경제 복원 계획 & 증거 정리
- [[logh7-info-records-wire.md]] — 와이어 레코드 정의 (§3 NotifyBaseParameter 스키마)

---

## 결론 (1문장)

**원본 게임이 경제 기능을 미구현으로 출시했다는 사실이 정본 근거(P1)로 확정되었으므로, 현재 `0`으로 나타나는 경제 스칼라는 버그가 아니라 정책이며, 서버 작업은 경제 채우기가 아니라 보급·시설·요새라는 원본이 실제로 구현한 것들을 마무리하는 데 집중해야 한다.**
