export interface CastMember {
  name: string;
  character: string;
  image: string;
}

export interface Episode {
  title: string;
  season: number;
  episode: number;
  duration: string;
  synopsis: string;
  thumbnail: string;
  videoUrl?: string;
}

export interface ContentItem {
  id: string;
  title: string;
  category: 'movie' | 'series';
  year: number;
  rating: number;
  duration?: string;
  seasons?: string;
  genres: string[];
  isRelease?: boolean;
  isPopular?: boolean;
  isClassic?: boolean;
  poster: string;
  banner: string;
  synopsis: string;
  trailerUrl: string;
  cast: CastMember[];
  episodes?: Episode[];
}

export interface RecentEpisode {
  id: string;
  seriesId: string;
  seriesTitle: string;
  title: string;
  season: number;
  episode: number;
  duration: string;
  thumbnail: string;
  addedTime: string;
}

export interface UserProfile {
  name: string;
  username: string;
  avatar: string;
  streamingQuality: string;
  autoPlayTrailers: boolean;
  preferredLanguage: string;
}
