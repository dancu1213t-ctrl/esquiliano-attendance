begin;
create table public.att_bobby_requests(id uuid primary key,actor uuid not null,payload jsonb not null,result jsonb not null,created_at timestamptz not null default now());
alter table att_bobby_requests enable row level security;revoke all on att_bobby_requests from public,anon,authenticated;
create table public.att_bobby_tasks(id uuid primary key default gen_random_uuid(),created_by uuid not null references att_profiles(id),run_date date not null,active boolean not null default true,completed_at timestamptz,result jsonb,created_at timestamptz not null default now());
alter table att_bobby_tasks enable row level security;revoke all on att_bobby_tasks from public,anon,authenticated;grant select on att_bobby_tasks to authenticated;
create policy att_bobby_tasks_read on att_bobby_tasks for select to authenticated using(att_is_admin() and created_by=auth.uid());
create table public.att_bobby_preferences(user_id uuid primary key references att_profiles(id),intro_dismissed boolean not null default false);
alter table att_bobby_preferences enable row level security;revoke all on att_bobby_preferences from public,anon,authenticated;
create or replace function public.att_bobby_intro(dismiss boolean default false) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare hidden boolean;begin if not att_is_admin() then raise exception 'Administrator required';end if;
 insert into att_bobby_preferences(user_id,intro_dismissed) values(auth.uid(),dismiss) on conflict(user_id) do update set intro_dismissed=att_bobby_preferences.intro_dismissed or excluded.intro_dismissed returning intro_dismissed into hidden;
 return jsonb_build_object('dismissed',hidden,'today',(now() at time zone 'America/Belize')::date);end $$;
create or replace function public.att_bobby_execute(request uuid,operation text,targets uuid[],message_text text default '',clock_kind text default null,office_time timestamp default null,reason text default 'Requested through Bobby') returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare previous att_bobby_requests;payload_value jsonb;response jsonb;p att_profiles;target uuid;room_value text;event_value jsonb;items jsonb:='[]';local_time timestamp;
begin
 if not att_is_admin() then raise exception 'Administrator required';end if;
 if request is null or operation is null or operation not in('message','clock') or targets is null or cardinality(targets) not between 1 and 50 or exists(select 1 from unnest(targets)x where x is null) then raise exception 'Choose a supported action and recipients';end if;
 payload_value=jsonb_build_object('operation',operation,'targets',targets,'message',message_text,'kind',clock_kind,'time',office_time,'reason',reason);
 perform pg_advisory_xact_lock(hashtextextended(request::text,1));
 select * into previous from att_bobby_requests where id=request;
 if found then if previous.actor<>auth.uid() or previous.payload<>payload_value then raise exception 'Command request conflict';end if;return previous.result;end if;
 if operation='message' and length(btrim(coalesce(message_text,''))) not between 1 and 2000 then raise exception 'Enter a message of 1–2,000 characters';end if;
 if operation='clock' and (clock_kind is null or clock_kind not in('IN','OUT') or length(btrim(coalesce(reason,''))) not between 5 and 1000) then raise exception 'Choose clock in/out and add a reason';end if;
 local_time=coalesce(office_time,clock_timestamp() at time zone 'America/Belize');
 for target in select distinct unnest(targets) order by 1 loop
 select * into p from att_profiles where id=target and active;
 if not found then raise exception 'A selected person is no longer active';end if;
 if operation='message' then
 if target=auth.uid() then raise exception 'Choose a worker or another administrator for a direct message';end if;
 select 'dm:'||string_agg(id::text,':' order by id::text) into room_value from att_profiles where id=any(array[auth.uid(),target]);
 insert into ws_messages(id,room,sender_id,body) values(gen_random_uuid(),room_value,auth.uid(),btrim(message_text));
 insert into att_notifications(user_id,title,body,actor_id) values(target,left('Message from '||(select name from att_profiles where id=auth.uid()),80),left(btrim(message_text),500),auth.uid());
 items=items||jsonb_build_array(jsonb_build_object('person',p.name,'status','Message sent'));
 else
 if clock_kind='OUT' and not exists(select 1 from (select action from att_events where user_id=target and happened_at<=(local_time at time zone 'America/Belize') order by happened_at desc limit 1)e where action='IN') then raise exception '% has no open clock-in at that time. Manual daily totals are not clock-ins',p.name;end if;
 event_value=att_admin_clock(gen_random_uuid(),target,clock_kind,local_time,case when p.wfh_allowed then 'home' else coalesce((select work_mode from att_events where user_id=target order by happened_at desc limit 1),'office') end,reason);
 items=items||jsonb_build_array(jsonb_build_object('person',p.name,'status',case when clock_kind='IN' then 'Clocked in' else 'Clocked out' end,'time',event_value->'happened_at'));
 end if;
 end loop;
 response=jsonb_build_object('ok',true,'items',items);
 insert into att_bobby_requests values(request,auth.uid(),payload_value,response,now());
 insert into att_audit(actor,action,details) values(auth.uid(),'BOBBY_'||upper(operation),payload_value||jsonb_build_object('result',response));
 return response;
