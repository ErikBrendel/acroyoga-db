# Roadmap

Ideas, grouped by area, in no particular order.

## Site structure
- [ ] Overview page as the entry point, linking to poses, flows and the map
- [ ] Pose list as grid (thumbnails) and table (sortable), with the existing filters
- [ ] Flows page
- [ ] The map as one view among these instead of the default
- [ ] Search over names, aliases and tags
- [ ] Shareable deep links for poses, transitions, flows and the player state, e.g. to send a flow to a partner
- [ ] Installable and usable offline (PWA), for jams without signal

## 3D for visitors
- [ ] Display renderer separate from the editor's: light background, soft shadows, nicer humans with
      neutral clothing; base and flyer distinguishable, no left / right colouring
- [ ] Pose thumbnails for the grid, rendered once in the browser with three.js and reused as images
- [ ] Interactive viewer in the pose and transition details (orbit by touch)
- [ ] Fullscreen player for transitions and flows: play / pause, scrubbing, speed; works in landscape on phones
- [ ] three.js loaded only on pages that show 3D, so lists stay fast on phones
- [ ] Open question: one persistent player that always follows the last selected pose, transition or flow, with
      the humans moving to it. Either docked on every page (on phones a mini-player that expands to
      fullscreen), or only between the detail views and the map

## Flows
- [ ] Playing a flow: the map highlights the current pose and transition while the 3D player animates the same step
- [ ] Flow generator: a valid flow through the map from a start pose, limited by difficulty and length

## Data
- [ ] 3D data per pose (e.g. `public/data/poses3d/<poseId>.json`), saved by the editor through the dev API;
      mirrored poses derived by mirroring
- [ ] Transitions in 3D: interpolation that keeps the contacts both poses share, optionally with in-between
      keyframes. Each angle can be interpolated linearly (all stay within their limits); only `root` needs
      quaternion slerp, since its angles are unbounded
- [ ] Safety notes per pose and transition: common mistakes, where to spot, risk
- [ ] Other sources, e.g. https://www.christiangieger.de/acroyoga-poses/, https://www.yogaemotion.net/courses
      and flows on YouTube:
  - [ ] links per pose and flow (YouTube with timestamps)
  - [ ] alternative names used elsewhere, for search and matching
  - [ ] coverage check: poses and flows that exist elsewhere but not here yet
  - [ ] importing descriptions or images, only with the owner's permission

## 3D editor
- [ ] Floor contacts as contacts (replacing pins and the planted presets), so the base stays on the floor when
      the solver has to move them
- [ ] Body proportions: re-solving stored poses from their contacts
- [ ] Solving both people together instead of in a fixed order
- [ ] A pin out of reach should leave the rest of the limb alone instead of bending it oddly
- [ ] Warn about contradictory contacts, e.g. a symmetric hip pair with twist ±90
- [ ] Screen size limit for the pin markers, like the contact markers
- [ ] Kneecaps sit slightly low when the knee is bent far
