# Generating poses with AI

AI agents write drafts of a pose's 3D data to `data-drafts/poses3d/<poseId>.json`. Drafts are never deployed:
the pose panel shows them with an "AI draft" label (dev mode only), and a human approves one by opening it
in the 3D editor ("🎭 Open in 3D editor") and saving. Agents only write drafts, never `public/data/`.

## Before you start
- Read `docs/3d-model.md`: conventions, joints, sites, contacts.
- The pose's name and description in `public/data/poses.json` are the ground truth, written by a human.
  Neighbouring poses in `public/data/flows.json` tell how the pose is entered and left.
- The pose's `links` in `public/data/poses.json` point to pages that show it. Open them and look at the photos
  (download an image with curl into a scratch folder and open it with Read): they are the reference for the
  shape, the description only names it. Photos are often taken from above the base's head (mirrored compared
  with the editor's Front view; render `--view "Head end"`), others from the side (`--view Side`). Look at what
  each limb presses against and from which side, not only where it is. Never copy images into the repo. Note
  where a reference disagrees with the description; the description wins, but say so in your report.
- Video frames without yt-dlp: fetch the YouTube watch page and read the storyboard `"spec":"https://i.ytimg.com/sb/<id>/storyboard3_L$L/$N.jpg?sqp=…|…"`.
  The last levels have the most detail (`L2`: 160×90 frames, 5×5 per sheet, 1 s apart; `L3`: 320×180, 3×3,
  2 s apart). Request `…/storyboard3_L<level>/M<n>.jpg?sqp=…&sigh=<that level's rs$… part, $ as %24>`;
  sheet `M<n>` starts at frame n × columns × rows. Crop a cell with ffmpeg. Tutorials often show entries and
  grips more clearly than photos.
