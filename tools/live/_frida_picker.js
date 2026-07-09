const base = Module.findBaseAddress('g7mtclient.exe') || Module.findBaseAddress('G7MTClient.exe');
console.log('base', base);
// ASLR off typically base=0x400000; if not, adjust
const imgBase = base || ptr('0x400000');
function va(addr) {
  // if base is 0x400000, va==absolute; if ASLR, rebase
  if (imgBase.equals(ptr('0x400000'))) return ptr(addr);
  return imgBase.add(addr - 0x400000);
}
const hooks = [
  ['FUN_0051a370_lobby_fsm', 0x0051a370],
  ['FUN_00593cf0_picker_prep', 0x00593cf0],
  ['FUN_00593d90_selectable', 0x00593d90],
  ['FUN_005946d0_render_rows', 0x005946d0],
  ['FUN_005015f0_hit', 0x005015f0],
];
for (const [name, a] of hooks) {
  try {
    Interceptor.attach(va(a), {
      onEnter(args) {
        console.log(name, 'a0', args[0], 'a1', args[1], 'a2', args[2]);
      }
    });
    console.log('hooked', name, va(a));
  } catch (e) {
    console.log('fail', name, e);
  }
}
console.log('ready');
