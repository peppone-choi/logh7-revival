# LOGH VII 좌표 provenance

작성일: 2026-06-17 KST
최신 정정: 2026-06-21 KST

이 문서는 P0-02 성계 위치 섞임 검증용이다. 2026-06-21 이후 현재 서버 좌표는 `page101-bg.jpg`의 실제 원형 별점 중심을 100x50 전략 grid로 투영한 값이다. PDF Text annotation과 검은 내부 선은 이름 매칭/프로비넌스용이지 좌표 원천이 아니다. original-server coordinate is not proven. 행성 orbit은 좌표가 아니라 시스템 내부 순서다.

## 2026-06-21 래스터 재감사 우선 규칙

- 좌표 원천: `.omo/work/galaxy-extract/page101-bg.jpg` 실제 별점 원 중심.
- 이름 매칭 원천: `gin7manualsaved.pdf` 101쪽 label/annotation. 주석선/모서리/격자선은 별점 좌표로 쓰지 않는다.
- 좌표 인덱스: `canonCol/canonRow`는 서버/와이어용 0-index, `canonGameCol/canonGameRow`는 게임 UI용 1-index.
- 래스터 격자식: `col=round((pixelX-47.5)/7)`, `row=round((pixelY-114.5)/7)`.
- 색상/등급: 중심 픽셀 단독값이 아니라 원반에서 주변 배경광을 뺀 대표색으로 `spectralClass`를 산출한다. 이는 화면 별점색 기반 등급이며 원 서버 항성 등급 복구가 아니다.
- 산출물: `content/galaxy-raster-star-centers.json`, `content/galaxy.json`, `content/galaxy-passable-cells.json`, `content/logh7-content.db`.
- 검증: `python -m unittest tools.tests.test_logh7_galaxy_star_extract`, `node --test tests/server/logh7-galaxy-star-extraction.test.mjs tests/server/logh7-content-db.test.mjs tests/server/logh7-content-adapter.test.mjs tests/server/logh7-strategic-grid-provenance.test.mjs`.

name | canonCol | canonRow | canonGameCol | canonGameRow | rasterPixel | representativeRgb | spectralClass
--- | --- | --- | --- | --- | --- | --- | ---
ルンビーニ | 5 | 20 | 6 | 21 | 82.275,257.856 | 168,62,11 | K
シロン | 6 | 14 | 7 | 15 | 89.572,214.450 | 171,118,46 | G
フェザーン | 51 | 38 | 52 | 39 | 407.248,380.015 | 213,163,110 | G
イゼルローン | 53 | 12 | 54 | 13 | 420.601,199.236 | 184,92,55 | K

아래 2026-06-17 투영식과 전체 행 표는 과거 감사 기록이다. 현재 콘텐츠/DB 좌표 원천으로 사용하지 않는다.

## 요약

- 성계: 80개
- 행성: 281개
- 요새: 6개
- 좌표 권위: 2026-06-21 기준 raster star-dot center projection, original-server not proven
- PDF 원천: `.omo/work/gin7manual/gin7manual.pdf` 101쪽, 성계도 Text annotation.
- PDF 재검증: `.omo/ulw-loop/evidence/manual-pdf-coordinate-recheck-20260617/page101-transform-fit-to-annotation-icons.json` 및 `.omo/ulw-loop/evidence/g006-redatamine-manual-20260617/manual-content-frame-recheck.json`.
- 투영 보정: PDF 저장 좌표와 `content/galaxy.json` 좌표는 같은 프레임이 아니다. PyMuPDF가 직접 읽는 PDF Text annotation rect는 렌더 좌표로 `displayX=842-pdfCy`, `displayY=pdfCx`가 맞다. 하지만 `content/galaxy.json`은 이미 y축 반전/아이콘 anchor 기준으로 정규화된 좌표를 저장하므로 서버 grid에서는 `displayX=contentCy`, `displayY=contentCx`를 적용한다. `content/galaxy.json`에 다시 `842-contentCy`를 적용하면 이중 미러가 되어 좌우가 뒤집힌다.
- live 상태: 2026-06-17 corrected-cell 실클라 런은 과거 투영값 검증 기록이다. 2026-06-21 래스터 좌표로는 새 실클라 클릭/명령 루프 재검증이 필요하다.

## 투영식

