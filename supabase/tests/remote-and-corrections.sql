rollback;
begin;
insert into auth.users(id,aud,role,email) values
('abababab-0000-4000-8000-000000000001','authenticated','authenticated','wfh-admin@test.invalid'),
('abababab-0000-4000-8000-000000000002','authenticated','authenticated','wfh-worker@test.invalid');
insert into att_profiles(id,employee_id,name,role,active) values
('abababab-0000-4000-8000-000000000001','WFH-TEST-ADMIN','Test administrator','admin',true),
('abababab-0000-4000-8000-000000000002','WFH-TEST-WORKER','Test worker','employee',true);
insert into att_devices(id,user_id) values('abababab-0000-4000-8000-000000000003','abababab-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub','abababab-0000-4000-8000-000000000002',true);
do $$ begin
 begin perform att_set_work_mode(auth.uid(),true);raise exception 'FAIL worker changed work mode';exception when raise_exception then if SQLERRM='FAIL worker changed work mode' then raise;end if;end;
 begin perform att_clock(gen_random_uuid(),'abababab-0000-4000-8000-000000000003',null,null,null,null,'Reviewed late note','IN');raise exception 'FAIL office scan bypass';exception when raise_exception then if SQLERRM='FAIL office scan bypass' then raise;end if;end;
 begin perform att_admin_clock(gen_random_uuid(),auth.uid(),'IN','2026-01-01 08:00','home','Reviewed attendance');raise exception 'FAIL worker manual correction';exception when raise_exception then if SQLERRM='FAIL worker manual correction' then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub','abababab-0000-4000-8000-000000000001',true);
select att_set_work_mode('abababab-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claim.sub','abababab-0000-4000-8000-000000000001',true);
do $$ declare a jsonb;b jsonb;begin
 a=att_admin_clock('abababab-0000-4000-8000-000000000006','abababab-0000-4000-8000-000000000002','IN','2026-01-01 08:00','office','Forgot to clock in');
 b=att_admin_clock('abababab-0000-4000-8000-000000000007','abababab-0000-4000-8000-000000000002','OUT','2026-01-01 16:00','office','Forgot to clock out');
 if a->>'entry_source'<>'admin' or a->>'recorded_by'<>auth.uid()::text or b->>'correction_reason'<>'Forgot to clock out' then raise exception 'FAIL correction audit fields';end if;
 if att_admin_clock('abababab-0000-4000-8000-000000000007','abababab-0000-4000-8000-000000000002','OUT','2026-01-01 16:00','office','Forgot to clock out')->>'id'<>b->>'id' then raise exception 'FAIL correction duplicate';end if;
 begin perform att_admin_clock(gen_random_uuid(),'abababab-0000-4000-8000-000000000002','IN','2026-01-01 10:00','office','Incorrect duplicate');raise exception 'FAIL invalid sequence';exception when raise_exception then if SQLERRM='FAIL invalid sequence' then raise;end if;end;
 begin perform att_admin_clock(gen_random_uuid(),'abababab-0000-4000-8000-000000000002','IN','2099-01-01 10:00','office','Incorrect future');raise exception 'FAIL future record';exception when raise_exception then if SQLERRM='FAIL future record' then raise;end if;end;
 if (select count(*) from att_audit where actor=auth.uid() and action='ATTENDANCE_CORRECTION')<>2 then raise exception 'FAIL missing audit trail';end if;
end $$;
select set_config('request.jwt.claim.sub','abababab-0000-4000-8000-000000000002',true);
do $$ declare a jsonb;b jsonb;begin
 a=att_clock('abababab-0000-4000-8000-000000000004','abababab-0000-4000-8000-000000000003',null,null,null,null,'Reviewed late arrival','IN');
 b=att_clock('abababab-0000-4000-8000-000000000005','abababab-0000-4000-8000-000000000003',null,null,null,null,'','OUT');
 if a->>'work_mode'<>'home' or a->>'latitude' is not null or b->>'action'<>'OUT' then raise exception 'FAIL remote attendance';end if;
 if att_clock('abababab-0000-4000-8000-000000000005','abababab-0000-4000-8000-000000000003',null,null,null,null,'','OUT')->>'id'<>b->>'id' then raise exception 'FAIL remote duplicate';end if;
end $$;
rollback;
select 'PASS: office scan protection, admin permissions, remote IN/OUT, manual corrections, audit, idempotency, sequence and future checks. All fixtures rolled back.' as result;

