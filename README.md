# Campus Events

Starter project for **Advanced Development** (Thomas More – International Experience Design, year 3).

A small but complete web app: students browse campus events and register for them.

- **api/** : REST API: Node.js, Express 5, Sequelize + SQLite, Zod
- **web/** : frontend: Vue 3, Vue Router, Vite

It works out of the box, and it has tests. It is also the kind of code you will meet in your first job:
the whole API is one long file. Your job is to **clean it up, ship it to production, fix it and add the hard
parts**

## Quick start

You need **Node.js 22.12 or newer** (`node -v`) and Git.

```bash
git clone <your-fork-url>
cd campus-events
npm install        # installs api + web in one go
npm run dev        # starts both
```

Open **http://localhost:5173**. The API runs on http://localhost:3000/api.
The first start fills the database with demo events. `npm run seed` resets it.

Later parts need a few services. You never need them to run the tests.

| Service | Local | Setting in `api/.env` |
|---|---|---|
| RabbitMQ | `docker compose up -d rabbitmq` | `AMQP_URL` |
| Redis | `docker compose up -d redis` | `REDIS_URL` |
| Identity provider | a free Auth0 tenant | `AUTH_ISSUER`, `AUTH_AUDIENCE`, `AUTH_CLIENT_ID` |

## Scripts (run from the root folder)

| Script | What it does |
|---|---|
| `npm run dev` | API + frontend with auto-reload |
| `npm test` | All tests: API (node:test + supertest) and frontend (Vitest) |
| `npm run lint` | ESLint for the whole project |
| `npm run check` | Lint + tests. **The pipeline runs exactly this. It must be green before you hand in.** |
| `npm run seed` | Reset the database to the demo data |
| `npm run build` | Production build of the frontend |

## How it fits together

```
browser ──► web (Vite, :5173) ──/api/*──► api (Express, :3000) ──► SQLite (api/data/events.sqlite)
```

In development Vite forwards every `/api/...` request to the API (see `web/vite.config.js`),
so the browser only talks to one address and you don't need CORS.

### api/

Request flow: `route → validate → controller → service → repository → model`.

```
api/src/
  app.mjs          composition root: createApp({ mailer?, cache? }) wires everything together
  server.mjs       starts the app (and adds demo data to an empty database)
  seed.mjs         npm run seed: reset the database
  config/          env.mjs, the only place that reads process.env
  routes/          URL + validation → controller        (no logic)
  middleware/      validate, request logging, 404 + error handler
  controllers/     HTTP in/out, picks the status code    (thin)
  services/        business rules, throws AppErrors      (no Express, no Sequelize)
  repositories/    data access via Sequelize, returns plain objects (no rules)
  models/ db/      tables, connection, demo data
  mail/            SMTP mailer (nodemailer) + log-only mailer for development
  cache/           in-memory cache with a Redis-like async interface + all cache keys
  errors/          AppError and helpers (notFound, conflict, validationError)
  validation/      Zod schemas
```

Services get their dependencies passed in (`createEventService({ events, registrations, cache })`),
so tests can swap the mailer or the cache without mocking modules.

The integration tests in `api/tests/integration` only talk HTTP. The original `events.test.mjs` is unchanged;
`capacity`, `mail` and `cache` tests were added. Unit tests live in `api/tests/unit`.

### Confirmation mail

After a successful registration the participant gets a confirmation mail.

- The registration is **stored first**; the mail is sent **in the background** (not awaited), so a slow,
  broken or offline mail provider can never fail or delay a registration. Failures are logged as `warn`.
- SMTP timeouts are short (`MAIL_TIMEOUT_MS`, default 10 s) instead of nodemailer's default of minutes.
- Without `SMTP_URL`, mails are only written to the log, so local development needs no mail account.

Trade-off: if the provider is down, that mail is lost (it is logged, not retried). A durable fix is an outbox
table or a RabbitMQ queue (see `api/lab/`) with a worker that retries.

### Caching

`GET /events`, `/events/:id`, `/events/:id/registrations` and `/stats` are cached (cache-aside, in the services).

- Every write deletes exactly the keys it makes stale, **after** the database write (see `cache/cacheKeys.mjs`).
- A generation counter stops a read that started before a write from putting stale data back in the cache.
- Errors (404s) are never cached. `CACHE_TTL_SECONDS` (default 60) is only a safety net, e.g. for the time-based
  `past` status in `/stats`.
- The cache is per process. With more than one API instance you would swap in a Redis store with the same interface.

### Deployment (Render)

`render.yaml` describes both services. Dashboard → New → Blueprint → pick this repo.
Render's free tier blocks outbound SMTP on ports 25, 465 and 587, so use a provider that also listens on **2525**,
for example Brevo: `SMTP_URL=smtp://<login>:<smtp-key>@smtp-relay.brevo.com:2525` and a verified sender in `MAIL_FROM`.

| Method | URL | |
|---|---|---|
| GET | `/api/health` | Health check |
| GET / POST | `/api/events` | List / create |
| GET / PATCH / DELETE | `/api/events/:id` | One event (incl. `registered`, `spotsLeft`) |
| GET / POST | `/api/events/:id/registrations` | List / register `{ name, email }` |
| GET | `/api/stats` | Occupancy per event |

Errors always have this shape: `{ "error": { "code", "message", "details?" } }`.

### web/

```
api/          client.js (fetch + ApiError) and events.js (one function per endpoint)
views/        one component per page, registered in router.js
components/   reusable pieces: EventCard, SeatMeter, RegistrationForm, ErrorMessage
styles.css    design tokens at the top, change those first
```
