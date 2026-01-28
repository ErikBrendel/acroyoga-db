# Acroyoga-DB

#### core ideas

- A web app of acro poses, transitions, and flows
- Each pose and transition has name, desc, and 3d representation of the movements
- Three.js for 3d rendering, React UI
- File-based database of poses, transitions, and flows in JSON format
- Web based pose editor for building the data, with ways of writing back to the data files, for local use only
- Pose: Simple skeleton (e.g. one bone per hand, feet, 2 for each leg and arm, ...) for both flyer and base
- transitions might contain inbetween pose 3d data for extra interpolation steps, or might just interpolate from one pose to the other for 3d playback
- Flow: sequence of poses and transitions
- Handedness of poses: left/right mirrored versions of poses and transitions both exist and are linked to each other
- A "Flow" is handed if any of its poses or transitions are handed, and thus there can exist the mirrored version of it
- "Entry poses" where both stand on ground in specific orientations

#### React Views

- pose list view
- pose graph view with transition edges (some graph rendering library?)
- pose detail view
- transition detail view
- flow list view
- flow detail view

#### 3d Views (also react but with main Threejs canvas)

- single pose view mode: with buttons to switch to related poses via transitions
- flow view mode: play through a flow of poses and transitions
- Locally only:
- pose editor mode: edit a pose skeleton in 3d, save back to e.g. Pose or transition interpolation data
- Flow recording mode: record a sequence of poses and transitions into a flow while playback
