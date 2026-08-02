import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const usersFilePath = path.join(__dirname, 'database_users.json');

// Helper to load users
function loadUsers() {
  try {
    if (fs.existsSync(usersFilePath)) {
      return JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
    }
  } catch (err) {
    console.error('Error loading users database:', err);
  }
  return [
    {
      email: "bruno@baixocusto.com",
      password: "123",
      name: "Bruno Arantes",
      avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80"
    }
  ];
}

// Helper to save users
function saveUsers(users) {
  try {
    fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving users database:', err);
  }
}

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// HTML decode helper
function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'");
}

// Slugify helper
function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

// Function to write contentDatabase back to server.js
function persistDatabase() {
  try {
    const serverFilePath = path.join(__dirname, 'server.js');
    let content = fs.readFileSync(serverFilePath, 'utf8');

    const formattedDb = JSON.stringify(contentDatabase, null, 2);
    
    // Replace contentDatabase array in server.js
    const newContent = content.replace(
      /const contentDatabase = \[[\s\S]+?\];\s*\n\s*let favorites =/,
      `const contentDatabase = ${formattedDb};\n\nlet favorites =`
    );

    fs.writeFileSync(serverFilePath, newContent, 'utf8');
    console.log('[Scraper] Persisted updated database successfully to server.js!');
  } catch (err) {
    console.error('[Scraper] Failed to persist database in server.js:', err);
  }
}

// Scrape logic
async function autoScrapeWarezCdn() {
  console.log('[Scraper] Starting WarezCDN auto-scraper...');
  let newItemsCount = 0;
  
  try {
    const urls = [
      { url: 'https://warezcdn.lat/filmes', category: 'movie' },
      { url: 'https://warezcdn.lat/series', category: 'series' }
    ];

    for (const source of urls) {
      console.log(`[Scraper] Fetching ${source.url}...`);
      const res = await fetch(source.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      if (!res.ok) {
        console.log(`[Scraper] Failed to fetch source ${source.url}: Status ${res.status}`);
        continue;
      }
      const html = await res.text();
      const blocks = html.split('group/card relative w-full');
      
      for (let i = 1; i < blocks.length; i++) {
        const block = blocks[i];
        
        // Title
        const titleMatch = block.match(/<h3[^>]+title="([^"]+)"/);
        let title = titleMatch ? decodeHtmlEntities(titleMatch[1]) : null;
        if (!title) {
          const altMatch = block.match(/alt="([^"]+)"/);
          title = altMatch ? decodeHtmlEntities(altMatch[1]) : null;
        }

        // TMDB ID
        const tmdbMatch = block.match(/data-copy="(\d+)"\s+data-msg="TMDB ID copiado!"/);
        const tmdbId = tmdbMatch ? parseInt(tmdbMatch[1]) : null;

        // Year
        const yearMatch = block.match(/<span>(\d{4})<\/span>/);
        const year = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();

        if (!title || !tmdbId) continue;

        // Check if already exists in contentDatabase
        const exists = contentDatabase.some(item => item.tmdbId === tmdbId);
        if (exists) continue;

        console.log(`[Scraper] Found new item: "${title}" (TMDB ID: ${tmdbId}, ${source.category})`);
        
        // Fetch TMDB images and description
        const tmdbCategory = source.category === 'movie' ? 'movie' : 'tv';
        const tmdbUrl = `https://www.themoviedb.org/${tmdbCategory}/${tmdbId}`;
        let poster = '';
        let banner = '';
        let synopsis = 'Nenhuma sinopse disponível.';
        let genres = ['Lançamento'];

        try {
          const tmdbRes = await fetch(tmdbUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
          });
          if (tmdbRes.ok) {
            const tmdbHtml = await tmdbRes.text();
            
            // Extract images
            const ogImages = tmdbHtml.match(/<meta property="og:image" content="([^"]+)"/g);
            if (ogImages && ogImages.length > 0) {
              const urls = ogImages.map(tag => {
                const match = tag.match(/content="([^"]+)"/);
                return match ? match[1] : null;
              }).filter(Boolean);
              const standardized = urls.map(u => u.replace('media.themoviedb.org', 'image.tmdb.org'));
              poster = standardized[0] ? standardized[0].replace('/w500/', '/w600_and_h900_bestv2/') : '';
              banner = standardized[1] ? standardized[1].replace('/w780/', '/original/').replace('/w500/', '/original/') : poster;
            }

            // Extract synopsis
            const descMatch = tmdbHtml.match(/<meta name="description" content="([^"]+)"/);
            if (descMatch) {
              let rawDesc = decodeHtmlEntities(descMatch[1]);
              rawDesc = rawDesc.replace(' Assista trailers e saiba mais.', '').replace(' Watch trailers & learn more.', '');
              synopsis = rawDesc;
            }

            // Try to extract genres from genre links
            const genreMatches = tmdbHtml.match(/\/genre\/[a-z0-9\-]+/g);
            if (genreMatches && genreMatches.length > 0) {
              const matchedGenres = genreMatches.map(g => {
                const parts = g.split('/');
                const genreSlug = parts[parts.length - 1];
                const genreMap = {
                  'action': 'Ação', 'acao': 'Ação',
                  'adventure': 'Aventura', 'aventura': 'Aventura',
                  'animation': 'Animação', 'animacao': 'Animação',
                  'comedy': 'Comédia', 'comedia': 'Comédia',
                  'crime': 'Crime',
                  'documentary': 'Documentário', 'documentario': 'Documentário',
                  'drama': 'Drama',
                  'family': 'Família', 'familia': 'Família',
                  'fantasy': 'Fantasia', 'fantasia': 'Fantasia',
                  'history': 'História', 'historia': 'História',
                  'horror': 'Terror', 'terror': 'Terror',
                  'music': 'Música', 'musica': 'Música',
                  'mystery': 'Mistério', 'misterio': 'Mistério',
                  'romance': 'Romance',
                  'science-fiction': 'Sci-Fi', 'ficcao-cientifica': 'Sci-Fi',
                  'thriller': 'Suspense', 'suspense': 'Suspense',
                  'war': 'Guerra', 'guerra': 'Guerra',
                  'western': 'Faroeste', 'faroeste': 'Faroeste'
                };
                return genreMap[genreSlug] || genreSlug.charAt(0).toUpperCase() + genreSlug.slice(1);
              });
              genres = [...new Set(matchedGenres)].slice(0, 3);
            }
          }
        } catch (tmdbErr) {
          console.error(`[Scraper] Error fetching TMDB metadata for ID ${tmdbId}:`, tmdbErr.message);
        }

        if (!poster) poster = 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?q=80&w=600';
        if (!banner) banner = 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=1200';

        const trailerUrl = source.category === 'movie' 
          ? `https://warezcdn.lat/filme/${tmdbId}`
          : `https://warezcdn.lat/serie/${tmdbId}/1/1`;

        const newItem = {
          id: `${slugify(title)}-${tmdbId}`,
          title,
          year,
          rating: parseFloat((4.2 + Math.random() * 0.7).toFixed(1)),
          duration: source.category === 'movie' ? '1h 55m' : '1 Temporada',
          genres,
          tmdbId,
          synopsis,
          category: source.category,
          poster,
          banner,
          isRelease: true,
          isPopular: false,
          isClassic: false,
          trailerUrl,
          cast: [
            {
              name: "Principal",
              character: "Protagonista",
              image: "https://image.tmdb.org/t/p/w200/Boyd.jpg"
            }
          ]
        };

        contentDatabase.unshift(newItem);
        newItemsCount++;
      }
    }

    if (newItemsCount > 0) {
      console.log(`[Scraper] Found and added ${newItemsCount} new items to contentDatabase.`);
      persistDatabase();
    } else {
      console.log('[Scraper] No new items found to add.');
    }
  } catch (err) {
    console.error('[Scraper] Scraper execution failed:', err);
  }

  return newItemsCount;
}

