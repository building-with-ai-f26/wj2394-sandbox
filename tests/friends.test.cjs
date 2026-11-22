const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

const person = {id:'fictional-friend',display_name:'Fictional Friend',username:'fixture_friend'};
function setup(api) {
  const elements = new Map(), events = {}, calls = [], selected = [], cleared = [];
  function node() {
    return {children:[],listeners:{},dataset:{},value:'',textContent:'',hidden:false,
      append(...children) {this.children.push(...children);},
      replaceChildren(...children) {this.children = children;},
      addEventListener(type,handler) {this.listeners[type] = handler;},
      setAttribute() {}, removeAttribute() {}, focus() {},
      fire(type) {return this.listeners[type]?.({preventDefault(){}});},
      click() {return this.listeners.click?.();}
    };
  }
  function element(id) {if(!elements.has(id))elements.set(id,node());return elements.get(id);}
  const context = vm.createContext({
    document:{querySelector:element,createElement:node},
    window:{addEventListener:(type,handler)=>{events[type] = handler;}},
    fetch:async (url,options) => {
      const body = JSON.parse(options.body);calls.push({url,body});
      const result = await api(url,body);
      return {ok:!result.error,status:result.status || 200,json:async()=>result};
    }
  });
  vm.runInContext(fs.readFileSync(require.resolve('../docs/prototype/accounts.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(require.resolve('../docs/prototype/friends.js'),'utf8'),context);
  const controller = context.createFriends({beforeSwitch:async()=>{},onSelect:guide=>selected.push(guide),onClear:()=>cleared.push(true)});
  function button(container,label) {
    function find(parent) {if(parent.textContent === label)return parent;for(const child of parent.children) {const match = find(child);if(match)return match;}}
    return find(element(container));
  }
  return {controller,element,button,events,calls,selected,cleared};
}

test('pending requests never offer a readable guide',async () => {
  const app = setup(async()=>({following:[],outgoing:[person],requests:[],followers:[]}));
  await app.controller.setSession(true);
  assert.equal(app.button('#friends-following','Search guide'),undefined);
  assert.ok(app.button('#friends-outgoing','Cancel request'));
  assert.equal(app.controller.getOwner(),null);
});

test('approval submits only the selected requester identity',async () => {
  const app = setup(async url=>url.endsWith('/connections') ? {following:[],outgoing:[],requests:[person],followers:[]} : {ok:true});
  await app.controller.setSession(true);
  await app.button('#friends-requests','Approve request').onclick();
  const approval = app.calls.find(call=>call.url.endsWith('/approve'));
  assert.deepEqual(approval.body,{id:person.id});
});

test('revoked access clears the selected guide when the window regains focus',async () => {
  let revoked = false;
  const app = setup(async url=>url.endsWith('/connections')
    ? {following:[person],outgoing:[],requests:[],followers:[]}
    : revoked ? {error:'Access removed',status:403} : {owner:person,places:[],revision:1});
  await app.controller.setSession(true);
  await app.button('#friends-following','Search guide').onclick();
  assert.equal(app.controller.getOwner().id,person.id);
  revoked = true;
  await app.events.focus();
  assert.equal(app.controller.getOwner(),null);
  assert.match(app.element('#friend-access-status').textContent,/no longer available/);
});

test('a guide response arriving after sign-out cannot restore private data',async () => {
  let release;
  const app = setup(async url=>url.endsWith('/connections')
    ? {following:[person],outgoing:[],requests:[],followers:[]}
    : new Promise(resolve=>{release = ()=>resolve({owner:person,places:[],revision:1});}));
  await app.controller.setSession(true);
  const loading = app.button('#friends-following','Search guide').onclick();
  await new Promise(setImmediate);
  app.controller.setSession(false);
  release();
  await loading;
  assert.equal(app.controller.getOwner(),null);
  assert.equal(app.selected.length,0);
});

test('the Discover picker only opens an approved guide through the server',async () => {
  const unapproved = {...person,id:'pending-friend'};
  const app = setup(async url => url.endsWith('/connections')
    ? {following:[person],outgoing:[unapproved],requests:[],followers:[]}
    : {owner:person,places:[],revision:1});
  await app.controller.setSession(true);
  await app.controller.openGuide(unapproved.id);
  assert.equal(app.calls.some(call=>call.url.endsWith('/friend-guide')),false);
  await app.controller.openGuide(person.id);
  assert.deepEqual(app.calls.at(-1).body,{ownerId:person.id});
  assert.equal(app.controller.getOwner().id,person.id);
});

test('finding an exact handle previews an identity before sending an ID-bound request',async () => {
  let requested = false, approved = false;
  const app = setup(async url => {
    if(url.endsWith('/connections')) return {following:approved?[person]:[],outgoing:requested&&!approved?[person]:[],requests:[],followers:[]};
    if(url.endsWith('/find-friend')) return {...person,connection_status:'none'};
    if(url.endsWith('/follow')) {requested=true;return {...person,approved:false};}
  });
  await app.controller.setSession(true);
  app.element('#friend-username').value = '@Fixture_Friend';
  await app.element('#friend-request-form').fire('submit');
  assert.equal(app.calls.some(call=>call.url.endsWith('/follow')),false);
  await app.button('#friend-preview','Request to follow').onclick();
  assert.deepEqual(app.calls.find(call=>call.url.endsWith('/follow')).body,{username:person.username,expected_id:person.id});
  assert.ok(app.button('#friend-preview','Requested'));
  assert.ok(app.button('#friends-outgoing','Cancel request'));
  approved=true;
  await app.controller.refresh();
  assert.ok(app.button('#friend-preview','Search guide'));
  assert.ok(app.button('#friends-following','Search guide'));
});

test('editing a username discards a preview still being looked up',async () => {
  let resolveLookup;
  const app = setup(async url=>url.endsWith('/connections')
    ? {following:[],outgoing:[],requests:[],followers:[]}
    : new Promise(resolve=>{resolveLookup=resolve;}));
  await app.controller.setSession(true);
  const input = app.element('#friend-username');
  input.value=person.username;
  const lookup=app.element('#friend-request-form').fire('submit');
  input.value='different_friend';
  input.fire('input');
  resolveLookup({...person,connection_status:'none'});
  await lookup;
  assert.equal(app.element('#friend-preview').hidden,true);
  assert.equal(app.button('#friend-preview','Request to follow'),undefined);
});
