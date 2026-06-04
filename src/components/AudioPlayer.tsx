import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Volume2, Loader2 } from 'lucide-react';

interface AudioPlayerProps {
  src: string;
  duration?: number;
}

export default function AudioPlayer({ src, duration: expectedDuration }: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(expectedDuration || 0);
  const [loading, setLoading] = useState(true);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rangeRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const audio = new Audio(src);
    audioRef.current = audio;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };
    const onLoadedMetadata = () => {
      if (audio.duration && audio.duration !== Infinity) {
        setDuration(audio.duration);
      }
      setLoading(false);
    };
    const onCanPlayThrough = () => {
      setLoading(false);
    };

    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('canplaythrough', onCanPlayThrough);

    // Some browsers trigger loadedmetadata after it is starting to buffer
    if (audio.readyState >= 1) {
      if (audio.duration && audio.duration !== Infinity) {
        setDuration(audio.duration);
      }
      setLoading(false);
    }

    return () => {
      audio.pause();
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('canplaythrough', onCanPlayThrough);
    };
  }, [src]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(err => {
        console.warn("Audio play failed:", err);
      });
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current) return;
    const value = parseFloat(e.target.value);
    audioRef.current.currentTime = value;
    setCurrentTime(value);
  };

  const formatTime = (time: number) => {
    if (isNaN(time) || time === Infinity) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex items-center gap-3 bg-white/10 dark:bg-slate-900/10 rounded-2xl p-2.5 max-w-sm border border-white/20 select-none">
      <button
        type="button"
        onClick={togglePlay}
        className="w-8 h-8 rounded-full bg-white text-[#cc0000] flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-md shrink-0 cursor-pointer"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-[#cc0000]" />
        ) : isPlaying ? (
          <Pause className="h-4 w-4 fill-current text-[#cc0000]" />
        ) : (
          <Play className="h-4 w-4 fill-current text-[#cc0000] ml-0.5" />
        )}
      </button>

      <div className="flex-1 flex flex-col justify-center min-w-[140px] space-y-1">
        {/* Track slider */}
        <div className="relative w-full h-1.5 bg-slate-300/40 rounded-full overflow-hidden">
          <div
            className="absolute top-0 left-0 h-full bg-white rounded-full transition-all duration-75"
            style={{ width: `${progressPercentage}%` }}
          />
          <input
            ref={rangeRef}
            type="range"
            min={0}
            max={duration || 100}
            step="0.1"
            value={currentTime}
            onChange={handleSeek}
            className="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer"
          />
        </div>

        {/* Timers & Volume indicator */}
        <div className="flex items-center justify-between text-[10px] text-white/90">
          <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
          <Volume2 className="h-3 w-3 opacity-75" />
        </div>
      </div>
    </div>
  );
}
