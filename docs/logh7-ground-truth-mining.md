# LOGH VII — Ground-Truth 데이터 마이닝 & JSON 검증 (2026-06-14)

> 발단: 사용자 선언 **"content/ 의 json들은 이전 AI가 만든 것 — 믿으면 안 된다."**
> 따라서 모든 데이터를 **실제 클라이언트 바이너리 + 공식 매뉴얼 + 전작**에서 다시 채굴/검증했다.
> 본 문서는 이 세션에서 확보한 출처·도구·결과·다음 단계를 한 곳에 정리한다.

## 0. 한 줄 요약

실제 LOGH VII CD를 archive.org에서 받아 클라이언트를 추출·역공학했고, AI 생성 JSON을 ground truth에 대해 3-tier로 검증했다. **문자열은 100% 실측, 이름은 대부분 실측, 수치 스탯·일부 행성·진영 라벨은 AI 날조**로 판명. 검증된 데이터는 `content/verified/*.json`에 재추출했다. 초상화 416개를 난독화 해제했고, 인명 복구를 위해 전작 IV EX와 정사 위키 덤프까지 확보했다.

## 1. 확보한 GROUND-TRUTH 출처 (전부 archive.org)

| 출처 | archive.org id | 받은 것 | 용도 |
|---|---|---|---|
| LOGH VII 리테일 CD | `logh-7` | `Logh7.bin` 229MB (MODE2/2352) | 실제 클라이언트 (EXE/MsgDat/모델/얼굴) |
| 공식 매뉴얼 | `gin7manual` | `gin7manual.pdf` 101p (사용자 제공본 사용) | 큐레이션 스탯/이름/표 검증 권위 |
| 전작 LOGH IV EX | `legend-of-galactic-heroes-iv-ex-win-95` | `ivex.iso` 435MB (ISO9660) | 인명 풀 (VII에 없는 캐릭터 DB) |
| 정사 위키 | `gineipaedia` | `dump.xml` 152MB (8408 페이지) | canon 인명/지명/함선명 (EN) |
| (미수령) VI / V Grand | `gin-6` | GIN6.BIN 662MB + GIN5GRAND.ISO 360MB | 추가 전작 로스터 (필요 시) |

> 저장 위치: 전부 `.omo/work/` (gitignored). 리포의 `artifacts/logh7-cd/*` 는 **LFS 포인터(134B)** 라 실 바이트 부재 → 받아야 했음.

## 2. 추출 파이프라인 (macOS, stdlib + unshield)

```
Logh7.bin (MODE2/2352)
  └─ tools/convert_mode2_bin_to_iso.py            → Logh7_2048.iso  (CD001 확인)
     └─ logh7_iso.read_iso + logh7_extractor      → iso-root/ (data1.hdr/cab, g7start.exe, 銀英伝~1.pdf)
        └─ unshield x data1.cab                    → installed/ (2192 파일)
           ├─ exe/G7MTClient.exe   (실제 클라, sha head bd19263c)
           ├─ data/MsgDat/*.dat    (22개 문자열 컨테이너)
           ├─ data/model/**/*.mdx  (406 모델: 함선/행성/은하)
           └─ data/image/Face/*.tcf(7 초상화 아틀라스)
```

- **주의**: 리포 `tools/logh7_pipeline.py` 는 `capstone`(미설치) import로 로드 실패 → `logh7_iso`/`logh7_extractor` 직접 호출로 우회. InstallShield CAB은 `unshield`(설치돼 있음)로 해제.
- IV EX iso는 InstallShield 아님 → 직접 `game/` 폴더 (g4xchrex/g4xconst/g4xsnr/msg dat).

## 3. 검증 방법론 — 3-Tier 하네스 (`docs/verification/*.md`, 워크플로 산출)

1. **Tier-1 바이너리 정확 일치**: 실 클라 디코드 ↔ JSON 바이트 diff. (강함)
2. **Tier-2 매뉴얼 권위**: `pdftotext`(text) + 밀집 표는 PDF 페이지 **vision Read**. (중간)
3. **Tier-3 검증 불가**: ground truth 부재 — 날조 안 하고 "근거 없음" 명시.

## 4. 검증 결과 (요약 — 상세 `content/verified/`, 마스터 보고서 워크플로 산출)

| 도메인 | records | 실측 | AI 날조 | 판정 |
|---|--:|--:|--:|---|
| **MsgDat 문자열** | 9582 | **9582 (100%)** | 0 | 신뢰 (Tier-1 정확일치) |
| characters | 97 | 70명 이름 | **8능력치 전부** | 부분 날조 (이름OK/스탯 날조) |
| ships | 320 | 함급명/타입 | stats(OCR쓰레기) | 이름OK/수치 폐기 |
| commands | 232 | 228 | 0 | 대체로 신뢰 |
| galaxy | 367 | 312 | 행성 89 + 진영 46 | 성계OK/행성 일부 날조 |
| org-ranks | 196 | 185 | 1(兵長) | 대체로 신뢰 |

- **핵심**: `msgdat-full.json` 문자열 = 실 MsgDat와 **9582/9582 정확 일치**. 이름/코드/설명은 이 1차 기준선과 대조해 검증.
- **EXE 버전 불일치**: CD의 `G7MTClient.exe` sha head **`bd19263c`** ≠ 한글화 요청서가 가정한 `2848be76`. 요청서 RE 오프셋(IAT 0x66b170, strict flag 0x6003f5 등)은 **2004-05-14 업데이트본**(Gin7UpdateClient 자가패치) 기준 → CD 베이스 EXE엔 `6a 09` 대신 `ff 35`. Task B 드리프트 가드가 이를 정확히 잡아냄. 라이브 패치엔 업데이트본 EXE 필요.

