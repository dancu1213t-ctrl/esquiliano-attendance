begin;
create extension if not exists pgcrypto with schema extensions;
create table if not exists public.att_profiles (
 id uuid primary key references auth.users(id), employee_id text not null unique check(employee_id ~ '^[A-Z0-9_-]{2,30}$'),
 name text not null check(length(name) between 1 and 100), role text not null default 'employee' check(role in('employee','admin')),
 active boolean not null default true, photo text check(photo is null or length(photo)<250000), created_at timestamptz not null default now()
);
create or replace function public.att_is_admin() returns boolean language sql stable security definer set search_path=public,pg_temp as $$ select exists(select 1 from att_profiles where id=auth.uid() and active and role='admin') $$;
create or replace function public.att_is_active() returns boolean language sql stable security definer set search_path=public,pg_temp as $$ select exists(select 1 from att_profiles where id=auth.uid() and active) $$;
create table if not exists public.att_settings (
 id int primary key check(id=1), name text not null default 'Main office', latitude double precision not null default 18.079027361862938 check(latitude between -90 and 90),
 longitude double precision not null default -88.56170339764894 check(longitude between -180 and 180), radius_m int not null default 100 check(radius_m between 20 and 1000), accuracy_m int not null default 50 check(accuracy_m between 10 and 200),
 opens time not null default '08:00', closes time not null default '16:00', grace_minutes int not null default 10 check(grace_minutes in(5,10)), timezone text not null default 'America/Belize' check(timezone='America/Belize')
);
insert into att_settings(id) values(1) on conflict do nothing;
create table if not exists public.att_qr (id int primary key check(id=1), token uuid not null default gen_random_uuid());
insert into att_qr(id) values(1) on conflict do nothing;
create table if not exists public.att_devices (id uuid primary key, user_id uuid not null references att_profiles(id), label text not null default 'Phone browser', active boolean not null default true, created_at timestamptz not null default now(), last_seen timestamptz not null default now());
create table if not exists public.att_events (
 id uuid primary key default gen_random_uuid(), request_id uuid not null unique, user_id uuid not null references att_profiles(id), employee_id text not null, name text not null,
 action text not null check(action in('IN','OUT')), happened_at timestamptz not null default now(), work_date date not null, timing text not null, late_minutes int not null default 0, early_minutes int not null default 0,
 late_note text not null default '' check(length(late_note)<=1000), latitude double precision not null, longitude double precision not null, accuracy_m double precision not null, distance_m double precision not null, device_id uuid not null references att_devices(id)
);
create index if not exists att_events_user_time on att_events(user_id,happened_at desc);
create index if not exists att_events_work_date on att_events(work_date);
create table if not exists public.att_notifications(id uuid primary key default gen_random_uuid(), user_id uuid not null references att_profiles(id), title text not null check(length(title) between 1 and 80), body text not null check(length(body)<=500), created_at timestamptz not null default now(), read_at timestamptz);
create index if not exists att_notifications_user on att_notifications(user_id,created_at desc);
create table if not exists public.att_push(id uuid primary key default gen_random_uuid(), user_id uuid not null references att_profiles(id), endpoint text not null unique, subscription jsonb not null, created_at timestamptz not null default now());
create table if not exists public.att_audit(id bigint generated always as identity primary key, actor uuid, action text not null, target text, created_at timestamptz not null default now());
alter table att_profiles enable row level security;
alter table att_settings enable row level security;
alter table att_qr enable row level security;
alter table att_devices enable row level security;
alter table att_events enable row level security;
alter table att_notifications enable row level security;
alter table att_push enable row level security;
alter table att_audit enable row level security;
create policy att_profiles_read on att_profiles for select to authenticated using(att_is_active() and (id=auth.uid() or att_is_admin()));
create policy att_settings_read on att_settings for select to authenticated using(att_is_active());
create policy att_settings_write on att_settings for update to authenticated using(att_is_admin()) with check(att_is_admin());
create policy att_devices_read on att_devices for select to authenticated using(att_is_active() and (user_id=auth.uid() or att_is_admin()));
create policy att_events_read on att_events for select to authenticated using(att_is_active() and (user_id=auth.uid() or att_is_admin()));
create policy att_notifications_read on att_notifications for select to authenticated using(att_is_active() and user_id=auth.uid());
create policy att_audit_read on att_audit for select to authenticated using(att_is_admin());
grant select on att_profiles,att_settings,att_devices,att_events,att_notifications,att_audit to authenticated;
grant update(name,latitude,longitude,radius_m,accuracy_m,opens,closes,grace_minutes) on att_settings to authenticated;
revoke all on att_qr,att_push from anon,authenticated;
revoke insert,update,delete on att_profiles,att_devices,att_events,att_notifications,att_audit from anon,authenticated;
create or replace function public.att_register_device(device uuid,label text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not att_is_active() then raise exception 'Account inactive'; end if;
 if exists(select 1 from att_devices where id=device and (user_id<>auth.uid() or not active)) then raise exception 'Device revoked. Register a new browser session.'; end if;
 insert into att_devices(id,user_id,label) values(device,auth.uid(),left(label,80)) on conflict(id) do update set last_seen=now();
end $$;
create or replace function public.att_revoke_device(device uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not att_is_admin() then raise exception 'Administrator required'; end if;
 update att_devices set active=false where id=device;
 insert into att_audit(actor,action,target) values(auth.uid(),'DEVICE_REVOKED',device::text);
end $$;
create or replace function public.att_photo(photo_data text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not att_is_active() then raise exception 'Account inactive'; end if;
 if photo_data is not null and (length(photo_data)>240000 or photo_data !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$') then raise exception 'Invalid photo'; end if;
 update att_profiles set photo=photo_data where id=auth.uid();
end $$;
create or replace function public.att_wall(rotate boolean default false) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v uuid;
begin
 if not att_is_admin() then raise exception 'Administrator required'; end if;
 if rotate then update att_qr set token=gen_random_uuid() where id=1;insert into att_audit(actor,action) values(auth.uid(),'QR_REPLACED');end if;
 select token into v from att_qr where id=1;return v;
end $$;
create or replace function public.att_read_notifications() returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin if not att_is_active() then raise exception 'Account inactive';end if;update att_notifications set read_at=now() where user_id=auth.uid() and read_at is null;end $$;
create or replace function public.att_subscribe(subscription_data jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare endpoint_value text;
begin
 if not att_is_active() then raise exception 'Account inactive';end if;
 endpoint_value=subscription_data->>'endpoint';
 if length(subscription_data::text)>5000 or endpoint_value !~ '^https://' or not subscription_data ? 'keys' then raise exception 'Invalid push subscription';end if;
 insert into att_push(user_id,endpoint,subscription) values(auth.uid(),endpoint_value,subscription_data) on conflict(endpoint) do update set user_id=auth.uid(),subscription=excluded.subscription;
end $$;
create or replace function public.att_unsubscribe(endpoint_value text) returns void language sql security definer set search_path=public,pg_temp as $$ delete from att_push where user_id=auth.uid() and endpoint=endpoint_value $$;
create or replace function public.att_clock(request uuid,device uuid,qr uuid,lat double precision,lng double precision,accuracy double precision,note text,kind text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare p att_profiles; s att_settings; last_event att_events; existing att_events; d double precision; local_now timestamp; late int:=0; early int:=0; timing_value text:='On time'; result att_events;
begin
 select * into p from att_profiles where id=auth.uid() and active;
 if p.id is null or p.role<>'employee' then raise exception 'Employee sign in required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p.id::text,0));
 select * into existing from att_events where request_id=request;
 if existing.id is not null then if existing.user_id<>p.id then raise exception 'Invalid request';end if;return to_jsonb(existing);end if;
 if not exists(select 1 from att_devices where id=device and user_id=p.id and active) then raise exception 'Device registration required';end if;
 if qr is null or not exists(select 1 from att_qr where id=1 and token=qr) then raise exception 'Scan the current office QR';end if;
 select * into s from att_settings where id=1;
 if lat is null or lng is null or accuracy is null or lat not between -90 and 90 or lng not between -180 and 180 or accuracy not between 0 and s.accuracy_m then raise exception 'A precise location reading is required';end if;
 d=6371000*2*asin(sqrt(least(1.0,power(sin(radians(lat-s.latitude)/2),2)+cos(radians(s.latitude))*cos(radians(lat))*power(sin(radians(lng-s.longitude)/2),2))));
 if d>s.radius_m then raise exception 'You must be at the office';end if;
 if kind not in('IN','OUT') or kind is null then raise exception 'Invalid action';end if;
 select * into last_event from att_events where user_id=p.id order by happened_at desc limit 1;
 if (kind='IN' and last_event.action='IN') or (kind='OUT' and (last_event.id is null or last_event.action='OUT')) then raise exception 'Attendance is already recorded for this action';end if;
 local_now=now() at time zone s.timezone;
 if kind='IN' and not exists(select 1 from att_events where user_id=p.id and work_date=local_now::date and action='IN') then
  late=greatest(0,floor(extract(epoch from(local_now-(local_now::date+s.opens)))/60)::int);
  if local_now>local_now::date+s.opens+make_interval(mins=>s.grace_minutes) then timing_value='Late';if length(btrim(coalesce(note,'')))<5 then raise exception 'Add a late arrival note';end if;else late=0;end if;
 end if;
 if kind='OUT' then early=greatest(0,ceil(extract(epoch from((local_now::date+s.closes)-local_now))/60)::int);if early>0 then timing_value='Early departure';end if;end if;
 insert into att_events(request_id,user_id,employee_id,name,action,work_date,timing,late_minutes,early_minutes,late_note,latitude,longitude,accuracy_m,distance_m,device_id) values(request,p.id,p.employee_id,p.name,kind,local_now::date,timing_value,late,early,left(btrim(coalesce(note,'')),1000),lat,lng,accuracy,d,device) returning * into result;
 update att_devices set last_seen=now() where id=device;
 insert into att_notifications(user_id,title,body) values(p.id,case when kind='IN' then 'Clocked in' else 'Clocked out' end,to_char(local_now,'FMHH12:MI AM')||' · '||s.name);
 insert into att_notifications(user_id,title,body) select id,p.name||case when kind='IN' then ' clocked in' else ' clocked out' end,p.employee_id||' · '||timing_value from att_profiles where active and role='admin';
 return to_jsonb(result);
end $$;
revoke all on function att_is_admin(),att_is_active(),att_register_device(uuid,text),att_revoke_device(uuid),att_photo(text),att_wall(boolean),att_read_notifications(),att_subscribe(jsonb),att_unsubscribe(text),att_clock(uuid,uuid,uuid,double precision,double precision,double precision,text,text) from public,anon;
grant execute on function att_is_admin(),att_is_active(),att_register_device(uuid,text),att_revoke_device(uuid),att_photo(text),att_wall(boolean),att_read_notifications(),att_subscribe(jsonb),att_unsubscribe(text),att_clock(uuid,uuid,uuid,double precision,double precision,double precision,text,text) to authenticated;
do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='att_notifications' and schemaname='public') then alter publication supabase_realtime add table public.att_notifications;end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='att_events' and schemaname='public') then alter publication supabase_realtime add table public.att_events;end if;
end $$;
commit;
