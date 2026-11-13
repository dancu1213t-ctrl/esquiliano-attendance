begin;
create table public.loop_calls(
 id uuid primary key, caller_id uuid not null references att_profiles(id), callee_id uuid not null references att_profiles(id),
 video boolean not null default false, state text not null default 'ringing' check(state in ('ringing','accepted','connected','ended','declined','missed','failed')),
 caller_device uuid not null, callee_device uuid, created_at timestamptz not null default now(), accepted_at timestamptz, connected_at timestamptz, ended_at timestamptz,
 caller_seen timestamptz not null default now(), callee_seen timestamptz, check(caller_id<>callee_id)
);
create index loop_calls_participants on loop_calls(caller_id,callee_id,created_at desc);
alter table loop_calls enable row level security;
revoke all on loop_calls from public,anon,authenticated;
create table public.loop_call_signals(id bigint generated always as identity primary key,call_id uuid not null references loop_calls(id) on delete cascade,sender uuid not null,kind text not null check(kind in ('offer','answer','ice')),payload jsonb not null,created_at timestamptz not null default now());
create index loop_call_signals_call on loop_call_signals(call_id,id);
alter table loop_call_signals enable row level security;
revoke all on loop_call_signals from public,anon,authenticated;
create function public.loop_call_expire() returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update loop_calls set state=case when state='ringing' then 'missed' else 'failed' end,ended_at=now()
 where auth.uid() in(caller_id,callee_id) and ((state='ringing' and created_at<now()-interval '45 seconds') or (state in('accepted','connected') and (caller_seen<now()-interval '75 seconds' or coalesce(callee_seen,accepted_at)<now()-interval '75 seconds')));
