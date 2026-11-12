const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

const person = {id:'fictional-friend',display_name:'Fictional Friend',username:'fixture_friend'};
function setup(api) {
  const elements = new Map(), events = {}, calls = [], selected = [], cleared = [];
  function node() {
    return {children:[],listeners:{},value:'',textContent:'',hidden:false,
      append(...children) {this.children.push(...children);},
      replaceChildren(...children) {this.children = children;},
      addEventListener(type,handler) {this.listeners[type] = handler;},
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
  await app.button('#friends-requests','Approve').onclick();
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
