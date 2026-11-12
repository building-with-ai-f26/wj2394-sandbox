const $ = selector => document.querySelector(selector);
const I = InnerTableImport;
const STORE = 'inner-table-places-v1';
let account = null, friends = null, friendGuide = null, guideMode = 'device';
let places = [], pending = null, storageBroken = false;
const selectedPlaces = new Set();

try {
  const raw = localStorage.getItem(STORE);
  if (raw) places = I.validateBackup(raw);
} catch {
  storageBroken = true;
  $('#storage-status').textContent = 'Saved data could not be read. Existing data will not be overwritten. You can explore this session and export a backup, but changes will not persist.';
}
let devicePlaces = places;
const google=GooglePlaces.createController({
  getPlaces:()=>[...places,...(friendGuide?.places || [])],
  onUpdate:()=>{renderSaved();renderDiscover();},
  onLink:(place,id)=>{const current=places.find(p=>p.id===place.id);if(current){current.googlePlaceId=id;persist();}}
});
function element(tag, className = '', text = '') {
  const node = document.createElement(tag); node.className = className; node.textContent = text; return node;
}
function button(text, handler, className = 'secondary') {
  const node = element('button',className,text); node.type = 'button'; node.addEventListener('click',handler); return node;
}
function persist() {
  if (guideMode === 'account') {account.save(places);return;}
  devicePlaces = places;
  if(account)account.refresh();
  if (storageBroken) return;
  try {localStorage.setItem(STORE,JSON.stringify({version:1,places})); $('#storage-status').textContent = '';}
  catch {$('#storage-status').textContent = 'Browser storage is unavailable or full. Changes are kept for this session only. Export a backup to keep them.';}
}
function showView(view) {
  $('#discover-view').hidden = view !== 'discover'; $('#places-view').hidden = view !== 'places'; $('#account-view').hidden = view !== 'account'; $('#friends-view').hidden = view !== 'friends';
  document.querySelectorAll('nav [data-view]').forEach(node => {node.classList.toggle('active',node.dataset.view === view); if(node.dataset.view === view) node.setAttribute('aria-current','page'); else node.removeAttribute('aria-current');});
  if (view === 'discover') renderDiscover(); else if(view === 'places') renderSaved();
  window.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
}
document.querySelectorAll('[data-view]').forEach(node => node.addEventListener('click',() => showView(node.dataset.view)));
function discoverPlaces() { return (friendGuide ? friendGuide.places : places).filter(I.ready).map(google.merge); }
let planResults = null;
const planChat = createPlanChat({getOwner:()=>friends?.getOwner(), onAccessDenied:()=>friends.leave('This friend’s guide is no longer available. You are back in your own guide.'), getPlaces: discoverPlaces, preparePlaces: async ids => {await googleReady;return google.prepareForPlan(ids);}, onResults: result => {planResults = result; renderDiscover();}});
function renderDiscover() {
  const results = $('#results');
  results.replaceChildren();
  const hasReply = planResults !== null;
  results.hidden = !hasReply;
  $('#result-summary').closest('.list-heading').hidden = !hasReply;
  $('#discover-view .hero').hidden = true;
  $('#discover-view .method').hidden = !hasReply;
  if(!hasReply) {
    $('#result-summary').textContent = '';
    return;
  }
  const data = discoverPlaces();
  const outcome = InnerTableMatcher.matchPlaces(data,'');
  if (planResults) {
    outcome.matches = planResults.matches.map(match => ({place: data.find(place => String(place.id) === match.id), reasons: ['AI suggestion · ' + match.reason]})).filter(({place}) => place);
    outcome.recognized = true;
    outcome.unsupported = false;
  }
  $('#result-summary').textContent = `${outcome.matches.length} ${outcome.matches.length === 1 ? 'place' : 'places'} · ${friendGuide ? (friendGuide.owner.display_name || friendGuide.owner.username) + "’s guide" : 'Your guide'}`;
  if (!outcome.matches.length) {
    const empty = element('div','empty');
    const noPersonal = !data.length && !friendGuide;
    empty.append(element('h2','',noPersonal ? 'Your next great recommendation starts here.' : 'No confident matches for this plan.'));
    empty.append(element('p','',noPersonal ? 'Import your saved list and it will be ready to explore. Edit any place’s status or details whenever you like; no review of every pin is required.' : outcome.unsupported ? 'We can’t verify dietary needs, accessibility, opening hours, or availability here. Check those requirements directly with the venue. Some negative preferences are also not understood by this demo.' : !outcome.recognized ? 'Try coffee, bars, shopping, dinner, a catch-up, a special occasion, a neighborhood, or “under $100”. This prototype only understands a small set of keywords.' : 'Nothing on this shortlist fits every constraint. Try a different neighborhood, a higher budget, or a broader occasion.'));
    if (noPersonal) {
      const actions = element('div','actions');
      actions.append(button('Add your places',() => showView('places'),'primary'));
      empty.append(actions);
    }
    if(friendGuide && !data.length) {empty.querySelector('h2').textContent = 'This friend has no visible places yet.';empty.querySelector('p').textContent = 'They can choose which places to show in their guide. You can return to your own guide above.';}
    if (planResults) empty.querySelector('p').textContent = planResults.reply;
    results.append(empty); return;
  }
  outcome.matches.forEach(({place,reasons}) => {
    const card = element('article','card');
    const photo=google.photo(place);
    if(photo) {
      const image = element('img','place-photo');
      image.src = photo;
      image.alt = place.name + ' — Google Maps photo';
      image.loading = 'lazy';
      image.addEventListener('error', () => {image.remove();card.classList.remove('has-photo');});
      card.append(image);
      card.classList.add('has-photo');
    }
    const body = element('div','card-body');
    body.append(element('p','card-source',friendGuide ? `From ${friendGuide.owner.display_name || friendGuide.owner.username}’s guide` : 'From your guide'));
    const metadata = [I.categoryLabel(place.category) + (place.googleCategoryUsed ? ' (Google)' : ''), place.neighborhood, place.price === null ? '' : `~$${place.price} per person`].filter(Boolean);
    body.append(element('h3','',place.name),element('p','place-meta',metadata.join(' · ')));
    if(place.note) body.append(element('p','note',friendGuide ? `${friendGuide.owner.display_name || friendGuide.owner.username}’s note · ${place.note}` : place.note));
    if(planResults) body.append(element('p','reason',reasons.join('. ')+'.'));
    const tags = element('div','tags');tags.append(element('span','tag',`Visit status: ${I.visitLabel(place.status)}`));place.tags.forEach(tag => tags.append(element('span','tag',((place.googleReviewTags || []).includes(tag)?'Google review hint: ':(place.inferredTags || []).includes(tag)?'Suggested: ':'') + (tag === 'conversation' ? 'good for talking' : tag))));body.append(tags);
    const extra = google.extras(place);
    if(extra) {
      const details = element('details','place-more');
      details.append(element('summary','','Google details & reviews'),extra);
      body.append(details);
    }
    const bottom = element('div','card-bottom');if(friendGuide)bottom.append(element('span','',`From ${friendGuide.owner.display_name || friendGuide.owner.username}’s guide`));bottom.append(element('span','',place.recommended ? 'Personally recommended' : `${place.listName ? 'Saved list: '+place.listName : 'Saved place'} · Not personally endorsed`));
    {const link=element('a','','Open in Maps ↗');link.href=I.mapsURL(place.url);link.target='_blank';link.rel='noopener noreferrer';bottom.append(link);}
    card.append(body,bottom);results.append(card);
  });
}
$('#search-form').addEventListener('submit',event => {event.preventDefault();planChat.submit();});
document.querySelectorAll('[data-prompt]').forEach(node => node.addEventListener('click',() => {$('#occasion').value=node.dataset.prompt;planChat.submit();}));
$('#reset').addEventListener('click',() => {planChat.reset();HTMLFormElement.prototype.reset.call($('#search-form'));renderDiscover();$('#occasion').focus();});
function changed() {persist();renderSaved();renderDiscover();}
function updateSelection() {
  $('#selection-count').textContent = `${selectedPlaces.size} selected`;
  $('#select-all-places').disabled = !places.length || selectedPlaces.size === places.length;
  $('#clear-place-selection').disabled = !selectedPlaces.size;
  $('#show-selected-places').disabled = !selectedPlaces.size;
  $('#hide-selected-places').disabled = !selectedPlaces.size;
  $('#remove-selected-places').disabled = !selectedPlaces.size;
  document.querySelectorAll('.place-selection input').forEach(input => {
    input.checked = selectedPlaces.has(input.value);
  });
}
$('#select-all-places').addEventListener('click', () => {
  places.forEach(place => selectedPlaces.add(String(place.id)));
  updateSelection();
});
$('#clear-place-selection').addEventListener('click', () => {
  selectedPlaces.clear();
  updateSelection();
});
function setSelectedVisibility(visible) {
  places.forEach(place => {
    if(selectedPlaces.has(String(place.id))) place.inGuide = visible;
  });
  changed();
}
$('#show-selected-places').addEventListener('click', () => setSelectedVisibility(true));
$('#hide-selected-places').addEventListener('click', () => setSelectedVisibility(false));
$('#remove-selected-places').addEventListener('click', () => {
  const selected = places.filter(place => selectedPlaces.has(String(place.id)));
  if(!selected.length || !window.confirm(`Remove ${selected.length} selected places from this ${guideMode === 'account' ? 'account' : 'device'} guide?`)) return;
  selected.forEach(place => google.forget(place.id));
  if(selectedPlaces.has($('#place-id').value)) closeEditor();
  places = places.filter(place => !selectedPlaces.has(String(place.id)));
  selectedPlaces.clear();
  changed();
});
function renderSaved() {
  const currentIds = new Set(places.map(place => String(place.id)));
  selectedPlaces.forEach(id => {if(!currentIds.has(id)) selectedPlaces.delete(id);});
  $('#saved-count').textContent = places.length ? `(${places.length})` : '';
  const readyCount = places.filter(I.ready).length;
  $('#queue-summary').textContent = `${places.length} saved · ${readyCount} in your guide · ${places.filter(p=>p.recommended).length} personally recommended · ${places.length-readyCount} hidden from suggestions`;
  $('#export-places').disabled = !places.length;
  $('#show-all-in-guide').disabled = readyCount === places.length;
  const list=$('#my-places');list.replaceChildren();
  updateSelection();
  if(!places.length) {const empty=element('div','empty');empty.append(element('h3','','Start with a place you’d tell a friend about.'),element('p','','Add a Maps link above, or bring over an unzipped saved-list CSV. You can sort out the messy pins here.'));list.append(empty);return;}
  places.forEach(place => {
    const row=element('article','saved-row'), content=element('div');
    const enriched=google.merge(place);
    const selection = element('label','place-selection');
    const checkbox = element('input');
    checkbox.type = 'checkbox';
    checkbox.value = String(place.id);
    checkbox.checked = selectedPlaces.has(String(place.id));
    checkbox.setAttribute('aria-label', `Select ${place.name}`);
    checkbox.addEventListener('change', () => {
      if(checkbox.checked) selectedPlaces.add(String(place.id));
      else selectedPlaces.delete(String(place.id));
      updateSelection();
    });
    selection.append(checkbox,element('span','','Select'));
    content.append(selection);
    content.append(element('span',I.ready(place)?'badge ready':'badge',I.ready(place)?'In your guide':'Saved · review details'),element('h3','',place.name),element('p','',`${I.categoryLabel(enriched.category)}${enriched.googleCategoryUsed?' (Google)':''} · ${place.neighborhood || 'Neighborhood unknown'} · ${I.visitLabel(place.status)}`));
    if(place.note) content.append(element('p','',place.note));
    content.append(element('p','',place.recommended ? 'Personally recommended' : `${place.listName ? 'Saved list: '+place.listName : 'Saved place'} · Not personally endorsed`));
    const link=element('a','','Open in Maps ↗');link.href=I.mapsURL(place.url);link.target='_blank';link.rel='noopener noreferrer';content.append(link);
    const actions=element('div','actions');actions.append(button('Edit',()=>openEditor(place)),button(I.ready(place)?'Hide place':'Show in guide',()=>{place.inGuide=!I.ready(place);changed();}),button('Remove',()=>{
      if(!window.confirm(`Remove “${place.name}” from this browser?`)) return;
      google.forget(place.id);places=places.filter(p=>p.id!==place.id);if($('#place-id').value===place.id) closeEditor();changed();
    },'text-button'),google.action(place));
    if(place.googlePlaceId)actions.append(button('Change Google match',()=>google.rematch(place),'text-button'));
    const extra=google.extras(place);if(extra)content.append(extra);
    row.append(content,actions);list.append(row);
  });
}
function closeEditor() {$('#place-editor').close();$('#place-editor').hidden=true;$('#place-form').reset();$('#place-id').value='';$('#editor-error').textContent='';}
function openEditor(place) {
  closeEditor();$('#place-editor').hidden=false;$('#editor-title').textContent=place ? 'Edit your place' : 'Add a place';
  $('#inferred-info').textContent=place && (place.inferredTags || []).length ? 'Some selected tags were suggested from saved note or list keywords. You can change them below.' : '';
  if(place) {
    for(const [field,key] of [['id','id'],['name','name'],['url','url'],['category','category'],['neighborhood','neighborhood'],['visited','status'],['note','note'],['price','price']]) $('#place-'+field).value=place[key] ?? '';
    $('#place-recommend').checked=place.recommended;
    $('#place-in-guide').checked=I.ready(place);
    document.querySelectorAll('[name=tag]').forEach(node=>node.checked=place.tags.includes(node.value));
  }
  $('#place-editor').showModal();$('#editor-title').focus();
}
$('#place-editor').addEventListener('cancel',event=>{event.preventDefault();closeEditor();});
$('#show-add').addEventListener('click',()=>openEditor());$('#cancel-edit').addEventListener('click',closeEditor);
$('#place-form').addEventListener('submit',event=>{
  event.preventDefault();const error=$('#editor-error');error.textContent='';
  const url=I.mapsURL($('#place-url').value);
  if(!url) {error.textContent='Use an HTTPS Google Maps place link, such as maps.app.goo.gl or google.com/maps. Other links are not supported.';return;}
  const id=$('#place-id').value || crypto.randomUUID();
  const previous=places.find(p=>p.id===id);
  if(places.some(p=>p.id!==id && I.mapsURL(p.url)===url)) {error.textContent='That Maps link is already in your saved places. Edit the existing place instead.';return;}
  const place={id,name:$('#place-name').value.trim(),url,category:$('#place-category').value,neighborhood:$('#place-neighborhood').value.trim(),status:$('#place-visited').value,note:$('#place-note').value.trim(),price:$('#place-price').value ? Number($('#place-price').value) : null,tags:[...document.querySelectorAll('[name=tag]:checked')].map(node=>node.value),recommended:$('#place-recommend').checked,source:'Personal entry'};
  place.inGuide=$('#place-in-guide').checked;
  place.inferredTags=(previous?.inferredTags || []).filter(tag=>place.tags.includes(tag));
  place.listName=previous?.listName || '';
  place.source=previous?.source || place.source;
  if(previous?.googlePlaceId && previous.url===url)place.googlePlaceId=previous.googlePlaceId;
  if(previous && previous.url!==url)google.forget(id);
  if(!place.name) {error.textContent='Add a place name.';return;}
  if(!places.some(p=>p.id===id) && places.length>=2000) {error.textContent='This prototype supports up to 2,000 saved places. Export a backup before making room.';return;}
  const index=places.findIndex(p=>p.id===id);if(index<0) places.push(place);else places[index]=place;
  closeEditor();changed();$('#import-status').textContent='Place saved. Your changes are reflected in Discover.';
});
function showPreview(result, kind) {
  pending={...result,kind};const count=result.places.length;
  $('#import-preview').hidden=false;$('#import-summary').textContent=`${count} places ready to ${kind==='backup'?'restore':'add to your guide'} · ${result.duplicates} duplicates skipped · ${result.skipped} invalid or non-Maps rows skipped.`;
  $('#confirm-import').textContent=kind==='backup'?'Restore these places':'Add to my guide';$('#confirm-import').disabled=!count;
  const list=$('#import-items');list.replaceChildren();
  result.places.slice(0,100).forEach(place=>{const row=element('div','preview-item');row.append(element('strong','',place.name),element('p','',place.note || 'No personal note yet.'),element('p','',place.url));list.append(row);});
  if(count>100) list.append(element('p','small',`Showing the first 100 of ${count} places. All valid places will be added.`));
  $('#import-preview').scrollIntoView({behavior:'smooth'});
}
function cancelImport() {pending=null;$('#import-preview').hidden=true;$('#csv-file').value='';$('#restore-file').value='';}
$('#cancel-import').addEventListener('click',cancelImport);
$('#csv-file').addEventListener('change',async event=>{
  const file=event.target.files[0];cancelImport();$('#import-status').textContent='';if(!file) return;
  try {if(file.size>2_000_000) throw new Error('Choose a CSV smaller than 2 MB.');showPreview(I.importCSV(await file.text(),places,file.name),'csv');}
  catch(error) {$('#import-status').textContent=error.message;}
});
$('#maps-list-form').addEventListener('submit', async event => {
  event.preventDefault();
  const targetGuide = places;
  const status = $('#maps-list-status');
  $('#maps-list-import').disabled = true;
  status.textContent = 'Reading your shared list…';
  try {
    const response = await fetch('/api/import/maps-list', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({url: $('#maps-list-url').value.trim()})
    });
    const data = await response.json();
    if(!response.ok) throw new Error(data.error || 'The list could not be imported. Try again.');
    if(places !== targetGuide) throw new Error('Your active guide changed. Import the link again into the guide you want.');
    const quote = value => '"' + value.replaceAll('"', '""') + '"';
    const csv = [['name','url','note','list'], ...data.places.map(place => [place.name,place.url,place.note,data.listName])].map(row => row.map(quote).join(',')).join('\n');
    const result = I.importCSV(csv, places);
    if(!result.places.length) {
      status.textContent = `No new places to add · ${result.duplicates} matching links already saved.`;
      return;
    }
    result.places.forEach(place => {place.source = 'Google Maps shared list';});
    showPreview(result, 'shared-list');
    $('#confirm-import').click();
    if(pending) throw new Error($('#import-status').textContent || 'The import needs attention below.');
    status.textContent = `${result.places.length} places imported · ${result.duplicates} matching links already saved. Paste this link again to import new additions.`;
  } catch(error) {
    status.textContent = error instanceof SyntaxError ? 'Start the local Inner Table. server to import a list, then try again.' : error.message;
  } finally {
    $('#maps-list-import').disabled = false;
  }
});
$('#confirm-import').addEventListener('click',()=>{
  if(!pending) return;
  // Recheck duplicates in case a place was added while the preview was open.
  const seen=new Set(places.map(p=>I.mapsURL(p.url)));
  const additions=pending.places.filter(p=>{const key=I.mapsURL(p.url);if(seen.has(key))return false;seen.add(key);return true;});
  if(places.length+additions.length>2000) {$('#import-status').textContent='This would exceed the 2,000-place prototype limit. Nothing was added.';return;}
  places.push(...additions);const kind=pending.kind;cancelImport();changed();$('#import-status').textContent=`${additions.length} places ${kind==='backup'?'restored':'added to your guide — ready to explore'}. Edit statuses or hide places anytime.`;
  if(kind==='csv' || kind==='shared-list')google.enrichImported(additions);
});
$('#show-all-in-guide').addEventListener('click',()=>{
  places.forEach(place=>{place.inGuide=true;});
  if ($('#place-id').value) $('#place-in-guide').checked=true;
  changed();
  $('#import-status').textContent=`All ${places.length} saved places are now in your guide. Visit statuses and personal endorsements are unchanged. Search filters still apply in Discover.`;
});
$('#export-places').addEventListener('click',()=>{
  const blob=new Blob([JSON.stringify({version:1,places},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),link=element('a');link.href=url;link.download='inner-table-backup.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
$('#restore-file').addEventListener('change',async event=>{
  const file=event.target.files[0];cancelImport();$('#import-status').textContent='';if(!file)return;
  try {
    if(file.size>20_000_000) throw new Error('Choose a backup smaller than 20 MB.');
    const restored=I.validateBackup(await file.text());const seen=new Set(places.map(p=>I.mapsURL(p.url)));let duplicates=0;
    const fresh=restored.filter(p=>{const key=I.mapsURL(p.url);if(seen.has(key)){duplicates++;return false;}seen.add(key);return true;});
    showPreview({places:fresh,duplicates,skipped:0},'backup');
  } catch {$('#import-status').textContent='Could not restore this backup. Use an Inner Table. JSON backup under 20 MB. No saved places were changed.';}
});
renderSaved();renderDiscover();
const googleReady = google.start();

friends = createFriends({
  beforeSwitch: () => account.flush(),
  onSelect: guide => {
    (friendGuide?.places || []).forEach(place => google.forget(place.id));
    friendGuide = {...guide,places:I.validateBackup(JSON.stringify({version:1,places:guide.places}))};
    planChat.reset();renderDiscover();
  },
  onClear: () => {
    (friendGuide?.places || []).forEach(place => google.forget(place.id));
    friendGuide = null;
    planChat.reset();renderDiscover();
  }
});
account = createAccounts({
  onSession: signedIn => friends.setSession(signedIn),
  getDevicePlaces: () => devicePlaces,
  onMode: mode => {guideMode = mode;},
  onGuide: (records, mode) => {
    selectedPlaces.clear();
    places.forEach(place => google.forget(place.id));
    places = records;
    guideMode = mode;
    friends.leave();
    closeEditor();cancelImport();planChat.reset();renderSaved();renderDiscover();
  }
});
account.start();
