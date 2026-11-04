-- ECOROM 022: возврат предоплаты по отменённому заказу (решает Rahbar вручную).
-- Возврат = встречная запись к оплате на любую часть суммы (не больше внесённой); одна на оплату — остаток остаётся заводу.
-- Касса уменьшается на возвращённое (как при обычной отмене оплаты).
create or replace function public.refund_payment(p_payment uuid, p_amount numeric, p_note text default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_orig payments; v_status text; v_id uuid;
begin
  if not public.is_rahbar() then raise exception 'Faqat rahbar'; end if;
  select * into v_orig from payments where id = p_payment;
  if v_orig.id is null then raise exception 'To''lov topilmadi'; end if;
  if v_orig.reverses_id is not null then raise exception 'Bu bekor qilish yozuvi'; end if;
  if exists (select 1 from payments where reverses_id = p_payment) then raise exception 'Allaqachon qaytarilgan yoki bekor qilingan'; end if;
  select status into v_status from orders where id = v_orig.order_id;
  if v_status <> 'cancelled' then raise exception 'Qaytarish faqat bekor qilingan buyurtmada'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > v_orig.amount then raise exception 'Summa noto''g''ri (1 .. %)', v_orig.amount; end if;
  insert into payments(order_id, amount, paid_at, note, received_by, reverses_id)
  values (v_orig.order_id, -round(p_amount, 2), current_date,
          coalesce(nullif(trim(p_note), ''), 'Qaytarildi') || case when p_amount < v_orig.amount then ' (qisman; zavodda qoldi ' || to_char(v_orig.amount - p_amount, 'FM999G999G999G990') || ')' else '' end,
          public.my_id(), p_payment)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.refund_payment(uuid, numeric, text) from public, anon;
grant execute on function public.refund_payment(uuid, numeric, text) to authenticated;
