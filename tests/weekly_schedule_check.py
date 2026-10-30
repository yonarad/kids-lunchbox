"""Authenticated integration checks. Run: python3 tests/weekly_schedule_check.py.

Uses temporary household fixtures and removes them in finally. Never edits
existing children's schedules or selections. Screenshots remain under /tmp.
"""
import asyncio
import json
import os
from pathlib import Path

from playwright.async_api import async_playwright


SETUP = """async () => {
  const {supabase: db} = await import('/src/integrations/supabase/client.ts');
  const {getMyHouseholdId, todayInIsrael} = await import('/src/lib/household.ts');
  const {data:{user}} = await db.auth.getUser();
  if (!user) throw Error('Authenticated session required');
  const h = await getMyHouseholdId(user.id);
  const check = (result) => { if(result.error) throw Error(result.error.message); return result.data; };
  const settings = check(await db.from('household_settings').select('reset_hour').eq('household_id',h).maybeSingle());
  const date = todayInIsrael(settings?.reset_hour ?? 12);
  const dow = new Date(date+'T00:00:00Z').getUTCDay();
  const baseline = check(await db.from('selections').select('child_id,food_item_id,selection_date').eq('household_id',h).order('id'));
  window.weeklyTest = {db,h,date,dow,check,baseline,children:[],foods:[],categories:[]};
  const t = window.weeklyTest;
  t.children = check(await db.from('children').insert([
    {household_id:h,name:'בדיקת מערכת שבועית'},
    {household_id:h,name:'בדיקת בחירה חופשית'},
    {household_id:h,name:'בדיקת בחירה ידנית'},
    {household_id:h,name:'בדיקת אבא בוחר'},
    {household_id:h,name:'בדיקת מגבלות'}
  ]).select());
  t.categories = check(await db.from('categories').insert([
    {household_id:h,name:'בדיקת מערכת',max_selections:1},
    {household_id:h,name:'בדיקת מגבלות',max_selections:20}
  ]).select());
  const food = (name, cat, more={}) => ({household_id:h,category_id:cat,name,is_active:true,allowed_days:null,weekly_limit:null,...more});
  t.foods = check(await db.from('food_items').insert([
    food('פריט בדיקה שבועית',t.categories[0].id),
    food('פריט נוסף לבדיקה',t.categories[0].id),
    food('פריט לא פעיל לבדיקה',t.categories[1].id,{is_active:false}),
    food('פריט ביום אחר לבדיקה',t.categories[1].id,{allowed_days:[(dow+1)%7]}),
    food('פריט במגבלה שבועית',t.categories[1].id,{weekly_limit:1}),
    food('פריט זמין לבדיקה',t.categories[1].id,{allowed_days:[]}),
    food('פריט ביום הנכון לבדיקה',t.categories[1].id,{allowed_days:[dow]})
  ]).select());
  return {child:t.children[0].id,date,dow};
}"""

