begin;
create table public.att_music_connections(
 user_id uuid primary key references public.att_profiles(id) on delete cascade,
 token_hash text not null unique,
 enabled boolean not null default true,
 video_id text,
 title text not null default '',
 updated_at timestamptz
);
alter table public.att_music_connections enable row level security;
revoke all on public.att_music_connections from public,anon,authenticated;
create function public.att_music_connect() returns text
language plpgsql security definer set search_path=public,pg_temp as $$
declare secret text:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
begin
 if not att_is_active() then raise exception 'Sign in required'; end if;
 insert into att_music_connections(user_id,token_hash,enabled)
 values(auth.uid(),encode(sha256(convert_to(secret,'UTF8')),'hex'),true)
 on conflict(user_id) do update set token_hash=excluded.token_hash,enabled=true,video_id=null,title='',updated_at=null;
 return secret;
end $$;
create function public.att_music_disconnect() returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 delete from att_music_connections where user_id=auth.uid();
end $$;
create function public.att_music_publish(token_value text,video_value text default null,title_value text default '',playing boolean default false)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare connection att_music_connections; clocked boolean; latest record;
begin
 if token_value is null or length(token_value)<>64 then raise exception 'Connect the extension again'; end if;
 select * into connection from att_music_connections where token_hash=encode(sha256(convert_to(token_value,'UTF8')),'hex') for update;
 if connection.user_id is null or not connection.enabled then raise exception 'Connect the extension again'; end if;
 select e.action,e.happened_at into latest from att_events e where user_id=connection.user_id and happened_at<=now() order by happened_at desc,id desc limit 1;
 clocked:=coalesce(latest.action='IN',false) and exists(select 1 from att_profiles where id=connection.user_id and active);
 if not clocked or not coalesce(playing,false) then
   update att_music_connections set video_id=null,title='',updated_at=now() where user_id=connection.user_id;
 else
   if video_value is null or video_value !~ '^[a-zA-Z0-9_-]{11}$' or length(trim(coalesce(title_value,''))) not between 1 and 200 then raise exception 'Invalid video'; end if;
   update att_music_connections set video_id=video_value,title=trim(title_value),updated_at=now() where user_id=connection.user_id;
 end if;
 return jsonb_build_object('clocked_in',clocked,'accepted',clocked and coalesce(playing,false));
end $$;
create function public.att_music_snapshot() returns table(user_id uuid,video_id text,title text)
language sql stable security definer set search_path=public,pg_temp as $$
 select m.user_id,m.video_id,m.title from att_music_connections m
 join att_profiles p on p.id=m.user_id and p.active
 cross join lateral(select e.action,e.happened_at from att_events e where e.user_id=m.user_id and e.happened_at<=now() order by e.happened_at desc,e.id desc limit 1) latest
 where att_is_active() and m.enabled and m.video_id is not null and latest.action='IN'
 and m.updated_at>=latest.happened_at and m.updated_at>=now()-interval '45 seconds'
$$;
revoke all on function public.att_music_connect(),public.att_music_disconnect(),public.att_music_publish(text,text,text,boolean),public.att_music_snapshot() from public,anon,authenticated;
grant execute on function public.att_music_connect(),public.att_music_disconnect(),public.att_music_snapshot() to authenticated;
grant execute on function public.att_music_publish(text,text,text,boolean) to anon,authenticated;
commit;
