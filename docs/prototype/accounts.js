/* Account tokens live on the local server. Device imports move only on explicit copy. */
function createAccounts({getDevicePlaces, onGuide, onMode}) {
  const $ = selector => document.querySelector(selector);
  let signedIn = false;
  let mode = 'device';
  let revision = 0;
  let pending = null;
  let saving = null;
  let busy = false;
  let blocked = false;
  function say(message) { $('#account-status').textContent = message; }
  async function request(path, body) {
    const response = await fetch('/api/account/' + path, body === undefined ? {} : {
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)
    });
    let data;
    try {data = await response.json();}
    catch {throw new Error('Accounts need the local Inner Table server.');}
    if(!response.ok) throw new Error(data.error || 'Your account could not be reached.');
    return data;
  }
  function render() {
    $('#account-auth').hidden = signedIn;
    $('#account-member').hidden = !signedIn;
    $('#account-nav-label').textContent = signedIn ? 'My account' : 'Sign in';
    $('#account-copy').textContent = `Copy ${getDevicePlaces().length} device places to my account`;
    $('#account-copy').disabled = busy || !getDevicePlaces().length;
    $('#account-google').disabled = busy;
    $('#guide-mode-label').textContent = mode === 'account' ? 'Your private account guide' : 'Your device guide';
    $('#guide-storage-note').textContent = mode === 'account'
      ? 'Your account guide is private. Changes save to your account. Export a backup anytime.'
      : 'Your places are saved in this browser. Sign in and choose Copy to my account to use them across devices.';
    $('#account-retry').hidden = !pending;
    $('#account-reload').hidden = mode !== 'account';
    onMode(mode);
  }
  async function sync() {
    if(saving)return saving;
    saving = (async () => {
      while(pending) {
        const snapshot = pending;
        say('Saving your private guide…');
        $('#account-sync').textContent = 'Saving to your account…';
        const result = await request('guide', {places:snapshot, revision});
        revision = result.revision;
        if(pending === snapshot)pending = null;
      }
      say('Your private guide is saved.');
      $('#account-sync').textContent = '';
    })();
    try {await saving;}
    catch(error) {
      blocked = true;
      say(error.message);
      $('#account-sync').textContent = 'Account changes are pending. Keep this page open, export a backup, or retry from My account.';
      throw error;
    } finally {saving = null;render();}
  }
  function save(places) {
    pending = JSON.parse(JSON.stringify(places));
    render();
    if(!blocked)sync().catch(() => {});
  }
  async function flush() {
    if(pending || saving) {
      blocked = false;
      await sync();
    }
  }
  function applyGuide(guide) {
    const places = InnerTableImport.validateBackup(JSON.stringify({version:1,places:guide.places}));
    revision = guide.revision;
    mode = 'account';
    pending = null;
    blocked = false;
    onGuide(places, mode);
    $('#account-sync').textContent = '';
    render();
  }
  async function loadAccount() {
    await flush();
    applyGuide(await request('guide'));
    say('Your private account guide is ready.');
  }
  async function action(work) {
    if(busy)return;
    busy = true;
    $('#account-view').setAttribute('aria-busy','true');
    render();
    try {await work();}
    catch(error) {say(error.message);}
    finally {busy = false;$('#account-view').removeAttribute('aria-busy');render();}
  }
  async function start() {
    let confirmationMessage = '';
    const callbackQuery = new URLSearchParams(window.location.search);
    if(callbackQuery.has('signin')) {
      confirmationMessage = callbackQuery.get('signin') === 'failed' ? 'Google sign-in could not finish. Please try again.' : 'Google sign-in completed.';
      callbackQuery.delete('signin');
      window.history.replaceState(null,'',window.location.pathname + (callbackQuery.size ? '?' + callbackQuery : '') + window.location.hash);
    }
    if(window.location?.hash) {
      const callback = new URLSearchParams(window.location.hash.slice(1));
      if(callback.has('access_token') || callback.has('error')) {
        confirmationMessage = callback.has('error')
          ? 'This confirmation link has expired or was already used. Try signing in with your email and password.'
          : 'Email confirmed. Sign in with your email and password to continue.';
        window.history.replaceState(null,'',window.location.pathname + window.location.search);
      }
    }
    try {
      const session = await request('session');
      signedIn = session.signedIn;
      $('#account-auth-form').hidden = !session.configured;
      $('#account-google').hidden = !session.configured;
      $('#account-setup').hidden = session.configured;
      if(signedIn) {
        $('#profile-name').value = session.profile.display_name || '';
        $('#profile-username').value = session.profile.username || '';
        await loadAccount();
      }
      render();
      if(confirmationMessage) {
        say(confirmationMessage);
        document.querySelector('[data-view="account"]').click();
      }
    } catch(error) {say(error.message);}
  }
  $('#account-auth-form').addEventListener('submit', event => {
    event.preventDefault();
    const route = event.submitter?.value === 'sign-up' ? 'sign-up' : 'sign-in';
    action(async () => {
      try {
        const result = await request(route,{email:$('#account-email').value.trim(),password:$('#account-password').value});
        if(route === 'sign-up')say(result.message);
        else {await start();}
      } finally {$('#account-password').value = '';}
    });
  });
  $('#account-google').addEventListener('click', () => action(async () => {
    await flush();
    say('Opening Google sign-in…');
    const result = await request('google/start', {});
    const destination = new URL(result.url);
    if(destination.protocol !== 'https:' || !destination.hostname.endsWith('.supabase.co') || destination.pathname !== '/auth/v1/authorize') {
      throw new Error('Google sign-in returned an invalid address.');
    }
    window.location.assign(destination.href);
  }));
  $('#account-profile-form').addEventListener('submit', event => {
    event.preventDefault();
    action(async () => {
      await request('profile',{display_name:$('#profile-name').value.trim(),username:$('#profile-username').value.trim()});
      say('Your private profile is saved.');
    });
  });
  $('#account-copy').addEventListener('click', () => action(async () => {
    await flush();
    const result = await request('migrate',{places:getDevicePlaces()});
    applyGuide(result);
    say(`${result.added} places copied. Existing account places were kept.`);
  }));
  $('#account-use-cloud').addEventListener('click', () => action(loadAccount));
  $('#account-use-device').addEventListener('click', () => action(async () => {
    await flush();
    mode = 'device';
    onGuide(getDevicePlaces(),mode);
    say('You are using your device guide.');
  }));
  $('#account-sign-out').addEventListener('click', () => action(async () => {
    try {await flush();}
    catch {
      if(!window.confirm('Your account changes have not saved. Export a backup first to keep them. Sign out and discard the pending changes?'))return;
    }
    await request('sign-out',{});
    pending = null;
    blocked = false;
    $('#account-sync').textContent = '';
    signedIn = false;
    mode = 'device';
    $('#account-profile-form').reset();
    onGuide(getDevicePlaces(),mode);
    say('Signed out. Your device guide is ready.');
  }));
  $('#account-retry').addEventListener('click', () => action(flush));
  $('#account-reload').addEventListener('click', () => action(async () => {
    if(pending && !window.confirm('Reload your account guide and discard pending page changes? Export a backup first if you want to keep them.'))return;
    const guide = await request('guide');
    applyGuide(guide);
    say('Loaded the latest account guide.');
  }));
  window.addEventListener('beforeunload', event => {
    if(pending) {event.preventDefault();event.returnValue = '';}
  });
  return {start,save,refresh:render};
}