DB_CHECKS = """async () => {
  const t=window.weeklyTest, {db,h,date,dow,check,children:c,foods:f}=t;
  const passed=[];
  const assert=(label,condition)=>{if(!condition) throw Error(label);passed.push(label);};
  const save=(id,enabled,items)=>db.rpc('save_weekly_schedule',{_child_id:id,_enabled:enabled,_items:items});
  const fill=()=>db.rpc('fill_weekly_schedules',{_household_id:h});
  const sels=async id=>check(await db.from('selections').select('food_item_id').eq('child_id',id).eq('selection_date',date));
  const items=[{weekday:dow,food_item_id:f[0].id}];
  assert('Parent save persists enabled schedule',check(await db.from('child_weekly_schedules').select('enabled').eq('child_id',c[0].id).single()).enabled===true);
  assert('Scheduled food fills lunchbox',JSON.stringify(await sels(c[0].id))===JSON.stringify([{food_item_id:f[0].id}]));
  check(await fill()); check(await fill());
  assert('Repeated filling never duplicates foods',(await sels(c[0].id)).length===1);
  check(await db.from('selections').delete().eq('child_id',c[0].id).eq('selection_date',date));
  check(await fill());
  assert('Manual removal is not restored',(await sels(c[0].id)).length===0);
  check(await save(c[1].id,false,items)); check(await fill());
  assert('Disabled child stays empty',(await sels(c[1].id)).length===0);
  check(await db.from('selections').insert({household_id:h,child_id:c[2].id,food_item_id:f[1].id,selection_date:date}));
  check(await save(c[2].id,true,items)); check(await fill());
  assert('Manual selection is preserved',JSON.stringify(await sels(c[2].id))===JSON.stringify([{food_item_id:f[1].id}]));
  check(await db.from('parent_picks').insert({household_id:h,child_id:c[3].id,selection_date:date}));
  check(await save(c[3].id,true,items)); check(await fill());
  assert('Dad chooses marker prevents automatic replacement',(await sels(c[3].id)).length===0 && check(await db.from('parent_picks').select('child_id').eq('child_id',c[3].id).eq('selection_date',date)).length===1);
  const previous=new Date(date+'T00:00:00Z'); previous.setUTCDate(previous.getUTCDate()-1);
  if(dow>0) check(await db.from('selections').insert({household_id:h,child_id:c[4].id,food_item_id:f[4].id,selection_date:previous.toISOString().slice(0,10)}));
  check(await save(c[4].id,true,f.map(food=>({weekday:dow,food_item_id:food.id}))));
  check(await Promise.all([fill(),fill(),fill()]).then(r=>({data:r.map(check)})));
  const selected=(await sels(c[4].id)).map(r=>r.food_item_id);
  assert('Category maximum is one',selected.filter(id=>[f[0].id,f[1].id].includes(id)).length===1);
  assert('Inactive food is excluded',!selected.includes(f[2].id));
  assert('Wrong weekday is excluded',!selected.includes(f[3].id));
  assert('Weekly limit respects Sunday boundary',selected.includes(f[4].id)===(dow===0));
  assert('Empty allowed days permits food',selected.includes(f[5].id));
  assert('Matching weekday permits food',selected.includes(f[6].id));
  check(await save(c[4].id,false,[])); check(await fill());
  assert('Disabling preserves already selected foods',JSON.stringify(await sels(c[4].id))===JSON.stringify(selected.map(food_item_id=>({food_item_id}))));
  const before=check(await db.from('weekly_schedule_items').select('*').eq('child_id',c[2].id));
  const invalid=await save(c[2].id,true,[{weekday:7,food_item_id:f[0].id}]);
  assert('Weekday seven is rejected',!!invalid.error);
  assert('Rejected save is atomic',JSON.stringify(check(await db.from('weekly_schedule_items').select('*').eq('child_id',c[2].id)))===JSON.stringify(before));
  assert('Nonexistent food is rejected',!!(await save(c[2].id,true,[{weekday:dow,food_item_id:crypto.randomUUID()}])).error);
  assert('Nonarray schedule is rejected',!!(await save(c[2].id,true,{})).error);
  assert('Oversized schedule is rejected',!!(await save(c[2].id,true,Array(351).fill(items[0]))).error);
  const {createClient}=await import('/node_modules/.vite/deps/@supabase_supabase-js.js');
  const anon=createClient(db.supabaseUrl,db.supabaseKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  assert('Anonymous schedule save is denied',!!(await anon.rpc('save_weekly_schedule',{_child_id:c[0].id,_enabled:true,_items:items})).error);
  assert('Anonymous schedule read reveals no rows',(await anon.from('child_weekly_schedules').select('*')).data?.length===0 || !!(await anon.from('child_weekly_schedules').select('*')).error);
  const originals=check(await db.from('selections').select('child_id,food_item_id,selection_date').eq('household_id',h).order('id')).filter(r=>!c.some(child=>child.id===r.child_id));
  const normalize=rows=>rows.map(r=>[r.child_id,r.food_item_id,r.selection_date].join(':')).sort().join('|');
  assert('Existing children selections remain unchanged',normalize(originals)===normalize(t.baseline));
  return passed;
}"""

