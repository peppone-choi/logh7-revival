import { Module } from '@nestjs/common';

import { WireServerService } from './wire-server.service.js';

// AppModule = 합성 루트. Phase 0은 와이어 서버 provider 하나만 둔다.
// (Drizzle 영속화=Phase 1, 도메인 DI 모듈/HTTP 컨트롤러=Phase 2에서 가산적으로 붙인다.)
@Module({
  providers: [WireServerService],
})
export class AppModule {}
