rollback;begin;
insert into auth.users(id,aud,role,email) values('ecececec-0000-4000-8000-000000000001','authenticated','authenticated','daily-admin@test.invalid'),('ecececec-0000-4000-8000-000000000002','authenticated','authenticated','daily-worker@test.invalid');
insert into att_profiles(id,employee_id,name,role) values('ecececec-0000-4000-8000-000000000001','DAILY-ADMIN','Test admin','admin'),('ecececec-0000-4000-8000-000000000002','DAILY-WORKER','Test worker','employee');
set local role authenticated;
select set_config('request.jwt.claim.sub','ecececec-0000-4000-8000-000000000002',true);
do $$begin begin perform att_set_day_record(auth.uid(),'2026-11-02','Worked',8,'Worker cannot change hours');raise exception 'FAIL worker updated hours';exception when raise_exception then if SQLERRM like 'FAIL%' then raise;end if;end;end $$;
select set_config('request.jwt.claim.sub','ecececec-0000-4000-8000-000000000001',true);
select att_set_day_record('ecececec-0000-4000-8000-000000000002','2026-11-02','Worked',8,'Official daily total');
select att_set_day_record('ecececec-0000-4000-8000-000000000002','2026-11-03','Sick',0,'Reported sick today');
do $$begin
 if (select hours from att_day_records where user_id='ecececec-0000-4000-8000-000000000002' and work_date='2026-11-02')<>8 then raise exception 'FAIL exact hours';end if;
 begin perform att_set_day_record('ecececec-0000-4000-8000-000000000002','2026-11-02','Worked',7,'Stale hours update',99);raise exception 'FAIL stale update';exception when raise_exception then if SQLERRM like 'FAIL%' then raise;end if;end;
 begin perform att_set_day_record('ecececec-0000-4000-8000-000000000002','2026-11-03','Sick',8,'Invalid sick hours',1);raise exception 'FAIL sick hours';exception when raise_exception then if SQLERRM like 'FAIL%' then raise;end if;end;
end $$;
select att_set_day_record('ecececec-0000-4000-8000-000000000002','2026-11-02','Worked',8,'Delete daily total',1,true);
select att_set_day_record('ecececec-0000-4000-8000-000000000002','2026-11-02','Worked',8,'Restore daily total',2,false);
select 'PASS daily exact hours, sick status, permissions, stale versions and reversible deletion' as result;
rollback;