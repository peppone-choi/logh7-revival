# LOGH VII Revival

2008년 서비스가 종료된 일본 MMO **은하영웅전설 VII (銀河英雄伝説VII)** 를 되살리는 프로젝트입니다.
archive.org에 보존된 원본 클라이언트(CD)를 그대로 사용하고, 사라진 서버를 자체 권위 서버로 재구현합니다.
원본 클라이언트가 1차 제품이자 호환성의 기준(oracle)입니다.

## 배포 계획

- 게임을 플레이하는 유저가 내려받는 **클라이언트**와 게임을 구동하는 **서버**는 **별도 레포지토리로 분리**해 배포합니다. 현재 저장소는 분리 전까지 개발 모노레포입니다.
- 클라이언트는 유저가 쉽게 바로 플레이할 수 있도록 **부트스트랩된 버전**(원본 클라이언트 + 검증된 패치 + 서버 접속 설정이 준비된 형태)을 최종 배포합니다.
- 상세 방침: [아키텍처·운영 문서](docs/logh7-architecture-operations-current.md) · 결정 기록: `.ai/decisions.md` ADR-LITE-006

## AI 자동 업무 관리 매뉴얼

이 저장소는 AI 에이전트 하네스로 개발합니다. 사용자(업무 지시자) 관점 매뉴얼:

- **Claude Code 버전**: [docs/agent/claude-code-ai-업무관리-매뉴얼.md](docs/agent/claude-code-ai-업무관리-매뉴얼.md)
- **Codex 버전**: [docs/agent/codex-user-manual.md](docs/agent/codex-user-manual.md)

## 개발 진입점

- 로드맵·현재 구현 상태: [docs/logh7-roadmap-current.md](docs/logh7-roadmap-current.md)
- 작업 유형별 문서 라우터: [docs/agent/README.md](docs/agent/README.md)
- 서버 테스트/실행: `cd server && npm test` / `cd server && npm start` (포트 47900)
