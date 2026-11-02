-- v3: bringing one account into another (recovery code, crew rescue, and now a device code with "Bring them over")
-- also carries what the v3 crews and devices added, and what earlier phases left behind. Before this, the
-- account being merged was deleted with its pending join requests, invitations, offline confirmations and
-- notification sign-ups (cascade), and its name came off crew history (audit, result changes, tables opened).
create or replace function private.merge_accounts(src uuid, dst uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare m record; d record;
begin
  if src = dst then return; end if;
  -- crews: one membership per crew, keeping the stronger role and the earlier join
  for m in select * from public.crew_members where account_id = src loop
    select * into d from public.crew_members where crew_id = m.crew_id and account_id = dst;
    if found then
      delete from public.crew_members where crew_id = m.crew_id and account_id = src;
      update public.crew_members set
        joined_at = least(d.joined_at, m.joined_at),
        status = case when d.status = 'active' or m.status = 'active' then 'active' else 'pending' end,
        role = case when 'owner' in (d.role, m.role) then 'owner'::public.crew_role
                    when 'admin' in (d.role, m.role) then 'admin'::public.crew_role else 'member'::public.crew_role end
      where crew_id = m.crew_id and account_id = dst;
    else
      update public.crew_members set account_id = dst where crew_id = m.crew_id and account_id = src;
    end if;
  end loop;
  -- join requests: a pending one is dropped where the account is already in that crew or already asked
  delete from public.crew_requests r where r.account_id = src and r.status = 'pending'
    and (exists (select 1 from public.crew_members x where x.crew_id = r.crew_id and x.account_id = dst)
         or exists (select 1 from public.crew_requests y where y.crew_id = r.crew_id and y.account_id = dst and y.status = 'pending'));
  update public.crew_requests set account_id = dst where account_id = src;
  update public.crew_requests set decided_by = dst where decided_by = src;
  update public.crew_requests set invited_by = dst where invited_by = src;
  -- invitations: one per crew, none for a crew the account is already in
  delete from public.crew_invitations i where i.account_id = src
    and (exists (select 1 from public.crew_members x where x.crew_id = i.crew_id and x.account_id = dst)
         or exists (select 1 from public.crew_invitations y where y.crew_id = i.crew_id and y.account_id = dst));
  update public.crew_invitations set account_id = dst where account_id = src;
  update public.crew_invitations set invited_by = dst where invited_by = src;
  update public.crew_tables set opened_by = dst where opened_by = src;
  update public.crew_invites set created_by = dst where created_by = src;
  update public.crew_audit set actor = dst where actor = src;
  update public.result_changes set actor = dst where actor = src;
  update public.rescue_requests set requester_account = dst where requester_account = src;
  update public.rescue_requests set decided_by = dst where decided_by = src;
  delete from public.rescue_requests where target_account = src;
  -- games and hands
  update public.game_players set account_id = dst where account_id = src;
  update public.hand_players set account_id = dst where account_id = src;
  update public.hand_cards_private set account_id = dst where account_id = src
    and not exists (select 1 from public.hand_cards_private x where x.account_id = dst and x.game_id = hand_cards_private.game_id and x.hand_no = hand_cards_private.hand_no);
  update public.offline_confirmations o set account_id = dst where o.account_id = src
    and not exists (select 1 from public.offline_confirmations x where x.game_id = o.game_id and x.account_id = dst);
  update public.trophies set account_id = dst where account_id = src;
  -- this device's notification sign-up and reports go with it
  update public.push_subscriptions set account_id = dst where account_id = src;
  update private.problem_reports set account_id = dst where account_id = src;
  -- the logins move last; the old account's own keys (recovery code, open device codes, notices, table
  -- tickets, queued pushes) go with the old account
  update public.account_logins set account_id = dst where account_id = src;
  delete from public.accounts where id = src;
end $$;
