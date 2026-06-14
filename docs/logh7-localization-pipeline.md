# LOGH VII 한글화 파이프라인

이 저장소의 기준 CD 자료는 `artifacts/logh7-cd/` 아래 Git LFS 아티팩트로 보관한다. 사용자가 별도 원본 CD를 구한다는 전제는 두지 않는다. LFS의 BIN/ISO는 개발자 분석과 추출용 입력일 뿐이며, 최종 배포물은 이미지를 필요로 하지 않아야 한다. 한글화는 CD/ISO에서 필요한 파일을 모두 풀어낸 실행 가능한 설치 디렉터리에 반영하고, 그 디렉터리를 zip으로 묶어 배포한다.

## 개발자 기준 검증

다음 명령은 개발자/빌더가 기준 입력을 분석하고 추출할 때만 사용한다. 최종 사용자의 설치 절차에 `git lfs pull`, ISO 변환, 이미지 마운트가 들어가면 안 된다.

```powershell
git lfs pull
npm install
npm run build
npm test
```

Playwright 브라우저가 없으면 다음을 먼저 실행한다.

```powershell
npx playwright install
```

## CD 아티팩트 확인

이 단계도 개발자 분석용이다. 배포 zip을 받는 사용자는 `artifacts/logh7-cd/`의 BIN/ISO를 직접 다루지 않고, 이미 풀려 있는 실행 파일 트리만 받는다.

```powershell
python tools/convert_mode2_bin_to_iso.py artifacts/logh7-cd/Logh7.bin artifacts/logh7-cd/Logh7_mode2_2048.iso
python tools/logh7_pipeline.py inspect artifacts/logh7-cd/Logh7_mode2_2048.iso --out .omo/ulw-loop/evidence/localization-manifest.json
python tools/logh7_pipeline.py extract-root artifacts/logh7-cd/Logh7_mode2_2048.iso --out .omo/work/logh7-iso-root --manifest-out .omo/work/logh7-iso-root-manifest.json
unshield -d .omo/work/logh7-extracted x .omo/work/logh7-iso-root/data1.cab
python tools/logh7_pipeline.py build-installed .omo/work/logh7-extracted --iso-root .omo/work/logh7-iso-root --out .omo/work/logh7-installed --manifest-out .omo/work/logh7-installed-manifest.json
```

현재 확인된 구조:

- `Logh7.cue`는 `TRACK 01 MODE2/2352`를 가리킨다.
- `Logh7_mode2_2048.iso`는 ISO9660 `CD-RTOS CD-BRIDGE` 볼륨이며 식별자는 `GINEIDEN7`이다.
- ISO 루트에는 `setup.ini`, `setup.inx`, `data1.hdr`, `data1.cab`, `data2.cab`, `G7Start.exe`, DirectX 런타임, PDF가 있다.
- `setup.ini`는 CP932로 해석되며 제품명 `銀河英雄伝説VII`, 회사명 `ボーステック株式会社`, 기본 언어 `0x0011`을 담는다.
- `data1.cab`와 `data2.cab`는 표준 Microsoft CAB(`MSCF`)가 아니라 InstallShield CAB로 식별된다.

## 한글화 후보

매니페스트의 `localization_candidates`는 현재 다음 파일을 우선 후보로 기록한다.

- `setup.ini`: CP932 InstallShield 메타데이터와 일본어 언어 키.
- `data1.hdr`: 설치 페이로드 파일명과 언어/구성 그룹.
- `setup.inx`: InstallShield 컴파일 스크립트와 설치 UI 흐름.
- `data1.cab`, `data2.cab`: 실제 설치 페이로드로 추정되는 InstallShield CAB.
- `G7Start.exe`: 런처 문자열, 아이콘, PE 리소스 후보.

