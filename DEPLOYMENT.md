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
