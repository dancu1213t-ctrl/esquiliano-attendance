-- Notify active teammates for shared conversations as well as direct messages.
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
 elsif room_value in ('announcements','general','operations') then
 select array_agg(id) into recipients from att_profiles where active and id<>auth.uid();
 end if;
 insert into att_notifications(user_id,title,body,actor_id) select unnest(recipients),left(case when room_value='announcements' then 'Team announcement' else 'Message from '||sender_name end,80),left(btrim(message_text),500),auth.uid();
 end;
$$;
