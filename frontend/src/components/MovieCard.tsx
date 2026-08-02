import React from 'react';
import { Star, Heart } from 'lucide-react';
import type { ContentItem } from '../types';
import { motion } from 'framer-motion';

interface MovieCardProps {
  item: ContentItem;
  onClick: () => void;
  isFavorite: boolean;
  onToggleFavorite: (id: string, e: React.MouseEvent) => void;
}

export const MovieCard: React.FC<MovieCardProps> = ({
  item,
  onClick,
  isFavorite,
  onToggleFavorite
}) => {
  return (
    <motion.div
      whileHover={{ y: -8 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      onClick={onClick}
      className="relative flex-shrink-0 w-[150px] sm:w-[200px] bg-obsidian-card border border-obsidian-border/40 rounded-2xl overflow-hidden cursor-pointer group shadow-card-glow hover:border-cinemaGold/30 transition-all duration-300"
    >
      {/* Poster Wrapper */}
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-cinemaCharcoal-dark">
        <img
          src={item.poster}
          alt={item.title}
          onError={(e) => {
            (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=600&auto=format&fit=crop';
          }}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
          loading="lazy"
        />

        {/* Backdrop Dark Vignette Gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-obsidian via-transparent to-transparent opacity-60 group-hover:opacity-80 transition-opacity duration-300" />

        {/* Hover Quick Actions Overlay */}
        <div className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10">
          <button
            onClick={(e) => onToggleFavorite(item.id, e)}
            className={`p-2 rounded-full border backdrop-blur-md transition-all duration-300 hover:scale-110 active:scale-95 ${
              isFavorite
                ? 'bg-red-500/20 border-red-500 text-red-500'
                : 'bg-obsidian-card/70 border-obsidian-border/50 text-slate-300 hover:border-white hover:text-white'
            }`}
          >
            <Heart className={`w-3.5 h-3.5 ${isFavorite ? 'fill-red-500' : ''}`} />
          </button>
        </div>

        {/* Top-Left Category Badge */}
        <div className="absolute top-2.5 left-2.5 z-10">
          <span className="bg-obsidian/75 border border-obsidian-border/40 backdrop-blur-md text-slate-300 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider font-outfit">
            {item.category === 'movie' ? 'Filme' : 'Série'}
          </span>
        </div>

        {/* Bottom Rating Badge */}
        <div className="absolute bottom-2.5 left-2.5 z-10 flex items-center gap-1 bg-obsidian-card/85 border border-obsidian-border/40 backdrop-blur-md text-cinemaGold font-bold text-xs px-2 py-0.5 rounded-lg shadow-sm">
          <Star className="w-3 h-3 fill-cinemaGold" />
          <span>{item.rating.toFixed(1)}</span>
        </div>
      </div>

      {/* Info Details Section */}
      <div className="p-3.5 flex flex-col gap-1 select-none">
        {/* Release Year */}
        <span className="text-[11px] text-slate-500 font-semibold tracking-wide">
          {item.year}
        </span>

        {/* Title */}
        <h3 className="text-slate-200 text-sm font-bold font-outfit truncate group-hover:text-cinemaGold transition-colors duration-300 leading-tight">
          {item.title}
        </h3>

        {/* Genres Summary */}
        <span className="text-[10px] text-slate-400 truncate opacity-80">
          {item.genres.slice(0, 2).join(' • ')}
        </span>
      </div>
    </motion.div>
  );
};