정적 문자열 조사에서는 `data1.hdr` 안에서 `constmsg.dat`, `messages_0.dat` 계열, `G7MTClient.exe`, `Gin7UpdateClient.exe`, `update.ini`, `http://www.gineiden.com` 후보가 확인됐다. 이 정보는 텍스트/폰트/인코딩 제약을 추정하는 근거일 뿐이며, 실제 패치 가능 여부는 InstallShield 전용 추출기로 페이로드를 풀고 원본 파일 포맷을 다시 분석해야 한다.

## 다음 패치 경로

1. `extract-root` 명령으로 ISO 루트의 `setup.ini`, `setup.inx`, `data1.hdr`, `data1.cab`, `data2.cab`, 런처, DirectX 파일을 `.omo/work/logh7-iso-root/`에 추출한다.
2. InstallShield CAB를 지원하는 `unshield`를 준비한다. 7-Zip은 현재 `data1.cab`/`data2.cab`를 일반 CAB로 열지 못한다.
3. `unshield -d .omo/work/logh7-extracted x .omo/work/logh7-iso-root/data1.cab`로 InstallShield 페이로드를 푼다.
4. `constmsg.dat`, `messages_*.dat`, `messages_com_*.dat`, `messages_tac_*.dat`가 추출되는지 확인한다.
5. 파일별 인코딩을 샘플 바이트와 문자열 테이블 단위로 판정한다. 현재 ISO/설치 메타데이터의 기본 근거는 CP932와 Japanese locale `0x0011`이다.
6. 한글 번역은 원본 바이트 길이, 종료 문자, 포인터/오프셋 테이블을 확인하기 전까지 원본 파일에 직접 쓰지 않는다.
7. 패치 산출물은 원본 LFS 아티팩트가 아니라 `.omo/work/logh7-ko-overlay/` 또는 별도 패치 파일로 만든다.

## 텍스트 인코딩과 폰트 방침

원본 클라이언트는 Unicode 렌더링 경로가 아니라 GDI ANSI 함수(`CreateFontA` → `TextOutA`/`ExtTextOutA`/`DrawTextA`)를 사용한다. 따라서 최종 한글화는 UTF-8 파일을 클라이언트에 직접 넣는 방식으로 진행하지 않는다.

- 번역 원문과 작업 카탈로그는 UTF-8로 관리한다.
- 빌드 단계에서 클라이언트가 읽는 교체 파일(`exe/String.txt`, MsgDat 계열 등)은 대상별 레이아웃을 검증한 뒤 CP949 바이트로 산출한다.
- 실행 EXE는 `tools/logh7_japanese_font_patch.py --charset hangeul`로 `CreateFontA` charset immediate 두 곳을 `HANGEUL_CHARSET`(`0x81`, `6A 81`)으로 바꾼다.
- 원문 일본어를 읽어야 하는 RE/QA 세션은 `--charset shiftjis`를 사용한다. 이 경로는 실클라 스크린샷으로 검증됐다.
- UTF-8/UTF-16 전환은 `TextOutA` 호출부 전체를 `W` 함수 계열로 바꾸는 별도 바이너리 포팅 작업이므로, 현재 한글화 1차 목표에서는 제외한다.

검증 기준은 화면이다. CP949 산출물과 `HANGEUL_CHARSET` 패치를 적용한 클라이언트로 로그인/로비 화면을 띄워 한글 버튼, 본문, 줄바꿈, 잘림 여부를 스크린샷으로 확인한 뒤에만 한글 표시 완료로 본다.

### UTF-8/Unicode 포팅 선택지

ANSI를 완전히 제거하고 UTF-8 원문을 직접 쓰려면 단순 charset 패치로는 부족하다. 현재 클라이언트는 `char*`/ANSI 텍스트를 `TextOutA`/`ExtTextOutA`/`DrawTextA`에 넘긴다. UTF-8을 제품 기본으로 삼으려면 다음 중 하나를 선택해야 한다.

