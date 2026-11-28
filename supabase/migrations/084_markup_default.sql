-- ECOROM 084: маржа компании (ustama) в цене заказа — решение Asad 28.11.2026.
--  Было: app_settings.markup = 0 и у схем «Chegirma 1/3/5%» маржа 0 → цена = tannarx × налог, прибыль компании в цену не попадала (видео клиента: Foyda −167).
--  Стало: маржа по умолчанию 35% (markup = 0.35), меньше минимума (markup_min = 0.35) поставить нельзя — только выше.
--  Формула цены (сайт, lib/pricing.ts itemPrice): маржа заказа идёт всегда, маржа схемы — поверх; схема даёт скидку.
--  Старые заказы (№2600–2602, маржа 0) не меняются: правило срабатывает только когда маржу ставят/меняют, а не при каждом сохранении.
--  Импорт истории (is_imported) правилом не проверяется.
-- Откат: drop trigger trg_03_order_markup on orders; drop function guard_order_markup(); update app_settings set value = '0' where key = 'markup'; delete from app_settings where key = 'markup_min'.

insert into public.app_settings (key, value) values ('markup', '0.35') on conflict (key) do update set value = '0.35'::jsonb;
insert into public.app_settings (key, value) values ('markup_min', '0.35') on conflict (key) do update set value = '0.35'::jsonb;
alter table public.orders alter column markup set default 0.35;   -- было 0.37 (registratsiya_add, заказы без явной маржи)

create or replace function public.guard_order_markup() returns trigger
language plpgsql set search_path = public as $$
declare v_min numeric := coalesce((select (value #>> '{}')::numeric from app_settings where key = 'markup_min'), 0.35);
begin
  if coalesce(new.is_imported, false) then return new; end if;
  if new.markup < v_min - 0.000001 and (tg_op = 'INSERT' or new.markup is distinct from old.markup) then
    raise exception 'Marja % dan kam bo''lishi mumkin emas (kiritildi: %)',
      rtrim(rtrim(to_char(v_min * 100, 'FM990.0'), '0'), '.') || '%', rtrim(rtrim(to_char(new.markup * 100, 'FM990.0'), '0'), '.') || '%';
  end if;
  return new;
end $$;

drop trigger if exists trg_03_order_markup on public.orders;
create trigger trg_03_order_markup before insert or update of markup on public.orders for each row execute function public.guard_order_markup();