- Looking at an image costs about width × height / 750 tokens (up to about 1600). Check numerically first (the
  report's Feet, heights and Balance, `pose:check` sites), and look at images to compare with the photos:
  renders with `--width 512` unless you need a detail, reference photos scaled to at most 768 px, and for a
  detail (a grip, a foot) a crop of just that region rather than the whole photo. Do not hand images to a
  cheaper model: tested 2026-10 on six known photos, Haiku named the wrong pose or confirmed a wrong one, Sonnet
  missed pose names and contact points; both were not good enough even for screening references.
- Approved poses in `public/data/poses3d/` are the best examples (`front-plank.json`).
- The dev server must run (`pnpm dev`) for rendering only.

## Tools
| Command | Does |
|---|---|
| `pnpm pose:orient '<joints JSON>' [presets…]` | Which way head, front, own left, soles and palms point. Use it before guessing root angles. |
| `pnpm pose:solve <params.json> [--out <file>]` | Builds and solves the pose, writes the draft (or `--out` for trying variants), prints a report (below). Takes about 2 s. |
| `pnpm pose:solve <params.json> --vary <path>=<v1>,<v2> [--vary …]` | Solves every combination and prints one summary line each (contacts ok, worst error, limits, overlaps, whether the flyer is over its support, the base's knee and elbow bends); writes nothing. `<path>` is a dot path into the params, e.g. `flyer.joints.hip.pike` or `contacts.0.a.flyer.around`; values are JSON or plain text (`contacts.0.twist=free,0`; commas inside JSON do not split: `base.joints.ankle.turn={"left":5,"right":30},5`). A path can reach one side, `base.joints.ankle.turn.right=20,30`, once the params give that angle as `{left, right}`. Failing contacts are listed by index. `--show base.left-elbow.bend,base:left-palm` adds chosen angles or site positions (cm) to each line. Use it instead of hand-written loops. |
| `pnpm pose:suggest <params.json \| pose.json> [<role>:<site> [<role>:<segment>]]` | Where contacts could go: free hands and feet near a surface facing them, or with a site (`flyer:left-palm`) its best points on the bodies, optionally on one segment (`base:left-thigh`). Prints ready contact JSON. Works on params and on stored drafts. |
| `pnpm pose:check <pose.json> [<role>:<site>…]` | The same report for stored pose data as it is, e.g. a draft under review or an approved pose to compare with. With sites (`flyer:left-instep`, or `base:right-shin@0.3@-125` for segment@along@around), their position, normal and direction. |
| `pnpm pose:render <poseId> [--view Side] [--width 512] [--saved]` | Renders the draft in the 3D editor to `data-drafts/renders/<poseId>.png` (Front, Side / Angled, Top) or one larger view, also `"Head end"` (from above the base's head, like many photos); `--width` makes it smaller and cheaper to look at. |

`pose:render` needs the dev server (`POSE_APP_URL`, default `http://localhost:5173/acroyoga-db/`) and starts a
headless Chrome with remote debugging on port 9333 (`POSE_CHROME_PORT`) if none runs. Each call uses its own
tab, so several agents can render at the same time. Look at the PNG: the solver does not judge whether the pose
looks like the description. Editor colours: left side cool (blue / teal), right side warm (orange / pink);
base legs blue / orange, flyer legs teal / pink.

## params.json
```json
{
  "poseId": "chair",
  "base": { "presets": ["L-base"], "joints": { "knee": { "bend": 5 } } },
  "flyer": { "joints": { "root": { "turn": 180 }, "hip": { "pike": 90 }, "knee": { "bend": 90 } } },
  "contacts": [
    { "solve": "fit", "a": { "flyer": "right-sit-bone" }, "b": { "base": "left-sole" }, "twist": "free", "symmetric": true },
    { "a": { "base": "left-palm" }, "b": { "flyer": "right-sole" }, "twist": "free", "symmetric": true },
    { "a": { "flyer": "left-palm" }, "b": { "flyer": "left-hamstring" }, "twist": "free" }
  ],
  "locks": { "base": ["hip.pike"], "flyer": ["spine"] }
}
```
- People: `presets` (applied in order, names as in the editor: `L-base`, `Namaste`, `Hands on hips`, …, see
  `src/3d/presets.ts`), then `joints` (stored format). `position` sets the pelvis; `grounded` (default: base
  true, flyer false) drops the person onto the floor.
- Contacts are in the stored format plus `solve`:
  - `reach` (default when `a` is on an arm or leg): `a`'s limb moves by IK;
  - `fit` (default otherwise): `a`'s person moves as a whole, then `b`'s limb reaches back if `b` is on a limb.
    All `fit` contacts of one person are fitted together. `"fitRotate": true` (a top-level params key, not on a contact) also turns the person so that
    the contact normals match on average; it helps when the base's angled legs tilt the soles (whale), but can
    turn the person over completely when several contacts pull in different directions.
  - A fit has no preferred height: a flyer fitted onto the base's soles ends up where the base's legs are fully
    stretched. For a flyer lying on the base's feet it is often better to give the flyer a `position` (and root
    angles) and let the base's soles `reach` (`a` = base sole). Vary the position with `--out` variants.
  - A `reach` moves only `a`'s limb, never `b`'s. For a hand-to-hand grip, set the base's arms by angles (locked,
    swept with `--vary`) and let the flyer's palm (`a`) reach; making the base's palm `a` gave messy wrists.
  - A limb placed ready next to a body part without carrying it (an entry pose: the base's foot beside the
    flyer's hip before she leans in) is not a contact: set it by angles and check it with `pose:check` sites.
  - A contact within one person (hand on own thigh) is held by whichever of its sites is on a limb.
- `twist`: start with `"free"` unless the pose prescribes how the parts are turned against each other (e.g.
  toes pointing to the base's head). The report shows the twist the solver found; fix it afterwards if needed.
- `locks` keep angles out of the solver: `legs`, `arms`, `spine`, a joint (`knee`), a joint angle (`hip.pike`),
  each optionally for one side (`left-knee.bend`, `right-arm`, `left-leg`). Lock what the pose prescribes and the solver should not trade
  away, typically the base's legs in an L-base (`hip.pike`, `knee`) and the flyer's arms in a fixed arm shape.
  Without locks, IK takes the nearest solution, e.g. bending the base's knees instead of straddling the legs.
- `rounds` (default 6): fits and reaches alternate this often.
- Keep the final params as `data-drafts/params/<poseId>.json` next to the draft, so a revision can start from them.
- Two contacts on one limb (a foot hooked with the instep and the shin crossing another leg) fight each other:
  the second reach undoes the first. Keep one as a contact and get the other by the limb's angles, checked with
  `pose:check` sites or the overlaps.
- A `reach` gets the position first and the orientation only as far as the limb allows; when a sole stays
  several degrees off in every variant, try `"solve": "fit"` for that contact, or move the other person.

## The report
- **Contacts**: error per contact (`ok` within 10 mm / 5°, the editor's tolerance), where it is, and the normals
  and directions of both sites (direction = towards fingers, toes, a limb's far end or the head), so the twist
  can be read off: e.g. toes `-Z` on a thigh pointing `+X` is a 90° crossing. Position errors mean out of reach; orientation errors usually mean a joint at its limit.
- **Angles at their limits**: the usual reason for a contact that does not hold, or for an odd look.
- **Key points**: root angles, pelvis centre (about 10 cm inside the body), head, chest, upper back, sacrum,
  palms, knees, soles of both people in cm, and the lowest point above the floor (the base should be 0, a
  flyer below 0 is in the floor). Use them for checks like "feet above the base's face" without a render.
- A contact that does not hold names straight knees / elbows of its limbs: the target is then out of reach.
- **Possible contacts**: free hands and feet within 12 cm of a surface that faces them (on the other person,
  or on the same person outside their own limb), with ready contact JSON. Check each against the description:
  hands resting on knees, palms together in Namaste, crossed ankles are contacts too and hold the shape.
- **Lowest surface point above the floor**: head, back, pelvis, hands and feet per person. Catches hands floating
  instead of resting on the floor, or a base lifted off it.
- **Feet**: all four feet: toes turned outward (hip rotation and ankle turn together; negative = turned in),
  the sole's roll (positive = sole facing inward) and point. `<- check` marks what humans corrected before:
  inward or far-out toes, sickled soles, strongly rotated hips. None of the approved poses is marked.
- **Balance**: centres of mass from rough body-part masses. The flyer's should lie over the contacts that carry
  it (seen from above), and both people's together over the base's floor contact; anything outside falls over
  unless a grip pulls against it (counterbalance poses like whale). Per contact on the base it lists the bend of
  the base limb taking it: stacked (nearly straight, bones in line with the load) is what bases aim for in
  L-basing; a strongly bent limb under a big load is a sign the pose is off.
- **Overlaps**: body parts sinking into each other by 3 cm or more (rough capsules, parts in contact excepted;
  touching forearms or hands of one person can show up and are fine).
- **Heads**: a head within 10 cm of the other person, with the nearest body part (negative = into it). Decides
  low poses like straddlebat (head on the base's belly), where overlaps show nothing below 3 cm.
- The solver is local: starting angles matter, especially of ankles and wrists that a reach barely turns, and a
  site on a limb that another contact also moves rolls with that limb's rotation (e.g. a thigh's `around` shifts
  with `hip.rotate`). Sweep such values with `--vary`.

## Physics
**A holding contact is not a correct pose.** The contact error only says that a site matches the target you
chose. Named sites and your own `around` values are guesses; check the result against the photos (render
close-ups) and the Feet section. Every human correction so far was on something whose contacts held: rolled
base soles, sickled flyer feet, a hand on the wrong side of a leg, an over-wide straddle.

If reaching something the brief asks for costs an odd angle (a wide straddle, a twisted hip, an ankle at its
limit), say so in your report instead of paying it silently; the human decides.

The base's feet are usually the most important contact: they carry the flyer, and humans notice at once when
they sit in the wrong place or are turned or rolled oddly. Compare their position on the flyer, the toe direction
and the sole's roll with the photos (report section "Base's feet"), and lock `ankle` and `hip.rotate` once they
are right, or the solver turns them to close other contacts (it turned a throne base's toes 12° inward).

Before tuning angles, think through where the weight goes, and check it in the Balance section:
- Which contacts carry the flyer's weight, and which only stabilise (hands on ankles, a hooked foot)? The
  carrying ones lie under the flyer's centre of mass; the base's limbs under them are as vertical and straight
  as the pose allows.
- A hand that holds the base's leg for stability grips it from the outside (palm towards the base's midline,
  around ±90 on the limb), not from the top: only then can it pull against sideways tipping.
- Hooks and grips work by pulling against something: a foot hooked around the base's leg presses with its
  instep or the back of the ankle against the far side of the leg, and the leg it belongs to pulls towards the
  flyer. Model the contact on the side that is pressed, not just somewhere near.
- In counterbalances the centre of mass may lie outside the contacts, if a grip pulls the other way; say which.

## Orientation recipes
Checked with `pose:orient`. World: +X is the left of a person standing at turn 0, +Y up, +Z their front.

| Person | Root | Head | Front |
|---|---|---|---|
| Base on the back (L-base) | `pitch -90` | -Z | up; own left +X |
| Flyer upright facing the base (throne, chair) | `turn 180` | up | -Z, towards the base's head |
| Flyer face down, head over the base's head (front plank, bird) | `turn 180, pitch 75…90` | -Z | down |
| Flyer face down, head towards the base's feet (reverse bird) | `pitch 75…90` | +Z | down |
| Flyer face up, head away from the base's head (whale) | `turn 180, pitch -70…-90` | +Z | up |
| Flyer on the right side, head to the base's left (Vishnu's couch left) | `turn 180, roll -90` | +X | -Z |
| Flyer on the left side, head to the base's right | `turn 180, roll 90` | -X | -Z |

Pose names: "reverse" turns the head the other way and keeps the face down (reverse bird); face up with the
head over the base's head is backbird. Check the photos before trusting a brief on this.

More facts:
- `wrist.flex` positive bends the hand towards the palm; the stargrip's bent-back wrists are negative.
- L-base: legs vertical, soles face up, toes point to the base's head (-Z), arms straight up.
- `elbow.rotate -90` turns the palm down with the arm pointing forward.
- A flyer arching back while lying face up drops the chest; compensate with the root pitch.
- A base leg that carries the flyer alone (sidestar, mono poses) stands vertical and straight, the foot above
  the middle of his pelvis (`hip.pike` 90, `straddle` about -6), and the flyer's weight goes over it. Do not
  tilt it to bring her shoulders within reach of his hands: a human rejected that as off balance; close the
  gap with her lean and his arms.
- Base limbs that carry nothing rest on the floor in a stabilising position, unless the pose says otherwise:
  a free leg with the foot flat on the floor (below), free arms on the floor beside the body. A free leg or
  arm hanging in the air was rejected by a human (mono backbird).
- Base lying with the feet flat on the floor (knees up): `hip.pike` about 45, `knee.bend` about 110,
  `ankle.point` about 25 (sole flat when 90 + pike − knee − point ≈ 0). There are no floor contacts yet:
  grounding drops a person by their lowest point, so check that the soles are that point.
- Knee bend moves the foot behind the line of the thigh (towards the person's back), elbow bend moves the
  hand to the front.
- Crossed ankles: two straight legs cannot cross at the ankles without the knees running into each other; bend
  the lower leg's knee a little and hold the crossing with a contact within the person (shin on shin).
- Base arms resting on the floor (lying): about `shoulder.forward -18, raise 45, rotate -80`, elbows straight;
  with the arms closer to the body (`raise 15`) about `forward -11`. More `forward` pushes the hands into the
  floor and lifts the base; check the hands in "Lowest surface point".
- Flyer lying face up (whale): the legs slope below horizontal by about 90 − |root pitch| − hip pike.
- Flyer's feet look natural with modest angles: point up to about 30, tilt within ±15, toes turned slightly
  outward. Agents tend to force extreme, sickled ankles (point 45+, tilt -27, toes turned in) to close a hook,
  and humans correct exactly that; move the leg (straddle, hip rotation, knee) or the contact point instead.
  Same for a wide straddle: throne was corrected from straddle 85 to 68. For a foot hooking around the base's
  calf, a target on the inner side (around -90 to -100) with a relaxed foot works; behind the leg (-125) forces
  a sickled ankle. The hook comes from the leg: less straddle, a little hip external rotation, toes slightly out.
- A bent knee can be right (the lower leg of a crossed-ankle pose bends to cross); judge a leg by its hip
  rotation and foot, which humans correct, rather than straightening the knee.
- Base reaching overhead (whale): with straight arms the palms get to about y 65, z -85 cm; a flyer's ankles
  further away need bent elbows or a lower flyer.
- L-base with a lot of weight in the base's straight arms (star, the 4-Step, hand-to-hand): his shoulder blades
  stay on the floor as extra contact points (`clavicle.protract` not lifted, "Lowest surface point" back near
  0). If his hands then do not reach, bring the flyer lower: angle or tuck the base's legs more, not lift his
  shoulders.
- Stargrip (star and the 4-Step), as approved in `public/data/poses3d/star.json` and its params
  `data-drafts/params/star.json`: symmetric, same-side hands palm on palm, fingers on each other's wrist
  (contact palm → palm, twist 180), not a handshake.
  - The base's palms face the flyer's face: his arms vertical-ish and pronated (`shoulder.rotate 0`,
    `elbow.rotate -85`), tilted 10° towards his feet (`shoulder.forward 80`).
  - Both wrists bent back (`wrist.flex -30` each, locked).
  - The hands are not stacked palm on palm with fingertips at the other's wrist: each hand slides further, so
    the wrists are roughly aligned (each wrist in the middle of the other's palm) and the fingers reach over the
    other's wrist onto the forearm (`wrist.fingers` bends the straight fingers at the knuckles). Model it as
    the flyer's `palm` on the base's `palm-heel`, twist 180: the palms stay flat and parallel, only slid. Not
    palm on the forearm: that tilts the contact by the wrist angle and forces a wrist into an odd bend (a human
    rejected that). In star this needed her wrists at -22 instead of -30.
  - The flyer's forearms parallel, elbows straight above her hands (`shoulder.raise` about 8, locked), elbows
    bent about 90°.
  - The flyer leans a few degrees towards the base's belly, her centre of mass about 7 cm towards his head
    from his soles.
  A human corrected each of these from the first draft; check them first.
- Flyer upside down facing the base's head (star, shoulder stand): root `turn 180, roll 180, pitch -x` for a lean
  of x towards her back; pitch alone stops at 180.
- Grips: a palm on the `achilles` pulls an ankle towards the gripping person, on `ankle` (front) it pushes.
- Twist is measured between the sites' directions (palm / sole: towards fingers / toes; limbs: towards their far
  end; torso: towards the head): 0 parallel, 180 opposite, ±90 crossed.

## Loop
1. Write params from the description: contacts first (named sites where possible), rough angles, locks.
2. `pose:solve`, read the report, fix what it shows (limits, overlaps, contacts off).
3. `pose:render`, compare with the description, adjust; `--view Side` for details.
4. Stop when it matches the description and the contacts are ok, or after about 12 rounds.
5. Write the finishing report (below).

## Revising a pose after human feedback
Humans write what is wrong in the 3D editor's feedback field; it is stored in `data-drafts/feedback/<poseId>.md`
and removed when they approve the pose by saving it.
1. Read the feedback, the pose's description and links (look at the reference photos again), and the current data:
   the draft, or the approved pose if there is no draft. `pnpm pose:check` gives its report.
2. Render it first (`pose:render`) and keep that image as `data-drafts/renders/<poseId>-before.png`.
3. Revise the params (or start from the stored data's angles) until every feedback point is addressed; physics
   and contacts still have to hold. Write the draft as usual; for an approved pose the draft stands next to it
   until a human saves one of them.
   A small correction is easily undone by the solver: it closes the contacts with whatever angles are free, e.g.
   an ankle turned 5° outward came back straight through a 5° inward hip rotation, and a contact with `twist: 0`
   pulled the toes back too. Lock the angles that express the correction (`ankle`, `hip.rotate`), loosen
   what contradicts it (`twist: "free"`), and check the result in the report, not only in the params.
4. Render again and report per feedback point what you changed, and where the reference photos and the feedback
   disagree. Leave the feedback file alone; the human clears or approves.
5. Write the finishing report (below).

## Finishing report (always)
Every generation or revision ends with this report, so the next agent and the tools get better. Append it to
`data-drafts/reports/<poseId>.md` under a heading `## <date>: generated | revised` and give it as your reply.
Be concrete and honest; "everything was fine" teaches nothing.
- **Result**: what you made, contacts ok or not, what still looks off and the human should check.
- **Decisions**: where the description and photos were open or disagreed, what you chose and why.
- **References**: which pages and photos you used, which helped, which misled or were useless; which approved
  poses you used as examples.
- **Tools**: which commands you used (roughly how often), what worked well.
- **Missing**: every scratch script you wrote (what it did), information you lacked, things you had to guess or
  work out yourself (e.g. a recipe, a site position, a camera angle).
- **Time sinks**: what took the most rounds, and why.
- **Suggestion**: the one change to tools or docs that would have helped most.

