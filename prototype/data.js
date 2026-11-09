// Fictional fixtures only. These are not real venues, reviews, or the builder's recommendations.
(function (root) {
  const places = [
    {id:1,name:'Juniper Table',neighborhood:'West Village',cuisine:'Seasonal American',category:'restaurant',recommended:true,status:'been there',price:88,tags:['conversation','special','date'],note:'A tucked-away dining room for a long catch-up. The back tables feel calm and a little special.'},
    {id:2,name:'Sunday on Orchard',neighborhood:'Lower East Side',cuisine:'Mediterranean',category:'restaurant',recommended:true,status:'been there',price:64,tags:['conversation','fun','group'],note:'Lively without having to shout. Share a few plates and settle in with friends.'},
    {id:3,name:'Little Lantern',neighborhood:'East Village',cuisine:'Taiwanese',category:'restaurant',recommended:true,status:'been there',price:42,tags:['fun','group'],note:'A busy, loud room with big sharing plates. Go for a group celebration rather than a quiet conversation.'},
    {id:4,name:'Cedar & Salt',neighborhood:'Greenpoint',cuisine:'Italian',category:'restaurant',recommended:true,status:'been there',price:72,tags:['conversation','special','date'],note:'An unhurried pasta dinner. I would take a friend here when we have a lot to catch up on.'},
    {id:5,name:'The Marigold Room',neighborhood:'Chelsea',cuisine:'Contemporary Indian',category:'restaurant',recommended:true,status:'been there',price:96,tags:['special','fun','date'],note:'A festive room for a birthday or date. The music is part of the evening, so expect some noise.'},
    {id:6,name:'Olive Window',neighborhood:'West Village',cuisine:'Greek',category:'restaurant',recommended:true,status:'been there',price:58,tags:['conversation','fun'],note:'A cheerful neighborhood dinner where we could still hear each other. Easy to linger over shared dishes.'},
    {id:7,name:'Northline Supper',neighborhood:'Williamsburg',cuisine:'Seasonal American',category:'restaurant',recommended:true,status:'been there',price:125,tags:['special','conversation','date'],note:'A calm room and a slower dinner for a special occasion. More of a splurge than an everyday plan.'},
    {id:8,name:'Saffron Corner',neighborhood:'East Village',cuisine:'Persian',category:'restaurant',recommended:true,status:'been there',price:48,tags:['conversation','group'],note:'A relaxed table for talking and sharing rice dishes. Works for a small group of friends.'},
    {id:9,name:'Paper Moon Kitchen',neighborhood:'Lower East Side',cuisine:'Korean',category:'restaurant',recommended:false,status:'want to try',price:65,tags:['fun'],note:'Saved after someone mentioned it. I have not been and have not marked it as a recommendation yet.'},
    {id:10,name:'Fern House',neighborhood:'Greenpoint',cuisine:'Coffee & pastries',category:'cafe',recommended:true,status:'been there',price:18,tags:['conversation'],note:'A daytime coffee catch-up, not a dinner spot.'},
    {id:11,name:'Blue Hour Dining',neighborhood:'Chelsea',cuisine:'French',category:'restaurant',recommended:true,status:'been there',price:null,tags:['special','conversation'],note:'A quiet dining room for a special evening. I did not record what I spent.'},
    {id:12,name:'Pin on 8th',neighborhood:'East Village',cuisine:null,category:'unknown',recommended:false,status:'want to try',price:null,tags:[],note:'An uncategorized saved pin. I have not chosen whether to recommend it yet.'}
  ];
  root.InnerTableData = places;
  if (typeof module !== 'undefined') module.exports = places;
})(typeof globalThis !== 'undefined' ? globalThis : window);
