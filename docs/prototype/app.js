const $ = selector => document.querySelector(selector);
const I = InnerTableImport;
const STORE = 'inner-table-places-v1';
let account = null, friends = null, friendGuide = null, guideMode = 'device';
let signedInAccountId = null;
let profileSetupOpened = false;
let places = [], pending = null, storageBroken = false;
let demoMode = false, browseFriendPlaces = false;
let enrichmentReady = false;
const selectedPlaces = new Set();
const transientPublicDetails = new Map();

try {
  const raw = localStorage.getItem(STORE);
  if (raw) places = I.validateBackup(raw);
} catch {
  storageBroken = true;
  $('#storage-status').textContent = 'Saved data could not be read. Existing data will not be overwritten. You can explore this session and export a backup, but changes will not persist.';
}
let devicePlaces = places;
let observedPhotoList = null;
const visiblePhotoRows = new Set();
const photoObserver = new IntersectionObserver(entries => {
  for(const entry of entries) {
    if(entry.isIntersecting && entry.target.isConnected && observedPhotoList?.contains(entry.target)) visiblePhotoRows.add(entry.target);
    else visiblePhotoRows.delete(entry.target);
  }
  const list = observedPhotoList;
  googleReady.then(() => {
    if(!list || observedPhotoList !== list) return;
    const visibleIds = new Set([...visiblePhotoRows].map(row=>row.dataset.placeId));
    const records = list.id === 'my-places' ? places : friendGuide?.places.filter(I.ready) || [];
    google.ensureSavedPhotos(records.filter(place=>visibleIds.has(String(place.id)) && !licensedPhoto(placeDetails(place))));
  });
});

function observePhotoRows(list, visible) {
  if(!visible && observedPhotoList !== list) return;
  photoObserver.disconnect();
  visiblePhotoRows.clear();
  observedPhotoList = visible ? list : null;
  const rows = visible ? list.querySelectorAll('[data-place-id]') : [];
  if(!rows.length) {
    const current = observedPhotoList;
    googleReady.then(() => {
      if(observedPhotoList === current && !current?.querySelector('[data-place-id]')) google.ensureSavedPhotos([]);
    });
  }
  for(const row of rows) photoObserver.observe(row);
}

const google=GooglePlaces.createController({
  getPlaces:()=>[...places,...(friendGuide?.places || [])],
  onUpdate:()=>{
    if(!$('#places-view').hidden) renderSaved();
    if(!$('#discover-view').hidden) renderDiscover();
    if(enrichmentReady) venueResearch.run();
  },
  onLink:(place,id)=>{
    const current=places.find(item=>item.id===place.id && item.url===place.url);
    if(!current || current.googlePlaceId===id) return;
    if(current.googlePlaceId) delete current.publicDetails;
    current.googlePlaceId=id;
    persist();
  },
  onEnrichmentChecked:place=>{
    const index=places.indexOf(place);
    const key=ownerEnrichmentKey();
    if(index < 0 || !key) return;
    try {localStorage.setItem(key,String(index + 1));} catch {}
  }
});
const venueResearch = InnerTableEnrichment.createResearch({
  getPlaces:enrichmentRecords,
  mergeGoogle:placeDetails,
  available:google.researchAvailable,
  onChange:()=>{
    if(!$('#places-view').hidden) renderSaved();
    if(!$('#discover-view').hidden) renderDiscover();
  },
  onDetails:(place,evidence)=>{
    if(places.includes(place)) {
      const combined=I.combinePublicDetails(place.publicDetails,evidence);
      if(JSON.stringify(combined)!==JSON.stringify(place.publicDetails)) {
        place.publicDetails=combined;
        persist();
      }
    } else if(friendGuide?.places.includes(place) && I.ready(place)) {
      transientPublicDetails.set(place.id,I.combinePublicDetails(transientPublicDetails.get(place.id),evidence));
    }
  }
});

function enrichmentRecords() {
  if(!$('#places-view').hidden) return places;
  if(demoMode || (friendGuide && $('#discover-view').hidden)) return [];
  return friendGuide ? friendGuide.places.filter(I.ready) : places;
}

function ownerEnrichmentKey() {
  if(guideMode==='device') return 'inner-table-venue-progress:device';
  return signedInAccountId ? 'inner-table-venue-progress:' + signedInAccountId : '';
}

function queueGuideDetails(priority = []) {
  if(!enrichmentReady) return;
  googleReady.then(() => {
    const imports=priority.filter(place=>places.includes(place));
    const records=imports.length ? places : enrichmentRecords();
    let offset=0;
    const key=records===places ? ownerEnrichmentKey() : '';
    if(key) {
      try {offset = Number(localStorage.getItem(key)) || 0;} catch {}
    }
    if(!Number.isSafeInteger(offset) || offset<0 || offset>=records.length) offset=0;
    const ordered=[...new Set([...imports,...records.slice(offset),...records.slice(0,offset)])];
    google.ensureGuideDetails(ordered.filter(I.needsEnrichment));
    venueResearch.run();
  });
}

function placeDetails(place) {
  const details=google.merge(place);
  const supplement=transientPublicDetails.get(place.id);
  return I.mergeSavedHints(I.mergePublicDetails(supplement
    ? {...details,publicDetails:I.combinePublicDetails(place.publicDetails,supplement)} : details),place);
}

function metadataFor(place) {
  return [
    place.typeLabel || (place.category !== 'unknown' ? I.categoryLabel(place.category) : ''),
    place.cuisines?.map(titleCaseEvidence).join(' / '),
    place.neighborhood,
    place.status !== 'not specified' ? I.visitLabel(place.status) : '',
    place.price == null ? '' : `~$${place.price} per person`,
  ].filter(Boolean).join(' · ');
}