1. **실험용: application manifest `activeCodePage=UTF-8`**
   - Windows 10 1903+에서 legacy ANSI 코드 페이지를 UTF-8로 돌리는 빠른 실험이다.
   - 장점: EXE 내부 호출부를 많이 건드리지 않고 UTF-8 `String.txt` 실험이 가능하다.
   - 단점: 클라이언트 내부가 byte length, 고정 버퍼, 1바이트 문자 전제를 쓰면 UTF-8 다바이트 길이 때문에 잘림/오프셋/프로토콜 필드가 깨질 수 있다. OS 버전 의존성도 생긴다.
   - 결론: 프로토타입 실험용이며, 최종 한글화 기본 경로로 승격하지 않는다.

2. **권장 2차 목표: A→W 렌더링 shim**
   - `TextOutA`, `ExtTextOutA`, `DrawTextA`, 필요 시 `CreateFontA` 호출을 후킹하거나 IAT 패치해 자체 wrapper로 보낸다.
   - wrapper는 입력 `char*`를 `MultiByteToWideChar(CP_UTF8, ...)`로 UTF-16 버퍼에 변환한 뒤 `TextOutW`/`ExtTextOutW`/`DrawTextW`/`CreateFontW`를 호출한다.
   - 길이 인자가 `-1`인지, byte count인지, rectangle clipping/ellipsis 처리인지 함수별로 보존해야 한다.
   - 장점: 번역 파일을 UTF-8로 유지하고 Windows locale/codepage 영향에서 벗어날 수 있다.
   - 단점: 모든 텍스트 출력 callsite와 문자열 입력/측정 함수(`GetTextExtentPoint*` 등)를 찾아야 하며, wrapper 코드 cave 또는 DLL injection/IAT thunk가 필요하다.

3. **장기 목표: 문자열 로더부터 UTF-16 내부화**
   - `String.txt`/MsgDat 로더에서 UTF-8을 읽어 UTF-16 캐시를 만들고, UI 객체가 wide pointer를 들고 다니게 바꾼다.
   - 가장 깨끗하지만 구조체 레이아웃과 수명 관리까지 바꾸므로 현재 서버/플레이어블 복구와 병행하기엔 과하다.

현재 방침은 **1차 제품 한글화는 CP949 + `HANGEUL_CHARSET`**, **2차 품질 개선은 A→W UTF-8 shim**이다. 이렇게 나누면 당장 한글 UI를 검증하면서도, 번역 원문은 UTF-8 카탈로그로 유지해 나중에 Unicode 포팅으로 갈 수 있다.

## 병렬 포팅 진행 방침

포팅은 서버/프로토콜 복구와 동시에 진행한다. 단, 두 트랙이 같은 실행 파일을 서로 다른 방식으로 패치하다가 결과를 오염시키지 않도록 산출물과 검증 게이트를 분리한다.

### Track A: 플레이어블 서버/세션 복구

- 목표: 원본 클라이언트가 로그인 후 세션/로비/월드 요청을 정상적으로 이어가게 한다.
- 현재 다음 블로커: `0x2006` 응답은 message object input/handler까지 소비되지만, 아직 다음 요청(`0x2009` 등)이 나오지 않는다. 따라서 `0x2006` body의 의미 필드와 handler side effect를 먼저 확정한다.
- 산출물: 서버 응답 구현, protocol fixture, real-client trace, `.debug-journal.md` G### 증거.
- 검증: 실제 클라이언트로 로그인 후 다음 요청/화면 전환/세션 선택 동작을 확인한다. 화면이나 packet trace 없이 “로그인 성공”으로 문서화하지 않는다.

### Track B: 1차 한글 표시 포팅

