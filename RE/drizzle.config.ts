import { defineConfig } from 'drizzle-kit';

// drizzle-kit이 src/app/persistence/*.schema.ts에서 SQL 마이그레이션을 생성하게 한다.
// dialect=sqlite, driver=better-sqlite3(Phase 1 결정). 런타임 영속화 구현은
// src/app/persistence/drizzle-account-persistence.ts. 마이그레이션 산출물은 ./drizzle.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/app/persistence/*.schema.ts',
  out: './drizzle',
});
