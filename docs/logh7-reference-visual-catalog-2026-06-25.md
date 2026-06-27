# LOGH VII 원본 UI 레퍼런스 시각 카탈로그 — 2026-06-25

워크플로 `wnnrff5mi` 전수 시각검수(각 이미지 Read로 실제 관측). 검수 이미지 134장 / 기대 134.

## 카테고리 분포

- fleet-battle: 68
- in-facility: 13
- command-window: 10
- strategy-map: 10
- tactical-map: 9
- non-game: 9
- duty-card: 4
- misc-hud: 3
- base-panel: 2
- lobby: 2
- title-splash: 2
- character-stat: 1
- world-map: 1

## 화면별 핵심(재현 타겟) — game 카테고리 우선

### [title-splash] 5b0d3b_656564.gif
- 관측: A promotional/cinematic render (likely splash or loading art): a large gray-white capital ship hull seen from above-front, streaked with diagonal blue motion-blur light lines against a dark city-light/starfield background. No game UI, no legible text. Looks like an intro movie st
- 진영/색: n/a — promotional render, motion-blur light streaks
- 재현: Cinematic intro/splash art of a flagship with warp light-streaks — reference for title/loading-movie mood, not gameplay UI.

### [title-splash] 75d6fa_5600580.gif
- 관측: Title/logo banner. Right side: the game logo '銀河英雄伝説 VII' with English subtitle 'SPACE WAR SIMULATION' above it, large stylized 'VII' beneath. Left side: a nebula/planet background (greenish-magenta cloud with two dark planets and faint ship silhouettes). This is the official wor
- 진영/색: n/a — logo banner
- 텍스트: SPACE WAR SIMULATION · 銀河英雄伝説 VII · VII
- 재현: Canonical title wordmark '銀河英雄伝説 VII / SPACE WAR SIMULATION' — reference for the title-screen/splash branding and English tagline.

### [lobby] 239ff0_6712_20030924_05_gineiden04.jpg
- 관측: A lobby/management screen over a backdrop of Earth-like planet seen from orbit (top-left has an inset photo of a white triangular spaceport/base building). Dominant blue glassy UI. Top-left a framed building photo inset; center-left a blue panel with a small block of Japanese tex
- 진영/색: Blue UI chrome throughout; small white/grey portrait icon bottom-left. No fleet markers. Faction not indicated on this screen.
- 텍스트: Japanese label text in right panel (too small to transcribe reliably) · rows of two-digit numbers (stats)
- 재현: Reproduce the in-facility/lobby management screen: orbital planet backdrop + framed facility photo inset + right-hand numeric stat list panel + ornate bottom console deck.

### [lobby] 80952a_lobby.jpg
- 관측: A small lobby/navigation menu panel titled 宇宙港 (spaceport). Subtitle/header line 警戒ロビー (alert lobby / standby lobby). Two selectable menu buttons stacked vertically: 旗艦桟橋 (flagship pier/berth) and 航路管理センター (route management center). Plain dark-blue paneled background, no 3D scene
- 진영/색: Dark blue lobby menu; no faction info (pre-faction lobby navigation).
- 텍스트: 宇宙港 · 警戒ロビー · 旗艦桟橋 · 航路管理センター
- 재현: Reproduce the 宇宙港/lobby navigation menu: a titled panel (宇宙港 → 警戒ロビー) with stacked location buttons (旗艦桟橋, 航路管理センター) — the in-facility lobby room picker.

### [in-facility] 0a235e_20030924222608_7.jpg
- 관측: An in-facility / office interior scene (시설내장소·집무실). The upper portion shows a brightly-lit room with pale yellow-green walls, a doorway on the right, shelving/cabinets, and a coffered ceiling. Foreground bottom-center is a curved blue console/dashboard. Upper-right has a portrait
- 진영/색: Alliance-style bright interior (Free Planets Alliance look): pale yellow/green walls, blue control console. No explicit faction marker color; UI is the standard blue facility/office HUD.
- 텍스트: Japanese text rows in the right-side data list (small, multi-line roster/status — individual glyphs not crisply legible at this resolution)
- 재현: Reproduce in-facility/office room: bright interior background + curved blue console, with a right-side roster/status list panel and a portrait/emblem box — matches our base/office (집무실) target.