- 목표: 게임 접속 복구를 기다리지 않고, 이미 도달 가능한 로그인/로비/메뉴 화면부터 한글 표시를 검증한다.
- 입력: UTF-8 번역 카탈로그.
- 산출: 클라이언트 교체 파일은 CP949 바이트로 생성하고, 실행 파일은 `tools/logh7_japanese_font_patch.py --charset hangeul`로 `HANGEUL_CHARSET` 패치를 적용한다.
- 대상 순서: `exe/String.txt` → 설치/런처 문자열 → MsgDat 계열 텍스트 후보 순서로 진행한다.
- 검증: 한글 버튼/본문/줄바꿈/잘림을 실제 클라이언트 스크린샷으로 확인한다. 이 트랙의 EXE는 Track A의 프로토콜 probe EXE와 섞지 않는다.

### Track C: 2차 UTF-8/Unicode 포팅

- 목표: CP949 산출물을 제품 기본으로 고정하지 않고, 나중에 UTF-8 원문을 클라이언트가 직접 읽고 표시할 수 있게 만든다.
- 시작 조건: Track A에서 로비/세션 전환이 안정화되고, Track B에서 주요 UI 텍스트 위치와 폭 문제가 확인된 뒤 시작한다.
- 1단계 실험: `activeCodePage=UTF-8` manifest로 UTF-8 `String.txt`가 어디까지 버티는지 확인한다. 실패해도 최종 경로로 승격하지 않는다.
- 2단계 본 구현: `TextOutA`/`ExtTextOutA`/`DrawTextA`/텍스트 폭 측정 함수를 UTF-8→UTF-16 wrapper로 보내고 `W` API를 호출하는 A→W shim을 만든다.
- 검증: 동일 UTF-8 카탈로그에서 CP949 산출물과 UTF-8 shim 산출물을 나란히 만들어 같은 화면 스크린샷을 비교한다.

### 병렬 작업 규칙

1. Track A는 순정 또는 프로토콜 probe EXE만 사용한다.
2. Track B는 `HANGEUL_CHARSET` 표시 패치 EXE만 사용한다.
3. Track C는 별도 UTF-8 실험 EXE를 사용한다.
4. 각 트랙은 manifest에 base EXE SHA, 적용 패치, 입력 텍스트 해시, 출력 파일 해시를 기록한다.
5. 한 트랙의 성공 화면을 다른 트랙의 성공 근거로 재사용하지 않는다.
6. 최종 통합은 Track A 서버가 안정화된 뒤, Track B의 한글 오버레이를 같은 설치 트리에 적용해 다시 실클라 QA를 통과해야 한다.

## 아티팩트 반영 전략

원본을 수정하지 않는다는 말은 최종 한글화 산출물을 만들지 않는다는 뜻이 아니다. CD/ISO 이미지는 분석 입력으로만 쓰고, 배포물은 이미지를 다시 요구하지 않는 설치 완료 상태의 파일 트리로 만든다.

### 보존할 기준 입력

- `artifacts/logh7-cd/Logh7.bin`
- `artifacts/logh7-cd/Logh7_mode2_2048.iso`
- `artifacts/logh7-cd/Logh7.cue`

이 파일들은 프로젝트가 확보한 분석 입력이자 해시 검증 기준이다. 빌드 초기에만 필요하며, 최종 배포물에는 포함하지 않는다. 실수로 덮어쓰면 어떤 변경이 한글화 패치 때문인지, 기준 아티팩트 손상 때문인지 구분할 수 없다.

### 커밋할 것

- 추출/재패킹 스크립트
- 리소스 매니페스트
- 원본 파일 해시와 패치 대상 파일 해시
- 한글 번역 카탈로그
- 바이너리 패치 레시피
- 패치 오버레이의 소스 파일
- 재빌드 절차 문서

커밋 대상은 “LFS 기준 아티팩트에서 설치 완료 파일 트리와 배포 zip을 다시 만들 수 있는 재료”다. 저작권이 있는 추출 원본 파일, 설치 완료 파일 트리, 거대한 재빌드 ISO 자체는 기본적으로 일반 소스 커밋에 넣지 않는다.

### 생성할 파생 아티팩트

작업 디렉터리에서 다음 산출물을 만든다.

