// transport(child) codec — Phase A2: 실제 구현은 ./codec/transport-codec.mjs로 이동했고, 여기선 re-export
// shim만 남긴다. 기존 import 경로(auth-server/server/session-bootstrap/world-init/tests/tools)를 100% 보존한다.
// 새 코드는 ./codec/transport-codec.mjs를 직접 import하는 것을 권장(점진 이행).
export * from './codec/transport-codec.mjs';
