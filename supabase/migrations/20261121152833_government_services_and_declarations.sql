begin;
alter table public.pf_sales add column service_details jsonb;
create function public.pf_government_details(input jsonb) returns jsonb
language plpgsql stable set search_path=public,pg_temp as $$
declare applicant jsonb; clean jsonb; applicants jsonb:='[]'; field_key text; parent text; count_people int; identity_person text; declarations int:=0; unit_price numeric; quoted numeric;
begin
 if jsonb_typeof(input) is distinct from 'object' or input->>'document_type' not in ('birth_certificate','death_certificate','marriage_certificate','birth_registration','death_registration','marriage_registration','late_registration','apostille','translation','visa_application') or nullif(input->>'document_type','') is null or input->>'version' is distinct from '2' then raise exception 'Choose a Government Documents service and complete the applicant details'; end if;
 if jsonb_typeof(input->'applicants') is distinct from 'array' then raise exception 'Add the applicants'; end if;
 count_people:=jsonb_array_length(input->'applicants');
 if count_people not between 1 and 3 or (input->>'certificate_count')::int is distinct from count_people then raise exception 'Choose one, two or three requests'; end if;
 for applicant in select value from jsonb_array_elements(input->'applicants') loop
  if jsonb_typeof(applicant) is distinct from 'object' then raise exception 'Invalid applicant details'; end if;
  if exists(select 1 from jsonb_each(applicant) where key not in('full_name','date_of_birth','place_of_birth','phone','address','town','marital_status','mother_name','mother_status','mother_reason','father_name','father_status','father_reason','documents_status','documents_reason','applicant_id_status','applicant_id_reference','applicant_id_reason','mother_id_status','mother_id_reference','mother_id_reason','father_id_status','father_id_reference','father_id_reason') or jsonb_typeof(value)<>'string') then raise exception 'Invalid applicant fields'; end if;
  clean:='{}';
  foreach field_key in array array['full_name','date_of_birth','place_of_birth','phone','address','town','marital_status','mother_name','mother_status','mother_reason','father_name','father_status','father_reason','documents_status','documents_reason','applicant_id_status','applicant_id_reference','applicant_id_reason','mother_id_status','mother_id_reference','mother_id_reason','father_id_status','father_id_reference','father_id_reason'] loop
   clean:=clean||jsonb_build_object(field_key,btrim(coalesce(applicant->>field_key,'')));
   if length(clean->>field_key)>(case when field_key like '%reason' then 1000 when field_key='address' then 300 when field_key='phone' then 60 when field_key='town' then 100 else 150 end) then raise exception 'An applicant field is too long'; end if;
  end loop;
  if clean->>'full_name'='' or clean->>'address'='' or clean->>'town'='' then raise exception 'Complete each applicant full name, address and town'; end if;
  if clean->>'marital_status' not in('single','married','divorced','widowed','separated','not_applicable','not_provided') then raise exception 'Choose each applicant marital status'; end if;
  if clean->>'date_of_birth'<>'' then
   if clean->>'date_of_birth' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Enter a valid date of birth'; end if;
   if (clean->>'date_of_birth')::date>(now() at time zone 'America/Belize')::date then raise exception 'Date of birth cannot be in the future'; end if;
  end if;
  foreach parent in array array['mother','father'] loop
   if clean->>(parent||'_status') not in('available','deceased','unavailable','unknown') then raise exception 'Choose the parent information status'; end if;
   if clean->>(parent||'_status')='available' then
    if clean->>(parent||'_name')='' then raise exception 'Enter the parent name or choose an unavailable information status'; end if;
    clean:=jsonb_set(clean,array[parent||'_reason'],'""');
   elsif clean->>(parent||'_reason')='' then raise exception 'Explain why the parent information is unavailable'; end if;
  end loop;
  if clean->>'documents_status' not in('available','unavailable') then raise exception 'Choose the supporting document status'; end if;
  if clean->>'documents_status'='unavailable' and clean->>'documents_reason'='' then raise exception 'Explain why supporting documents are unavailable'; end if;
  if clean->>'documents_status'='available' then clean:=jsonb_set(clean,'{documents_reason}','""'); end if;
  foreach identity_person in array array['applicant','mother','father'] loop
   if clean->>(identity_person||'_id_status') not in('available','missing') then raise exception 'Choose ID availability for the applicant and both parents'; end if;
   if clean->>(identity_person||'_id_status')='missing' then
    if clean->>(identity_person||'_id_reason')='' then raise exception 'Explain why each unavailable ID needs a declaration'; end if;
    declarations:=declarations+1;
    clean:=jsonb_set(clean,array[identity_person||'_id_reference'],'""');
   else
    if clean->>(identity_person||'_id_reference')='' then raise exception 'Enter the available ID number or reference'; end if;
    clean:=jsonb_set(clean,array[identity_person||'_id_reason'],'""');
   end if;
  end loop;
  applicants:=applicants||jsonb_build_array(clean);
 end loop;
 unit_price:=case input->>'document_type'
 when 'birth_certificate' then 130 when 'death_certificate' then 130 when 'marriage_certificate' then 150
 when 'birth_registration' then 130 when 'death_registration' then 130 when 'marriage_registration' then 150
 when 'visa_application' then 100 else null end;
 if unit_price is null then
  if coalesce(input->>'quote','') !~ '^[0-9]{1,9}(\.[0-9]{1,2})?$' then raise exception 'Enter the agreed quote in BZD'; end if;
  quoted:=(input->>'quote')::numeric;
  if quoted<=0 or quoted>999999999.99 then raise exception 'Enter a valid agreed quote'; end if;
  unit_price:=quoted;
 end if;
 return jsonb_build_object('version',2,'document_type',input->>'document_type','certificate_count',count_people,'applicants',applicants,'quote',quoted,
 'pricing',jsonb_build_object('currency','BZD','unit_price',unit_price,'declaration_count',declarations,'declaration_unit_price',20,'total',unit_price*count_people+declarations*20));
