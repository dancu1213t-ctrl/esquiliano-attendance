create or replace function public.att_lunch_queue() returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare office_now timestamp:=now() at time zone 'America/Belize'; count_new integer;
begin
 if extract(isodow from office_now)>5 or office_now::time<'12:00' or office_now::time>='13:00' then return 0; end if;
 insert into att_notifications(user_id,actor_id,title,body,lunch_date)
 select p.id,p.id,'Lunch time','Hey, '||p.name||', it’s lunch time. Enjoy it. See you at 1 p.m.!',office_now::date
 from att_profiles p
 cross join lateral (
   select e.action,e.work_date from att_events e
   where e.user_id=p.id and e.happened_at<=now()
   order by e.happened_at desc,e.id desc limit 1
 ) latest
 where p.active and latest.action='IN' and latest.work_date=office_now::date
 on conflict(user_id,lunch_date) where lunch_date is not null do nothing;
 get diagnostics count_new=row_count;
 return count_new;
end $$;
revoke all on function public.att_lunch_queue() from public,anon,authenticated;
