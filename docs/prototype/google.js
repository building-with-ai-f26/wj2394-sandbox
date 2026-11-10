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
    const linked=feature?candidates.filter(candidate=>mapsFeatureId(candidate.googleMapsUri || '')===feature):[];
    if(linked.length===1)return linked[0];
    const normalize=value=>value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
    const exact=candidates.filter(candidate=>normalize(candidate.displayName?.text || '')===normalize(name) && /New York|\bNY\b|Brooklyn|Queens|Bronx|Staten Island/i.test(candidate.formattedAddress || ''));
    return exact.length===1?exact[0]:null;
  }
  function createController({getPlaces,onUpdate,onLink}) {
    const data=new Map(),photos=new Map(),busy=new Set();
    let configured=false,reviewsEnabled=false,batching=false,lastError='';
    const $=selector=>document.querySelector(selector);
    const node=(tag,cls='',text='')=>{const item=document.createElement(tag);item.className=cls;item.textContent=text;return item;};
    function link(text,url) {const item=node('a','',text);const safe=safeURL(url || '');if(safe){item.href=safe;item.target='_blank';item.rel='noopener noreferrer';}return item;}
    function say(text) {const status=$('#google-status');if(status)status.textContent=text;}
    async function request(route,body) {
      const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),20000);
      try {
        const response=await fetch('/api/places/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:abort.signal});
        const result=await response.json();if(!response.ok)throw Error(result.error || 'Google details could not be loaded.');
        return result.result;
      } catch(error) {throw Error(error.name==='AbortError'?'Google request timed out. Try again.':error.message);}
      finally {clearTimeout(timer);}
    }
    function choose(place,candidates) {
      const dialog=$('#google-match'),list=$('#google-candidates');list.replaceChildren();
      $('#google-match-title').textContent='Which place is '+place.name+'?';
      if(!candidates.length)list.append(node('p','','No matches found. Keep the saved place as-is, or edit its name or neighborhood and try again.'));
      candidates.forEach(candidate=>{
        const row=node('div','google-candidate');row.append(node('strong','',candidate.displayName?.text || 'Unnamed place'),node('p','small',candidate.formattedAddress || 'Address not supplied'),link('View on Google Maps',candidate.googleMapsUri));
        (candidate.attributions || []).forEach(a=>row.append(link(a.provider || 'Data provider',a.providerUri)));
        const select=node('button','primary','Use this place');select.type='button';select.onclick=()=>{dialog.close();load(place,candidate.id).catch(error=>say(error.message));};row.append(select);list.append(row);
      });
      dialog.showModal();
    }
    async function load(place,id,{photo=true}={}) {
      busy.add(place.id);onUpdate();
      try {
        const details=await request('details',{placeId:id,includeReviews:reviewsEnabled && $('#google-reviews').checked});
        if(!getPlaces().some(p=>p.id===place.id))return;
        data.set(place.id,details);onLink(place,id);
        const old=photos.get(place.id);if(old)URL.revokeObjectURL(old);photos.delete(place.id);
        if(photo && details.photos?.[0]) {
          try {
            const response=await fetch('/api/places/photo?name='+encodeURIComponent(details.photos[0].name));
            if(response.ok && /^image\//.test(response.headers.get('Content-Type') || ''))photos.set(place.id,URL.createObjectURL(await response.blob()));
          } catch {/* Details still work if the photo cannot load. */}
        }
        say('Updated '+place.name+'. Your own notes and statuses are unchanged.');
      }finally {busy.delete(place.id);onUpdate();}
    }
    async function enrich(place,{batch=false,rematch=false,photo=true}={}) {
      if(!configured || busy.has(place.id))return false;
      try {
        const known=rematch?null:(place.googlePlaceId || placeIdFromURL(place.url));
        if(known){await load(place,known,{photo});return true;}
        busy.add(place.id);onUpdate();
        const result=await request('search',{name:place.name,neighborhood:place.neighborhood});
        const candidates=result.places || [];
        const exact=automaticMatch(place.name,candidates,place.url);
        if(exact) {await load(place,exact.id,{photo});return true;}
        if(!batch)choose(place,candidates);
        return false;
      }catch(error){lastError=error.message;say(error.message);return false;}
      finally{busy.delete(place.id);onUpdate();}
    }
    async function batch(items) {
      if(!configured || batching)return;
      batching=true;
      const targets=items.filter(p=>!data.has(p.id)).slice(0,5);lastError='';
      for(const place of targets){await enrich(place,{batch:true});if(lastError)break;}
      batching=false;
    }
    async function prepareForPlan(ids) {
      if(!configured) return {checked:0,requested:ids.length,error:'Google details are unavailable.'};
      const targets=getPlaces().filter(place=>ids.includes(String(place.id))).slice(0,6);
      let checked=0;lastError='';
      for(const place of targets) {
        if(data.has(place.id) || await enrich(place,{batch:true}))checked++;
        if(lastError)break;
      }
      return {checked,requested:targets.length,error:lastError || ''};
    }
    function extras(place) {
      const details=data.get(place.id);if(!details)return null;
      const section=node('section','google-details');
      const brand=node('p','google-brand','Google Maps');brand.setAttribute('translate','no');
      section.append(brand,node('p','small',`Category from Google: ${details.primaryTypeDisplayName?.text || details.primaryType || 'Not supplied'}`));
      (details.attributions || []).forEach(a=>section.append(link(a.provider || 'Data provider',a.providerUri)));
      if(details.formattedAddress)section.append(node('p','small',details.formattedAddress));
      if(details.editorialSummary?.text)section.append(node('p','small',details.editorialSummary.text));
      const range=details.priceRange;
      if(range?.startPrice || range?.endPrice) {
        const money=value=>value ? `${value.currencyCode || ''} ${value.units || 0}` : 'unknown';
        section.append(node('p','small',`Google price range ${money(range.startPrice)}–${money(range.endPrice)}. Your total may vary with tax, tip and what you order.`));
      }
      if(details.photos?.[0]) {
        const photo=details.photos[0];const credits=node('p','small','Photo: ');
        (photo.authorAttributions || []).forEach((author,index)=>{if(index)credits.append(document.createTextNode(', '));credits.append(link(author.displayName || 'Contributor',author.uri));});
        if(!(photo.authorAttributions || []).length)credits.append(document.createTextNode('Google Maps'));
        if(photo.googleMapsUri)credits.append(document.createTextNode(' · '),link('View source photo',photo.googleMapsUri));section.append(credits);
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
      const source=node('p','google-source-link');source.append(link('View place on Google Maps',details.googleMapsUri));section.append(source);return section;
    }
    function action(place) {
      if(!configured)return document.createDocumentFragment();
      const item=node('button','secondary',busy.has(place.id)?'Finding details…':data.has(place.id)?'Refresh details':'Find details');item.type='button';item.disabled=busy.has(place.id);item.onclick=()=>enrich(place);return item;
    }
    async function start() {
      $('#google-match-close').onclick=()=>$('#google-match').close();
      try {
        const response=await fetch('/api/status');if(!response.ok)throw Error();
        const status=await response.json();configured=status.configured;reviewsEnabled=status.reviewsEnabled;
        say(configured?'Your saved places are ready. We can add categories, photos, and review highlights.':'Place details are unavailable right now. Your saved guide still works.');
      }catch{say('Place details are unavailable right now. Your saved guide still works.');}
      $('#google-reviews').disabled=!reviewsEnabled;$('#google-auto-import').disabled=!configured;$('#google-auto-import').checked=configured;
      onUpdate();
    }
    return {start,action,extras,prepareForPlan,enrichImported:items=>$('#google-auto-import').checked?batch(items):Promise.resolve(),merge:place=>mergePlace(place,data.get(place.id)),photo:place=>photos.get(place.id),rematch:place=>enrich(place,{rematch:true}),forget:id=>{data.delete(id);const photo=photos.get(id);if(photo)URL.revokeObjectURL(photo);photos.delete(id);}};
  }
  root.GooglePlaces={categoryFromGoogle,reviewTags,mergePlace,placeIdFromURL,safeURL,automaticMatch,mapsFeatureId,createController};
  if(typeof module!=='undefined')module.exports=root.GooglePlaces;
})(typeof globalThis!=='undefined'?globalThis:window);
