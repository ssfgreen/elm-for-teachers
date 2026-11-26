# Deploying the worksheet editor

This guide puts the editor on the internet so you can share links with teachers. It
assumes you can use a terminal and have a server or a hosting account; each step says
what to type.

## Which version

There are two versions. `main` (the same as the `vercel` branch) is the serverless one;
`long-running` keeps the earlier always-on version.

| | `main` / `vercel` | `long-running` |
| --- | --- | --- |
| Runs as | serverless functions on Vercel, started on demand (or as a normal server) | one always-on server (Docker, a VM, Render, Railway, Fly.io) |
| Cost when idle | nothing | the server's monthly price |
| First request after a quiet spell | a second or two slower (cold start) | instant |
| Images | in a storage bucket (Cloudflare R2, S3 and others), or in the database up to about 3 MB on Vercel | in the database |
| Several copies at once | yes: writes that collide are retried | keep to one |
| Set-up | Vercel, Turso and an R2 bucket (section 6) | a server or container host, and Turso |

Both have the same features, keep the same data, and can use the same Turso database, so
you can move between them. `main` also runs everywhere `long-running` does (Docker,
plain Node); the bucket is optional there.

## 1. What you are deploying

- **One Node.js process** on port 3000. It serves both the app (`/s/<link>` for teachers,
  `/admin` for you) and its API. On a plain server there is nothing else to run; on Vercel
  and Kubernetes the library and migrations run separately ("What runs where", below).
