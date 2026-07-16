# Architecture

> **TL;DR** 원본 클라이언트(G7MTClient.exe) ↔ 자체 권위 서버(Node.js, 포트 47900). 와이어 프로토콜과 게임로직은 RE + 원본 아카이브 근거. 서버 구조는 `server/src/` 참조, 검증은 `docs/agent/verification.md`, 로드맵은 `docs/logh7-roadmap-current.md`.

## 정본 라우팅

| 대상 | 정본 |
|---|---|
| 서버 코드·구현 | `server/src/` |
| 검증 행렬·테스트 전략 | `../agent/verification.md` |
| 마일스톤·프로토콜 경계 | `../logh7-roadmap-current.md` |
| 바이너리 프로토콜 (RE 근거) | `../logh7-reference-haul.md` |
