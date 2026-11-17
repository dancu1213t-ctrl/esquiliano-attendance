begin;
create table public.pf_signatures (
 user_id uuid primary key references public.att_profiles(id),
 image text not null check(length(image)<=250000 and image ~ '^data:image/png;base64,[A-Za-z0-9+/=]+$'),
 updated_at timestamptz not null default now()
);
alter table public.pf_signatures enable row level security;
create policy pf_signature_own on public.pf_signatures for select to authenticated using(user_id=auth.uid() and att_is_active());
revoke all on public.pf_signatures from public,anon,authenticated;
grant select on public.pf_signatures to authenticated;
create function public.pf_signature_save(image_data text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not att_is_active() then raise exception 'Active account required'; end if;
 if image_data is null then delete from pf_signatures where user_id=auth.uid();
 else insert into pf_signatures(user_id,image) values(auth.uid(),image_data) on conflict(user_id) do update set image=excluded.image,updated_at=now(); end if;
end $$;
revoke all on function public.pf_signature_save(text) from public,anon;
grant execute on function public.pf_signature_save(text) to authenticated;

create table public.pf_contract_templates (
 category_id uuid primary key references public.pf_categories(id),
 title text not null check(length(title) between 1 and 150),
 body text not null check(length(body) between 1 and 12000),
 version integer not null default 1,
 updated_at timestamptz not null default now()
);
alter table public.pf_contract_templates enable row level security;
create policy pf_template_read on public.pf_contract_templates for select to authenticated using(pf_allowed(category_id));
revoke all on public.pf_contract_templates from public,anon,authenticated;
grant select on public.pf_contract_templates to authenticated;
insert into pf_contract_templates(category_id,title,body)
select id,name||' - mock service agreement',
 'MOCK TEMPLATE - FOR REVIEW ONLY. Replace this draft with the approved company contract before using it as a final agreement.'||E'\n\n'||
 case slug
 when 'marketing' then 'Marketing brief: describe the campaign, intended audience, platforms, creative work, approval process and delivery schedule below.'
 when 'accounting' then 'Accounting brief: describe the bookkeeping or accounting tasks, reporting period, records supplied by the customer and expected reports below.'
 when 'government' then 'Document brief: describe the requested government document service, documents supplied, responsible contacts and intended completion dates below. No outcome is guaranteed by this mock template.'
 when 'hr' then 'HR brief: describe the requested human resources support, employee records involved, responsibilities and delivery schedule below.'
 when 'intelligence' then 'Business intelligence brief: describe the business questions, data sources, analysis, reports or dashboards and review dates below.'
 when 'it' then 'IT brief: describe the technology service, systems involved, deliverables, testing and handover schedule below.'
 else 'Service brief: describe the requested work and agreed deliverables below.' end ||E'\n\n'||
 'Complete the scope, deliverables, timeline and payment arrangements. Any final terms, authorizations and customer acceptance must be supplied in the approved replacement contract.'
from pf_categories;
create function public.pf_template_save(category uuid,template_title text,template_body text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not att_is_admin() then raise exception 'Administrator required'; end if;
 insert into pf_contract_templates(category_id,title,body) values(category,btrim(template_title),btrim(template_body))
 on conflict(category_id) do update set title=excluded.title,body=excluded.body,version=pf_contract_templates.version+1,updated_at=now();
 insert into att_audit(actor,action,target) values(auth.uid(),'portfolio_contract_template_saved',category::text);
end $$;
revoke all on function public.pf_template_save(uuid,text,text) from public,anon;
grant execute on function public.pf_template_save(uuid,text,text) to authenticated;

alter table public.pf_sales
 add column payment_method text check(payment_method in('IFT')),
 add column contract_date date,
 add column contract_snapshot jsonb;
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
  if jsonb_typeof(values_data)<>'object' or exists(select 1 from jsonb_each(values_data) where key not in('scope','deliverables','timeline','payment_terms','notes') or jsonb_typeof(value)<>'string' or length(value#>>'{}')>3000) then raise exception 'Invalid contract fields'; end if;
  if length(btrim(coalesce(values_data->>'scope','')))=0 or length(btrim(coalesce(values_data->>'deliverables','')))=0 then raise exception 'Complete the scope and deliverables'; end if;
  if coalesce((data->>'use_signature')::boolean,false) is not true then raise exception 'Confirm use of your profile signature'; end if;
  select * into signer from pf_signatures where user_id=auth.uid();
  if not found then raise exception 'Save your signature in Profile first'; end if;
  select * into person from att_profiles where id=auth.uid();
  snapshot:=jsonb_build_object('title',tmpl.title,'body',tmpl.body,'version',tmpl.version,'fields',values_data,'signer_name',person.name,'signer_employee_id',person.employee_id,'signature',signer.image,'signature_updated_at',signer.updated_at,'confirmed_at',now(),'bank',jsonb_build_object('name','Atlantic Bank','account_name','Jose Armando Esquiliano','account_number','211747902','account_type','Checking','currency','BZD'));
 end if;
 insert into pf_sales(id,category_id,user_id,customer_name,business,email,phone,service,requirements,amount,currency,sale_date,payment_method,contract_date,contract_snapshot)
 values(item,category,auth.uid(),btrim(data->>'customer_name'),btrim(coalesce(data->>'business','')),btrim(coalesce(data->>'email','')),btrim(coalesce(data->>'phone','')),coalesce((select name from pf_categories where id=category),btrim(data->>'service')),coalesce(values_data->>'scope',data->>'requirements',''),(data->>'amount')::numeric,data->>'currency',(data->>'sale_date')::date,data->>'payment_method',(data->>'contract_date')::date,snapshot);
 insert into att_audit(actor,action,target) values(auth.uid(),'portfolio_sale_recorded',item::text);
 return item;
end $$;
revoke all on function public.pf_sale_save(jsonb) from public,anon;
grant execute on function public.pf_sale_save(jsonb) to authenticated;
commit;
