begin;
create or replace function public.att_bobby_snapshot() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare office att_settings;local_day date;week_day date;start_at timestamptz;end_at timestamptz;week_rows jsonb;latest_rows jsonb;
begin
 if not att_is_admin() then raise exception 'Administrator required';end if;
 select * into office from att_settings where id=1;
 local_day=(now() at time zone office.timezone)::date;week_day=local_day-(extract(isodow from local_day)::int-1);
 start_at=week_day::timestamp at time zone office.timezone;end_at=(week_day+7)::timestamp at time zone office.timezone;
 with selected as(
 (select distinct on(user_id) * from att_events where happened_at<start_at order by user_id,happened_at desc)
 union all select * from att_events where happened_at>=start_at and happened_at<end_at
 union all (select distinct on(user_id) * from att_events where happened_at>=end_at order by user_id,happened_at))
 select coalesce(jsonb_agg(to_jsonb(selected)),'[]'::jsonb) into week_rows from selected;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into latest_rows from(select distinct on(user_id) user_id,action,happened_at,work_date from att_events order by user_id,happened_at desc)x;
 return jsonb_build_object('as_of',now(),'today',local_day,'week',week_day,'settings',jsonb_build_object('name',office.name,'opens',office.opens,'closes',office.closes,'timezone',office.timezone,'grace_minutes',office.grace_minutes,'lunch_effective_date',office.lunch_effective_date),
 'people',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'employee_id',employee_id,'role',role,'job_role',job_role,'active',active,'wfh_allowed',wfh_allowed) order by name),'[]'::jsonb) from att_profiles),
 'events',week_rows,'latest',latest_rows,'days',(select coalesce(jsonb_agg(to_jsonb(d)),'[]'::jsonb) from att_day_records d where work_date>=week_day and work_date<week_day+7 and deleted_at is null));
end $$;
revoke all on function public.att_bobby_snapshot() from public,anon;
grant execute on function public.att_bobby_snapshot() to authenticated;
commit;
