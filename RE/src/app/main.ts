import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';

// Phase 0 부트스트랩: HTTP 플랫폼 없이 application context만 띄운다(코어 와이어는 raw TCP라 HTTP 포트 불필요).
// WireServerService가 OnApplicationBootstrap에서 net.Server(serve-auth 동일 경로)를 올리고,
// enableShutdownHooks로 SIGINT/SIGTERM 시 OnApplicationShutdown→handle.close()가 그레이스풀 종료한다.
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);
  app.enableShutdownHooks();
  Logger.log('Nest application context started (wire server managed as a provider)', 'Bootstrap');
}

void bootstrap();
