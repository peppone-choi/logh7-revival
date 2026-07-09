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

먼저 ISO 루트 파일을 작업 디렉터리에 추출한다.

```powershell
python tools/logh7_pipeline.py extract-root artifacts/logh7-cd/Logh7_mode2_2048.iso --out .omo/work/logh7-iso-root --manifest-out .omo/work/logh7-iso-root-manifest.json
```

InstallShield CAB 추출기는 `unshield`를 사용한다. Scoop이 있으면 다음으로 설치할 수 있다.

```powershell
scoop install unshield
unshield -d .omo/work/logh7-extracted x .omo/work/logh7-iso-root/data1.cab
python tools/logh7_pipeline.py build-installed .omo/work/logh7-extracted --iso-root .omo/work/logh7-iso-root --out .omo/work/logh7-installed --manifest-out .omo/work/logh7-installed-manifest.json
```

필수 작업:

- `.omo/work/logh7-iso-root/data1.hdr`, `.omo/work/logh7-iso-root/data1.cab`, `.omo/work/logh7-iso-root/data2.cab`가 추출 입력에 있는지 확인한다.
- `unshield` 추출 결과에서 `update.ini`, `Gin7UpdateClient.exe`, `exe/G7MTClient.exe`, `data/MsgDat/constmsg.dat`가 있는 설치 루트를 확인한다.
- `build-installed` 명령으로 `.omo/work/logh7-installed/`를 만든다. 이 명령은 ISO 루트의 `g7start.exe`를 설치 트리 루트의 `G7Start.exe`로 추가하고, `setup-local.ps1`, `launch-client.ps1`, `WINDOWS-COMPATIBILITY.txt`를 생성한다. 최종 `exe/G7MTClient.exe`는 기본 canonical playable 또는 `--playable-client`로 지정한 EXE를 쓰며, 옆 `.playable-manifest.json`의 stack에 `menufix`, `dlgfix`, `earlygrid-ringclear`가 모두 있어야 한다.
- 한글화 교체 파일은 `.omo/work/logh7-ko-overlay/`에 같은 상대 경로로 둔다.

예시 구조:

```text
.omo/work/logh7-installed/G7Start.exe
.omo/work/logh7-installed/exe/G7MTClient.exe
.omo/work/logh7-installed/Gin7UpdateClient.exe
.omo/work/logh7-installed/update.ini
.omo/work/logh7-installed/data/MsgDat/constmsg.dat
.omo/work/logh7-installed/setup-local.ps1
.omo/work/logh7-installed/launch-client.ps1
.omo/work/logh7-installed/WINDOWS-COMPATIBILITY.txt

.omo/work/logh7-ko-overlay/data/MsgDat/constmsg.dat
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
powershell -ExecutionPolicy Bypass -File .\setup-local.ps1
powershell -ExecutionPolicy Bypass -File .\launch-client.ps1
```

검증할 항목:

- `setup-local.ps1`이 `HKCU\Software\BOTHTEC\銀河英雄伝説VII\1.0`의 `Install` 값과 per-user AppCompatFlags를 만든다.
- `launch-client.ps1`이 `exe`를 working directory로 두고 `G7MTClient.exe`를 실행한다.
- `launch-client.ps1` 실행 전후로 `exe/String.txt`가 `exe/String.txt.original`에서 복원된다.
- 누락 DLL이 있는지
- 일본어 로캘 또는 Locale Emulator CP932 설정이 필요한지
- 클라이언트가 접속하려는 서버 host/port가 어디인지
- 한글 텍스트가 깨지지 않고 표시되는지

패킷 캡처를 남겼으면 같은 작업 디렉터리에서 분석 결과를 생성한다.

```powershell
python tools/logh7_pipeline.py gameplay-trace-analyze .omo/ulw-loop/evidence/gameplay-trace.jsonl --out .omo/ulw-loop/evidence/gameplay-packets.json
```

현재 확인된 로그인 요청은 `0x0034` client-to-server frame이고, configured response probe의 서버 응답 후보는 `0x0035` server-to-client frame이다. 이 분석 결과는 서버 schema를 늘릴 때 입력 증거로 쓰되, 로그인 성공 응답으로 간주하지 않는다.

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
