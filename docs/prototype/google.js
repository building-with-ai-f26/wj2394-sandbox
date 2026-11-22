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
  function mergePlace(place,data) {
    if(!data) return place;
    const hints=reviewTags(data).filter(tag=>!place.tags.includes(tag));
    return {...place,category:place.category==='unknown'?categoryFromGoogle(data):place.category,
      googleCategoryUsed:place.category==='unknown',googleReviewTags:hints,tags:[...place.tags,...hints],_google:data};
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
    const feature=decodeURIComponent(url.pathname).match(/!1s0x[0-9a-f]+:(0x[0-9a-f]+)/i);
    return feature?BigInt(feature[1]).toString():null;
  }
  function automaticMatch(name,candidates,savedURL='') {
    const feature=mapsFeatureId(savedURL);
    if(feature) {
      const linked=candidates.filter(candidate=>mapsFeatureId(candidate.googleMapsUri || '')===feature);
      return linked.length===1 ? linked[0] : null;
    }
    const normalize=value=>value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
    const exact=candidates.filter(candidate=>normalize(candidate.displayName?.text || '')===normalize(name) && /New York|\bNY\b|Brooklyn|Queens|Bronx|Staten Island/i.test(candidate.formattedAddress || ''));
    return exact.length===1?exact[0]:null;
  }
  function importedPlace(place) {
    return place.source === 'Google Maps shared list' || place.source === 'Google Takeout CSV';
  }
  function createController({getPlaces,onUpdate,onLink}) {
    const data=new Map(),photos=new Map(),detailsInFlight=new Map(),photosInFlight=new Map();
    const pending=new Map(),checkedPhotos=new Set();
    let configured=false,reviewsEnabled=false,draining=false,planning=0;
    let remaining=0,shortlistReserve=0,checkingId=null;
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
      return Object.assign(new Error('Google Maps photo checks are paused at the request limit.'),{paused:true});
    }
    function charge(background) {
      if(!canSpend(1,background)) throw pausedError();
      remaining--;
    }
    function noteLimit(response) {
      if(response.status===429) {
        remaining=0;
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
        const select=node('button','primary','Use this place');select.type='button';select.onclick=()=>{dialog.close();refreshPlace(place,{confirmedId:candidate.id});};row.append(select);list.append(row);
      });
      dialog.showModal();
    }
    function clearPhoto(id) {
      const previous=photos.get(id);
      if(previous) URL.revokeObjectURL(previous.url);
      photos.delete(id);
    }
    function knownId(place) {return place.googlePlaceId || placeIdFromURL(place.url);}
    function detailsCost(place) {return knownId(place) ? 1 : 2;}
    async function findDetails(place,{interactive=false,rematch=false,confirmedId,background=false}={}) {
      let id=confirmedId || (!rematch && knownId(place));
      if(!id) {
        const result=await request('search',{name:place.name,neighborhood:place.neighborhood},background);
        if(!active(place)) return null;
        const candidates=result.places || [];
        const exact=automaticMatch(place.name,candidates,place.url);
        if(!exact) {
          if(interactive) choose(place,candidates);
          return null;
        }
        id=exact.id;
      }
      const details=await request('details',{placeId:id,includeReviews:reviewsEnabled && $('#google-reviews').checked},background);
      if(!active(place)) return null;
      if(data.get(place.id)?.id!==details.id) clearPhoto(place.id);
      data.set(place.id,details);
      onLink(place,id);
      return details;
    }
    function getDetails(place,options={}) {
      if(detailsInFlight.has(place.id)) return detailsInFlight.get(place.id);
      if(!options.interactive && data.has(place.id)) return Promise.resolve(data.get(place.id));
      const job=findDetails(place,options).finally(()=>{
        if(detailsInFlight.get(place.id)===job) detailsInFlight.delete(place.id);
        onUpdate();
      });
      detailsInFlight.set(place.id,job);
      onUpdate();
      return job;
    }
    function getPhoto(place,details,background=false) {
      const source=details?.photos?.[0];
      if(!source || photos.has(place.id)) return Promise.resolve();
      if(photosInFlight.has(place.id)) return photosInFlight.get(place.id);
      const job=(async()=>{
        charge(background);
        const response=await fetch('/api/places/photo?name='+encodeURIComponent(source.name),{signal:AbortSignal.timeout(20000)});
        noteLimit(response);
        if(!response.ok || !/^image\//.test(response.headers.get('Content-Type') || '')) return;
        const image=await response.blob();
        if(active(place) && data.get(place.id)===details) {
          photos.set(place.id,{url:URL.createObjectURL(image),source});
        }
      })().finally(()=>{
        if(photosInFlight.get(place.id)===job) photosInFlight.delete(place.id);
        onUpdate();
      });
      photosInFlight.set(place.id,job);
      return job;
    }
    async function refreshPlace(place,options={}) {
      try {
        const details=await getDetails(place,{...options,interactive:true});
        if(details && active(place)) {
          checkedPhotos.delete(place.id);
          queuePhoto(place,true);
          await drainPhotos();
        }
      } catch(error) {say(error.message);}
    }
    function queuePhoto(place,priority,resume) {
      if(photos.has(place.id) || checkedPhotos.has(place.id)) return;
      const existing=pending.get(place.id);
      pending.set(place.id,{place,priority:priority || existing?.priority,imported:importedPlace(place),resume:resume || existing?.resume});
    }
    function photoCost(place) {
      if(photos.has(place.id)) return 0;
      const details=data.get(place.id);
      return details ? Number(Boolean(details.photos?.[0])) : detailsCost(place)+1;
    }
    async function drainPhotos() {
      if(!configured || draining || planning) return;
      draining=true;
      try {
        while(!planning) {
          for(const [id,task] of pending) if(!active(task.place)) pending.delete(id);
          const runnable=[...pending.values()].filter(task=>canSpend(photoCost(task.place),!task.priority));
          const task=runnable.find(task=>task.priority) || runnable[0];
          if(!task) break;
          const {place,priority}=task;
          checkingId=place.id;
          onUpdate();
          let finished=true;
          try {
            const details=await getDetails(place,{background:!priority});
            if(active(place)) await getPhoto(place,details,!priority);
          } catch(error) {
            finished=!error.paused;
            say(error.message);
          }
          const currentTask=pending.get(place.id);
          if(active(place) && finished) {
            pending.delete(place.id);
            checkedPhotos.add(place.id);
            if(!priority && task.resume) {
              try {localStorage.setItem(task.resume.key,String(task.resume.next));} catch {/* Only the scan position is optional. */}
            }
          } else if(!active(place) && currentTask?.place.url===place.url) {
            pending.delete(place.id);
          }
          checkingId=null;
          onUpdate();
        }
      } finally {draining=false;}
    }
    function enrichImported(places,resumeKey) {
      if(!configured || !$('#google-auto-import').checked) return;
      const imports=places.filter(importedPlace);
      if(!imports.length) return;
      let start=0;
      if(resumeKey) {
        try {start=Math.max(0,parseInt(localStorage.getItem(resumeKey),10) || 0)%imports.length;} catch {}
      }
      const ordered=[...imports.slice(start),...imports.slice(0,start)];
      ordered.forEach((place,index)=>{
        queuePhoto(place,false,resumeKey ? {key:resumeKey,next:(start+index+1)%imports.length} : null);
      });
      onUpdate();
      return drainPhotos();
    }
    function checkShortlistPhotos(ids) {
      if(!configured) return;
      const wanted=new Set(ids);
      for(const [id,task] of pending) {
        if(wanted.has(String(id))) continue;
        if(task.imported) task.priority=false;
        else pending.delete(id);
      }
      const places=new Map(getPlaces().map(place=>[String(place.id),place]));
      for(const id of ids) {
        const place=places.get(id);
        if(place) queuePhoto(place,true);
      }
      return drainPhotos();
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
          if(!data.has(place.id) && !detailsInFlight.has(place.id) && remaining<detailsCost(place)+reserve) {
            error='Google Maps requests are limited. Some places could not be checked.';
            continue;
          }
          if(await getDetails(place)) checked++;
        }
      } catch(failure) {
        error=failure.message;
      } finally {
        planning--;
      }
      return {checked,requested:targets.length,error};
    }
    function placeURL(place) {
      const details=data.get(place.id);
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
      const details=data.get(place.id);if(!details)return null;
      const section=node('section','google-details');
      const brand=node('p','google-brand','Google Maps');brand.setAttribute('translate','no');
      brand.append(document.createTextNode(' · '),mapsLink(place));
      section.append(brand,node('p','small',`Category from Google: ${details.primaryTypeDisplayName?.text || details.primaryType || 'Not supplied'}`));
      (details.attributions || []).forEach(a=>section.append(link(a.provider || 'Data provider',a.providerUri)));
      if(details.formattedAddress)section.append(node('p','small',details.formattedAddress));
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
      const busy=detailsInFlight.has(place.id) || photosInFlight.has(place.id);
      const item=node('button','secondary',busy?'Finding details…':data.has(place.id)?'Refresh details':'Find details');item.type='button';item.disabled=busy;item.onclick=()=>refreshPlace(place);return item;
    }
    async function start() {
      $('#google-match-close').onclick=()=>$('#google-match').close();
      try {
        const response=await fetch('/api/status');if(!response.ok)throw Error();
        const status=await response.json();configured=status.configured;reviewsEnabled=status.reviewsEnabled;
        remaining=placesBudget(status);
        shortlistReserve=Number.isFinite(status.requestLimit) ? Math.ceil(status.requestLimit/2) : 0;
        say(configured?'Your saved places are ready. We can add categories, photos, and review highlights.':'Place details are unavailable right now. Your saved guide still works.');
      }catch{say('Place details are unavailable right now. Your saved guide still works.');}
      $('#google-reviews').disabled=!reviewsEnabled;$('#google-auto-import').disabled=!configured;$('#google-auto-import').checked=configured;
      onUpdate();
    }
    return {
      start,action,extras,photoCredit,placeURL,prepareForPlan,enrichImported,checkShortlistPhotos,
      merge:place=>mergePlace(place,data.get(place.id)),
      photo:place=>photos.get(place.id)?.url,
      photoStatus:place=>checkingId===place.id?'Checking venue photo…':pending.has(place.id)?'Photo check pending':'Photo unavailable',
      rejectPhoto:(place,url)=>{if(photos.get(place.id)?.url===url) clearPhoto(place.id);},
      rematch:place=>refreshPlace(place,{rematch:true}),
      forget:id=>{
        data.delete(id);
        pending.delete(id);
        checkedPhotos.delete(id);
        detailsInFlight.delete(id);
        photosInFlight.delete(id);
        clearPhoto(id);
      }
    };
  }
  root.GooglePlaces={categoryFromGoogle,reviewTags,mergePlace,placeIdFromURL,safeURL,automaticMatch,mapsFeatureId,importedPlace,createController};
  if(typeof module!=='undefined')module.exports=root.GooglePlaces;
})(typeof globalThis!=='undefined'?globalThis:window);
