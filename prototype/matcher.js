(function (root) {
  const rules = [
    {tag:'conversation',pattern:/catch[ -]?up|haven[’']?t seen|hear each other|quiet|talk|conversation|not (?:too )?loud/i},
    {tag:'fun',pattern:/\bfun\b|lively|festive/i},
    {tag:'special',pattern:/special|birthday|anniversary|celebrat/i},
    {tag:'date',pattern:/\bdate\b|romantic/i},
    {tag:'group',pattern:/\bgroup\b|\bfriends\b/i}
  ];
  function matchPlaces(places, query = '', filters = {}) {
    const text = query.trim();
    const tags = rules.filter(rule => rule.pattern.test(text)).map(rule => rule.tag);
    const categories = [
      ['restaurant',/\b(dinner|restaurant)s?\b/i],
      ['cafe',/\b(coffee|caf[eé])\b/i],
      ['bar',/\b(bar|bars|cocktails?)\b/i],
      ['shop',/\b(shop|shops|shopping|store|stores)\b/i],
      ['nightclub',/\b(nightclub|nightclubs|nightlife)\b/i]
    ].filter(([,pattern]) => pattern.test(text)).map(([category]) => category);
    const parsedBudget = text.match(/(?:under|below|less than)\s*\$?\s*(\d+(?:\.\d+)?)/i);
    const limits = [parsedBudget ? Number(parsedBudget[1]) : null, filters.budget ? Number(filters.budget) : null].filter(value => value !== null);
    const budget = limits.length ? Math.min(...limits) : null;
    const neighborhoods = [...new Set(places.map(place => place.neighborhood).filter(Boolean))];
    const mentioned = neighborhoods.filter(name => text.toLowerCase().includes(name.toLowerCase()));
    const recognized = !text || tags.length > 0 || categories.length > 0 || parsedBudget || mentioned.length > 0 || /\bnyc\b/i.test(text) || /^places?$/i.test(text);
    // Unsupported dietary/accessibility/opening constraints must not be silently ignored.
    const unsupported = /vegan|vegetarian|gluten|allerg|halal|kosher|wheelchair|accessible|outdoor|tonight|open now|reservation|available|\bnot fun\b|\bnot quiet\b|\bnot romantic\b|\bno music\b/i.test(text);
    const matches = !recognized || unsupported ? [] : places.filter(place =>
      (typeof place.inGuide === 'boolean' ? place.inGuide : place.recommended === true) &&
      (!categories.length || categories.includes(place.category)) &&
      tags.every(tag => place.tags.includes(tag)) &&
      (budget === null || (Number.isFinite(place.price) && place.price < budget)) &&
      (!filters.neighborhood || place.neighborhood === filters.neighborhood) &&
      (!mentioned.length || mentioned.includes(place.neighborhood))
    ).map(place => ({place,reasons:[
      ...tags.map(tag => ((place.inferredTags || []).includes(tag) ? 'Suggested from saved note or list keywords: ' : 'Recorded tag: ') + ({conversation:'good for talking',fun:'a lively outing',special:'a special occasion',date:'a date',group:'a group'})[tag]),
      ...(budget !== null ? [`Recorded all-in estimate $${place.price} per person is under $${budget}`] : []),
      ...((filters.neighborhood || mentioned.length) ? [`In ${place.neighborhood}`] : []),
      ...(!tags.length && budget === null && !filters.neighborhood && !mentioned.length ? [place.recommended ? 'Personally recommended in this guide' : 'Saved in this guide; not personally endorsed'] : [])
    ]}));
    return {matches,tags,budget,unsupported,recognized:Boolean(recognized)};
  }
  root.InnerTableMatcher = {matchPlaces};
  if (typeof module !== 'undefined') module.exports = {matchPlaces};
})(typeof globalThis !== 'undefined' ? globalThis : window);
