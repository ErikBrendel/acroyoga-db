# 3D Pose Model

Code: `src/3d/skeleton.ts` (joint definitions), `src/3d/humanPose.ts` (one person), `src/3d/acroPose.ts` (base + flyer
+ contacts, contact solver), `src/3d/sites.ts` (contact sites), `src/3d/Bone.ts` (angles ↔ rotation), `src/3d/ik.ts` (IK),
`src/3d/Human.ts` (rendering), `src/components/PoseEditor3D.tsx` (editor, dev mode only).

## Conventions
- Y up, the human faces +Z, their left side is +X. Units: metres and degrees.
- All angles 0 = standing upright, arms hanging, palms facing the thighs, feet flat.
- Paired joints are defined once (left side); the right side is generated as the mirror image.
  The same value means the same movement on both sides (positive `straddle` = leg outward on either side),
  so equal left/right values mean a symmetric pose.
- Angles are applied in the listed order as intrinsic rotations (e.g. hip: pike → straddle → rotate),
  so `straddle` in a pike spreads the legs within the piked plane.
- `rotate` is positive outward everywhere (hip turnout, shoulder external rotation, forearm supination).
- The shoulder girdle (`clavicle`) pivots at the top of the breastbone and moves the shoulder joint; the
  upper arm keeps its orientation (`keepsOrientation`), so shrugging lifts a hanging arm without swinging it.
  IK of an arm includes the girdle.

| Joint | Bone | Angles |
|---|---|---|
| `root` | pelvis | `turn` (face left), `pitch` (lean forward), `roll` (lean left) |
| `waist` | lower back | `bend` (forward), `side` (left), `twist` (left) |
| `chest` | upper back | `bend`, `side`, `twist` |
| `neck` | head | `turn` (left), `nod` (down), `tilt` (left ear down) |
| `hip` | upper leg | `pike` (forward), `straddle` (outward), `rotate` (outward) |
| `knee` | lower leg | `bend` |
| `ankle` | foot | `point` (toes down), `tilt` (sole inward) |
| `clavicle` | shoulder girdle | `protract` (shoulder forward), `elevate` (shrug up) |
| `shoulder` | upper arm | `forward`, `raise` (sideways), `rotate` (outward) |
| `elbow` | lower arm | `bend`, `rotate` (supinate) |
| `wrist` | hand | `flex` (towards palm), `tilt` (towards thumb) |

Ranges live in `skeleton.ts`; the stored data never contains limits, axes or bone lengths.

## Stored format
```json
{
  "base": {"position": [0, 0.156, 0], "joints": {"root": {"pitch": -90}, "hip": {"pike": 90, "straddle": {"left": 10, "right": 30}}}},
  "flyer": {"position": [0, 1.07, -0.11], "joints": {"root": {"turn": 180, "pitch": 105}}},
  "contacts": [
    {"a": {"flyer": "right-hip"}, "b": {"base": "left-sole"}, "symmetric": true}
  ]
}
```
- `position` is the pelvis in world space.
- Angles that are 0 are omitted; joints without non-zero angles are omitted.
- Paired joints: a number when left and right agree, `{left, right}` otherwise. The serializer
  produces the shorthand automatically, so it never needs to be set by hand.
- Mirroring a pose = swap left/right values, negate the Y/Z-axis angles of unpaired joints
  (`side`, `twist`, `turn`, `tilt`, `roll`) and negate `position[0]`. An acro pose mirrors both people
  and the contacts.
- The angles are the stored solution; the contacts say what has to hold when the pose is edited
  (or, later, when body proportions change and the pose is re-solved).

## Contact sites (`src/3d/sites.ts`)
- A site is a point on the body surface with a frame: the normal points out of the surface, the
  direction along it (palm / sole: towards fingers / toes; limbs: towards their far end; torso: towards the head).
- Named sites: `palm`, `hand-back`, `sole`, `instep`, `knee`, `shin`, `thigh`, `hip` (front of the hip bone),
  `shoulder` (top, between neck and arm), each with `left-` / `right-`; `belly`, `sacrum`, `chest`, `upper-back`, `crown`.
