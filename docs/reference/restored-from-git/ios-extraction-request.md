# iOS 작업자 요청사항: 이미지 비의존 배포 zip 제작

## 목표

LOGH VII CD/ISO 이미지를 최종 사용자에게 요구하지 않는 배포본을 만든다. iOS 작업자는 기준 CD 이미지에서 필요한 데이터를 모두 풀어내고, Windows에서 압축 해제 후 바로 실행 가능한 설치 완료 게임 디렉터리 형태로 정리한다.

최종 산출물은 CD 이미지, ISO, BIN/CUE, LFS 아티팩트가 아니라 실행 파일 트리를 담은 zip이어야 한다.

## 입력

개발자/빌더 전용 입력:

- `artifacts/logh7-cd/Logh7.bin`
- `artifacts/logh7-cd/Logh7_mode2_2048.iso`
- `artifacts/logh7-cd/Logh7.cue`

이 입력은 분석과 추출에만 사용한다. 최종 사용자 배포물에 포함하지 않는다.

## 필수 작업

1. ISO 루트에서 `setup.ini`, `setup.inx`, `data1.hdr`, `data1.cab`, `data2.cab`, 런처, DirectX/런타임 파일 목록을 추출한다.
2. InstallShield 전용 추출 도구로 `data1.cab`/`data2.cab` 페이로드를 모두 푼다.
3. 설치 프로그램이 Windows에 배치하는 최종 게임 디렉터리 구조를 재구성한다.
4. `G7Start.exe`, `G7MTClient.exe`, `Gin7UpdateClient.exe`, `update.ini`, `constmsg.dat`, `messages_*.dat`, DLL, 설정 파일을 포함한 실행 파일 트리를 만든다.
5. 설치 중 생성되는 INI, 레지스트리, 런타임 의존성이 있는지 기록한다.
6. 레지스트리가 필요하면 zip 안에 `setup-local.ps1` 또는 동등한 초기화 스크립트로 재현한다.
7. 한글화 적용 전 기준 설치 트리를 `.omo/work/logh7-installed/` 형태로 정리한다.
8. 한글화 오버레이를 적용한 실행 트리를 `.omo/work/logh7-ko-installed/` 형태로 만든다.
9. `logh7-ko-installed/`를 압축해 배포용 zip 후보를 만든다.
10. Windows에서 zip을 풀고 런처 또는 클라이언트를 실행해 게임 시작 화면까지 도달하는지 확인한다.

## 금지 사항

- 최종 사용자에게 CD, ISO, BIN/CUE, LFS 이미지 다운로드를 요구하지 않는다.
- 최종 릴리스 zip 안에 `Logh7.bin`, `Logh7_mode2_2048.iso`, `Logh7.cue`를 넣지 않는다.
- 최종 사용자 절차에 `git lfs pull`, ISO 변환, 이미지 마운트, InstallShield 추출을 포함하지 않는다.
- 추출 파일 포맷, 인코딩, 네트워크 프로토콜을 추측으로 확정하지 않는다.
- 기준 LFS 이미지를 직접 수정하거나 덮어쓰지 않는다.

## 산출물

iOS 작업자는 다음을 제공한다.

- 설치 완료 기준 파일 트리 목록
- 한글화 적용 후 파일 트리 목록
- 각 파일의 SHA-256 매니페스트
- 추출 명령과 사용한 도구 버전
- 설치 중 필요한 레지스트리/INI/런타임/DLL 목록
- `setup-local.ps1` 또는 초기화 절차가 필요한 경우 해당 스크립트
- 배포 zip 후보 파일명과 SHA-256
- Windows 실행 검증 로그와 스크린샷 요약

## 완료 기준

작업 완료는 다음을 모두 만족해야 한다.

1. 배포 zip 안에 CD/ISO/BIN/CUE 이미지가 없다.
2. 새 Windows 작업 디렉터리에 zip을 풀 수 있다.
3. 사용자가 별도 추출 도구나 LFS 데이터를 받지 않아도 된다.
4. 필요한 로컬 초기화가 zip 내부 스크립트로 재현된다.
5. 런처 또는 클라이언트가 Windows에서 실행된다.
6. 게임 시작 화면까지 도달한 증거가 있다.
7. 빌드/추출/검증 명령이 문서와 로그로 남아 있다.

## Windows Codex가 이어받을 일

Windows Codex는 iOS 산출물을 받은 뒤 다음을 검증한다.

- zip 압축 해제 후 파일 구조 확인
- `setup-local.ps1` 실행 필요 여부 확인
- 런처/클라이언트 실행
- 누락 DLL, 로캘, DirectX, 레지스트리 요구사항 재검증
- 서버 접속 host/port 관찰
- 한글 텍스트 표시와 인코딩 깨짐 여부 확인
