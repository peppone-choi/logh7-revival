# LOGH VII Windows 클라이언트/ISO 분석 도구

이 문서는 LOGH VII 클라이언트 실행, 설치 검증, ISO/InstallShield 분석 중 Windows 환경이 필요한 도구를 정리한다. 서버 장기 실행과 프로토콜 재구현은 Linux에서 진행하고, Windows는 원본 클라이언트가 실제로 어떻게 설치되고 접속을 시도하는지 확인하는 역할로 둔다.

## 기본 환경

| 도구 | 용도 | 비고 |
| --- | --- | --- |
| Windows 10/11 샌드박스 또는 VM | 레거시 설치/클라이언트 실행 격리 | 스냅샷을 만든 뒤 설치와 실행을 반복한다. |
| PowerShell 7 또는 Windows PowerShell | 검증 명령 실행 | 저장소 명령과 증거 캡처를 통일한다. |
| Git for Windows + Git LFS | 저장소와 CD 아티팩트 동기화 | `git lfs pull`로 BIN/ISO를 받는다. |
| Node.js LTS | Vite/Playwright/로컬 보조 서버 실행 | 현재 저장소는 npm 스크립트를 사용한다. |
| Python 3.11+ | ISO/InstallShield 매니페스트 도구 실행 | `tools/logh7_pipeline.py`와 변환 도구에 필요하다. |
| 7-Zip | ISO 루트 확인과 임시 추출 | InstallShield CAB 자체는 7-Zip으로 열리지 않을 수 있다. |

## 런타임/호환성

| 도구 | 용도 | 비고 |
| --- | --- | --- |
| DirectX End-User Runtime | 레거시 DirectX 의존성 확인 | CD 안의 `DirectX9`도 참고한다. |
| Visual C++ Redistributable 패키지 | 실행 파일 런타임 의존성 보강 | Dependency Walker/Dependencies 결과에 따라 설치한다. |
| 일본어 시스템 로캘 또는 Locale Emulator | CP932/일본어 설치 UI 검증 | `setup.ini`는 CP932와 `0x0011` 언어 키를 사용한다. |
| Windows 방화벽 고급 보안 | 클라이언트 네트워크 시도 확인 | 임의 개방이 아니라 관찰/허용 규칙을 기록한다. |

## 설치/파일 시스템 관찰

| 도구 | 용도 | 비고 |
| --- | --- | --- |
| Sysinternals Process Monitor | 설치/실행 중 파일, 레지스트리, 네트워크 접근 추적 | 필터를 `G7Start.exe`, `G7MTClient.exe`, `Gin7UpdateClient.exe` 중심으로 둔다. |
| Sysinternals Process Explorer | 실행 프로세스, DLL, 핸들 확인 | 충돌 시 로드 DLL과 작업 디렉터리를 확인한다. |
| Regshot 또는 RegistryChangesView | 설치 전후 레지스트리 차이 비교 | 서버 주소, 설치 경로, 업데이트 설정 후보를 찾는다. |
| Everything 또는 PowerShell `Get-ChildItem` | 설치 산출물 목록화 | 추출 매니페스트와 실제 설치 결과를 대조한다. |

## 바이너리/리소스 분석

| 도구 | 용도 | 비고 |
| --- | --- | --- |
| Dependencies | PE DLL 의존성 확인 | 구형 Dependency Walker보다 최신 Windows에서 안정적이다. |
| Resource Hacker | EXE/DLL 문자열, 아이콘, 버전 리소스 확인 | 한글화 후보 리소스를 빠르게 확인한다. |
| Detect It Easy | 패커/컴파일러/PE 특성 확인 | 난독화 여부와 빌드 도구 단서를 얻는다. |
| HxD | 바이트 단위 확인과 CP932/UTF-16LE 후보 비교 | 원본 수정은 하지 않고 복사본에서만 확인한다. |
| x64dbg 또는 WinDbg | 크래시/런타임 동작 관찰 | 자동화 전에는 샌드박스에서 수동 관찰만 한다. |

## 네트워크 관찰

| 도구 | 용도 | 비고 |
| --- | --- | --- |
| Wireshark + Npcap | 클라이언트 접속/업데이트 시도 패킷 캡처 | Linux 서버 IP로 접속하게 한 뒤 캡처한다. |
| TCPView | 프로세스별 포트 연결 확인 | 어떤 EXE가 어떤 원격 주소/포트로 나가는지 빠르게 본다. |
| curl.exe | 로컬 보조 서버 응답 검증 | `/health`, `/manifest`, 업데이트 후보 URL 확인에 쓴다. |

## InstallShield 추출 후보

| 도구 | 용도 | 비고 |
| --- | --- | --- |
| unshield | InstallShield CAB 목록/추출 | Windows에서 빌드가 번거로우면 Linux 서버에서 실행하는 편이 낫다. |
| UniExtract2 | Windows에서 InstallShield 패키지 추출 시도 | 결과는 반드시 해시와 파일 목록으로 기록한다. |
| i6comp/i5comp 계열 도구 | 구형 InstallShield CAB 실험 | 출처와 버전을 문서화하고 원본 아티팩트에는 쓰지 않는다. |

## Windows에서 캡처할 증거

1. 설치 전후 파일 목록과 레지스트리 차이.
2. `G7Start.exe`, `G7MTClient.exe`, `Gin7UpdateClient.exe` 실행 시 프로세스 트리.
3. 로드 DLL과 누락 DLL.
4. 클라이언트가 접속하려는 호스트, 포트, URL.
5. `update.ini`, `constmsg.dat`, `messages_*.dat`의 실제 설치 위치.
6. 일본어 로캘/CP932 없을 때와 있을 때의 설치/실행 차이.

## 작업 원칙

- 원본 `artifacts/logh7-cd/Logh7.bin`과 `Logh7_mode2_2048.iso`는 수정하지 않는다.
- 설치와 실행은 VM 스냅샷 위에서 수행한다.
- 추출물과 캡처 로그는 `.omo/work/` 또는 별도 무시 디렉터리에 둔다.
- 서버 프로토콜 분석과 장기 실행은 Linux에서 진행한다.
- Windows에서 얻은 네트워크/파일/레지스트리 증거만 Linux 서버 구현 요구사항으로 넘긴다.
