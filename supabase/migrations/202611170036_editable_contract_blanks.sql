begin;
alter table public.pf_contract_templates
 add column header_text text not null default E'ESQUILIANO\nCONSULTING & BOOKKEEPING' check(length(header_text)<=4000),
 add column footer_text text not null default 'Mock contract - replace with your approved contract before final use.' check(length(footer_text)<=4000);
create function public.pf_template_save_v2(category uuid,data jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare words text; amount_fields int;
begin
 if not att_is_admin() then raise exception 'Administrator required'; end if;
 words:=coalesce(data->>'header_text','')||coalesce(data->>'body','')||coalesce(data->>'footer_text','');
 select count(distinct m[1]) into amount_fields from regexp_matches(words,'[{][{]([a-z][a-z0-9_]{0,63})[}][}]','g') m;
 if amount_fields>100 then raise exception 'Use no more than 100 distinct blanks'; end if;
 insert into pf_contract_templates(category_id,title,body,header_text,footer_text)
 values(category,btrim(data->>'title'),btrim(data->>'body'),coalesce(data->>'header_text',''),coalesce(data->>'footer_text',''))
 on conflict(category_id) do update set title=excluded.title,body=excluded.body,header_text=excluded.header_text,footer_text=excluded.footer_text,version=pf_contract_templates.version+1,updated_at=now();
 insert into att_audit(actor,action,target) values(auth.uid(),'portfolio_contract_template_saved',category::text);
end $$;
revoke all on function public.pf_template_save_v2(uuid,jsonb) from public,anon;
grant execute on function public.pf_template_save_v2(uuid,jsonb) to authenticated;
create or replace function public.pf_sale_save(data jsonb) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare item uuid:=(data->>'id')::uuid; category uuid:=(data->>'category_id')::uuid; existing pf_sales; tmpl pf_contract_templates; signer pf_signatures; person att_profiles; values_data jsonb; snapshot jsonb;
begin
 if item is null or category is null then raise exception 'Missing sale reference'; end if;
 if not pf_allowed(category,true) then raise exception 'You do not have permission to record sales in this category'; end if;
 if not exists(select 1 from pf_categories where id=category and not archived) then raise exception 'This category is not available for sales'; end if;
 perform pg_advisory_xact_lock(hashtextextended(item::text,0));
 select * into existing from pf_sales where id=item;
 if found then
  if existing.user_id<>auth.uid() or existing.category_id<>category then raise exception 'Sale reference unavailable'; end if;
  return item;
 end if;
 -- Legacy clients may finish an already-open sale without a contract.
 if data ? 'contract_fields' then
  if data->>'payment_method' is distinct from 'IFT' then raise exception 'Choose a payment method'; end if;
  if nullif(data->>'contract_date','') is null then raise exception 'Contract date is required'; end if;
  select * into tmpl from pf_contract_templates where category_id=category;
  if not found then raise exception 'Contract template is not available'; end if;
  if (data->>'template_version')::integer is distinct from tmpl.version then raise exception 'The contract template changed. Reopen the form to use the latest version.'; end if;
  values_data:=data->'contract_fields';
  if jsonb_typeof(values_data)<>'object' or (select count(*) from jsonb_object_keys(values_data))>100 or exists(select 1 from jsonb_each(values_data) where key !~ '^[a-z][a-z0-9_]{0,63}$' or key in('constructor','prototype') or jsonb_typeof(value)<>'string' or length(value#>>'{}')>3000) then raise exception 'Invalid contract fields'; end if;
  if coalesce(data->>'contract_format','')<>'document-v1' and (length(btrim(coalesce(values_data->>'scope','')))=0 or length(btrim(coalesce(values_data->>'deliverables','')))=0) then raise exception 'Complete the scope and deliverables'; end if;
  if coalesce((data->>'use_signature')::boolean,false) is not true then raise exception 'Confirm use of your profile signature'; end if;
  select * into signer from pf_signatures where user_id=auth.uid();
  if not found then raise exception 'Save your signature in Profile first'; end if;
  select * into person from att_profiles where id=auth.uid();
  snapshot:=jsonb_build_object('layout',coalesce(data->>'contract_format','form-v1'),'title',tmpl.title,'header_text',tmpl.header_text,'footer_text',tmpl.footer_text,'body',tmpl.body,'version',tmpl.version,'fields',values_data,'signer_name',person.name,'signer_employee_id',person.employee_id,'signature',signer.image,'signature_updated_at',signer.updated_at,'confirmed_at',now(),'bank',jsonb_build_object('name','Atlantic Bank','account_name','Jose Armando Esquiliano','account_number','211747902','account_type','Checking','currency','BZD'));
 end if;
 insert into pf_sales(id,category_id,user_id,customer_name,business,email,phone,service,requirements,amount,currency,sale_date,payment_method,contract_date,contract_snapshot)
 values(item,category,auth.uid(),btrim(data->>'customer_name'),btrim(coalesce(data->>'business','')),btrim(coalesce(data->>'email','')),btrim(coalesce(data->>'phone','')),coalesce((select name from pf_categories where id=category),btrim(data->>'service')),coalesce(values_data->>'scope',data->>'requirements',''),(data->>'amount')::numeric,data->>'currency',(data->>'sale_date')::date,data->>'payment_method',(data->>'contract_date')::date,snapshot);
 insert into att_audit(actor,action,target) values(auth.uid(),'portfolio_sale_recorded',item::text);
 return item;
end $$;
revoke all on function public.pf_sale_save(jsonb) from public,anon;
grant execute on function public.pf_sale_save(jsonb) to authenticated;


commit;

