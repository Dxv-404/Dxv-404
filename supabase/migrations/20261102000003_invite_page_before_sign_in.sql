-- A brand-new phone opens a crew link before it has signed in: it must still see the crew's name and
-- members (to join, or to pick "I'm already in this crew"). Knowing the link is what grants this.
grant execute on function public.invite_info(text) to anon;
