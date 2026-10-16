# Acroyoga-DB

A map of acroyoga poses, the transitions between them and the flows built from them, with a 3D model
of base and flyer for each pose.

See it here: https://erikbrendel.github.io/acroyoga-db/

## Development
- `pnpm dev`, then http://localhost:5173/acroyoga-db/
- `pnpm test`

## Data
Poses, transitions and flows are JSON files in `public/data/`. In dev mode the app writes edits back to
them through the dev server; the deployed site is read-only. 3D data per pose is in `public/data/poses3d/`,
AI-generated drafts in `data-drafts/poses3d/` (never deployed) until approved by saving them in the 3D editor.

## Docs
- `docs/3d-model.md`: the 3D pose model, its stored format and the editor's solver
- `docs/ai-pose-generation.md`: generating pose drafts with AI agents (`pnpm pose:solve`, `pose:render`, `pose:orient`)
- `docs/related-work.md`: other acroyoga libraries and apps, and how this site differs
- `docs/synthetic-users/`: simulated user research: personas, user stories, product ideas (`ideas.md`)
- `ROADMAP.md`: planned ideas