## 5. 난독화 해제 (사용자 "난독화도 풀어")

| 포맷 | 상태 | 방법 |
|---|---|---|
| MsgDat HFWR/GFWR | ✅ 해결 | `tools/logh7_msgdat.py` (헤더+오프셋테이블+NUL종단 cp932) |
| 초상화 tcf | ✅ 해결 | `tools/logh7_tcf_decode.py`: 18B헤더+256색 BGRA팔레트+8bit인덱스(bottom-up). `dumpall`로 **416개 디코드** (제국 gem/gef + 동맹 oem/oam 등). tcf.hed 글로벌 인덱스 = **face_id**. |
| 3D 모델 mdx | 부분 | `tools/logh7_mdx_extract.py` (노드/에셋 문자열). 261 함선 모델. |
| child codec(네트워크) | ✅ 기존 해결 | `tools/logh7_child_codec.py` (Blowfish변형 16라운드, XOR 0x91 정적테이블) |
| EXE 정적테이블 | 부분 | XOR 0x91 마스킹 해제됨; 전체 디스asm은 capstone/Ghidra 필요 |

## 6. 이름 복구 (지명/인명/함선명) — 사용자 최우선

- **지명**: 실 클라 문자열에서 직접 확증 (Iserlohn/Phezzan/Heinessen/Odin/Astarte…). 성계 80 전부 attested. → 신뢰.
- **함선명**: 함급명/타입코드/로마숫자 변형 전부 MsgDat verbatim. 모델코드(EH/FH###)는 내부 에셋명. → 신뢰.
- **인명**: 클라엔 **로스터 없음**(서버 권위). 다중 출처 합집합으로 복구:
  - VII 매뉴얼: **70명** (VII-authoritative, `content/verified/characters.json`)
  - IV EX `g4xconst.dat`: **364 카타카나명** (`content/verified/ivex-names.json`) — 단 VII에 없는 인물 포함, 반대로 VII 전용은 미포함
  - Gineipaedia: 정사 EN 로스터 (JP명은 이 덤프에 비어있음 → 별도 소싱 필요)
  - **공식 face_id 앵커 12개** (Reinhard=209, Yang=206, Mittermeyer=195, Schenkopp=85 …) — gineiden.com chara/NNN.jpg 번호 = tcf.hed 인덱스

## 7. 인명 ↔ 초상화 매핑 (사용자 핵심 질문)

- **사실**: tcf 아틀라스엔 이름표 없음. 슬롯 ~1000+ ≫ 명명 인물 ~70-180 → **대부분 슬롯은 생성용 generic 얼굴**(특정 인물 아님), 일부만 canon 초상화.
- **AI `canon-face-registry.json` 매핑 = 추정(confidence:assigned, _WARNING) → 폐기 대상.**
- **확정 방법** (구현 남음):
  1. 공식 앵커 12개 = face_id→이름 직접 확정.
  2. IV EX 얼굴 그래픽 디코드 → VII 416 초상화와 perceptual match(pHash/NCC) → 공유 인물 이름 전이. (전제: art 재사용 — 확인 필요)
  3. 매뉴얼 70 + gineipaedia로 VII-전용 canon 보완.
  4. 임계값 통과분만 채택 + 인게임 바인딩 관찰(Windows)로 spot-check.

## 8. 한글화 협업요청 (Task A–D) 산출물

| Task | 산출물 | 상태 |
|---|---|---|
| A 문자열 워크시트 | `tools/logh7_strings_worksheet.py` → `content/localization/strings-worksheet.{json,tsv}` (실 MsgDat 기반, 9582행: 미번역 4535) | ✅ |
| B cp932→949 패치 레시피 | `tools/logh7_codepage949_recipe.py` + 테스트 15 (IAT트램폴린+strict완화). CD EXE는 드리프트(업데이트본 필요) | ✅ 도구 |
| C 렌더 검증 | `tools/logh7_render_audit.py` + `docs/logh7-render-verification-spec.md` + 테스트 22 | ✅ |
| D-1 재인코딩 무결성 | `tools/tests/test_logh7_msgdat_encode_integrity.py` (8 테스트). **발견: CP949는 가나 포함 상위집합** | ✅ |
| D-2 전작 이름 디코드 | g4xconst.dat 인명풀 추출 (g4xchrex.dat의 "1629B 레코드" 핸드오프 주장은 **오류**—1629B 단일구조) | 부분 |

## 9. 다음 단계 (남은 것)

1. **인명↔초상화 매칭 실행**: IV EX 얼굴 디코드 + perceptual match + 12앵커/매뉴얼 병합 → 검증된 face_id→name 맵 (AI 레지스트리 대체).
2. **content.db 재구축**: AI JSON이 아닌 `content/verified/*` + 실 MsgDat에서. (현 DB는 untrusted JSON 기반.)
3. **서버**: 검증 데이터 적재 + 런타임 영속성(계정/생성캐릭터/세계/전투) — 현재 in-memory.
4. **수치 스탯**: VII 매뉴얼에 없음 → IV EX 시나리오(g4xsnr) 레코드 RE 또는 "IV EX 이식"으로만 라벨.