- `.omo/work/logh7-extracted/`: 원본 ISO/InstallShield CAB에서 추출한 파일
- `.omo/work/logh7-installed/`: 설치 프로그램이 만든 결과와 동일하게 정리한 실행 가능한 게임 디렉터리
- `.omo/work/logh7-ko-overlay/`: 한글화된 교체 파일과 패치 메타데이터
- `.omo/work/logh7-ko-installed/`: 한글화 오버레이를 적용한 실행 가능한 게임 디렉터리
- `.omo/work/logh7-build/`: 최종 테스트용 zip, 설치형 zip, 또는 배포 패키지

이 산출물은 재현 빌드 결과이며, 일반 소스 커밋에는 넣지 않는다. 릴리스에는 최종 사용자가 실행하는 zip이나 설치 패키지만 올리고, LFS의 BIN/ISO 또는 그와 같은 CD 이미지는 올리지 않는다. 최종 사용자는 별도 CD나 LFS 이미지를 준비하는 대신, 프로젝트가 제공하는 검증된 zip이나 설치 패키지를 받는 흐름을 목표로 한다.

아티팩트에 수정을 가하는 것은 피할 수 없다. 다만 수정 대상은 `artifacts/logh7-cd/`의 기준 BIN/ISO가 아니라, 기준 입력에서 풀어낸 설치 완료 파일 트리와 그 파일 트리로부터 만든 배포 zip이다. 즉 기준 입력은 분석과 추출의 출발점으로만 쓰고, 실제 한글화 반영은 `.omo/work/` 아래의 추출본, 설치 디렉터리, 오버레이 적용본, 릴리스 zip에 적용한다.

### 반영 흐름

1. LFS 기준 ISO를 읽어 `extract-root` 명령으로 `data1.hdr`, `data1.cab`, `data2.cab`와 설치 루트 파일을 추출한다.
2. InstallShield 전용 추출기 `unshield`로 설치 페이로드를 `.omo/work/logh7-extracted/`에 푼다.
3. `build-installed` 명령으로 설치 프로그램이 Windows에 배치하는 최종 파일 구조를 `.omo/work/logh7-installed/`에 재구성한다.
4. 한글화 대상 파일을 매니페스트와 해시로 고정한다.
5. 번역 카탈로그와 패치 레시피를 만든다.
6. 오버레이 파일을 `.omo/work/logh7-ko-overlay/`에 생성한다.
7. 오버레이를 `.omo/work/logh7-installed/` 복사본에 적용해 `.omo/work/logh7-ko-installed/`를 만든다.
8. 실행 스크립트, 로컬 설정, 필요한 DLL/런타임 확인 자료, 해시 매니페스트를 `logh7-ko-installed/`에 포함한다.
9. `logh7-ko-installed/`를 `.omo/work/logh7-build/`의 배포 zip으로 묶는다.
10. Windows 클라이언트에서 zip을 풀고 런처/클라이언트를 실행해 검증한다.
11. 검증된 빌드 명령, 해시, 로그를 문서와 매니페스트에 기록한다.

현재 저장소는 9단계를 다음 명령으로 자동화한다. `--overlay`는 선택 사항이며, 있으면 기준 설치 트리 위에 같은 상대 경로로 덮어쓴 뒤 zip을 만든다.

```powershell
python tools/logh7_pipeline.py package-installed .omo/work/logh7-installed --overlay .omo/work/logh7-ko-overlay --out .omo/work/logh7-build/logh7-ko-installed.zip --manifest-out .omo/work/logh7-build/logh7-ko-installed-manifest.json
```

이 명령은 zip 내부 경로를 Windows에서 풀기 좋은 상대 경로로 고정하고, `MANIFEST.json`과 외부 매니페스트에 SHA-256 해시를 기록한다. 배포 트리 안에 `.bin`, `.cue`, `.iso` 파일이 있으면 최종 사용자가 CD 이미지를 받는 형태가 되므로 zip 생성을 중단한다.

