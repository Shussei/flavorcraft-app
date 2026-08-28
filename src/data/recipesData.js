// Curated Gourmet Recipes for FlavorCraft Facade

export const RECIPE_CATEGORIES = [
  { id: 'all', label: 'All Recipes', icon: '🍲' },
  { id: 'quick', label: 'Under 20 Mins', icon: '⏱️' },
  { id: 'italian', label: 'Italian & Pasta', icon: '🍝' },
  { id: 'asian', label: 'Asian Fusion', icon: '🍜' },
  { id: 'healthy', label: 'Healthy & Fresh', icon: '🥗' },
  { id: 'baking', label: 'Baking & Desserts', icon: '🍰' }
];

export const RECIPES_DATABASE = [
  {
    id: 'creamy-garlic-pasta',
    title: 'Creamy Garlic Parmesan Pasta',
    category: 'italian',
    prepTime: '10 mins',
    cookTime: '15 mins',
    calories: '480 kcal',
    difficulty: 'Easy',
    rating: 4.9,
    servings: 2,
    gradient: 'linear-gradient(135deg, #f59e0b, #d97706)',
    icon: '🍝',
    description: 'Silky, rich fettuccine tossed in fresh garlic butter, heavy cream, and freshly grated Parmigiano-Reggiano.',
    ingredients: [
      '200g Fettuccine pasta',
      '4 cloves Garlic, minced',
      '3 tbsp Unsalted butter',
      '3/4 cup Heavy cream',
      '1/2 cup Freshly grated Parmesan cheese',
      '1 tbsp Chopped fresh parsley',
      'Salt and freshly cracked black pepper to taste'
    ],
    steps: [
      'Bring a large pot of salted water to a rolling boil and cook fettuccine until al dente.',
      'In a wide skillet, melt butter over medium heat. Add minced garlic and sauté until fragrant (approx 1 minute).',
      'Pour in heavy cream and bring to a soft simmer for 2 minutes.',
      'Reduce heat to low, add grated Parmesan, stirring constantly until melted into a velvety sauce.',
      'Toss pasta directly in sauce with 2 tbsp pasta water. Season with black pepper and fresh parsley.'
    ]
  },
  {
    id: 'avocado-salmon-bowl',
    title: 'Wild Salmon & Avocado Poke Bowl',
    category: 'healthy',
    prepTime: '15 mins',
    cookTime: '10 mins',
    calories: '520 kcal',
    difficulty: 'Medium',
    rating: 4.8,
    servings: 2,
    gradient: 'linear-gradient(135deg, #10b981, #059669)',
    icon: '🥗',
    description: 'Pan-seared salmon cubes served over fluffy jasmine rice with ripe avocado, edamame, cucumber, and spicy sriracha mayo.',
    ingredients: [
      '300g Fresh salmon fillet, diced into 1-inch cubes',
      '1 cup Cooked Jasmine or Sushi rice',
      '1 Ripe Hass avocado, sliced',
      '1/2 cup Steamed edamame beans',
      '1/2 Persian cucumber, thinly sliced',
      '1 tbsp Low-sodium Soy sauce & Sesame oil',
      '2 tbsp Spicy sriracha mayonnaise'
    ],
    steps: [
      'Marinate salmon cubes in soy sauce, sesame oil, and grated ginger for 5 minutes.',
      'Heat a non-stick pan over medium-high heat. Sear salmon cubes for 2-3 minutes until golden brown on edges.',
      'Divide warm rice into two bowls.',
      'Arrange seared salmon, sliced avocado, edamame, and cucumber neatly around the bowl.',
      'Drizzle with spicy sriracha mayo and sprinkle toasted sesame seeds.'
    ]
  },
  {
    id: 'tonkotsu-ramen-bowl',
    title: 'Artisanal Shoyu Tonkotsu Ramen',
    category: 'asian',
    prepTime: '20 mins',
    cookTime: '25 mins',
    calories: '610 kcal',
    difficulty: 'Medium',
    rating: 5.0,
    servings: 2,
    gradient: 'linear-gradient(135deg, #ef4444, #b91c1c)',
    icon: '🍜',
    description: 'Comforting bowl of rich pork broth ramen topped with tender Chashu pork belly, soft-boiled ajitsuke egg, nori, and scallions.',
    ingredients: [
      '2 packs Fresh Ramen noodles',
      '4 cups Rich Tonkotsu or Ramen broth',
      '4 slices Tender Chashu pork belly',
      '2 Soft-boiled marinated eggs (halved)',
      '1/2 cup Bamboo shoots (Menma)',
      '2 Nori seaweed sheets',
      'Finely sliced scallions and chili oil'
    ],
    steps: [
      'Heat broth in a saucepan until piping hot. Stir in 2 tbsp Shoyu ramen tare seasoning.',
      'Boil ramen noodles in separate pot for 90 seconds, then drain thoroughly.',
      'Divide noodles into deep warmed ramen bowls and pour hot broth over noodles.',
      'Top delicately with Chashu slices, soft-boiled egg halves, bamboo shoots, scallions, and nori.',
      'Finish with a drizzle of chili oil or black garlic oil.'
    ]
  },
  {
    id: 'fluffy-berry-pancakes',
    title: 'Fluffy Japanese Soufflé Pancakes',
    category: 'baking',
    prepTime: '15 mins',
    cookTime: '12 mins',
    calories: '390 kcal',
    difficulty: 'Medium',
    rating: 4.9,
    servings: 2,
    gradient: 'linear-gradient(135deg, #ec4899, #be185d)',
    icon: '🍰',
    description: 'Cloud-like soufflé pancakes served with whipped vanilla cream, fresh maple syrup, and organic mixed berries.',
    ingredients: [
      '2 Egg yolks + 3 Egg whites',
      '2 tbsp Whole milk',
      '1/2 tsp Pure vanilla extract',
      '1/4 cup Cake flour',
      '2.5 tbsp Superfine white sugar',
      'Fresh raspberries, blueberries, and maple syrup'
    ],
    steps: [
      'Whisk egg yolks, milk, and vanilla together. Sift in cake flour and whisk until smooth.',
      'Beat egg whites in clean bowl until foamy, slowly adding sugar until stiff peaks form.',
      'Gently fold whipped egg whites into yolk batter in 3 increments to preserve air bubbles.',
      'Heat non-stick skillet on low heat. Scoop tall mounds of batter, add a splash of water, cover pan and cook 4-5 mins per side.',
      'Serve stacked with dusting of powdered sugar, maple syrup, and berries.'
    ]
  },
  {
    id: 'crispy-truffle-fries',
    title: 'Crispy Truffle & Herb Steak Fries',
    category: 'quick',
    prepTime: '10 mins',
    cookTime: '15 mins',
    calories: '340 kcal',
    difficulty: 'Easy',
    rating: 4.7,
    servings: 3,
    gradient: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
    icon: '🍟',
    description: 'Golden air-fried potato batons tossed in white truffle oil, sea salt flakes, fresh rosemary, and grated Pecorino Romano.',
    ingredients: [
      '4 Large Russet potatoes, cut into 1/2-inch sticks',
      '2 tbsp Olive oil',
      '1.5 tbsp White truffle oil',
      '1/3 cup Grated Pecorino Romano or Parmesan',
      '1 tbsp Minced fresh rosemary & parsley',
      'Maldon sea salt flakes'
    ],
    steps: [
      'Soak potato sticks in cold water for 15 minutes, then pat completely dry with paper towels.',
      'Toss potatoes with olive oil and a pinch of salt.',
      'Air fry at 400°F (200°C) for 15-18 minutes until golden and crispy, shaking basket halfway.',
      'Transfer hot fries to bowl, drizzle with white truffle oil, grated cheese, minced rosemary, and sea salt flakes.'
    ]
  }
];
