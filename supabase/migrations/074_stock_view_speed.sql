-- ECOROM 074: v_stock_balance не читает настройки валюты на каждую строку (курс — один раз на запрос). Нагрузочный тест: 376 мс → см. scripts/scale.
-- part_price_raw — цена каталога как есть; currency_factor() — множитель «\$ → so'm» (1, если валюты совпадают или курс не задан); part_price = raw × factor (прежний смысл).
-- Откат: view из 069 (part_price(i.*, k.part)).
create or replace function public.currency_factor() returns numeric language sql stable as $$
  select case when (select value #>> '{}' from app_settings where key = 'price_currency') is distinct from (select value #>> '{}' from app_settings where key = 'result_currency')
               and coalesce((select (value #>> '{}')::numeric from app_settings where key = 'currency_rate'), 0) > 0
              then (select (value #>> '{}')::numeric from app_settings where key = 'currency_rate') else 1 end
$$;
create or replace function public.part_price_raw(p_item catalog_items, p_part text) returns numeric language sql immutable as $$
  select case when coalesce(p_part, '') = '' then p_item.price
              else coalesce(nullif(p_item.params->>(case p_part when 'rama' then 'frame' when 'tavaqa' then 'sash' when 'shtapik' then 'bead'
                     when 'rezina' then 'gasket' when 'profil' then 'profile' when 'zaglushka' then 'side_cap' else p_part end), '')::numeric, 0) end
$$;
create or replace function public.part_price(p_item catalog_items, p_part text) returns numeric language sql stable as $$
  select public.part_price_raw(p_item, p_part) * public.currency_factor()
$$;

create or replace view public.v_stock_balance with (security_invoker = true) as
 WITH keys AS (
         SELECT i_1.id AS item_id,
            p.part
           FROM (catalog_items i_1
             CROSS JOIN LATERAL unnest(
                CASE i_1.kind
                    WHEN 'system'::text THEN ARRAY['rama'::text, 'impost'::text, 'tavaqa'::text, 'shtapik'::text, 'rezina'::text]
                    WHEN 'ebb'::text THEN ARRAY[''::text, 'zaglushka'::text]
                    WHEN 'net'::text THEN ARRAY[''::text, 'profil'::text, 'rezina'::text]
                    ELSE ARRAY[''::text]
                END) p(part))
          WHERE (i_1.stock_tracked AND i_1.is_active)
        UNION
         SELECT stock_movements.item_id,
            stock_movements.part
           FROM stock_movements
        )
 SELECT k.item_id,
    k.part,
    i.kind,
    i.sort,
    (i.name ||
        CASE
            WHEN (k.part <> ''::text) THEN (' — '::text || k.part)
            ELSE ''::text
        END) AS name,
    part_unit(i.unit, k.part) AS unit,
    COALESCE(sum(m.qty), (0)::numeric) AS qty,
    (part_price_raw(i.*, k.part) * (SELECT currency_factor())) AS price,
    round((COALESCE(sum(m.qty), (0)::numeric) * (part_price_raw(i.*, k.part) * (SELECT currency_factor()))), 2) AS value
   FROM ((keys k
     JOIN catalog_items i ON ((i.id = k.item_id)))
     LEFT JOIN stock_movements m ON (((m.item_id = k.item_id) AND (m.part = k.part))))
  GROUP BY k.item_id, k.part, i.id;
grant select on public.v_stock_balance to authenticated;