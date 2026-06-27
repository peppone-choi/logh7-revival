# GFPGAN 초상화 TCF 재인코딩 + 제자리 배포 (2026-06-26)

## 요약
GFPGAN 복원 초상화 19개를 native 64x80 / 256색으로 재인코딩 후, 기존 hed 슬롯에
**제자리(in-place)** 재패킹(저위험 A안). atlas 파일 크기·tcf.hed·셀 카운트 전부 불변.

## 대상 (글로벌 hed 슬롯 → 소유 atlas)
- `artifacts/portrait-gfpgan/after/NNNN.png` 19장. 파일명 4자리 = 글로벌 hed 인덱스.
- 슬롯: 1,131,157,206,209,225,251,412,520,598,676 → **gem.tcf** (12개; 209=라인하르트, 206=양)
- 784 → **gef.tcf**
- 27,53,79,85,105 → **oem.tcf**
- 277,303 → **oam.tcf**
- 모든 기존 영역 = 6162B(=18B 헤더+1024B BGRA 팔레트+64*80 인덱스) → 동일 크기 제자리 교체 가능.

## 방법
- 인코더: `RE/tools/logh7_tcf_pack.py:encode_region`(바이트정확 검증된 역함수) 재사용.
- GFPGAN 출력 128x160 → LANCZOS 다운스케일 64x80 → MEDIANCUT 256색 양자화 → bottom-up 인코딩.
- 재패킹 스크립트: `scripts/logh7_repack_gfpgan_inplace.py`
  - 슬롯의 기존 hed 오프셋에 새 6162B 영역을 덮어쓴다(hed 미수정, atlas 길이 불변).
  - 3트리 전부에서 hed 오프셋 일치 검증 후 기록.

## 3트리 배포 (전부 적용)
1. `client/dist/logh7-client/data/image/Face`
2. `client/vendor/logh7-installed/data/image/Face`
3. `.omo/work/logh7-installed/data/image/Face` (★라이브 하네스 INSTALLED_ROOT)
- 57건 기록(19슬롯 x 3트리).

## 백업 (무손상)
- `artifacts/portrait-tcf-backup-20260626-052515/<tree>/` — 7 atlas + tcf.hed x 3트리.
- 타임스탬프: `artifacts/.last_portrait_backup_ts`.

## 무결성 검증
- `tcf.hed`: 3트리 모두 백업과 **byte-identical** (cmp).
- atlas 파일 7종 크기: 전 트리 백업과 **동일**(SIZES-OK).
- gem.tcf 변경 바이트 67466 ≤ 12슬롯*6162(73944) — 교체 영역만 변경 확인.
- 디코드 라운드트립: 19/19 = (64,80) 3트리 전부 PASS.
- 콘텐츠 충실도: 재디코드 vs GFPGAN 원본 MAE≈2.0(양자화만, 손상 아님).
- 증빙 시트: `artifacts/portrait-gfpgan/tcf_inplace_verify.png`.

## 라이브 렌더검증 대기
초상화는 캐릭터 HUD/직무카드(uu3 집무실 패널 등)에 표시 → 실클라(ui_explorer)
월드진입 후 인물 패널에서 라인하르트(209)/양(206) 복원본 렌더 육안 확인 필요(P1).
나머지 _all_raw 397슬롯은 GFPGAN 추가 실행으로 동일 파이프라인 확장 가능.
