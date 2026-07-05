# LOGH VII Revival

## 미션

2008년 서비스 종료된 일본 MMO **은하영웅전설 VII (LOGH VII)** 를 되살린다.
원본 클라이언트(archive.org CD)에 자체 구현 서버를 붙여 멀티플레이 온라인 게임으로 복원한다.

## 2026-07-05 전체 리셋

- 사용자 지시로 기존 작업트리 전체 삭제. `docs/`와 매뉴얼 PDF만 보존.
- 삭제 직전 전체 스냅샷: 커밋 `5bd249c` — 이전 코드/도구 복원은 `git checkout 5bd249c -- <path>`.
- 이전 사이클의 지식(와이어 프로토콜 해독, RE 결과, 갤럭시 데이터, 요구사항)은 `docs/`에 문서로 남아 있다. 코드는 전부 새로 작성한다.

## 소스 오브 트루스

- `artifacts/logh7-cd/Logh7.bin|.cue` — https://archive.org/details/logh-7 CD 이미지 (md5 검증 완료: `bf87c6a8...`/`8784...`, gitignored — 없으면 재다운로드)
- `docs/reference/*.pdf` — 공식 매뉴얼 5종 (게임 규칙의 근거)
- `docs/logh7-requirements-current.md`, `docs/logh7-architecture-operations-current.md` — 이전 사이클 지식 베이스 (역사적 참고 — 코드 경로 언급은 리셋 전 기준이므로 신뢰하지 말 것)
- `docs/logh7-document-index-current.md` — 구 문서 분류 인덱스

## 개발 규칙

- **CodeGraph 필수**: `.codegraph/`가 있으면 코드 위치/호출경로/영향범위 질문은 codegraph 먼저, rg로 확인.
- **Blocked-Loop Rule**: 같은 증상 3회 실패 또는 새 증거 없는 조사 2회면 접근을 전환하고 블로커 보고서를 쓴다.
- 코드 주석은 한글로 쓴다 (캐논 일본어 용어·바이너리 오프셋은 원문 유지).
- 라이브 검증 없이 완료 주장 금지. 테스트 출력·스크린샷 등 증거를 남긴다.
