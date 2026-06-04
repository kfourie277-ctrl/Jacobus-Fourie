import React, { createContext, useContext, useState, useEffect } from 'react';

export interface ActiveMedia {
  title: string;
  artist: string;
  type: 'video' | 'playlist' | 'channel' | 'search';
  value: string;
}

export const PRESET_CHANNELS: ActiveMedia[] = [
  {
    title: 'Lofi Girl Live Beats',
    artist: 'Cozy Hip Hop Stream',
    type: 'channel',
    value: 'UCSJ4gkVC6NrvII8umztf0Ow', // Lofi Girl Channel ID
  },
  {
    title: 'Synthwave Live Radio',
    artist: 'Retro Neon Cyber Beats',
    type: 'channel',
    value: 'UCv7S0Xg60p9v_Xp6_N626eA', // Lofi Girl Synthwave Channel ID
  },
  {
    title: 'Relaxing Lounge Jazz',
    artist: 'BGM Piano & Chords',
    type: 'channel',
    value: 'UCg9cWSLp80BOC88A8gS47HA', // Cafe Music BGM Channel ID
  },
  {
    title: 'Monstercat EDM Live',
    artist: 'High Energy Electronic',
    type: 'channel',
    value: 'UC65afg80_jO_xst3v9XIEKA', // Monstercat Channel ID
  },
  {
    title: 'Chillhop Cafe Lounge',
    artist: 'Golden Instrumental Grooves',
    type: 'channel',
    value: 'UCOxqgCwgOqC2Rl9n3QEiSkA', // Chillhop Music Channel ID
  },
  {
    title: 'Defected Deep House',
    artist: 'Ibiza Lounge Records',
    type: 'channel',
    value: 'UC60v7N4GbeIn_oE7n9e6F7A', // Defected Channel ID
  }
];

interface RadioContextType {
  isPlaying: boolean;
  setIsPlaying: (val: boolean) => void;
  activeMedia: ActiveMedia;
  setActiveMedia: (media: ActiveMedia) => void;
  isMuted: boolean;
  setIsMuted: (val: boolean) => void;
  playHistory: ActiveMedia[];
  addToHistory: (media: ActiveMedia) => void;
  isMinimised: boolean;
  setIsMinimised: (val: boolean) => void;
  playPreset: (preset: ActiveMedia) => void;
}

const RadioContext = createContext<RadioContextType | undefined>(undefined);

export function RadioProvider({ children }: { children: React.ReactNode }) {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [activeMedia, setActiveMedia] = useState<ActiveMedia>(PRESET_CHANNELS[0]);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isMinimised, setIsMinimised] = useState<boolean>(false);
  
  const [playHistory, setPlayHistory] = useState<ActiveMedia[]>(() => {
    try {
      const saved = localStorage.getItem('workshop_youtube_history');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Failed to parse YouTube history', e);
    }
    return [PRESET_CHANNELS[0], PRESET_CHANNELS[1]];
  });

  const addToHistory = (media: ActiveMedia) => {
    setPlayHistory((prev) => {
      const filtered = prev.filter((item) => item.value !== media.value);
      const updated = [media, ...filtered].slice(0, 5);
      try {
        localStorage.setItem('workshop_youtube_history', JSON.stringify(updated));
      } catch (e) {
        console.warn('Failed to save to localStorage', e);
      }
      return updated;
    });
  };

  const playPreset = (preset: ActiveMedia) => {
    setActiveMedia(preset);
    setIsPlaying(true);
    addToHistory(preset);
  };

  return (
    <RadioContext.Provider value={{
      isPlaying,
      setIsPlaying,
      activeMedia,
      setActiveMedia,
      isMuted,
      setIsMuted,
      playHistory,
      addToHistory,
      isMinimised,
      setIsMinimised,
      playPreset
    }}>
      {children}
    </RadioContext.Provider>
  );
}

export function useRadio() {
  const context = useContext(RadioContext);
  if (!context) {
    throw new Error('useRadio must be used within a RadioProvider');
  }
  return context;
}
