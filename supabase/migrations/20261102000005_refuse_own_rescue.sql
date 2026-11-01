-- The person a rescue request claims to be may always refuse it ("that's not my phone"); only approving
-- your own rescue needs another admin.
create or replace function public.decide_rescue(p_request uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare q public.rescue_requests; a uuid; now_acc uuid;
begin
  select * into q from public.rescue_requests where id = p_request for update;
  if q is null or q.status <> 'pending' then raise exception 'This request is no longer open' using errcode = 'P0002'; end if;
  a := private.need_admin(q.crew_id);
  if a = q.target_account and p_approve then raise exception 'Another admin has to approve your own rescue' using errcode = '42501'; end if;
  if exists (select 1 from public.accounts where id = q.target_account and deleted_at is not null) then
    raise exception 'That account was deleted' using errcode = 'P0002';
  end if;
  update public.rescue_requests set status = case when p_approve then 'approved' else 'denied' end, decided_by = a, decided_at = now() where id = q.id;
  if p_approve then
    select account_id into now_acc from public.account_logins where auth_user = q.requester_auth;
    if now_acc is not null and now_acc <> q.target_account then
      if (select count(*) from public.account_logins where account_id = now_acc) > 1 then
        delete from public.account_logins where auth_user = q.requester_auth;
      else
        perform private.merge_accounts(now_acc, q.target_account);
      end if;
    end if;
    insert into public.account_logins (auth_user, account_id) values (q.requester_auth, q.target_account)
      on conflict (auth_user) do update set account_id = excluded.account_id, last_seen = now();
  end if;
  insert into public.crew_audit (crew_id, actor, what, detail) values (q.crew_id, a, case when p_approve then 'rescue_approved' else 'rescue_denied' end, jsonb_build_object('request', q.id, 'for', q.target_account));
end $$;
