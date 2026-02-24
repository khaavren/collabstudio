-- Band Joes Studio multi-organization schema + policies
create extension if not exists pgcrypto;

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  website text,
  contact_email text,
  phone text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  country text,
  logo_storage_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists team_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('admin', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  room_id uuid references rooms(id) on delete cascade,
  title text not null,
  cover_storage_path text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create table if not exists asset_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  asset_id uuid references assets(id) on delete cascade,
  version int not null,
  prompt text not null,
  params jsonb not null default '{}'::jsonb,
  storage_path text not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (asset_id, version)
);

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  asset_version_id uuid references asset_versions(id) on delete cascade,
  body text not null,
  x double precision,
  y double precision,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create table if not exists api_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references organizations(id) on delete cascade,
  provider text,
  model text,
  default_image_size text,
  default_params jsonb not null default '{}'::jsonb,
  encrypted_api_key text,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table if not exists usage_metrics (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  month text not null,
  images_generated int not null default 0,
  storage_used_mb numeric not null default 0,
  api_calls int not null default 0,
  unique (organization_id, month)
);

alter table organizations add column if not exists name text;
alter table organizations add column if not exists slug text;
alter table organizations add column if not exists website text;
alter table organizations add column if not exists contact_email text;
alter table organizations add column if not exists phone text;
alter table organizations add column if not exists address_line1 text;
alter table organizations add column if not exists address_line2 text;
alter table organizations add column if not exists city text;
alter table organizations add column if not exists state text;
alter table organizations add column if not exists postal_code text;
alter table organizations add column if not exists country text;
alter table organizations add column if not exists logo_storage_path text;
alter table organizations add column if not exists created_at timestamptz default now();
alter table organizations add column if not exists updated_at timestamptz default now();

alter table team_members add column if not exists organization_id uuid references organizations(id) on delete cascade;
alter table team_members add column if not exists user_id uuid;
alter table team_members add column if not exists role text;
alter table team_members add column if not exists created_at timestamptz default now();

alter table rooms add column if not exists organization_id uuid references organizations(id) on delete cascade;
alter table assets add column if not exists organization_id uuid references organizations(id) on delete cascade;
alter table asset_versions add column if not exists organization_id uuid references organizations(id) on delete cascade;
alter table comments add column if not exists organization_id uuid references organizations(id) on delete cascade;

alter table api_settings add column if not exists organization_id uuid references organizations(id) on delete cascade;
alter table api_settings add column if not exists provider text;
alter table api_settings add column if not exists model text;
alter table api_settings add column if not exists default_image_size text;
alter table api_settings add column if not exists default_params jsonb default '{}'::jsonb;
alter table api_settings add column if not exists encrypted_api_key text;
alter table api_settings add column if not exists updated_at timestamptz default now();
alter table api_settings add column if not exists updated_by uuid;

alter table usage_metrics add column if not exists organization_id uuid references organizations(id) on delete cascade;
alter table usage_metrics add column if not exists month text;
alter table usage_metrics add column if not exists images_generated int default 0;
alter table usage_metrics add column if not exists storage_used_mb numeric default 0;
alter table usage_metrics add column if not exists api_calls int default 0;

do $$
declare
  default_org_id uuid;
begin
  select id
  into default_org_id
  from organizations
  order by created_at asc
  limit 1;

  if default_org_id is null then
    insert into organizations (name, slug, contact_email)
    values ('Band Joes Studio', 'band-joes-studio', null)
    returning id into default_org_id;
  end if;

  update rooms set organization_id = default_org_id where organization_id is null;
  update assets set organization_id = default_org_id where organization_id is null;
  update asset_versions set organization_id = default_org_id where organization_id is null;
  update comments set organization_id = default_org_id where organization_id is null;
  update team_members set organization_id = default_org_id where organization_id is null;
  update api_settings set organization_id = default_org_id where organization_id is null;
  update usage_metrics set organization_id = default_org_id where organization_id is null;
end $$;

update organizations
set
  name = coalesce(name, 'Band Joes Studio'),
  slug = coalesce(slug, 'band-joes-studio-' || substr(id::text, 1, 8));

alter table rooms alter column organization_id set not null;
alter table assets alter column organization_id set not null;
alter table asset_versions alter column organization_id set not null;
alter table comments alter column organization_id set not null;
alter table team_members alter column organization_id set not null;
alter table team_members alter column user_id set not null;
alter table team_members alter column role set not null;
alter table api_settings alter column organization_id set not null;
alter table usage_metrics alter column organization_id set not null;
alter table usage_metrics alter column month set not null;
alter table organizations alter column name set not null;
alter table organizations alter column slug set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'team_members_role_check'
  ) then
    alter table team_members
    add constraint team_members_role_check
    check (role in ('admin', 'editor', 'viewer'));
  end if;
end $$;

