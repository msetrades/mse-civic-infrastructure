-- Civic Systems operational data model.
-- All operational records are private to an organization; there is no anon access.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 120),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (id, created_by)
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'planner', 'inspector', 'engineer', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.infrastructure_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  asset_code text not null,
  asset_type text not null,
  display_name text not null,
  location_label text,
  commissioned_on date,
  condition_rating smallint not null check (condition_rating between 1 and 5),
  criticality_rating smallint not null check (criticality_rating between 1 and 5),
  failures_24m integer not null default 0 check (failures_24m >= 0),
  estimated_repair_cost numeric(14,2) not null check (estimated_repair_cost >= 0),
  lifecycle_status text not null default 'active' check (lifecycle_status in ('active', 'watch', 'under_repair', 'retired')),
  last_inspected_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, asset_code)
);

create table public.asset_inspections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  asset_id uuid not null,
  inspected_by uuid not null references auth.users(id) on delete restrict,
  inspected_at timestamptz not null default now(),
  condition_rating smallint not null check (condition_rating between 1 and 5),
  failure_observed boolean not null default false,
  findings text not null default '' check (length(findings) <= 8000),
  attachment_path text,
  created_at timestamptz not null default now(),
  foreign key (organization_id, asset_id)
    references public.infrastructure_assets(organization_id, id) on delete cascade,
  unique (organization_id, id)
);

create table public.maintenance_work_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  asset_id uuid not null,
  inspection_id uuid,
  title text not null check (length(btrim(title)) between 3 and 180),
  description text not null default '' check (length(description) <= 8000),
  priority smallint not null check (priority between 1 and 5),
  status text not null default 'planned' check (status in ('planned', 'assigned', 'in_progress', 'blocked', 'completed', 'cancelled')),
  assigned_to uuid references auth.users(id) on delete set null,
  planned_for date,
  estimated_cost numeric(14,2) not null default 0 check (estimated_cost >= 0),
  completed_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, asset_id)
    references public.infrastructure_assets(organization_id, id) on delete restrict,
  foreign key (organization_id, inspection_id)
    references public.asset_inspections(organization_id, id) on delete restrict,
  unique (organization_id, id)
);

create table public.capital_scenarios (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(btrim(name)) between 2 and 120),
  budget numeric(14,2) not null check (budget >= 0),
  scoring_version text not null,
  assumptions jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (organization_id, id)
);

create table public.capital_scenario_items (
  organization_id uuid not null,
  scenario_id uuid not null,
  asset_id uuid not null,
  risk_score numeric(7,3) not null check (risk_score between 0 and 100),
  consequence_score numeric(7,3) not null check (consequence_score between 0 and 100),
  estimated_cost numeric(14,2) not null check (estimated_cost >= 0),
  selected_for_plan boolean not null default false,
  rank integer not null check (rank > 0),
  primary key (scenario_id, asset_id),
  foreign key (organization_id, scenario_id)
    references public.capital_scenarios(organization_id, id) on delete cascade,
  foreign key (organization_id, asset_id)
    references public.infrastructure_assets(organization_id, id) on delete restrict
);

create index organization_members_by_user_idx on public.organization_members(user_id, organization_id);
create index assets_org_status_idx on public.infrastructure_assets(organization_id, lifecycle_status, condition_rating);
create index inspections_asset_time_idx on public.asset_inspections(organization_id, asset_id, inspected_at desc);
create index work_orders_org_status_date_idx on public.maintenance_work_orders(organization_id, status, planned_for);
create index work_orders_assignee_idx on public.maintenance_work_orders(assigned_to, status) where assigned_to is not null;
create index capital_scenarios_org_recent_idx on public.capital_scenarios(organization_id, created_at desc);
create index scenario_items_rank_idx on public.capital_scenario_items(scenario_id, rank);

create or replace function private.has_organization_role(target_organization uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = target_organization
      and m.user_id = (select auth.uid())
      and m.role = any (allowed_roles)
  ) or exists (
    select 1
    from public.organizations o
    where o.id = target_organization
      and o.created_by = (select auth.uid())
      and 'owner' = any (allowed_roles)
  );
$$;

