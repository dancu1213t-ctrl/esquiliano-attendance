begin;
create table public.pf_categories(
 id uuid primary key default gen_random_uuid(), slug text not null unique,
 name text not null check(length(name) between 1 and 80), description text not null default '' check(length(description)<=500),
 icon text not null default 'folder' check(icon in('accounting','marketing','government','hr','intelligence','it','folder')),
 availability text not null default 'coming_soon' check(availability in('available','coming_soon')),
 show_portfolio boolean not null default true, archived boolean not null default false, sort_order int not null default 100,
 created_at timestamptz not null default now()
);
create table public.pf_access(
 category_id uuid not null references public.pf_categories(id), user_id uuid not null references public.att_profiles(id),
 can_sell boolean not null default false, primary key(category_id,user_id)
);
create table public.pf_folders(
 id uuid primary key default gen_random_uuid(), category_id uuid not null references public.pf_categories(id),
 name text not null check(length(name) between 1 and 100), description text not null default '' check(length(description)<=500),
 drive_url text not null default '' check(drive_url='' or drive_url ~ '^https://drive\.google\.com/drive/(u/[0-9]+/)?folders/[A-Za-z0-9_-]+([?][^[:space:]]*)?$'),
 archived boolean not null default false, sort_order int not null default 100, created_at timestamptz not null default now()
);
create table public.pf_services(
 id uuid primary key default gen_random_uuid(), category_id uuid not null references public.pf_categories(id),
 name text not null check(length(name) between 1 and 120), description text not null default '' check(length(description)<=1000),
 pricing text not null default '' check(length(pricing)<=150), archived boolean not null default false,
 created_at timestamptz not null default now()
);
create table public.pf_sales(
 id uuid primary key, category_id uuid not null references public.pf_categories(id), user_id uuid not null references public.att_profiles(id),
 customer_name text not null check(length(customer_name) between 1 and 150), business text not null default '' check(length(business)<=150),
 email text not null default '' check(length(email)<=254), phone text not null default '' check(length(phone)<=60),
 service text not null check(length(service) between 1 and 300), requirements text not null default '' check(length(requirements)<=5000),
 amount numeric(12,2) not null check(amount>=0 and amount<=9999999999.99), currency text not null check(currency in('BZD','USD')),
 sale_date date not null, created_at timestamptz not null default now()
);
create index pf_sales_category_time on public.pf_sales(category_id,created_at desc);
create index pf_access_user on public.pf_access(user_id);
create function public.pf_allowed(category uuid,selling boolean default false) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select att_is_active() and (att_is_admin() or exists(select 1 from pf_access a where a.category_id=category and a.user_id=auth.uid() and (not selling or a.can_sell)))
$$;
alter table pf_categories enable row level security;
alter table pf_access enable row level security;
alter table pf_folders enable row level security;
alter table pf_services enable row level security;
alter table pf_sales enable row level security;
create policy pf_category_read on pf_categories for select to authenticated using(pf_allowed(id) and (not archived or att_is_admin()));
create policy pf_access_read on pf_access for select to authenticated using(att_is_active() and (user_id=auth.uid() or att_is_admin()));
create policy pf_folder_read on pf_folders for select to authenticated using(pf_allowed(category_id) and (att_is_admin() or (not archived and exists(select 1 from pf_categories c where c.id=category_id and not c.archived and c.availability='available' and c.show_portfolio))));
create policy pf_service_read on pf_services for select to authenticated using(pf_allowed(category_id) and (att_is_admin() or (not archived and exists(select 1 from pf_categories c where c.id=category_id and not c.archived and c.availability='available'))));
create policy pf_sale_read on pf_sales for select to authenticated using(att_is_admin() or (att_is_active() and user_id=auth.uid() and pf_allowed(category_id)));
revoke all on pf_categories,pf_access,pf_folders,pf_services,pf_sales from public,anon,authenticated;
grant select on pf_categories,pf_access,pf_folders,pf_services,pf_sales to authenticated;
create function public.pf_admin_save(kind text,data jsonb) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare item uuid:=coalesce(nullif(data->>'id','')::uuid,gen_random_uuid()); category uuid;
begin
 if not att_is_admin() then raise exception 'Administrator required'; end if;
 if kind='category' then
  insert into pf_categories(id,slug,name,description,icon,availability,show_portfolio,archived)
  values(item,'custom-'||item,btrim(data->>'name'),coalesce(data->>'description',''),coalesce(data->>'icon','folder'),coalesce(data->>'availability','coming_soon'),coalesce((data->>'show_portfolio')::boolean,true),coalesce((data->>'archived')::boolean,false))
  on conflict(id) do update set name=excluded.name,description=excluded.description,icon=excluded.icon,availability=excluded.availability,show_portfolio=excluded.show_portfolio,archived=excluded.archived;
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
create function public.pf_set_access(category uuid,person uuid,access_level text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not att_is_admin() then raise exception 'Administrator required'; end if;
 if access_level not in('none','view','sell') then raise exception 'Choose an access level'; end if;
 if not exists(select 1 from att_profiles where id=person and active) then raise exception 'Choose an active employee'; end if;
 if not exists(select 1 from pf_categories where id=category) then raise exception 'Choose a category'; end if;
 if access_level='none' then delete from pf_access where user_id=person and category_id=category;
 else insert into pf_access(category_id,user_id,can_sell) values(category,person,access_level='sell') on conflict(category_id,user_id) do update set can_sell=excluded.can_sell; end if;
 insert into att_audit(actor,action,target) values(auth.uid(),'portfolio_access_'||access_level,person::text||':'||category::text);
end $$;
create function public.pf_sale_save(data jsonb) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare item uuid:=(data->>'id')::uuid; category uuid:=(data->>'category_id')::uuid; existing pf_sales;
begin
 if item is null or category is null then raise exception 'Missing sale reference'; end if;
 if not pf_allowed(category,true) then raise exception 'You do not have permission to record sales in this category'; end if;
 if not exists(select 1 from pf_categories where id=category and not archived and availability='available') then raise exception 'This category is not available for sales'; end if;
 perform pg_advisory_xact_lock(hashtextextended(item::text,0));
 select * into existing from pf_sales where id=item;
 if found then
  if existing.user_id<>auth.uid() or existing.category_id<>category then raise exception 'Sale reference unavailable'; end if;
  return item;
 end if;
 insert into pf_sales(id,category_id,user_id,customer_name,business,email,phone,service,requirements,amount,currency,sale_date)
 values(item,category,auth.uid(),btrim(data->>'customer_name'),btrim(coalesce(data->>'business','')),btrim(coalesce(data->>'email','')),btrim(coalesce(data->>'phone','')),btrim(data->>'service'),coalesce(data->>'requirements',''),(data->>'amount')::numeric,data->>'currency',(data->>'sale_date')::date);
 insert into att_audit(actor,action,target) values(auth.uid(),'portfolio_sale_recorded',item::text);
 return item;
end $$;
revoke all on function pf_allowed(uuid,boolean),pf_admin_save(text,jsonb),pf_set_access(uuid,uuid,text),pf_sale_save(jsonb) from public,anon;
grant execute on function pf_allowed(uuid,boolean),pf_admin_save(text,jsonb),pf_set_access(uuid,uuid,text),pf_sale_save(jsonb) to authenticated;
insert into pf_categories(slug,name,description,icon,availability,show_portfolio,sort_order) values
 ('marketing','Marketing','Show clients our creative work and record every new brief.','marketing','available',true,10),
 ('accounting','Accounting','Accounting services and rates, in one clear place.','accounting','available',false,20),
 ('government','Government Documents','Document services and customer requests.','government','available',true,30),
 ('hr','HR','Human resources services.','hr','coming_soon',true,40),
 ('intelligence','Business Intelligence','Insights to help businesses move forward.','intelligence','coming_soon',true,50),
 ('it','IT','Technology services and support.','it','coming_soon',true,60);
insert into pf_folders(category_id,name,description,sort_order)
select c.id,v.name,v.description,v.position from pf_categories c cross join(values
 ('Videos & Reels','Short-form videos, reels and motion work.',10),
 ('Flyers','Promotional flyers and campaign designs.',20),
 ('Websites','Website projects and digital experiences.',30)
) as v(name,description,position) where c.slug='marketing';
commit;