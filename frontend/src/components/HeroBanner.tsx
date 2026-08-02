import React from 'react';
import { Play, Heart, Star, Calendar, Clock } from 'lucide-react';
import type { ContentItem } from '../types';
import { motion } from 'framer-motion';

interface HeroBannerProps {
  content: ContentItem;
  onOpenDetail: (item: ContentItem) => void;
  isFavorite: boolean;
  onToggleFavorite: (id: string) => void;
}

export const HeroBanner: React.FC<HeroBannerProps> = ({
  content,
  onOpenDetail,
  isFavorite,
  onToggleFavorite
}) => {
  if (!content) return null;

  return (
    <div className="relative w-full h-[70vh] md:h-[80vh] overflow-hidden bg-obsidian border-b border-obsidian-border/30">
      {/* Background Image with Zoom Animation */}
      <motion.div 
        initial={{ scale: 1.1, opacity: 0 }}
        animate={{ scale: 1, opacity: 0.65 }}
        transition={{ duration: 1.5, ease: "easeOut" }}
        className="absolute inset-0 w-full h-full"
      >
        <img
          src={content.banner}
          alt={content.title}
          onError={(e) => {
            (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=1600&auto=format&fit=crop';
          }}
          className="w-full h-full object-cover object-top"
        />
      </motion.div>

      {/* Modern Gradient Overlays */}
      <div className="absolute inset-0 bg-banner-overlay" />
      <div className="absolute inset-0 bg-hero-gradient" />

      {/* Hero Content Area */}
      <div className="absolute inset-x-0 bottom-0 max-w-7xl mx-auto px-6 pb-12 md:pb-20 flex flex-col items-start gap-4 md:gap-6 z-10">
        
        {/* Category & Badge */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="flex items-center gap-3"
        >
          <span className="bg-cinemaGold/15 border border-cinemaGold/30 text-cinemaGold font-outfit text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
            Destaque do Dia
          </span>
          <span className="text-slate-400 text-xs font-medium uppercase tracking-widest">
            {content.category === 'movie' ? 'Filme' : 'Série'}
          </span>
        </motion.div>

        {/* Title */}
        <motion.h2 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="font-outfit font-extrabold text-3xl md:text-6xl text-white tracking-tight max-w-2xl leading-none"
        >
          {content.title}
        </motion.h2>

        {/* Metadata Details */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="flex flex-wrap items-center gap-y-2 gap-x-6 text-sm text-slate-300"
        >
          {/* Rating */}
          <div className="flex items-center gap-1.5 text-cinemaGold font-semibold text-glow">
            <Star className="w-4 h-4 fill-cinemaGold" />
            <span>{content.rating.toFixed(1)}</span>
          </div>

          {/* Year */}
          <div className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span>{content.year}</span>
          </div>

          {/* Duration or Seasons */}
          <div className="flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-slate-400" />
            <span>{content.duration || content.seasons}</span>
          </div>

          {/* Genres */}
          <div className="flex items-center gap-2">
            {content.genres.map((genre) => (
              <span 
                key={genre} 
                className="bg-cinemaCharcoal text-slate-300 text-xs px-2.5 py-0.5 rounded border border-obsidian-border/50"
              >
                {genre}
              </span>
            ))}
          </div>
        </motion.div>

        {/* Overview Synopsis */}
        <motion.p 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="text-slate-400 text-sm md:text-base max-w-xl leading-relaxed line-clamp-3 md:line-clamp-4"
        >
          {content.synopsis}
        </motion.p>

        {/* CTA Buttons */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="flex items-center gap-4 mt-2 w-full sm:w-auto"
        >
          {/* Assistir button */}
          <button
            onClick={() => onOpenDetail(content)}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2.5 bg-cinemaGold hover:bg-cinemaGold-light text-obsidian font-outfit font-bold text-sm md:text-base px-8 py-3.5 rounded-xl shadow-premium-glow hover:scale-105 active:scale-95 transition-all duration-300"
          >
            <Play className="w-5 h-5 fill-obsidian" />
            <span>Assistir Agora</span>
          </button>

          {/* Favorite button */}
          <button
            onClick={() => onToggleFavorite(content.id)}
            className={`p-3.5 rounded-xl border transition-all duration-300 hover:scale-105 active:scale-95 flex items-center justify-center ${
              isFavorite
                ? 'bg-red-500/10 border-red-500 text-red-500 hover:bg-red-500/20'
                : 'bg-obsidian-card/65 border-obsidian-border/80 text-slate-300 hover:border-slate-100 hover:text-white'
            }`}
            title={isFavorite ? "Remover dos Favoritos" : "Adicionar aos Favoritos"}
          >
            <Heart className={`w-5 h-5 ${isFavorite ? 'fill-red-500' : ''}`} />
          </button>
        </motion.div>

      </div>
    </div>
  );
};
