/* Fictional examples stay in memory and never enter a device or account guide. */
const InnerTableDemo = [
  {id:'demo-1', name:'Sample · Juniper Kitchen', category:'restaurant', neighborhood:'West Village', price:75, tags:['conversation','date'], note:'Fictional example. A quiet Japanese dinner for catching up, with space to talk. Sample all-in budget $75 each.'},
  {id:'demo-2', name:'Sample · Orchard Supper', category:'restaurant', neighborhood:'Lower East Side', price:65, tags:['fun','conversation','group'], note:'Fictional example. A lively dinner with friends, with a quieter back room for conversation. Sample all-in budget $65 each.'},
  {id:'demo-3', name:'Sample · Lantern Room', category:'restaurant', neighborhood:'Chelsea', price:95, tags:['special','date','conversation'], note:'Fictional example. A special dinner in a small dining room. Sample all-in budget $95 each.'},
  {id:'demo-4', name:'Sample · Sunday Window', category:'cafe', neighborhood:'West Village', price:20, tags:['conversation'], note:'Fictional example. Coffee and pastries for an afternoon catch-up. Sample budget $20 each.'},
  {id:'demo-5', name:'Sample · Night Garden', category:'bar', neighborhood:'East Village', price:45, tags:['fun','group'], note:'Fictional example. Cocktails and music for a fun evening with a group. Sample budget $45 each.'},
  {id:'demo-6', name:'Sample · Paper Trail', category:'shop', neighborhood:'SoHo', price:null, tags:[], note:'Fictional example. A small book and stationery shop for browsing together.'}
].map(place => Object.freeze({...place, tags:Object.freeze(place.tags), status:'not specified', recommended:false, inGuide:true, listName:'Fictional sample guide', source:'Fictional example', inferredTags:[]}));
