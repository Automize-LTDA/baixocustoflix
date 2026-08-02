import { useState, useEffect, useMemo } from 'react';
import { Sidebar } from './components/Sidebar';
import { HeroBanner } from './components/HeroBanner';
import { ContentRow } from './components/ContentRow';
import { RecentEpisodesRow } from './components/RecentEpisodesRow';
import { FilterSection } from './components/FilterSection';
import { MovieCard } from './components/MovieCard';
import { MovieDetailModal } from './components/MovieDetailModal';
import { CinematicPlayer } from './components/CinematicPlayer';
import { ProfileView } from './components/ProfileView';
import { LoginPanel } from './components/LoginPanel';
import { ProfileSelection } from './components/ProfileSelection';
import type { ContentItem, RecentEpisode, UserProfile } from './types';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Heart, Loader2 } from 'lucide-react';
import { getWatchHistoryFromSupabase, saveWatchItemToSupabase, type DBWatchItem } from './lib/supabase';

const API_BASE = '/api';

// Build user profile from localStorage after login
function buildProfileFromSession(): UserProfile | null {
  const username = localStorage.getItem('loggedUsername');
  const name = localStorage.getItem('loggedUserName');
  const avatar = localStorage.getItem('selectedProfileAvatar');
  const profileName = localStorage.getItem('selectedProfileName');

  if (!username) return null;

  return {
    name: profileName || name || username,
    username,
    avatar: avatar || '',
    streamingQuality: 'Premium 4K',
    autoPlayTrailers: true,
    preferredLanguage: 'Portuguese',
  };
}

