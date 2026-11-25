-- Полная очистка рабочих данных (решение Asad 24.11.2026): заказы, клиенты, деньги, склад → 0.
-- Остаются: сотрудники, каталог и цены, настройки, этапы, категории расходов, поставщики (список), нумерация заказов.
-- Перед запуском обязателен бэкап: node scripts/backup.mjs --no-send (восстановление: scripts/restore.mjs).
begin;
alter table payments disable trigger trg_nomut_payments;
alter table expenses disable trigger trg_nomut_expenses;
alter table purchases disable trigger trg_nomut_purchases;
alter table purchase_items disable trigger trg_nomut_purchase_items;
alter table stock_movements disable trigger trg_nomut_stock_movements;
alter table supplier_payments disable trigger trg_nomut_supplier_payments;
alter table salary_payouts disable trigger trg_nomut_salary_payouts;

-- деньги и склад
delete from payments;
delete from expenses;
delete from expense_drafts;
delete from salary_payouts;
delete from payroll_accruals;
delete from payroll_months;
delete from supplier_payments;
delete from purchase_items;
delete from purchases;
delete from purchase_drafts;
delete from stock_movements;
delete from offcuts;
-- заказы и всё, что к ним привязано
delete from install_order_photos;
delete from glass_breakages;
delete from service_tickets;
delete from orders;
delete from clients;
delete from legacy_savdo;
-- служебное
delete from attendance_absences;
delete from accept_late;
delete from bot_pending;
delete from notifications;
delete from audit_log;

alter table payments enable trigger trg_nomut_payments;
alter table expenses enable trigger trg_nomut_expenses;
alter table purchases enable trigger trg_nomut_purchases;
alter table purchase_items enable trigger trg_nomut_purchase_items;
alter table stock_movements enable trigger trg_nomut_stock_movements;
alter table supplier_payments enable trigger trg_nomut_supplier_payments;
alter table salary_payouts enable trigger trg_nomut_salary_payouts;
commit;
