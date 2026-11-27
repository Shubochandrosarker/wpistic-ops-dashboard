create table if not exists mail_hook_log (
  id integer generated always as identity primary key,
  at timestamptz not null default now(),
  payload text not null default '',
  result text not null default ''
);