CLEANUP = """async () => {
  const t=window.weeklyTest;if(!t)return;
  const {db,check}=t;
  if(t.children.length) check(await db.from('children').delete().in('id',t.children.map(c=>c.id)));
  if(t.foods.length) check(await db.from('food_items').delete().in('id',t.foods.map(f=>f.id)));
  if(t.categories.length) check(await db.from('categories').delete().in('id',t.categories.map(c=>c.id)));
}"""


async def main():
    output = Path('/tmp/browser/weekly-check')
    output.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={'width': 1280, 'height': 1800})
        page = await context.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        if os.environ.get('LOVABLE_BROWSER_AUTH_STATUS') == 'injected':
            storage_key = os.environ['LOVABLE_BROWSER_SUPABASE_STORAGE_KEY']
            session_json = os.environ['LOVABLE_BROWSER_SUPABASE_SESSION_JSON']
            cookies = json.loads(os.environ.get('LOVABLE_BROWSER_SUPABASE_COOKIES_JSON') or '[]')
        else:
            with open(os.path.expanduser('~/.cache/lovable-auth/session.json')) as file:
                minted = json.load(file)
            storage_key = minted['storage_key']
            session_json = json.dumps(minted['session'])
            cookies = minted.get('cookies') or []
        if cookies:
            await context.add_cookies([{**c, 'url': 'http://localhost:8080'} for c in cookies])
        await page.goto('http://localhost:8080')
        await page.evaluate('([k,v])=>localStorage.setItem(k,v)', [storage_key, session_json])
        await page.goto('http://localhost:8080/app/schedule')
        await page.get_by_role('heading', name='מערכת שבועית', exact=True).wait_for()
        fixture = None
        # Keep fixtures in an independent page; route navigation must not lose cleanup state.
        helper = await context.new_page()
        await helper.goto('http://localhost:8080')
        try:
            fixture = await helper.evaluate(SETUP)
            await page.reload()
            await page.get_by_role('combobox').click()
            await page.get_by_role('option', name='🙂 בדיקת מערכת שבועית', exact=True).click()
            names = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
            await page.get_by_role('tab', name=names[fixture['dow']]+' 0 פריטים', exact=True).click()
            await page.get_by_role('button', name='פריט בדיקה שבועית, יום '+names[fixture['dow']], exact=True).click()
            await page.locator('#schedule-enabled').click()
            await page.get_by_role('button', name='שמירה', exact=True).click()
            await page.get_by_text('המערכת השבועית נשמרה', exact=True).wait_for()
            await page.reload()
            await page.get_by_role('combobox').click()
            await page.get_by_role('option', name='🙂 בדיקת מערכת שבועית', exact=True).click()
            await page.get_by_role('tab', name=names[fixture['dow']]+' 1 פריטים', exact=True).click()
            assert await page.locator('#schedule-enabled').is_checked(), 'Enabled state did not persist'
            assert await page.get_by_role('button', name='פריט בדיקה שבועית, יום '+names[fixture['dow']], exact=True).get_attribute('aria-pressed') == 'true'
            print('PASS: UI save and reload preserves schedule')
            await page.screenshot(path=str(output/'saved.png'))
            await page.goto('http://localhost:8080/app/prep')
            await page.get_by_text('בדיקת מערכת שבועית', exact=True).wait_for()
            await page.get_by_text('פריט בדיקה שבועית', exact=True).wait_for()
            print('PASS: Scheduled food reads back through preparation UI')
            await page.screenshot(path=str(output/'prep.png'))
            for label in await helper.evaluate(DB_CHECKS):
                print('PASS:', label)
            await page.set_viewport_size({'width': 390, 'height': 844})
            await page.goto('http://localhost:8080/app/schedule')
            await page.get_by_role('heading', name='מערכת שבועית', exact=True).wait_for()
            await page.screenshot(path=str(output/'mobile.png'))
            assert await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'Horizontal overflow on mobile'
            assert not errors, 'Browser errors: '+str(errors)
            print('PASS: Mobile layout and no browser exceptions')
        finally:
            await helper.evaluate(CLEANUP)
            print('Temporary test data removed')
            await browser.close()


if __name__ == '__main__':
    asyncio.run(main())