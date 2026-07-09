export function buildLobbyInformationSessionInner({
  recordCount = 1,
  sessionId = 1,
  recordStatus = 1,
  sessionName = 'Test',
  sessionDescription = 'Codex Session',
  sessions = null,
} = {}) {
  // Backward-compatible: a single fixed record (recordCount/sessionId/...) unless `sessions` is given.
  // `sessions` (workflow wndew4jop, ??? ???? is the multi-record form: [{ sessionId, name, description,
  // status }]. status 1|2 makes a record selectable (client gate FUN_00593d90). record[0]'s on-wire
  // byte layout is unchanged so the existing single-record hex assertion still passes.
  const records = Array.isArray(sessions)
    ? sessions.map((s, i) => ({
        sessionId: Number.isInteger(s?.sessionId) ? s.sessionId : i + 1,
        status: Number.isInteger(s?.status) ? s.status : 1,
        name: s?.name ?? s?.sessionName ?? 'Test',
        description: s?.description ?? s?.sessionDescription ?? 'Codex Session',
      }))
    : Array.from({ length: recordCount }, () => ({
        sessionId,
        status: recordStatus,
        name: sessionName,
        description: sessionDescription,
      }));
  if (records.length > 0x40) {
    throw new Error(`invalid lobby session record count: ${records.length}`);
  }
  for (const r of records) {
    if (!Number.isInteger(r.sessionId) || r.sessionId < 0 || r.sessionId > 0xffff) {
      throw new Error(`invalid lobby session id: ${r.sessionId}`);
    }
    if (!Number.isInteger(r.status) || r.status < 0 || r.status > 0xff) {
      throw new Error(`invalid lobby session record status: ${r.status}`);
    }
  }
  const inner = buildLobbyResponseInner(LOBBY_RESP_INFO_SESSION_CODE, LOBBY_RESP_INFO_SESSION_PAYLOAD_BYTES);
  const payload = inner.subarray(6);
  payload.writeUInt8(0, 0); // raw leading byte consumed before the top-level count
  payload.writeUInt8(records.length, 1);
  let cursor = 2;
  for (const r of records) {
    payload.writeUInt16LE(r.sessionId, cursor);
    cursor += 2;
    payload.writeUInt8(r.status, cursor);
    cursor += 1; // raw record status/metadata byte
    cursor = writeLobbyUtf16Field(payload, cursor, r.name, 0x0d);
    cursor = writeLobbyUtf16Field(payload, cursor, r.description, 0x41);
  }
  return inner;
}

// Known-good redirect inner captured from a working real-client redirect
// (127.0.0.1:47900, token region intact). The builder patches IP/port over this
// template so the default output is byte-identical to the proven-working frame.
const REDIRECT_TEMPLATE_HEX = '70010000000000000100007fbb1c0000000100000000';
const REDIRECT_IP_OFFSET = 8; // BE u32, octet-packed (see ipToRedirectU32)
const REDIRECT_PORT_OFFSET = 12; // BE u16

/**
 * Read the inner message code (first BE u16 of the inner payload).
 * @param {Buffer} innerPayload
 * @returns {number|null}
 */