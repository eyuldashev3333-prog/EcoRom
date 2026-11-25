-- ECOROM 070: поправки к 069.
--  * REGISTRATSIYA: себестоимость = mahsulot + sbor (view пересоздан целиком — замена в 069 не нашла строку из-за формата pg_get_viewdef).
--  * stock_receive: защита от двойного нажатия опознаёт «Ombor kirim» по платежу поставщику (а не по тексту примечания).
-- Откат: view v_registratsiya из 035/043; stock_receive из 069.

create or replace view public.v_registratsiya as
 WITH items AS (
         SELECT oi.order_id,
            sum((oi.area_m2 * (oi.qty)::numeric)) FILTER (WHERE ((c_1.params ->> 'series'::text) = 'aluminium'::text)) AS alu,
            sum((oi.area_m2 * (oi.qty)::numeric)) FILTER (WHERE ((c_1.params ->> 'series'::text) = 'plastic'::text)) AS plast,
            sum((oi.area_m2 * (oi.qty)::numeric)) FILTER (WHERE ((c_1.params ->> 'series'::text) = 'thermo'::text)) AS termo,
            sum(((oi.qty)::numeric * ( SELECT COALESCE(sum(((l.value ->> 'sum'::text))::numeric), (0)::numeric) AS "coalesce"
                   FROM jsonb_array_elements(COALESCE((oi.calc -> 'lines'::text), '[]'::jsonb)) l(value)
                  WHERE ((l.value ->> 'kind'::text) = 'work'::text)))) AS works
           FROM (order_items oi
             LEFT JOIN catalog_items c_1 ON (((c_1.id)::text = (oi.options ->> 'system'::text))))
          GROUP BY oi.order_id
        ), paid AS (
         SELECT payments.order_id,
            sum(payments.amount) AS paid
           FROM payments
          GROUP BY payments.order_id
        )
 SELECT o.id,
    o.order_no AS raqami,
    ((o.created_at AT TIME ZONE 'Asia/Tashkent'::text))::date AS sana,
    to_char((o.created_at AT TIME ZONE 'Asia/Tashkent'::text), 'YYYY-MM'::text) AS oy,
    c.full_name AS ismi,
    o.client_id,
    COALESCE(o.address, c.address) AS manzil,
    COALESCE(o.contact_phone, c.phone) AS kontakt,
    o.color AS rangi,
    round(COALESCE(o.m2_alu, i.alu, (0)::numeric), 2) AS alyumin,
    round(COALESCE(o.m2_plast, i.plast, (0)::numeric), 2) AS plast,
    round(COALESCE(o.m2_termo, i.termo, (0)::numeric), 2) AS termo,
    round(o.area_m2, 2) AS jami,
    o.windows_count AS soni,
    o.contract_price AS dogovor,
    COALESCE(p.paid, (0)::numeric) AS berdi,
    (o.contract_price - COALESCE(p.paid, (0)::numeric)) AS qoldiq,
    COALESCE(o.cost_product, (o.calc_cost - COALESCE(i.works, (0)::numeric))) AS mahsulot,
    COALESCE(o.cost_service, i.works, (0)::numeric) AS sbor,
    (COALESCE(o.cost_product, (o.calc_cost - COALESCE(i.works, (0)::numeric))) + COALESCE(o.cost_service, i.works, (0)::numeric)) AS jami_tani,
    (o.contract_price - (COALESCE(o.cost_product, (o.calc_cost - COALESCE(i.works, (0)::numeric))) + COALESCE(o.cost_service, i.works, (0)::numeric))) AS foyda,
    o.install_date AS ornatilish,
    o.status,
    o.is_imported
   FROM (((orders o
     JOIN clients c ON ((c.id = o.client_id)))
     LEFT JOIN items i ON ((i.order_id = o.id)))
     LEFT JOIN paid p ON ((p.order_id = o.id)));

do $$
declare v_src text; v_new text;
begin
  select pg_get_functiondef('public.stock_receive(uuid, text, numeric, numeric, text)'::regprocedure) into v_src;
  v_new := replace(v_src, $q$and p.reverses_id is null and p.note like 'Ombor%' and p.created_at > now() - interval '2 minutes'$q$,
                          $q$and p.reverses_id is null and exists (select 1 from supplier_payments sp where sp.note = 'Ombor kirim ' || p.id::text) and p.created_at > now() - interval '2 minutes'$q$);
  if v_new = v_src then raise exception 'stock_receive: замена не сработала'; end if;
  execute v_new;
end $$;