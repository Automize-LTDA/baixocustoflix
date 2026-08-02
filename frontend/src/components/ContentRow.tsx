import React, { useRef, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MovieCard } from './MovieCard';
import type { ContentItem } from '../types';

interface ContentRowProps {
  title: string;
  items: ContentItem[];
  onCardClick: (item: ContentItem) => void;
  favorites: string[];
  onToggleFavorite: (id: string, e: React.MouseEvent) => void;
}

export const ContentRow: React.FC<ContentRowProps> = ({
  title,
  items,
  onCardClick,
  favorites,
  onToggleFavorite
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
      // Run once on load or list change
      checkScroll();
      
      // Wait for images to load
      const timeout = setTimeout(checkScroll, 500);
      
      // Resize listener
      window.addEventListener('resize', checkScroll);

      return () => {
        row.removeEventListener('scroll', checkScroll);
        window.removeEventListener('resize', checkScroll);
        clearTimeout(timeout);
      };
    }
  }, [items]);

  if (!items || items.length === 0) return null;

  return (
    <div className="relative flex flex-col gap-4 py-4 group/row">
      {/* Title */}
      <div className="flex items-center justify-between px-6 md:px-0 mb-1">
        <h3 className="font-outfit font-bold text-xl md:text-2xl text-white tracking-wide flex items-center gap-3">
          <span className="w-1.5 h-6 md:h-7 bg-gradient-to-b from-cinemaGold to-amber-600 rounded-full shadow-[0_0_8px_rgba(245,179,36,0.5)]" />
          {title}
        </h3>
      </div>

      {/* Row Scrolling Wrap */}
      <div className="relative px-6 md:px-0">
        {/* Left Scroll Button */}
        {showLeftArrow && (
          <button
            onClick={() => handleScroll('left')}
            className="absolute left-1 md:-left-5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-obsidian-card/80 border border-obsidian-border/50 text-slate-300 flex items-center justify-center backdrop-blur-md opacity-0 group-hover/row:opacity-100 transition-opacity duration-300 z-20 hover:text-cinemaGold hover:border-cinemaGold/40 hover:scale-105 active:scale-95 shadow-lg"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {/* Right Scroll Button */}
        {showRightArrow && (
          <button
            onClick={() => handleScroll('right')}
            className="absolute right-1 md:-right-5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-obsidian-card/80 border border-obsidian-border/50 text-slate-300 flex items-center justify-center backdrop-blur-md opacity-0 group-hover/row:opacity-100 transition-opacity duration-300 z-20 hover:text-cinemaGold hover:border-cinemaGold/40 hover:scale-105 active:scale-95 shadow-lg"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}

        {/* Content Slider List */}
        <div
          ref={rowRef}
          onScroll={checkScroll}
          className="flex gap-4 overflow-x-auto pb-4 pt-1 hide-scrollbar scroll-smooth"
        >
          {items.map((item) => (
            <MovieCard
              key={item.id}
              item={item}
              onClick={() => onCardClick(item)}
              isFavorite={favorites.includes(item.id)}
              onToggleFavorite={onToggleFavorite}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
