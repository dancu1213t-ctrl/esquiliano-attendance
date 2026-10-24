begin;
insert into auth.users(id,aud,role,email) values
 ('cccccccc-0000-4000-8000-000000000001','authenticated','authenticated','ws1@test.invalid'),
 ('cccccccc-0000-4000-8000-000000000002','authenticated','authenticated','ws2@test.invalid'),
 ('cccccccc-0000-4000-8000-000000000003','authenticated','authenticated','ws3@test.invalid'),
 ('cccccccc-0000-4000-8000-000000000004','authenticated','authenticated','ws4@test.invalid'),
 ('cccccccc-0000-4000-8000-000000000005','authenticated','authenticated','ws5@test.invalid');
insert into att_profiles(id,employee_id,name,role,active) values
 ('cccccccc-0000-4000-8000-000000000001','WS-TEST-1','Workspace worker one','employee',true),
 ('cccccccc-0000-4000-8000-000000000002','WS-TEST-2','Workspace worker two','employee',true),
 ('cccccccc-0000-4000-8000-000000000003','WS-TEST-3','Workspace worker three','employee',true),
 ('cccccccc-0000-4000-8000-000000000004','WS-TEST-4','Workspace inactive','employee',false),
 ('cccccccc-0000-4000-8000-000000000005','WS-TEST-5','Workspace admin','admin',true);
set local role authenticated;
select set_config('request.jwt.claim.sub','cccccccc-0000-4000-8000-000000000001',true);
do $$ declare row ws_clients;begin
 row=ws_save_client('dddddddd-0000-4000-8000-000000000001','{"client":"Test client","contact":"Test contact","service":"Bookkeeping","price":"450.00"}','Draft',null);
 if row.owner_id<>auth.uid() or row.version<>1 then raise exception 'FAIL owner assignment';end if;
 row=ws_save_client(row.id,row.fields||'{"service":"Monthly bookkeeping"}','Active',1);
 if row.version<>2 or (select count(*) from ws_history where client_id=row.id)<>1 then raise exception 'FAIL revisions';end if;
 begin perform ws_save_client(row.id,row.fields,'Active',1);raise exception 'FAIL stale edit';exception when raise_exception then if SQLERRM='FAIL stale edit' then raise;end if;end;
 begin perform ws_save_client(gen_random_uuid(),row.fields||'{"btsUrl":"javascript:alert(1)"}','Active',null);raise exception 'FAIL unsafe URL';exception when raise_exception then if SQLERRM='FAIL unsafe URL' then raise;end if;end;
 begin perform ws_save_client(gen_random_uuid(),row.fields||'{"price":"-1"}','Active',null);raise exception 'FAIL negative quote';exception when raise_exception then if SQLERRM='FAIL negative quote' then raise;end if;end;
 begin update ws_clients set owner_id='cccccccc-0000-4000-8000-000000000002' where id=row.id;raise exception 'FAIL direct mutation';exception when insufficient_privilege then null;end;
 perform ws_add_comment('dddddddd-0000-4000-8000-000000000002',row.id,'Test client note');
 perform ws_add_comment('dddddddd-0000-4000-8000-000000000002',row.id,'Test client note');
 if (select count(*) from ws_comments where client_id=row.id)<>1 then raise exception 'FAIL comment idempotency';end if;
 perform ws_send_message('dddddddd-0000-4000-8000-000000000003','dm:cccccccc-0000-4000-8000-000000000001:cccccccc-0000-4000-8000-000000000002','Test direct message');
 perform ws_send_message('dddddddd-0000-4000-8000-000000000003','dm:cccccccc-0000-4000-8000-000000000001:cccccccc-0000-4000-8000-000000000002','Test direct message');
 if (select count(*) from ws_messages where id='dddddddd-0000-4000-8000-000000000003')<>1 then raise exception 'FAIL message idempotency';end if;
 begin perform ws_send_message(gen_random_uuid(),'general','Rate test');raise exception 'FAIL send rate';exception when raise_exception then if SQLERRM='FAIL send rate' then raise;end if;end;
 begin perform ws_send_message(gen_random_uuid(),'announcements','Unauthorized');raise exception 'FAIL employee announcement';exception when raise_exception then if SQLERRM='FAIL employee announcement' then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub','cccccccc-0000-4000-8000-000000000002',true);
do $$begin
 if exists(select 1 from ws_clients where id='dddddddd-0000-4000-8000-000000000001') then raise exception 'FAIL cross-worker client read';end if;
 if exists(select 1 from ws_comments where client_id='dddddddd-0000-4000-8000-000000000001') then raise exception 'FAIL cross-worker notes';end if;
 if not exists(select 1 from ws_messages where id='dddddddd-0000-4000-8000-000000000003') then raise exception 'FAIL DM recipient access';end if;
 begin perform ws_save_client('dddddddd-0000-4000-8000-000000000001','{"client":"Other","contact":"Contact","service":"Service","price":"1"}','Draft',2);raise exception 'FAIL cross-worker edit';exception when raise_exception then if SQLERRM='FAIL cross-worker edit' then raise;end if;end;
 begin perform ws_add_comment(gen_random_uuid(),'dddddddd-0000-4000-8000-000000000001','Denied');raise exception 'FAIL cross-worker note write';exception when raise_exception then if SQLERRM='FAIL cross-worker note write' then raise;end if;end;
 if exists(select 1 from ws_directory() where id='cccccccc-0000-4000-8000-000000000004') then raise exception 'FAIL inactive directory entry';end if;
end $$;
select set_config('request.jwt.claim.sub','cccccccc-0000-4000-8000-000000000003',true);
do $$ begin
 if exists(select 1 from ws_messages where id='dddddddd-0000-4000-8000-000000000003') then raise exception 'FAIL nonparticipant DM disclosure';end if;
 begin perform ws_send_message(gen_random_uuid(),'dm:cccccccc-0000-4000-8000-000000000001:cccccccc-0000-4000-8000-000000000002','Denied');raise exception 'FAIL nonparticipant DM send';exception when raise_exception then if SQLERRM='FAIL nonparticipant DM send' then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub','cccccccc-0000-4000-8000-000000000004',true);
do $$begin
 if exists(select 1 from ws_directory()) or exists(select 1 from ws_clients) or exists(select 1 from ws_messages) then raise exception 'FAIL inactive access';end if;
 begin perform ws_save_client(gen_random_uuid(),'{"client":"Client","contact":"Contact","service":"Service","price":"1"}','Draft',null);raise exception 'FAIL inactive save';exception when raise_exception then if SQLERRM='FAIL inactive save' then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub','cccccccc-0000-4000-8000-000000000005',true);
do $$begin
 if not exists(select 1 from ws_clients where id='dddddddd-0000-4000-8000-000000000001') then raise exception 'FAIL admin client access';end if;
 if not exists(select 1 from ws_history where client_id='dddddddd-0000-4000-8000-000000000001') then raise exception 'FAIL admin history access';end if;
 if not exists(select 1 from ws_messages where id='dddddddd-0000-4000-8000-000000000003') then raise exception 'FAIL admin message access';end if;
 perform ws_send_message(gen_random_uuid(),'announcements','Test announcement');
end $$;
reset role;
set local role anon;
do $$begin
 begin perform ws_directory();raise exception 'FAIL anonymous directory';exception when insufficient_privilege then null;end;
 begin perform 1 from ws_clients;raise exception 'FAIL anonymous clients';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
select 'PASS: workspace isolation, admin access, revisions, validation, notes, DM privacy, retries, rate limits and inactive/anonymous denial' as result;
