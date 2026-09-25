# Experience & Motion Spec

Related: [PRD v2 §5.5 (X-stories), §8–11](../PRD.md) · [Architecture](../engineering/architecture.md) · [Game engine](../engineering/game-engine.md)

This spec explains **how every moment in Nue Uno should look, sound, and feel**, with enough precision to build and review it. Each moment has an ID (X1…X17, E6…E16) that matches its PRD story.

## 1. Principles

1. **Every action gets visible feedback.** Every state change has a visible cause and a visible effect. A card never just appears somewhere.
2. **Animations never cost the player time.** Input is never blocked. Timers start after animations finish. A backlog of animations fast-forwards instead of piling up.
3. **The effect matches the stakes.** Routine moves are quick. Impactful moves (+4, UNO!, Final Lap, winning) get a signature effect. If everything is loud, nothing stands out.
4. **Physical, not flashy.** Cards have weight: springs, arcs, slight random rotation, soft shadows. Effects feel like objects on a table, not a slot machine.
5. **Motion is optional.** Every effect has Reduced and Off versions that carry the same information.

## 2. Motion tokens

Defined once in `apps/web/src/ui/motion.ts` and used everywhere. **No one-off durations in components.**

| Token | Value | Use |
|---|---|---|
| `dur.micro` | 120ms | Hover lift, button press |
| `dur.quick` | 200ms | Card select, chip changes, toasts in |
| `dur.standard` | 320ms | Card throw, draw slide, row reorder |
| `dur.emphasis` | 600ms | Stamps, color shift, banners |
| `dur.signature` | 900–1200ms | +4 impact, UNO! burst, victory |
| `stagger.deal` | 60ms per card | The Deal |
| `stagger.list` | 30ms per row | Leaderboard and lists entering |

| Easing / spring | Value (Framer Motion) | Use |
|---|---|---|
| `spring.snappy` | `{ type: 'spring', stiffness: 520, damping: 34 }` | Selection, hand re-layout |
| `spring.bouncy` | `{ type: 'spring', stiffness: 320, damping: 16 }` | Stamps landing, podium rise |
| `spring.soft` | `{ type: 'spring', stiffness: 180, damping: 24 }` | Leaderboard rows, TV bracket |
| `ease.throw` | `cubic-bezier(0.2, 0.8, 0.2, 1)` along a curved path | Card flight |
| `ease.out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Entrances |
| `ease.in` | `cubic-bezier(0.7, 0, 0.84, 0)` | Exits |

## 3. Effect modes

| Mode | Chosen when | Behavior |
|---|---|---|
| **Full** | Default | Everything in this spec |
| **Reduced** | OS setting `prefers-reduced-motion`, the user's choice, or the automatic downgrade (§9) | No screen shake, no particles, no 3D flips, no slow motion. Movement is replaced by fades and scale changes of 150ms or less. Stamps fade in over 200ms. The +4 effect becomes a static "+4" stamp plus a count change. |
| **Off** | The user's choice | Instant state changes. Text announcements appear in the event feed. |

In every mode the **information** is the same: who did what to whom, and what the current color and turn are.

## 4. The event-to-animation pipeline

```
Firestore games/{id}/events (onSnapshot) ─► EventQueue ─► Choreographer ─► components (Framer Motion)
                                               ▲
                   optimistic local move ──────┘ (own plays animate on tap; reconciled on ack)
