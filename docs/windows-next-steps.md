# Windows 작업자 다음 단계

이 문서는 Windows PC에서 LOGH VII 한글화/배포 zip 작업을 이어가기 위한 실행 체크리스트다.

## 1. 최신 코드 받기

PowerShell에서 실행한다.

```powershell
cd <LOCAL_REPO_PATH>
git pull
git lfs pull
npm install
```

## 2. 기본 검증

```powershell
npm run build
npm test
```

Playwright 브라우저가 없다는 오류가 나오면 다음을 먼저 실행한 뒤 다시 테스트한다.

```powershell
npx playwright install
npm test
```

## 3. ISO 분석 매니페스트 생성

```powershell
python tools/logh7_pipeline.py inspect artifacts/logh7-cd/Logh7_mode2_2048.iso --out .omo/ulw-loop/evidence/localization-manifest.json
```

확인할 핵심 값:

- 볼륨 식별자: `GINEIDEN7`
- `setup.ini` 인코딩: `cp932`
- `data1.cab`, `data2.cab`: `installshield-cab`

## 4. 설치 완료 트리 만들기

Windows에서 해야 할 핵심 작업은 ISO 안의 InstallShield 페이로드를 풀어 실제 설치 완료 상태의 파일 트리를 재구성하는 것이다.

필수 작업:

- `data1.cab`, `data2.cab`를 InstallShield 지원 도구로 푼다.
- 설치 결과와 같은 구조를 `.omo/work/logh7-installed/`에 만든다.
- 한글화 교체 파일은 `.omo/work/logh7-ko-overlay/`에 같은 상대 경로로 둔다.

예시 구조:

```text
.omo/work/logh7-installed/G7Start.exe
.omo/work/logh7-installed/G7MTClient.exe
.omo/work/logh7-installed/Gin7UpdateClient.exe
.omo/work/logh7-installed/update.ini
.omo/work/logh7-installed/GameData/constmsg.dat

.omo/work/logh7-ko-overlay/GameData/constmsg.dat
```

## 5. Windows 배포 zip 후보 만들기

설치 완료 트리와 한글화 오버레이가 준비되면 다음 명령을 실행한다.

```powershell
python tools/logh7_pipeline.py package-installed .omo/work/logh7-installed --overlay .omo/work/logh7-ko-overlay --out .omo/work/logh7-build/logh7-ko-installed.zip --manifest-out .omo/work/logh7-build/logh7-ko-installed-manifest.json
```

이 명령은 다음을 수행한다.

- `.omo/work/logh7-installed/`를 기준 배포 트리로 사용한다.
- `.omo/work/logh7-ko-overlay/` 파일을 같은 상대 경로로 덮어쓴다.
- zip 내부 경로를 Windows에서 풀기 좋은 상대 경로로 고정한다.
- zip 안에 `MANIFEST.json`을 넣고 외부 매니페스트에도 SHA-256 해시를 기록한다.
- `.bin`, `.cue`, `.iso` 파일이 배포 트리에 섞이면 실패한다.

## 6. 실제 Windows 실행 검증

```powershell
Expand-Archive .omo/work/logh7-build/logh7-ko-installed.zip .omo/work/windows-smoke
cd .omo/work/windows-smoke
.\G7Start.exe
```

검증할 항목:

- 런처 또는 클라이언트가 실행되는지
- 누락 DLL이 있는지
- 일본어 로캘 또는 CP932 설정이 필요한지
- DirectX 런타임이 필요한지
- 레지스트리 초기화가 필요한지
- `setup-local.ps1` 같은 로컬 초기화 스크립트가 필요한지
- 클라이언트가 접속하려는 서버 host/port가 어디인지
- 한글 텍스트가 깨지지 않고 표시되는지

## 7. 완료 시 남길 증거

다음을 문서나 로그로 남긴다.

- 설치 완료 기준 파일 트리 목록
- 한글화 오버레이 적용 후 파일 트리 목록
- `logh7-ko-installed.zip` 파일명과 SHA-256
- `logh7-ko-installed-manifest.json`
- 실행 검증 로그
- 런처/클라이언트 실행 스크린샷 요약
- 누락 DLL, 로캘, DirectX, 레지스트리 요구사항
- 서버 접속 host/port 관찰 결과

## 주의 사항

- 최종 배포 zip에는 `Logh7.bin`, `Logh7.cue`, `Logh7_mode2_2048.iso` 같은 CD 이미지 파일을 넣지 않는다.
- 최종 사용자 절차에 `git lfs pull`, ISO 변환, 이미지 마운트, InstallShield 추출을 요구하지 않는다.
- 원본 `artifacts/logh7-cd/` 파일은 수정하지 않는다.
- `node_modules/`, `dist/`, Playwright 리포트, 테스트 산출물, `.omo/work/` 산출물은 커밋하지 않는다.
- Windows에서 검증하기 전에는 배포 완료로 보지 않는다.
