# Acroyoga-DB

A map of acroyoga poses, the transitions between them and the flows built from them, with a 3D model
of base and flyer for each pose.

See it here: https://erikbrendel.github.io/acroyoga-db/

## Development
- `pnpm dev`, then http://localhost:5173/acroyoga-db/
- `pnpm test`

## Data
Poses, transitions and flows are JSON files in `public/data/`. In dev mode the app writes edits back to
them through the dev server; the deployed site is read-only.

## Docs
- `docs/3d-model.md`: the 3D pose model, its stored format and the editor's solver
- `ROADMAP.md`: planned ideas
