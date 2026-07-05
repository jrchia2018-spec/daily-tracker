// Food macro lookup via the free Open Food Facts API (no key required).

const SEARCH_URL = 'https://world.openfoodfacts.org/cgi/search.pl';

export async function searchFood(query) {
  const params = new URLSearchParams({
    search_terms: query,
    search_simple: '1',
    action: 'process',
    json: '1',
    page_size: '15',
    fields: 'product_name,brands,nutriments,serving_size',
  });
  const res = await fetch(`${SEARCH_URL}?${params}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Food search failed (${res.status})`);
  const data = await res.json();

  return (data.products || [])
    .map(p => {
      const n = p.nutriments || {};
      let kcal = num(n['energy-kcal_100g']);
      if (kcal == null) {
        const kj = num(n['energy_100g']);
        if (kj != null) kcal = kj / 4.184;
      }
      return {
        name: (p.product_name || '').trim(),
        brand: (p.brands || '').split(',')[0].trim(),
        serving: p.serving_size || '',
        per100: {
          kcal: round1(kcal),
          protein: round1(num(n.proteins_100g)),
          carbs: round1(num(n.carbohydrates_100g)),
          fat: round1(num(n.fat_100g)),
        },
      };
    })
    .filter(f => f.name && f.per100.kcal != null);
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function round1(v) {
  return v == null ? null : Math.round(v * 10) / 10;
}

// Parse a serving size string like "45 g" or "1 bar (35g)" into grams.
export function parseServingGrams(serving) {
  const m = /([\d.]+)\s*g/i.exec(serving || '');
  return m ? Number(m[1]) : null;
}
