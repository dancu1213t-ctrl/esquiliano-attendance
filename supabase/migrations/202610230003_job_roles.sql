begin;
alter table public.att_profiles add column if not exists job_role text not null default '' check(job_role in('','Agent','Marketing Department','Assistant','Manager','Director','Accounting Department'));
comment on column public.att_profiles.job_role is 'Job or department label only. Administrator access is controlled separately by role.';
commit;
