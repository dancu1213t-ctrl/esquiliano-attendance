begin;
alter table public.att_profiles add column if not exists wfh_allowed boolean not null default false;
alter table public.att_events add column if not exists work_mode text not null default 'office' check(work_mode in ('office','home'));
alter table public.att_events add column if not exists entry_source text not null default 'worker' check(entry_source in ('worker','admin'));
alter table public.att_events add column if not exists recorded_by uuid references public.att_profiles(id);
alter table public.att_events add column if not exists correction_reason text not null default '' check(length(correction_reason)<=1000);
alter table public.att_events alter column latitude drop not null, alter column longitude drop not null, alter column accuracy_m drop not null, alter column distance_m drop not null, alter column device_id drop not null;
alter table public.att_audit add column if not exists details jsonb;
create or replace function public.att_set_work_mode(person uuid,allow_home boolean) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare previous boolean;
begin
 if not att_is_admin() then raise exception 'Administrator required';end if;
 if allow_home is null then raise exception 'Choose a work location';end if;
 select wfh_allowed into previous from att_profiles where id=person for update;
 if not found then raise exception 'Person not found';end if;
 update att_profiles set wfh_allowed=allow_home where id=person;
 if previous is distinct from allow_home then
 insert into att_audit(actor,action,target,details) values(auth.uid(),'WORK_LOCATION',person::text,jsonb_build_object('before',previous,'after',allow_home));
 end if;
