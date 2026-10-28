// Optional browser verification: npm install --no-save playwright-core outside
// the plugin, then set OUTLOOK_PLAYWRIGHT_MODULE and OUTLOOK_TEST_CHROMIUM.
// OUTLOOK_HEADED=1 runs in desktop Chrome for visual inspection.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.OUTLOOK_PLAYWRIGHT_MODULE || 'playwright-core');
const root=new URL('../../outlook-mail/',import.meta.url);
const manifest=JSON.parse(await fs.readFile(new URL('ghost.json',root),'utf8'));
const screenshots=process.env.OUTLOOK_SCREENSHOTS_DIR
  ? pathToFileURL(process.env.OUTLOOK_SCREENSHOTS_DIR.replace(/\/$/,'')+'/')
  : new URL('./screenshots/',import.meta.url);
const browser=await chromium.launch({...(process.env.OUTLOOK_TEST_CHROMIUM?{executablePath:process.env.OUTLOOK_TEST_CHROMIUM}:{}),headless:process.env.OUTLOOK_HEADED !== '1'});
const page=await browser.newPage({viewport:{width:460,height:940}});
const errors=[],unexpected=[],calls=[];
page.on('pageerror',e=>errors.push(e.message));
let entries=[{key:'outlook_global',clientConfigured:false,clientCustom:false,accounts:[]},{key:'outlook_china',clientConfigured:false,clientCustom:false,accounts:[]}];
let config={sdk_account:{id:'sdk:old',login:'legacy@example.test'},global_connection:'sdk',keep:'preference'},locale='zh-CN',mode='light',failLoad=false,failDisconnect=false,failClient=false,failDefault=false;
let nextAccount='g1';
const hostCSS='html,body{height:auto!important;min-height:0!important;width:100%!important;max-width:100%!important;overflow-x:hidden!important;}*,*::before,*::after{box-sizing:border-box!important;min-width:0!important;max-width:100%!important;}';
const theme={light:':root{--text-primary:#202020;--text-secondary:#646464;--surface:#fff;--surface-elevated:#fff;--surface-chip:#e5e5e5;--surface-hover:#e5e5e5;--text-placeholder:#c4c4c4;--border-default:#dededb;--accent-cta-bg:#262626;--accent-pure-cta-fg:#fff}body{background:#fafaf8}',dark:':root{--text-primary:#ededeb;--text-secondary:#aaa;--surface:#262626;--surface-elevated:#2c2c2a;--surface-chip:#3c3c3a;--surface-hover:#3c3c3a;--text-placeholder:#525252;--border-default:#464644;--accent-cta-bg:#eee;--accent-pure-cta-fg:#171717}body{background:#202020}'};
await page.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url()),path=u.pathname;
  const reply=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:status===204?'':JSON.stringify(data)});
  if(u.origin!=='https://outlook.example.test'){unexpected.push(req.url());return route.abort();}
  if(path==='/app-context')return reply({context:{locale}});
  if(path==='/oauth')return failLoad?reply({},503):reply(entries);
  if(path==='/kv'){
    if(req.method()==='PUT'){if(failDefault)return reply({},503);config=JSON.parse(req.postData());calls.push({path,method:'PUT'});return reply(null,204);}
    return reply(config);
  }
  if(path.startsWith('/oauth/')){
    calls.push({path,method:req.method(),body:req.postData()});
    const [,,key,operation,id]=path.split('/');const e=entries.find(e=>e.key===key);assert(e);
    if(operation==='client'){
      if(failClient)return reply({},503);
      e.clientCustom=req.method()==='PUT';e.clientConfigured=e.clientCustom||Boolean(manifest.network.secrets.find(s=>s.key===key).oauth.clientId);
      e.accounts.forEach(a=>a.status='expired');return reply(null,204);
    }
    if(operation==='connect'){
      let a=e.accounts.find(a=>a.id===nextAccount);
      if(a){a.status='connected';a.scopeStale=false;}
      else {a={id:nextAccount,label:'<img src=x onerror=alert(1)> '+nextAccount+'@example.test',status:'connected',isDefault:e.accounts.length===0};e.accounts.push(a);}
      return reply({ok:true,account:a});
    }
    if(operation==='accounts'){
      if(failDisconnect)return reply({},503);
      e.accounts=e.accounts.filter(a=>a.id!==decodeURIComponent(id));return reply(null,204);
    }
    if(operation==='default'){const b=JSON.parse(req.postData());e.accounts.forEach(a=>a.isDefault=a.id===b.accountId);return reply(null,204);}
    unexpected.push(path);return reply({},404);
  }
  const filename=path==='/'?'settings.html':path.slice(1);
  if(!/^(settings\.(html|css|js)|ui\/(en|zh-CN|ja|ko)\.json)$/.test(filename)){unexpected.push(path);return reply({},404);}
  let body=await fs.readFile(new URL(filename,root));
  if(filename.endsWith('.html'))body=Buffer.from(body.toString().replace('</head>','<style>'+hostCSS+theme[mode]+'</style></head>'));
  return route.fulfill({status:200,body,headers:{'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:"},contentType:filename.endsWith('.html')?'text/html':filename.endsWith('.css')?'text/css':filename.endsWith('.json')?'application/json':'text/javascript'});
});
const allStrings=Object.fromEntries(await Promise.all(['zh-CN','en','ja','ko'].map(async lang=>[lang,JSON.parse(await fs.readFile(new URL('ui/'+lang+'.json',root),'utf8'))])));
const stringsFor=(lang,key)=>allStrings[lang][key];
const settled=()=>page.waitForFunction(()=>document.querySelector('#cloud')?.disabled === false);
const selectCloud=async cloud=>{await page.locator('#cloud').click();await page.locator('#service-menu [data-cloud="'+cloud+'"]').click();await settled();};
const openActions=async (cloud,id)=>{const actions=page.locator('.account[data-cloud="'+cloud+'"][data-account-id="'+id+'"] .account-actions');if(await actions.getAttribute('aria-expanded') !== 'true')await actions.click();};
try {
  // Ordinary global users can sign in with the bundled application without
  // opening administrator settings or writing a custom Client ID.
  entries[0].clientConfigured=Boolean(manifest.network.secrets.find(s=>s.key==='outlook_global').oauth.clientId);
  await page.goto('https://outlook.example.test/');await settled();
  assert(!await page.locator('#connect').isDisabled());
  assert.equal(await page.locator('#advanced > button').getAttribute('aria-expanded'),'false');
  assert.match(await page.locator('#setup-note').textContent(),/无需配置应用/);
  assert.equal(await page.locator('#advanced > button .disclosure-label').textContent(),'连接应用');
  await fs.mkdir(screenshots,{recursive:true});
  await page.screenshot({path:fileURLToPath(new URL('outlook-builtin-app-ready.png',screenshots)),fullPage:true});
  // Selection is transient, the persisted default is a separate menu action.
  await page.locator('#cloud').focus();await page.keyboard.press('ArrowDown');
  assert.equal(await page.locator('#cloud').getAttribute('aria-expanded'),'true');
  assert.equal(await page.locator('#default-cloud').getAttribute('aria-disabled'),'true');
  await page.waitForFunction(()=>document.activeElement?.getAttribute('data-cloud')==='global');
  await page.keyboard.press('ArrowDown');await page.waitForFunction(()=>document.activeElement?.getAttribute('data-cloud')==='china');await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.querySelector('#service-name').textContent.includes('世纪互联'));
  assert.match(await page.locator('#service-name').textContent(),/世纪互联/);
  assert.equal(config.default_cloud,undefined);assert.equal(calls.length,0);
  await page.locator('#cloud').click();
  assert.equal(await page.locator('#service-menu [data-cloud="china"]').getAttribute('aria-checked'),'true');
  assert(await page.locator('#service-menu [data-cloud="global"] .default-badge').isVisible());
  await page.screenshot({path:fileURLToPath(new URL('outlook-service-menu.png',screenshots)),fullPage:true});
  await page.keyboard.press('Escape');await page.waitForFunction(()=>document.activeElement?.id==='cloud');
  assert(await page.locator('#required-application').isVisible());
  await page.locator('#cloud').click();
  await page.waitForFunction(()=>document.activeElement?.getAttribute('data-cloud')==='china');
  await page.locator('#client-id').click({position:{x:8,y:20}});
  await page.waitForFunction(()=>document.activeElement?.id==='client-id',{},{timeout:2000});
  await page.screenshot({path:fileURLToPath(new URL('outlook-china-setup.png',screenshots)),fullPage:true});
  await page.locator('#client-id').fill('unsaved-china');await selectCloud('global');
  assert.equal(await page.locator('#client-id').inputValue(),'');
  await page.locator('#connect').click();await settled();
  assert.equal(calls.length,1);assert.equal(calls[0].path,'/oauth/outlook_global/connect');
  entries[0].clientConfigured=false;entries[0].accounts=[];calls.length=0;
  await page.goto('https://outlook.example.test/');await settled();
  const registeredRedirect=key=>'http://127.0.0.1:'+manifest.network.secrets.find(s=>s.key===key).oauth.redirectPort+'/callback';
  assert.equal(await page.locator('#redirect').inputValue(),registeredRedirect('outlook_global'));
  assert(await page.locator('#connect').isDisabled());assert(await page.locator('#required-application').isVisible());
  assert.match(await page.locator('#required-application').textContent(),/先配置连接应用/);
  assert.doesNotMatch(await page.locator('#accounts').textContent(),/legacy@example|sdk:old/);
  assert.equal(await page.locator('#connection-mode,#sdk-options').count(),0);
  await page.locator('#client-id').fill('invalid');await page.locator('#save-client').click();await settled();assert.equal(calls.length,0);
  await page.locator('#client-id').fill('12345678-1234-1234-1234-123456789abc');await page.locator('#save-client').click();await settled();
  assert.equal(calls.at(-1).path,'/oauth/outlook_global/client');assert(!calls.at(-1).body.includes('clientSecret'));assert.equal(await page.locator('#client-id').inputValue(),'');
  // The displayed registration hint is not an OAuth request target or input.
  // Even when changed in the DOM, sign-in delegates only to Host /oauth.
  await page.locator('#redirect').evaluate(el=>{el.value='https://callback.example.test/changed';});
  await page.locator('#connect').click();await settled();
  assert.equal(calls.at(-1).path,'/oauth/outlook_global/connect');assert.equal(await page.locator('#accounts img').count(),0);
  assert.equal(calls.at(-1).body,null);
  const row=(cloud,id)=>page.locator('.account[data-cloud="'+cloud+'"][data-account-id="'+id+'"]');
  assert.equal(await page.locator('#accounts > #connect').count(),1,'connect belongs to the account card footer');
  assert.equal(await page.locator('#connect').textContent(),'连接另一个账户');
  entries[0].accounts[0].label='  · g1@example.test';
  await page.reload();await settled();
  assert.equal(await row('global','g1').locator('.account-name').textContent(),'g1@example.test');
  assert.equal(await row('global','g1').locator('.account-status').count(),0,'healthy rows stay compact');
  await openActions('global','g1');
  assert.match(await page.locator('.account-details').textContent(),/Outlook.*已连接.*此服务默认账号/);
  await page.keyboard.press('Escape');
  nextAccount='g2';await page.locator('#connect').click();await settled();
  await selectCloud('china');await settled();assert(await page.locator('#connect').isDisabled());
  assert.equal(await page.locator('#redirect').inputValue(),registeredRedirect('outlook_china'));
  assert.equal(await page.locator('.account').count(),2);
  assert.equal(await page.locator('#portal').getAttribute('href'),'https://portal.azure.cn');
  failClient=true;
  await page.locator('#client-id').fill('abcdef01-1234-1234-1234-123456789abc');await page.locator('#save-client').click();await settled();
  assert(await page.locator('#required-application').isVisible());
  assert.equal(await page.locator('#client-id').inputValue(),'abcdef01-1234-1234-1234-123456789abc');
  assert.equal(entries[1].clientConfigured,false);
  failClient=false;
  const beforeDoubleSave=calls.length;
  await page.evaluate(()=>{document.querySelector('#save-client').click();document.querySelector('#save-client').click();document.querySelector('#cloud').click();});
  await settled();assert.equal(calls.length,beforeDoubleSave+1);
  assert.match(await page.locator('#service-name').textContent(),/世纪互联/);
  assert(!await page.locator('#required-application').isVisible());
  assert(await page.locator('#connect').isVisible());
  const beforeCancel=calls.length;
  await page.locator('#edit-client').click();await page.locator('#client-id').fill('discard-this-edit');
  await page.locator('#cancel-client').click();
  assert.equal(await page.locator('#client-id').inputValue(),'');assert.equal(calls.length,beforeCancel);
  await page.locator('#more > button').click();
  for(const id of ['c1','c2']){nextAccount=id;await page.locator('#connect').click();await settled();}
  assert.deepEqual(entries.map(e=>e.accounts.map(a=>a.id)),[['g1','g2'],['c1','c2']]);
  assert.equal(await page.locator('.account').count(),4);
  await selectCloud('global');await settled();
  // China row actions must stay in China even with the global add-account selector.
  await openActions('china','c2');await page.getByRole('menuitem',{name:'设为默认',exact:true}).click();await settled();
  assert.equal(calls.at(-1).path,'/oauth/outlook_china/default');
  assert.equal(entries[0].accounts.find(a=>a.isDefault).id,'g1');
  assert.equal(entries[1].accounts.find(a=>a.isDefault).id,'c2');
  entries[1].accounts[0].status='expired';nextAccount='c1';
  await page.reload();await settled();
  await row('china','c1').getByRole('button',{name:'重新连接',exact:true}).click();await settled();
  assert.equal(calls.at(-1).path,'/oauth/outlook_china/connect');
  assert.equal(entries[1].accounts.length,2);assert.equal(entries[1].accounts[0].status,'connected');
  assert.equal(entries[1].accounts.find(a=>a.isDefault).id,'c2');
  const kvWrites=()=>calls.filter(c=>c.path==='/kv').length;
  const before=kvWrites();failDisconnect=true;
  await openActions('china','c1');await page.getByRole('menuitem',{name:'断开',exact:true}).click();await settled();
  assert.equal(await page.locator('.account').count(),4);assert.equal(kvWrites(),before);
  await page.waitForFunction(()=>document.activeElement?.matches('.account[data-cloud="china"][data-account-id="c1"] .account-actions'));
  failDisconnect=false;await openActions('china','c1');await page.getByRole('menuitem',{name:'断开',exact:true}).click();await settled();
  assert.equal(calls.at(-1).path,'/oauth/outlook_china/accounts/c1');
  assert.deepEqual(entries.map(e=>e.accounts.map(a=>a.id)),[['g1','g2'],['c2']]);assert.equal(kvWrites(),before);
  assert.equal(await page.locator('.account').count(),3);
  await page.waitForFunction(()=>document.activeElement?.id==='accounts-title');
  await selectCloud('china');await settled();nextAccount='c1';
  await page.locator('#connect').click();await settled();
  failDefault=true;await page.locator('#cloud').click();await page.locator('#default-cloud').click();await settled();
  assert.equal(config.default_cloud,undefined);
  await page.locator('#cloud').click();assert(await page.locator('#service-menu [data-cloud="global"] .default-badge').isVisible());
  await page.keyboard.press('Escape');failDefault=false;
  await page.locator('#cloud').click();await page.locator('#default-cloud').click();await settled();assert.equal(config.default_cloud,'china');assert.equal(config.keep,'preference');
  for(const e of entries)for(const a of e.accounts)a.label=(e.key==='outlook_global'?'全球演示':'中国区演示')+' · '+a.id+'@example.test';
  await page.reload();await settled();assert.equal(await page.locator('.account').count(),4);
  await fs.mkdir(screenshots,{recursive:true});
  await page.screenshot({path:fileURLToPath(new URL('outlook-host-settings-light.png',screenshots)),fullPage:true});
  mode='dark';await page.reload();await settled();assert.equal(await page.locator('#service-name').textContent(),'Microsoft 365（世纪互联中国区）');
  await page.screenshot({path:fileURLToPath(new URL('outlook-host-settings-dark.png',screenshots)),fullPage:true});
  await page.locator('#edit-client').click();
  await page.screenshot({path:fileURLToPath(new URL('outlook-application-dark.png',screenshots)),fullPage:true});
  await page.locator('#reset-client').click();await settled();
  assert(await page.locator('#required-application').isVisible());assert(await page.locator('#connect').isHidden());
  assert.equal(await page.locator('.account').count(),4);
  await selectCloud('global');
  await row('china','c1').getByRole('button',{name:'重新连接',exact:true}).click();await settled();
  assert.match(await page.locator('#service-name').textContent(),/世纪互联/);
  assert(await page.locator('#required-application').isVisible());
  await page.locator('#client-id').fill('abcdef01-1234-1234-1234-123456789abc');await page.locator('#save-client').click();await settled();
  await selectCloud('global');await page.locator('#edit-client').click();await page.locator('#reset-client').click();await settled();
  assert(!await page.locator('#connect').isDisabled());assert(await page.locator('#required-application').isHidden());
  await page.setViewportSize({width:320,height:940});
  for(const lang of ['zh-CN','en','ja','ko','fr']){
    locale=lang;await page.reload();await settled();
    const expected=lang==='fr'?'en':lang;
    assert.equal(await page.locator('html').getAttribute('lang'),expected);
    const ui=JSON.parse(await fs.readFile(new URL('ui/'+expected+'.json',root),'utf8'));
    assert.equal(await page.locator('h1').textContent(),ui.title);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    await page.locator('#cloud').click();
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    const menu=await page.locator('#service-menu').boundingBox();assert(menu.x>=0&&menu.x+menu.width<=320);
    await page.keyboard.press('Escape');
    if(lang==='ja'||lang==='ko')await page.screenshot({path:fileURLToPath(new URL('outlook-host-settings-'+lang+'-narrow.png',screenshots)),fullPage:true});
  }
  // Reproduce Cindy's constrained auto-height guest, including clipping.
  // Checking scrollWidth alone misses controls clipped by the Host overflow rule.
  const fitHost = async width => {
    for (let i=0;i<4;i++) {
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const height=await page.evaluate(()=>{
        const b=document.body,sy=window.scrollY;
        let bottom=b.getBoundingClientRect().bottom;
        for(const child of b.children){const r=child.getBoundingClientRect();if(r.height>0)bottom=Math.max(bottom,r.bottom);}
        const h=sy+bottom;document.documentElement.style.overflowY=h>800?'auto':'hidden';
        return Math.max(48,Math.min(800,Math.ceil(h)));
      });
      await page.setViewportSize({width,height});
    }
  };
  const assertBounds = async () => {
    const clipped=await page.evaluate(()=>[...document.querySelectorAll('.button,.input,.disclosure-trigger,[role="menu"],.menu-item')].flatMap(e=>{
      if(!e.checkVisibility())return [];
      const r=e.getBoundingClientRect();
      return r.x < -1 || r.right > innerWidth+1 ? [{id:e.id,role:e.getAttribute('role'),x:r.x,right:r.right,width:innerWidth}] : [];
    }));
    assert.deepEqual(clipped,[],'visible control clipped horizontally');
  };
  for (const testMode of ['light','dark']) for (const lang of ['zh-CN','en','ja','ko']) for (const width of [280,320,360,460,720]) {
    mode=testMode;locale=lang;config.default_cloud='global';entries[1].clientConfigured=false;entries[1].clientCustom=false;
    entries[0].accounts[0].label='a-very-long-mailbox-name.without-spaces@example.test';
    entries[0].accounts[0].status='expired';
    await page.setViewportSize({width,height:160});await page.reload();await settled();await fitHost(width);await assertBounds();
    if(width===720){
      const selector=await page.locator('#cloud').boundingBox();
      assert(selector.width<width/2,'service trigger uses content width, not 62% of the header');
      if(lang==='zh-CN')await page.screenshot({path:fileURLToPath(new URL(`outlook-${testMode}-720-accounts.png`,screenshots)),fullPage:true});
    }
    const rowBefore=await row('global','g1').boundingBox();
    await openActions('global','g1');await page.getByRole('menuitem',{name:stringsFor(lang,'disconnect'),exact:true}).waitFor();
    await assertBounds();
    const rowAfter=await row('global','g1').boundingBox();assert.equal(rowAfter.height,rowBefore.height,'account menu must not reflow the row');
    const actions=await page.locator('.account-menu').boundingBox();assert(actions.y>=-1&&actions.y+actions.height<=page.viewportSize().height+1,'account menu clipped vertically');
    await page.keyboard.press('Escape');await page.locator('.account-menu').waitFor({state:'hidden'});
    await page.locator('#cloud').click();await fitHost(width);await assertBounds();
    const trigger=await page.locator('#cloud').boundingBox(),menu=await page.locator('#service-menu').boundingBox();
    assert(Math.abs(menu.width-trigger.width)<1,'service menu must match its trigger');
    assert(menu.y>=-1&&menu.y+menu.height<=page.viewportSize().height+1,'service menu clipped by auto-height webview');
    if(lang==='zh-CN'&&[320,720].includes(width))await page.screenshot({path:fileURLToPath(new URL(`outlook-${testMode}-${width}-menu.png`,screenshots)),fullPage:true});
    await page.locator('#service-menu [data-cloud="china"]').click();await settled();await fitHost(width);await assertBounds();
    if(width===720&&lang==='zh-CN'){
      const title=await page.locator('.application-intro h3').boundingBox(),help=await page.locator('#application-help').boundingBox();
      assert(Math.abs(title.y-help.y)<4,'setup title and explanation share a line when space permits');
    }
    assert.equal(await page.locator('#portal').getAttribute('target'),null,'Forge links must use same-page navigation');
    assert(await page.locator('#required-application').isVisible());
    if(lang==='zh-CN'&&[320,720].includes(width))await page.screenshot({path:fileURLToPath(new URL(`outlook-${testMode}-${width}-china.png`,screenshots)),fullPage:true});
  }
  locale='en';config.default_cloud='china';entries[1].clientConfigured=true;
  failLoad=true;await page.reload();await page.waitForFunction(()=>document.querySelector('#setup-note')?.textContent.includes('Unable to load'));
  assert(await page.locator('#connect').isDisabled());assert(await page.locator('#save-client').isDisabled());
  failLoad=false;await page.locator('#retry').click();await settled();assert(!await page.locator('#connect').isDisabled());
  assert.match(await page.locator('#service-name').textContent(),/China/);
  for(const call of calls.filter(c=>c.path.endsWith('/connect'))){
    assert.equal(call.method,'POST');assert.equal(call.body,null);
  }
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
  console.log('PASS Host OAuth settings: service selection vs persisted default, keyboard navigation/Escape, failed default save, failed application save preserves input, cancel, clear application fallback, missing-app reconnect setup, narrow dropdown, reload recovery; bundled application sign-in without custom setup, administrator-only hints, app setup, missing-config gate, connect/disconnect, failed disconnect, four simultaneous accounts across both clouds, per-cloud defaults, reconnect deduplication and row isolation, disconnect isolation, legacy state ignored, XSS, four locales + fallback, 320px layout, load failure; fixture screenshots in both themes; 40 Host-constrained layout combinations (280/320/360/460/720px × four locales × two themes), compact trigger, inline setup explanation, account card footer and metadata menu, menu/trigger width, vertical clipping, account menu without row reflow and same-page links under CSP.');
} finally {await browser.close();}
