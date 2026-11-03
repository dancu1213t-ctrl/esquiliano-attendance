rollback;
begin;
insert into auth.users(id,aud,role,email) values
('bcbcbcbc-0000-4000-8000-000000000001','authenticated','authenticated','staff-admin@test.invalid'),
('bcbcbcbc-0000-4000-8000-000000000002','authenticated','authenticated','staff-worker@test.invalid');
insert into att_profiles(id,employee_id,name,role,active) values
('bcbcbcbc-0000-4000-8000-000000000001','STAFF-TEST-ADMIN','Test admin','admin',true),
('bcbcbcbc-0000-4000-8000-000000000002','STAFF-TEST-WORKER','Test worker','employee',true);
set local role authenticated;
select set_config('request.jwt.claim.sub','bcbcbcbc-0000-4000-8000-000000000002',true);
do $$ begin
 begin perform att_admin_devices(null);raise exception 'FAIL worker viewed devices';exception when raise_exception then if SQLERRM='FAIL worker viewed devices' then raise;end if;end;
 begin perform att_staff_week(auth.uid(),'2026-01-05');raise exception 'FAIL worker accessed admin calendar';exception when raise_exception then if SQLERRM='FAIL worker accessed admin calendar' then raise;end if;end;
 begin perform att_admin_shift(gen_random_uuid(),auth.uid(),'2026-01-05 08:00','2026-01-05 16:00','office','Reviewed shift');raise exception 'FAIL worker changed shift';exception when raise_exception then if SQLERRM='FAIL worker changed shift' then raise;end if;end;
 perform att_register_device('bcbcbcbc-0000-4000-8000-000000000003','Chrome - Windows');
 perform att_subscribe('{"endpoint":"https://fcm.googleapis.com/fcm/send/staff-fixture","keys":{"p256dh":"fixture","auth":"fixture"},"device_id":"bcbcbcbc-0000-4000-8000-000000000003","label":"Chrome - Windows"}');
end $$;
select set_config('request.jwt.claim.sub','bcbcbcbc-0000-4000-8000-000000000001',true);
do $$ declare a jsonb;b jsonb;c jsonb;v jsonb;in_uid uuid;out_uid uuid;begin
 a=att_admin_shift('bcbcbcbc-0000-4000-8000-000000000004','bcbcbcbc-0000-4000-8000-000000000002','2026-01-05 08:00','2026-01-05 16:00','office','Missed both records');
 if att_admin_shift('bcbcbcbc-0000-4000-8000-000000000004','bcbcbcbc-0000-4000-8000-000000000002','2026-01-05 08:00','2026-01-05 16:00','office','Missed both records')<>a then raise exception 'FAIL idempotency';end if;
 in_uid=(a->'clock_in'->>'id')::uuid;out_uid=(a->'clock_out'->>'id')::uuid;
 b=att_admin_shift(gen_random_uuid(),'bcbcbcbc-0000-4000-8000-000000000002','2026-01-05 08:30','2026-01-05 16:00','home','Corrected worked hours',in_uid,out_uid,1,1);
 if (b->'clock_in'->>'row_version')::int<>2 or b->'clock_in'->>'work_mode'<>'home' then raise exception 'FAIL shift edit';end if;
 begin perform att_admin_shift(gen_random_uuid(),'bcbcbcbc-0000-4000-8000-000000000002','2026-01-05 09:00','2026-01-05 16:00','home','Stale administrator',in_uid,out_uid,1,1);raise exception 'FAIL stale write';exception when raise_exception then if SQLERRM='FAIL stale write' then raise;end if;end;
 begin perform att_admin_shift(gen_random_uuid(),'bcbcbcbc-0000-4000-8000-000000000002','2026-01-05 10:00','2026-01-05 17:00','office','Overlapping shift');raise exception 'FAIL overlap';exception when raise_exception then if SQLERRM='FAIL overlap' then raise;end if;end;
 c=att_admin_shift(gen_random_uuid(),'bcbcbcbc-0000-4000-8000-000000000002','2026-01-06 08:00',null,'office','Missed clock out');
 if c->'clock_out'<>'null'::jsonb then raise exception 'FAIL open shift';end if;
 v=att_admin_shift(gen_random_uuid(),'bcbcbcbc-0000-4000-8000-000000000002','2026-01-06 08:00','2026-01-06 16:00','office','Added forgotten clock out',(c->'clock_in'->>'id')::uuid,null,1,null);
 if v->'clock_out'->>'action'<>'OUT' then raise exception 'FAIL close person';end if;
 perform att_admin_shift(gen_random_uuid(),'bcbcbcbc-0000-4000-8000-000000000002','2026-01-04 22:00','2026-01-05 02:00','office','Overnight shift review');
 v=att_staff_week('bcbcbcbc-0000-4000-8000-000000000002','2026-01-05');
 if jsonb_array_length(v->'events')<>6 then raise exception 'FAIL week boundary records';end if;
 if (v->'devices'->'devices'->0->>'push_count')::int<>1 then raise exception 'FAIL desktop push device link';end if;
 if (select count(*) from att_audit where actor=auth.uid() and action='SHIFT_CORRECTED')<>5 then raise exception 'FAIL audit';end if;
 if not exists(select 1 from att_audit where actor=auth.uid() and details->'before_in'->>'id'=in_uid::text) then raise exception 'FAIL original attendance audit';end if;
 perform att_revoke_device('bcbcbcbc-0000-4000-8000-000000000003');
 v=att_admin_devices('bcbcbcbc-0000-4000-8000-000000000002');
 if (v->'devices'->0->>'active')::boolean or (v->'devices'->0->>'push_count')::int<>0 then raise exception 'FAIL device revocation push cleanup';end if;
end $$;
rollback;
select 'PASS: staff permissions, weekly boundary data, shift editing, idempotency, stale-write protection, overlap checks, missed clock-out, desktop push linkage, revoke and audit. Fixtures rolled back.' as result;

