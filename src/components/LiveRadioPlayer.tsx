import React, { useState } from 'react';
import { useRadio, ActiveMedia, PRESET_CHANNELS } from '../contexts/RadioContext';
import { 
  Play, Pause, Volume2, VolumeX, Search, X, Youtube, 
  RefreshCw
} from 'lucide-react';

const parseYoutubeInput = (input: string): { type: 'video' | 'playlist' | 'channel' | 'search'; value: string; label: string; artist: string } => {
  const trimmed = input.trim();
  
  // 1. Check if playlist URL
  const playlistMatch = trimmed.match(/[&?]list=([^&]+)/);
  if (playlistMatch) {
    return { 
      type: 'playlist', 
      value: playlistMatch[1], 
      label: 'Custom Playlist', 
      artist: 'YouTube Playlist' 
    };
  }

  // 2. Check if standard YouTube video URL
  const videoMatch = trimmed.match(/(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/ ]{11})/);
  if (videoMatch) {
    return { 
      type: 'video', 
      value: videoMatch[1], 
      label: `Cast: ${videoMatch[1]}`, 
      artist: 'YouTube Video' 
    };
  }

  // 3. Check if channel URL (e.g. channel/UC...)
  const channelMatch = trimmed.match(/youtube\.com\/channel\/(UC[a-zA-Z0-9_-]{22})/);
  if (channelMatch) {
    return { 
      type: 'channel', 
      value: channelMatch[1], 
      label: 'Channel Stream', 
      artist: 'YouTube Live Channel' 
    };
  }

  // 4. Check if 11-char video ID directly
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return { 
      type: 'video', 
      value: trimmed, 
      label: `Video: ${trimmed}`, 
      artist: 'Direct Video ID' 
    };
  }

  // 5. Check if channel ID directly (starts with UC and is 24 chars)
  if (/^UC[a-zA-Z0-9_-]{22}$/.test(trimmed)) {
    return { 
      type: 'channel', 
      value: trimmed, 
      label: 'Live Channel Stream', 
      artist: 'YouTube Channel' 
    };
  }

  // 6. Check if playlist ID directly
  if (/^PL[a-zA-Z0-9_-]{16,40}$/.test(trimmed)) {
    return { 
      type: 'playlist', 
      value: trimmed, 
      label: 'Custom Playlist', 
      artist: 'YouTube Playlist ID' 
    };
  }

  // Fallback to general search query
  return { 
    type: 'search', 
    value: trimmed, 
    label: trimmed, 
    artist: 'Search Matcher' 
  };
};

