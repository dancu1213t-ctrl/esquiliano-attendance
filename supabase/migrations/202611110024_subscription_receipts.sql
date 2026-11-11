begin;
alter table public.att_subscriptions add column image_path text;
create table public.att_subscription_receipts(
 id uuid primary key default gen_random_uuid(),
 subscription_id uuid not null references public.att_subscriptions(id),
 submitted_by uuid not null references public.att_profiles(id),
 image_path text not null unique,
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 created_at timestamptz not null default now(),
 reviewed_at timestamptz
);
alter table public.att_subscription_receipts enable row level security;
revoke all on public.att_subscription_receipts from public,anon,authenticated;
grant select on public.att_subscription_receipts to authenticated;
create policy subscription_receipts_view on public.att_subscription_receipts for select to authenticated using(public.att_can_view_subscriptions());
create policy subscription_receipt_upload on storage.objects for insert to authenticated
with check(bucket_id='subscription-documents' and public.att_is_admin() and (storage.foldername(name))[1]=auth.uid()::text);
create policy subscription_receipt_cleanup on storage.objects for delete to authenticated
using(bucket_id='subscription-documents' and public.att_is_admin() and (storage.foldername(name))[1]=auth.uid()::text
 and not exists(select 1 from public.att_subscription_receipts where image_path=name));
create function public.att_submit_subscription_receipt(service uuid,path text) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare receipt uuid; service_name text; secret uuid;
begin
 if not att_is_admin() then raise exception 'Administrator sign-in required'; end if;
 select name into service_name from att_subscriptions where id=service;
 if service_name is null then raise exception 'Subscription not found'; end if;
 if split_part(path,'/',1)<>auth.uid()::text or not exists(select 1 from storage.objects where bucket_id='subscription-documents' and name=path) then raise exception 'Upload the receipt first'; end if;
 insert into att_subscription_receipts(subscription_id,submitted_by,image_path) values(service,auth.uid(),path)
 on conflict(image_path) do nothing returning id into receipt;
 if receipt is null then
   select id into receipt from att_subscription_receipts where image_path=path and submitted_by=auth.uid() and subscription_id=service;
   if receipt is null then raise exception 'Receipt already submitted'; end if;
   return receipt;
 end if;
 insert into att_notifications(user_id,actor_id,title,body)
 select p.id,auth.uid(),'Receipt awaiting approval',service_name || ' · ' || coalesce((select name from att_profiles where id=auth.uid()),'Administrator') || ' submitted a payment receipt. Open Subscriptions to review.'
 from att_profiles p where p.active and upper(p.employee_id)='DCU-002';
 select token into secret from att_schedule_secret where id=1;
 if secret is not null then
 perform net.http_post(url:='https://hunptuwwaxvpigsnrsbl.supabase.co/functions/v1/attendance-admin',headers:='{"Content-Type":"application/json"}'::jsonb,body:=jsonb_build_object('action','bobby-dispatch','token',secret),timeout_milliseconds:=10000);
 end if;
 return receipt;
end $$;
create function public.att_review_subscription_receipt(receipt uuid,decision text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare entry att_subscription_receipts; secret uuid; service_name text;
begin
 if not att_can_manage_subscriptions() then raise exception 'DCU-002 access required'; end if;
 if decision not in ('approved','rejected') or decision is null then raise exception 'Choose approve or reject'; end if;
 select * into entry from att_subscription_receipts where id=receipt for update;
 if entry.id is null then raise exception 'Receipt not found'; end if;
 if entry.status<>'pending' then raise exception 'This receipt has already been reviewed'; end if;
 update att_subscription_receipts set status=decision,reviewed_at=now() where id=receipt;
 if decision='approved' then update att_subscriptions set receipt_path=entry.image_path where id=entry.subscription_id; end if;
 select name into service_name from att_subscriptions where id=entry.subscription_id;
 insert into att_notifications(user_id,actor_id,title,body)
 values(entry.submitted_by,auth.uid(),'Receipt '||decision,service_name || ' · Your payment receipt was ' || decision || '.');
 select token into secret from att_schedule_secret where id=1;
 if secret is not null then
 perform net.http_post(url:='https://hunptuwwaxvpigsnrsbl.supabase.co/functions/v1/attendance-admin',headers:='{"Content-Type":"application/json"}'::jsonb,body:=jsonb_build_object('action','bobby-dispatch','token',secret),timeout_milliseconds:=10000);
 end if;
end $$;
revoke all on function public.att_submit_subscription_receipt(uuid,text),public.att_review_subscription_receipt(uuid,text) from public,anon;
grant execute on function public.att_submit_subscription_receipt(uuid,text),public.att_review_subscription_receipt(uuid,text) to authenticated;
commit;
