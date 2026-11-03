-- ECOROM 002: стартовый каталог (названия из WinStudio v44.4 владельца). Цены 0 — владелец вносит сам.
insert into public.catalog_items (kind, name, unit, params, stock_tracked, sort)
select 'system', n, 'm', jsonb_build_object('frame',0,'impost',0,'sash',0,'bead',0,'gasket',0,
        'series', case when n ilike 'Алюмин%' or n ilike 'БКС%' then 'aluminium' when n ilike 'Термо%' then 'thermo' else 'plastic' end),
       true, row_number() over ()
from unnest(array[
 '6000 Куатро (Ретпен/Ок)','6000-Куатро Windoorlane (Ок)','6000-Куатро Windoorlane (Лам)','6000-Куатро (Ламинат)','6000-Куатро (Ок)',
 '6000-Трио (Ламинация)','7000-Энгельберг (Лам)','АКФА 6500 (Пента)','Пластик 7000 (АКФА)',
 'Алюмин (Ламинация)','Алюмин (Вакуум)','Алюмин (Ж-306)','Алюмин (Ок)','БКС-50 (Лам)','БКС-50 (Ок)',
 'Термо 7000 (Ж-306)','Термо 7000 (Ок)','Термо 7800 (Ламинация)','Термо-57 (Ламинация)','Термо 5700 (Ж-306)','Термо-70 (Ламинат)'
]) as n;

insert into public.catalog_items (kind, name, unit, sort)
select 'glass', n, 'm2', row_number() over () from unnest(array[
 'Одинар (Ок)','Одинар (Йод)','Одинар (Форд синий)','Одинар (Еврейка)',
 'Пакет (Ок+Йод)','Пакет (Ок+Ок)','Пакет (Ок+Форд синий)','Пакет (Ок+Серий)','Ок+Ок+Ок пакет',
 'Ок+Ок пакет (Имзо аргон газ)','Энергия +Ок (Имзо аргон газ)','Энергия +Ок (пакет)','Энергия +Ок+Ок (калёный)','Энергия сберегающий (все цвета)',
 'Серый 1 кават','Серый еврейка','Серый еврейка +Ок','Ок еврейка','Ок еврейка+Ок (пакет)','Ёдивий 1ли калённый','Ёдивий гуллий ванна'
]) as n;

insert into public.catalog_items (kind, name, unit, params, sort) values
 ('ebb','Отлив белый 200','m','{"side_cap":0}',1), ('ebb','Отлив белый 300','m','{"side_cap":0}',2);

insert into public.catalog_items (kind, name, unit, sort)
select 'sill', t || ' ' || s || ' см', 'm', row_number() over ()
from (values ('Лам'),('Ок')) a(t), unnest(array[15,20,25,30,35,40,45,60]) s
union all
select 'sill', t || ' ' || s || ' см', 'm', 100 + row_number() over ()
from (values ('Эко-лам'),('Эко-ок')) a(t), unnest(array[25,30,35]) s;

insert into public.catalog_items (kind, name, unit, sort)
select 'hardware', n, 'pcs', row_number() over () from unnest(array[
 'Дверной (Оддий)','Дверной (Супра) 1 канотлик','Дверной (Супра) 2 канотлик','Дверной (Термо)','Дверной (Пластик) 1 канотлик',
 'Оконный (Оддий)','Оконный (Откидной)','Оконный (Ротто)','Оконный (Термо)','Оконный (Термо-Откид)','Оконный (один очилиш)'
]) as n;

insert into public.catalog_items (kind, name, unit, sort) values
 ('misc','Саморез-Пена','pcs',1), ('misc','Комплект шурупов','pcs',2), ('misc','Пена монтажная','pcs',3);

insert into public.catalog_items (kind, name, unit, stock_tracked, sort) values
 ('work','Монтаж (Алюмин)','pcs',false,1), ('work','Монтаж (Пласт)','pcs',false,2), ('work','Монтаж (Термо)','pcs',false,3),
 ('work','Демонтаж','pcs',false,4), ('work','Доставка','pcs',false,5), ('work','Монтаж отлива','pcs',false,6),
 ('work','Монтаж подоконника','pcs',false,7), ('work','Монтаж порога','pcs',false,8), ('work','Монтаж в бетон','pcs',false,9),
 ('work','Отделка откосов','pcs',false,10);

insert into public.catalog_items (kind, name, unit, params, sort) values
 ('net','Сетка белая','m2','{"profile":0,"gasket":0}',1), ('net','Сетка коричневая','m2','{"profile":0,"gasket":0}',2), ('net','Сетка серая','m2','{"profile":0,"gasket":0}',3);

insert into public.catalog_items (kind, name, unit, stock_tracked, sort)
select 'color', n, 'pcs', false, row_number() over () from unnest(array[
 'Белый','Антрацит','Дуб-Мокко','Зол-Дуб','Шеффилд','Береза','Бук','Вишня','Гикори','Дуб','Желтый','Зеленый','Клен','Красное дерево','Красный','Темный дуб','Бордо','Серый'
]) as n;

insert into public.catalog_items (kind, name, unit, stock_tracked, sort) values
 ('extra','Подставочный профиль','m',true,1), ('extra','Добор 15','m',true,2), ('extra','Добор 20','m',true,3);
