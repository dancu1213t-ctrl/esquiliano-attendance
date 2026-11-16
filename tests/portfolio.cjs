const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const elements=new Map();
class Element{
 constructor(tag){this.tagName=tag;this.children=[];this.attributes={};this.dataset={};this._class='';this.value='';this.open=false;this.textContent='';this.classList={add:c=>this.toggleClass(c,true),remove:c=>this.toggleClass(c,false),toggle:(c,v)=>this.toggleClass(c,v)};}
 set id(v){this._id=v;elements.set(v,this)}get id(){return this._id}
 set className(v){this._class=v}get className(){return this._class}
 toggleClass(c,v){const s=new Set(this._class.split(' ').filter(Boolean));if(v===undefined)v=!s.has(c);v?s.add(c):s.delete(c);this._class=[...s].join(' ');return v}
 append(...items){this.children.push(...items)}replaceChildren(...items){this.children=items;this.textContent=''}
 setAttribute(k,v){this.attributes[k]=v}addEventListener(){}showModal(){this.open=true}close(){this.open=false}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null}
 querySelectorAll(selector){return this.children.flatMap(x=>[...(selector==='input'&&x.tagName==='input'||selector==='dl'&&x.tagName==='dl'||selector==='[type=submit]'&&x.type==='submit'||selector==='button'&&x.tagName==='button'?[x]:[]),...x.querySelectorAll(selector)])}
}
const document={createElement:t=>new Element(t),createElementNS:(n,t)=>new Element(t),getElementById:id=>elements.get(id),body:new Element('body'),querySelectorAll:s=>s==='[data-pf-page]'?tabs:[]};
for(const id of ['pfStatus','pfCategories','pfBrowse','pfSales','pfManage','pfNewSale','pfManageTab','pfRefresh','openPortfolioAdmin']){const e=new Element('div');e.id=id}
const tabs=['browse','sales','manage'].map(page=>{const b=new Element('button');b.dataset.pfPage=page;return b});
let profile={id:'admin',role:'admin',name:'Admin'},data={pf_categories:[{id:'marketing',slug:'marketing',name:'Marketing',icon:'marketing',availability:'available',show_portfolio:true}],pf_folders:[{id:'one',category_id:'marketing',name:'Videos & Reels',drive_url:'https://drive.google.com/drive/folders/abc'},{id:'two',category_id:'marketing',name:'Flyers',drive_url:''},{id:'three',category_id:'marketing',name:'Websites',drive_url:'javascript:alert(1)'}],pf_services:[],pf_access:[],att_profiles:[{id:'worker',role:'employee',employee_id:'W-1',name:'Worker'}]};
class Query{constructor(name){this.name=name}select(){return this}order(){return this}eq(){return this}then(resolve){return Promise.resolve({data:data[this.name]}).then(resolve)}}
const ctx={document,console,URL,Blob,setTimeout:()=>{},setInterval:()=>{},crypto:{randomUUID:()=> 'test-id'},preview:false,activeView:'portfolio',navigator:{onLine:true},currentProfile:()=>profile,clientForProfile:()=>({from:n=>new Query(n)}),check:r=>{if(r.error)throw r.error;return r.data},toast:()=>{},show:()=>{}};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync(__dirname+'/../portfolio.js','utf8'),ctx);
function descendants(e){return [e,...e.children.flatMap(descendants)]}
(async()=>{
 await ctx.Portfolio.show();assert.equal(elements.get('pfStatus').textContent,'');assert.equal(elements.get('pfCategories').children.length,1);
 const rendered=descendants(elements.get('pfBrowse'));const links=rendered.filter(x=>x.tagName==='a');assert.equal(links.length,1);assert.equal(links[0].href,'https://drive.google.com/drive/folders/abc');assert.equal(rendered.filter(x=>x.className==='pf-folder').length,3);
 assert.equal(ctx.Portfolio.safeDrive('https://drive.google.com.evil.com/drive/folders/abc'),null);assert.equal(ctx.Portfolio.safeDrive('javascript:alert(1)'),null);assert.equal(ctx.Portfolio.safeDrive('https://drive.google.com/drive/u/0/folders/abc?usp=sharing'),'https://drive.google.com/drive/u/0/folders/abc?usp=sharing');
 assert.equal(ctx.Portfolio.csvCell('=HYPERLINK("bad")'),'"\'=HYPERLINK(""bad"")"');assert.equal(ctx.Portfolio.csvCell('Client, Inc.'),'"Client, Inc."');
 ctx.Portfolio.openManagement();assert(descendants(elements.get('pfManage')).some(x=>x.textContent==='Staff access · Marketing'));
 profile={id:'worker',role:'employee'};data={pf_categories:[],pf_folders:[],pf_services:[],pf_access:[]};ctx.Portfolio.sync();await ctx.Portfolio.show();assert.equal(elements.get('pfCategories').children.length,0);assert.equal(elements.get('pfManage').children.length,0);assert(descendants(elements.get('pfBrowse')).some(x=>x.textContent==='Your portfolio access'));
 const html=fs.readFileSync(__dirname+'/../index.html','utf8'),app=fs.readFileSync(__dirname+'/../app.js','utf8');assert.equal((html.match(/id="portfolioView"/g)||[]).length,1);assert(html.indexOf('app.js?v=44')<html.indexOf('portfolio.js?v=1'));assert(app.includes("['portfolio','Portfolio']"));
 console.log('Portfolio tests passed: bootstrap, category rendering, folder links, invalid URL rejection, CSV safety, admin controls and account-switch privacy.');
})().catch(e=>{console.error(e);process.exitCode=1});