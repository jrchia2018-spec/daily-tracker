// Built-in database of common whole foods (per 100g) so basics like
// "salmon" always match instantly, without relying on the online
// branded-products database. Values are typical averages (USDA-style);
// fibre in g/100g, sodium in mg/100g, added 12 Jul 2026.
// Singapore hawker dishes live in foods-sg.js and are searched together.

import { SG_FOODS } from './foods-sg.js';
import { MY_FOODS } from './foods-my.js';

// `water` is g of drinkable fluid per 100g, set only for liquids (see the
// note in foods-sg.js); solid foods leave it null and contribute nothing.
const F = (name, kcal, protein, carbs, fat, serving = null, fibre = null, sodium = null, water = null) =>
  ({ name, brand: 'Basic', serving: serving ? `${serving} g` : '100 g', per100: { kcal, protein, carbs, fat, fibre, sodium, water } });

export const COMMON_FOODS = [
  // fish & seafood
  F('Salmon, raw', 208, 20, 0, 13, 125, 0, 59),
  F('Salmon, smoked', 117, 18, 0, 4.3, 50, 0, 750),
  F('Tuna, canned in water', 116, 26, 0, 1, 100, 0, 320),
  F('Tuna, raw (sashimi)', 144, 23, 0, 5, 100, 0, 45),
  F('Cod / white fish', 82, 18, 0, 0.7, 140, 0, 60),
  F('Sea bass', 124, 24, 0, 2.5, 130, 0, 68),
  F('Mackerel', 205, 19, 0, 14, 110, 0, 90),
  F('Sardines, canned', 208, 25, 0, 11, 90, 0, 450),
  F('Prawns / shrimp', 99, 24, 0.2, 0.3, 85, 0, 200),
  F('Squid', 92, 16, 3.1, 1.4, 85, 0, 44),
  // meat & poultry
  F('Chicken breast, raw', 120, 22.5, 0, 2.6, 150, 0, 60),
  F('Chicken breast, cooked', 165, 31, 0, 3.6, 120, 0, 74),
  F('Chicken thigh, cooked', 209, 26, 0, 11, 100, 0, 90),
  F('Turkey breast', 135, 30, 0, 1, 100, 0, 55),
  F('Beef, lean mince (5%)', 137, 21, 0, 5, 125, 0, 66),
  F('Beef, regular mince (15%)', 254, 17, 0, 20, 125, 0, 67),
  F('Beef steak, sirloin', 183, 27, 0, 8, 200, 0, 54),
  F('Pork loin', 198, 27, 0, 9, 130, 0, 60),
  F('Pork belly', 518, 9, 0, 53, 100, 0, 35),
  F('Bacon', 541, 37, 1.4, 42, 30, 0, 1800),
  F('Ham, sliced', 145, 21, 1.5, 6, 50, 0, 1200),
  F('Pork sausage', 301, 12, 3, 27, 60, 0.5, 750),
  F('Lamb chop', 294, 25, 0, 21, 100, 0, 65),
  // eggs & dairy
  F('Egg, whole', 143, 12.6, 0.7, 9.5, 50, 0, 142),
  F('Egg white', 52, 11, 0.7, 0.2, 33, 0, 166),
  F('Greek yogurt, 0% fat', 59, 10, 3.6, 0.4, 170, 0, 36),
  F('Greek yogurt, full fat', 97, 9, 4, 5, 170, 0, 35),
  F('Skyr', 63, 11, 4, 0.2, 150, 0, 42),
  F('Cottage cheese', 98, 11, 3.4, 4.3, 100, 0, 350),
  F('Milk, whole', 61, 3.2, 4.8, 3.3, 250, 0, 43, 87),
  F('Milk, skim', 34, 3.4, 5, 0.1, 250, 0, 42, 91),
  F('Soy milk, unsweetened', 33, 3.3, 1.2, 1.8, 250, 0.4, 40, 92),
  F('Oat milk', 47, 1, 7, 1.5, 250, 0.8, 40, 90),
  F('Cheddar cheese', 403, 25, 1.3, 33, 30, 0, 650),
  F('Mozzarella', 280, 28, 3.1, 17, 30, 0, 500),
  F('Parmesan', 431, 38, 4.1, 29, 10, 0, 1500),
  F('Butter', 717, 0.9, 0.1, 81, 10, 0, 640),
  // carbs & grains
  F('White rice, cooked', 130, 2.7, 28, 0.3, 200, 0.4, 1),
  F('Brown rice, cooked', 112, 2.3, 24, 0.8, 200, 1.8, 4),
  F('Pasta, cooked', 158, 5.8, 31, 0.9, 180, 1.8, 1),
  F('Noodles, egg, cooked', 138, 4.5, 25, 2.1, 180, 1.2, 8),
  F('Bread, white', 265, 9, 49, 3.2, 40, 2.7, 490),
  F('Bread, wholemeal', 247, 13, 41, 3.4, 40, 6, 450),
  F('Bagel', 250, 10, 49, 1.5, 95, 1.8, 430),
  F('Tortilla / wrap', 310, 8, 50, 8, 60, 3, 720),
  F('Oats, dry', 389, 17, 66, 7, 50, 10.6, 2),
  F('Granola', 471, 10, 64, 20, 60, 7, 30),
  F('Potato, boiled', 87, 1.9, 20, 0.1, 180, 1.8, 4),
  F('Sweet potato, baked', 90, 2, 21, 0.2, 150, 3.3, 36),
  F('Quinoa, cooked', 120, 4.4, 21, 1.9, 185, 2.8, 7),
  F('Couscous, cooked', 112, 3.8, 23, 0.2, 160, 1.4, 5),
  F('Rice cakes', 387, 8, 82, 3, 9, 4, 50),
  // legumes
  F('Lentils, cooked', 116, 9, 20, 0.4, 150, 7.9, 2),
  F('Chickpeas, cooked', 164, 8.9, 27, 2.6, 150, 7.6, 7),
  F('Black beans, cooked', 132, 8.9, 24, 0.5, 130, 8.7, 1),
  F('Kidney beans, cooked', 127, 8.7, 23, 0.5, 130, 7.4, 2),
  F('Baked beans', 94, 4.7, 15, 0.5, 210, 5.5, 420),
  F('Edamame', 121, 12, 9, 5, 100, 5.2, 6),
  F('Hummus', 166, 8, 14, 10, 50, 6, 380),
  F('Tofu, firm', 144, 15, 3, 9, 150, 0.9, 14),
  F('Tempeh', 192, 20, 8, 11, 100, 5, 9),
  // fruit
  F('Banana', 89, 1.1, 23, 0.3, 118, 2.6, 1),
  F('Apple', 52, 0.3, 14, 0.2, 180, 2.4, 1),
  F('Orange', 47, 0.9, 12, 0.1, 140, 2.4, 0),
  F('Blueberries', 57, 0.7, 14, 0.3, 100, 2.4, 1),
  F('Strawberries', 32, 0.7, 7.7, 0.3, 150, 2, 1),
  F('Grapes', 69, 0.7, 18, 0.2, 100, 0.9, 2),
  F('Mango', 60, 0.8, 15, 0.4, 165, 1.6, 1),
  F('Pineapple', 50, 0.5, 13, 0.1, 165, 1.4, 1),
  F('Watermelon', 30, 0.6, 8, 0.2, 280, 0.4, 1),
  F('Kiwi', 61, 1.1, 15, 0.5, 70, 3, 3),
  F('Avocado', 160, 2, 9, 15, 100, 6.7, 7),
  // vegetables
  F('Broccoli', 34, 2.8, 7, 0.4, 100, 2.6, 33),
  F('Spinach', 23, 2.9, 3.6, 0.4, 80, 2.2, 79),
  F('Kale', 35, 2.9, 4.4, 1.5, 80, 4.1, 53),
  F('Carrot', 41, 0.9, 10, 0.2, 80, 2.8, 69),
  F('Tomato', 18, 0.9, 3.9, 0.2, 120, 1.2, 5),
  F('Cucumber', 15, 0.7, 3.6, 0.1, 100, 0.5, 2),
  F('Lettuce', 15, 1.4, 2.9, 0.2, 50, 1.3, 28),
  F('Bell pepper', 31, 1, 6, 0.3, 120, 2.1, 4),
  F('Onion', 40, 1.1, 9, 0.1, 80, 1.7, 4),
  F('Mushrooms', 22, 3.1, 3.3, 0.3, 80, 1, 5),
  F('Green beans', 31, 1.8, 7, 0.2, 100, 2.7, 6),
  F('Sweetcorn', 86, 3.3, 19, 1.4, 100, 2, 15),
  F('Peas', 81, 5.4, 14, 0.4, 80, 5.7, 5),
  F('Cauliflower', 25, 1.9, 5, 0.3, 100, 2, 30),
  F('Asparagus', 20, 2.2, 3.9, 0.1, 90, 2.1, 2),
  // nuts, fats & snacks
  F('Almonds', 579, 21, 22, 50, 28, 12.5, 1),
  F('Walnuts', 654, 15, 14, 65, 28, 6.7, 2),
  F('Cashews', 553, 18, 30, 44, 28, 3.3, 12),
  F('Peanuts', 567, 26, 16, 49, 28, 8.5, 18),
  F('Peanut butter', 588, 25, 20, 50, 32, 6, 450),
  F('Olive oil', 884, 0, 0, 100, 14, 0, 2),
  F('Dark chocolate (70%)', 546, 4.9, 61, 31, 25, 10.9, 20),
  F('Honey', 304, 0.3, 82, 0, 21, 0.2, 4),
  F('Sugar', 387, 0, 100, 0, 4, 0, 1),
  F('Whey protein powder', 400, 80, 8, 6, 30, 2, 200),
  F('Protein bar (typical)', 380, 33, 38, 12, 60, 10, 250),
];