```

Rules:
1. Each table has one queue, and events play **in order** (`seq`).
2. **Own moves are optimistic.** The card starts flying the moment I tap. When the server confirms, the matching event is marked as already played. If the server rejects it, the card springs back to my hand (`spring.bouncy`) with a shake of 4px × 3 and a hint toast.
3. **Fast-forward:** if the queue is more than 3 events or 1.5 seconds behind (for example, after a tab was in the background or a reconnect), jump straight to the current state with a 200ms crossfade. The event feed still lists what happened.
4. **Timer start:** the turn ring's countdown starts when the queue is empty. The server adds **1.5s of grace** to every deadline, so a player never loses time to our own animations.
5. **Signature effects never overlap.** If a second signature effect arrives while one is playing, the first is cut to its final 200ms.
6. The **public view** (opponents, TV) uses the same pipeline, but draws are shown face-down.

## 5. Moment catalog (player device)

Sounds refer to §7. Haptics refer to §8 (Android only).

| ID | Moment | Trigger | Choreography (Full) | Sound | Haptic | Reduced |
|---|---|---|---|---|---|---|
| X1 | **The Deal** | `game_started` | The deck drops in from above (`spring.bouncy`, 300ms). Cards deal round-robin to each seat along an arc, 60ms apart, rotating ±8° in flight (7 × players × 60ms: about 1.7s for 4 players). My 7 land face-down in a fan, then flip face-up left to right, 40ms apart. The starting card flips onto the pile last. | `shuffle` → `deal-tick` ×N → `flip` | — | Hand fades in, pile fades in |
| X2 | **Hand fan** | Always on | My cards sit in an arc (up to ±25° total, overlapping more when I hold more cards). Playable cards: −12px and a faint glow in the current color. Unplayable cards: 70% brightness. Selected card: −28px and scale 1.06. Hover (desktop): −8px. Re-layout uses `spring.snappy`. | `tick` on select | light tap on select | Same layout, no lift animation |
| X3 | **Throw** | `card_played` | The card lifts, then flies along a curved path to the pile (320ms, `ease.throw`), rotating to a random angle within ±15°. On landing: scale 1.08 → 1, a soft dust puff (8 particles), and the pile shadow deepens. Opponents' cards start from their seat position and flip face-up in the middle of the flight. | `card-snap` | light tap | Fade the card in on the pile |
| X4 | **Draw flip** | `cards_drawn` | For each card (100ms apart): it slides off the deck toward the drawing player. For me, it flips 180° in 3D halfway and lands in the fan. For opponents it stays face-down and shrinks into their count badge, which ticks up. | `draw` ×N | — | Count badge ticks up, card fades in |
| X5 | **Color shift** | Wild or +4 with `color` | A color wheel (4 segments) bursts out of the pile (scale 0 → 1.2 → 1, 300ms). The chosen segment pulses, and the rest fall away. A radial sweep then brings the ambient table tint to the new color (600ms). The color label and shape chip update. | `whoosh-color` | medium tap | Tint changes with a 200ms crossfade, label updates |
| X6a | **Skip** | Skip effect | A 🚫 stamp slams onto the victim's avatar (scale 2 → 1, `spring.bouncy`), lingers for 700ms, then fades | `stamp` | medium | Static stamp, 600ms |
| X6b | **Reverse** | Reverse | The direction ring around the table spins 180° (600ms, `ease.out`), and the arrowheads flip | `whoosh-reverse` | light | The arrows switch direction |
| X6c | **Draw 2** | Draw 2 effect | A "+2" stamp lands on the victim, and 2 face-down cards fly to them (X4) | `stamp` + `draw` ×2 | medium | Static "+2", count ticks up |
| X7 | **+4 IMPACT** 🔥 | `card_played` with value `wild4` | (1) **Slow motion:** the card's flight takes 600ms instead of 320ms. (2) **Slam:** it lands at scale 1.25 → 1 with a 6px screen shake for 250ms (decaying) and a shockwave ring spreading from the pile across the table. (3) X5 color shift. (4) A giant "+4" (display font, 30% of viewport height) slams onto the victim's avatar, which flinches (shakes ±6°). (5) 4 cards fly to the victim, 80ms apart. Total about 1.4s. | `slam` + `crowd-ooh` + `draw` ×4 | heavy pattern | Static "+4" and the color change |
| X8 | **UNO!** | `uno_called` (or `declareUno` on a play) | "UNO!" letters pop in one at a time (60ms apart, `spring.bouncy`) over the caller's seat with a starburst behind them. A golden sparkle ring orbits the avatar. The seat keeps a **gold pulse** (2s loop) while they hold 1 card. On my own device, the UNO button turns into a checkmark. | `uno-shout` | double tap | The word "UNO!" appears, gold border on the seat |
| X9 | **CAUGHT!** | `uno_caught` | A red siren sweep across the offender's seat: 2 flashes, 400ms total (within the flash-safety limit). A "CAUGHT!" stamp lands on it, a 🎯 badge pops on the catcher, and 2 cards fly to the offender. | `siren-short` + `stamp` | heavy | Static "CAUGHT!" stamp |
| X10 | **Turn ring** | Turn start | A ring around the current player's avatar drains clockwise. The color goes from green to amber to red. In the last 5 seconds: a heartbeat pulse (scale 1 → 1.06 each second), and if it's me, the screen edge glows red. | `tick-soft` each second in the last 5 (only on my device) | 1 tap each second in the last 3 | Same ring, no pulse |
| X11 | **FINAL LAP** | `final_lap` event | A checkered banner sweeps across the screen (700ms) with the text "FINAL LAP — one turn each". Timer rings turn checkered. Each player gets a "last turn" chip, which clears once they've played. | `final-lap-horn` | long | Banner fades in and out |
| X12 | **Victory** | `game_finished` | The final card plays in slow motion (X7 timing), the screen dims to 60%, and the winner's avatar scales up into the spotlight. Confetti (150 particles on phones). The podium rises (1st, 2nd, 3rd; `spring.bouncy`, 120ms apart). Points and Passport stamps count up. If I won: "YOU WIN" in the display font plus the crowd `cheer`. | `win-sting` + `cheer` | celebration pattern | A static podium |
| X13 | **Leaderboard motion** | A leaderboard snapshot arrives | Rows move to their new positions with a FLIP layout animation (`spring.soft`). A ▲3 / ▼1 chip shows for 4s. New #1: a crown drops in and a gold shimmer sweeps across the row. 🔥 flame after 3 ranked wins in a row. The Top 16 cut line is a glowing divider, and anyone who crosses it gets a "Now in the Top 16!" toast. | `rank-up` (own row only) | — | Rows reorder instantly, chips remain |
| X14 | **New Connection** | Game start, for opponents I've never played | A passport stamp thunks next to the opponent's avatar ("NEW · Finance"), with slight ink-bleed texture | `stamp-soft` | light | Static badge |
| X16 | **Ambient table** | Always on | Felt gradient plus 3% animated grain. A slow diagonal light sweep every 12s. Vignette. Tint = current color at 12% opacity. | — | — | Static gradient |
| — | **Emote** (G12) | `emote` | A bubble pops from the sender's avatar (`spring.bouncy`), floats up 24px, and fades after 1.8s | `pop` (quiet) | — | Bubble without float |
| — | **Illegal-move nudge** | Engine error | The card shakes 4px × 3 and springs back, and a hint toast appears | `thud` | light | Toast only |

## 6. TV broadcast package (`/tv`)

**Canvas:** designed at 1920×1080 and scaled to fit (4K is supported). Safe area inset 5%. **Minimum text size: 32px** body and 56px names, so it's readable from 5 meters. The TV runs its own queue per table and follows the same timing rules.

| Scene | Contents | Motion |
|---|---|---|
| **Bracket Board** (default) | Rounds as columns, with a table card for each match. The live table tile shows avatars, card-count bars, the current player's ring, and the current color. The ticker runs along the bottom. There's a QR code in the corner. | Advancement lines **draw** from the winner to the next slot (800ms stroke animation) and the avatar slides along them. +4 and CAUGHT! stamps also appear on the table tile. The ticker scrolls at 80px/s. |
| **Player Intros** (E8) | A walk-out card for each player: avatar, name, department, seed, record, signature card | Cards slide in from alternating sides, 400ms apart, with light-sweep glints, and hold for 6s |
| **Selection Show** (E9) | Seeds revealed from 16 down to 1 | For each seed: drumroll `drumroll`, card flip revealing the player, name typed out, the card flies to its table slot. The top 4 seeds get longer suspense and a spotlight. Finale: the whole bracket assembles, followed by a confetti burst. About 8 minutes, with an admin **Next** button (auto mode optional). |
| **Pick'em Standings** (E10) | The top 10 predictors, the most-picked players at each table, and the crowd's champion pick | Bar-race animation |
| **Department Cup** (C4) | Department bars | Bar race, with the leader crowned |
| **Crowd Reactions** (E11) | Floating emojis next to the table they're aimed at | Rise with a slight wobble, fade over 2.5s. At more than 20 reactions per second, switch to a "hype meter" per table. |
| **Featured Table** | One table full-screen. Hands revealed only in E15 mode (P2). | Same moment catalog at TV scale |
| **Awards** (E14) | One superlative at a time | Envelope-open flip, then the winner's avatar with a stat line, `win-sting` |
| **Champion** (E7) | Spotlight, name, avatar in a gold frame, final standings | Fireworks (600 particles), confetti loop, and a slowly rotating light beam. The bracket's champion path turns gold. |
| **Paused / Broadcast** (AD6, AD7) | A full-width banner across any scene | Slides down, and pulses gently while paused |

**Scene transitions:** a 600ms wipe in the NueSynergy brand color with the logo mark. The admin's TV director controls (AD8) switch scenes. Auto mode cycles Bracket → Pick'em → Cup between rounds.

**Match callout** (N3): when a table becomes ready, the TV shows "TABLE C — Priya · Marcus · Dana · Lee — to your table!" (a 5s lower third). At the same moment, those players' phones show a full-screen takeover.

## 7. Sound design

- **Palette:** tactile and warm. Card snaps, felt thuds, and paper shuffles for everyday moves. Brassy stingers only for signature moments. No constant music on phones.
- **Phone set** (≤ 400 KB as a single sprite file): `shuffle`, `deal-tick`, `flip`, `card-snap`, `draw`, `tick`, `tick-soft`, `stamp`, `stamp-soft`, `whoosh-color`, `whoosh-reverse`, `slam`, `uno-shout`, `siren-short`, `final-lap-horn`, `win-sting`, `rank-up`, `pop`, `thud`.
- **TV set** (loaded separately, can be bigger): all of the above plus `crowd-ooh`, `cheer`, `drumroll`, `fanfare`, and a low ambient bed during the bracket (set by the admin, at a low volume).
- **Mix:** everyday sounds at −18 LUFS, signature sounds at −12. A master volume control. **Sound is off by default on phones.** It's turned on with the speaker toggle in the corner of the game screen (browsers only allow audio after a tap anyway).
- **Sourcing:** royalty-free libraries (e.g. Kenney, Sonniss GDC bundles) or custom-made sounds. Every source and its license go in `apps/web/public/audio/CREDITS.md`.
- **Implementation (changed 2026-09-25):** every sound is **synthesized with the Web Audio API** (`apps/web/src/audio/sound.ts`): oscillators and filtered noise shaped by envelopes. There's no sprite file and no Howler.js. That means 0 KB to download, nothing to license or credit, and nothing that can fail to load on office Wi-Fi. The sound names above are unchanged, and the TV set adds `reveal`. The first tap after sound is turned on unlocks the audio context (iOS). Event → sound + haptic mapping is in `audio/cues.ts`, with unit tests. If real recorded sounds are wanted later, swap the recipe for a sample; the call sites don't change.

## 8. Haptics

`navigator.vibrate` works in Android Chrome only. iOS Safari doesn't support it, so haptics are a bonus there and never required.

| Name | Pattern (ms) |
|---|---|
| light | `[10]` |
| medium | `[20]` |
| heavy | `[35, 30, 35]` |
| double tap | `[15, 60, 15]` |
| long | `[120]` |
| celebration | `[30, 50, 30, 50, 80]` |

## 9. Performance governance

- **Libraries:** Framer Motion (layout animations, springs, gestures, and drag-to-play), `canvas-confetti` (particles in a separate worker-backed canvas), and Web Audio (synthesized sounds, §7). **No** heavy 3D engine. The 3D card flip uses CSS `rotateY` with `backface-visibility`. Effects and sounds load only when the game route opens.
- Animate **only** `transform` and `opacity`. Add `will-change` only while an animation is running. Card faces are pre-built SVG sprites, and there are no layout-triggering properties in motion loops.
- **Frame-rate monitor:** an rAF sampler runs during effects. If the average is under 45fps over 2 seconds, switch to **Reduced** for the session and show the notice "Effects reduced for smoother play" once.
- **Particle caps:** 150 on phones, 600 on the TV, 0 in Reduced.
- **Test devices:** iPhone 12 (Safari), Pixel 6a (Chrome), a mid-range Windows laptop (Edge), and the event TV laptop (Chrome, 1080p and 4K).

## 10. Assets to produce

| Asset | Count | Owner | Due |
|---|---|---|---|
| Card faces (SVG, original art, with color shapes) | 54 unique faces | Design | Week 1 |
| **Nue Wild** and **Nue Wild +4** hero art | 2 | Design + Marketing | Week 1 |
| Card backs (default plus unlockables) | 1 + 3 (P2) | Design | Week 2 |
| Stamps: 🚫 Skip, +2, +4, UNO!, CAUGHT!, FINAL LAP, NEW connection, crown, 🎯 | 9 SVG | Design | Week 2 |
| Avatars (preset) and frames | 12 + 4 | Design | Week 1 |
| Display font and UI font (licensed for web) | 2 | Design | Week 1 |
| Sound sprites (phone and TV) plus credits | about 25 | Eng / Design | Week 3 |
| TV backgrounds, scene wipe, logo mark | set | Design | Week 4 |
| Physical table signs with QR codes (A4, printed) | about 8 | Events | Week 5 |
| Teaser video (about 30s) | 1 | Marketing + Eng | Oct 8 |

## 11. Review and QA

- **Effects gallery:** the dev-only route `/dev/effects` can trigger every moment in this catalog in any effect mode, on a fake table. Every X-story is reviewed there before it's merged.
- **Definition of done for each moment:** it matches this spec's timing (±20%), has Reduced and Off variants, keeps input unblocked, holds 60fps on the test devices, has its sound wired up (P1), and has a Playwright visual snapshot of its final frame.
- **Rehearsal:** the complete TV run-of-show (Selection Show → Bracket → Awards → Champion) runs start to finish on the real event TV during the Week 5 dry run.
