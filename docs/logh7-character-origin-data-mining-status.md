# LOGH VII 캐릭터 원본 데이터 채굴 상태

작성일: 2026-06-17 KST

이 문서는 오리지널 캐릭터의 이름, 능력치, 포트레잇 연결 자료가 설치본 클라이언트나 데이터 파일에 들어 있는지 판정하기 위한 현재 증거를 정리한다. 판정 범위는 `.omo/work/logh7-installed`의 원본 설치 트리이며, 생성 런타임(`logh7-runtime/**`), 런처 산출물, 저장소에서 만든 통합 JSON은 원본 증거로 세지 않는다.

## 결론

현재 설치본 클라이언트와 원본 데이터 파일에서 “캐릭터 이름 + 능력치 + 포트레잇 번호”가 한 번에 결합된 원본 로스터 표는 발견되지 않았다.

확인된 것은 세 층으로 분리된다.

1. 클라이언트/프로토콜에는 캐릭터 record layout이 있다. `0x0323` InformationCharacter, `0x034f` ResponseCardCharacter, `0x0356` 계열 downlink는 이름, 계급, 얼굴 번호, 능력치 필드를 담는 wire record를 파싱한다.
2. 설치본 `data/image/Face/*.tcf`와 `tcf.hed`에는 포트레잇 이미지와 숫자 인덱스 공간이 있다. 그러나 여기에는 캐릭터 이름이나 능력치가 붙어 있지 않다.
3. 현재 저장소의 이름/능력치/포트레잇 결합물은 여러 출처를 합친 부활용 데이터다. 일부 공식 얼굴 번호는 신뢰 가능하지만, 전체 VII 원본 서버 로스터로 주장하면 안 된다.

## 채굴 결과

| 대상 | 결과 | 판정 |
|---|---|---|
| `G7MTClient.exe` | 캐릭터 record 파서와 생성/선택 명령 경로가 있다. 주요 이름 문자열은 샘플 문장 수준으로만 나온다. | layout/handler 증거 |
| `data/MsgDat/*.dat`, `*.dat.jpbak` | 계급, 능력치 라벨, 설명문, 일부 고유명사는 나오지만 밀집 로스터 표가 아니다. | 문맥 문자열 |
| `data/image/Face/*.tcf`, `tcf.hed` | 얼굴 이미지와 인덱스만 확인된다. | 포트레잇 자산 |
| `content/roster/face-name-map.json` | 공식 페이지 기반 12개 이름-얼굴 번호 anchor가 있다. | 제한적 권위 |
| `content/roster/characters.json` | 97명 이름/스탯 후보를 담지만 manual/IV EX/canon 기반이다. | 부활용 데이터 |
| `content/character-roster.json` | 99명 통합 roster, 얼굴 번호 보유 12명. | 생성 통합물 |
| `content/roster/ability-seed.json` | 캐릭터 생성 후 서버가 넣는 house-rule 능력치 seed다. | 절차/추정 |

재현 가능한 증거는 아래 파일에 남겼다.

- `.omo/ulw-loop/evidence/g006-character-origin-byte-scan.json`: 설치 원본 바이트 검색. 생성 런타임 제외. 723개 파일, hit 444개지만 대부분 UI/설명 라벨이다.
- `.omo/ulw-loop/evidence/g006-character-origin-known-name-scan.json`: 현재 저장소의 알려진 이름 442개를 원본 설치 파일 70개에 대조. hit 17개이며, 밀집 이름 표가 아니라 설명문/샘플 문자열이다.
- `.omo/ulw-loop/evidence/g006-character-origin-no-roster-verifier.txt`: `tools/logh7_verify_no_roster.py` 실행 결과. 평문/단일 XOR/name cluster 모두 joined roster를 만들지 못한다.
- `.omo/ulw-loop/evidence/g006-character-origin-redex-infocharacter.txt`: `InformationCharacter|OriginalCharacter` 코드 경로 확인.
- `.omo/ulw-loop/evidence/g006-character-origin-data-mining-summary.json`: 위 결과를 기계 판정용으로 요약한 파일.

## 현재 권위 등급

| 등급 | 출처 | 사용할 수 있는 주장 |
|---|---|---|
| P0 | `G7MTClient.exe`, wire trace, `Face/*.tcf` | record field, face index, 이미지 자산 존재 |
| P1 | 공식 사이트/매뉴얼에서 회수한 얼굴 번호 | 제한된 이름-얼굴 번호 anchor |
| P2 | `characters.json`, manual/IV EX 기반 스탯 | 부활 서버용 콘텐츠 후보 |
| P3 | deterministic face assignment, ability seed, 수동 포트레잇 명명 | 임시/사람 라벨/절차 생성 |

서버 코드나 문서에서 P2/P3를 “원본 서버 데이터”로 표시하면 안 된다. 런타임, admin dump, QA 문서에는 source/provenance가 같이 따라가야 한다.

## 실무 규칙

1. 공식 face-number anchor 12개만 이름-포트레잇 연결의 권위 데이터로 취급한다.
2. Yang/Schenkopp처럼 pixel-confirmed인 항목은 포트레잇 이미지 검증 anchor로 따로 표시한다.
3. `face-assignment.json`, AI/사람 라벨 포트레잇 이름, house-rule 능력치는 게임 진행을 위한 fallback이지 원본 복원 결과가 아니다.
4. 실클라 검증에서는 들어오는 `0x0323` record의 face id와 name/stat provenance를 같이 덤프한다.
5. 새 공식 패치, 서버 dump, 운영 DB, packet capture가 확보되기 전까지 “전체 오리지널 캐릭터 원본 로스터 복원 완료”라고 쓰지 않는다.

## 다음 채굴 후보

- 원본 운영 서버 packet capture나 DB dump.
- 아직 확보하지 못한 공식 패치 파일과 배포 서버 캐시.
- `G7MTClient.exe`의 `Input_InformationCharacter` 호출 시점 live memory dump.
- 포트레잇 atlas frame과 공식/매뉴얼 이미지의 pixel match 확대.
