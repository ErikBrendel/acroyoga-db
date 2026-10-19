# Roadmap

Ideas, grouped by area, in no particular order. Related tools: `docs/related-work.md`; ideas from simulated user research: `docs/synthetic-users/ideas.md`.

## Site structure
- [x] Overview page as the entry point, linking to poses, flows and the map
- [x] Pose list with search and difficulty filter
- [ ] Pose list as grid with thumbnails, to recognise a pose by its shape
- [x] Flows page, the map as one view among these
- [x] Search over names and aliases; a name used for several poses is pointed out on each of them
- [ ] Search over tags
- [x] Own flows: built from the map's transitions (or any pose), kept in the browser, shared as a link and imported
- [ ] Shareable deep links for transitions and the player state
- [x] What's next in the pose panel: harder poses reachable from it
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
- [ ] Transitions in 3D: interpolation between the poses and the transition's keyframes that keeps the contacts
      both share. Each angle can be interpolated linearly (all stay within their limits); only `root` needs
      quaternion slerp, since its angles are unbounded
- [ ] AI-generated 3D drafts: AI writes poses and transition keyframes (contacts first, the solver does the
      geometry, checked against renders of the result) into a drafts folder outside `public/`, so they are never
      deployed. Edit mode lists the drafts, opens them in the 3D editor and moves them into the real data on
      approval, and marks poses with a waiting draft or no 3D data yet
- [ ] Safety notes per pose and transition: common mistakes, where to spot, risk
- [ ] Other sources, e.g. https://www.christiangieger.de/acroyoga-poses/, https://www.yogaemotion.net/courses
      and flows on YouTube:
  - [ ] links per pose and flow (YouTube with timestamps)
  - [x] alternative names used elsewhere, for search and matching (`aliases` per pose; more only with two sources or an explicit "aka")
  - [ ] coverage check: poses and flows that exist elsewhere but not here yet
  - [ ] importing descriptions or images, only with the owner's permission

## 3D editor
- [ ] Transition editor: keyframes with an explicitly set intermediate pose at relative times between 0 and 1,
      on a timeline to add, move and delete them, scrub and play the interpolation between them
- [ ] Floor contacts as contacts (replacing pins and the planted presets), so the base stays on the floor when
      the solver has to move them
- [ ] Body proportions: re-solving stored poses from their contacts
- [ ] Solving both people together instead of in a fixed order
- [ ] A pin out of reach should leave the rest of the limb alone instead of bending it oddly
- [ ] Warn about contradictory contacts, e.g. a symmetric hip pair with twist ±90
- [ ] Screen size limit for the pin markers, like the contact markers
- [ ] Kneecaps sit slightly low when the knee is bent far
- [ ] Finger flex as an angle of the hand, so grips can wrap around a wrist or ankle (stargrip, hand-to-hand,
      grips on the ankles) instead of lying flat
