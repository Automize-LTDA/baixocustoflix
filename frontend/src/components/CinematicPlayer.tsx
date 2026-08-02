import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, Settings, X, Subtitles, MonitorUp } from 'lucide-react';

interface SubtitleTrack {
  time: number;
  text: string;
}

interface CinematicPlayerProps {
  videoUrl: string;
  title: string;
  contentId?: string;
  season?: number;
  episode?: number;
  onClose: () => void;
}

const TMDB_MAP: Record<string, number> = {
  "deadpool-wolverine": 533535,
  "inside-out-2": 1022789,
  "dune-2": 693134,
  "gladiator-2": 558449,
  "venom-3": 912649,
  "joker-2": 889737,
  "oppenheimer": 872585,
  "obsessao": 1118585,
  "mandalorian-grogu": 1222248,
  "project-hail-mary": 785752,
  "toy-story-5": 1084736,
  "scream-7": 1086591,
  "interstellar": 157336,
  "barbie": 346698,
  "avatar-2": 76600,
  "spider-man-verse": 569094,
  "super-mario": 502356,
  "the-batman": 414906,
  "moana-2": 1241982,
  "sonic-3": 939243,
  "despicable-me-4": 519182,
  "kung-fu-panda-4": 1011985,
  "wicked-1": 402431,
  "mufasa-lion-king": 1022796,
  "furiosa-mad-max": 786892,
  "quiet-place-day-1": 762441,
  "planet-of-apes-4": 653346,
  "godzilla-kong-2": 823464,
  "civil-war": 927339,
  "twisters": 718821,
  "bad-boys-4": 573435,
  "fall-guy": 746034,
  "challengers": 937287,
  "alien-romulus": 945961,
  "beetlejuice-2": 917496,
  "smile-2": 1100782,
  "terrifier-3": 1034541,
  "red-one": 826510,
  "wild-robot": 1184918,
  "flow": 1111111,
  "elio": 948521,
  "minecraft-movie": 556574,
  "superman-2025": 1122248,
  "fantastic-four-2025": 1156461,
  "jurassic-world-4": 1256461,
  "captain-america-4": 934051,
  "thunderbolts": 934052,
  "avatar-3": 834431,
  "ballerina-2025": 1045952,
  "f1-2025": 1056461,
  "tron-ares": 1065741,
  "conjuring-4": 1084952,
  "black-phone-2": 1111112,
  "fnaf-2": 1111113,
  "megan-2": 1111114,
  "michael-jackson": 1111115,
  "avengers-5": 1111116,
  "batman-2": 1111117,
  "supergirl-2026": 1111118,
  "shrek-5": 1111119,
  "frozen-3": 1111120,
  "dune-3": 1111121,
  "now-you-see-me-3": 1111122,
  "constantine-2": 1111123,
  "i-am-legend-2": 1111124,
  "house-of-the-dragon": 94997,
  "stranger-things": 66732,
  "the-penguin": 141052,
  "severance": 95396,
  "rick-e-morty": 60625,
  "origem": 123168,
  "wednesday": 119051,
  "the-last-of-us": 115646,
  "the-boys": 76479,
  "round-6": 93405,
  "fallout-series": 126308,
  "shogun-2024": 118612,
  "the-bear": 139158,
  "reacher-series": 119053,
  "gen-v": 205741,
  "acolyte": 126309,
  "xmen-97": 126310,
  "knuckles-series": 126311,
  "daredevil-born-again": 126312,
  "peacemaker-s2": 126313,
  "percy-jackson": 126314,
  "avatar-netflix": 126315,
  "one-piece-live": 126316,
  "invincible-series": 126317,
  "white-lotus": 126318
};