- **A database.** Use [Turso](https://turso.tech) (hosted SQLite, recommended), or a SQLite
  file on the server's disk. Images are stored in the database too, so the server itself
  keeps nothing on disk when you use Turso.
- **The model** is reached through the ELM proxy (`PROVIDER=elm`). With `PROVIDER=mock` the
  assistant gives canned answers, which is useful for a trial run.
- **HTTPS** comes from a reverse proxy (Caddy or nginx) or from your hosting platform.

Database tables are created and updated automatically when the server starts.

Several copies of the server may run at once (Vercel starts as many as it needs). Writes
that collide are retried, so each workspace's event log stays complete and in order. On a
server, one small machine (1 CPU, 1 GB of memory) is plenty for a class or a workshop.

**What runs where.**

| Piece | On Vercel (`main`, section 6) | On Kubernetes (section 13) |
| --- | --- | --- |
| The app and its API (`packages/server`) | Runs on Vercel as one function (`api/index.mjs`, 300 s limit). | The app, `deploy/k8s/app.yaml` |
| The library server (`library/`) | On Vercel it is a second function in the same deployment (`api/library.mjs`, 30 s limit), at `/library` (`vercel.json`), and each deployment uses its own unless `LIBRARY_URL` is set (`server/src/env/library.ts`). | The library runner, its own pod, `deploy/k8s/runner.yaml` |
| Migrations | At start | `node dist/migrate.js` as a Job, `deploy/k8s/migrate-job.yaml` |

Migrations run against the live database before new code serves traffic: at start on Vercel, or as `node dist/migrate.js` (a Kubernetes Job) with `MIGRATE_ON_START=false`.

`deploy/` holds the Kubernetes manifests (`deploy/k8s/`, Kustomize): the app, the migration Job, the library runner, sqld with Litestream backups, the Gateway API edge (Envoy Gateway); and the compose e2e setup (`deploy/compose/`). `compose.yaml` runs the same pieces locally; the root `Dockerfile` builds the app and, with `--target runner`, the runner. See section 13.

## 2. Before you share it

- [ ] **HTTPS only.** A workspace link is the key to that workspace, so it must never travel
      over plain HTTP.
- [ ] **On your own server or Docker: a long, random `ADMIN_PASSWORD`.** Generate one with
      `openssl rand -base64 24`. Anyone with it can see and download every workspace. With
      `DEPLOY_ENV=production`, and on Vercel production, the password is refused: admins sign in with Google or Microsoft
      (section 12, "The first admin"). A Vercel preview takes it if it is set for Preview: limit
      it to branch `development`, as every pushed branch gets a preview.
- [ ] **Treat links as secrets.** Whoever has a link can read and edit that workspace and use
      the model, which costs you tokens. Send each teacher their own link. Teachers can
      instead sign in with Google or Microsoft (section 12), which is optional.
- [ ] **`PROVIDER=elm`** with the ELM proxy URL and key, unless you want the canned mock.
- [ ] **Data protection.** Teachers may type or upload pupil information (a class register,
      for example). Check that your ethics approval and data management plan cover:
      - where the database lives (choose a UK or EU region for Turso);
      - that prompts go to the ELM proxy;
      - who can download the data (holders of the admin password, and each link holder for
        their own workspace).
- [ ] **Backups** (section 10).
- [ ] **A test run:** create a workspace in `/admin`, open its link in a private window,
      write something, ask the chat for a worksheet, then download the zip.

## 3. Settings

All settings are environment variables. For a server, put them in a file called `.env` next
to this guide (it is never committed, and the Docker build leaves it out); for a hosting
platform, enter them in its dashboard. `.env.example` lists them with comments.

| Variable | Required | Example | What it does |
| --- | --- | --- | --- |
| `ADMIN_PASSWORD` | off Vercel | `openssl rand -base64 24` | Password for `/admin` on your own server, in tests and on a Vercel preview. On Vercel set it for Preview, branch `development` only: every pushed branch gets a preview, and each would take it. Refused in Vercel production and with `DEPLOY_ENV=production`, where admins sign in (section 12). Left unset, no password works. (`CONSOLE_PASSWORD` is the old name and still works.) |
| `DEPLOY_ENV` | no | `production` | Where this server runs: `production`, `preview` or `local` (the default). In `production` the admin password is refused and need not be set. Ignored on Vercel, where `VERCEL_ENV` decides. |
| `DATABASE_URL` | yes | `libsql://worksheets-you.turso.io` | Turso URL, or `file:/app/data/edw.db` for a SQLite file (Docker) |
| `DATABASE_AUTH_TOKEN` | with Turso | (from `turso db tokens create`) | Turso access token |
| `PROVIDER` | yes | `elm` | `elm` for the real model, `mock` for canned answers |
| `ELM_PROXY_BASE_URL` | with `elm` | `https://…` | The ELM proxy's base URL |
| `ELM_PROXY_API_KEY` | with `elm` | | Your ELM key |
| `ELM_PROXY_CHAT_PATH` | no | `/chat/completions` | Only if ELM's path differs |
| `ELM_PROXY_RESPONSES_PATH` | no | `/responses` | Agent mode's path, only if ELM's differs |
| `PUBLIC_BASE_URL` | recommended | `https://worksheets.example.ac.uk` | The address teachers use. Workspace links are built from it. |
| `PORT` | no | `3000` | Port the server listens on |
| `TRUST_PROXY` | behind a proxy | `true` | Take the visitor's address from `X-Forwarded-For` (for the wrong-code limit on `/api/access`). Only behind a proxy that replaces any `X-Forwarded-For` the visitor sent: one that appends to it (nginx's `$proxy_add_x_forwarded_for`) or passes it through lets a visitor pick their own address and dodge the limit. Default: on Vercel on, elsewhere off. |
| `FUNCTION_LIMIT_MS` | no | `300000` | How long a request may run before the platform stops it (Vercel's `maxDuration`, or the ingress timeout). The checks after a chat turn skip the judge when too little is left. Default 300000 (300 s). |
| `HOST` | no | `0.0.0.0` | Interface it binds to (keep `0.0.0.0` in Docker) |
| `TOOL_VERSION` | no | `0.2.0` | Written into every export, so data can be matched to a release |
| `S3_ENDPOINT` | for a bucket | `https://<account>.r2.cloudflarestorage.com` | The bucket service (section 5). Set all four `S3_*` values, or none. |
| `S3_BUCKET` | for a bucket | `worksheet-images` | Bucket name |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | for a bucket | | An access key that can read and write that bucket |
| `S3_REGION` | no | `auto` | `auto` for R2; the bucket's region for AWS (e.g. `eu-west-2`) |
| `LIBRARY_URL` | off Vercel | `http://localhost:8787` | The library server: the E&Os, TRAILS, the pedagogy library and the curriculum. Unset, they show as not set up. On Vercel it defaults to each deployment's own `/library` when `LIBRARY_TOKEN` is set. |
| `AUTH_SECRET`, `GOOGLE_CLIENT_*`, `MICROSOFT_CLIENT_*`, other `AUTH_*` | for sign-in | | Google and Microsoft sign-in for teachers: section 12 |
| `LIBRARY_TOKEN` | with the Vercel library | `openssl rand -base64 24` | Shared by the app and the library function; without it the library refuses every request |

The model, its settings and the system prompt are in `config/app.config.json` and
`config/system_prompt.md`. They are part of the code, and every export records a hash of
them.

## 4. Set up the database (Turso)

Install the Turso CLI (see turso.tech), then:

```bash
turso auth login
turso db create worksheets                 # pick a UK or EU location if asked
turso db show worksheets --url             # -> DATABASE_URL
turso db tokens create worksheets          # -> DATABASE_AUTH_TOKEN
```

The first start creates the tables. **Warning:** if you point it at the database you used
for the old study version of the tool, the first start of this version **drops those tables
and their data** (migration `0004_editor.sql`). Download anything you need from that
database first, or use a new one as above.

To use a SQLite file instead, set `DATABASE_URL=file:/app/data/edw.db` (Docker) and keep
`/app/data` on a persistent volume (sections 7 and 8). Without a volume, the data
disappears when the container is replaced.

## 5. Images in a storage bucket (Cloudflare R2)

Images can be stored in an S3-compatible bucket instead of the database:
- The browser sends each image straight to the bucket, using a link the server signs, and
  the server checks it has arrived.
- Pages show images through short-lived signed links.

This keeps the database small, and on Vercel it is needed for images over about 3 MB.

**Cloudflare R2** is the simplest choice. At the time of writing its free tier includes
10 GB of storage and charges nothing for downloads; check current pricing. AWS S3 and
Backblaze B2 work the same way.

1. In the Cloudflare dashboard, open **R2** and **Create bucket**. Name it, for example,
   `worksheet-images`. Under location, choose the **EU jurisdiction** (or an EU location
   hint) so the files stay in Europe.
2. Under **R2 → Manage API tokens**, choose **Create API token**:
   - permission: **Object Read & Write**, limited to this bucket;
   - note the **Access Key ID**, the **Secret Access Key** and the **endpoint**. The endpoint
     is `https://<account-id>.r2.cloudflarestorage.com`, or
     `https://<account-id>.eu.r2.cloudflarestorage.com` for an EU-jurisdiction bucket.
3. In the bucket's **Settings → CORS policy**, allow uploads from the app's address:

   ```json
   [
     {
       "AllowedOrigins": ["https://worksheets.example.ac.uk"],
       "AllowedMethods": ["PUT", "GET", "HEAD"],
       "AllowedHeaders": ["Content-Type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

   Use your real address (on Vercel, `https://<project>.vercel.app` or your own domain). Add
   `http://localhost:5173` while testing locally.
4. Set `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` and
   `S3_REGION=auto`, then restart or redeploy. Cloudflare's "S3 API" URL,
   `https://<account-id>.r2.cloudflarestorage.com/<bucket>`, gives the first two: the
   endpoint is everything before the last `/`, and the bucket name is what follows it.
5. Check the bucket from your own machine, with the settings in `.env`:

   ```bash
   pnpm --filter @edw/server build && node scripts/check-bucket.mjs
   ```

   It uploads a tiny test image through a signed link, reads back its size and type,
   downloads it, and checks that the bucket refuses a tampered signature and a file of the
   wrong type. It cannot test the CORS rule; a failed image upload in the browser console
   points to that.

For **AWS S3**:
- endpoint `https://s3.<region>.amazonaws.com`, and `S3_REGION` set to the bucket's region;
- an IAM user allowed `s3:PutObject` and `s3:GetObject` on that bucket;
- the same CORS rule (S3 console → bucket → Permissions → CORS).

Leave the bucket private: nothing in it needs to be public.

Images uploaded before you add a bucket stay in the database and keep working.

## 6. Option V: Vercel (serverless)

Vercel serves the built app from its CDN and runs the server as one function, started when
requests arrive. The library server (`library/`) runs as a second function in the same
project, at `/library`. `vercel.json` has all the build settings, and pins the
function to Dublin (`dub1`), next to a Turso database in Ireland (`aws-eu-west-1`).

1. Push to GitHub: `git push origin main`.
2. In Vercel, **Add New → Project** and import the repository.
   - Framework preset: **Other**; leave the build settings alone (`vercel.json` sets them).
   - Root directory: the repository root.
3. The **Production Branch** is `main` by default (**Settings → Git**), so every push to
   `main` deploys.
4. Under **Settings → Environment Variables**, add the settings from section 3 (`ADMIN_PASSWORD`
   only if you want the password on the development site, and then for **Preview**, branch
   `development` only, as every pushed branch gets a preview; production refuses it, and admins
   sign in there instead):
   - the sign-in settings: `AUTH_SECRET`, `GOOGLE_CLIENT_*`, `MICROSOFT_CLIENT_*` and the other
     `AUTH_*` values (section 12);
   - `PROVIDER` and the `ELM_*` values;
   - the Turso `DATABASE_URL` and `DATABASE_AUTH_TOKEN`. A SQLite file is not possible on
     Vercel, which keeps no disk;
   - the four `S3_*` values (section 5);
   - optionally `PUBLIC_BASE_URL`, if you add your own domain. Otherwise links use the
     address the admin page was opened on;
   - for the libraries (curriculum, pedagogy, E&Os, TRAILS): `LIBRARY_TOKEN`, a new random
     value (`openssl rand -base64 24`), for **Production and Preview** (the development site is
     a preview). Each deployment then uses its own library at `/library`: production at the
     production domain, a preview at its branch address. Set `LIBRARY_URL` only to use
     another one. The token keeps the library closed to everyone but the app: TRAILS is all
     rights reserved. If previews are behind Vercel's login (**Settings → Deployment
     Protection**), turn on **Protection Bypass for Automation** there too, so a preview's app
     can reach its own library. The bypass is sent only when `LIBRARY_URL` is unset: a
     `LIBRARY_URL` set by hand, even to the preview's own `/library`, does not get it.
