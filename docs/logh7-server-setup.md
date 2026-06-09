# LOGH VII 로컬 서버 구성

현재 저장소에서 증명 가능한 서버 정보는 정적 분석 결과에 한정된다. 레거시 실행 파일은 자동 실행하지 않는다.

## 정적 발견

```powershell
python tools/logh7_pipeline.py discover-server artifacts/logh7-cd/Logh7_mode2_2048.iso --out .omo/ulw-loop/evidence/server-discovery.json
```

현재 발견된 후보:

- 실행 파일: `G7MTClient.exe`, `Gin7UpdateClient.exe`
- 설정 파일: `update.ini`
- URL: `http://www.gineiden.com`
- 상태: `static-evidence-only`

이 결과는 `data1.hdr`와 `setup.inx`의 문자열 근거다. 실제 게임 서버 프로토콜, 포트, 인증 방식, 클라이언트 접속 절차는 아직 증명되지 않았다. 이를 확인하려면 InstallShield 페이로드를 안전한 작업 디렉터리에 추출한 뒤, `G7MTClient.exe`, `Gin7UpdateClient.exe`, `update.ini`를 샌드박스에서 추가 분석해야 한다.

## 역할 분리 권장안

클라이언트와 서버 작업은 운영체제를 분리한다.

- Windows PC: LOGH VII 설치, 런처, 클라이언트 실행, DirectX/레지스트리/호환성 설정, 실제 접속 동작 캡처를 담당한다.
- macOS 내장 Linux: 리소스/업데이트 서버 분석, Docker 이미지 빌드, 패킷 캡처, 프로토콜 분석, 자동화된 회귀 테스트를 담당한다.
- AWS Docker: 테스트를 제외한 실제 서버 실행 위치다. Windows 클라이언트가 접속할 호스트/포트는 AWS 컨테이너 기준으로 문서화한다.

이 분리는 레거시 Windows 바이너리 실행 위험을 Windows 샌드박스에 가두고, 서버 쪽 반복 분석은 macOS 내장 Linux에서 수행하되 실제 접속 검증과 장기 실행은 AWS Docker로 고정하기 위한 것이다. 서버 프로토콜이 확인되기 전까지 이 저장소의 Node 서버는 게임 서버가 아니라 매니페스트와 업데이트 후보를 로컬에서 검증하는 보조 리소스 서버다.

## AWS Docker 운영 원칙

서버는 테스트 때만 로컬에서 직접 실행한다. Windows 클라이언트가 실제로 접속할 서버는 AWS의 Docker 컨테이너로 실행한다.

운영 단계에서 필요한 산출물:

- Dockerfile 또는 이미지 빌드 명령
- 이미지 태그
- 컨테이너 실행 명령
- AWS host/port
- 보안 그룹 또는 방화벽 규칙
- 로그 확인 명령
- 재시작 절차
- Windows 클라이언트 접속 캡처

## 로컬 리소스 서버

저장소는 발견 매니페스트를 로컬에서 확인하기 위한 의존성 없는 Node HTTP 서버를 제공한다. 기본 바인딩은 `127.0.0.1`이며 외부 인터페이스에 열지 않는다.

```powershell
npm run server:logh7 -- --host 127.0.0.1 --port 4787 --manifest .omo/ulw-loop/evidence/localization-manifest.json
```

다른 터미널에서 확인한다.

```powershell
npm run server:health -- --host 127.0.0.1 --port 4787
curl.exe -i http://127.0.0.1:4787/manifest
curl.exe -i http://127.0.0.1:4787/resources/../../package.json
```

기대 결과:

- `/health`는 HTTP 200과 `ok: true`를 반환한다.
- `/manifest`는 지정한 JSON 매니페스트를 반환한다.
- `/resources/../../package.json` 같은 경로 탈출 요청은 404를 반환하고 저장소 파일을 노출하지 않는다.

## 검증 명령

```powershell
npm run test:server
npm test
```

`npm test`는 Python 도구 테스트, Node 서버 테스트, 기존 Playwright 인증 회귀 테스트를 모두 실행한다.
