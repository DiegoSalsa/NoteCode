// Only creates/resets the dedicated loopback cluster under this checkout.
import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";
const root = process.cwd();
const dir = path.join(root, ".test-data");
const data = path.join(dir, "postgres");
const bin = process.env.LOCAL_PG_BIN || "C:/Program Files/PostgreSQL/17/bin";
const port = "55473";
const db = "notecode_commercial_test",
  restore = "notecode_commercial_restore";
const run = (file, args) =>
  execFileSync(
    path.join(bin, process.platform === "win32" ? `${file}.exe` : file),
    args,
    {
      encoding: "utf8",
      stdio: file === "pg_ctl" ? "ignore" : ["ignore", "pipe", "pipe"],
    },
  );
const sql = (name, query) =>
  run("psql", [
    "-X",
    "-h",
    "127.0.0.1",
    "-p",
    port,
    "-U",
    "postgres",
    "-d",
    name,
    "-v",
    "ON_ERROR_STOP=1",
    "-Atc",
    query,
  ]).trim();
mkdirSync(dir, { recursive: true });
if (!existsSync(path.join(data, "PG_VERSION")))
  run("initdb", [
    "-D",
    data,
    "-U",
    "postgres",
    "-A",
    "trust",
    "--encoding=UTF8",
    "--locale=C",
  ]);
if (!existsSync(path.join(data, "postmaster.pid")))
  run("pg_ctl", [
    "-D",
    data,
    "-l",
    path.join(dir, "postgres.log"),
    "-o",
    `-h 127.0.0.1 -p ${port}`,
    "-w",
    "start",
  ]);
const actual = sql("postgres", "SHOW data_directory");
if (path.resolve(actual).toLowerCase() !== path.resolve(data).toLowerCase())
  throw new Error("Refusing to operate on another PostgreSQL cluster.");