- PDF 저장 좌표 -> rendered display: `displayX=842-pdfCy; displayY=pdfCx`
- `content/galaxy.json` 정규화 좌표 -> server display: `displayX=contentCy; displayY=contentCx`
- display -> grid: `col=2+round(((displayX-minX)/spanX)*(100-1-4)); row=2+round(((displayY-minY)/spanY)*(50-1-4)); duplicate cells nudge col then row`

## 핵심 좌표

name | rawCx | rawCy | displayX | displayY | projectedCol | projectedRow | cellIndex | objectValue | contentId
--- | --- | --- | --- | --- | --- | --- | --- | --- | ---
ルンビーニ | 259.2 | 63.3 | 63.3 | 259.2 | 2 | 21 | 2102 | 4 | 86
シロン | 217.7 | 69.9 | 69.9 | 217.7 | 3 | 15 | 1503 | 5 | 41
アスターテ | 195.8 | 328.9 | 328.9 | 195.8 | 40 | 12 | 1240 | 37 | 5
ヴァンフリート | 202.9 | 352.4 | 352.4 | 202.9 | 44 | 13 | 1344 | 43 | 19
フェザーン | 381 | 387.9 | 387.9 | 381 | 49 | 38 | 3849 | 44 | 64
イゼルローン | 202.9 | 400.5 | 400.5 | 202.9 | 51 | 13 | 1351 | 45 | 14

## 전체 행

