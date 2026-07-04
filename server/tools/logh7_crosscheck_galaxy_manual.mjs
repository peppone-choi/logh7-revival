// G047 매뉴얼 성계도 cross-check 원장 재생성 도구
import { writeGalaxyManualCrosscheck } from "../src/server/logh7-galaxy-manual-crosscheck.mjs";

const outArg = process.argv.indexOf("--out");
const outPath = outArg >= 0 ? process.argv[outArg + 1] : undefined;
const { target, ledger } = writeGalaxyManualCrosscheck(outPath);
console.log(JSON.stringify({ target, summary: ledger.summary, status: ledger.status, canonicalPromotion: ledger.canonicalPromotion }, null, 1));
