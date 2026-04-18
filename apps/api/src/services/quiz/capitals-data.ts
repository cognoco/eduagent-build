export interface CapitalEntry {
  country: string;
  capital: string;
  /** Non-empty — must contain at least the canonical capital name.
   *  Enforced as a tuple type so the schema's `.min(1)` can't be violated
   *  by an accidental empty array in the data. */
  acceptedAliases: [string, ...string[]];
  region: string;
  funFact: string;
}

export const CAPITALS_DATA: CapitalEntry[] = [
  {
    country: 'Albania',
    capital: 'Tirana',
    acceptedAliases: ['Tirana', 'Tirane'],
    region: 'Southern Europe',
    funFact:
      "Tirana's colorful buildings were painted to brighten the city after communism.",
  },
  {
    country: 'Andorra',
    capital: 'Andorra la Vella',
    acceptedAliases: ['Andorra la Vella'],
    region: 'Southern Europe',
    funFact: 'Andorra la Vella is the highest capital city in Europe.',
  },
  {
    country: 'Austria',
    capital: 'Vienna',
    acceptedAliases: ['Vienna', 'Wien'],
    region: 'Central Europe',
    funFact:
      'Vienna has been ranked the most livable city in the world multiple times.',
  },
  {
    country: 'Belarus',
    capital: 'Minsk',
    acceptedAliases: ['Minsk'],
    region: 'Eastern Europe',
    funFact: 'Minsk was almost completely rebuilt after World War II.',
  },
  {
    country: 'Belgium',
    capital: 'Brussels',
    acceptedAliases: ['Brussels', 'Bruxelles', 'Brussel'],
    region: 'Western Europe',
    funFact: 'Brussels is the de facto capital of the European Union.',
  },
  {
    country: 'Bosnia and Herzegovina',
    capital: 'Sarajevo',
    acceptedAliases: ['Sarajevo'],
    region: 'Southern Europe',
    funFact: 'Sarajevo hosted the 1984 Winter Olympics.',
  },
  {
    country: 'Bulgaria',
    capital: 'Sofia',
    acceptedAliases: ['Sofia', 'Sofiya'],
    region: 'Southern Europe',
    funFact:
      'Sofia is one of the oldest cities in Europe, settled over 7,000 years ago.',
  },
  {
    country: 'Croatia',
    capital: 'Zagreb',
    acceptedAliases: ['Zagreb'],
    region: 'Central Europe',
    funFact: 'Zagreb has one of the oldest tram networks in Europe.',
  },
  {
    country: 'Czech Republic',
    capital: 'Prague',
    acceptedAliases: ['Prague', 'Praha'],
    region: 'Central Europe',
    funFact:
      'Prague Castle is the largest ancient castle complex in the world.',
  },
  {
    country: 'Czechia',
    capital: 'Prague',
    acceptedAliases: ['Prague', 'Praha'],
    region: 'Central Europe',
    funFact:
      'Prague Castle is the largest ancient castle complex in the world.',
  },
  {
    country: 'Denmark',
    capital: 'Copenhagen',
    acceptedAliases: ['Copenhagen', 'Kobenhavn'],
    region: 'Northern Europe',
    funFact:
      'Copenhagen is one of the most bicycle-friendly cities in the world.',
  },
  {
    country: 'Estonia',
    capital: 'Tallinn',
    acceptedAliases: ['Tallinn'],
    region: 'Northern Europe',
    funFact:
      "Tallinn's Old Town is one of the best-preserved medieval cities in Europe.",
  },
  {
    country: 'Finland',
    capital: 'Helsinki',
    acceptedAliases: ['Helsinki', 'Helsingfors'],
    region: 'Northern Europe',
    funFact: 'Helsinki has more than 300 islands in its archipelago.',
  },
  {
    country: 'France',
    capital: 'Paris',
    acceptedAliases: ['Paris'],
    region: 'Western Europe',
    funFact: 'Paris was originally a Roman city called Lutetia.',
  },
  {
    country: 'Germany',
    capital: 'Berlin',
    acceptedAliases: ['Berlin'],
    region: 'Central Europe',
    funFact: 'Berlin has more bridges than Venice.',
  },
  {
    country: 'Greece',
    capital: 'Athens',
    acceptedAliases: ['Athens', 'Athina'],
    region: 'Southern Europe',
    funFact:
      'Athens is one of the oldest cities in the world, with history spanning over 3,400 years.',
  },
  {
    country: 'Hungary',
    capital: 'Budapest',
    acceptedAliases: ['Budapest'],
    region: 'Central Europe',
    funFact: 'Budapest was originally two cities separated by the Danube.',
  },
  {
    country: 'Iceland',
    capital: 'Reykjavik',
    acceptedAliases: ['Reykjavik', 'Reykjavik'],
    region: 'Northern Europe',
    funFact: 'Reykjavik is the northernmost capital of a sovereign state.',
  },
  {
    country: 'Ireland',
    capital: 'Dublin',
    acceptedAliases: ['Dublin'],
    region: 'Western Europe',
    funFact: 'Dublin takes its name from the Irish words for black pool.',
  },
  {
    country: 'Italy',
    capital: 'Rome',
    acceptedAliases: ['Rome', 'Roma'],
    region: 'Southern Europe',
    funFact: 'Rome has a country inside it: Vatican City.',
  },
  {
    country: 'Latvia',
    capital: 'Riga',
    acceptedAliases: ['Riga', 'Riga'],
    region: 'Northern Europe',
    funFact:
      'Riga has the largest collection of Art Nouveau architecture in the world.',
  },
  {
    country: 'Lithuania',
    capital: 'Vilnius',
    acceptedAliases: ['Vilnius'],
    region: 'Northern Europe',
    funFact: "Vilnius' Old Town is one of the largest in Eastern Europe.",
  },
  {
    country: 'Luxembourg',
    capital: 'Luxembourg City',
    acceptedAliases: ['Luxembourg City', 'Luxembourg'],
    region: 'Western Europe',
    funFact: 'Luxembourg City is built on dramatic cliffs and gorges.',
  },
  {
    country: 'Moldova',
    capital: 'Chisinau',
    acceptedAliases: ['Chisinau', 'Chisinau', 'Kishinev'],
    region: 'Eastern Europe',
    funFact:
      'Chisinau is known as the city of white stone for its limestone buildings.',
  },
  {
    country: 'Montenegro',
    capital: 'Podgorica',
    acceptedAliases: ['Podgorica'],
    region: 'Southern Europe',
    funFact: 'Podgorica gets around 200 sunny days each year.',
  },
  {
    country: 'Netherlands',
    capital: 'Amsterdam',
    acceptedAliases: ['Amsterdam'],
    region: 'Western Europe',
    funFact:
      'Amsterdam is built on millions of wooden poles driven into the ground.',
  },
  {
    country: 'North Macedonia',
    capital: 'Skopje',
    acceptedAliases: ['Skopje'],
    region: 'Southern Europe',
    funFact: 'Skopje has a giant warrior statue in its main square.',
  },
  {
    country: 'Norway',
    capital: 'Oslo',
    acceptedAliases: ['Oslo'],
    region: 'Northern Europe',
    funFact: 'Oslo is surrounded by forests and fjords within its city limits.',
  },
  {
    country: 'Poland',
    capital: 'Warsaw',
    acceptedAliases: ['Warsaw', 'Warszawa'],
    region: 'Central Europe',
    funFact: "Warsaw's Old Town was rebuilt from rubble after World War II.",
  },
  {
    country: 'Portugal',
    capital: 'Lisbon',
    acceptedAliases: ['Lisbon', 'Lisboa'],
    region: 'Southern Europe',
    funFact: 'Lisbon is older than Rome and was settled around 1200 BC.',
  },
  {
    country: 'Romania',
    capital: 'Bucharest',
    acceptedAliases: ['Bucharest', 'Bucuresti'],
    region: 'Eastern Europe',
    funFact:
      'Bucharest has the heaviest building in the world: the Palace of Parliament.',
  },
  {
    country: 'Serbia',
    capital: 'Belgrade',
    acceptedAliases: ['Belgrade', 'Beograd'],
    region: 'Southern Europe',
    funFact:
      'Belgrade is one of the oldest continuously inhabited cities in Europe.',
  },
  {
    country: 'Slovakia',
    capital: 'Bratislava',
    acceptedAliases: ['Bratislava'],
    region: 'Central Europe',
    funFact: 'Bratislava is the only capital that borders two other countries.',
  },
  {
    country: 'Slovenia',
    capital: 'Ljubljana',
    acceptedAliases: ['Ljubljana'],
    region: 'Central Europe',
    funFact: 'Ljubljana uses a dragon as its city symbol.',
  },
  {
    country: 'Spain',
    capital: 'Madrid',
    acceptedAliases: ['Madrid'],
    region: 'Southern Europe',
    funFact: 'Madrid is the highest capital city in the European Union.',
  },
  {
    country: 'Sweden',
    capital: 'Stockholm',
    acceptedAliases: ['Stockholm'],
    region: 'Northern Europe',
    funFact: 'Stockholm is built on 14 islands connected by 57 bridges.',
  },
  {
    country: 'Switzerland',
    capital: 'Bern',
    acceptedAliases: ['Bern', 'Berne'],
    region: 'Central Europe',
    funFact:
      'Bern is named after bears, and the city still keeps live bears in a park.',
  },
  {
    country: 'Ukraine',
    capital: 'Kyiv',
    acceptedAliases: ['Kyiv', 'Kiev'],
    region: 'Eastern Europe',
    funFact: 'Kyiv has one of the deepest metro stations in the world.',
  },
  {
    country: 'United Kingdom',
    capital: 'London',
    acceptedAliases: ['London'],
    region: 'Western Europe',
    funFact: 'London has been the capital of England for nearly 1,000 years.',
  },
  {
    country: 'China',
    capital: 'Beijing',
    acceptedAliases: ['Beijing', 'Peking'],
    region: 'East Asia',
    funFact: "Beijing's Forbidden City has 9,999 rooms.",
  },
  {
    country: 'India',
    capital: 'New Delhi',
    acceptedAliases: ['New Delhi', 'Delhi'],
    region: 'South Asia',
    funFact:
      'New Delhi was designed by British architects and completed in 1931.',
  },
  {
    country: 'Indonesia',
    capital: 'Jakarta',
    acceptedAliases: ['Jakarta'],
    region: 'Southeast Asia',
    funFact: 'Jakarta is one of the most densely populated cities on Earth.',
  },
  {
    country: 'Iran',
    capital: 'Tehran',
    acceptedAliases: ['Tehran', 'Teheran'],
    region: 'Western Asia',
    funFact: 'Tehran sits at the foot of the Alborz mountain range.',
  },
  {
    country: 'Israel',
    capital: 'Jerusalem',
    acceptedAliases: ['Jerusalem'],
    region: 'Western Asia',
    funFact: 'Jerusalem is sacred to three major world religions.',
  },
  {
    country: 'Japan',
    capital: 'Tokyo',
    acceptedAliases: ['Tokyo'],
    region: 'East Asia',
    funFact: 'Tokyo was originally a small fishing village called Edo.',
  },
  {
    country: 'Malaysia',
    capital: 'Kuala Lumpur',
    acceptedAliases: ['Kuala Lumpur', 'KL'],
    region: 'Southeast Asia',
    funFact: 'Kuala Lumpur means muddy confluence in Malay.',
  },
  {
    country: 'Mongolia',
    capital: 'Ulaanbaatar',
    acceptedAliases: ['Ulaanbaatar', 'Ulan Bator'],
    region: 'East Asia',
    funFact: 'Ulaanbaatar is the coldest capital city in the world.',
  },
  {
    country: 'Nepal',
    capital: 'Kathmandu',
    acceptedAliases: ['Kathmandu'],
    region: 'South Asia',
    funFact: 'Kathmandu Valley has seven UNESCO World Heritage Sites.',
  },
  {
    country: 'Pakistan',
    capital: 'Islamabad',
    acceptedAliases: ['Islamabad'],
    region: 'South Asia',
    funFact:
      'Islamabad is one of the few purpose-built capitals from the 1960s.',
  },
  {
    country: 'Philippines',
    capital: 'Manila',
    acceptedAliases: ['Manila'],
    region: 'Southeast Asia',
    funFact: 'Manila is among the most densely populated cities in the world.',
  },
  {
    country: 'Saudi Arabia',
    capital: 'Riyadh',
    acceptedAliases: ['Riyadh'],
    region: 'Western Asia',
    funFact: 'Riyadh means gardens in Arabic.',
  },
  {
    country: 'South Korea',
    capital: 'Seoul',
    acceptedAliases: ['Seoul'],
    region: 'East Asia',
    funFact: 'Seoul has been the capital of Korea for more than 600 years.',
  },
  {
    country: 'Thailand',
    capital: 'Bangkok',
    acceptedAliases: ['Bangkok', 'Krung Thep'],
    region: 'Southeast Asia',
    funFact:
      "Bangkok's ceremonial name is one of the longest city names in the world.",
  },
  {
    country: 'Turkey',
    capital: 'Ankara',
    acceptedAliases: ['Ankara'],
    region: 'Western Asia',
    funFact:
      "Many people think Istanbul is Turkey's capital, but it is actually Ankara.",
  },
  {
    country: 'Vietnam',
    capital: 'Hanoi',
    acceptedAliases: ['Hanoi', 'Ha Noi'],
    region: 'Southeast Asia',
    funFact: 'Hanoi celebrated its 1,000th birthday in 2010.',
  },
  {
    country: 'Egypt',
    capital: 'Cairo',
    acceptedAliases: ['Cairo', 'Al-Qahira'],
    region: 'North Africa',
    funFact: 'Cairo is the largest city in Africa and the Arab world.',
  },
  {
    country: 'Ethiopia',
    capital: 'Addis Ababa',
    acceptedAliases: ['Addis Ababa'],
    region: 'East Africa',
    funFact: 'Addis Ababa means new flower in Amharic.',
  },
  {
    country: 'Kenya',
    capital: 'Nairobi',
    acceptedAliases: ['Nairobi'],
    region: 'East Africa',
    funFact:
      'Nairobi has a national park with wild lions inside the city limits.',
  },
  {
    country: 'Morocco',
    capital: 'Rabat',
    acceptedAliases: ['Rabat'],
    region: 'North Africa',
    funFact: "Rabat, not Casablanca or Marrakech, is Morocco's capital.",
  },
  {
    country: 'Nigeria',
    capital: 'Abuja',
    acceptedAliases: ['Abuja'],
    region: 'West Africa',
    funFact: 'Abuja replaced Lagos as capital in 1991.',
  },
  {
    country: 'South Africa',
    capital: 'Pretoria',
    acceptedAliases: ['Pretoria', 'Tshwane'],
    region: 'Southern Africa',
    funFact:
      'South Africa has three capitals, and Pretoria is the executive one.',
  },
  {
    country: 'Tanzania',
    capital: 'Dodoma',
    acceptedAliases: ['Dodoma'],
    region: 'East Africa',
    funFact:
      'Dodoma became the capital in 1974, though Dar es Salaam remains the largest city.',
  },
  {
    country: 'Uganda',
    capital: 'Kampala',
    acceptedAliases: ['Kampala'],
    region: 'East Africa',
    funFact: 'Kampala was built on seven hills, much like Rome.',
  },
  {
    country: 'Ghana',
    capital: 'Accra',
    acceptedAliases: ['Accra'],
    region: 'West Africa',
    funFact:
      "Accra grew from a port settlement into one of West Africa's busiest capitals.",
  },
  {
    country: 'Argentina',
    capital: 'Buenos Aires',
    acceptedAliases: ['Buenos Aires'],
    region: 'South America',
    funFact:
      'Buenos Aires has the widest avenue in the world: Avenida 9 de Julio.',
  },
  {
    country: 'Brazil',
    capital: 'Brasilia',
    acceptedAliases: ['Brasilia', 'Brasilia'],
    region: 'South America',
    funFact: 'Brasilia was built from scratch in just 41 months.',
  },
  {
    country: 'Canada',
    capital: 'Ottawa',
    acceptedAliases: ['Ottawa'],
    region: 'North America',
    funFact:
      "Many people guess Toronto, but Ottawa has been Canada's capital since 1857.",
  },
  {
    country: 'Chile',
    capital: 'Santiago',
    acceptedAliases: ['Santiago'],
    region: 'South America',
    funFact: 'Santiago sits in a valley below the Andes mountains.',
  },
  {
    country: 'Colombia',
    capital: 'Bogota',
    acceptedAliases: ['Bogota', 'Bogota'],
    region: 'South America',
    funFact: 'Bogota is one of the highest capital cities in the world.',
  },
  {
    country: 'Cuba',
    capital: 'Havana',
    acceptedAliases: ['Havana', 'La Habana'],
    region: 'Caribbean',
    funFact:
      'Havana is famous for colorful vintage American cars from the 1950s.',
  },
  {
    country: 'Mexico',
    capital: 'Mexico City',
    acceptedAliases: ['Mexico City', 'Ciudad de Mexico', 'CDMX'],
    region: 'North America',
    funFact: 'Mexico City was built on top of the Aztec capital Tenochtitlan.',
  },
  {
    country: 'Peru',
    capital: 'Lima',
    acceptedAliases: ['Lima'],
    region: 'South America',
    funFact: 'Lima is one of the driest capital cities in the world.',
  },
  {
    country: 'United States',
    capital: 'Washington, D.C.',
    acceptedAliases: [
      'Washington, D.C.',
      'Washington DC',
      'Washington D.C.',
      'Washington',
    ],
    region: 'North America',
    funFact:
      'Washington, D.C. is not in any state because it is a federal district.',
  },
  {
    country: 'Venezuela',
    capital: 'Caracas',
    acceptedAliases: ['Caracas'],
    region: 'South America',
    funFact:
      'Caracas sits in a mountain valley about 900 meters above sea level.',
  },
  {
    country: 'Uruguay',
    capital: 'Montevideo',
    acceptedAliases: ['Montevideo'],
    region: 'South America',
    funFact:
      'Montevideo stretches along a huge natural bay called the Rio de la Plata.',
  },
  {
    country: 'Ecuador',
    capital: 'Quito',
    acceptedAliases: ['Quito'],
    region: 'South America',
    funFact: 'Quito sits very close to the equator and high in the Andes.',
  },
  {
    country: 'Australia',
    capital: 'Canberra',
    acceptedAliases: ['Canberra'],
    region: 'Oceania',
    funFact:
      'Canberra was purpose-built because Sydney and Melbourne could not agree which should be capital.',
  },
  {
    country: 'New Zealand',
    capital: 'Wellington',
    acceptedAliases: ['Wellington'],
    region: 'Oceania',
    funFact: 'Wellington is the southernmost capital of a sovereign state.',
  },
  {
    country: 'Papua New Guinea',
    capital: 'Port Moresby',
    acceptedAliases: ['Port Moresby'],
    region: 'Oceania',
    funFact:
      'Port Moresby sits on the southeast coast of the island of New Guinea.',
  },
  {
    country: 'Fiji',
    capital: 'Suva',
    acceptedAliases: ['Suva'],
    region: 'Oceania',
    funFact:
      'Suva is one of the few capitals in Oceania with a large urban skyline.',
  },
];

export const CAPITALS_BY_COUNTRY = new Map<string, CapitalEntry>(
  CAPITALS_DATA.map((entry) => [entry.country.toLowerCase(), entry])
);

export const CAPITALS_REGIONS = [
  ...new Set(CAPITALS_DATA.map((entry) => entry.region)),
].sort();