function App() {
  const [activeTab, setActiveTab] = useState<string>('home');
  const [contentList, setContentList] = useState<ContentItem[]>([]);
  const [recentEpisodes, setRecentEpisodes] = useState<RecentEpisode[]>([]);
  const [favorites, setFavorites] = useState<ContentItem[]>([]);

  // ─── Auth & Session (checked FIRST, before backend calls) ───────────────────
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => {
    return localStorage.getItem('isLoggedIn') === 'true';
  });

  const [selectedProfileName, setSelectedProfileName] = useState<string | null>(() => {
    return localStorage.getItem('selectedProfileName');
  });

  const [userProfile, setUserProfile] = useState<UserProfile | null>(() => {
    return buildProfileFromSession();
  });

  // ─── Data loading ────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ─── Filters ─────────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedGenre, setSelectedGenre] = useState('');
  const [selectedYear, setSelectedYear] = useState('');

  // ─── Modals & Players ────────────────────────────────────────────────────────
  const [selectedContent, setSelectedContent] = useState<ContentItem | null>(null);
  const [activePlayer, setActivePlayer] = useState<{
    url: string;
    title: string;
    contentId?: string;
    season?: number;
    episode?: number;
  } | null>(null);

  // ─── Handlers ────────────────────────────────────────────────────────────────
  const handleLoginSuccess = () => {
    setIsLoggedIn(true);
    // Rebuild profile from fresh localStorage values set by LoginPanel
    setUserProfile(buildProfileFromSession());
  };

  const handleSelectProfile = (name: string, avatar: string) => {
    setSelectedProfileName(name);
    localStorage.setItem('selectedProfileName', name);
    localStorage.setItem('selectedProfileAvatar', avatar);

    setUserProfile(prev => ({
      name,
      username: prev?.username || localStorage.getItem('loggedUsername') || name,
      avatar,
      streamingQuality: prev?.streamingQuality || 'Premium 4K',
      autoPlayTrailers: prev?.autoPlayTrailers ?? true,
      preferredLanguage: prev?.preferredLanguage || 'Portuguese',
    }));
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setSelectedProfileName(null);
    setUserProfile(null);
    setActiveTab('home');
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('loggedUsername');
    localStorage.removeItem('loggedUserName');
    localStorage.removeItem('selectedProfileName');
    localStorage.removeItem('selectedProfileAvatar');
  };

  // ─── Load backend data & Supabase Watch History (only when logged in) ─────────────
  useEffect(() => {
    if (!isLoggedIn || !selectedProfileName) return;

    const fetchInitialData = async () => {
      try {
        setLoading(true);
        setError(null);

        const currentUsername = localStorage.getItem('loggedUsername') || 'usuario';

        const [epRes, favRes, supabaseHistory] = await Promise.all([
          fetch(`${API_BASE}/recent-episodes`).catch(() => null),
          fetch(`${API_BASE}/favorites`).catch(() => null),
          getWatchHistoryFromSupabase(currentUsername)
        ]);

        if (supabaseHistory && supabaseHistory.length > 0) {
          const mappedEpisodes: RecentEpisode[] = supabaseHistory.map(item => ({
            id: `${item.content_id}-s${item.season || 1}e${item.episode || 1}`,
            seriesId: item.content_id,
            seriesTitle: item.title,
            title: item.episode_title || item.title,
            season: item.season || 1,
            episode: item.episode || 1,
            duration: item.duration_label || '45m',
            thumbnail: item.thumbnail || '',
            addedTime: item.added_time || 'Hoje'
          }));
          setRecentEpisodes(mappedEpisodes);
        } else if (epRes && epRes.ok) {
          const epData = await epRes.json();
          setRecentEpisodes(epData);
        }

        if (favRes && favRes.ok) {
          const favData = await favRes.json();
          setFavorites(favData);
        }
      } catch (err) {
        console.error('Erro ao carregar dados iniciais:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();
  }, [isLoggedIn, selectedProfileName]);

  const handleSaveWatchProgress = async (
    item: ContentItem | null,
    season?: number,
    episode?: number
  ) => {
    if (!item) return;

    const currentUsername = userProfile?.username || localStorage.getItem('loggedUsername') || 'usuario';

    let episodeTitle = item.title;
    let seasonNum = season || 1;
    let episodeNum = episode || 1;
    let thumbnail = item.banner || item.poster;

    if (item.category === 'series' && item.episodes) {
      const matchedEp = item.episodes.find(
        ep => ep.season === seasonNum && ep.episode === episodeNum
      );
      if (matchedEp) {
        episodeTitle = matchedEp.title;
        if (matchedEp.thumbnail) thumbnail = matchedEp.thumbnail;
      }
    }

    const newWatchItem: DBWatchItem = {
      username: currentUsername,
      content_id: item.id,
      title: item.title,
      category: item.category,
      thumbnail,
      season: seasonNum,
      episode: episodeNum,
      episode_title: episodeTitle,
      duration_label: item.duration || '45m',
      added_time: 'Hoje',
      updated_at: new Date().toISOString()
    };

    // 1. Salvar na tabela watch_history no Supabase
    await saveWatchItemToSupabase(newWatchItem);

    // 2. Atualizar estado local dos episódios recentes instantaneamente
    setRecentEpisodes(prev => {
      const filtered = prev.filter(ep => ep.seriesId !== item.id || ep.season !== seasonNum || ep.episode !== episodeNum);
      const updatedEp: RecentEpisode = {
        id: `${item.id}-s${seasonNum}e${episodeNum}`,
        seriesId: item.id,
        seriesTitle: item.title,
        title: episodeTitle,
        season: seasonNum,
        episode: episodeNum,
        duration: item.duration || '45m',
        thumbnail,
        addedTime: 'Hoje'
      };
      return [updatedEp, ...filtered];
    });
  };

  // ─── Fetch catalog (debounced on filter changes) ─────────────────────────────
  useEffect(() => {
    if (!isLoggedIn || !selectedProfileName) return;

    const fetchCatalog = async () => {
      try {
        let url = `${API_BASE}/content?`;
        if (searchQuery) url += `q=${encodeURIComponent(searchQuery)}&`;
        if (selectedCategory && selectedCategory !== 'all') url += `category=${selectedCategory}&`;
        if (selectedGenre) url += `genre=${encodeURIComponent(selectedGenre)}&`;
        if (selectedYear) url += `year=${selectedYear}&`;

        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setContentList(data);
          }
        }
      } catch (err) {
        console.error('Erro ao carregar catálogo:', err);
      }
    };

    fetchCatalog();
  }, [searchQuery, selectedCategory, selectedGenre, selectedYear, isLoggedIn, selectedProfileName]);

  // ─── Favorite actions ─────────────────────────────────────────────────────────
  const handleToggleFavorite = async (id: string) => {
    try {
      const isFav = favorites.some(item => item.id === id);
      let res;
      if (isFav) {
        res = await fetch(`${API_BASE}/favorites/${id}`, { method: 'DELETE' });
      } else {
        res = await fetch(`${API_BASE}/favorites`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        });
      }
      if (res.ok) {
        const updatedFavs = await res.json();
        setFavorites(updatedFavs);
      }
    } catch (err) {
      console.error('Erro ao alternar favoritos:', err);
    }
  };

  const handleUpdateProfile = async (updated: UserProfile) => {
    try {
      const res = await fetch(`${API_BASE}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      if (res.ok) {
        const data = await res.json();
        setUserProfile(data);
      } else {
        // If backend is offline, update locally
        setUserProfile(updated);
      }
    } catch {
      setUserProfile(updated);
    }
  };

  const handleRecentEpisodeClick = async (seriesId: string) => {
    try {
      const res = await fetch(`${API_BASE}/content/${seriesId}`);
      if (res.ok) {
        const item = await res.json();
        setSelectedContent(item);
      }
    } catch (err) {
      console.error('Erro ao buscar série por id:', err);
    }
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedCategory('all');
    setSelectedGenre('');
    setSelectedYear('');
  };

  // ─── Derived data ─────────────────────────────────────────────────────────────
  const genresList = [
    'Sci-Fi', 'Adventure', 'Drama', 'Biography', 'History', 'Classic',
    'Romance', 'Crime', 'Action', 'Fantasy', 'Thriller',
  ];
  const yearsList = ['2024', '2023', '2022', '2019', '2016', '2014', '1994', '1972', '1942', '1927', '1922'];

  const popularItems = useMemo(() => {
    // "Em Alta": Lançamentos de 2026 e produções populares
    return contentList.filter(item => item.year === 2026 || item.isPopular);
  }, [contentList]);

  const releases = useMemo(() => {
    return contentList.filter(item => item.category === 'movie' && (item.year === 2026 || item.isRelease));
  }, [contentList]);

  const popularSeries = useMemo(() => {
    return contentList.filter(item => item.category === 'series' && (item.year === 2026 || item.isPopular));
  }, [contentList]);

  const classics = useMemo(() => {
    return contentList.filter(item => item.isClassic);
  }, [contentList]);

  const featuredItem = useMemo(() => {
    if (contentList.length === 0) return null;
    // O filme inicial deve ser A Odisseia (The Odyssey)
    const odyssey = contentList.find(item =>
      item.id.includes('odisseia') ||
      item.title.toLowerCase().includes('odisseia') ||
      item.title.toLowerCase().includes('odyssey')
    );
    if (odyssey) return odyssey;
    return [...popularItems].sort((a, b) => b.rating - a.rating)[0] || contentList[0];
  }, [popularItems, contentList]);

  const getRecommendations = (item: ContentItem) =>
    contentList.filter(c => c.id !== item.id && c.genres.some(g => item.genres.includes(g)));

  // ─── Render guards (ORDER MATTERS) ───────────────────────────────────────────

  // 1. Not logged in → show login
  if (!isLoggedIn) {
    return <LoginPanel onLoginSuccess={handleLoginSuccess} />;
  }

  // 2. Logged in but no profile selected → show profile selection
  if (!selectedProfileName) {
    return (
      <ProfileSelection
        onSelectProfile={handleSelectProfile}
        currentUser={
          userProfile || {
            name: localStorage.getItem('loggedUserName') || 'Usuário',
            username: localStorage.getItem('loggedUsername') || 'usuario',
            avatar: '',
            streamingQuality: 'Premium 4K',
            autoPlayTrailers: true,
            preferredLanguage: 'Portuguese',
          }
        }
      />
    );
  }

  // 3. Loading backend data
  if (loading) {
    return (
      <div className="fixed inset-0 w-full h-full bg-obsidian flex flex-col items-center justify-center gap-4 text-slate-200">
        <Loader2 className="w-10 h-10 text-cinemaGold animate-spin" />
        <span className="font-outfit text-sm font-semibold tracking-wider uppercase text-glow">
          Carregando Baixo Custo...
        </span>
      </div>
    );
  }

  // 4. Backend error
  if (error) {
    return (
      <div className="fixed inset-0 w-full h-full bg-obsidian flex flex-col items-center justify-center gap-4 text-slate-200 px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-red-950/30 border border-red-500/30 flex items-center justify-center text-red-500 mb-2">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <h2 className="font-outfit font-bold text-xl text-white">Falha de Conexão com o Backend</h2>
        <p className="text-slate-400 text-sm max-w-md mt-1">
          {error}
        </p>
        <div className="flex gap-3 mt-6">
          <button
            onClick={() => {
              setError(null);
              setLoading(true);
              window.location.reload();
            }}
            className="px-6 py-3 bg-cinemaGold text-obsidian font-outfit font-bold text-xs rounded-xl shadow-premium-glow hover:scale-105 active:scale-95 transition-all duration-300"
          >
            Tentar Novamente
          </button>
          <button
            onClick={handleLogout}
            className="px-6 py-3 border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 font-outfit font-bold text-xs rounded-xl transition-all duration-300"
          >
            Sair
          </button>
        </div>
      </div>
    );
  }

  // ─── Main App ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-obsidian text-slate-200 flex flex-col md:flex-row">
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setActiveTab(tab);
          if (tab !== 'search') handleResetFilters();
        }}
        favoritesCount={favorites.length}
        userAvatar={userProfile?.avatar || ''}
        userName={selectedProfileName || ''}
      />

      {/* Main Content Area */}
      <main className="flex-1 md:ml-64 min-w-0 transition-all duration-300">

        <AnimatePresence mode="wait">
          {activeTab === 'home' && (
            <motion.div
              key="home"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="flex flex-col pb-28 md:pb-12"
            >
              {featuredItem && (
                <HeroBanner
                  content={featuredItem}
                  onOpenDetail={setSelectedContent}
                  isFavorite={favorites.some(f => f.id === featuredItem.id)}
                  onToggleFavorite={handleToggleFavorite}
                />
              )}

              <div className="max-w-7xl mx-auto w-full px-6 flex flex-col gap-8 -mt-8 md:-mt-16 z-20 relative">
                {popularItems.length > 0 && (
                  <ContentRow
                    title="Em Alta (Mais Assistidos)"
                    items={popularItems}
                    onCardClick={setSelectedContent}
                    favorites={favorites.map(f => f.id)}
                    onToggleFavorite={(id, e) => { e.stopPropagation(); handleToggleFavorite(id); }}
                  />
                )}

                <ContentRow
                  title="Filmes em Lançamento (2026)"
                  items={releases}
                  onCardClick={setSelectedContent}
                  favorites={favorites.map(f => f.id)}
                  onToggleFavorite={(id, e) => { e.stopPropagation(); handleToggleFavorite(id); }}
                />

                <ContentRow
                  title="Séries em Lançamento (2026)"
                  items={popularSeries}
                  onCardClick={setSelectedContent}
                  favorites={favorites.map(f => f.id)}
                  onToggleFavorite={(id, e) => { e.stopPropagation(); handleToggleFavorite(id); }}
                />

                <RecentEpisodesRow
                  episodes={recentEpisodes}
                  onEpisodeClick={handleRecentEpisodeClick}
                />

                <ContentRow
                  title="Clássicos Lendários"
                  items={classics}
                  onCardClick={setSelectedContent}
                  favorites={favorites.map(f => f.id)}
                  onToggleFavorite={(id, e) => { e.stopPropagation(); handleToggleFavorite(id); }}
                />
              </div>
            </motion.div>
          )}

          {activeTab === 'search' && (
            <motion.div
              key="search"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 15 }}
              className="max-w-7xl mx-auto w-full px-6 py-10 flex flex-col gap-8 pb-28 md:pb-12"
            >
              <div>
                <h2 className="font-outfit font-extrabold text-2xl md:text-4xl text-white tracking-tight">
                  Explorar Catálogo
                </h2>
                <p className="text-slate-400 text-sm mt-1">
                  Encontre lançamentos do cinema mundial, clássicos imortais e séries premiadas.
                </p>
              </div>

              <FilterSection
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                selectedCategory={selectedCategory}
                setSelectedCategory={setSelectedCategory}
                selectedGenre={selectedGenre}
                setSelectedGenre={setSelectedGenre}
                selectedYear={selectedYear}
                setSelectedYear={setSelectedYear}
                genresList={genresList}
                yearsList={yearsList}
                onResetFilters={handleResetFilters}
              />

              <div className="flex flex-col gap-6">
                <h3 className="font-outfit font-bold text-xl text-white tracking-wide flex items-center gap-3">
                  <span className="w-1 h-5 md:h-6 bg-gradient-to-b from-cinemaGold to-amber-600 rounded-full shadow-[0_0_8px_rgba(245,179,36,0.5)]" />
                  Resultados Encontrados ({contentList.length})
                </h3>

                {contentList.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                    {contentList.map((item) => (
                      <div key={item.id} className="flex justify-center">
                        <MovieCard
                          item={item}
                          onClick={() => setSelectedContent(item)}
                          isFavorite={favorites.some(f => f.id === item.id)}
                          onToggleFavorite={(id, e) => { e.stopPropagation(); handleToggleFavorite(id); }}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 bg-obsidian-card/40 border border-obsidian-border/50 rounded-2xl p-6 text-center">
                    <Search className="w-12 h-12 text-slate-600 mb-4" />
                    <h4 className="font-outfit font-bold text-lg text-slate-400">Nenhum resultado encontrado</h4>
                    <p className="text-slate-500 text-sm max-w-sm mt-1">
                      Tente ajustar seus termos de busca ou filtros de ano e gênero para encontrar o conteúdo.
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'favorites' && (
            <motion.div
              key="favorites"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 15 }}
              className="max-w-7xl mx-auto w-full px-6 py-10 flex flex-col gap-8 pb-28 md:pb-12"
            >
              <div>
                <h2 className="font-outfit font-extrabold text-2xl md:text-4xl text-white tracking-tight">
                  Meus Favoritos
                </h2>
                <p className="text-slate-400 text-sm mt-1">
                  Sua lista de exibição pessoal e conteúdos salvos para assistir mais tarde.
                </p>
              </div>

              {favorites.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                  {favorites.map((item) => (
                    <div key={item.id} className="flex justify-center">
                      <MovieCard
                        item={item}
                        onClick={() => setSelectedContent(item)}
                        isFavorite={true}
                        onToggleFavorite={(id, e) => { e.stopPropagation(); handleToggleFavorite(id); }}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 bg-obsidian-card/40 border border-obsidian-border/50 rounded-2xl p-6 text-center">
                  <Heart className="w-12 h-12 text-slate-600 mb-4" />
                  <h4 className="font-outfit font-bold text-lg text-slate-400">Sua lista está vazia</h4>
                  <p className="text-slate-500 text-sm max-w-xs mt-1">
                    Explore o catálogo e adicione filmes ou séries aos favoritos clicando no ícone de coração.
                  </p>
                  <button
                    onClick={() => setActiveTab('search')}
                    className="mt-6 px-6 py-3 bg-cinemaGold text-obsidian font-outfit font-bold text-xs rounded-xl shadow-premium-glow hover:scale-105 active:scale-95 transition-all duration-300"
                  >
                    Explorar Conteúdos
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'profile' && userProfile && (
            <motion.div
              key="profile"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 15 }}
            >
              <ProfileView
                profile={userProfile}
                onUpdateProfile={handleUpdateProfile}
                onLogout={handleLogout}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Floating Modal for Details */}
      <AnimatePresence>
        {selectedContent && (
          <MovieDetailModal
            item={selectedContent}
            onClose={() => setSelectedContent(null)}
            isFavorite={favorites.some(f => f.id === selectedContent.id)}
            onToggleFavorite={handleToggleFavorite}
            onPlay={(url, title, contentId, season, episode) => {
              setActivePlayer({ url, title, contentId, season, episode });
              handleSaveWatchProgress(selectedContent, season, episode);
            }}
            recommendations={getRecommendations(selectedContent)}
            onSelectRecommendation={setSelectedContent}
          />
        )}
      </AnimatePresence>

      {/* Cinematic Video Player */}
      {activePlayer && (
        <CinematicPlayer
          videoUrl={activePlayer.url}
          title={activePlayer.title}
          contentId={activePlayer.contentId}
          season={activePlayer.season}
          episode={activePlayer.episode}
          onClose={() => setActivePlayer(null)}
        />
      )}
    </div>
  );
}

export default App;