const BUILT_IN = [...COMMON_FOODS, ...SG_FOODS, ...MY_FOODS];

// Local shorthand → the words actually used in dish names. Whole-word
// matches only, longest phrase first, applied before tokenizing.
const ALIASES = {
  'economic rice': 'economy rice',
  'econ rice': 'economy rice',
  'cai png': 'economy rice',
  'cai fan': 'economy rice',
  'caipng': 'economy rice',
  'caifan': 'economy rice',
  'chye png': 'economy rice',
  'nasi ayam': 'chicken rice',
  'nasi goreng': 'fried rice',
  'maggie goreng': 'maggi goreng',
  'prata kosong': 'prata plain',
  'mee pok': 'bak chor mee',
  'ckt': 'char kway teow',
  'bcm': 'bak chor mee',
  'bkt': 'bak kut teh',
  'xlb': 'xiao long bao',
  'hcg': 'har cheong gai',
  'wonton': 'wanton',
  'kopi peng': 'kopi',
  'kopi bing': 'kopi',
  'teh peng': 'teh',
  'teh bing': 'teh',
  'milo peng': 'milo',
  'iced milo': 'milo',
  'ice milo': 'milo',
};

const ALIAS_KEYS = Object.keys(ALIASES).sort((a, b) => b.length - a.length);

function expandAliases(q) {
  let s = q;
  for (const k of ALIAS_KEYS) {
    s = s.replace(new RegExp(`\\b${k}\\b`, 'g'), ALIASES[k]);
  }
  return s;
}

// All query words must appear in the food name; prefix matches rank first.
export function searchCommonFoods(query, limit = 8) {
  const tokens = expandAliases(query.toLowerCase()).split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  return BUILT_IN
    .filter(f => {
      const n = f.name.toLowerCase();
      return tokens.every(t => n.includes(t));
    })
    .sort((a, b) => {
      const t = tokens[0];
      return (b.name.toLowerCase().startsWith(t)) - (a.name.toLowerCase().startsWith(t));
    })
    .slice(0, limit);
}
