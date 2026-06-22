-- Run this once in Supabase SQL editor before deploying task board/timeline changes.

create table if not exists project_tasks (
  id text primary key default gen_random_uuid()::text,
  project_id text not null references projects(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'Por hacer',
  priority text not null default 'Media',
  due_date timestamp(3),
  created_at timestamp(3) not null default current_timestamp,
  updated_at timestamp(3) not null default current_timestamp
);

create index if not exists project_tasks_project_id_idx on project_tasks(project_id);
create index if not exists project_tasks_status_idx on project_tasks(status);
create index if not exists project_tasks_priority_idx on project_tasks(priority);
create index if not exists project_tasks_due_date_idx on project_tasks(due_date);

alter table documents
  add column if not exists project_id text;

do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where constraint_name = 'documents_project_id_fkey'
      and table_name = 'documents'
  ) then
    alter table documents
      add constraint documents_project_id_fkey
      foreign key (project_id) references projects(id) on delete set null;
  end if;
end $$;

create index if not exists documents_project_id_idx on documents(project_id);