function titleCaseEvidence(value) {return value[0].toUpperCase()+value.slice(1);}

function addDetailSources(section, place) {
  const sources = new Map();
  const add = (label,url) => {
    if(!url) return;
    const entries = sources.get(url) || [];
    entries.push(label);
    sources.set(url,entries);
  };
  if(place.googleCategoryUsed) add('Category',google.placeURL(place));
  if(place.googleNeighborhoodUsed) add('Neighborhood',google.placeURL(place));
  if(place.googleCuisineTags?.length) add('Cuisine',google.placeURL(place));
  for(const keyword of place.googleVenueKeywords || []) add(titleCaseEvidence(keyword),google.placeURL(place));
  add('Category',place.webCategorySource);
  add('Neighborhood',place.webNeighborhoodSource);
  const suggestionLabels = {conversation:'Conversation',fun:'Lively outing',special:'Special occasion',date:'Date night',group:'Group outing'};
  for(const evidence of place.webReviewTags || []) add(suggestionLabels[evidence.value] + ' suggestion',evidence.url);
  for(const evidence of [...(place.webCuisineSources || []),...(place.webKeywordSources || [])]) {
    add(titleCaseEvidence(evidence.value),evidence.url);
  }
  for(const [url,labels] of sources) {
    const line = element('p','small',[...new Set(labels)].join(' and ') + ' from ');
    const domain = InnerTableEnrichment.sourceLabel(url);
    line.append(externalLink(url===google.placeURL(place) ? 'Google Maps' : domain,url));
    section.append(line);
  }
}

function appendMatchSources(section,sources) {
  if(!Array.isArray(sources)) return;
  const shown=new Set();
  for(const source of sources.slice(0,5)) {
    const url=I.sourceURL(source?.url);
    if(!url || shown.has(url) || typeof source.label!=='string' || !source.label.trim()) continue;
    shown.add(url);
    const citation=element('p','small');
    citation.append(externalLink(source.label.trim().slice(0,120),url));
    section.append(citation);
  }
}

function element(tag, className = '', text = '') {
  const node = document.createElement(tag); node.className = className; node.textContent = text; return node;
}
function button(text, handler, className = 'secondary') {
  const node = element('button',className,text); node.type = 'button'; node.addEventListener('click',handler); return node;
}
function externalLink(text, url, className = '') {
  const link = element('a',className,text);
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}
function licensedPhotoCredit(photo) {
  const credit = element('p','photo-credit','Photo: ');
  credit.append(externalLink(photo.author,photo.source),document.createTextNode(' · '),
    externalLink(photo.license,photo.licenseURL));
  return credit;
}
const failedPhotoFiles = new Set();

function licensedPhoto(place) {
  const photo = InnerTableVenuePhotos.find(place);
  return photo && !failedPhotoFiles.has(photo.file) ? photo : null;
}

function addPlacePhoto(row, place, content) {
  const sample = demoMode && row.classList.contains('card');
  const localPhoto = sample ? place.photo : licensedPhoto(place);
  const photo = localPhoto ? 'artwork/' + localPhoto.file : sample ? null : google.photo(place);
  row.classList.add('has-photo');

  function showMissingPhoto() {
    const state = sample ? 'unavailable' : google.photoState(place.id);
    const label = state === 'checking' ? 'Checking' : 'No photo';
    const tile = element('span','place-photo place-photo-placeholder',label);
    tile.setAttribute('aria-hidden','true');
    row.prepend(tile);
    const status = element('p','photo-credit',sample ? 'Photo unavailable' : google.photoStatus(place));
    if(state === 'retryable') {
      const retry = button('Retry photo', async () => {
        retry.disabled = true;
        try {await google.retryPhoto(place);}
        finally {retry.disabled = false;}
      }, 'text-button photo-retry');
      status.append(' · ', retry);
    }
    content.append(status);
  }

  if(!photo) {
    showMissingPhoto();
    return;
  }
  const image = element('img','place-photo');
  const credit = localPhoto ? licensedPhotoCredit(localPhoto) : google.photoCredit(place);
  image.alt = place.name;
  image.loading = 'lazy';
  image.addEventListener('error', () => {
    image.remove();
    credit?.remove();
    if(localPhoto && !sample) failedPhotoFiles.add(localPhoto.file);
    if(!localPhoto) google.rejectPhoto(place,photo);
    if(!row.isConnected) return;
    showMissingPhoto();
    if(localPhoto && !sample) {
      if(row.closest('#results') && planResults && !browseFriendPlaces) {
        google.checkShortlistPhotos(shortlistPhotoIds(planResults));
      } else if(observedPhotoList?.contains(row)) {
        photoObserver.unobserve(row);
        photoObserver.observe(row);
      }
    }
  }, {once:true});
  image.src = photo;
  row.prepend(image);
  if(credit) content.append(credit);
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
  if(view !== 'discover') dismissTour();
  $('#discover-view').hidden = view !== 'discover'; $('#places-view').hidden = view !== 'places'; $('#account-view').hidden = view !== 'account'; $('#friends-view').hidden = view !== 'friends';
  if(observedPhotoList?.closest('section[hidden]')) observePhotoRows(observedPhotoList,false);
  document.querySelectorAll('nav [data-view]').forEach(node => {node.classList.toggle('active',node.dataset.view === view); if(node.dataset.view === view) node.setAttribute('aria-current','page'); else node.removeAttribute('aria-current');});
  if (view === 'discover') renderDiscover(); else if(view === 'places') renderSaved();
  else if(view === 'friends') friends?.refresh();
  queueGuideDetails();
  window.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
}
document.querySelectorAll('[data-view]').forEach(node => node.addEventListener('click',() => showView(node.dataset.view)));
function discoverPlaces() {
  if(demoMode) return InnerTableDemo;
  return (friendGuide ? friendGuide.places : places).filter(I.ready).map(placeDetails);
}
function setDemoMode(enabled) {
  demoMode = enabled;
  browseFriendPlaces = false;
  planChat.reset();
  renderDiscover();
  queueGuideDetails();
}
$('#try-demo').addEventListener('click', () => {
  setDemoMode(true);
  if(!tour.hidden) dismissTour();
  $('#shortlist-heading').focus();
});
$('#leave-demo').addEventListener('click', () => {
  setDemoMode(false);
  if(!tour.hidden) renderTour();
});
let planResults = null;
let shortlistSharing = false;
let shareableShortlist = [];
const shortlistSelection = new Set();

