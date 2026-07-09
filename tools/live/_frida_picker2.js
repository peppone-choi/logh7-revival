console.log('script start');
try {
  Interceptor.attach(ptr('0x0051a370'), {
    onEnter(args) { console.log('FSM_51a370 a0=' + args[0] + ' a1=' + args[1]); }
  });
  console.log('hooked fsm');
  Interceptor.attach(ptr('0x00593cf0'), {
    onEnter(args) { console.log('PICKER_PREP_593cf0 a0=' + args[0]); }
  });
  console.log('hooked prep');
  Interceptor.attach(ptr('0x005946d0'), {
    onEnter(args) { console.log('RENDER_5946d0 a0=' + args[0]); }
  });
  console.log('hooked render');
  Interceptor.attach(ptr('0x0051aded'), {
    onEnter(args) { console.log('HIT_PATCH_SITE_51aded'); }
  });
  console.log('hooked patch site');
} catch (e) {
  console.log('ERR ' + e);
}
console.log('ready');
