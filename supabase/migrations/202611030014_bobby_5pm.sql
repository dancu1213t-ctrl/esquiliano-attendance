begin;
alter table att_bobby_tasks add column run_time time;
update att_bobby_tasks set run_time=case when completed_at is null then time '17:00' else time '16:00' end;
alter table att_bobby_tasks alter column run_time set default '17:00',alter column run_time set not null;
create or replace function public.att_bobby_schedule(request uuid,day date) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare old att_bobby_tasks;begin
 if not att_is_admin() then raise exception 'Administrator required';end if;
 if request is null or day is null or not isfinite(day) or day<(now() at time zone 'America/Belize')::date or day>(now() at time zone 'America/Belize')::date+365 or (day=(now() at time zone 'America/Belize')::date and (now() at time zone 'America/Belize')::time>='17:00') then raise exception 'Choose a future 5 p.m. check date';end if;
 select * into old from att_bobby_tasks where id=request;
 if found then if old.created_by<>auth.uid() or old.run_date<>day then raise exception 'Task request conflict';end if;return old.id;end if;
 insert into att_bobby_tasks(id,created_by,run_date) values(request,auth.uid(),day);
 insert into att_audit(actor,action,details) values(auth.uid(),'BOBBY_TASK_CREATED',jsonb_build_object('task',request,'date',day,'time','17:00','recurrence','once'));
 return request;
end $$;
create or replace function public.att_bobby_tick() returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare task att_bobby_tasks;p record;office_now timestamp:=clock_timestamp() at time zone 'America/Belize';results jsonb;changed int;secret uuid;previous_claim text;
begin
 if office_now::time<'17:00' then return;end if;
 for task in select * from att_bobby_tasks where active and completed_at is null and run_date<=office_now::date for update skip locked loop
 results='[]';changed=0;
 if task.run_date<office_now::date or not exists(select 1 from att_profiles where id=task.created_by and active and role='admin') then
 update att_bobby_tasks set active=false,completed_at=now(),result=jsonb_build_object('status','Not run','reason','Date passed or administrator inactive') where id=task.id;continue;
 end if;
 previous_claim=current_setting('request.jwt.claim.sub',true);perform set_config('request.jwt.claim.sub',task.created_by::text,true);
 for p in select x.*,u.name from (select distinct on(user_id) user_id,action,happened_at,work_date from att_events order by user_id,happened_at desc)x join att_profiles u on u.id=x.user_id where u.active and x.action='IN' loop
 if p.work_date<>task.run_date or p.happened_at>=((task.run_date+time '17:00') at time zone 'America/Belize') then results=results||jsonb_build_array(jsonb_build_object('person',p.name,'status','Needs manual review; open shift outside today’s cutoff'));continue;end if;
 begin
 perform att_bobby_execute(gen_random_uuid(),'clock',array[p.user_id],'','OUT',task.run_date+time '17:00','Bobby: scheduled 5 p.m. clock-out authorized by administrator');changed=changed+1;
 results=results||jsonb_build_array(jsonb_build_object('person',p.name,'status','Clocked out at 5 p.m.'));
 exception when others then results=results||jsonb_build_array(jsonb_build_object('person',p.name,'status',SQLERRM));end;
 end loop;
 update att_bobby_tasks set active=false,completed_at=now(),result=jsonb_build_object('clocked_out',changed,'items',results) where id=task.id;
 insert into att_notifications(user_id,title,body,actor_id) values(task.created_by,'Bobby task complete',changed||' person(s) clocked out at 5 p.m. Open Bobby → Tasks to review the results.',task.created_by);
 insert into att_audit(actor,action,target,details) values(task.created_by,'BOBBY_TASK_COMPLETED',task.id::text,jsonb_build_object('clocked_out',changed,'items',results));
 perform set_config('request.jwt.claim.sub',coalesce(previous_claim,''),true);
 end loop;
 if exists(select 1 from att_notifications where actor_id is not null and push_sent_at is null and created_at>now()-interval '1 day') then
 select token into secret from att_schedule_secret where id=1;
 perform net.http_post(url:='https://hunptuwwaxvpigsnrsbl.supabase.co/functions/v1/attendance-admin',headers:='{"Content-Type":"application/json"}'::jsonb,body:=jsonb_build_object('action','bobby-dispatch','token',secret),timeout_milliseconds:=10000);
 end if;
end $$;
select cron.schedule('esquiliano-bobby-tasks','* 23,0 * * *','select public.att_bobby_tick();');
commit;
