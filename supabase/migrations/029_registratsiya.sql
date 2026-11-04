-- ECOROM 029: таблица REGISTRATSIYA в системе — те же колонки, что в Google Sheet владельца, заполняются сами.
-- Импортированные заказы: разбивка м² (алюминий/пластик/термо) и MAHSULOT / SBOR-USLUG берутся из заметки импорта (сохраняем в поля).
-- Новые заказы: м² по серии системы из позиций, MAHSULOT = себестоимость − работы, SBOR-USLUG = работы из расчёта.
-- Любое из этих полей можно поправить в таблице — тогда хранится ручное значение (оно главнее расчёта).
alter table public.orders
  add column if not exists m2_alu numeric(10,2),
  add column if not exists m2_plast numeric(10,2),
  add column if not exists m2_termo numeric(10,2),
  add column if not exists cost_product numeric(14,2),
  add column if not exists cost_service numeric(14,2);

-- перенос из заметки импорта: «Alyumin 0 m², Plast 6.67 m², Termo 2.64 m²; Mahsulot 8453000; Sbor/usluga 0; Foyda …»
update public.orders set
  m2_alu = coalesce(m2_alu, (substring(notes from 'Alyumin ([0-9.]+) m'))::numeric),
  m2_plast = coalesce(m2_plast, (substring(notes from 'Plast ([0-9.]+) m'))::numeric),
  m2_termo = coalesce(m2_termo, (substring(notes from 'Termo ([0-9.]+) m'))::numeric),
  cost_product = coalesce(cost_product, (substring(notes from 'Mahsulot (-?[0-9.]+)'))::numeric),
  cost_service = coalesce(cost_service, (substring(notes from 'Sbor/usluga (-?[0-9.]+)'))::numeric)
where is_imported and notes like 'Import (REGISTRATSIYA%';

create or replace view public.v_registratsiya with (security_invoker = true) as
with items as (
  select oi.order_id,
         sum(oi.area_m2 * oi.qty) filter (where c.params->>'series' = 'aluminium') as alu,
         sum(oi.area_m2 * oi.qty) filter (where c.params->>'series' = 'plastic') as plast,
         sum(oi.area_m2 * oi.qty) filter (where c.params->>'series' = 'thermo') as termo,
         sum(oi.qty * (select coalesce(sum((l->>'sum')::numeric), 0) from jsonb_array_elements(coalesce(oi.calc->'lines', '[]')) l where l->>'kind' = 'work')) as works
    from public.order_items oi left join public.catalog_items c on c.id::text = oi.options->>'system'
   group by oi.order_id
), paid as (
  select order_id, sum(amount) as paid from public.payments group by order_id
)
select o.id, o.order_no as raqami,
       (o.created_at at time zone 'Asia/Tashkent')::date as sana,
       to_char((o.created_at at time zone 'Asia/Tashkent'), 'YYYY-MM') as oy,
       c.full_name as ismi, o.client_id,
       coalesce(o.address, c.address) as manzil,
       coalesce(o.contact_phone, c.phone) as kontakt,
       o.color as rangi,
       round(coalesce(o.m2_alu, i.alu, 0), 2) as alyumin,
       round(coalesce(o.m2_plast, i.plast, 0), 2) as plast,
       round(coalesce(o.m2_termo, i.termo, 0), 2) as termo,
       round(o.area_m2, 2) as jami, o.windows_count as soni,
       o.contract_price as dogovor,
       coalesce(p.paid, 0) as berdi,
       o.contract_price - coalesce(p.paid, 0) as qoldiq,
       coalesce(o.cost_product, o.calc_cost - coalesce(i.works, 0)) as mahsulot,
       coalesce(o.cost_service, i.works, 0) as sbor,
       coalesce(o.cost_product + coalesce(o.cost_service, 0), o.calc_cost) as jami_tani,
       o.contract_price - coalesce(o.cost_product + coalesce(o.cost_service, 0), o.calc_cost) as foyda,
       o.install_date as ornatilish, o.status, o.is_imported
  from public.orders o
  join public.clients c on c.id = o.client_id
  left join items i on i.order_id = o.id
  left join paid p on p.order_id = o.id;

-- правка ячейки REGISTRATSIYA (только Rahbar). Деньги из журнала (BERDI/QOLDIQ) так не правятся — только через оплаты.
create or replace function public.registratsiya_set(p_order uuid, p_field text, p_value text) returns void
language plpgsql security invoker set search_path = public as $$
declare v text := nullif(trim(coalesce(p_value, '')), ''); n numeric;
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  if p_field in ('alyumin', 'plast', 'termo', 'mahsulot', 'sbor', 'dogovor') then
    n := nullif(replace(replace(coalesce(v, ''), ' ', ''), ',', '.'), '')::numeric;
    if n is not null and n < 0 then raise exception 'Manfiy bo''lishi mumkin emas'; end if;
  end if;
  case p_field
    when 'ismi' then
      if v is null then raise exception 'Ism bo''sh bo''lmasin'; end if;
      update clients set full_name = v where id = (select client_id from orders where id = p_order);
    when 'manzil' then update orders set address = v where id = p_order;
    when 'kontakt' then update orders set contact_phone = v where id = p_order;
    when 'rangi' then update orders set color = v where id = p_order;
    when 'sana' then update orders set created_at = (v::date + ((created_at at time zone 'Asia/Tashkent')::time)) at time zone 'Asia/Tashkent' where id = p_order;
    when 'ornatilish' then update orders set install_date = v::date where id = p_order;
    when 'dogovor' then
      if n is null then raise exception 'Summa kerak'; end if;
      update orders set contract_price = n where id = p_order;
    when 'alyumin' then update orders set m2_alu = n where id = p_order;
    when 'plast' then update orders set m2_plast = n where id = p_order;
    when 'termo' then update orders set m2_termo = n where id = p_order;
    when 'mahsulot' then update orders set cost_product = n where id = p_order;
    when 'sbor' then update orders set cost_service = n where id = p_order;
    else raise exception 'Bu ustunni tahrirlab bo''lmaydi: %', p_field;
  end case;
  if not found then raise exception 'Buyurtma topilmadi'; end if;
end $$;
revoke all on function public.registratsiya_set(uuid, text, text) from public, anon;
grant execute on function public.registratsiya_set(uuid, text, text) to authenticated;
