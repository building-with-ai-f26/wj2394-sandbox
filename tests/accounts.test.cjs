const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function setup(fetcher, {hash = '', search = '', storage = new Map()} = {}) {
  const elements = new Map();
  function element(id) {
    if(!elements.has(id))elements.set(id, {
      value:'', hidden:false, listeners:{}, textContent:'', dataset:{},
      addEventListener(type,handler) {this.listeners[type] = handler;},
      setAttribute() {}, removeAttribute() {}, reset() {}, click() {this.clicked = true;},
      focus() {this.focused = true;},
      fire(type, submitter) {return this.listeners[type]({preventDefault() {},submitter});}
    });
    return elements.get(id);
  }
  const calls = [];
  const replacedURLs = [];
  const context = vm.createContext({
    document:{querySelector:element}, URLSearchParams, URL,
    window:{addEventListener() {},confirm:()=>true,location:{hash,pathname:'/prototype/',search},history:{replaceState:(_state,_title,url)=>replacedURLs.push(url)}},
    localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},
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
  const onboarding = [];
  const controller = context.createAccounts({
    getDevicePlaces:()=>[{id:'device-only'}],onMode() {},onGuide:(places,mode)=>guides.push({places,mode}),
    onSetupRequired:()=>onboarding.push('setup'),onReady:id=>onboarding.push(id)
  });
  return {controller,element,calls,guides,replacedURLs,onboarding};
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
  const app = setup(async () => ({configured:true,signedIn:false}), {hash:'#access_token=fixture-private&refresh_token=fixture-refresh&type=signup'});
  await app.controller.start();
  assert.deepEqual(app.replacedURLs,['/prototype/']);
  assert.match(app.element('#account-status').textContent,/Email confirmed/);
  assert.equal(app.element('[data-view="account"]').clicked,true);
  assert.equal(app.calls.some(call=>JSON.stringify(call).includes('fixture-private')),false);
});

test('Google sign-in reveals username setup before the guide loads and waits for both before the tour',async () => {
  let finishGuide;
  let guideRequested;
  const awaitingGuide = new Promise(resolve=>{guideRequested=resolve;});
  const app = setup(async (url,body) => {
    if(url.endsWith('/session'))return {configured:true,signedIn:true,profile:{id:'new-account'}};
    if(url.endsWith('/guide'))return new Promise(resolve=>{finishGuide=resolve;guideRequested();});
    if(url.endsWith('/profile'))return {profile:{id:'new-account',...body}};
  }, {search:'?signin=success'});
  const starting = app.controller.start();
  await awaitingGuide;
  assert.deepEqual(app.onboarding,['setup']);
  assert.deepEqual(app.replacedURLs,['/prototype/']);
  assert.equal(app.element('#profile-setup-intro').hidden,false);
  assert.equal(app.element('#profile-editor').open,true);
  assert.equal(app.element('#profile-username').focused,true);
  assert.equal(app.element('#profile-name').required,false);
  app.element('#profile-username').value = 'fixture_username';
  await app.element('#account-profile-form').fire('submit');
  assert.deepEqual(app.calls.at(-1).body,{display_name:'fixture_username',username:'fixture_username'});
  assert.equal(app.element('#profile-name').value,'fixture_username');
  assert.equal(app.element('#profile-setup-intro').hidden,true);
  assert.deepEqual(app.onboarding,['setup']);
  finishGuide({places:[],revision:0});
  await starting;
  assert.deepEqual(app.onboarding,['setup','new-account']);
});

test('email sign-in prompts for a username and allows retry after a taken name',async () => {
  let taken = true;
  const app = setup(async (url,body) => {
    if(url.endsWith('/sign-in'))return {signedIn:true};
    if(url.endsWith('/session'))return {configured:true,signedIn:true,profile:{id:'email-account'}};
    if(url.endsWith('/guide'))return {places:[],revision:0};
    if(url.endsWith('/profile'))return taken ? {error:'That username is already taken.'} : {profile:{id:'email-account',...body}};
  });
  app.element('#account-email').value = 'fixture@example.com';
  app.element('#account-password').value = 'fixture-password';
  await app.element('#account-auth-form').fire('submit',{value:'sign-in'});
  assert.equal(app.element('#account-password').value,'');
  app.element('#profile-name').value = 'Fixture User';
  app.element('#profile-username').value = 'fixture_username';
  await app.element('#account-profile-form').fire('submit');
  assert.match(app.element('#account-status').textContent,/already taken/);
  assert.equal(app.element('#profile-setup-intro').hidden,false);
  assert.deepEqual(app.onboarding,['setup']);
  taken = false;
  await app.element('#account-profile-form').fire('submit');
  assert.deepEqual(app.calls.at(-1).body,{display_name:'Fixture User',username:'fixture_username'});
  assert.deepEqual(app.onboarding,['setup','email-account']);
});

test('a skipped username stays optional in the same browser and is remembered per account',async () => {
  const storage = new Map();
  function session(id,username) {
    return setup(async url=>url.endsWith('/session')
      ? {configured:true,signedIn:true,profile:{id,username}}
      : {places:[],revision:0}, {storage});
  }
  const first = session('first-account','');
  await first.controller.start();
  await first.element('#profile-setup-skip').fire('click');
  assert.equal(first.element('#profile-setup-intro').hidden,true);
  assert.deepEqual(first.onboarding,['setup','first-account']);
  assert.equal(first.calls.some(call=>call.url.endsWith('/profile')),false);

  const returning = session('first-account','');
  await returning.controller.start();
  assert.deepEqual(returning.onboarding,['first-account']);

  const other = session('other-account','');
  await other.controller.start();
  assert.deepEqual(other.onboarding,['setup']);

  const named = session('named-account','existing_username');
  await named.controller.start();
  assert.deepEqual(named.onboarding,['named-account']);
});

test('a late guide response cannot reopen onboarding or reveal account places after sign-out',async () => {
  let finishGuide;
  let guideRequested;
  const awaitingGuide = new Promise(resolve=>{guideRequested=resolve;});
  const app = setup(async url => {
    if(url.endsWith('/session'))return {configured:true,signedIn:true,profile:{id:'new-account'}};
    if(url.endsWith('/guide'))return new Promise(resolve=>{finishGuide=resolve;guideRequested();});
    if(url.endsWith('/sign-out'))return {signedIn:false};
  });
  const starting = app.controller.start();
  await awaitingGuide;
  await app.element('#account-sign-out').fire('click');
  finishGuide({places:[{id:'account-only'}],revision:1});
  await starting;
  assert.deepEqual(app.guides,[{places:[{id:'device-only'}],mode:'device'}]);
  assert.deepEqual(app.onboarding,['setup']);
  assert.equal(app.element('#account-member').hidden,true);
});
