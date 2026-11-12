/* Approved guides are read-only and stay in page memory. */
function createFriends({beforeSwitch, onSelect, onClear}) {
  const $ = selector => document.querySelector(selector);
  let signedIn = false;
  let selected = null;
  let busy = false;
  let generation = 0;
  let connections = {following:[], outgoing:[], requests:[], followers:[]};
  function say(message) {$('#friends-status').textContent = message;}
  async function request(route, body = {}) {
    const response = await fetch('/api/account/' + route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const result = await response.json();
    if(!response.ok) {const error = new Error(result.error || 'Friends could not be loaded.');error.status = response.status;throw error;}
    return result;
  }
  function leave(message = '') {
    generation++;
    selected = null;
    onClear();
    $('#friend-access-status').textContent = message;
    render();
  }
  function render() {
    $('#friends-sign-in').hidden = signedIn;
    $('#friends-member').hidden = !signedIn;
    $('#guide-person').textContent = selected ? `${selected.owner.display_name || selected.owner.username}’s guide` : 'Your guide';
    $('#use-my-guide').hidden = !selected;
    $('#occasion').placeholder = selected ? `Ask ${selected.owner.display_name || selected.owner.username}’s guide about your plan…` : 'Tell me what you have in mind. Who’s coming, where, what vibe, and roughly how much?';
    const groups = [
      ['following','Guides you can read',[['Search guide','read'],['Unfollow','unfollow']]],
      ['outgoing','Waiting for approval',[['Cancel request','unfollow']]],
      ['requests','Requests to read your guide',[['Approve','approve'],['Decline','revoke']]],
      ['followers','People who can read your guide',[['Remove access','revoke']]]
    ];
    for(const [key,title,actions] of groups) {
      const list = $('#friends-' + key);
      list.replaceChildren();
      const heading = document.createElement('h2');heading.textContent = title;list.append(heading);
      if(!connections[key].length) {const empty = document.createElement('p');empty.className = 'small';empty.textContent = 'No one here yet.';list.append(empty);}
      for(const person of connections[key]) {
        const row = document.createElement('div');row.className = 'friend-row';
        const identity = document.createElement('p');identity.textContent = `${person.display_name} · @${person.username}`;row.append(identity);
        const buttons = document.createElement('div');buttons.className = 'actions';
        for(const [label,route] of actions) {
          const button = document.createElement('button');button.type = 'button';button.className = 'secondary';button.textContent = label;button.disabled = busy;
          button.onclick = () => action(async () => {
            if(route === 'read') {
              const context = generation;
              await beforeSwitch();
              const guide = await request('friend-guide',{ownerId:person.id});
              if(context !== generation || !signedIn)return;
              selected = guide;
              onSelect(selected);
              $('#friend-access-status').textContent = '';
              document.querySelector('[data-view="discover"]').click();
            } else {
              await request(route,{id:person.id});
              if(selected?.owner.id === person.id)leave();
              say(route === 'approve' ? 'Access approved. They can read the places you show in your guide.' : 'Connection removed.');
              await refresh();
            }
          });
          buttons.append(button);
        }
        row.append(buttons);list.append(row);
      }
    }
  }
  async function refresh() {
    if(!signedIn)return;
    const context = generation;
    const result = await request('connections');
    if(context !== generation)return;
    connections = result;
    render();
  }
  async function action(work) {
    if(busy)return;
    busy = true;render();
    try {await work();}
    catch(error) {say(error instanceof SyntaxError ? 'Friends need the local Inner Table server.' : error.message);}
    finally {busy = false;render();}
  }
  function setSession(value) {
    if(value === signedIn)return;
    generation++;
    signedIn = value;
    if(signedIn)return action(refresh);
    connections = {following:[],outgoing:[],requests:[],followers:[]};leave();
    render();
  }
  $('#friend-request-form').addEventListener('submit',event => {
    event.preventDefault();
    action(async () => {
      const username = $('#friend-username').value.trim().replace(/^@/,'').toLowerCase();
      const result = await request('follow',{username});
      say(result.approved ? 'You already have access to this guide.' : 'Request sent. Their guide opens after they approve you.');
      await refresh();
    });
  });
  $('#friends-refresh').addEventListener('click',() => action(refresh));
  $('#use-my-guide').addEventListener('click',() => leave());
  window.addEventListener('focus',async () => {
    if(!selected)return;
    const ownerId = selected.owner.id, context = generation;
    try {
      const updated = await request('friend-guide',{ownerId});
      if(context !== generation || selected?.owner.id !== ownerId)return;
      if(JSON.stringify(updated) !== JSON.stringify(selected)) {selected = updated;onSelect(selected);render();}
    } catch(error) {
      if(context === generation && selected?.owner.id === ownerId && (error.status === 401 || error.status === 403))leave('This friend’s guide is no longer available. You are back in your own guide.');
    }
  });
  render();
  return {setSession,leave,getOwner:()=>selected?.owner || null};
}
