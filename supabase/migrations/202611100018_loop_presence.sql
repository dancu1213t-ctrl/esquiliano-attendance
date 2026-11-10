begin;
create table public.loop_presence (
  user_id uuid primary key references public.att_profiles(id) on delete cascade,
  last_seen timestamptz not null
);
alter table public.loop_presence enable row level security;
revoke all on public.loop_presence from public, anon, authenticated;

create function public.loop_presence_snapshot() returns table(user_id uuid, last_seen timestamptz, online boolean)
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not att_is_active() then raise exception 'Sign in required'; end if;
  insert into loop_presence as p(user_id,last_seen) values(auth.uid(),now())
  on conflict on constraint loop_presence_pkey do update set last_seen=excluded.last_seen
  where p.last_seen < excluded.last_seen - interval '20 seconds';

  return query
  select p.user_id,p.last_seen,p.last_seen >= now() - interval '75 seconds'
  from loop_presence p join att_profiles a on a.id=p.user_id where a.active;
end $$;
revoke all on function public.loop_presence_snapshot() from public,anon;
grant execute on function public.loop_presence_snapshot() to authenticated;
commit;
