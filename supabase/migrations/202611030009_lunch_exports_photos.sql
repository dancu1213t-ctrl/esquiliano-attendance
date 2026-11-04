begin;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
alter table public.att_settings add column if not exists lunch_effective_date date;
update public.att_settings set lunch_effective_date=(now() at time zone 'America/Belize')::date where id=1 and lunch_effective_date is null;
alter table public.att_notifications add column if not exists lunch_date date;
create unique index if not exists att_lunch_once on public.att_notifications(user_id,lunch_date) where lunch_date is not null;
create table if not exists public.att_schedule_secret(id int primary key check(id=1),token uuid not null default gen_random_uuid());
alter table public.att_schedule_secret enable row level security;
revoke all on public.att_schedule_secret from public,anon,authenticated;
grant select on public.att_schedule_secret to service_role;
insert into public.att_schedule_secret(id) values(1) on conflict do nothing;
create or replace function public.att_admin_photo(person uuid,photo_data text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not att_is_admin() then raise exception 'Administrator required'; end if;
 if photo_data is not null and (length(photo_data)>240000 or photo_data !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$') then raise exception 'Invalid photo'; end if;
 update att_profiles set photo=photo_data where id=person;
 if not found then raise exception 'Person not found'; end if;
 insert into att_audit(actor,action,target) values(auth.uid(),'PROFILE_PHOTO_UPDATED',person::text);
end $$;
revoke all on function public.att_admin_photo(uuid,text) from public,anon;
grant execute on function public.att_admin_photo(uuid,text) to authenticated;
create or replace function public.att_lunch_queue() returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare office_now timestamp:=now() at time zone 'America/Belize'; count_new integer;
begin
 if extract(isodow from office_now)>5 or office_now::time<'12:00' or office_now::time>='13:00' then return 0; end if;
 insert into att_notifications(user_id,actor_id,title,body,lunch_date)
 select id,id,'Lunch time','Hey, '||name||', it’s lunch time. Enjoy it. See you at 1 p.m.!',office_now::date from att_profiles where active
 on conflict(user_id,lunch_date) where lunch_date is not null do nothing;
 get diagnostics count_new=row_count;
 return count_new;
end $$;
revoke all on function public.att_lunch_queue() from public,anon,authenticated;
create or replace function public.att_lunch_tick() returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare secret uuid; office_now timestamp:=now() at time zone 'America/Belize';
begin
 if extract(isodow from office_now)>5 or office_now::time<'12:00' or office_now::time>='13:00' then return; end if;
 perform att_lunch_queue();
 if exists(select 1 from att_notifications where lunch_date=office_now::date and push_sent_at is null) then
 select token into secret from att_schedule_secret where id=1;
 perform net.http_post(url:='https://hunptuwwaxvpigsnrsbl.supabase.co/functions/v1/attendance-admin',headers:='{"Content-Type":"application/json"}'::jsonb,body:=jsonb_build_object('action','lunch-dispatch','token',secret),timeout_milliseconds:=10000);
 end if;
end $$;
revoke all on function public.att_lunch_tick() from public,anon,authenticated;
select cron.schedule('esquiliano-weekday-lunch','* 18 * * 1-5','select public.att_lunch_tick();');
commit;