end; $$;
revoke all on function public.pf_government_details(jsonb) from public,anon;
grant execute on function public.pf_government_details(jsonb) to authenticated;
create or replace function public.pf_sale_save(data jsonb) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare item uuid:=(data->>'id')::uuid; category uuid:=(data->>'category_id')::uuid; existing pf_sales; tmpl pf_contract_templates; signer pf_signatures; person att_profiles; values_data jsonb; snapshot jsonb; details jsonb; gov boolean;
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
 gov:=exists(select 1 from pf_categories where id=category and slug='government');
 if gov then
  details:=pf_government_details(data->'service_details');
  if data->>'currency' is distinct from 'BZD' or (data->>'amount')::numeric is distinct from (details->'pricing'->>'total')::numeric then
   raise exception 'Government Documents total must match the BZD service price and declaration fees';
  end if;
 elsif data->'service_details' is not null and data->'service_details'<>'null'::jsonb then raise exception 'Government details belong only in Gov Docs'; end if;
 -- Existing non-government clients retain the same contract behavior.
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
  if gov then values_data:=values_data||jsonb_build_object('amount',data->>'amount'); end if;
  snapshot:=jsonb_build_object('layout',coalesce(data->>'contract_format','form-v1'),'title',tmpl.title,'header_text',tmpl.header_text,'footer_text',tmpl.footer_text,'body',tmpl.body,'version',tmpl.version,'fields',values_data,'signer_name',person.name,'signer_employee_id',person.employee_id,'signature',signer.image,'signature_updated_at',signer.updated_at,'confirmed_at',now(),'bank',jsonb_build_object('name','Atlantic Bank','account_name','Jose Armando Esquiliano','account_number','211747902','account_type','Checking','currency','BZD'));
 end if;
 insert into pf_sales(id,category_id,user_id,customer_name,business,email,phone,service,requirements,amount,currency,sale_date,payment_method,contract_date,contract_snapshot,service_details)
 values(item,category,auth.uid(),btrim(data->>'customer_name'),btrim(coalesce(data->>'business','')),btrim(coalesce(data->>'email','')),btrim(coalesce(data->>'phone','')),coalesce((select name from pf_categories where id=category),btrim(data->>'service')),coalesce(values_data->>'scope',data->>'requirements',''),(data->>'amount')::numeric,data->>'currency',(data->>'sale_date')::date,data->>'payment_method',(data->>'contract_date')::date,snapshot,details);
 insert into att_audit(actor,action,target) values(auth.uid(),'portfolio_sale_recorded',item::text);
 return item;
end; $$;
revoke all on function public.pf_sale_save(jsonb) from public,anon;
grant execute on function public.pf_sale_save(jsonb) to authenticated;
insert into public.pf_services(category_id,name,description,pricing)
 select c.id,v.name,'Applicant and parent IDs required. Each declaration adds BZD 20.',v.pricing
 from public.pf_categories c cross join (values ('Birth Certificate','BZD 130'),('Death Certificate','BZD 130'),('Marriage Certificate','BZD 150'),('Birth Registration','BZD 130'),('Death Registration','BZD 130'),('Marriage Registration','BZD 150'),('Late Registration','Ask for a quote'),('Apostille','Ask for a quote'),('Translation','Ask for a quote'),('Visa Application','BZD 100')) as v(name,pricing)
 where c.slug='government' and not exists(select 1 from public.pf_services s where s.category_id=c.id and s.name=v.name);
notify pgrst, 'reload schema';
commit;
