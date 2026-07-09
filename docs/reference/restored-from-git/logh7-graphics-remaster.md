# LOGH VII — Graphics Remaster (resolution, widescreen, upscale)

Read-only reverse-engineering result. Every claim below is cited to a Ghidra
address in `.omo/ghidra/export/G7MTClient/` (query via `python tools/logh7_redex.py
func 0x<addr>`) or to a file on disk. Where the decompile could not byte-prove a
claim, it is marked **verify-later in live client** and must NOT be treated as
fact until checked against the running game.

The renderer is the Microsoft DirectX 8 SDK `CD3DApplication`/`CD3DFramework8`
sample framework (`Direct3DCreate8(0xdc)` = `D3D_SDK_VERSION` 220 at
`FUN_005da810`). dgVoodoo2 is already deployed in `.omo/work/logh7-installed/exe/`
(`D3D8.dll` wrapper + `dgVoodoo.conf`).

## 2026-06-20 correction — no letterbox as the remaster target

The earlier "Path A" 4:3/pillarbox guidance below remains useful as a diagnostic
fallback, but it is **not** the player-facing remaster target anymore. The target is
system-resolution UI: a real native backbuffer/canvas, then per-scene coordinates
and assets moved for that canvas.

Current shipped lobby path:

- `lobby-res` changes the lobby's hardcoded 1024x768 calls in `FUN_0051a370` to a
  real 1920x1080 canvas in the current checked-in default build.
- `lobby-native-layout` changes the `FUN_0051c980` scene anchor table so the
  lobby panels are laid out on the 1920x1080 canvas instead of being stretched or
  preserved as a 4:3 island.
- `lobby-fullscreen-display` is rejected for production. It kept the authored
  1024x768 basis and forced a 1920x1080 display target, which live QA showed as
  horizontal UI stretch.

Live validation on 2026-06-20 confirmed the default playable EXE no longer uses
the stretch/letterbox path for the lobby. The currently verified default is
1920x1080; for other system resolutions regenerate both `lobby-res` and
`lobby-native-layout` for the same target size, then live-verify the EXE. Remaining
remaster work is to repeat the same native-coordinate treatment for the other
lobby dialogs, character/session flows, and in-world panels; do not solve those by
reintroducing 4:3 letterboxing.

---

## 1. Resolution model — driving ANY resolution

### 1.1 GraphicConfig.txt is the source of truth, with ZERO validation

