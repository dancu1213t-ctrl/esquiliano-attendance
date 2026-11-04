begin;
create table public.att_day_records(id uuid primary key default gen_random_uuid(),user_id uuid not null references att_profiles(id),work_date date not null,status text not null check(status in('Worked','Sick','Not required')),hours numeric(6,2) not null check(hours between 0 and 24),reason text not null,recorded_by uuid not null,updated_at timestamptz not null default now(),row_version integer not null default 1,deleted_at timestamptz,unique(user_id,work_date),check(status='Worked' or hours=0));
alter table att_day_records enable row level security;
revoke all on att_day_records from public,anon,authenticated;
grant select on att_day_records to authenticated;
create policy att_day_records_read on att_day_records for select to authenticated using(att_is_active() and (user_id=auth.uid() or att_is_admin()));
create or replace function public.att_set_day_record(person uuid,day date,day_status text,credited_hours numeric,reason text,version integer default null,remove boolean default false) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare existing att_day_records;before_value jsonb;begin
 if not att_is_admin() then raise exception 'Administrator required';end if;
 if day is null or not isfinite(day) or day>(now() at time zone 'America/Belize')::date or day_status is null or day_status not in('Worked','Sick','Not required') or credited_hours is null or credited_hours<0 or credited_hours>24 or (day_status<>'Worked' and credited_hours<>0) or length(btrim(coalesce(reason,''))) not between 5 and 1000 then raise exception 'Check date, status, hours and reason';end if;
 perform pg_advisory_xact_lock(hashtextextended(person::text,0));
 select * into existing from att_day_records where user_id=person and work_date=day;
 if found and existing.row_version is distinct from version then raise exception 'This daily record changed. Refresh before editing';end if;
 if not found and (version is not null or remove) then raise exception 'Daily record not found';end if;
 before_value=to_jsonb(existing);
 insert into att_day_records(user_id,work_date,status,hours,reason,recorded_by,deleted_at) values(person,day,day_status,round(credited_hours,2),btrim(reason),auth.uid(),case when remove then now() end)
 on conflict(user_id,work_date) do update set status=excluded.status,hours=excluded.hours,reason=excluded.reason,recorded_by=auth.uid(),updated_at=now(),row_version=att_day_records.row_version+1,deleted_at=excluded.deleted_at;
 insert into att_audit(actor,action,target,details) values(auth.uid(),case when remove then 'DAY_RECORD_DELETED' else 'DAY_RECORD_UPDATED' end,person::text,jsonb_build_object('date',day,'before',before_value,'status',day_status,'hours',credited_hours,'reason',btrim(reason)));
end $$;
revoke all on function att_set_day_record(uuid,date,text,numeric,text,integer,boolean) from public,anon;
grant execute on function att_set_day_record(uuid,date,text,numeric,text,integer,boolean) to authenticated;
commit;
