# Deployment

## Vercel + Supabase

The app uses Prisma with Supabase Postgres. In Vercel, `DATABASE_URL` must use the Supabase pooler, not the direct database host.

Use this shape for the runtime connection:

```text
DATABASE_URL="postgresql://postgres.<project-ref>:<password>@aws-1-us-west-2.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require"
```

Keep `DIRECT_URL` for Prisma migrations or direct database operations:

```text
DIRECT_URL="postgresql://postgres.<project-ref>:<password>@aws-1-us-west-2.pooler.supabase.com:5432/postgres?sslmode=require"
```

Do not use this host for `DATABASE_URL` on Vercel:

```text
db.<project-ref>.supabase.co:5432
```

Vercel serverless functions can fail to reach that direct host. After changing environment variables in Vercel, redeploy the project so the new values are available to the runtime.

## Document storage

Documents can be stored in Supabase Storage so large contracts and agreements do not live in Postgres.

Create a private Storage bucket, for example:

```text
documents
```

Add these environment variables in Vercel:

```text
SUPABASE_URL="https://<project-ref>.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
SUPABASE_DOCUMENTS_BUCKET="documents"
```

Before deploying document storage changes, run this SQL once in the Supabase SQL editor:

```text
prisma/migrations-manual/20260622_documents_storage.sql
prisma/migrations-manual/20260622_project_tasks_timeline.sql
```

Existing documents stored in Postgres continue to download through the `file_data` fallback. New uploads use Storage when these variables are configured.

## ERP migration

The full ERP schema was applied on 2026-07-23. For a new environment, execute these scripts in order:

```text
prisma/migrations-manual/20260622_documents_storage.sql
prisma/migrations-manual/20260622_project_tasks_timeline.sql
prisma/migrations-manual/20260723_full_erp.sql
prisma/migrations-manual/20260723_erp_defaults.sql
prisma/migrations-manual/20260723_push_notifications.sql
prisma/migrations-manual/20260728_persistent_client_portal.sql
prisma/migrations-manual/20260728_erp_connection_audit.sql
```

The ERP migration preserves the deprecated `project_credentials` table as `project_credentials_legacy`. The application never reads that table; active credentials use AES-256-GCM through the `credentials` table.

## Daily automations

`vercel.json` schedules `/api/automations/run` every day at 12:00 UTC. Configure a strong random value in Vercel:

```text
CRON_SECRET="<random-secret>"
```

Vercel sends it as a bearer token when invoking the cron route. Users can also run the same checks manually from **Actividad → Revisar ahora**.

## Mobile push notifications

NoteCode derives a stable VAPID key pair from the existing `SESSION_SECRET`, so push works without adding another secret. The private key never leaves the server.

To manage a separate key pair explicitly, add these optional values and keep the private key outside Git:

```text
NEXT_PUBLIC_VAPID_PUBLIC_KEY="<public-key>"
VAPID_PRIVATE_KEY="<private-key>"
VAPID_SUBJECT="mailto:admin@purocode.com"
```

When explicit values are present they take precedence over the derived pair. Add them to Vercel for Production, Preview and Development, then redeploy. Never rotate only one side of the key pair: existing device subscriptions would stop working. Rotating `SESSION_SECRET` also changes the fallback VAPID identity and requires devices to subscribe again.

On Android, notifications can be enabled directly from **Actividad → Notificaciones push**. On iPhone/iPad, first add NoteCode to the Home Screen from Safari, open the installed app and enable notifications from the same panel. Web Push on Apple devices requires the installed web app.