`.\GraphicConfig.txt` is parsed by **`FUN_004f33e0` @ 0x004f33e0** (the writer is
the sibling **`FUN_004f34f0` @ 0x004f34f0`**). The reader opens
`s_____GraphicConfig_txt_0077483c`, skips the 3 header lines
(`EasyGraphicConfigFile` / `PleaseSetLevels0-3` / `(*//`) via a
`do{FUN_00600cd8}while(iVar8<3)` loop, then reads up to 14 (`0xe`) label+value
line pairs, parsing each value with `FUN_005ff09b -> FUN_005ff010` (a textbook
`atoi`) into a 14-int config array `param_1[0..13]`.

**There is NO validation, NO clamp, NO aspect-ratio check, NO min/max, NO
enumerated-resolution whitelist.** Every value is stored raw. Arbitrary
`ScreenWidth`/`ScreenHeight` are accepted verbatim.

Field order (proven by the writer `FUN_004f34f0`, which prints label+value pairs
in the same index order; matches the on-disk
`.omo/work/logh7-installed/GraphicConfig.txt`):

| idx | field               | on-disk value |
|-----|---------------------|---------------|
| 0   | UnitModelLevel      | 2             |
| 1   | StarsModelLevel     | 2             |
| 2   | ModelTextureLevel   | 2             |
| 3   | BGTextureLevel      | 2             |
| 4   | EffectTextureLevel  | 2             |
| 5   | **ScreenWidth**     | **1440**      |
| 6   | **ScreenHeight**    | **1080**      |
| 7   | ScreenRefreshRate   | 60            |
| 8   | ScreenBit           | 0             |
| 9   | EffectLV            | 0             |
| 10  | BGM Volume          | 100           |
| 11  | SE Volume           | 100           |
| 12  | StrategyBGM         | 3             |
| 13  | TacticsBGM          | 5             |

> **Writer quirk (carry into any round-tripper):** the writer `FUN_004f34f0`
> emits `param_1[8]` for BOTH the `ScreenBit` AND the `EffectLV` line — index 9 is
> not written by the writer. The reader still stores 14 distinct slots, and the
> on-disk file has distinct `ScreenBit`(0) / `EffectLV`(0) lines, so a
> read/modify/write tool must preserve all 14 lines independently and not rely on
> the writer's emitted ordering for `EffectLV`. Does not affect ScreenWidth(5) /
> ScreenHeight(6).

`FUN_004f3730` @ 0x004f3730 is the generic getter: `return *(undefined4*)(param_1
+ param_2*4);` — i.e. `config[index]`. (`param_2*4` is the 4-byte dword element
stride, **not** a multiply of the value by 4.)

### 1.2 How the config resolution reaches the device

- **Virtual UI resolution** for the main play view is set from config:
  `FUN_0051a370` @ 0x0051a370 calls `FUN_00401760(FUN_004f3730(5),
  FUN_004f3730(6))` = `FUN_00401760(ScreenWidth, ScreenHeight)`. Menu paths use
  fixed `FUN_00401760(0x280,0x1e0)` = 640x480 and `FUN_00401760(0x400,0x300)` =
  1024x768.
- **`FUN_00401760` @ 0x00401760** forces the OS window so its CLIENT AREA equals
  the requested virtual resolution (measures the non-client border via
  GetWindowRect − GetClientRect, then SetWindowPos to nonClientBorder + virtualW/H
  via `FUN_00648f32`). So in normal flow **client == virtual == config res**.
- **Backbuffer** is built in `FUN_005db950` (D3DPRESENT_PARAMETERS at
  `param_1+0xa8e6`, CreateDevice via IDirect3D8 vtable +0x3c). Windowed flag
  `param_1[0xa8e1]`: when **!= 0 (windowed)** the backbuffer = GetClientRect
  deltas (`0xa93c-0xa93a` width, `0xa93d-0xa93b` height); when **== 0** it = the
  selected enumerated adapter mode dims. So in windowed mode the device runs at
  the window client size = config res.
- **Fullscreen** requires an *enumerated* adapter mode. `FUN_005daa70` walks the
  D3D8 vtable (GetAdapterModeCount +0x18, EnumAdapterModes +0x1c) and filters with
  `if ((0x27f < width) && (399 < height))` (keeps modes >= 640x400), searching for
  640x480 (`w==0x280 && h==0x1e0`) as a baseline + a D24/D16 depth-format pass
  (0x17/0x18/0x19). A real driver would REJECT a non-enumerated fullscreen res —
  **dgVoodoo virtualizes the adapter and advertises arbitrary modes**, so any
  ScreenWidth/Height becomes selectable.
- The "FullScreen!" path (`FUN_004e7420`, string @0x00772fc8) is borderless
  windowed-fullscreen: SetMenu(0), GWL_STYLE = WS_POPUP (0x80000000),
  GetSystemMetrics(0)/(1) desktop W/H, resize to full desktop centered. The F9
  toggle string `[F9]  FullScreen ON,OFF` @0x007857f8 is wired through
  `FUN_005123b0` (options menu) → device switch `FUN_005dbf70` (sets windowed flag
  `0xa8e1`) → reset `FUN_005dbd10`.

> **verify-later in live client:** the end-to-end path from the parsed
> ScreenWidth/Height through CreateDevice present-params was not fully resolved by
> redex xref (the intermediate `FUN_004e71b0` has an unreliable Ghidra signature —
> called with 5 args, decompiled as 3, storing virtual W/H at `+0x2a3d8`/`+0x2a3dc`
> via `FUN_00401830`). The storage offsets and their consumer (`FUN_004ea460`) are
> confirmed real; the "any resolution reaches the backbuffer" claim is solid for
> the projection/aspect layer and strongly inferred for present-params. Confirm by
> running the client at e.g. 1920x1080 and checking the actual backbuffer size.

### 1.3 3D projection is aspect-correct at ANY resolution (no patch)

The perspective matrix is built by **`FUN_005a6d10` @ 0x005a6d10** — a hand-rolled
`D3DXMatrixPerspectiveFovLH`:

```
m[0]  = cot(fovY/2) / aspect     ; x-scale, aspect divides ONLY here
m[5]  = cot(fovY/2)              ; y-scale (fixed)
m[10] = zf/(zf-zn)
m[11] = 1.0
m[14] = -zn*zf/(zf-zn)
m[15] = 0.0
```

Fed by **`FUN_004e9bb0` @ 0x004e9bb0** (mkOneTimeSceneInit):
`GetClientRect(...); FUN_005a6d10(&m, 0x3f490e56, (right-left)/(bottom-top),
0x3e800000, 0x461c4000)` — vertical FOV `0x3f490e56` = 0.785375 rad (~45°, not
exactly 45°), aspect = **live client W/H**, near 0.25, far 10000. In-battle scene
init `FUN_004e8540` @ 0x004e8540 uses the same live aspect with FOV `0x3f860a92`.

Because the aspect divides only the horizontal scale, a wider backbuffer yields a
**correct WIDER horizontal FOV (Hor+) with the vertical FOV preserved — no 3D
stretch**. The 3D camera self-adapts to any resolution/aspect with no exe change.

### 1.4 Recommended: drive resolution via config + dgVoodoo

1. Set `ScreenWidth`/`ScreenHeight` in `GraphicConfig.txt` to your target
   (1920x1080, 2560x1440, 3840x2160…). Parser accepts any value.
2. In `dgVoodoo.conf`: `[General] FullScreenMode=true`, `FullscreenAttributes=fake`
   (already set) for borderless fullscreen; `[DirectX] Resolution=unforced` to let
   GraphicConfig drive, or a forced `WxH`.
3. 3D renders correct at the chosen aspect automatically (§1.3). The **only**
   layer that does not auto-adapt is the 2D UI raster — see §2.

---

## 2. Widescreen WITHOUT UI stretch

### 2.1 Root cause of UI stretch (byte-located)

The 2D UI scale math lives in **`FUN_004ea460` @ 0x004ea460**. After
`GetClientRect` it computes **TWO INDEPENDENT per-axis ratios**:

```
_DAT_00772e2c = (float)virtualW(param_1+0x2a3d8) / (float)(clientRect width)
_DAT_00772e30 = (float)virtualH(param_1+0x2a3dc) / (float)(clientRect height)
```

X uses `virtualW/clientW` and Y uses `virtualH/clientH` **separately — NOT a
single uniform `min()`**. It also caches the client rect into
`+0x2a5fc/+0x2a600/+0x2a604/+0x2a608`. ~31 UI window funcs read those (e.g.
`FUN_004fd100` @ 0x004fd100 → `FUN_004ea610`). **`FUN_004ea610` @ 0x004ea610** has
exactly four `__ftol()` calls writing `param_1[0..3]` with a left/right/top/bottom
reorder; the per-axis scale-global multiply that feeds those `__ftol`s is the
**inferred** transform.

**Mechanism of the stretch:** the UI bitmaps are authored 4:3 (current config
1440x1080 = exactly 4:3; menu defaults 640x480 / 1024x768 are also 4:3; all UI
BMP/TGA are 4:3-authored per `.omo/re-audit/images`). Normally `FUN_00401760`
forces client == virtual, so both ratios are 1.0 and nothing stretches. But if the
client/backbuffer aspect differs from the 4:3 UI-authoring aspect (e.g. a forced
16:9 ScreenWidth:ScreenHeight, or dgVoodoo presenting a non-AR backbuffer), then
`virtualW/clientW != virtualH/clientH`, so every 2D widget is scaled by a
different amount horizontally vs vertically = **stretch**.

> **verify-later in live client:** `FUN_004ea610`'s "multiplies each rect
> component by `_DAT_00772e2c`/`_DAT_00772e30`" is INFERRED, not byte-proven —
> Ghidra dropped the FPU operands ahead of each `__ftol()`, so the calls show no
> args. The reorder write to `param_1[0..3]` is real; the two scale globals' only
> writers are `FUN_004ea460` and they feed UI transform, so the multiply is the
> reasonable inference. Confirm the divergence empirically before shipping the
> patch.

### 2.2 Legacy diagnostic Path A — dgVoodoo-only, NO exe patch

This path is retained only to isolate stretch bugs. It is not the player-facing
remaster target after the 2026-06-20 correction above.

Keep the in-game `ScreenWidth:ScreenHeight` at a **4:3** value the UI was authored
for (e.g. 1440x1080 for a 1080p monitor, 1600x1200 for native). Then client ==
virtual == 4:3, both ratios = 1.0, **zero UI stretch**. Let dgVoodoo present that
4:3 backbuffer pillarboxed/uniform to the wide physical screen:

- `dgVoodoo.conf [General] ScalingMode = centered_4_3` (valid values listed in the
  conf header line 17–18; also `stretched_4_3`, `centered`, `centered_ar`).
  Currently the file has `ScalingMode = centered_ar`.

Result: crisp, uniform, pixel-perfect 4:3 UI with black pillars on the sides; 3D
rendered at the 4:3 backbuffer (still correct, just narrower FOV than a true 16:9
backbuffer). **No exe patch.** This satisfies "UI must not stretch (늘어지면 안됨)"
and "no need to stay 4:3 for the screen" (the *display* fills the monitor via
letterbox; only the *backbuffer* stays 4:3).

### 2.3 Legacy diagnostic Path B — true 16:9 fill, uniform-scale UI

This uniform-scale patch is also a diagnostic fallback, not the production
remaster route. To fill a 16:9 screen (backbuffer = native 16:9, e.g. 1920x1080) with extra
horizontal 3D FOV AND no UI stretch, you must make the 2D UI uniform-scale +
anchored. The per-axis divergence is forced by `FUN_004ea460` computing X and Y
independently, so this **requires an exe patch** at `FUN_004ea460` @ 0x004ea460.

**Patch recipe (single point):** after the GetClientRect, force the two stored
factors equal — compute `s = min(virtualW/clientW, virtualH/clientH)` (uniform
min-scale) and store `s` into BOTH `_DAT_00772e2c` and `_DAT_00772e30` (simplest:
overwrite `_DAT_00772e30 = _DAT_00772e2c` using the smaller/uniform ratio). This
anchors the UI top-left and uniformly scales it (a centering bias could be added
if desired). This is the ONLY patch point because every 2D widget pulls its scale
from these two globals via `FUN_004ea610`.

> **Summary: no-stretch widescreen needs an EXE patch ONLY for true-16:9-fill
> (Path B). Path A (4:3 backbuffer + dgVoodoo `centered_4_3` letterbox) achieves
> uniform no-stretch UI with NO exe patch.**

### 2.4 Lobby resolution (separate from the play view — RE-confirmed)

The lobby/menu does **not** use the GraphicConfig `ScreenWidth/ScreenHeight`. The
virtual-resolution dispatcher **`FUN_0051a370`** sets the UI canvas per scene:

- intro/menu: `FUN_00401760(0x280,0x1e0)` = **640x480**
- **lobby: `FUN_00401760(0x400,0x300)` = 1024x768**, paired with the render setup
  `FUN_004e7570(1, DAT_007c1b50, 0x400, 0x300)` — both hardcoded 1024x768 (4:3).
- in-world play view: `FUN_00401760(FUN_004f3730(5), FUN_004f3730(6))` =
  `ScreenWidth, ScreenHeight` (config-driven).

So the lobby is laid out in a fixed **1024x768 (4:3)** virtual canvas. How it is
handled at each target:

1. **Any 4:3 backbuffer (legacy diagnostic Path A).** The lobby's
   1024x768 canvas scales **uniformly** to a 4:3 backbuffer (both 4:3 → the
   `FUN_004ea460` X and Y ratios are equal → no stretch), and dgVoodoo
   `centered_4_3` pillarboxes it to fill any monitor. The lobby renders correctly
   at every resolution; above 1024x768 it is upscaled from 1024x768-authored art.
2. **Lobby sharpness at high res = upscale the lobby ART, not the canvas.** Bumping
   the hardcoded `0x400,0x300` to a larger value would re-space widgets laid out in
   absolute 1024x768 coordinates (they'd cluster top-left) — **do not** patch the
   virtual res for sharpness. Instead drop in 2x/4x-upscaled lobby UI bitmaps
   (`data/image/**`); the loader is dimension-agnostic (§3.1), so the same 1024x768
   layout samples sharper textures. **verify-later:** spot-check one lobby atlas.
3. **Legacy true 16:9 lobby fill (Path B)** uses the SAME `FUN_004ea460` uniform-scale
   patch as the play view — the 4:3 lobby art is then uniformly scaled + centered in
   the 16:9 frame (extra width = background/pillar), no stretch.
4. **Lobby fullscreen pillarbox** is legacy diagnostic behavior, not the remaster
   target.

> A higher-native-detail lobby (re-spaced 1440x1080 canvas) is possible but needs
> the lobby widget-coordinate system proven relative/scalable first — tracked as a
> verify-later option, not the default.

---

## 3. Remaster / upscale

### 3.1 Drop-in texture upscale works with ZERO exe change (byte-verified loader)

Texture create chain: `FUN_004dda90 -> FUN_004e0c00 -> FUN_005e3570 ->
FUN_005e3450 -> FUN_005e32f0 -> FUN_005e2de0 -> FUN_005e2860`, then **`FUN_005e2d20`
@ 0x005e2d20** calls `FUN_005a4e76(dev, path, 0xffffffff, 0xffffffff, ...,
MipLevels=1, ..., 0x70004, ...)`. Width/Height = `0xffffffff` = `D3DX_DEFAULT`.

In the statically-linked D3DX8 creator **`FUN_005a478c` @ 0x005a478c** at
`LAB_005a4888`: when width(`arg+0x14`)/height(`arg+0x18`) are 0 or -1 they are
**replaced with the source-image header dims** (`EBP-0x80`/`EBP-0x7c`), which the
GetImageInfo dispatcher `FUN_005aacda` @ 0x005aacda parsed from the actual file
header. The BMP parser **`FUN_005a91a7` @ 0x005a91a7** reads
`biWidth=param_2[1]`, `biHeight=param_2[2]` straight from the BITMAPINFOHEADER,
computes stride and allocates the surface dynamically (`param_1[3]=width`,
`param_1[4]=height`, `param_1[0xc]=stride`). **No hardcoded 640x480, no sidecar
dimension** — a larger same-format file decodes to a larger surface.

The only size constraints are in **`FUN_005a3b2e` @ 0x005a3b2e** (the
CheckTextureRequirements equivalent): (1) clamp to device caps `local_88`/`local_84`
= MaxTextureWidth/Height (GetDeviceCaps via vtable +0x1c); (2) round UP to
next power-of-two ONLY if the device pow2-cap bit is set (`if ((local_a4 &
uVar3)!=0){ while(w<...) w<<=1; ... }`). dgVoodoo advertises modern caps (no pow2
requirement, huge max), and **all 308 textures in `data/model/images/Hi/` are
already power-of-two** (verified 0 non-pow2), so 2x/4x replacements
(512→1024→2048) are pow2-safe and never clamped.

> **Scope boundary (honor the verifier hedge):** the loader/decoder being fully
> dimension-agnostic proves the LOADER accepts arbitrary sizes; it does NOT prove
> every CONSUMER (UI layout passing src/dst rects, or atlas-cell math) tolerates a
> 2x/4x asset. **verify-later in live client:** drop in a single upscaled asset
> and confirm on-screen rect math is unchanged before bulk-upscaling. The 3D scene
> sprite blit `FUN_005b51fa` draws at the literal caller pixel rect (no 4:3 virtual
> canvas), so 3D-side art is safe; UI atlas consumers need the spot check.

### 3.2 LOD levels = pre-authored resolution-variant DIRECTORIES (not mips)

`UnitModelLevel / StarsModelLevel / ModelTextureLevel / BGTextureLevel /
EffectTextureLevel` (config idx 0–4) are NOT mip levels and NOT a CreateTexture
size arg. They select a subdirectory. **`FUN_004f3750` @ 0x004f3750** appends a
suffix onto `/../data/model/images/` (string @0x77496c), where the suffix is
chosen by level: `0 -> 'Lo/'` (@0x773f74), `1 -> 'Mid/'` (@0x773f6c), `else ->
'Hi/'` (@0x773f68).

On disk: `data/model/images/{Hi,Mid,Lo}` all exist; identical filenames are halved
per level. **Verifier correction:** Hi/ is NOT uniformly 512x512 — the histogram
ranges 64x32 … **2048x1024** (Hi already ships 2048-wide assets; only the
halving-per-level relationship holds). Default config = 2 for all five fields →
**Hi (max detail)**. `Hi/` is the directory to drop upscaled textures into.

Mip caveat: standard load passes `MipLevels=1` (`FUN_005e3450` param_4=1 → struct
`+0x21c`), so a single level is created (resample filter `0x70004`). Upscaled
drop-ins render fine but without a full mip chain unless you author mips.

### 3.3 dgVoodoo non-invasive quality knobs (no exe change)

Edit `.omo/work/logh7-installed/exe/dgVoodoo.conf` `[DirectX]` (currently
`appdriven`):

- `Filtering = 16` → 16x anisotropic (valid: `appdriven`/`bilinear`/`trilinear`/
  integer 1–16, per conf line 191).
- `Antialiasing = 4x` (or `8x`) → MSAA (per conf [DirectX] block).
- `[General] ScalingMode` + `[GeneralExt] Resampling = lanczos-3` (valid filters
  listed conf line 81) for clean letterbox scaling.

3D mesh remaster (swapping `.x`/mesh geometry) is gated by the un-mapped mdx/mds
polygon arrays (gap #1 in `docs/logh7-file-re-coverage.md`) — **texture** upscale
is NOT gated and is the recommended remaster path.

---

## 4. Build plan

### 4.1 `tools/logh7_graphics_config.py` (no exe patch)

Read/modify/write `GraphicConfig.txt` + patch `dgVoodoo.conf` for a target
resolution and remaster preset.

- Parse the 14-field array in the EXACT engine order from §1.1 (Unit/Stars/
  ModelTexture/BG/EffectTextureLevel, ScreenWidth, ScreenHeight, ScreenRefreshRate,
  ScreenBit, EffectLV, BGM Volume, SE Volume, StrategyBGM, TacticsBGM), preserving
  the 3-comment header + label/value line layout so the reader round-trips.
  Preserve all 14 lines independently — do NOT replicate the writer's
  `param_1[8]`-for-EffectLV quirk (§1.1).
- `set_resolution(w, h, refresh, bit)` and `set_levels(0..3)`.
- `--widescreen` preset: diagnostic only. Set a **4:3** ScreenWidth/Height matched to the monitor
  (1440x1080 for 1080p, 1600x1200 for native 1200p) AND write `dgVoodoo.conf
  [General] ScalingMode = centered_4_3` → legacy Path A, not the production
  remaster target.
- `--fill16x9` preset: diagnostic only. Set native 16:9 ScreenWidth/Height AND emit
  the legacy `client_patches/widescreen-ui.json` descriptor (§4.3).
- `--remaster` preset: set all five `*Level` to max (Hi) AND write `dgVoodoo.conf
  [DirectX] Filtering=16, Antialiasing=4x`, `[GeneralExt] Resampling=lanczos-3`.

### 4.2 Upscale pipeline (e.g. `tools/logh7_upscale_textures.py`, no exe patch)

Walk `data/model/images/Hi/` (and `data/image/**` for UI); for each BMP/TGA run a
2x/4x AI upscaler (realesrgan-ncnn / esrgan); re-encode preserving the original
pixel format (24/32-bit BMP, TGA — `FUN_005a91a7` supports 16/24/32-bit DIBs) and
the SAME filename; **keep dimensions power-of-two** (512→1024→2048) so
`FUN_005a3b2e`'s pow2 branch is a no-op and the device-cap clamp isn't hit.
Optionally pre-generate mip chains (loader uses MipLevels=1). Drop-in by
overwriting. **Run the §3.1 single-asset spot check first.**

### 4.3 `tools/client_patches/widescreen-ui.json` (legacy diagnostic only)

Descriptor targeting `FUN_004ea460` @ 0x004ea460: make the UI uniform-scale +
anchored by forcing `_DAT_00772e2c == _DAT_00772e30` to the uniform `min()` ratio
(§2.3). Single function, the two divide+store pairs. No texture-loader changes
needed (§3.1). Keep it out of default builds; native-coordinate remaster work should
patch the relevant scene anchor tables and assets instead.

---

## TL;DR — current remaster decision

- Player-facing remaster target: native system-resolution canvas plus per-scene
  coordinate/asset remaster. Current verified lobby patches are `lobby-res` +
  `lobby-native-layout` at 1920x1080; use `tools/logh7_encode_lobby_res.py` and
  `tools/logh7_encode_lobby_native_layout.py` together for another target resolution.
- Legacy Path A and `widescreen-ui` Path B are retained as diagnostics only.

3D projection, resolution selection, and texture upscale remain **patch-free**
(config + dgVoodoo only).

---

## 5. T-HD — 전 화면 네이티브 레이아웃 SPEC (2026-06-22, RE-confirmed)

로비 외 나머지 화면(설정/캐릭터생성·세션/월드 HUD)을 1920x1080 네이티브로
재배치하는 SPEC. 좌표 테이블 RE + byte-검증 패치 후보까지. **실패치/빌드/시각검증은
메인 직렬(needsLive).** 생성기: `tools/logh7_encode_panel_native_layout.py`
(pristine `.omo/ghidra/bin/G7MTClient.exe` sha256 `2848be76…`에서 originalHex 직접
검증, `--selftest`로 라운드트립 PASS).

### 5.1 씬 디스패처 — 3 패밀리 (RE 확정)

`FUN_0054e570(scene*, type)` @0x0054e570 가 씬 타입으로 분기 (호출원 = mode
디스패처 `FUN_004b68f0`):

| scene type | 빌더 | 화면 패밀리 | 캔버스 |
|-----------|------|-----------|--------|
| 1 | `FUN_005123b0` | **소칸(司令官) 인-월드 HUD** | config-native (case 0x3d: `FUN_00401760(ScreenWidth,ScreenHeight)`) |
| 2 | `FUN_004ff3c0` | 전략/월드 배경 레이어 | **live clientRect 기반 동적** (`+0x2a604−+0x2a5fc`) → 이미 해상도-적응, 패치 불필요 |
| 3 | `FUN_0051ca30` | **로그인/로비/세션/캐릭터선택 패널 묶음** | 640 메뉴 + 1024 로비 (FSM `FUN_0051a370`) |

타입3 마스터 생성자 `FUN_0051ca30`는 하위 패널들을 순차 생성:
`FUN_0051cda0`(로그인 필드=login-native-layout 보유), `FUN_0051d580`, `FUN_0051dc00`,
`FUN_0051dd80`, `FUN_0051e580`, `FUN_0051f8b0`, …

### 5.2 좌표 인코딩 패턴 (2종)

- **레지스터-캐시 즉치** (`mov reg,imm32` = `b8/b9/ba/bb/bd/be/bf` + LE imm): 좌표값을
  한 번 로드해 0x14(20B) stride rect 레코드의 여러 esp 슬롯에 분배. **즉치 하나가 한
  행/열 전체 위젯을 공유** — lobby의 c74424 직접저장보다 패치 포인트가 적다. 단점:
  개별 위젯을 독립 이동하려면 code-cave 필요(공유 즉치라).
- **직접 저장 즉치** (`mov [esp+XX],imm32` = `c74424XX` + LE imm): 슬롯별 독립값. soukan
  HUD·lobby-native-layout이 이 형태.

X 즉치는 width 비율, Y 즉치는 height 비율로 정수(truncation) 스케일 — 이유는 §2.1의
X/Y 독립 스케일러(`FUN_004ea460`)와 정합.

### 5.3 캔버스-해상도 레이어는 **이미 기존 패치가 보유** (중복 금지)

| 캔버스 | push 사이트 | 보유 패치 (DEFAULT_STACK) |
|--------|-----------|--------------------------|
| 640x480 메뉴 (charsel/session) | `0x51a50a`(h480) `0x51a51c`(w640) | **login-native-layout** (480→1080, 640→1920) |
| 1024x768 로비 (gamemenu/window) | `0x51a73b`/`0x51a740` 외 8개 | **lobby-res** (768→1080, 1024→1920) |
| config-native 월드 (soukan HUD) | case 0x3d ScreenW/H | 패치 불필요(설정 주도) |

→ 신규 패널 패치는 **앵커 테이블만** 옮기면 된다(해상도 push 재패치 불필요).

### 5.4 패널별 SPEC 산출물 (verified=false, byte-검증 originalHex)

| 패널 | 함수 | 패치 JSON | #패치 | 캔버스 |
|------|------|----------|------|--------|
| 캐릭터선택/세션 | `FUN_0051e580` | `charsel-native-layout.json` | 5 | 640x480 |
| 게임메뉴 우측(리스트) | `FUN_0051dc00`+`FUN_0051dd80` | `gamemenu-right-native-layout.json` | 7 | 1024x768 |
| 윈도우/다이얼로그 | `FUN_0051f8b0` | `window-dialog-native-layout.json` | 7 | 1024x768 |
| 소칸 인-월드 HUD | `FUN_005123b0` | `soukan-hud-native-layout.json` | 8 | config-native |

전 27개 패치: originalHex가 pristine EXE 바이트와 일치 + same-length + same-instr(즉치만
스케일) capstone 검증 완료. **설정 패널**은 옵션-메뉴가 같은 `FUN_005123b0`(soukan과
공유)에서 그려짐 — 추가 분리 RE 필요분은 needsLive 후속.

### 5.5 needsLive (메인 직렬 라이브)

각 패널을 1920x1080로 띄워 (1) 위젯 X/Y 분류 정오 확인(레지스터 공유 즉치가 의도한
행/열만 옮기는지), (2) 우측 패널이 1920 우측 끝에 정렬되는지, (3) 소칸 HUD가 월드
캔버스에서 안 깨지는지 시각 확인 후 verified=true 승격. 빌더 와이어링은
`tools/logh7_build_playable_client.py` DEFAULT_STACK에 추가(메인).