// Premium Cinematic Content Database (Baixo Custo)
const contentDatabase = [
  {
    "id": "a-odisseia-2026",
    "title": "A Odisseia",
    "year": 2026,
    "rating": 5.0,
    "duration": "2h 45m",
    "genres": ["Ação", "Aventura", "Fantasia", "Drama"],
    "tmdbId": 109091,
    "synopsis": "Um filme de Christopher Nolan. A épica e monumental reconstituição histórica da Guerra de Tróia e da lendária travessia de Odisseus através de águas desconhecidas, enfrentando o Cavalo de Tróia e forças mitológicas imponentes.",
    "category": "movie",
    "poster": "/a_odisseia_nolan.png",
    "banner": "/a_odisseia_nolan.png",
    "isRelease": true,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/533535",
    "cast": [
      {
        "name": "Christopher Nolan",
        "character": "Diretor",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "gladiador-ii-558449",
    "title": "Gladiador II",
    "year": 2026,
    "rating": 4.8,
    "duration": "2h 28m",
    "genres": ["Ação", "Aventura", "Drama"],
    "tmdbId": 926393,
    "synopsis": "Anos após testemunhar a morte de Maximus às mãos de seu tio, Lucius é forçado a entrar no Coliseu depois que sua casa é conquistada pelos imperadores tirânicos de Roma.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/342bly9MqveL65TnEFzx8TTUxcL.jpg",
    "banner": "https://image.tmdb.org/t/p/original/342bly9MqveL65TnEFzx8TTUxcL.jpg",
    "isRelease": true,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/558449",
    "cast": [
      {
        "name": "Paul Mescal",
        "character": "Lucius Verus",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      },
      {
        "name": "Denzel Washington",
        "character": "Macrinus",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "deadpool-and-wolverine-533535",
    "title": "Deadpool & Wolverine",
    "year": 2026,
    "rating": 4.9,
    "duration": "2h 08m",
    "genres": ["Ação", "Comédia", "Sci-Fi"],
    "tmdbId": 533535,
    "synopsis": "Wade Wilson lida com a apatia em sua vida profissional até que a Autoridade de Variância Temporal o recruta para uma missão épica ao lado do icônico e relutante Wolverine.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/cJFqqiDYprqExaXatu4AaoMzDG2.jpg",
    "banner": "https://image.tmdb.org/t/p/original/by8z9Fe8y7p4jo2YlW2SZDnptyT.jpg",
    "isRelease": true,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/533535",
    "cast": [
      {
        "name": "Ryan Reynolds",
        "character": "Wade Wilson / Deadpool",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      },
      {
        "name": "Hugh Jackman",
        "character": "Logan / Wolverine",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "creed-iii-677179",
    "title": "Creed III",
    "year": 2026,
    "rating": 4.7,
    "duration": "1h 56m",
    "genres": ["Drama", "Ação"],
    "tmdbId": 677179,
    "synopsis": "Após dominar o mundo do boxe, Adonis Creed prospera em sua carreira e vida familiar. Quando um amigo de infância e prodígio do boxe reaparece após cumprir pena na prisão, o confronto entre ex-amigos é inevitável.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/kLgmZVrRVY41FWCCidi9IqmM473.jpg",
    "banner": "https://image.tmdb.org/t/p/original/gOIztYywR291pC4k3IpDq7Vj3Kj.jpg",
    "isRelease": true,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/677179",
    "cast": [
      {
        "name": "Michael B. Jordan",
        "character": "Adonis Creed",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      },
      {
        "name": "Jonathan Majors",
        "character": "Damian Anderson",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "o-mentalista-5920",
    "title": "O Mentalista",
    "year": 2015,
    "rating": 4.9,
    "duration": "7 Temporadas",
    "genres": ["Crime", "Drama", "Mistério"],
    "tmdbId": 5920,
    "synopsis": "Patrick Jane é um consultor independente da Agência de Investigação da Califórnia (CBI) que possui uma capacidade incrível de observação e dedução, ajudando a resolver os crimes mais complexos enquanto busca vingança contra o assassino Red John.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/d1ZcT5tHzUeQ7zgYecOVoWxH9FL.jpg",
    "banner": "https://image.tmdb.org/t/p/original/q3pCsNvJ7CmdJUz2sJEEUY3pOPC.jpg",
    "isRelease": false,
    "isPopular": true,
    "isClassic": true,
    "trailerUrl": "https://warezcdn.lat/serie/5920/1/1",
    "cast": [
      {
        "name": "Simon Baker",
        "character": "Patrick Jane",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "dexter-1405",
    "title": "Dexter",
    "year": 2021,
    "rating": 4.9,
    "duration": "8 Temporadas",
    "genres": ["Crime", "Drama", "Suspense"],
    "tmdbId": 1405,
    "synopsis": "Dexter Morgan é um analista forense de manchas de sangue do Departamento de Polícia de Miami. Ele esconde um segredo terrível: é um serial killer com um código de conduta rígido, matando apenas criminosos que escaparam da justiça.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/f1nV5NBIFwfQLw5g8FVrdt90FAy.jpg",
    "banner": "https://image.tmdb.org/t/p/original/aSGSxGMTP893DPMCvMl9AdnEICE.jpg",
    "isRelease": false,
    "isPopular": true,
    "isClassic": true,
    "trailerUrl": "https://warezcdn.lat/serie/1405/1/1",
    "cast": [
      {
        "name": "Michael C. Hall",
        "character": "Dexter Morgan",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "rocky-um-lutador-1366",
    "title": "Rocky: Um Lutador",
    "year": 1976,
    "rating": 4.9,
    "duration": "2h 00m",
    "genres": ["Drama", "Ação"],
    "tmdbId": 1366,
    "synopsis": "Rocky Balboa, um lutador de boxe de uma pequena academia da Filadélfia, recebe a chance da sua vida: lutar contra o campeão mundial dos pesos-pesados, Apollo Creed.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/b9B1DXcPNsJfTtc4x2LKA3bykoJ.jpg",
    "banner": "https://image.tmdb.org/t/p/original/bacOuUnRBoAO1NjMfsAGX2EKRrS.jpg",
    "isRelease": false,
    "isPopular": true,
    "isClassic": true,
    "trailerUrl": "https://warezcdn.lat/filme/1366",
    "cast": [
      {
        "name": "Sylvester Stallone",
        "character": "Rocky Balboa",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "creed-nascido-para-lutar-312221",
    "title": "Creed: Nascido para Lutar",
    "year": 2015,
    "rating": 4.8,
    "duration": "2h 13m",
    "genres": ["Drama", "Ação"],
    "tmdbId": 312221,
    "synopsis": "Adonis Johnson nunca conheceu seu pai famoso, o campeão mundial dos pesos-pesados Apollo Creed. Determinado a seguir a carreira de boxeador, ele viaja para a Filadélfia para convencer Rocky Balboa a ser seu treinador.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/jBXLirZNzEoIwrQb6hBaiJ3Jcrv.jpg",
    "banner": "https://image.tmdb.org/t/p/original/kODNw6GJNdgldUMEhKPlCw8wQCr.jpg",
    "isRelease": false,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/312221",
    "cast": [
      {
        "name": "Michael B. Jordan",
        "character": "Adonis Creed",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "peaky-blinders-60574",
    "title": "Peaky Blinders",
    "year": 2022,
    "rating": 4.9,
    "duration": "6 Temporadas",
    "genres": ["Crime", "Drama"],
    "tmdbId": 60574,
    "synopsis": "Em Birmingham, na Inglaterra, uma notória gangue da família Shelby domina as ruas após a Primeira Guerra Mundial, liderada pelo implacável Thomas Shelby.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/i0uajcHH9yogXMfDHpOXexIukG9.jpg",
    "banner": "https://image.tmdb.org/t/p/original/dzq83RHwQcnP6WGJ6YkenIqeaa5.jpg",
    "isRelease": false,
    "isPopular": true,
    "isClassic": true,
    "trailerUrl": "https://warezcdn.lat/serie/60574/1/1",
    "cast": [
      {
        "name": "Cillian Murphy",
        "character": "Thomas Shelby",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "prison-break-2288",
    "title": "Prison Break",
    "year": 2017,
    "rating": 4.9,
    "duration": "5 Temporadas",
    "genres": ["Ação", "Crime", "Drama"],
    "tmdbId": 2288,
    "synopsis": "Devido a uma conspiração política, um homem inocente é condenado à morte. Seu único raio de esperança é seu irmão, Michael Scofield, que deliberadamente se faz prender para ajudá-lo a escapar de dentro da prisão de segurança máxima Fox River.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/rK3Vwe0Wm0VXxf4IJCdlHeEREYx.jpg",
    "banner": "https://image.tmdb.org/t/p/original/n3Brk7roueE9HOwVmYlJx5j462g.jpg",
    "isRelease": false,
    "isPopular": true,
    "isClassic": true,
    "trailerUrl": "https://warezcdn.lat/serie/2288/1/1",
    "cast": [
      {
        "name": "Wentworth Miller",
        "character": "Michael Scofield",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },

  {
    "id": "aula-de-assassinato-325622",
    "title": "Aula de Assassinato",
    "year": 2026,
    "rating": 4.5,
    "duration": "1 Temporada",
    "genres": [
      "99-documentary",
      "80-crime"
    ],
    "tmdbId": 325622,
    "synopsis": "Das mentes por trás do podcast de mesmo nome e da trilogia do Homem-Aranha da Marvel, chega uma série documental revolucionária. Uma mistura de drama adolescente, aula e investigação criminal eletrizante, \"Aula de Assassinato\" acompanha uma turma de sociologia do ensino médio no interior do Tennessee que ajuda a reabrir um caso de décadas através de uma caçada a um assassino.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/aXZduHzTSH9uDJqzy6T6oHikfEB.jpg",
    "banner": "https://image.tmdb.org/t/p/original/j3Unn0ynJIWrsmWMcPA4mBIk3Qf.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/325622/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "a-mulher-do-banker-274782",
    "title": "A Mulher do Banker",
    "year": 2024,
    "rating": 4.3,
    "duration": "1 Temporada",
    "genres": [
      "99-documentary",
      "80-crime"
    ],
    "tmdbId": 274782,
    "synopsis": "Anos após ser sequestrada e presa em um bunker, Isabel Eriksson enfrenta seu trauma ao revisitar os eventos que mudaram sua vida para sempre.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/kzAQIgjpsVVqOdq73oqIZOMD8PH.jpg",
    "banner": "https://image.tmdb.org/t/p/original/kVDmJCRhRLMQXkaE0f0Am7QsWyE.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/274782/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "gaddar-sem-piedade-240798",
    "title": "Gaddar: Sem Piedade",
    "year": 2024,
    "rating": 4.3,
    "duration": "1 Temporada",
    "genres": [
      "18-drama"
    ],
    "tmdbId": 240798,
    "synopsis": "Dağhan (Çağatay Ulusoy,) volta para casa após um longo período no exército, e descobre que sua vida não será mais a mesma. A garota que ama, Aydan, se foi sem avisar. Seu irmão, Rüzgar, caiu em um mundo sombrio... ( A série contará a história de Dağhan se tornando uma pessoa cruel depois que sua vida virou de cabeça para Baixo.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/tjIceWOX4MGWDtzgTSErefBfMzv.jpg",
    "banner": "https://image.tmdb.org/t/p/original/iorQMHjNxOnkqsj7hMdSwDJCjde.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/240798/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "stories-da-mansao-258518",
    "title": "Stories da Mansão",
    "year": 2024,
    "rating": 4.4,
    "duration": "1 Temporada",
    "genres": [
      "35-comedy",
      "10764-reality"
    ],
    "tmdbId": 258518,
    "synopsis": "Carlinhos Maia se muda para SP e leva seus amigos para a nova mansão. A cada episódio, eles recebem uma missão, tornando a vida do influenciador ainda mais caótica.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/36Qr4X2BsCSk14JfWt1vNG8RrA2.jpg",
    "banner": "https://image.tmdb.org/t/p/original/lVYTPipu0R2l04Oxl2bD0gTSz22.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/258518/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "taste-the-nation-with-padma-lakshmi-104201",
    "title": "Taste the Nation with Padma Lakshmi",
    "year": 2020,
    "rating": 4.2,
    "duration": "1 Temporada",
    "genres": [
      "10764-reality"
    ],
    "tmdbId": 104201,
    "synopsis": "A premiada autora de livros de receitas, apresentadora e produtora executiva Padma Lakshmi, leva o público em uma viagem pelos Estados Unidos, explorando a rica e diversificada cultura alimentar de vários grupos de imigrantes, procurando pessoas que influenciaram fortemente o que é a comida americana hoje.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/8IQSs2FZ2YxI9S6xk6k0VKxjfTm.jpg",
    "banner": "https://image.tmdb.org/t/p/original/jHXCvrLya8G7U4P2pH0tsFjVSZi.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/104201/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "tempestades-implacaveis-105055",
    "title": "Tempestades Implacáveis",
    "year": 2020,
    "rating": 4.3,
    "duration": "1 Temporada",
    "genres": [
      "99-documentary"
    ],
    "tmdbId": 105055,
    "synopsis": "Veja as tempestades mais devastadoras e suas consequências.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/vZVJhbDNQqqujq6CB0uYBNszbwN.jpg",
    "banner": "https://image.tmdb.org/t/p/original/zjwVqXdiJQoTyGrD1oJovPBC07H.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/105055/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "meu-nome-e-preta-329383",
    "title": "Meu Nome é Preta",
    "year": 2026,
    "rating": 4.3,
    "duration": "1 Temporada",
    "genres": [
      "99-documentary"
    ],
    "tmdbId": 329383,
    "synopsis": "A série oferece uma visão íntima da vida de Preta Gil. Por meio da perspectiva da artista e de imagens de arquivo exclusivas, ele revela as muitas facetas que moldaram sua jornada pessoal e carreira.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/2f6e3MdT7GVTK8eSyJumllTIq9p.jpg",
    "banner": "https://image.tmdb.org/t/p/original/iYUf7mU6HDlIQLZ2Mzm5LeUW2Vf.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/329383/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "unidade-de-elite-gign-281281",
    "title": "Unidade de Elite GIGN",
    "year": 2026,
    "rating": 4.5,
    "duration": "1 Temporada",
    "genres": [
      "10759-action-adventure",
      "80-crime",
      "18-drama"
    ],
    "tmdbId": 281281,
    "synopsis": "Depois de um ataque sem precedentes contra sua unidade, um oficial prestes a se aposentar lidera uma missão perigosa e precisa confrontar o passado.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/gOMeaNpXAu4hE7iowA9LD5eSHX0.jpg",
    "banner": "https://image.tmdb.org/t/p/original/tMpfa73LmKpeZ3Fix1QmFGIUrKI.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/281281/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "jogada-de-risco-299188",
    "title": "Jogada de Risco",
    "year": 2026,
    "rating": 4.7,
    "duration": "1 Temporada",
    "genres": [
      "18-drama"
    ],
    "tmdbId": 299188,
    "synopsis": "Mauricio é um ex-jogador que tenta se firmar como agente no milionário mercado do futebol . Em sua nova trajetória, ele precisa lidar com o fantasma do seu fracasso como jogador e com a relação conturbada com o pai.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/iEcju8TBN5jmZswIpQXV5YTJB9L.jpg",
    "banner": "https://image.tmdb.org/t/p/original/swmZEoWpW7tBhaIszLtIE8rgQkO.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/299188/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "anos-90-a-explosao-do-pagode-327760",
    "title": "Anos 90: A Explosão do Pagode",
    "year": 2026,
    "rating": 4.8,
    "duration": "1 Temporada",
    "genres": [
      "99-documentary"
    ],
    "tmdbId": 327760,
    "synopsis": "Série resgata a história do pagode dos anos 90, que surgiu na periferia e conquistou o Brasil, a partir de depoimentos inéditos de alguns ícones do gênero.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/hCKbkQUpAKFd049tqakIt7Rd5Dg.jpg",
    "banner": "https://image.tmdb.org/t/p/original/zMj1VQw9tTYrMNlHcmFbK196qQv.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/327760/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "amor-em-ruinas-295099",
    "title": "Amor em Ruínas",
    "year": 2026,
    "rating": 4.4,
    "duration": "1 Temporada",
    "genres": [
      "10766-soap",
      "18-drama"
    ],
    "tmdbId": 295099,
    "synopsis": "Será que conhecemos o verdadeiro amor? Gomer, uma mulher de prostituições, não o conhece, mas intimamente o deseja. De outro lado, o profeta Oseias, recebe a dura missão de amar aquela que é o oposto de tudo o que ele crê. Em um romance distante do ideal, quando tudo desmoronar, pode este amor permanecer?",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/LevsRifthKTYSuuCmI6A17k6HM.jpg",
    "banner": "https://image.tmdb.org/t/p/original/cJpPIBcvHZDQ2dlvnWVCn82Hznx.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/295099/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "como-virar-um-cowboy-132012",
    "title": "Como Virar um Cowboy",
    "year": 2021,
    "rating": 4.8,
    "duration": "1 Temporada",
    "genres": [
      "10764-reality"
    ],
    "tmdbId": 132012,
    "synopsis": "Dale Brisby usa as redes sociais e as habilidades de rodeio para manter vivas as tradições de caubói — e, de quebra, ensina ao mundo como montar.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/iI8FdyODT9b6ydXfPLTYaPVko5i.jpg",
    "banner": "https://image.tmdb.org/t/p/original/lWcRwNF4ekO54AYkBghkX6Jizms.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/132012/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "o-pai-da-minha-filha-329394",
    "title": "O Pai da Minha Filha",
    "year": 2026,
    "rating": 4.5,
    "duration": "1 Temporada",
    "genres": [
      "18-drama"
    ],
    "tmdbId": 329394,
    "synopsis": "Dedicada e determinada, Maca luta para manter a família unida quando percebe que um erro do passado pode ser a única forma de salvar sua filha, que está muito doente.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/9oSHbsE4gbnvzpvYMEtv886YCBt.jpg",
    "banner": "https://image.tmdb.org/t/p/original/aQFeADnhJimn635owevcpwyaUAG.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/329394/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "pearl-harbor-minuto-a-minuto-139132",
    "title": "Pearl Harbor: Minuto a Minuto",
    "year": 2021,
    "rating": 4.5,
    "duration": "1 Temporada",
    "genres": [
      "99-documentary",
      "18-drama",
      "80-crime"
    ],
    "tmdbId": 139132,
    "synopsis": "Esta emocionante série histórica aprofunda-se no dia fatídico que mudou o curso da Segunda Guerra Mundial, mostrando os navios e as vidas que foram perdidos. Cada episódio cobre uma parte diferente da linha do tempo para contar a história do ataque japonês que mudou o mundo para sempre, juntando as peças deste evento complexo.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/4HoFB4MTXqUeHT2R26XMGtjG5if.jpg",
    "banner": "https://image.tmdb.org/t/p/original/zjCZT73hS0kEMiVlUrCtrrbYU9o.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/139132/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "sabores-extremos-com-gordon-ramsay-aventuras-extremas-205239",
    "title": "Sabores Extremos com Gordon Ramsay: Aventuras Extremas",
    "year": 2022,
    "rating": 4.6,
    "duration": "1 Temporada",
    "genres": [
      "10764-reality"
    ],
    "tmdbId": 205239,
    "synopsis": "Gordon enfrenta  os chefs britânicos Paul Ainsworth e Matt Waldron e sua filha na Costa Rica para ganhar o apoio dos locais em três desafios épicos.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/a6GVT4Y0trqWaI4L4cOMqv8cbnU.jpg",
    "banner": "https://image.tmdb.org/t/p/original/3DxjacEjD3WlFZp76dGUuT88FJi.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/205239/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "sou-luna-de-volta-a-pista-324434",
    "title": "Sou Luna: De Volta à Pista",
    "year": 2026,
    "rating": 4.7,
    "duration": "1 Temporada",
    "genres": [
      "10751-family",
      "35-comedy",
      "18-drama"
    ],
    "tmdbId": 324434,
    "synopsis": "Depois de um acidente que a afastou das pistas, Luna regressa ao seu querido Jam & Roller. Voltar a calçar os patins não será fácil, sobretudo quando o plano de um misterioso vilão começa a complicar a sua vida. Dividida entre antigos amores, Luna terá de enfrentar vários desafios. Entre canções, aventuras e reencontros, fará de tudo para concretizar o seu sonho.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/zgBu2yOtE2Swc4ZyR4djiau0Dpg.jpg",
    "banner": "https://image.tmdb.org/t/p/original/bATlRn3qaRgx49C6DkPCe8poU02.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/324434/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "furia-287238",
    "title": "Fúria",
    "year": 2026,
    "rating": 4.4,
    "duration": "1 Temporada",
    "genres": [
      "18-drama",
      "80-crime"
    ],
    "tmdbId": 287238,
    "synopsis": "A agente do FBI Alice Black está à caça de uma misteriosa e calculista assassina em série. Ambas trilham caminhos distintos em busca de justiça, e à medida que suas vidas começam a se entrelaçar, a linha entre o certo e o errado se torna cada vez mais tênue.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/o5rdLGzKH359Kh74KXbF9Acnv4n.jpg",
    "banner": "https://image.tmdb.org/t/p/original/iAOPgUlh7inOebFrUFHAjnFRCGS.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/287238/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "coppers-justica-implacavel-65460",
    "title": "Coppers: Justiça Implacável",
    "year": 2016,
    "rating": 4.4,
    "duration": "1 Temporada",
    "genres": [
      "18-drama",
      "80-crime"
    ],
    "tmdbId": 65460,
    "synopsis": "A polícia federal busca justiça em um mundo onde a lei e a realidade geralmente se chocam, com grandes fraudadores ficando livres, enquanto pequenos ladrões enfrentam punições severas devido a injustiças sistêmicas.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/gWA4QqyplBE6ktJvr3TjEoGTJv4.jpg",
    "banner": "https://image.tmdb.org/t/p/original/1YnjCEX8Fnfz4sgWv7mNGuB9JI9.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/65460/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "de-volta-pra-pista-80259",
    "title": "De Volta pra Pista",
    "year": 2013,
    "rating": 4.4,
    "duration": "1 Temporada",
    "genres": [
      "35-comedy"
    ],
    "tmdbId": 80259,
    "synopsis": "Recently-divorced woman gets back in the dating game.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/rpf7ybSZuqFWpwbxzD8dRIyiqO.jpg",
    "banner": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/rpf7ybSZuqFWpwbxzD8dRIyiqO.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/80259/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "sobreviva-se-puder-61616",
    "title": "Sobreviva, se Puder",
    "year": 2013,
    "rating": 4.3,
    "duration": "1 Temporada",
    "genres": [
      "10764-reality"
    ],
    "tmdbId": 61616,
    "synopsis": "Cinco especialistas em sobrevivência e amigos enviam uns aos outros para ambientes hostis com apenas 100 horas para encontrar a civilização - e eles não têm ideia de quando serão levados para lá.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/j9w3iF6BygWrZl7cefCpqGyb9yA.jpg",
    "banner": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/j9w3iF6BygWrZl7cefCpqGyb9yA.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/61616/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "breakthrough-bem-vindo-ao-futuro-64220",
    "title": "Breakthrough: Bem-Vindo ao Futuro",
    "year": 2015,
    "rating": 4.5,
    "duration": "1 Temporada",
    "genres": [
      "99-documentary"
    ],
    "tmdbId": 64220,
    "synopsis": "Fornecendo uma perspectiva instigante e imaginativa sobre a descoberta científica à medida que se desenrola, cada episódio segue exploradores científicos trabalhando em projetos de ponta com potencial inovador, revelando o mundo de amanhã ... hoje.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/epoHwwoT4VAxOcSEUqjEFNeyQLh.jpg",
    "banner": "https://image.tmdb.org/t/p/original/iPdN90F3DmRUdC7eMZ57OLInIV2.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/64220/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "critical-role-the-mighty-nein-297772",
    "title": "Critical Role: The Mighty Nein",
    "year": 2018,
    "rating": 4.7,
    "duration": "1 Temporada",
    "genres": [
      "10759-action-adventure",
      "10765-sci-fi-fantasy"
    ],
    "tmdbId": 297772,
    "synopsis": "Set in the magical world of Exandria, on the continent of Wildemount, Critical Role's Mighty Nein campaign is the story of a group of motley and chaotic adventurers who find themselves caught in the middle of a war between two nations.\n\nNOTE: This differs from 254002-critical-role/season/2 as this version has separate seasons for each arc of the campaign",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/485htmZIOsOEjeHLR0IBFdQFNwX.jpg",
    "banner": "https://image.tmdb.org/t/p/original/d8urJJdcho3uI5Vw3PzsR2DMsKk.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/297772/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "a-batalha-dos-100-cozinheiros-322785",
    "title": "A Batalha dos 100 Cozinheiros",
    "year": 2026,
    "rating": 4.4,
    "duration": "1 Temporada",
    "genres": [
      "10764-reality"
    ],
    "tmdbId": 322785,
    "synopsis": "Apresentado por Terry Crews, reúne 100 cozinheiros amadores em uma competição culinária caótica e imprevisível.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/n1AMcuCgGgXSokKOmYJ5cv1k8n6.jpg",
    "banner": "https://image.tmdb.org/t/p/original/zjF3gLeQIUFaHKpVyofdvOSKkyY.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/322785/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "quem-matou-otto-mueller-209835",
    "title": "Quem Matou Otto Mueller?",
    "year": 2022,
    "rating": 4.3,
    "duration": "1 Temporada",
    "genres": [
      "18-drama",
      "9648-mystery"
    ],
    "tmdbId": 209835,
    "synopsis": "Quando o lendário empresário e ex-campeão soviético de luta livre Otto Mueller é baleado em seu casarão no seu 65º aniversário, oito membros da família estão presentes. Cada um deles tem um motivo diferente.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/vi2mcR0TpAAUN6CEvaMwRMuj2Uw.jpg",
    "banner": "https://image.tmdb.org/t/p/original/ppEpn3z1h73F21NVG6qKRjojZhT.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/209835/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "paradise-o-podcast-oficial-318419",
    "title": "Paradise: O Podcast Oficial",
    "year": 2026,
    "rating": 4.6,
    "duration": "1 Temporada",
    "genres": [
      "10767-talk"
    ],
    "tmdbId": 318419,
    "synopsis": "A atriz e superfã Ryan Michelle Bathé conversa com o elenco e a equipe por trás da fascinante segunda temporada. O papo inclui desde as maiores estrelas da série, como o marido dela, Sterling K. Brown, até o criador Dan Fogelman e muito mais.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/3btPk5vUs9waWKSPTYwGefmKMKg.jpg",
    "banner": "https://image.tmdb.org/t/p/original/fOlkNsfC4SjAn2Yb3zVL0iYGzEJ.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/318419/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "os-assassinatos-de-idaho-pesadelo-universitario-328735",
    "title": "Os Assassinatos de Idaho: Pesadelo Universitário",
    "year": 2026,
    "rating": 4.4,
    "duration": "1 Temporada",
    "genres": [
      "99-documentary",
      "80-crime"
    ],
    "tmdbId": 328735,
    "synopsis": "Com imagens de câmeras corporais, mensagens e entrevistas, este documentário investiga o terrível assassinato de quatro estudantes da Universidade de Idaho.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/2Fjgxlv2ishFAaYYZLa6jccswbq.jpg",
    "banner": "https://image.tmdb.org/t/p/original/1BosXOwTUudCrE77ayEJSROW8sL.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/328735/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "musafir-cafe-313101",
    "title": "Musafir Cafe",
    "year": 2026,
    "rating": 4.6,
    "duration": "1 Temporada",
    "genres": [
      "18-drama"
    ],
    "tmdbId": 313101,
    "synopsis": "Chander e Sudha têm uma ligação inegável, mas o destino faz questão de separá-los. Este breve amor inspira a jornada de Chander rumo ao Musafir Café.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/1SbKjtoRKIpVQG5iYnumnfQIqhd.jpg",
    "banner": "https://image.tmdb.org/t/p/original/mQFlpu6IH7dRIjLYZbflzn4H6uV.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/313101/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "marbella-242008",
    "title": "Marbella",
    "year": 2024,
    "rating": 4.3,
    "duration": "1 Temporada",
    "genres": [
      "18-drama",
      "80-crime"
    ],
    "tmdbId": 242008,
    "synopsis": "César é um advogado bem-sucedido que vive em Marbella. Bonito, rico, hedonista, ambicioso e viciado em redes sociais, ele divide seu tempo entre os tribunais e as festas, sempre acompanhado de sua parceira, Katy. Ele acredita em ser amigo de todos e evitar conflitos, até que vai parar no olho do furacão e precisa de um advogado para salvá-lo.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/u2w6pfPNaK6OxICsrtS6MVLOjpV.jpg",
    "banner": "https://image.tmdb.org/t/p/original/frKXX8EFIJBgAMYG6l4QDqc6UOZ.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/242008/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "diarra-de-detroit-247796",
    "title": "Diarra de Detroit",
    "year": 2024,
    "rating": 4.6,
    "duration": "1 Temporada",
    "genres": [
      "18-drama",
      "35-comedy"
    ],
    "tmdbId": 247796,
    "synopsis": "Após ser deixada pelo ficante do Tinder após o divórcio, uma professora se recusa a aceitar o ghosting e acaba envolvida em um antigo mistério ligado ao crime em Detroit.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/82h6c3yOXvaty7s0VNIFV8Fc3We.jpg",
    "banner": "https://image.tmdb.org/t/p/original/5PeE8xPnIXOW2Nv1NreXGIcJFX9.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/247796/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "projeto-final-327814",
    "title": "Projeto Final",
    "year": 2026,
    "rating": 4.6,
    "duration": "1 Temporada",
    "genres": [
      "18-drama"
    ],
    "tmdbId": 327814,
    "synopsis": "Nova escola, novo começo. Até que graves ataques online e um desafio sugerido por um colega de turma geram uma ligação perigosa que leva Tamara à transformação.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/hPA7xadxW24SqT2GKIkbbZYBR6I.jpg",
    "banner": "https://image.tmdb.org/t/p/original/rc3Jy6sWFt7PDVGFqLjvo7tle13.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/327814/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "casa-de-stassi-schroeder-321954",
    "title": "Casa de Stassi Schroeder",
    "year": 2026,
    "rating": 4.4,
    "duration": "1 Temporada",
    "genres": [
      "10764-reality"
    ],
    "tmdbId": 321954,
    "synopsis": "Schroeder está voltando aos holofotes para redefinir seu lugar na cultura pop - mas se manter no topo significa confrontar os fantasmas do passado e um círculo íntimo caótico com talento para desestabilizar sua vida.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/ozKN9Y26mRMKtkR4ZC42XxiAcm8.jpg",
    "banner": "https://image.tmdb.org/t/p/original/erQMAciH0j7iZgr5IDxU52I9R4u.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/321954/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "the-five-star-weekend-283151",
    "title": "The Five Star Weekend",
    "year": 2026,
    "rating": 4.7,
    "duration": "1 Temporada",
    "genres": [
      "18-drama"
    ],
    "tmdbId": 283151,
    "synopsis": "After her husband's unexpected death and a very public breakdown, famed cook Hollis hosts her best friends for an elaborate weekend on Nantucket.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/l9z65nDVteL88PmwDqyiTFmxCtF.jpg",
    "banner": "https://image.tmdb.org/t/p/original/lq2aJdPlyOo11aBwojmLvGjlJS1.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/283151/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "a-mulher-proibida-330129",
    "title": "A Mulher Proibida",
    "year": 2026,
    "rating": 4.4,
    "duration": "1 Temporada",
    "genres": [
      "18-drama",
      "10766-soap"
    ],
    "tmdbId": 330129,
    "synopsis": "Após ser salva da morte por um cantor famoso, a esposa de um político se envolve em uma história de amor proibido, corrupção e poder.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/6yI1f9qk1aaW16f6EkIPi73HXaS.jpg",
    "banner": "https://image.tmdb.org/t/p/original/fryb5WlhnUHEVJebsdnlvQV2zn9.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/330129/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "emergencia-animal-106894",
    "title": "Emergência Animal",
    "year": 2018,
    "rating": 4.3,
    "duration": "1 Temporada",
    "genres": [
      "99-documentary"
    ],
    "tmdbId": 106894,
    "synopsis": "A extraordinária equipe da Humane Society arrisca suas vidas e dá seus corações para salvar todos os animais, grandes e pequenos.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/dFjk3w8OJyLi33A6uHqCttd0wbP.jpg",
    "banner": "https://image.tmdb.org/t/p/original/1mPpsWdKRzZqUUom9CHgfRd6jm8.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/106894/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "a-bahia-me-fez-assim-1459709",
    "title": "A Bahia Me Fez Assim",
    "year": 2025,
    "rating": 4.3,
    "duration": "1h 55m",
    "genres": [
      "Lançamento"
    ],
    "tmdbId": 1459709,
    "synopsis": "O documentário musical A Bahia Me Fez Assim (2024) apresenta encontros entre artistas baianos de diferentes gerações e acompanha seus processos criativos de releitura de composições clássicas da Bahia. Com direção de Sérgio Machado e direção musical de Alê Siqueira, o filme conta com as participações de Rachel Reis, Afrocidade, Iuri Passos, Larissa Luz, Attooxxa, Ganhadeiras de Itapuã, Yayá Muxima, Tiganá Santana, Ilê Aiyê, Ivan Sacerdote, Orkestra Rumpilezz, Coletivo Rumpilezzinho, Xênia França e Melly.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/lLgRVHa0zk80ccdOosBJD5ndNFk.jpg",
    "banner": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/lLgRVHa0zk80ccdOosBJD5ndNFk.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1459709",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "a-vida-secreta-de-kika-1313226",
    "title": "A Vida Secreta de Kika",
    "year": 2025,
    "rating": 4.2,
    "duration": "1h 55m",
    "genres": [
      "18-drama",
      "35-comedy"
    ],
    "tmdbId": 1313226,
    "synopsis": "Cannes 2025: Semana da Crítica. Grávida de sua segunda filha e sem nenhum tostão, Kika precisa se virar. Entre calcinhas usadas, vibradores e fetiches bizarros, ela encontra um jeito improvável de seguir em frente.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/Acd3fBHhUDs3av8fkQPB8OhaTiG.jpg",
    "banner": "https://image.tmdb.org/t/p/original/6q3gGVYj36im8OswF80CdsFH6BC.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1313226",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "o-brasil-evangelico-1702607",
    "title": "O Brasil Evangélico",
    "year": 2026,
    "rating": 4.2,
    "duration": "1h 55m",
    "genres": [
      "99-documentary"
    ],
    "tmdbId": 1702607,
    "synopsis": "1990, os evangélicos representavam menos de dez por cento no Brasil. Hoje, já são quase cinquenta milhões de brasileiros. O que explica esse crescimento tão acelerado? Como uma fé que começou pequena se tornou uma das maiores forças religiosas, sociais e políticas do Brasil? Entrevistamos pastores de diferentes denominações para entender o crescimento evangélico no país, sua presença nas comunidades, os desafios enfrentados pelos fiéis e o impacto desse movimento na vida pública brasileira.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/qILFLftThKcjhtVVdUqrbvMxQI.jpg",
    "banner": "https://image.tmdb.org/t/p/original/nval7lIUXvPuui50gWF07Tg1ecc.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1702607",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "apenas-coisas-boas-1427595",
    "title": "Apenas Coisas Boas",
    "year": 2025,
    "rating": 4.3,
    "duration": "1h 55m",
    "genres": [
      "10749-romance",
      "18-drama"
    ],
    "tmdbId": 1427595,
    "synopsis": "Antonio vive sozinho e isolado cuidando dos afazeres de sua pequena fazenda até o dia em que seu destino cruza com o de Marcelo, um motoqueiro solitário que sofre um acidente atravessando a região. Antonio cuida das feridas de Marcelo. Os dois se apaixonam e vivem uma história que transforma, desestabiliza e provoca rupturas em cada um deles.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/rNvMecoJPrzfQo8yngbB2zLb6ZV.jpg",
    "banner": "https://image.tmdb.org/t/p/original/1XHIIH2bLETZt4fhHCBA4O5TwPi.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1427595",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "desejo-1668364",
    "title": "Desejo",
    "year": 2026,
    "rating": 4.2,
    "duration": "1h 55m",
    "genres": [
      "9648-mystery",
      "18-drama"
    ],
    "tmdbId": 1668364,
    "synopsis": "A vida de Lucero parece impecável: um lar abastado, um marido dedicado e dois filhos que personificam a promessa de uma família perfeita. No entanto, sob essa superfície, fermenta uma insatisfação silenciosa. Quando Matías, um jovem treinador de natação contratado pelo marido, entra em suas vidas, Lucero vê-se envolvida em um relacionamento arriscado e avassalador. À medida que o segredo, o desejo e o ciúme apertam o cerco, as fronteiras familiares começam a ruir, colocando mãe e filha em um perigoso triângulo emocional que ameaça destruir tudo o que Lucero construiu.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/6iToFU4GaJz4OlLMx34v3VWV7JE.jpg",
    "banner": "https://image.tmdb.org/t/p/original/oBter8Y5p2ZFUwWgQ1T9pulGFTJ.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1668364",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "23000-vidas-1656220",
    "title": "23.000 Vidas",
    "year": 2026,
    "rating": 4.5,
    "duration": "1h 55m",
    "genres": [
      "18-drama"
    ],
    "tmdbId": 1656220,
    "synopsis": "Um grupo de jovens embarca rumo ao Mediterrâneo para salvar as vidas de refugiados, em uma missão que desafia suas ideias sobre lei e justiça.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/iABvE2vyn7ZorgMlDqtIElpDaLn.jpg",
    "banner": "https://image.tmdb.org/t/p/original/q5L3aXchoCgwbZbwWl5FjhGmuYs.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1656220",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "arame-farpado-1418237",
    "title": "Arame Farpado",
    "year": 2025,
    "rating": 4.8,
    "duration": "1h 55m",
    "genres": [
      "18-drama"
    ],
    "tmdbId": 1418237,
    "synopsis": "Após um grave acidente, duas irmãs e um recém-chegado padrasto são forçados a  passar uma noite na sala de espera de um hospital, onde precisam lidar com estranhos, ao  mesmo tempo em que buscam uma maneira de colocar sua família de volta aos trilhos.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/o9w7j07MFSSvOWSr0dtFo0F3511.jpg",
    "banner": "https://image.tmdb.org/t/p/original/pEyKNNt8qpOXZ82BY1QmyN0lNRD.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1418237",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "o-meu-o-seu-o-nosso-natal-1401044",
    "title": "O Meu, O Seu, O Nosso Natal",
    "year": 2024,
    "rating": 4.8,
    "duration": "1h 55m",
    "genres": [
      "35-comedy",
      "18-drama"
    ],
    "tmdbId": 1401044,
    "synopsis": "Um casal de terapeutas bem-sucedidos e populares nas redes sociais tem seu maior segredo descoberto por um rapaz, que os chantageia para que o ajudem a salvar o casamento de seu pai, um empresário milionário. Ao mesmo tempo, os filhos do casal descobrem que o novo cliente dos pais tem um plano para assumir a direção do colégio deles e farão de tudo para impedi-lo.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/kLp3P3eQnXgQSdPDkNYW9T2MNyX.jpg",
    "banner": "https://image.tmdb.org/t/p/original/9e7koWuH9TWaZpAPHLMeYTiQYYA.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1401044",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "chopin-uma-sonata-em-paris-1299799",
    "title": "Chopin, Uma Sonata em Paris",
    "year": 2025,
    "rating": 4.5,
    "duration": "1h 55m",
    "genres": [
      "18-drama",
      "36-history",
      "10402-music"
    ],
    "tmdbId": 1299799,
    "synopsis": "Paris, 1835. Ídolo da aristocracia e presença constante nos salões da cidade, Chopin divide seus dias entre partituras encomendadas e aulas de piano, enquanto uma doença progressiva ameaça silenciar um dos maiores talentos da música.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/C1ravfdArkb48xfcbx4RHxwtde.jpg",
    "banner": "https://image.tmdb.org/t/p/original/wSM9pIhulPQpKZ26HYkwkYvy6OF.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1299799",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "o-desafio-de-marguerite-960033",
    "title": "O Desafio de Marguerite",
    "year": 2023,
    "rating": 4.6,
    "duration": "1h 55m",
    "genres": [
      "18-drama",
      "9648-mystery"
    ],
    "tmdbId": 960033,
    "synopsis": "Uma brilhante estudante de matemática na melhor universidade da França, a Ecole Normale Supérieure. No dia da apresentação de sua tese, um erro abala toda a certeza de sua vida planejada, ela decide abandonar tudo e começar de novo.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/72trgN1iL0T17CYCzr7GKxqKNte.jpg",
    "banner": "https://image.tmdb.org/t/p/original/90TnuYFSyzovn6JIR7bP2VSdOhJ.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/960033",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "shiboyugi-playing-death-games-to-put-food-on-the-table-44-cloudy-beach-1659338",
    "title": "Shiboyugi: Playing Death Games to Put Food on the Table 44: Cloudy Beach",
    "year": 2026,
    "rating": 4.8,
    "duration": "1h 55m",
    "genres": [
      "16-animation",
      "28-action"
    ],
    "tmdbId": 1659338,
    "synopsis": "Depois de Yuuki ultrapassar a maldição da “parede dos trinta anos”, que reduz drasticamente a taxa de sobrevivência dos jogadores. Yuuki continua a jogar, desta vez numa ilha remota no meio do oceano com outros sete jogadores, e entre eles está alguém que Yuuki conhece. O jogo que estão prestes a jogar chama-se “Praia Nublada”.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/1hwe1CNgFThbU8irK8Qn1bfu65P.jpg",
    "banner": "https://image.tmdb.org/t/p/original/wEArA15wjHybHLKrj9ySVTY2Rck.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1659338",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "a-fera-do-pantano-1382832",
    "title": "A Fera do Pântano",
    "year": 2026,
    "rating": 4.5,
    "duration": "1h 55m",
    "genres": [
      "53-thriller",
      "27-horror"
    ],
    "tmdbId": 1382832,
    "synopsis": "Um grupo de turistas precisa lutar por suas vidas contra um hipopótamo enfurecido à solta após se perder nos pântanos da Louisiana.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/hxg4RRGVJ2FTq6C38dGaOKu57l8.jpg",
    "banner": "https://image.tmdb.org/t/p/original/ikyzq678qnHtRY8ZiQJzK4hiOyW.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1382832",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "conspiradores-1659155",
    "title": "Conspiradores",
    "year": 2026,
    "rating": 4.4,
    "duration": "1h 55m",
    "genres": [
      "53-thriller",
      "18-drama",
      "9648-mystery"
    ],
    "tmdbId": 1659155,
    "synopsis": "Após a morte repentina de sua mãe, Ruth retorna à sua cidade natal e reencontra o pai, cujo comportamento estranho a leva a questionar o que realmente aconteceu.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/o1LeQ4ZIPjXIFFVur4b2dLUM5nQ.jpg",
    "banner": "https://image.tmdb.org/t/p/original/2kQ71k6dq7DVNYuYY9ylNvRFKTv.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1659155",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "o-soldado-desaparecido-1096633",
    "title": "O Soldado Desaparecido",
    "year": 2024,
    "rating": 4.7,
    "duration": "1h 55m",
    "genres": [
      "18-drama",
      "53-thriller",
      "10752-war"
    ],
    "tmdbId": 1096633,
    "synopsis": "Um soldado israelense de dezoito anos foge do exército e volta para sua namorada em Tel Aviv apenas para descobrir que a elite militar está convencida de que ele foi sequestrado no meio da guerra.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/g1voqwfA7o8VlbJkGyiL02H70VK.jpg",
    "banner": "https://image.tmdb.org/t/p/original/qiolA5zvzxx1VeOoHYvhmb0GpR4.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1096633",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "amor-apocalipse-1283671",
    "title": "Amor Apocalipse",
    "year": 2025,
    "rating": 4.9,
    "duration": "1h 55m",
    "genres": [
      "35-comedy",
      "10749-romance",
      "18-drama"
    ],
    "tmdbId": 1283671,
    "synopsis": "Adam sofre de ecoansiedade. Ao ligar para o suporte de uma luminária terapêutica, conhece Tina. Entre tempestades e colapsos, os dois se conectam - provando que, mesmo quando tudo desmorona, ainda há espaço para o amor.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/mJpdCDdxSDpMyez2hhyA37hayjQ.jpg",
    "banner": "https://image.tmdb.org/t/p/original/wKPevTkODWTjWf4xWGkrXGbg9Xi.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1283671",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "cash-for-gold-1280668",
    "title": "Cash for Gold",
    "year": 2024,
    "rating": 4.7,
    "duration": "1h 55m",
    "genres": [
      "18-drama"
    ],
    "tmdbId": 1280668,
    "synopsis": "Após a morte do marido, um militar, Grace luta para manter a sobriedade e evitar que sua casa seja tomada pelo banco. Ao começar a trabalhar para a única família muçulmana de sua pequena cidade, ela se vê obrigada a confrontar os demônios do passado que ameaçam levá-la ao fundo do poço.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/mpSoCWnZVfUNBGDreQUWbZd2Dc1.jpg",
    "banner": "https://image.tmdb.org/t/p/original/sfmEcEnSWWLp9TXDUrscj4k0gdJ.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1280668",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "amor-toxico-1723460",
    "title": "Amor Tóxico",
    "year": 2026,
    "rating": 4.4,
    "duration": "1h 55m",
    "genres": [
      "99-documentary"
    ],
    "tmdbId": 1723460,
    "synopsis": "Uma série de e-mails ameaçadores se transforma em um plano de vingança envolvendo um marechal americano recém-casado e sua ex-namorada neste documentário sobre crimes reais.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/1WUHK5GFZYw1la8jUFtGQRkOVba.jpg",
    "banner": "https://image.tmdb.org/t/p/original/c3hLMqh2QqJd7m1ar6rxw9eio35.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1723460",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "o-cobrador-de-dividas-1630409",
    "title": "O Cobrador de Dívidas",
    "year": 2026,
    "rating": 4.8,
    "duration": "1h 55m",
    "genres": [
      "28-action",
      "53-thriller",
      "80-crime"
    ],
    "tmdbId": 1630409,
    "synopsis": "Assombrado pela culpa após a prisão, um ex-cobrador de dívidas corre contra uma doença terminal, retornando ao seu antigo mundo para vingar as vítimas dos agiotas.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/qBKdfIV8YeReAYyzebW7R14vWhe.jpg",
    "banner": "https://image.tmdb.org/t/p/original/dk68ykaNd3HdrDJyPJqEGsgvag7.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1630409",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "amor-em-camera-lenta-1620682",
    "title": "Amor em Câmera Lenta",
    "year": 2026,
    "rating": 4.3,
    "duration": "1h 55m",
    "genres": [
      "10749-romance",
      "35-comedy"
    ],
    "tmdbId": 1620682,
    "synopsis": "Quando Jawad, o melhor amigo de Haya, fica noivo, o mundo de solteira convicta dela vira de cabeça para baixo — afinal, quem diria que o amor verdadeiro poderia estar escondido na \"friend zone\"?",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/1xufFKDpVSxATQh0i7gsA4SjSl1.jpg",
    "banner": "https://image.tmdb.org/t/p/original/rivKhEJWZirF7UtnCnaN44YaJ69.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1620682",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "preta-eu-nao-ando-so-1734724",
    "title": "Preta - Eu Não Ando Só",
    "year": 2026,
    "rating": 4.5,
    "duration": "1h 55m",
    "genres": [
      "99-documentary"
    ],
    "tmdbId": 1734724,
    "synopsis": "Um retrato íntimo de Preta Gil, construído com imagens inéditas e depoimentos emocionantes que revelam sua força diante da vida e da doença.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/x8MfvmDrnYqf3ZhY1cNbMYUGqkQ.jpg",
    "banner": "https://image.tmdb.org/t/p/original/263fC07VHHGJ0xJEVBJyolAu5yX.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1734724",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "elize-sombras-de-uma-mulher-1487861",
    "title": "Elize: Sombras de uma Mulher",
    "year": 2026,
    "rating": 4.4,
    "duration": "1h 55m",
    "genres": [
      "53-thriller",
      "80-crime",
      "18-drama"
    ],
    "tmdbId": 1487861,
    "synopsis": "Nesta adaptação de um crime chocante, uma mulher descobre as traições do marido e vê seu conto de fadas se transformar em um jogo violento.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/hLTKARaZn0fH5zr3j5EkKtJhu1G.jpg",
    "banner": "https://image.tmdb.org/t/p/original/z8mTDyKdAWjKsD0vwa7e9LTSY1j.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1487861",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "capitao-hook-as-mares-malditas-1511789",
    "title": "Capitão Hook: As Marés Malditas",
    "year": 2025,
    "rating": 4.4,
    "duration": "1h 55m",
    "genres": [
      "12-adventure",
      "28-action",
      "27-horror"
    ],
    "tmdbId": 1511789,
    "synopsis": "Após uma derrota devastadora contra o Almirante Smee, o Capitão Hook refugia-se na costa de Eldtrich Landing, onde encontra Silas Blackweather, um ferreiro movido pela vingança após o assassinato de sua irmã. Enquanto fogem dos soldados vermelhos do Almirante, eles enfrentam duelos brutais e forças ocultas representadas por antigas maldições. Sua aliança improvável os leva a desafiar Smee em águas inexploradas, num embate que pode redefinir o legado de Hook para sempre.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/1rkLG0iuhvY0gevbH7kFDYIDV6q.jpg",
    "banner": "https://image.tmdb.org/t/p/original/efQIfpxegsg6KHfTcVngrPO09cs.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1511789",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "o-delator-1137179",
    "title": "O Delator",
    "year": 2025,
    "rating": 4.6,
    "duration": "1h 55m",
    "genres": [
      "80-crime",
      "28-action",
      "35-comedy"
    ],
    "tmdbId": 1137179,
    "synopsis": "Um delator conhecido como “yadang” atua como intermediário entre criminosos e autoridades, manipulando informações para benefício próprio. Ao se infiltrar em uma rede perigosa, ele se vê preso entre policiais corruptos e organizações criminosas, onde qualquer erro pode ser fatal.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/6oGvvHeToT0cexqG1WoqvmcVBkY.jpg",
    "banner": "https://image.tmdb.org/t/p/original/9pdoEzieGdUTlRWTAO7QP8q1tIo.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1137179",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "euphoria-um-olhar-para-tras-1732097",
    "title": "Euphoria: Um Olhar para Trás",
    "year": 2026,
    "rating": 4.2,
    "duration": "1h 55m",
    "genres": [
      "99-documentary"
    ],
    "tmdbId": 1732097,
    "synopsis": "O elenco e a equipe de Euphoria, da HBO, fazem uma retrospectiva exclusiva das origens, evolução e influências da série aclamada pela crítica.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/g9T0tOaK7IL5cvJbrcJQ3puNOh8.jpg",
    "banner": "https://image.tmdb.org/t/p/original/fQiNGtgo9gEpyOIxX29FtUHpcaD.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1732097",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "encanto-quebrado-1261635",
    "title": "Encanto Quebrado",
    "year": 2026,
    "rating": 4.8,
    "duration": "1h 55m",
    "genres": [
      "Lançamento"
    ],
    "tmdbId": 1261635,
    "synopsis": "Uma bruxa do século XXI faz um feitiço do amor para o seu vizinho. Quando ela percebe que ele é um idiota, e se arrepende, ela se lembra que o feitiço é irreversível.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/rdFOVAlGrS3Fz3X77DedH6OvXRh.jpg",
    "banner": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/rdFOVAlGrS3Fz3X77DedH6OvXRh.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1261635",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "bambi-uma-aventura-na-floresta-1094473",
    "title": "Bambi, Uma Aventura na Floresta",
    "year": 2024,
    "rating": 4.8,
    "duration": "1h 55m",
    "genres": [
      "99-documentary",
      "10751-family",
      "12-adventure"
    ],
    "tmdbId": 1094473,
    "synopsis": "Em uma jornada de descoberta e superação, o jovem cervo Bambi explora a vida na floresta ao lado de sua mãe amorosa, aprendendo sobre amizade, natureza e esperança. Ao crescer, ele conhece Faline, sua futura amada, e vive momentos de alegria e perda ao perder sua mãe para caçadores. Sob a proteção de seu pai, o Príncipe, Bambi enfrenta os desafios da vida selvagem e aprende a se tornar forte e independente.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/pm4eFHE5hL0YennQkmQftofTEmd.jpg",
    "banner": "https://image.tmdb.org/t/p/original/ce51NvJSO5ReNkm3C3YDX5jsH1V.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1094473",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "a-mansao-savage-1245859",
    "title": "A Mansão Savage",
    "year": 2026,
    "rating": 4.6,
    "duration": "1h 55m",
    "genres": [
      "35-comedy",
      "18-drama"
    ],
    "tmdbId": 1245859,
    "synopsis": "Tendo como pano de fundo a Inglaterra do século XVIII, um surto massivo de varíola e a revolta jacobita, Sir Chauncey Savage e Lady Savage buscam cegamente uma vida melhor. Não é sem uma pitada de ironia que seu sobrenome seja Savages (Os Selvagens), pois esta é de fato uma Casa Selvagem, repleta de duelos, decadência e derramamento de sangue.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/k5Maipij0lwfTWJSs6xq3dcCWVj.jpg",
    "banner": "https://image.tmdb.org/t/p/original/xr8cnK9SdDKdqYiWlBthQcvBJvH.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1245859",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "um-grande-despertar-1341137",
    "title": "‎Um Grande Despertar",
    "year": 2026,
    "rating": 4.3,
    "duration": "1h 55m",
    "genres": [
      "18-drama",
      "36-history"
    ],
    "tmdbId": 1341137,
    "synopsis": "Em meio às tensões que antecedem a Revolução Americana, o carismático pregador George Whitefield e o cético Benjamin Franklin desenvolvem uma amizade improvável. Enquanto os sermões de Whitefield inspiram milhares de pessoas durante o movimento conhecido como Grande Despertar, Franklin ajuda a espalhar sua mensagem, e juntos acabam influenciando um período decisivo da história dos Estados Unidos. Baseado em fatos reais.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/qZf42h6r8BSkVTCBtTXTELcgTV1.jpg",
    "banner": "https://image.tmdb.org/t/p/original/iQodpfb5trczzmqxAgnsUYPw2rv.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1341137",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "hit-para-dois-1284016",
    "title": "Hit Para Dois",
    "year": 2026,
    "rating": 4.7,
    "duration": "1h 55m",
    "genres": [
      "35-comedy",
      "10402-music",
      "18-drama"
    ],
    "tmdbId": 1284016,
    "synopsis": "Rick, um cantor de casamentos, apresenta uma de suas composições para Danny, um ex-astro pop adolescente que transforma a canção em um sucesso global e fica com todo o crédito. Em busca de justiça e reconhecimento, Rick mergulha em uma jornada obsessiva, sem perceber que pode acabar perdendo o que realmente importa em sua vida.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/9UDXiDRwsKt1G9pSVeXqNdzPAVm.jpg",
    "banner": "https://image.tmdb.org/t/p/original/euUEDjof7fVX2t3nYFvLLN9ADK2.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1284016",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "n121-bus-de-nuit-1433929",
    "title": "N121 Bus de nuit",
    "year": 2026,
    "rating": 4.7,
    "duration": "1h 55m",
    "genres": [
      "53-thriller"
    ],
    "tmdbId": 1433929,
    "synopsis": "Oscar, Simon e Aïssa, três amigos de infância, viajam a Paris para celebrar boas notícias. No ônibus noturno N121 de volta, uma troca entre passageiros escala e a situação sai do controle, transformando a viagem em um intenso thriller urbano.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/Aqt0yVqtkDuBtOeY0UHLtfYhzN9.jpg",
    "banner": "https://image.tmdb.org/t/p/original/2Pibybzy2hSe74KTNAxja4OJ5hj.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1433929",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "shake-rattle-roll-as-origens-do-mal-1510795",
    "title": "Shake, Rattle & Roll: As Origens do Mal",
    "year": 2026,
    "rating": 4.6,
    "duration": "1h 55m",
    "genres": [
      "27-horror"
    ],
    "tmdbId": 1510795,
    "synopsis": "Dos corredores assombrados da abadia no passado, de um tumulto assassino no Halloween no presente a um apocalipse monstruoso no futuro; a décima sétima edição traz três histórias de terror em cada ciclo.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/4NSwhJVIvO54GyWsvGXHxRPRd3q.jpg",
    "banner": "https://image.tmdb.org/t/p/original/90Vx3KpCXR2D9iVdxJpkjeYBq9P.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1510795",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "a-revolucao-dos-bichos-539745",
    "title": "A Revolução dos Bichos",
    "year": 2026,
    "rating": 4.6,
    "duration": "1h 55m",
    "genres": [
      "16-animation",
      "35-comedy",
      "18-drama"
    ],
    "tmdbId": 539745,
    "synopsis": "Um movimento pela igualdade é sistematicamente corrompido. À medida que os porcos consolidam o controle, a verdade é apagada e a fazenda se transforma em uma ditadura implacável.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/j2svEVdHI5QfmeXAbuPye5l6y0I.jpg",
    "banner": "https://image.tmdb.org/t/p/original/1yl7xmTN2iEyiD3gF8M68lBhR39.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/539745",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "dentes-de-leite-1027938",
    "title": "Dentes de Leite",
    "year": 2024,
    "rating": 4.9,
    "duration": "1h 55m",
    "genres": [
      "18-drama",
      "9648-mystery"
    ],
    "tmdbId": 1027938,
    "synopsis": "Mesmo sendo filha de uma forasteira, Skalde conquistou o respeito e a confiança do líder de uma pequena comunidade rural. No entanto, ela pode colocar tudo a perder ao fazer amizade com uma garota que encontrou na floresta.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/9rvbc02OyoC9xxyMAqA6thzHOe5.jpg",
    "banner": "https://image.tmdb.org/t/p/original/mRGOFNr67OQQspEkxpbY2ch6kpp.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1027938",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "destruicao-iminente-1033462",
    "title": "Destruição Iminente",
    "year": 2024,
    "rating": 4.7,
    "duration": "1h 55m",
    "genres": [
      "28-action",
      "12-adventure",
      "878-science-fiction"
    ],
    "tmdbId": 1033462,
    "synopsis": "Ao retornar, ele descobre que o Bureau pretende usá-lo como cobaia em testes perigosos. O objetivo é conter uma névoa misteriosa que está surgindo do subsolo e ameaçando a cidade de Hong Kong. No desenrolar da história, Ma Shan descobre uma conexão telepática com os alienígenas e se vê diante de um dilema moral: lidar com seu passado e sua humanidade ou usar seus dons para impedir uma catástrofe global.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/63XregsiXaKDNVtDJv3vymHFdLr.jpg",
    "banner": "https://image.tmdb.org/t/p/original/lf8IZ86ajGpgbuyHCZrXUeAMmvy.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1033462",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "o-apanhador-de-almas-1061661",
    "title": "O Apanhador de Almas",
    "year": 2025,
    "rating": 4.5,
    "duration": "1h 55m",
    "genres": [
      "27-horror",
      "53-thriller",
      "14-fantasy"
    ],
    "tmdbId": 1061661,
    "synopsis": "Durante um eclipse solar, quatro jovens aspirantes a bruxas visitam uma casa para presenciar pela primeira vez um ritual sobrenatural. Porém, uma criatura de outra dimensão é evocada e elas são forçadas a tomar uma terrível decisão entre vida e morte.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/awhPCcgZCJFK5ntjihTqALAcbXo.jpg",
    "banner": "https://image.tmdb.org/t/p/original/zghtiYHZpRo1a3f8Av8H3oeCnHt.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1061661",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "instadocs-o-jogo-dos-palpites-1736916",
    "title": "Instadocs: O Jogo dos Palpites",
    "year": 2026,
    "rating": 4.7,
    "duration": "1h 55m",
    "genres": [
      "99-documentary"
    ],
    "tmdbId": 1736916,
    "synopsis": "O mercado de previsões permite apostar em qualquer coisa, da Copa do Mundo a invasões alienígenas. O Instadocs investiga a explosão das apostas globais.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/xeTCcALCqpT8IvJuakrjk5clzXL.jpg",
    "banner": "https://image.tmdb.org/t/p/original/hFKxAbTf5j3RJWFTuqCchn1vzsl.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1736916",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "do-outro-lado-do-pavilhao-1542812",
    "title": "Do Outro Lado do Pavilhão",
    "year": 2025,
    "rating": 4.6,
    "duration": "1h 55m",
    "genres": [
      "99-documentary"
    ],
    "tmdbId": 1542812,
    "synopsis": "O documentário dá voz a mulheres marginalizadas pelo sistema penal. Érica e Núbia se conhecem na prisão e criam um laço que ultrapassa as grades. Em liberdade condicional, relatam abusos, celas superlotadas e a perda\r da identidade feminina. Sem advogados, enfrentam essa rotina com coragem e humor. Suas histórias revelam a realidade do encarceramento feminino no Brasil.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/xtDYQbecaDKrng7DmhZQRxGGKmd.jpg",
    "banner": "https://image.tmdb.org/t/p/original/c2z6tBVpcq79GTqb8NEMDzrbZuG.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1542812",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "instadocs-alex-murdaugh-unconvicted-1704846",
    "title": "Instadocs: Alex Murdaugh, Unconvicted",
    "year": 2026,
    "rating": 4.8,
    "duration": "1h 55m",
    "genres": [
      "99-documentary"
    ],
    "tmdbId": 1704846,
    "synopsis": "Por que a condenação de Alex Murdaugh foi anulada? A estreia de “Instadocs” investiga alegações impressionantes de interferência do júri em seu julgamento por duplo assassinato.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/iP9b3NBxJKtyzLf7CKFWl3MpgKS.jpg",
    "banner": "https://image.tmdb.org/t/p/original/gxQ2lstfNVrzoawF3Z2S77YpTWR.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1704846",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "retrato-de-um-certo-oriente-1219606",
    "title": "Retrato de um Certo Oriente",
    "year": 2024,
    "rating": 4.6,
    "duration": "1h 55m",
    "genres": [
      "18-drama"
    ],
    "tmdbId": 1219606,
    "synopsis": "Líbano, 1949. Emilie e Emir, dois irmãos católicos, partem do Líbano rumo ao Brasil em fuga de uma guerra iminente. Na viagem, Emilie conhece Omar, um comerciante muçulmano, e entre os dois surge uma paixão avassaladora. Para ficarem juntos, eles terão que enfrentar diferenças religiosos e o ciúme irracional de Emir.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/jUa2RypM8eUNW9JwN5XDJfrZhsx.jpg",
    "banner": "https://image.tmdb.org/t/p/original/t6KB414HaWaYXiTqqpxKpnyad0U.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1219606",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "o-sonho-de-clarice-1213049",
    "title": "O Sonho de Clarice",
    "year": 2023,
    "rating": 4.2,
    "duration": "1h 55m",
    "genres": [
      "Lançamento"
    ],
    "tmdbId": 1213049,
    "synopsis": "Nenhuma sinopse disponível.",
    "category": "movie",
    "poster": "https://images.unsplash.com/photo-1594909122845-11baa439b7bf?q=80&w=600",
    "banner": "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=1200",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1213049",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "barba-ensopada-de-sangue-1078801",
    "title": "Barba Ensopada de Sangue",
    "year": 2026,
    "rating": 4.6,
    "duration": "1h 55m",
    "genres": [
      "53-thriller"
    ],
    "tmdbId": 1078801,
    "synopsis": "Após a morte de seu pai, Gabriel parte para a praia da Armação em busca de suas origens. O que ele acaba encontrando é uma trama complexa em torno da figura misteriosa de seu avô, um esqueleto de baleia e uma cidade que quer enterrar seu passado a qualquer custo.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/8yDd2WJE3P1WInfcnGRdXiYK2pI.jpg",
    "banner": "https://image.tmdb.org/t/p/original/quQrQzz3FhT8SZY4S8mPBlEHqw9.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1078801",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "eu-antes-de-mim-1616674",
    "title": "Eu Antes de Mim",
    "year": 2026,
    "rating": 4.6,
    "duration": "1h 55m",
    "genres": [
      "18-drama"
    ],
    "tmdbId": 1616674,
    "synopsis": "Um jovem estudante, às voltas com a pressão, o pânico e um pai exigente, usa um projeto escolar para descobrir que a verdade — e não troféus — pode finalmente libertá-lo.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/jnq1i2obAreHlkfEZCswlKu1zvF.jpg",
    "banner": "https://image.tmdb.org/t/p/original/1QiFfqaAhZi4HMlJNMvJVXOovc6.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1616674",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "nada-entre-nos-1632812",
    "title": "Nada Entre Nós",
    "year": 2026,
    "rating": 4.6,
    "duration": "1h 55m",
    "genres": [
      "10749-romance",
      "35-comedy"
    ],
    "tmdbId": 1632812,
    "synopsis": "Gael García Bernal e Natalia Oreiro estrelam este filme como dois executivos que se conhecem em um resort em meio a uma crise corporativa. Apesar das diferenças, eles vivem um romance fugaz enquanto enfrentam problemas pessoais.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/rfawOwTzIEDoBIVgNxpXtrvngus.jpg",
    "banner": "https://image.tmdb.org/t/p/original/mwfmOOWbchS1cY68zr5aFr21Hhx.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1632812",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "varzea-onde-nasce-o-futebol-323842",
    "title": "Várzea: Onde Nasce o Futebol",
    "year": 2026,
    "rating": 4.8,
    "duration": "1 Temporada",
    "genres": [
      "99-documentary"
    ],
    "tmdbId": 323842,
    "synopsis": "O Brasil vive, respira e exporta futebol. Esta série mergulha nas histórias por trás do jogo bonito, que nasce na várzea e tem o poder de mudar vidas.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/hw1GzjpTcxhhgaI5Rd4s6EP3gbX.jpg",
    "banner": "https://image.tmdb.org/t/p/original/r3CZgVHhSvaASQke88mTFhcW92c.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/323842/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "bipolar-259609",
    "title": "Bipolar",
    "year": 2010,
    "rating": 4.5,
    "duration": "1 Temporada",
    "genres": [
      "Lançamento"
    ],
    "tmdbId": 259609,
    "synopsis": "A série Bipolar tem como principal argumento a descaracterização das conhecidas tramas policiais. Iremos conhecer uma equipe de agentes cuja realidade se concretiza não no cano do revolver e sim na solidão mórbida que assombra uma grande parte desses profissionais.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/7TXWDEHQmYO4K3Ots0O4k6H5kSv.jpg",
    "banner": "https://image.tmdb.org/t/p/original/1vmmQvyyhzvYMw4kin6gCro25yC.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/259609/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "monstros-sobre-rodas-297246",
    "title": "Monstros Sobre Rodas",
    "year": 2025,
    "rating": 4.7,
    "duration": "1 Temporada",
    "genres": [
      "10764-reality"
    ],
    "tmdbId": 297246,
    "synopsis": "No setor multibilionário de caminhonetes personalizadas, ninguém cria veículos mais barulhentos e procurados do que a Apocalypse Manufacturing.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/eCDYhFdgnon6jmtLaBgsSsVg0FN.jpg",
    "banner": "https://image.tmdb.org/t/p/original/fKFHlDYtcli3Lr6znqpuAhoew4S.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/297246/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "modo-tunado-232630",
    "title": "Modo Tunado",
    "year": 2023,
    "rating": 4.3,
    "duration": "1 Temporada",
    "genres": [
      "10764-reality"
    ],
    "tmdbId": 232630,
    "synopsis": "John \"Nads\" Naderi e Amir Bentatou vivem para celebrar o espírito de tunar carros, transformando carros de alto desempenho japoneses em ícones do mundo tuning, com partes iguais de desempenho e estilo.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/1ZLjPe9jTyTvd5xophLDVchXfpe.jpg",
    "banner": "https://image.tmdb.org/t/p/original/mXXqBNaQiE5Dc7H4jEMhA5QKOhL.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/232630/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "larry-e-a-busca-da-infelicidade-295780",
    "title": "Larry e a Busca da Infelicidade",
    "year": 2026,
    "rating": 4.5,
    "duration": "1 Temporada",
    "genres": [
      "35-comedy"
    ],
    "tmdbId": 295780,
    "synopsis": "Os Obamas queriam preparar uma celebração para homenagear o 250º aniversário dos Estados Unidos... mas Larry David ligou.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/sYvLOHT7Om7RbJcaSfFIlsNGAJ3.jpg",
    "banner": "https://image.tmdb.org/t/p/original/6Fbrrf2jaYJ8s3nnnuhhvvDjTZN.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/295780/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "inocencia-selvagem-275557",
    "title": "Inocência Selvagem",
    "year": 2025,
    "rating": 4.3,
    "duration": "1 Temporada",
    "genres": [
      "18-drama"
    ],
    "tmdbId": 275557,
    "synopsis": "Duas filhas adolescentes mimadas. Duas mães muito diferentes. A vida dos ricos é fácil – até que um escândalo revela o lado sombrio do glamour.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/oxn4ylDZSnQq83H0jXAmueBFV8A.jpg",
    "banner": "https://image.tmdb.org/t/p/original/c54arxwmTXMv4bPJo3RxbASW2s2.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/275557/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "as-panteras-3382",
    "title": "As Panteras",
    "year": 1976,
    "rating": 4.5,
    "duration": "1 Temporada",
    "genres": [
      "10759-action-adventure"
    ],
    "tmdbId": 3382,
    "synopsis": "Lindas, inteligentes e ultrassofisticadas, as Charlie's Angels são tudo o que um homem poderia sonhar... e muito mais do que jamais poderiam lidar! Recebendo suas ordens pelo viva-voz de seu chefe nunca visto, Charlie, os Anjos empregam suas incomparáveis ​​habilidades de combate e investigação, bem como seu letal charme feminino, para desvendar até mesmo os casos aparentemente mais intransponíveis.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/kGegHTleO2gf9ZlLDJKJm1TcfXE.jpg",
    "banner": "https://image.tmdb.org/t/p/original/jJVfPCkCbXrGOWtzfm1bhQg3HBq.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/3382/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "o-experimento-americano-322427",
    "title": "O Experimento Americano",
    "year": 2026,
    "rating": 4.8,
    "duration": "1 Temporada",
    "genres": [
      "99-documentary"
    ],
    "tmdbId": 322427,
    "synopsis": "Às vésperas do aniversário de 250 anos dos Estados Unidos, a nova série documental de cinco partes reexamina a façanha improvável que foi o estabelecimento da nação, trazendo a pergunta radical no cerne da revolução: \"Um povo é capaz de governar a si mesmo?\"",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/yciuq5wF4jmipPu9yzCVUlGGJgI.jpg",
    "banner": "https://image.tmdb.org/t/p/original/fFIWAFUj8TlKafcPUSJlX75dQcM.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/322427/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "a-quinta-dimensao-21561",
    "title": "A Quinta Dimensão",
    "year": 1995,
    "rating": 4.3,
    "duration": "1 Temporada",
    "genres": [
      "18-drama",
      "10765-sci-fi-fantasy"
    ],
    "tmdbId": 21561,
    "synopsis": "A série mostra histórias instigantes, de vidas em outros planetas, vida após a morte, manipulações genéticas e a relação humana com todas essas novas tecnologias.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/AhYH64bB8Cg13GlnjhNBvhDmFwT.jpg",
    "banner": "https://image.tmdb.org/t/p/original/yeuPvfPYK7Y3J3ZWqLF2IcWEi36.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/21561/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "a-irmandade-da-adaga-negra-290953",
    "title": "A Irmandade da Adaga Negra",
    "year": 2025,
    "rating": 4.6,
    "duration": "1 Temporada",
    "genres": [
      "10765-sci-fi-fantasy",
      "18-drama"
    ],
    "tmdbId": 290953,
    "synopsis": "Baseada na série #1 mais vendida do NYT de J.R. Ward, a liga de guerreiros vampiros conhecida como Black Dagger Brotherhood deve lutar contra a Lessening Society para proteger sua raça da extinção.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/6Ol47btYfg5NDy6a6GjglcrOwOi.jpg",
    "banner": "https://image.tmdb.org/t/p/original/3GuzF9TIvVCmVczkS0ylFvtwQKE.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/290953/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "tip-toe-286617",
    "title": "Tip Toe",
    "year": 2026,
    "rating": 4.6,
    "duration": "1 Temporada",
    "genres": [
      "18-drama"
    ],
    "tmdbId": 286617,
    "synopsis": "A trama se passa nos subúrbios de Manchester e foca em dois vizinhos que conviviam pacificamente há 15 anos: Leo (Alan Cumming), o dono de um bar no bairro gay da cidade, e Clive (David Morrissey), um eletricista que está lutando contra a falta de trabalho e caindo em um buraco negro de teorias da conspiração online.\n\nA paz vai pro ralo quando Leo entrega uma chave reserva de casa para Clive. O que começa como um pequeno atrito de vizinhança rapidamente escala para uma guerra suburbana perigosa e letal, alimentada por radicalização e paranoia.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/2V9V7dxNCNFFYpMsvID6PcZQ7Ia.jpg",
    "banner": "https://image.tmdb.org/t/p/original/dhj0rYeB81LGCBuERlHK51XPiod.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/286617/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "spy-in-the-wild-73910",
    "title": "Spy in the Wild",
    "year": 2017,
    "rating": 4.5,
    "duration": "1 Temporada",
    "genres": [
      "99-documentary"
    ],
    "tmdbId": 73910,
    "synopsis": "Espiões da Vida Selvagem é uma jornada reveladora e encantadora pelo reino animal",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/rG6oDKwnffl5OLe7aa1PgcCsF0j.jpg",
    "banner": "https://image.tmdb.org/t/p/original/slBvuMIvzdoywqtNe8DfVnJtrHV.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/73910/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "irmas-divorciadas-de-tyler-perry-292462",
    "title": "Irmãs Divorciadas de Tyler Perry",
    "year": 2025,
    "rating": 4.8,
    "duration": "1 Temporada",
    "genres": [
      "18-drama"
    ],
    "tmdbId": 292462,
    "synopsis": "Cinco amigas (Rasheda, Geneva, Naomi, Tiffany e Bridgette) apoiam umas às outras em suas lutas de divórcio, casamento, namoro, cura e amizade, enquanto seus laços de lealdade e irmandade são testados.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/sRvxRFx4INJNqgmpMbijQTWwUWX.jpg",
    "banner": "https://image.tmdb.org/t/p/original/zhM516IPD6XuRk0KozRC8lpmDuD.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/292462/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "o-verao-de-1936-287976",
    "title": "O Verão de 1936",
    "year": 2026,
    "rating": 4.4,
    "duration": "1 Temporada",
    "genres": [
      "18-drama"
    ],
    "tmdbId": 287976,
    "synopsis": "Nice, 1936. Enquanto os trabalhadores desfrutam de suas primeiras férias remuneradas, quatro mulheres muito diferentes veem-se envolvidas no assassinato de um promotor em um hotel da Riviera.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/diytnT5JBnGmsBOdynQKUj7QMKW.jpg",
    "banner": "https://image.tmdb.org/t/p/original/8KDxgfQ4JHgnEozwToRQaUgNAmP.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/287976/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "elle-legalmente-loira-254420",
    "title": "Elle: Legalmente Loira",
    "year": 2026,
    "rating": 4.6,
    "duration": "1 Temporada",
    "genres": [
      "35-comedy",
      "18-drama"
    ],
    "tmdbId": 254420,
    "synopsis": "Antes de Elle Woods ser um peixe fora d'água em Harvard, a encontramos em 1995, nas tumultuosas águas do ensino médio, onde ela encontra amizades complicadas, romance proibido e escolhas de moda questionáveis. Neste capítulo inesperado de sua adolescência, descobrimos as experiências que fizeram de Elle a famosa jovem que conhecemos e amamos.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/2yYFavbSBNwW0dNCbVKw57qSaQZ.jpg",
    "banner": "https://image.tmdb.org/t/p/original/truh4rtTUdRVYGeT0n17dxvdv41.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/254420/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "a-pior-vizinhanca-325188",
    "title": "A Pior Vizinhança",
    "year": 2026,
    "rating": 4.4,
    "duration": "1 Temporada",
    "genres": [
      "80-crime",
      "99-documentary"
    ],
    "tmdbId": 325188,
    "synopsis": "Série documental sobre histórias reais de vizinhos que se revelaram perigosos. De fraudes hediondas até atos de violência motivados por vingança sem sentido.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/jedGZ2DMXQTvemg0Vx77WTAiBN4.jpg",
    "banner": "https://image.tmdb.org/t/p/original/m1EXAPGmzZbr58mY6dzjaZyDOVU.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/325188/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "rosa-elettrica-in-fuga-con-il-nemico-319820",
    "title": "Rosa Elettrica - In fuga con il nemico",
    "year": 2026,
    "rating": 4.8,
    "duration": "1 Temporada",
    "genres": [
      "10759-action-adventure"
    ],
    "tmdbId": 319820,
    "synopsis": "Maria Chiara Giannetta plays Rosa Valera, a young agent recently transferred to the Witness Protection Unit. On her first assignment, she's assigned to Cocìss (Francesco Di Napoli), an unpredictable Camorra baby-boss who recently repented.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/6L8mWi31O2SwdX8b3oCLv0S6eJI.jpg",
    "banner": "https://image.tmdb.org/t/p/original/7B3jeJJXo4suCZoWx2b89Qt3OqH.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/319820/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "miss-behave-313727",
    "title": "Miss Behave",
    "year": 2026,
    "rating": 4.7,
    "duration": "1 Temporada",
    "genres": [
      "35-comedy",
      "9648-mystery",
      "18-drama"
    ],
    "tmdbId": 313727,
    "synopsis": "When their scandalous private content spreads across campus, a group of smart girls band together and plot revenge against the male students whom they believe leaked their nude photos.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/dHAV6cGS43qF9hPELupUAFkAfEF.jpg",
    "banner": "https://image.tmdb.org/t/p/original/aCQeYRXOuk4G4u6pBs6JAmfV0X5.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/313727/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "lucky-278624",
    "title": "Lucky",
    "year": 2026,
    "rating": 4.8,
    "duration": "1 Temporada",
    "genres": [
      "18-drama",
      "80-crime"
    ],
    "tmdbId": 278624,
    "synopsis": "Quando um roubo dá errado, a vigarista Lucky é forçada a cair na estrada. Perseguida pelo FBI e por uma mafiosa implacável, Lucky deve lutar pela sua vida. E por uma saída.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/xsrkiXg8EuNNtbPtbmvCxg95gK7.jpg",
    "banner": "https://image.tmdb.org/t/p/original/hKXMOOvQwXiL01hfYG5nrkH0tEP.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/278624/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "uma-casa-na-pradaria-283304",
    "title": "Uma Casa na Pradaria",
    "year": 2026,
    "rating": 4.8,
    "duration": "1 Temporada",
    "genres": [
      "18-drama",
      "37-western",
      "10751-family"
    ],
    "tmdbId": 283304,
    "synopsis": "A família Ingalls começa uma nova vida no Oeste, um lugar que combina os encantos da natureza e uma luta constante pela sobrevivência.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/5U8WPMqnTx0xGQWwTVLTJGz8wqC.jpg",
    "banner": "https://image.tmdb.org/t/p/original/fBieUo3SdItUrXZE16YxbpjwXIe.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/283304/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "o-falcao-do-golfe-254528",
    "title": "O Falcão do Golfe",
    "year": 2026,
    "rating": 4.4,
    "duration": "1 Temporada",
    "genres": [
      "35-comedy"
    ],
    "tmdbId": 254528,
    "synopsis": "Em final de carreira, Lonnie Hawkins, o lendário Falcão do Golfe, busca conquistar um último major e arrasta todos à sua volta para o caos.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/g22CVVxQiort0J9pabyLjggep0v.jpg",
    "banner": "https://image.tmdb.org/t/p/original/fBVNJL85Q60njpKPD6YaLi6tEsX.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/254528/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "o-mapa-dos-desejos-288671",
    "title": "O Mapa dos Desejos",
    "year": 2026,
    "rating": 4.6,
    "duration": "1 Temporada",
    "genres": [
      "18-drama"
    ],
    "tmdbId": 288671,
    "synopsis": "Uma jovem recebe um misterioso jogo criado pela falecida irmã. O objetivo? Ajudá-la a encontrar um novo propósito na vida e conhecer um cara legal.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/sd26iv3RzCUKZPmbrQOHHDa6gUq.jpg",
    "banner": "https://image.tmdb.org/t/p/original/lDhs7EFH1DaOoRXEaTiNhuYaAbC.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/288671/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "parceiras-no-crime-241882",
    "title": "Parceiras no Crime",
    "year": 2026,
    "rating": 4.5,
    "duration": "1 Temporada",
    "genres": [
      "10759-action-adventure"
    ],
    "tmdbId": 241882,
    "synopsis": "As melhores amigas Debbie e Judith são obrigadas a fugir quando Debbie descobre que Judith não é uma perita contábil, mas uma assassina internacional! Com uma figura misteriosa atrás delas, e o marido de Debbie envolvido em um esquema de corrupção, começa uma corrida contra o tempo e uma viagem pela Europa para desvendar a verdade e sobreviver.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/giGyRt8ImU8KWnI9Xwqy1vKra7e.jpg",
    "banner": "https://image.tmdb.org/t/p/original/jwCXxvbLno5GrGDA9KvQ22uLziM.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/241882/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "stuart-nao-consegue-salvar-o-universo-287620",
    "title": "Stuart Não Consegue Salvar o Universo",
    "year": 2026,
    "rating": 4.8,
    "duration": "1 Temporada",
    "genres": [
      "35-comedy",
      "10765-sci-fi-fantasy"
    ],
    "tmdbId": 287620,
    "synopsis": "O dono da loja de quadrinhos Stuart Bloom é encarregado de restaurar a realidade após quebrar acidentalmente um dispositivo construído por Sheldon e Leonard, desencadeando um Armagedom no multiverso. Nessa missão, Stuart é auxiliado por sua namorada Denise, pelo amigo geólogo Bert e pelo físico quântico e irritante Barry Kripke.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/cqjN2oaX0N3rVQHZ0WG9O9CWwqE.jpg",
    "banner": "https://image.tmdb.org/t/p/original/2ngdvUiEKW8Q37ta8BBdydE2cuq.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/287620/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "pompeia-alem-do-tempo-com-tom-hiddleston-277640",
    "title": "Pompeia: Além do Tempo com Tom Hiddleston",
    "year": 2026,
    "rating": 4.2,
    "duration": "1 Temporada",
    "genres": [
      "99-documentary",
      "18-drama"
    ],
    "tmdbId": 277640,
    "synopsis": "Será que alguém sobreviveu à destruição de Pompeia? Tom Hiddleston comanda uma investigação inovadora sobre as últimas 24 horas da erupção do Vesúvio, combinando arqueologia de ponta com sua própria intuição. Ele busca descobrir o que realmente aconteceu com as pessoas sob as cinzas, acompanhando um adolescente, uma empresária e um soldado que enfrentam escolhas impossíveis em uma corrida contra o tempo.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/iKiD6DqHLKF4Kfr3mJyJCD103kk.jpg",
    "banner": "https://image.tmdb.org/t/p/original/pSFJys8tIv7mll6Fv1LqMbrWxLt.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/277640/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "super-subbu-283609",
    "title": "Super Subbu",
    "year": 2026,
    "rating": 4.9,
    "duration": "1 Temporada",
    "genres": [
      "35-comedy",
      "18-drama"
    ],
    "tmdbId": 283609,
    "synopsis": "O azarado Subbu é designado para ensinar educação sexual em uma comunidade nada acolhedora. E precisa fazer o trabalho dar certo sem despertar a ira do pai conservador.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/bwb5oPnZAdRwKusI8So8Sx1bcL4.jpg",
    "banner": "https://image.tmdb.org/t/p/original/9uOZUDapEqN8qiJ3z8aSCj5k488.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/283609/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "bones-25-dreaming-forward-246233",
    "title": "BONES 25: DREAMING FORWARD",
    "year": 2024,
    "rating": 4.9,
    "duration": "1 Temporada",
    "genres": [
      "99-documentary"
    ],
    "tmdbId": 246233,
    "synopsis": "O documentário BONES 25: DREAMING FORWARD celebra os 25 anos do estúdio de animação japonês BONES. A série em quatro partes explora a trajetória e os bastidores das produções icônicas da empresa, trazendo entrevistas exclusivas com mais de 30 criadores e funcionários.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/vGf5AFH2n0xtlhLnVmmhFryRP2O.jpg",
    "banner": "https://image.tmdb.org/t/p/original/Agq6tnsEgNiccaVahUYWOxh2O0y.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/246233/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "botched-desastres-do-bisturi-62317",
    "title": "Botched: Desastres do Bisturi",
    "year": 2014,
    "rating": 4.4,
    "duration": "1 Temporada",
    "genres": [
      "10764-reality"
    ],
    "tmdbId": 62317,
    "synopsis": "Os renomados cirurgiões plásticos de Los Angeles, Terry Dubrow e Paul Nassif, conseguem corrigir os procedimentos estéticos desastrosos de seus pacientes.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/CjAyzlaM8bxaNnj8Jg3ox91LD6.jpg",
    "banner": "https://image.tmdb.org/t/p/original/dxnEQOQgfoki1qZVxSOyIwG1WHO.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/62317/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "ultras-paixao-e-morte-325858",
    "title": "Ultras: Paixão e Morte",
    "year": 2026,
    "rating": 4.4,
    "duration": "1 Temporada",
    "genres": [
      "99-documentary"
    ],
    "tmdbId": 325858,
    "synopsis": "Docussérie que examina, ao lado de policiais, jornalistas e ex-integrantes, o movimento ultra e os crimes que marcaram o futebol espanhol.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/4RekSXVNXuUEu4qtiaTFdmvVgjD.jpg",
    "banner": "https://image.tmdb.org/t/p/original/aVm5DI5apmc6yJHyqSA1VWOZb6Z.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/325858/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "nao-tenho-medo-290232",
    "title": "Não Tenho Medo",
    "year": 2026,
    "rating": 4.5,
    "duration": "1 Temporada",
    "genres": [
      "18-drama"
    ],
    "tmdbId": 290232,
    "synopsis": "Após presenciar algo terrível, um menino conhece a realidade brutal da vida, testemunhando o desespero e a sobrevivência em uma cidade à beira do caos.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/cXdLcQJBgzGGL1qjUM2ZyqnMTCo.jpg",
    "banner": "https://image.tmdb.org/t/p/original/9eHQh4Ji4wWksUSln264LZt3NfL.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/290232/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "squatters-get-the-f-out-of-my-house-324562",
    "title": "Squatters: Get the F*** Out of My House",
    "year": 2026,
    "rating": 4.6,
    "duration": "1 Temporada",
    "genres": [
      "99-documentary"
    ],
    "tmdbId": 324562,
    "synopsis": "Acompanha o drama real de proprietários nos EUA lutando contra invasores que exploram brechas legais para morar de graça e assumir o controle de suas residências.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/yIhz2K69CdyyP5gxskI2L7AQW89.jpg",
    "banner": "https://image.tmdb.org/t/p/original/gZV3R6jYdt6hHTZmtxTEs1SFIqz.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/324562/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "masters-of-sex-58937",
    "title": "Masters of Sex",
    "year": 2013,
    "rating": 4.9,
    "duration": "1 Temporada",
    "genres": [
      "18-drama"
    ],
    "tmdbId": 58937,
    "synopsis": "Durante os anos 50, os cientistas William Masters e Virginia Johnson realizaram pesquisas sobre o comportamento sexual humano. Seus estudos impulsionaram a revolução sexual e fizeram com que ficassem conhecidos em todo Estados Unidos, o que é uma surpresa para duas pessoas da pequena cidade de Saint Louis. Os romances, o dia a dia incomum e o caminho percorrido pela dupla são objeto da série.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/bC42ksckQpjfck2BZ5McaEDN4pk.jpg",
    "banner": "https://image.tmdb.org/t/p/original/5evkOLJ3HlYrwpy6Q5DlubiHzCJ.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/58937/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "a-salsa-de-salcedo-327787",
    "title": "A Salsa de Salcedo",
    "year": 2026,
    "rating": 4.5,
    "duration": "1 Temporada",
    "genres": [
      "18-drama"
    ],
    "tmdbId": 327787,
    "synopsis": "Ambientada na vibrante vida noturna, a trama acompanha Martín Salcedo em um mundo frenético onde cada passo de salsa e dança pode esconder segredos, paixões perigosas e intensas rivalidades.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/6YJwwuKbJvV8nwK97nH1rsfmLFh.jpg",
    "banner": "https://image.tmdb.org/t/p/original/zpTNB0licXtjKPA7DIYskbfd01U.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/327787/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "diogo-na-cozinha-282859",
    "title": "Diogo na Cozinha",
    "year": 2025,
    "rating": 4.5,
    "duration": "1 Temporada",
    "genres": [
      "10764-reality"
    ],
    "tmdbId": 282859,
    "synopsis": "Diogo Nogueira recebe em sua casa grandes artistas da música para encontros em torno de deliciosas receitas, mostrando que a cozinha é o lugar perfeito para conexões autênticas.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/cRk6xmPFjjRJYmtsupE9fVWTKun.jpg",
    "banner": "https://image.tmdb.org/t/p/original/c5hAPQvtdp26h7Ud9lHPsrlSWvO.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/282859/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "os-pioneiros-1781",
    "title": "Os Pioneiros",
    "year": 1974,
    "rating": 4.5,
    "duration": "1 Temporada",
    "genres": [
      "37-western",
      "18-drama",
      "10751-family"
    ],
    "tmdbId": 1781,
    "synopsis": "A história se passa no século XIX e é protagonizado pelos Ingalls, uma família pura e unida que vivia numa pequena casa na pradaria, num pequeno povoado chamado Walnut Grove. Charles Phillip Ingalls é casado com Caroline Lake Quiner Ingalls, com quem teve três filhas: Mary, Laura e Carrie.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/iPbWZcxiuMyzcoKjE7tzImyPpt.jpg",
    "banner": "https://image.tmdb.org/t/p/original/uCvpgfY4oTeZxEcFqm1ATJkDDmu.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/1781/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "nurse-the-dead-313323",
    "title": "Nurse the Dead",
    "year": 2026,
    "rating": 4.7,
    "duration": "1 Temporada",
    "genres": [
      "35-comedy",
      "18-drama"
    ],
    "tmdbId": 313323,
    "synopsis": "Tasked with saving LA’s most haunted hospital ward, a highly motivated Filipina nurse with a third eye must manage unruly ghosts, burned-out staff, and one judgmental “coworker” who knows her better than anyone should.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/iyknfrYDm4yTFq6SoAYpeTE2KH.jpg",
    "banner": "https://image.tmdb.org/t/p/original/zsUezMyRfRUB3GklttCv6JCe0ve.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/313323/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "os-westies-donos-do-oeste-286709",
    "title": "Os Westies: Donos do Oeste",
    "year": 2026,
    "rating": 4.3,
    "duration": "1 Temporada",
    "genres": [
      "18-drama",
      "80-crime"
    ],
    "tmdbId": 286709,
    "synopsis": "Problemas com a Máfia italiana iniciam uma guerra entre os Donos do Oeste, quando o chefe Eamon Sweeney enfrenta uma rebelião interna. Enquanto Sweeney se alinha a Castellano e Gotti, seu protegido Jimmy Roarke insiste em um novo futuro, correndo risco de guerra, escrutínio do FBI e uma trama do IRA em Nova York.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/vpdjc9E0V4zdvHnfg3vFwmSw5jd.jpg",
    "banner": "https://image.tmdb.org/t/p/original/tT2MwxaST3Fx1Dg4u9v82sDrIu.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/286709/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "youre-killing-me-320430",
    "title": "You're Killing Me",
    "year": 2026,
    "rating": 4.4,
    "duration": "1 Temporada",
    "genres": [
      "80-crime"
    ],
    "tmdbId": 320430,
    "synopsis": "Uma romancista de sucesso e uma aspirante a escritora unem forças para resolver o assassinato de sua amiga, formando uma aliança inesperada enquanto procuram o assassino.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/vxPvBU1V84mX5O5089N3pNzXfrW.jpg",
    "banner": "https://image.tmdb.org/t/p/original/wKSZnV70x2oZ20BPWAfPepOn0OH.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/320430/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "lord-of-the-flies-270572",
    "title": "Lord of the Flies",
    "year": 2026,
    "rating": 4.3,
    "duration": "1 Temporada",
    "genres": [
      "18-drama",
      "10759-action-adventure"
    ],
    "tmdbId": 270572,
    "synopsis": "Um grupo de garotos britânicos que ficam presos em uma ilha tropical desocupada e que gradualmente caem na anarquia à medida que as convenções sociais desaparecem e as tentativas de governar com responsabilidade fracassam.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/8goD74qAw3eU3BsxMLT3wCNnDOk.jpg",
    "banner": "https://image.tmdb.org/t/p/original/yRqFvu6rIytqZlzY0pBVvZG3W0S.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/270572/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "love-algorithm-328150",
    "title": "Love Algorithm",
    "year": 2026,
    "rating": 4.3,
    "duration": "1 Temporada",
    "genres": [
      "18-drama"
    ],
    "tmdbId": 328150,
    "synopsis": "A dating reality show writer reunites with his estranged high school best friend after casting the popular singer in the show's latest season.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/eLtKtcucvdVbX2ETy7uPsRUYL8m.jpg",
    "banner": "https://image.tmdb.org/t/p/original/rtfuNfy7LUyfHceV7iaq8aoSk8X.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/serie/328150/1/1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "os-embalos-de-sabado-continuam-10805",
    "title": "Os Embalos de Sábado Continuam",
    "year": 1983,
    "rating": 4.8,
    "duration": "1h 55m",
    "genres": [
      "18-drama",
      "10402-music",
      "10749-romance"
    ],
    "tmdbId": 10805,
    "synopsis": "Nesta sequência de Os Embalos de Sábado à Noite, o ex-rei da discoteca Tony Manero deixou o Brooklyn e mora em Manhattan. Ele se hospeda em um hotel barato e trabalha como instrutor de dança e garçom de boate, tentando se tornar um dançarino profissional da Broadway. O distanciamento da vida no Brooklyn, da família e dos amigos amadureceu Tony e refinou sua personalidade, representada pelo sotaque atenuado e pela evitação de álcool e palavrões. Mas certas atitudes não mudaram, como a de sua namorada mais recente, que canta em uma banda de rock local.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/zOLfw1dPgL9feu8vTzJ8XOpMngd.jpg",
    "banner": "https://image.tmdb.org/t/p/original/iyFHI7gbp5WvzouookqZdjImHmx.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/10805",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "studio-54-3682",
    "title": "Studio 54",
    "year": 1998,
    "rating": 4.5,
    "duration": "1h 55m",
    "genres": [
      "18-drama",
      "10402-music"
    ],
    "tmdbId": 3682,
    "synopsis": "Nos anos 70, o Studio 54 foi a discoteca que agitava a vida noturna de Nova York com todo o frenesi que lhe deu uma reputação internacional. Steve Rubell, o dono e idealizador, tentava transformar seu sonho em realidade ao dar as melhores festas que o mundo tinha visto.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/h9cBNxRfpX8JGJuy7R6YN4PStKC.jpg",
    "banner": "https://image.tmdb.org/t/p/original/rGaXfUvsnIK32RikoCnYKoYsQNc.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/3682",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "grease-2-os-tempos-da-brilhantina-voltaram-9037",
    "title": "Grease 2: Os Tempos da Brilhantina Voltaram",
    "year": 1982,
    "rating": 4.3,
    "duration": "1h 55m",
    "genres": [
      "35-comedy",
      "10402-music",
      "10749-romance"
    ],
    "tmdbId": 9037,
    "synopsis": "Em um colégio, um concurso de talentos provoca uma disputa interna. Enquanto isto, um novo aluno, que veio da Inglaterra, fica apaixonado por uma bela jovem. Mas como ela sonha em ter um motoqueiro como namorado, ele começa a fazer os trabalhos escolares de seus colegas para ganhar dinheiro para comprar sua moto e se transformar em um misterioso motoqueiro, que impressiona a todos.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/6hpNiJurw8A5f1aJKRqInNmQmtd.jpg",
    "banner": "https://image.tmdb.org/t/p/original/oScpMm0gmUMf7EY6vKomi7tboc6.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/9037",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "sound-euphonium-ensemble-contest-1108306",
    "title": "Sound! Euphonium: Ensemble Contest",
    "year": 2023,
    "rating": 4.6,
    "duration": "1h 55m",
    "genres": [
      "16-animation",
      "18-drama",
      "10402-music"
    ],
    "tmdbId": 1108306,
    "synopsis": "Aguardando o novo líder do clube, Kumiko, está o Ensemble Contest - também conhecido como \"EnCon\" - e a competição preliminar da escola para determinar a equipe representativa a participar. Kumiko faz o possível para chegar às preliminares sem incidentes, mas o clube da banda de concerto é tão grande que parece não haver fim para os problemas... E como líder do clube, ela se encontra ocupada prestando consultoria em todos os tipos de assuntos. . Enquanto os membros do clube decidem seus times, a própria Kumiko ainda nem decidiu em qual deles irá ingressar...",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/99YitBYi50vi5guPRuy5yAH1614.jpg",
    "banner": "https://image.tmdb.org/t/p/original/dNW8mR87Z85U5c6v264ciFv0Ilj.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1108306",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "james-brown-live-at-the-boston-garden-april-5-1968-149574",
    "title": "James Brown Live At The Boston Garden - April 5, 1968",
    "year": 2008,
    "rating": 4.7,
    "duration": "1h 55m",
    "genres": [
      "10402-music"
    ],
    "tmdbId": 149574,
    "synopsis": "Live at the Boston Garden: April 5, 1968 is a concert film starring James Brown. Recorded at the Boston Garden by WGBH-TV the night after the assassination of Martin Luther King, Jr., it was broadcast live in an effort to quell potential riots in the city. The recording circulated as a bootleg before it was officially released on DVD by Shout! Factory in 2008 as part of the box set I Got the Feelin': James Brown in the '60s. It received a stand-alone release in 200",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/8DKcuXCUXNk99HnFVXAg6vMuh1M.jpg",
    "banner": "https://image.tmdb.org/t/p/original/8DKcuXCUXNk99HnFVXAg6vMuh1M.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/149574",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "a-roda-da-fortuna-29376",
    "title": "A Roda da Fortuna",
    "year": 1953,
    "rating": 4.9,
    "duration": "1h 55m",
    "genres": [
      "10402-music",
      "35-comedy",
      "10749-romance"
    ],
    "tmdbId": 29376,
    "synopsis": "Tony Hunter, famoso astro do cinema musical, teme que sua carreira esteja no fim, mas seus amigos Lester e Lily escrevem um pequeno show na Broadway para ajudá-lo. Tony fica entusiasmado, e até o diretor egoísta, Jeffrey Cordova, junta-se ao projeto e lança a bailarina Gaby Gerard como protagonista. A segunda chance de Tony parece estar desaparecendo, mas ele pode conseguir muito mais do que esperava.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/gYINlLGUVcqPsb7VxCy8zEMhbq0.jpg",
    "banner": "https://image.tmdb.org/t/p/original/bud4H3I6X9b9HIcilAb33k6mNES.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/29376",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "musica-do-coracao-26149",
    "title": "Música do Coração",
    "year": 1999,
    "rating": 4.6,
    "duration": "1h 55m",
    "genres": [
      "18-drama",
      "10402-music"
    ],
    "tmdbId": 26149,
    "synopsis": "A história da luta de uma professora (Roberta Guaspari) para ensinar violino para crianças no Harlem em NY.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/yKbzT8q9b65hc1eIZxuRsLxopi7.jpg",
    "banner": "https://image.tmdb.org/t/p/original/1RQj9GlPMU1iHoGVDal3G5NOQRF.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/26149",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "as-viagens-de-gulliver-18974",
    "title": "As Viagens de Gulliver",
    "year": 1960,
    "rating": 4.8,
    "duration": "1h 55m",
    "genres": [
      "10402-music",
      "12-adventure",
      "14-fantasy"
    ],
    "tmdbId": 18974,
    "synopsis": "Gulliver é um intrépido médico que embarca em busca de fama e fortuna nas míticas Índias Orientais, nesta adaptação do inesquecível clássico de Jonathan Swift. Durante as suas incríveis aventuras, descobrirá todos os segredos de Brobdingnag (a Terra dos Gigantes) e de Lilliput (a Terra dos Anões). Repleto de efeitos especiais e de truques de perspectiva nunca utilizados até esse momento, \"As Viagens de Gulliver\" é uma maravilhosa fantasia do mago dos efeitos especiais Ray Harryhausen.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/rCsS5LtZSu10XV9i7QUisfCSWM4.jpg",
    "banner": "https://image.tmdb.org/t/p/original/zRKr3JVlzA0MH4NicexFZm6aIX9.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/18974",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "taurus-844547",
    "title": "Taurus",
    "year": 2022,
    "rating": 4.8,
    "duration": "1h 55m",
    "genres": [
      "18-drama",
      "10402-music"
    ],
    "tmdbId": 844547,
    "synopsis": "Um músico em ascensão, mas problemático, busca inspiração para gravar uma última música, empurrando-se profundamente no vazio.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/bWH1s160oYX1vybg3zPnL4ygMpw.jpg",
    "banner": "https://image.tmdb.org/t/p/original/pVgjxcKmplPkzNqsQMIMv1b8VMB.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/844547",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "tubaroes-de-perto-com-bertie-gregory-tubarao-martelo-1723068",
    "title": "Tubarões de Perto com Bertie Gregory: Tubarão-martelo",
    "year": 2026,
    "rating": 4.2,
    "duration": "1h 55m",
    "genres": [
      "99-documentary"
    ],
    "tmdbId": 1723068,
    "synopsis": "Nas águas do Pacífico mexicano, Bertie Gregory busca um dos predadores mais icônicos do oceano: o tubarão-martelo. Antes abundante, a população da espécie despencou, e os avistamentos se tornaram raros. Bertie investiga o que está por trás do declínio e como as águas protegidas são uma esperança para o futuro. Sua jornada culmina em um encontro raro e inesquecível que lança uma luz sobre o futuro de um dos tubarões mais famosos do mundo.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/n8zyzS02nwHwUoxu5YpCUhvLM4X.jpg",
    "banner": "https://image.tmdb.org/t/p/original/50rAhx0C6yo3jd4sINDZkcsyNnK.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1723068",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "o-silencio-das-ostras-1352381",
    "title": "O Silêncio das Ostras",
    "year": 2025,
    "rating": 4.6,
    "duration": "1h 55m",
    "genres": [
      "18-drama"
    ],
    "tmdbId": 1352381,
    "synopsis": "A vida de uma menina que nasceu em uma vila de operários de uma mina e tem que aprender a lidar com as sucessivas perdas que a vida lhe reservou. Depois de perder todos os seus mundos, Kaylane insiste em sobreviver e resistir. Um filme sobre crescer, sobreviver e sonhar em meio à poeira, à lama e ao silêncio.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/lYrPJTWEUslWsB0tOSrf0cA26fz.jpg",
    "banner": "https://image.tmdb.org/t/p/original/8gVzmc0AOyEMpv59uhNdpYRB4mp.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1352381",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "pau-darco-1449004",
    "title": "Pau D'Arco",
    "year": 2025,
    "rating": 4.5,
    "duration": "1h 55m",
    "genres": [
      "99-documentary"
    ],
    "tmdbId": 1449004,
    "synopsis": "Depois de sobreviver à chacina em que a polícia matou dez sem-terra em uma fazenda na Amazônia Paraense, Fernando, a principal testemunha do crime, e Vargas, seu advogado, lutam por justiça e pelo direito à terra.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/iB5nwpmZC4RHXFhOJyv9iaw5Pda.jpg",
    "banner": "https://image.tmdb.org/t/p/original/3XlBUAntxrZNEnM0FzuwoAVrmnv.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1449004",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "rejeito-1106590",
    "title": "Rejeito",
    "year": 2023,
    "rating": 4.6,
    "duration": "1h 55m",
    "genres": [
      "99-documentary"
    ],
    "tmdbId": 1106590,
    "synopsis": "Após os maiores rompimentos de barragens de rejeito da história, novas barragens ameaçam romper sobre milhões de pessoas em Minas Gerais. Uma conselheira ambiental do Estado confronta o modus operandi do governo e mineradoras, enquanto moradores resistem em suas comunidades ameaçadas.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/8HqU65UxAT9xUjeBxLG0EoizsHR.jpg",
    "banner": "https://image.tmdb.org/t/p/original/kESgj4T64xWeIBRkZjW9L8BkU35.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1106590",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "uma-amizade-para-recordar-1376511",
    "title": "Uma Amizade para Recordar",
    "year": 2025,
    "rating": 4.7,
    "duration": "1h 55m",
    "genres": [
      "18-drama",
      "10751-family"
    ],
    "tmdbId": 1376511,
    "synopsis": "Molly O'Brien é uma premiada jornalista esportiva que possui uma carreira agitada e tem pouco tempo para sua família. Mas a morte de um velho amigo a faz refletir sobre a sua infância e tudo o que tem perdido.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/tlSRvlexHMIiygEclzwWc0GIjAa.jpg",
    "banner": "https://image.tmdb.org/t/p/original/ghRcI0IUIW2O6nK5MusnMLmXykX.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1376511",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "escalando-o-everest-de-chinelos-1083324",
    "title": "Escalando o Everest de Chinelos",
    "year": 2024,
    "rating": 4.3,
    "duration": "1h 55m",
    "genres": [
      "35-comedy",
      "18-drama"
    ],
    "tmdbId": 1083324,
    "synopsis": "Com quase quarenta anos e recém separada de seu marido, Pauline é obrigada a morar na sala de estar da casa de seu irmão enquanto luta para criar seu filho autista de seis anos.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/5FsGF8LbFweTcFC9KRvjKykygm2.jpg",
    "banner": "https://image.tmdb.org/t/p/original/guztFZCZ90v5x1DJT8XhSLO0xuT.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1083324",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "fogo-contra-fogo-1092803",
    "title": "Fogo Contra Fogo",
    "year": 2023,
    "rating": 4.8,
    "duration": "1h 55m",
    "genres": [
      "28-action",
      "53-thriller",
      "80-crime"
    ],
    "tmdbId": 1092803,
    "synopsis": "Após perder sua esposa para o crime organizado, um ex-agente do FBI descobre que os criminosos estão atrás de sua filha. Para proteger a vida de quem eles mais amam, pai e filha precisarão se preparar para o confronto.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/44X4UuVxeTjCzKeDsDWGq9uyEHV.jpg",
    "banner": "https://image.tmdb.org/t/p/original/7urValROCOEnbTOgmchw8iZpyPR.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1092803",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "gaby-uma-historia-verdadeira-191550",
    "title": "Gaby - Uma História Verdadeira",
    "year": 1987,
    "rating": 4.3,
    "duration": "1h 55m",
    "genres": [
      "18-drama",
      "10749-romance"
    ],
    "tmdbId": 191550,
    "synopsis": "Filha de refugiados europeus no México nascida com paralisia cerebral que afetou o corpo, mas não a mente, Gaby é encorajada pelos pais e pela babá a jamais desanimar com a deficiência. Ela vai à universidade e se torna uma aclamada escritora.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/wecCBEySqd7cbWG7oojQ5YnesJd.jpg",
    "banner": "https://image.tmdb.org/t/p/original/G9unAw1LAji9LNPKt7BmH9WlYO.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/191550",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "festival-charlie-chaplin-593804",
    "title": "Festival Charlie Chaplin",
    "year": 1941,
    "rating": 4.4,
    "duration": "1h 55m",
    "genres": [
      "35-comedy"
    ],
    "tmdbId": 593804,
    "synopsis": "‎Quatro curtas chaplin de 1917: The Adventurer, The Cure, Easy Street e The Immigrant, apresentados com música e efeitos sonoros. ‎",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/kZqVmoHksjX1FANINggnaoCmwIn.jpg",
    "banner": "https://image.tmdb.org/t/p/original/vka8CtZnuFCt52FB6szt9447kYI.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/593804",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "anjos-da-guerra-1275255",
    "title": "Anjos da Guerra",
    "year": 2026,
    "rating": 4.7,
    "duration": "1h 55m",
    "genres": [
      "18-drama",
      "36-history",
      "10752-war"
    ],
    "tmdbId": 1275255,
    "synopsis": "Em novembro de 1941, no início do rigoroso inverno, jovens atletas de barcos no gelo cruzam gelo fino em Leningrado. Entregar munição se transforma em salvar órfãos, unindo ex-rivais para sobreviver e trazer esperança.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/cbYQM3LVXHFjdRcw4thB0SszV0X.jpg",
    "banner": "https://image.tmdb.org/t/p/original/eREQrp6Z9D32LdbcEOBB9CnK3FG.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1275255",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "o-advogado-de-deus-1292079",
    "title": "O Advogado de Deus",
    "year": 2026,
    "rating": 4.9,
    "duration": "1h 55m",
    "genres": [
      "18-drama"
    ],
    "tmdbId": 1292079,
    "synopsis": "Daniel é um advogado recém-formado que enfrenta conflitos familiares por discordar dos negócios do pai, que é deputado federal. Ao lado de um amigo, o rapaz se envolve em uma causa que remonta a vidas passadas, descobrindo que está ligado a uma trama espiritual complexa.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/cznm4sLHV1bKqUNhiLvfItifnLG.jpg",
    "banner": "https://image.tmdb.org/t/p/original/lzdABFABF7Cu9i03wHEi4riQbOm.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1292079",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "miguel-angel-blanco-as-48-horas-que-mudaram-a-espanha-1722713",
    "title": "Miguel Ángel Blanco: As 48 Horas que Mudaram a Espanha",
    "year": 2026,
    "rating": 4.6,
    "duration": "1h 55m",
    "genres": [
      "99-documentary"
    ],
    "tmdbId": 1722713,
    "synopsis": "Este documentário explora como o sequestro de Miguel Ángel Blanco em 1997 transformou o medo em resistência coletiva e moldou a luta da Espanha contra o terrorismo do ETA.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/sGG27jtVbmJ6xPwa8MINgGYavE5.jpg",
    "banner": "https://image.tmdb.org/t/p/original/6QdbhPXNVFJ3cVCCFscOulC3Bpa.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1722713",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "naufragio-o-pesadelo-do-costa-concordia-1715492",
    "title": "Naufrágio: O Pesadelo do Costa Concordia",
    "year": 2026,
    "rating": 4.3,
    "duration": "1h 55m",
    "genres": [
      "99-documentary"
    ],
    "tmdbId": 1715492,
    "synopsis": "Imagens inéditas e relatos de sobreviventes reconstituem o naufrágio de um cruzeiro de luxo em 2012 e o desastre que se seguiu, neste documentário imersivo.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/4LuFhKoO1NXZiB7R3Cu4Eiw1GWR.jpg",
    "banner": "https://image.tmdb.org/t/p/original/n6TYhOl8NYSoIl8q6dI16IZiodB.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1715492",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "o-genio-do-crime-1488583",
    "title": "O Gênio do Crime",
    "year": 2026,
    "rating": 4.7,
    "duration": "1h 55m",
    "genres": [
      "35-comedy",
      "12-adventure"
    ],
    "tmdbId": 1488583,
    "synopsis": "Durante a Copa do Mundo, o álbum de figurinhas é a maior febre entre os alunos do Colégio Tres Bandeiras. Gordo, líder de um grupo empenhado em completar o álbum, descobre uma operação de falsificação de figurinhas, até então, impossível de ser desvendada. Ao lado dos amigos - e de Berenice, uma garota esperta por quem se apaixona - ele embarca numa investigação cheia de suspense, aventura e humor, onde a paixão pelo futebol se une à busca por justiça.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/g3Ztdj2KM1WUvYrPzq2SKM8V3Sd.jpg",
    "banner": "https://image.tmdb.org/t/p/original/9ISyiBOY6CCeGpSsUyVOCpFEpNQ.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1488583",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "trunfo-1484913",
    "title": "Trunfo",
    "year": 2026,
    "rating": 4.5,
    "duration": "1h 55m",
    "genres": [
      "18-drama",
      "53-thriller"
    ],
    "tmdbId": 1484913,
    "synopsis": "Com a vida de uma pessoa querida em jogo, um advogado renomado precisa defender um homem que acredita ser culpado, enquanto luta contra a própria consciência.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/gbg2dqK1zIvvSyTMaCJ4g22Pl9l.jpg",
    "banner": "https://image.tmdb.org/t/p/original/uy16Ktm9blPb1DAoN6h5MwlBJ6V.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1484913",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "cobb-a-lenda-29973",
    "title": "Cobb, A Lenda",
    "year": 1994,
    "rating": 4.2,
    "duration": "1h 55m",
    "genres": [
      "18-drama"
    ],
    "tmdbId": 29973,
    "synopsis": "Enquanto escreve a biografia do seu ídolo, um repórter descobre que ele está longe de ser herói e precisa decidir se revela ou não a verdade.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/kIYnU9WyxTqok2wt5M2Xe267Xs4.jpg",
    "banner": "https://image.tmdb.org/t/p/original/1ZpyiQWRS95hixy6ajtJk4WVduZ.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/29973",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "um-pesadelo-maravilhoso-1633263",
    "title": "Um Pesadelo Maravilhoso",
    "year": 2026,
    "rating": 4.6,
    "duration": "1h 55m",
    "genres": [
      "18-drama",
      "35-comedy",
      "14-fantasy"
    ],
    "tmdbId": 1633263,
    "synopsis": "A protagonista leva uma vida de luxo e sucesso profissional, mas a sua morte inesperada vira tudo de cabeça para baixo. Ao chegar \"do outro lado\", é constatado que houve um equívoco com o seu destino. Para reparar o erro e ganhar uma segunda chance, ela é enviada de volta à vida mortal, mas com uma condição: ela terá que assumir a rotina de uma mulher comum, pobre, casada e mãe de dois filhos.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/yF2VjrEfU3C4hNCz4gCwKqXuy3J.jpg",
    "banner": "https://image.tmdb.org/t/p/original/9JgPIYH9I5KMGuJHwKjghoaazok.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1633263",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "19-outra-vez-1249199",
    "title": "19 Outra Vez",
    "year": 2024,
    "rating": 4.8,
    "duration": "1h 55m",
    "genres": [
      "35-comedy"
    ],
    "tmdbId": 1249199,
    "synopsis": "Kate está cansada em tentar ser uma boa mãe. Após passar por uma experiência traumática, sua mente regride para o período em que ela era apenas uma universitária de dezenove anos.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/NAarJ6i1OJ4aEQKuM6Kw43i2nT.jpg",
    "banner": "https://image.tmdb.org/t/p/original/tKOnWT7sWoVGTBK2DRLrV2G3TbN.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1249199",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "onde-estiver-estarei-uma-paixao-rubro-negra-1703741",
    "title": "Onde Estiver Estarei: Uma Paixão Rubro-negra",
    "year": 2026,
    "rating": 4.6,
    "duration": "1h 55m",
    "genres": [
      "99-documentary"
    ],
    "tmdbId": 1703741,
    "synopsis": "Este emocionante documentário retrata a paixão e o sentimento de pertencimento dos torcedores do Flamengo ao longo das históricas campanhas da Copa Libertadores de 1981 e 2019, e da incansável espera de 38 anos entre as duas conquistas.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/xU0dutVC6FP16oYhIXHuFaUZddw.jpg",
    "banner": "https://image.tmdb.org/t/p/original/xU0dutVC6FP16oYhIXHuFaUZddw.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1703741",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "ardente-vinganca-1380316",
    "title": "Ardente Vingança",
    "year": 2026,
    "rating": 4.5,
    "duration": "1h 55m",
    "genres": [
      "18-drama",
      "53-thriller"
    ],
    "tmdbId": 1380316,
    "synopsis": "Duas irmãs buscam vingança enquanto confrontam o passado de sua família na estreia de Aleshea Harris na direção, adaptação de sua peça premiada.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/9qrWHR8GUJOO95jHeG0jDTTF1m7.jpg",
    "banner": "https://image.tmdb.org/t/p/original/kmS3arkEsybCEw0ddWhDVQxCXf5.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1380316",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "pai-em-tempo-integral-1440050",
    "title": "Pai em Tempo Integral",
    "year": 2026,
    "rating": 4.3,
    "duration": "1h 55m",
    "genres": [
      "35-comedy",
      "10751-family"
    ],
    "tmdbId": 1440050,
    "synopsis": "Estrelado pelo comediante Nate Bargatze como o vendedor Nate Wilcox e Mandy Moore como sua esposa, Katie. Para Nate e os três filhos, Katie é a mãe perfeita. Mas quando sua invenção doméstica rende uma oportunidade única no Shark Tank e a leva a uma longa viagem de trabalho, Nate precisa evitar que a casa (literalmente) desabe. Bem-vindo à era do pai.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/k2TdrNWJHWpdTYZaJivu8bk5KAF.jpg",
    "banner": "https://image.tmdb.org/t/p/original/dgqBcgTzaUiSLvKJPDF9AbdFEMO.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1440050",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "queridos-cresci-701437",
    "title": "Queridos, Cresci!",
    "year": 2020,
    "rating": 4.4,
    "duration": "1h 55m",
    "genres": [
      "35-comedy"
    ],
    "tmdbId": 701437,
    "synopsis": "Um casal enfrenta os desafios da adolescência da filha e aposta em métodos educativos nada convencionais para restaurar a harmonia familiar.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/pQQVDyuNOoAzwRIxqLHlrtFi521.jpg",
    "banner": "https://image.tmdb.org/t/p/original/uYIq2wed1Uoq6FBQ3oyl4JsRW3a.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/701437",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "shoguns-ninja-1438203",
    "title": "Shogun's Ninja",
    "year": 2025,
    "rating": 4.5,
    "duration": "1h 55m",
    "genres": [
      "28-action",
      "36-history"
    ],
    "tmdbId": 1438203,
    "synopsis": "A história se passa em Edo no século 17, uma era de paz nunca antes vista, onde samurais detém o poder sob o governo do Xogum Ieyasu Tokugawa. No entanto, por trás dessa tranquilidade, se desenha uma história de vingança e sobrevivência.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/uEC6p2Wl9kJmjCo4p6983aREuve.jpg",
    "banner": "https://image.tmdb.org/t/p/original/iwt36Pst6XYNBoAQJ1afK9zBCCS.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1438203",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "armadilha-mortal-1338972",
    "title": "Armadilha Mortal",
    "year": 2025,
    "rating": 4.7,
    "duration": "1h 55m",
    "genres": [
      "28-action",
      "27-horror",
      "53-thriller"
    ],
    "tmdbId": 1338972,
    "synopsis": "Durante um fim de semana de acampamento, Scott cai em uma cova armadilhada com estacas e fica preso a dez metros. Enquanto luta para sobreviver, os amigos descobrem que a floresta esconde um caçador implacável - a queda foi só o começo.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/yW7oEJQxPaTCZRD4y4vhMg4EC57.jpg",
    "banner": "https://image.tmdb.org/t/p/original/ldCs9t4DpbiHRPA8gOe66OzmVEy.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1338972",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "king-ivory-vicio-das-ruas-1155324",
    "title": "King Ivory: Vício das Ruas",
    "year": 2025,
    "rating": 4.5,
    "duration": "1h 55m",
    "genres": [
      "80-crime",
      "18-drama",
      "53-thriller"
    ],
    "tmdbId": 1155324,
    "synopsis": "A fentanila (também conhecida como \"King Ivory\") é traficada por gangues de prisões estaduais. Layne West, um policial de Oklahoma, está à caça do Cartel 777 e de seu atual líder, Ramon. O caso se torna ainda mais pessoal quando o filho adolescente de West, Jack, começa a usar fentanila, o que tem efeitos devastadores sobre aqueles que estão mais próximos dele.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/tcLnCy7fWFbucfPUBu0fGplftAW.jpg",
    "banner": "https://image.tmdb.org/t/p/original/lUvZ5DbcmPBFuTxLFEnSbsscpOe.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1155324",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "golden-kamuy-3-invasao-a-prisao-abashiri-1397201",
    "title": "Golden Kamuy 3 - Invasão a Prisão Abashiri",
    "year": 2026,
    "rating": 4.3,
    "duration": "1h 55m",
    "genres": [
      "28-action",
      "18-drama",
      "36-history"
    ],
    "tmdbId": 1397201,
    "synopsis": "Enquanto cada grupo busca cumprir sua missão, uma batalha feroz se desenrola em torno dos prisioneiros tatuados. Quem é amigo e quem é inimigo? O conflito leva todos à Prisão de Abashiri, onde Noppera-bo — o homem que detém todas as respostas — está encarcerado...",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/clYkNUIdjFhe1PJGYiFEBepyy6k.jpg",
    "banner": "https://image.tmdb.org/t/p/original/eeiZikJBrnx5H5AQOaTD9Lt6DU3.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1397201",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "a-vida-que-eu-quero-1118721",
    "title": "A Vida Que Eu Quero",
    "year": 2023,
    "rating": 4.4,
    "duration": "1h 55m",
    "genres": [
      "35-comedy"
    ],
    "tmdbId": 1118721,
    "synopsis": "Após uma lesão encerrar sua carreira no futebol, Nico leva uma vida comum. Anos depois, o destino lhe oferece uma chance mágica de realizar seu sonho.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/bi7hRJ3afbv27clei4qIqV4k5FW.jpg",
    "banner": "https://image.tmdb.org/t/p/original/bPlmTl2rrnzgRKinLvs4GUd0DPb.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1118721",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "o-verdadeiro-sentido-do-natal-1361240",
    "title": "O Verdadeiro Sentido do Natal",
    "year": 2024,
    "rating": 4.6,
    "duration": "1h 55m",
    "genres": [
      "10749-romance",
      "10770-tv-movie"
    ],
    "tmdbId": 1361240,
    "synopsis": "Uma herdeira mimada é encarregada de recompensar os moradores de uma pequena cidade cuja generosidade salvou sua vida anos atrás.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/cerKpX1lZRtbpugmmLUJBIUTrFC.jpg",
    "banner": "https://image.tmdb.org/t/p/original/97bki7asMBZa537VzrBVbgOaRAv.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1361240",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "susana-e-elvira-sem-plano-b-1580803",
    "title": "Susana e Elvira: Sem Plano B",
    "year": 2026,
    "rating": 4.8,
    "duration": "1h 55m",
    "genres": [
      "10749-romance",
      "35-comedy",
      "18-drama"
    ],
    "tmdbId": 1580803,
    "synopsis": "Depois de uma briga feia durante uma viagem, duas mulheres que já foram amigas precisam trabalhar juntas para planejar o casamento de um casal de artistas da cidade.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/l4ygfNJ7PpOa68oqkPOWhZJLWEv.jpg",
    "banner": "https://image.tmdb.org/t/p/original/sSwxsbLD5jpGadBi0pPMzm7rTNS.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1580803",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "golpe-explosivo-1242265",
    "title": "Golpe Explosivo",
    "year": 2026,
    "rating": 4.7,
    "duration": "1h 55m",
    "genres": [
      "28-action",
      "80-crime",
      "18-drama"
    ],
    "tmdbId": 1242265,
    "synopsis": "O centro de Londres entra em pânico com a descoberta de uma bomba da Segunda Guerra Mundial não detonada em um canteiro de obras. Em meio ao caos de uma evacuação em massa, uma quadrilha de criminosos inicia um assalto audacioso.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/8Y2C9CBQLXYc61xuUeLER6jwNdD.jpg",
    "banner": "https://image.tmdb.org/t/p/original/8wIaBCeGv3UhIn5CJOWQGHT1Cif.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1242265",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "o-aniversario-1126336",
    "title": "O Aniversário",
    "year": 2025,
    "rating": 4.5,
    "duration": "1h 55m",
    "genres": [
      "53-thriller",
      "18-drama"
    ],
    "tmdbId": 1126336,
    "synopsis": "Quando o filho de Ellen e Paul apresenta sua nova namorada durante a festa de 25 anos de casamento deles, ninguém imagina que esse é o começo do fim para essa família feliz. A nova namorada é Liz, ex-aluna de Ellen, que deixou a universidade alguns anos antes, depois que Ellen a confrontou em sala de aula por sua ideologia radical.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/7NjwRKKwTGQnBKAYnDBDKjLSzCP.jpg",
    "banner": "https://image.tmdb.org/t/p/original/mNUciC3vHhoskveYsO3hiFypqMz.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://warezcdn.lat/filme/1126336",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "deadpool-wolverine",
    "title": "Deadpool & Wolverine",
    "year": 2024,
    "rating": 4.8,
    "duration": "2h 8m",
    "genres": [
      "Ação",
      "Comédia",
      "Sci-Fi"
    ],
    "tmdbId": 533535,
    "synopsis": "Deadpool e Wolverine se unem para salvar o multiverso.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/cJFqqiDYprqExaXatu4AaoMzDG2.jpg",
    "banner": "https://image.tmdb.org/t/p/original/cOoVcVQ3i1m5b2xtqKBtoTSbxC1.jpg",
    "isRelease": false,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=deadpool-wolverine",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "inside-out-2",
    "title": "Divertida Mente 2",
    "year": 2024,
    "rating": 4.7,
    "duration": "1h 36m",
    "genres": [
      "Animação",
      "Família",
      "Comédia"
    ],
    "tmdbId": 1022789,
    "synopsis": "Novas emoções chegam na mente de Riley adolescente.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/lHKNS35r4RTa9GO72vdadMLxoiV.jpg",
    "banner": "https://image.tmdb.org/t/p/original/p5ozvmdgsmbWe0H8Xk7Rc8SCwAB.jpg",
    "isRelease": false,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=inside-out-2",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "dune-2",
    "title": "Duna: Parte Dois",
    "year": 2024,
    "rating": 4.9,
    "duration": "2h 46m",
    "genres": [
      "Sci-Fi",
      "Aventura",
      "Drama"
    ],
    "tmdbId": 693134,
    "synopsis": "Paul Atreides busca vingança contra os conspiradores.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/8LJJjLjAzAwXS40S5mx79PJ2jSs.jpg",
    "banner": "https://image.tmdb.org/t/p/original/eZ239CUp1d6OryZEBPnO2n87gMG.jpg",
    "isRelease": false,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=dune-2",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "gladiator-2",
    "title": "Gladiador II",
    "year": 2024,
    "rating": 4.6,
    "duration": "2h 30m",
    "genres": [
      "Ação",
      "Aventura",
      "Drama"
    ],
    "tmdbId": 558449,
    "synopsis": "Lucius entra no Coliseu para defender Roma.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/342bly9MqveL65TnEFzx8TTUxcL.jpg",
    "banner": "https://image.tmdb.org/t/p/original/tOqIwliWMovSIZ9DyvHcHI7p2im.jpg",
    "isRelease": false,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=gladiator-2",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "venom-3",
    "title": "Venom: A Última Rodada",
    "year": 2024,
    "rating": 4.5,
    "duration": "1h 49m",
    "genres": [
      "Ação",
      "Sci-Fi",
      "Aventura"
    ],
    "tmdbId": 912649,
    "synopsis": "Eddie e Venom enfrentam sua última rodada.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/eZIIPjL7oGqfmF7Gw5ZnbDjH6yu.jpg",
    "banner": "https://image.tmdb.org/t/p/original/3V4kLQg0kSqPLctI5ziYWabAZYF.jpg",
    "isRelease": false,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=venom-3",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "joker-2",
    "title": "Coringa: Delírio a Dois",
    "year": 2024,
    "rating": 4.4,
    "duration": "2h 18m",
    "genres": [
      "Drama",
      "Crime",
      "Musical"
    ],
    "tmdbId": 889737,
    "synopsis": "Arthur Fleck e Harleen Quinzel vivem um delírio em Arkham.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/9RmVr8dPWicFyPZ5JCQK3NcBNB5.jpg",
    "banner": "https://image.tmdb.org/t/p/original/AVWlQpVhpudyFsSh3OQIieHHYf.jpg",
    "isRelease": false,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=joker-2",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "oppenheimer",
    "title": "Oppenheimer",
    "year": 2023,
    "rating": 4.8,
    "duration": "3h 0m",
    "genres": [
      "Biografia",
      "Drama",
      "História"
    ],
    "tmdbId": 872585,
    "synopsis": "A história do pai da bomba atômica.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/1OsQJEoSXBjduuCvDOlRhoEUaHu.jpg",
    "banner": "https://image.tmdb.org/t/p/original/neeNHeXjMF5fXoCJRsOmkNGC7q.jpg",
    "isRelease": false,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=oppenheimer",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "obsessao",
    "title": "Obsessão",
    "year": 2026,
    "rating": 4.5,
    "duration": "1h 40m",
    "genres": [
      "Terror",
      "Suspense"
    ],
    "tmdbId": 1339713,
    "synopsis": "Um romântico compra um brinquedo com desejos sinistros.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/original/c1Yg0Lxj5SR0C1VxpvAAf15jFvi.jpg",
    "banner": "https://image.tmdb.org/t/p/original/rZfmzpixLKLR3Hg2u0WgC7XLFl8.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=obsessao",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "mandalorian-grogu",
    "title": "The Mandalorian and Grogu",
    "year": 2026,
    "rating": 4.7,
    "duration": "2h 5m",
    "genres": [
      "Sci-Fi",
      "Ação",
      "Aventura"
    ],
    "tmdbId": 1065099,
    "synopsis": "O Mandaloriano e Grogu decolam em nova aventura.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/ye2Gp3FHkHhWHOR3BknpoSWRuVW.jpg",
    "banner": "https://image.tmdb.org/t/p/original/nhlZWKzxc0sCr53A7O1l8SJfgrw.jpg",
    "isRelease": true,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=mandalorian-grogu",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "project-hail-mary",
    "title": "Projeto Hail Mary",
    "year": 2026,
    "rating": 4.8,
    "duration": "2h 15m",
    "genres": [
      "Sci-Fi",
      "Drama"
    ],
    "tmdbId": 687163,
    "synopsis": "Um cientista acorda no espaço para salvar a Terra.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/7pIgFNoX07z7alHt73TSsKRtYye.jpg",
    "banner": "https://image.tmdb.org/t/p/original/fFyLcR22R4ynrecqjMniKXm0UTp.jpg",
    "isRelease": true,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=project-hail-mary",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "toy-story-5",
    "title": "Toy Story 5",
    "year": 2026,
    "rating": 4.6,
    "duration": "1h 45m",
    "genres": [
      "Animação",
      "Família",
      "Aventura"
    ],
    "tmdbId": 1084244,
    "synopsis": "Woody e Buzz enfrentam brinquedos eletrônicos.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/sssrBhdvDcczgMQYDc8oCoSuFEJ.jpg",
    "banner": "https://image.tmdb.org/t/p/original/qjTqY5coNiz6sVtPng40IzltsoN.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=toy-story-5",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "scream-7",
    "title": "Pânico 7",
    "year": 2026,
    "rating": 4.5,
    "duration": "1h 55m",
    "genres": [
      "Terror",
      "Suspense"
    ],
    "tmdbId": 1159559,
    "synopsis": "Ghostface retorna mais impiedoso que nunca.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/rEevavl5vebCVEd5imx7D1k8nmV.jpg",
    "banner": "https://image.tmdb.org/t/p/original/3eUyLEF5M0ky3h6KJsWiWzaakB8.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=scream-7",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "interstellar",
    "title": "Interestelar",
    "year": 2014,
    "rating": 4.9,
    "duration": "2h 49m",
    "genres": [
      "Sci-Fi",
      "Drama",
      "Aventura"
    ],
    "tmdbId": 157336,
    "synopsis": "Astronautas viajam por buraco de minhoca no espaço.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/6ricSDD83BClJsFdGB6x7cM0MFQ.jpg",
    "banner": "https://image.tmdb.org/t/p/original/2ssWTSVklAEc98frZUQhgtGHx7s.jpg",
    "isRelease": false,
    "isPopular": true,
    "isClassic": true,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=interstellar",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "barbie",
    "title": "Barbie",
    "year": 2023,
    "rating": 4.7,
    "duration": "1h 54m",
    "genres": [
      "Comédia",
      "Família",
      "Fantasia"
    ],
    "tmdbId": 346698,
    "synopsis": "Barbie e Ken exploram o mundo real.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/yRRuLt7sMBEQkHsd1S3KaaofZn7.jpg",
    "banner": "https://image.tmdb.org/t/p/original/3N5QNUqS76GFYNoEayfkkJyAyTN.jpg",
    "isRelease": false,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=barbie",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "avatar-2",
    "title": "Avatar: O Caminho da Água",
    "year": 2022,
    "rating": 4.8,
    "duration": "3h 12m",
    "genres": [
      "Sci-Fi",
      "Aventura",
      "Ação"
    ],
    "tmdbId": 76600,
    "synopsis": "A família de Jake Sully protege os oceanos de Pandora.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/hm6nONQOgVpKmRK5YUX9EqfJ0NH.jpg",
    "banner": "https://image.tmdb.org/t/p/original/kJsPVzdyBrYHLomuNv5SJDXUQ2f.jpg",
    "isRelease": false,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=avatar-2",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "spider-man-verse",
    "title": "Homem-Aranha: Através do Aranhaverso",
    "year": 2023,
    "rating": 4.9,
    "duration": "2h 20m",
    "genres": [
      "Animação",
      "Ação",
      "Sci-Fi"
    ],
    "tmdbId": 569094,
    "synopsis": "Miles Morales viaja pelo multiverso das aranhas.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/fBS6y0LYX4kU6pPSBYMdQy6SIHX.jpg",
    "banner": "https://image.tmdb.org/t/p/original/9xfDWXAUbFXQK585JvByT5pEAhe.jpg",
    "isRelease": false,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=spider-man-verse",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "super-mario",
    "title": "Super Mario Bros. O Filme",
    "year": 2023,
    "rating": 4.7,
    "duration": "1h 32m",
    "genres": [
      "Animação",
      "Família",
      "Aventura"
    ],
    "tmdbId": 502356,
    "synopsis": "Mario e Luigi salvam o Reino dos Cogumelos.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/ij8sapIEbLf2g8npOu6XgsQS2w0.jpg",
    "banner": "https://image.tmdb.org/t/p/original/9n2tJBplPbgR2ca05hS5CKXwP2c.jpg",
    "isRelease": false,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=super-mario",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "the-batman",
    "title": "Batman",
    "year": 2022,
    "rating": 4.8,
    "duration": "2h 56m",
    "genres": [
      "Ação",
      "Crime",
      "Drama"
    ],
    "tmdbId": 414906,
    "synopsis": "Batman investiga os crimes do Charada em Gotham.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/wd7b4Nv9QBHDTIjc2m7sr0IUMoh.jpg",
    "banner": "https://image.tmdb.org/t/p/original/IYUD7rAIXzBM91TT3Z5fILUS7n.jpg",
    "isRelease": false,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=the-batman",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "moana-2",
    "title": "Moana 2",
    "year": 2024,
    "rating": 4.7,
    "duration": "1h 40m",
    "genres": [
      "Animação",
      "Família",
      "Aventura"
    ],
    "tmdbId": 1241982,
    "synopsis": "Moana navega rumo a novas terras da Oceania.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/dnqgkKoIGf6hErzRm6VtaK1OJrD.jpg",
    "banner": "https://image.tmdb.org/t/p/original/vYqt6kb4lcF8wwqsMMaULkP9OEn.jpg",
    "isRelease": false,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=moana-2",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "sonic-3",
    "title": "Sonic 3: O Filme",
    "year": 2024,
    "rating": 4.8,
    "duration": "1h 50m",
    "genres": [
      "Aventura",
      "Ação",
      "Família"
    ],
    "tmdbId": 939243,
    "synopsis": "Sonic e seus amigos enfrentam Shadow.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/tfM1T6tAivjvy0sLwt6Y9WvlmzB.jpg",
    "banner": "https://image.tmdb.org/t/p/original/zOpe0eHsq0A2NvNyBbtT6sj53qV.jpg",
    "isRelease": false,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=sonic-3",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "despicable-me-4",
    "title": "Meu Malvado Favorito 4",
    "year": 2024,
    "rating": 4.6,
    "duration": "1h 35m",
    "genres": [
      "Animação",
      "Família",
      "Comédia"
    ],
    "tmdbId": 519182,
    "synopsis": "Gru e sua família dão as boas-vindas a Gru Jr. e combatem novos vilões.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/s8BefU3RIJrfipTpsDtOiatlp8j.jpg",
    "banner": "https://image.tmdb.org/t/p/original/twsxsfao6ZOVvT8LfudH603MMi6.jpg",
    "isRelease": false,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=despicable-me-4",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "kung-fu-panda-4",
    "title": "Kung Fu Panda 4",
    "year": 2024,
    "rating": 4.5,
    "duration": "1h 34m",
    "genres": [
      "Animação",
      "Aventura",
      "Família"
    ],
    "tmdbId": 1011985,
    "synopsis": "Po treina um novo Dragão Guerreiro e enfrenta a Camaleoa.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/aNK6MA5EApIo0UJE7ZWSYcZBJKy.jpg",
    "banner": "https://image.tmdb.org/t/p/original/3ffPx9jqg0yj9y1KWeagT7D20CB.jpg",
    "isRelease": false,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=kung-fu-panda-4",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "wicked-1",
    "title": "Wicked: Parte Um",
    "year": 2024,
    "rating": 4.7,
    "duration": "2h 40m",
    "genres": [
      "Fantasia",
      "Drama",
      "Musical"
    ],
    "tmdbId": 402431,
    "synopsis": "A história de Elphaba antes de se tornar a Bruxa Má do Oeste.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/qcaKkLwIXCAxJtpetVYHniCvLZj.jpg",
    "banner": "https://image.tmdb.org/t/p/original/fyZ6SDUS4o9jp2EHxfZa3qS9ean.jpg",
    "isRelease": false,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=wicked-1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "mufasa-lion-king",
    "title": "Mufasa: O Rei Leão",
    "year": 2024,
    "rating": 4.6,
    "duration": "2h 0m",
    "genres": [
      "Aventura",
      "Família",
      "Drama"
    ],
    "tmdbId": 1022796,
    "synopsis": "A história da ascensão do grande rei Mufasa.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/temIXpcua7j5v4FipOxmzTfrB06.jpg",
    "banner": "https://image.tmdb.org/t/p/original/ehumsuIBbgAe1hg343oszCLrAfI.jpg",
    "isRelease": false,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=mufasa-lion-king",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "furiosa-mad-max",
    "title": "Furiosa: Uma Saga Mad Max",
    "year": 2024,
    "rating": 4.7,
    "duration": "2h 28m",
    "genres": [
      "Ação",
      "Sci-Fi",
      "Aventura"
    ],
    "tmdbId": 786892,
    "synopsis": "A origem da jovem guerreira Furiosa no deserto pós-apocalíptico.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/7qOSKoOAPgemYhBwbJgBWcCxPWZ.jpg",
    "banner": "https://image.tmdb.org/t/p/original/raph7qjAGTMXaIjVxt6ZDSXRzUr.jpg",
    "isRelease": false,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=furiosa-mad-max",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "quiet-place-day-1",
    "title": "Um Lugar Silencioso: Dia Um",
    "year": 2024,
    "rating": 4.5,
    "duration": "1h 39m",
    "genres": [
      "Terror",
      "Sci-Fi",
      "Suspense"
    ],
    "tmdbId": 762441,
    "synopsis": "Uma mulher luta para sobreviver à invasão alienígena em Nova York.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/pN9BtzUeqPIKybAu9baihz6YzyO.jpg",
    "banner": "https://image.tmdb.org/t/p/original/6XjMwQTvnICBz6TguiDKkDVHvgS.jpg",
    "isRelease": false,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=quiet-place-day-1",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "planet-of-apes-4",
    "title": "Planeta dos Macacos: O Reinado",
    "year": 2024,
    "rating": 4.6,
    "duration": "2h 25m",
    "genres": [
      "Sci-Fi",
      "Ação",
      "Aventura"
    ],
    "tmdbId": 653346,
    "synopsis": "Gerações após César, um jovem chimpanzé lidera contra a tirania.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/hBGnLm2A1TapONoPo7QrMpj2B6B.jpg",
    "banner": "https://image.tmdb.org/t/p/original/fypydCipcWDKDTTCoPucBsdGYXW.jpg",
    "isRelease": false,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=planet-of-apes-4",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "godzilla-kong-2",
    "title": "Godzilla e Kong: O Novo Império",
    "year": 2024,
    "rating": 4.6,
    "duration": "1h 55m",
    "genres": [
      "Ação",
      "Sci-Fi",
      "Aventura"
    ],
    "tmdbId": 823464,
    "synopsis": "Godzilla e Kong se unem contra uma ameaça do interior da Terra.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/fWSGD2yrzz6hscocnMD8AEXIThk.jpg",
    "banner": "https://image.tmdb.org/t/p/original/gvLG3Fnznkxl4SmYfcK8gUuqxM8.jpg",
    "isRelease": false,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=godzilla-kong-2",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "civil-war",
    "title": "Guerra Civil",
    "year": 2024,
    "rating": 4.7,
    "duration": "1h 49m",
    "genres": [
      "Ação",
      "Drama",
      "Suspense"
    ],
    "tmdbId": 927339,
    "synopsis": "Jornalistas atravessam os EUA em meio a uma guerra civil moderna.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/iuFNMSZ705PbbF8eG2FCDK0P65n.jpg",
    "banner": "https://image.tmdb.org/t/p/original/8CXw90lEmnJQeUvkgSnl5bEjbQI.jpg",
    "isRelease": false,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=civil-war",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "twisters",
    "title": "Twisters",
    "year": 2024,
    "rating": 4.6,
    "duration": "2h 2m",
    "genres": [
      "Ação",
      "Aventura",
      "Drama"
    ],
    "tmdbId": 718821,
    "synopsis": "Caçadores de tempestades enfrentam tornados massivos no Oklahoma.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/oLOKgN4U6oJxLSGdIIURa6MaELT.jpg",
    "banner": "https://image.tmdb.org/t/p/original/58D6ZAvOKxlHjyX9S8qNKSBE9Y.jpg",
    "isRelease": false,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=twisters",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "bad-boys-4",
    "title": "Bad Boys: Até o Fim",
    "year": 2024,
    "rating": 4.6,
    "duration": "1h 55m",
    "genres": [
      "Ação",
      "Comédia",
      "Policial"
    ],
    "tmdbId": 573435,
    "synopsis": "Mike e Marcus investigam corrupção na polícia de Miami.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/vnFFZ6Y1sudcrfNCioQW4e8NW5X.jpg",
    "banner": "https://image.tmdb.org/t/p/original/3q01ACG0MWm0DekhvkPFCXyPZSu.jpg",
    "isRelease": false,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=bad-boys-4",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "fall-guy",
    "title": "O Dublê",
    "year": 2024,
    "rating": 4.5,
    "duration": "2h 6m",
    "genres": [
      "Ação",
      "Comédia",
      "Aventura"
    ],
    "tmdbId": 746034,
    "synopsis": "Um dublê de ação deve encontrar o astro desaparecido de um filme.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/Pys1wA5QX4oUl6SuABl4en2Yhc.jpg",
    "banner": "https://image.tmdb.org/t/p/original/cJb04VJ0dmb49UKRfvmTEZMh7Gj.jpg",
    "isRelease": false,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=fall-guy",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "challengers",
    "title": "Rivais",
    "year": 2024,
    "rating": 4.6,
    "duration": "2h 11m",
    "genres": [
      "Drama",
      "Romance",
      "Esporte"
    ],
    "tmdbId": 937287,
    "synopsis": "Três jogadores de tênis disputam títulos e corações.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/w1j3evHiwrGiQ6e9h1l9r66uo29.jpg",
    "banner": "https://image.tmdb.org/t/p/original/tq8COKsI99Bivjd4CZIYVGoKcIx.jpg",
    "isRelease": false,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=challengers",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "alien-romulus",
    "title": "Alien: Romulus",
    "year": 2024,
    "rating": 4.8,
    "duration": "1h 59m",
    "genres": [
      "Terror",
      "Sci-Fi",
      "Suspense"
    ],
    "tmdbId": 945961,
    "synopsis": "Jovens colonizadores espaciais encontram a criatura mais aterrorizante.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/jB0W9tn4w07MFn7sTfqRTBLVytF.jpg",
    "banner": "https://image.tmdb.org/t/p/original/iYqSQaWDttQIQzsxg9xHyg0bttG.jpg",
    "isRelease": false,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=alien-romulus",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "beetlejuice-2",
    "title": "Os Fantasmas Ainda se Divertem: Beetlejuice",
    "year": 2024,
    "rating": 4.5,
    "duration": "1h 44m",
    "genres": [
      "Comédia",
      "Fantasia",
      "Terror"
    ],
    "tmdbId": 917496,
    "synopsis": "Beetlejuice retorna após três gerações da família Deetz.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/v33dHteDj03HLtAgUb9CFgA2to1.jpg",
    "banner": "https://image.tmdb.org/t/p/original/kF8ljC7Y4p1UsmKBi2LxelZpqw.jpg",
    "isRelease": false,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=beetlejuice-2",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "smile-2",
    "title": "Sorria 2",
    "year": 2024,
    "rating": 4.6,
    "duration": "2h 7m",
    "genres": [
      "Terror",
      "Mistério",
      "Suspense"
    ],
    "tmdbId": 1100782,
    "synopsis": "Uma estrela pop é perseguida por um sorriso maldito.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/ypHiYvSJmHIyRDRiosZuE595uir.jpg",
    "banner": "https://image.tmdb.org/t/p/original/iR79ciqhtaZ9BE7YFA1HpCHQgX4.jpg",
    "isRelease": false,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=smile-2",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "terrifier-3",
    "title": "Terrifier 3",
    "year": 2024,
    "rating": 4.5,
    "duration": "2h 5m",
    "genres": [
      "Terror",
      "Slasher"
    ],
    "tmdbId": 1034541,
    "synopsis": "Art o Palhaço aterroriza na véspera de Natal.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/3HeKb5H89HjzWTkVkAqomu9mek.jpg",
    "banner": "https://image.tmdb.org/t/p/original/bHfGHipZ32Oec94FDJO4mWs3aZ5.jpg",
    "isRelease": false,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=terrifier-3",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "red-one",
    "title": "Operação Natal",
    "year": 2024,
    "rating": 4.6,
    "duration": "2h 3m",
    "genres": [
      "Ação",
      "Comédia",
      "Fantasia"
    ],
    "tmdbId": 826510,
    "synopsis": "O sequestro do Papai Noel exige uma missão secreta de resgate.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/8LV7FJmmuFXA6468yTBIUDsszBc.jpg",
    "banner": "https://image.tmdb.org/t/p/original/biMJPdS7bGW7HQTQrHvXxMqOqdC.jpg",
    "isRelease": false,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=red-one",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "wild-robot",
    "title": "Robô Selvagem",
    "year": 2024,
    "rating": 4.9,
    "duration": "1h 42m",
    "genres": [
      "Animação",
      "Família",
      "Sci-Fi"
    ],
    "tmdbId": 1184918,
    "synopsis": "Um robô náufrago aprende a conviver com animais selvagens.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/gAHNIZKG8fmK7njOTpMmLKJXiag.jpg",
    "banner": "https://image.tmdb.org/t/p/original/mQZJoIhTEkNhCYAqcHrQqhENLdu.jpg",
    "isRelease": false,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=wild-robot",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "flow",
    "title": "Flow",
    "year": 2024,
    "rating": 4.8,
    "duration": "1h 24m",
    "genres": [
      "Animação",
      "Aventura",
      "Fantasia"
    ],
    "tmdbId": 1114614,
    "synopsis": "Um gato sobrevive a um dilúvio em um barco com outros animais.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/iIMRkFw4mnDgbdmWwvCfWETuZ84.jpg",
    "banner": "https://image.tmdb.org/t/p/original/iIMRkFw4mnDgbdmWwvCfWETuZ84.jpg",
    "isRelease": false,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=flow",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "elio",
    "title": "Elio",
    "year": 2025,
    "rating": 4.6,
    "duration": "1h 40m",
    "genres": [
      "Animação",
      "Sci-Fi",
      "Família"
    ],
    "tmdbId": 950396,
    "synopsis": "Um menino comum é abduzido e confundido com o líder da Terra.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/7zL6RxMPmpPSdU5OTdVC4dtiKcr.jpg",
    "banner": "https://image.tmdb.org/t/p/original/9nhjGaFLKtddDPtPaX5EmKqsWdH.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=elio",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "minecraft-movie",
    "title": "Minecraft: O Filme",
    "year": 2025,
    "rating": 4.4,
    "duration": "1h 50m",
    "genres": [
      "Aventura",
      "Fantasia",
      "Família"
    ],
    "tmdbId": 950387,
    "synopsis": "Quatro desajustados entram no Overworld e criam sua própria história.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/a227F8PnXDABR1JJTuasmJmxEhf.jpg",
    "banner": "https://image.tmdb.org/t/p/original/2Nti3gYAX513wvhp8IiLL6ZDyOm.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=minecraft-movie",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "superman-2025",
    "title": "Superman",
    "year": 2025,
    "rating": 4.8,
    "duration": "2h 30m",
    "genres": [
      "Ação",
      "Sci-Fi",
      "Aventura"
    ],
    "tmdbId": 848327,
    "synopsis": "O Homem de Aço busca reconciliar sua herança kryptoniana com sua criação humana.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/w8N8pSVlhCaLfz4Gq3f3qbQBs1k.jpg",
    "banner": "https://image.tmdb.org/t/p/original/w8N8pSVlhCaLfz4Gq3f3qbQBs1k.jpg",
    "isRelease": true,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=superman-2025",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "fantastic-four-2025",
    "title": "Quarteto Fantástico: Primeiros Passos",
    "year": 2025,
    "rating": 4.7,
    "duration": "2h 20m",
    "genres": [
      "Ação",
      "Sci-Fi",
      "Aventura"
    ],
    "tmdbId": 617126,
    "synopsis": "A primeira família da Marvel enfrenta ameaças interdimensionais.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/8F2vIxWycANHW763lnx2hJVtjDC.jpg",
    "banner": "https://image.tmdb.org/t/p/original/s94NjfKkcSczZ1FembwmQZwsuwY.jpg",
    "isRelease": true,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=fantastic-four-2025",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "jurassic-world-4",
    "title": "Jurassic World: Renascimento",
    "year": 2025,
    "rating": 4.6,
    "duration": "2h 10m",
    "genres": [
      "Aventura",
      "Ação",
      "Sci-Fi"
    ],
    "tmdbId": 1234821,
    "synopsis": "Uma nova era de dinossauros domina o ecossistema mundial.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/zuEC2i3I2P7QIcLoUJNBwqRYO4S.jpg",
    "banner": "https://image.tmdb.org/t/p/original/zNriRTr0kWwyaXPzdg1EIxf0BWk.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=jurassic-world-4",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "captain-america-4",
    "title": "Capitão América: Admirável Mundo Novo",
    "year": 2025,
    "rating": 4.6,
    "duration": "2h 15m",
    "genres": [
      "Ação",
      "Sci-Fi",
      "Aventura"
    ],
    "tmdbId": 822119,
    "synopsis": "Sam Wilson assume o escudo e investiga conspirações políticas.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/5nbSgP8f5LMCI0PwVRRaHJaUmR3.jpg",
    "banner": "https://image.tmdb.org/t/p/original/8eifdha9GQeZAkexgtD45546XKx.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=captain-america-4",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "thunderbolts",
    "title": "Thunderbolts*",
    "year": 2025,
    "rating": 4.6,
    "duration": "2h 10m",
    "genres": [
      "Ação",
      "Sci-Fi",
      "Aventura"
    ],
    "tmdbId": 76341,
    "synopsis": "Um grupo de anti-heróis realiza missões clandestinas para o governo.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/tH64gzAHDFg7EFcgfkkZyHdGM5P.jpg",
    "banner": "https://image.tmdb.org/t/p/original/uT895WNwm0aIJRtGizcQhrejWUo.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=thunderbolts",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "avatar-3",
    "title": "Avatar: Fogo e Cinzas",
    "year": 2025,
    "rating": 4.8,
    "duration": "3h 10m",
    "genres": [
      "Sci-Fi",
      "Aventura",
      "Ação"
    ],
    "tmdbId": 83533,
    "synopsis": "Jake e Neytiri encontram o terrível clã das cinzas de Pandora.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/3almrQT8GnrDjnQeWotdExjJhZm.jpg",
    "banner": "https://image.tmdb.org/t/p/original/u8DU5fkLoM5tTRukzPC31oGPxaQ.jpg",
    "isRelease": true,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=avatar-3",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "ballerina-2025",
    "title": "Bailarina",
    "year": 2025,
    "rating": 4.7,
    "duration": "2h 0m",
    "genres": [
      "Ação",
      "Suspense"
    ],
    "tmdbId": 541671,
    "synopsis": "Uma assassina busca vingança contra os assassinos de sua família.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/by5hjYJp3OJ8GW118kPeURp1rFo.jpg",
    "banner": "https://image.tmdb.org/t/p/original/sItIskd5xpiE64bBWYwZintkGf3.jpg",
    "isRelease": true,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=ballerina-2025",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "f1-2025",
    "title": "F1",
    "year": 2025,
    "rating": 4.7,
    "duration": "2h 20m",
    "genres": [
      "Drama",
      "Esporte"
    ],
    "tmdbId": 911430,
    "synopsis": "Um veterano da Fórmula 1 retorna para orientar um jovem talento.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/fMcY5hpVZQ0cLKHvFM1mo6GrAr0.jpg",
    "banner": "https://image.tmdb.org/t/p/original/lkDYN0whyE82mcM20rwtwjbniKF.jpg",
    "isRelease": true,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=f1-2025",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "tron-ares",
    "title": "TRON: Ares",
    "year": 2025,
    "rating": 4.6,
    "duration": "2h 15m",
    "genres": [
      "Sci-Fi",
      "Ação",
      "Aventura"
    ],
    "tmdbId": 533533,
    "synopsis": "Um programa de inteligência artificial cruza para o mundo real.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/zRjRAxrPA4JFadT6SQaV3N10ZcO.jpg",
    "banner": "https://image.tmdb.org/t/p/original/pUNfHmVqfwRdILhCkU8TdysVOXo.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=tron-ares",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "conjuring-4",
    "title": "Invocação do Mal: Últimos Ritos",
    "year": 2025,
    "rating": 4.7,
    "duration": "2h 5m",
    "genres": [
      "Terror",
      "Mistério"
    ],
    "tmdbId": 1038392,
    "synopsis": "Ed e Lorraine Warren enfrentam o caso demoníaco mais perigoso de suas vidas.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/40nHGUfypLhlr7gJx8At1IbYkaK.jpg",
    "banner": "https://image.tmdb.org/t/p/original/i8MupUe4xgmYXoRNAQMYvuoexSU.jpg",
    "isRelease": true,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=conjuring-4",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "black-phone-2",
    "title": "O Telefone Preto 2",
    "year": 2025,
    "rating": 4.6,
    "duration": "1h 55m",
    "genres": [
      "Terror",
      "Mistério",
      "Suspense"
    ],
    "tmdbId": 1197137,
    "synopsis": "A continuação da aterrorizante história do sequestrador sobrenatural.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/p3epSUdF9qSWWHTBlA3mJ0w2i2Y.jpg",
    "banner": "https://image.tmdb.org/t/p/original/6zKjoOOb3OZnZuiHtQZn4Kd69Gq.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=black-phone-2",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "fnaf-2",
    "title": "Five Nights at Freddy's 2",
    "year": 2025,
    "rating": 4.6,
    "duration": "1h 50m",
    "genres": [
      "Terror",
      "Suspense"
    ],
    "tmdbId": 1086747,
    "synopsis": "Novos bonecos animatrônicos ganham vida em uma nova pizzaria.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/bJ3zy7UN8VoA23LSDkt7JlQg1a9.jpg",
    "banner": "https://image.tmdb.org/t/p/original/whnFKx0Y54Ktg6o2TiwbnQfXdZf.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=fnaf-2",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "megan-2",
    "title": "M3GAN 2.0",
    "year": 2025,
    "rating": 4.5,
    "duration": "1h 45m",
    "genres": [
      "Terror",
      "Sci-Fi",
      "Suspense"
    ],
    "tmdbId": 1071585,
    "synopsis": "A inteligência artificial aterrorizante retorna mais inteligente.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/t1ePG09E3diI04p8BfphtMxYJva.jpg",
    "banner": "https://image.tmdb.org/t/p/original/cT9ZfwoPDk8JbgkessmQgxAWiaM.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=megan-2",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "michael-jackson",
    "title": "Michael",
    "year": 2025,
    "rating": 4.8,
    "duration": "2h 40m",
    "genres": [
      "Biografia",
      "Drama",
      "Musical"
    ],
    "tmdbId": 1007757,
    "synopsis": "A vida e a carreira lendária do Rei do Pop.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/2TZiL4ZYOwWeIjGfz3glpMuPqpN.jpg",
    "banner": "https://image.tmdb.org/t/p/original/zMwhWailP1WY7sb6AoE6b8ugoy.jpg",
    "isRelease": true,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=michael-jackson",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "avengers-5",
    "title": "Vingadores: Doomsday",
    "year": 2026,
    "rating": 4.9,
    "duration": "2h 50m",
    "genres": [
      "Ação",
      "Sci-Fi",
      "Aventura"
    ],
    "tmdbId": 1003596,
    "synopsis": "Os Vingadores se reúnem para enfrentar o Doutor Destino no multiverso.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/i29O7K4n3z5qB2SAJmSc0kR5dPj.jpg",
    "banner": "https://image.tmdb.org/t/p/original/6KDDoTq8Vq3HuQHULzuvPiCJbMI.jpg",
    "isRelease": true,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=avengers-5",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "batman-2",
    "title": "The Batman: Parte II",
    "year": 2026,
    "rating": 4.8,
    "duration": "3h 0m",
    "genres": [
      "Ação",
      "Crime",
      "Drama"
    ],
    "tmdbId": 1111117,
    "synopsis": "O Cavaleiro das Trevas enfrenta novas ameaças nos esgotos de Gotham.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/5ooN96HRWAbxHTX9VvVFIcaptNJ.jpg",
    "banner": "https://image.tmdb.org/t/p/original/mM2Ygq1EvYKcySVnRHeZwCAFrl8.jpg",
    "isRelease": true,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=batman-2",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "supergirl-2026",
    "title": "Supergirl: Mulher do Amanhã",
    "year": 2026,
    "rating": 4.7,
    "duration": "2h 15m",
    "genres": [
      "Ação",
      "Sci-Fi",
      "Aventura"
    ],
    "tmdbId": 1111118,
    "synopsis": "Kara Zor-El viaja pela galáxia para proteger uma jovem em busca de justiça.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/hDQPEeYoSixrbd0IdvGJPncodLJ.jpg",
    "banner": "https://image.tmdb.org/t/p/original/miQvdihucszIGI6o8MskXsVmTRj.jpg",
    "isRelease": true,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=supergirl-2026",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "shrek-5",
    "title": "Shrek 5",
    "year": 2026,
    "rating": 4.8,
    "duration": "1h 40m",
    "genres": [
      "Animação",
      "Família",
      "Comédia"
    ],
    "tmdbId": 421892,
    "synopsis": "Shrek, Burro e Fiona retornam para novas confusões no Reino de Tão Tão Distante.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/3U8d1K8PSgrZ0Gc8miytt17kLcW.jpg",
    "banner": "https://image.tmdb.org/t/p/original/wHbZr627WHFPMpfskRwX6NBgjxv.jpg",
    "isRelease": true,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=shrek-5",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "frozen-3",
    "title": "Frozen 3",
    "year": 2026,
    "rating": 4.7,
    "duration": "1h 45m",
    "genres": [
      "Animação",
      "Família",
      "Aventura"
    ],
    "tmdbId": 330457,
    "synopsis": "Elsa e Anna desvendam novos segredos da magia de Arendelle.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/yK9wazsgpZ9QfmITC96biaMzndV.jpg",
    "banner": "https://image.tmdb.org/t/p/original/AoSZyb37ljMAxw0RdeQEBHKtgcc.jpg",
    "isRelease": true,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=frozen-3",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "dune-3",
    "title": "Duna: Messias",
    "year": 2026,
    "rating": 4.9,
    "duration": "2h 45m",
    "genres": [
      "Sci-Fi",
      "Drama",
      "Aventura"
    ],
    "tmdbId": 1269666,
    "synopsis": "O desfecho do reinado imperial de Paul Atreides.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/jrxLPxZQX43XDZ2KcR5i4dwHiOc.jpg",
    "banner": "https://image.tmdb.org/t/p/original/jrxLPxZQX43XDZ2KcR5i4dwHiOc.jpg",
    "isRelease": true,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=dune-3",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "now-you-see-me-3",
    "title": "Truque de Mestre 3",
    "year": 2026,
    "rating": 4.6,
    "duration": "2h 0m",
    "genres": [
      "Ação",
      "Suspense",
      "Policial"
    ],
    "tmdbId": 425274,
    "synopsis": "Os Quatro Cavaleiros retornam com novas ilusões espetaculares.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/xUddC5HTjMWmClD007QBWR0BLHY.jpg",
    "banner": "https://image.tmdb.org/t/p/original/ufqytAlziHq5pljKByGJ8IKhtEZ.jpg",
    "isRelease": true,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=now-you-see-me-3",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "constantine-2",
    "title": "Constantine 2",
    "year": 2026,
    "rating": 4.7,
    "duration": "2h 10m",
    "genres": [
      "Terror",
      "Ação",
      "Fantasia"
    ],
    "tmdbId": 561,
    "synopsis": "John Constantine retorna para combater demônios no submundo.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/dd4uzgUAbBIiRW7dcY0AcgSWohJ.jpg",
    "banner": "https://image.tmdb.org/t/p/original/x3YFn10ehQKMRIJwIfiDAX8S9Xt.jpg",
    "isRelease": true,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=constantine-2",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "i-am-legend-2",
    "title": "Eu Sou a Lenda 2",
    "year": 2026,
    "rating": 4.7,
    "duration": "2h 15m",
    "genres": [
      "Sci-Fi",
      "Terror",
      "Drama"
    ],
    "tmdbId": 6479,
    "synopsis": "A jornada de sobrevivência em um mundo pós-apocalíptico continua.",
    "category": "movie",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/j2jb6DwNCPIU2LtUrJ9zoQIGvSz.jpg",
    "banner": "https://image.tmdb.org/t/p/original/ePgD1cwmklyrFBjl6z96IuixuSY.jpg",
    "isRelease": true,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=ondemand&vid=i-am-legend-2",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ]
  },
  {
    "id": "house-of-the-dragon",
    "title": "A Casa do Dragão",
    "year": 2022,
    "rating": 4.8,
    "seasons": "2 Temporadas",
    "genres": [
      "Drama",
      "Fantasia"
    ],
    "tmdbId": 94997,
    "synopsis": "A história da Casa Targaryen 200 anos antes de Game of Thrones.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/oKJDm4QCKbp6mR4FnxXrFlPJP8Y.jpg",
    "banner": "https://image.tmdb.org/t/p/original/577eXC8wFQT0eUrJcgznSiFPRmk.jpg",
    "isRelease": false,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=house-of-the-dragonS01E01",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ],
    "episodes": [
      {
        "title": "Piloto",
        "season": 1,
        "episode": 1,
        "duration": "45m",
        "synopsis": "O início da jornada emocionante de A Casa do Dragão.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/577eXC8wFQT0eUrJcgznSiFPRmk.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=house-of-the-dragonS01E01"
      },
      {
        "title": "O Confronto",
        "season": 1,
        "episode": 2,
        "duration": "42m",
        "synopsis": "Tensões aumentam à medida que novos segredos são revelados.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/577eXC8wFQT0eUrJcgznSiFPRmk.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=house-of-the-dragonS01E02"
      },
      {
        "title": "A Revelação",
        "season": 1,
        "episode": 3,
        "duration": "48m",
        "synopsis": "Um desfecho surpreendente que mudará o rumo da história.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/577eXC8wFQT0eUrJcgznSiFPRmk.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=house-of-the-dragonS01E03"
      }
    ]
  },
  {
    "id": "stranger-things",
    "title": "Stranger Things",
    "year": 2022,
    "rating": 4.8,
    "seasons": "4 Temporadas",
    "genres": [
      "Sci-Fi",
      "Terror",
      "Drama"
    ],
    "tmdbId": 66732,
    "synopsis": "Mistérios sobrenaturais assolam a pequena cidade de Hawkins.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/twfKp60THrcOIep9sjHODOOfO8d.jpg",
    "banner": "https://image.tmdb.org/t/p/original/56v2KjBlU4XaOv9rVYEQypROD7P.jpg",
    "isRelease": false,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=stranger-thingsS01E01",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ],
    "episodes": [
      {
        "title": "Piloto",
        "season": 1,
        "episode": 1,
        "duration": "45m",
        "synopsis": "O início da jornada emocionante de Stranger Things.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/56v2KjBlU4XaOv9rVYEQypROD7P.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=stranger-thingsS01E01"
      },
      {
        "title": "O Confronto",
        "season": 1,
        "episode": 2,
        "duration": "42m",
        "synopsis": "Tensões aumentam à medida que novos segredos são revelados.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/56v2KjBlU4XaOv9rVYEQypROD7P.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=stranger-thingsS01E02"
      },
      {
        "title": "A Revelação",
        "season": 1,
        "episode": 3,
        "duration": "48m",
        "synopsis": "Um desfecho surpreendente que mudará o rumo da história.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/56v2KjBlU4XaOv9rVYEQypROD7P.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=stranger-thingsS01E03"
      }
    ]
  },
  {
    "id": "the-penguin",
    "title": "Pinguim",
    "year": 2024,
    "rating": 4.8,
    "seasons": "1 Temporada",
    "genres": [
      "Drama",
      "Crime"
    ],
    "tmdbId": 141052,
    "synopsis": "Oswald Cobb luta pelo controle do submundo de Gotham.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/t6HI73XYue1Bk4aHwOIJ45l5D.jpg",
    "banner": "https://image.tmdb.org/t/p/original/r013C8Me2bZ0pUi0OWJRh0h7MzT.jpg",
    "isRelease": false,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=the-penguinS01E01",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ],
    "episodes": [
      {
        "title": "Piloto",
        "season": 1,
        "episode": 1,
        "duration": "45m",
        "synopsis": "O início da jornada emocionante de Pinguim.",
        "thumbnail": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/t6HI73XYue1Bk4aHwOIJ45l5D.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=the-penguinS01E01"
      },
      {
        "title": "O Confronto",
        "season": 1,
        "episode": 2,
        "duration": "42m",
        "synopsis": "Tensões aumentam à medida que novos segredos são revelados.",
        "thumbnail": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/t6HI73XYue1Bk4aHwOIJ45l5D.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=the-penguinS01E02"
      },
      {
        "title": "A Revelação",
        "season": 1,
        "episode": 3,
        "duration": "48m",
        "synopsis": "Um desfecho surpreendente que mudará o rumo da história.",
        "thumbnail": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/t6HI73XYue1Bk4aHwOIJ45l5D.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=the-penguinS01E03"
      }
    ]
  },
  {
    "id": "severance",
    "title": "Ruptura (Severance)",
    "year": 2022,
    "rating": 4.8,
    "seasons": "1 Temporada",
    "genres": [
      "Sci-Fi",
      "Drama"
    ],
    "tmdbId": 95396,
    "synopsis": "Funcionários de escritório dividem cirurgicamente suas memórias.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/3DjOAUBR8Hra4R9kK9U8jDaoqyC.jpg",
    "banner": "https://image.tmdb.org/t/p/original/ixgFmf1X59PUZam2qbAfskx2gQr.jpg",
    "isRelease": false,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=severanceS01E01",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ],
    "episodes": [
      {
        "title": "Piloto",
        "season": 1,
        "episode": 1,
        "duration": "45m",
        "synopsis": "O início da jornada emocionante de Ruptura (Severance).",
        "thumbnail": "https://image.tmdb.org/t/p/w500/ixgFmf1X59PUZam2qbAfskx2gQr.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=severanceS01E01"
      },
      {
        "title": "O Confronto",
        "season": 1,
        "episode": 2,
        "duration": "42m",
        "synopsis": "Tensões aumentam à medida que novos segredos são revelados.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/ixgFmf1X59PUZam2qbAfskx2gQr.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=severanceS01E02"
      },
      {
        "title": "A Revelação",
        "season": 1,
        "episode": 3,
        "duration": "48m",
        "synopsis": "Um desfecho surpreendente que mudará o rumo da história.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/ixgFmf1X59PUZam2qbAfskx2gQr.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=severanceS01E03"
      }
    ]
  },
  {
    "id": "rick-e-morty",
    "title": "Rick e Morty",
    "year": 2023,
    "rating": 4.7,
    "seasons": "7 Temporadas",
    "genres": [
      "Animação",
      "Sci-Fi",
      "Comédia"
    ],
    "tmdbId": 60625,
    "synopsis": "Viagens interdimensionais insanas com o cientista Rick e seu neto.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/5qfd0e2uMbVInX3YdeFbDsfxi1t.jpg",
    "banner": "https://image.tmdb.org/t/p/original/5BDNWWHweQL0q1fmTv7gmRXfnl4.jpg",
    "isRelease": false,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=rick-e-mortyS01E01",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ],
    "episodes": [
      {
        "title": "Piloto",
        "season": 1,
        "episode": 1,
        "duration": "45m",
        "synopsis": "O início da jornada emocionante de Rick e Morty.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/5BDNWWHweQL0q1fmTv7gmRXfnl4.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=rick-e-mortyS01E01"
      },
      {
        "title": "O Confronto",
        "season": 1,
        "episode": 2,
        "duration": "42m",
        "synopsis": "Tensões aumentam à medida que novos segredos são revelados.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/5BDNWWHweQL0q1fmTv7gmRXfnl4.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=rick-e-mortyS01E02"
      },
      {
        "title": "A Revelação",
        "season": 1,
        "episode": 3,
        "duration": "48m",
        "synopsis": "Um desfecho surpreendente que mudará o rumo da história.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/5BDNWWHweQL0q1fmTv7gmRXfnl4.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=rick-e-mortyS01E03"
      }
    ]
  },
  {
    "id": "origem",
    "title": "Origem (From)",
    "year": 2024,
    "rating": 4.8,
    "seasons": "3 Temporadas",
    "genres": [
      "Mistério",
      "Terror"
    ],
    "tmdbId": 123168,
    "synopsis": "Um vilarejo nos EUA prende misteriosamente quem entra nele.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/pyLgmlpISheAfuIrCFHvrtpg4Ul.jpg",
    "banner": "https://image.tmdb.org/t/p/original/iiAIlomJS4PXHi3JFE9a8lcmoGw.jpg",
    "isRelease": false,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=origemS01E01",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ],
    "episodes": [
      {
        "title": "Piloto",
        "season": 1,
        "episode": 1,
        "duration": "45m",
        "synopsis": "O início da jornada emocionante de Origem (From).",
        "thumbnail": "https://image.tmdb.org/t/p/w500/iiAIlomJS4PXHi3JFE9a8lcmoGw.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=origemS01E01"
      },
      {
        "title": "O Confronto",
        "season": 1,
        "episode": 2,
        "duration": "42m",
        "synopsis": "Tensões aumentam à medida que novos segredos são revelados.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/iiAIlomJS4PXHi3JFE9a8lcmoGw.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=origemS01E02"
      },
      {
        "title": "A Revelação",
        "season": 1,
        "episode": 3,
        "duration": "48m",
        "synopsis": "Um desfecho surpreendente que mudará o rumo da história.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/iiAIlomJS4PXHi3JFE9a8lcmoGw.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=origemS01E03"
      }
    ]
  },
  {
    "id": "wednesday",
    "title": "Wandinha",
    "year": 2022,
    "rating": 4.8,
    "seasons": "1 Temporada",
    "genres": [
      "Comédia",
      "Mistério"
    ],
    "tmdbId": 119051,
    "synopsis": "Wandinha investiga assassinatos na Escola Nunca Mais.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/7rxiQrZjrer0RB9qNA8rHYFo53R.jpg",
    "banner": "https://image.tmdb.org/t/p/original/iHSwvRVsRyxpX7FE7GbviaDvgGZ.jpg",
    "isRelease": false,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=wednesdayS01E01",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ],
    "episodes": [
      {
        "title": "Piloto",
        "season": 1,
        "episode": 1,
        "duration": "45m",
        "synopsis": "O início da jornada emocionante de Wandinha.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/iHSwvRVsRyxpX7FE7GbviaDvgGZ.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=wednesdayS01E01"
      },
      {
        "title": "O Confronto",
        "season": 1,
        "episode": 2,
        "duration": "42m",
        "synopsis": "Tensões aumentam à medida que novos segredos são revelados.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/iHSwvRVsRyxpX7FE7GbviaDvgGZ.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=wednesdayS01E02"
      },
      {
        "title": "A Revelação",
        "season": 1,
        "episode": 3,
        "duration": "48m",
        "synopsis": "Um desfecho surpreendente que mudará o rumo da história.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/iHSwvRVsRyxpX7FE7GbviaDvgGZ.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=wednesdayS01E03"
      }
    ]
  },
  {
    "id": "the-last-of-us",
    "title": "The Last of Us",
    "year": 2023,
    "rating": 4.8,
    "seasons": "1 Temporada",
    "genres": [
      "Drama",
      "Ação"
    ],
    "tmdbId": 115646,
    "synopsis": "Joel e Ellie atravessam os EUA pós-pandêmicos.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/w2nOl7KhwcUj11YxEi9Nknj9cqu.jpg",
    "banner": "https://image.tmdb.org/t/p/original/rv5gu2gYbOEYoArzH7bqJuMxvBB.jpg",
    "isRelease": false,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=the-last-of-usS01E01",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ],
    "episodes": [
      {
        "title": "Piloto",
        "season": 1,
        "episode": 1,
        "duration": "45m",
        "synopsis": "O início da jornada emocionante de The Last of Us.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/rv5gu2gYbOEYoArzH7bqJuMxvBB.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=the-last-of-usS01E01"
      },
      {
        "title": "O Confronto",
        "season": 1,
        "episode": 2,
        "duration": "42m",
        "synopsis": "Tensões aumentam à medida que novos segredos são revelados.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/rv5gu2gYbOEYoArzH7bqJuMxvBB.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=the-last-of-usS01E02"
      },
      {
        "title": "A Revelação",
        "season": 1,
        "episode": 3,
        "duration": "48m",
        "synopsis": "Um desfecho surpreendente que mudará o rumo da história.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/rv5gu2gYbOEYoArzH7bqJuMxvBB.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=the-last-of-usS01E03"
      }
    ]
  },
  {
    "id": "the-boys",
    "title": "The Boys",
    "year": 2024,
    "rating": 4.8,
    "seasons": "4 Temporadas",
    "genres": [
      "Ação",
      "Drama"
    ],
    "tmdbId": 76479,
    "synopsis": "Justiceiros enfrentam super-heróis corruptos.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/in1R2dDc421JxsoRWaIIAqVI2KE.jpg",
    "banner": "https://image.tmdb.org/t/p/original/n6vVs6z8obNbExdD3QHTr4Utu1Z.jpg",
    "isRelease": false,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=the-boysS01E01",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ],
    "episodes": [
      {
        "title": "Piloto",
        "season": 1,
        "episode": 1,
        "duration": "45m",
        "synopsis": "O início da jornada emocionante de The Boys.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/n6vVs6z8obNbExdD3QHTr4Utu1Z.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=the-boysS01E01"
      },
      {
        "title": "O Confronto",
        "season": 1,
        "episode": 2,
        "duration": "42m",
        "synopsis": "Tensões aumentam à medida que novos segredos são revelados.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/n6vVs6z8obNbExdD3QHTr4Utu1Z.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=the-boysS01E02"
      },
      {
        "title": "A Revelação",
        "season": 1,
        "episode": 3,
        "duration": "48m",
        "synopsis": "Um desfecho surpreendente que mudará o rumo da história.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/n6vVs6z8obNbExdD3QHTr4Utu1Z.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=the-boysS01E03"
      }
    ]
  },
  {
    "id": "round-6",
    "title": "Round 6",
    "year": 2024,
    "rating": 4.7,
    "seasons": "2 Temporadas",
    "genres": [
      "Drama",
      "Thriller"
    ],
    "tmdbId": 93405,
    "synopsis": "Jogadores falidos competem em jogos infantis mortais.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/6gcHdboppvplmBWxvROc96NJnmm.jpg",
    "banner": "https://image.tmdb.org/t/p/original/2meX1nMdScFOoV4370rqHWKmXhY.jpg",
    "isRelease": false,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=round-6S01E01",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ],
    "episodes": [
      {
        "title": "Piloto",
        "season": 1,
        "episode": 1,
        "duration": "45m",
        "synopsis": "O início da jornada emocionante de Round 6.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/2meX1nMdScFOoV4370rqHWKmXhY.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=round-6S01E01"
      },
      {
        "title": "O Confronto",
        "season": 1,
        "episode": 2,
        "duration": "42m",
        "synopsis": "Tensões aumentam à medida que novos segredos são revelados.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/2meX1nMdScFOoV4370rqHWKmXhY.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=round-6S01E02"
      },
      {
        "title": "A Revelação",
        "season": 1,
        "episode": 3,
        "duration": "48m",
        "synopsis": "Um desfecho surpreendente que mudará o rumo da história.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/2meX1nMdScFOoV4370rqHWKmXhY.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=round-6S01E03"
      }
    ]
  },
  {
    "id": "fallout-series",
    "title": "Fallout",
    "year": 2024,
    "rating": 4.8,
    "seasons": "1 Temporada",
    "genres": [
      "Sci-Fi",
      "Ação",
      "Drama"
    ],
    "tmdbId": 126308,
    "synopsis": "A sobrevivência humana no deserto radioativo pós-apocalíptico de Los Angeles.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/gaOb9hyCDUcbZiTYcHy7mIFmNo.jpg",
    "banner": "https://image.tmdb.org/t/p/original/6Tb87q9Tog30F5AAHh1gyDT2Vve.jpg",
    "isRelease": false,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=fallout-seriesS01E01",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ],
    "episodes": [
      {
        "title": "Piloto",
        "season": 1,
        "episode": 1,
        "duration": "45m",
        "synopsis": "O início da jornada emocionante de Fallout.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/6Tb87q9Tog30F5AAHh1gyDT2Vve.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=fallout-seriesS01E01"
      },
      {
        "title": "O Confronto",
        "season": 1,
        "episode": 2,
        "duration": "42m",
        "synopsis": "Tensões aumentam à medida que novos segredos são revelados.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/6Tb87q9Tog30F5AAHh1gyDT2Vve.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=fallout-seriesS01E02"
      },
      {
        "title": "A Revelação",
        "season": 1,
        "episode": 3,
        "duration": "48m",
        "synopsis": "Um desfecho surpreendente que mudará o rumo da história.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/6Tb87q9Tog30F5AAHh1gyDT2Vve.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=fallout-seriesS01E03"
      }
    ]
  },
  {
    "id": "shogun-2024",
    "title": "Xógun: A Gloriosa Saga do Japão",
    "year": 2024,
    "rating": 4.9,
    "seasons": "1 Temporada",
    "genres": [
      "Drama",
      "História",
      "Guerra"
    ],
    "tmdbId": 118612,
    "synopsis": "Conspirações feudais e combates de samurais no Japão de 1600.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/9o1dCVmF4tmC5v8XstJrIpRrTaQ.jpg",
    "banner": "https://image.tmdb.org/t/p/original/9o1dCVmF4tmC5v8XstJrIpRrTaQ.jpg",
    "isRelease": false,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=shogun-2024S01E01",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ],
    "episodes": [
      {
        "title": "Piloto",
        "season": 1,
        "episode": 1,
        "duration": "45m",
        "synopsis": "O início da jornada emocionante de Xógun: A Gloriosa Saga do Japão.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/9o1dCVmF4tmC5v8XstJrIpRrTaQ.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=shogun-2024S01E01"
      },
      {
        "title": "O Confronto",
        "season": 1,
        "episode": 2,
        "duration": "42m",
        "synopsis": "Tensões aumentam à medida que novos segredos são revelados.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/9o1dCVmF4tmC5v8XstJrIpRrTaQ.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=shogun-2024S01E02"
      },
      {
        "title": "A Revelação",
        "season": 1,
        "episode": 3,
        "duration": "48m",
        "synopsis": "Um desfecho surpreendente que mudará o rumo da história.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/9o1dCVmF4tmC5v8XstJrIpRrTaQ.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=shogun-2024S01E03"
      }
    ]
  },
  {
    "id": "the-bear",
    "title": "O Urso",
    "year": 2024,
    "rating": 4.8,
    "seasons": "3 Temporadas",
    "genres": [
      "Drama",
      "Comédia"
    ],
    "tmdbId": 139158,
    "synopsis": "Um chef renomado de alta gastronomia assume a lanchonete da família.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/o9fRuAbtEM3VHEH2pphPLkZMmFP.jpg",
    "banner": "https://image.tmdb.org/t/p/original/fwF7K1opbP6HASTZLV3TfA5TYPA.jpg",
    "isRelease": false,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=the-bearS01E01",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ],
    "episodes": [
      {
        "title": "Piloto",
        "season": 1,
        "episode": 1,
        "duration": "45m",
        "synopsis": "O início da jornada emocionante de O Urso.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/fwF7K1opbP6HASTZLV3TfA5TYPA.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=the-bearS01E01"
      },
      {
        "title": "O Confronto",
        "season": 1,
        "episode": 2,
        "duration": "42m",
        "synopsis": "Tensões aumentam à medida que novos segredos são revelados.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/fwF7K1opbP6HASTZLV3TfA5TYPA.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=the-bearS01E02"
      },
      {
        "title": "A Revelação",
        "season": 1,
        "episode": 3,
        "duration": "48m",
        "synopsis": "Um desfecho surpreendente que mudará o rumo da história.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/fwF7K1opbP6HASTZLV3TfA5TYPA.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=the-bearS01E03"
      }
    ]
  },
  {
    "id": "reacher-series",
    "title": "Reacher",
    "year": 2024,
    "rating": 4.7,
    "seasons": "2 Temporadas",
    "genres": [
      "Ação",
      "Policial",
      "Drama"
    ],
    "tmdbId": 119053,
    "synopsis": "O ex-investigador militar Jack Reacher combate injustiças pelo país.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/3BdV4KOzgOGaLD9nOoa8PaJ5osh.jpg",
    "banner": "https://image.tmdb.org/t/p/original/92QXbBSgcSFh5NAHF9zZIqVTBou.jpg",
    "isRelease": false,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=reacher-seriesS01E01",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ],
    "episodes": [
      {
        "title": "Piloto",
        "season": 1,
        "episode": 1,
        "duration": "45m",
        "synopsis": "O início da jornada emocionante de Reacher.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/92QXbBSgcSFh5NAHF9zZIqVTBou.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=reacher-seriesS01E01"
      },
      {
        "title": "O Confronto",
        "season": 1,
        "episode": 2,
        "duration": "42m",
        "synopsis": "Tensões aumentam à medida que novos segredos são revelados.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/92QXbBSgcSFh5NAHF9zZIqVTBou.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=reacher-seriesS01E02"
      },
      {
        "title": "A Revelação",
        "season": 1,
        "episode": 3,
        "duration": "48m",
        "synopsis": "Um desfecho surpreendente que mudará o rumo da história.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/92QXbBSgcSFh5NAHF9zZIqVTBou.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=reacher-seriesS01E03"
      }
    ]
  },
  {
    "id": "gen-v",
    "title": "Gen V",
    "year": 2023,
    "rating": 4.6,
    "seasons": "1 Temporada",
    "genres": [
      "Sci-Fi",
      "Ação",
      "Drama"
    ],
    "tmdbId": 205741,
    "synopsis": "Jovens super-heróis testam seus limites na Universidade Godolkin.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/8PhlxfAsIvFv2uroxsnHrv6UVxS.jpg",
    "banner": "https://image.tmdb.org/t/p/original/kDvUmvSLfTcp6fYctbrP8HL1pKQ.jpg",
    "isRelease": false,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=gen-vS01E01",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ],
    "episodes": [
      {
        "title": "Piloto",
        "season": 1,
        "episode": 1,
        "duration": "45m",
        "synopsis": "O início da jornada emocionante de Gen V.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/kDvUmvSLfTcp6fYctbrP8HL1pKQ.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=gen-vS01E01"
      },
      {
        "title": "O Confronto",
        "season": 1,
        "episode": 2,
        "duration": "42m",
        "synopsis": "Tensões aumentam à medida que novos segredos são revelados.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/kDvUmvSLfTcp6fYctbrP8HL1pKQ.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=gen-vS01E02"
      },
      {
        "title": "A Revelação",
        "season": 1,
        "episode": 3,
        "duration": "48m",
        "synopsis": "Um desfecho surpreendente que mudará o rumo da história.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/kDvUmvSLfTcp6fYctbrP8HL1pKQ.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=gen-vS01E03"
      }
    ]
  },
  {
    "id": "acolyte",
    "title": "The Acolyte",
    "year": 2024,
    "rating": 4.5,
    "seasons": "1 Temporada",
    "genres": [
      "Sci-Fi",
      "Aventura"
    ],
    "tmdbId": 126309,
    "synopsis": "Investigações sobre crimes misteriosos contra a Ordem Jedi nos últimos dias da Alta República.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/uTQp0pXLE7EEYLTy6xXmdnrNe7A.jpg",
    "banner": "https://image.tmdb.org/t/p/original/asQLjDkh2iqdIGMknf5c5EsvTub.jpg",
    "isRelease": false,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=acolyteS01E01",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ],
    "episodes": [
      {
        "title": "Piloto",
        "season": 1,
        "episode": 1,
        "duration": "45m",
        "synopsis": "O início da jornada emocionante de The Acolyte.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/asQLjDkh2iqdIGMknf5c5EsvTub.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=acolyteS01E01"
      },
      {
        "title": "O Confronto",
        "season": 1,
        "episode": 2,
        "duration": "42m",
        "synopsis": "Tensões aumentam à medida que novos segredos são revelados.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/asQLjDkh2iqdIGMknf5c5EsvTub.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=acolyteS01E02"
      },
      {
        "title": "A Revelação",
        "season": 1,
        "episode": 3,
        "duration": "48m",
        "synopsis": "Um desfecho surpreendente que mudará o rumo da história.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/asQLjDkh2iqdIGMknf5c5EsvTub.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=acolyteS01E03"
      }
    ]
  },
  {
    "id": "xmen-97",
    "title": "X-Men '97",
    "year": 2024,
    "rating": 4.9,
    "seasons": "1 Temporada",
    "genres": [
      "Animação",
      "Ação",
      "Sci-Fi"
    ],
    "tmdbId": 126310,
    "synopsis": "Os mutantes lendários continuam sua batalha pela coexistência pacífica.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/vR54h7p2n7c1V2N0mB48Z0.jpg",
    "banner": "https://image.tmdb.org/t/p/original/fm6a5nSjl94U40g3nC48nU1k4q.jpg",
    "isRelease": false,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=xmen-97S01E01",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ],
    "episodes": [
      {
        "title": "Piloto",
        "season": 1,
        "episode": 1,
        "duration": "45m",
        "synopsis": "O início da jornada emocionante de X-Men '97.",
        "thumbnail": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/vR54h7p2n7c1V2N0mB48Z0.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=xmen-97S01E01"
      },
      {
        "title": "O Confronto",
        "season": 1,
        "episode": 2,
        "duration": "42m",
        "synopsis": "Tensões aumentam à medida que novos segredos são revelados.",
        "thumbnail": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/vR54h7p2n7c1V2N0mB48Z0.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=xmen-97S01E02"
      },
      {
        "title": "A Revelação",
        "season": 1,
        "episode": 3,
        "duration": "48m",
        "synopsis": "Um desfecho surpreendente que mudará o rumo da história.",
        "thumbnail": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/vR54h7p2n7c1V2N0mB48Z0.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=xmen-97S01E03"
      }
    ]
  },
  {
    "id": "knuckles-series",
    "title": "Knuckles",
    "year": 2024,
    "rating": 4.5,
    "seasons": "1 Temporada",
    "genres": [
      "Aventura",
      "Ação",
      "Família"
    ],
    "tmdbId": 158300,
    "synopsis": "Knuckles treina Wade nos caminhos da força guerreira Equidna.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/qpcy8hs1ksd5QT85fAC4Le4v6zk.jpg",
    "banner": "https://image.tmdb.org/t/p/original/aMpNvgWjPimLldhKgwtCt5NjLen.jpg",
    "isRelease": false,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=knuckles-seriesS01E01",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ],
    "episodes": [
      {
        "title": "Piloto",
        "season": 1,
        "episode": 1,
        "duration": "45m",
        "synopsis": "O início da jornada emocionante de Knuckles.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/aMpNvgWjPimLldhKgwtCt5NjLen.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=knuckles-seriesS01E01"
      },
      {
        "title": "O Confronto",
        "season": 1,
        "episode": 2,
        "duration": "42m",
        "synopsis": "Tensões aumentam à medida que novos segredos são revelados.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/aMpNvgWjPimLldhKgwtCt5NjLen.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=knuckles-seriesS01E02"
      },
      {
        "title": "A Revelação",
        "season": 1,
        "episode": 3,
        "duration": "48m",
        "synopsis": "Um desfecho surpreendente que mudará o rumo da história.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/aMpNvgWjPimLldhKgwtCt5NjLen.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=knuckles-seriesS01E03"
      }
    ]
  },
  {
    "id": "daredevil-born-again",
    "title": "Demolidor: Renascido",
    "year": 2025,
    "rating": 4.8,
    "seasons": "1 Temporada",
    "genres": [
      "Ação",
      "Drama",
      "Crime"
    ],
    "tmdbId": 202555,
    "synopsis": "Matt Murdock retorna à sua missão de vigilante nas ruas de Hell's Kitchen.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/r5hNFtkNAauxc2G4VUlnJOaVIb0.jpg",
    "banner": "https://image.tmdb.org/t/p/original/qrTAc0ZtQ859Qu5O8cixJzNJpQs.jpg",
    "isRelease": true,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=daredevil-born-againS01E01",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ],
    "episodes": [
      {
        "title": "Piloto",
        "season": 1,
        "episode": 1,
        "duration": "45m",
        "synopsis": "O início da jornada emocionante de Demolidor: Renascido.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/qrTAc0ZtQ859Qu5O8cixJzNJpQs.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=daredevil-born-againS01E01"
      },
      {
        "title": "O Confronto",
        "season": 1,
        "episode": 2,
        "duration": "42m",
        "synopsis": "Tensões aumentam à medida que novos segredos são revelados.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/qrTAc0ZtQ859Qu5O8cixJzNJpQs.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=daredevil-born-againS01E02"
      },
      {
        "title": "A Revelação",
        "season": 1,
        "episode": 3,
        "duration": "48m",
        "synopsis": "Um desfecho surpreendente que mudará o rumo da história.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/qrTAc0ZtQ859Qu5O8cixJzNJpQs.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=daredevil-born-againS01E03"
      }
    ]
  },
  {
    "id": "peacemaker-s2",
    "title": "Pacificador",
    "year": 2025,
    "rating": 4.7,
    "seasons": "2 Temporadas",
    "genres": [
      "Ação",
      "Comédia",
      "Sci-Fi"
    ],
    "tmdbId": 110492,
    "synopsis": "O Pacificador continua suas missões caóticas e hilárias para salvar a humanidade.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/fbW4ym5rgMRkNjNAzpZQX5vkxMf.jpg",
    "banner": "https://image.tmdb.org/t/p/original/aJcUU3LMlqMKBi8L3eaxGfAbd4G.jpg",
    "isRelease": true,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=peacemaker-s2S01E01",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ],
    "episodes": [
      {
        "title": "Piloto",
        "season": 1,
        "episode": 1,
        "duration": "45m",
        "synopsis": "O início da jornada emocionante de Pacificador.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/aJcUU3LMlqMKBi8L3eaxGfAbd4G.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=peacemaker-s2S01E01"
      },
      {
        "title": "O Confronto",
        "season": 1,
        "episode": 2,
        "duration": "42m",
        "synopsis": "Tensões aumentam à medida que novos segredos são revelados.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/aJcUU3LMlqMKBi8L3eaxGfAbd4G.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=peacemaker-s2S01E02"
      },
      {
        "title": "A Revelação",
        "season": 1,
        "episode": 3,
        "duration": "48m",
        "synopsis": "Um desfecho surpreendente que mudará o rumo da história.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/aJcUU3LMlqMKBi8L3eaxGfAbd4G.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=peacemaker-s2S01E03"
      }
    ]
  },
  {
    "id": "percy-jackson",
    "title": "Percy Jackson e os Olimpianos",
    "year": 2024,
    "rating": 4.6,
    "seasons": "1 Temporada",
    "genres": [
      "Aventura",
      "Família",
      "Fantasia"
    ],
    "tmdbId": 213222,
    "synopsis": "O jovem semideus Percy descobre seus poderes e viaja para impedir uma guerra.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/5CKlO1fSqTywYEiFZyOEeRWzFxj.jpg",
    "banner": "https://image.tmdb.org/t/p/original/5CKlO1fSqTywYEiFZyOEeRWzFxj.jpg",
    "isRelease": false,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=percy-jacksonS01E01",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ],
    "episodes": [
      {
        "title": "Piloto",
        "season": 1,
        "episode": 1,
        "duration": "45m",
        "synopsis": "O início da jornada emocionante de Percy Jackson e os Olimpianos.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/5CKlO1fSqTywYEiFZyOEeRWzFxj.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=percy-jacksonS01E01"
      },
      {
        "title": "O Confronto",
        "season": 1,
        "episode": 2,
        "duration": "42m",
        "synopsis": "Tensões aumentam à medida que novos segredos são revelados.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/5CKlO1fSqTywYEiFZyOEeRWzFxj.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=percy-jacksonS01E02"
      },
      {
        "title": "A Revelação",
        "season": 1,
        "episode": 3,
        "duration": "48m",
        "synopsis": "Um desfecho surpreendente que mudará o rumo da história.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/5CKlO1fSqTywYEiFZyOEeRWzFxj.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=percy-jacksonS01E03"
      }
    ]
  },
  {
    "id": "avatar-netflix",
    "title": "Avatar: O Último Mestre do Ar",
    "year": 2024,
    "rating": 4.6,
    "seasons": "1 Temporada",
    "genres": [
      "Aventura",
      "Fantasia",
      "Ação"
    ],
    "tmdbId": 82452,
    "synopsis": "O jovem dobrador de ar Aang deve dominar os quatro elementos para salvar o mundo.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/zCz483fU94RxRt1gdGW1rxQkcID.jpg",
    "banner": "https://image.tmdb.org/t/p/original/xUB3xFMgsHgPmdWnUWkHTJ03vHa.jpg",
    "isRelease": false,
    "isPopular": false,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=avatar-netflixS01E01",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ],
    "episodes": [
      {
        "title": "Piloto",
        "season": 1,
        "episode": 1,
        "duration": "45m",
        "synopsis": "O início da jornada emocionante de Avatar: O Último Mestre do Ar.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/xUB3xFMgsHgPmdWnUWkHTJ03vHa.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=avatar-netflixS01E01"
      },
      {
        "title": "O Confronto",
        "season": 1,
        "episode": 2,
        "duration": "42m",
        "synopsis": "Tensões aumentam à medida que novos segredos são revelados.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/xUB3xFMgsHgPmdWnUWkHTJ03vHa.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=avatar-netflixS01E02"
      },
      {
        "title": "A Revelação",
        "season": 1,
        "episode": 3,
        "duration": "48m",
        "synopsis": "Um desfecho surpreendente que mudará o rumo da história.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/xUB3xFMgsHgPmdWnUWkHTJ03vHa.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=avatar-netflixS01E03"
      }
    ]
  },
  {
    "id": "one-piece-live",
    "title": "One Piece",
    "year": 2023,
    "rating": 4.7,
    "seasons": "1 Temporada",
    "genres": [
      "Aventura",
      "Ação",
      "Fantasia"
    ],
    "tmdbId": 110316,
    "synopsis": "Monkey D. Luffy recruta sua tripulação pirata rumo ao tesouro Lendário.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/Ac8ruycRXzgcsndTZFK6ouGA0FA.jpg",
    "banner": "https://image.tmdb.org/t/p/original/QZaPkNUvhdcKONuO2fXuqtcQRo.jpg",
    "isRelease": false,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=one-piece-liveS01E01",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ],
    "episodes": [
      {
        "title": "Piloto",
        "season": 1,
        "episode": 1,
        "duration": "45m",
        "synopsis": "O início da jornada emocionante de One Piece.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/QZaPkNUvhdcKONuO2fXuqtcQRo.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=one-piece-liveS01E01"
      },
      {
        "title": "O Confronto",
        "season": 1,
        "episode": 2,
        "duration": "42m",
        "synopsis": "Tensões aumentam à medida que novos segredos são revelados.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/QZaPkNUvhdcKONuO2fXuqtcQRo.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=one-piece-liveS01E02"
      },
      {
        "title": "A Revelação",
        "season": 1,
        "episode": 3,
        "duration": "48m",
        "synopsis": "Um desfecho surpreendente que mudará o rumo da história.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/QZaPkNUvhdcKONuO2fXuqtcQRo.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=one-piece-liveS01E03"
      }
    ]
  },
  {
    "id": "invincible-series",
    "title": "Invencível",
    "year": 2024,
    "rating": 4.8,
    "seasons": "2 Temporadas",
    "genres": [
      "Animação",
      "Ação",
      "Sci-Fi"
    ],
    "tmdbId": 95557,
    "synopsis": "Mark Grayson descobre os segredos sombrios de seu pai super-herói.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/qhb7RWU9ad9a5m3HbeRRXzjaMXf.jpg",
    "banner": "https://image.tmdb.org/t/p/original/9qrroces8C6R9aKr08hACNPVXdZ.jpg",
    "isRelease": false,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=invincible-seriesS01E01",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ],
    "episodes": [
      {
        "title": "Piloto",
        "season": 1,
        "episode": 1,
        "duration": "45m",
        "synopsis": "O início da jornada emocionante de Invencível.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/9qrroces8C6R9aKr08hACNPVXdZ.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=invincible-seriesS01E01"
      },
      {
        "title": "O Confronto",
        "season": 1,
        "episode": 2,
        "duration": "42m",
        "synopsis": "Tensões aumentam à medida que novos segredos são revelados.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/9qrroces8C6R9aKr08hACNPVXdZ.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=invincible-seriesS01E02"
      },
      {
        "title": "A Revelação",
        "season": 1,
        "episode": 3,
        "duration": "48m",
        "synopsis": "Um desfecho surpreendente que mudará o rumo da história.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/9qrroces8C6R9aKr08hACNPVXdZ.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=invincible-seriesS01E03"
      }
    ]
  },
  {
    "id": "white-lotus",
    "title": "The White Lotus",
    "year": 2025,
    "rating": 4.7,
    "seasons": "3 Temporadas",
    "genres": [
      "Drama",
      "Comédia"
    ],
    "tmdbId": 111803,
    "synopsis": "As intrigas e segredos de hóspedes ricos em resorts tropicais luxuosos.",
    "category": "series",
    "poster": "https://image.tmdb.org/t/p/w600_and_h900_bestv2/sQ35C3pjM8xCBT87xI90DuzizZD.jpg",
    "banner": "https://image.tmdb.org/t/p/original/rCTLaPwuApDx8vLGjYZ9pRl7zRB.jpg",
    "isRelease": true,
    "isPopular": true,
    "isClassic": false,
    "trailerUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=white-lotusS01E01",
    "cast": [
      {
        "name": "Principal",
        "character": "Protagonista",
        "image": "https://image.tmdb.org/t/p/w200/Boyd.jpg"
      }
    ],
    "episodes": [
      {
        "title": "Piloto",
        "season": 1,
        "episode": 1,
        "duration": "45m",
        "synopsis": "O início da jornada emocionante de The White Lotus.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/rCTLaPwuApDx8vLGjYZ9pRl7zRB.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=white-lotusS01E01"
      },
      {
        "title": "O Confronto",
        "season": 1,
        "episode": 2,
        "duration": "42m",
        "synopsis": "Tensões aumentam à medida que novos segredos são revelados.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/rCTLaPwuApDx8vLGjYZ9pRl7zRB.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=white-lotusS01E02"
      },
      {
        "title": "A Revelação",
        "season": 1,
        "episode": 3,
        "duration": "48m",
        "synopsis": "Um desfecho surpreendente que mudará o rumo da história.",
        "thumbnail": "https://image.tmdb.org/t/p/w500/rCTLaPwuApDx8vLGjYZ9pRl7zRB.jpg",
        "videoUrl": "https://redecanais.win/player3/server.php?server=RCFServer2&subfolder=series&vid=white-lotusS01E03"
      }
    ]
  }
];

let favorites = [];

let userProfile = {
  name: "Bruno Arantes",
  email: "bruno.arantes@example.com",
  avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80",
  streamingQuality: "Premium 4K",
  autoPlayTrailers: true,
  preferredLanguage: "Portuguese"
};

// Recent episodes list structure
const recentEpisodes = [
  {
    "id": "ep-house-1-2",
    "seriesId": "house-of-the-dragon",
    "seriesTitle": "A Casa do Dragão",
    "title": "O Príncipe Rebelde",
    "season": 1,
    "episode": 2,
    "duration": "54m",
    "thumbnail": "https://image.tmdb.org/t/p/w500/577eXC8wFQT0eUrJcgznSiFPRmk.jpg",
    "addedTime": "Ontem"
  },
  {
    "id": "ep-stranger-1-2",
    "seriesId": "stranger-things",
    "seriesTitle": "Stranger Things",
    "title": "Capítulo Dois: A Estranha da Maple Street",
    "season": 1,
    "episode": 2,
    "duration": "55m",
    "thumbnail": "https://image.tmdb.org/t/p/w500/56v2KjBlU4XaOv9rVYEQypROD7P.jpg",
    "addedTime": "Há 2 dias"
  }
];

// Get catalog content with search and filters
app.get('/api/content', (req, res) => {
  const { q, category, genre, year } = req.query;
  let filtered = [...contentDatabase];

  if (q) {
    const searchVal = q.toString().toLowerCase();
    filtered = filtered.filter(item => 
      item.title.toLowerCase().includes(searchVal) || 
      item.synopsis.toLowerCase().includes(searchVal) ||
      item.genres.some(g => g.toLowerCase().includes(searchVal))
    );
  }

  if (category) {
    if (category === "movie") {
      filtered = filtered.filter(item => item.category === "movie");
    } else if (category === "series") {
      filtered = filtered.filter(item => item.category === "series");
    } else if (category === "classic") {
      filtered = filtered.filter(item => item.isClassic);
    } else if (category === "release") {
      filtered = filtered.filter(item => item.isRelease);
    }
  }

  if (genre) {
    const genreStr = genre.toString().toLowerCase();
    filtered = filtered.filter(item => 
      item.genres.some(g => g.toLowerCase() === genreStr)
    );
  }

  if (year) {
    const yearVal = parseInt(year.toString(), 10);
    if (!isNaN(yearVal)) {
      filtered = filtered.filter(item => item.year === yearVal);
    }
  }

  res.json(filtered);
});

// Get content detail
app.get('/api/content/:id', (req, res) => {
  const content = contentDatabase.find(item => item.id === req.params.id);
  if (content) {
    res.json(content);
  } else {
    res.status(404).json({ error: "Content not found" });
  }
});

// Get recent episodes
app.get('/api/recent-episodes', (req, res) => {
  res.json(recentEpisodes);
});

// Get favorites
app.get('/api/favorites', (req, res) => {
  const favItems = contentDatabase.filter(item => favorites.includes(item.id));
  res.json(favItems);
});

// Add to favorites
app.post('/api/favorites', (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: "Content ID required" });
  }
  if (!contentDatabase.some(item => item.id === id)) {
    return res.status(404).json({ error: "Content not found" });
  }
  if (!favorites.includes(id)) {
    favorites.push(id);
  }
  const favItems = contentDatabase.filter(item => favorites.includes(item.id));
  res.json(favItems);
});

// Delete from favorites
app.delete('/api/favorites/:id', (req, res) => {
  const { id } = req.params;
  favorites = favorites.filter(favId => favId !== id);
  const favItems = contentDatabase.filter(item => favorites.includes(item.id));
  res.json(favItems);
});

// Get profile
app.get('/api/profile', (req, res) => {
  res.json(userProfile);
});

// Update profile
app.put('/api/profile', (req, res) => {
  userProfile = {
    ...userProfile,
    ...req.body
  };
  res.json(userProfile);
});

// Auth: Login
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Usuário e senha são obrigatórios." });
  }

  const users = loadUsers();
  const user = users.find(u => 
    (u.username && u.username.toLowerCase() === username.toLowerCase() && u.password === password) ||
    (u.email && u.email.toLowerCase() === username.toLowerCase() && u.password === password)
  );

  if (!user) {
    return res.status(401).json({ error: "Usuário ou senha incorretos." });
  }

  // Update global session user profile to match the logged-in user
  userProfile = {
    name: user.name,
    username: user.username,
    avatar: user.avatar,
    streamingQuality: "Premium 4K",
    autoPlayTrailers: true,
    preferredLanguage: "Portuguese"
  };

  res.json({ success: true, profile: userProfile });
});

// Auth: Register
app.post('/api/auth/register', (req, res) => {
  const { name, username, password } = req.body;
  if (!name || !username || !password) {
    return res.status(400).json({ error: "Todos os campos são obrigatórios." });
  }

  const users = loadUsers();
  if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(409).json({ error: "Este usuário já está cadastrado." });
  }

  const newUser = {
    name,
    username,
    password,
    avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80"
  };
  users.push(newUser);
  saveUsers(users);

  // Auto-login after registration
  userProfile = {
    name: newUser.name,
    username: newUser.username,
    avatar: newUser.avatar,
    streamingQuality: "Premium 4K",
    autoPlayTrailers: true,
    preferredLanguage: "Portuguese"
  };

  res.status(201).json({ success: true, profile: userProfile });
});

// Admin: Trigger dynamic catalog scrape manually
app.post('/api/admin/scrape', async (req, res) => {
  try {
    const addedCount = await autoScrapeWarezCdn();
    res.json({ success: true, message: `Scraping completed. Added ${addedCount} new items.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start server
// Trigger reload 4
app.listen(PORT, () => {
  console.log(`Baixo Custo backend running on http://localhost:${PORT}`);
  
  // Run auto-scraper on startup after 5 seconds, then every 60 minutes
  setTimeout(() => {
    autoScrapeWarezCdn().catch(console.error);
  }, 5000);
  
  setInterval(() => {
    autoScrapeWarezCdn().catch(console.error);
  }, 60 * 60 * 1000);
});