create index if not exists team_members_org_idx on team_members (organization_id);
create index if not exists team_members_user_idx on team_members (user_id);
create index if not exists rooms_org_idx on rooms (organization_id);
create index if not exists assets_org_idx on assets (organization_id);
create index if not exists assets_room_idx on assets (room_id);
create index if not exists asset_versions_org_idx on asset_versions (organization_id);
create index if not exists asset_versions_asset_idx on asset_versions (asset_id);
create index if not exists comments_org_idx on comments (organization_id);
create index if not exists comments_asset_version_idx on comments (asset_version_id);
create index if not exists usage_metrics_org_month_idx on usage_metrics (organization_id, month);
create unique index if not exists organizations_slug_unique_idx on organizations (slug);
create unique index if not exists team_members_org_user_unique_idx on team_members (organization_id, user_id);
create unique index if not exists api_settings_org_unique_idx on api_settings (organization_id);
create unique index if not exists usage_metrics_org_month_unique_idx on usage_metrics (organization_id, month);
create unique index if not exists asset_versions_asset_version_unique_idx on asset_versions (asset_id, version);

create or replace function set_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists organizations_set_updated_at on organizations;
create trigger organizations_set_updated_at
before update on organizations
for each row
execute function set_updated_at_timestamp();

drop trigger if exists api_settings_set_updated_at on api_settings;
create trigger api_settings_set_updated_at
before update on api_settings
for each row
execute function set_updated_at_timestamp();

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'assets'
  ) then
    execute 'alter publication supabase_realtime add table public.assets';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'asset_versions'
  ) then
    execute 'alter publication supabase_realtime add table public.asset_versions';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'comments'
  ) then
    execute 'alter publication supabase_realtime add table public.comments';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rooms'
  ) then
    execute 'alter publication supabase_realtime add table public.rooms';
  end if;
end $$;

alter table organizations enable row level security;
alter table team_members enable row level security;
alter table rooms enable row level security;
alter table assets enable row level security;
alter table asset_versions enable row level security;
alter table comments enable row level security;
alter table api_settings enable row level security;
alter table usage_metrics enable row level security;

-- organizations
drop policy if exists "organizations_select_member" on organizations;
create policy "organizations_select_member"
on organizations for select
using (
  exists (
    select 1
    from team_members tm
    where tm.organization_id = organizations.id
      and tm.user_id = auth.uid()
  )
);

drop policy if exists "organizations_update_admin" on organizations;
create policy "organizations_update_admin"
on organizations for update
using (
  exists (
    select 1
    from team_members tm
    where tm.organization_id = organizations.id
      and tm.user_id = auth.uid()
      and tm.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from team_members tm
    where tm.organization_id = organizations.id
      and tm.user_id = auth.uid()
      and tm.role = 'admin'
  )
);

-- team members
drop policy if exists "team_members_select_org_member" on team_members;
create policy "team_members_select_org_member"
on team_members for select
using (
  exists (
    select 1
    from team_members me
    where me.organization_id = team_members.organization_id
      and me.user_id = auth.uid()
  )
);

drop policy if exists "team_members_insert_admin" on team_members;
create policy "team_members_insert_admin"
on team_members for insert
with check (
  exists (
    select 1
    from team_members me
    where me.organization_id = team_members.organization_id
      and me.user_id = auth.uid()
      and me.role = 'admin'
  )
);

drop policy if exists "team_members_update_admin" on team_members;
create policy "team_members_update_admin"
on team_members for update
using (
  exists (
    select 1
    from team_members me
    where me.organization_id = team_members.organization_id
      and me.user_id = auth.uid()
      and me.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from team_members me
    where me.organization_id = team_members.organization_id
      and me.user_id = auth.uid()
      and me.role = 'admin'
  )
);

drop policy if exists "team_members_delete_admin" on team_members;
create policy "team_members_delete_admin"
on team_members for delete
using (
  exists (
    select 1
    from team_members me
    where me.organization_id = team_members.organization_id
      and me.user_id = auth.uid()
      and me.role = 'admin'
  )
);

-- rooms
drop policy if exists "rooms_select_org_member" on rooms;
create policy "rooms_select_org_member"
on rooms for select
using (
  exists (
    select 1
    from team_members tm
    where tm.organization_id = rooms.organization_id
      and tm.user_id = auth.uid()
  )
);

drop policy if exists "rooms_insert_editor_admin" on rooms;
create policy "rooms_insert_editor_admin"
on rooms for insert
with check (
  exists (
    select 1
    from team_members tm
    where tm.organization_id = rooms.organization_id
      and tm.user_id = auth.uid()
      and tm.role in ('admin', 'editor')
  )
);

drop policy if exists "rooms_update_editor_admin" on rooms;
create policy "rooms_update_editor_admin"
on rooms for update
using (
  exists (
    select 1
    from team_members tm
    where tm.organization_id = rooms.organization_id
      and tm.user_id = auth.uid()
      and tm.role in ('admin', 'editor')
  )
)
with check (
  exists (
    select 1
    from team_members tm
    where tm.organization_id = rooms.organization_id
      and tm.user_id = auth.uid()
      and tm.role in ('admin', 'editor')
  )
);

-- assets
drop policy if exists "assets_select_org_member" on assets;
create policy "assets_select_org_member"
on assets for select
using (
  exists (
    select 1
    from team_members tm
    where tm.organization_id = assets.organization_id
      and tm.user_id = auth.uid()
  )
);

