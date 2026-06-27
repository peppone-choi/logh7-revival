import { childCodecEncode, childCodecKeySchedule } from './logh7-codec.mjs';
import { buildTransportFrame } from './logh7-transport-frame.mjs';

const SESSION_BOOTSTRAP_CANDIDATES = [
  {
    messageName: 'SSLoginOK',
    transportCode: 0x0001,
    queuedInternalCode: 0x0200,
    pairedInternalCode: 0x0201,
    stateWrite: 'client+0x35f252 byte = body+0x00',
  },
  {
    messageName: 'SSGameLoginOK',
    transportCode: 0x0003,
    queuedInternalCode: 0x0205,
    pairedInternalCode: 0x0206,
    stateWrite: 'client+0x35837e byte = 1',
  },
];

const DEFAULT_SESSION_BOOTSTRAP_BODY = Buffer.from([1]);

export function buildSessionBootstrapCandidateFrames({ decodedBody = DEFAULT_SESSION_BOOTSTRAP_BODY } = {}) {
  return SESSION_BOOTSTRAP_CANDIDATES.map((candidate) => ({
    ...candidate,
    decodedBodyHex: decodedBody.toString('hex'),
    frame: buildTransportFrame(candidate.transportCode, decodedBody),
  }));
}

export function buildEncryptedSessionBootstrapCandidateFrames({ tables, phase1Key, decodedBody = DEFAULT_SESSION_BOOTSTRAP_BODY }) {
  const scheduled = childCodecKeySchedule(tables, phase1Key);
  return SESSION_BOOTSTRAP_CANDIDATES.map((candidate) => ({
    ...candidate,
    decodedBodyHex: decodedBody.toString('hex'),
    frame: buildTransportFrame(candidate.transportCode, childCodecEncode(scheduled, decodedBody)),
  }));
}
