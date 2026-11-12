create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function private.touch_updated_at() from public, anon, authenticated;

create trigger infrastructure_assets_touch_updated_at
before update on civic.infrastructure_assets
for each row execute function private.touch_updated_at();

create trigger maintenance_work_orders_touch_updated_at
before update on civic.maintenance_work_orders
for each row execute function private.touch_updated_at();

create trigger capital_scenarios_touch_updated_at
before update on civic.capital_scenarios
for each row execute function private.touch_updated_at();
