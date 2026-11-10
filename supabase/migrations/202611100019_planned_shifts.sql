begin;
create table public.att_planned_shifts (
  employee_id uuid not null references public.att_profiles(id) on delete cascade,
  work_date date not null,
  starts_at time,
  ends_at time,
  updated_by uuid not null default auth.uid() references public.att_profiles(id),
  primary key (employee_id, work_date),
  check ((starts_at is null and ends_at is null) or
         (starts_at is not null and ends_at is not null and starts_at < ends_at))
);
alter table public.att_planned_shifts enable row level security;
revoke all on public.att_planned_shifts from public, anon, authenticated;
grant select, insert, update, delete on public.att_planned_shifts to authenticated;
create policy att_planned_shifts_admin on public.att_planned_shifts
  for all to authenticated using (public.att_is_admin())
  with check (public.att_is_admin() and updated_by = auth.uid());

alter table public.att_notifications add column shift_reminder_key text unique;

create function public.att_planned_shift_tick() returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  office_now timestamp := now() at time zone 'America/Belize';
  secret uuid;
begin
  insert into att_notifications(user_id,actor_id,title,body,shift_reminder_key)
  select s.employee_id,s.updated_by,'Shift begins soon',
    'Your shift on ' || to_char(s.work_date,'FMDay, FMMonth FMDD') ||
    ' runs from ' || to_char(s.work_date+s.starts_at,'FMHH12:MI AM') ||
    ' to ' || to_char(s.work_date+s.ends_at,'FMHH12:MI AM') || ' (Belize time).',
    s.employee_id::text || ':' || s.work_date::text || ':' || s.starts_at::text
  from att_planned_shifts s
  join att_profiles p on p.id=s.employee_id and p.active
  where s.work_date between office_now::date and (office_now+interval '30 minutes')::date
    and s.work_date+s.starts_at > office_now
    and s.work_date+s.starts_at <= office_now+interval '30 minutes'
  on conflict (shift_reminder_key) do nothing;

  if exists(select 1 from att_notifications where shift_reminder_key is not null
    and push_sent_at is null and created_at >= now()-interval '30 minutes') then
    select token into secret from att_schedule_secret where id=1;
    if secret is not null then
      perform net.http_post(
        url:='https://hunptuwwaxvpigsnrsbl.supabase.co/functions/v1/attendance-admin',
        headers:='{"Content-Type":"application/json"}'::jsonb,
        body:=jsonb_build_object('action','bobby-dispatch','token',secret),
        timeout_milliseconds:=10000);
    end if;
  end if;
end $$;
revoke all on function public.att_planned_shift_tick() from public,anon,authenticated;
select cron.schedule('esquiliano-shift-reminders','* * * * *','select public.att_planned_shift_tick();');
commit;