end $$;
create or replace function public.att_clock(request uuid,device uuid,qr uuid,lat double precision,lng double precision,accuracy double precision,note text,kind text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare p att_profiles; s att_settings; last_event att_events; existing att_events; d double precision; local_now timestamp; late int:=0; early int:=0; timing_value text:='On time'; result att_events; remote_work boolean;
begin
 select * into p from att_profiles where id=auth.uid() and active;
 if p.id is null then raise exception 'Sign in required';end if;
 if request is null or device is null then raise exception 'Invalid attendance request';end if;
 if kind is null or kind not in ('IN','OUT') then raise exception 'Invalid action';end if;
 if length(coalesce(note,''))>1000 then raise exception 'Late arrival note is too long';end if;
 perform pg_advisory_xact_lock(hashtextextended(p.id::text,0));
 select * into existing from att_events where request_id=request;
 if existing.id is not null then if existing.user_id<>p.id or existing.action<>kind or existing.device_id is distinct from device or existing.late_note<>btrim(coalesce(note,'')) then raise exception 'Attendance request conflict';end if;return to_jsonb(existing);end if;
 if not exists(select 1 from att_devices where id=device and user_id=p.id and active) then raise exception 'Device registration required';end if;
 select * into s from att_settings where id=1;
 select * into last_event from att_events where user_id=p.id order by happened_at desc limit 1;
 remote_work=p.wfh_allowed or coalesce((kind='OUT' and last_event.action='IN' and last_event.work_mode='home'),false);
 if not remote_work then
 if qr is null or not exists(select 1 from att_qr where id=1 and token=qr) then raise exception 'Scan the current office QR';end if;
 if lat is null or lng is null or accuracy is null or lat not between -90 and 90 or lng not between -180 and 180 or accuracy not between 0 and s.accuracy_m or lat::text in ('NaN','Infinity','-Infinity') or lng::text in ('NaN','Infinity','-Infinity') or accuracy::text in ('NaN','Infinity','-Infinity') then raise exception 'A precise location reading is required';end if;
 d=6371000*2*asin(sqrt(least(1.0,power(sin(radians(lat-s.latitude)/2),2)+cos(radians(s.latitude))*cos(radians(lat))*power(sin(radians(lng-s.longitude)/2),2))));
 if d>s.radius_m then raise exception 'You must be at the office';end if;
 else lat=null;lng=null;accuracy=null;d=null;end if;
 if kind not in('IN','OUT') or kind is null then raise exception 'Invalid action';end if;
 select * into last_event from att_events where user_id=p.id order by happened_at desc limit 1;
 if (kind='IN' and last_event.action='IN') or (kind='OUT' and (last_event.id is null or last_event.action='OUT')) then raise exception 'Attendance is already recorded for this action';end if;
 local_now=clock_timestamp() at time zone s.timezone;
 if kind='IN' and not exists(select 1 from att_events where user_id=p.id and work_date=local_now::date and action='IN') then
  late=greatest(0,floor(extract(epoch from(local_now-(local_now::date+s.opens)))/60)::int);
  if local_now>local_now::date+s.opens+make_interval(mins=>s.grace_minutes) then timing_value='Late';if length(btrim(coalesce(note,'')))<5 then raise exception 'Add a late arrival note';end if;else late=0;end if;
 end if;
 if kind='OUT' then early=greatest(0,ceil(extract(epoch from((local_now::date+s.closes)-local_now))/60)::int);if early>0 then timing_value='Early departure';end if;end if;
 insert into att_events(happened_at,request_id,user_id,employee_id,name,action,work_date,timing,late_minutes,early_minutes,late_note,latitude,longitude,accuracy_m,distance_m,device_id,work_mode,recorded_by) values(clock_timestamp(),request,p.id,p.employee_id,p.name,kind,local_now::date,timing_value,late,early,left(btrim(coalesce(note,'')),1000),lat,lng,accuracy,d,device,case when remote_work then 'home' else 'office' end,p.id) returning * into result;
 update att_devices set last_seen=now() where id=device;
 insert into att_notifications(user_id,title,body) values(p.id,case when kind='IN' then 'Clocked in' else 'Clocked out' end,to_char(local_now,'FMHH12:MI AM')||' · '||s.name);
 insert into att_notifications(user_id,title,body) select id,left(p.name||case when kind='IN' then ' clocked in' else ' clocked out' end,80),p.employee_id||' · '||timing_value from att_profiles where active and role='admin' and id<>p.id;
 return to_jsonb(result);
end $$;
create or replace function public.att_admin_clock(request uuid,person uuid,kind text,office_time timestamp,mode text,reason text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare p att_profiles;s att_settings;event_time timestamptz;prev att_events;nxt att_events;result att_events;late int:=0;early int:=0;timing_value text:='On time';
begin
 if not att_is_admin() then raise exception 'Administrator required';end if;
 if request is null or kind is null or kind not in ('IN','OUT') or mode is null or mode not in ('office','home') or office_time is null or not isfinite(office_time) then raise exception 'Check attendance details';end if;
 if length(btrim(coalesce(reason,''))) not between 5 and 1000 then raise exception 'Add a reason of at least 5 characters';end if;
 select * into p from att_profiles where id=person and active;
 if not found then raise exception 'Active person required';end if;
 select * into s from att_settings where id=1;
 event_time=office_time at time zone s.timezone;
 if event_time>clock_timestamp()+interval '1 minute' then raise exception 'Attendance cannot be in the future';end if;
 perform pg_advisory_xact_lock(hashtextextended(person::text,0));
 select * into result from att_events where request_id=request;
 if found then
 if result.user_id<>person or result.action<>kind or result.happened_at<>event_time or result.work_mode<>mode or result.correction_reason<>btrim(reason) or result.recorded_by<>auth.uid() or result.entry_source<>'admin' then raise exception 'Attendance request conflict';end if;
 return to_jsonb(result);
 end if;
 if exists(select 1 from att_events where user_id=person and happened_at=event_time) then raise exception 'An attendance record already exists at this time';end if;
 select * into prev from att_events where user_id=person and happened_at<event_time order by happened_at desc limit 1;
 select * into nxt from att_events where user_id=person and happened_at>event_time order by happened_at limit 1;
 if (kind='IN' and prev.action='IN') or (kind='OUT' and (prev.id is null or prev.action='OUT')) or (nxt.id is not null and nxt.action=kind) then raise exception 'This would conflict with existing clock in/out records. Check the date and action';end if;
 if kind='IN' and not exists(select 1 from att_events where user_id=person and work_date=office_time::date and action='IN') then
 late=greatest(0,floor(extract(epoch from(office_time-(office_time::date+s.opens)))/60)::int);
 if office_time>office_time::date+s.opens+make_interval(mins=>s.grace_minutes) then timing_value='Late';else late=0;end if;
 end if;
 if kind='OUT' then early=greatest(0,ceil(extract(epoch from((office_time::date+s.closes)-office_time))/60)::int);if early>0 then timing_value='Early departure';end if;end if;
 insert into att_events(request_id,user_id,employee_id,name,action,happened_at,work_date,timing,late_minutes,early_minutes,late_note,work_mode,entry_source,recorded_by,correction_reason)
 values(request,person,p.employee_id,p.name,kind,event_time,office_time::date,timing_value,late,early,case when timing_value='Late' then btrim(reason) else '' end,mode,'admin',auth.uid(),btrim(reason)) returning * into result;
 insert into att_audit(actor,action,target,details) values(auth.uid(),'ATTENDANCE_CORRECTION',result.id::text,jsonb_build_object('user_id',person,'action',kind,'happened_at',event_time,'work_mode',mode,'reason',btrim(reason)));
 insert into att_notifications(user_id,title,body,actor_id) values(person,'Attendance updated',case when kind='IN' then 'Clock in' else 'Clock out' end||' · '||to_char(office_time,'Mon DD, YYYY FMHH12:MI AM')||' · Recorded by administrator',auth.uid());
 return to_jsonb(result);
end $$;
revoke all on function att_set_work_mode(uuid,boolean),att_admin_clock(uuid,uuid,text,timestamp,text,text) from public,anon;
grant execute on function att_set_work_mode(uuid,boolean),att_admin_clock(uuid,uuid,text,timestamp,text,text) to authenticated;
commit;
