begin;
update public.pf_contract_templates t set body=
 '1. PARTIES'||E'\n'||'This mock agreement is between Esquiliano Consulting & Bookkeeping and {{customer_name}}, representing {{business}}. Customer address: {{client_address}}.'||E'\n\n'||
 '2. SERVICE PROVIDED'||E'\n'||case c.slug
 when 'marketing' then 'Esquiliano will provide Marketing services for the customer. The engagement concerns creative production and promotional support as agreed in the approved service package.'
 when 'accounting' then 'Esquiliano will provide Accounting services for the customer. The engagement concerns the accounting and bookkeeping services agreed in the approved service package.'
 when 'government' then 'Esquiliano will provide Government Document services for the customer. The engagement concerns assistance with the document services agreed in the approved service package.'
 when 'hr' then 'Esquiliano will provide HR services for the customer. The engagement concerns the human resources support agreed in the approved service package.'
 when 'intelligence' then 'Esquiliano will provide Business Intelligence services for the customer. The engagement concerns the analysis and reporting services agreed in the approved service package.'
 when 'it' then 'Esquiliano will provide IT services for the customer. The engagement concerns the technology support agreed in the approved service package.'
 else 'Esquiliano will provide {{service}} services as agreed in the approved service package.' end||E'\n'||'Contract / project reference: {{reference}}.'||E'\n\n'||
 '3. SERVICE PERIOD'||E'\n'||'The anticipated service period begins on {{start_date}} and ends on {{end_date}}. Dates remain subject to the approved final agreement.'||E'\n\n'||
 '4. FEES & PAYMENT'||E'\n'||'The recorded charge is {{amount}}. Payment method: {{payment_method}}. Atlantic Bank, Jose Armando Esquiliano, checking account 211747902, Belize (BZD). The final payment conditions will be stated in the approved contract.'||E'\n\n'||
 '5. CONTACT & RECORD'||E'\n'||'Customer email: {{email}}. Phone: {{phone}}. Prepared by {{staff_name}}. Contract date: {{contract_date}}.'||E'\n\n'||
 'MOCK CONTRACT - FOR REVIEW ONLY. This document demonstrates the fillable layout. Replace it with the approved company contract and final terms before use as a final agreement.',
 version=t.version+1,updated_at=now()
from public.pf_categories c where c.id=t.category_id and t.version=1 and t.title like '%mock service agreement';

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
  if jsonb_typeof(values_data)<>'object' or exists(select 1 from jsonb_each(values_data) where key not in('scope','deliverables','timeline','payment_terms','notes','client_address','reference','start_date','end_date') or jsonb_typeof(value)<>'string' or length(value#>>'{}')>3000) then raise exception 'Invalid contract fields'; end if;
  if coalesce(data->>'contract_format','')<>'document-v1' and (length(btrim(coalesce(values_data->>'scope','')))=0 or length(btrim(coalesce(values_data->>'deliverables','')))=0) then raise exception 'Complete the scope and deliverables'; end if;
  if coalesce((data->>'use_signature')::boolean,false) is not true then raise exception 'Confirm use of your profile signature'; end if;
  select * into signer from pf_signatures where user_id=auth.uid();
  if not found then raise exception 'Save your signature in Profile first'; end if;
  select * into person from att_profiles where id=auth.uid();
  snapshot:=jsonb_build_object('layout',coalesce(data->>'contract_format','form-v1'),'title',tmpl.title,'body',tmpl.body,'version',tmpl.version,'fields',values_data,'signer_name',person.name,'signer_employee_id',person.employee_id,'signature',signer.image,'signature_updated_at',signer.updated_at,'confirmed_at',now(),'bank',jsonb_build_object('name','Atlantic Bank','account_name','Jose Armando Esquiliano','account_number','211747902','account_type','Checking','currency','BZD'));
 end if;
 insert into pf_sales(id,category_id,user_id,customer_name,business,email,phone,service,requirements,amount,currency,sale_date,payment_method,contract_date,contract_snapshot)
 values(item,category,auth.uid(),btrim(data->>'customer_name'),btrim(coalesce(data->>'business','')),btrim(coalesce(data->>'email','')),btrim(coalesce(data->>'phone','')),coalesce((select name from pf_categories where id=category),btrim(data->>'service')),coalesce(values_data->>'scope',data->>'requirements',''),(data->>'amount')::numeric,data->>'currency',(data->>'sale_date')::date,data->>'payment_method',(data->>'contract_date')::date,snapshot);
 insert into att_audit(actor,action,target) values(auth.uid(),'portfolio_sale_recorded',item::text);
 return item;
end $$;
revoke all on function public.pf_sale_save(jsonb) from public,anon;
grant execute on function public.pf_sale_save(jsonb) to authenticated;

commit;

