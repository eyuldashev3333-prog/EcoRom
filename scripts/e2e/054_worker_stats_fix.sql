-- ECOROM 054: исправление типа в worker_stats (дни пропусков — numeric). Та же функция, что в 049.
notify pgrst, 'reload schema';
