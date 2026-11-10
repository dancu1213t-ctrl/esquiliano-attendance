begin;
drop trigger att_notify_schedule_change on public.att_planned_shifts;
create trigger att_notify_schedule_change after insert or update on public.att_planned_shifts
for each row execute function public.att_notify_schedule_change();
create function public.att_clear_schedule_notices() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  delete from public.att_notifications
  where user_id=old.employee_id and (
    (title='Schedule updated' and starts_with(body,to_char(old.work_date,'FMDay, FMMonth FMDD, YYYY') || ' · '))
    or starts_with(shift_reminder_key,old.employee_id::text || ':' || old.work_date::text || ':')
  );
  return null;
end $$;
revoke all on function public.att_clear_schedule_notices() from public,anon,authenticated;
create trigger att_clear_schedule_notices after delete on public.att_planned_shifts
for each row execute function public.att_clear_schedule_notices();
commit;
