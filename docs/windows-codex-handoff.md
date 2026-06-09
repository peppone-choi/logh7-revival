# Windows Codex Handoff

이 문서는 Codex가 설치된 Windows PC에서 이 저장소 작업을 바로 이어가기 위한 인수인계 절차와 재개 프롬프트입니다. 이어갈 핵심 작업은 LOGH VII의 한글화와 게임 서버 구성입니다.

## Windows PC에서 먼저 실행

PowerShell에서 실행합니다.

```powershell
git clone <REPOSITORY_URL> LOGH-7-rework
cd LOGH-7-rework
git lfs install
git pull
git lfs pull
npm install
```

이미 클론한 저장소가 있다면:

```powershell
cd <LOCAL_REPO_PATH>
git status --short --branch
git pull
git lfs pull
npm install
```

## 확인 명령

```powershell
npm run build
npm test
```

`npm test`는 Playwright 브라우저가 필요합니다. 브라우저가 없다는 오류가 나오면 다음을 먼저 실행합니다.

```powershell
npx playwright install
```

## Windows PC Codex 자동 재개 프롬프트

아래 프롬프트를 Windows PC의 Codex에 그대로 붙여 넣습니다.

```text
너는 Windows PC에서 실행 중인 Codex야. 이 저장소의 목표는 LOGH VII 자료를 기반으로 한글화와 게임 서버 구성을 완성하는 것이다.

작업 시작 전에 다음을 반드시 수행해:
1. `git status --short --branch`로 브랜치와 dirty state를 확인한다.
2. `git pull`과 `git lfs pull`을 실행해 macOS 작업자가 푸시한 최신 문서와 LFS CD 아티팩트를 받는다.
3. `npm install`을 실행한다. 이미 설치되어 있으면 빠르게 끝나도 된다.
4. `npm run build`와 `npm test`를 실행해 현재 표면을 검증한다. Playwright 브라우저가 없으면 `npx playwright install` 후 다시 테스트한다.

그 다음 자동으로 작업을 이어가:
- 문서와 현재 코드부터 읽고, 최종 목표인 한글화와 게임 서버 구성을 충족하는 방향으로 직접 구현한다.
- CD/ISO 아티팩트 구조를 조사해 한글화 대상 리소스, 텍스트/폰트/인코딩 제약, 패치 재빌드 경로를 정리하고 필요한 도구를 만든다.
- 게임 서버 구성에 필요한 실행 방식, 네트워크 포트, 설정 파일, 로컬/원격 실행 절차, 검증 방법을 확인하고 재현 가능하게 문서화/자동화한다.
- 모르는 형식이나 프로토콜은 추측으로 덮지 말고 샘플 추출, 헥스/문자열 분석, 실행 로그, 공식/신뢰 가능한 자료로 근거를 확보한다.
- `node_modules/`, `dist/`, Playwright 리포트, 테스트 산출물은 커밋하지 않는다.
- 웹/도구 표면을 바꾸면 관련 테스트를 추가하거나 갱신하고, `npm run build`와 `npm test`로 검증한다.
- 커밋이 필요하면 Lore Commit Protocol을 따른다.
- 완료 전에는 실제 실행/변환/서버/테스트 표면으로 동작을 확인하고, 최종 답변에는 변경 파일, 통과한 검증, 남은 위험을 짧게 보고한다.

현재 알려진 저장소 표면:
- `artifacts/logh7-cd/`: Git LFS로 관리되는 LOGH VII CD 원본/변환 ISO 자료
- `tools/convert_mode2_bin_to_iso.py`: MODE2/2352 BIN을 2048-byte ISO payload로 변환하는 도구
- `src/`, `index.html`, `package.json`: Vite/React 작업 표면
- `tests/`: Playwright 회귀 테스트
- `docs/windows-codex-handoff.md`: 이 Windows 인수인계 문서

우선순위:
1. 한글화 대상 리소스와 패치 파이프라인을 찾아 재현 가능한 추출/변환/재삽입 흐름을 만든다.
2. 게임 서버 구성 요건을 확인하고 로컬 Windows 환경에서 실행 가능한 서버 설정/스크립트/문서를 만든다.
3. 작업 결과를 검증 가능한 명령과 테스트로 고정한다.

바로 시작해. 명확하고 안전한 다음 단계는 묻지 말고 실행해.
```

## 커밋 대상 기준

커밋해야 하는 파일:

- 작업 지시/인수인계 문서
- 소스 코드와 테스트
- lockfile과 설정 파일
- 재현 가능한 변환 도구

커밋하지 않을 파일:

- `node_modules/`
- `dist/`
- Playwright 리포트와 테스트 산출물
- 로컬 로그 파일
