<!-- 이 카드는 매 턴 자동 주입된다. 갱신: 파생 원천(roadmap·known-issues·task.md) 변경 시 -->
# LOGH VII 키팩트 (NIAH 카드)

## P0 게이트 상태
- 다음 P0 게이트: M4-OBS-001 (47900→47901 프록시 correlation 슬라이스).
- Wine 게이트 차단 중: `runtime_support_manifest_missing` (exit 2, `fullPassEligible=false`) — V1 runtime-support manifest·sentinel 복구 전 launch 금지.
- E2E 슬라이스 SRV-CORR = 서버 correlation 레코드 모듈(서버-테스트 가능 범위, Wine 라이브 게이트 미포함).

## 불변식
- 서버 포트 47900.
- EXE hash·image base·sentinel 불일치 시 launch/attach/patch 금지 — fail-closed는 버그가 아니다.
- 2026-07-05 전체 리셋 이후 옛 코드는 커밋 `5bd249c`에서 참고만 하고 되살리지 않는다.
- CP932 자산을 임의로 UTF-8 변환하지 않는다.
- 참고 레포 코드를 이식하지 않는다.

## 검증 규칙
- 라이브 검증 없이 완료 주장 금지 — 명령·종료코드·스크린샷 등 증거 필수.
- 과거 수치(서버 테스트 460 등)는 historical baseline이지 fresh gate가 아니다.
- 테스트: `cd server && npm test`.

## 활성 계약 (`.ai/task.md`)
- Status: ACTIVE — AI 업무 시스템 고도화. Phase 1+2 merge 완료(PR #6→main), Phase 3 E2E(SRV-CORR) 진행: Issue #7·Jira LOGH7-8, 브랜치 feat/e2e-srv-corr.
- main 직접 커밋·push·PR·merge 금지 — 작업 브랜치 commit만 허용.
- 시크릿(`ANTHROPIC_API_KEY` 등)은 사람이 직접 등록, 에이전트는 접근하지 않는다.
