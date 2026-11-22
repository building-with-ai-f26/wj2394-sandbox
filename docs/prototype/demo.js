/* Real NYC venues from public sources, separate from personal and friends’ guides. */
const InnerTableDemo = [
  {
    id:'demo-1', name:'Via Carota', category:'restaurant', neighborhood:'West Village',
    address:'51 Grove St, Manhattan', description:'Italian restaurant serving seasonal dishes in the West Village.',
    website:'https://www.viacarota.com/',
    photo:{
      file:'via-carota.jpg', author:'Jim.henderson', license:'CC BY-SA 4.0',
      source:'https://commons.wikimedia.org/wiki/File:Via_Carota_2023_jeh.jpg',
      licenseURL:'https://creativecommons.org/licenses/by-sa/4.0/'
    }
  },
  {
    id:'demo-2', name:'Caffè Dante', category:'bar', neighborhood:'Greenwich Village',
    address:'79–81 MacDougal St, Manhattan', description:'Historic Greenwich Village café and aperitivo bar with cocktails and Italian food.',
    website:'https://www.dante-nyc.com/location/dante-nyc/',
    photo:{
      file:'caffe-dante.jpg', author:'Billie Grace Ward', license:'CC BY 2.0',
      source:'https://www.flickr.com/photos/wwward0/6820088678/',
      licenseURL:'https://creativecommons.org/licenses/by/2.0/'
    }
  },
  {
    id:'demo-3', name:'Devoción Williamsburg', category:'cafe', neighborhood:'Williamsburg',
    address:'148 Grand St, Brooklyn', description:'Coffee shop serving Colombian coffee roasted in Brooklyn.',
    website:'https://www.devocion.com/pages/new-york-coffee-shop-williamsburg-brooklyn'
  },
  {
    id:'demo-4', name:'Brooklyn Bridge Park, Pier 1', category:'other', typeLabel:'Park', neighborhood:'DUMBO',
    address:'Old Fulton St at Furman St, Brooklyn', description:'East River waterfront park with lawns and views of the Brooklyn Bridge and Lower Manhattan.',
    website:'https://brooklynbridgepark.org/places-to-see/pier-1/',
    photo:{
      file:'pier-1.jpg', author:'Tdorante10', license:'CC BY-SA 4.0',
      source:'https://commons.wikimedia.org/wiki/File:Brooklyn_Bridge_Park_td_(2019-08-23)_015_-_Pier_1,_Bridge_View_Lawn.jpg',
      licenseURL:'https://creativecommons.org/licenses/by-sa/4.0/'
    }
  }
].map(place => Object.freeze({
  ...place,
  url:'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(place.name + ', ' + place.address),
  price:null, note:'', tags:Object.freeze([]), status:'not specified', recommended:false, inGuide:true
}));
