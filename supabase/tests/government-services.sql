begin;

insert into auth.users(id,aud,role,email) values
 ('eebb0000-0000-4000-8000-000000000001','authenticated','authenticated','gov-admin@test.invalid'),
 ('eebb0000-0000-4000-8000-000000000002','authenticated','authenticated','gov-worker@test.invalid');
insert into public.att_profiles(id,employee_id,name,role,active) values
 ('eebb0000-0000-4000-8000-000000000001','GOV-TEST-ADMIN','Government test administrator','admin',true),
 ('eebb0000-0000-4000-8000-000000000002','GOV-TEST-WORKER','Government test worker','employee',true);

set local role authenticated;
select set_config('request.jwt.claim.sub','eebb0000-0000-4000-8000-000000000001',true);

do $$
declare
 applicant jsonb := '{"full_name":"Test applicant","address":"Test street","town":"Test town","marital_status":"single","mother_name":"Test mother","mother_status":"available","father_name":"Test father","father_status":"available","documents_status":"available","applicant_id_status":"available","applicant_id_reference":"TEST-A","mother_id_status":"available","mother_id_reference":"TEST-M","father_id_status":"available","father_id_reference":"TEST-F"}';
 details jsonb; result jsonb; payload jsonb; category uuid; request uuid:=gen_random_uuid(); saved uuid; item record;
begin
 details:=jsonb_build_object('version',2,'document_type','birth_certificate','certificate_count',1,'applicants',jsonb_build_array(applicant));
 for item in select * from (values ('birth_certificate',130),('death_certificate',130),('marriage_certificate',150),('birth_registration',130),('death_registration',130),('marriage_registration',150),('visa_application',100)) v(kind,price) loop
  result:=pf_government_details(details||jsonb_build_object('document_type',item.kind));
  if (result->'pricing'->>'total')::numeric<>item.price then raise exception 'FAIL fixed service price'; end if;
 end loop;
 for item in select * from (values ('late_registration'),('apostille'),('translation')) v(kind) loop
  begin
   perform pf_government_details(details||jsonb_build_object('document_type',item.kind));
   raise exception 'FAIL missing quote accepted';
  exception when raise_exception then if SQLERRM like 'FAIL%' then raise; end if; end;
  result:=pf_government_details(details||jsonb_build_object('document_type',item.kind,'quote','175.50'));
  if (result->'pricing'->>'total')::numeric<>175.50 then raise exception 'FAIL quote price'; end if;
 end loop;
 applicant:=applicant||'{"mother_id_status":"missing","mother_id_reason":"ID unavailable","father_id_status":"missing","father_id_reason":"ID unavailable"}';
 details:=details||jsonb_build_object('certificate_count',3,'applicants',jsonb_build_array(applicant,applicant,applicant),'pricing',jsonb_build_object('total',0,'declaration_count',0));
 result:=pf_government_details(details);
 if (result->'pricing'->>'total')::numeric<>510 or (result->'pricing'->>'declaration_count')::int<>6 then raise exception 'FAIL independent declaration calculation'; end if;
 begin
  perform pf_government_details(jsonb_set(details,'{applicants,0,mother_id_reason}','""'));
  raise exception 'FAIL missing declaration reason accepted';
 exception when raise_exception then if SQLERRM like 'FAIL%' then raise; end if; end;
 begin
  perform pf_government_details(details||'{"certificate_count":4}');
  raise exception 'FAIL invalid count accepted';
 exception when raise_exception then if SQLERRM like 'FAIL%' then raise; end if; end;
 select id into category from pf_categories where slug='government';
 perform pf_signature_save('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=');
 payload:=jsonb_build_object('id',request,'category_id',category,'customer_name','Test customer','amount','510','currency','BZD','sale_date','2026-11-21','contract_date','2026-11-21','payment_method','IFT','template_version',(select version from pf_contract_templates where category_id=category),'use_signature',true,'contract_format','document-v1','contract_fields',jsonb_build_object('amount','1'),'service_details',details);
 begin
  perform pf_sale_save(payload||'{"amount":"1"}');
  raise exception 'FAIL undercharge accepted';
 exception when raise_exception then if SQLERRM like 'FAIL%' then raise; end if; end;
 begin
  perform pf_sale_save(payload||'{"currency":"USD"}');
  raise exception 'FAIL wrong currency accepted';
 exception when raise_exception then if SQLERRM like 'FAIL%' then raise; end if; end;
 saved:=pf_sale_save(payload);
 if pf_sale_save(payload)<>saved or (select count(*) from pf_sales where id=saved)<>1 then raise exception 'FAIL duplicate retry'; end if;
 if (select service_details->'pricing'->>'total' from pf_sales where id=saved)<>'510' then raise exception 'FAIL details not saved'; end if;
 if (select contract_snapshot->'fields'->>'amount' from pf_sales where id=saved)<>'510' then raise exception 'FAIL contract amount inconsistent'; end if;
 perform set_config('request.jwt.claim.sub','eebb0000-0000-4000-8000-000000000002',true);
 if exists(select 1 from pf_sales where id=saved) then raise exception 'FAIL another user can read applicant data'; end if;
 begin
  perform pf_sale_save(payload||jsonb_build_object('id',gen_random_uuid()));
  raise exception 'FAIL unauthorized save';
 exception when raise_exception then if SQLERRM like 'FAIL%' then raise; end if; end;
end; $$;

rollback;
