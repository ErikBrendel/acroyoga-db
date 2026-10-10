# 3D Pose Model

Code: `src/3d/skeleton.ts` (joint definitions), `src/3d/humanPose.ts` (data model), `src/3d/Bone.ts` (angles ↔ rotation), `src/3d/Human.ts` (rendering), `src/components/PoseEditor3D.tsx` (editor, dev mode only).

## Conventions
- Y up, the human faces +Z, their left side is +X. Units: metres and degrees.
- All angles 0 = standing upright, arms hanging, palms facing the thighs, feet flat.
- Paired joints are defined once (left side); the right side is generated as the mirror image.
  The same value means the same movement on both sides (positive `straddle` = leg outward on either side),
  so equal left/right values mean a symmetric pose.
- Angles are applied in the listed order as intrinsic rotations (e.g. hip: pike → straddle → rotate),
  so `straddle` in a pike spreads the legs within the piked plane.
- `rotate` is positive outward everywhere (hip turnout, shoulder external rotation, forearm supination).

| Joint | Bone | Angles |
|---|---|---|
| `root` | pelvis | `turn` (face left), `pitch` (lean forward), `roll` (lean left) |
| `waist` | lower back | `bend` (forward), `side` (left), `twist` (left) |
| `chest` | upper back | `bend`, `side`, `twist` |
| `neck` | head | `turn` (left), `nod` (down), `tilt` (left ear down) |
| `hip` | upper leg | `pike` (forward), `straddle` (outward), `rotate` (outward) |
| `knee` | lower leg | `bend` |
| `ankle` | foot | `point` (toes down), `tilt` (sole inward) |
| `shoulder` | upper arm | `forward`, `raise` (sideways), `rotate` (outward) |
| `elbow` | lower arm | `bend`, `rotate` (supinate) |
| `wrist` | hand | `flex` (towards palm), `tilt` (towards thumb) |

Ranges live in `skeleton.ts`; the stored data never contains limits, axes or bone lengths.

## Stored format
```json
{
  "position": [0, 0.97, 0],
  "joints": {
    "root": {"pitch": -90},
    "hip": {"pike": 90, "straddle": {"left": 10, "right": 30}}
  }
}
```
- `position` is the pelvis in world space.
- Angles that are 0 are omitted; joints without non-zero angles are omitted.
- Paired joints: a number when left and right agree, `{left, right}` otherwise. The serializer
  produces the shorthand automatically, so it never needs to be set by hand.
- Mirroring a pose = swap left/right values, negate the Y/Z-axis angles of unpaired joints
  (`side`, `twist`, `turn`, `tilt`, `roll`) and negate `position[0]`.

## Interpolation (not built yet)
Interpolating each angle linearly gives anatomically plausible in-between poses, since every
joint stays within its limits. Only `root` should be converted to a quaternion and slerped,
because its angles are unbounded.

## Next steps
- Two humans (base + flyer) per pose: `{ base: HumanPose, flyer: HumanPose }`.
- Store 3D data per pose (e.g. `public/data/poses3d/<poseId>.json`) via the dev API, mirrored poses derived via mirroring.
- Read-only 3D preview in the pose sidebar, transition playback.