export default function LiveRadioPlayer() {
  const {
    isPlaying,
    setIsPlaying,
    activeMedia,
    setActiveMedia,
    isMuted,
    setIsMuted,
    playHistory,
    addToHistory,
    playPreset
  } = useRadio();

  const [searchQuery, setSearchQuery] = useState<string>('');

  // Searching States
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchLiveOnly, setSearchLiveOnly] = useState<boolean>(true);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [showSearchResults, setShowSearchResults] = useState<boolean>(false);

  const performSearch = async (queryText: string, liveFilter = searchLiveOnly) => {
    if (!queryText.trim()) return;
    setIsSearching(true);
    setSearchError(null);
    setShowSearchResults(true);
    
    try {
      const response = await fetch(`/api/youtube/search?q=${encodeURIComponent(queryText)}&live=${liveFilter}`);
      const data = await response.json();
      if (data.success && data.results) {
        setSearchResults(data.results);
      } else {
        setSearchError(data.error || "Failed to find search results");
      }
    } catch (err) {
      console.error("Error searching YouTube:", err);
      setSearchError("Failed to connect to YouTube search server");
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    const parsed = parseYoutubeInput(searchQuery);
    if (parsed.type !== 'search') {
      const media: ActiveMedia = {
        title: parsed.label,
        artist: parsed.artist,
        type: parsed.type,
        value: parsed.value
      };

      setActiveMedia(media);
      setIsPlaying(true);
      addToHistory(media);
      setSearchQuery('');
      setShowSearchResults(false);
    } else {
      performSearch(searchQuery);
    }
  };

  return (
    <div id="workshop-radio-card" className="bg-slate-900 text-white rounded-xl p-3 border border-slate-800 shadow-xl relative overflow-hidden flex flex-col gap-2.5 select-none hover:border-slate-755 transition-colors duration-300">
      
      {/* Header Panel - Super Compact */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Youtube className="h-4 w-4 text-red-500 shrink-0" />
          <span className="font-mono text-[9px] font-black uppercase tracking-wider text-slate-300">Workshop Sound Deck</span>
        </div>
        
        <div className="flex items-center gap-1 bg-slate-950 px-2 py-0.5 rounded-full border border-slate-800">
          <span className={`h-1 w-1 rounded-full ${isPlaying ? 'bg-red-500 animate-pulse' : 'bg-slate-600'}`} />
          <span className="text-[7.5px] font-mono font-bold uppercase tracking-wider text-slate-400">
            {isPlaying ? 'ON AIR' : 'STANDBY'}
          </span>
        </div>
      </div>

      {/* Active Streaming Overlay Ribbon - Replaces the huge video box */}
      {isPlaying ? (
        <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-2 flex items-center justify-between gap-2.5 transition-all duration-300">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {/* Super sleek micro equalizer animation */}
            <div className="flex items-end gap-0.5 h-3 shrink-0">
              <span className="w-0.5 bg-red-500 animate-[equalizer_1s_infinite_alternate]" style={{ animationDelay: '0.1s', minHeight: '3px' }} />
              <span className="w-0.5 bg-red-500 animate-[equalizer_1s_infinite_alternate]" style={{ animationDelay: '0.3s', minHeight: '4px' }} />
              <span className="w-0.5 bg-red-500 animate-[equalizer_1s_infinite_alternate]" style={{ animationDelay: '0.2s', minHeight: '3px' }} />
            </div>
            
            <div className="truncate flex-1">
              <span className="text-[7px] font-mono font-black text-red-500 uppercase tracking-widest block leading-none">STREAMING</span>
              <span className="font-sans font-semibold text-[10px] text-slate-200 truncate block leading-none mt-0.5 animate-pulse" title={activeMedia.title}>
                {activeMedia.title}
              </span>
            </div>
          </div>
          
          <button 
            type="button"
            onClick={() => setIsPlaying(false)}
            className="px-2 py-0.5 text-[8px] font-mono font-bold bg-red-950/40 border border-red-900/35 text-red-400 rounded hover:bg-red-900/30 transition-colors cursor-pointer shrink-0"
          >
            Stop
          </button>
        </div>
      ) : (
        <div className="bg-slate-950/40 border border-dashed border-slate-800/60 rounded-lg py-1.5 text-center">
          <span className="text-[8px] font-mono text-slate-500 font-semibold uppercase tracking-wider">AUDIO ACTIVE IN BACKGROUND</span>
        </div>
      )}

      {/* ================= YouTube Direct Search & Play Input ================= */}
      <div className="space-y-1">
        <form onSubmit={handleSearchSubmit} className="flex gap-1.5">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
              <Search className="h-3 w-3 text-slate-500" />
            </div>
            <input
              type="text"
              placeholder="Search youtube or paste URL..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-7 py-1.5 bg-slate-950 text-[10px] text-white placeholder-slate-500 rounded-lg border border-slate-800 focus:border-red-600 focus:outline-none transition-all font-sans"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 pr-2 flex items-center text-slate-500 hover:text-white transition-colors border-0 bg-transparent outline-none cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          
          <button
            type="submit"
            disabled={!searchQuery.trim()}
            className="px-2.5 bg-red-600 hover:bg-red-700 active:scale-95 disabled:bg-slate-800 disabled:text-slate-600 text-slate-100 text-[10px] font-mono font-black uppercase tracking-wider transition-all cursor-pointer border-0 outline-none rounded-lg flex items-center gap-1 shrink-0"
          >
            <Play className="h-3 w-3 fill-current" /> Play
          </button>
        </form>

        {/* Dynamic Compact Search Results Dropdown/Overlay inside boundaries */}
        {showSearchResults && (
          <div className="bg-slate-950 rounded-lg border border-slate-800 p-2 space-y-1.5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-850 pb-1">
              <span className="text-[7.5px] font-mono font-black uppercase tracking-wide text-red-500">
                Found Results ({searchLiveOnly ? 'Live broadcasts' : 'Videos'})
              </span>
              <button
                type="button"
                onClick={() => {
                  setShowSearchResults(false);
                  setSearchResults([]);
                }}
                className="text-slate-500 hover:text-slate-300 transition-colors cursor-pointer border-0 bg-transparent p-0"
              >
                <X className="h-3 w-3" />
              </button>
            </div>

            {isSearching ? (
              <div className="py-2.5 flex items-center justify-center gap-1.5 text-slate-500 text-[9px] font-mono">
                <RefreshCw className="h-3 w-3 animate-spin text-red-500" />
                <span className="animate-pulse">Syncing frequencies...</span>
              </div>
            ) : searchError ? (
              <span className="block text-[9px] text-red-400 py-1 font-mono text-center">{searchError}</span>
            ) : searchResults.length === 0 ? (
              <span className="block text-[9px] text-slate-500 py-1 text-center font-mono">No matching streams.</span>
            ) : (
              <div className="space-y-1 max-h-[110px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
                {searchResults.slice(0, 4).map((res) => {
                  const isCurrent = activeMedia.value === res.id && isPlaying;
                  return (
                    <button
                      key={res.id}
                      onClick={() => {
                        const media: ActiveMedia = {
                          title: res.title,
                          artist: res.channel,
                          type: 'video',
                          value: res.id
                        };
                        setActiveMedia(media);
                        setIsPlaying(true);
                        addToHistory(media);
                        setShowSearchResults(false);
                      }}
                      type="button"
                      className={`w-full p-1 rounded border text-left transition-all cursor-pointer flex gap-1.5 outline-none items-center ${
                        isCurrent
                          ? 'bg-red-950/35 border-red-900/50 text-white font-bold'
                          : 'bg-slate-900/60 border-slate-850 hover:bg-slate-900 text-slate-300 hover:text-white'
                      }`}
                    >
                      <div className="relative w-8 h-5 rounded overflow-hidden bg-slate-950 shrink-0 border border-slate-800/85 bg-cover bg-center">
                        <img 
                          src={res.thumbnail} 
                          alt="" 
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            e.currentTarget.src = "https://images.unsplash.com/photo-1614149162883-504ce4d13909?q=80&w=60&auto=format&fit=crop";
                          }}
                        />
                      </div>
                      <div className="truncate flex-1 min-w-0">
                        <span className="block text-[9px] font-bold truncate leading-tight text-slate-100">{res.title}</span>
                        <span className="block text-[7.5px] text-slate-400 truncate leading-none mt-0.5">{res.channel}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ================= 2-Layout Premium Selection of Video Presets ('Suggested Channels') ================= */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[8px] font-mono font-bold text-slate-500 uppercase tracking-wider block">Recommended Audio Deck:</span>
          <span className="text-[7.5px] font-mono text-slate-500">Quick-Select</span>
        </div>
        
        <div className="grid grid-cols-2 gap-2">
          {PRESET_CHANNELS.slice(0, 2).map((chan, idx) => {
            const isCurrent = activeMedia.value === chan.value && isPlaying;
            // High-quality cover overlays for our 2 layouts:
            const bgImage = idx === 0 
              ? "https://images.unsplash.com/photo-1518495973542-4542c06a5843?q=80&w=150&auto=format&fit=crop" // Lofi girl Cozy vibe
              : "https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=150&auto=format&fit=crop"; // Synthwave Cyber deck
            
            return (
              <button
                key={idx}
                type="button"
                onClick={() => playPreset(chan)}
                className={`relative h-18 rounded-lg overflow-hidden text-left transition-all border group cursor-pointer focus:outline-none flex flex-col justify-end p-2 ${
                  isCurrent 
                    ? 'border-red-500 ring-1 ring-red-500 shadow-md shadow-red-950/20' 
                    : 'border-slate-800 hover:border-slate-705'
                }`}
              >
                {/* Background image & gradient overlays */}
                <div className="absolute inset-0 z-0">
                  <img src={bgImage} alt="" className="w-full h-full object-cover grayscale brightness-35 group-hover:brightness-50 group-hover:grayscale-0 group-hover:scale-105 transition-all duration-300" referrerPolicy="no-referrer" />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/75 to-transparent" />
                  {isCurrent && <div className="absolute inset-0 bg-red-950/30 mix-blend-color-dodge" />}
                </div>

                {/* Content over background */}
                <div className="relative z-10 w-full min-w-0">
                  <span className="text-[7px] font-mono font-bold text-slate-400 block truncate leading-none uppercase">
                    {chan.artist.slice(0, 16)}
                  </span>
                  <span className={`text-[9px] font-bold block truncate leading-tight mt-0.5 ${isCurrent ? 'text-red-400' : 'text-white'}`}>
                    {chan.title}
                  </span>
                  <div className="flex items-center gap-1 mt-0.5">
                    <div className={`h-1 w-1 rounded-full ${isCurrent ? 'bg-red-500 animate-pulse' : 'bg-slate-500'}`} />
                    <span className="text-[7.5px] font-mono text-slate-400 uppercase tracking-widest leading-none">
                      {isCurrent ? 'Playing' : 'Ready'}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* bottom actions/filters */}
      <div className="flex items-center justify-between border-t border-slate-850 pt-2 px-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[7.5px] font-mono font-bold text-slate-500 uppercase tracking-wider block">Scope:</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setSearchLiveOnly(true);
                if (showSearchResults && searchQuery.trim()) {
                  performSearch(searchQuery, true);
                }
              }}
              className={`px-1.5 py-0.5 rounded text-[7.5px] font-mono font-bold uppercase transition-all cursor-pointer ${
                searchLiveOnly 
                  ? 'bg-red-650 text-white' 
                  : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              Live
            </button>
            <button
              type="button"
              onClick={() => {
                setSearchLiveOnly(false);
                if (showSearchResults && searchQuery.trim()) {
                  performSearch(searchQuery, false);
                }
              }}
              className={`px-1.5 py-0.5 rounded text-[7.5px] font-mono font-bold uppercase transition-all cursor-pointer ${
                !searchLiveOnly 
                  ? 'bg-slate-700 text-white' 
                  : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              All
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsMuted(!isMuted)}
            className="p-1 text-slate-400 hover:text-white rounded transition-colors cursor-pointer"
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <VolumeX className="h-3.5 w-3.5 text-red-500 animate-pulse" /> : <Volume2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