function clearShareFeedback() {
  $('#shortlist-share-status').textContent = '';
  $('#shortlist-share-preview-label').hidden = true;
  $('#shortlist-share-preview').value = '';
}

function updateShortlistShare() {
  const share = $('#shortlist-share');
  share.hidden = !shareableShortlist.length;
  share.textContent = shortlistSharing ? 'Close sharing' : 'Share places';
  share.setAttribute('aria-expanded', String(shortlistSharing));
  $('#shortlist-share-options').hidden = !shortlistSharing;
  $('#shortlist-share-copy').disabled = !shortlistSelection.size;
  $('#shortlist-share-count').textContent = shortlistSelection.size
    ? `${shortlistSelection.size} selected`
    : 'Select places to share.';
}

function reservationLink(place) {
  if(place.reservationURL) return I.sourceURL(place.reservationURL);
  const website = I.sourceURL(place._google?.websiteUri);
  if(!website) return '';
  const url = new URL(website);
  const dedicatedPage = /\/(?:reservations?|book-a-table)(?:\/|$)/i.test(url.pathname);
  const resyVenue = /^(?:www\.)?resy\.com$/.test(url.hostname) && /\/venues\/[^/]+/.test(url.pathname);
  return dedicatedPage || resyVenue ? website : '';
}

function formatSharedPlaces(selected) {
  return selected.map(place => {
    const category = place.typeLabel || (place.category !== 'unknown' ? I.categoryLabel(place.category) : '');
    const description = (demoMode && place.description) || [category,place.neighborhood].filter(Boolean).join(' · ')
      || place._google?.formattedAddress;
    const maps = google.placeURL(place);
    const reservation = reservationLink(place);
    return [place.name,description,maps && 'Google Maps: ' + maps,reservation && 'Reservations: ' + reservation]
      .filter(Boolean).join('\n');
  }).join('\n\n');
}

$('#shortlist-share').addEventListener('click', () => {
  shortlistSharing = !shortlistSharing;
  shortlistSelection.clear();
  clearShareFeedback();
  renderDiscover();
});

$('#shortlist-share-copy').addEventListener('click', async () => {
  const selected = shareableShortlist.filter(place=>shortlistSelection.has(String(place.id)));
  if(!selected.length) return;
  const text = formatSharedPlaces(selected);
  const current = planResults;
  let copied = false;
  try {
    await navigator.clipboard.writeText(text);
    copied = true;
  } catch {}
  if(current !== planResults || !shortlistSharing || selected.length !== shortlistSelection.size ||
      selected.some(place=>!shortlistSelection.has(String(place.id)))) return;
  const status = $('#shortlist-share-status');
  status.textContent = copied ? 'Copied. Paste the places into a chat or email.' : 'Select and copy the text below.';
  if(!copied) {
    const preview = $('#shortlist-share-preview');
    preview.value = text;
    $('#shortlist-share-preview-label').hidden = false;
    preview.focus();
    preview.select();
  }
});

