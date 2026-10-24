begin;
create table if not exists public.ws_clients (
 id uuid primary key, owner_id uuid not null references public.att_profiles(id),
 fields jsonb not null check(jsonb_typeof(fields)='object'), status text not null check(status in ('Draft','Active')),
 version bigint not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), updated_by uuid not null references public.att_profiles(id)
);
create table if not exists public.ws_history (
 id bigint generated always as identity primary key, client_id uuid not null references public.ws_clients(id), actor_id uuid not null references public.att_profiles(id), at timestamptz not null default now(), previous_record jsonb not null
);
create table if not exists public.ws_comments (
 id uuid primary key, client_id uuid not null references public.ws_clients(id), sender_id uuid not null references public.att_profiles(id), body text not null check(length(btrim(body)) between 1 and 2000), created_at timestamptz not null default now()
);
create table if not exists public.ws_messages (
 id uuid primary key, room text not null, sender_id uuid not null references public.att_profiles(id), body text not null check(length(btrim(body)) between 1 and 2000), created_at timestamptz not null default now()
);
create index if not exists ws_clients_owner on public.ws_clients(owner_id,updated_at desc);
create index if not exists ws_comments_client on public.ws_comments(client_id,created_at);
create index if not exists ws_messages_room on public.ws_messages(room,created_at desc);
alter table public.ws_clients enable row level security;
alter table public.ws_history enable row level security;
alter table public.ws_comments enable row level security;
alter table public.ws_messages enable row level security;
revoke all on public.ws_clients,public.ws_history,public.ws_comments,public.ws_messages from anon,authenticated;
grant select on public.ws_clients,public.ws_history,public.ws_comments,public.ws_messages to authenticated;
create or replace function public.ws_can_client(cid uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select att_is_active() and exists(select 1 from ws_clients where id=cid and (owner_id=auth.uid() or att_is_admin()));
$$;
create policy ws_client_read on public.ws_clients for select to authenticated using(att_is_active() and (owner_id=auth.uid() or att_is_admin()));
create policy ws_history_read on public.ws_history for select to authenticated using(ws_can_client(client_id));
create policy ws_comment_read on public.ws_comments for select to authenticated using(ws_can_client(client_id));
create or replace function public.ws_room_allowed(room_value text) returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
 declare ids text[];
 begin
 if not att_is_active() then return false; end if;
 if room_value in ('general','operations','announcements') then return true; end if;
 if room_value !~ '^dm:[0-9a-f-]{36}:[0-9a-f-]{36}$' then return false; end if;
 ids=string_to_array(substring(room_value from 4),':');
 if ids[1]>=ids[2] then return false;end if;
 return (auth.uid()::text=any(ids) or att_is_admin()) and (select count(*)=2 from att_profiles where active and id::text=any(ids));
 end;
$$;
create policy ws_message_read on public.ws_messages for select to authenticated using(ws_room_allowed(room));
create or replace function public.ws_directory() returns table(id uuid,employee_id text,name text,job_role text,photo text) language sql stable security definer set search_path=public,pg_temp as $$
 select p.id,p.employee_id,p.name,p.job_role,p.photo from att_profiles p where p.active and att_is_active() order by p.name limit 1000;
$$;
create or replace function public.ws_save_client(client_id uuid,client_fields jsonb,client_status text,expected_version bigint default null) returns public.ws_clients language plpgsql security definer set search_path=public,pg_temp as $$
 declare old ws_clients; saved ws_clients; k text; v text; cleaned jsonb='{}';
 keys text[]=array['client','contact','email','phone','other','service','price','btsUrl','btsUser','btsVault','ssUrl','ssUser','ssVault','erpUrl','erpUser','erpVault','crmUrl','crmUser','crmVault'];
 begin
 if not att_is_active() then raise exception 'Sign in required';end if;
 if client_status is null or client_status not in ('Draft','Active') or client_id is null or client_fields is null or jsonb_typeof(client_fields)<>'object' then raise exception 'Invalid client record';end if;
 if exists(select 1 from jsonb_object_keys(client_fields) x where x<>all(keys)) then raise exception 'Unknown client field';end if;
 foreach k in array keys loop
 if client_fields ? k and jsonb_typeof(client_fields->k)<>'string' then raise exception 'Check %',k;end if;
 v=btrim(coalesce(client_fields->>k,''));
 if length(v)>(case when k in ('other','service') then 2000 else 400 end) then raise exception 'Field too long: %',k;end if;
 if k in ('client','contact','service') and v='' then raise exception 'Client, contact and service are required';end if;
 if k='price' and (v!~ '^[0-9]+(\.[0-9]{1,2})?$' or length(v)>15) then raise exception 'Enter a valid BZD quote';end if;
 if k='price' and v::numeric>100000000 then raise exception 'Quote is too large';end if;
 if k='email' and v<>'' and v!~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Check email address';end if;
 if k like '%Url' and v<>'' and v!~ '^https://[^[:space:]]+$' then raise exception 'System URLs must use https://';end if;
 cleaned=cleaned||jsonb_build_object(k,v);
 end loop;
 select * into old from ws_clients where id=client_id for update;
 if found then
 if not ws_can_client(client_id) then raise exception 'Client access denied';end if;
 if expected_version is null or old.version<>expected_version then raise exception 'This client changed. Refresh and reopen it before saving.';end if;
 insert into ws_history(client_id,actor_id,previous_record) values(client_id,auth.uid(),to_jsonb(old));
 update ws_clients set fields=cleaned,status=client_status,version=version+1,updated_at=clock_timestamp(),updated_by=auth.uid() where id=client_id returning * into saved;
 else
 if expected_version is not null then raise exception 'Client no longer exists';end if;
 insert into ws_clients(id,owner_id,fields,status,updated_by) values(client_id,auth.uid(),cleaned,client_status,auth.uid()) returning * into saved;
 end if;
 return saved;
 end;
$$;
create or replace function public.ws_add_comment(request_id uuid,client_id_value uuid,message_text text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
 declare existing ws_comments;
 begin
 if not ws_can_client(client_id_value) then raise exception 'Client access denied';end if;
 if request_id is null or message_text is null or length(btrim(message_text)) not between 1 and 2000 then raise exception 'Enter a note of 1–2,000 characters';end if;
 select * into existing from ws_comments where id=request_id;
 if found then
 if existing.sender_id<>auth.uid() or existing.client_id<>client_id_value or existing.body<>btrim(message_text) then raise exception 'Request conflict';end if;return;
 end if;
 insert into ws_comments(id,client_id,sender_id,body) values(request_id,client_id_value,auth.uid(),btrim(message_text));
 end;
$$;
create or replace function public.ws_send_message(request_id uuid,room_value text,message_text text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
 declare existing ws_messages; ids text[]; recipients uuid[]; sender_name text;
 begin
 if not ws_room_allowed(room_value) then raise exception 'Conversation access denied';end if;
 if room_value like 'dm:%' and auth.uid()::text<>all(string_to_array(substring(room_value from 4),':')) then raise exception 'Only participants can send direct messages';end if;
 if room_value='announcements' and not att_is_admin() then raise exception 'Only administrators can post announcements';end if;
 if request_id is null or message_text is null or length(btrim(message_text)) not between 1 and 2000 then raise exception 'Enter a message of 1–2,000 characters';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select * into existing from ws_messages where id=request_id;
 if found then
 if existing.sender_id<>auth.uid() or existing.room<>room_value or existing.body<>btrim(message_text) then raise exception 'Request conflict';end if;return;
 end if;
 if exists(select 1 from ws_messages where sender_id=auth.uid() and created_at>clock_timestamp()-interval '3 seconds') then raise exception 'Wait a few seconds before sending again';end if;
 insert into ws_messages(id,room,sender_id,body) values(request_id,room_value,auth.uid(),btrim(message_text));
 select name into sender_name from att_profiles where id=auth.uid();
 if room_value like 'dm:%' then
 ids=string_to_array(substring(room_value from 4),':');
 select array_agg(id) into recipients from att_profiles where active and id::text=any(ids) and id<>auth.uid();
 elsif room_value='announcements' then
 select array_agg(id) into recipients from att_profiles where active and id<>auth.uid();
 end if;
 insert into att_notifications(user_id,title,body,actor_id) select unnest(recipients),left(case when room_value='announcements' then 'Team announcement' else 'Message from '||sender_name end,80),left(btrim(message_text),500),auth.uid();
 end;
$$;
revoke all on function ws_can_client(uuid),ws_room_allowed(text),ws_directory(),ws_save_client(uuid,jsonb,text,bigint),ws_add_comment(uuid,uuid,text),ws_send_message(uuid,text,text) from public,anon;
grant execute on function ws_can_client(uuid),ws_room_allowed(text),ws_directory(),ws_save_client(uuid,jsonb,text,bigint),ws_add_comment(uuid,uuid,text),ws_send_message(uuid,text,text) to authenticated;
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='ws_messages') then alter publication supabase_realtime add table ws_messages;end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='ws_clients') then alter publication supabase_realtime add table ws_clients;end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='ws_comments') then alter publication supabase_realtime add table ws_comments;end if;
 end if;
end $$;
commit;
