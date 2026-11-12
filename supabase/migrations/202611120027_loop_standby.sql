begin;
create function public.loop_presence_status() returns table(user_id uuid,last_seen timestamptz,online boolean,clocked_in boolean)
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not att_is_active() then raise exception 'Sign in required'; end if;
 insert into loop_presence as p(user_id,last_seen) values(auth.uid(),now())
 on conflict on constraint loop_presence_pkey do update set last_seen=excluded.last_seen
 where p.last_seen < excluded.last_seen-interval '20 seconds';
 return query
 select a.id,p.last_seen,coalesce(p.last_seen>=now()-interval '32 seconds',false),coalesce(latest.action='IN',false)
 from att_profiles a
 left join loop_presence p on p.user_id=a.id
 left join lateral(
  select e.action from att_events e where e.user_id=a.id and e.happened_at<=now()
  order by e.happened_at desc,e.id desc limit 1
 ) latest on true
 where a.active;
end $$;
revoke all on function public.loop_presence_status() from public,anon;
grant execute on function public.loop_presence_status() to authenticated;
commit;
