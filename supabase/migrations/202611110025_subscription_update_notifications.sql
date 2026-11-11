begin;
create function public.att_save_subscription(service uuid,expected_version integer,changes jsonb,notify_admins boolean default false)
returns public.att_subscriptions language plpgsql security definer set search_path=public,pg_temp as $$
declare saved att_subscriptions; secret uuid; message text;
begin
 if not att_can_manage_subscriptions() then raise exception 'DCU-002 access required'; end if;
 update att_subscriptions set
 active=(changes->>'active')::boolean,
 payment_status=changes->>'payment_status',
 due_date=nullif(changes->>'due_date','')::date,
 bill_path=changes->>'bill_path',
 receipt_path=changes->>'receipt_path',
 image_path=changes->>'image_path'
 where id=service and version=expected_version returning * into saved;
 if saved.id is null then raise exception 'This subscription changed. Close and reopen it before saving.'; end if;
 if notify_admins then
 message:=saved.name || ' · ' || case when saved.active then 'Active' else 'Inactive' end || ' · ' ||
 case saved.payment_status when 'paid' then 'Paid' when 'pending' then 'Payment pending' else 'Past due' end ||
 case when saved.due_date is null then '' else ' · Next bill due '||to_char(saved.due_date,'FMMonth FMDD, YYYY') end || '. Open Subscriptions to view bills and receipts.';
 insert into att_notifications(user_id,actor_id,title,body)
 select id,auth.uid(),'Subscription updated',message from att_profiles where active and role='admin' and id<>auth.uid();
 select token into secret from att_schedule_secret where id=1;
 if secret is not null then
 perform net.http_post(url:='https://hunptuwwaxvpigsnrsbl.supabase.co/functions/v1/attendance-admin',headers:='{"Content-Type":"application/json"}'::jsonb,body:=jsonb_build_object('action','bobby-dispatch','token',secret),timeout_milliseconds:=10000);
 end if;
 end if;
 return saved;
end $$;
revoke all on function public.att_save_subscription(uuid,integer,jsonb,boolean) from public,anon;
grant execute on function public.att_save_subscription(uuid,integer,jsonb,boolean) to authenticated;
commit;
