rollback;begin;
insert into auth.users(id,aud,role,email) values('b0b0b0b0-0000-4000-8000-000000000001','authenticated','authenticated','bobby-admin@test.invalid'),('b0b0b0b0-0000-4000-8000-000000000002','authenticated','authenticated','bobby-worker@test.invalid');
insert into att_profiles(id,employee_id,name,role) values('b0b0b0b0-0000-4000-8000-000000000001','BOBBY-ADMIN','Bobby test admin','admin'),('b0b0b0b0-0000-4000-8000-000000000002','BOBBY-WORKER','Bobby test worker','employee');
set local role authenticated;
select set_config('request.jwt.claim.sub','b0b0b0b0-0000-4000-8000-000000000002',true);
do $$begin
 begin perform att_bobby_execute(gen_random_uuid(),'message',array[auth.uid()],'Unauthorized message');raise exception 'FAIL worker command';exception when raise_exception then if SQLERRM like 'FAIL%' then raise;end if;end;
 begin perform att_bobby_schedule(gen_random_uuid(),current_date+1);raise exception 'FAIL worker schedule';exception when raise_exception then if SQLERRM like 'FAIL%' then raise;end if;end;
 if has_function_privilege('authenticated','att_bobby_tick()','execute') then raise exception 'FAIL public scheduler';end if;
end $$;
select set_config('request.jwt.claim.sub','b0b0b0b0-0000-4000-8000-000000000001',true);
do $$declare id uuid:=gen_random_uuid();a jsonb;b jsonb;task uuid;begin
 a=att_bobby_execute(id,'message',array['b0b0b0b0-0000-4000-8000-000000000002'::uuid],'Please remember to clock out.');
 b=att_bobby_execute(id,'message',array['b0b0b0b0-0000-4000-8000-000000000002'::uuid],'Please remember to clock out.');
 if a<>b or (select count(*) from ws_messages where sender_id=auth.uid())<>1 then raise exception 'FAIL message idempotency';end if;
 begin perform att_bobby_execute(gen_random_uuid(),'clock',array['b0b0b0b0-0000-4000-8000-000000000002'::uuid],'','OUT','2026-01-05 16:00','Missing open shift');raise exception 'FAIL invented clock out';exception when raise_exception then if SQLERRM like 'FAIL%' then raise;end if;end;
 perform att_bobby_execute(gen_random_uuid(),'clock',array['b0b0b0b0-0000-4000-8000-000000000002'::uuid],'','IN','2026-01-05 08:00','Authorized manual clock in');
 perform att_bobby_execute(gen_random_uuid(),'clock',array['b0b0b0b0-0000-4000-8000-000000000002'::uuid],'','OUT','2026-01-05 16:00','Authorized manual clock out');
 if (select count(*) from att_events where user_id='b0b0b0b0-0000-4000-8000-000000000002')<>2 then raise exception 'FAIL clock commands';end if;
 a=att_bobby_intro(true);b=att_bobby_intro(false);if (b->>'dismissed')::boolean is not true then raise exception 'FAIL intro dismissal';end if;
 task=att_bobby_schedule(gen_random_uuid(),(now() at time zone 'America/Belize')::date+1);perform att_bobby_cancel(task);
 if exists(select 1 from att_bobby_tasks where att_bobby_tasks.id=task and active) then raise exception 'FAIL cancel';end if;
end $$;
reset role;
-- Simulate the current office date after 4 p.m. inside this transaction only.
insert into att_events(request_id,user_id,employee_id,name,action,happened_at,work_date,timing,work_mode,entry_source,recorded_by,correction_reason)
select gen_random_uuid(),id,employee_id,name,'IN',((now() at time zone 'America/Belize')::date+time '08:00') at time zone 'America/Belize',(now() at time zone 'America/Belize')::date,'On time','office','admin','b0b0b0b0-0000-4000-8000-000000000001','Scheduled test fixture' from att_profiles where id='b0b0b0b0-0000-4000-8000-000000000002';
insert into att_bobby_tasks(created_by,run_date) values('b0b0b0b0-0000-4000-8000-000000000001',(now() at time zone 'America/Belize')::date);
do $$declare source text;begin
 source=pg_get_functiondef('att_bobby_tick()'::regprocedure);execute replace(source,$old$clock_timestamp() at time zone 'America/Belize'$old$,$new$((clock_timestamp() at time zone 'America/Belize')::date+time '17:01')$new$);
 perform att_bobby_tick();perform att_bobby_tick();
 if (select count(*) from att_events where user_id='b0b0b0b0-0000-4000-8000-000000000002' and work_date=(now() at time zone 'America/Belize')::date and action='OUT' and (happened_at at time zone 'America/Belize')::time=time '17:00')<>1 then raise exception 'FAIL one-time scheduled clockout';end if;
end $$;
select 'PASS admin-only commands, messages, idempotency, clock sequencing, persistent intro, cancellation and one-time 5pm job; fixtures rolled back' as result;
rollback;
