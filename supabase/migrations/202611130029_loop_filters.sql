begin;
create table public.loop_pins(
 user_id uuid not null references public.att_profiles(id) on delete cascade,
 room text not null,
 primary key(user_id,room)
);
alter table public.loop_pins enable row level security;
revoke all on public.loop_pins from public,anon,authenticated;
create function public.loop_set_pin(room_value text,pinned boolean) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not att_is_active() or not ws_room_allowed(room_value) or
 (room_value like 'dm:%' and auth.uid()::text<>all(string_to_array(substring(room_value from 4),':'))) then
 raise exception 'Conversation access denied'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,8142));
 if pinned then
  if (select count(*) from loop_pins where user_id=auth.uid())>=20 and not exists(select 1 from loop_pins where user_id=auth.uid() and room=room_value) then raise exception 'Pin up to 20 conversations'; end if;
  insert into loop_pins(user_id,room) values(auth.uid(),room_value) on conflict do nothing;
 else delete from loop_pins where user_id=auth.uid() and room=room_value;
 end if;
end $$;
create function public.loop_conversation_tools(query_value text default '') returns table(
 room text,pinned boolean,mentioned boolean,has_files boolean,search_match boolean,search_message jsonb,mention_message jsonb
) language sql stable security definer set search_path=public,pg_temp as $$
with me as(
 select p.employee_id,split_part(p.name,' ',1) first_name,
 (select count(*)=1 from att_profiles p2 where p2.active and lower(split_part(p2.name,' ',1))=lower(split_part(p.name,' ',1))) unique_first
 from att_profiles p where p.id=auth.uid() and p.active
), permitted as(
 select m.*,regexp_split_to_array(lower(m.body),'[^[:alnum:]_@-]+') tokens
 from ws_messages m where att_is_active() and ws_room_allowed(m.room)
 and (m.room not like 'dm:%' or auth.uid()::text=any(string_to_array(substring(m.room from 4),':')))
), enriched as(
 select m.*,
 (m.sender_id<>auth.uid() and (('@'||lower(me.employee_id))=any(m.tokens)
 or (me.unique_first and ('@'||lower(me.first_name))=any(m.tokens))
 or '@everyone'=any(m.tokens) or '@all'=any(m.tokens))) is_mention,
 (strpos(lower(m.body),lower(left(coalesce(query_value,''),160)))>0
 or exists(select 1 from jsonb_array_elements(m.attachments) a where strpos(lower(coalesce(a->>'name','')),lower(left(coalesce(query_value,''),160)))>0)) matches
 from permitted m cross join me
), rooms as(
 select distinct e.room from enriched e union select p.room from loop_pins p where p.user_id=auth.uid() and att_is_active() and ws_room_allowed(p.room)
)
select rooms.room,
 exists(select 1 from loop_pins p where p.user_id=auth.uid() and p.room=rooms.room),
 exists(select 1 from enriched e where e.room=rooms.room and e.is_mention),
 exists(select 1 from enriched e where e.room=rooms.room and jsonb_array_length(e.attachments)>0),
 exists(select 1 from enriched e where e.room=rooms.room and e.matches),
 (select to_jsonb(e)-'tokens'-'is_mention'-'matches' from enriched e where e.room=rooms.room and e.matches order by e.created_at desc,e.id desc limit 1),
 (select to_jsonb(e)-'tokens'-'is_mention'-'matches' from enriched e where e.room=rooms.room and e.is_mention order by e.created_at desc,e.id desc limit 1)
from rooms;
$$;
revoke all on function public.loop_set_pin(text,boolean),public.loop_conversation_tools(text) from public,anon;
grant execute on function public.loop_set_pin(text,boolean),public.loop_conversation_tools(text) to authenticated;
commit;
