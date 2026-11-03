// Переменные: в GitHub Actions — из secrets (process.env), локально — из .env.local в корне проекта.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1').replace(/%20/g, ' ')

const file = join(ROOT, '.env.local')
const local = existsSync(file)
  ? Object.fromEntries(
      readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
    )
  : {}

export const env = (key) => process.env[key] || local[key] || ''

// порядок важен для восстановления (сначала справочники, потом зависимые)
export const TABLES = [
  'employees', 'app_settings', 'clients', 'catalog_items', 'stages', 'expense_categories', 'suppliers',
  'orders', 'order_items', 'item_stage_marks', 'order_material_checks',
  'install_jobs', 'install_job_members', 'install_marks', 'glass_breakages', 'service_tickets',
  'purchases', 'purchase_items', 'supplier_payments', 'stock_movements',
  'expenses', 'payments', 'pay_rules', 'salary_payouts', 'notifications', 'audit_log',
]
