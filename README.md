# rig

Keeps a lane's lights on while nobody is in it: a heartbeat every minute, a status board, and
(next) a morning digest of what ran overnight.

```sh
cp .env.example .env   # set LANE_MARKER
pnpm install
pnpm dev               # http://localhost:8787
```

Export the sample digest for local review as one self-contained HTML file:

```sh
pnpm export-preview -- ../review/digest-2026-10-28.html
```

The output path must be outside this repository. Upload a preview only after human approval.
Replacing the same public URL requires review of the updated file and separate approval.

Working on it with an agent: start at [AGENTS.md](AGENTS.md).