### 배포 형태

최종 배포는 사용자가 별도 원본 CD를 구할 수 없다는 전제로 결정한다.

- 설치 후 바로 실행 가능한 zip: 기본 배포 형태다. 압축을 풀면 한글화된 게임 클라이언트, 필요한 설정 파일, 실행 스크립트, 해시 매니페스트가 들어 있어야 한다.
- 재패킹 설치 패키지: zip 배포가 파일/레지스트리/런타임 요구사항을 만족하지 못할 때만 보조로 사용한다. 그래도 CD/ISO 이미지를 요구하는 형태로 만들지 않는다.
- 한글화 교체 파일 zip: 개발자 또는 이미 설치된 환경용 보조 배포물이다. 최종 사용자의 기본 경로로 삼지 않는다.
- 재빌드 ISO 또는 패치 이미지: 개발 검증용으로만 만들 수 있다. 최종 릴리스나 사용자 설치 절차에는 포함하지 않는다.
- 테스트용 내부 ISO: 개발 검증 전용이며 기본 커밋 대상이 아니다.

배포 zip의 완료 기준은 압축 해제 후 Windows에서 런처 또는 클라이언트를 실행해 게임 시작 화면까지 도달하는 것이다. 설치 프로그램을 반드시 거쳐야만 생성되는 레지스트리, INI, 런타임, DLL 의존성이 있으면 빌드 단계에서 zip 안에 포함하거나 `setup-local.ps1` 같은 초기화 스크립트로 재현한다. 사용자가 별도 CD, LFS 이미지, ISO 파일, 별도 추출 도구, 원본 패치 절차를 수행해야 하는 형태는 최종 배포로 보지 않는다.

따라서 “원본 수정 금지”는 “최종 산출물 없음”이 아니라 “LFS 기준 아티팩트는 분석 입력, 최종 배포는 이미지가 필요 없는 설치 완료 파일 트리 zip”이라는 규칙이다.

## 검증 명령

```powershell
npm run test:tools
python tools/logh7_pipeline.py inspect artifacts/logh7-cd/Logh7_mode2_2048.iso --out .omo/ulw-loop/evidence/localization-manifest.json
python tools/logh7_pipeline.py extract-root artifacts/logh7-cd/Logh7_mode2_2048.iso --out .omo/work/logh7-iso-root --manifest-out .omo/work/logh7-iso-root-manifest.json
unshield -d .omo/work/logh7-extracted x .omo/work/logh7-iso-root/data1.cab
python tools/logh7_pipeline.py build-installed .omo/work/logh7-extracted --iso-root .omo/work/logh7-iso-root --out .omo/work/logh7-installed --manifest-out .omo/work/logh7-installed-manifest.json
python tools/logh7_pipeline.py package-installed .omo/work/logh7-installed --overlay .omo/work/logh7-ko-overlay --out .omo/work/logh7-build/logh7-ko-installed.zip --manifest-out .omo/work/logh7-build/logh7-ko-installed-manifest.json
```

