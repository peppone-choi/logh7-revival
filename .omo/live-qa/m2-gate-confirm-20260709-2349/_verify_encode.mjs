// 오프라인 검증: 시드된 store → encodeLobbyCharCardList → body[0] 확인
import { createCharacterStore } from '../../../server/src/server/logh7-character-store.mjs';
import { encodeLobbyCharCardList } from '../../../server/src/server/logh7-character-codec.mjs';

const store = createCharacterStore(new URL('./store.json', import.meta.url).pathname.replace(/^\//, ''));
const chars = store.getCharacters('inei00');
console.log(JSON.stringify({ account: 'inei00', count: chars.length, ids: chars.map(c => c.id) }));

const msg32 = encodeLobbyCharCardList(chars);
// message32 inner: [u32 LE 0][u16 BE code][payload...]; payload[0] = list.length
const code = msg32.readUInt16BE(4);
const payload0 = msg32[6];
console.log(JSON.stringify({
  msg32Bytes: msg32.length,
  innerCodeHex: '0x' + code.toString(16),
  payloadByte0: payload0,
  interpretation: payload0 === 0 ? 'EMPTY-LOCK (byte0=0)' : `count=${payload0} (unlock candidate)`,
}));

// 빈 계정 대조
const emptyMsg = encodeLobbyCharCardList([]);
console.log(JSON.stringify({ emptyPayloadByte0: emptyMsg[6] }));
