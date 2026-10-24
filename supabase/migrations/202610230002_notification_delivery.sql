begin;
alter table att_notifications add column if not exists actor_id uuid default auth.uid();
alter table att_notifications add column if not exists push_sent_at timestamptz;
create or replace function public.att_keep_admin() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform pg_advisory_xact_lock(78439211);
 if old.active and old.role='admin' and (not new.active or new.role<>'admin') and not exists(select 1 from att_profiles where active and role='admin' and id<>old.id) then raise exception 'Keep at least one active administrator';end if;
 return new;
end $$;
create trigger att_keep_admin before update on att_profiles for each row execute function att_keep_admin();
commit;
