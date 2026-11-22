/* Account tokens live on the local server. Device imports move only on explicit copy. */
function renderPersonAvatar(container, profile, preview) {
  const identity = profile.display_name || profile.username || '';
  const initial = [...identity.trim()][0]?.toUpperCase() || '';
  container.textContent = initial;
  const source = preview === undefined && profile.has_photo && profile.id
    ? '/api/account/avatar?owner=' + encodeURIComponent(profile.id) + (profile.photo_version ? '&v=' + profile.photo_version : '')
    : preview;
  if(!source) return;
  const image = document.createElement('img');
  image.alt = '';
  image.loading = 'lazy';
  image.addEventListener('error', () => {
    if(image.parentElement===container) container.textContent = initial;
  }, {once:true});
  image.src = source;
  container.textContent = '';
  container.append(image);
}

async function resizeProfilePhoto(file) {
  if(!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size>8_000_000) {
    throw new Error('Choose a JPEG, PNG or WebP photo under 8 MB.');
  }
  const image = await createImageBitmap(file).catch(() => {
    throw new Error('This photo could not be opened. Try a different file.');
  });
  try {
    const size = Math.min(image.width,image.height);
    const canvas = document.createElement('canvas');
    canvas.width = 192;
    canvas.height = 192;
    const context = canvas.getContext('2d');
    context.fillStyle = '#f7f6f1';
    context.fillRect(0,0,192,192);
    context.drawImage(image,(image.width-size)/2,(image.height-size)/2,size,size,0,0,192,192);
    return canvas.toDataURL('image/jpeg',0.84);
  } finally {image.close();}
}

function createAccounts({getDevicePlaces, onGuide, onMode, onSession = () => {}, onReady = () => {}}) {
  const $ = selector => document.querySelector(selector);
  let signedIn = false;
  let mode = 'device';
  let revision = 0;
  let pending = null;
  let saving = null;
  let busy = false;
  let blocked = false;
  let currentProfile = {};
  let photoDraft;
  let photoVersion = 0;
  let resizing = false;
  function say(message) { $('#account-status').textContent = message; }
  function renderProfile(profile = {}) {
    currentProfile = profile;
    const name = profile.display_name || '';
    const username = profile.username || '';
    $('#profile-display-name').textContent = name || 'Your profile';
    $('#profile-display-handle').textContent = username ? `@${username}` : 'Choose a username to help friends find you.';
    $('#profile-display-bio').textContent = profile.bio || '';
    $('#profile-display-bio').hidden = !profile.bio;
    $('#profile-bio').value = profile.bio || '';
    $('#profile-personal-details').hidden = !profile.profile_fields;
    photoDraft = undefined;
    photoVersion++;
    resizing = false;
    $('#profile-photo').value = '';
    $('#profile-photo-status').textContent = '';
    renderPersonAvatar($('#profile-avatar'),profile);
    renderPhotoDraft();
  }
  function renderPhotoDraft() {
    renderPersonAvatar($('#profile-photo-preview'),currentProfile,photoDraft);
    $('#profile-photo-remove').hidden = photoDraft === undefined ? !currentProfile.has_photo : !photoDraft;
  }
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
    $('#account-nav-label').textContent = 'Profile';
    $('#account-copy').textContent = `Copy ${getDevicePlaces().length} device places to my account`;
    $('#account-copy').disabled = busy || !getDevicePlaces().length;
    $('#account-google').disabled = busy;
    $('#profile-save').disabled = busy || resizing;
    $('#profile-photo').disabled = busy;
    $('#profile-photo-remove').disabled = busy;
    $('#guide-mode-label').textContent = mode === 'account' ? 'Your private account guide' : 'Your device guide';
    $('#guide-storage-note').textContent = mode === 'account'
      ? 'Your account guide is private. Changes save to your account. Export a backup anytime.'
      : 'Your places are saved in this browser. Sign in and choose Copy to my account to use them across devices.';
    $('#account-retry').hidden = !pending;
    $('#account-reload').hidden = mode !== 'account';
    onMode(mode);
    onSession(signedIn);
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
  async function loadAccount(announce = true) {
    await flush();
    applyGuide(await request('guide'));
    if(announce)say('Your private account guide is ready.');
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
        renderProfile(session.profile);
        await loadAccount(false);
      }
      render();
      if(confirmationMessage) {
        say(confirmationMessage);
        document.querySelector('[data-view="account"]').click();
      }
      if(signedIn) onReady(session.profile.id);
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
    if(resizing) return;
    action(async () => {
      const profile = {display_name:$('#profile-name').value.trim(),username:$('#profile-username').value.trim()};
      if(currentProfile.profile_fields) {
        profile.bio = $('#profile-bio').value.trim();
        if(photoDraft !== undefined) profile.photo_data = photoDraft;
      }
      const result = await request('profile',profile);
      renderProfile({...result.profile,photo_version:Date.now()});
      say('Your private profile is saved.');
    });
  });
  $('#profile-photo').addEventListener('change', async event => {
    const file = event.target.files[0];
    if(!file) return;
    const version = ++photoVersion;
    resizing = true;
    $('#profile-save').disabled = true;
    $('#profile-photo-status').textContent = 'Preparing photo…';
    try {
      const photo = await resizeProfilePhoto(file);
      if(version!==photoVersion) return;
      photoDraft = photo;
      renderPhotoDraft();
      $('#profile-photo-status').textContent = 'Save profile to use this photo.';
    } catch(error) {
      if(version===photoVersion) {
        $('#profile-photo').value = '';
        $('#profile-photo-status').textContent = error.message;
      }
    } finally {
      if(version===photoVersion) {
        resizing = false;
        $('#profile-save').disabled = busy;
      }
    }
  });
  $('#profile-photo-remove').addEventListener('click', () => {
    photoVersion++;
    resizing = false;
    photoDraft = null;
    $('#profile-photo').value = '';
    $('#profile-save').disabled = busy;
    $('#profile-photo-status').textContent = 'Save profile to remove your photo.';
    renderPhotoDraft();
    $('#profile-photo').focus();
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
    renderProfile();
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
  return {start,save,flush,refresh:render};
}
