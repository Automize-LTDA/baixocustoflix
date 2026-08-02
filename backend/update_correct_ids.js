import fs from 'fs';
import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');

const serverJsPath = 'C:/Users/Bruno Arantes/OneDrive/Desktop/Acesso/baixocusto/backend/server.js';

const overrides = {
  'flow': 1114614,
  'elio': 950396,
  'minecraft-movie': 950387,
  'superman-2025': 848327,
  'fantastic-four-2025': 617126,
  'jurassic-world-4': 1234821,
  'captain-america-4': 822119,
  'thunderbolts': 76341,
  'avatar-3': 83533,
  'ballerina-2025': 541671,
  'f1-2025': 911430,
  'tron-ares': 533533,
  'conjuring-4': 1038392,
  'black-phone-2': 1197137,
  'fnaf-2': 1086747,
  'megan-2': 1071585,
  'michael-jackson': 1007757,
  'avengers-5': 1003596,
  'the-batman-2': 806704,
  'supergirl-mulher-amanha': 1081003,
  'shrek-5': 421892,
  'frozen-3': 330457, // Frozen 2 as fallback
  'dune-3': 1269666,
  'now-you-see-me-3': 425274,
  'constantine-2': 561, // Original Constantine
  'i-am-legend-2': 6479, // Original I Am Legend
  'avatar-netflix': 82452,
  'one-piece-live': 110316,
  'invincible-series': 95557,
  'white-lotus': 111803,
  'peacemaker-s2': 110492,
  'percy-jackson': 213222,
  'knuckles-series': 158300,
  'daredevil-born-again': 202555,
  'x-men-97': 138502,
  'mandalorian-grogu': 1065099,
  'project-hail-mary': 687163,
  'toy-story-5': 1084244,
  'scream-7': 1159559
};

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchImages(tmdbId, category) {
  const url = `https://www.themoviedb.org/${category}/${tmdbId}`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    if (!res.ok) {
      console.log(`Failed to fetch ${url}: Status ${res.status}`);
      return null;
    }
    const html = await res.text();
    const ogImages = html.match(/<meta property="og:image" content="([^"]+)"/g);
    if (!ogImages || ogImages.length === 0) {
      console.log(`No OG images found for ${url}`);
      return null;
    }
    
    const urls = ogImages.map(tag => {
      const match = tag.match(/content="([^"]+)"/);
      return match ? match[1] : null;
    }).filter(Boolean);

    const standardized = urls.map(u => u.replace('media.themoviedb.org', 'image.tmdb.org'));
    
    let poster = standardized[0];
    let banner = standardized[1] || standardized[0];

    return { poster, banner };
  } catch (e) {
    console.error(`Error fetching ${url}:`, e.message);
    return null;
  }
}

async function main() {
  console.log('Reading server.js...');
  let content = fs.readFileSync(serverJsPath, 'utf8');

  // Match contentDatabase
  const dbMatch = content.match(/const contentDatabase = (\[[\s\S]+?\]);\s*\n\s*let favorites =/);
  if (!dbMatch) {
    console.error('Could not find contentDatabase in server.js');
    return;
  }
  
  // Match recentEpisodes
  const episodesMatch = content.match(/const recentEpisodes = (\[[\s\S]+?\]);\s*\n\s*\/\/\s*Get catalog/);
  if (!episodesMatch) {
    console.error('Could not find recentEpisodes in server.js');
    return;
  }

  let contentDatabase = eval(dbMatch[1]);
  let recentEpisodes = eval(episodesMatch[1]);

  console.log(`Loaded ${contentDatabase.length} items from database.`);

  // 1. Resolve contentDatabase items
  let count = 0;
  for (let item of contentDatabase) {
    count++;
    
    // Apply ID override if exists
    if (overrides[item.id]) {
      console.log(`Overriding TMDB ID for "${item.title}": ${item.tmdbId} -> ${overrides[item.id]}`);
      item.tmdbId = overrides[item.id];
    }

    if (!item.tmdbId) {
      console.log(`[${count}/${contentDatabase.length}] Skipping "${item.title}" - no tmdbId`);
      continue;
    }

    // Special override for Obsessão to use custom high-quality images
    if (item.id === 'obsessao') {
      item.poster = 'https://image.tmdb.org/t/p/original/c1Yg0Lxj5SR0C1VxpvAAf15jFvi.jpg';
      item.banner = 'https://image.tmdb.org/t/p/original/rZfmzpixLKLR3Hg2u0WgC7XLFl8.jpg';
      console.log(`[${count}/${contentDatabase.length}] Set custom images for Obsessão.`);
      continue;
    }

    console.log(`[${count}/${contentDatabase.length}] Fetching images for "${item.title}" (ID: ${item.tmdbId}, ${item.category})...`);
    const category = item.category === 'movie' ? 'movie' : 'tv';
    const images = await fetchImages(item.tmdbId, category);
    
    if (images) {
      item.poster = images.poster.replace('/w500/', '/w600_and_h900_bestv2/');
      item.banner = images.banner.replace('/w780/', '/original/').replace('/w500/', '/original/');
      
      console.log(`  -> Poster: ${item.poster}`);
      console.log(`  -> Banner: ${item.banner}`);

      // If series, update episode thumbnails
      if (item.category === 'series' && item.episodes) {
        const epThumbnail = item.banner.replace('/original/', '/w500/');
        for (let ep of item.episodes) {
          ep.thumbnail = epThumbnail;
        }
      }
    } else {
      console.log(`  -> Failed to resolve images for "${item.title}"`);
    }

    await delay(150);
  }

  // 2. Resolve recentEpisodes items
  const recentExtraIds = {
    'house-of-the-dragon': { tmdbId: 94997, category: 'tv' },
    'stranger-things': { tmdbId: 66732, category: 'tv' }
  };

  for (let item of recentEpisodes) {
    const extra = recentExtraIds[item.seriesId];
    if (extra) {
      console.log(`Fetching images for recent episode "${item.seriesTitle}"...`);
      const images = await fetchImages(extra.tmdbId, extra.category);
      if (images) {
        item.thumbnail = images.banner.replace('/w780/', '/w500/').replace('/original/', '/w500/');
        console.log(`  -> Episode Thumbnail: ${item.thumbnail}`);
      }
    }
  }

  // 3. Write back to server.js
  console.log('Writing back to server.js...');
  const formattedDb = JSON.stringify(contentDatabase, null, 2);
  const formattedEpisodes = JSON.stringify(recentEpisodes, null, 2);

  let newContent = content.replace(
    /const contentDatabase = \[[\s\S]+?\];\s*\n\s*let favorites =/,
    `const contentDatabase = ${formattedDb};\n\nlet favorites =`
  );

  newContent = newContent.replace(
    /const recentEpisodes = \[[\s\S]+?\];\s*\n\s*\/\/\s*Get catalog/,
    `const recentEpisodes = ${formattedEpisodes};\n\n// Get catalog`
  );

  fs.writeFileSync(serverJsPath, newContent, 'utf8');
  console.log('Successfully completed database update with correct IDs and images!');
}

main();
