begin;
create or replace function public.att_clock(request uuid,device uuid,qr uuid,lat double precision,lng double precision,accuracy double precision,note text,kind text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare p att_profiles; s att_settings; last_event att_events; existing att_events; d double precision; local_now timestamp; late int:=0; early int:=0; timing_value text:='On time'; result att_events;
begin
 select * into p from att_profiles where id=auth.uid() and active;
 if p.id is null then raise exception 'Sign in required';end if;
 if request is null or device is null then raise exception 'Invalid attendance request';end if;
 if kind is null or kind not in ('IN','OUT') then raise exception 'Invalid action';end if;
 if length(coalesce(note,''))>1000 then raise exception 'Late arrival note is too long';end if;
 perform pg_advisory_xact_lock(hashtextextended(p.id::text,0));
 select * into existing from att_events where request_id=request;
 if existing.id is not null then if existing.user_id<>p.id or existing.action<>kind or existing.device_id<>device or existing.late_note<>btrim(coalesce(note,'')) then raise exception 'Attendance request conflict';end if;return to_jsonb(existing);end if;
 if not exists(select 1 from att_devices where id=device and user_id=p.id and active) then raise exception 'Device registration required';end if;
 if qr is null or not exists(select 1 from att_qr where id=1 and token=qr) then raise exception 'Scan the current office QR';end if;
 select * into s from att_settings where id=1;
 if lat is null or lng is null or accuracy is null or lat not between -90 and 90 or lng not between -180 and 180 or accuracy not between 0 and s.accuracy_m then raise exception 'A precise location reading is required';end if;
 d=6371000*2*asin(sqrt(least(1.0,power(sin(radians(lat-s.latitude)/2),2)+cos(radians(s.latitude))*cos(radians(lat))*power(sin(radians(lng-s.longitude)/2),2))));
 if d>s.radius_m then raise exception 'You must be at the office';end if;
 if kind not in('IN','OUT') or kind is null then raise exception 'Invalid action';end if;
 select * into last_event from att_events where user_id=p.id order by happened_at desc limit 1;
 if (kind='IN' and last_event.action='IN') or (kind='OUT' and (last_event.id is null or last_event.action='OUT')) then raise exception 'Attendance is already recorded for this action';end if;
 local_now=clock_timestamp() at time zone s.timezone;
 if kind='IN' and not exists(select 1 from att_events where user_id=p.id and work_date=local_now::date and action='IN') then
  late=greatest(0,floor(extract(epoch from(local_now-(local_now::date+s.opens)))/60)::int);
  if local_now>local_now::date+s.opens+make_interval(mins=>s.grace_minutes) then timing_value='Late';if length(btrim(coalesce(note,'')))<5 then raise exception 'Add a late arrival note';end if;else late=0;end if;
 end if;
 if kind='OUT' then early=greatest(0,ceil(extract(epoch from((local_now::date+s.closes)-local_now))/60)::int);if early>0 then timing_value='Early departure';end if;end if;
 insert into att_events(happened_at,request_id,user_id,employee_id,name,action,work_date,timing,late_minutes,early_minutes,late_note,latitude,longitude,accuracy_m,distance_m,device_id) values(clock_timestamp(),request,p.id,p.employee_id,p.name,kind,local_now::date,timing_value,late,early,left(btrim(coalesce(note,'')),1000),lat,lng,accuracy,d,device) returning * into result;
 update att_devices set last_seen=now() where id=device;
 insert into att_notifications(user_id,title,body) values(p.id,case when kind='IN' then 'Clocked in' else 'Clocked out' end,to_char(local_now,'FMHH12:MI AM')||' · '||s.name);
 insert into att_notifications(user_id,title,body) select id,left(p.name||case when kind='IN' then ' clocked in' else ' clocked out' end,80),p.employee_id||' · '||timing_value from att_profiles where active and role='admin' and id<>p.id;
 return to_jsonb(result);
end $$;
revoke all on function public.att_clock(uuid,uuid,uuid,double precision,double precision,double precision,text,text) from public,anon;
grant execute on function public.att_clock(uuid,uuid,uuid,double precision,double precision,double precision,text,text) to authenticated;
commit;
