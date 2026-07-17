// 0x032e RequestInformationOutfitParty / 0x032f ResponseInformationOutfitParty 코덱.
//
// 클라는 함대 정보 패널에서 0x032e 를 보내고 고정 0x8b04(35588)B 짜리 0x032f 응답을 기다린다.
// 수신 body는 dispatcher(FUN_004ba2b0)가 client+0x35f35c 로 벌크 복사하고, 파서(FUN_0041e…)가
// compact cursor 로 읽어 native cache의 별도(정렬된) offset 에 저장한다. 따라서 wire 에는
// native padding 을 쓰지 않는다 — 형제 0x0327 warehouse 와 완전히 같은 패턴이다.
//
// 근거: docs/reference/legacy-evidence/logh7-proto-info-records.md §5c (dump FUN_0041eaa0,
//   parser cap error strings). §0 size cross-check: 0x032f = 0x8b04.
//
// 엔디안: 형제 0x0327 warehouse 라이브 확정(B71: body 첫 u32 = 00000046 = base 70 = u32BE)의
//   compact BE stream 규약을 따른다. name 문자(u16)도 같은 stream reader(*stream+0x20)로 읽히므로
//   BE 다. 라이브에서 숫자/이름이 뒤집혀 보이면 options.wireEndian='le' 단일 지점으로 폴백한다.

export const REQ_INFO_OUTFIT_PARTY_CODE = 0x032e;
export const RESP_INFO_OUTFIT_PARTY_CODE = 0x032f;
export const RESP_INFO_OUTFIT_PARTY_BODY_BYTES = 0x8b04; // 35588 고정 수신 크기

// 파서 하드 캡(Input_ResponseInformationOutfitParty error strings). 초과 시 클라가 throw 하므로
// 빌더가 반드시 clamp 한다.
export const OUTFIT_PARTY_CHARACTERS_MAX = 10;
export const OUTFIT_PARTY_CHARACTER_NAME_MAX = 13; // u8 len + u16[≤13]
export const OUTFIT_PARTY_SHIPS_MAX = 60;
export const OUTFIT_PARTY_SHIP_UNITS_MAX = 70;
export const OUTFIT_PARTY_TROOPS_MAX = 24;
export const OUTFIT_PARTY_OTHER_PACKAGES_MAX = 3;
export const OUTFIT_PARTY_TROOP_PACKAGES_MAX = 24;
export const OUTFIT_PARTY_NOT_TOGETHER_SHIPS_MAX = 60;
export const OUTFIT_PARTY_NOT_TOGETHER_TROOPS_MAX = 24;

function clampInteger(value, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(max, Math.trunc(number)));
}

function toCappedArray(value, max) {
  return Array.isArray(value) ? value.slice(0, max) : [];
}

/**
 * 0x032f 고정 프레임 안에 client parser 가 소비하는 compact BE stream 을 기록한다.
 *
 * 근거 있는 필드만 채운다(무날조). characters[] 에는 함대의 지휘 사관 실데이터만 투영하고,
 * 미보유 배열(ships/troops/packages/…)은 count 0, 경제 스칼라(supplies/max_supplies)는
 * 도메인 값이 있으면 사용하고 없으면 0(경제 미구현이 정본).
 *
 * record: {
 *   outfit, base, mode, power, camp, kind, index,
 *   characters: [{ id, kind, rank, displayName }],   // ≤10, name ≤13 u16
 *   ships: [{ kind, unitNumber, boatNumber, units:[u32,…] }],  // ≤60, units ≤70
 *   troops: [{ kind, troopGrade, unitNumber }],       // ≤24
 *   supplies, maxSupplies, package,
 *   otherPackages: [{ kind, unitKind, troopGrade, packageNumber }],  // ≤3
 *   troopPackages: [{ kind, unitKind, troopGrade, packageNumber }],  // ≤24
 *   transportPackageEmptySize, troopTransportPackageEmptySize, carrying,
 *   notTogetherShips: [ships…],   // ≤60
 *   notTogetherTroops: [troops…], // ≤24
 * }
 */
