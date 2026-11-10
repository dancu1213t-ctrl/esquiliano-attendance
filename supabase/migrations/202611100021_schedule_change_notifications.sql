begin;
create function public.att_notify_schedule_change() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  actor uuid := auth.uid();
  employee uuid;
  shift_day date;
  details text;
  secret uuid;
begin
  if actor is null or not public.att_is_admin() then return null; end if;
  if tg_op='UPDATE' and (old.starts_at,old.ends_at) is not distinct from (new.starts_at,new.ends_at) then return null; end if;
  if tg_op='DELETE' then
    employee := old.employee_id;
    shift_day := old.work_date;
    details := 'The schedule for this date was removed.';
  else
    employee := new.employee_id;
    shift_day := new.work_date;
    details := case when new.starts_at is null then 'You are scheduled off.'
      else 'Your shift is ' || to_char(shift_day+new.starts_at,'FMHH12:MI AM') || ' to ' ||
        to_char(shift_day+new.ends_at,'FMHH12:MI AM') || ' (Belize time).' end;
  end if;
  if shift_day < (now() at time zone 'America/Belize')::date or
    not exists(select 1 from att_profiles where id=employee and active) then return null; end if;
  insert into att_notifications(user_id,actor_id,title,body)
    values(employee,actor,'Schedule updated',to_char(shift_day,'FMDay, FMMonth FMDD, YYYY') || ' · ' || details);
  if current_setting('esquiliano.schedule_dispatch',true) is distinct from 'queued' then
    select token into secret from att_schedule_secret where id=1;
    if secret is not null then
      perform net.http_post(
        url:='https://hunptuwwaxvpigsnrsbl.supabase.co/functions/v1/attendance-admin',
        headers:='{"Content-Type":"application/json"}'::jsonb,
        body:=jsonb_build_object('action','bobby-dispatch','token',secret),timeout_milliseconds:=10000);
      perform set_config('esquiliano.schedule_dispatch','queued',true);
    end if;
  end if;
  return null;
end $$;
revoke all on function public.att_notify_schedule_change() from public,anon,authenticated;
create trigger att_notify_schedule_change after insert or update or delete on public.att_planned_shifts
for each row execute function public.att_notify_schedule_change();
commit;
