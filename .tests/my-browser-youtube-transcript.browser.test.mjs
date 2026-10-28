import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(import.meta.url);
const source=path.resolve(import.meta.dirname,'../my-browser/extension/youtube-transcript.js');
test('native transcript fallback reads full timed text, restores UI and rejects navigation',{
 skip:!process.env.PLAYWRIGHT_CORE,timeout:30000,
},async t=>{
 const {chromium}=require(process.env.PLAYWRIGHT_CORE);
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});t.after(()=>browser.close());
 const page=await browser.newPage();const url='https://www.youtube.com/watch?v=fixture';
 await page.route('https://www.youtube.com/**',route=>route.fulfill({contentType:'text/html',body:`
 <ytd-watch-flexy video-id="fixture"></ytd-watch-flexy><video></video>
 <ytd-video-description-transcript-section-renderer><button>Show transcript</button></ytd-video-description-transcript-section-renderer>
 <ytd-engagement-panel-section-list-renderer target-id="engagement-panel-searchable-transcript" visibility="ENGAGEMENT_PANEL_VISIBILITY_HIDDEN"><div id="visibility-button"><button>Close</button></div><div id="rows"></div></ytd-engagement-panel-section-list-renderer>
 <script>
 const panel=document.querySelector('ytd-engagement-panel-section-list-renderer');window.opens=0;window.closes=0;
 Object.defineProperty(document.querySelector('video'),'duration',{value:20});
 document.querySelector('ytd-video-description-transcript-section-renderer button').onclick=()=>{opens++;panel.setAttribute('visibility','ENGAGEMENT_PANEL_VISIBILITY_EXPANDED');setTimeout(()=>{document.querySelector('#rows').innerHTML=[['0:00','First sentence.'],['0:02','Second sentence.'],['0:02','Continued.'],['0:15','Last sentence.']].map(([time,text])=>'<ytd-transcript-segment-renderer><div class="segment-timestamp">'+time+'</div><div class="segment-text">'+text+'</div></ytd-transcript-segment-renderer>').join('');},40);};
 document.querySelector('#visibility-button button').onclick=()=>{closes++;panel.setAttribute('visibility','ENGAGEMENT_PANEL_VISIBILITY_HIDDEN');};
 </script>`}));
 await page.goto(url);await page.addScriptTag({path:source});
 const read=()=>page.evaluate(url=>CindyYoutubeTranscript.read(url),url);
 const result=await read();assert.equal(result.ok,true);assert.equal(result.cues.length,3);
 assert.deepEqual(result.cues.map(c=>c.text),['First sentence.','Second sentence. Continued.','Last sentence.']);
 assert.deepEqual(result.cues.map(c=>[c.start,c.end]),[[0,2],[2,15],[15,20]]);
 assert.deepEqual(await page.evaluate(()=>[opens,closes]),[1,1]);
 // Precise timestamps supplied by the actual main-world renderer take priority.
 await page.evaluate(()=>{document.querySelector('ytd-video-description-transcript-section-renderer button').click();});
 await page.waitForTimeout(80);
 await page.evaluate(()=>{document.querySelector('ytd-transcript-segment-renderer').data={startMs:'120',endMs:'1750'};});
 const precise=await read();assert.equal(precise.cues[0].start,.12);assert.equal(precise.cues[0].end,1.75);
 assert.deepEqual(await page.evaluate(()=>[opens,closes]),[2,1],'existing transcript is left open');
 await page.evaluate(()=>{document.querySelector('ytd-transcript-segment-renderer .segment-timestamp').textContent='broken';delete document.querySelector('ytd-transcript-segment-renderer').data;});
 assert.equal((await read()).error,'SUBTITLE_RESPONSE_INVALID','never claim success with lost segments');
 await page.evaluate(()=>history.replaceState({},'', '/watch?v=changed'));
 assert.equal((await read()).error,'PAGE_CHANGED');
});
test('collapsed description is expanded for the transcript entry and restored afterwards',{
 skip:!process.env.PLAYWRIGHT_CORE,timeout:30000,
},async t=>{
 const {chromium}=require(process.env.PLAYWRIGHT_CORE);
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});t.after(()=>browser.close());
 const page=await browser.newPage();const url='https://www.youtube.com/watch?v=fixture';
 await page.route('https://www.youtube.com/**',route=>route.fulfill({contentType:'text/html',body:`
 <ytd-watch-flexy video-id="fixture"></ytd-watch-flexy><video></video>
 <ytd-watch-metadata><ytd-text-inline-expander id="description-inline-expander"><div id="content"></div><tp-yt-paper-button id="expand">...more</tp-yt-paper-button></ytd-text-inline-expander><div id="tail"></div></ytd-watch-metadata>
 <ytd-engagement-panel-section-list-renderer target-id="engagement-panel-searchable-transcript" visibility="ENGAGEMENT_PANEL_VISIBILITY_HIDDEN"><div id="visibility-button"><button>Close</button></div><div id="rows"></div></ytd-engagement-panel-section-list-renderer>
 <script>
 const panel=document.querySelector('ytd-engagement-panel-section-list-renderer'),expand=document.querySelector('#expand');window.expands=0;window.collapses=0;
 Object.defineProperty(document.querySelector('video'),'duration',{value:10});
 // Like YouTube, the transcript section and Show less exist only while expanded.
 expand.onclick=()=>{expands++;expand.hidden=true;setTimeout(()=>{
  document.querySelector('#content').innerHTML='<ytd-video-description-transcript-section-renderer><button>Show transcript</button></ytd-video-description-transcript-section-renderer>';
  document.querySelector('#tail').innerHTML='<tp-yt-paper-button id="collapse">Show less</tp-yt-paper-button>';
  document.querySelector('ytd-video-description-transcript-section-renderer button').onclick=()=>{panel.setAttribute('visibility','ENGAGEMENT_PANEL_VISIBILITY_EXPANDED');document.querySelector('#rows').innerHTML='<ytd-transcript-segment-renderer><div class="segment-timestamp">0:00</div><div class="segment-text">Only sentence.</div></ytd-transcript-segment-renderer>';};
  document.querySelector('#collapse').onclick=()=>{collapses++;document.querySelector('#content').innerHTML='';document.querySelector('#tail').innerHTML='';expand.hidden=false;};
 },60);};
 document.querySelector('#visibility-button button').onclick=()=>panel.setAttribute('visibility','ENGAGEMENT_PANEL_VISIBILITY_HIDDEN');
 </script>`}));
 await page.goto(url);await page.addScriptTag({path:source});
 const result=await page.evaluate(url=>CindyYoutubeTranscript.read(url),url);
 assert.equal(result.ok,true);assert.deepEqual(result.cues,[{start:0,end:10,text:'Only sentence.'}]);
 assert.deepEqual(await page.evaluate(()=>[expands,collapses,document.querySelector('ytd-engagement-panel-section-list-renderer').getAttribute('visibility')]),[1,1,'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN']);
 // A user scrolling the expanded description takes over; it is not collapsed.
 const reading=page.evaluate(url=>CindyYoutubeTranscript.read(url),url);
 await page.waitForSelector('#collapse');await page.mouse.move(10,10);await page.mouse.wheel(0,40);
 assert.equal((await reading).ok,true);
 assert.deepEqual(await page.evaluate(()=>[expands,collapses]),[2,1]);
 assert.equal(await page.evaluate(()=>document.querySelector('ytd-engagement-panel-section-list-renderer').getAttribute('visibility')),'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED','panel stays open for the user');
 await page.evaluate(()=>{document.querySelector('#visibility-button button').click();document.querySelector('#collapse').click();document.querySelector('#expand').remove();});
 assert.deepEqual(await page.evaluate(url=>CindyYoutubeTranscript.read(url),url),{ok:true,cues:[]},'no transcript entry stays an empty result');
});
test('modern view-model transcript panel is read without chapter headers',{
 skip:!process.env.PLAYWRIGHT_CORE,timeout:30000,
},async t=>{
 const {chromium}=require(process.env.PLAYWRIGHT_CORE);
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});t.after(()=>browser.close());
 const page=await browser.newPage();const url='https://video.example.test/watch?v=fixture';
 // Mirrors YouTube's PAmodern_transcript_view markup: an accessible duration
 // label sits between the timestamp and the text, and chapters are siblings.
 const row=(time,label,text)=>`<macro-markers-panel-item-view-model><timeline-item-view-model><div><transcript-segment-view-model><div aria-hidden="true" class="ytwTranscriptSegmentViewModelTimestamp">${time}</div><div class="ytwTranscriptSegmentViewModelTimestampA11yLabel">${label}</div><span class="ytAttributedStringHost" role="text">${text}</span></transcript-segment-view-model></div></timeline-item-view-model></macro-markers-panel-item-view-model>`;
 const rows=`<timeline-chapter-view-model>Chapter 1: Opening</timeline-chapter-view-model>${row('0:00','0 seconds','First line.')}${row('0:03','3 seconds','Second line.')}<timeline-chapter-view-model>Chapter 2: Ending</timeline-chapter-view-model>${row('1:01:05','1 hour, 1 minute, 5 seconds','Last line.')}`;
 await page.route('https://video.example.test/**',route=>route.fulfill({contentType:'text/html',body:`
 <ytd-watch-flexy video-id="fixture"></ytd-watch-flexy><video></video>
 <ytd-video-description-transcript-section-renderer><button>Show transcript</button></ytd-video-description-transcript-section-renderer>
 <ytd-engagement-panel-section-list-renderer target-id="PAmodern_transcript_view" visibility="ENGAGEMENT_PANEL_VISIBILITY_HIDDEN"><div id="visibility-button"><button>Close</button></div><div id="rows"></div></ytd-engagement-panel-section-list-renderer>
 <ytd-engagement-panel-section-list-renderer target-id="engagement-panel-searchable-transcript" visibility="ENGAGEMENT_PANEL_VISIBILITY_HIDDEN"></ytd-engagement-panel-section-list-renderer>
 <script>
 const panel=document.querySelector('[target-id="PAmodern_transcript_view"]');window.closes=0;
 Object.defineProperty(document.querySelector('video'),'duration',{value:3670});
 document.querySelector('ytd-video-description-transcript-section-renderer button').onclick=()=>{panel.setAttribute('visibility','ENGAGEMENT_PANEL_VISIBILITY_EXPANDED');setTimeout(()=>{document.querySelector('#rows').innerHTML=${JSON.stringify(rows)};},40);};
 panel.querySelector('#visibility-button button').onclick=()=>{closes++;panel.setAttribute('visibility','ENGAGEMENT_PANEL_VISIBILITY_HIDDEN');};
 </script>`}));
 await page.goto(url);await page.addScriptTag({path:source});
 const result=await page.evaluate(url=>CindyYoutubeTranscript.read(url),url);
 assert.equal(result.ok,true);
 assert.deepEqual(result.cues,[{start:0,end:3,text:'First line.'},{start:3,end:3665,text:'Second line.'},{start:3665,end:3670,text:'Last line.'}]);
 assert.deepEqual(await page.evaluate(()=>[closes,document.querySelector('[target-id="PAmodern_transcript_view"]').getAttribute('visibility')]),[1,'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN']);
});
