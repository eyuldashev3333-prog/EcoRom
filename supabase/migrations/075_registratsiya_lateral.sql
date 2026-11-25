-- ECOROM 075: отчёты по месяцу не должны зависеть от размера всей базы.
--  * v_registratsiya считала м²/работы/платежи по ВСЕМ заказам в CTE, а потом отбирала месяц — на 10 000 заказов 143 мс и растёт линейно. Теперь агрегаты — LATERAL по каждому заказу
--    (месяц отбирается раньше), результат и колонки те же.
--  * Индекс по дате заказа в часовом поясе Ташкента — ровно то выражение, которое используют отчёты (monthly_report_core, savdo_month, Registratsiya).
-- Откат: view из 070; drop index orders_created_day_idx.
create index if not exists orders_created_day_idx on public.orders (((created_at at time zone 'Asia/Tashkent')::date));

create or replace view public.v_registratsiya as
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
   FROM orders o
     JOIN clients c ON c.id = o.client_id
     LEFT JOIN LATERAL (
        SELECT sum(oi.area_m2 * oi.qty::numeric) FILTER (WHERE cc.params ->> 'series' = 'aluminium') AS alu,
               sum(oi.area_m2 * oi.qty::numeric) FILTER (WHERE cc.params ->> 'series' = 'plastic') AS plast,
               sum(oi.area_m2 * oi.qty::numeric) FILTER (WHERE cc.params ->> 'series' = 'thermo') AS termo,
               sum(oi.qty::numeric * (SELECT COALESCE(sum((l.value ->> 'sum')::numeric), 0::numeric)
                                        FROM jsonb_array_elements(COALESCE(oi.calc -> 'lines', '[]'::jsonb)) l(value)
                                       WHERE l.value ->> 'kind' = 'work')) AS works
          FROM order_items oi LEFT JOIN catalog_items cc ON cc.id::text = oi.options ->> 'system'
         WHERE oi.order_id = o.id) i ON true
     LEFT JOIN LATERAL (SELECT sum(pm.amount) AS paid FROM payments pm WHERE pm.order_id = o.id) p ON true;
grant select on public.v_registratsiya to authenticated;
