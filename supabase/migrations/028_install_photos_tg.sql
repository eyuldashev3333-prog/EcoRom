-- ECOROM 028: когда заказ стал «установлен», Rahbar получает в Telegram альбом фото установленных окон (до 10; решено 04.11.2026).
-- Сообщение «№ o'rnatildi» уходит как раньше; следом — уведомление с payload.photos (пути в закрытом хранилище install-photos),
-- бот сам берёт временные ссылки и отправляет альбом. Фото — «1 на окно» (install_item_photos), плюс старые фото по частям.
create or replace function public.notify_install_photos() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_paths text[]; v_client text;
begin
  select coalesce(array_agg(p), '{}') into v_paths from (
    select ip.photo_path as p from install_item_photos ip join order_items i on i.id = ip.order_item_id where i.order_id = new.id
    union all
    select m.photo_path from install_marks m join order_items i on i.id = m.order_item_id
     where i.order_id = new.id and m.photo_path is not null
       and not exists (select 1 from install_item_photos ip2 where ip2.order_item_id = i.id)
    limit 10) x;
  if coalesce(array_length(v_paths, 1), 0) = 0 then return new; end if;
  select full_name into v_client from clients where id = new.client_id;
  perform public.notify('rahbar', null, '📷 №' || new.order_no || ' ' || coalesce(v_client, '') || ' — o''rnatilgan oynalar',
                        jsonb_build_object('order_id', new.id, 'photos', to_jsonb(v_paths)));
  return new;
end $$;
drop trigger if exists trg_install_photos_tg on public.orders;
create trigger trg_install_photos_tg after update of status on public.orders
  for each row when (new.status = 'installed' and old.status is distinct from 'installed') execute function public.notify_install_photos();
