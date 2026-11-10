const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function setup(fetcher, hash = '') {
  const elements = new Map();
  function element(id) {
    if(!elements.has(id))elements.set(id, {
      value:'', hidden:false, listeners:{}, textContent:'',
      addEventListener(type,handler) {this.listeners[type] = handler;},
      setAttribute() {}, removeAttribute() {}, reset() {}, click() {this.clicked = true;},
      fire(type) {return this.listeners[type]({preventDefault() {}});}
    });
    return elements.get(id);
  }
  const calls = [];
  const replacedURLs = [];
  const context = vm.createContext({
    document:{querySelector:element}, URLSearchParams,
    window:{addEventListener() {},confirm:()=>true,location:{hash,pathname:'/prototype/',search:''},history:{replaceState:(_state,_title,url)=>replacedURLs.push(url)}},
    InnerTableImport:{validateBackup:raw=>JSON.parse(raw).places},
    fetch:async (url,options={}) => {
      const body = options.body ? JSON.parse(options.body) : undefined;
      calls.push({url,body});
      const data = await fetcher(url,body);
      return {ok:!data.error,json:async()=>data};
    }
  });
  vm.runInContext(fs.readFileSync(require.resolve('../docs/prototype/accounts.js'),'utf8'),context);
  const guides = [];
  const controller = context.createAccounts({getDevicePlaces:()=>[{id:'device-only'}],onMode() {},onGuide:(places,mode)=>guides.push({places,mode})});
  return {controller,element,calls,guides,replacedURLs};
}

test('device data is copied only after an explicit copy action',async () => {
  const app = setup(async url => {
    if(url.endsWith('/session'))return {configured:true,signedIn:true,profile:{}};
    if(url.endsWith('/guide'))return {places:[],revision:0};
    if(url.endsWith('/migrate'))return {places:[{id:'device-only'}],revision:1,added:1};
  });
  await app.controller.start();
  assert.equal(app.calls.filter(call=>call.body?.places).length,0);
  await app.element('#account-copy').fire('click');
  assert.deepEqual(app.calls.at(-1).body.places,[{id:'device-only'}]);
  assert.equal(app.guides.at(-1).mode,'account');
});

test('concurrent edits save sequential revisions without losing the newer edit',async () => {
  let release;
  const app = setup(async (url,body) => {
    if(url.endsWith('/session'))return {configured:true,signedIn:true,profile:{}};
    if(!body)return {places:[],revision:0};
    if(body.revision === 0)return new Promise(resolve=>{release=()=>resolve({revision:1});});
    return {revision:2};
  });
  await app.controller.start();
  app.controller.save([{id:'first'}]);
  app.controller.save([{id:'second'}]);
  release();
  await app.element('#account-retry').fire('click');
  const saves = app.calls.filter(call=>call.body?.places);
  assert.deepEqual(saves.map(call=>call.body.revision),[0,1]);
  assert.equal(saves.at(-1).body.places[0].id,'second');
  assert.equal(app.element('#account-retry').hidden,true);
});

test('failed account save keeps pending changes available for a retry',async () => {
  let fail = true;
  const app = setup(async (url,body) => {
    if(url.endsWith('/session'))return {configured:true,signedIn:true,profile:{}};
    if(!body)return {places:[],revision:0};
    return fail ? {error:'Changed elsewhere'} : {revision:1};
  });
  await app.controller.start();
  app.controller.save([{id:'pending'}]);
  await app.element('#account-retry').fire('click');
  assert.equal(app.element('#account-retry').hidden,false);
  assert.match(app.element('#account-sync').textContent,/pending/);
  fail = false;
  await app.element('#account-retry').fire('click');
  assert.equal(app.calls.at(-1).body.places[0].id,'pending');
  assert.equal(app.element('#account-retry').hidden,true);
});

test('confirmation return clears tokens from the URL and opens sign-in',async () => {
  const app = setup(async () => ({configured:true,signedIn:false}), '#access_token=fixture-private&refresh_token=fixture-refresh&type=signup');
  await app.controller.start();
  assert.deepEqual(app.replacedURLs,['/prototype/']);
  assert.match(app.element('#account-status').textContent,/Email confirmed/);
  assert.equal(app.element('[data-view="account"]').clicked,true);
  assert.equal(app.calls.some(call=>JSON.stringify(call).includes('fixture-private')),false);
});
