# K3 (#99): Kubernetes base, self-hosted libSQL with continuous backup, the runner, compose

## What was built, and where

- `Dockerfile`: three stages. `build` runs on the builder's own platform (`--platform=$BUILDPLATFORM`)
  and installs the prebuilt binaries for x64 and arm64 (`pnpm.supportedArchitectures`); `runner`
  (`--target runner`, CMD `node library/dist/server/main.js`, port 8787) and `app` (the default,
  last) only copy, so an arm64 image builds on an amd64 machine with no emulator. An optional
  build secret `ca` hands the build a proxy's certificate without putting it in the image.
- `deploy/k8s/` (Kustomize, `kubectl apply -k deploy/k8s`): namespace `edw`; `settings.yaml`
  (ConfigMaps `edw-settings`, `edw-backup-settings`); `app.yaml` (2 copies, readiness
  `/api/health/ready`, liveness `/api/health`, `MIGRATE_ON_START=false`, `DEPLOY_ENV=production`,
  PDB); `migrate-job.yaml`; `runner.yaml`; `sqld.yaml` (StatefulSet, one copy, 50 GB disk, a
  Litestream `restore` init container and `litestream` sidecar); `gateway.yaml` (Gateway API on Envoy
  Gateway: streamed responses, 300 s, 16 MB, an access log without paths, queries or addresses;
  the GatewayClass is `cluster/gatewayclass.yaml`, applied once per cluster); a 5 s preStop pause
  on the app; `network-policies.yaml` (sqld from app and migrate only, runner
  from app only). Secrets by name only: `edw-app`, `edw-backup`, `edw-tls`.
- `deploy/k8s/litestream.yml` and `litestream-start.sh`: shared by Kubernetes and compose. The
  script refuses a backup bucket that is the file bucket, and restores only when the database
  file is missing (optionally to `RESTORE_TIMESTAMP`).
- `compose.yaml`: storage (SeaweedFS) and its bucket, `db-restore`, sqld, litestream, migrate,
  runner, app. `deploy/compose/e2e.yaml` and `deploy/compose/playwright.config.ts` run the
  browser tests against it.
- `DEPLOY.md` section 13: what runs, images, secrets, deploying, compose, the restore drill.

## Decisions

- **Gateway API on Envoy Gateway, not ingress-nginx** (review round 1: ingress-nginx is retired).
  Field names checked with kubeconform against the current Envoy Gateway and Gateway API schemas
  (datreeio CRDs catalogue); not applied to a cluster. `requestBuffer` in `BufferAndLimit` mode
  makes 16 MB a hard limit; it buffers requests only, and nothing in the app upgrades connections.
- Settings changes need `kubectl rollout restart` (DEPLOY.md); no configMapGenerator for them, so
  the names stay plain for `kubectl edit`.

- **Litestream, not sqld's own replication ("bottomless").** Litestream is a separate, widely
  used tool with an explicit restore command, point-in-time restore and any S3-compatible target;
  a restore is a step we can see and practise. Bottomless restores silently on start, is tied to
  sqld's internals and has little documentation. Litestream works on the SQLite file whatever serves it, so it also survives a
  later change of server. The cost: Litestream writes two small tables of its own
  (`_litestream_seq`, `_litestream_lock`) into the file sqld serves, and manages checkpoints
  alongside sqld. That combination was not tried here (sqld could not be pulled); the restore
  drill against compose is the test to run first.
- **SeaweedFS, not MinIO, as the local stand-in for University storage.** MinIO no longer
  publishes images on Docker Hub (the repository is gone) and quay.io is blocked here. Any
  S3-compatible store works; only `compose.yaml` names it.
- **Images:** `ghcr.io/tursodatabase/libsql-server:v0.24.33` (amd64 and arm64 in one index,
  checked against the registry) and `litestream/litestream:0.3.13` (amd64, arm64).
- **No CI step for the multi-arch build:** there is no registry or cluster yet, so the
  `docker buildx` command is in DEPLOY.md; `.github/workflows/` is unchanged.
- `DEPLOY_ENV=production` on the app and the Job (K6, #107, merged): the admin password is refused there.
- `DEPLOY_ENV` in compose defaults to `local` (#107 accepts production, preview or local).
- Requests: app 2 × (250m, 384Mi), runner (100m, 256Mi), sqld (200m, 512Mi), Litestream
  (50m, 64Mi): 850m and 1.6 GiB; with the migration Job 950m and 1.85 GiB; at a rollout's peak
  about 1.2 CPU and 2.1 GiB. Oracle's free tier: 2 CPU, 12 GB.

## What was tried, and what was not

- Tried: both images built (amd64 and arm64 in one `docker build --platform`; the arm64 one was
  not run, no emulator here); the runner image answers `/health`; `kustomize build` and
  `kubeconform -strict` pass on all 21 resources, Envoy Gateway and Gateway API ones included; `docker compose config` passes for both files;
  Litestream replicate, loss of the volume, and restore against SeaweedFS with a plain SQLite
  file at sqld's path (the migrated schema and a test row came back); the guard refuses the file
  bucket; the full e2e suite (54 tests) against the compose app, runner and migration step with a
  file database in place of sqld.
- Not tried: anything with sqld. Its image layers are served from
  `pkg-containers.githubusercontent.com`, which this sandbox's network refuses. So `docker compose
  up` from scratch with sqld, e2e against sqld, and the restore drill with sqld are still to run.
  No cluster: nothing was applied with kubectl.

## Left

- Run the compose acceptance with sqld where its image can be pulled: `docker compose up`, e2e
  via `deploy/compose/e2e.yaml`, and the restore drill in DEPLOY.md section 13.
- Check foreign keys on sqld match Turso: `openDb` sets `PRAGMA foreign_keys` only for local files.
- sqld accepts any client inside the cluster (no JWT key); the network policies are the guard,
  and they need an enforcing network plugin on OKE. A token on sqld and on the runner are later items.
- Alerting when backups stop (Litestream logs only).
- `TRUST_PROXY` stays off until checked on the cluster (DEPLOY.md, "The visitor's address"): until
  then everyone behind the edge shares one address for the wrong-code limit.
- An egress limit (only ELM, sign-in, ARASAAC, the Plugin Studio): needs Calico or Cilium host
  rules, or the cloud's firewall.
- Litestream 0.5 (new backup format) once 0.3.13 is proved with sqld.
