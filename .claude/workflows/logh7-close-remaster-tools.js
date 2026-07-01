// LOGH VII — 갭 닫기 배치2: 리마스터/폰트/인코딩 도구 (T07/T14/T15/T17/T24/T25/T26). ultracode.
// server/src/server 미접촉(RE/tools·client·dgVoodoo.conf만) → galaxy-sim 워크플로와 병렬 무충돌.
// 라이브 시각/실클라 검증이 필요한 항목은 ARTIFACT(패치/도구)만 산출하고 메인이 직렬 라이브검증.

export const meta = {
  name: 'logh7-close-remaster-tools',
  description: '리마스터/폰트/모딩 인코딩 도구 갭 닫기: cave동적셀·폰트face·rsrc패처·face슬롯·그래픽빌드배선·텍스처업스케일',
  whenToUse: 'src/server 무충돌인 도구/패치/인코딩 갭들을 병렬로 닫을 때',
  phases: [{ title: '구현' }, { title: '검증' }],
}

const COMMON = [
  'LOGH VII revival root is C:\\Users\\by0ng\\OneDrive\\Desktop\\logh7-revival. Client/RE work runs under RE/ against G7MTClient(D3D8, ImageBase 0x400000, .text fileoff=VA-0x400000).',
  'RE: `cd RE && python -m tools.logh7_redex func 0x<addr>` / `grep`. PE/바이트는 .omo/work/logh7-ko-overlay/exe/G7MTClient.playable.exe.',
  '패치 디스크립터 규약: RE/tools/client_patches/*.json {name, patches:[{va,fileOffsetHex,originalHex,patchedHex,note}], verified}. originalHex는 설치EXE와 반드시 일치 검증.',
  '빌더: cd RE && python -m tools.logh7_build_playable_client --patches <names> --out <exe> (DEFAULT_STACK=menufix,dlgfix,earlygrid-ringclear).',
  '이 워크플로는 server/src/server를 절대 수정하지 말 것(병렬 워크플로가 사용 중). RE/tools·client·dgVoodoo.conf만.',
  '데이터등급 P0/P1/P2/P3 표기. 라이브 시각/실클라 검증이 필요하면 ARTIFACT만 만들고 needsLive로 표기.',
  '기존 참고: RE/tools/logh7_encode_strat_cave.py(cave, --cell-mem 옵션 존재), RE/tools/logh7_encode_lobby_res.py, RE/tools/client_patches/{widescreen-ui,strat-camera-focus,lobby-res}.json, RE/tools/logh7_graphics_config.py, RE/tools/logh7_tcf_pack.py, docs/logh7-graphics-remaster.md, docs/logh7-modding-architecture.md.',
].join('\n')

const TASK = {
  type: 'object', additionalProperties: false,
  properties: { id: { type: 'string' }, changed: { type: 'boolean' }, files: { type: 'array', items: { type: 'string' } },
    description: { type: 'string' }, verifyResult: { type: 'string', description: 'byte/originalHex 검증 또는 도구 셀프테스트 결과' },
    needsLive: { type: 'string', description: '실클라/라이브 시각 검증이 남았으면 무엇' }, provenance: { type: 'string' } },
  required: ['id', 'changed', 'description'],
}
const VERDICT = { type: 'object', additionalProperties: false,
  properties: { pass: { type: 'boolean' }, problems: { type: 'array', items: { type: 'string' } } }, required: ['pass', 'problems'] }

