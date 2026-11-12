begin;
alter table public.att_profiles drop constraint if exists att_profiles_job_role_check;
alter table public.att_profiles add constraint att_profiles_job_role_check check(length(job_role)<=80);
insert into att_departments(name)
select distinct coalesce(nullif(job_role,''),'General') from att_profiles
where employee_id in ('ANOV-001','DCU-002','HGAR-004','JESQ-0001','OTOR-003')
on conflict(name) do nothing;
update att_profiles set job_role=department,department=coalesce(nullif(job_role,''),'General')
where (employee_id,department) in (
 ('ANOV-001','Accounting and Business Development Specialist 1'),
 ('DCU-002','Marketing and IT Coordination'),
 ('HGAR-004','Office Administrator and Creative Development Officer'),
 ('JESQ-0001','Managing Director'),
 ('OTOR-003','Accounting and Business Development Specialist Manager')
);
delete from att_departments d where d.name in (
 'Accounting and Business Development Specialist 1','Marketing and IT Coordination',
 'Office Administrator and Creative Development Officer','Managing Director',
 'Accounting and Business Development Specialist Manager'
) and not exists(select 1 from att_profiles p where p.department=d.name);
comment on column public.att_profiles.job_role is 'Display title or profile label. Access is controlled separately by role.';
create function public.att_department_rename(old_name text,new_name text) returns text
language plpgsql security definer set search_path=public,pg_temp as $$
declare clean text:=btrim(new_name);
begin
 if not att_is_admin() then raise exception 'Administrator required'; end if;
 if old_name='General' then raise exception 'General is the fallback department'; end if;
 if clean is null or length(clean) not between 1 and 80 then raise exception 'Enter 1–80 characters'; end if;
 perform pg_advisory_xact_lock(825510);
 if not exists(select 1 from att_departments where name=old_name) then raise exception 'Department no longer exists'; end if;
 if clean=old_name then return clean; end if;
 if exists(select 1 from att_departments where lower(name)=lower(clean) and name<>old_name) then raise exception 'That department already exists'; end if;
 insert into att_departments(name) values(clean);
 update att_profiles set department=clean where department=old_name;
 delete from att_departments where name=old_name;
 return clean;
end $$;
create function public.att_department_remove(department_name text,reassign_to text default 'General') returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not att_is_admin() then raise exception 'Administrator required'; end if;
 if department_name='General' then raise exception 'General is the fallback department'; end if;
 if department_name=reassign_to then raise exception 'Choose a different replacement department'; end if;
 perform pg_advisory_xact_lock(825510);
 if not exists(select 1 from att_departments where name=department_name) then raise exception 'Department no longer exists'; end if;
 if not exists(select 1 from att_departments where name=reassign_to) then raise exception 'Choose a replacement department'; end if;
 update att_profiles set department=reassign_to where department=department_name;
 delete from att_departments where name=department_name;
end $$;
revoke all on function public.att_department_rename(text,text),public.att_department_remove(text,text) from public,anon;
grant execute on function public.att_department_rename(text,text),public.att_department_remove(text,text) to authenticated;
commit;
