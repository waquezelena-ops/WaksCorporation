import React, { useState, useEffect } from 'react';
import { useNotification } from '../hooks/useNotification';

interface HeroProps {
  isActive: boolean;
  userEmail?: string | null;
}

const Hero: React.FC<HeroProps> = ({ isActive, userEmail }) => {
  const { showNotification } = useNotification();
  const [showVideo, setShowVideo] = useState(false);
  const playerRef = React.useRef<any>(null);

  // Load YouTube API script
  useEffect(() => {
    if (!(window as any).YT) {
      const tag = document.createElement('script');
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    }
  }, []);

  // Reset logic on logout/refresh (refresh is natural, logout is handled via userEmail change)
  useEffect(() => {
    setShowVideo(false);
    const timer = setTimeout(() => {
      setShowVideo(true);
    }, 10000);
    return () => clearTimeout(timer);
  }, [userEmail]);

  // YouTube IFrame API Control
  useEffect(() => {
    if (showVideo && !playerRef.current) {
      // Initialize player when video div is shown
      const initPlayer = () => {
        playerRef.current = new (window as any).YT.Player('hero-yt-player', {
          events: {
            onReady: (event: any) => {
              const player = event.target;
              // Add a slight delay to allow playlist metadata to load
              setTimeout(() => {
                const playlist = player.getPlaylist();
                if (playlist && playlist.length > 0) {
                  player.playVideoAt(playlist.length - 1);
                  if (!isActive) {
                    player.pauseVideo();
                  }
                } else if (isActive) {
                  player.playVideo();
                }
              }, 500);
            }
          }
        });
      };

      if ((window as any).YT && (window as any).YT.Player) {
        initPlayer();
      } else {
        (window as any).onYouTubeIframeAPIReady = initPlayer;
      }
    }
  }, [showVideo]);

  // Handle pause/resume on navigation
  useEffect(() => {
    if (playerRef.current && playerRef.current.playVideo) {
      if (isActive && showVideo) {
        playerRef.current.playVideo();
      } else {
        playerRef.current.pauseVideo();
      }
    }
  }, [isActive, showVideo]);

  return (
    <div className="relative text-center space-y-8 md:space-y-12 pt-16 md:pt-28">

      <div
        className="relative z-10 max-w-6xl mx-auto glass rounded-[32px] md:rounded-[48px] p-8 md:p-24 overflow-hidden group mx-4 lg:mx-auto min-h-[400px] md:min-h-[600px] flex items-center justify-center transition-all duration-1000"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-amber-500/50 to-transparent z-20" />

        {showVideo ? (
          <div className="absolute inset-0 w-full h-full bg-black/20 backdrop-blur-sm animate-in fade-in duration-1000 p-6 md:p-12 lg:p-20">
            <div className="w-full h-full rounded-2xl md:rounded-[32px] overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] border border-white/10 bg-black">
              <iframe
                id="hero-yt-player"
                className="w-full h-full border-0"
                src="https://www.youtube.com/embed/videoseries?list=PLTFsoy_DWCOOvT2L8CzAlgqp0997RZjv2&autoplay=1&mute=1&loop=1&modestbranding=1&rel=0&enablejsapi=1&index=0"
                title="Valorant Vision"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              ></iframe>
            </div>
          </div>
        ) : (
          <div className="relative z-10 w-full animate-out fade-out duration-1000 delay-[9000ms]">
            <div className="inline-flex items-center space-x-3 px-4 md:px-5 py-2 rounded-full bg-purple-600/10 dark:bg-purple-900/20 border border-purple-500/20 text-[8px] md:text-[10px] font-black text-purple-600 dark:text-purple-300 mb-8 md:mb-12 uppercase tracking-[0.3em] shadow-[0_0_20px_rgba(168,85,247,0.1)]">
              <span className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_10px_#fbbf24] animate-pulse" />
              <span>Operational: Citadel Phase Alpha</span>
            </div>

            <h1 className="text-4xl md:text-8xl lg:text-9xl font-black tracking-tighter leading-[0.95] text-[var(--text-color)] transition-all duration-700 mb-8 md:mb-10">
              {"Ascend".split('').map((char, i) => (
                <span key={i} className="animate-letter inline-block" style={{ animationDelay: `${i * 0.1}s` }}>{char}</span>
              ))}&nbsp;
              <span className="drop-shadow-[0_0_30px_rgba(251,191,36,0.2)]">
                {"Higher".split('').map((char, i) => (
                  <span
                    key={i}
                    className="animate-letter inline-block text-transparent bg-clip-text bg-gradient-to-b from-amber-500 via-amber-600 to-amber-800 dark:from-amber-300 dark:via-amber-500 dark:to-amber-700"
                    style={{ animationDelay: `${0.6 + i * 0.1}s` }}
                  >
                    {char}
                  </span>
                ))}
              </span>
            </h1>

            <p className="max-w-3xl mx-auto text-lg md:text-2xl text-slate-600 dark:text-slate-400 leading-relaxed font-medium mb-10 md:mb-14 px-2">
              The elite protocol for AI-integrated esports. We engineer peak performance
              through architectural intelligence and strategic mastery.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-8">
              <a
                href="https://discord.gg/xx2Z7C9XXM"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto px-10 md:px-12 py-4 md:py-5 bg-gradient-to-r from-amber-500 to-amber-700 text-black font-black uppercase tracking-[0.2em] text-[10px] md:text-xs rounded-2xl shadow-[0_15px_40px_rgba(251,191,36,0.3)] hover:scale-105 active:scale-95 transition-all border border-amber-400/20 flex items-center justify-center"
              >
                Join the Citadel
              </a>
              <button
                onClick={() => showNotification({ message: 'Protocol is not available as of the moment', type: 'info' })}
                className="w-full sm:w-auto px-10 md:px-12 py-4 md:py-5 bg-black/5 dark:bg-white/5 backdrop-blur-xl border border-black/10 dark:border-white/10 text-black dark:text-white font-black uppercase tracking-[0.2em] text-[10px] md:text-xs rounded-2xl hover:bg-black/10 dark:hover:bg-white/10 hover:border-purple-500/30 transition-all shadow-xl"
              >
                View Protocol
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Decorative stars/particles simulated with divs */}
      <div className="absolute top-0 left-0 w-full h-full -z-10 opacity-40 pointer-events-none">
        <div className="absolute top-10 left-[10%] w-1 h-1 bg-amber-400 dark:bg-amber-200 rounded-full animate-pulse shadow-[0_0_10px_rgba(251,191,36,0.8)]" />
        <div className="absolute top-40 left-[85%] w-1.5 h-1.5 bg-purple-600 dark:bg-purple-400 rounded-full animate-pulse delay-700 shadow-[0_0_10px_rgba(192,132,252,0.8)]" />
        <div className="absolute top-60 left-[20%] w-1 h-1 bg-slate-900 dark:bg-white rounded-full animate-pulse delay-1000" />
      </div>
    </div>
  );
};

export default Hero;
