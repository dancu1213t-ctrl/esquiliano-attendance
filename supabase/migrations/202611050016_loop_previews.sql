begin;
create function public.loop_conversations() returns table(room text,last_message jsonb,unread_count bigint,receipt_rows jsonb) language sql stable security definer set search_path=public,pg_temp as $$
with permitted as (select m.* from ws_messages m where att_is_active() and ws_room_allowed(m.room) and (m.room not like 'dm:%' or auth.uid()::text=any(string_to_array(substring(m.room from 4),':')))), latest as (select distinct on(m.room) m.* from permitted m order by m.room,m.created_at desc,m.id desc), counts as (select m.room,count(*) as unread from permitted m where m.sender_id<>auth.uid() and not exists(select 1 from loop_receipts r where r.message_id=m.id and r.user_id=auth.uid() and r.read_at is not null) group by m.room)
select l.room,to_jsonb(l),coalesce(c.unread,0),coalesce((select jsonb_agg(to_jsonb(r)) from loop_receipts r where r.message_id=l.id),'[]'::jsonb) from latest l left join counts c on c.room=l.room order by l.created_at desc;
$$;
revoke all on function loop_conversations() from public,anon;
grant execute on function loop_conversations() to authenticated;
create function public.loop_read_through(room_value text,last_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$ declare cutoff ws_messages; begin
if not ws_room_allowed(room_value) or (room_value like 'dm:%' and auth.uid()::text<>all(string_to_array(substring(room_value from 4),':'))) then raise exception 'Conversation access denied';end if;
select * into cutoff from ws_messages m where m.id=last_id and m.room=room_value;if not found then raise exception 'Message not found';end if;
insert into loop_receipts(message_id,user_id,read_at) select m.id,auth.uid(),now() from ws_messages m where m.room=room_value and m.sender_id<>auth.uid() and (m.created_at,m.id)<=(cutoff.created_at,cutoff.id)
on conflict(message_id,user_id) do update set read_at=coalesce(loop_receipts.read_at,excluded.read_at) where loop_receipts.read_at is null;
end $$;
revoke all on function loop_read_through(text,uuid) from public,anon;
grant execute on function loop_read_through(text,uuid) to authenticated;
commit;
