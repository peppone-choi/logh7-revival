# LOGH VII 부활 — 재시작 계획 (2026-07-05)

## 결정

사용자 지시로 전체 작업트리를 삭제하고 처음부터 다시 시작한다. 보존: `docs/`(지식 베이스 + 매뉴얼 PDF 5종)만. 삭제 직전 전체 스냅샷은 커밋 `5bd249c` (복원: `git checkout 5bd249c -- <path>`).

## 미션

2008년 서비스 종료된 일본 MMO **은하영웅전설 VII**를, 원본 클라이언트(archive.org CD)에 **자체 구현 서버**를 붙여 멀티플레이 온라인 게임으로 복원한다.

## 소스 오브 트루스

- `artifacts/logh7-cd/Logh7.bin|.cue` — https://archive.org/details/logh-7 CD 이미지. md5 검증 완료(`bf87c6a8...` / `87841870...`). gitignored — 없으면 archive.org에서 재다운로드.
- `docs/reference/*.pdf` — 공식 매뉴얼 5종(게임 규칙 근거).
- `docs/logh7-requirements-current.md`, `docs/logh7-architecture-operations-current.md`, `docs/logh7-document-index-current.md` — 이전 사이클 지식 베이스. **역사적 참고**: 발견(프로토콜/갤럭시/스키마)은 신뢰하되, 코드 파일 경로 언급은 리셋 전 기준이므로 재확인.

## 이전 사이클에서 가져올 지식 (docs에 문서화됨)

- 와이어 프로토콜: inner 0x0030 레이어, 로그인 inner 0x7000(GIN7 자격증명), 로비 0x0020, 메시지코드 = familyBase+index (SS=0x200, Lobby=0x2000)
- 갤럭시: 80성계 / 281행성 / 6요새 (매뉴얼 101p 복원)
- 캐릭터: 서버 init 메시지(0x0323)로 전달, 스탯 스키마 클라 FUN_00419300
- 인월드 MP: CommandMoveShip 0x0400 / NotifyMovedShip, 서버권위 0x0b07 이동
- 한글화: cp949 String.txt + GDI charset 패치, cp932 채팅 해저드 주의
- 아키텍처: 인메모리 authoritative + 비동기 DB 영속성 (수천 동접 목표)

## 마일스톤

1. **CD 추출 + 정본 카탈로그** — bin/cue → ISO → 자산 분류 → `server/content/generated/*.json`
2. **프로토콜 재확정** — 프레이밍·암호화·로그인 핸들러 RE 재확인 → 와이어 코덱 + 라운드트립 테스트
3. **로그인 서버** — 실클라가 자체 서버에 로그인 성공 (라이브 증거)
4. **로비 → 월드 진입**
5. **인월드 멀티플레이** — 이동·채팅 권위적 처리, 다중 클라 검증
6. **한글화 인게임 검증** — 로그인→채팅→한글 정상 표시

## 운영

- 하네스: `logh7-orchestrator` 스킬 + `.claude/agents/` 6종. 상세는 루트 `CLAUDE.md`.
- CodeGraph 필수, Blocked-Loop Rule, 라이브 검증 없이 완료 주장 금지, 코드 주석 한글.
- Fable 5 전략(충분하면 행동/과설계 금지/결과 우선/비동기 잡/effort 튜닝) — 루트 `CLAUDE.md` 참조.
