-- 056 — приход на складе прямо из строки материала («+ Kirim»): сколько куплено + сумма → остаток растёт, касса уменьшается.
-- Устроено как закупка из бота (purchase_confirm): закупка у служебного поставщика + платёж на ту же сумму.

create or replace function public.stock_receive(p_item uuid, p_part text, p_qty numeric, p_total numeric, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_sup uuid; v_p uuid; v_date date := (now() at time zone 'Asia/Tashkent')::date; v_me uuid := public.my_id();
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Miqdorni kiriting'; end if;
  if p_total is null or p_total <= 0 then raise exception 'Summani kiriting'; end if;
  if not exists (select 1 from catalog_items where id = p_item) then raise exception 'Material topilmadi'; end if;
  select id into v_sup from suppliers where name = 'Ombor / to''g''ridan-to''g''ri';
  if v_sup is null then
    insert into suppliers(name, note) values ('Ombor / to''g''ridan-to''g''ri', 'Ombor sahifasidan «Kirim» bilan yozilgan xaridlar') returning id into v_sup;
  end if;
  insert into purchases(supplier_id, purchased_at, total, delivery_cost, note, created_by)
  values (v_sup, v_date, p_total, 0, coalesce(nullif(trim(p_note), ''), 'Ombor: kirim'), v_me) returning id into v_p;
  insert into purchase_items(purchase_id, item_id, part, qty, unit_cost) values (v_p, p_item, coalesce(p_part, ''), p_qty, round(p_total / p_qty, 2));
  insert into stock_movements(item_id, part, qty, kind, purchase_id, unit_cost, created_by)
  values (p_item, coalesce(p_part, ''), p_qty, 'purchase', v_p, round(p_total / p_qty, 2), v_me);
  -- касса уменьшается через платёж поставщику (один раз)
  insert into supplier_payments(supplier_id, amount, paid_at, note, created_by)
  values (v_sup, p_total, v_date, 'Ombor kirim ' || v_p::text, v_me);
  return v_p;
end $$;
grant execute on function public.stock_receive(uuid, text, numeric, numeric, text) to authenticated;

-- отмена прихода: склад и касса возвращаются
create or replace function public.stock_receive_undo(p_purchase uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_pay uuid;
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  select id into v_pay from supplier_payments
   where note = 'Ombor kirim ' || p_purchase::text
     and not exists (select 1 from supplier_payments r where r.reverses_id = supplier_payments.id)
     and reverses_id is null;
  if v_pay is null then raise exception 'Bu xarid Ombor «Kirim» orqali yozilmagan yoki allaqachon bekor qilingan'; end if;
  perform public.reverse_purchase(p_purchase, 'Ombor kirim bekor qilindi');
  perform public.reverse_supplier_payment(v_pay, 'Ombor kirim bekor qilindi');
end $$;
grant execute on function public.stock_receive_undo(uuid) to authenticated;
