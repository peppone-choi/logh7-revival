// LOGH VII redirect 전용 canonical IPv4 parser.
//
// 문법: ASCII 10진수 octet 4개, 각 0..255.
// 선행 0은 octet "0" 자체만 허용하고 "00"/"01"은 8진수 해석 모호성 때문에 거부한다.
// 빈 octet, 공백, 부호, 지수 표기, 16진 표기는 허용하지 않는다.

function parseCanonicalOctet(part) {
  if (part.length < 1 || part.length > 3) return null;
  if (part.length > 1 && part.charCodeAt(0) === 0x30) return null;
  let value = 0;
  for (let index = 0; index < part.length; index += 1) {
    const code = part.charCodeAt(index);
    if (code < 0x30 || code > 0x39) return null;
    value = value * 10 + (code - 0x30);
  }
  return value <= 255 ? value : null;
}

/**
 * @param {string} ip
 * @returns {[number, number, number, number]}
 */
export function parseCanonicalIpv4(ip) {
  if (typeof ip !== 'string') {
    throw new TypeError('canonical IPv4 address must be a string');
  }
  const parts = ip.split('.');
  if (parts.length !== 4) {
    throw new Error(`invalid canonical IPv4 address: ${ip}`);
  }
  const octets = parts.map(parseCanonicalOctet);
  if (octets.some((value) => value === null)) {
    throw new Error(`invalid canonical IPv4 address: ${ip}`);
  }
  return /** @type {[number, number, number, number]} */ (octets);
}

/**
 * 클라이언트 `%d.%d.%d.%d` 파서용 low-octet-first u32.
 * @param {string} ip
 * @returns {number}
 */
export function ipv4ToClientU32(ip) {
  const octets = parseCanonicalIpv4(ip);
  return ((octets[3] << 24) | (octets[2] << 16) | (octets[1] << 8) | octets[0]) >>> 0;
}