const mode = process.argv[2] || "prepare";
if (mode === "stop") {
  run("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
  process.exit(0);
}
if (mode === "backup") {
  const file = path.join(dir, "commercial.backup");
  run("pg_dump", [
    "-h",
    "127.0.0.1",
    "-p",
    port,
    "-U",
    "postgres",
    "-d",
    db,
    "-Fc",
    "-f",
    file,
  ]);
  sql("postgres", `DROP DATABASE IF EXISTS ${restore} WITH (FORCE)`);
  sql("postgres", `CREATE DATABASE ${restore}`);
  run("pg_restore", [
    "-h",
    "127.0.0.1",
    "-p",
    port,
    "-U",
    "postgres",
    "-d",
    restore,
    "--exit-on-error",
    file,
  ]);
  const counts = (name) =>
    sql(
      name,
      "SELECT (SELECT count(*) FROM projects), (SELECT count(*) FROM quotes), (SELECT count(*) FROM invoices), (SELECT count(*) FROM payments), (SELECT count(*) FROM commercial_agreements), (SELECT count(*) FROM quote_decisions), (SELECT count(*) FROM client_portal_tokens)",
    );
  if (counts(db) !== counts(restore)) throw new Error("Restore count mismatch");
  const checksums = (name) =>
    sql(
      name,
      "SELECT md5(string_agg(row_to_json(i)::text, '' ORDER BY id)) FROM invoices i",
    );
  if (checksums(db) !== checksums(restore))
    throw new Error("Financial restore mismatch");
  for (const table of [
    "quotes",
    "quote_items",
    "payments",
    "commercial_agreements",
    "quote_decisions",
    "billing_milestones",
    "documents",
    "client_portal_tokens",
    "portal_access_logs",
  ]) {
    const digest = (name) =>
      sql(
        name,
        `SELECT md5(string_agg(row_to_json(r)::text, '' ORDER BY id)) FROM ${table} r`,
      );
    if (digest(db) !== digest(restore))
      throw new Error(`Restore mismatch: ${table}`);
  }
  let protectedInvoice = false;
  try {
    sql(
      restore,
      "UPDATE invoices SET amount=amount+1 WHERE number='LEGACY-PAID'",
    );
  } catch {
    protectedInvoice = true;
  }
  if (!protectedInvoice)
    throw new Error("Restored financial protection did not execute");
  console.log(`Backup restored and verified: ${counts(restore)}`);
  process.exit(0);
}
if (mode !== "prepare") throw new Error("Unknown test database command");
// Reproducible migration from the verified main schema, never db push on a live database.
const base = execFileSync(
  "git",
  [
    "-c",
    "safe.directory=C:/Users/diego/Desktop/NoteCode",
    "show",
    "598822865f6c63f389247a0f7be55d60e19c6875:prisma/schema.prisma",
  ],
  { encoding: "utf8" },
);
const basePath = path.join(dir, "base-schema.prisma");
writeFileSync(basePath, base);
const url = `postgresql://postgres@127.0.0.1:${port}/${db}`;
const baseline = execFileSync(
  process.execPath,
  [
    "node_modules/prisma/build/index.js",
    "migrate",
    "diff",
    "--from-empty",
    "--to-schema-datamodel",
    basePath,
    "--script",
  ],
  {
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
  },
);
const baseSql = path.join(dir, "baseline.sql");
writeFileSync(baseSql, baseline);
sql("postgres", `DROP DATABASE IF EXISTS ${db} WITH (FORCE)`);
sql("postgres", `CREATE DATABASE ${db}`);
const fileSql = (file) =>
  run("psql", [
    "-X",
    "-h",
    "127.0.0.1",
    "-p",
    port,
    "-U",
    "postgres",
    "-d",
    db,
    "-v",
    "ON_ERROR_STOP=1",
    "-f",
    file,
  ]);
fileSql(baseSql);
// Legacy fixture predates the migration and has deliberately unspecified VAT.
sql(
  db,
  `INSERT INTO clients(id,name,updated_at) VALUES ('00000000-0000-4000-a000-000000000001','Legacy client',now());
INSERT INTO projects(id,name,client_id,agreed_amount,updated_at) VALUES ('00000000-0000-4000-a000-000000000002','Legacy project','00000000-0000-4000-a000-000000000001',380000,now());
INSERT INTO invoices(id,number,client,amount,net_amount,tax_rate,due_date,updated_at,status) VALUES ('00000000-0000-4000-a000-000000000003','LEGACY-PAID','Legacy client',123456.78,NULL,0,now(),now(),'Pagado');`,
);
fileSql(
  path.join(root, "prisma/migrations-manual/20261016_unified_commercial.sql"),
);
// Exercise an upgrade with already accepted/billed history under the first migration.
sql(
  db,
  `
INSERT INTO projects(id,name,client_id,updated_at) VALUES ('upgrade-project','Upgrade history','00000000-0000-4000-a000-000000000001',now());
INSERT INTO quotes(id,number,title,client_id,project_id,calculation_version,updated_at) VALUES ('upgrade-quote','UPGRADE-QUOTE','Accepted before correction','00000000-0000-4000-a000-000000000001','upgrade-project',1,now());
UPDATE quotes SET status='Enviada',sent_at=now() WHERE id='upgrade-quote';
UPDATE quotes SET status='Aprobada' WHERE id='upgrade-quote';
INSERT INTO commercial_agreements(id,quote_id,client_id,project_id,currency,net_amount,tax_amount,total_amount,tax_rate,content_hash) VALUES ('upgrade-agreement','upgrade-quote','00000000-0000-4000-a000-000000000001','upgrade-project','CLP',380000,72200,452200,19,'upgrade-hash');
UPDATE projects SET current_agreement_id='upgrade-agreement',agreed_amount=452200 WHERE id='upgrade-project';
INSERT INTO billing_milestones(id,agreement_id,position,title,net_amount,tax_amount,amount) VALUES ('upgrade-milestone','upgrade-agreement',0,'Anticipo',190000,36100,226100);
INSERT INTO invoices(id,number,client,client_id,project_id,amount,net_amount,tax_rate,currency,due_date,updated_at,source,agreement_id,billing_milestone_id) VALUES ('upgrade-invoice','UPGRADE-DEV','Legacy client','00000000-0000-4000-a000-000000000001','upgrade-project',226100,190000,19,'CLP',now(),now(),'PROJECT','upgrade-agreement','upgrade-milestone');
INSERT INTO payments(id,invoice_id,amount,currency) VALUES ('upgrade-payment','upgrade-invoice',100000,'CLP');
UPDATE invoices SET status='Parcial' WHERE id='upgrade-invoice';
INSERT INTO invoices(id,number,client,client_id,project_id,amount,tax_rate,currency,due_date,updated_at,status,notes) VALUES ('upgrade-recurring','REC-UPGRADE','Legacy client','00000000-0000-4000-a000-000000000001','upgrade-project',70000,0,'CLP',now(),now(),'Pagado',concat('Facturaci',chr(243),'n recurrente: Mantenimiento historico'));
`,
);
const historyDigest = () =>
  [
    "projects",
    "quotes",
    "invoices",
    "payments",
    "commercial_agreements",
    "billing_milestones",
  ]
    .map((table) =>
      sql(
        db,
        `SELECT md5(string_agg(row_to_json(r)::text, '' ORDER BY id)) FROM ${table} r`,
      ),
    )
    .join("|");
const beforeCorrection = historyDigest();
fileSql(
  path.join(
    root,
    "prisma/migrations-manual/20261016_commercial_corrections.sql",
  ),
);
if (historyDigest() !== beforeCorrection)
  throw new Error("Corrective migration changed existing commercial history");
if (
  sql(
    db,
    "SELECT commercial_invoice_origin(i) FROM invoices i WHERE id='upgrade-recurring'",
  ) !== "CONTRACT"
)
  throw new Error("Legacy SQL recurring classifier mismatch");
if (
  sql(
    db,
    "SELECT agreed_amount || '|' || (sale_net_amount IS NULL)::text FROM projects WHERE id='00000000-0000-4000-a000-000000000002'",
  ) !== "380000|true"
)
  throw new Error("Legacy project changed");
if (
  sql(
    db,
    "SELECT amount || '|' || (net_amount IS NULL)::text FROM invoices WHERE number='LEGACY-PAID'",
  ) !== "123456.78|true"
)
  throw new Error("Legacy invoice changed");
writeFileSync(path.join(dir, "database-url.txt"), url);
console.log(
  "Isolated PostgreSQL ready; baseline → unified migration → corrective migration and legacy preservation verified.",
);
