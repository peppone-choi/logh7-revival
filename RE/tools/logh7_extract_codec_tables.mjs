// child-codec 정적 테이블(Blowfish P/S-box)을 클라 EXE에서 한 번 추출해 커밋용 JSON으로 저장한다.
// 이 테이블은 불변 상수라, 서버가 런타임에 클라 바이너리를 읽지 않도록(서버↔클라 분리) 데이터로 떼어낸다.
//
// 사용법:
//   node tools/logh7_extract_codec_tables.mjs [<G7MTClient.exe>] [--out content/crypto/child-codec-tables.json]
// 기본 입력: .omo/work/logh7-installed/exe/G7MTClient.exe, 기본 출력: DEFAULT_CODEC_TABLES_PATH.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  extractChildCodecStaticTables,
  serializeChildCodecTables,
  DEFAULT_CODEC_TABLES_PATH,
} from '../src/server/logh7-codec.mjs';

const DEFAULT_EXE = '.omo/work/logh7-installed/exe/G7MTClient.exe';

function parseArgs(argv) {
  const positional = [];
  let out = DEFAULT_CODEC_TABLES_PATH;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--out') {
      out = argv[i + 1];
      i += 1;
    } else {
      positional.push(argv[i]);
    }
  }
  return { exe: positional[0] ?? DEFAULT_EXE, out };
}

const { exe, out } = parseArgs(process.argv.slice(2));
const tables = extractChildCodecStaticTables(path.resolve(exe));
const json = serializeChildCodecTables(tables);
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(json, null, 1)}\n`, 'utf8');
console.log(`child-codec 테이블 추출 완료: ${exe} → ${out} (pArray ${tables.pArray.length}, sBoxes ${tables.sBoxes.length}×${tables.sBoxes[0].length})`);