- Any other point: `{"segment": "left-shin", "along": 0.7, "around": -60}` with `along` 0 at the joint
  (crotch for the pelvis) to 1 at the far end, `around` in degrees from the front, positive towards the
  outside of a limb or the left of the torso. Segments: `pelvis`, `lower-back`, `upper-back`, and per side
  `thigh`, `shin`, `upper-arm`, `forearm`. The surface comes from the body mesh's cross-sections.

## Contacts
- `a` touches `b`: same point, normals facing each other, and `a`'s direction turned by `twist` degrees
  (default 0) about its normal relative to `b`'s: 0 = parallel, 180 = opposite, 90 = crossed.
  The twist is the same seen from either side. `a` is the side that was moved when the contact was made.
- `"symmetric": true` stands for the contact plus its mirror image (sides swapped, twist negated). The
  serializer produces it for every mirror-image pair; contacts between centre sites (belly on sacrum)
  are their own mirror image and stay single.
- Connect tool (C): click the site to move, then its target on the other person. A site on an arm or
  leg gets there by IK of that limb, a torso site (or with ⇧) moves the whole person. In symmetric mode
  the mirror contact is added too; a symmetric pair on the torso is fitted together (average rotation,
  matching centroids) and the other person's limbs close what is left. The twist snaps to the nearest
  multiple of 90°.
- Holding contacts after an edit (`followContacts`): the edited person keeps what the edit changed,
  everything else adapts:
  1. the other person as a whole, for contacts on their torso — shifted if the edited person's
     contact limbs can turn to match, otherwise turned too,
  2. the other person's contact limbs,
  3. the edited person's contact limbs, keeping the edited angles.
  Pins win over contacts. A contact that cannot be held is shown red with how far off it is.

## IK pins (editor only, `src/3d/ik.ts`)
- A hand or foot can be pinned at its contact point (centre of the palm surface / of the sole): that
  point's world position and orientation become the pin. Pins never move by themselves.
- Dragging a pin with the gizmo solves that limb for position only; the hand / foot turns with the limb
  and its new orientation is pinned on release. A pin dragged out of reach stays where it was dragged.
- Every other edit (pelvis, spine, joint sliders and gizmos, presets, mirror, import; not undo) is applied
  first, then pinned limbs are solved back onto their pins:
  - the angles the edit changed within a pinned limb are kept if the rest of the limb can still reach
    the pin, e.g. rotating the upper arm of a pinned hand swivels the elbow;
  - otherwise the whole limb is solved, as close to the edited pose as the pin allows, e.g. a "T arms"
    preset moves the unpinned arm into T and leaves the pinned one at its pin.
- Solver: damped least squares over the chain's semantic angles, clamped to the joint limits, with a
  null-space term that keeps redundant freedom (e.g. elbow swivel) close to the starting angles.
  It is local, so it keeps the current knee / elbow direction rather than picking the anatomically
  most natural one.
- Pins are stored in the editor draft, not in the pose data.
- Locks (🔒 per angle, also in the draft): IK and contacts never change a locked angle; the user still can.
  Whatever is being dragged (slider, number field, rotation gizmo) counts as locked during the drag.
- Pause (S) stops IK and contact solving; resuming solves everything changed since as one edit of the
  active person.
- Tests: `pnpm test` (vitest), next to the sources in `src/3d/*.test.ts`.

## Interpolation (not built yet)
Interpolating each angle linearly gives anatomically plausible in-between poses, since every
joint stays within its limits. Only `root` should be converted to a quaternion and slerped,
because its angles are unbounded.

## Next steps
- Floor contacts as contacts (replacing pins and the planted presets), so the base stays on the floor
  when the solver has to move them.
- Transitions: interpolation that keeps the contacts that exist in both poses.
- Body proportions: re-solving stored poses from their contacts.
- Store 3D data per pose (e.g. `public/data/poses3d/<poseId>.json`) via the dev API, mirrored poses derived via mirroring.
- Read-only 3D preview in the pose sidebar, transition playback.
