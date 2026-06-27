#!/usr/bin/env bash
# logh7-server standalone 레포를 모노레포에서 재추출(동기화)한다.
#
# 모델: 이 모노레포(logh7-revival)가 서버 코드·콘텐츠의 개발 home이고, standalone 서버 레포는
# 배포용 추출 스냅샷이다. 서버는 src/server + content(이미지 제외)만 의존(tools/ 의존 0).
# 클라-결합 RE 진단 테스트(클라 EXE/.omo 트레이스 의존)는 서버 레포에서 제외한다.
#
# 사용법:  bash tools/sync-server-repo.sh [대상경로]   (기본 /e/logh7-server)
set -e
SRC="$(cd "$(dirname "$0")/.." && pwd)"
DST="${1:-/e/logh7-server}"
echo "sync: $SRC/src/server, content(데이터) -> $DST"

mkdir -p "$DST/src" "$DST/tests"
rm -rf "$DST/src/server" "$DST/tests/server"
cp -r "$SRC/src/server" "$DST/src/server"
cp -r "$SRC/tests/server" "$DST/tests/server"

# 클라-결합 RE 진단 테스트 제외(EXE 또는 .omo RE 트레이스 의존 → 서버 레포에선 의미 없음).
rm -f \
  "$DST/tests/server/logh7-world-init-probe-server.test.mjs" \
  "$DST/tests/server/logh7-record-map.test.mjs"

# content: 데이터(JSON/db)만, 이미지·툴링 상태 제외.
cd "$SRC"
tar cf - \
  --exclude='*.png' --exclude='*.bmp' --exclude='*.tcf' --exclude='*.tga' \
  --exclude='*.jpg' --exclude='*.jpeg' --exclude='*.gif' --exclude='*.webp' \
  --exclude='.omc' --exclude='.omo' \
  content | ( cd "$DST" && rm -rf content && tar xf - )

echo "완료. 검증: (cd $DST && node --test tests/server/*.test.mjs)"
