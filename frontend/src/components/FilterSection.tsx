import React from 'react';
import { Search, Calendar, Film, RefreshCw } from 'lucide-react';

interface FilterSectionProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  selectedCategory: string;
  setSelectedCategory: (category: string) => void;
  selectedGenre: string;
  setSelectedGenre: (genre: string) => void;
  selectedYear: string;
  setSelectedYear: (year: string) => void;
  genresList: string[];
  yearsList: string[];
  onResetFilters: () => void;
}

export const FilterSection: React.FC<FilterSectionProps> = ({
  searchQuery,
  setSearchQuery,
  selectedCategory,
  setSelectedCategory,
  selectedGenre,
  setSelectedGenre,
  selectedYear,
  setSelectedYear,
  genresList,
  yearsList,
  onResetFilters
}) => {
  const categories = [
    { id: 'all', label: 'Tudo' },
    { id: 'movie', label: 'Filmes' },
    { id: 'series', label: 'Séries' },
    { id: 'release', label: 'Lançamentos' },
    { id: 'classic', label: 'Clássicos' }
  ];

  return (
    <div className="w-full flex flex-col gap-6 p-6 rounded-2xl glass-panel border border-obsidian-border/50 shadow-card-glow">
      
      {/* Search Input and Reset Row */}
      <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar títulos, gêneros, elenco ou sinopse..."
            className="w-full pl-12 pr-4 py-3.5 bg-cinemaCharcoal/60 hover:bg-cinemaCharcoal/80 focus:bg-cinemaCharcoal border border-obsidian-border/80 focus:border-cinemaGold/50 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none transition-all duration-300 font-sans"
          />
        </div>

        {/* Reset Filter Button */}
        <button
          onClick={onResetFilters}
          className="flex items-center justify-center gap-2 px-5 py-3.5 bg-obsidian-card hover:bg-cinemaCharcoal border border-obsidian-border/80 rounded-xl text-sm font-outfit font-medium text-slate-400 hover:text-cinemaGold hover:border-cinemaGold/30 transition-all duration-300 active:scale-95"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Limpar Filtros</span>
        </button>
      </div>

      {/* Grid of Filtering Controls */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
        
        {/* Category Selector (Pills) */}
        <div className="md:col-span-6 flex flex-wrap gap-2">
          {categories.map((cat) => {
            const isActive = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-4.5 py-2.5 rounded-xl font-outfit text-xs font-semibold tracking-wide border transition-all duration-300 active:scale-95 ${
                  isActive
                    ? 'bg-cinemaGold border-cinemaGold text-obsidian shadow-premium-glow'
                    : 'bg-obsidian-card/40 hover:bg-cinemaCharcoal/55 border-obsidian-border/70 text-slate-400 hover:text-slate-200'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* Genre Selector */}
        <div className="md:col-span-3 relative">
          <Film className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <select
            value={selectedGenre}
            onChange={(e) => setSelectedGenre(e.target.value)}
            className="w-full pl-10 pr-8 py-2.5 bg-obsidian-card border border-obsidian-border/80 focus:border-cinemaGold/40 rounded-xl text-xs text-slate-300 font-outfit font-medium appearance-none focus:outline-none cursor-pointer transition-colors"
          >
            <option value="">Todos os Gêneros</option>
            {genresList.map((genre) => (
              <option key={genre} value={genre}>
                {genre}
              </option>
            ))}
          </select>
          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
            ▼
          </div>
        </div>

        {/* Year Selector */}
        <div className="md:col-span-3 relative">
          <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="w-full pl-10 pr-8 py-2.5 bg-obsidian-card border border-obsidian-border/80 focus:border-cinemaGold/40 rounded-xl text-xs text-slate-300 font-outfit font-medium appearance-none focus:outline-none cursor-pointer transition-colors"
          >
            <option value="">Qualquer Ano</option>
            {yearsList.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
            ▼
          </div>
        </div>

      </div>
    </div>
  );
};