phase('구현')
const tasks = [
  { id: 'T07-cave-dynamic-cell', label: '구현:T07cave동적셀', prompt:
    'cave가 하드코딩 2550 대신 실제 own-fleet 셀을 읽게 한다. cave-source RE 체인(검증됨): own char-id @mainState+0x3584a0 → +0x36a8b4 배열(stride 0x2d4, count@+0x36a5dc)서 매칭 → flagship char+0x24 → grid-unit 리스트 0x41a368(count u16@+0x41a364, stride 0x58)서 매칭 → +0x08=셀. '
    + 'RE/tools/logh7_encode_strat_cave.py를 확장: --scan 모드(위 체인을 cave 어셈블리로 인코딩해 source+0x320=동적셀, src320==0일 때만) 또는 최소한 --cell-mem 절대주소 경로를 견고화 + 디스크립터 생성. 안전한 내부 0xCC cave(현재 0x5d5290) 용량 확인(체인 스캔이 더 김 → 더 큰 cave 필요시 추가 패딩 탐색). 바이트검증. needsLive=정적패치 0x0b01 end-to-end.' },
  { id: 'T14-font-face-replace', label: '구현:T14폰트face', prompt:
    '폰트 face 교체. 현재 권위: primary UI face VA 0x0077402c + D3D glyph-atlas face VA 0x0076e240 두 슬롯 모두 Pretendard. charset HANGEUL(0x81)·ClearType quality 확인. 패치 디스크립터는 RE/tools/client_patches/font-face*.json, 도구는 RE/tools/logh7_encode_font_face.py 및 RE/tools/logh7_encode_font_atlas_face.py를 사용/확장. 바이트검증. needsLive=라이브 한글 렌더 확인.' },
  { id: 'T15-rsrc-patcher', label: '구현:T15rsrc패처', prompt:
    '.rsrc 리소스 패처 신설/유지. RE/tools/logh7_binary_strings.py와 localization mapping 기반. RE/tools/logh7_rsrc_patch.py: RT_DIALOG/RT_MENU/RT_STRING 항목은 UTF-16LE 한글로 교체한다(cp949가 아님). String.txt/MsgDat ANSI 텍스트만 cp949 경로다. 한글 매핑은 provenance 태그로 관리. 도구 셀프테스트(라운드트립). needsLive=라이브 메뉴 한글 확인.' },
  { id: 'T17-face-atlas-expand', label: '구현:T17face슬롯', prompt:
    'face-atlas-expand: 신규 초상화 슬롯 라이브 생성. RE/tools/client_patches/face-atlas-expand.json 스펙을 실제 바이트 패치로 인코딩(아틀라스 cap/인덱스 한계를 늘리는 EXE 패치 + tcf.hed 슬롯 추가). RE/tools/logh7_tcf_pack.py 재사용. 아틀라스 한계 함수 RE로 확정 후 바이트검증. needsLive=신규 슬롯 초상화 라이브 표시.' },
  { id: 'T24-T25-graphics-wiring', label: '구현:T24+25그래픽배선', prompt:
    'T24: RE/tools/logh7_build_playable_client.py에 lobby-res·widescreen-ui 패치를 opt-in으로 배선(--remaster-res 플래그 또는 DEFAULT_STACK 확장 옵션, 기본 OFF 유지). T25: RE/tools/logh7_graphics_config.py --pathA(dgVoodoo ScalingMode=centered_4_3, 무패치 무왜곡) 옵션 확인/추가. 둘 다 셀프테스트(빌드 산출 바이트확인). needsLive=1920x1080 시각.' },
  { id: 'T26-texture-upscale', label: '구현:T26텍스처업스케일', prompt:
    '.tga 에셋 AI 업스케일 파이프라인 신설 RE/tools/logh7_upscale_textures.py: 설치트리 .tga를 2x/4x 업스케일(외부 업스케일러 가용시 호출, 없으면 고품질 Lanczos 폴백 + 후크 포인트) → 백업 + 원자적 교체 + revert. EXE 무침습. 도구 셀프테스트(소규모 .tga 1장 라운드트립/치수확인). needsLive=게임내 텍스처 확인.' },
]
const results = await parallel(tasks.map((t) => () =>
  agent(COMMON + '\n\n너는 maker다(읽기+RE/tools/client 수정 가능, server/src/server 금지). 태스크 ' + t.id + ':\n' + t.prompt
    + '\n\n산출 후 셀프검증(바이트/originalHex/도구테스트)하고 TASK 반환.',
    { label: t.label, phase: '구현', schema: TASK })))
const impls = results.filter(Boolean)

phase('검증')
const verdict = await agent(COMMON + '\n\n너는 verifier다. 아래 도구/패치 산출을 적대적 검증:\n' + JSON.stringify(impls, null, 1).slice(0, 40000)
  + '\n\n확인: originalHex가 실제 설치EXE와 일치하는지 redex/PE로 재확인, 패치가 same-length/안전위치인지, src/server 미수정인지, 도구가 revert/백업 안전한지, P3 추측을 원본으로 과장 안 했는지. VERDICT 반환.',
  { label: '검증:리마스터도구', phase: '검증', schema: VERDICT, agentType: 'general-purpose' })

return { impls, verdict, note: '메인: 각 needsLive 항목을 ui_explorer로 라이브검증, docs/logh7-gap-backlog.md에서 T07/14/15/17/24/25/26 닫음 표기.' }