### [in-facility] c25be7_20040427162045_1.jpg
- 관측: An in-facility (施設内/集務室) interior: a teal-and-cream room with a curved domed ceiling, large arched windows/portholes, and dark lounge furniture (sofas/chairs) on a patterned floor. The lower third is overlaid by the blue HUD command window — a horizontal bar with a central rounde
- 진영/색: Interior scene (not space). Teal/green-lit office/lounge with a domed/arched ceiling. HUD is the standard blue command bar at the bottom. No fleet faction colors (this is a base-interior/office screen
- 재현: Reproduce the in-facility interior: a 3D teal domed office/lounge room with the blue command-window HUD docked at the bottom (center readout flanked by button clusters) — the 시설내장소/집무실 screen.

### [in-facility] 4f0f7c__1.JPG
- 관측: High-res in-facility (執務室/司令部) screen — the canonical office/roster + duty-card UI. Left: a wood-paneled office wall hung with named character portraits in a grid (メックリンガー, ケンプ, ミッターマイアー, ロイエンタール, G.ミュッケンベルガー, マイフォーハー, ケスラー, キルヒアイス, ワーレン, ファーレンハイト, ルッツ, シュタインメッツ, F.マリーンドルフ, リヒテンラ
- 진영/색: Imperial in-facility / HQ scene (防衛司令部 = Defense HQ). Commander portrait (ミュラー少将 = Rear Admiral Mueller). Faction implied by Imperial roster + 宇宙暦 796 date (Imperial calendar).
- 텍스트: 職務権限カード (Duty Authority Card) · 艦隊司令官 (Fleet Commander) · 艦隊司令官ケンプ中将 への提案 · 統率/政治/運用/情報/指揮/機動/攻撃/防御 = 99, 功績9999 · 移動 会見 作戦 報告 謀議 / 参加 受諾 兵棋演習 / 志願 亡命 資金投入 / 設得 反乱 鈫任 / 任命 昇進 罷免 / 特別警備 燃料補給 · ミュラー少将 第
- 재현: Canonical in-facility reference: portrait-roster wall + bottom commander bust with full 8-ability stat row (PCP/MCP), and especially the right-hand 職務権限カード (duty card) showing target-officer stats and the full ~22-button action grid (移動/会見/作戦/任命/昇進/罷免/亡命/反乱…) 

### [in-facility] 5092f0_en10101010101010101010.gif
- 관측: In-facility (司令部ロビー) screen. Upper-left: a wood-paneled officer hall with ~16 anime character portraits in rows (named officers). Upper-right: a '職務権限カード' (duty-authority card) panel showing the 艦隊司令官 (fleet commander) role with a portrait and a full ability grid (統率/政治/運用/情報 = 9
- 진영/색: Empire (帝国) — Mittermeyer-era officer portraits; blue HUD chrome
- 텍스트: 職務権限カード · 艦隊司令官 · 統率 99 政治 99 運用 99 情報 99 · 攻撃/防御/影響/評価/体力 · 移動 作戦 退役 · 会見 服従 参加
- 재현: This IS the en004-family C002 reference: in-facility command-window — clicking an officer portrait opens the 職務権限カード duty card whose command grid (移動/作戦/受護/...) is the select->command-window flow we must reproduce.

### [in-facility] b739e9_uu3.jpg
- 관측: Letterboxed (pillarboxed) in-facility 司令部 screen, same layout as en004/en10101 but a slightly different state. Upper-left: officer portrait hall with named anime portraits (メックリンガー, ケンプ, ミッターマイヤー, ロイエンタール, G.ミッツェンベルガー, マイフォーガー, キルヒアイス, ワーレン, ファーレンハイト, ルッツ, R.シュナイダー, ビッテンフェルト, ラート
- 진영/색: Empire (帝国); blue HUD chrome; officer portraits
- 텍스트: 職務権限カード · 艦隊司令官 · 統率99 政治99 運用99 情報99 · 移動 作戦 退役 · 会見 服従 参加 · 志願 亡命 資金投入
- 재현: uu3 = in-facility 司令部 / 職務権限カード command-window state showing the full command verb set (incl. 説得 persuade, relevant to coup/defection mechanics) — reproduce officer-portrait-hall → click → duty card with this 21-verb command grid.

### [in-facility] f0e0cb_japan-online-img-9.jpg
- 관측: Small/low-res thumbnail of the same in-facility 司令部 + 職務権限カード screen (matches en004/uu3 family). Upper-left: officer portrait hall (~16 anime portraits in rows). Upper-right: duty-authority card panel with a portrait, an ability grid, and a command button grid. Bottom-left: dialo
- 진영/색: Empire (帝国); blue HUD; officer portraits
- 텍스트: (text too small to read reliably; layout matches 職務権限カード in-facility screen)
- 재현: Low-res duplicate of the in-facility duty-card/command-window screen (en004 family) — confirms the same select-officer → duty-card layout; use higher-res siblings (en004/uu3) for exact labels.

### [in-facility] 1c9f81_gin02.gif
- 관측: An in-facility / management screen, very similar layout to image 1. Backdrop is the same orbital planet view with a top-left framed inset photo of the white triangular spaceport building. Center-left a blue panel containing a portrait thumbnail and a block of Japanese descriptive
- 진영/색: Blue UI chrome. Small white/grey character portrait thumbnail bottom-left; orange/yellow icon accent. No fleet faction markers.
- 텍스트: Japanese info/dialogue text (not legible at size) · stat number rows
- 재현: Reproduce the in-facility management view: planet backdrop + facility photo inset + portrait/info text panel + right-hand character stat list + bottom console deck.

### [in-facility] 774d94_gin11.gif
- 관측: Very small (~160px) thumbnail: a grey docked/parked capital ship in the lower-left against starfield, a large blue-white planet at upper-right. Blue HUD framing — top-right status block, bottom-right command icon grid, bottom-left blue panel. Possibly a base/docking (拠点) scene. T
- 진영/색: Thumbnail; faction not distinguishable. Blue/teal HUD theme. A blue-white planet/moon hangs at upper-right.
- 재현: Thumbnail of a ship near a planet with the standard blue command HUD; likely base/orbit view — fetch full-size for legible labels.

### [in-facility] cd9acc_ginei03.jpg
- 관측: 640x480 painted interior of a facility lounge/club: curved teal walls, a bar counter with stools at left, rows of dark blue couches, a tall window with daylight beams, potted plants, a door. This is an in-facility '所内장소' scene. Bottom HUD is the persistent character status bar: l
- 진영/색: Alliance/military officer-club interior; portrait shown is an elderly officer (white hair); HUD blue
- 텍스트: 政治家リヒテンラーデ · 高級士官クラブ · ヴァルハラ星系 · 恒星オーディン · 職務権限カード · メンバーリスト
- 재현: Reproduce the in-facility lounge scene with the persistent bottom status bar showing portrait + 8 abilities + PCP/MCP gauges and the location panel (facility name / star system / star) plus 職務権限カード and メンバーリスト tabs.

### [in-facility] f843b0_ginei02.jpg
- 관측: 640x480 painted interior of a bright office/study (cream walls, wood desk with a laptop-like console, sofas, bookshelf with globe and model at right, door center). Right side overlays a duty/authority panel '職務権限カード' listing 職務 (duties): 艦長 / 統合作戦本部:統合作戦本部第三次長 / 統合作戦本部:統合作戦本部長 / 
- 진영/색: Alliance leadership office (シトレ元帥, Marshal Sithole, white-haired portrait); blue HUD; duty-card panel
- 텍스트: 職務権限カード · 職務 · 艦長 · 統合作戦本部:統合作戦本部第三次長 · 統合作戦本部:統合作戦本部長 · 個人
- 재현: Reproduce the in-facility office with the 職務権限カード duty-card panel (list of 職務/duties with per-duty buttons + 命令/提案 + メンバーリスト tab) over the painted office, plus the persistent bottom status bar (portrait/abilities/location: 居住地/星系/恒星) — defines the duty-card UI

### [in-facility] en10101010101010101010.gif
- 관측: IN-FACILITY (施設内 office/lobby) screen with the DUTY CARD panel open. Left/center: an anime interior (corridor/office) populated by a grid of named officer PORTRAITS — メックリンガー, ケンプ, ミッターマイヤー, D.アイゼナール, G.ミュッケンベルガー, マイフォーゲル, キルヒアイス, ワーレン, ファーレンハイト, ラング, F.マリーンドルフ, ビッテンフェルト, ラードルフ, 
- 진영/색: Imperial (帝国軍 in description). Character portraits are anime-style officer faces; no faction color markers — this is the facility/office interior, faction implied by roster (Imperial officers).
- 텍스트: 職務権限カード · 艦隊司令官 · メックリンガー · ケンプ · ミッターマイヤー · D.アイゼナール
- 재현: ★This is the in-facility (uu/施設内) office view = matches uu3: reproduce the facility interior with a grid of named officer portraits + the 職務権限カード duty-card panel (portrait, stat block, 24 duty-action buttons) + bottom status bar + 施設内ロビー/会議室/執務室 room list; can

### [in-facility] uu3.jpg
- 관측: IN-FACILITY OFFICE (施設内/執務室) screen, near-identical to en10101010101010101010 (the labeled version). Anime corridor/office interior filled with a grid of named officer PORTRAITS (メックリンガー, ケンプ, ミッターマイヤー, D.アイゼナール, G.ミュッケンベルガー, マイフォーゲル, キルヒアイス, ワーレン, ファーレンハイト, ラング, F.マリーンドルフ, ビッテンフ
- 진영/색: Imperial roster (帝国軍 officers). Portraits anime-style; faction not color-coded here — it's the office/facility interior. Selected character (ミュラー少将) is Imperial.
- 텍스트: 職務権限カード · 艦隊司令官 · メックリンガー · ケンプ · ミッターマイヤー · D.アイゼナール
- 재현: ★uu3 = the canonical IN-FACILITY office view (memory's 'uu3 = 집무실+인물초상화+직무카드'): reproduce facility interior + grid of named officer portraits + 職務権限カード (selected-post portrait, ability stat block, 24-button duty grid) + 命令/提案 & メンバーリスト tabs + bottom status bar

### [in-facility] ab1dcb_gi02.jpg
- 관측: An in-facility / command-office screen. Upper-left: an inset image of a planet (Earth-like blue/white) above what looks like a ground installation render. Top-right: a duty/command card panel headed 宇宙艦隊司令長官 (Commander-in-Chief of the Space Fleet) with an officer portrait and a d
- 진영/색: Blue UI chrome throughout (allied/command-room aesthetic). Faction not shown via fleet color here; this is a facility/office command screen. Portrait of an officer at bottom-left.
- 텍스트: 宇宙艦隊司令長官 (Commander-in-Chief of the Space Fleet) · 宇宙艦隊司令長官室 / 司令官 (office / commander labels) · grid of Japanese command-button labels (mostly illegible individually)
- 재현: Reproduce the in-facility command-office screen: a duty-card panel titled by the officer's post (宇宙艦隊司令長官) with portrait + dense command-button grid, plus planet inset, officer portrait with ability bars, an oval radar scope, and a circular command icon ring —

### [strategy-map] 396106_japan-online-img-8.jpg
- 관측: Strategic-map / star-system view. Left ~⅔ shows a dark space map with several stars (a blue star upper-left labeled, an orange star, a white star) joined by thin connection lines (warp lanes); a node appears selected with a label callout. Right ⅓ is a blue tabbed info panel with 
- 진영/색: Strategic galaxy/star-system map: star systems shown as colored star glyphs (blue, white, orange/yellow stars) connected by navigation lanes; selected node highlighted. Faction ownership not clearly c
- 텍스트: (JP description text in right panel, too small to transcribe cleanly)
- 재현: Reproduce the strategic star-system map: star-type glyphs (blue/white/orange) linked by warp lanes, selectable node with callout label, and a right-hand info+command-button panel with portrait header — the strategy-map screen.

### [strategy-map] 53a412_en011.jpg
- 관측: Strategic/galaxy map view at high resolution. Left ~2/3: deep-space starfield with several named stars (タナトス 73000, ライガール 8944, リオ・ヴルデ 38204, 12000, 11897, ヴルデ...) each with a green/orange numeric value tag and small icons; orbital arc lines connect them; a white fleet sprite (wi
- 진영/색: Empire (帝国) command context; star markers green/red/blue; fleet sprite white
- 텍스트: タナトス 73000 · ライガール 8944 · リオ・ヴルデ 38204 · 12000 · 11897 · 500 LY
- 재현: Full strategy-map HUD layout to reproduce: named star markers with numeric value tags + orbital connectors over starfield, plus the right-docked 職務権限カード command grid and the bottom 8-ability status strip with 宇宙暦 date and system/facility lists.

### [strategy-map] 923239_ginei01.jpg
- 관측: Wide strategic-map / galaxy navigation screen. Background is a dark grid of numbered cells (lots of small '12','13' style coordinate numbers across a faint grey grid over a blue starfield) — the strategic sector grid. A cyan selection square frames the central cell holding a smal
- 진영/색: Friendly own fleet = green star markers (two green stars at left-mid and bottom-left). Selected unit highlighted with a cyan selection box on the grid. Bottom character card = ローエングラム元帥 (Reinhard, Emp
- 텍스트: Please choose the grid which you move. · ローエングラム元帥 · 第1近衛艦隊司令官 · 体力 · 68 · PCP
- 재현: Strategic-map MOVE mode: 'Please choose the grid which you move.' prompt + numbered coordinate grid + CYAN move-target selection box, own fleets as GREEN stars; reproduce grid-cell click-to-move with the Reinhard command card + 職務権限カード/メンバーリスト tabs — directly 

### [strategy-map] d7c420_ginei04.jpg
- 관측: 640x480 strategic grid/cell view: a large blue elliptical grid ring drawn on the starfield. Inside/near it are clusters of small green block markers (own fleet stacks) and outside are cyan/blue block markers (other fleets). A bright star at top-left. Top-right '神艦パ네ル' panel. Bott
- 진영/색: Green ship-cluster markers (own fleets) inside blue grid circle; cyan/blue ship markers (other) outside; blue HUD
- 텍스트: 神艦パネル · コマンドウインドウ · 旗艦 · 艦艇 · 司令官 · 要塞
- 재현: Reproduce the grid-cell fleet marker layer: green block markers = own fleets, blue/cyan markers = others, drawn on a blue elliptical grid ring — directly relevant to fleet-render marker color/faction work.

### [strategy-map] a3d55c_gi08.jpg
- 관측: A strategic galaxy/sector map: a wide starfield plane with curved travel routes and several named nodes. A line of small green fleet/unit markers stretches across the upper-middle following a route. Labeled waypoints read in katakana. A glowing white ship/comet effect sits center
- 진영/색: Fleet markers along the route are GREEN (own faction); named waypoints/star systems labeled in katakana. Faction shown via marker color (green) and labeled system nodes. Orange/sun glow at right edge.
- 텍스트: バン・グゥ (waypoint name) · ヒューベリオン (Hyperion — a named ship/system) · ブリュンヒルト (Brünhild) · オンラインウィンドウ (Online Window panel header) · Japanese instruction text in the log box (select target / movement gui
- 재현: Reproduce the strategic-map fleet routing: green own-fleet markers strung along curved routes between katakana-labeled system nodes (Brünhild, Hyperion), with a corner radar/minimap, a multi-line message log, and an 'Online Window' slot panel.

### [strategy-map] 6a7297_search.jpg
- 관측: A close-up strip of the strategic galaxy map (likely a hover/search tooltip context). Three grid cells with coordinate labels at corners: 52,12 / 53,12 / 54,12 across the top and 52,13 / 53,13 / 54,13 across the bottom. Left cell: a lime/yellow star icon with green number 9. Midd
- 진영/색: Fleet/unit markers are color-coded: a yellow/lime star icons (star systems) with small green numbers; cyan/blue ship-cluster icons (fleets) labeled with numbers (24, 29); the bright pink/white sphere 
- 텍스트: 52,12 · 53,12 · 54,12 · 52,13 · 53,13 · 54,13
- 재현: Reproduce the strategic-map cell rendering: per-cell coordinate labels (col,row at corners), lime star icons with strength numbers, cyan numbered fleet-cluster markers, and a large glowing landmark (イゼルローン) with a name callout — i.e. the galaxy grid markers + 

### [strategy-map] 74fcc3_strategy.jpg
- 관측: Strategic galaxy map: a blue grid plane receding to a horizon over a dark nebula starfield. Two-three glowing orange star icons placed on grid cells, each with a small Japanese name label (one labeled near top-left, one center labeled クルル/similar, one at far right edge). A small 
- 진영/색: Strategic galaxy view, all-blue grid. Star systems shown as warm yellow/orange glowing suns. No fleet color markers clearly visible. Faction shown via the bottom character portrait/status bar (blue th
- 텍스트: star-system name labels (faint, e.g. near top-left and center) · 宇宙港メニュー (port menu, right panel, inferred) · portrait name + stat bars (bottom-left, illegible at size)
- 재현: Reproduce the strategic-map HUD: receding blue galaxy grid with glowing labeled star systems, plus the bottom command bar (left character portrait + ability bars, center circular console, right port/menu+chat panel) — this is our primary 전략맵 reproduction targe

### [strategy-map] 976091_map.jpg
- 관측: A small framed mini-map / grid-selection panel, not the full-screen galaxy. The top has a chrome HUD bar with three round buttons; the center one reads 'X.Y' (coordinate readout). Below is a black rectangular grid filled with small white star dots. Cells are rendered as a regular
- 진영/색: Dark navy grid panel framed in cyan/steel-blue chrome bezel; starfield is white dots scattered across cells; one cell highlighted by a small YELLOW square outline (selected/cursor cell). Two lighter c
- 텍스트: X.Y
- 재현: Reproduce the strategic grid viewport as a framed panel with an X.Y coordinate readout in the top chrome bar, white star dots per cell, terrain-shaded columns, and a yellow square cursor marking the selected cell.

### [strategy-map] cc01e5_warp.jpg
- 관측: A full strategic-map warp/move planning view. The galaxy grid shows per-cell coordinate pairs as small white numbers (e.g. '19, 10', '20, 10', '21, 10', '20, 14', '21, 14'). A bright white sun/star glows at center-left with a cyan range-circle around it. A lighter-blue region of 
- 진영/색: Full-screen blue starmap, brighter cyan-blue near the star with translucent cloud/nebula at edges. The reachable-range area is rendered as a lighter blue tinted block of cells; a thin cyan CIRCLE (ran
- 텍스트: 150 LY · 19, 10 · 20, 10 · 21, 10 · 20, 14 · 21, 14
- 재현: Reproduce warp planning on the strategic map: draw a cyan range ring + lighter-tinted reachable cells around the origin star, show each cell's 'x, y' coordinate label, and display the warp distance as 'NNN LY' with an arrow from the fleet marker.

### [strategy-map] f84aa5_return.jpg
- 관측: A close-up of the strategic map showing fleet and star markers on the grid. Cells labeled with coordinates '19, 14' / '20, 14' / '21,...' top row and '19, 15' / '20, 15' bottom row. In cell ~(19,14) sits a bright GREEN pentagon fleet marker with a white '1' tag (fleet id / count)
- 진영/색: Dark blue starfield grid. A FLEET marker rendered as a bright GREEN pentagon/star glyph with a small white tag '1' beside it (own/ally fleet color = green). A star system rendered as a glowing orange/
- 텍스트: 19, 14 · 20, 14 · 19, 15 · 20, 15 · 4354 · ケビム
- 재현: Reproduce strategic-map markers: own/ally fleets as GREEN pentagon glyphs with an id/count tag; star systems as glowing orange suns with a numeric value (e.g. population 4354) and a katakana name callout. Fleet color (green = friendly) is the faction/ownership

### [world-map] 30a172_20040427162045_6.jpg
- 관측: A planet-centric view: one large detailed planet fills the center, encircled by a luminous blue orbital ring (orbit/approach grid). A small fleet with a green ID marker hovers over the planet surface area. Upper-left has a small inset minimap/thumbnail (nebula). Top-right standar
- 진영/색: A single large textured planet (gray-blue cratered world) centered with a glowing blue orbital ring; a small green-marked fleet/unit sits on the planet face. Green marker = friendly fleet at the plane
- 재현: Reproduce planet/orbit approach view: large textured planet + glowing blue orbital ring + green friendly fleet marker, with inset minimap (upper-left) and full blue HUD.

### [command-window] 501271_ginei05.jpg
- 관측: 640x480 close-up of a large grey-green capital ship (Allied battleship, hull number 14483 visible) floating in starfield. Top-right is a vertical 神艦パネル (ship status panel) with five horizontal gauge bars each reading 50, plus a circular blue radial/compass control with a 0 readou
- 진영/색: Faction shown by green diamond/star markers floating in space near friendly ships (allied fleet markers are green). Selected target 'ヤン' (Yang) labeled with a green dot marker at top. A small enemy/ot
- 텍스트: 神艦パネル · ヤン · 50 (x5 gauges) · 全体 · 艦隊 · 同陣営
- 재현: Ship-status panel (神艦パネル) with 5 gauges + radial compass on top-right; friendly fleet shown as GREEN diamond markers; reproduce the 全体/艦隊/同陣営 list-pane tabs and the 旗艦/艦艇/同司令官/要塞 command column.

### [command-window] 50837d_gin12.gif
- 관측: Very small (~160px) thumbnail of a space scene: a grey capital ship with long blue engine/motion trails crossing the frame against a reddish-brown nebula. Blue HUD framing on all sides — top-right shows a status panel block, bottom-right a command icon grid, bottom-left a blue pa
- 진영/색: Thumbnail too small to read faction colors clearly; one ship at center is white/grey, blue motion/engine trails extend from ships. Same blue HUD theme.
- 재현: Thumbnail of the in-space command-window HUD (status panel top-right, icon grid bottom-right, log panel bottom-left); same layout as the full-size ginei shots — use larger versions for detail.

### [command-window] 7c6ba2_ginei06.jpg
- 관측: 640x480 close-up of a sleek RED capital ship (Imperial) with bright white engine/thruster glows fore and aft, against blue nebula starfield. Label キルヒアイス (Kircheis) with a green dot marker at center-left. Top-right is the 神艦パネル ship-status panel: 5 gauge bars each =50 plus the ci
- 진영/색: The featured ship is RED-hulled — an Imperial cruiser (red = Kircheis's ship color; label キルヒアイス = Kircheis, Empire). Faction shown by red hull + commander-name label with green ID dot.
- 텍스트: 神艦パネル · キルヒアイス · 50 (x5) · 0 · 全体 · 艦隊
- 재현: Imperial ship rendered with RED hull (Kircheis); friendly commander labeled with name + GREEN ID dot; reproduce 神艦パネル (5 gauges=50 + radial compass control) top-right and the standard command HUD.

### [command-window] 8f8a73_gin12.jpg
- 관측: 960x720 higher-res debug build. Two Imperial capital ships traveling on bright blue warp beams over a brown/tan nebula: ヨーツンハイム (left, blocky grey) and ブリュンヒルト (right, the iconic white Brünhild), each with a green health bar. Concentric blue circle 'sensor range/grid' rings drawn
- 진영/색: Two named ships: ヨーツンハイム (Jötunheim) grey ship with GREEN health bar (Imperial), and ブリュンヒルト (Brünhild) Reinhard's silver-white flagship with GREEN health bar (Imperial). Both friendly = green bars. F
- 텍스트: ヨーツンハイム · ブリュンヒルト · FrameRate=11.831985[frame/sec] · (15, 0) · 50 · 51
- 재현: Higher-res debug build showing concentric sensor-range/movement rings around each ship + green health bars + named flagships (ブリュンヒルト the white flagship); reproduce the per-ship range-ring overlay and ship-name+green-bar labeling.

### [command-window] b3dc18_ginei03.jpg
- 관측: Very small (~160px) thumbnail: a grey capital ship with long blue engine/motion trails over a reddish-brown nebula, with the standard blue command HUD framing — status panel top-right, command icon grid bottom-right, blue log panel bottom-left. A faint commander label may be pres
- 진영/색: Thumbnail too small to read; grey/white ship with blue engine trails, standard blue HUD. Faction not distinguishable at this size.
- 재현: Thumbnail of the standard in-space command HUD (status panel + icon grid + log panel) with blue engine-trail VFX; fetch full-size for legible labels.

### [command-window] b645ef_gin07.gif
- 관측: Very small (~160px) thumbnail: two grey/silver ships against starfield with bright blue weapon/engine beams between them. Standard blue command HUD framing — status block top-right, command icon grid bottom-right, blue panel bottom-left. Too small to read any text.
- 진영/색: Thumbnail too small; grey/silver ship near another ship with blue beams, standard blue HUD. Faction not distinguishable.
- 재현: Thumbnail of two ships exchanging blue beam fire under the standard command HUD; same layout family — use full-size for detail.

### [command-window] 318cd7_captain.jpg
- 관측: Expansion of the 艦長 (captain) duty card showing its command set. Top bar: 艦長 (left) and 職務 / 功績ポイント (duty / merit points) labels (right). A description line: 各指揮官が有する乗艦に対する指揮権。('the command authority each commander holds over their boarded ship'). Below, a grid of blue command bu
- 진영/색: All-blue command panel; no faction color shown (role command palette).
- 텍스트: 艦長 · 職務 · 功績ポイント · 各指揮官が有する乗艦に対する指揮権。 · ワープ航行 · 燃料補給
- 재현: Reproduce the 艦長 command window: header (role + 功績ポイント), one-line authority description, and a 3-column action button grid (ワープ航行/燃料補給/寄港/航宙訓練/戦略索敵/出港/完全修理) — this is the en004-style command-window opened from a duty role.

### [command-window] 8dabea_compnel2.jpg
- 관측: A コマンドウィンドウ (command window) panel. Title bar top-left: コマンドウィンドウ, with a down-arrow (collapse) button top-right. Left area: three blue unit/ship-class icons (angular ship silhouettes), each with a small green numeric badge (looks like 200) in the corner. Right side: a vertical s
- 진영/색: All-blue command window; unit icons are blue ship silhouettes with small green count badges (e.g. '200'). No faction-name text; faction implied by blue theme.
- 텍스트: コマンドウィンドウ · 旗艦 · 艦艇 · 司令官 · 要塞 · 200 (unit count badges)
- 재현: Reproduce the コマンドウィンドウ: collapsible titled panel with a row of selectable unit-class icons (with count badges) on the left and 旗艦/艦艇/司令官/要塞 category tabs on the right — the unit-selection step before issuing commands (the C002 target's command window).

### [command-window] c8858b_compnel1.jpg
- 관측: THE command window (コマンドウィンドウ) — this is the C002 target. Title bar top-left reads 'コマンドウィンドウ' over a horizontal blue gradient header with a small down-arrow / collapse tab at top-right. Main area is a grid of command icon tiles: row1 has ~6 ship/order glyphs (move, attack, forma
- 진영/색: Steel-blue / cyan UI. Title bar gradient blue. Icon grid tiles are grey-blue with cyan glyphs. Right-side category buttons are darker blue with light text. No faction color shown (this is a player com
- 텍스트: コマンドウィンドウ · 旗艦 · 艦艇 · 司令官 · 要塞
- 재현: C002 TARGET: reproduce the コマンドウィンドウ as a titled panel with a left icon-grid of unit commands and a right vertical tab column (旗艦/艦艇/司令官/要塞) that swaps the command set; opened by left-clicking a selected unit. This is the panel whose enqueue/dequeue (event-9 /

### [command-window] d1e080_compnel3.jpg
- 관측: A second STATE of the same コマンドウィンドウ (command window), showing a DIFFERENT category's command set — far fewer commands. Title bar top-left 'コマンドウィンドウ' with the down-arrow collapse tab top-right. The icon grid now shows only ~3 command tiles in the top-left (group/move/escort-styl
- 진영/색: Same steel-blue / cyan command-window theme as compnel1. Title gradient blue, icon tiles grey-blue, right tabs darker blue with light text.
- 텍스트: コマンドウィンドウ · 旗艦 · 艦艇 · 司令官 · 要塞
- 재현: Confirms the コマンドウィンドウ right tabs (旗艦/艦艇/司令官/要塞) swap the available command icon set; some categories expose only a handful of commands. Reproduce per-tab command palettes, not a single fixed grid.

### [duty-card] 7a71e3_ginei02.jpg
- 관측: An in-facility command-conference screen. Upper 2/3 shows a dark throne-room/bridge interior with floating disembodied character portrait HEADS arranged in a cluster, each labeled in katakana: メックリンガー, シュタインメッツ, ミッターマイヤー, ロイエンタール, ケンプ, ビッテンフェルト, ホフマイスター, ワーレン (Mecklinger, Steinme
- 진영/색: Imperial command meeting (会議). All portrait heads are Imperial admirals (帝国). The detailed full-color portrait at bottom-left is ローエングラム元帥 (Reinhard, Empire). Faction implied by roster, not by color m
- 텍스트: 職務権限カード · メンバーリスト · ローエングラム元帥 · 第1近衛艦隊司令官 · 体力 · PCP
- 재현: Command-conference / duty-card screen: reproduce the 職務権限カード(duty-authority card) + メンバーリスト tab pair, the floating named portrait-head roster, the bottom character-card (portrait+rank+体力/PCP/統率/政治 stats), central strategic minimap, and stardate bar — this is t

### [duty-card] en011.jpg
- 관측: JP-build STRATEGIC MAP with the DUTY/AUTHORITY CARD panel open on the right (職務権限カード). Left/center: galaxy region with several named colored stars and numeric values (73000, 8944, 38204, 11897, 12000, 500-LY), gold elliptical orbit paths, a fleet near 'ヴルデ…'. Right panel '職務権限カード
- 진영/색: Imperial context (帝国軍 text). Strategic-map background star markers in distinct colors: orange/yellow stars (タナトス 73000, 38204, 12000), red star (リオ・ヴルデ), blue central star; gold orbit rings. A red exp
- 텍스트: 職務権限カード · 所持枚数 13枚 · 軍務尚書 · 移動 · 作戦計画 · 退役
- 재현: ★Reproduce the DUTY/AUTHORITY CARD (職務権限カード) panel: a 職務 list + selected-post description + 3-column grid of 24 duty-action buttons (移動/作戦計画/任命/昇進/罷免/反乱/亡命…), wired alongside the strategic galaxy map, bottom character status bar (8 abilities, all-99 sample) an

### [duty-card] 140660_card.jpg
- 관측: A 職務権限カード (duty/authority permission card) panel. Top title bar: 職務権限カード. A 職務 (duty) section header, then three duty rows each with a right-side 職務 tag button: 艦長 (ship captain), [第12艦隊] 艦隊参謀 (12th Fleet staff officer), 個人 (personal/individual). Below is a 命令/提案 (orders/proposal
- 진영/색: All-blue card UI; no faction color/marker (this is an administrative duty/permission card, faction-neutral).
- 텍스트: 職務権限カード · 職務 · 艦長 · [第12艦隊] 艦隊参謀 · 個人 · 命令/提案
- 재현: Reproduce the 職務権限カード duty-card: stacked duty-role rows (艦長 / fleet-staff / 個人) selecting which role's command set is active, with 命令/提案 and 同スポットキャラクター sections — the role picker that gates which command window opens.

### [duty-card] e80459_personal.jpg
- 관측: The 個人 (personal) duty/action card panel. Top has three section labels/tabs: 個人 (personal, active), 職務 (duty/post), 功績ポイント (merit points). A large empty white text/description box sits below the header. Then a grid of glossy blue action BUTTONS (the duty-card actions), 4 rows: ro
- 진영/색: Light steel-blue panel. Header tabs in dark blue. The action buttons are glossy BLUE rounded rectangles with white Japanese labels. No faction color (personal action menu).
- 텍스트: 個人 · 職務 · 功績ポイント · 遠距離移動 · 近距離移動 · 退役
- 재현: Reproduce the 個人 duty-card: tabs (個人/職務/功績ポイント) over a description box and a grid of blue action buttons. Actions include 遠距離/近距離移動, 退役, 志願, 亡命, 会見, 叛意, 諜議, 説得, 叛乱, 参加, 受講, 兵棋講習, 資金投入 — these are the personal interaction verbs (説得/叛乱 = the dynamic-faction / co

### [base-panel] 8c179d_ginei04.jpg
- 관측: 640x480 view of a large dark Imperial planet/moon (heavy cloud cover, blue atmospheric rim glow, a bright blue city-light/sun spot) with a blue orbital ring. A green star marker labeled ヴェンフリート3 floats above; a small cluster of 4-5 friendly ship icons labeled オフレッサー sits on the o
- 진영/색: Friendly fleet shown as GREEN markers: ヴェンフリート3 (Wendfried 3) green star marker, plus a cluster of small ship icons labeled オフレッサー (Ofresser) near the planet equator. A dark Imperial planet/moon domin
- 텍스트: DATE 47 18 18 50 · 検艦パネル · ヴェンフリート3 · オフレッサー · もとのコマンドウインドウから現在使用可能な命令をクリックしてください · バルーンヘルプが表示されます
- 재현: Orbit/base view: planet with blue orbital ring + friendly fleet (green markers ヴェンフリート3/オフレッサー) parked on the ring; balloon-help text box explains clicking command-window orders — reproduce planet-orbit fleet placement + balloon-help tooltip on the command win

### [base-panel] 0a2715_stay.jpg
- 관측: A 拠点選択 (base/stronghold selection) dialog. Title bar top-left reads 拠点選択. Left column header 選択 with a 星系順 (by star-system order) dropdown and a list of selectable planets: 惑星カッシナ, 惑星パブラ (or similar), 惑星アゥディン, 惑星パラス — the currently selected one highlighted. Right side is 情報 (info
- 진영/색: Faction is shown EXPLICITLY as text: 支配陣営名 = 自由惑星同盟 (Free Planet Alliance). Statesman/garrison-commander fields are present but blank (dashes). All-blue panel theme; no fleet-color cue here.
- 텍스트: 拠点選択 · 選択 · 星系順 · 惑星カッシナ · 惑星アゥディン · 惑星パラス
- 재현: Reproduce the 拠点選択/stay base-info panel: left planet list (sortable 星系順) + right info pane that DOES display 支配陣営名/統治者名/守備隊長名 plus population, facility counts and stockpiles — confirming faction ownership IS surfaced in this panel (per the channel-B 'absent' c

### [tactical-map] c22849_20040123223724_6.jpg
- 관측: Top-down tactical combat view on a dark starfield. Left side has a cluster of small GREEN ship markers; the center/right has multiple RED ship markers spread out — a classic two-color force-vs-force tactical layout. Top-right corner has a blue minimap/radar panel and info readout
- 진영/색: Clear faction-by-color combat markers: GREEN ship icons (left cluster, ~3) = friendly/ally, RED ship icons (center, ~6 scattered) = enemy. Markers are small arrowhead/ship shapes. HUD blue.
- 재현: Reproduce the tactical-map fleet rendering: GREEN markers = own/friendly, RED markers = enemy, on a top-down starfield with a top-right radar panel and bottom command grid. This is the canonical fleet-color faction scheme (green vs red).

### [tactical-map] 6749be_en010.jpg
- 관측: Tactical/battle map (3D space combat view). Center-right: a friendly capital ship firing (white muzzle flash) with green HP bars over multiple friendly ship clusters; a single ship at upper-right (ケーニヒ・ティ...) and one near center have a RED target/lock indicator. Several blue poin
- 진영/색: Friendly fleet HP bars GREEN; one enemy ship has a RED target marker; faction shown by marker color
- 텍스트: ( 15, 0) · FrameRate=14.591439[frame/sec] · リオ・グランデ · ベルガモン · バルバロッサ · ヒューベリオン
- 재현: Tactical-map combat HUD to reproduce: green HP bars on friendly fleets, red lock marker on the targeted enemy, top-left radar + top-right ship-status panel, bottom-right command-window icon grid; faction/ownership is conveyed by marker/HP-bar color.

### [tactical-map] 7912eb_uu1.jpg
- 관측: Tactical/battle viewport, high resolution, close on the Empire flagship ブリュンヒルト (Brünhild) — a large pale-white wedge-shaped capital ship banking across a blue/teal nebula with light bloom. Green HP bars float above the flagship and two other ships (one labeled ヨーツン at upper-left
- 진영/색: Friendly ship HP bars GREEN; the hero flagship ブリュンヒルト (Brünhild, Empire flagship) is white
- 텍스트: ブリュンヒルト · ヨーツン (16…0) · ケーニヒ・ティ… · FrameRate=14.917952[frame/sec] · 50 / 51 / 48 · GUN ENGINE NAVI SENSOR
- 재현: Tactical-map HUD with the command-window side-tabs 索敵/艦艇/司令官/要塞 explicitly labeled — reproduce these four command-window category tabs plus green HP bars and the top radar/ship-status panels; the Empire flagship is rendered white.

### [tactical-map] ee6e53_en008.jpg
- 관측: Tactical/battle viewport mid-combat: many friendly fleet point-markers with GREEN HP bars spread across a starfield with a brown planet upper-right; a dense fan of BLUE beam-fire lines converges from the right toward the lower-left (a barrage). One short RED bar near center (司令官…
- 진영/색: Friendly fleet HP bars GREEN; beams blue; one red HP bar = enemy/damaged near center; faction by marker color
- 텍스트: ( 15, 0) · FrameRate=9.0…[frame/sec] · 司令官 (red label near center)
- 재현: Tactical-map fleet-engagement HUD to reproduce: massed green-HP friendly markers vs red enemy marker, converging blue beam-fire lines, radar + ship-status panels, command-window icon grid; ownership shown via green vs red HP-bar/marker color.

### [tactical-map] 4aa325_gin02.jpg
- 관측: Top-down / tactical battle-map view. Fleet units are drawn as small blocky rectangular sprites in solid team colors over a faint grid-lined starfield: a GREEN unit top-center, a large cluster of RED units swarming center/right, and a left cluster mixing GREEN and one BLUE block b
- 진영/색: Units rendered as blocky icons in distinct TEAM COLORS: GREEN (top + left cluster — friendly), RED (center swarm — enemy), and one BLUE block (left, near planet). Clear 3-color faction encoding. Blue 
- 텍스트: レーダー · コマンドウインドウ · 旗艦 · 艦隊 · 司令官 · 要塞
- 재현: KEY faction-color evidence: tactical map renders units as solid colored blocks — GREEN = friendly, RED = enemy, BLUE = third side — over a grid. Reproduce colored-block unit markers keyed by faction/team, plus the standard radar/status/command/chat HUD frame.

### [tactical-map] 1f9304_gi03.jpg
- 관측: A 3D tactical/fleet view in space. Several capital ships are shown at angles against a starfield with concentric circular grid rings on a plane below them (range/movement circles). Each ship has a small green horizontal status bar floating above it and a tiny label of Japanese/te
- 진영/색: Friendly ships rendered with green status bars/markers above each vessel; bright cyan/blue movement beams (laser-like trajectory lines) connect units. No red enemy units visible — appears to be own-fa
- 텍스트: small floating unit labels (illegible at this resolution)
- 재현: Reproduce the 3D tactical view: ships on a plane with concentric movement-range rings, per-ship floating green HP/status bars, cyan movement/fire trajectory beams, and the corner HUD (numeric readout, compass/nav widget, command icon grid).

### [tactical-map] 4cdb5e_gi05.jpg
- 관측: Same 3D tactical engagement view as gi03 but mid-combat. A prominent red-hulled warship sits upper-left with floating text labels beside it; below it grey friendly ships sit on the movement-circle plane, each with a green status bar above. A bright cyan beam/wake runs horizontall
- 진영/색: A large RED capital ship (enemy/opposing faction) at upper-left with a red-tinted hull, vs. grey/white friendly ships lower-center each carrying GREEN status bars. Faction is conveyed by hull color (r
- 텍스트: floating ship/unit labels with numbers (illegible at this resolution)
- 재현: Reproduce enemy-vs-own distinction by HULL COLOR (red enemy vs grey own) plus green friendly status bars, within the same tactical ring-plane view and corner HUD.

### [tactical-map] 0285b9_tactics.jpg
- 관측: Full tactical-map (space combat) HUD over a starfield/nebula background. Top-left: circular blue radar/scope panel with a globe-grid and DATE/time readout. Top-right: a symmetrical blue command/formation panel with a central round 4-direction (up/down/left/right) directional cont
- 진영/색: All-blue HUD chrome; selected ship rendered as a green/teal capital-ship hull with a glowing white engine/explosion flare and a cyan selection ellipse beneath it. No explicit faction name shown here; 
- 텍스트: DATE / time readout (top-left, partly legible) · コマンドウィンドウ (command window title, bottom-right, inferred from sister image) · unit name tag over ship (illegible at this size)
- 재현: Reproduce the in-combat tactical HUD: corner panels (radar TL, formation/4-way control TR, scrolling battle log BL, command-icon grid BR) framing a central 3D ship viewport with selection ellipse + floating unit-status bars.

### [tactical-map] 0572d0_tactics2.jpg
- 관측: Same tactical-map HUD layout as the previous image but zoomed out / no ship model in close-up. The same four corner panels are present (radar TL, formation/4-way control TR, message log BL, command-icon grid BR). The center of the field shows a large thin blue circle (likely a mo
- 진영/색: All-blue HUD. The selected/targeted unit is a single small bright-blue point marker at the center of a large blue movement/range circle. Faction shown only via blue HUD theme.
- 텍스트: radar DATE/time line (TL, faint) · small unit label near center dot (illegible)
- 재현: Reproduce the zoomed-out tactical view: persistent corner HUD panels plus a center movement/range circle around a point-unit, over a yellow sector-grid + nebula starfield.

### [fleet-battle] 08a50b_20040123223724_9.jpg
- 관측: A space fleet battle in deep starfield. A cluster of capital ships sits center-frame with multiple orange/amber motion or fire-trajectory lines fanning outward toward the upper screen, suggesting ships maneuvering or firing in a coordinated arc. Lower-left has the standard blue m
- 진영/색: Friendly fleet markers/ships rendered with warm orange/amber engine glow and orange targeting/movement lines; enemy or neutral elements toward upper area. Faction shown by ship sprite color + orange d
- 재현: Reproduce fleet-battle HUD: central ship formation with orange movement/fire-vector lines, blue status panel (lower-left) + command grid (lower-right).

### [fleet-battle] 15ffc2_20040123223724_1.jpg
- 관측: Close-up cinematic of a single large green-gray capital warship seen from front-left, prow pointing toward lower-left, set against a blue nebula starfield. A small planet sits lower-left. Standard LOGH VII HUD frame: lower-left blue status panel, lower-right blue command grid pan
- 진영/색: Large green-gray capital ship (Imperial-style cruiser hull) center-frame; red dot/light accents on hull. Faction conveyed by ship model color (green-gray Imperial vessel) rather than an overlay marker
- 재현: Reproduce single-ship cinematic framing in fleet view (camera close on one capital ship) with full blue HUD chrome (radar top-right, status lower-left, command grid lower-right).

### [fleet-battle] 16ac59_20040123223724_3.jpg
- 관측: A wide space-battle overview with many small ship sprites scattered across the starfield, several showing green target/identifier markers (green dots and brackets) indicating one faction's fleets, opposed by other ships toward center. Top-right has the blue radar/minimap circle a
- 진영/색: Two-sided engagement: GREEN markers/ships on one side, lighter/blue-white ships on the other. Green vs blue-white sprite coloring distinguishes the two fleets/factions across the battlefield.
- 재현: Reproduce multi-fleet tactical overview with per-unit GREEN selection/ID markers over distant ship sprites — confirms green is used as a fleet/faction identifier color in battle.

### [fleet-battle] 1b0d4e_20040427162045_4.jpg
- 관측: Cinematic close-up of one long, dark gray/brown capital warship spanning the frame diagonally (prow toward lower-left), against a dark starfield with subtle blue running-light accents along the hull. Standard LOGH VII HUD: lower-left blue status panel and lower-right blue command
- 진영/색: Single dark gray-brown elongated capital ship (no clear faction tint); HUD is standard blue. Faction not indicated by overlay here — pure ship beauty shot.
- 재현: Reproduce detailed capital-ship 3D model rendering (long hull, hull running-lights) framed by the blue combat HUD — a ship-showcase camera angle.

### [fleet-battle] 24be39_20030927063935_8.jpg
- 관측: A broad fleet engagement: numerous ship sprites spread across a hazy nebula starfield, many tagged with green ID brackets/dots marking individual units of a fleet. A large planet/celestial body sits center-right background. Top-right shows the blue radar/minimap circle plus stack
- 진영/색: Clear two-faction battle: GREEN markers/ships (one side) vs scattered ships with green and other-colored ID brackets. Green unit brackets dominate as the friendly/selected fleet identifier.
- 재현: Reproduce wide fleet-battle situational view: many small ships with green per-unit ID brackets over a nebula+planet backdrop, full blue HUD — green = fleet/unit marker.

### [fleet-battle] 3205fd_20040427162045_2.jpg
- 관측: A combat moment dominated by several long bright blue beam/weapon-fire lines streaking across the battlefield from lower-left toward upper-right, against a dark starfield. Small ship sprites are present. Top-right blue radar/minimap circle + info panels; lower-left blue status pa
- 진영/색: Long blue energy/beam lines (weapon fire) crossing the frame; ships small/distant. Blue beams = weapon fire tracers. Faction identity not strongly marked by color here beyond ship sprites.
- 재현: Reproduce beam-weapon fire VFX: long blue beam tracer lines across the battlefield during fleet combat, with full blue HUD chrome.

### [fleet-battle] 3761b0_20030924222608_1.jpg
- 관측: A fleet maneuver/combat scene: a group of ships moving toward upper-left with green directional/heading lines projected ahead of them, plus blue beam tracers crossing the field. Reddish-brown nebula/dust at center-right with a faint celestial body. Top-right blue radar/minimap + 
- 진영/색: Green movement/heading lines and green-tinted ships (one fleet) advancing; blue energy beam tracers also present. Green = friendly fleet heading/markers; blue beams = weapon fire.
- 재현: Reproduce fleet movement-order rendering: green heading/vector lines projected ahead of a moving fleet during combat — green encodes friendly movement/identity.

### [fleet-battle] 3da49d_20030924222608_9.jpg
- 관측: Heavy beam-fire moment: several intense blue beam lines streak diagonally across a dark starfield, clearly weapon exchanges between fleets. Top-right blue radar/minimap circle + info panels; lower-left blue status panel; lower-right blue command grid with cell buttons. Dramatic c
- 진영/색: Multiple bright blue beam/weapon-fire lines converging across the frame. Blue = weapon beams. Ships small; faction shown by sprite + (faint) markers, beams are the focus.
- 재현: Reproduce concentrated beam-fire VFX (multiple converging blue beams) during fleet battle with full blue HUD — same beam tracer system as 3205fd.

### [fleet-battle] 3f626f_20040427162045_3.jpg
- 관측: A close combat view: a capital ship center-left wrapped in a bright blue energy halo/shield burst (impact or shield flare) with red light accents, set beside a large gray cratered planet/moon on the right. Top-right blue radar/minimap + info panels; lower-left has a status panel 
- 진영/색: Center ship rendered with a bright blue energy shield/glow and red accent lights; a large cratered planet/moon at right. Blue glow = shield/energy effect; red = hull/marker accents. HUD blue.
- 재현: Reproduce ship shield/impact flare VFX (blue energy halo + red accents) at close range near a planet body, framed by the blue combat HUD.

### [fleet-battle] 4ee847_20030927063935_7.jpg
- 관측: Wide fleet engagement over a reddish-brown nebula/dust field with a faint planet center-right. Several ships move toward the center; the nearer fleet shows green ID brackets and green heading lines, opposed by other ships. Top-right blue radar/minimap circle + stacked info panels
- 진영/색: Two fleets: GREEN-marked ships (one faction, with green ID brackets/heading lines) advancing toward center; opposing ships lighter/blue-white. Green vs blue-white sprite/marker coloring distinguishes 
- 재현: Reproduce two-fleet battlefield view with green friendly markers/heading lines vs opposing ships over a nebula backdrop — reinforces green as the friendly fleet identifier color.

### [fleet-battle] 5670c9_20040123223724_4.jpg
- 관측: Tactical space-combat view from a high angle. A large bright cyan/teal ELLIPSE (movement/range ring or grid orbit) dominates the center against a dark blue starfield. Around the ring are several small green chevron markers (fleet/ship icons) plus scattered light dots. Bottom of t
- 진영/색: Allied/own fleet markers rendered as GREEN chevron/triangle icons; enemy or contacts shown as small bright dots. Faction is conveyed purely by marker COLOR (green = friendly), not by text labels.
- 재현: Reproduce the tactical/fleet view where own fleets are GREEN chevron markers and a large cyan elliptical movement/range ring is drawn over the starfield, with the blue command-window HUD docked along the bottom.

### [fleet-battle] 613ca1_20030929024654.jpg
- 관측: Active space fleet battle. Multiple capital ships scattered across a reddish-purple nebula starfield, with a large orange explosion/fireball erupting at center-right (a ship being hit or destroyed). Bottom edge shows the blue HUD: a small left panel and a minimap/grid block towar
- 진영/색: Mid-combat; ship hulls are dark grey/blue. No legible faction text. A bright orange/yellow explosion fireball marks a hit/destroyed ship. Friendly/enemy distinction would be by marker color on the min
- 재현: Reproduce the in-battle explosion/destruction VFX (orange fireball on hit) over a nebula backdrop with capital ships, confirming combat damage feedback ties to the 0x426 sink/destruction event.

### [fleet-battle] 6412a5_20030924222608_5.jpg
- 관측: Cinematic fleet-battle camera. A big red-hulled capital ship fills the upper-left foreground; below it two grey warships fire long bright blue/cyan beam weapons (lance/beam attack) streaking to the right across the starfield. Standard blue LOGH VII HUD docked at bottom: left log 
- 진영/색: Foreground hero ship is a large RED/crimson-hulled capital ship (likely Empire flagship styling). Beam-firing ships emit long CYAN/blue beam weapons. Faction shown by hull color (red Empire vs grey sh
- 재현: Reproduce the beam-weapon firing VFX (long cyan beams) and the red Empire-flagship hull look in the cinematic fleet-battle view, with the bottom command-window HUD present.

### [fleet-battle] 64cd06_20040123223724_7.jpg
- 관측: Space fleet battle at the moment of a hit: a large orange/yellow fireball explosion mid-frame with a warship beside it, set against a warm orange-tinted nebula starfield. A grey capital ship runs along the lower-left. Bottom-center shows a small blue HUD panel with a grid (minima
- 진영/색: Combat with a large orange explosion. Ship hulls grey/dark. No legible faction text; a small blue HUD/grid panel sits bottom-center-right. Faction by marker color only.
- 재현: Reproduce the ship-destruction explosion VFX during fleet combat against a nebula backdrop; same hit/sink feedback as the other battle shots.

### [fleet-battle] 690443_20030927063935_9.jpg
- 관측: Near-duplicate of image 3 (6412a5): cinematic fleet battle with a big red-hulled capital ship in the upper-left foreground and grey warships firing long blue/cyan beam weapons toward the right. Blue LOGH VII HUD docked along the bottom (left log panel + right command-button grid)
- 진영/색: Same composition as 6412a5: large RED/crimson capital ship foreground + grey warships firing CYAN beams. Faction by hull color (red) and HUD marker color.
- 재현: Same as 6412a5 — beam-weapon firing pass with red flagship and blue beams; confirms this is a repeated press capture of the fleet-battle beam VFX with the command HUD.

### [fleet-battle] 76d070_20040227203229.jpg
- 관측: Close-up cinematic view of one large grey-blue capital ship cruising through a red/magenta nebula, with two small escorting craft to its right. A small dark UI box sits at top-left (likely a target/selection readout). Blue HUD elements line the left and bottom edges. Small thumbn
- 진영/색: Single large grey/blue capital ship in close-up; two small escort ships nearby. Top-left has a small dark targeting/status box. No faction text legible; HUD panels along left and bottom edges.
- 재현: Reproduce the close-up ship-camera framing of a selected capital ship with its target/status box at top-left, over a nebula backdrop.

### [fleet-battle] 76d502_20040218211020.jpg
- 관측: Dim, blue-toned space view: a single long grey capital ship runs across the center horizontally, with a faint thin range/orbit ring near it and a small bright glowing body at top-left. The blue LOGH VII HUD frame lines the bottom. Dark, low-contrast thumbnail; text unreadable.
- 진영/색: One long grey capital ship centered in a dim blue-teal scene; faint white/blue range circle around it. Top-left small bright object (planet/sun glow). Faction not text-labeled; would be by marker colo
- 재현: Reproduce the calm pre-engagement/cruise view of a single capital ship with a thin faint range ring in a dark blue scene, HUD docked at bottom.

### [fleet-battle] 8ef19d_20030927063935_6.jpg
- 관측: Tactical-overlay fleet view: a grey warship at center fires a long blue beam toward the right; the scene is overlaid with several thin curved teal/green lines (movement paths or grid arcs) and green chevron fleet markers scattered around. Blue LOGH VII HUD docked at bottom (left 
- 진영/색: Own/friendly markers are GREEN chevron icons; multiple thin curved GREEN/teal lines (movement-path or formation lines) connect them. A grey capital ship fires a long blue/cyan beam to the right. Facti
- 재현: Reproduce the tactical fleet view with GREEN friendly chevron markers and thin curved movement/path arcs overlaid on the 3D battle, plus beam VFX — this is the key 'fleet markers + movement lines' reference for our marker-render/own-cell work.

### [fleet-battle] 92f302_20030924222608_4.jpg
- 관측: Wide tactical fleet-battle view showing a large engagement: many small chevron/dot fleet markers (green among them) scattered across a starfield, with a large planet sphere at the right edge and beam/streak effects between groups. Blue LOGH VII HUD: bottom-right command-button gr
- 진영/색: Many small fleet markers spread across the field; visible as small GREEN and possibly other-colored chevrons/dots (a large engagement). A planet sphere sits at right. Faction distinguished by marker c
- 재현: Reproduce a large multi-fleet engagement with many colored chevron markers over a starfield near a planet — shows scale of marker rendering (many units) and faction-by-color at distance.

### [fleet-battle] 98a78d_20030927063935_4.jpg
- 관측: Cinematic fleet-battle close-up: a grey capital ship in the lower-center foreground, with a long bright blue/cyan beam streaking across the upper portion of the screen (a beam-weapon shot). A small dark status box at left edge. Blue LOGH VII HUD with the right-side command-button
- 진영/색: Foreground grey capital ship; a long bright CYAN beam fires from off-left across the top toward the ship (incoming/outgoing beam). No faction text; small left status box. Faction by marker color in HU
- 재현: Reproduce the beam-weapon exchange VFX (long cyan beam across frame) in the cinematic battle camera with the selected-ship status box at the left edge.

### [fleet-battle] 9f37be_20030927063935_5.jpg
- 관측: Cinematic close-up of a selected capital ship (white/grey hull) with a GREEN horizontal bar (status/HP/selection indicator) floating above it, and a small green chevron fleet marker at the upper-left. Background is a purple-blue nebula. Blue LOGH VII HUD docked at bottom (left pa
- 진영/색: Selected grey/white capital ship in foreground with a GREEN horizontal status/health BAR above it (HP or selection bar). A green chevron marker sits to the upper-left. Faction/selection shown by green
- 재현: Reproduce the per-ship floating GREEN status/HP bar above a selected friendly ship plus the green chevron marker — key reference for how unit selection/health is overlaid in the fleet view.

### [fleet-battle] a6b82b_20030924222608_2.jpg
- 관측: Cinematic fleet-battle shot: two grey capital ships in the lower foreground both firing long bright blue/cyan beam weapons that streak in parallel toward the upper-left across the starfield. A small dark status/target box at the left edge. Blue LOGH VII HUD: bottom-right command-
- 진영/색: Two grey capital ships in foreground firing two long parallel CYAN beam weapons to the upper-left. No faction text; small left status readout box. Faction would be by HUD marker color.
- 재현: Reproduce multiple ships firing simultaneous parallel beam volleys (cyan) in the cinematic battle camera — shows concurrent beam-attack VFX and the standard bottom command HUD.

### [fleet-battle] a8c2ea_20030924222608_6.jpg
- 관측: Space fleet-battle cinematic view. A large light-grey/white capital ship sits center-right firing two long blue energy beam volleys diagonally to upper-left. Dark nebula and stars behind. Top-right has a small blue rectangular HUD/minimap panel with a faint emblem; bottom-left ha
- 진영/색: Friendly large white/grey capital ship firing twin blue beams; deep blue starfield/nebula backdrop. No faction-color fleet markers visible at this zoom (close cinematic camera). Blue is the dominant H
- 재현: Reproduce the space fleet-battle HUD: a close cinematic camera on a capital ship with blue beam-fire VFX, a top-right blue minimap panel, and a bottom command-button grid.

### [fleet-battle] b204fd_20040427162045_5.jpg
- 관측: Close-up of one large tan/gold battleship rendered in 3/4 view, center frame, over a dark-blue star/nebula field. Bottom of screen has blue HUD bars: a wide status panel on the left and a denser cluster of small buttons/readouts on the right. No enemy markers visible — this looks
- 진영/색: Single large tan/beige-brown battleship (warm gold hull) centered against blue starfield. Ship hull color is warm tan, contrasting the cooler blue ships in other shots — likely a faction/class distinc
- 재현: Reproduce ship-model rendering with warm tan hull material distinct from blue ships, plus the bottom blue HUD with a wide left status panel and right button cluster.

### [fleet-battle] b2a169_20040213224015.jpg
- 관측: Very small/low-res thumbnail. A row of grey warships in formation runs left-to-right across the lower-center, backlit by a brilliant white-blue starburst/flare on the left side. Dark space at top. A tiny blue HUD panel sits top-left. Image is small and slightly soft, but reads as
- 진영/색: A grey/white fleet line silhouetted against an intense white/blue stellar flare (a sun or exploding star). HUD is blue, very small. Faction not distinguishable at this scale.
- 재현: Reproduce dramatic fleet formation backlit by a bright stellar flare (sun/supernova) with strong bloom — a cinematic combat skybox lighting effect.

### [fleet-battle] d3c7d4_20040123223724_8.jpg
- 관측: Wide space combat view. Several small grey warships in a loose line/formation sit in the upper-center against a dark blue starfield with faint nebula. The bottom third is dominated by blue HUD: a wide left status/log panel and, lower-right, a dense grid of small command buttons a
- 진영/색: Distant grey/white ships in formation over a dark blue nebula. HUD blue. Faction colors not resolvable at this distance; appears to be one side's formation.
- 재현: Reproduce the pulled-back fleet-battle view with multiple small ship models in formation and the full bottom blue HUD (left log/status panel + right command grid).

### [fleet-battle] d5b790_20030924222608_8.jpg
- 관측: Space battle near a large brown/tan celestial body (planet or dust nebula) on the right. Several grey capital ships are spread across the center-right; a small green light/marker is visible mid-frame. Top-right has the blue minimap/info panel; bottom has the blue HUD strip (left 
- 진영/색: Mixed fleet over a brown/tan planet or nebula on the right. Ships are grey/white; one shows a GREEN running/marker light, another area shows faint contrasting tints — consistent with green=friendly hi
- 재현: Reproduce fleet-battle staged over a brown planet/nebula backdrop with green friendly marker lights, top-right minimap, and the bottom blue command HUD.

### [fleet-battle] ecfe7e_20040123223724_2.jpg
- 관측: Close cinematic view of one large grey/blue battleship in 3/4 profile, center frame, over a dark-blue star/nebula field. Top-right has the blue minimap/info panel. Bottom has the blue HUD: wide left status panel and a right command-button grid. Essentially the cool-hull counterpa
- 진영/색: Single large grey/blue-grey battleship (cooler tone) centered over blue starfield. Cool blue-grey hull contrasts the tan ship in b204fd — supports per-faction/class hull coloring. HUD blue.
- 재현: Reproduce ship-inspection/combat camera on a cool blue-grey hulled capital ship (contrast with tan-hulled faction), with top-right minimap and bottom command HUD.

### [fleet-battle] f26143_20040123223724_5.jpg
- 관측: Mid-range space view of two or three grey-teal warships in a tight broadside line across the upper-center, over a dark-blue starfield. Top-right shows a blue info/minimap panel with readouts. Bottom has the blue HUD: a left status panel and a prominent right command-button grid (
- 진영/색: Two-to-three grey/teal warships in close line formation, broadside, over blue starfield. Hulls are grey with teal tint. HUD blue. No distinct red/green markers at this zoom (own formation).
- 재현: Reproduce own-fleet formation view: 2-3 ships in a broadside line with the top-right info panel and a clearly-celled bottom-right command-button grid (the in-battle command window).

### [fleet-battle] fd10b6_20030927063935_1.jpg
- 관측: Space fleet-battle cinematic: a large white/grey capital ship center-right fires two long blue energy beams toward the upper-left across a dark-blue nebula/starfield. Top-right has the blue minimap/info panel with a faint emblem; a faint small-text overlay sits near the top-cente
- 진영/색: Friendly white/grey capital ship firing twin long blue beams (near-identical framing to a8c2ea). Deep blue nebula backdrop. Blue is the beam + HUD color. No resolvable faction markers (cinematic close
- 재현: Reproduce the signature beam-fire combat shot: capital ship firing twin long blue beams across a blue nebula, top-right blue minimap with emblem, bottom command grid — the iconic LOGH VII fleet-battle look.

### [fleet-battle] 023d59_en005.jpg
- 관측: In-world space fleet-battle view. Two large white/grey capital warships (one labeled ヨーツンハイム = Jotunheim, one labeled ブリュンヒルト = Brunhild) plus smaller escort ships, all firing thick parallel blue beam cannons across the frame. Deep starfield/nebula background. Mouse cursor center
- 진영/색: Allied/blue-white capital ships firing intense blue beam weapons; thin green HP bars over each ship hull, no red enemy units visible in frame
- 텍스트: ヨーツンハイム (Jotunheim) · ブリュンヒルト (Brunhild) · ( 15, 0 ) · FrameRate=8.633094[frame/sec]
- 재현: Reproduce the in-battle HUD: top-left radar, top-right 5-bar ship status + circular helm control, bottom command-window icon grid, ship name labels with green HP bars, and blue beam-weapon fire VFX.

### [fleet-battle] 053630_uu2.jpg
- 관측: Wide tactical/fleet-battle view from above looking across a planet's limb (large planet upper-right). Many ships rendered as bright star-burst glints on a grid plane, with curved blue and red selection rings denoting friendly vs hostile fleets. Salvos of missiles/torpedoes (white
- 진영/색: Two opposing fleets shown by colored selection-circle rings on the grid plane: BLUE rings (friendly, right/lower) vs RED rings (enemy, left). Each unit has a green HP bar above its star-burst marker. 
- 텍스트: ベルゲングリッサ (Bergengrisa?) · ケーニヒス・ティーゲル (Konigs Tiger) · 旗艦 · 艦艇 · 司令官 · 要塞
- 재현: Reproduce blue-vs-red fleet selection-ring color coding on the battle grid, missile-salvo trail VFX, and the right-side command buttons 旗艦/艦艇/司令官/要塞 (flagship/ship/commander/fortress).

### [fleet-battle] 0ddd2b_uu1.jpg
- 관측: Close cinematic in-world view of a large white flagship (ブリュンヒルト = Brunhild) banking over a blue nebula plane crossed with faint blue concentric range rings. A second ship (ヨーツンハイム = Jotunheim) at upper-left near a bright star/sun flare. Green HP bars float above ships. Debug 'Fr
- 진영/색: Friendly white/grey capital ship (ブリュンヒルト = Brunhild) in close third-person view, green HP bars; concentric blue selection/range rings on the plane. No enemy red units in frame.
- 텍스트: ブリュンヒルト (Brunhild) · ヨーツンハイム (Jotunheim) · 旗艦 · 艦艇 · 司令官 · 要塞
- 재현: Reproduce close third-person ship-follow camera with blue concentric range rings on the ground plane, green HP bars, and persistent corner HUD (radar / 5-bar status+helm / command grid).

### [fleet-battle] 0e7836_galaxy_00.jpg
- 관측: High-resolution in-world fleet battle. A massive grey warship with bold RED dorsal stripes and red weapon mounts dominates left/center, labeled ク・ホリン (Cu Chulainn). Several green-marker friendly cruisers to the right firing; one labeled marker has a blue range bar. Bright sun len
- 진영/색: Allied (green) vs Imperial: friendly ships marked with GREEN pentagon/star icons + blue label tabs; enemy capital ship is the large grey/green hull with RED stripe accents and red gun mounts. Faction 
- 텍스트: レーダー (radar) · 操艦パネル · コマンドウインドウ (Command Window) · ク・ホリン (Cu Chulainn) · 修理完了しました (Repair complete) · 全体 / 艦隊 / 同陣営
- 재현: High-res canonical battle HUD: labeled レーダー + 操艦パネル + コマンドウインドウ panels, green-pentagon friendly markers with blue bars, red-striped Imperial ship livery, chat scope tabs 全体/艦隊/同陣営 and ship-class buttons 旗艦/艦艇/司令官/要塞; chat input accepts Hangul.

### [fleet-battle] 146cac_en001.jpg
- 관측: Korean-localized fleet battle. Center white flagship 브륀힐트 (Brunhild) banking; a RED warship 바르바롯사 (Barbarossa) lower-right; multiple grey escort ships scattered. Blue purple engine glows. Bottom-left blue chat log shows Korean player banter ('...제국군 최고의 투샷이당..0.0', 'ㅋㅋㅋ', '스샷 한장 
- 진영/색: Mixed-faction engagement: Imperial flagship is the white ship 브륀힐트 (Brunhild, KR transliteration); a RED enemy ship is labeled 바르바롯사 (Barbarossa); blue marker tabs over units. Faction shown by ship hu
- 텍스트: 브륀힐트 (Brunhild, KR) · 바르바롯사 (Barbarossa, KR) · 커맨드 윈도우 (Command Window, KR) · 전체 / 함대 / 동진영 (All/Fleet/Same-faction, KR) · 기함 (flagship) · 제국군 최고의 투샷이당 (KR chat)
- 재현: This is the Netmarble KR localization target: Korean ship names (브륀힐트/바르바롯사), Korean 커맨드 윈도우 + 기함 buttons, chat scope tabs 전체/함대/동진영, and live Korean chat in fleet battle. Faction = white(Imperial flagship) vs red enemy hull.

### [fleet-battle] 35a4bf_gidae-award-image-25.gif
- 관측: Low-res press thumbnail of a Korean-build fleet battle: a white flagship banking center-left, a RED warship to its right, grey escorts, on a starfield. Blue marker labels over ships (too small to read names). Bottom-left blue Korean chat box with a few lines of text and 전체/함대/...
- 진영/색: White Imperial flagship (Brunhild-type) center vs a RED enemy ship at right; faction shown by hull color (white vs red) plus blue marker tabs. KR build (Korean chat log).
- 텍스트: (KR chat lines, too small to transcribe) · 전체/함대 scope tabs (faint)
- 재현: Same KR fleet-battle HUD as en001 (white vs red hull faction cue, Korean chat + command window); low-res, use en001/uu shots for detail.

### [fleet-battle] 4214cc_uu2.jpg
- 관측: Same wide fleet-battle/tactical view as 053630_uu2 (slightly higher contrast crop): ships as star-burst glints across a grid plane below a planet's limb, blue vs red curved selection rings, white missile-salvo trails, a red nebula/explosion burst. Labels ベルゲングリッサ and ケーニヒス・ティーゲル.
- 진영/색: Identical scene to 053630_uu2: BLUE friendly rings vs RED enemy rings on the grid plane, green HP bars per unit. Faction = ring color.
- 텍스트: ベルゲングリッサ · ケーニヒス・ティーゲル · ( 15, 0 ) · FrameRate=9.168704[frame/sec] · 旗艦/艦艇/司令官/要塞
- 재현: Duplicate of 053630_uu2 (JP build): blue-vs-red fleet selection-ring faction coding, missile salvo VFX, command buttons 旗艦/艦艇/司令官/要塞.

### [fleet-battle] 431f46_uu1.jpg
- 관측: Higher-res version of 0ddd2b_uu1: close third-person view of the white flagship ブリュンヒルト (Brunhild) banking over a blue nebula plane with faint blue concentric range rings; ヨーツンハイム (Jotunheim) ship near a bright star flare upper-left. Green HP bars over ships. Right side now legib
- 진영/색: Friendly white flagship ブリュンヒルト (Brunhild) close-up, green HP bars, blue concentric range rings; ヨーツンハイム (Jotunheim) escort upper-left. No enemy red in frame. JP build.
- 텍스트: ブリュンヒルト (Brunhild) · ヨーツンハイム (Jotunheim) · ENGINE (status bar label) · 50 / 51 (stat values) · 旗艦/艦艇/司令官/要塞 · FrameRate=14.917952[frame/sec]
- 재현: Hi-res reference for the top-right 5-bar ship-status panel (rows incl. ENGINE, values ~50) + circular helm control, plus close ship-follow camera with blue range rings and green HP bars.

### [fleet-battle] b87e87_en004.jpg
- 관측: KOREAN-localized 3D space fleet-battle / tactical view (this is the documented en004 C002 select->command-window flow). Mid-space: many fleet ship-sprites with selection circles — a friendly group (left, near 쿠 흐린/레오니다스) is engaged, one ship is on fire (orange explosion) with blu
- 진영/색: Korean-localized; friendly fleets BLUE icons/circles, enemy fleets RED (바르바로사 = Barbarossa is red); faction shown by ship-icon color
- 텍스트: 오른쪽 더블 클릭 · 선택되어진 유닛에 대해서 명령을 내립니다 · 오른쪽 아래의 커맨드윈도우에 현재 사용 가능한 명령을 왼쪽 클릭해 주십시오 · (커서를 버튼위에 가져가면 통신 도움말이 표시됩니다) · 우리를 완료했습니다 · 커맨드 윈도우
- 재현: THE C002 canonical reference (en004, Korean): right-double-click a unit to select → the bottom-right 커맨드 윈도우 (command window) shows currently-available commands → left-click a command. This is exactly the select->command-window flow to reproduce; friendly=blue

### [fleet-battle] f38c76_1.jpg
- 관측: 3D space fleet-battle viewport, close-up. Several large gray capital ships with bright blue/white engine glow bank across a dark-blue nebula; muzzle flashes and small red enemy markers near center-bottom. Fleet markers along the bottom have green HP/selection indicators inside bl
- 진영/색: Friendly markers GREEN/blue, enemy RED; selection circles blue; faction by marker color
- 텍스트: レーダー · 操艦パネル · コマンドウィンドウ · バニラ · ブランフ · 全体 / 艦隊 / 同陣営
- 재현: Japanese fleet-battle command-window reference (mirror of en004): 操艦パネル (helm) top-right, レーダー radar top-left, bottom-right コマンドウィンドウ icon grid with category side-tabs, 全体/艦隊/同陣営 chat scopes; select a unit (selection circle) → command window — the same select-

### [fleet-battle] 394457_7589_20040216_04_gineiden.jpg
- 관측: Space fleet-battle / in-world 3D view. A large white-grey capital ship (Imperial flagship-class hull) fills the right-center, lit by an intense lens-flare star burst behind/left of it. Top-left a small blue circular/rectangular radar minimap with red blips. Right edge has a verti
- 진영/색: White/grey Imperial-style flagship hull. Top-left blue radar minimap shows red enemy dots. Yellow lightning-bolt watermark bottom-left (Dengeki press mark, not in-game).
- 텍스트: small numeric values on right gauge strip (not legible)
- 재현: Reproduce the 3D space view with a capital ship under harsh star/lens-flare lighting, corner radar with red enemy blips, and a right-side ship-status gauge column.

### [fleet-battle] 887d53_6712_20030924_05_gineiden03.jpg
- 관측: In-world 3D space view of a sleek white arrowhead-shaped capital ship (resembles the Alliance/Brunhild-style smooth hull) flying through a blue-purple nebula starfield. Top-center shows small green horizontal bars (unit health/status indicators) and tiny HUD glyphs; top-right a s
- 진영/색: Sleek white/light-grey arrowhead capital ship. Top has small green health/status bars; blue UI chrome. Yellow lightning-bolt press watermark bottom-left.
- 텍스트: none legible at this size
- 재현: Reproduce in-world ship view: smooth capital ship over nebula, floating green status bars above units, and a bottom-right command-icon button grid.

### [fleet-battle] 01592a_gin03.jpg
- 관측: High-quality in-world 3D fleet view. A large detailed white capital ship dominates center-right, explicitly labeled ブリュンヒルト (Brünhild). Another ship top-left labeled ヨーツンヘイム (Jötunheim?) with a green bar, and a portrait/name tag top-left ケーニヒス・ティ... (Königs Tiger-class, partly cu
- 진영/색: Large white-hull flagship labeled ブリュンヒルト (Brünhild — Reinhard's Imperial flagship). Friendly units show GREEN health bars above them. Blue HUD chrome. No red here = all friendly/Imperial.
- 텍스트: ブリュンヒルト (Brünhild) · ヨーツンヘイム (Jötunheim) · ケーニヒス・ティ (Königs Tiger) · 旗艦 · 艦艇 · 司令官
- 재현: Canonical command-window layout: this is the master in-world HUD — radar (TL) + ship-status gauges/dial (TR) + COMMAND WINDOW icon grid with 旗艦/艦艇/司令官/要塞 tabs (BR) + chat log with 全体/艦隊/同盟軍 tabs (BL), green friendly health bars and ship name labels. THE reprod

### [fleet-battle] 2a26ab_gin08.gif
- 관측: In-world space combat: a white-grey capital ship fires a long bright-blue energy beam diagonally across the dark starfield. Bottom-left a blue panel (chat/log box). Bottom-right a small blue icon grid (command window). Top-right corner small blue panel. The beam is the focal visu
- 진영/색: White/grey capital ship firing a long bright-BLUE beam (beam weapon). Blue HUD chrome. Image small; no clear red/green markers visible.
- 텍스트: none legible
- 재현: Reproduce ship beam-weapon firing VFX (long bright-blue beam) in the in-world combat view with the standard bottom log + command-icon HUD.

### [fleet-battle] 32f043_ginei01.jpg
- 관측: Clear in-world fleet-battle scene. A large angular structure (fortress/carrier prow) is back-lit by intense blue-white light at left; a line of small escort warships streams diagonally toward a glowing cyan stellar body / blue planet on the right, with a small reddish-brown plane
- 진영/색: A large angular station/ship in bright blue-white light; a column of smaller escort ships trails toward a glowing cyan star/planet at right. Radar top-left shows RED enemy dots + one cyan + one white 
- 텍스트: レーダー · DATE 4/1 9:39 · コマンドウインドウ · 旗艦 · 艦艇 · 司令官
- 재현: Reproduce full combat HUD with the explicit instruction text: 'click an available command in the command window below'. Confirms COMMAND WINDOW = primary unit-command UI (radar TL with DATE clock + red enemy blips, status panel TR, command window BR with 旗艦/艦艇

### [fleet-battle] 387335_gin09.gif
- 관측: In-world combat: a distinctly RED-colored capital ship (red hull, unusual — likely an enemy or a red-team-tinted unit) is firing a long bright-blue beam toward lower-left. Dark starfield. Bottom-left blue chat/log panel, bottom-right blue command icon grid, top-right small blue p
- 진영/색: A RED-hulled capital ship (red = enemy/opposing faction color shown on the ship itself) firing a bright-blue beam. Blue HUD chrome. Top-right small blue panel.
- 텍스트: faint Japanese in panels (not legible)
- 재현: Reproduce enemy/opposing-faction ship rendered with a RED hull tint (faction shown via ship color) firing a beam — evidence that ship color encodes side in combat view.

### [fleet-battle] 4a0bc2_gin11.jpg
- 관측: Nearly the same composition as gin09: a RED-colored capital ship discharges a long bright-blue beam across the dark starfield (beam runs lower-left). Top-right corner has a small blue HUD panel/gauge. Bottom likely has the standard HUD but it is dark/cut at this small size. The r
- 진영/색: RED-hulled capital ship firing a long bright-BLUE beam diagonally. Top-right small blue HUD panel. Red hull = team/faction color cue. Small image.
- 텍스트: none legible
- 재현: Reproduce red-hull ship beam attack VFX; corroborates that combat ships can be tinted RED (faction/team color on the hull) — pair with the white/grey friendly hulls seen elsewhere.

### [fleet-battle] 4a6156_ginei07.jpg
- 관측: Detailed in-world 3D view, large resolution. A long white/grey capital ship (battleship hull, labeled ケーニヒス・ティーゲル = Königs Tiger) stretches across the lower half, with a small green health bar and a yellow selection bracket on a midship module. An Earth-like blue planet sits cent
- 진영/색: Large white/light-grey capital ship labeled ケーニヒス・ティーゲル (Königs Tiger). Green health bar (friendly). Top-left radar with red blips. Earth-like planet backdrop. Blue HUD chrome.
- 텍스트: ケーニヒス・ティーゲル (Königs Tiger) · 旗艦 · 艦艇 · 司令官 · 要塞 · 全体
- 재현: Reproduce in-world ship-select view: named ship with green health bar + yellow selection bracket, grid-coordinate readout (15,0), radar TL with red blips, status gauges TR, command window BR. Coordinate overlay confirms grid-cell position display.

### [fleet-battle] 4fb4aa_ginei04.jpg
- 관측: Letterboxed (black bars top/bottom) space fleet view. A large fleet of dozen+ small ship sprites spread diagonally across deep-blue nebula starfield, each with a small white light dot beneath it. One ship at center is highlighted in cyan (selected/flagship). A brown/orange gas-gi
- 진영/색: Allied/own fleet shown as cyan-highlighted flagship at center; the spread-out fleet ships are rendered in the same neutral grey-green hull color. No explicit faction-colored markers visible here — for
- 텍스트: 神艦パネル · コマンドウインドウ · ship name labels (small, illegible) above each fleet sprite
- 재현: Strategy/fleet view: own selected ship rendered in cyan vs neutral hull color for the rest; reproduce the command-window icon grid (bottom-right) + circular radar (top-left) + per-ship white marker dots over a nebula starfield.

### [fleet-battle] 7bd4c2_ginei03.jpg
- 관측: 640x480 mid-battle scene with many explosions (orange fireballs) and blue weapon/engine beams across a nebula. A grey-green Allied capital ship dominates center-left. Across the top are several commander name labels each with a small green dot marker and a tiny green status bar: 
- 진영/색: Multiple commander labels across the top in GREEN marker dots — ムーア, ウランフ, ビュコック, キルヒアイス, ケンプ (Moore, Uranff, Bucock = Allied admirals; Kircheis, Kempf = Imperial). Friendly fleet markers are green he
- 텍스트: ムーア · ウランフ · ビュコック · キルヒアイス · ケンプ · コマンドウインドウ
- 재현: Fleet-battle HUD: enemy & friendly commanders labeled by name with GREEN dot markers + green status bars at top of screen; reproduce explosions/beam VFX plus the 全体/艦隊/同陣営 log panes and command-window grid.

### [fleet-battle] 7df98b_gin09.jpg
- 관측: 960x720 higher-resolution debug build. Large RED Imperial battleship バルバロッサ upper-left with a green health bar. Two grey ships traveling along bright blue warp/engine beams: ケーニヒス・ティーゲル (center, green bar) and another ship lower-right (green bar). Debug text overlays: coordinates
- 진영/색: RED-hulled Imperial battleship バルバロッサ (Barbarossa, Kircheis's flagship) top-left, plus grey escort ships ケーニヒス・ティーゲル (Königs Tiger) and レオニダス (Leonidas) with GREEN health bars above each ship. Friendl
- 텍스트: バルバロッサ · ケーニヒス・ティーゲル · レオニダス · FrameRate=7.685410[frame/sec] · (15, 0) · BEAM
- 재현: Higher-res debug build: ship name labels (バルバロッサ red flagship, etc.) with GREEN health bars; 神艦パネル gauges are explicitly BEAM/GUN/ENGINE/WARP/SENSOR; radial compass shows numeric WARP/sensor readouts — reproduce labeled gauge semantics + green per-ship health 

### [fleet-battle] ae1da8_gin10.jpg
- 관측: 960x720 debug build, dramatic combat: roughly six bright blue weapon beams converge from across the field onto a single point at right (near a tan/brown planet limb at top-right), suggesting concentrated fire. Several green health bars and small white ship sprites scattered; a re
- 진영/색: Many converging bright BLUE weapon beams (allied beam fire) all targeting a node at right near a planet. Green health bars float over several ship positions; a faint RED enemy marker/arc lower-left. A
- 텍스트: FrameRate=9.87...[frame/sec] · (15, 0) · 50 · 51 · 48 · 旗艦
- 재현: Fleet-battle concentrated-fire moment: multiple BLUE beam tracers converge on one enemy node near a planet; reproduce massed beam VFX, green friendly health bars vs red enemy markers, and the radar scan-line on the minimap.

### [fleet-battle] c0950e_gin03.gif
- 관측: Small thumbnail (~150px) of a 3D space fleet-battle / strategic-zoom view. A large white-hulled capital ship (Brunhild-like) sits center against a blue nebula and a planet's curved horizon at top. Top-left shows small ship-icon clusters with motion; top-right a blue stats/status 
- 진영/색: Imperial flagship (white/grey ship); enemy markers blue at top, friendly status panel top-right blue; selection chips blue
- 재현: Reproduce the in-world fleet view: white capital ship over planet horizon with top-right blue ship-status panel and bottom command-window chip grid.

### [fleet-battle] c45f85_ginei01.jpg
- 관측: Full 640x480 in-world strategic fleet engagement over a planet's blue horizon. Many ship formations arranged in arc; multiple beams/converging attack lines from a central exploding ship (orange fireball). Selected ships carry short horizontal bars (green and magenta) plus green c
- 진영/색: Green target/health bars on selected friendly ships; magenta/purple bars on others; green dot markers; named units in white; 'No Focus' in red
- 텍스트: 神艦パネル · コマンドウインドウ · 旗艦 · 艦艇 · 司令官 · 要塞
- 재현: Reproduce fleet combat HUD: green=selected/friendly health bars vs magenta=other, green position dots, floating white unit names, plus the bottom command-window with 旗艦/艦艇/司令官/要塞 category buttons.

### [fleet-battle] c57eb0_gin10.gif
- 관측: Small thumbnail (~150px) of a fleet battle showing many parallel bright-blue beam-weapon trails crossing the screen toward small ship sprites at top. Blue HUD edges and a bottom-right command icon grid are visible but text is unreadable at this size.
- 진영/색: Bright blue beam fire across the field; blue HUD
- 재현: Reproduce massed blue beam-weapon fire effect across the fleet-battle field with the standard blue command-window grid HUD.

### [fleet-battle] d405b9_gin07.jpg
- 관측: Large (~960px) close-up in-world battle. White-hulled flagship 'ブリュンヒルト' (Brunhild) at right firing bright-blue beams alongside a multi-pod Imperial ship 'ヨーツンハイム' (Jotunheim) at left; small escort ships below, all with green health bars. Top-left radar/minimap with red+blue blip
- 진영/색: White Imperial flagship ブリュンヒルト (Brunhild) and グリーンheight bars on units; Imperial fleet ヨーツンハイム; bright blue beams
- 텍스트: ブリュンヒルト · ヨーツンハイム · BEAM · GUN · ENGINE · ARMOR
- 재현: Reproduce ship-detail combat HUD: named Imperial flagship Brunhild firing blue beams, green health bars, top-right BEAM/GUN/ENGINE/ARMOR/SENSOR status panel + radar, with debug framerate/grid-coord overlay.

### [fleet-battle] d41663_ginei08.jpg
- 관측: 640x480 in-world view of large green/olive-hulled Alliance warships labeled '08-01' with floating name 'アップルトン' (Appleton); a small planet/moon sphere bottom-left. Top-left 'レーダー' radar with green blips; top-right '神艦パネル' ship-status panel with vertical bars + circular gauge. A m
- 진영/색: Green-hulled Alliance ships (8-01 'アップルトン'), magenta unit marker bar, green position dot; blue HUD
- 텍스트: レーダー · 神艦パネル · コマンドウインドウ · アップルトン · 08-01 · 旗艦
- 재현: Reproduce close-up of a green-hull Alliance ship with hull ID '08-01' and floating name label, radar + ship-status panel, and magenta/green markers for other units.

### [fleet-battle] e75788_ginei02.jpg
- 관측: 640x480 in-world view of a large dark grey/teal capital ship (engines lit, lens-flare) with a smaller escort ship to its right. A row of small green ship icons stretches along the lower-right (a fleet line). Floating white name labels: 'ワーレン' (Wahlen) lower-left, and to the right
- 진영/색: Dark grey/teal capital ship; green ship-icon row at bottom-right (own fleet line); named units ワーレン, キルヒアイス, ロッツ?, ビュコック white labels; blue HUD
- 텍스트: 神艦パネル · コマンドウインドウ · ワーレン · キルヒアイス · ビュコック · 旗艦
- 재현: Reproduce in-world fleet scene with green own-fleet icon row along the bottom and floating white commander/ship name labels (Wahlen, Kircheis, Bucock) — confirms named-unit labels and green own-fleet marker color.

### [fleet-battle] e869e0_gin08.jpg
- 관측: Large (~960px) close-up battle. A white-hulled Imperial ship 'サラマンドル' (Salamander) center with a small gold/yellow Imperial crest emblem on hull and a green health bar; another white ship firing bright-blue beams from left; a small escort below with red+green status pips. Top-lef
- 진영/색: White Imperial ship サラマンドル (Salamander) with green health bar + gold/yellow crest; bright blue beams; red+green status pips
- 텍스트: サラマンドル · BEAM · GUN · ENGINE · ARMOR · SENSOR
- 재현: Reproduce ship-detail combat with named Imperial ship Salamander bearing a gold crest emblem, green health bar, blue beam fire, and top-right BEAM/GUN/ENGINE/ARMOR/SENSOR status panel — note hull crest as a faction indicator.

### [fleet-battle] ec408c_ginei05.jpg
- 관측: 640x480 close-up of a large olive/green Alliance capital ship with hull marking 'BG-20', a red accent stripe on the bow and purple/magenta engine glow at left. Top-left 'レーダー' radar (collapsed) and top-right '神艦パネル'. Bottom-left a help/tutorial log box explaining mouse controls: 
- 진영/색: Olive/green Alliance capital ship hull ID 'BG-20', red accent stripe; blue HUD; purple engine glow
- 텍스트: レーダー · 神艦パネル · コマンドウインドウ · BG-20 · 左ダブルクリック(非指揮ユニットに対して) · ユニットへのフォーカス移動
- 재현: Reproduce Alliance capital ship (hull 'BG-20') view and the help-log text documenting unit-focus controls: left double-click = focus unit, right double-click = focus to flagship — confirms the documented double-click focus interaction.

### [fleet-battle] f594ae_ginei06.jpg
- 관측: 640x480 close-up of a long, sleek dark-grey/charcoal capital ship (sword-like silhouette) over a starfield with faint blue grid lines beneath. Top-left レーダー radar, top-right 神艦パネル. Bottom-left tutorial/help log box with the same double-click focus instructions and '当星系内から、既存部隊が離脱
- 진영/색: Long dark grey/charcoal capital ship (Imperial-style); blue HUD; faint blue grid lines below
- 텍스트: レーダー · 神艦パネル · コマンドウインドウ · 左ダブルクリック(非指揮ユニットに対して) · ユニットへのフォーカス移動 · 右ダブルクリック
- 재현: Reproduce camera focus on a single dark-grey capital ship with the grid floor visible and the same unit-focus help log (plus '部隊離脱' event message) — useful for camera-focus + unit-leave event wiring.

### [fleet-battle] en001.jpg
- 관측: Real Netmarble KR (Korean-localized) in-game space view. Two large named capital ships in 3/4 view: a white/grey ship labeled 브륀힐트(Brünhild) center and a RED enemy ship lower-right, with a smaller ship labeled 바르바롯사(Barbarossa) at right and 브륀힐트(?) top. Top-left circular radar/mi
- 진영/색: Friendly fleet markers/HP bars blue; enemy ship hull RED; minimap shows green dots. Faction shown by ship hull color (white/grey = ally, red = enemy) and a colored under-marker beneath each named ship
- 텍스트: 브륀힐트 · 바르바롯사 · 커맨드 윈도우 · 전체 · 함대 · 통진영
- 재현: Reproduce the in-world fleet view with named 3D ships, blue translucent chat panel (channel tabs 전체/함대/통진영) and the bottom-right command-window icon grid; faction is read from ship hull color (red=enemy) plus colored under-ship marker, not a text label.

### [fleet-battle] en004.jpg
- 관측: Korean-localized MP combat screen mid-engagement. Many friendly ships shown as elongated grey hulls each inside a blue oval selection ring, firing pale-blue tracer lines that converge from across the field. One ally lower-left is exploding (orange). Named units 레오니다스(Leonidas) to
- 진영/색: Own fleet ships ringed by blue SELECTION CIRCLES; one ally ship lower-left on fire (orange explosion). Enemy ship at right has RED hull. Minimap green blips. Faction = hull color + selection ring colo
- 텍스트: 오른쪽 더블 클릭 · 선택되어진 유닛에 대해서 명령을 내립니다. · 오른쪽 아래의 커맨드윈도우에서 현재 사용 가능한 명령을 왼쪽 클릭해 주십시오. · 레오니다스 · 쿠 호린 · 바르바롯사
- 재현: ★C002 TARGET: this is the Netmarble KR multiplayer 'select unit (blue ring) → left-click an ability in the bottom-right command window' interaction — the on-screen tutorial literally instructs selecting a unit then left-clicking the command window; reproduce s

### [fleet-battle] en005.jpg
- 관측: Original Japanese build in-world combat. Two named grey capital ships fire thick blue beams to the upper-right: 'ゲルゾンハイム'(Gelsenheim?) left and 'ブリュンヒルト'(Brünhild) right, plus two smaller escort hulls in foreground, all with green HP bars. Debug overlay top-center reads '( 15, 0 
- 진영/색: Own ships have GREEN HP bars; firing pale-blue beam tracers. No explicit faction text; faction inferred from beam ownership and HP-bar color. Minimap dots reddish.
- 텍스트: ゲルゾンハイム · ブリュンヒルト · ( 15, 0 ) · FrameRate=8.633094[frame/sec]
- 재현: Reproduce the JP fleet-combat HUD: top-right multi-row stat panel with a circular heading control, debug coordinate/FrameRate overlay, green HP bars and the bottom-right command-window grid; this is the dev/debug build of the same combat view as the KR en00x s

### [fleet-battle] en008.jpg
- 관측: JP-build large beam volley scene. From a convergence point upper-right, many bright blue beams fan out across a starfield toward numerous units each marked with a green HP bar and a white star-glint. A planet curves across the top. Debug overlay '( 15, 0 )' and 'FrameRate=9.0(?)…
- 진영/색: Own ships GREEN HP bars; massed pale-blue beam tracers converge from one node at right toward many targets. A small RED name label near center (enemy ship). Blue vs red orbit rings on the grid plane.
- 텍스트: ( 15, 0 ) · FrameRate=9.0…[frame/sec]
- 재현: Reproduce massed beam-fire combat with per-unit green HP bars and blue/red ring ground markers on a grid plane; same combat HUD as en005, useful for tracer/effect and HP-bar styling.

### [fleet-battle] en010.jpg
- 관측: JP-build combat over a planet. Foreground ship (center, with red target/selection box and green HP bar) plus several distant ships with green HP bars and white glints; small blue dot-clusters (fighter swarms?) drift across the nebula. Named units bottom: リオ・グランデ(Rio Grande) lower
- 진영/색: Own ships GREEN HP bars; small blue clustered blips (drones/squadron) scattered mid-field. One ship has a red selection box marker. Brown planet lower-right. Faction not by text label.
- 텍스트: リオ・グランデ · ベルガモン · ヒューベリオン · バルバロッサ · ( 15, 0 ) · FrameRate=14.591439[frame/sec]
- 재현: Reproduce named-ship combat over a planet with green HP bars and a red selection box on the targeted unit; canonical LOGH ship names (Rio Grande/Hyperion/Barbarossa) confirm the wire name-label feed for in-world units.

### [fleet-battle] uu1.jpg
- 관측: High-resolution JP-build in-world view of a single large white/grey capital ship labeled 'ブリュンヒルト'(Brünhild) banking across screen center, with two escort hulls upper-left (one labeled 'ヨーツン…'/Jötunn(?) and a 'ケーニヒス・ティ…'/Königs Tiger(?) name top-left) all carrying green HP bars; 
- 진영/색: Own ships GREEN HP bars; ships ringed by blue orbit rings on the plane. No text faction; lens-flare sun upper-left. Hi-res (1024-wide) build.
- 텍스트: ブリュンヒルト · ヨーツン… · ケーニヒス・ティ… · FrameRate=14.917952[frame/sec] · BEAM · GUN
- 재현: Reproduce the higher-res fleet HUD: top-right ship-systems stat panel labeled BEAM/GUN/ENGINE/NAVI/SENSER with a circular heading control, and the bottom-right command window with category side-buttons 旗艦/艦艇/司令官/要塞 (flagship/ships/commander/fortress).

### [fleet-battle] uu2.jpg
- 관측: JP-build large engagement over a planet, viewed top-down-ish. Many white missile/torpedo trails arc from the lower-left up toward a contested center where a red explosion glows near a RED name label 'バルバロッサ'(Barbarossa, enemy). Units across the field carry green HP bars; the batt
- 진영/색: BLUE vs RED orbit-ring ground markers clearly divide the field (own = blue rings lower/right area, enemy = red rings lower-left). Own units GREEN HP bars. Enemy ship name in RED ('バルバロッサ'). Big missil
- 텍스트: バルバロッサ · ケーニヒス・ティーゲル · FrameRate=9.168704[frame/sec] · 旗艦 · 艦艇 · 司令官
- 재현: Key faction-display evidence: opposing formations are marked by BLUE vs RED orbit-ring ground markers and the enemy ship NAME is rendered in RED — reproduce friendly/enemy distinction via ring color + red-vs-white name label, plus missile-volley effects, on th

### [character-stat] ddcc72_status.jpg
- 관측: A character/commander STATUS stat sheet. Top four rows are labeled gauge bars: 体力 (vitality) = 100, PCP = 500, MCP (paired with PCP) , 航続 (operating/cruising range) = 1000. Below is a grid of numeric ability stats in white text, matching the manual's 8-ability model: 統率 34, 政治 25
- 진영/색: Black background stat readout. Each stat is a horizontal GAUGE BAR: 体力 (vitality) green->yellow, PCP green, MCP green, 航続 (cruising range) green->yellow. Numeric stats in white labels. No faction colo
- 텍스트: 体力 100 · PCP 500 · MCP · 航続 1000 · 統率 34 · 政治 25
- 재현: Reproduce the commander status sheet: 体力/PCP/MCP/航続 as colored gauge bars plus the 8-ability number grid (統率/政治/運営/情報 + 指揮/機動/攻撃/防御) and 影響力/功績 fields, sourced from the 0x0323 character record (ability_8 @ 0x188).

### [misc-hud] 8b7313_rader.jpg
- 관측: A standalone レーダー (radar) HUD widget. Title bar top-left: レーダー, with a small down-arrow (collapse) button top-right. Inside a square framed scope: header line DATE 2/ 5 23:44. A circular radar grid (concentric + crosshair) with many scattered contact dots — several red and severa
- 진영/색: Radar shows enemy/friendly contacts as colored dots: RED dots (hostile contacts) and BLUE dots (friendly), distributed inside a circular scope. White triangular 'own ship' arrow at center-left. Factio
- 텍스트: レーダー · DATE 2/ 5 23:44 · X: 80 · Y: 144
- 재현: Reproduce the レーダー widget: collapsible titled scope showing DATE/time, a circular grid with red(enemy)/blue(ally) contact dots and an own-unit triangle, plus X/Y coordinate readout — faction-by-dot-color confirmation for the radar HUD.

### [misc-hud] e39b6b_chat.jpg
- 관측: The chat / system-message log HUD. Top pane shows a system notification line in white Japanese: '＊ 現在の星系から、一部艦隊ユニットが離脱しました' (= 'A portion of fleet units have departed/left the current star system'). Below is a larger empty black message/chat pane. Both panes have cyan vertical sc
- 진영/색: Dark navy text panes framed in cyan/steel-blue. Two stacked black message areas with cyan scrollbars (up/down arrow buttons) on the right edge. System/notification text in white.
- 텍스트: ＊ 現在の星系から、一部艦隊ユニットが離脱しました
- 재현: Reproduce the dual-pane message HUD: an upper system-notification pane and a lower chat pane, each with a cyan scrollbar. Server broadcasts (e.g. fleet departure) print into the system pane; player text into the chat pane. This is the surface for the chat-send

### [misc-hud] f16bfa_panel.jpg
- 관측: The 操艦パネル (ship-handling / helm control panel). Title bar top-left '操艦パネル' with a down-arrow collapse tab top-right. Left column is FIVE horizontal sliders with numeric values and English labels: BEAM = 50, GUN = 0, ENGINE = 100 (with secondary value 18/45), WARP = 5, SENSOR = 30
- 진영/색: Dark blue/steel HUD. Title bar gradient blue '操艦パネル'. Slider tracks cyan with bright knobs; values in white/cyan. Right side has a circular ship-orientation dial in glowing cyan with a stylized ship s
- 텍스트: 操艦パネル · BEAM 50 · GUN 0 · ENGINE 100 · 45 · WARP 5
- 재현: Reproduce the 操艦パネル helm panel: title bar + collapse tab, five labeled power/allocation sliders (BEAM/GUN/ENGINE/WARP/SENSOR) with numeric readouts, and a circular ship-orientation/power dial. Used for manual ship control in combat.

### [non-game] dcdcb1_20030924222608_3.jpg
- 관측: A real-world press/event photo (NOT a game screenshot). A conference room: a presenter stands at right beside a large projection screen; seated attendees in foreground. The projected slide is dark blue with a starfield and large white Japanese title text reading 銀河英雄伝説 with a sty
- 진영/색: N/A — real-world photo. Projection screen shows the game logo in white text on a dark blue starfield slide.
- 텍스트: 銀河英雄伝説 · VII · (small caption line above title — game tagline) · http://www. ... gioden.com (URL on slide)
- 재현: Non-game press event photo — only useful as branding reference: title is 銀河英雄伝説 VII on a dark-blue starfield logo treatment. Do not reproduce as a game screen.

### [non-game] 169463_gidae-award-image-26.gif
- 관측: Small/low-res composite that resembles an in-facility character-roster screen (a grid of character portrait faces on the left over a wood-paneled office interior, with a blue stats/info panel on the right and dark message bars along the bottom). Too small to read individual label
- 진영/색: n/a (press/portrait grid asset)
- 텍스트: (too small/low-res to transcribe reliably)
- 재현: Depicts the in-facility roster+stats layout (portrait grid left, stats panel right) but as a low-res press thumbnail; use higher-res uu/japan-online shots for the actual UI.

### [non-game] 3157ea_en10101010.gif
- 관측: Marketing/title banner art, not a gameplay screen. A long red Imperial-style warship with a gold emblem flies right, small fighters in background, over a dark red-tinted starfield. Logo text: 'SPACE WAR SIMULATION', large 銀河英雄伝説 (Ginga Eiyu Densetsu) kanji, Korean 은하영웅전설 beneath,
- 진영/색: Imperial red livery on the banner ship (red hull with yellow/gold crest), space background
- 텍스트: SPACE WAR SIMULATION · 銀河英雄伝説 · 은하영웅전설 (Legend of the Galactic Heroes) · ONLINE
- 재현: Title/branding reference: 'SPACE WAR SIMULATION / 銀河英雄伝説 ONLINE' wordmark with red Imperial flagship art — for title-splash / launcher branding, not in-game UI.

### [non-game] b9bf89_saaaap_1.jpg
- 관측: A standalone 3D model render (no UI): a dark olive-green/black Imperial-style battleship hull on a black starfield, viewed from above-rear, with antennae masts, a detailed bridge superstructure, and large '10 20' hull markings near the stern. This is a promotional/asset render of
- 진영/색: Empire-style dark green/black warship (model render)
- 텍스트: 10 20 (hull marking)
- 재현: Ship-model render (dark-green Imperial battleship with hull number 10/20) — art/asset reference for warship modeling, not a UI screen.

### [non-game] c452a1_feelsi_9.gif
- 관측: A standalone 3D ship render (no UI): a sleek pale blue-white wedge/dart-shaped capital ship against pure black, with a stylized golden rippled/distorted plume or warp-effect trailing off the upper-right. Engine nacelles and bridge detail visible underneath. Promotional render, no
- 진영/색: Alliance/neutral — pale blue-white ship render
- 재현: Ship-model render (pale-blue flagship with golden warp plume effect) — visual-style/asset reference for capital-ship rendering and engine FX, not UI.

### [non-game] c7dfb3_saaaap_2.jpg
- 관측: A promotional artwork/render (no game UI) titled 'BARBAROSSA' (gold text, bottom-left, artist signature bottom-right). A large RED imperial battleship with a red bow energy beam and a golden double-headed-eagle crest on its hull hovers over a futuristic spaceport/city at dusk, wi
- 진영/색: Empire (帝国) — RED flagship with golden imperial double-eagle crest = Barbarossa (Reuenthal/Kircheis-class red imperial ship)
- 텍스트: BARBAROSSA · (golden double-eagle imperial crest on hull)
- 재현: Key-art of the Empire flagship BARBAROSSA (red hull, golden imperial double-eagle crest) over a spaceport — faction identity art (Empire = red ship + double-eagle crest); asset/branding reference, not UI.

### [non-game] en010.gif
- 관측: FAILED TO LOAD: the file has a .gif extension but its bytes are an XML/SVG document (starts with '<?xml version="1.0" enco...'), i.e. a saved error/placeholder page rather than an actual image. Nothing visual to report.
- 진영/색: n/a — file did not load.
- 재현: No usable content — corrupt/placeholder download; skip. (Distinct from en010.jpg which is a real game screen.)

### [non-game] en10101010.gif
- 관측: Promotional TITLE/LOGO banner (not in-game). Reads 'SPACE WAR SIMULATION', large kanji 銀河英雄伝説 with Korean 은하영웅전설 beneath, and 'ONLINE' below. Background art is a red capital ship (with gold imperial crest on the hull) over a starfield with small distant ships. This is the LOGH On
- 진영/색: n/a — title/logo banner. Background = red Imperial flagship (Brünhild-like) with a gold crest on a starfield.
- 텍스트: SPACE WAR SIMULATION · 銀河英雄伝説 · 은하영웅전설 · ONLINE
- 재현: Branding reference only (LOGH Online wordmark + red imperial-flagship key art); not a UI screen — useful for title/splash art styling, mark category non-game.

### [non-game] d7bb74_gi01.jpg
- 관측: A press/event photograph of a middle-aged Japanese man in a dark suit and tie speaking at a podium microphone (likely a developer/spokesperson at a presentation). Plain light background. No game UI whatsoever.
- 진영/색: N/A — real-world photograph, no game content or faction.
- 재현: Non-game press photo (speaker at a podium); nothing to reproduce in-client.
