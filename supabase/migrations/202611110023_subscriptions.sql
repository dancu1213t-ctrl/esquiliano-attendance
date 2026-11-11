begin;
create function public.att_can_manage_subscriptions() returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from att_profiles where id=auth.uid() and active and upper(employee_id)='DCU-002')
$$;
create function public.att_can_view_subscriptions() returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select att_is_admin() or att_can_manage_subscriptions()
$$;
revoke all on function public.att_can_manage_subscriptions(),public.att_can_view_subscriptions() from public,anon;
grant execute on function public.att_can_manage_subscriptions(),public.att_can_view_subscriptions() to authenticated;
create table public.att_subscriptions(
  id uuid primary key default gen_random_uuid(),
  name text not null unique check(length(name) between 1 and 80),
  active boolean not null default true,
  payment_status text not null check(payment_status in ('paid','pending','past_due')),
  due_date date,
  bill_path text,
  receipt_path text,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.att_subscriptions enable row level security;
revoke all on public.att_subscriptions from public,anon,authenticated;
grant select,update on public.att_subscriptions to authenticated;
create policy subscriptions_view on public.att_subscriptions for select to authenticated using(att_can_view_subscriptions());
create policy subscriptions_manage on public.att_subscriptions for update to authenticated
using(att_can_manage_subscriptions()) with check(att_can_manage_subscriptions());
create function public.att_subscription_version() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  new.version:=old.version+1;
  new.updated_at:=now();
  return new;
end $$;
create trigger att_subscription_version before update on public.att_subscriptions
for each row execute function public.att_subscription_version();
insert into public.att_subscriptions(name,payment_status) values('Supabase','pending'),('CapCut','paid');
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('subscription-documents','subscription-documents',false,5242880,array['image/jpeg','image/png','image/webp']);
create policy subscription_documents_view on storage.objects for select to authenticated
using(bucket_id='subscription-documents' and public.att_can_view_subscriptions());
create policy subscription_documents_insert on storage.objects for insert to authenticated
with check(bucket_id='subscription-documents' and public.att_can_manage_subscriptions());
create policy subscription_documents_delete on storage.objects for delete to authenticated
using(bucket_id='subscription-documents' and public.att_can_manage_subscriptions());
commit;
