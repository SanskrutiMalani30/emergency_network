import React, { useState, useEffect } from 'react';
import { Volume2, VolumeX, Loader2 } from 'lucide-react';
import { speechService } from '../services/speechService';

export default function SpeechButton({
  text,
  identifier,
  size = 'md',
  className = ''
}) {
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    setIsPlaying(speechService.isItemPlaying(identifier));

    const unsubscribe = speechService.subscribe(({ currentPlayingId, isPlaying: globalPlaying }) => {
      setIsPlaying(globalPlaying && currentPlayingId === identifier);
    });

    return () => unsubscribe();
  }, [identifier]);

  const handleToggleSpeech = (e) => {
    e.stopPropagation();
    e.preventDefault();

    if (isPlaying) {
      speechService.stop();
    } else {
      speechService.speakText(text, identifier);
    }
  };

  const iconSizeClass = size === 'sm' ? 'w-3 h-3' : size === 'lg' ? 'w-4 h-4' : 'w-3.5 h-3.5';
  const btnPadding = size === 'sm' ? 'p-1' : size === 'lg' ? 'p-2' : 'p-1.5';

  return (
    <button
      type="button"
      onClick={handleToggleSpeech}
      aria-label="Listen to emergency description"
      title={isPlaying ? "Stop speech playback" : "Listen to emergency description"}
      className={`${btnPadding} rounded-lg border transition flex items-center justify-center shrink-0 ${
        isPlaying
          ? 'bg-[#168BFA] text-white border-[#168BFA] shadow-xs animate-pulse'
          : 'bg-white hover:bg-[#EAF5FF] text-[#168BFA] border-[#D0E6FC] hover:border-[#B6D9FB]'
      } ${className}`}
    >
      {isPlaying ? (
        <VolumeX className={`${iconSizeClass}`} />
      ) : (
        <Volume2 className={`${iconSizeClass}`} />
      )}
    </button>
  );
}
