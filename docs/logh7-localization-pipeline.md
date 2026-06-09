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

1. InstallShield CAB를 지원하는 추출기를 준비한다. 7-Zip은 현재 `data1.cab`/`data2.cab`를 일반 CAB로 열지 못한다.
2. 추출 결과를 `.omo/work/logh7-extracted/` 같은 무시되는 작업 디렉터리에 둔다.
3. `constmsg.dat`, `messages_*.dat`, `messages_com_*.dat`, `messages_tac_*.dat`가 추출되는지 확인한다.
4. 파일별 인코딩을 샘플 바이트와 문자열 테이블 단위로 판정한다. 현재 ISO/설치 메타데이터의 기본 근거는 CP932와 Japanese locale `0x0011`이다.
5. 한글 번역은 원본 바이트 길이, 종료 문자, 포인터/오프셋 테이블을 확인하기 전까지 원본 파일에 직접 쓰지 않는다.
6. 패치 산출물은 원본 LFS 아티팩트가 아니라 `.omo/work/logh7-ko-overlay/` 또는 별도 패치 파일로 만든다.

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

1. LFS 기준 ISO를 읽어 `data1.hdr`, `data1.cab`, `data2.cab`를 추출한다.
2. InstallShield 전용 추출기로 설치 페이로드를 `.omo/work/logh7-extracted/`에 푼다.
3. 설치 프로그램이 Windows에 배치하는 최종 파일 구조를 `.omo/work/logh7-installed/`에 재구성한다.
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
python tools/logh7_pipeline.py package-installed .omo/work/logh7-installed --overlay .omo/work/logh7-ko-overlay --out .omo/work/logh7-build/logh7-ko-installed.zip --manifest-out .omo/work/logh7-build/logh7-ko-installed-manifest.json
```

`localization-manifest.json`에 `data1.cab`, `data2.cab`, `setup.ini`, `setup.inx`, CP932 `setup_ini`, `installshield-cab` 판정이 들어가면 현재 단계는 재현 가능하다.
`package-installed`는 InstallShield 추출이 끝난 설치 완료 트리를 입력으로 받는 배포 포장 단계다. 아직 `.omo/work/logh7-installed/`가 없으면 먼저 InstallShield 전용 추출기로 기준 설치 트리를 만들어야 한다.
