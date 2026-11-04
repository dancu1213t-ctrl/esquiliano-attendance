rollback;begin;
insert into auth.users(id,aud,role,email) values ('cbcbcbcb-0000-4000-8000-000000000001','authenticated','authenticated','lunch-admin@test.invalid'),('cbcbcbcb-0000-4000-8000-000000000002','authenticated','authenticated','lunch-worker@test.invalid');
insert into att_profiles(id,employee_id,name,role,active) values ('cbcbcbcb-0000-4000-8000-000000000001','LUNCH-TEST-ADMIN','Lunch admin','admin',true),('cbcbcbcb-0000-4000-8000-000000000002','LUNCH-TEST-WORKER','New worker','employee',true);
set local role authenticated;
select set_config('request.jwt.claim.sub','cbcbcbcb-0000-4000-8000-000000000002',true);
do $$ begin
 begin perform att_admin_photo(auth.uid(),'data:image/png;base64,AAAA');raise exception 'FAIL worker changed admin photo';exception when raise_exception then if SQLERRM like 'FAIL%' then raise;end if;end;
 if has_table_privilege('authenticated','att_schedule_secret','SELECT') then raise exception 'FAIL secret readable';end if;
 if has_function_privilege('authenticated','att_lunch_tick()','EXECUTE') then raise exception 'FAIL worker can schedule';end if;
end $$;
select set_config('request.jwt.claim.sub','cbcbcbcb-0000-4000-8000-000000000001',true);
select att_admin_photo('cbcbcbcb-0000-4000-8000-000000000002','data:image/png;base64,AAAA');
do $$ begin if (select photo from att_profiles where id='cbcbcbcb-0000-4000-8000-000000000002')<>'data:image/png;base64,AAAA' then raise exception 'FAIL photo update';end if;end $$;
reset role;
do $$ declare source text;n int;begin
 source=pg_get_functiondef('public.att_lunch_queue()'::regprocedure);
 execute replace(source,'now() at time zone ''America/Belize''','timestamp ''2026-11-04 12:00:00''');
 perform att_lunch_queue();n=att_lunch_queue();if n<>0 then raise exception 'FAIL duplicate reminders';end if;
 if not exists(select 1 from att_notifications where user_id='cbcbcbcb-0000-4000-8000-000000000002' and lunch_date='2026-11-04' and body like '%New worker%') then raise exception 'FAIL new worker reminder';end if;
 execute replace(source,'now() at time zone ''America/Belize''','timestamp ''2026-11-07 12:00:00''');
 if att_lunch_queue()<>0 then raise exception 'FAIL weekend reminder';end if;
 execute replace(source,'now() at time zone ''America/Belize''','timestamp ''2026-11-05 11:59:59''');
 if att_lunch_queue()<>0 then raise exception 'FAIL early reminder';end if;
end $$;
select 'PASS admin photo, worker denial, private schedule, future workers, personalized reminders, deduplication and weekday/noon boundary' as result;
rollback;
