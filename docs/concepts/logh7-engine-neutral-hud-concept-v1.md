# 엔진 중립 HUD 콘셉트 v1

상태: **R3 비정본 UI 비교 시안 / provenance review blocked**. 이 이미지는 원본 게임 데이터, 캐릭터·함선 디자인,
밸런스 수치 또는 최종 엔진 선택의 근거가 아니다. Godot·Unity 동형 PoC와 Unreal
전술 렌더 스파이크가 같은 화면 계약을 비교할 때만 사용한다.

원시 PNG는 tracked asset이 아니라
`_workspace/logh7-revival/assets/20260716T051159Z-hud-concept-v1/`에 격리했다.

## 생성 영수증

- 생성 방식: Codex 내장 image generation
- raw file: `_workspace/logh7-revival/assets/20260716T051159Z-hud-concept-v1/logh7-engine-neutral-hud-concept-v1.png`
- SHA-256: `1e251789d8b59e8c1544718e4440a19bad77955a6fbd3e5094caa09f8a77a3e1`
- 크기: `1672x941`, RGB PNG
- grade/qualifier: `R3/generated`, `canonical: false`
- owner/rights: project-generated prototype; redistribution review pending
- generator/model/version/seed: built-in generation surface; exact model version과 seed는 노출되지 않음
- review: `blocked` — exact generator lineage와 rights review가 닫히기 전에는 package/배포/런타임 사용 금지
- activation: `enabledByDefault: false`
- fallback: 이미지가 없어도 기능·테스트·엔진 비교가 동작해야 한다.
- rollback: ignored raw PNG와 이 Markdown을 제거하면 되며 원본 자산에는 변경이 없다.

## 고정 화면 계약

- 은하 지도, 함대 선택, 이동 intent, 서버 권위 event 반영을 한 화면에 둔다.
- 재접속 및 서버 동기화 상태를 플레이어에게 숨기지 않는다.
- 1080p에서 읽을 수 있는 패널 간격과 글자 영역을 확보한다.
- 특정 엔진 위젯이나 렌더 파이프라인을 전제로 하지 않는다.
- 원본 클라이언트는 계속 1차 제품·행동 오라클로 유지한다.

## 최종 생성 프롬프트

```text
Use case: ui-mockup
Asset type: engine-neutral 16:9 desktop strategy-game HUD concept for a modernization comparison
Primary request: a production-realistic interface mockup for a restored late-1990s Japanese space-opera grand strategy game, retaining a dense command-center feeling while modernizing readability
Scene/backdrop: dark star map with orbital paths, restrained fleet markers, and a subtle tactical grid; no recognizable copyrighted characters, portraits, insignia, or logos
Subject: the same thin vertical slice planned for Godot and Unity comparison: galaxy map, selected fleet status, movement intent, server-authoritative event log, reconnect status, time controls
Style/medium: realistic shippable game UI, not cinematic concept art; crisp modular panels that could be implemented in Godot, Unity, Unreal, or web technologies
Composition/framing: 16:9 landscape; main galaxy map dominant; left fleet roster; right contextual command panel; bottom event timeline and time controls; generous readable spacing at 1080p
Color palette: deep navy and charcoal, muted cyan telemetry, restrained amber warnings, neutral off-white text areas
Text (verbatim): "은하 지도", "함대", "명령", "시간", "서버 동기화"
Constraints: render each provided Korean label exactly once if text is legible; no extra readable copy; no logo; no watermark; no anime portraits; no engine branding; no Unity-only visual conventions; keep this clearly non-canonical and implementation-oriented
Avoid: flashy mobile-game monetization UI, excessive glow, tiny unreadable text, ornate fantasy styling, photorealistic people, brand marks
```