export function buildResponseInformationOutfitPartyInner(record = {}, options = {}) {
  const wireEndian = options.wireEndian === 'le' ? 'le' : 'be';
  const body = Buffer.alloc(RESP_INFO_OUTFIT_PARTY_BODY_BYTES);
  const src = record && typeof record === 'object' ? record : {};
  let cursor = 0;

  const u8 = (value) => {
    body.writeUInt8(clampInteger(value, 0xff), cursor);
    cursor += 1;
  };
  const u16 = (value) => {
    const n = clampInteger(value, 0xffff);
    if (wireEndian === 'be') body.writeUInt16BE(n, cursor);
    else body.writeUInt16LE(n, cursor);
    cursor += 2;
  };
  const u32 = (value) => {
    const n = clampInteger(value, 0xffffffff);
    if (wireEndian === 'be') body.writeUInt32BE(n, cursor);
    else body.writeUInt32LE(n, cursor);
    cursor += 4;
  };
  // display_name: u8 len + u16[≤13]. CP932 자산 임의 변환 금지 — JS 문자열의 코드유닛을 그대로
  // wide char(u16)로 쓴다(형제 0x0323 name 인코딩과 동일 규약). stream endian 을 따른다.
  const pstr16 = (str) => {
    const codes = [...String(str ?? '')].slice(0, OUTFIT_PARTY_CHARACTER_NAME_MAX);
    u8(codes.length);
    for (const ch of codes) u16(ch.charCodeAt(0));
  };

  const writeShips = (ships) => {
    u8(ships.length);
    for (const ship of ships) {
      u16(ship?.kind);
      u8(ship?.unitNumber);
      u16(ship?.boatNumber);
      const units = toCappedArray(ship?.units, OUTFIT_PARTY_SHIP_UNITS_MAX);
      u8(units.length);
      for (const unit of units) u32(unit);
    }
  };
  const writeTroops = (troops) => {
    u8(troops.length);
    for (const troop of troops) {
      u16(troop?.kind);
      u8(troop?.troopGrade);
      u16(troop?.unitNumber);
    }
  };
  const writePackages = (packages) => {
    u8(packages.length);
    for (const pkg of packages) {
      u8(pkg?.kind);
      u16(pkg?.unitKind);
      u8(pkg?.troopGrade);
      u32(pkg?.packageNumber);
    }
  };

  // header
  u32(src.outfit);
  u32(src.base);
  u8(src.mode);
  u8(src.power);
  u8(src.camp);
  u32(src.kind);
  u32(src.index);

  // characters[] — the fleet member list
  const characters = toCappedArray(src.characters, OUTFIT_PARTY_CHARACTERS_MAX);
  u8(characters.length);
  for (const character of characters) {
    u32(character?.id);
    u8(character?.kind);
    u8(character?.rank);
    pstr16(character?.displayName ?? character?.display_name);
  }

  writeShips(toCappedArray(src.ships, OUTFIT_PARTY_SHIPS_MAX));
  writeTroops(toCappedArray(src.troops, OUTFIT_PARTY_TROOPS_MAX));

  u32(src.supplies);
  u32(src.maxSupplies);
  u16(src.package);

  writePackages(toCappedArray(src.otherPackages, OUTFIT_PARTY_OTHER_PACKAGES_MAX));
  writePackages(toCappedArray(src.troopPackages, OUTFIT_PARTY_TROOP_PACKAGES_MAX));

  u8(src.transportPackageEmptySize);
  u8(src.troopTransportPackageEmptySize);
  u8(src.carrying);

  writeShips(toCappedArray(src.notTogetherShips, OUTFIT_PARTY_NOT_TOGETHER_SHIPS_MAX));
  writeTroops(toCappedArray(src.notTogetherTroops, OUTFIT_PARTY_NOT_TOGETHER_TROOPS_MAX));

  const inner = Buffer.alloc(6 + body.length);
  inner.writeUInt32LE(0, 0);
  inner.writeUInt16BE(RESP_INFO_OUTFIT_PARTY_CODE, 4);
  body.copy(inner, 6);
  return inner;
}