export const CinematicPlayer: React.FC<CinematicPlayerProps> = ({
  videoUrl,
  title,
  contentId,
  season,
  episode,
  onClose
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [selectedServer, setSelectedServer] = useState<string>(() => {
    return contentId ? "warezcdn" : "redecanais";
  });

  const getResolvedUrl = () => {
    const tmdbId = contentId ? TMDB_MAP[contentId] : null;

    if (selectedServer === "warezcdn" && tmdbId) {
      if (season !== undefined && episode !== undefined) {
        return `https://warezcdn.lat/serie/${tmdbId}/${season}/${episode}`;
      } else {
        return `https://warezcdn.lat/filme/${tmdbId}`;
      }
    }

    if (selectedServer === "superembed" && tmdbId) {
      if (season !== undefined && episode !== undefined) {
        return `https://multiembed.eu/?video_id=${tmdbId}&tmdb=1&s=${season}&e=${episode}`;
      } else {
        return `https://multiembed.eu/?video_id=${tmdbId}&tmdb=1`;
      }
    }

    return videoUrl;
  };

  const resolvedVideoUrl = getResolvedUrl();
  const isEmbed = resolvedVideoUrl.includes('embed') || resolvedVideoUrl.includes('vidsrc') || resolvedVideoUrl.includes('superembed') || resolvedVideoUrl.includes('warezcdn') || resolvedVideoUrl.includes('pobreflixtv') || resolvedVideoUrl.includes('player') || resolvedVideoUrl.includes('php') || resolvedVideoUrl.includes('redecanais');

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(true);
  const [activeSubtitle, setActiveSubtitle] = useState("");
  const [showControls, setShowControls] = useState(true);
  const [isTheaterMode, setIsTheaterMode] = useState(false);

  // Subtitles mock content synchronizing with video time
  const subtitleTracks: SubtitleTrack[] = [
    { time: 1, text: "[Som de vento e suspense crescente]" },
    { time: 3, text: "Em um universo dividido pelo poder..." },
    { time: 7, text: "Aqueles que controlam a especiaria, governam as estrelas." },
    { time: 12, text: "Chani: \"Você está pronto para o que está por vir, Paul?\"" },
    { time: 17, text: "Paul Atreides: \"Eu não vim para liderar. Vim para lutar ao seu lado.\"" },
    { time: 22, text: "[Explosões e trombetas de guerra ecoam]" },
    { time: 26, text: "A profecia se erguerá na areia..." },
    { time: 31, text: "BAIXO CUSTO - Assista com alta qualidade." }
  ];

  // Auto-hide controls after inactivity
  useEffect(() => {
    let timeout: number;
    const resetTimer = () => {
      setShowControls(true);
      clearTimeout(timeout);
      if (isPlaying) {
        timeout = window.setTimeout(() => setShowControls(false), 3000);
      }
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('mousemove', resetTimer);
      container.addEventListener('touchstart', resetTimer);
    }

    return () => {
      if (container) {
        container.removeEventListener('mousemove', resetTimer);
        container.removeEventListener('touchstart', resetTimer);
      }
      clearTimeout(timeout);
    };
  }, [isPlaying]);

  // Handle Play/Pause
  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  // Sync Video Progress
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const curTime = videoRef.current.currentTime;
      setCurrentTime(curTime);

      // Find subtitle corresponding to current time
      if (subtitlesEnabled) {
        const matchingSub = [...subtitleTracks]
          .reverse()
          .find(sub => curTime >= sub.time);
        
        if (matchingSub) {
          // Clear subtitle after 4 seconds
          if (curTime - matchingSub.time < 4.5) {
            setActiveSubtitle(matchingSub.text);
          } else {
            setActiveSubtitle("");
          }
        } else {
          setActiveSubtitle("");
        }
      } else {
        setActiveSubtitle("");
      }
    }
  };

  // Sync Metadata Loaded
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  // Timeline slider seek
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = val;
      setCurrentTime(val);
    }
  };

  // Volume Change
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    setIsMuted(val === 0);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
    }
  };

  // Toggle Mute
  const toggleMute = () => {
    const newMuteState = !isMuted;
    setIsMuted(newMuteState);
    if (videoRef.current) {
      videoRef.current.muted = newMuteState;
      if (!newMuteState && volume === 0) {
        setVolume(0.5);
        videoRef.current.volume = 0.5;
      }
    }
  };

  // Toggle Speed
  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
    setShowSpeedMenu(false);
  };

  // Toggle Fullscreen API
  const toggleFullscreen = () => {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => {
        setIsFullscreen(true);
      }).catch(err => {
        console.error("Fullscreen error: ", err);
      });
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false);
      });
    }
  };

  // Sync exit fullscreen (e.g. ESC key)
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Format seconds to mm:ss
  const formatTime = (secs: number) => {
    if (isNaN(secs)) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 w-full h-full bg-black/95 backdrop-blur-md z-50 flex items-center justify-center p-0 md:p-8">
      
      {/* Player Container Box */}
      <div
        ref={containerRef}
        className={`relative bg-black rounded-none md:rounded-2xl overflow-hidden shadow-modal border border-obsidian-border/30 transition-all duration-500 ${
          isTheaterMode ? 'w-full h-full max-w-none md:p-0' : 'w-full max-w-5xl aspect-video'
        }`}
      >
        {/* HTML5 Video Tag or Iframe Embed */}
        {isEmbed ? (
          <iframe
            src={resolvedVideoUrl}
            className="w-full h-full border-none"
            allowFullScreen
            allow="autoplay; encrypted-media; picture-in-picture"
          />
        ) : (
          <video
            ref={videoRef}
            src={resolvedVideoUrl}
            onClick={togglePlay}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            className="w-full h-full object-contain cursor-pointer"
            playsInline
            autoPlay
          />
        )}

        {/* Video Overlay Subtitle Display */}
        {!isEmbed && subtitlesEnabled && activeSubtitle && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-black/75 px-5 py-2.5 rounded-lg border border-obsidian-border/50 text-slate-100 text-sm md:text-lg font-medium text-center shadow-lg font-outfit max-w-[85%] select-none z-10 pointer-events-none transition-all duration-300">
            {activeSubtitle}
          </div>
        )}

        {/* Top Floating Controls Header */}
        <div className={`absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 to-transparent flex items-center justify-between z-20 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}>
          <div className="flex flex-col gap-1.5">
            <div>
              <h4 className="font-outfit font-bold text-white text-base md:text-lg tracking-wide drop-shadow">
                {title}
              </h4>
              <p className="text-[10px] text-slate-400 font-semibold tracking-widest uppercase">
                {isEmbed ? 'Streaming Online' : 'Trailer Oficial'}
              </p>
            </div>
            {isEmbed && contentId && (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[11px] font-semibold text-slate-400 font-outfit">Servidor:</span>
                <select
                  value={selectedServer}
                  onChange={(e) => setSelectedServer(e.target.value)}
                  className="bg-zinc-800 border border-zinc-700/80 text-[11px] font-outfit text-white px-2 py-1 rounded cursor-pointer focus:outline-none focus:border-cinemaGold"
                >
                  <option value="warezcdn">WarezCDN (Dublado - Alta Qualidade)</option>
                  <option value="redecanais">RedeCanais (Dublado - Alternativo)</option>
                  <option value="superembed">Superembed (Multilingue)</option>
                </select>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {isEmbed && (
              <>
                <button
                  onClick={() => setIsTheaterMode(!isTheaterMode)}
                  className="p-2.5 rounded-full bg-black/40 hover:bg-slate-700 border border-obsidian-border/60 text-slate-200 hover:text-white transition-all duration-300 hover:scale-105 active:scale-95"
                  title="Modo Teatro"
                >
                  <MonitorUp className="w-5 h-5" />
                </button>
                <button
                  onClick={toggleFullscreen}
                  className="p-2.5 rounded-full bg-black/40 hover:bg-slate-700 border border-obsidian-border/60 text-slate-200 hover:text-white transition-all duration-300 hover:scale-105 active:scale-95"
                  title="Tela Cheia"
                >
                  {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="p-2.5 rounded-full bg-black/40 hover:bg-red-600 border border-obsidian-border/60 text-slate-200 hover:text-white transition-all duration-300 hover:scale-105 active:scale-95"
              title="Fechar Player"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Bottom Floating Controls Overlay */}
        {!isEmbed && (
          <div className={`absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/90 via-black/45 to-transparent flex flex-col gap-3.5 z-20 transition-opacity duration-300 ${
            showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}>
          
          {/* Progress Timeline Slider */}
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-mono text-slate-300">
              {formatTime(currentTime)}
            </span>
            
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
              className="player-slider flex-1"
            />
            
            <span className="text-[11px] font-mono text-slate-300">
              {formatTime(duration)}
            </span>
          </div>

          {/* Action Buttons Toolbar */}
          <div className="flex items-center justify-between">
            {/* Left controls: Play, Volume, Subtitles */}
            <div className="flex items-center gap-4.5">
              {/* Play / Pause Toggle */}
              <button
                onClick={togglePlay}
                className="w-10 h-10 rounded-full bg-cinemaGold hover:bg-cinemaGold-light text-obsidian flex items-center justify-center transition-all duration-300 shadow hover:scale-105 active:scale-95"
              >
                {isPlaying ? <Pause className="w-4.5 h-4.5 fill-obsidian" /> : <Play className="w-4.5 h-4.5 fill-obsidian ml-0.5" />}
              </button>

              {/* Volume Controller */}
              <div className="flex items-center gap-2 group/volume">
                <button
                  onClick={toggleMute}
                  className="text-slate-300 hover:text-white transition-colors"
                >
                  {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>
                
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-16 md:w-20 player-slider hidden group-hover/volume:block transition-all"
                />
              </div>

              {/* Subtitles Toggle */}
              <button
                onClick={() => setSubtitlesEnabled(!subtitlesEnabled)}
                className={`transition-colors p-1 rounded ${
                  subtitlesEnabled ? 'text-cinemaGold hover:text-cinemaGold-light' : 'text-slate-500 hover:text-slate-300'
                }`}
                title={subtitlesEnabled ? "Desativar Legendas" : "Ativar Legendas"}
              >
                <Subtitles className="w-5 h-5" />
              </button>
            </div>

            {/* Right controls: Theater Mode, Speed settings, Fullscreen */}
            <div className="flex items-center gap-4 relative">
              {/* Speed Settings */}
              <div className="relative">
                <button
                  onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                  className="flex items-center gap-1 text-slate-300 hover:text-white transition-colors font-outfit text-xs font-semibold"
                  title="Velocidade"
                >
                  <Settings className="w-4 h-4" />
                  <span>{playbackSpeed}x</span>
                </button>

                {showSpeedMenu && (
                  <div className="absolute bottom-8 right-0 bg-obsidian border border-obsidian-border/80 rounded-xl overflow-hidden shadow-lg flex flex-col min-w-[80px] z-30">
                    {[0.5, 1, 1.5, 2].map((sp) => (
                      <button
                        key={sp}
                        onClick={() => handleSpeedChange(sp)}
                        className={`px-3 py-2 text-xs font-outfit font-medium text-left hover:bg-cinemaCharcoal transition-colors ${
                          playbackSpeed === sp ? 'text-cinemaGold bg-cinemaGold/5' : 'text-slate-300'
                        }`}
                      >
                        {sp}x
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Theater Mode (Desktop only) */}
              <button
                onClick={() => setIsTheaterMode(!isTheaterMode)}
                className="hidden md:block text-slate-300 hover:text-white transition-colors"
                title="Modo Teatro"
              >
                <MonitorUp className="w-5 h-5" />
              </button>

              {/* Fullscreen Trigger */}
              <button
                onClick={toggleFullscreen}
                className="text-slate-300 hover:text-white transition-colors"
                title="Tela Cheia"
              >
                {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};
