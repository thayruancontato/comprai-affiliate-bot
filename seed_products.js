// Seed script: busca dados reais de produtos do ML via /items/{id}
// A API de itens individuais não está bloqueada como a de search
const fs = require('fs');

const KNOWN_ML_IDS = [
  'MLB3452441991', 'MLB3977660066', 'MLB4217196024', 'MLB4395668694',
  'MLB2101569492', 'MLB4519967268', 'MLB2151608678', 'MLB4228965030',
  'MLB3564998748', 'MLB4011883570', 'MLB3240356553', 'MLB4395668694',
  'MLB3977660066', 'MLB2500010870', 'MLB3800000001', 'MLB2855297039',
  'MLB3025696026', 'MLB4197781738', 'MLB3893226649', 'MLB3566432977'
];

const TRACKING_ID = 'comprakibr';

async function fetchItem(id) {
  try {
    const r = await fetch(`https://api.mercadolibre.com/items/${id}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!r.ok) return null;
    const data = await r.json();
    if (!data.id || data.status === 'paused' || !data.thumbnail) return null;
    
    const link = data.permalink + `?matt_tool=${TRACKING_ID}`;
    return {
      id: data.id,
      title: data.title,
      price: `R$ ${Math.floor(data.price).toLocaleString('pt-BR')}`,
      link,
      thumbnail: data.thumbnail.replace('http://', 'https://').replace('I.jpg', 'O.jpg'),
      source: 'cache-curadoria'
    };
  } catch (e) {
    return null;
  }
}

async function run() {
  const results = [];
  for (const id of KNOWN_ML_IDS) {
    console.log('Buscando', id, '...');
    const item = await fetchItem(id);
    if (item) {
      results.push(item);
      console.log('  OK:', item.title.substring(0, 50));
    } else {
      console.log('  FALHOU ou inativo');
    }
    await new Promise(r => setTimeout(r, 300));
  }
  
  if (results.length > 0) {
    fs.writeFileSync('src/server/fallback_products.json', JSON.stringify(results, null, 2));
    console.log(`\nSalvos ${results.length} produtos reais!`);
  } else {
    console.log('Nenhum produto encontrado via API de items.');
  }
}

run();