end $$;
revoke all on function loop_call_expire() from public,anon,authenticated;
create function public.loop_call_start(target uuid,video_call boolean,device uuid,request_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare saved loop_calls; caller_name text;
begin
 if not exists(select 1 from att_profiles where id=auth.uid() and active) then raise exception 'Sign in required';end if;
 if target=auth.uid() or not exists(select 1 from att_profiles where id=target and active) or device is null or request_id is null then raise exception 'Choose an active colleague';end if;
 perform pg_advisory_xact_lock(hashtextextended(least(auth.uid()::text,target::text),6301));
 perform pg_advisory_xact_lock(hashtextextended(greatest(auth.uid()::text,target::text),6301));
 perform loop_call_expire();
 update loop_calls set state=case when state='ringing' then 'missed' else 'failed' end,ended_at=now() where target in(caller_id,callee_id) and ((state='ringing' and created_at<now()-interval '45 seconds') or(state in('accepted','connected') and(caller_seen<now()-interval '75 seconds' or coalesce(callee_seen,accepted_at)<now()-interval '75 seconds')));
 select * into saved from loop_calls where id=request_id and caller_id=auth.uid() and caller_device=device;
 if found then return to_jsonb(saved);end if;
 if exists(select 1 from loop_calls where state in('ringing','accepted','connected') and (auth.uid() in(caller_id,callee_id) or target in(caller_id,callee_id))) then raise exception 'You or this colleague are already in a call';end if;
 if (select count(*) from loop_calls where caller_id=auth.uid() and created_at>now()-interval '1 minute')>=5 then raise exception 'Please wait before calling again';end if;
 insert into loop_calls(id,caller_id,callee_id,video,caller_device) values(request_id,auth.uid(),target,video_call,device) returning * into saved;
 select name into caller_name from att_profiles where id=auth.uid();
 insert into att_notifications(user_id,actor_id,title,body) values(target,auth.uid(),case when video_call then 'Incoming video call' else 'Incoming voice call' end,caller_name||' is calling you on Loop. Open Loop to answer.');
 return to_jsonb(saved);
end $$;
create function public.loop_call_action(call_id uuid,device uuid,action text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare saved loop_calls;
begin
 if not exists(select 1 from att_profiles where id=auth.uid() and active) or device is null then raise exception 'Sign in required';end if;
 perform loop_call_expire();
 select * into saved from loop_calls where id=call_id and auth.uid() in(caller_id,callee_id) for update;
 if not found then raise exception 'Call not found';end if;
 if action='accept' then
  if saved.callee_id<>auth.uid() or saved.state<>'ringing' then raise exception 'This call is no longer available';end if;
  update loop_calls set state='accepted',callee_device=device,accepted_at=now(),callee_seen=now() where id=call_id returning * into saved;
 elsif action='decline' and saved.state='ringing' and saved.callee_id=auth.uid() then
  update loop_calls set state='declined',ended_at=now() where id=call_id returning * into saved;
 else
  if not ((saved.caller_id=auth.uid() and saved.caller_device=device) or(saved.callee_id=auth.uid() and saved.callee_device=device)) then raise exception 'This call is on another device';end if;
  if action not in('heartbeat','connected','end','fail') then raise exception 'Invalid call action';end if;
  if saved.state in('ringing','accepted','connected') then
   update loop_calls set caller_seen=case when caller_id=auth.uid() then now() else caller_seen end,callee_seen=case when callee_id=auth.uid() then now() else callee_seen end,
   state=case when action='end' then 'ended' when action='fail' then 'failed' when action='connected' and state='accepted' then 'connected' else state end,
   connected_at=case when action='connected' and state='accepted' then coalesce(connected_at,now()) else connected_at end,
   ended_at=case when action in('end','fail') then now() else ended_at end where id=call_id returning * into saved;
  end if;
 end if;
 return to_jsonb(saved);
end $$;
create function public.loop_call_signal(call_id uuid,device uuid,signal_kind text,signal_data jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare saved loop_calls;
begin
 if not exists(select 1 from att_profiles where id=auth.uid() and active) then raise exception 'Sign in required';end if;
 select * into saved from loop_calls where id=call_id for update;
 if not found or saved.state not in('accepted','connected') or not((saved.caller_id=auth.uid() and saved.caller_device=device) or(saved.callee_id=auth.uid() and saved.callee_device=device)) then raise exception 'Call unavailable';end if;
 if signal_kind not in('offer','answer','ice') or signal_data is null or length(signal_data::text)>40000 then raise exception 'Invalid signal';end if;
 if signal_kind='offer' and saved.caller_id<>auth.uid() or signal_kind='answer' and saved.callee_id<>auth.uid() then raise exception 'Invalid signal sender';end if;
 if (select count(*) from loop_call_signals where loop_call_signals.call_id=saved.id)>500 then raise exception 'Call signal limit reached';end if;
 if signal_kind in('offer','answer') and exists(select 1 from loop_call_signals s where s.call_id=saved.id and s.kind=signal_kind) then return;end if;
 insert into loop_call_signals(call_id,sender,kind,payload) values(saved.id,auth.uid(),signal_kind,signal_data);
end $$;
create function public.loop_call_poll(device uuid,after_signal bigint default 0) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare ongoing loop_calls;
begin
 if not exists(select 1 from att_profiles where id=auth.uid() and active) then raise exception 'Sign in required';end if;
 perform loop_call_expire();
 select * into ongoing from loop_calls c where auth.uid() in(c.caller_id,c.callee_id) and c.state in('ringing','accepted','connected') order by c.created_at desc limit 1;
 return jsonb_build_object('active',case when ongoing.id is not null then to_jsonb(ongoing) else null end,
 'signals',coalesce((select jsonb_agg(to_jsonb(s) order by s.id) from loop_call_signals s where s.call_id=ongoing.id and s.sender<>auth.uid() and s.id>after_signal and ((ongoing.caller_id=auth.uid() and ongoing.caller_device=device)or(ongoing.callee_id=auth.uid() and ongoing.callee_device=device))),'[]'::jsonb),
 'history',coalesce((select jsonb_agg(x) from(select c.id,c.caller_id,c.callee_id,c.video,c.state,c.created_at,c.connected_at,c.ended_at,p.name as peer_name from loop_calls c join att_profiles p on p.id=case when c.caller_id=auth.uid() then c.callee_id else c.caller_id end where auth.uid() in(c.caller_id,c.callee_id) order by c.created_at desc limit 30)x),'[]'::jsonb));
end $$;
revoke all on function loop_call_start(uuid,boolean,uuid,uuid),loop_call_action(uuid,uuid,text),loop_call_signal(uuid,uuid,text,jsonb),loop_call_poll(uuid,bigint) from public,anon;
grant execute on function loop_call_start(uuid,boolean,uuid,uuid),loop_call_action(uuid,uuid,text),loop_call_signal(uuid,uuid,text,jsonb),loop_call_poll(uuid,bigint) to authenticated;
commit;
