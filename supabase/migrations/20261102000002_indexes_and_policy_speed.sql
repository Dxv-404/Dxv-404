-- Advisor follow-up: index the remaining foreign keys, and evaluate "who am I" once per query in policies
-- instead of once per row.
create index if not exists table_tickets_account_idx on private.table_tickets (account_id);
create index if not exists crew_audit_actor_idx on public.crew_audit (actor);
create index if not exists crew_invites_created_by_idx on public.crew_invites (created_by);
create index if not exists rescue_requests_decided_by_idx on public.rescue_requests (decided_by);
create index if not exists rescue_requests_requester_account_idx on public.rescue_requests (requester_account);
create index if not exists rescue_requests_target_account_idx on public.rescue_requests (target_account);

drop policy accounts_read on public.accounts;
create policy accounts_read on public.accounts for select to authenticated using (
  id = (select private.me()) or exists (
    select 1 from public.crew_members mine join public.crew_members theirs on theirs.crew_id = mine.crew_id
    where mine.account_id = (select private.me()) and mine.status = 'active' and theirs.account_id = accounts.id));
drop policy accounts_update_own on public.accounts;
create policy accounts_update_own on public.accounts for update to authenticated
  using (id = (select private.me()) and deleted_at is null) with check (id = (select private.me()));
drop policy logins_read_own on public.account_logins;
create policy logins_read_own on public.account_logins for select to authenticated using (account_id = (select private.me()));
drop policy members_read on public.crew_members;
create policy members_read on public.crew_members for select to authenticated using (private.is_member(crew_id) or account_id = (select private.me()));
drop policy invites_read on public.crew_invites;
create policy invites_read on public.crew_invites for select to authenticated using (private.role_in(crew_id, (select private.me())) in ('owner', 'admin'));
drop policy rescue_read on public.rescue_requests;
create policy rescue_read on public.rescue_requests for select to authenticated
  using (private.role_in(crew_id, (select private.me())) in ('owner', 'admin') or requester_auth = (select auth.uid()));