create or replace function private.is_organization_member(target_organization uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_organization_role(target_organization, array['owner','admin','planner','inspector','engineer','viewer']);
$$;

revoke all on function private.has_organization_role(uuid, text[]) from public, anon;
revoke all on function private.is_organization_member(uuid) from public, anon;
grant execute on function private.has_organization_role(uuid, text[]) to authenticated;
grant execute on function private.is_organization_member(uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.infrastructure_assets enable row level security;
alter table public.asset_inspections enable row level security;
alter table public.maintenance_work_orders enable row level security;
alter table public.capital_scenarios enable row level security;
alter table public.capital_scenario_items enable row level security;

create policy "organization members can read their organization"
  on public.organizations for select to authenticated
  using ((select private.is_organization_member(id)));
create policy "signed-in users can create an organization they own"
  on public.organizations for insert to authenticated
  with check (created_by = (select auth.uid()));
create policy "organization admins can update organization details"
  on public.organizations for update to authenticated
  using ((select private.has_organization_role(id, array['owner','admin'])))
  with check ((select private.has_organization_role(id, array['owner','admin'])));

create policy "members can read organization membership"
  on public.organization_members for select to authenticated
  using ((select private.is_organization_member(organization_id)));
-- Membership changes will be routed through a server-side invite flow; authenticated
-- clients must not be able to add themselves or rewrite another member's identity.

create policy "members can read infrastructure assets"
  on public.infrastructure_assets for select to authenticated
  using ((select private.is_organization_member(organization_id)));
create policy "planners and engineers can create assets"
  on public.infrastructure_assets for insert to authenticated
  with check (created_by = (select auth.uid()) and (select private.has_organization_role(organization_id, array['owner','admin','planner','engineer'])));
create policy "planners and engineers can update assets"
  on public.infrastructure_assets for update to authenticated
  using ((select private.has_organization_role(organization_id, array['owner','admin','planner','engineer'])))
  with check ((select private.has_organization_role(organization_id, array['owner','admin','planner','engineer'])));
create policy "admins can retire or remove assets"
  on public.infrastructure_assets for delete to authenticated
  using ((select private.has_organization_role(organization_id, array['owner','admin'])));

create policy "members can read inspections"
  on public.asset_inspections for select to authenticated
  using ((select private.is_organization_member(organization_id)));
create policy "inspectors and engineers can record inspections"
  on public.asset_inspections for insert to authenticated
  with check (inspected_by = (select auth.uid()) and (select private.has_organization_role(organization_id, array['owner','admin','inspector','engineer'])));

create policy "members can read work orders"
  on public.maintenance_work_orders for select to authenticated
  using ((select private.is_organization_member(organization_id)));
create policy "planners can create work orders"
  on public.maintenance_work_orders for insert to authenticated
  with check (created_by = (select auth.uid()) and (select private.has_organization_role(organization_id, array['owner','admin','planner','engineer'])));
create policy "planners and assigned engineers can update work orders"
  on public.maintenance_work_orders for update to authenticated
  using ((select private.has_organization_role(organization_id, array['owner','admin','planner','engineer'])) or assigned_to = (select auth.uid()))
  with check ((select private.is_organization_member(organization_id)) and ((select private.has_organization_role(organization_id, array['owner','admin','planner','engineer'])) or assigned_to = (select auth.uid())));
create policy "admins can remove work orders"
  on public.maintenance_work_orders for delete to authenticated
  using ((select private.has_organization_role(organization_id, array['owner','admin'])));

create policy "members can read capital scenarios"
  on public.capital_scenarios for select to authenticated
  using ((select private.is_organization_member(organization_id)));
create policy "planners can create capital scenarios"
  on public.capital_scenarios for insert to authenticated
  with check (created_by = (select auth.uid()) and (select private.has_organization_role(organization_id, array['owner','admin','planner'])));
create policy "planners can update capital scenarios"
  on public.capital_scenarios for update to authenticated
  using ((select private.has_organization_role(organization_id, array['owner','admin','planner'])))
  with check ((select private.has_organization_role(organization_id, array['owner','admin','planner'])));
create policy "admins can delete capital scenarios"
  on public.capital_scenarios for delete to authenticated
  using ((select private.has_organization_role(organization_id, array['owner','admin'])));

create policy "members can read scenario items"
  on public.capital_scenario_items for select to authenticated
  using ((select private.is_organization_member(organization_id)));
create policy "planners can manage scenario items"
  on public.capital_scenario_items for all to authenticated
  using ((select private.has_organization_role(organization_id, array['owner','admin','planner'])))
  with check ((select private.has_organization_role(organization_id, array['owner','admin','planner'])));

grant select, insert, update, delete on public.organizations to authenticated;
grant select on public.organization_members to authenticated;
grant select, insert, update, delete on public.infrastructure_assets to authenticated;
grant select, insert on public.asset_inspections to authenticated;
grant select, insert, update, delete on public.maintenance_work_orders to authenticated;
grant select, insert, update, delete on public.capital_scenarios to authenticated;
grant select, insert, update, delete on public.capital_scenario_items to authenticated;

revoke all on all tables in schema public from anon;