drop policy if exists "assets_insert_editor_admin" on assets;
create policy "assets_insert_editor_admin"
on assets for insert
with check (
  exists (
    select 1
    from team_members tm
    where tm.organization_id = assets.organization_id
      and tm.user_id = auth.uid()
      and tm.role in ('admin', 'editor')
  )
);

drop policy if exists "assets_update_editor_admin" on assets;
create policy "assets_update_editor_admin"
on assets for update
using (
  exists (
    select 1
    from team_members tm
    where tm.organization_id = assets.organization_id
      and tm.user_id = auth.uid()
      and tm.role in ('admin', 'editor')
  )
)
with check (
  exists (
    select 1
    from team_members tm
    where tm.organization_id = assets.organization_id
      and tm.user_id = auth.uid()
      and tm.role in ('admin', 'editor')
  )
);

-- versions
drop policy if exists "asset_versions_select_org_member" on asset_versions;
create policy "asset_versions_select_org_member"
on asset_versions for select
using (
  exists (
    select 1
    from team_members tm
    where tm.organization_id = asset_versions.organization_id
      and tm.user_id = auth.uid()
  )
);

drop policy if exists "asset_versions_insert_editor_admin" on asset_versions;
create policy "asset_versions_insert_editor_admin"
on asset_versions for insert
with check (
  exists (
    select 1
    from team_members tm
    where tm.organization_id = asset_versions.organization_id
      and tm.user_id = auth.uid()
      and tm.role in ('admin', 'editor')
  )
);

-- comments
drop policy if exists "comments_select_org_member" on comments;
create policy "comments_select_org_member"
on comments for select
using (
  exists (
    select 1
    from team_members tm
    where tm.organization_id = comments.organization_id
      and tm.user_id = auth.uid()
  )
);

drop policy if exists "comments_insert_editor_admin" on comments;
create policy "comments_insert_editor_admin"
on comments for insert
with check (
  exists (
    select 1
    from team_members tm
    where tm.organization_id = comments.organization_id
      and tm.user_id = auth.uid()
      and tm.role in ('admin', 'editor')
  )
);

-- api settings
drop policy if exists "api_settings_select_admin" on api_settings;
create policy "api_settings_select_admin"
on api_settings for select
using (
  exists (
    select 1
    from team_members tm
    where tm.organization_id = api_settings.organization_id
      and tm.user_id = auth.uid()
      and tm.role = 'admin'
  )
);

drop policy if exists "api_settings_upsert_admin" on api_settings;
create policy "api_settings_upsert_admin"
on api_settings for insert
with check (
  exists (
    select 1
    from team_members tm
    where tm.organization_id = api_settings.organization_id
      and tm.user_id = auth.uid()
      and tm.role = 'admin'
  )
);

drop policy if exists "api_settings_update_admin" on api_settings;
create policy "api_settings_update_admin"
on api_settings for update
using (
  exists (
    select 1
    from team_members tm
    where tm.organization_id = api_settings.organization_id
      and tm.user_id = auth.uid()
      and tm.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from team_members tm
    where tm.organization_id = api_settings.organization_id
      and tm.user_id = auth.uid()
      and tm.role = 'admin'
  )
);

-- usage metrics
drop policy if exists "usage_metrics_select_org_member" on usage_metrics;
create policy "usage_metrics_select_org_member"
on usage_metrics for select
using (
  exists (
    select 1
    from team_members tm
    where tm.organization_id = usage_metrics.organization_id
      and tm.user_id = auth.uid()
  )
);

insert into storage.buckets (id, name, public)
values ('bandjoes-assets', 'bandjoes-assets', true)
on conflict (id) do nothing;

drop policy if exists "bandjoes_assets_public_read" on storage.objects;
create policy "bandjoes_assets_public_read"
  on storage.objects for select
  using (bucket_id = 'bandjoes-assets');

drop policy if exists "bandjoes_assets_org_insert" on storage.objects;
create policy "bandjoes_assets_org_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'bandjoes-assets'
    and split_part(name, '/', 1) = 'orgs'
    and exists (
      select 1
      from team_members tm
      where tm.user_id = auth.uid()
        and tm.organization_id::text = split_part(name, '/', 2)
        and tm.role in ('admin', 'editor')
    )
  );

drop policy if exists "bandjoes_assets_org_update" on storage.objects;
create policy "bandjoes_assets_org_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'bandjoes-assets'
    and split_part(name, '/', 1) = 'orgs'
    and exists (
      select 1
      from team_members tm
      where tm.user_id = auth.uid()
        and tm.organization_id::text = split_part(name, '/', 2)
        and tm.role in ('admin', 'editor')
    )
  )
  with check (
    bucket_id = 'bandjoes-assets'
    and split_part(name, '/', 1) = 'orgs'
    and exists (
      select 1
      from team_members tm
      where tm.user_id = auth.uid()
        and tm.organization_id::text = split_part(name, '/', 2)
        and tm.role in ('admin', 'editor')
    )
  );
