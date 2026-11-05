begin;
create table public.att_departments(name text primary key check(length(btrim(name)) between 1 and 80),created_at timestamptz not null default now());
insert into att_departments(name) values('General'),('Marketing Department'),('Accounting Department');
alter table att_departments enable row level security;
grant select on att_departments to authenticated;
create policy department_read on att_departments for select to authenticated using(att_is_active());
alter table att_profiles add column department text not null default 'General' references att_departments(name);
update att_profiles set department=job_role where job_role in ('Marketing Department','Accounting Department');
create function att_department_add(label text) returns text language plpgsql security definer set search_path=public,pg_temp as $$ declare clean text=btrim(label); existing text; begin
if not att_is_admin() then raise exception 'Administrator required';end if;
if clean is null or length(clean) not between 1 and 80 then raise exception 'Enter a department of 1–80 characters';end if;
perform pg_advisory_xact_lock(825510);select name into existing from att_departments where lower(name)=lower(clean);if found then return existing;end if;
insert into att_departments(name) values(clean);return clean;end $$;
create function loop_directory() returns table(id uuid,employee_id text,name text,job_role text,photo text,department text) language sql stable security definer set search_path=public,pg_temp as $$ select p.id,p.employee_id,p.name,p.job_role,p.photo,p.department from att_profiles p where p.active and att_is_active() order by p.name limit 1000 $$;
alter table ws_messages add column attachments jsonb not null default '[]' check(jsonb_typeof(attachments)='array' and jsonb_array_length(attachments)<=5);
create table loop_receipts(message_id uuid not null references ws_messages(id) on delete cascade,user_id uuid not null references att_profiles(id),delivered_at timestamptz not null default now(),read_at timestamptz,primary key(message_id,user_id));
alter table loop_receipts enable row level security;
grant select on loop_receipts to authenticated;
create policy receipt_read on loop_receipts for select to authenticated using(exists(select 1 from ws_messages m where m.id=message_id and ws_room_allowed(m.room)));
create function loop_ack(ids uuid[], seen boolean default false) returns void language plpgsql security definer set search_path=public,pg_temp as $$ begin
if not att_is_active() then raise exception 'Sign in required';end if;
if cardinality(ids)>1000 then raise exception 'Too many messages';end if;
insert into loop_receipts(message_id,user_id,read_at) select m.id,auth.uid(),case when seen then now() end from ws_messages m where m.id=any(ids) and m.sender_id<>auth.uid() and ws_room_allowed(m.room) and (m.room not like 'dm:%' or auth.uid()::text=any(string_to_array(substring(m.room from 4),':')))
on conflict(message_id,user_id) do update set read_at=coalesce(loop_receipts.read_at,excluded.read_at) where loop_receipts.read_at is null and excluded.read_at is not null;
end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('loop-files','loop-files',false,20971520,array['image/jpeg','image/png','image/webp','image/gif','application/pdf','text/plain','text/csv','application/zip','application/x-zip-compressed','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation']) on conflict(id) do nothing;
create policy loop_upload on storage.objects for insert to authenticated with check(bucket_id='loop-files' and att_is_active() and (storage.foldername(name))[1]=auth.uid()::text);
create policy loop_file_read on storage.objects for select to authenticated using(bucket_id='loop-files' and att_is_active() and ((storage.foldername(name))[1]=auth.uid()::text or exists(select 1 from ws_messages m where ws_room_allowed(m.room) and exists(select 1 from jsonb_array_elements(m.attachments) a where a->>'path'=storage.objects.name))));
create policy loop_remove_unattached on storage.objects for delete to authenticated using(bucket_id='loop-files' and (storage.foldername(name))[1]=auth.uid()::text and not exists(select 1 from ws_messages m,jsonb_array_elements(m.attachments) a where a->>'path'=storage.objects.name));
create function loop_send(request_id uuid,room_value text,message_text text,files jsonb default '[]') returns void language plpgsql security definer set search_path=public,pg_temp as $$ declare f jsonb; existing ws_messages; clean text=btrim(coalesce(message_text,'')); begin
if not att_is_active() then raise exception 'Sign in required';end if;
if files is null or jsonb_typeof(files)<>'array' or jsonb_array_length(files)>5 then raise exception 'Up to five attachments allowed';end if;
if clean='' and jsonb_array_length(files)=0 then raise exception 'Enter a message or attach a file';end if;
perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
select * into existing from ws_messages where id=request_id;
if found then if existing.sender_id<>auth.uid() or existing.room<>room_value or existing.body<>coalesce(nullif(clean,''),'Attachment') or existing.attachments<>files then raise exception 'Request conflict';end if;return;end if;
for f in select * from jsonb_array_elements(files) loop
if jsonb_typeof(f)<>'object' or length(coalesce(f->>'name','')) not between 1 and 200 or f->>'path' not like auth.uid()::text||'/'||request_id::text||'/%' or not exists(select 1 from storage.objects o where o.bucket_id='loop-files' and o.name=f->>'path') then raise exception 'Invalid attachment';end if;
end loop;
perform ws_send_message(request_id,room_value,coalesce(nullif(clean,''),'Attachment'));
update ws_messages set attachments=files where id=request_id;
end $$;
revoke all on function att_department_add(text),loop_directory(),loop_ack(uuid[],boolean),loop_send(uuid,text,text,jsonb) from public,anon;
grant execute on function att_department_add(text),loop_directory(),loop_ack(uuid[],boolean),loop_send(uuid,text,text,jsonb) to authenticated;
alter publication supabase_realtime add table loop_receipts;
commit;
