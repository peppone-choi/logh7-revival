# LOGH VII Revival Dashboard Design

## Product Shape

This is an operator dashboard, not a landing page. The first screen must answer three questions: can the server open, what remains before manual-complete play, and is the local game session currently alive.

## Typography

- Primary stack: Pretendard Std/Latin, Pretendard JP, Pretendard, Malgun Gothic, Segoe UI.
- Use zero letter spacing. Do not scale ordinary UI text by viewport width.
- Korean copy should be direct and operational. Avoid marketing text and generic feature explanation.

## Color

- Base: warm paper `#f4f2ed`, card `#fffdfa`, ink `#22262a`.
- Accent set: teal `#1f5b68`, red-brown `#7a382c`, green `#25735f`, amber `#b48425`, danger `#a7473d`.
- Do not drift into a one-hue slate/blue or beige-only palette.

## Layout

- Full-width bands and dense grids are preferred.
- Cards are only for repeated items or framed tools. Do not nest cards.
- Use stable grid tracks and fixed-height controls so labels and dynamic server counters do not shift the layout.

## Interaction

- The admin endpoint input, refresh button, and auto-refresh checkbox are the primary controls.
- The dashboard must remain useful when the admin server is offline.
- Real session data comes only from the local admin API. Do not fake online status.

## Content Rules

- Development percentage is document-derived until recomputed from the roadmap.
- User corrections override stale plan text: grid click is treated as done; remaining focus is lobby/UI coverage, galaxy extraction, manual content, and packaging.
- Mention that strategic passability is server-fed through 0x0313/0x0315 whenever grid ownership is discussed.
