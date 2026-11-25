-- ECOROM 078: серверный поиск заказов (номер, клиент, телефон, адрес) — для экрана «Yakunlanganlar» и общего поиска; доска больше не грузит все заказы в браузер.
-- Выполняется с правами вызывающего (RLS): Rahbar видит всё, остальные — ничего. Откат: drop function public.orders_search(text, text[], int).
create or replace function public.orders_search(p_q text, p_statuses text[] default null, p_limit int default 200) returns table(id uuid)
language sql stable set search_path = public as $$
  select o.id
    from orders o join clients c on c.id = o.client_id
   where (p_statuses is null or o.status = any (p_statuses))
     and (o.order_no::text = btrim(p_q)
          or c.full_name ilike '%' || btrim(p_q) || '%'
          or coalesce(o.contact_phone, c.phone, '') ilike '%' || btrim(p_q) || '%'
          or coalesce(o.address, c.address, '') ilike '%' || btrim(p_q) || '%')
   order by o.order_no desc
   limit least(coalesce(p_limit, 200), 500)
$$;
revoke all on function public.orders_search(text, text[], int) from public, anon;
grant execute on function public.orders_search(text, text[], int) to authenticated;
