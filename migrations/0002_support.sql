create table if not exists desk (
  id text primary key,
  name text not null,
  join_code text not null unique,
  anychat_key text,
  anychat_channel text,
  created_by text not null,
  created_at timestamptz not null default now()
);

create table if not exists desk_member (
  desk_id text not null references desk(id) on delete cascade,
  user_id text not null,
  role text not null default 'agent',
  created_at timestamptz not null default now(),
  primary key (desk_id, user_id)
);

create index if not exists desk_member_user_idx on desk_member (user_id);

create table if not exists mailbox (
  id text primary key,
  desk_id text not null references desk(id) on delete cascade,
  label text not null,
  address text not null,
  imap_host text not null,
  imap_port integer not null default 993,
  smtp_host text not null,
  smtp_port integer not null default 587,
  username text not null,
  secret text not null,
  created_at timestamptz not null default now()
);

create index if not exists mailbox_desk_idx on mailbox (desk_id);

create table if not exists mail_message (
  id text primary key,
  desk_id text not null,
  mailbox_id text not null,
  uid text not null,
  from_name text not null default '',
  from_addr text not null,
  subject text not null,
  snippet text not null default '',
  body text not null default '',
  at timestamptz not null,
  unique (mailbox_id, uid)
);

create index if not exists mail_message_desk_idx on mail_message (desk_id, at desc);