function shortlistPhotoIds(result) {
  if(demoMode || !result) return [];
  const placesById = new Map(discoverPlaces().map(place=>[String(place.id),place]));
  return result.matches.map(match=>String(match.id)).filter(id=>placesById.has(id) && !licensedPhoto(placesById.get(id)));
}
const planChat = createPlanChat({
  getOwner: () => demoMode ? null : friends?.getOwner(),
  onAccessDenied: () => friends.leave('This friend’s guide is no longer available. You are back in your own guide.'),
  getPlaces: discoverPlaces,
  preparePlaces: async ids => {
    if(demoMode) return {requested:ids.length,checked:0,error:'',sample:true};
    const scope=friendGuide || places;
    const activeIds=new Set(discoverPlaces().map(place=>String(place.id)));
    const targets=[...new Set(ids.map(String))].filter(id=>activeIds.has(id));
    const stillActive=()=>!demoMode && (friendGuide || places)===scope && !$('#discover-view').hidden;
    await googleReady;
    if(!stillActive()) return {requested:targets.length,checked:0,webChecked:0,error:''};
    const [coverage,web]=await Promise.all([google.prepareForPlan(targets),venueResearch.run(targets)]);
    return {...coverage,webChecked:stillActive() ? web.checked : 0};
  },
  onResults: result => {
    planResults = result;
    shortlistSharing = false;
    shortlistSelection.clear();
    clearShareFeedback();
    browseFriendPlaces = false;
    $('#shortlist-feedback-status').textContent = '';
    google.checkShortlistPhotos(shortlistPhotoIds(result));
    renderDiscover();
  }
});
for(const id of ['feedback-helpful','feedback-not-yet']) {
  $('#' + id).addEventListener('click', () => {$('#shortlist-feedback-status').textContent = 'Thanks for your feedback.';});
}
function renderDiscover() {
  $('#demo-controls').hidden = demoMode;
  $('#demo-notice').hidden = !demoMode;
  $('#guide-picker').hidden = demoMode;
  const results = $('#results');
  const expanded = new Set([...results.querySelectorAll('.place-more[open]')].map(detail=>detail.parentElement.dataset.placeId));
  const focusedSelection = document.activeElement?.classList.contains('shortlist-share-checkbox')
    ? document.activeElement.closest('[data-place-id]').dataset.placeId : '';
  results.replaceChildren();
  const hasReply = planResults !== null;
  const browsing = !!friendGuide && !demoMode && browseFriendPlaces;
  const showShortlist = hasReply && !browsing;
  const data = discoverPlaces();
  const friendName = friendGuide?.owner.display_name || friendGuide?.owner.username;
  $('#occasion').placeholder = hasReply ? 'Anything else for this plan?' : 'Dinner with a friend, somewhere we can talk…';
  const showPlaces = showShortlist || demoMode || browsing;
  $('#discover-view').dataset.hasResults = String(showPlaces);
  $('#shortlist-feedback').hidden = !showShortlist;
  results.hidden = !showPlaces;
  $('#result-summary').closest('.list-heading').hidden = !showPlaces;
  $('#shortlist-heading').textContent = browsing ? friendName + '’s places' : showShortlist ? 'Your shortlist' : 'Sample places';
  $('#plan-start').hidden = showPlaces || tour.hidden || tourStep !== tourSteps.length - 1;
  $('#show-shortlist').hidden = !showShortlist && !demoMode && !(browsing && hasReply);
  const browseButton = $('#browse-friend-places');
  browseButton.hidden = !friendGuide || demoMode || !data.length || (browsing && hasReply);
  browseButton.textContent = browsing ? 'Close guide list' : `Browse all ${data.length} ${data.length === 1 ? 'place' : 'places'}`;
  browseButton.setAttribute('aria-expanded', String(browsing));
  $('#guide-empty').hidden = data.length > 0;
  $('#guide-empty-copy').textContent = friendGuide
    ? 'This friend has no visible places yet. Choose another guide to keep looking.'
    : 'Your guide is empty.';
  $('#guide-empty [data-view]').hidden = !!friendGuide;
  $('#discover-view .method').hidden = !showShortlist;
  if(!browsing) observePhotoRows(results,false);
  if(!showPlaces) {
    shareableShortlist = [];
    updateShortlistShare();
    $('#result-summary').textContent = '';
    return;
  }
  const outcome = InnerTableMatcher.matchPlaces(data,'');
  if(browsing) outcome.matches = data.map(place=>({place}));
  if (showShortlist) {
    outcome.matches = planResults.matches.map(match => ({
      place:data.find(place=>String(place.id)===match.id),reasons:[match.reason],sources:match.sources
    })).filter(({place})=>place);
    outcome.recognized = true;
    outcome.unsupported = false;
  }
  shareableShortlist = showShortlist ? outcome.matches.map(({place})=>place) : [];
  const shareableIds = new Set(shareableShortlist.map(place=>String(place.id)));
  for(const id of shortlistSelection) if(!shareableIds.has(id)) shortlistSelection.delete(id);
  if(!shareableIds.size) {
    shortlistSharing = false;
    clearShareFeedback();
  }
  updateShortlistShare();
  $('#result-summary').textContent = `${outcome.matches.length} ${outcome.matches.length === 1 ? 'place' : 'places'} · ${demoMode ? 'NYC sample guide' : friendGuide ? friendName + '’s guide' : 'Your guide'}`;
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
    if (showShortlist) empty.querySelector('p').textContent = planResults.reply;
    results.append(empty);
    observePhotoRows(results,browsing && !$('#discover-view').hidden);
    return;
  }
  outcome.matches.forEach(({place,reasons,sources}) => {
    const card = element('article','card');
    card.dataset.placeId = place.id;
    const body = element('div','card-body');
    const metadata = metadataFor(place);
    body.append(element('h3','',place.name));
    if(metadata) body.append(element('p','place-meta',metadata));
    if(!demoMode)body.append(element('p','card-source',friendGuide ? `Saved by ${friendGuide.owner.display_name || friendGuide.owner.username}` : 'Saved by you'));
    if(demoMode) body.append(element('p','sample-description',place.description));
    if(place.note) body.append(element('blockquote','note',place.note));
    if(showShortlist && reasons.some(Boolean)) {
      const fit = element('div','reason');
      fit.append(element('h4','','Why it fits'),element('p','',reasons.join(' ')));
      body.append(fit);
    }

    addPlacePhoto(card,place,body);
    card.append(body);
    const detail = element('details','place-more');
    detail.open = expanded.has(String(place.id));
    detail.append(element('summary','','Place details'));
    if(showShortlist) appendMatchSources(detail,sources);
    const links = element('div','place-links');
    if(demoMode) {
      detail.append(element('p','small',place.address));
      links.append(externalLink('Official website',place.website,'place-map'));
    } else {
      detail.append(element('p','place-provenance',place.recommended
        ? 'Personally recommended'
        : `${place.listName ? 'Saved list: ' + place.listName : 'Saved place'} · Not personally endorsed`));
      const tags = element('div','tags');
      place.tags.forEach(tag => {
        const webEvidence = place.webReviewTags?.find(item=>item.value===tag);
        const source = (place.googleReviewTags || []).includes(tag) ? 'Google review hint · ' :
          webEvidence ? 'Suggested from ' + InnerTableEnrichment.sourceLabel(webEvidence.url) + ' · ' :
          (place.inferredTags || []).includes(tag) ? 'Suggested · ' : '';
        tags.append(element('span','tag',source + (tag === 'conversation' ? 'good for talking' : tag)));
      });
      if(tags.childElementCount) detail.append(tags);
      addDetailSources(detail,place);
      const extra = google.extras(place);
      if(extra) detail.append(extra);
    }
    const url = google.placeURL(place);
    if(url) links.append(externalLink('Open in Maps',url,'place-map'));
    detail.append(links);
    card.append(detail);
    let shareCheckbox;
    if(showShortlist && shortlistSharing) {
      const id = String(place.id);
      const label = element('label','shortlist-share-choice');
      const checkbox = element('input','shortlist-share-checkbox');
      checkbox.type = 'checkbox';
      checkbox.checked = shortlistSelection.has(id);
      checkbox.addEventListener('change', () => {
        if(checkbox.checked) shortlistSelection.add(id);
        else shortlistSelection.delete(id);
        clearShareFeedback();
        updateShortlistShare();
      });
      label.append(checkbox,element('span','','Select ' + place.name));
      card.append(label);
      if(id === focusedSelection) shareCheckbox = checkbox;
    }
    results.append(card);
    shareCheckbox?.focus({preventScroll:true});
  });
  observePhotoRows(results,browsing && !$('#discover-view').hidden);
}
$('#show-shortlist').addEventListener('click', () => {
  if(browseFriendPlaces) {
    browseFriendPlaces = false;
    google.checkShortlistPhotos(shortlistPhotoIds(planResults));
    renderDiscover();
  }
  $('#shortlist-heading').focus();
});
$('#browse-friend-places').addEventListener('click', () => {
  browseFriendPlaces = !browseFriendPlaces;
  if(browseFriendPlaces) google.checkShortlistPhotos([]);
  renderDiscover();
  if(browseFriendPlaces) $('#shortlist-heading').focus();
});
$('#back-to-plan').addEventListener('click', () => $('#occasion').focus());
$('#search-form').addEventListener('submit',event => {event.preventDefault();planChat.submit();});
document.querySelectorAll('[data-prompt]').forEach(node => node.addEventListener('click',() => {$('#occasion').value=node.dataset.prompt;$('#occasion').focus();}));
for(const starter of document.querySelectorAll('[data-sample-image]')) {
  const place = InnerTableDemo.find(place => place.id === starter.dataset.sampleImage);
  const image = element('img');
  image.src = 'artwork/' + place.photo.file;
  image.alt = '';
  starter.prepend(image);
  starter.after(licensedPhotoCredit(place.photo));
}
$('#reset').addEventListener('click',() => {planChat.reset();HTMLFormElement.prototype.reset.call($('#search-form'));renderDiscover();$('#occasion').focus();});
function changed(priority = []) {if(demoMode)setDemoMode(false);persist();renderSaved();renderDiscover();queueGuideDetails(priority);}
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
  const list=$('#my-places');
  const expanded = new Set([...list.querySelectorAll('.saved-place-actions[open]')].map(detail=>detail.parentElement.dataset.placeId));
  list.replaceChildren();
  updateSelection();
  if(!places.length) {const empty=element('div','empty');empty.append(element('h3','','No saved places yet'),element('p','','Add one place or bring over a Google Maps list.'));list.append(empty);observePhotoRows(list,!$('#places-view').hidden);return;}
  places.forEach(place => {
    const row=element('article','saved-row'), content=element('div');
    row.dataset.placeId = place.id;
    const enriched=placeDetails(place);
    const selection = element('label','place-selection');
    const checkbox = element('input');
    checkbox.type = 'checkbox';
    checkbox.value = String(place.id);
    checkbox.checked = selectedPlaces.has(String(place.id));
    checkbox.setAttribute('aria-label', `Select ${place.name}`);
    checkbox.addEventListener('change', () => {
      if(checkbox.checked) selectedPlaces.add(String(place.id));
      else selectedPlaces.delete(String(place.id));
      if(checkbox.checked)$('#manage-places').open = true;
      updateSelection();
    });
    selection.append(checkbox,element('span','','Select'));
    content.append(element('h3','',place.name));
    const metadata = metadataFor(enriched);
    if(metadata) content.append(element('p','',metadata));
    if(venueResearch.state(place)==='checking' || google.enrichmentState(place)==='checking') {
      content.append(element('p','small','Checking venue details…'));
    }
    if(place.note) content.append(element('p','',place.note));
    content.append(element('p','',place.recommended ? 'Personally recommended' : `${place.listName ? 'Saved list: '+place.listName : 'Saved place'} · Not personally endorsed`));
    const link=externalLink('Open in Maps ↗',google.placeURL(place));content.append(link);
    const actions=element('div','actions');actions.append(button('Edit',()=>openEditor(place)),button(I.ready(place)?'Hide place':'Show in guide',()=>{place.inGuide=!I.ready(place);changed();}),button('Remove',()=>{
      if(!window.confirm(`Remove “${place.name}” from this browser?`)) return;
      google.forget(place.id);places=places.filter(p=>p.id!==place.id);if($('#place-id').value===place.id) closeEditor();changed();
    },'text-button'),google.action(place));
    if(place.googlePlaceId)actions.append(button('Change Google match',()=>google.rematch(place),'text-button'));
    const extra=google.extras(place);if(extra)content.append(extra);
    const manage = element('details','saved-place-actions');
    manage.open = expanded.has(String(place.id));
    const summary = element('summary','','Manage');
    summary.setAttribute('aria-label',`Manage ${place.name}`);
    manage.append(summary,selection,element('p','small',I.ready(place) ? 'In your guide' : 'Hidden from your guide'),actions);
    addDetailSources(manage,enriched);
    row.append(content,manage);
    addPlacePhoto(row,enriched,content);
    list.append(row);
  });
  observePhotoRows(list,!$('#places-view').hidden);
}
let sharedListRequest = null;
function stopSharedList() {
  sharedListRequest?.abort();
  sharedListRequest = null;
  $('#maps-list-import').disabled = false;
  $('#maps-list-status').textContent = '';
}
function chooseImportMethod(method) {
  const csv = method === 'csv';
  if(csv) stopSharedList();
  else $('#csv-file').value = '';
  $('#import-by-link').setAttribute('aria-pressed',String(!csv));
  $('#import-by-csv').setAttribute('aria-pressed',String(csv));
  $('#maps-list-panel').hidden = csv;
  $('#csv-panel').hidden = !csv;
  $('#csv-import-status').textContent = '';
}
function chooseAddMode(mode) {
  const importing = mode === 'import';
  if(!importing) {
    stopSharedList();
    $('#csv-file').value = '';
  }
  $('#add-one').setAttribute('aria-pressed',String(!importing));
  $('#add-import').setAttribute('aria-pressed',String(importing));
  $('#place-form').hidden = importing;
  $('#list-import').hidden = !importing;
}
function closeEditor() {
  $('#place-editor').close();
  $('#place-editor').hidden = true;
  $('#place-form').reset();
  $('#place-id').value = '';
  $('#editor-error').textContent = '';
  $('#maps-list-form').reset();
  $('#restore-file').value = '';
  stopSharedList();
  clearPreview();
}
function openEditor(place) {
  closeEditor();
  $('#add-options').hidden = !!place;
  $('#place-optional').open = !!place;
  chooseAddMode('one');
  chooseImportMethod('link');
  $('#place-editor').hidden=false;$('#editor-title').textContent=place ? 'Edit your place' : 'Add a place';
  $('#inferred-info').textContent=place && (place.inferredTags || []).length ? 'Some selected tags were suggested from saved note or list keywords. You can change them below.' : '';
  $('#place-neighborhood').placeholder = 'e.g. West Village';
  const autoCategory = $('#place-category option[value="auto"]');
  autoCategory.hidden = !place;
  autoCategory.textContent = 'Use suggested category';
  if(place) {
    for(const [field,key] of [['id','id'],['name','name'],['url','url'],['category','category'],['neighborhood','neighborhood'],['visited','status'],['note','note'],['price','price']]) $('#place-'+field).value=place[key] ?? '';
    const details = placeDetails(place);
    if(!autoCategory.hidden && place.category==='unknown' && !place.detailOverrides?.includes('category')) {
      $('#place-category').value = 'auto';
      if(details.category!=='unknown') autoCategory.textContent = 'Use suggested category · ' + I.categoryLabel(details.category);
    }
    if(!place.neighborhood && details.neighborhood) $('#place-neighborhood').placeholder = details.neighborhood;
    $('#place-recommend').checked=place.recommended;
    $('#place-in-guide').checked=I.ready(place);
    document.querySelectorAll('[name=tag]').forEach(node=>node.checked=place.tags.includes(node.value));
  }
  $('#place-editor').showModal();$('#editor-title').focus();
}
$('#place-editor').addEventListener('cancel',event=>{event.preventDefault();closeEditor();});
$('#show-add').addEventListener('click',()=>openEditor());$('#cancel-edit').addEventListener('click',closeEditor);
$('#add-one').addEventListener('click',()=>chooseAddMode('one'));
$('#add-import').addEventListener('click',()=>chooseAddMode('import'));
$('#import-by-link').addEventListener('click',()=>chooseImportMethod('link'));
$('#import-by-csv').addEventListener('click',()=>chooseImportMethod('csv'));
$('#place-form').addEventListener('submit',event=>{
  event.preventDefault();const error=$('#editor-error');error.textContent='';
  const url=I.mapsURL($('#place-url').value);
  if(!url) {error.textContent='Use an HTTPS Google Maps place link, such as maps.app.goo.gl or google.com/maps. Other links are not supported.';return;}
  const id=$('#place-id').value || crypto.randomUUID();
  const previous=places.find(p=>p.id===id);
  if(places.some(p=>p.id!==id && I.mapsURL(p.url)===url)) {error.textContent='That Maps link is already in your saved places. Edit the existing place instead.';return;}
  const place={id,name:$('#place-name').value.trim(),url,category:$('#place-category').value==='auto' ? 'unknown' : $('#place-category').value,neighborhood:$('#place-neighborhood').value.trim(),status:$('#place-visited').value,note:$('#place-note').value.trim(),price:$('#place-price').value ? Number($('#place-price').value) : null,tags:[...document.querySelectorAll('[name=tag]:checked')].map(node=>node.value),recommended:$('#place-recommend').checked,source:'Personal entry'};
  place.inGuide=$('#place-in-guide').checked;
  place.inferredTags=(previous?.inferredTags || []).filter(tag=>place.tags.includes(tag));
  place.listName=previous?.listName || '';
  place.source=previous?.source || place.source;
  if(previous) {
    const overrides = new Set(I.detailOverrides(previous.detailOverrides));
    if($('#place-category').value==='auto') overrides.delete('category');
    else overrides.add('category');
    if(place.neighborhood!==previous.neighborhood) overrides.add('neighborhood');
    if(place.tags.length!==previous.tags.length || place.tags.some(tag=>!previous.tags.includes(tag))) overrides.add('tags');
    place.detailOverrides = [...overrides];
    if(previous.publicDetails && previous.url===url && previous.name===place.name) place.publicDetails = previous.publicDetails;
  }
  if(previous?.googlePlaceId && previous.url===url)place.googlePlaceId=previous.googlePlaceId;
  if(previous && previous.url!==url)google.forget(id);
  if(!place.name) {error.textContent='Add a place name.';return;}
  if(!places.some(p=>p.id===id) && places.length>=2000) {error.textContent='This prototype supports up to 2,000 saved places. Export a backup before making room.';return;}
  const index=places.findIndex(p=>p.id===id);if(index<0) places.push(place);else places[index]=place;
  closeEditor();changed();$('#import-status').textContent='Place saved. Your changes are reflected in Discover.';
});
function showPreview(result, kind) {
  pending={...result,kind,guide:places};const count=result.places.length;
  $('#add-options').hidden=true;
  $('#place-form').hidden=true;
  $('#list-import').hidden=true;
  $('#import-preview-error').textContent='';
  $('#import-preview').hidden=false;$('#import-summary').textContent=`${count} ${count===1?'place':'places'} ready to ${kind==='backup'?'restore':'add to your guide'}. ${importCounts(result)}`;
  $('#confirm-import').textContent=kind==='backup'?'Restore these places':'Add to my guide';$('#confirm-import').disabled=!count;
  $('#cancel-import').textContent=kind==='backup'?'Cancel':'Back';
  const list=$('#import-items');list.replaceChildren();
  result.places.slice(0,100).forEach(place=>{const row=element('div','preview-item');row.append(element('strong','',place.name),element('p','',place.note || 'No personal note yet.'),element('p','',place.url));list.append(row);});
  if(count>100) list.append(element('p','small',`Showing the first 100 of ${count} places. All valid places will be added.`));
  if(kind==='backup') {
    $('#editor-title').textContent='Restore backup';
    $('#place-editor').hidden=false;
    $('#place-editor').showModal();
  }
  $('#import-title').focus();
}
function clearPreview() {
  pending=null;
  $('#import-preview').hidden=true;
  $('#import-items').replaceChildren();
  $('#csv-file').value='';
}
$('#cancel-import').addEventListener('click',()=>{
  if(pending?.kind==='backup') {closeEditor();return;}
  clearPreview();
  $('#add-options').hidden=false;
  chooseAddMode('import');
  $('#csv-file').focus();
});
$('#csv-file').addEventListener('change',async event=>{
  const file=event.target.files[0];
  const status=$('#csv-import-status');
  status.textContent='';
  if(!file) return;
  try {
    if(file.size>2_000_000) throw new Error('Choose a CSV smaller than 2 MB.');
    const contents=await file.text();
    if(event.target.files[0]!==file) return;
    showPreview(I.importCSV(contents,places,file.name),'csv');
  } catch(error) {
    if(event.target.files[0]!==file) return;
    event.target.value='';
    status.textContent=error.message;
  }
});
$('#maps-list-form').addEventListener('submit', async event => {
  event.preventDefault();
  if(sharedListRequest) return;
  const request = new AbortController();
  sharedListRequest = request;
  const targetGuide = places;
  const status = $('#maps-list-status');
  $('#maps-list-import').disabled = true;
  status.textContent = 'Reading your shared list…';
  try {
    const response = await fetch('/api/import/maps-list', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({url: $('#maps-list-url').value.trim()}), signal: request.signal
    });
    const data = await response.json();
    if(sharedListRequest!==request) return;
    if(!response.ok) throw new Error(data.error || 'The list could not be imported. Try again.');
    if(places !== targetGuide) throw new Error('Your active guide changed. Import the link again into the guide you want.');
    const quote = value => '"' + value.replaceAll('"', '""') + '"';
    const csv = [['name','url','note','list'], ...data.places.map(place => [place.name,place.url,place.note,data.listName])].map(row => row.map(quote).join(',')).join('\n');
    const result = I.importCSV(csv, places);
    if(!result.places.length) {
      status.textContent = `No new places to add. ${importCounts(result)}`;
      return;
    }
    result.places.forEach(place => {place.source = 'Google Maps shared list';});
    applyImport(result,'shared-list');
  } catch(error) {
    if(sharedListRequest!==request) return;
    status.textContent = error instanceof SyntaxError ? 'Shared links need a running Inner Table. server. You can import a Google Takeout CSV here.' : error.message;
  } finally {
    if(sharedListRequest===request) {
      sharedListRequest=null;
      $('#maps-list-import').disabled=false;
    }
  }
});
function importCounts(result) {
  return `${result.duplicates} ${result.duplicates===1?'duplicate':'duplicates'} skipped · ${result.skipped} invalid or non-Maps ${result.skipped===1?'row':'rows'} skipped.`;
}
function applyImport(result, kind) {
  // Recheck duplicates in case a place was added while the preview was open.
  const seen=new Set(places.map(p=>I.mapsURL(p.url)));
  const additions=result.places.filter(p=>{const key=I.mapsURL(p.url);if(seen.has(key))return false;seen.add(key);return true;});
  if(places.length+additions.length>2000) throw new Error('This would exceed the 2,000-place limit. Nothing was added.');
  places.push(...additions);
  closeEditor();
  if(additions.length) changed(additions);
  const status=$('#import-status');
  status.textContent=`${additions.length} ${additions.length===1?'place':'places'} ${kind==='backup'?'restored':'added to your guide'}. ${importCounts({...result,duplicates:result.duplicates+result.places.length-additions.length})}`;
  status.focus();
}
$('#confirm-import').addEventListener('click',()=>{
  if(!pending || places!==pending.guide) return;
  try {applyImport(pending,pending.kind);}
  catch(error) {$('#import-preview-error').textContent=error.message;}
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
  const file=event.target.files[0];
  $('#import-status').textContent='';
  if(!file)return;
  try {
    if(file.size>20_000_000) throw new Error('Choose a backup smaller than 20 MB.');
    const contents=await file.text();
    if(event.target.files[0]!==file) return;
    const restored=I.validateBackup(contents);const seen=new Set(places.map(p=>I.mapsURL(p.url)));let duplicates=0;
    const fresh=restored.filter(p=>{const key=I.mapsURL(p.url);if(seen.has(key)){duplicates++;return false;}seen.add(key);return true;});
    showPreview({places:fresh,duplicates,skipped:0},'backup');
  } catch {
    if(event.target.files[0]!==file) return;
    event.target.value='';
    $('#import-status').textContent='Could not restore this backup. Use an Inner Table. JSON backup under 20 MB. No saved places were changed.';
  }
});
friends = createFriends({
  onFollowing: people => {
    const list = $('#guide-friends');
    list.replaceChildren();
    $('#guide-friends-empty').hidden = people.length > 0;
    for(const person of people) {
      const name = person.display_name || person.username;
      list.append(button(`${name}’s guide`, () => friends.openGuide(person.id), 'text-button'));
    }
  },
  beforeSwitch: () => account.flush(),
  onSelect: guide => {
    const picker = $('#guide-picker');
    if(picker.open) {
      picker.open = false;
      picker.querySelector('summary').focus();
    }
    demoMode = false;
    (friendGuide?.places || []).forEach(place => google.forget(place.id));
    transientPublicDetails.clear();
    friendGuide = {...guide,places:I.validateBackup(JSON.stringify({version:1,places:guide.places}))};
    planChat.reset();renderDiscover();queueGuideDetails();
  },
  onClear: () => {
    (friendGuide?.places || []).forEach(place => google.forget(place.id));
    transientPublicDetails.clear();
    friendGuide = null;
    planChat.reset();renderDiscover();queueGuideDetails();
  }
});
const tour = $('#welcome-tour');
const tourHeading = $('#tour-heading');
const tourNext = $('#tour-next');
const tourBack = $('#tour-back');
const tourSample = $('#tour-sample');
const tourSteps = [
  ['#guide-context', 'Choose a guide', 'Open Search in to choose My places or a friend’s approved guide.'],
  ['#search-form .search-field', 'Describe your plan', 'Tell us who’s coming, what you feel like, or an area and budget. An example fills the draft so you can edit it before sending.'],
  ['#shortlist-anchor', 'Read the shortlist', 'See who saved each place and why it fits your plan. Open Place details for sources and the Maps link.']
];
let tourStep = 0;
let tourTarget = null;
const tourSeen = new Set();

