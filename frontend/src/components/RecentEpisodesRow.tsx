import React, { useRef, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Play, Clock } from 'lucide-react';
import type { RecentEpisode } from '../types';
import { motion } from 'framer-motion';

interface RecentEpisodesRowProps {
  episodes: RecentEpisode[];
  onEpisodeClick: (seriesId: string) => void;
}

export const RecentEpisodesRow: React.FC<RecentEpisodesRowProps> = ({
  episodes,
  onEpisodeClick
}) => {
  const rowRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);

  const checkScroll = () => {
    if (rowRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = rowRef.current;
      setShowLeftArrow(scrollLeft > 10);
      setShowRightArrow(scrollLeft + clientWidth < scrollWidth - 10);
    }
  };

  const handleScroll = (direction: 'left' | 'right') => {
    if (rowRef.current) {
      const { clientWidth } = rowRef.current;
      const scrollAmount = direction === 'left' ? -clientWidth * 0.75 : clientWidth * 0.75;
      rowRef.current.scrollBy({
        left: scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  useEffect(() => {
    const row = rowRef.current;
    if (row) {
      row.addEventListener('scroll', checkScroll);
      checkScroll();
      window.addEventListener('resize', checkScroll);
      return () => {
        row.removeEventListener('scroll', checkScroll);
        window.removeEventListener('resize', checkScroll);
      };
    }
  }, [episodes]);

  if (!episodes || episodes.length === 0) return null;

  return (
    <div className="relative flex flex-col gap-4 py-4 group/episodes">
      {/* Title */}
      <div className="flex items-center justify-between px-6 md:px-0 mb-1">
        <h3 className="font-outfit font-bold text-xl md:text-2xl text-white tracking-wide flex items-center gap-3">
          <span className="w-1.5 h-6 md:h-7 bg-gradient-to-b from-cinemaGold to-amber-600 rounded-full shadow-[0_0_8px_rgba(245,179,36,0.5)]" />
          Episódios Recentes
        </h3>
      </div>

      {/* Row Scrolling Wrap */}
      <div className="relative px-6 md:px-0">
        {/* Left Scroll Button */}
        {showLeftArrow && (
          <button
            onClick={() => handleScroll('left')}
            className="absolute left-1 md:-left-5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-obsidian-card/80 border border-obsidian-border/50 text-slate-300 flex items-center justify-center backdrop-blur-md opacity-0 group-hover/episodes:opacity-100 transition-opacity duration-300 z-20 hover:text-cinemaGold hover:border-cinemaGold/40 hover:scale-105 active:scale-95 shadow-lg"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {/* Right Scroll Button */}
        {showRightArrow && (
          <button
            onClick={() => handleScroll('right')}
            className="absolute right-1 md:-right-5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-obsidian-card/80 border border-obsidian-border/50 text-slate-300 flex items-center justify-center backdrop-blur-md opacity-0 group-hover/episodes:opacity-100 transition-opacity duration-300 z-20 hover:text-cinemaGold hover:border-cinemaGold/40 hover:scale-105 active:scale-95 shadow-lg"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}

        {/* Scroll Container */}
        <div
          ref={rowRef}
          onScroll={checkScroll}
          className="flex gap-5 overflow-x-auto pb-4 pt-1 hide-scrollbar scroll-smooth"
        >
          {episodes.map((ep) => (
            <motion.div
              key={ep.id}
              whileHover={{ y: -6 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              onClick={() => onEpisodeClick(ep.seriesId)}
              className="relative flex-shrink-0 w-[240px] sm:w-[280px] bg-obsidian-card border border-obsidian-border/40 rounded-2xl overflow-hidden cursor-pointer group shadow-card-glow hover:border-cinemaGold/30 transition-all duration-300"
            >
              {/* Thumbnail Container */}
              <div className="relative aspect-[16/9] w-full overflow-hidden bg-cinemaCharcoal-dark">
                <img
                  src={ep.thumbnail}
                  alt={ep.title}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  loading="lazy"
                />

                {/* Play Icon Overlay on Hover */}
                <div className="absolute inset-0 bg-obsidian/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all duration-300 z-10">
                  <div className="w-10 h-10 rounded-full bg-cinemaGold text-obsidian flex items-center justify-center scale-75 group-hover:scale-100 transition-transform duration-300 shadow-premium-glow">
                    <Play className="w-5 h-5 fill-obsidian ml-0.5" />
                  </div>
                </div>

                {/* Bottom left duration badge */}
                <div className="absolute bottom-2 left-2 z-10 flex items-center gap-1 bg-obsidian/75 backdrop-blur-md text-[10px] text-slate-300 px-2 py-0.5 rounded border border-obsidian-border/30">
                  <Clock className="w-3 h-3 text-slate-400" />
                  <span>{ep.duration}</span>
                </div>

                {/* Added time badge */}
                <div className="absolute top-2 right-2 z-10 bg-cinemaGold text-obsidian text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded">
                  {ep.addedTime}
                </div>
              </div>

              {/* Episode Info */}
              <div className="p-3.5 flex flex-col gap-1.5 select-none">
                <span className="text-[10px] text-cinemaGold font-bold uppercase tracking-wider">
                  {ep.seriesTitle}
                </span>

                <div className="flex flex-col leading-tight">
                  <h4 className="text-slate-200 text-sm font-bold font-outfit truncate group-hover:text-cinemaGold transition-colors duration-300">
                    {ep.title}
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Temp. {ep.season} • Ep. {ep.episode}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};
