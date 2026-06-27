import { childCodecEncode, childCodecKeySchedule } from './logh7-codec.mjs';
import { buildTransportFrame } from './logh7-transport-frame.mjs';

const WORLD_INIT_CANDIDATES = [
  {
    queuedInternalCode: 0x0f00,
    pairedInternalCode: 0x0f01,
    transportCode: 0x0013,
    messageName: 'ResponseWorldInitialize',
  },
  {
    queuedInternalCode: 0x0f02,
    pairedInternalCode: 0x0f03,
    transportCode: 0x0014,
    messageName: 'ResponseGridInitialize',
  },
];

export function buildEncryptedCandidateFrame({ tables, phase1Key, responseCode, decodedBody }) {
  return buildTransportFrame(responseCode, childCodecEncode(childCodecKeySchedule(tables, phase1Key), decodedBody));
}

export function buildWorldInitCandidateFrames({ tables, phase1Key }) {
  return WORLD_INIT_CANDIDATES.map((candidate) => ({
    ...candidate,
    decodedBodyHex: '01',
    frame: buildEncryptedCandidateFrame({
      tables,
      phase1Key,
      responseCode: candidate.transportCode,
      decodedBody: Buffer.from([1]),
    }),
  }));
}
