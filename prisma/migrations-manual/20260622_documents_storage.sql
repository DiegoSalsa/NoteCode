-- Run this once in Supabase SQL editor before deploying the document storage code.
-- It keeps existing database-backed documents readable while allowing new files
-- to live in Supabase Storage.

alter table documents
  add column if not exists storage_path text,
  add column if not exists storage_bucket text;

alter table documents
  alter column file_data drop not null;

create index if not exists documents_storage_path_idx
  on documents(storage_path);
