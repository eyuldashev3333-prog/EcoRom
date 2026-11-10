import { chromium } from 'file:///D:/Eco Rom/scripts/node_modules/playwright-core/index.mjs'
import { PW, write, sql, check, info, get } from './h.mjs'
const R='t_rah'
const s = (await write(R,'POST','catalog_items',{kind:'system',name:'TEST sys',unit:'m',price:0,params:{frame:10000,impost:8000,sash:12000,bead:3000,gasket:1000}})).data[0]
const g = (await write(R,'POST','catalog_items',{kind:'glass',name:'TEST glass',unit:'m2',price:150000,params:{}})).data[0]
const BASE='http://localhost:4173/EcoRom/#'
const br = await chromium.launch({ channel:'msedge', headless:true }); const page=(await br.newContext({viewport:{width:1440,height:1000}})).newPage ? await (await br.newContext({viewport:{width:1440,height:1000}})).newPage() : null
const errs=[]; page.on('pageerror',e=>errs.push(e.message)); page.on('response',r=>{if(r.status()>=400)errs.push(r.status()+' '+r.url().slice(-100))})
const dialogs=[]; page.on('dialog',d=>{dialogs.push(d.message().slice(0,90)); d.accept()})
await page.goto(BASE+'/'); await page.fill('input[autocomplete=username]',R); await page.fill('input[type=password]',PW); await page.click('form.login button'); await page.waitForTimeout(2500)
await page.goto(BASE+'/orders/new'); await page.waitForTimeout(2000)
await page.fill('label:has-text("Mijoz ismi") input','TEST Freeze'); 
await page.click('text=+ Oyna qo\'shish'); await page.waitForTimeout(1000)
await page.selectOption('label:has-text("Oyna tizimi") select',{label:'TEST sys'}); await page.selectOption('label:has-text("Oyna paket") select',{label:'TEST glass'}); await page.waitForTimeout(500)
await page.click('button:has-text("Saqlash")'); await page.waitForTimeout(2500)
const id = page.url().split('/orders/')[1]
const c1=(await sql(`select calc_cost, calc_suggested from orders where id='${id}'`))[0]; console.log('saved', c1)
// цена каталога выросла
await write(R,'PATCH',`catalog_items?id=eq.${g.id}`,{price:300000})
await page.reload(); await page.waitForTimeout(3000)
const txt=(await page.locator('main').innerText()).replace(/\s+/g,' ')
check('F1','баннер «Katalog narxlari o\'zgargan» показан', /Katalog narxlari o'zgargan/.test(txt), txt.match(/Katalog narxlari.{0,80}/)?.[0])
// сохранить без правки окон (изменить только заметку)
await page.fill('label:has-text("Izoh") textarea','note changed'); await page.click('button:has-text("Saqlash")'); await page.waitForTimeout(2500)
const c2=(await sql(`select calc_cost, calc_suggested from orders where id='${id}'`))[0]
check('F2','сохранение без правки окон НЕ меняет себестоимость', Number(c2.calc_cost)===Number(c1.calc_cost), JSON.stringify(c2))
// пересчитать
await page.click('button:has-text("Qayta hisoblash")'); await page.waitForTimeout(500); await page.click('button:has-text("Saqlash")'); await page.waitForTimeout(2500)
const c3=(await sql(`select calc_cost from orders where id='${id}'`))[0]
check('F3','после «Qayta hisoblash» себестоимость стала по новой цене', Number(c3.calc_cost)>Number(c1.calc_cost), JSON.stringify(c3))
console.log('dialogs',dialogs,'errs',errs)
await page.screenshot({path:'shots/freeze.png',fullPage:true})
await write(R,'DELETE',`catalog_items?id=in.(${s.id},${g.id})`)
await br.close()
