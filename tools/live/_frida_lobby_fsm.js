// LOGH VII lobby menu click → FSM/picker probe
// base 0x400000 (ASLR off)
'use strict';

function log() {
  const parts = [];
  for (let i = 0; i < arguments.length; i++) parts.push(String(arguments[i]));
  console.log(parts.join(' '));
}

const hooks = [
  // lobby FSM
  { name: 'FSM_51a370', addr: '0x0051a370' },
  // hit-test / menu enable
  { name: 'HIT_5015f0', addr: '0x005015f0' },
  { name: 'MENU_502780', addr: '0x00502780' },
  // picker path
  { name: 'PREP_593cf0', addr: '0x00593cf0' },
  { name: 'SEL_593d90', addr: '0x00593d90' },
  { name: 'RENDER_5946d0', addr: '0x005946d0' },
  // patched case 0x1c site
  { name: 'CASE1C_51aded', addr: '0x0051aded' },
  // case 0x19 picker init target
  { name: 'CASE19_51ad73', addr: '0x0051ad73' },
];

hooks.forEach(function (h) {
  try {
    Interceptor.attach(ptr(h.addr), {
      onEnter: function (args) {
        const a = [];
        for (let i = 0; i < 4; i++) {
          try { a.push(args[i].toString()); } catch (e) { a.push('?'); }
        }
        log(h.name, 'args', a.join(','));
      },
    });
    log('hooked', h.name);
  } catch (e) {
    log('FAIL', h.name, e);
  }
});

// also try reading a few known globals periodically if written
log('ready');
