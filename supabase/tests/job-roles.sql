begin;
insert into auth.users(id,aud,role,email) values('cccccccc-0000-4000-8000-000000000004','authenticated','authenticated','job-role-test@attendance.invalid');
insert into public.att_profiles(id,employee_id,name,role,job_role) values('cccccccc-0000-4000-8000-000000000004','TEST-ROLE','Job role test','employee','Director');
set local role authenticated;
select set_config('request.jwt.claim.sub','cccccccc-0000-4000-8000-000000000004',true);
do $$ begin
 if att_is_admin() then raise exception 'Job role granted admin access';end if;
 if (select job_role from att_profiles where id=auth.uid())<>'Director' then raise exception 'Job role missing from own profile';end if;
 begin update att_profiles set role='admin' where id=auth.uid();raise exception 'Unexpected profile update permission';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$ declare v text;begin
 foreach v in array array['Agent','Marketing Department','Assistant','Manager','Director','Accounting Department'] loop
  update att_profiles set job_role=v where employee_id='TEST-ROLE';
 end loop;
 begin update att_profiles set job_role='Unsupported' where employee_id='TEST-ROLE';raise exception 'Invalid role accepted';exception when check_violation then null;end;
end $$;
rollback;
select 'PASS: six job roles supported; invalid values rejected; Director has no admin access; employee cannot edit permissions; test data rolled back.' as result;
