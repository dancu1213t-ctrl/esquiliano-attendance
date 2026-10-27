begin;
insert into auth.users(id,aud,role,email) values
('eeeeeeee-0000-4000-8000-000000000001','authenticated','authenticated','attendance-status-admin@test.invalid'),
('eeeeeeee-0000-4000-8000-000000000002','authenticated','authenticated','attendance-status-worker@test.invalid');
insert into att_profiles(id,employee_id,name,role) values
('eeeeeeee-0000-4000-8000-000000000001','STATUS-TEST-ADMIN','Status test admin','admin'),
('eeeeeeee-0000-4000-8000-000000000002','STATUS-TEST-WORKER','Status test worker','employee');
set local role authenticated;
select set_config('request.jwt.claim.sub','eeeeeeee-0000-4000-8000-000000000001',true);
do $$declare s att_settings;token uuid;first_event jsonb;last_event jsonb;request_id uuid:=gen_random_uuid();begin
 select * into s from att_settings where id=1;token=att_wall(false);
 perform att_register_device('ffffffff-0000-4000-8000-000000000001','Status test admin device');
 first_event=att_clock(request_id,'ffffffff-0000-4000-8000-000000000001',token,s.latitude,s.longitude,5,'Rollback-only attendance test','IN');
 if first_event->>'action'<>'IN' or first_event->>'user_id'<>auth.uid()::text then raise exception 'FAIL administrator clock in';end if;
 if att_clock(request_id,'ffffffff-0000-4000-8000-000000000001',token,s.latitude,s.longitude,5,'Rollback-only attendance test','IN')->>'id'<>first_event->>'id' then raise exception 'FAIL retry idempotency';end if;
 begin perform att_clock(request_id,'ffffffff-0000-4000-8000-000000000001',token,s.latitude,s.longitude,5,'Rollback-only attendance test','OUT');raise exception 'FAIL reused request action';exception when raise_exception then if SQLERRM='FAIL reused request action' then raise;end if;end;
 begin perform att_clock(gen_random_uuid(),'ffffffff-0000-4000-8000-000000000001',token,s.latitude,s.longitude,5,'Rollback-only attendance test','IN');raise exception 'FAIL duplicate clock in';exception when raise_exception then if SQLERRM='FAIL duplicate clock in' then raise;end if;end;
 last_event=att_clock(gen_random_uuid(),'ffffffff-0000-4000-8000-000000000001',token,s.latitude,s.longitude,5,'Rollback-only attendance test','OUT');
 if last_event->>'action'<>'OUT' or (last_event->>'happened_at')::timestamptz<=(first_event->>'happened_at')::timestamptz then raise exception 'FAIL ordered clock out';end if;
 if (select action from att_events where user_id=auth.uid() order by happened_at desc limit 1)<>'OUT' then raise exception 'FAIL saved current state';end if;
 if (select count(*) from att_events where user_id=auth.uid())<>2 then raise exception 'FAIL duplicate records';end if;
 if (select count(*) from att_notifications where user_id=auth.uid())<>2 then raise exception 'FAIL duplicate admin self notifications';end if;
 perform set_config('request.jwt.claim.sub','eeeeeeee-0000-4000-8000-000000000002',true);
 if exists(select 1 from att_events where user_id='eeeeeeee-0000-4000-8000-000000000001') then raise exception 'FAIL worker history isolation';end if;
 perform att_register_device('ffffffff-0000-4000-8000-000000000002','Status test worker device');
 begin perform att_clock(gen_random_uuid(),'ffffffff-0000-4000-8000-000000000002',token,s.latitude,s.longitude,5,'Rollback-only attendance test','OUT');raise exception 'FAIL out before in';exception when raise_exception then if SQLERRM='FAIL out before in' then raise;end if;end;
 begin perform att_clock(gen_random_uuid(),'ffffffff-0000-4000-8000-000000000002',gen_random_uuid(),s.latitude,s.longitude,5,'Rollback-only attendance test','IN');raise exception 'FAIL invalid QR';exception when raise_exception then if SQLERRM='FAIL invalid QR' then raise;end if;end;
 begin perform att_clock(gen_random_uuid(),'ffffffff-0000-4000-8000-000000000002',token,0,0,5,'Rollback-only attendance test','IN');raise exception 'FAIL outside office';exception when raise_exception then if SQLERRM='FAIL outside office' then raise;end if;end;
 begin perform att_clock(gen_random_uuid(),'ffffffff-0000-4000-8000-000000000002',token,s.latitude,s.longitude,999,'Rollback-only attendance test','IN');raise exception 'FAIL imprecise location';exception when raise_exception then if SQLERRM='FAIL imprecise location' then raise;end if;end;
 first_event=att_clock(gen_random_uuid(),'ffffffff-0000-4000-8000-000000000002',token,s.latitude,s.longitude,5,'Rollback-only attendance test','IN');
 if first_event->>'action'<>'IN' then raise exception 'FAIL worker clock in';end if;
 last_event=att_clock(gen_random_uuid(),'ffffffff-0000-4000-8000-000000000002',token,s.latitude,s.longitude,5,'Rollback-only attendance test','OUT');
 if last_event->>'action'<>'OUT' then raise exception 'FAIL worker clock out';end if;
 perform set_config('request.jwt.claim.sub','eeeeeeee-0000-4000-8000-000000000001',true);
 if (select count(*) from att_events where user_id in ('eeeeeeee-0000-4000-8000-000000000001','eeeeeeee-0000-4000-8000-000000000002'))<>4 then raise exception 'FAIL admin actual register';end if;
end $$;
reset role;
rollback;
select 'PASS: administrator and worker IN/OUT, canonical status, ordered records, retry safety, no duplicate admin alerts, worker isolation, QR and GPS enforcement' as result;
