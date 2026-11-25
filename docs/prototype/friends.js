/* Approved guides are read-only and stay in page memory. */
function createFriends({beforeSwitch, onSelect, onClear, onFollowing = () => {}}) {
  const $ = selector => document.querySelector(selector);
  const usernameInput = $('#friend-username');
  const previewPanel = $('#friend-preview');
  const lookupButton = $('#friend-lookup');
  let signedIn = false;
  let selected = null;
  let preview = null;
  let busy = false;
  let generation = 0;
  let sessionRevision = 0;
  let lookupRevision = 0;
  const emptyConnections = () => ({following:[],outgoing:[],requests:[],followers:[]});
  let connections = emptyConnections();
  const controls = new Map();
  const username = () => usernameInput.value.trim().replace(/^@/,'').toLowerCase();
  function say(message) {$('#friends-status').textContent = message;}
  function node(tag,text='',className='') {
    const element = document.createElement(tag);
    element.textContent = text;
    element.className = className;
    return element;
  }
  async function request(route, body = {}) {
    const response = await fetch('/api/account/' + route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const result = await response.json();
    if(!response.ok) {
      const error = new Error(result.error || 'Friends could not be loaded.');
      error.status = response.status;
      throw error;
    }
    return result;
  }
  function leave(message = '') {
    generation++;
    selected = null;
    onClear();
    $('#friend-access-status').textContent = message;
    render();
  }
  function addAction(container,key,label,handler,primary=false) {
    const button = node('button',label,primary?'secondary':'text-button');
    button.type = 'button';
    button.dataset.friendAction = key;
    button.onclick = handler;
    controls.set(key,button);
    container.append(button);
  }
  function personRow(person, showDetails) {
    const row = node('div','','friend-row');
    const identity = node('div','','friend-identity');
    const avatar = node('span','','person-avatar');
    avatar.setAttribute('aria-hidden','true');
    renderPersonAvatar(avatar,showDetails ? person : {display_name:person.display_name,username:person.username});
    const label = node('div','','person-label');
    label.append(node('strong',person.display_name || person.username),node('span',`@${person.username}`));
    if(showDetails && person.bio) label.append(node('p',person.bio,'friend-bio'));
    identity.append(avatar,label);
    const actions = node('div','','actions');
    row.append(identity,actions);
    return {row,actions};
  }
  function memberOf(group,id) {
    return connections[group].some(person=>person.id===id);
  }
  function canRequestGuide(id) {
    return !memberOf('following',id) && !memberOf('outgoing',id);
  }
  function canFollowBack(id) {
    return memberOf('followers',id) && canRequestGuide(id);
  }
  function renderPreview() {
    previewPanel.replaceChildren();
    previewPanel.hidden = !preview;
    if(!preview) return;
    const approved = preview.connection_status==='approved';
    const {row,actions} = personRow(preview,approved);
    if(approved) {
      addAction(actions,'preview:search','Search guide',()=>openGuide(preview.id),true);
    } else if(preview.connection_status==='pending') {
      actions.append(node('span','Requested','request-state'));
      addAction(actions,'preview:cancel','Cancel request',()=>updateConnection(preview,'outgoing','unfollow','Request canceled.'));
    } else {
      const person = preview;
      const label = canFollowBack(person.id) ? 'Follow back' : 'Follow';
      addAction(actions,'preview:request',label,()=>sendFollow(person,true),true);
    }
    previewPanel.append(row);
  }
  function render() {
    controls.clear();
    $('#friends-sign-in').hidden = signedIn;
    $('#friends-member').hidden = !signedIn;
    $('#friends-refresh').hidden = !signedIn;
    $('#guide-person').textContent = selected ? `${selected.owner.display_name || selected.owner.username}’s guide` : 'My places';
    $('#occasion').placeholder = selected ? `Ask ${selected.owner.display_name || selected.owner.username}’s guide about your plan…` : 'Dinner with a friend, somewhere we can talk…';
    $('#friend-requests-panel').hidden = !connections.requests.length && !connections.outgoing.length;
    renderPreview();
    const groups = [
      ['following','',[
        ['Search guide','read',''],
        ['Stop following','unfollow','You stopped following this guide.']
      ]],
      ['requests','Received',[
        ['Approve','approve','Request approved. They can read your visible places.'],
        ['Decline','revoke','Request declined.']
      ]],
      ['outgoing','Sent',[
        ['Cancel request','unfollow','Request canceled.']
      ]],
      ['followers','',[
        ['Remove access','revoke','Access removed.']
      ]]
    ];
    for(const [key,title,actions] of groups) {
      const list = $('#friends-' + key);
      list.replaceChildren();
      if(!connections[key].length) {
        if(key==='following') list.append(node('p','Find a friend by their @username to request their guide.','friend-empty'));
        if(key==='followers') list.append(node('p','Only you can read your guide right now.','friend-empty'));
        continue;
      }
      if(title) list.append(node('h3',title));
      for(const person of connections[key]) {
        const item = personRow(person,key==='following');
        if(key==='outgoing' || (key==='followers' && memberOf('outgoing',person.id))) {
          item.actions.append(node('span','Requested','request-state'));
        }
        if(key==='followers' && canFollowBack(person.id)) {
          addAction(item.actions,`followers:${person.id}:follow`,'Follow back',()=>sendFollow(person),true);
        }
        for(const [label,route,message] of actions) {
          const handler = route==='read' ? ()=>openGuide(person.id) : ()=>updateConnection(person,key,route,message);
          addAction(item.actions,`${key}:${person.id}:${route}`,label,handler,route==='read' || route==='approve');
          if(route==='approve' && canRequestGuide(person.id)) {
            addAction(item.actions,`requests:${person.id}:approve-and-follow`,'Approve and follow back',
              ()=>updateConnection(person,key,route,message,true));
          }
        }
        list.append(item.row);
      }
    }
  }
  async function refresh() {
    if(!signedIn) return;
    const context = generation;
    const result = await request('connections');
    if(context!==generation) return;
    connections = result;
    if(preview) {
      const approved = result.following.find(person=>person.id===preview.id);
      const pending = result.outgoing.some(person=>person.id===preview.id);
      preview = approved ? {...approved,connection_status:'approved'} : {
        id:preview.id,display_name:preview.display_name,username:preview.username,
        connection_status:pending?'pending':'none'
      };
    }
    onFollowing(connections.following);
  }
  async function action(work) {
    if(busy || !signedIn) return;
    const revision = sessionRevision;
    busy = true;
    lookupButton.disabled = true;
    $('#friends-member').setAttribute('aria-busy','true');
    const before = document.activeElement;
    const key = before?.dataset?.friendAction;
    let focus;
    try {focus = await work();}
    catch(error) {
      if(revision===sessionRevision) say(error instanceof SyntaxError ? 'Friends need the Inner Table server.' : error.message);
    }
    finally {
      if(revision!==sessionRevision) return;
      busy = false;
      lookupButton.disabled = false;
      $('#friends-member').removeAttribute('aria-busy');
      const restore = before===document.activeElement || document.activeElement===document.body;
      render();
      if(focus && (restore || focus==='#discover-title')) {
        (focus.startsWith('#') ? $(focus) : controls.get(focus) || usernameInput).focus();
      }
      else if(key && restore && !$('#friends-view').hidden) {
        (controls.get(key) || (key.startsWith('preview:') && !previewPanel.hidden ? previewPanel : usernameInput)).focus();
      }
    }
  }
  async function updateConnectionsAfter(message) {
    say(message);
    try {await refresh();}
    catch {say(message + ' Refresh connections to see the latest changes.');}
  }
  function updateConnection(person,group,route,message,followBack=false) {
    return action(async () => {
      const context = generation;
      await request(route,{id:person.id});
      if(context!==generation) return;
      connections[group] = connections[group].filter(item=>item.id!==person.id);
      if(route==='approve') {
        if(!memberOf('followers',person.id)) connections.followers = [...connections.followers,person];
        if(followBack && canFollowBack(person.id)) {
          try {
            const result = await requestFollow(person);
            if(!result) return;
            message = result.approved ? 'Request approved. You already follow each other.' :
              'Request approved. Follow-back request sent.';
          } catch {
            if(context!==generation) return;
            message = 'Request approved. We could not confirm your follow-back request.';
          }
        }
      }
      if(route==='unfollow' && preview?.id===person.id) {
        preview = {id:person.id,display_name:person.display_name,username:person.username,connection_status:'none'};
      }
      if(route==='unfollow' && selected?.owner.id===person.id) leave();
      await updateConnectionsAfter(message);
      if(route!=='approve' || context!==generation || $('#friends-view').hidden) return;
      if(canFollowBack(person.id)) {
        $('#friend-sharing').open = true;
        return `followers:${person.id}:follow`;
      }
      if(memberOf('outgoing',person.id)) return '#friend-requests-title';
      if(memberOf('following',person.id)) return '#friend-guides-title';
    });
  }
  async function requestFollow(person) {
    const revision = lookupRevision;
    const context = generation;
    const isCurrentPreview = () => revision===lookupRevision && preview?.id===person.id;
    let result;
    try {
      result = await request('follow',{username:person.username,expected_id:person.id});
    } catch(error) {
      if(error.status===404 && context===generation && isCurrentPreview()) preview = null;
      throw error;
    }
    if(context!==generation) return;
    if(result.approved) {
      connections.outgoing = connections.outgoing.filter(item=>item.id!==person.id);
      if(!memberOf('following',person.id)) connections.following = [person,...connections.following];
    } else if(!memberOf('outgoing',person.id)) {
      connections.outgoing = [person,...connections.outgoing];
    }
    if(isCurrentPreview()) preview = {...preview,connection_status:result.approved?'approved':'pending'};
    return result;
  }
  function sendFollow(person,fromPreview=false) {
    if(fromPreview) {
      if(preview!==person || person.connection_status!=='none' || person.username!==username()) return;
    } else if(!canFollowBack(person.id)) return;
    return action(async () => {
      const revision = lookupRevision;
      const context = generation;
      const result = await requestFollow(person);
      if(!result) return;
      await updateConnectionsAfter(result.approved ? 'You can already search this guide.' : 'Request sent.');
      if(context!==generation || $('#friends-view').hidden) return;
      if(fromPreview && revision===lookupRevision && preview?.id===person.id) return '#friend-preview';
      if(memberOf('outgoing',person.id)) return '#friend-requests-title';
      if(memberOf('following',person.id)) return '#friend-guides-title';
    });
  }
  function openGuide(ownerId) {
    const verified = connections.following.some(person=>person.id===ownerId) ||
      (preview?.id===ownerId && preview.connection_status==='approved');
    if(!signedIn || !verified) return;
    return action(async () => {
      const context = generation;
      try {
        await beforeSwitch();
        if(context!==generation || !signedIn) return;
        const guide = await request('friend-guide',{ownerId});
        if(context!==generation) return;
        selected = guide;
        onSelect(selected);
        $('#friend-access-status').textContent = '';
        if($('#discover-view').hidden) $('[data-view="discover"]').click();
        return '#discover-title';
      } catch(error) {
        if(context!==generation) return;
        if(error.status===401 || error.status===403) {
          if(selected?.owner.id===ownerId) leave();
          $('#friend-access-status').textContent = 'That guide is no longer available. Choose another guide or open My places.';
          await refresh();
          return;
        }
        throw error;
      }
    });
  }
  function setSession(value) {
    if(value===signedIn) return;
    sessionRevision++;
    generation++;
    signedIn = value;
    if(signedIn) {
      render();
      return action(refresh);
    }
    preview = null;
    lookupRevision++;
    busy = false;
    lookupButton.disabled = false;
    $('#friends-member').removeAttribute('aria-busy');
    usernameInput.value = '';
    connections = emptyConnections();
    onFollowing(connections.following);
    leave();
  }
  previewPanel.tabIndex = -1;
  usernameInput.addEventListener('input', () => {
    lookupRevision++;
    preview = null;
    say('');
    renderPreview();
  });
  $('#friend-request-form').addEventListener('submit',event => {
    event.preventDefault();
    return action(async () => {
      const query = username();
      const revision = ++lookupRevision;
      const context = generation;
      preview = null;
      say('Finding profile…');
      let person;
      try {person = await request('find-friend',{username:query});}
      catch(error) {
        if(context===generation && revision===lookupRevision) throw error;
        return;
      }
      if(context!==generation || revision!==lookupRevision || query!==username()) return;
      preview = person;
      say('');
      if(!$('#friends-view').hidden) return '#friend-preview';
    });
  });
  $('#friends-refresh').addEventListener('click', () => action(async () => {
    await refresh();
    say('Connections refreshed.');
  }));
  $('#use-my-guide').addEventListener('click', () => {
    if(selected) leave();
    const picker = $('#guide-picker');
    picker.open = false;
    picker.querySelector('summary').focus();
  });
  window.addEventListener('focus',async () => {
    if(!selected) {
      if(!$('#friends-view').hidden) return action(refresh);
      return;
    }
    const ownerId = selected.owner.id, context = generation;
    try {
      const updated = await request('friend-guide',{ownerId});
      if(context!==generation || selected?.owner.id!==ownerId) return;
      if(JSON.stringify(updated)!==JSON.stringify(selected)) {
        selected = updated;
        onSelect(selected);
        render();
      }
    } catch(error) {
      if(context===generation && selected?.owner.id===ownerId && (error.status===401 || error.status===403)) {
        leave('This friend’s guide is no longer available. You are back in your own guide.');
        await action(refresh);
      }
    }
  });
  render();
  return {setSession,leave,openGuide,refresh:()=>action(refresh),getOwner:()=>selected?.owner || null};
}
