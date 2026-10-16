# Acroyoga DB

A free website that maps acroyoga poses (base and flyer) as a graph: each pose is a node, each transition between two poses an edge, and flows are named sequences through it. Each pose has a difficulty, a description, its neighbouring poses and, for some poses, a small 3D model of base and flyer.

- **URL:** https://erikbrendel.github.io/acroyoga-db/ (deployed, read-only). Local: `pnpm dev`, then http://localhost:5173/acroyoga-db/ (the port may differ if 5173 is taken; edit mode with a 3D editor only runs there).
- **Accounts:** none; nobody logs in, nothing is saved per visitor.
- **Main features as a visitor sees them:**
  - A zoomable map of 73 poses and 127 transitions, coloured by difficulty (easy / medium / hard), with a difficulty filter, a pose search and a toggle that merges left / right mirrored poses into one node.
  - Clicking a pose opens a side panel: name, difficulty, description, 3D preview where available, and the poses it connects to.
  - A "Flows" panel with 11 named flows (e.g. "Beginner Flow"), each with a difficulty; selecting one highlights its path on the map.
  - The selected pose, flow and search are part of the URL (`?pose=…&flow=…&search=…`), so a link can be shared.
- **Who it is for:** people practising acroyoga who want to find poses, see how they connect, and follow or plan flows. Built by a practitioner; no stated audience beyond that.
- **How people arrive:** a link from a friend or training partner (often to a pose or flow), a search for a pose name, a link in a community chat; on the phone at a jam or class, or on a laptop when planning.
- **Planned, not built** (see `ROADMAP.md`): overview page, pose grid, offline use, 3D player for transitions and flows, flow generator, safety notes, links to videos.
