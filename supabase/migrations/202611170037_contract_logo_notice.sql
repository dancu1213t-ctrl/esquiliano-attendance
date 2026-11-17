begin;
update public.pf_contract_templates set
 body=replace(body,'MOCK CONTRACT - FOR REVIEW ONLY. This document demonstrates the fillable layout. Replace it with the approved company contract and final terms before use as a final agreement.','Mock - ECB admin can replace this.'),
 footer_text=case when footer_text='Mock contract - replace with your approved contract before final use.' then '' else footer_text end,
 version=version+1,updated_at=now()
where body like '%MOCK CONTRACT - FOR REVIEW ONLY. This document demonstrates the fillable layout. Replace it with the approved company contract and final terms before use as a final agreement.%'
 or footer_text='Mock contract - replace with your approved contract before final use.';
alter table public.pf_contract_templates alter column footer_text set default '';
commit;
