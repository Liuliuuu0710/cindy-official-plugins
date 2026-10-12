'use strict';
// Isolated Chromium and synthetic Host; does not control Cindy or send real audio.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {chromium}=require(process.env.PODCAST_PLAYWRIGHT_PATH || 'playwright-core');
const root=path.resolve(__dirname,'../podcast-insights');
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.PODCAST_CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  const db=new DatabaseSync(':memory:');let version=0,locale='zh-CN';const errors=[];
  try{
    const page=await browser.newPage({viewport:{width:1200,height:900}});page.on('pageerror',e=>errors.push(e.message));
    await page.exposeFunction('testLibrary',a=>{
      if(['open','status'].includes(a.op))return {ok:true,state:'ready',usedBytes:4096};
      if(a.op==='read')return {ok:false,errorCode:'NOT_FOUND'};
      if(a.op==='db.open'||a.op==='db.backup')return {ok:true};
      if(a.op==='db.migrate'){if(!version){for(const step of a.steps)for(const sql of step.sql)db.exec(sql);version=1;}return {ok:true};}
      if(a.op==='db.exec'){const stmt=db.prepare(a.sql);return /^SELECT/i.test(a.sql)?{ok:true,rows:stmt.all(...a.params)}:{ok:true,...stmt.run(...a.params),lastInsertRowid:0};}
      if(a.op==='db.batch'){db.exec('BEGIN');try{for(const s of a.statements)db.prepare(s.sql).run(...(s.params || []));db.exec('COMMIT');return {ok:true};}catch(e){db.exec('ROLLBACK');throw e;}}
      return {ok:false,errorCode:'UNKNOWN_OP'};
    });
    await page.route('http://127.0.0.1:18765/**',async route=>{
      const u=new URL(route.request().url());const p=u.pathname;
      if(p==='/app-context')return route.fulfill({json:{context:{locale}}});
      if(p==='/wake')return route.fulfill({json:{ok:true}});
      if(p==='/secrets')return route.fulfill({json:[{key:'assemblyai_key',saved:false}]});
      if(p==='/kv')return route.fulfill({json:{}});
      const file=path.join(root,p==='/'?'main-view.html':p.slice(1));
      if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
      const ext=path.extname(file);return route.fulfill({body:fs.readFileSync(file),contentType:ext==='.html'?'text/html':ext==='.css'?'text/css':ext==='.json'?'application/json':'text/javascript'});
    });
    await page.addInitScript(()=>{
      window.responses=[];window.cards=[];
      window.cindy={library:a=>window.testLibrary(a),request:async()=>({context:{locale:document.documentElement.lang || 'zh-CN'}}),send:async m=>{if(m.type==='tool-result')responses.push(m);if(m.type==='card-update')cards.push(m);},onHostMessage:f=>window.hostListener=f,
        fetch:async a=>({ok:true,status:200,body:a.url.endsWith('.vtt')?'WEBVTT\n\n00:00:01.000 --> 00:00:03.000\n城市绿地很重要。\n\n00:00:04.000 --> 00:00:06.000\nGreen spaces matter.':'<rss xmlns:podcast="https://podcastindex.org/namespace/1.0"><channel><title>Synthetic show</title><item><title>Synthetic episode</title><guid>one</guid><link>https://example.test/episode</link><enclosure url="https://audio.example.test/one.mp3"/><podcast:transcript url="https://example.test/one.vtt" type="text/vtt"/></item></channel></rss>'})};
    });
    await page.goto('http://127.0.0.1:18765/');
    await page.addScriptTag({url:'http://127.0.0.1:18765/main.js'});
    await page.waitForFunction(()=>typeof hostListener==='function');
    await page.evaluate(()=>hostListener({type:'tool-call',tool:'podcast_import',args:{url:'https://example.test/feed'},callId:'import-1'}));
    await page.waitForFunction(()=>responses.some(r=>r.callId==='import-1'));
    const result=await page.evaluate(()=>responses.find(r=>r.callId==='import-1').result);assert.equal(result.episodes.length,1);assert.equal(result.transcripts[0].segment_count,2);
    const eid=result.episodes[0].id;
    await page.getByRole('button',{name:'Synthetic episode',exact:true}).waitFor();
    await page.getByRole('button',{name:'Synthetic episode',exact:true}).click();
    await page.locator('#reader blockquote').first().waitFor();
    await page.evaluate(eid=>hostListener({type:'tool-call',tool:'podcast_cite',args:{references:[{episode_id:eid,quote:'城市绿地很重要。'}]},callId:'cite-1'}),eid);
    await page.waitForFunction(()=>responses.some(r=>r.callId==='cite-1'));assert.equal(await page.evaluate(()=>responses.find(r=>r.callId==='cite-1').result.citations[0].status),'exact');
    const segment=await page.evaluate(()=>responses.find(r=>r.callId==='cite-1').result.citations[0].id);
    await page.evaluate(({eid,segment})=>hostListener({type:'event',name:'card-action',actionId:'focus:'+eid+':'+segment,callId:'cite-1',userActionToken:'synthetic-click'}),{eid,segment});
    await page.locator('#reader .selected').waitFor();
    await page.evaluate(()=>hostListener({type:'tool-call',tool:'podcast_import',args:{url:'https://audio.example.test/empty.mp3'},callId:'empty-1'}));
    await page.waitForFunction(()=>responses.some(r=>r.callId==='empty-1'));
    await page.locator('#episodes').getByRole('button',{name:'empty.mp3',exact:true}).click();
    await page.waitForFunction(()=>document.getElementById('notice').textContent.includes('转录'));
    assert.equal(await page.locator('#reader blockquote').count(),0);
    assert.equal(await page.locator('#more').isVisible(),false);
    await page.getByRole('button',{name:'Synthetic episode',exact:true}).click();
    await page.locator('#reader blockquote').first().waitFor();
    assert.equal(await page.locator('#reader .selected').count(),0);
    await page.evaluate(eid=>hostListener({type:'tool-call',tool:'podcast_transcribe',args:{episode_id:eid},callId:'missing-key'}),eid);
    await page.waitForFunction(()=>responses.some(r=>r.callId==='missing-key'));
    const failed=await page.evaluate(()=>responses.find(r=>r.callId==='missing-key'));
    assert.equal(failed.ok,false);assert.equal(failed.errorCode,'AAI_KEY_MISSING');
    const parser=await page.evaluate(()=>{
      const xml='<feed xmlns="http://www.w3.org/2005/Atom" xmlns:podcast="https://podcastindex.org/namespace/1.0"><title>Atom</title><entry><id>id-1</id><title>Entry</title><link rel="enclosure" href="https://audio.example.test/a.mp3"/><podcast:transcript type="text/plain" url="https://example.test/a.txt"/><podcast:transcript type="text/vtt" url="https://example.test/a.vtt"/></entry></feed>';
      const f=PodcastCore.feed(xml,'https://example.test/feed');return {title:f.title,url:f.episodes[0].audio_url,first:f.episodes[0].transcripts[0].type};
    });assert.equal(parser.first,'text/vtt');assert.equal(parser.title,'Atom');
    const dialogs=[];page.on('dialog',async d=>{dialogs.push(d.message());await d.accept('Synthetic note');});
    await page.evaluate(eid=>hostListener({type:'tool-call',tool:'podcast_import_transcript',args:{episode_id:eid,content:'x'.repeat(1300),format:'txt'},callId:'long-note'}),eid);
    await page.waitForFunction(()=>responses.some(r=>r.callId==='long-note'));
    await page.getByRole('button',{name:'Synthetic episode',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('#reader blockquote')?.textContent.length===1300);
    await page.evaluate(()=>{const text=document.querySelector('#reader blockquote').firstChild,range=document.createRange();range.setStart(text,0);range.setEnd(text,1201);getSelection().removeAllRanges();getSelection().addRange(range);});
    await page.locator('#reader').getByRole('button',{name:'保存选中引用与笔记',exact:true}).click();
    await page.waitForFunction(()=>document.getElementById('notice').textContent.includes('1200'));
    assert.equal(dialogs.length,0);assert.equal(db.prepare('SELECT count(*) n FROM notes').get().n,0);
    await page.evaluate(()=>getSelection().removeAllRanges());
    await page.locator('#reader').getByRole('button',{name:'保存选中引用与笔记',exact:true}).click();
    await page.waitForFunction(()=>document.getElementById('notice').textContent.includes('1200'));
    assert.equal(dialogs.length,0);assert.equal(db.prepare('SELECT count(*) n FROM notes').get().n,0);
    await page.evaluate(()=>{const text=document.querySelector('#reader blockquote').firstChild,range=document.createRange();range.setStart(text,0);range.setEnd(text,100);getSelection().removeAllRanges();getSelection().addRange(range);});
    await page.locator('#reader').getByRole('button',{name:'保存选中引用与笔记',exact:true}).click();
    await page.waitForFunction(()=>document.getElementById('notice').textContent.includes('已保存'));
    assert.equal(dialogs.length,1);assert.equal(db.prepare('SELECT quote FROM notes').get().quote,'x'.repeat(100));
    const other=await page.evaluate(()=>responses.find(r=>r.callId==='empty-1').result.episodes[0].id);
    await page.evaluate(eid=>hostListener({type:'tool-call',tool:'podcast_import_transcript',args:{episode_id:eid,content:'Other episode evidence',format:'txt'},callId:'other-text'}),other);
    await page.waitForFunction(()=>responses.some(r=>r.callId==='other-text'));
    await page.getByRole('button',{name:'Synthetic episode',exact:true}).click();
    await page.waitForFunction(()=>document.getElementById('episode-title').textContent==='Synthetic episode');
    await page.locator('#query').fill('Other episode');await page.locator('#search button').click();
    await page.waitForFunction(()=>document.querySelector('#reader blockquote')?.textContent==='Other episode evidence');
    assert.equal(await page.locator('#episode-title').textContent(),'检索结果');assert.equal(await page.locator('#episode-actions').isVisible(),false);
    assert.ok((await page.locator('#reader').textContent()).includes('empty.mp3'));
    await page.locator('#reader').getByRole('button',{name:'在资料库中查看',exact:true}).click();
    await page.waitForFunction(()=>document.getElementById('episode-title').textContent==='empty.mp3');assert.equal(await page.locator('#episode-actions').isVisible(),true);
    await page.getByRole('button',{name:'Synthetic episode',exact:true}).click();await page.locator('#query').fill('');
    const output=process.env.PODCAST_SCREENSHOT_DIR || '/private/tmp/podcast-158-visual';fs.mkdirSync(output,{recursive:true});
    for(const language of ['zh-CN','en']){
      locale=language;
      if(language==='en'){
        await page.reload();await page.addScriptTag({url:'http://127.0.0.1:18765/main.js'});await page.getByRole('button',{name:'Synthetic episode',exact:true}).waitFor();await page.getByRole('button',{name:'Synthetic episode',exact:true}).click();await page.locator('#reader blockquote').first().waitFor();
      }
      for(const dark of [false,true]){
        await page.evaluate(dark=>{const vars=dark?{'--surface':'#181818','--surface-elevated':'#2c2c2a','--surface-chip':'#3c3c3a','--text-primary':'#d4d4d4','--text-secondary':'#a1a19b','--border-default':'#3c3c3a'}:{'--surface':'#f2f2ed','--surface-elevated':'#ffffff','--surface-chip':'#e5e5e5','--text-primary':'#262626','--text-secondary':'#696963','--border-default':'#d7d7d4'};for(const [k,v]of Object.entries(vars))document.documentElement.style.setProperty(k,v);document.documentElement.style.colorScheme=dark?'dark':'light';},dark);
        await page.screenshot({path:path.join(output,language+'-'+(dark?'dark':'light')+'.png'),fullPage:true});
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      }
    }
    await page.setViewportSize({width:360,height:800});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.deepEqual(errors,[]);console.log('Browser checks passed: RSS/Atom DOMParser, transcript import, citation, reader, en/zh-CN × light/dark, narrow layout');
  }finally{db.close();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
