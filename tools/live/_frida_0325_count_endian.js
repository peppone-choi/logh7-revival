'use strict';
// 0x0325 count endian 라이브 확정 (FUN_004ba2b0).
// ImageBase 0x400000. thiscall: ecx=this, [esp+4]=code, [esp+8]=payload.

const PREF = ptr('0x400000');
const mod = Process.getModuleByName('g7mtclient.exe');
const base = mod.base;
function va(hex) {
  return base.add(ptr(hex).sub(PREF));
}

const F_DISP = va('0x4ba2b0');
const STAGING = va('0x41a364');

function hexN(p, n) {
  try {
    return Array.from(new Uint8Array(p.readByteArray(n)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch (e) {
    return null;
  }
}

function readCodePayload() {
  // try common layouts
  const layouts = [
    { codeOff: 4, payOff: 8, tag: 'thiscall' },
    { codeOff: 8, payOff: 12, tag: 'stdcall-this' },
    { codeOff: 4, payOff: 12, tag: 'mixed' },
  ];
  for (const L of layouts) {
    try {
      const code = this.context.esp.add(L.codeOff).readU32() & 0xffff;
      const payload = this.context.esp.add(L.payOff).readPointer();
      if (code === 0x325 && payload && !payload.isNull()) {
        return { code, payload, tag: L.tag };
      }
    } catch (e) {}
  }
  // also try ecx-relative unlikely
  try {
    const code = this.context.esp.add(4).readU32() & 0xffff;
    const payload = this.context.esp.add(8).readPointer();
    return { code, payload, tag: 'default' };
  } catch (e) {
    return { code: -1, payload: null, tag: 'fail' };
  }
}

Interceptor.attach(F_DISP, {
  onEnter(args) {
    // __thiscall: args[0]=this if frida maps, else use esp
    let code = -1;
    let payload = null;
    let tag = 'none';
    try {
      // Frida args for thiscall on x86: often args[0]=ecx this, args[1]=code, args[2]=payload
      if (args[1] !== undefined) {
        const c1 = args[1].toInt32() & 0xffff;
        if (c1 === 0x325) {
          code = c1;
          payload = args[2];
          tag = 'args12';
        }
      }
    } catch (e) {}
    if (code !== 0x325) {
      try {
        const c = this.context.esp.add(4).readU32() & 0xffff;
        const p = this.context.esp.add(8).readPointer();
        code = c;
        payload = p;
        tag = 'esp48';
      } catch (e) {}
    }
    if (code !== 0x325) {
      try {
        const c = this.context.esp.add(8).readU32() & 0xffff;
        const p = this.context.esp.add(12).readPointer();
        if (c === 0x325) {
          code = c;
          payload = p;
          tag = 'esp812';
        }
      } catch (e) {}
    }
    this.is325 = code === 0x325;
    if (!this.is325) return;
    const head = payload && !payload.isNull() ? hexN(payload, 16) : null;
    let le = null;
    let be = null;
    try {
      if (payload && !payload.isNull()) {
        le = payload.readU16();
        be = (payload.readU8() << 8) | payload.add(1).readU8();
      }
    } catch (e) {}
    send({
      ev: 'disp325',
      t: Date.now(),
      tag,
      payloadHead: head,
      countAsLE: le,
      countAsBE: be,
    });
  },
  onLeave() {
    if (!this.is325) return;
    const head = hexN(STAGING, 16);
    let native = null;
    let be = null;
    try {
      native = STAGING.readU16();
      be = (STAGING.readU8() << 8) | STAGING.add(1).readU8();
    } catch (e) {}
    send({
      ev: 'stage325',
      t: Date.now(),
      stagingHead: head,
      countNativeU16: native,
      countIfBE: be,
    });
  },
});

// Also log any high codes near world entry for debug
let seen = {};
Interceptor.attach(F_DISP, {
  onEnter(args) {
    let code = -1;
    try {
      code = this.context.esp.add(4).readU32() & 0xffff;
    } catch (e) {
      try {
        code = args[1].toInt32() & 0xffff;
      } catch (e2) {}
    }
    if ([0x204, 0x206, 0x323, 0x325, 0xb09, 0xb0a, 0x313, 0x315, 0xf03].indexOf(code) >= 0) {
      const k = 'c' + code;
      if (!seen[k]) {
        seen[k] = 1;
        send({ ev: 'dispAny', code: '0x' + code.toString(16) });
      }
    }
  },
});

send({ ev: 'ready', base: base.toString() });
