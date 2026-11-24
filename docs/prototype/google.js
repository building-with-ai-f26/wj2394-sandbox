(function(root) {
  const imports = typeof module !== 'undefined' ? require('./imports.js') : root.InnerTableImport;
  function categoryFromGoogle(data) {
    const types=[data.primaryType,...(data.types || [])].filter(Boolean);
    for(const type of types) {
      if(type==='night_club') return 'nightclub';
      if(['cafe','coffee_shop','tea_house'].includes(type)) return 'cafe';
      if(['bar','wine_bar','pub'].includes(type)) return 'bar';
      if(type==='restaurant' || type.endsWith('_restaurant')) return 'restaurant';
      if(type==='store' || type.endsWith('_store') || type==='shopping_mall') return 'shop';
    }
    return 'unknown';
  }
  function reviewTags(data) {
    const texts=(data.reviews || []).map(review=>review.text?.text || '');
    const hints=[...new Set(texts.flatMap(imports.suggestedTags))];
    // A small review sample may conflict. Avoid a positive hint when another review contradicts it.
    const negatives={conversation:/not (?:very |too )?quiet|\bloud\b|(?:can't|cannot) (?:hear|talk)/i,fun:/not (?:very )?(?:fun|lively|festive)/i,special:/not special/i,date:/not romantic|not (?:a )?date/i,group:/not (?:for )?(?:a )?group/i};
    return hints.filter(tag=>!texts.some(text=>negatives[tag].test(text)));
  }
  function neighborhoodFromGoogle(data) {
    const neighborhoods=new Set((data.addressComponents || [])
      .filter(component=>component.types?.includes('neighborhood') && typeof component.longText==='string')
      .map(component=>component.longText.trim()).filter(Boolean));
    return neighborhoods.size===1 ? neighborhoods.values().next().value : '';
  }
  function googleCuisines(data) {
    const types=[data.primaryType,...(data.types || [])];
    const cuisines=new Set(types.filter(type=>typeof type==='string' && type.endsWith('_restaurant'))
      .map(type=>type==='korean_barbecue_restaurant' ? 'korean' : type.slice(0,-11).replaceAll('_',' '))
      .filter(cuisine=>imports.CUISINES.has(cuisine)));
    // A dish-specific type disambiguates generic restaurants but does not replace an explicitly named cuisine.
    if(!cuisines.size && types.some(type=>type==='sushi_restaurant' || type==='ramen_restaurant')) cuisines.add('japanese');
    return [...cuisines];
  }
  function googleKeywords(data) {
    const keywords={bakery:'bakery',brunch_restaurant:'brunch',coffee_shop:'coffee',cocktail_bar:'cocktails',
      ramen_restaurant:'ramen',seafood_restaurant:'seafood',sushi_restaurant:'sushi',pizza_restaurant:'pizza',
      wine_bar:'wine',vegan_restaurant:'vegan options',vegetarian_restaurant:'vegetarian options'};
    return [...new Set([data.primaryType,...(data.types || [])].filter(type=>Object.hasOwn(keywords,type))
      .map(type=>keywords[type]))];
  }
  function mergePlace(place,data) {
    if(!data) return place;
    const overrides=place.detailOverrides || [];
    const category=place.category==='unknown' && !overrides.includes('category')
      ? categoryFromGoogle(data) : place.category;
    const neighborhood=!place.neighborhood && !overrides.includes('neighborhood') ? neighborhoodFromGoogle(data) : '';
    const suppressTags=overrides.includes('tags');
    const hints=suppressTags ? [] : reviewTags(data).filter(tag=>!place.tags.includes(tag));
    const googleCuisineTags=googleCuisines(data);
    const venueKeywords=suppressTags ? [] : googleKeywords(data);
    return {...place,category,neighborhood:neighborhood || place.neighborhood,
      googleCategoryUsed:category!==place.category,googleNeighborhoodUsed:Boolean(neighborhood),googleNeighborhood:neighborhood,
      googleReviewTags:hints,googleCuisineTags,cuisines:googleCuisineTags,googleVenueKeywords:venueKeywords,venueKeywords,
      tags:[...place.tags,...hints],_google:data};
  }
  function placeIdFromURL(value) {
    if(!imports.mapsURL(value)) return null;
    const url=new URL(value);
    const id=url.searchParams.get('query_place_id') || url.searchParams.get('place_id') || (url.searchParams.get('q') || '').match(/^place_id:(.+)$/)?.[1];
    return id && /^[A-Za-z0-9_-]{5,255}$/.test(id) ? id : null;
  }
  function safeURL(value) {
    try {const url=new URL(value.startsWith('//')?'https:'+value:value);return url.protocol==='https:' && !url.username && !url.password ? url.href : null;}catch{return null;}
  }
  function mapsFeatureId(value) {
    if(!imports.mapsURL(value))return null;
    const url=new URL(value);
    const cid=url.searchParams.get('cid');
    if(cid && /^\d+$/.test(cid))return BigInt(cid).toString();
    let path=url.pathname;
    try {path=decodeURIComponent(path);} catch {/* Lenient URLs can contain stray percent signs. */}
    const feature=path.match(/!1s0x[0-9a-f]+:(0x[0-9a-f]+)/i);
    return feature?BigInt(feature[1]).toString():null;
  }
  function automaticMatch(name,candidates,savedURL='') {
    const feature=mapsFeatureId(savedURL);
    if(feature) {
      const linked=candidates.filter(candidate=>mapsFeatureId(candidate.googleMapsUri || '')===feature);
      return linked.length===1 ? linked[0] : null;
    }
    const normalize=value=>value.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
    const exact=candidates.filter(candidate=>normalize(candidate.displayName?.text || '')===normalize(name) && /New York|\bNY\b|Brooklyn|Queens|Bronx|Staten Island/i.test(candidate.formattedAddress || ''));
    return exact.length===1?exact[0]:null;
  }
  function createController({getPlaces,onUpdate,onLink,onEnrichmentChecked = () => {}}) {
    const data=new Map(),photos=new Map(),detailsInFlight=new Map(),photoResults=new Map();
    const manualPhotos=new Map(),shortlistPhotos=new Map(),savedPhotos=new Map();
    const importedDetails=new Map(),enrichmentResults=new Map();
    let enrichingId=null;
    const photoQueues=[manualPhotos,shortlistPhotos,savedPhotos];
    let configured=false,reviewsEnabled=false,researchConfigured=false,draining=false,planning=0;
    let remaining=0,shortlistReserve=0,checkingId=null,limited=false,statusRequest=null;
    const $=selector=>document.querySelector(selector);
    const node=(tag,cls='',text='')=>{const item=document.createElement(tag);item.className=cls;item.textContent=text;return item;};
    function link(text,url) {const safe=safeURL(url || '');if(!safe)return node('span','',text);const item=node('a','',text);item.href=safe;item.target='_blank';item.rel='noopener noreferrer';return item;}
    function say(text) {const status=$('#google-status');if(status)status.textContent=text;}
    function active(place) {return getPlaces().some(current=>current.id===place.id && current.url===place.url);}
    function placesBudget(status) {
      if(Number.isFinite(status?.requestLimit) && Number.isFinite(status?.requestsUsed)) {
        return Math.max(0, status.requestLimit-status.requestsUsed);
      }
      return Infinity;
    }
    function canSpend(cost,background) {return cost===0 || remaining-cost >= (background ? shortlistReserve : 0);}
    function pausedError() {
      return Object.assign(new Error('Google Maps checks are paused at the request limit.'),{paused:true});
    }
    function charge(background) {
      if(!canSpend(1,background)) throw pausedError();
      remaining--;
    }
    function noteLimit(response) {
      if(response.status===429) {
        remaining=0;
        limited=true;
        throw pausedError();
      }
    }
    async function request(route,body,background=false) {
      charge(background);
      const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),20000);
      try {
        const response=await fetch('/api/places/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:abort.signal});
        noteLimit(response);
        const result=await response.json();if(!response.ok)throw Error(result.error || 'Google details could not be loaded.');
        remaining=Math.min(remaining,placesBudget(result.usage));
        return result.result;
      } catch(error) {
        if(error.name==='AbortError') throw Error('Google request timed out. Try again.');
        throw error;
      }
      finally {clearTimeout(timer);}
    }
    function choose(place,candidates) {
      const dialog=$('#google-match'),list=$('#google-candidates');list.replaceChildren();
      $('#google-match-title').textContent='Which place is '+place.name+'?';
      if(!candidates.length)list.append(node('p','','No matches found. Keep the saved place as-is, or edit its name or neighborhood and try again.'));
      candidates.forEach(candidate=>{
        const row=node('div','google-candidate');row.append(node('strong','',candidate.displayName?.text || 'Unnamed place'),node('p','small',candidate.formattedAddress || 'Address not supplied'),link('View on Google Maps',candidate.googleMapsUri));
        (candidate.attributions || []).forEach(a=>row.append(link(a.provider || 'Data provider',a.providerUri)));
        const select=node('button','primary','Use this place');select.type='button';select.onclick=()=>{dialog.close();return refreshPlace(place,{confirmedId:candidate.id});};row.append(select);list.append(row);
      });
      dialog.showModal();
    }
    function clearPhoto(id) {
      const previous=photos.get(id);
      if(previous) URL.revokeObjectURL(previous.url);
      photos.delete(id);
    }
    function knownId(place) {return data.get(place.id)?.details.id || place.googlePlaceId || placeIdFromURL(place.url);}
    function detailsCost(place) {return knownId(place) ? 1 : 2;}
    function wantsReviews(options) {
      return options.reviews && reviewsEnabled && $('#google-reviews').checked;
    }
    function freshSource(entry) {
      if(!entry) return false;
      if(entry.photoSource && Date.now() - entry.fetchedAt >= 60_000) entry.photoSource=undefined;
      return entry.photoSource!==undefined;
    }
    async function findDetails(place,{interactive=false,rematch=false,confirmedId,background=false,reviews=false,photo=false,enrichment=false}={}) {
      if(!active(place)) return null;
      let id=confirmedId || (!rematch && knownId(place));
      let photoMatch;
      if(!id) {
        const search={name:place.name,neighborhood:place.neighborhood};
        if(photo) search.includePhotos=true;
        const result=await request('search',search,background);
        if(!active(place)) return null;
        const candidates=result.places || [];
        const exact=automaticMatch(place.name,candidates,place.url);
        if(interactive && (rematch || !exact)) {
          choose(place,candidates);
          return null;
        }
        if(!exact) return null;
        id=exact.id;
        if(photo) photoMatch=exact;
      }
      const includeReviews=!photo && !enrichment && wantsReviews({reviews});
      const fields={placeId:id};
      if(photo) fields.photosOnly=true;
      else if(enrichment) fields.enrichmentOnly=true;
      else fields.includeReviews=includeReviews;
      const {photos:photoSources,...found}=photoMatch || await request('details',fields,background);
      if(!active(place)) return null;
      const previous=data.get(place.id);
      const samePlace=previous?.details.id===found.id;
      if(!samePlace) clearPhoto(place.id);
      const lightweight=photo || enrichment;
      const details=lightweight && samePlace ? {...previous.details,...found} : found;
      const photoSource=photoSources?.[0]?.name ? photoSources[0] : null;
      const entry={details,photoSource,fetchedAt:Date.now(),enriched:!photo || (samePlace && previous.enriched),
        full:!lightweight || (samePlace && previous.full),
        reviewed:includeReviews || (lightweight && samePlace && previous.reviewed)};
      data.set(place.id,entry);
      onLink(place,id);
      return entry;
    }
    function getDetails(place,options={}) {
      const force=options.force || options.interactive;
      function covers(entry) {
        if(options.photo) return freshSource(entry);
        if(options.enrichment) return entry?.enriched;
        return entry?.full && (!wantsReviews(options) || entry.reviewed);
      }
      const running=detailsInFlight.get(place.id);
      if(running) return running.then(entry=>entry && (force || !covers(entry)) ? getDetails(place,options) : entry);
      const cached=data.get(place.id);
      if(!force && covers(cached)) return Promise.resolve(cached);
      const job=findDetails(place,options).finally(()=>{
        if(detailsInFlight.get(place.id)===job) detailsInFlight.delete(place.id);
        onUpdate();
      });
      detailsInFlight.set(place.id,job);
      onUpdate();
      return job;
    }
    function waiting(place) {
      return photoQueues.some(queue=>queue.get(place.id)?.url===place.url);
    }
    function dequeuePhoto(id) {
      for(const queue of photoQueues) queue.delete(id);
    }
    function photoRefreshError(message) {
      return Object.assign(new Error(message),{freshReference:true});
    }
    async function fetchPhoto(place,entry,background) {
      if(!entry?.photoSource) return 'unavailable';
      if(!active(place) || !waiting(place)) return null;
      charge(background);
      // Keep the photo name only between the fresh details lookup and the media request.
      const {name,...source}=entry.photoSource;
      entry.photoSource=undefined;
      let response;
      try {
        response=await fetch('/api/places/photo?name='+encodeURIComponent(name),{signal:AbortSignal.timeout(20000)});
      } catch {
        throw photoRefreshError('The venue photo request could not finish.');
      }
      noteLimit(response);
      if([400,404,410].includes(response.status) || response.status>=500) {
        throw photoRefreshError('The venue photo needs a new reference.');
      }
      if(!response.ok || !/^image\//.test(response.headers.get('Content-Type') || '')) {
        throw new Error('The venue photo could not be loaded.');
      }
      const image=await response.blob().catch(()=>{throw photoRefreshError('The venue photo download could not finish.');});
      if(!active(place) || !waiting(place) || data.get(place.id)?.details.id!==entry.details.id) return null;
      photos.set(place.id,{url:URL.createObjectURL(image),source});
      return 'ready';
    }
    async function checkPhoto(place,background) {
      const entry=await getDetails(place,{photo:true,background});
      try {
        return await fetchPhoto(place,entry,background);
      } catch(error) {
        if(!error.freshReference || !active(place) || !waiting(place)) throw error;
        const refreshed=await getDetails(place,{force:true,photo:true,background});
        return fetchPhoto(place,refreshed,background);
      }
    }
    async function refreshPlace(place,options={}) {
      try {
        if(limited || !canSpend(detailsCost(place),false)) await refreshAllowance();
        const entry=await getDetails(place,{...options,interactive:true,reviews:true});
        if(entry && active(place) && !photos.has(place.id)) {
          photoResults.delete(place.id);
          manualPhotos.set(place.id,place);
          onUpdate();
          await drainLookups();
        }
      } catch(error) {say(error.message);}
    }
    function photoCost(place) {
      if(photos.has(place.id)) return 0;
      const entry=data.get(place.id);
      return freshSource(entry) ? Number(Boolean(entry.photoSource)) : 2;
    }
    function nextPhoto() {
      for(const queue of photoQueues) {
        const background=queue===savedPhotos;
        for(const place of queue.values()) {
          if(!active(place)) queue.delete(place.id);
          else if(canSpend(photoCost(place),background)) return {place,background};
        }
      }
      return null;
    }
    function nextEnrichment() {
      for(const place of importedDetails.values()) {
        if(!active(place) || data.get(place.id)?.enriched) importedDetails.delete(place.id);
        else if(canSpend(detailsCost(place),true)) return place;
      }
      return null;
    }
    async function enrichImport(place) {
      enrichingId=place.id;
      onUpdate();
      let result;
      try {
        const entry=await getDetails(place,{enrichment:true,background:true});
        result=entry ? 'completed' : 'no-match';
      } catch(error) {
        if(!error.paused) result='retryable';
        say(error.message);
      }
      if(result && active(place) && importedDetails.get(place.id)?.url===place.url) {
        enrichmentResults.set(place.id,result);
        importedDetails.delete(place.id);
        onEnrichmentChecked(place);
      }
      enrichingId=null;
      onUpdate();
    }
    async function drainLookups() {
      if(!configured || draining || planning) return;
      draining=true;
      try {
        while(!planning) {
          const task=nextPhoto();
          if(!task) {
            const place=nextEnrichment();
            if(place) {
              await enrichImport(place);
              continue;
            }
            break;
          }
          const {place,background}=task;
          checkingId=place.id;
          onUpdate();
          let result;
          try {
            result=await checkPhoto(place,background);
          } catch(error) {
            if(!error.paused) result='retryable';
            say(error.message);
          }
          if(result && active(place) && waiting(place)) {
            photoResults.set(place.id,result);
            dequeuePhoto(place.id);
          }
          checkingId=null;
          onUpdate();
        }
      } finally {draining=false;}
    }
    function replaceQueue(queue,places) {
      const previous=[...queue.values()];
      if(places.length!==previous.length || places.some((place,index)=>
        place.id!==previous[index].id || place.url!==previous[index].url)) {
        queue.clear();
        for(const place of places) queue.set(place.id,place);
        onUpdate();
      }
      return drainLookups();
    }
    function setPhotoQueue(queue,places) {
      return replaceQueue(queue,places.filter(place=>!photos.has(place.id) && !photoResults.has(place.id)));
    }
    function ensureGuideDetails(places) {
      const tasks=places.filter(place=>!data.get(place.id)?.enriched && !enrichmentResults.has(place.id));
      return replaceQueue(importedDetails,configured && $('#google-auto-import').checked ? tasks : []);
    }
    function ensureImportedDetails(places) {
      return ensureGuideDetails(places.filter(imports.imported));
    }
    function enrichmentState(place) {
      if(data.get(place.id)?.enriched) return 'completed';
      if(enrichingId===place.id) return 'checking';
      if(enrichmentResults.has(place.id)) return enrichmentResults.get(place.id);
      if(!importedDetails.has(place.id)) return 'idle';
      return canSpend(detailsCost(place),true) ? 'queued' : 'paused';
    }
    function ensureSavedPhotos(places) {
      return setPhotoQueue(savedPhotos,configured && $('#google-auto-import').checked ? places : []);
    }
    function checkShortlistPhotos(ids) {
      const places=new Map(getPlaces().map(place=>[String(place.id),place]));
      return setPhotoQueue(shortlistPhotos,configured ? ids.map(id=>places.get(id)).filter(Boolean) : []);
    }
    async function retryPhoto(place) {
      if(!configured || !active(place) || photos.has(place.id) || checkingId===place.id) return;
      try {
        if(limited || !canSpend(photoCost(place),false)) await refreshAllowance();
        if(!active(place)) return;
        if(!canSpend(photoCost(place),false)) throw pausedError();
        photoResults.delete(place.id);
        manualPhotos.set(place.id,place);
        onUpdate();
        await drainLookups();
      } catch(error) {
        if(active(place)) {
          photoResults.set(place.id,'retryable');
          say(error.message);
          onUpdate();
        }
      }
    }
    function photoState(id) {
      if(photos.has(id)) return 'ready';
      if(checkingId===id) return 'checking';
      if(photoResults.has(id)) return photoResults.get(id);
      for(const queue of photoQueues) {
        const place=queue.get(id);
        if(place) return canSpend(photoCost(place),queue===savedPhotos) ? 'pending' : 'retryable';
      }
      return 'idle';
    }
    function photoStatus(place) {
      switch(photoState(place.id)) {
        case 'ready': return '';
        case 'checking': return 'Checking venue photo…';
        case 'pending': return 'Photo check pending';
        case 'retryable': return photoQueues.some(queue=>queue.has(place.id)) ? 'Photo check paused' : 'Photo unavailable';
        case 'idle': return configured ? 'Photo not checked' : 'Photo unavailable';
        default: return 'Photo unavailable';
      }
    }
    async function prepareForPlan(ids) {
      if(!configured) return {checked:0,requested:ids.length,error:'Google details are unavailable.'};
      const places=new Map(getPlaces().map(place=>[String(place.id),place]));
      const targets=ids.map(id=>places.get(id)).filter(Boolean).slice(0,6);
      let checked=0,error='';
      const reserve=Math.min(targets.filter(place=>!photos.has(place.id)).length,Math.ceil(remaining/3));
      planning++;
      try {
        for(const place of targets) {
          if(!active(place)) break;
          const entry=data.get(place.id);
          const needsDetails=!entry?.full || (wantsReviews({reviews:true}) && !entry.reviewed);
          if(needsDetails && !detailsInFlight.has(place.id) && remaining<detailsCost(place)+reserve) {
            error='Google Maps requests are limited. Some places could not be checked.';
            continue;
          }
          if(await getDetails(place,{reviews:true})) checked++;
        }
      } catch(failure) {
        error=failure.message;
      } finally {
        planning--;
        drainLookups();
      }
      return {checked,requested:targets.length,error};
    }
    function placeURL(place) {
      const details=data.get(place.id)?.details;
      const direct=imports.mapsURL(details?.googleMapsUri || '');
      if(direct) return direct;
      const id=details?.id || knownId(place);
      if(!id) return imports.mapsURL(place.url);
      const url=new URL('https://www.google.com/maps/search/');
      url.search=new URLSearchParams({api:'1',query:place.name,query_place_id:id});
      return url.href;
    }
    function mapsLink(place) {
      const target=link('View place',placeURL(place));
      target.setAttribute('aria-label',`View ${place.name} on Google Maps`);
      return target;
    }
    function photoCredit(place) {
      const photo=photos.get(place.id)?.source;
      if(!photo) return null;
      const credits=node('p','photo-credit');
      const brand=node('span','google-brand','Google Maps');
      brand.setAttribute('translate','no');
      credits.append(brand,document.createTextNode(' · '),mapsLink(place));
      for(const author of photo.authorAttributions || []) {
        credits.append(document.createTextNode(' · '),link(author.displayName || 'Contributor',author.uri));
      }
      if(photo.googleMapsUri) credits.append(document.createTextNode(' · '),link('View source photo',photo.googleMapsUri));
      return credits;
    }
    function extras(place) {
      const entry=data.get(place.id);
      if(!entry?.enriched) return null;
      const details=entry.details;
      const section=node('section','google-details');
      const brand=node('p','google-brand','Google Maps');brand.setAttribute('translate','no');
      brand.append(document.createTextNode(' · '),mapsLink(place));
      section.append(brand,node('p','small',`Category from Google: ${details.primaryTypeDisplayName?.text || details.primaryType || 'Not supplied'}`));
      (details.attributions || []).forEach(a=>section.append(link(a.provider || 'Data provider',a.providerUri)));
      if(details.formattedAddress)section.append(node('p','small',details.formattedAddress));
      if(!entry.full) return section;
      if(details.editorialSummary?.text)section.append(node('p','small',details.editorialSummary.text));
      const range=details.priceRange;
      if(range?.startPrice || range?.endPrice) {
        const money=value=>value ? `${value.currencyCode || ''} ${value.units || 0}` : 'unknown';
        section.append(node('p','small',`Google price range ${money(range.startPrice)}–${money(range.endPrice)}. Your total may vary with tax, tip and what you order.`));
      }
      const reviews=details.reviews || [];
      if(reviews.length) {
        const box=node('details','review-sample');box.append(node('summary','',`Google review sample (${reviews.length}, sorted by relevance)`),node('p','small','Keyword hints come from this limited sample, not all reviews or a personal endorsement.'));
        reviews.forEach(review=>{
          const item=node('article','review');
          const avatar=safeURL(review.authorAttribution?.photoUri || '');if(avatar){const image=node('img','review-author-avatar');image.src=avatar;image.alt='';image.referrerPolicy='no-referrer';item.append(image);}
          item.append(link(review.authorAttribution?.displayName || 'Google reviewer',review.authorAttribution?.uri));
          item.append(node('p','',review.text?.text || 'No review text supplied.'));
          if(review.googleMapsUri)item.append(link('Read this review on Google Maps',review.googleMapsUri));
          box.append(item);
        });section.append(box,link('About Google review policies','https://support.google.com/contributionpolicy/answer/7400114'));
      }else section.append(node('p','small','No review highlights available for this place.'));
      return section;
    }
    function action(place) {
      if(!configured)return document.createDocumentFragment();
      const busy=detailsInFlight.has(place.id) || checkingId===place.id;
      const item=node('button','secondary',busy?'Finding details…':data.get(place.id)?.full?'Refresh details':'Find details');item.type='button';item.disabled=busy;item.onclick=()=>refreshPlace(place);return item;
    }
    function refreshAllowance() {
      if(!statusRequest) {
        statusRequest=(async()=>{
          const response=await fetch('/api/status');
          noteLimit(response);
          if(!response.ok) throw new Error('Google Maps photo checks are unavailable right now.');
          const status=await response.json();
          configured=status.configured;
          reviewsEnabled=status.reviewsEnabled;
          researchConfigured=status.venueResearchConfigured===true;
          remaining=configured ? placesBudget(status) : 0;
          limited=false;
          shortlistReserve=Number.isFinite(status.requestLimit) ? Math.ceil(status.requestLimit/2) : 0;
        })().finally(()=>{statusRequest=null;});
      }
      return statusRequest;
    }
    async function start() {
      $('#google-match-close').onclick=()=>$('#google-match').close();
      try {
        await refreshAllowance();
        say(configured?'Your saved places are ready. We can add categories, photos, and review highlights.':'Place details are unavailable right now. Your saved guide still works.');
      }catch{say('Place details are unavailable right now. Your saved guide still works.');}
      $('#google-reviews').disabled=!reviewsEnabled;$('#google-auto-import').disabled=!configured;$('#google-auto-import').checked=configured;
      onUpdate();
    }
    return {
      start,action,extras,photoCredit,placeURL,prepareForPlan,ensureSavedPhotos,checkShortlistPhotos,
      ensureImportedDetails,ensureGuideDetails,enrichmentState,researchAvailable:()=>researchConfigured,
      merge:place=>{
        const entry=data.get(place.id);
        return entry?.enriched ? mergePlace(place,entry.details) : place;
      },
      photo:place=>photos.get(place.id)?.url,
      photoState,photoStatus,retryPhoto,
      rejectPhoto:(place,url)=>{
        if(photos.get(place.id)?.url===url) {
          clearPhoto(place.id);
          photoResults.set(place.id,'retryable');
          onUpdate();
        }
      },
      rematch:place=>refreshPlace(place,{rematch:true}),
      forget:id=>{
        data.delete(id);
        dequeuePhoto(id);
        photoResults.delete(id);
        importedDetails.delete(id);
        enrichmentResults.delete(id);
        detailsInFlight.delete(id);
        clearPhoto(id);
      }
    };
  }
  root.GooglePlaces={categoryFromGoogle,neighborhoodFromGoogle,reviewTags,mergePlace,placeIdFromURL,safeURL,automaticMatch,mapsFeatureId,createController};
  if(typeof module!=='undefined')module.exports=root.GooglePlaces;
})(typeof globalThis!=='undefined'?globalThis:window);
