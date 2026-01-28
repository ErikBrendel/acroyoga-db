# 3D Pose Editor Implementation Plan

## Vision
Enable 3D pose definition for acroyoga poses using semantic bone-based representation with natural interpolation support.

## Data Model

### Skeleton Structure (15 bones per human)
```
Root (hip/pelvis) - world space position + rotation
├─ Spine → Neck → Head
│  ├─ Left Shoulder → Left Upper Arm → Left Lower Arm
│  └─ Right Shoulder → Right Upper Arm → Right Lower Arm
├─ Left Upper Leg → Left Lower Leg → Left Foot
└─ Right Upper Leg → Right Lower Leg → Right Foot
```

### Joint Angle Definitions

Each joint has 1-3 semantic angles with constrained ranges:

#### Spine (relative to hip)
- `forward-bend`: -90° (back bend) to 90° (forward fold)
- `side-bend`: -45° (lean left) to 45° (lean right)
- `twist`: -45° to 45°
- **Euler order**: XYZ

#### Neck (relative to spine/chest)
- `nod`: -45° (look up) to 45° (look down)
- `tilt`: -45° (tilt left) to 45° (tilt right)
- `turn`: -80° to 80°
- **Euler order**: XYZ

#### Shoulder (relative to chest)
- `raise`: -45° to 180° (vertical raise)
- `extend`: -30° (behind back) to 180° (forward)
- `rotate`: -90° (internal) to 90° (external)
- **Euler order**: YXZ

#### Elbow (hinge joint)
- `bend`: 0° (straight) to 150° (bent)
- **Euler order**: X only

#### Hip (relative to pelvis)
- `pike`: -30° (leg back) to 120° (leg forward)
- `straddle`: -10° to 90° (leg out to side)
- `rotate`: -45° to 45° (internal/external rotation)
- **Euler order**: YXZ

#### Knee (hinge joint)
- `bend`: 0° (straight) to 150° (bent)
- **Euler order**: X only

#### Ankle (relative to lower leg)
- `flex`: -30° (point) to 45° (flex)
- `tilt`: -20° to 20°
- **Euler order**: XZ

### Bone Lengths (fixed proportions)
Standard adult proportions:
- Upper leg: 0.245 × total_height
- Lower leg: 0.246 × total_height
- Foot: 0.039 × total_height
- Spine: 0.30 × total_height
- Neck: 0.052 × total_height
- Head: 0.130 × total_height
- Upper arm: 0.186 × total_height
- Lower arm: 0.146 × total_height
- Shoulder width: 0.129 × total_height (each side from center)

Reference height: 1.75m (175 units)

### JSON Data Format

```json
{
  "base": {
    "rootPosition": [0, 0, 0],
    "rootRotation": [0, 0, 0],
    "joints": {
      "spine": {"forward-bend": 0, "side-bend": 0, "twist": 0},
      "neck": {"nod": 0, "tilt": 0, "turn": 0},
      "left-shoulder": {"raise": 0, "extend": 0, "rotate": 0},
      "left-elbow": {"bend": 0},
      "left-hip": {"pike": 0, "straddle": 0, "rotate": 0},
      "left-knee": {"bend": 0},
      "left-ankle": {"flex": 0, "tilt": 0},
      "right-shoulder": {"raise": 0, "extend": 0, "rotate": 0},
      "right-elbow": {"bend": 0},
      "right-hip": {"pike": 0, "straddle": 0, "rotate": 0},
      "right-knee": {"bend": 0},
      "right-ankle": {"flex": 0, "tilt": 0}
    }
  },
  "flyer": { /* same structure */ },
  "camera": {
    "position": [3, 2, 5],
    "target": [0, 1, 0]
  }
}
```

## Technical Implementation

### Technology Stack
- **Three.js**: 3D rendering and scene management
- **TransformControls**: Rotation gizmos for bone manipulation
- **React**: Dialog and UI integration

### Component Architecture

```
PoseEditor3DDialog (overlay dialog)
├─ Three.js Canvas (full screen)
├─ HumanSelector (toggle base/flyer)
├─ BoneSelector (dropdown or click-to-select)
├─ AngleSliders (fine-tune alternative to gizmo)
└─ JsonExporter (textarea + copy button)
```

### Core Classes

#### `Bone`
```typescript
class Bone {
  name: string;
  parent: Bone | null;
  localPosition: Vector3;  // offset from parent
  semanticAngles: {[key: string]: number};  // e.g., {"bend": 45}
  angleConstraints: {[key: string]: [min, max]};
  eulerOrder: string;  // 'XYZ', 'YXZ', etc.

  getWorldTransform(): Matrix4;
  applyAngles(angles: {[key: string]: number}): void;
}
```

#### `Human`
```typescript
class Human {
  rootPosition: Vector3;
  rootRotation: Euler;
  bones: Map<string, Bone>;

  getBone(name: string): Bone;
  exportJSON(): object;
  loadFromJSON(data: object): void;
  render(scene: Scene, isActive: boolean): void;
}
```

### MVP Implementation Phases

#### Phase 1: Core Rendering (3-4 hours)
- [ ] Define skeleton configuration file (bones, constraints, lengths)
- [ ] Implement `Bone` and `Human` classes
- [ ] Stick figure rendering (lines + spheres at joints)
- [ ] Default T-pose setup for base and flyer
- [ ] Camera setup with orbit controls

#### Phase 2: Rotation Control (4-5 hours)
- [ ] Bone selection (click on bone or dropdown)
- [ ] TransformControls integration
- [ ] Convert gizmo rotations to semantic angles
- [ ] Real-time constraint enforcement
- [ ] Visual feedback (highlight selected bone)
- [ ] Toggle active human (base vs flyer with opacity)

#### Phase 3: Export & Integration (2-3 hours)
- [ ] Live JSON generation in textarea
- [ ] Copy-to-clipboard button
- [ ] "Open Pose Editor" button in App.tsx top toolbar (edit mode only)
- [ ] Full-screen dialog component
- [ ] Close/reset functionality

#### Phase 4: Polish (2-3 hours)
- [ ] Angle sliders as alternative input
- [ ] Visual improvements (bone thickness, colors, labels)
- [ ] Keyboard shortcuts (ESC to close, arrow keys for fine adjustment)
- [ ] Reset buttons (per bone, per human, all)

**Total MVP**: ~12-14 hours

### Future Enhancements (Post-MVP)
- IK helpers for hands/feet positioning
- Pose presets library (common base/flyer positions)
- Ground plane collision detection
- Contact point visualization (where base touches flyer)
- Animation preview (interpolation between poses)
- Integration with main graph (3D preview on hover)
- Multiple camera presets (front, side, top views)

## Risk Mitigation

1. **Start with simplified skeleton**: Prove FK + constraints work with 3 bones before building all 15
2. **Test gimbal lock scenarios**: Verify euler order + constraints prevent issues
3. **UX testing**: Get early feedback on gizmo manipulation feel
4. **Performance**: Monitor frame rate with 2 humans × 15 bones

## Next Steps

1. Build simple 3-bone proof-of-concept (root → spine → arm)
2. Validate FK transforms and semantic angle conversion
3. Test gizmo UX with constrained rotations
4. Implement full 15-bone skeleton
5. Add UI chrome and export functionality