5. **Deploy**, then make the first admin (section 12, "The first admin") and sign in at
   `https://<project>.vercel.app/admin`.

Worth knowing:
- **Plan.** Vercel's free Hobby plan is for personal, non-commercial use. Check that
  research use is acceptable, or use Pro.
- **Cold starts.** The first request after a quiet spell takes a second or two longer,
  while a function starts and checks the database.
- **Time limit.** A function may run up to 300 seconds (`maxDuration` in `vercel.json`; Vercel's fluid compute allows this on every plan). A chat turn stops offering tools after config `agent.max_turn_ms` (200 s) and ends with a reply, so it finishes inside the limit.
  Turns usually take 5 to 20.
- **4.5 MB request limit.** With a bucket configured, images avoid it; Word uploads only
  send their text, which is small.
- **Reaching ELM.** Check that the ELM proxy accepts calls from outside the university
  network, because the function runs on Vercel's servers.
- **Jobs.** Slow work (none yet; marking, later) runs as jobs, not in a request. On Vercel its
  cron calls `/api/jobs/run` once a day (`crons` in `vercel.json`; Hobby allows no more often,
  Pro allows every minute) and runs what is due for up to two minutes. Set `CRON_SECRET`
  (`openssl rand -base64 24`) for **Production**: Vercel sends it with each call, and without it
  the route refuses. Crons run on production only. Elsewhere, run
  `node packages/server/dist/worker.js` beside the server: it runs due jobs until stopped.
- **Logs** are under the project's **Logs** tab: each request, and any model errors.
- **The library function** (`api/library.mjs`) has its collections (about 3 MB) bundled in.
  It reads them on a cold start, about a quarter of a second. To check it, ask for the list
  with the token: `curl -H "Authorization: Bearer $LIBRARY_TOKEN" https://<project>.vercel.app/library/api/collections`.
  Without the token it answers 401, and with no `LIBRARY_TOKEN` set, 503.
  The plugins in `library/plugins/` are bundled too (`vercel.json` `includeFiles`), each served
  at `/library/p/<owner>/<name>`. If they fail to load, the function logs why and answers 503 under
  `/library/p/` only; the old routes carry on.

## 7. Option A: your own server with Docker

This works on any Linux virtual machine: a university VM, or a small cloud server (Hetzner,
DigitalOcean, AWS Lightsail and so on). You need a domain name pointing at the server, for
example `worksheets.example.ac.uk`.

**1. Install Docker** on the server: `curl -fsSL https://get.docker.com | sh`.

**2. Get the code onto the server** and add your settings:

```bash
git clone <your repository URL> worksheet-editor
cd worksheet-editor
cp .env.example .env
nano .env        # fill in the settings from section 3
```

**3. Build and start the app:**

```bash
docker build -t worksheet-editor .
docker run -d --name worksheet-editor --restart unless-stopped \
  --env-file .env -e HOST=0.0.0.0 \
  -p 127.0.0.1:3000:3000 \
  -v worksheet-data:/app/data \
  worksheet-editor
```

- `-p 127.0.0.1:3000:3000` exposes the app to the server only; the proxy in the next step
  is the public way in.
- `-v worksheet-data:/app/data` keeps a SQLite database (if you use one) across restarts.
  With Turso it is harmless.

Check it is running:

```bash
curl http://127.0.0.1:3000/api/health    # {"ok":true,"provider":"elm",...}
docker logs worksheet-editor             # the log shows the admin address and the model in use
```

**4. Add HTTPS with Caddy**, which gets and renews the certificate itself. Install it
(caddyserver.com/docs/install), then put this in `/etc/caddy/Caddyfile`:

```
worksheets.example.ac.uk {
	reverse_proxy 127.0.0.1:3000 {
		# The chat streams its reply line by line; pass each line on at once.
		flush_interval -1
	}
	request_body {
		max_size 16MB
	}
}
```

Then run `sudo systemctl reload caddy`. Open `https://worksheets.example.ac.uk/admin`, sign
in, and create a workspace. Its link should start with your domain.

### Using nginx instead of Caddy

```nginx
server {
    server_name worksheets.example.ac.uk;
    client_max_body_size 16m;          # Word uploads and images
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;   # replaces the visitor's own, for TRUST_PROXY
        proxy_buffering off;           # stream the chat as it is written
        proxy_read_timeout 180s;       # a long reply can take a while
    }
    # listen 443 ssl; ... (certbot --nginx adds the certificate)
}
```

## 8. Option B: a container hosting platform

Render, Railway, Fly.io and similar services can build the `Dockerfile` in this repository
directly. The steps are the same everywhere:

1. Create a new service from the repository (or from a Docker image you push). Choose the
   **Dockerfile**.
2. Enter the settings from section 3 as environment variables, including
   `PUBLIC_BASE_URL` set to the address the platform gives you (or your own domain).
3. Set the **port to 3000** and the **health check path to `/api/health`**.
4. One instance is enough; more are safe if the platform adds them.
5. Use **Turso**. If you use a SQLite file instead, attach a persistent disk at `/app/data`.
6. Deploy. The platform provides HTTPS.

If the chat reply only appears at the end rather than as it is written, the platform is
buffering responses; look for a "disable response buffering" or streaming option. Everything
still works, just without the live text.

## 9. Option C: without Docker

On a server with Node.js 20 or newer:

```bash
corepack enable                          # provides pnpm
git clone <your repository URL> worksheet-editor && cd worksheet-editor
cp .env.example .env && nano .env
CI=true pnpm install --frozen-lockfile
pnpm build
node packages/server/dist/index.js       # serves on PORT (3000)
```

To keep it running and start it on boot, add a systemd service,
`/etc/systemd/system/worksheet-editor.service`:

```ini
[Unit]
Description=Worksheet editor
After=network-online.target

[Service]
WorkingDirectory=/home/YOU/worksheet-editor
ExecStart=/usr/bin/node packages/server/dist/index.js
Restart=on-failure
User=YOU
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Then run `sudo systemctl enable --now worksheet-editor`, and put Caddy or nginx in front of
it as in section 7.

## 10. Day to day

**Share links.** Sign in at `/admin` and create a workspace for each teacher (or class).
Copy its link and send it privately. The list shows when each link was first opened.

**Download data.**
- `/admin` has "Download .zip" for any workspace: the full data, for analysis.
- A teacher can download their own documents and chats from the account menu at the bottom
  left: a zip with `documents/` (each document as Word, without unaccepted suggestions) and
  `chats/` (each chat as plain text). It has none of the logs.
- The admin zip holds:
  - the full event log;
  - every revision and the keystroke-level text changes;
  - the chats and every model call;
  - each document as markdown;
  - under `config/`, the exact system prompt and app config the workspace ran with, named
    by the hash in `session.json` (and each model call's `system_prompt_hash`). The server
    keeps every version it has run with. For workspaces created before it did, the zip's
    `MANIFEST.json` lists the hash under `config_missing`; find the text in git with
    `node scripts/find-config-version.mjs <hash>`.

**Delete a workspace.** "Delete" in `/admin` asks once, then removes the workspace and
everything in it for good: documents, chats, the event log and its images (in the bucket
too). Its link stops working, and so does its account's sign-in. The only admin's workspace
cannot be deleted. Download the zip first if you may need the data.

**Backups.**
- Turso keeps point-in-time history on its paid plans. Either way, take your own copy now and
  then: `turso db shell worksheets .dump > backup-$(date +%F).sql`
- With a SQLite file, stop the app (or use `sqlite3 edw.db ".backup backup.db"`) and copy
  the file out of the volume.

**Update to a new version:**

```bash
cd worksheet-editor && git pull
docker build -t worksheet-editor .
docker rm -f worksheet-editor
docker run -d --name worksheet-editor ...   # the same run command as before
```

Data is kept: it lives in Turso or the volume, not the container. Any new database changes
apply on start. Set `TOOL_VERSION` to a new value when you update, so exports say which
version produced them.

**Watch it.** `docker logs -f worksheet-editor` shows each request and any errors. Point an
uptime monitor at `https://…/api/health`.

## 11. If something is wrong

| What you see | Likely cause |
| --- | --- |
| The server stops at start with "ADMIN_PASSWORD is required" or "PROVIDER=elm requires …" | A setting is missing from `.env` or the dashboard |
| The chat says "The assistant couldn't respond" | ELM rejected the call. `docker logs` shows the HTTP status; check the key, the URL and `ELM_PROXY_CHAT_PATH` |
| The reply appears all at once instead of as it is written | The proxy buffers responses: `flush_interval -1` (Caddy) or `proxy_buffering off` (nginx) |
| Links in `/admin` show `localhost` or the wrong address | Set `PUBLIC_BASE_URL` to the public address |
| A Word upload or an image fails with "413" | The proxy's upload limit: `max_size 16MB` (Caddy) or `client_max_body_size 16m` (nginx) |
| "This link could not be opened" | A mistyped link, or a database that was reset |
| The data from the old study version is gone | See the warning in section 4 |
| Images fail to upload with a bucket configured | The bucket's CORS rule must list the app's exact address (section 5); the browser console shows a CORS error |
| Images upload but do not show | The access key needs read as well as write; check the four `S3_*` values |
| On Vercel, everything returns "server failed to start" | A missing or wrong setting (often `DATABASE_URL`, which must be Turso there); the function logs say which |

## 12. Teacher accounts: signing in with Google or Microsoft

Optional. Without these settings nothing changes: no sign-in is offered, and workspace links
work as before. With them, a teacher you invite signs in with Google or Microsoft and gets a
workspace of their own, which they can reach again from any device by signing in. Participant
links (`/s/...`) are not affected and never mention signing in.

**Who gets in.** An invite link from `/admin` (one use, 14 days by default). The first sign-in
through it makes the workspace; after that the person just signs in. Someone with no invite is
turned away, unless you open the door to a whole Microsoft tenant or Google Workspace domain
(`AUTH_OPEN_MICROSOFT_TENANTS`, `AUTH_OPEN_GOOGLE_DOMAINS`). An open tenant spends model money
on anyone in it.

**What is kept.** The provider's id for the person, their email and their name, in the
`accounts` table only: never in events, model calls, the export or the logs. The workspace is
named after the invite's label (or "Microsoft sign-in" / "Google sign-in" for an open door),
which the export does carry, so do not put a person's name in an invite's label.

### Callback addresses

Sign-in works only on addresses registered with Google and Microsoft in advance, and neither
takes wildcards. The callback is the site's address followed by
`/api/auth/google/callback` or `/api/auth/microsoft/callback`. Register:

- the `development` preview's branch address (it has `git-development` in it, under the
  project's **Domains**);
- the production address, when you are ready;
- `http://localhost:3000/...` to try it on your own computer.

The server builds these from `PUBLIC_BASE_URL` if set, else on Vercel from the deployment's
own address (the production domain, or a preview's branch address), else
`http://localhost:<PORT>`. It never uses the address a request claims to be for. On Vercel,
set `PUBLIC_BASE_URL` for Production only, if at all: set for Preview, the development site
would send people back to production.

### Google

1. [console.cloud.google.com](https://console.cloud.google.com): create a project.
2. **APIs and services → OAuth consent screen** (or **Google Auth Platform**): the app's name
   and contact emails; audience **External**; leave it in **Testing** and add the Google
   addresses that may try it (up to 100). Scopes: `openid`, `email`, `profile` (not sensitive,
   no review).
3. **Credentials → Create credentials → OAuth client ID**, type **Web application**. Add the
   callback addresses under **Authorised redirect URIs**; leave JavaScript origins empty.
4. Copy the client ID and secret into Vercel (below). For real users later, set the publishing
   status to **In production**.

### Microsoft (Entra)

1. [entra.microsoft.com](https://entra.microsoft.com) → **App registrations → New registration**.
2. **Supported account types:** "this organizational directory only" (set
   `AUTH_MICROSOFT_TENANT` to your directory (tenant) ID), or "any organizational directory"
   for schools and councils such as Glow (set `AUTH_MICROSOFT_TENANT=organizations`, the
   default). The app still lets in only invited people and open tenants: for a multi-tenant
   registration it checks each token's issuer against its tenant (`tid`).
3. **Redirect URI:** platform **Web**, the callback addresses. Leave the implicit grant boxes
   unticked.
4. **Certificates and secrets → New client secret**, the longest lifetime offered (24 months
   at most). Put the expiry in your calendar: sign-in stops the day it lapses. Copy its
   **Value**.
5. **API permissions:** the default `User.Read` is enough; sign-in asks for `openid email
   profile`.
6. Optional: **Token configuration → Add optional claim → ID token**, tick `email` and
   `xms_edov` (whether Microsoft verified the email's domain). The app never matches anyone to
   an invite by email: the invite link does that.

The first person from another organisation may see "Need admin approval": their organisation
does not let staff approve outside apps, and an administrator there must approve it once.

### Vercel variables

Under **Settings → Environment Variables**, marking each secret **Sensitive**. Set them for
**Preview, branch `development`** first (Vercel lets a Preview variable apply to one branch):
other previews then have no sign-in settings and offer no sign-in, since their addresses are
not registered. Add Production, with its own `AUTH_SECRET`, when you are ready. Variables
apply to new deployments: redeploy afterwards.

| Variable | Value |
| --- | --- |
| `AUTH_SECRET` | `openssl rand -base64 32` (at least 32 characters). Required with any provider. Changing it only cancels sign-ins that are half way through. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | From Google. Both, or neither. |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | The application (client) ID and the secret's Value. Both, or neither. The old names `AUTH_MICROSOFT_CLIENT_ID` and `AUTH_MICROSOFT_CLIENT_SECRET` are deprecated but still work: a deployment with only the old names keeps Microsoft sign-in, so rename them when convenient. They are read only when neither new name is set, and never mixed with them. |
| `AUTH_MICROSOFT_TENANT` | Your directory (tenant) ID, or `organizations` (the default) |
| `AUTH_OPEN_MICROSOFT_TENANTS` | Optional: tenant IDs, comma-separated, whose people may sign in without an invite |
| `AUTH_OPEN_GOOGLE_DOMAINS` | Optional: Google Workspace domains, comma-separated (personal Gmail accounts never match) |
| `PUPILS` | `on` to let pupils sign in on `/r` (#179); unset or `off`, every pupil route is shut and the Sign up and Log in screens (`/signup`, `/login`) show no "I am a pupil". To try it, set `PUPILS=on` and add the pupil redirect addresses below. |

**Pupils.** Pupils sign in with the same Google and Microsoft apps. Add these redirect addresses to
each app, beside the teachers' ones: `<site>/api/pupil/auth/google/callback` and
`<site>/api/pupil/auth/microsoft/callback`.

A provider with no values does not appear. `AUTH_TEST_ISSUER` is for automated tests only: the
server refuses to start with it in production, and offers it only when `NODE_ENV` is `test` or
`development`.

### The first admin

In Vercel production, and on any server with `DEPLOY_ENV=production`, the admin password is refused: an admin is an account that signs in with
Google or Microsoft and has the admin flag. A sign-in opens `/admin` for 12 hours, then the admin
signs in again. After signing in, everyone lands on their workspace (an admin has a Dashboard
link there, just above their name); a sign-in started from `/admin`'s own buttons comes back to `/admin`.

On the development site (a Vercel preview) the password also opens `/admin`, before any sign-in
is set up: set `ADMIN_PASSWORD` under **Settings → Environment Variables** for **Preview**, and
limit it to branch `development`. Every branch pushed to GitHub gets its own preview, and each
preview with the password set takes it. Then redeploy the `development` preview. `/admin` then shows a password form, and `/signin` a Username and Password: type `admin` and the password to open `/admin` for that browser tab. Exports made with the password are
logged with no account; those made by a signed-in admin carry the admin's account id.

The first admin is set from your own computer, with the Turso settings in `.env`
(`DATABASE_URL`, `DATABASE_AUTH_TOKEN`). Deploy this version first: it adds the flag.

1. `pnpm --filter @edw/shared build && pnpm --filter @edw/server build`
2. `node scripts/admin.mjs --invite "Your name" --site https://<the site's address>` prints an
   invite link. Open it and sign in with the Google or Microsoft account you will use as admin.
3. Run the `node scripts/admin.mjs --admin <invite id>` line it printed. It finds the account
   that invite made (never by email), shows its id, provider, name and last sign-in, and asks
   you to type `yes`. An invite nobody has used yet changes nothing.
4. Sign in again: you land on `/admin`.

From then on, admins make other accounts admin in `/admin` (`PUT /api/admin/accounts/:id/admin`).
The last admin can never be removed, nor can the only admin's workspace be deleted. No email
goes in a migration or the repo.

### Trying it

On the development site, once you are an admin ("The first admin" above): make an invite in
`/admin`, open its link in a private window, sign
in, type something, sign out, sign in again on another browser: the same work is there. A
Google address with no invite should be turned away with no workspace made.

If the provider shows its own error page, the callback address usually does not match exactly
(`https`, the path, a trailing slash), or a variable is set for the wrong Vercel environment.

## 13. Kubernetes, with our own database (Elm)

This is the move away from Vercel and Turso (`docs/architecture-target.md` sections 3 and 8):
first Oracle Cloud's free Kubernetes (OKE, London, Arm machines), later the University's own.
Nothing has been deployed this way yet, and the live data stays on Vercel and Turso until Sam
says it may move. Everything here runs locally first, with `compose.yaml`.

> **Not yet proven against sqld.** `docker compose up`, the browser tests and the backup and
> restore drill below have run only with a plain SQLite file in sqld's place: the sqld image
> could not be downloaded where this was built. Until they have run against sqld, these are
> unproven:
>
> - sqld starting on a database Litestream restored, with no `wallog` or other sqld files beside it;
> - sqld's own checkpoints running alongside Litestream's;
> - Litestream's two tables (`_litestream_seq`, `_litestream_lock`) in the file sqld serves;
> - sqld enforcing foreign keys as Turso does (the app sets the pragma only for file databases).
>
> Run the drill against sqld before any real data goes here.

### What runs

| Piece | What it is | File |
| --- | --- | --- |
| app | The same image as section 7, two copies, serving the client too. Migrations off (`MIGRATE_ON_START=false`); traffic only while `/api/health/ready` says the database answers and the schema is current; restarted if `/api/health` stops answering. `DEPLOY_ENV=production` refuses the admin password. | `deploy/k8s/app.yaml` |
| migrate | A Job that runs `node packages/server/dist/migrate.js` before each rollout | `deploy/k8s/migrate-job.yaml` |
| runner | The library runner (`library/`), its own pod, reachable only from the app. Set by `PORT`, `LIBRARY_COLLECTIONS` and `LIBRARY_PLUGINS` only (the defaults are the ones in the image); health on `/health`. | `deploy/k8s/runner.yaml` |
| sqld | libSQL's server (the SQLite server), one copy with its own 50 GB disk, reachable only from the app and the Job. The app reaches it at `DATABASE_URL=http://sqld:8080`, with the same client and SQL as on Turso. | `deploy/k8s/sqld.yaml` |
| backup | Litestream, beside sqld: it copies every change to the backup bucket about once a second, and puts the database back when the disk is new or lost. | `deploy/k8s/litestream.yml`, `litestream-start.sh` |
| gateway | Gateway API, served by Envoy Gateway: HTTPS, plain HTTP redirected, responses streamed, 300 s per request, 16 MB bodies, an access log without paths ("The edge" below) | `deploy/k8s/gateway.yaml`, `deploy/k8s/cluster/gatewayclass.yaml` |

Requests in all: 0.85 processors and about 1.6 GB of memory, 0.95 and 1.85 GB while the
migration Job runs, about 1.2 and 2.1 GB at the peak of a rollout (a third app copy starts
before an old one stops). Oracle's free tier has 2 processors and 12 GB. These figures leave out
Envoy Gateway (its controller and the Envoy pods that carry the traffic) and Kubernetes' own
pods in `kube-system`: check what they ask for once installed (`kubectl describe nodes`).

**Backups go to University storage, never the file bucket.** Images go to the `S3_*` bucket
outside the University (section 5); database backups go to the `BACKUP_S3_*` bucket, with their
own keys, and `litestream-start.sh` refuses to start if the two are the same bucket.

### Images, for amd64 and arm64

Oracle's free machines are Arm; most laptops and CI are not. One build makes both, without an
emulator (the slow part runs on your own machine's processor):

```bash
docker buildx build --platform linux/amd64,linux/arm64 --target app    -t <registry>/edw/app:<version>    --push .
docker buildx build --platform linux/amd64,linux/arm64 --target runner -t <registry>/edw/runner:<version> --push .
```

Then set those names in `deploy/k8s/kustomization.yaml` (`images:`).

### Settings and secrets

Non-secret settings are in `deploy/k8s/settings.yaml` (`edw-settings` for the app, and
`edw-backup-settings` for where backups go): set the site address, the bucket and the backup
storage there. Secrets are never in the repo; make them by name, with the same names as on
Vercel:

```bash
kubectl create namespace edw
kubectl -n edw create secret generic edw-app \
  --from-literal=ELM_PROXY_API_KEY=... \
  --from-literal=AUTH_SECRET="$(openssl rand -base64 32)" \
  --from-literal=GOOGLE_CLIENT_ID=... --from-literal=GOOGLE_CLIENT_SECRET=... \
  --from-literal=MICROSOFT_CLIENT_ID=... --from-literal=MICROSOFT_CLIENT_SECRET=... \
  --from-literal=S3_ACCESS_KEY_ID=... --from-literal=S3_SECRET_ACCESS_KEY=...
kubectl -n edw create secret generic edw-backup \
  --from-literal=LITESTREAM_ACCESS_KEY_ID=... --from-literal=LITESTREAM_SECRET_ACCESS_KEY=...
kubectl -n edw create secret tls edw-tls --cert=site.crt --key=site.key
```

The policies in `deploy/k8s/network-policies.yaml` (only the app and the Job reach the
database; only the app reaches the runner) need a network plugin that enforces them. On OKE,
choose the VCN-native plugin with network policies, or add Calico; with plain flannel they are
ignored and the database and runner are open to every pod in the cluster.

### Before the first deploy: a checklist

- [ ] **Envoy Gateway installed**, then the GatewayClass, once per cluster:
      `helm install eg oci://docker.io/envoyproxy/gateway-helm --version <current release> -n
      envoy-gateway-system --create-namespace`, then
      `kubectl apply -f deploy/k8s/cluster/gatewayclass.yaml`. A release whose
      BackendTrafficPolicy has `requestBuffer` (the 16 MB limit).
- [ ] **Network policies enforced** (above): without that, anything in the cluster reaches the
      database and the runner.
- [ ] **sqld has no sign-in.** Any pod that can reach it can read and change every workspace;
      the network policies are all that stands in the way. A key for sqld (its JWT setting, with
      `DATABASE_AUTH_TOKEN` on the app) is a later item.
- [ ] **Outbound traffic is not limited.** The design allows only ELM, sign-in, ARASAAC and the
      Plugin Studio; Kubernetes network policies cannot name hosts, so this needs Calico or
      Cilium host rules, or the cloud's firewall. A later item.
- [ ] The secrets above, the site address in `settings.yaml` and `gateway.yaml`, and the backup
      storage in `edw-backup-settings`.
- [ ] `TRUST_PROXY` decided ("The visitor's address" below).

### The edge

All in `deploy/k8s/gateway.yaml`:

| Setting | Carried by |
| --- | --- |
| Responses stream (the chat): Envoy passes them on as they come and never buffers them | Envoy's normal behaviour; nothing to set |
| 300 s per request (`FUNCTION_LIMIT_MS`) | HTTPRoute `app` (`timeouts.request`, `timeouts.backendRequest`) and BackendTrafficPolicy `app` (`timeout.http.requestTimeout`) |
| 16 MB bodies; a bigger request gets 413 | BackendTrafficPolicy `app` (`requestBuffer`): Envoy takes in the whole request, never the response, before passing it on |
| Plain HTTP only redirects to HTTPS | HTTPRoute `https-redirect` |
| Access log | EnvoyProxy `edw-proxy` (`telemetry.accessLog`) |

**The access log records no path, no query and no address**: only the time, method, status,
sizes, duration and route. So workspace links (`/s/<token>`), join codes (`/join/<code>`) and
the codes in sign-in callbacks (`/api/auth/...?code=`) never reach a log. Do not add `%REQ(:PATH)%`
or `%REQ(X-ENVOY-ORIGINAL-PATH)%` to its format. To turn the log off altogether, set
`telemetry.accessLog.disable: true` there.

### The visitor's address

The app counts wrong access codes by address: ten wrong codes in a minute and that address must
wait a minute. Behind the edge, with `TRUST_PROXY` off (the default), the app sees the Envoy pod's
address for everyone, so **one room typing ten wrong codes locks every visitor out for a
minute**. To give the app the real address:

1. Keep it as far as Envoy. On OKE, `gateway.yaml` asks for Oracle's network load balancer
   (`oci.oraclecloud.com/load-balancer-type: nlb`), which passes the address through, and
   `externalTrafficPolicy: Local`, so Kubernetes does not swap it for a node's. Elsewhere, use
   the load balancer's proxy protocol instead (ClientTrafficPolicy `proxyProtocol`).
2. `gateway.yaml` already drops any `X-Forwarded-For` the visitor sent before Envoy adds the
   address it saw (ClientTrafficPolicy `edw`), so the header holds one entry the app can trust.
3. Add `TRUST_PROXY: "true"` to `edw-settings`, restart the app (below), and check it: type ten
   wrong access codes on a phone using its mobile data, then one from a computer on another
   network. The phone should be told to wait; the computer should not. If both wait, the address
   is still being lost on the way: set `TRUST_PROXY` back to `"false"`.

### Deploying, and each new version

```bash
kubectl -n edw delete job migrate --ignore-not-found   # a Job cannot be changed, so make it anew
kubectl apply -k deploy/k8s
kubectl -n edw rollout status deployment/app
```

The new app copies wait, not ready, until the Job has applied the migrations; the old ones go on
serving until then. If the Job fails, `kubectl -n edw logs job/migrate` says why, and the old
copies keep serving.

A change to `settings.yaml` alone does not restart anything: apply it, then
`kubectl -n edw rollout restart deployment/app deployment/runner statefulset/sqld`.

The first admin (section 12) is set from your own computer through a tunnel to the database:
`kubectl -n edw port-forward svc/sqld 8080:8080`, then `DATABASE_URL=http://127.0.0.1:8080`
for `scripts/admin.mjs`.

### Locally, with compose

`compose.yaml` runs the same pieces, with a local S3 bucket (SeaweedFS) standing in for
University storage:

```bash
cp .env.example .env     # set ADMIN_PASSWORD; PROVIDER=mock needs no key
docker compose up --build --wait
```

Then open `http://localhost:3000/admin`. On the way up, `db-restore` puts the database back if
its volume is empty and a backup exists, sqld starts, `migrate` applies the migrations and
stops, then the app and the runner start. `docker compose down` stops it all;
`docker compose down -v` also deletes the database and the backups.

The browser tests run against it as well:

```bash
docker compose -f compose.yaml -f deploy/compose/e2e.yaml down -v
docker compose -f compose.yaml -f deploy/compose/e2e.yaml up -d --build --wait
pnpm build && pnpm e2e --config deploy/compose/playwright.config.ts
```

### Restoring the database

Litestream keeps a full copy from each day and every change since, for 14 days. A restore
happens only when the database file is missing: it never writes over a database that is there.

**Practise it locally first** (a backup, the loss of the database's volume, and a restore):

1. `docker compose up --build --wait`, sign in at `/admin` and make a workspace.
2. Check the backup has it: `docker compose logs litestream` ends with `wal segment written`.
   To list what is kept: `docker compose exec litestream litestream generations -config
   /etc/litestream/litestream.yml /var/lib/sqld/iku.db/dbs/default/data`.
3. Lose the database: `docker compose stop app litestream sqld`, then
   `docker compose rm -f app litestream sqld migrate db-restore` and `docker volume rm edw_db`.
4. Bring it back: `docker compose up --wait`. `docker compose logs db-restore` says
   `renaming database from temporary location` when it has restored.
5. Open `/admin`: the workspace is there.

**On Kubernetes, after the database's disk is lost** (or to start again from the backup):

1. Stop the app, so nothing writes: `kubectl -n edw scale deployment/app --replicas=0`.
2. Stop the database: `kubectl -n edw scale statefulset/sqld --replicas=0`.
3. If the disk is still there but must go (it holds a damaged database), delete it:
   `kubectl -n edw delete pvc data-sqld-0`. This cannot be undone; the backup is what is left.
4. Start the database: `kubectl -n edw scale statefulset/sqld --replicas=1`. It gets a new disk
   and the `restore` step fills it: `kubectl -n edw logs sqld-0 -c restore`.
5. Start the app: `kubectl -n edw scale deployment/app --replicas=2`, and check a workspace.

**To go back to a moment before a mistake**, do the same, deleting the disk in step 3, with the time set before step 4:
`kubectl -n edw set env statefulset/sqld -c restore RESTORE_TIMESTAMP=2026-11-21T14:00:00Z`
(UTC). Once it is back, remove it again, `kubectl -n edw set env statefulset/sqld -c restore
RESTORE_TIMESTAMP-`, so a later restart does not go back too. Everything after that moment is
lost, so download the workspaces that matter first (`scripts/download-workspaces.mjs`).