end $$;
create or replace function public.att_bobby_schedule(request uuid,day date) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare old att_bobby_tasks;begin
 if not att_is_admin() then raise exception 'Administrator required';end if;
 if request is null or day is null or not isfinite(day) or day<(now() at time zone 'America/Belize')::date or day>(now() at time zone 'America/Belize')::date+365 or (day=(now() at time zone 'America/Belize')::date and (now() at time zone 'America/Belize')::time>='16:00') then raise exception 'Choose a future 4 p.m. check date';end if;
 select * into old from att_bobby_tasks where id=request;
 if found then if old.created_by<>auth.uid() or old.run_date<>day then raise exception 'Task request conflict';end if;return old.id;end if;
 insert into att_bobby_tasks(id,created_by,run_date) values(request,auth.uid(),day);
 insert into att_audit(actor,action,details) values(auth.uid(),'BOBBY_TASK_CREATED',jsonb_build_object('task',request,'date',day,'time','16:00','recurrence','once'));
 return request;
end $$;
create or replace function public.att_bobby_cancel(task_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin if not att_is_admin() then raise exception 'Administrator required';end if;
 update att_bobby_tasks set active=false where id=task_id and created_by=auth.uid() and completed_at is null;
 if not found then raise exception 'Active task not found';end if;
 insert into att_audit(actor,action,target) values(auth.uid(),'BOBBY_TASK_CANCELLED',task_id::text);end $$;
create or replace function public.att_bobby_tick() returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare task att_bobby_tasks;p record;office_now timestamp:=clock_timestamp() at time zone 'America/Belize';results jsonb;changed int;secret uuid;previous_claim text;
begin
 if office_now::time<'16:00' then return;end if;
 for task in select * from att_bobby_tasks where active and completed_at is null and run_date<=office_now::date for update skip locked loop
 results='[]';changed=0;
 if task.run_date<office_now::date or not exists(select 1 from att_profiles where id=task.created_by and active and role='admin') then
 update att_bobby_tasks set active=false,completed_at=now(),result=jsonb_build_object('status','Not run','reason','Date passed or administrator inactive') where id=task.id;continue;
 end if;
 previous_claim=current_setting('request.jwt.claim.sub',true);perform set_config('request.jwt.claim.sub',task.created_by::text,true);
 for p in select x.*,u.name from (select distinct on(user_id) user_id,action,happened_at,work_date from att_events order by user_id,happened_at desc)x join att_profiles u on u.id=x.user_id where u.active and x.action='IN' loop
 if p.work_date<>task.run_date or p.happened_at>=((task.run_date+time '16:00') at time zone 'America/Belize') then results=results||jsonb_build_array(jsonb_build_object('person',p.name,'status','Needs manual review; open shift outside today’s cutoff'));continue;end if;
 begin
 perform att_bobby_execute(gen_random_uuid(),'clock',array[p.user_id],'','OUT',task.run_date+time '16:00','Bobby: scheduled 4 p.m. clock-out authorized by administrator');changed=changed+1;
 results=results||jsonb_build_array(jsonb_build_object('person',p.name,'status','Clocked out at 4 p.m.'));
 exception when others then results=results||jsonb_build_array(jsonb_build_object('person',p.name,'status',SQLERRM));end;
 end loop;
 update att_bobby_tasks set active=false,completed_at=now(),result=jsonb_build_object('clocked_out',changed,'items',results) where id=task.id;
 insert into att_notifications(user_id,title,body,actor_id) values(task.created_by,'Bobby task complete',changed||' person(s) clocked out at 4 p.m. Open Bobby → Tasks to review the results.',task.created_by);
 insert into att_audit(actor,action,target,details) values(task.created_by,'BOBBY_TASK_COMPLETED',task.id::text,jsonb_build_object('clocked_out',changed,'items',results));
 perform set_config('request.jwt.claim.sub',coalesce(previous_claim,''),true);
 end loop;
 if exists(select 1 from att_notifications where actor_id is not null and push_sent_at is null and created_at>now()-interval '1 day') then
 select token into secret from att_schedule_secret where id=1;
 perform net.http_post(url:='https://hunptuwwaxvpigsnrsbl.supabase.co/functions/v1/attendance-admin',headers:='{"Content-Type":"application/json"}'::jsonb,body:=jsonb_build_object('action','bobby-dispatch','token',secret),timeout_milliseconds:=10000);
 end if;
end $$;
revoke all on function att_bobby_intro(boolean),att_bobby_execute(uuid,text,uuid[],text,text,timestamp,text),att_bobby_schedule(uuid,date),att_bobby_cancel(uuid) from public,anon;
grant execute on function att_bobby_intro(boolean),att_bobby_execute(uuid,text,uuid[],text,text,timestamp,text),att_bobby_schedule(uuid,date),att_bobby_cancel(uuid) to authenticated;
revoke all on function att_bobby_tick() from public,anon,authenticated;
select cron.schedule('esquiliano-bobby-tasks','* 22-23 * * *','select public.att_bobby_tick();');
commit;
