begin;
alter table ws_messages add column is_forwarded boolean not null default false;
create table loop_hearts(message_id uuid not null references ws_messages(id) on delete cascade,user_id uuid not null references att_profiles(id),created_at timestamptz not null default now(),primary key(message_id,user_id));
alter table loop_hearts enable row level security;
grant select on loop_hearts to authenticated;
create policy heart_read on loop_hearts for select to authenticated using(exists(select 1 from ws_messages m where m.id=message_id and ws_room_allowed(m.room)));
create function loop_heart(mid uuid,liked boolean) returns void language plpgsql security definer set search_path=public,pg_temp as $$ declare m ws_messages;begin
select * into m from ws_messages where id=mid;if not found or not ws_room_allowed(m.room) or (m.room like 'dm:%' and auth.uid()::text<>all(string_to_array(substring(m.room from 4),':'))) then raise exception 'Message access denied';end if;
if liked is null then raise exception 'Choose like or unlike';end if;
if liked then insert into loop_hearts(message_id,user_id) values(mid,auth.uid()) on conflict do nothing;else delete from loop_hearts where message_id=mid and user_id=auth.uid();end if;end $$;
create table loop_forward_requests(request_id uuid primary key,actor uuid not null references att_profiles(id),source_id uuid not null references ws_messages(id),recipients uuid[] not null,result jsonb not null,created_at timestamptz not null default now());
alter table loop_forward_requests enable row level security;
revoke all on loop_forward_requests from anon,authenticated;
create function loop_forward(request uuid,source uuid,targets uuid[]) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ declare m ws_messages;old loop_forward_requests;ordered uuid[];target uuid;new_id uuid;room_name text;sender_name text;sent jsonb='[]';begin
if not att_is_active() then raise exception 'Sign in required';end if;
if request is null or source is null or cardinality(targets) not between 1 and 20 or targets is null or array_position(targets,null) is not null then raise exception 'Choose up to 20 workers';end if;
select array_agg(distinct x order by x) into ordered from unnest(targets) x;
perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
select * into old from loop_forward_requests where request_id=request;if found then if old.actor<>auth.uid() or old.source_id<>source or old.recipients<>ordered then raise exception 'Request conflict';end if;return old.result;end if;
select * into m from ws_messages where id=source;if not found or not ws_room_allowed(m.room) or (m.room like 'dm:%' and auth.uid()::text<>all(string_to_array(substring(m.room from 4),':'))) then raise exception 'Message access denied';end if;
if auth.uid()=any(ordered) or (select count(*) from att_profiles p where p.active and p.id=any(ordered))<>cardinality(ordered) then raise exception 'Choose active workers other than yourself';end if;
if (select count(*) from loop_forward_requests where actor=auth.uid() and created_at>now()-interval '1 minute')>=10 then raise exception 'Wait a moment before forwarding again';end if;
select name into sender_name from att_profiles where id=auth.uid();
foreach target in array ordered loop
room_name='dm:'||least(auth.uid()::text,target::text)||':'||greatest(auth.uid()::text,target::text);new_id=gen_random_uuid();
insert into ws_messages(id,room,sender_id,body,attachments,is_forwarded) values(new_id,room_name,auth.uid(),m.body,m.attachments,true);
insert into att_notifications(user_id,actor_id,title,body) values(target,auth.uid(),left('Message from '||sender_name,80),left(case when m.body='Attachment' then 'Forwarded attachment' else m.body end,500));
sent=sent||jsonb_build_array(new_id);
end loop;
insert into loop_forward_requests(request_id,actor,source_id,recipients,result) values(request,auth.uid(),source,ordered,sent);return sent;end $$;
revoke all on function loop_heart(uuid,boolean),loop_forward(uuid,uuid,uuid[]) from public,anon;
grant execute on function loop_heart(uuid,boolean),loop_forward(uuid,uuid,uuid[]) to authenticated;
alter publication supabase_realtime add table loop_hearts;
commit;
