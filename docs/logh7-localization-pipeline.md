# LOGH VII 한글화 파이프라인

이 저장소의 원본 CD 자료는 `artifacts/logh7-cd/` 아래 Git LFS 아티팩트로 보관한다. 원본 BIN/ISO는 기준 입력으로 고정하고, 한글화는 별도 패치 오버레이와 재빌드 산출물로 반영한다.

## 기준 검증

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

원본을 수정하지 않는다는 말은 최종 한글화 산출물을 만들지 않는다는 뜻이 아니다. 원본은 재현 가능한 기준 입력으로 보존하고, 변경분을 적용한 새 파생 아티팩트를 빌드한다.

### 보존할 원본

- `artifacts/logh7-cd/Logh7.bin`
- `artifacts/logh7-cd/Logh7_mode2_2048.iso`
- `artifacts/logh7-cd/Logh7.cue`

이 파일들은 해시 검증 기준이다. 실수로 덮어쓰면 어떤 변경이 한글화 패치 때문인지, 원본 손상 때문인지 구분할 수 없다.

### 커밋할 것

- 추출/재패킹 스크립트
- 리소스 매니페스트
- 원본 파일 해시와 패치 대상 파일 해시
- 한글 번역 카탈로그
- 바이너리 패치 레시피
- 패치 오버레이의 소스 파일
- 재빌드 절차 문서

커밋 대상은 “원본에서 새 산출물을 다시 만들 수 있는 재료”다. 저작권이 있는 추출 원본 파일이나 거대한 재빌드 ISO 자체는 기본적으로 커밋하지 않는다.

### 생성할 파생 아티팩트

작업 디렉터리에서 다음 산출물을 만든다.

- `.omo/work/logh7-extracted/`: 원본 ISO/InstallShield CAB에서 추출한 파일
- `.omo/work/logh7-ko-overlay/`: 한글화된 교체 파일과 패치 메타데이터
- `.omo/work/logh7-repacked/`: 재패킹된 InstallShield CAB 또는 설치 페이로드
- `.omo/work/logh7-build/`: 최종 테스트용 ISO, 패치 zip, 또는 배포 패키지

이 산출물은 재현 빌드 결과이며, 필요한 경우 Git LFS나 릴리스 아티팩트로 별도 관리한다. 일반 소스 커밋에는 넣지 않는다.

### 반영 흐름

1. 원본 ISO를 읽어 `data1.hdr`, `data1.cab`, `data2.cab`를 추출한다.
2. InstallShield 전용 추출기로 설치 페이로드를 `.omo/work/logh7-extracted/`에 푼다.
3. 한글화 대상 파일을 매니페스트와 해시로 고정한다.
4. 번역 카탈로그와 패치 레시피를 만든다.
5. 오버레이 파일을 `.omo/work/logh7-ko-overlay/`에 생성한다.
6. 오버레이를 원본 추출물 복사본에 적용한다.
7. 수정된 페이로드를 재패킹한다.
8. 새 테스트용 ISO 또는 패치 패키지를 `.omo/work/logh7-build/`에 만든다.
9. Windows 클라이언트에서 새 산출물을 설치/실행해 검증한다.
10. 검증된 빌드 명령, 해시, 로그를 문서와 매니페스트에 기록한다.

### 배포 형태

최종 배포는 다음 중 하나로 결정한다.

- 원본 CD가 필요한 binary patch: 사용자가 보유한 원본에 패치를 적용한다.
- 한글화 교체 파일 zip: 설치된 게임 디렉터리에 덮어쓰는 파일만 제공한다.
- 재패킹 설치 패키지: 법적/배포 조건이 허용될 때만 별도 릴리스 아티팩트로 제공한다.
- 테스트용 내부 ISO: 개발 검증 전용이며 기본 커밋 대상이 아니다.

따라서 “원본 수정 금지”는 “최종 산출물 없음”이 아니라 “원본은 불변 입력, 한글화는 재현 가능한 파생 아티팩트로 생성”이라는 규칙이다.

## 검증 명령

```powershell
npm run test:tools
python tools/logh7_pipeline.py inspect artifacts/logh7-cd/Logh7_mode2_2048.iso --out .omo/ulw-loop/evidence/localization-manifest.json
```

`localization-manifest.json`에 `data1.cab`, `data2.cab`, `setup.ini`, `setup.inx`, CP932 `setup_ini`, `installshield-cab` 판정이 들어가면 현재 단계는 재현 가능하다.
