import React, { useState, useEffect } from 'react';
import { X, Play, Heart, Star, Calendar, Clock, Film } from 'lucide-react';
import type { ContentItem } from '../types';
import { motion } from 'framer-motion';

interface MovieDetailModalProps {
  item: ContentItem;
  onClose: () => void;
  isFavorite: boolean;
  onToggleFavorite: (id: string) => void;
  onPlay: (url: string, title: string, contentId?: string, season?: number, episode?: number) => void;
  recommendations: ContentItem[];
  onSelectRecommendation: (item: ContentItem) => void;
}

export const MovieDetailModal: React.FC<MovieDetailModalProps> = ({
  item,
  onClose,
  isFavorite,
  onToggleFavorite,
  onPlay,
  recommendations,
  onSelectRecommendation
}) => {
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [seasonsList, setSeasonsList] = useState<number[]>([]);

  // Calculate seasons numbers if series
  useEffect(() => {
    if (item.category === 'series' && item.episodes) {
      const seasons = Array.from(
        new Set(item.episodes.map(ep => ep.season))
      ).sort((a, b) => a - b);
      setSeasonsList(seasons);
      if (seasons.length > 0) {
        setSelectedSeason(seasons[0]);
      }
    }
  }, [item]);

  // Filter episodes for chosen season
  const filteredEpisodes = item.episodes
    ? item.episodes.filter(ep => ep.season === selectedSeason)
    : [];

  return (
    <div className="fixed inset-0 w-full h-full bg-black/85 backdrop-blur-xl z-40 overflow-y-auto px-4 py-8 md:p-10 flex justify-center items-start">
      {/* Background click to close */}
      <div className="fixed inset-0 bg-transparent" onClick={onClose} />

      {/* Modal Main Panel */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 30 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="relative w-full max-w-4xl bg-obsidian-card border border-obsidian-border/50 rounded-3xl overflow-hidden shadow-modal z-10 flex flex-col"
      >
        {/* Banner Section */}
        <div className="relative w-full h-[220px] sm:h-[350px] bg-cinemaCharcoal-dark">
          <img
            src={item.banner}
            alt={item.title}
            className="w-full h-full object-cover object-top opacity-60"
          />

          {/* Gradients */}
          <div className="absolute inset-0 bg-gradient-to-t from-obsidian-card via-obsidian-card/40 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-obsidian-card/75 via-transparent to-transparent" />

          {/* Top Actions: Close and Favorite */}
          <div className="absolute top-4 right-4 flex items-center gap-3">
            <button
              onClick={() => onToggleFavorite(item.id)}
              className={`p-3 rounded-full border backdrop-blur-md transition-all duration-300 hover:scale-105 active:scale-95 ${
                isFavorite
                  ? 'bg-red-500/20 border-red-500 text-red-500'
                  : 'bg-black/40 border-obsidian-border/80 text-slate-300 hover:border-slate-100 hover:text-white'
              }`}
            >
              <Heart className={`w-4 h-4 ${isFavorite ? 'fill-red-500' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-3 rounded-full bg-black/40 hover:bg-red-600 border border-obsidian-border/80 text-slate-200 hover:text-white transition-all duration-300 hover:scale-105 active:scale-95"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Play Floating Button */}
          <div className="absolute bottom-6 left-6 z-10">
            <button
              onClick={() => onPlay(item.trailerUrl, item.title, item.id)}
              className="flex items-center gap-2.5 bg-cinemaGold hover:bg-cinemaGold-light text-obsidian font-outfit font-bold text-xs sm:text-sm px-6 py-3 rounded-xl shadow-premium-glow hover:scale-105 active:scale-95 transition-all duration-300 cursor-pointer"
            >
              <Play className="w-4.5 h-4.5 fill-obsidian" />
              <span>Começar a Assistir</span>
            </button>
          </div>
        </div>

        {/* Detailed Info Container */}
        <div className="p-6 md:p-8 flex flex-col gap-8">
          
          {/* Header text and badges */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="bg-cinemaGold/15 border border-cinemaGold/30 text-cinemaGold font-bold px-2.5 py-0.5 rounded uppercase tracking-wider">
                {item.category === 'movie' ? 'Filme' : 'Série'}
              </span>
              
              <div className="flex items-center gap-1 text-cinemaGold font-bold">
                <Star className="w-3.5 h-3.5 fill-cinemaGold" />
                <span>{item.rating.toFixed(1)}</span>
              </div>

              <div className="flex items-center gap-1 text-slate-400">
                <Calendar className="w-3.5 h-3.5" />
                <span>{item.year}</span>
              </div>

              <div className="flex items-center gap-1 text-slate-400">
                <Clock className="w-3.5 h-3.5" />
                <span>{item.duration || item.seasons}</span>
              </div>
            </div>

            <h2 className="font-outfit font-black text-2xl md:text-4xl text-white tracking-tight leading-tight">
              {item.title}
            </h2>

            <div className="flex flex-wrap gap-1.5">
              {item.genres.map(g => (
                <span key={g} className="bg-cinemaCharcoal text-slate-300 text-[10px] font-semibold px-2.5 py-0.5 rounded border border-obsidian-border/50">
                  {g}
                </span>
              ))}
            </div>
          </div>

          {/* Synopsis */}
          <div className="flex flex-col gap-2">
            <h4 className="font-outfit font-bold text-slate-300 text-sm uppercase tracking-wider">Sinopse</h4>
            <p className="text-slate-400 text-sm md:text-base leading-relaxed">
              {item.synopsis}
            </p>
          </div>

          {/* Cast Members */}
          <div className="flex flex-col gap-3.5">
            <h4 className="font-outfit font-bold text-slate-300 text-sm uppercase tracking-wider">Elenco Principal</h4>
            <div className="flex gap-4 overflow-x-auto pb-2 hide-scrollbar">
              {item.cast.map((actor, idx) => (
                <div key={idx} className="flex items-center gap-3 bg-cinemaCharcoal/30 border border-obsidian-border/40 p-2.5 rounded-xl flex-shrink-0 min-w-[180px]">
                  <img
                    src={actor.image}
                    alt={actor.name}
                    className="w-10 h-10 rounded-full object-cover border border-obsidian-border"
                  />
                  <div className="flex flex-col leading-tight min-w-0">
                    <span className="text-xs font-bold text-slate-200 truncate">{actor.name}</span>
                    <span className="text-[10px] text-slate-500 truncate mt-0.5">{actor.character}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* TV Series Episode Manager */}
          {item.category === 'series' && item.episodes && (
            <div className="flex flex-col gap-4 border-t border-obsidian-border/30 pt-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <h4 className="font-outfit font-bold text-slate-300 text-sm uppercase tracking-wider flex items-center gap-2">
                  <Film className="w-4 h-4 text-cinemaGold" />
                  <span>Temporadas e Episódios</span>
                </h4>
                
                {/* Season Dropdown */}
                {seasonsList.length > 0 && (
                  <select
                    value={selectedSeason}
                    onChange={(e) => setSelectedSeason(parseInt(e.target.value, 10))}
                    className="bg-obsidian border border-obsidian-border/80 px-3 py-1.5 rounded-lg text-xs font-outfit text-slate-300 focus:outline-none cursor-pointer"
                  >
                    {seasonsList.map(s => (
                      <option key={s} value={s}>
                        Temporada {s}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Episodes List Grid */}
              <div className="flex flex-col gap-3">
                {filteredEpisodes.map((ep, idx) => (
                  <div
                    key={idx}
                    className="flex flex-col sm:flex-row gap-4 p-3 rounded-2xl bg-cinemaCharcoal/20 border border-obsidian-border/30 hover:border-cinemaGold/20 hover:bg-cinemaCharcoal/40 transition-all duration-300"
                  >
                    {/* Thumbnail */}
                    <div className="relative aspect-[16/9] w-full sm:w-[150px] rounded-lg overflow-hidden bg-cinemaCharcoal-dark flex-shrink-0">
                      <img
                        src={ep.thumbnail}
                        alt={ep.title}
                        className="w-full h-full object-cover"
                      />
                      <button
                        onClick={() => onPlay(ep.videoUrl || item.trailerUrl, `${item.title} - S${ep.season}E${ep.episode}: ${ep.title}`, item.id, ep.season, ep.episode)}
                        className="absolute inset-0 bg-black/40 hover:bg-black/60 flex items-center justify-center transition-colors"
                      >
                        <Play className="w-6 h-6 text-cinemaGold fill-cinemaGold" />
                      </button>
                    </div>

                    {/* Metadata details */}
                    <div className="flex flex-col justify-center min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-cinemaGold font-bold uppercase">
                          Episódio {ep.episode}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {ep.duration}
                        </span>
                      </div>
                      <h5 className="font-outfit font-bold text-slate-200 text-sm mt-0.5 truncate">
                        {ep.title}
                      </h5>
                      <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                        {ep.synopsis}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Similar Content Recommendations */}
          {recommendations.length > 0 && (
            <div className="flex flex-col gap-4 border-t border-obsidian-border/30 pt-6">
              <h4 className="font-outfit font-bold text-slate-300 text-sm uppercase tracking-wider">
                Recomendações
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {recommendations.slice(0, 4).map((rec) => (
                  <div
                    key={rec.id}
                    onClick={() => onSelectRecommendation(rec)}
                    className="flex flex-col gap-2 bg-cinemaCharcoal/25 border border-obsidian-border/40 p-2 rounded-xl cursor-pointer hover:border-cinemaGold/30 transition-all duration-300 group"
                  >
                    <div className="aspect-[2/3] w-full rounded-lg overflow-hidden bg-cinemaCharcoal-dark">
                      <img
                        src={rec.poster}
                        alt={rec.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    </div>
                    <div className="flex flex-col px-1">
                      <span className="text-slate-200 text-xs font-bold font-outfit truncate group-hover:text-cinemaGold transition-colors leading-tight">
                        {rec.title}
                      </span>
                      <span className="text-[10px] text-slate-500 font-semibold">{rec.year}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </motion.div>
    </div>
  );
};
