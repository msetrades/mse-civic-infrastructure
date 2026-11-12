-- Keep the read policy separate from write policies to avoid duplicate SELECT evaluation.
drop policy if exists "planners can manage scenario items" on civic.capital_scenario_items;

create policy "planners can add scenario items"
  on civic.capital_scenario_items for insert to authenticated
  with check ((select private.has_organization_role(organization_id, array['owner','admin','planner'])));

create policy "planners can update scenario items"
  on civic.capital_scenario_items for update to authenticated
  using ((select private.has_organization_role(organization_id, array['owner','admin','planner'])))
  with check ((select private.has_organization_role(organization_id, array['owner','admin','planner'])));

create policy "planners can delete scenario items"
  on civic.capital_scenario_items for delete to authenticated
  using ((select private.has_organization_role(organization_id, array['owner','admin','planner'])));
