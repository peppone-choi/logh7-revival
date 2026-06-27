/**
 * [L2 코덱 레이어 re-export shim] Phase A2.
 *
 * 이 모듈의 실제 구현은 src/server/codec/simple-info.mjs 로 이동했다(순수 와이어 코덱 L2 레이어).
 * 기능은 1비트도 바뀌지 않았으며, 기존 import 경로(`./logh7-simple-info.mjs`)를 100% 보존하기 위해
 * 여기서 코덱 모듈의 전체 named export 표면을 그대로 다시 내보낸다.
 *
 * 새 코드는 가급적 `./codec/simple-info.mjs` 를 직접 import 할 것(이 shim은 호환성 유지용).
 */

export * from './codec/simple-info.mjs';