entityKind | name | parentSystem | authorityClass | rawCx | rawCy | displayX | displayY | projectedCol | projectedRow | cellIndex | objectValue | contentId | liveEvidenceStatus
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
system | ルンビーニ | - | manual-projection-not-original-server | 259.2 | 63.3 | 63.3 | 259.2 | 2 | 21 | 2102 | 4 | 86 | needs-target-panel-live-proof
planet | バグタプール | ルンビーニ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | カライヤ | ルンビーニ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | バドガオン | ルンビーニ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | シロン | - | manual-projection-not-original-server | 217.7 | 69.9 | 69.9 | 217.7 | 3 | 15 | 1503 | 5 | 41 | needs-target-panel-live-proof
planet | ネプティス | シロン | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ジャライン | シロン | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | アヌビス | シロン | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | オシリス | シロン | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | エリューセラ | - | manual-projection-not-original-server | 351.5 | 78.6 | 78.6 | 351.5 | 4 | 34 | 3404 | 6 | 26 | needs-target-panel-live-proof
planet | コルテラッツォ | エリューセラ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ポンテ・クレパルド | エリューセラ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | クルッキド | エリューセラ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | アンドロス | エリューセラ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | タナトス | - | manual-projection-not-original-server | 302.3 | 91.2 | 91.2 | 302.3 | 6 | 27 | 2706 | 7 | 44 | needs-target-panel-live-proof
planet | エコニア | タナトス | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | プロスキナス | タナトス | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | マスジット | タナトス | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ケール | タナトス | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | リオ・ヴェルデ | - | manual-projection-not-original-server | 347.2 | 105.9 | 105.9 | 347.2 | 8 | 33 | 3308 | 8 | 81 | needs-target-panel-live-proof
planet | メサ・デル・アグア | リオ・ヴェルデ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | サン・カルロス | リオ・ヴェルデ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | リアノ・ブランコ | リオ・ヴェルデ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | イスラ・ブランカ | リオ・ヴェルデ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | ロフォーテン | - | manual-projection-not-original-server | 197.4 | 121.2 | 121.2 | 197.4 | 10 | 12 | 1210 | 9 | 87 | needs-target-panel-live-proof
fortress | ルドミラ | ロフォーテン | parent-system-marker-not-dedicated-fortress-coordinate | 197.4 | 121.2 | 121.2 | 197.4 | 10 | 12 | 1210 | 9 | 87 | needs-fortress-info-panel-live-proof
planet | アルスタッド | ロフォーテン | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | バルスタッド | ロフォーテン | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | スボルヴェア | ロフォーテン | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | バーラト | - | manual-projection-not-original-server | 260.8 | 127.3 | 127.3 | 260.8 | 11 | 21 | 2111 | 10 | 55 | needs-target-panel-live-proof
planet | テルヌーゼン | バーラト | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | カスバ・ナグム | バーラト | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ハイネセン | バーラト | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | シリューナガル | バーラト | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | ファラーファラ | - | manual-projection-not-original-server | 166.8 | 156.8 | 156.8 | 166.8 | 16 | 8 | 816 | 11 | 63 | needs-target-panel-live-proof
planet | アラム・バダー | ファラーファラ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ラムル | ファラーファラ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ミセヌム | ファラーファラ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | アスワン | ファラーファラ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | ケリム | - | manual-projection-not-original-server | 217.7 | 156.8 | 156.8 | 217.7 | 16 | 15 | 1516 | 12 | 33 | needs-target-panel-live-proof
planet | カッシナ | ケリム | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | バフラ | ケリム | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | アユディン | ケリム | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | パラス | ケリム | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | ポリスーン | - | manual-projection-not-original-server | 439.5 | 158.4 | 158.4 | 439.5 | 16 | 46 | 4616 | 13 | 69 | needs-target-panel-live-proof
fortress | ダヤン・ハーン | ポリスーン | parent-system-marker-not-dedicated-fortress-coordinate | 439.5 | 158.4 | 158.4 | 439.5 | 16 | 46 | 4616 | 13 | 69 | needs-fortress-info-panel-live-proof
planet | エルデン | ポリスーン | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ベレケト | ポリスーン | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | キルニス | ポリスーン | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | ライガール | - | manual-projection-not-original-server | 360.8 | 178.6 | 178.6 | 360.8 | 19 | 35 | 3519 | 14 | 78 | needs-target-panel-live-proof
planet | シンガラ | ライガール | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ミルパラ | ライガール | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | アユアラ | ライガール | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | バーミリオン | - | manual-projection-not-original-server | 309.5 | 179.2 | 179.2 | 309.5 | 19 | 28 | 2819 | 15 | 54 | needs-target-panel-live-proof
planet | エイクロン | バーミリオン | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ロートン | バーミリオン | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | カスケード | バーミリオン | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | リューカス | - | manual-projection-not-original-server | 281 | 192.8 | 192.8 | 281 | 21 | 24 | 2421 | 16 | 83 | needs-target-panel-live-proof
planet | ザカリアス | リューカス | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | インコバネ | リューカス | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ヴァルミー | リューカス | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | マローヴィア | - | manual-projection-not-original-server | 131.3 | 193.4 | 193.4 | 131.3 | 21 | 3 | 321 | 17 | 73 | needs-target-panel-live-proof
system | ハダト | - | manual-projection-not-original-server | 160.8 | 199.9 | 199.9 | 160.8 | 22 | 7 | 722 | 18 | 57 | needs-target-panel-live-proof
planet | シャンプール | ハダト | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ベラスィ | ハダト | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | アンジャル | ハダト | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | ジャムシード | - | manual-projection-not-original-server | 230.2 | 201 | 201 | 230.2 | 22 | 17 | 1722 | 19 | 36 | needs-target-panel-live-proof
planet | タフテ・ジャムジード | ジャムシード | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | カッファー | ジャムシード | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ムハバット | ジャムシード | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | アバダナ | ジャムシード | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | トリプラ | - | manual-projection-not-original-server | 388.7 | 207 | 207 | 388.7 | 23 | 39 | 3923 | 20 | 51 | needs-target-panel-live-proof
planet | パルメレンド | トリプラ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | アガタラ | トリプラ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | カリャンプール | トリプラ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | イスファハン | トリプラ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | タッシリ | - | manual-projection-not-original-server | 324.8 | 214.1 | 214.1 | 324.8 | 24 | 30 | 3024 | 21 | 43 | needs-target-panel-live-proof
planet | タッシリ・ナジェール | タッシリ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | アドラル・ソアフ | タッシリ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | トゥアレグ | タッシリ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | シュパーラ | - | manual-projection-not-original-server | 440.6 | 214.1 | 214.1 | 440.6 | 24 | 46 | 4624 | 22 | 39 | needs-target-panel-live-proof
planet | アルンキパ | シュパーラ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ヴィスカ・グランデ | シュパーラ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | シウダ・ロドリゴ | シュパーラ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ヴィシュコフ | シュパーラ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | ドーリア | - | manual-projection-not-original-server | 203.4 | 236.5 | 236.5 | 203.4 | 27 | 13 | 1327 | 23 | 48 | needs-target-panel-live-proof
planet | モンテカプラロ | ドーリア | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | カスタノーラ | ドーリア | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ビエヴェッタ | ドーリア | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ボルケーゼ | ドーリア | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | シヴァ | - | manual-projection-not-original-server | 146.6 | 243.6 | 243.6 | 146.6 | 28 | 5 | 528 | 24 | 35 | needs-target-panel-live-proof
planet | パールヴァティ | シヴァ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ガンガー | シヴァ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ナンディ | シヴァ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | アナンタ | シヴァ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | エル・ファシル | - | manual-projection-not-original-server | 239 | 252.4 | 252.4 | 239 | 29 | 18 | 1829 | 25 | 27 | needs-target-panel-live-proof
planet | カルタヘナ | エル・ファシル | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ラス・カシタス | エル・ファシル | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | サンタ・アナ | エル・ファシル | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | サルバドル | エル・ファシル | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | ガンダルヴァ | - | manual-projection-not-original-server | 353.7 | 258.9 | 258.9 | 353.7 | 30 | 34 | 3430 | 26 | 30 | needs-target-panel-live-proof
planet | ウルヴァシー | ガンダルヴァ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | カルティケーヤ | ガンダルヴァ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | アガスティア | ガンダルヴァ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ヴァルナ | ガンダルヴァ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | ランテマリオ | - | manual-projection-not-original-server | 289.2 | 265.5 | 265.5 | 289.2 | 31 | 25 | 2531 | 27 | 79 | needs-target-panel-live-proof
planet | ルエヴィト | ランテマリオ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | スヴェン・ヴィト | ランテマリオ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ヤロヴィト | ランテマリオ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | メルカルト | - | manual-projection-not-original-server | 433 | 266 | 266 | 433 | 31 | 45 | 4531 | 28 | 74 | needs-target-panel-live-proof
planet | アシュール | メルカルト | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ネルガル | メルカルト | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | バール・ザフォン | メルカルト | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | エルゴン | - | manual-projection-not-original-server | 173.9 | 271.5 | 271.5 | 173.9 | 32 | 9 | 932 | 29 | 28 | needs-target-panel-live-proof
planet | カモロク | エルゴン | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ブタンディガ | エルゴン | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ムバレ | エルゴン | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | カンパラ | エルゴン | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | マル・アデッタ | - | manual-projection-not-original-server | 317.7 | 293.4 | 293.4 | 317.7 | 35 | 29 | 2935 | 30 | 72 | needs-target-panel-live-proof
planet | バラセット | マル・アデッタ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | アヴェラノス | マル・アデッタ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ファルネーゼ | マル・アデッタ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | マントヴァ | マル・アデッタ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | バラトループ | - | manual-projection-not-original-server | 403.4 | 300.5 | 300.5 | 403.4 | 36 | 41 | 4136 | 31 | 58 | needs-target-panel-live-proof
planet | バラトループ1 | バラトループ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | バラトループ2 | バラトループ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | バラトループ3 | バラトループ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | シャンダルーア | - | manual-projection-not-original-server | 346.1 | 301 | 301 | 346.1 | 36 | 33 | 3336 | 32 | 38 | needs-target-panel-live-proof
planet | シャンダルーア1 | シャンダルーア | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | シャンダルーア2 | シャンダルーア | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | シャンダルーア3 | シャンダルーア | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | ダゴン | - | manual-projection-not-original-server | 161.9 | 308.7 | 308.7 | 161.9 | 38 | 7 | 738 | 33 | 42 | needs-target-panel-live-proof
planet | ダゴン1 | ダゴン | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ダゴン2 | ダゴン | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ダゴン3 | ダゴン | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ダゴン4 | ダゴン | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | ティアマト | - | manual-projection-not-original-server | 223.7 | 308.7 | 308.7 | 223.7 | 38 | 16 | 1638 | 34 | 46 | needs-target-panel-live-proof
planet | ティアマト1 | ティアマト | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ティアマト2 | ティアマト | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ティアマト3 | ティアマト | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ティアマト4 | ティアマト | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | ドラゴニア | - | manual-projection-not-original-server | 253.7 | 314.7 | 314.7 | 253.7 | 38 | 20 | 2038 | 35 | 50 | needs-target-panel-live-proof
planet | ドラゴニア1 | ドラゴニア | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ドラゴニア2 | ドラゴニア | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ドラゴニア3 | ドラゴニア | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | フォルセティ | - | manual-projection-not-original-server | 289.2 | 315.8 | 315.8 | 289.2 | 39 | 25 | 2539 | 36 | 66 | needs-target-panel-live-proof
system | アスターテ | - | manual-projection-not-original-server | 195.8 | 328.9 | 328.9 | 195.8 | 40 | 12 | 1240 | 37 | 5 | needs-target-panel-live-proof
planet | アスターテ1 | アスターテ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | アスターテ2 | アスターテ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | アスターテ3 | アスターテ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | アスターテ4 | アスターテ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | ファイアザード | - | manual-projection-not-original-server | 318.7 | 328.9 | 328.9 | 318.7 | 40 | 29 | 2940 | 38 | 62 | needs-target-panel-live-proof
planet | ファイアザード1 | ファイアザード | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ファイアザード2 | ファイアザード | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ファイアザード3 | ファイアザード | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | ポレヴィト | - | manual-projection-not-original-server | 383.8 | 335.4 | 335.4 | 383.8 | 41 | 38 | 3841 | 39 | 71 | needs-target-panel-live-proof
planet | ルジアーナ | ポレヴィト | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | チェルノボーグ | ポレヴィト | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | スヴァローグ | ポレヴィト | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ポレヴィーク | ポレヴィト | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | アルレスハイム | - | manual-projection-not-original-server | 253.2 | 337.1 | 337.1 | 253.2 | 42 | 20 | 2042 | 40 | 12 | needs-target-panel-live-proof
planet | アルレスハイム1 | アルレスハイム | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | アルレスハイム2 | アルレスハイム | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | アルレスハイム3 | アルレスハイム | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | アルレスハイム4 | アルレスハイム | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | パランティア | - | manual-projection-not-original-server | 288.1 | 338.2 | 338.2 | 288.1 | 42 | 25 | 2542 | 41 | 59 | needs-target-panel-live-proof
planet | パランティア1 | パランティア | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | パランティア2 | パランティア | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | パランティア3 | パランティア | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | パランティア4 | パランティア | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | アルトミュール | - | manual-projection-not-original-server | 220.9 | 348 | 348 | 220.9 | 43 | 16 | 1643 | 42 | 10 | needs-target-panel-live-proof
planet | カプチェランカ | アルトミュール | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ヴァウブジフ | アルトミュール | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | エディルネ | アルトミュール | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | レグニッツァ | アルトミュール | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | ヴァンフリート | - | manual-projection-not-original-server | 202.9 | 352.4 | 352.4 | 202.9 | 44 | 13 | 1344 | 43 | 19 | needs-target-panel-live-proof
planet | ヴァンフリート1 | ヴァンフリート | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ヴァンフリート2 | ヴァンフリート | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ヴァンフリート3 | ヴァンフリート | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ヴァンフリート4 | ヴァンフリート | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | フェザーン | - | manual-projection-not-original-server | 381 | 387.9 | 387.9 | 381 | 49 | 38 | 3849 | 44 | 64 | needs-target-panel-live-proof
planet | ジラー | フェザーン | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | リウドルフィンク | フェザーン | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ザリエル | フェザーン | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | フェザーン | フェザーン | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | イゼルローン | - | manual-projection-not-original-server | 202.9 | 400.5 | 400.5 | 202.9 | 51 | 13 | 1351 | 45 | 14 | needs-target-panel-live-proof
fortress | イゼルローン | イゼルローン | parent-system-marker-not-dedicated-fortress-coordinate | 202.9 | 400.5 | 400.5 | 202.9 | 51 | 13 | 1351 | 45 | 14 | needs-fortress-info-panel-live-proof
system | アイゼンヘルツ | - | manual-projection-not-original-server | 383.2 | 430 | 430 | 383.2 | 55 | 38 | 3855 | 46 | 3 | needs-target-panel-live-proof
fortress | ガイエスブルク | アイゼンヘルツ | parent-system-marker-not-dedicated-fortress-coordinate | 383.2 | 430 | 430 | 383.2 | 55 | 38 | 3855 | 46 | 3 | needs-fortress-info-panel-live-proof
planet | ヒンターヴィルド | アイゼンヘルツ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ラドメール | アイゼンヘルツ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ゴータ | アイゼンヘルツ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | アムリッツァ | - | manual-projection-not-original-server | 202.9 | 451.8 | 451.8 | 202.9 | 58 | 13 | 1358 | 47 | 6 | needs-target-panel-live-proof
planet | クラインゲルト | アムリッツァ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | モールゲン | アムリッツァ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ダンク | アムリッツァ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ハーフェン | アムリッツァ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | フォルゲン | - | manual-projection-not-original-server | 447.2 | 451.8 | 451.8 | 447.2 | 58 | 47 | 4758 | 48 | 65 | needs-target-panel-live-proof
planet | シュヴァンガウ | フォルゲン | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | フュッセン | フォルゲン | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ボーデルスベルグ | フォルゲン | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | ヨーツンヘイム | - | manual-projection-not-original-server | 397.4 | 466 | 466 | 397.4 | 60 | 40 | 4060 | 49 | 77 | needs-target-panel-live-proof
planet | ウトガルド | ヨーツンヘイム | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ヨーツンヘイム | ヨーツンヘイム | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | エーリヴァーガル | ヨーツンヘイム | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | ヴァンステイド | - | manual-projection-not-original-server | 247.2 | 466.6 | 466.6 | 247.2 | 60 | 19 | 1960 | 50 | 18 | needs-target-panel-live-proof
planet | ラブンストラップ | ヴァンステイド | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | レグステッド | ヴァンステイド | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ファルドガルデ | ヴァンステイド | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | ビルロスト | - | manual-projection-not-original-server | 152.1 | 472.1 | 472.1 | 152.1 | 61 | 6 | 661 | 51 | 61 | needs-target-panel-live-proof
planet | ヘイムダル | ビルロスト | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ヒミンギョルグ | ビルロスト | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ブルトガング | ビルロスト | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ギャランホルン | ビルロスト | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | アルメントフベール | - | manual-projection-not-original-server | 346.6 | 473.7 | 473.7 | 346.6 | 61 | 33 | 3361 | 52 | 11 | needs-target-panel-live-proof
planet | ビッケンバッハ | アルメントフベール | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ゲルンスハイム | アルメントフベール | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | アルスバッハ | アルメントフベール | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | クレーベルク | アルメントフベール | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | トラーバッハ | - | manual-projection-not-original-server | 295.8 | 474.2 | 474.2 | 295.8 | 62 | 26 | 2662 | 53 | 49 | needs-target-panel-live-proof
planet | ヴォルフェルスドルフ | トラーバッハ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ファルクヴィーラー | トラーバッハ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | シュテルネンベルク | トラーバッハ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | トラーベン | トラーバッハ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | ブラウンシュヴァイク | - | manual-projection-not-original-server | 424.8 | 494.5 | 494.5 | 424.8 | 64 | 44 | 4464 | 54 | 67 | needs-target-panel-live-proof
planet | ヴェスターラント | ブラウンシュヴァイク | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ヴェーデル | ブラウンシュヴァイク | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ショーペンシュタット | ブラウンシュヴァイク | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | フォルケンローデ | ブラウンシュヴァイク | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | ボルソルン | - | manual-projection-not-original-server | 167.4 | 501.6 | 501.6 | 167.4 | 65 | 8 | 865 | 55 | 70 | needs-target-panel-live-proof
planet | ベストラ | ボルソルン | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ボルソルン | ボルソルン | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ヴァイセンバッハ | ボルソルン | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ボル | ボルソルン | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | ドヴェルグ | - | manual-projection-not-original-server | 202.9 | 502.7 | 502.7 | 202.9 | 66 | 13 | 1366 | 56 | 47 | needs-target-panel-live-proof
planet | グレイプニル | ドヴェルグ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | イーヴァンルディ | ドヴェルグ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | レージング | ドヴェルグ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | カバール | ドヴェルグ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | アルタイル | - | manual-projection-not-original-server | 267.4 | 517.4 | 517.4 | 267.4 | 68 | 22 | 2268 | 57 | 8 | needs-target-panel-live-proof
planet | カタラウヌム | アルタイル | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | アンティノウス | アルタイル | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | テルモビュレー | アルタイル | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | アルタイル | アルタイル | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | フレイア | - | manual-projection-not-original-server | 352.1 | 518 | 518 | 352.1 | 68 | 34 | 3468 | 58 | 68 | needs-target-panel-live-proof
fortress | レンテンベルグ | フレイア | parent-system-marker-not-dedicated-fortress-coordinate | 352.1 | 518 | 518 | 352.1 | 68 | 34 | 3468 | 58 | 68 | needs-fortress-info-panel-live-proof
planet | フォールクヴァング | フレイア | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | フェンサリル | フレイア | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ブリシンガメン | フレイア | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | ヤヴァンハール | - | manual-projection-not-original-server | 225.3 | 524 | 524 | 225.3 | 69 | 16 | 1669 | 59 | 76 | needs-target-panel-live-proof
planet | ハールバルド | ヤヴァンハール | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | リューゲン | ヤヴァンハール | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ヴィスマール | ヤヴァンハール | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | シュヴェリーン | ヤヴァンハール | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | キフォイザー | - | manual-projection-not-original-server | 433 | 537.1 | 537.1 | 433 | 71 | 45 | 4571 | 60 | 31 | needs-target-panel-live-proof
fortress | ガルミッシュ | キフォイザー | parent-system-marker-not-dedicated-fortress-coordinate | 433 | 537.1 | 537.1 | 433 | 71 | 45 | 4571 | 60 | 31 | needs-fortress-info-panel-live-proof
planet | ロールバッハ | キフォイザー | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ヴァーゲンバッハ | キフォイザー | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ヴァルテンキルヒェン | キフォイザー | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | アルヴィース | - | manual-projection-not-original-server | 309.5 | 558.9 | 558.9 | 309.5 | 74 | 28 | 2874 | 61 | 7 | needs-target-panel-live-proof
planet | ビルスキルニル | アルヴィース | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | スルード | アルヴィース | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ウンターグリューン | アルヴィース | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ヴァンガル | アルヴィース | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | 太陽系 | - | manual-projection-not-original-server | 136.8 | 560 | 560 | 136.8 | 74 | 4 | 474 | 62 | 88 | needs-target-panel-live-proof
planet | ○水星 | 太陽系 | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ○金星 | 太陽系 | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ○地球 | 太陽系 | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ○火星 | 太陽系 | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | バルドル | - | manual-projection-not-original-server | 446.6 | 567.1 | 567.1 | 446.6 | 75 | 47 | 4775 | 63 | 60 | needs-target-panel-live-proof
planet | ブレイザブリク | バルドル | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | フリングオルニ | バルドル | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | グリトニル | バルドル | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ホズ | バルドル | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | リンダーホーフ | - | manual-projection-not-original-server | 195.8 | 573.7 | 573.7 | 195.8 | 76 | 12 | 1276 | 64 | 84 | needs-target-panel-live-proof
planet | ノイシュヴァンシュタイン | リンダーホーフ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | キームゼー | リンダーホーフ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ホーエンシュヴァンガウ | リンダーホーフ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | オーバーアマガウ | リンダーホーフ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | シリウス | - | manual-projection-not-original-server | 123.7 | 587.4 | 587.4 | 123.7 | 78 | 2 | 278 | 65 | 40 | needs-target-panel-live-proof
planet | ポ・トロ | シリウス | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | エンメ・ヤ | シリウス | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ノンモ | シリウス | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ロンドリーナ | シリウス | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | ヴェガ | - | manual-projection-not-original-server | 145 | 589 | 589 | 145 | 78 | 5 | 578 | 66 | 23 | needs-target-panel-live-proof
planet | オルフェウス | ヴェガ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | エウリュディケ | ヴェガ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | アクリシオス | ヴェガ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ベルセボネー | ヴェガ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | アルテナ | - | manual-projection-not-original-server | 347.2 | 595 | 595 | 347.2 | 79 | 33 | 3379 | 67 | 9 | needs-target-panel-live-proof
planet | ヴェセルデ | アルテナ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ナッハロート | アルテナ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ノイエンラーデ | アルテナ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ヘートフェルト | アルテナ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | リッテンハイム | - | manual-projection-not-original-server | 424.8 | 602.7 | 602.7 | 424.8 | 80 | 44 | 4480 | 68 | 82 | needs-target-panel-live-proof
planet | インゲンハイム | リッテンハイム | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | デュンツェンハイム | リッテンハイム | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | アルテンハイム | リッテンハイム | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ローゲンドルフ | リッテンハイム | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | ヴェルラ | - | manual-projection-not-original-server | 273.9 | 610.3 | 610.3 | 273.9 | 81 | 23 | 2381 | 69 | 24 | needs-target-panel-live-proof
planet | マルクト | ヴェルラ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ヤコビ | ヴェルラ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | シュテファニ | ヴェルラ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | ヴィレンシュタイン | - | manual-projection-not-original-server | 182.7 | 624.5 | 624.5 | 182.7 | 83 | 10 | 1083 | 70 | 21 | needs-target-panel-live-proof
planet | ウイツィッヒハウゼン | ヴィレンシュタイン | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ヴァイセンホルン | ヴィレンシュタイン | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | グラフェルツホーフェン | ヴィレンシュタイン | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | オーベンハウゼン | ヴィレンシュタイン | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | ハインスベルク | - | manual-projection-not-original-server | 224.8 | 645.8 | 645.8 | 224.8 | 86 | 16 | 1686 | 71 | 56 | needs-target-panel-live-proof
planet | ランデラート | ハインスベルク | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ダッセル | ハインスベルク | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ミュレンアルク | ハインスベルク | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | ヴァルデマール | - | manual-projection-not-original-server | 381 | 646.4 | 646.4 | 381 | 86 | 38 | 3886 | 72 | 16 | needs-target-panel-live-proof
planet | ウーファー | ヴァルデマール | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | パウル | ヴァルデマール | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | リンケ | ヴァルデマール | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | ヴァルハラ | - | manual-projection-not-original-server | 288.1 | 646.9 | 646.9 | 288.1 | 87 | 25 | 2587 | 73 | 17 | needs-target-panel-live-proof
planet | ゾースト | ヴァルハラ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | オーディン | ヴァルハラ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | トゥール | ヴァルハラ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ヴァルグリンド | ヴァルハラ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | シャンタウ | - | manual-projection-not-original-server | 340.1 | 646.9 | 646.9 | 340.1 | 87 | 32 | 3287 | 74 | 37 | needs-target-panel-live-proof
planet | クネスドルフ | シャンタウ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ハーケンドルフ | シャンタウ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ノイエンキルヒェン | シャンタウ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ゼードルフ | シャンタウ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | ニヴルヘイム | - | manual-projection-not-original-server | 246.6 | 652.4 | 652.4 | 246.6 | 87 | 19 | 1987 | 75 | 53 | needs-target-panel-live-proof
planet | エリューズニル | ニヴルヘイム | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ギョッル | ニヴルヘイム | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | フヴェルゲルミル | ニヴルヘイム | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | ランメルスベルク | - | manual-projection-not-original-server | 418.7 | 653.5 | 653.5 | 418.7 | 87 | 43 | 4387 | 76 | 80 | needs-target-panel-live-proof
planet | ハルスブリュッケ | ランメルスベルク | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ハルテンシュタイン | ランメルスベルク | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ヒンメルスフュルスト | ランメルスベルク | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | シュレマ | ランメルスベルク | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | カストロプ | - | manual-projection-not-original-server | 173.4 | 674.8 | 674.8 | 173.4 | 91 | 9 | 991 | 77 | 29 | needs-target-panel-live-proof
planet | カストロプ | カストロプ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ニーダー・ヴィンデンボルン | カストロプ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ヴォルディングボルグ | カストロプ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | マリーンドルフ | カストロプ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | アスガルド | - | manual-projection-not-original-server | 324.2 | 675.9 | 675.9 | 324.2 | 91 | 30 | 3091 | 78 | 4 | needs-target-panel-live-proof
planet | ミーミル | アスガルド | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ギンヌンガガガブ | アスガルド | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | トイトブルク | アスガルド | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | イーダリル | アスガルド | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | ヴァナヘイム | - | manual-projection-not-original-server | 224.8 | 681.9 | 681.9 | 224.8 | 92 | 16 | 1692 | 79 | 15 | needs-target-panel-live-proof
planet | エインヘリヤル | ヴァナヘイム | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ノーアトゥーン | ヴァナヘイム | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ニョルド | ヴァナヘイム | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | フレイ | ヴァナヘイム | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | ヴィッテルスバッハ | - | manual-projection-not-original-server | 381.6 | 683.5 | 683.5 | 381.6 | 92 | 38 | 3892 | 80 | 20 | needs-target-panel-live-proof
planet | レジデンツ | ヴィッテルスバッハ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ニュンフェンブルク | ヴィッテルスバッハ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ヴィクトアーリエン | ヴィッテルスバッハ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | ルイトポルディング | - | manual-projection-not-original-server | 283.2 | 696.6 | 696.6 | 283.2 | 94 | 24 | 2494 | 81 | 85 | needs-target-panel-live-proof
planet | ルイトポルト | ルイトポルディング | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ベルトホルト | ルイトポルディング | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | アルヌルフ | ルイトポルディング | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | ヴィンスティンゲン | - | manual-projection-not-original-server | 362.5 | 712 | 712 | 362.5 | 96 | 35 | 3596 | 82 | 22 | needs-target-panel-live-proof
planet | フォルマール | ヴィンスティンゲン | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ヴィート | ヴィンスティンゲン | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | イーゼンブルク | ヴィンスティンゲン | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
system | ウォームスガウ | - | manual-projection-not-original-server | 325.8 | 719.1 | 719.1 | 325.8 | 97 | 30 | 3097 | 83 | 25 | needs-target-panel-live-proof
planet | ヴェルナー | ウォームスガウ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | コンラート | ウォームスガウ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | ブルーノ | ウォームスガウ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
planet | リウドルフ | ウォームスガウ | orbit-order-only-not-coordinate | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | needs-selected-system-planet-panel-proof
