begin;
create table if not exists public.att_deleted_shifts(
 id uuid primary key default gen_random_uuid(),request_id uuid not null unique,user_id uuid not null references public.att_profiles(id),
 events jsonb not null,reason text not null,deleted_by uuid not null,deleted_at timestamptz not null default now(),restored_at timestamptz,restored_by uuid
);
alter table public.att_deleted_shifts enable row level security;
revoke all on public.att_deleted_shifts from public,anon,authenticated;
grant select on public.att_deleted_shifts to authenticated;
create policy att_deleted_shifts_admin on public.att_deleted_shifts for select to authenticated using(public.att_is_admin());
create or replace function public.att_delete_shift(request uuid,person uuid,in_id uuid,out_id uuid,in_version integer,out_version integer,reason text) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare a att_events;b att_events;next_event att_events;archived att_deleted_shifts;archive_id uuid;payload jsonb;
begin
 if not att_is_admin() then raise exception 'Administrator required';end if;
 if request is null or person is null or in_id is null or length(btrim(coalesce(reason,''))) not between 5 and 1000 then raise exception 'Select a shift and add a reason of at least 5 characters';end if;
 perform pg_advisory_xact_lock(hashtextextended(person::text,0));
 select * into archived from att_deleted_shifts where request_id=request;
 if found then
 if archived.deleted_by<>auth.uid() or archived.user_id<>person or archived.reason<>btrim(reason) or archived.events->0->>'id'<>in_id::text or (archived.events->1->>'id') is distinct from out_id::text then raise exception 'Deletion request conflict';end if;
 return archived.id;
 end if;
 select * into a from att_events where id=in_id and user_id=person and action='IN';
 if not found or a.row_version is distinct from in_version then raise exception 'This shift changed. Refresh before deleting';end if;
 select * into next_event from att_events where user_id=person and happened_at>a.happened_at order by happened_at limit 1;
 if out_id is null then
 if next_event.id is not null then raise exception 'This shift now has a clock out. Refresh before deleting';end if;
 payload=jsonb_build_array(to_jsonb(a));
 else
 select * into b from att_events where id=out_id and user_id=person and action='OUT';
 if not found or b.row_version is distinct from out_version or next_event.id is distinct from out_id then raise exception 'This shift changed. Refresh before deleting';end if;
 payload=jsonb_build_array(to_jsonb(a),to_jsonb(b));
 end if;
 insert into att_deleted_shifts(request_id,user_id,events,reason,deleted_by) values(request,person,payload,btrim(reason),auth.uid()) returning id into archive_id;
 delete from att_events where id=in_id or id=out_id;
 insert into att_audit(actor,action,target,details) values(auth.uid(),'SHIFT_DELETED',person::text,jsonb_build_object('archive_id',archive_id,'events',payload,'reason',btrim(reason)));
 insert into att_notifications(user_id,title,body,actor_id) values(person,'Attendance updated','An incorrect shift was removed by an administrator.',auth.uid());
 return archive_id;
end $$;
create or replace function public.att_restore_shift(archive_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare saved att_deleted_shifts;invalid boolean;
begin
 if not att_is_admin() then raise exception 'Administrator required';end if;
 select * into saved from att_deleted_shifts where id=archive_id;
 if not found then raise exception 'Deleted shift not found';end if;
 perform pg_advisory_xact_lock(hashtextextended(saved.user_id::text,0));
 select * into saved from att_deleted_shifts where id=archive_id for update;
 if saved.restored_at is not null then return;end if;
 with proposed as(select action,happened_at from att_events where user_id=saved.user_id union all select action,happened_at from jsonb_populate_recordset(null::att_events,saved.events)),ordered as(select *,lag(action) over(order by happened_at) previous_action,lag(happened_at) over(order by happened_at) previous_time,row_number() over(order by happened_at) row_num from proposed)
 select exists(select 1 from ordered where (row_num=1 and action<>'IN') or action=previous_action or happened_at=previous_time) into invalid;
 if invalid then raise exception 'Restoring this shift would overlap or conflict with current records. Correct those records first';end if;
 insert into att_events select * from jsonb_populate_recordset(null::att_events,saved.events);
 update att_events set row_version=row_version+1 where id in(select (e->>'id')::uuid from jsonb_array_elements(saved.events)e);
 update att_deleted_shifts set restored_at=now(),restored_by=auth.uid() where id=archive_id;
 insert into att_audit(actor,action,target,details) values(auth.uid(),'SHIFT_RESTORED',saved.user_id::text,jsonb_build_object('archive_id',archive_id));
 insert into att_notifications(user_id,title,body,actor_id) values(saved.user_id,'Attendance updated','A deleted shift was restored by an administrator.',auth.uid());
end $$;
revoke all on function public.att_delete_shift(uuid,uuid,uuid,uuid,integer,integer,text),public.att_restore_shift(uuid) from public,anon;
grant execute on function public.att_delete_shift(uuid,uuid,uuid,uuid,integer,integer,text),public.att_restore_shift(uuid) to authenticated;
commit;
