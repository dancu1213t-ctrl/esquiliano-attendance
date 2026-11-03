begin;
alter table public.att_events add column if not exists row_version integer not null default 1;
alter table public.att_push add column if not exists device_id uuid references public.att_devices(id);
alter table public.att_push add column if not exists label text not null default 'Browser';
alter table public.att_push add column if not exists last_seen timestamptz not null default now();
create table if not exists public.att_shift_requests(request_id uuid primary key,actor uuid not null,payload jsonb not null,result jsonb not null,created_at timestamptz not null default now());
alter table public.att_shift_requests enable row level security;
revoke all on public.att_shift_requests from anon,authenticated;

create or replace function public.att_register_device(device uuid,label text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not att_is_active() then raise exception 'Account inactive';end if;
 if device is null then raise exception 'Device required';end if;
 if exists(select 1 from att_devices where id=device and (user_id<>auth.uid() or not active)) then raise exception 'Device revoked. Register a new browser session.';end if;
 insert into att_devices(id,user_id,label) values(device,auth.uid(),left(coalesce(label,'Browser'),80)) on conflict(id) do update set last_seen=now(),label=excluded.label;
end $$;

create or replace function public.att_subscribe(subscription_data jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare endpoint_value text;device_value uuid;
begin
 if not att_is_active() then raise exception 'Account inactive';end if;
 endpoint_value=subscription_data->>'endpoint';
 if subscription_data is null or jsonb_typeof(subscription_data)<>'object' or length(subscription_data::text)>5000 or endpoint_value is null or endpoint_value !~ '^https://' or jsonb_typeof(subscription_data->'keys') is distinct from 'object' or coalesce(subscription_data->'keys'->>'p256dh','')='' or coalesce(subscription_data->'keys'->>'auth','')='' then raise exception 'Invalid push subscription';end if;
 device_value=nullif(subscription_data->>'device_id','')::uuid;
 if device_value is not null and not exists(select 1 from att_devices where id=device_value and user_id=auth.uid() and active) then raise exception 'Register this device again before enabling notifications';end if;
 insert into att_push(user_id,endpoint,subscription,device_id,label,last_seen)
 values(auth.uid(),endpoint_value,subscription_data-'device_id'-'label',device_value,left(coalesce(nullif(subscription_data->>'label',''),'Browser'),80),now())
 on conflict(endpoint) do update set user_id=auth.uid(),subscription=excluded.subscription,device_id=excluded.device_id,label=excluded.label,last_seen=now();
end $$;

create or replace function public.att_admin_devices(person uuid default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not att_is_admin() then raise exception 'Administrator required';end if;
 return jsonb_build_object(
 'devices',coalesce((select jsonb_agg(to_jsonb(x) order by last_seen desc) from (
 select d.id,d.user_id,p.name,p.employee_id,d.label,d.active,d.created_at,d.last_seen,(select count(*) from att_push s where s.device_id=d.id and s.user_id=d.user_id) as push_count
 from att_devices d join att_profiles p on p.id=d.user_id where person is null or d.user_id=person)x),'[]'::jsonb),
 'unlinked',coalesce((select jsonb_agg(to_jsonb(x) order by last_seen desc) from (
 select s.id as push_id,s.user_id,p.name,p.employee_id,s.label,s.created_at,s.last_seen,substring(s.endpoint from '^https://([^/]+)') as provider
 from att_push s join att_profiles p on p.id=s.user_id where s.device_id is null and (person is null or s.user_id=person))x),'[]'::jsonb));
end $$;

create or replace function public.att_revoke_device(device uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not att_is_admin() then raise exception 'Administrator required';end if;
 update att_devices set active=false where id=device;
 delete from att_push where device_id=device;
 insert into att_audit(actor,action,target) values(auth.uid(),'DEVICE_REVOKED',device::text);
end $$;
create or replace function public.att_admin_revoke_push(subscription_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not att_is_admin() then raise exception 'Administrator required';end if;
 delete from att_push where id=subscription_id;
 insert into att_audit(actor,action,target) values(auth.uid(),'NOTIFICATIONS_DISABLED',subscription_id::text);
end $$;

create or replace function public.att_staff_week(person uuid,week_start date) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare zone text;first_time timestamptz;last_time timestamptz;rows jsonb;
begin
 if not att_is_admin() then raise exception 'Administrator required';end if;
 if week_start is null or not isfinite(week_start) then raise exception 'Choose a week';end if;
 select timezone into zone from att_settings where id=1;
 first_time=week_start::timestamp at time zone zone;last_time=(week_start+7)::timestamp at time zone zone;
 with selected as (
 (select * from att_events where user_id=person and happened_at<first_time order by happened_at desc limit 1)
 union all select * from att_events where user_id=person and happened_at>=first_time and happened_at<last_time
 union all (select * from att_events where user_id=person and happened_at>=last_time order by happened_at limit 1))
 select coalesce(jsonb_agg(to_jsonb(selected) order by happened_at),'[]'::jsonb) into rows from selected;
 return jsonb_build_object('events',rows,'start_at',first_time,'end_at',last_time,'devices',att_admin_devices(person),'latest',(select to_jsonb(e) from att_events e where user_id=person order by happened_at desc limit 1));
end $$;

create or replace function public.att_admin_shift(request uuid,person uuid,start_time timestamp,end_time timestamp,work_location text,reason text,in_id uuid default null,out_id uuid default null,in_version integer default null,out_version integer default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare p att_profiles;s att_settings;a att_events;b att_events;before_a jsonb;before_b jsonb;start_at timestamptz;end_at timestamptz;payload_value jsonb;old_request att_shift_requests;late int:=0;early int:=0;timing_in text:='On time';timing_out text:='On time';invalid boolean;response jsonb;
begin
 if not att_is_admin() then raise exception 'Administrator required';end if;
 if request is null or start_time is null or not isfinite(start_time) or (end_time is not null and not isfinite(end_time)) or work_location is null or work_location not in ('office','home') then raise exception 'Check shift details';end if;
 if length(btrim(coalesce(reason,''))) not between 5 and 1000 then raise exception 'Add a reason of at least 5 characters';end if;
 select * into p from att_profiles where id=person;
 if not found then raise exception 'Person not found';end if;
 select * into s from att_settings where id=1;
 start_at=start_time at time zone s.timezone;end_at=end_time at time zone s.timezone;
 if start_at>clock_timestamp()+interval '1 minute' or end_at>clock_timestamp()+interval '1 minute' then raise exception 'Attendance cannot be in the future';end if;
 if end_at is not null and end_at<=start_at then raise exception 'Clock out must be after clock in';end if;
 if in_id is null and out_id is not null then raise exception 'Choose a clock-in record first';end if;
 if out_id is not null and end_time is null then raise exception 'Keep a clock-out time for this saved shift';end if;
 payload_value=jsonb_build_object('person',person,'start',start_time,'end',end_time,'location',work_location,'reason',btrim(reason),'in_id',in_id,'out_id',out_id,'in_version',in_version,'out_version',out_version);
 perform pg_advisory_xact_lock(hashtextextended(person::text,0));
 select * into old_request from att_shift_requests where request_id=request;
 if found then if old_request.actor<>auth.uid() or old_request.payload<>payload_value then raise exception 'Attendance request conflict';end if;return old_request.result;end if;
 if in_id is not null then
 select * into a from att_events where id=in_id and user_id=person and action='IN';
 if not found or in_version is distinct from a.row_version then raise exception 'This shift changed. Refresh before editing';end if;
 before_a=to_jsonb(a);
 end if;
 if out_id is not null then
 select * into b from att_events where id=out_id and user_id=person and action='OUT';
 if not found or out_version is distinct from b.row_version then raise exception 'This shift changed. Refresh before editing';end if;
 before_b=to_jsonb(b);
 if b.happened_at<=a.happened_at or exists(select 1 from att_events where user_id=person and happened_at>a.happened_at and happened_at<b.happened_at) then raise exception 'Choose the matching clock-out record';end if;
 end if;
 with timeline as (
 select action,happened_at from att_events where user_id=person and id is distinct from in_id and id is distinct from out_id
 union all select 'IN',start_at
 union all select 'OUT',end_at where end_at is not null),
 ordered as(select *,lag(action) over(order by happened_at) as previous_action,lag(happened_at) over(order by happened_at) as previous_time,row_number() over(order by happened_at) as row_num from timeline)
 select exists(select 1 from ordered where (row_num=1 and action<>'IN') or action=previous_action or happened_at=previous_time) into invalid;
 if invalid then raise exception 'These times overlap or conflict with another shift';end if;
 if not exists(select 1 from att_events where user_id=person and action='IN' and work_date=start_time::date and id is distinct from in_id and happened_at<start_at) then
 late=greatest(0,floor(extract(epoch from(start_time-(start_time::date+s.opens)))/60)::int);
 if start_time>start_time::date+s.opens+make_interval(mins=>s.grace_minutes) then timing_in='Late';else late=0;end if;
 end if;
 if end_time is not null then early=greatest(0,ceil(extract(epoch from((end_time::date+s.closes)-end_time))/60)::int);if early>0 then timing_out='Early departure';end if;end if;
 if in_id is null then
 insert into att_events(request_id,user_id,employee_id,name,action,happened_at,work_date,timing,late_minutes,late_note,work_mode,entry_source,recorded_by,correction_reason)
 values(gen_random_uuid(),person,p.employee_id,p.name,'IN',start_at,start_time::date,timing_in,late,case when late>0 then btrim(reason) else '' end,work_location,'admin',auth.uid(),btrim(reason)) returning * into a;
 else
 update att_events set happened_at=start_at,work_date=start_time::date,timing=timing_in,late_minutes=late,early_minutes=0,late_note=case when late>0 then btrim(reason) else '' end,work_mode=work_location,entry_source='admin',recorded_by=auth.uid(),correction_reason=btrim(reason),row_version=row_version+1,latitude=null,longitude=null,accuracy_m=null,distance_m=null,device_id=null where id=in_id returning * into a;
 end if;
 if end_at is not null then
 if out_id is null then
 insert into att_events(request_id,user_id,employee_id,name,action,happened_at,work_date,timing,early_minutes,work_mode,entry_source,recorded_by,correction_reason)
 values(gen_random_uuid(),person,p.employee_id,p.name,'OUT',end_at,end_time::date,timing_out,early,work_location,'admin',auth.uid(),btrim(reason)) returning * into b;
 else
 update att_events set happened_at=end_at,work_date=end_time::date,timing=timing_out,early_minutes=early,late_minutes=0,work_mode=work_location,entry_source='admin',recorded_by=auth.uid(),correction_reason=btrim(reason),row_version=row_version+1,latitude=null,longitude=null,accuracy_m=null,distance_m=null,device_id=null where id=out_id returning * into b;
 end if;
 end if;
 response=jsonb_build_object('clock_in',to_jsonb(a),'clock_out',case when end_at is null then null else to_jsonb(b) end);
 insert into att_shift_requests(request_id,actor,payload,result) values(request,auth.uid(),payload_value,response);
 insert into att_audit(actor,action,target,details) values(auth.uid(),'SHIFT_CORRECTED',person::text,jsonb_build_object('before_in',before_a,'before_out',before_b,'after',response,'reason',btrim(reason)));
 insert into att_notifications(user_id,title,body,actor_id) values(person,'Attendance updated',to_char(start_time,'Mon DD, YYYY')||' · Your shift was updated by an administrator.',auth.uid());
 return response;
end $$;
revoke all on function att_admin_devices(uuid),att_admin_revoke_push(uuid),att_staff_week(uuid,date),att_admin_shift(uuid,uuid,timestamp,timestamp,text,text,uuid,uuid,integer,integer) from public,anon;
grant execute on function att_admin_devices(uuid),att_admin_revoke_push(uuid),att_staff_week(uuid,date),att_admin_shift(uuid,uuid,timestamp,timestamp,text,text,uuid,uuid,integer,integer) to authenticated;
commit;

