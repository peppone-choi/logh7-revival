# LOGH VII 권위 서버 — 스켈레톤 이미지 (Node 20+, node:sqlite 내장)
# 현재 기본 영속성은 SQLite. PostgreSQL 전환은 async 포트 착지 후(다음 배치).
FROM node:20-bookworm-slim

WORKDIR /app

# 의존성 레이어 (package.json 변경 시에만 재설치)
COPY package.json ./
# lockfile 이 아직 없어 install 사용. pg 추가 후 npm ci 로 승격 예정.
RUN npm install --omit=dev || npm install

# 소스
COPY src ./src
COPY content ./content
COPY data/seed ./data/seed

# 서버 포트 (playable TCP). 라이브 QA 고정 포트와 동일.
EXPOSE 47900

# 상태 보존: SQLite 파일과 계정/캐릭터 JSON 은 볼륨으로 마운트(compose 참조).
ENV NODE_ENV=production

CMD ["node", "src/presentation/main.mjs"]
