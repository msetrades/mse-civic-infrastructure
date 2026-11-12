-- Index product foreign keys for joins and parent-row updates/deletes.
create index if not exists "mse_fk_asset_inspections_1" on "civic"."asset_inspections" ("inspected_by");
create index if not exists "mse_fk_capital_scenario_items_1" on "civic"."capital_scenario_items" ("organization_id", "asset_id");
create index if not exists "mse_fk_capital_scenario_items_2" on "civic"."capital_scenario_items" ("organization_id", "scenario_id");
create index if not exists "mse_fk_capital_scenarios_1" on "civic"."capital_scenarios" ("created_by");
create index if not exists "mse_fk_infrastructure_assets_1" on "civic"."infrastructure_assets" ("created_by");
create index if not exists "mse_fk_maintenance_work_orders_1" on "civic"."maintenance_work_orders" ("created_by");
create index if not exists "mse_fk_maintenance_work_orders_2" on "civic"."maintenance_work_orders" ("organization_id", "asset_id");
create index if not exists "mse_fk_maintenance_work_orders_3" on "civic"."maintenance_work_orders" ("organization_id", "inspection_id");
create index if not exists "mse_fk_organizations_1" on "civic"."organizations" ("created_by");

