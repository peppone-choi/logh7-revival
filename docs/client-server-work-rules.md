# LOGH VII 클라이언트/서버 작업 분리 규칙

이 프로젝트는 Windows PC와 macOS 내장 Linux 환경을 함께 사용한다. 두 환경은 별도 역할을 가진다.

## 기본 원칙

- Windows PC는 클라이언트 실행과 관찰을 담당한다.
- macOS 내장 Linux는 서버, 추출, 분석, 장기 실행을 담당한다.
- macOS와 Linux를 별도 작업자로 취급하지 않는다. 서버 쪽 작업자는 macOS 안의 내장 Linux 환경이다.
- 원본 CD 아티팩트는 수정하지 않는다.
- Windows에서 얻은 실행 증거를 Linux 서버 구현 요구사항으로 넘긴다.
- Linux에서 만든 서버/추출 결과를 Windows 클라이언트로 검증한다.

## Windows PC 담당: 클라이언트

Windows PC는 원본 클라이언트가 실제로 어떻게 설치되고 실행되는지 확인한다.

필수 작업:

- LOGH VII 설치 실행과 설치 결과 확인
- `G7Start.exe`, `G7MTClient.exe`, `Gin7UpdateClient.exe` 실행 관찰
- DirectX, Visual C++ 런타임, DLL 의존성 확인
- 일본어 시스템 로캘, CP932, Locale Emulator 필요 여부 확인
- 설치 전후 파일 목록과 레지스트리 차이 캡처
- 클라이언트가 접근하는 URL, 호스트, 포트, 파일, 레지스트리 키 기록
- Windows 방화벽/호환성 설정이 필요한지 확인
- 실제 클라이언트가 macOS 내장 Linux 서버에 접속 가능한지 검증

권장 도구:

- Process Monitor
- Process Explorer
- TCPView
- Wireshark + Npcap
- Dependencies
- Resource Hacker
- Detect It Easy
- HxD
- x64dbg 또는 WinDbg
- Locale Emulator

Windows에서 산출해야 할 증거:

- 실행 파일별 프로세스 트리
- 누락 DLL과 로드 DLL 목록
- 설치 디렉터리 파일 목록
- 레지스트리 변경 목록
- 네트워크 접속 시도 캡처
- 접속 대상 host/port/URL
- 클라이언트 오류 메시지와 스크린샷

## macOS 내장 Linux 담당: 서버와 분석

macOS 내장 Linux 환경은 추출, 정적 분석, 서버 구현, 장기 실행을 담당한다.

필수 작업:

- InstallShield CAB 추출
- `data1.hdr`, `data1.cab`, `data2.cab` 구조 분석
- `constmsg.dat`, `messages_*.dat`, `update.ini` 등 리소스 후보 목록화
- 서버/업데이트 관련 URL, 포트, 프로토콜 후보 분석
- 로컬/원격 서버 실행 스크립트 작성
- Windows 클라이언트가 접속할 host/port 제공
- 서버 로그와 패킷 캡처 저장
- 장기 실행과 재시작 절차 문서화
- 자동 테스트와 회귀 테스트 작성

권장 도구:

- unshield
- binwalk
- strings
- file
- hexdump 또는 xxd
- objdump
- radare2 또는 Ghidra
- tcpdump
- Wireshark
- Node.js
- Python
- systemd 또는 tmux

Linux에서 산출해야 할 증거:

- 추출된 파일 목록과 SHA-256
- 리소스 후보 매니페스트
- 서버 후보 설정 파일
- 서버 실행 명령
- 포트 바인딩 증거
- HTTP 또는 TCP 응답 캡처
- Windows 클라이언트 접속 로그
- 프로토콜 분석 메모

## 양쪽 간 인수인계 규칙

Windows에서 Linux로 넘길 것:

- 클라이언트가 요청한 host/port/URL
- 접속 실패 로그와 오류 메시지
- Wireshark 또는 TCPView 캡처 요약
- 설치된 `update.ini`와 관련 설정 파일 위치
- 클라이언트가 요구하는 파일명과 경로

Linux에서 Windows로 넘길 것:

- 서버 실행 주소와 포트
- 필요한 hosts/DNS 우회 설정
- 서버 로그 위치
- 테스트할 클라이언트 시나리오
- 업데이트/리소스 응답 샘플

## 금지 사항

- Windows에서 서버를 장기 실행하지 않는다.
- Linux에서 Windows 전용 클라이언트 실행을 기본 검증으로 삼지 않는다.
- 원본 `Logh7.bin`과 `Logh7_mode2_2048.iso`를 직접 수정하지 않는다.
- 추출된 원본 게임 파일을 커밋하지 않는다.
- 추측으로 프로토콜이나 인코딩을 확정하지 않는다.
- 캡처 없이 “접속된다” 또는 “서버가 맞다”고 기록하지 않는다.

## 완료 기준

클라이언트/서버 연동 단계는 다음 증거가 모두 있을 때 완료로 본다.

1. Windows 클라이언트가 접속을 시도한 대상 host/port가 캡처됨.
2. macOS 내장 Linux 서버가 같은 host/port 또는 리다이렉션된 대상에서 실행됨.
3. 서버 로그가 Windows 클라이언트 요청을 기록함.
4. 패킷 캡처가 클라이언트 요청과 서버 응답을 보여줌.
5. 재현 명령과 환경 설정이 문서화됨.
