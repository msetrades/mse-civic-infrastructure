-- Isolate Civic Systems from other products sharing the suite project.
create schema civic;
revoke all on schema civic from public, anon, authenticated;
grant usage on schema civic to authenticated;

alter table public.organizations set schema civic;
alter table public.organization_members set schema civic;
alter table public.infrastructure_assets set schema civic;
alter table public.asset_inspections set schema civic;
alter table public.maintenance_work_orders set schema civic;
alter table public.capital_scenarios set schema civic;
alter table public.capital_scenario_items set schema civic;

-- Counter inherited default privileges explicitly, then restore authenticated access.
revoke all on all tables in schema civic from public, anon;
grant select, insert, update, delete on civic.organizations to authenticated;
grant select on civic.organization_members to authenticated;
grant select, insert, update, delete on civic.infrastructure_assets to authenticated;
grant select, insert on civic.asset_inspections to authenticated;
grant select, insert, update, delete on civic.maintenance_work_orders to authenticated;
grant select, insert, update, delete on civic.capital_scenarios to authenticated;
grant select, insert, update, delete on civic.capital_scenario_items to authenticated;

create or replace function private.has_organization_role(target_organization uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from civic.organization_members m
    where m.organization_id = target_organization
      and m.user_id = (select auth.uid())
      and m.role = any (allowed_roles)
  ) or exists (
    select 1 from civic.organizations o
    where o.id = target_organization
      and o.created_by = (select auth.uid())
      and 'owner' = any (allowed_roles)
  );
$$;
