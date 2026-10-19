# folded-leaf-tucked-through

## 2026-10-19: generated
First draft (kept as `data-drafts/renders/folded-leaf-tucked-through-before.png`, params in the scratchpad only): base legs angled about 45° away from his head with bent, outward knees, her torso hanging below his feet on the far side. A human rejected it ("looks bad, take more inspiration from folded-leaf"). The full lessons are in the revised report below.

## 2026-10-19: revised
- **Result**: draft `data-drafts/poses3d/folded-leaf-tucked-through.json`, params `data-drafts/params/folded-leaf-tucked-through.json`, renders `folded-leaf-tucked-through.png` (all views) and `-side.png`. The single contact, base soles in her hip creases (symmetric), holds (0 mm, 1°). No angles at their limits.
  - **Base**: "O-legs", as the user asked mid-task. Hip pike 110, knee 60, hip rotate 50 (all locked), straddle free (the solver settled at about 22). The thighs lean towards his head and the knees bend, so his feet sit straight above his pelvis (soles at z 0, y 99). That meets "legs must stay upright for balance". Knees are at ±29 cm, wide open.
  - **Base feet**: soles in her hip crease (`left-thigh` along 0.05 around 10, as in folded-leaf). Heels closer together than toes: heel x ±5, sole ±12. Arms on the floor, as in folded-leaf.
  - **Flyer**: deep hip fold (pike 135, straddle 15, `fitRotate`). Her thighs are about horizontal on his soles, and her upper body folds down through his open legs towards her own knees. Her head hangs at about 26 cm above the floor behind his pelvis. Her arms hang straight with the hands 13 cm above the floor.
  - **For the human to check**:
    - **Back on his legs is not a contact.** Her waist and lower back sit against the inside of his knees, but as a 7 cm overlap of the rough capsules (`base left/right-knee and flyer waist`), not as a modelled contact. Her shoulder blades are 10 cm from his calves.
    - **Feet flagged.** Toes are 40° outward (hip rotate 50, ankle turn -10) and soles are tilted -20°. The Feet section flags "toes turned far out, hip strongly rotated". The O-legs need the hip rotation. The ankle values compensate for it, so folded-leaf's 28° could not be kept.
    - **Balance.** Her centre of mass is 24 cm off the two soles, towards her legs (seen from above). It is held only if her back really leans on his legs: she hangs below his feet, and the rotation presses her into his knees. With a contact this would show up as support; without one the report calls it off balance.
- **Decisions**:
  - **Reading of the description**: "upper body through the base legs" plus "back on the underside of his legs" only fits together if his legs pass beside her body. With his soles in her crease (folded-leaf placement), his feet are inside her hip fold. Her torso can only get to the other side of his legs if the legs bow out around her. I spent most of the session finding that out (see Time sinks). The user's two hints (O-legs and a deep hip fold; legs upright) settled it.
  - **No back contact**: every attempt to add a second symmetric contact (shoulder blade, upper back or waist on his shins, knee pits or the backs of his thighs) broke the sole contact. These were `fit` (translation, with or without `fitRotate`) and a base-shin `reach`, and the error was 4–60 cm. Two contacts on one base leg fight, as the doc says. A fit with the legs locked is only a translation and cannot close both. I kept the carrying contact exact and report the rest.
- **References**:
  - **No source for the variant.** No web or YouTube source shows "tucked through". Searches for folded leaf tuck/thread-through found nothing.
  - **Closest text**: the Free AcroYoga Manual (slideshare) describes "Folded Leaf to Paschimo". From folded leaf, the flyer takes her hands through the base's legs; the base keeps his legs at 45° and bends them to make room. That misled my first draft into angled legs.
  - **Storyboard frames**: the Laura & Stu "Folded Leaf Series" frames (yPJR9NtpEls, fetched by hand before `pose:frames` existed) showed only plain folded leaf.
  - **Example poses**: folded-leaf's revised params were the most useful starting point, as the coordinator said. The approved straddlebat and front-plank were less useful.
- **Tools**:
  - `pose:solve --vary` about 45 times, `--sort` / `--only-ok` in the second half.
  - Full `pose:solve` reports about 12 times, `pose:check` with sites about 6, `pose:suggest` about 40 (mostly through a script), `pose:render` 7 times. One render failed transiently. One solve failed while someone edited `src/3d/sites.ts` (`SOLE_DEPTH` undefined).
  - `pose:suggest <draft> flyer:<site> base:<segment>` was the best tool for "how far is her back from his legs".
- **Missing**:
  - **Scratch scripts** (scratchpad): `rank.py` ranked `--vary` lines by contact error. `descent.py` / `descent2.py` ran a coordinate descent over params paths via `--vary`; it got stuck at 3–5 cm. `gap.py` ran soles-only variants and printed the sole error, overlap count, foot position, `pose:suggest` back-to-shin gap and balance per variant. It was the most useful of the three.
  - **Root pitch beyond 180**: setting pitch 190–220 had no effect at all. The doc says "pitch alone stops at 180", but the summary lines don't warn when a varied value is clamped.
  - **Site shorthand**: `pose:suggest` does not accept `segment@along@around` shorthand for the first site (Unknown site error), while `pose:check` does.
  - **Sign of root pitch**: for an upside-down flyer (`roll 180`) the sign is easy to get wrong. I guessed it wrong twice.
- **Time sinks**:
  - **Geometry**: about 25 rounds trying to make "back on his legs" and "soles in her crease" hold at once with straight or angled base legs. It is geometrically impossible without bowed legs. A sketch of which side of his legs each of her body parts is on would have shown that in one step.
  - **Restart**: about 10 rounds after the restart from folded-leaf trying fits that combine both contacts.
- **Suggestion**: let a contact be marked as "resting" (checked and reported as a gap and facing, but not solved), or let a fit contact on a person's torso close the rest with the other person's limb when that limb already carries a reach. Then a flyer leaning on the base's legs could be expressed without breaking the carrying contact.