function renderTour() {
  const [selector, heading, copy] = tourSteps[tourStep];
  $('#plan-start').hidden = tourStep !== tourSteps.length - 1 || planResults !== null || demoMode || browseFriendPlaces;
  tourTarget?.classList.remove('tour-target');
  tourTarget = $(selector);
  tourTarget.classList.add('tour-target');
  tourTarget.after(tour);
  $('#tour-progress').textContent = `${tourStep + 1} of ${tourSteps.length}`;
  tourHeading.textContent = heading;
  $('#tour-copy').textContent = copy;
  tourBack.hidden = tourStep === 0;
  tourNext.textContent = tourStep === tourSteps.length - 1 ? 'Done' : 'Next';
  tourSample.hidden = tourStep !== tourSteps.length - 1 || demoMode;
  tourHeading.focus({preventScroll:true});
  tour.scrollIntoView({block:'nearest'});
}

function startTour() {
  tourStep = 0;
  tour.hidden = false;
  showView('discover');
  renderTour();
}

function dismissTour() {
  tour.hidden = true;
  tourTarget?.classList.remove('tour-target');
  tourTarget = null;
  $('#plan-start').hidden = true;
}

function finishTour() {
  if(tour.hidden) return;
  dismissTour();
  $('#occasion').focus();
}

