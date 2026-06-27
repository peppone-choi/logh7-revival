import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';

// 코어 와이어 서버는 순수 .mjs 그대로 둔다 — Nest는 감쌀 뿐 재작성하지 않는다(마이그레이션 불변식 #1).
// CLI serve-auth와 *동일한* bootServeAuthServer를 호출해 "동일 와이어 동작"을 코드로 보장한다.
import { bootServeAuthServer } from '../server/logh7-server.mjs';

// .mjs 코어에서 추론한 핸들 타입(host/port/close/...). 순수 모듈을 재선언하지 않고 그대로 받는다.
type AuthServerHandle = Awaited<ReturnType<typeof bootServeAuthServer>>;

/**
 * 와이어(TCP) 게임/로그인 서버를 Nest 생명주기에 묶는 얇은 provider.
 * 컨트롤러가 아니다(컨트롤러는 Phase 2의 HTTP 어드민/리소스 전용). raw TCP 서버는 여기서
 * OnApplicationBootstrap에 올리고 OnApplicationShutdown에 닫는다.
 */
@Injectable()
export class WireServerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(WireServerService.name);
  private handle: AuthServerHandle | null = null;

  async onApplicationBootstrap(): Promise<void> {
    // serve-auth와 동일한 CLI 플래그 통로: `node ... main.ts --port 0 --account-db ...` 가 그대로 전달된다.
    // (`--import tsx`는 node execArgv라 process.argv에 없다 → slice(2)는 [entry 이후 플래그].)
    this.handle = await bootServeAuthServer({ argv: process.argv.slice(2), env: process.env });
    this.logger.log(`wire server up on ${this.handle.host}:${this.handle.port}`);
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    if (this.handle === null) {
      return;
    }
    await this.handle.close();
    this.handle = null;
    this.logger.log(`wire server stopped${signal ? ` (${signal})` : ''}`);
  }

  /** 테스트/관측용: 부팅된 와이어 서버 핸들(host/port/close/...). 미부팅 시 null. */
  getHandle(): AuthServerHandle | null {
    return this.handle;
  }
}
