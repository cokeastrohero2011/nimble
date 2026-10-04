# Nimble

Nimble is a private, single-user mental-math training instrument for exactly 10 minutes of active practice. It supports Focused and Mixed modes across seven selectable practice areas, including exact decimal multiplication and division by 10, 100, and 1000. It also provides precise per-question timing, refresh recovery, persistent raw response history, and deterministic Quick Tips without a runtime AI service.

## Architecture

- React 19 and TypeScript, implemented with Vinext and Vite
- Cloudflare Worker using the official Vinext fetch handler
- Cloudflare Workers Static Assets from `dist/client`
- Cloudflare D1 database `nimble-db`, bound to the Worker as `DB`
- Browser storage only for settings, the remembered onboarding choice, and active-session recovery
- No runtime AI, external API, application account system, or background service

The browser generates questions locally. Timers use absolute active-practice deadlines rather than interval counts, so rendering delays do not accumulate drift. The Worker validates each completed session, reconstructs correct answers from the operands, recalculates correctness and slow flags, derives session totals, and saves the session plus raw responses atomically with prepared D1 statements.

## 1. Install dependencies

Node.js 22.13 or newer is required.

```bash
npm ci
```

Use `npm install` instead when intentionally updating dependencies.

## 2. Run locally

Apply the local database migration, then start the Vite development server:

```bash
npm run db:migrate:local
npm run dev
```

Wrangler keeps local D1 data under `.wrangler/`, which is ignored by Git.

## 3. Create the D1 database

Authenticate and create the production database once:

```bash
npx wrangler login
npx wrangler d1 create nimble-db
```

The production database already created for this repository is named `nimble-db`. For a fresh Cloudflare account, replace the `database_id` in `wrangler.jsonc` with the UUID printed by the create command. Keep the binding name exactly `DB`.

## 4. Apply local migrations

```bash
npm run db:migrate:local
npx wrangler d1 migrations list nimble-db --local
```

## 5. Apply production migrations

Review version-controlled files under `migrations/`, then run:

```bash
npm run db:migrate:remote
npx wrangler d1 migrations list nimble-db --remote
```

Migrations are deliberately not run automatically by the GitHub workflow.

## 6. Add or verify the D1 binding

`wrangler.jsonc` must contain:

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "nimble-db",
      "database_id": "<the UUID returned by wrangler>",
      "migrations_dir": "migrations",
    },
  ],
}
```

Generate binding types after any Wrangler binding change:

```bash
npx wrangler types worker-configuration.d.ts
```

## 7. Validate and build

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Or run the complete gate with `npm run check`.

## 8. Deploy to Cloudflare

The official Vinext Cloudflare adapter builds the app and deploys the Worker plus static assets from the root `wrangler.jsonc`:

```bash
npm run deploy
```

For a configuration-only preflight:

```bash
npm run deploy:dry-run
```

## 9. View production logs

```bash
npm run logs
```

Workers Logs and sampled traces are also enabled in `wrangler.jsonc` and available in the Cloudflare dashboard.

## 10. Update and redeploy

```bash
git pull --ff-only
npm ci
npm run check
npm run db:migrate:remote
npm run deploy
```

Only run the migration command when there are reviewed pending migrations. Never edit production tables outside the migration system.

## GitHub deployment workflow

`.github/workflows/deploy.yml` validates every push to `main` with a deterministic install, lint, type-check, tests, and build. It deploys only when these GitHub repository secrets are configured:

- `CLOUDFLARE_API_TOKEN`: a Cloudflare API token with the permissions required to edit Workers and read the configured D1 binding
- `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account ID

If either secret is absent, validation still runs and the deploy step is safely skipped. Database migrations remain a separate reviewed operation.

## Optional privacy with Cloudflare Access

Nimble intentionally has no multi-user authentication. To keep the production URL private without changing the app:

1. In Cloudflare Zero Trust, open **Access → Applications**.
2. Add a **Self-hosted** application for the Nimble hostname.
3. Add an **Allow** policy limited to your email address or chosen identity-provider group.
4. Leave unmatched users denied.
5. Verify the policy in a private browser window before relying on it.

## Database model

- `sessions`: mode, enabled practice areas, timestamps, fixed duration, slow threshold, recomputed totals, and average response time
- `responses`: linked raw drill, question text, operand JSON, exact answer strings, analysis metadata, correctness, millisecond timing, slow flag, and answer timestamp

The migrations use primary and foreign keys, `CHECK` constraints, cascading response deletion, and indexes for newest-session and per-session report queries. Migration `0002_seven_drills.sql` preserves existing five-drill history while widening response storage for decimal drills and exact answer strings.