`localization-manifest.json`에 `data1.cab`, `data2.cab`, `setup.ini`, `setup.inx`, CP932 `setup_ini`, `installshield-cab` 판정이 들어가면 현재 단계는 재현 가능하다.
`extract-root`는 ISO 루트 파일을 `.omo/work/logh7-iso-root/`에 쓰고 SHA-256 매니페스트를 남긴다. 이 추출본은 InstallShield 전용 추출기의 입력으로 사용한다.
`build-installed`는 `update.ini`, `Gin7UpdateClient.exe`, `exe/G7MTClient.exe`, `data/MsgDat/constmsg.dat` 마커로 설치 루트를 찾고 ISO 루트의 `g7start.exe`를 `G7Start.exe`로 추가한다. `G7Start.exe`는 PE import와 실행 QA상 `DSETUP.dll`을 요구하고 DirectX setup 런타임 쌍도 필요하므로, ISO 루트의 `dsetup.dll`과 `dsetup32.dll`도 설치 트리 루트에 `DSETUP.dll`, `DSETUP32.dll`로 배치한다. 생성된 설치 트리의 `G7MTClient.exe`는 단일 legacy 로그인 주소 `202.8.80.179`를 `127.0.0.1`로 치환해 로컬 gameplay 서버로 접속하게 한다. 또한 Windows 현재 실행용 `setup-local.ps1`, `launch-client.ps1`, `WINDOWS-COMPATIBILITY.txt`를 생성한다. `setup-local.ps1`은 per-user registry/AppCompatFlags를 만들고, `launch-client.ps1`은 `exe/String.txt`를 백업본에서 복원한 뒤 `exe` working directory로 클라이언트를 실행한다. 매니페스트의 `server.clientProtocol`에는 ASCII 심볼 근거의 login/session/world 메시지 그룹, login 등록 코드(`LobbyLoginRequest=0x2000`, `LobbyLoginOK=0x2001`, `LobbyLoginNG=0x2002`), cipher transport 코드(`0x0034`, `0x0035`), 내부 dispatch 코드(`0x0030 -> 0x0300/0x0301`, `0x0034 -> 0x0405`, `0x0035 -> 0x0406`, `0x0036 -> 0x040c`), phase3 param2 runtime observations, request-derived phase3 probe 결과, phase1/phase2/phase3 decoded payload layout/checksum rule과 구현된 builder/parser 범위, phase3 manager/child-codec vtable processing pipeline, child codec Blowfish-like block transform/key-flow schema와 PE static table/corrected key schedule/block codec/phase3 encrypted frame builder/live phase1 replay 구현 범위, phase1-derived `0x0035` response가 실제 클라이언트를 후속 `0x0036`/`0x0030` packet까지 진행시킨 probe 결과, `post-handshake-handler-index`가 복원한 internal `0x040c`/`0x0301` handler 단서와 internal `0x0300` direct-handler 부재, `post-handshake-body-decode`가 복원한 stable decoded `0x0030` login/session-like body, `post-handshake-response-candidates`가 복원한 candidate response transports `0x0031/0x0032/0x0033`, `post-0030-payload-layout`이 복원한 candidate handler decoded body copy layout, `post-0030-followup-effects`가 복원한 candidate follow-up 소비 경로, `command-ok-layout`이 복원한 command OK decoded body offset/stream slot layout, `command-ok-response-candidates`가 구성한 zero-count encrypted command OK probe frames, raw `0x0030` dword ack candidate probe 결과, configured/static and dynamic response manifest schema, static/runtime request-key 후보 배제 결과, runtime key probe 실패 경로, checksum-correct decoded payload raw-wire probe 결과, post-call encoded output capture 결과, `mpsCipherManager` 키 교환 진단 스키마가 포함된다. `gameplay-trace-analyze` CLI는 JSONL trace를 frame 방향, big-endian length, message code, `0x0034` login request, `0x0035` phase3 response candidate, observed post-handshake `0x0036`/`0x0030` client packet, `0x0031/0x0032/0x0033` command OK response candidate, 그리고 command OK 이후 client follow-up count/probe finding 단위로 정규화한다. `transport-dispatch-index` CLI는 실제 `G7MTClient.exe` jump table과 handler disassembly에서 post-handshake transport mapping을 JSON으로 복원한다. `post-handshake-handler-index` CLI는 internal `0x040c` phase4 builder가 serialize하는 client offsets, internal `0x0301` ack/timing handler의 첫 dword read/state writes, 그리고 internal `0x0300`이 같은 internal dispatch routine에서 direct payload handler가 아니라는 route 결론을 JSON으로 복원한다. `post-handshake-body-decode` CLI는 같은 connection의 `0x0034` request에서 phase1 key를 얻고 그 key로 client `0x0030` body를 child codec decode해 stable 48-byte decoded body와 marker/text field hints를 JSON으로 복원한다. `post-handshake-response-candidates` CLI는 decoded `0x0030` 이후 추적할 candidate server response transports와 internal handler targets를 transport jump table 및 internal switch table에서 JSON으로 복원한다. `post-0030-payload-layout` CLI는 candidate internal `0x0400/0x0401/0x0402` handler가 decoded body pointer에서 client state로 복사하는 크기, destination offset, follow-up call target을 JSON으로 복원한다. `post-0030-followup-effects` CLI는 candidate follow-up routine의 activation gate, entity lookup, normalizer, motion/apply call, action code writes를 JSON으로 복원한다. `command-ok-layout` CLI는 `Input_/Output_Command*` stream routine에서 Move/Parallel 1052-byte body와 Turn 276-byte body의 count offset, max count, entry base/stride, stream vtable slot을 JSON으로 복원한다. `command-ok-response-candidates` CLI는 같은 connection의 phase1 key와 child codec으로 zero-count decoded command OK body를 `0x0031/0x0032/0x0033` 전체 transport frame candidate로 구성한다. 추가 `runtime-patch-targets` CLI는 debugger attach 없이 file-backed 계측 패치를 준비하기 위해 key setup/store/read helper, child codec encode, phase1 child encode post-call, phase3 compare callsite의 VA, PE file offset, 원본 signature, executable code cave, 파일 출력용 IAT slot을 JSON guard schema로 출력한다. `runtime-keylog-patch`, `runtime-keysetup-log-patch`, `runtime-keyread-log-patch`, `runtime-child-encode-log-patch`, `runtime-child-encode-post-log-patch`, `runtime-child-schedule-log-patch` CLI는 trampoline이 runtime record buffer를 쓸 수 있도록 패치 산출물의 code-cave section에 `MEM_WRITE`를 추가하고 manifest에 section characteristics를 기록한다. 실제 prepatched `keySetupWrapper` probe는 로그인 요청과 같은 실행에서 두 GUID key setup caller `0x0061285c`와 16-byte session key setup caller `0x00612d0b`를 raw key bytes 포함 `KLG2` record로 캡처했다. 실제 prepatched `keyReadHelper` probe는 phase1 outbound read caller `0x006451a2`에서 stored image와 raw xor-0x17 key를 캡처했지만 이 후보도 observed `0x0034` request body를 디코드하지 못했다. 실제 prepatched `childCodecEncode` probe는 caller `0x006452cc`에서 phase1 plaintext, generated phase1 key, active transport codec GUID key image를 `CLG2` record로 캡처했다. 실제 prepatched `childCodecEncodePostCall` probe는 `0x6452cc` post-call에서 output `88396949581bcc872316b86f23a92d45014cbc56d722012b`를 캡처했고, 이는 같은 실행의 `0x0034` request body와 일치한다. 실제 prepatched `childCodecEncodeScheduleEntry` probe는 stored key image와 scheduled P-array head를 같은 record에 캡처했고, corrected Python child codec replay는 captured plaintext와 raw GUID transport key로 실제 `0x0034` request body를 재현한다. `runtime-keylog-read`와 `runtime-child-trace-read` CLI는 `KLG2`/`CLG2` record를 JSON으로 파싱하고 callsite label을 붙인다. 다음 runtime 작업은 `server.gameplay.dynamicProbe`로 같은 connection phase1 key 기반 `0x0035`와 `0x0031/0x0032/0x0033` command OK candidate frames를 실제 클라이언트에서 runtime-probe하는 것이다.
`package-installed`는 InstallShield 추출이 끝난 설치 완료 트리를 입력으로 받는 배포 포장 단계다. 아직 `.omo/work/logh7-installed/`가 없으면 먼저 InstallShield 전용 추출기로 기준 설치 트리를 만들어야 한다.
