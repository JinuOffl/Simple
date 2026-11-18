-- Migration 005: Additive refund_credits RPC function
create or replace function refund_credits(
  p_user_id uuid,
  p_cost int,
  p_action_kind text,
  p_app_id uuid default null
)
returns table (
  refunded boolean,
  remaining_credits int,
  credits_used int,
  monthly_credit_limit int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ent entitlements%rowtype;
  v_new_used int;
begin
  if p_cost < 0 then
    raise exception 'Refund credit cost must be non-negative';
  end if;

  insert into entitlements (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select *
  into v_ent
  from entitlements e
  where e.user_id = p_user_id
  for update;

  v_new_used := greatest(v_ent.credits_used - p_cost, 0);

  update entitlements e
  set credits_used = v_new_used,
      updated_at = now()
  where e.user_id = p_user_id;

  insert into usage_ledger (
    user_id,
    app_id,
    action_kind,
    credit_cost_class,
    credits_charged,
    metadata
  ) values (
    p_user_id,
    p_app_id,
    p_action_kind,
    'refund',
    0,
    jsonb_build_object('refund', p_cost)
  );

  return query select
    true,
    greatest(v_ent.monthly_credit_limit - v_new_used, 0),
    v_new_used,
    v_ent.monthly_credit_limit;
end;
$$;

revoke all on function refund_credits(uuid, int, text, uuid) from public, anon, authenticated;
