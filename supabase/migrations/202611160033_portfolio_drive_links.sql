begin;
alter table public.pf_categories add column drive_url text not null default '' check(drive_url='' or drive_url ~ '^https://drive\.google\.com/drive/(u/[0-9]+/)?folders/[A-Za-z0-9_-]+([?][^[:space:]]*)?$');
create or replace function public.pf_admin_save(kind text,data jsonb) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare item uuid:=coalesce(nullif(data->>'id','')::uuid,gen_random_uuid()); category uuid;
begin
 if not att_is_admin() then raise exception 'Administrator required'; end if;
 if kind='category' then
  insert into pf_categories(id,slug,name,description,icon,availability,show_portfolio,archived,drive_url)
  values(item,'custom-'||item,btrim(data->>'name'),coalesce(data->>'description',''),coalesce(data->>'icon','folder'),coalesce(data->>'availability','coming_soon'),coalesce((data->>'show_portfolio')::boolean,true),coalesce((data->>'archived')::boolean,false),btrim(coalesce(data->>'drive_url','')))
  on conflict(id) do update set name=excluded.name,description=excluded.description,icon=excluded.icon,availability=excluded.availability,show_portfolio=excluded.show_portfolio,archived=excluded.archived,drive_url=excluded.drive_url;
 elsif kind in('folder','service') then
  category:=(data->>'category_id')::uuid;
  if not exists(select 1 from pf_categories where id=category) then raise exception 'Choose a category'; end if;
  if kind='folder' then
   insert into pf_folders(id,category_id,name,description,drive_url,archived) values(item,category,btrim(data->>'name'),coalesce(data->>'description',''),btrim(coalesce(data->>'drive_url','')),coalesce((data->>'archived')::boolean,false))
   on conflict(id) do update set name=excluded.name,description=excluded.description,drive_url=excluded.drive_url,archived=excluded.archived;
  else
   insert into pf_services(id,category_id,name,description,pricing,archived) values(item,category,btrim(data->>'name'),coalesce(data->>'description',''),btrim(coalesce(data->>'pricing','')),coalesce((data->>'archived')::boolean,false))
   on conflict(id) do update set name=excluded.name,description=excluded.description,pricing=excluded.pricing,archived=excluded.archived;
  end if;
 else raise exception 'Unknown portfolio item'; end if;
 insert into att_audit(actor,action,target) values(auth.uid(),'portfolio_'||kind||'_saved',item::text);
 return item;
end $$;
update pf_categories set drive_url='https://drive.google.com/drive/folders/1GoyGm9U-FinfB-6skpCLwPqOe7FIwDTd' where slug='accounting';
update pf_categories set drive_url='https://drive.google.com/drive/folders/1mdGXwvnrSzSU5t2lDmWtbdb52l7ckfd0' where slug='intelligence';
update pf_categories set drive_url='https://drive.google.com/drive/folders/1It9LwIPQYUcX9P6qns_NsFbEw0-iEU0u' where slug='government';
update pf_categories set drive_url='https://drive.google.com/drive/folders/1iLURRglyPTOrlWCwwiPPlTM5KgpYadD4' where slug='it';
update pf_categories set drive_url='https://drive.google.com/drive/folders/1xyVwbe2rl6HoRAwE5pKdSBx3HllwQV-4' where slug='marketing';
update pf_categories set drive_url='https://drive.google.com/drive/folders/1HaKTEn-qA3kswjoVIAxmuaiIoGLRoVo6' where slug='hr';
update pf_folders f set drive_url='https://drive.google.com/drive/folders/1jSEri6PAoO28nXub3JusClqgc3FvOu0K',archived=false where category_id=(select id from pf_categories where slug='marketing') and name='Videos & Reels';
update pf_folders f set name='Flyers / Pic Ads',drive_url='https://drive.google.com/drive/folders/1RekfGbG_yhe3Kb7Y95Mff4GtTgiv-FqW',archived=false where category_id=(select id from pf_categories where slug='marketing') and name in('Flyers','Flyers / Pic Ads');
insert into pf_folders(category_id,name,description,drive_url,sort_order) select id,'Commercial Ads','Commercial campaigns and promotional work.','https://drive.google.com/drive/folders/1_vfqoQBMEfIVVcSgHV_lHa9iHaEj-yoi',30 from pf_categories c where slug='marketing' and not exists(select 1 from pf_folders f where f.category_id=c.id and lower(f.name) in('commercial ads','commercial adds'));
update pf_folders set archived=true where category_id=(select id from pf_categories where slug='marketing') and name='Websites' and drive_url='';
commit;