tourNext.addEventListener('click', () => {
  if(tourStep === tourSteps.length - 1) {
    finishTour();
    return;
  }
  tourStep += 1;
  renderTour();
});
tourBack.addEventListener('click', () => {
  if(tourStep === 0) return;
  tourStep -= 1;
  renderTour();
});
$('#tour-skip').addEventListener('click', finishTour);
tourSample.addEventListener('click', () => {
  setDemoMode(true);
  renderTour();
});
document.addEventListener('keydown', event => {
  if(event.key === 'Escape' && !tour.hidden && !$('#discover-view').hidden) {
    event.preventDefault();
    finishTour();
  }
});

function refreshVenueAllowances() {
  venueResearch.resume();
  googleReady = googleReady.then(() => google.start());
  queueGuideDetails();
}

account = createAccounts({
  onSetupRequired: () => {
    profileSetupOpened = true;
    showView('account');
  },
  onSession: signedIn => {
    friends.setSession(signedIn);
    if(!signedIn) {
      if(signedInAccountId) refreshVenueAllowances();
      signedInAccountId = null;
      profileSetupOpened = false;
      dismissTour();
    }
  },
  onReady: id => {
    if(!id || id === signedInAccountId) return;
    const finishedSetup = profileSetupOpened;
    profileSetupOpened = false;
    signedInAccountId = id;
    refreshVenueAllowances();
    let seen = tourSeen.has(id);
    try {seen ||= localStorage.getItem('inner-table-tour-v1:' + id) === 'seen';} catch {}
    if(seen) {
      if(finishedSetup && !$('#account-view').hidden) {
        showView('discover');
        $('#discover-title').focus();
      }
      return;
    }
    tourSeen.add(id);
    try {localStorage.setItem('inner-table-tour-v1:' + id, 'seen');} catch {}
    startTour();
  },
  getDevicePlaces: () => devicePlaces,
  onMode: mode => {guideMode = mode;},
  onGuide: (records, mode) => {
    demoMode = false;
    selectedPlaces.clear();
    places.forEach(place => google.forget(place.id));
    places = records;
    guideMode = mode;
    friends.leave();
    closeEditor();planChat.reset();renderSaved();renderDiscover();queueGuideDetails();
  }
});
renderSaved();
renderDiscover();
let googleReady = google.start();
account.start().finally(()=>{
  enrichmentReady=true;
  queueGuideDetails();
});
