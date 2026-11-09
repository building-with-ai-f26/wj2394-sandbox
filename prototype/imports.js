// Local-only import utilities. No requests to Google or any other service.
(function (root) {
  const TAGS = ['conversation','fun','special','date','group'];
  function mapsURL(value) {
    try {
      const url = new URL(value.trim());
      if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
      const host = url.hostname.toLowerCase();
      const valid = (['google.com','www.google.com'].includes(host) && /^\/maps(?:\/|$)/.test(url.pathname)) ||
        (host === 'maps.google.com') || (host === 'maps.app.goo.gl' && url.pathname.length > 1) ||
        (host === 'goo.gl' && url.pathname.startsWith('/maps/'));
      if (!valid) return null;
      url.hash = '';
      for (const key of ['utm_source','utm_medium','utm_campaign','g_st','g_ep','entry']) url.searchParams.delete(key);
      return url.href;
    } catch { return null; }
  }
  function parseCSV(text) {
    if (text.length > 2_000_000) throw new Error('Choose a CSV smaller than 2 MB.');
    const rows = []; let row = [], value = '', quoted = false, closed = false;
    text = text.replace(/^\uFEFF/, '');
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"' && text[i+1] === '"') { value += '"'; i++; }
        else if (ch === '"') { quoted = false; closed = true; }
        else value += ch;
      } else if (ch === '"') {
        if (value || closed) throw new Error('Invalid CSV quoting. No places were imported.');
        quoted = true;
      } else if (ch === ',' || ch === '\n' || ch === '\r') {
        row.push(value); value = ''; closed = false;
        if (ch !== ',') { rows.push(row); row = []; if (ch === '\r' && text[i+1] === '\n') i++; }
      } else {
        if (closed && ch.trim()) throw new Error('Invalid CSV quoting. No places were imported.');
        if (!closed) value += ch;
      }
    }
    if (quoted) throw new Error('The CSV has an unfinished quoted field. No places were imported.');
    if (value || row.length || closed) { row.push(value); rows.push(row); }
    return rows.filter(r => r.some(cell => cell.trim()));
  }
  function suggestedTags(text) {
    // Conservative keyword hints, not verified facts or a claim of a visit.
    const rules = [
      ['conversation',/\bquiet\b|catch[ -]?up|hear each other|\bconversation\b|\btalk\b/i,/not (?:very |too )?quiet|\bloud\b|(?:can't|cannot) (?:hear|talk)/i],
      ['fun',/\bfun\b|\blively\b|\bfestive\b/i,/not (?:very )?(?:fun|lively|festive)/i],
      ['special',/\bspecial\b|birthday|anniversary|celebration/i,/not special/i],
      ['date',/\bdate\b|romantic/i,/not romantic|not (?:a )?date/i],
      ['group',/\bgroup\b|\bfriends\b/i,/not (?:for )?(?:a )?group/i]
    ];
    return rules.filter(([,positive,negative])=>positive.test(text) && !negative.test(text)).map(([tag])=>tag);
  }
  function importCSV(text, existing = [], fileName = '') {
    const rows = parseCSV(text);
    const normalize = str => str.trim().toLowerCase().replace(/[\s-]+/g,'_');
    const names = ['title','name','place_name'];
    const urls = ['url','item_content_url','google_maps_url','maps_url'];
    const headerIndex = rows.findIndex(row => row.some(cell => names.includes(normalize(cell))) && row.some(cell => urls.includes(normalize(cell))));
    if (headerIndex < 0) throw new Error('Could not find title/name and URL columns. Choose an unzipped Saved-list CSV with those headers.');
    const headers = rows[headerIndex].map(normalize);
    const nameCol = headers.findIndex(h => names.includes(h));
    const urlCol = headers.findIndex(h => urls.includes(h));
    const noteCol = headers.findIndex(h => ['note','notes'].includes(h));
    const tagsCol = headers.indexOf('tags');
    const listCol = headers.findIndex(h => ['list','list_name','collection','collection_name'].includes(h));
    const seen = new Set(existing.map(p => mapsURL(p.url || '')).filter(Boolean));
    const places = []; let skipped = 0, duplicates = 0;
    if (rows.length - headerIndex - 1 > 2000) throw new Error('Import up to 2,000 rows at a time.');
    for (const row of rows.slice(headerIndex + 1)) {
      const name = (row[nameCol] || '').trim();
      const rawURL = (row[urlCol] || '').trim();
      const url = mapsURL(rawURL);
      const note = noteCol < 0 ? '' : (row[noteCol] || '').trim();
      if (!name || name.length > 200 || !url || rawURL.length > 2000 || note.length > 3000 || row.length !== headers.length) { skipped++; continue; }
      if (seen.has(url)) { duplicates++; continue; }
      seen.add(url);
      const listName = (listCol < 0 ? fileName.replace(/\.csv$/i,'') : row[listCol] || '').trim().slice(0,200);
      const tags = suggestedTags([note,listName,tagsCol < 0 ? '' : row[tagsCol]].join('\n'));
      places.push({id:crypto.randomUUID(),name,url,note,category:'unknown',status:'not specified',recommended:false,inGuide:true,neighborhood:'',price:null,tags,inferredTags:[...tags],listName,source:'Google Takeout CSV'});
    }
    return {places,skipped,duplicates};
  }
  function ready(place) {
    return typeof place.inGuide === 'boolean' ? place.inGuide : place.recommended === true;
  }
  function visitLabel(status) {
    return ({'been there':'Been there','want to try':'Want to try'})[status] || 'Not specified';
  }
  function categoryLabel(category) {
    return ({restaurant:'Restaurant',cafe:'Café',bar:'Bar',shop:'Shop',nightclub:'Nightclub',other:'Other',unknown:'Uncategorized'})[category] || 'Uncategorized';
  }
  function validateBackup(text) {
    if (text.length > 20_000_000) throw new Error('Choose a backup smaller than 20 MB.');
    const data = JSON.parse(text);
    if (data.version !== 1 || !Array.isArray(data.places) || data.places.length > 2000) throw new Error('This is not a supported Inner Table. backup.');
    return data.places.map(p => {
      if (p && ((p.inGuide !== undefined && typeof p.inGuide !== 'boolean') || (p.listName !== undefined && (typeof p.listName !== 'string' || p.listName.length > 200)) || (p.inferredTags !== undefined && (!Array.isArray(p.inferredTags) || !p.inferredTags.every(tag => TAGS.includes(tag)))))) throw new Error('Invalid guide metadata. Nothing was restored.');
      if (!p || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 200 || typeof p.url !== 'string' || p.url.length > 2000 || !mapsURL(p.url) || typeof p.note !== 'string' || p.note.length > 3000 || typeof p.neighborhood !== 'string' || p.neighborhood.length > 100 || !['unknown','restaurant','cafe','bar','shop','nightclub','other'].includes(p.category) || !['been there','want to try','not specified'].includes(p.status) || typeof p.recommended !== 'boolean' || !(p.price === null || (Number.isFinite(p.price) && p.price > 0 && p.price <= 10000)) || !Array.isArray(p.tags) || !p.tags.every(tag => TAGS.includes(tag))) throw new Error('A backup place contains invalid fields. Nothing was restored.');
      return {id:crypto.randomUUID(),name:p.name.trim(),url:mapsURL(p.url),note:p.note,neighborhood:p.neighborhood.trim(),category:p.category,status:p.status,recommended:p.recommended,inGuide:typeof p.inGuide === 'boolean' ? p.inGuide : p.recommended,price:p.price,tags:[...new Set(p.tags)],inferredTags:(p.inferredTags || []).filter(tag=>p.tags.includes(tag)),listName:p.listName || '',source:p.source === 'Google Takeout CSV' ? p.source : 'Restored personal backup'};
    });
  }
  root.InnerTableImport = {mapsURL,parseCSV,importCSV,ready,visitLabel,categoryLabel,validateBackup};
  if (typeof module !== 'undefined') module.exports = root.InnerTableImport;
})(typeof globalThis !== 'undefined' ? globalThis : window);
