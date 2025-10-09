import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Character, FocusState, SessionType, RewardType, Reward, GreetingMessage } from './types';
import { IMAGES, CHARACTER_DATA, AUDIO, firebaseConfig } from './constants';

// --- FIREBASE SETUP ---
declare const firebase: any;

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const database = firebase.database();

// --- CUSTOM HOOKS ---
function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}


// --- HELPERS & UI COMPONENTS ---

const getCycleDateString = (timestamp: number): string => {
    // Subtract 5 hours to make the day roll over at 5 AM UTC
    const adjustedTimestamp = timestamp - (5 * 60 * 60 * 1000);
    const date = new Date(adjustedTimestamp);
    const year = date.getUTCFullYear();
    const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    const day = date.getUTCDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const blobToBase64 = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
});

const PixelButton: React.FC<{ onClick: () => void; children: React.ReactNode; className?: string; variant?: 'primary' | 'secondary' | 'danger', disabled?: boolean; }> = ({ onClick, children, className = '', variant = 'primary', disabled = false }) => {
  const colors = {
    primary: 'bg-[#7a5a3b] hover:bg-[#8e6945] border-[#4d3924]',
    secondary: 'bg-gray-400 hover:bg-gray-500 border-gray-600',
    danger: 'bg-red-600 hover:bg-red-700 border-red-800'
  };
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`text-white text-2xl md:text-3xl p-4 border-4 ${colors[variant]} shadow-[6px_6px_0px_#383838] hover:shadow-[4px_4px_0px_#383838] active:shadow-[2px_2px_0px_#383838] transform hover:-translate-y-px active:translate-y-1 transition-all duration-100 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      {children}
    </button>
  );
};

const Timer: React.FC<{ elapsedSeconds: number }> = ({ elapsedSeconds }) => {
    const formatTime = () => {
        const totalSeconds = elapsedSeconds > 0 ? elapsedSeconds : 0;
        const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
        const mins = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
        const secs = (totalSeconds % 60).toString().padStart(2, '0');
        return `${hours}:${mins}:${secs}`;
    };

    return <div className="absolute top-4 right-4 bg-black bg-opacity-50 text-white text-3xl p-4 border-4 border-gray-800">{formatTime()}</div>;
};

const PartnerTimer: React.FC<{ elapsedSeconds: number; partnerName: string; }> = ({ elapsedSeconds, partnerName }) => {
    const formatTime = () => {
        const totalSeconds = elapsedSeconds > 0 ? elapsedSeconds : 0;
        const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
        const mins = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
        const secs = (totalSeconds % 60).toString().padStart(2, '0');
        return `${hours}:${mins}:${secs}`;
    };

    return (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black bg-opacity-50 text-white text-3xl p-4 border-4 border-gray-800">
            {partnerName}: {formatTime()}
        </div>
    );
};

const SoundToggleButton: React.FC<{ isMuted: boolean; onToggle: () => void; }> = ({ isMuted, onToggle }) => (
    <button
        onClick={onToggle}
        className="absolute top-4 left-4 z-20 bg-black bg-opacity-50 text-white text-3xl p-3 border-4 border-gray-800"
        aria-label={isMuted ? "Unmute" : "Mute"}
    >
        {isMuted ? '🔇' : '🔊'}
    </button>
);

const FullscreenButton: React.FC<{ isFullscreen: boolean; onToggle: () => void; }> = ({ isFullscreen, onToggle }) => (
    <button
        onClick={onToggle}
        className="absolute top-20 left-4 z-20 bg-black bg-opacity-50 text-white text-3xl p-3 border-4 border-gray-800 md:hidden"
        aria-label={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
    >
        {isFullscreen ? '⤢' : '⤡'}
    </button>
);


// --- AUDIO COMPONENTS ---

const AudioPlayer: React.FC<{ src: string }> = ({ src }) => {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);

    const togglePlay = () => {
        if (audioRef.current) {
            if (isPlaying) {
                audioRef.current.pause();
            } else {
                audioRef.current.play().catch(e => console.error("Audio playback failed", e));
            }
        }
    };

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        
        const onPlay = () => setIsPlaying(true);
        const onPause = () => setIsPlaying(false);
        const onEnded = () => setIsPlaying(false);

        audio.addEventListener('play', onPlay);
        audio.addEventListener('pause', onPause);
        audio.addEventListener('ended', onEnded);
        
        return () => {
            audio.removeEventListener('play', onPlay);
            audio.removeEventListener('pause', onPause);
            audio.removeEventListener('ended', onEnded);
        };
    }, []);

    return (
        <div className="my-2 flex justify-center items-center gap-4">
            <audio ref={audioRef} src={src} preload="auto"></audio>
            <PixelButton onClick={togglePlay} className="!p-3 text-3xl">
                {isPlaying ? '⏸️' : '▶️'}
            </PixelButton>
        </div>
    );
};

const AudioRecorder: React.FC<{ onRecord: (blob: Blob | null) => void; }> = ({ onRecord }) => {
    type Status = 'idle' | 'acquiring_media' | 'recording' | 'recorded' | 'error';
    const [status, setStatus] = useState<Status>('idle');
    const [recordingTime, setRecordingTime] = useState(0);
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [objectUrl, setObjectUrl] = useState<string>('');

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const timerIntervalRef = useRef<number | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    
    const MAX_RECORDING_TIME_MS = 120 * 1000;

    const cleanup = useCallback(() => {
        if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
        }
        if (mediaRecorderRef.current) {
            mediaRecorderRef.current.ondataavailable = null;
            mediaRecorderRef.current.onstop = null;
            mediaRecorderRef.current.onerror = null;
            if (mediaRecorderRef.current.state === 'recording') {
                mediaRecorderRef.current.stop();
            }
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
        }
        mediaRecorderRef.current = null;
        streamRef.current = null;
        chunksRef.current = [];
    }, []);

    useEffect(() => {
        return cleanup;
    }, [cleanup]);

    useEffect(() => {
        if (!audioBlob) return;
        const url = URL.createObjectURL(audioBlob);
        setObjectUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [audioBlob]);

    const stopRecording = () => {
        if (mediaRecorderRef.current?.state === "recording") {
            mediaRecorderRef.current.stop();
        }
    };
    
    const startRecording = async () => {
        setStatus('acquiring_media');
        setError(null);
        setAudioBlob(null);
        onRecord(null);

        if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
            setError("Audio recording is not supported on this browser.");
            setStatus('error');
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            const mimeType = 'audio/webm;codecs=opus';
            const options = MediaRecorder.isTypeSupported(mimeType) ? { mimeType } : {};
            const recorder = new MediaRecorder(stream, options);
            mediaRecorderRef.current = recorder;
            chunksRef.current = [];

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };

            recorder.onstop = () => {
                if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

                if (chunksRef.current.length === 0) {
                    setError("No audio was captured. Please check microphone permissions and ensure it's not muted.");
                    setStatus('error');
                } else {
                    const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
                    setAudioBlob(blob);
                    onRecord(blob);
                    setStatus('recorded');
                }
                
                if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
                streamRef.current = null;
                mediaRecorderRef.current = null;
            };

            recorder.onerror = (event) => {
                setError(`Recording error: ${(event as any).error?.name || 'Unknown error'}. Please try again.`);
                setStatus('error');
                cleanup();
            };

            recorder.start();
            setStatus('recording');
            setRecordingTime(0);
            timerIntervalRef.current = window.setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);

            setTimeout(() => {
                if (mediaRecorderRef.current?.state === 'recording') stopRecording();
            }, MAX_RECORDING_TIME_MS);

        } catch (err) {
            let message = "Could not access the microphone.";
            if (err instanceof DOMException) {
                if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                    message = "Permission denied. Please allow microphone access in your browser/system settings.";
                } else if (err.name === 'NotReadableError') {
                    message = "Microphone is busy or blocked. Please close other apps/tabs using it and try again.";
                } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                    message = "No microphone found on your device.";
                } else if (err.name === 'SecurityError') {
                    message = "Microphone access is only allowed on secure (HTTPS) pages.";
                } else {
                    message = `An unexpected error occurred: ${err.name}.`;
                }
            }
            setError(message);
            setStatus('error');
            cleanup();
        }
    };

    const handleReset = () => {
        setAudioBlob(null);
        onRecord(null);
        setRecordingTime(0);
        setStatus('idle');
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
        const secs = (seconds % 60).toString().padStart(2, '0');
        return `${mins}:${secs}`;
    };
    
    const handleTryAgain = () => {
        setStatus('idle');
        setError(null);
    };

    if (status === 'error') {
        return (
            <div className="text-center py-2">
                <p className="text-red-500 text-lg mb-2 break-words">{error}</p>
                <PixelButton onClick={handleTryAgain} variant="secondary">Try Again</PixelButton>
            </div>
        );
    }
    
    if (status === 'acquiring_media') {
         return (
            <div className="flex items-center justify-center gap-4 my-2 text-white text-2xl">
                <p>Accessing microphone...</p>
            </div>
        );
    }
    
    if (status === 'recording') {
        return (
            <div className="flex items-center justify-center gap-4 my-2">
                <PixelButton onClick={stopRecording} variant="danger">
                    <span role="img" aria-label="stop">⏹️</span> Stop ({formatTime(recordingTime)})
                </PixelButton>
            </div>
        );
    }
    
    if (status === 'recorded' && audioBlob) {
        return (
            <div className="flex items-center justify-center gap-2 my-2">
                <AudioPlayer src={objectUrl} />
                <PixelButton onClick={handleReset} variant="secondary" className="!p-3 text-3xl">🗑️</PixelButton>
            </div>
        );
    }

    return (
        <div className="my-2">
             <PixelButton onClick={startRecording} className="w-full">
                <span role="img" aria-label="microphone">🎤</span> Record Voice Note
            </PixelButton>
        </div>
    );
};


// --- SCREENS & MODALS ---

const OnboardingScreen: React.FC<{ onSelect: (character: Character) => void; }> = ({ onSelect }) => (
  <div className="w-full min-h-screen flex flex-col justify-center items-center bg-[#f3e5ab] p-4 overflow-y-auto">
    <div className="bg-[#d2b48c] p-8 border-8 border-[#a0522d] shadow-lg flex flex-col items-center">
      <h1 className="text-5xl md:text-7xl text-white minecraft-text text-center mb-6">Who is this Polito?</h1>
      <img src={IMAGES.ONBOARDING_PORTRAITS} alt="Flynn and Rapunzel" className="max-w-xs md:max-w-sm w-full border-8 border-[#a0522d] mb-8" />
       <p className="text-3xl text-white minecraft-text mb-6">Choose your character</p>
      <div className="flex flex-col sm:flex-row gap-6">
        <PixelButton onClick={() => onSelect(Character.Flynn)}>I am Flynn</PixelButton>
        <PixelButton onClick={() => onSelect(Character.Rapunzel)}>I am Rapunzel</PixelButton>
      </div>
    </div>
  </div>
);

const RewardModal: React.FC<{ from: Character, onSend: (reward: Omit<Reward, 'from'>) => void, onSkip: () => void; }> = ({ from, onSend, onSkip }) => {
    const [customPraise, setCustomPraise] = useState('');
    const [inputType, setInputType] = useState<'text' | 'voice' | null>(null);
    const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);

    const handleSendText = () => {
        if (customPraise.trim()) {
            onSend({
                type: RewardType.Praise,
                message: customPraise.trim(),
            });
        }
    };

    const handleSendVoice = async () => {
        if (recordedBlob) {
            const audioBase64 = await blobToBase64(recordedBlob);
            onSend({
                type: RewardType.Praise,
                audioBase64,
            });
        }
    };
    
    const handleBack = () => {
        setInputType(null);
        setCustomPraise('');
        setRecordedBlob(null);
    };

    const renderContent = () => {
        if (inputType === 'text') {
            return (
                <div className="flex flex-col gap-4">
                    <textarea 
                        className="w-full p-2 text-xl bg-[#f3e5ab] text-black border-4 border-[#7a5a3b] focus:outline-none"
                        placeholder="So proud of you!" 
                        value={customPraise}
                        onChange={(e) => setCustomPraise(e.target.value)}
                        rows={3}
                    />
                    <PixelButton onClick={handleSendText}>Send Note</PixelButton>
                    <PixelButton onClick={handleBack} variant="secondary">Back</PixelButton>
                </div>
            );
        }
        if (inputType === 'voice') {
            return (
                 <div className="flex flex-col gap-4">
                    <AudioRecorder onRecord={setRecordedBlob} />
                    <PixelButton onClick={handleSendVoice} disabled={!recordedBlob}>Send Voice Note</PixelButton>
                    <PixelButton onClick={handleBack} variant="secondary">Back</PixelButton>
                </div>
            );
        }
        return (
            <div className="grid grid-cols-1 gap-4">
                <PixelButton onClick={() => onSend({ type: RewardType.Kisses })}>
                    <span role="img" aria-label="lips">💋</span> Send Kisses
                </PixelButton>
                <PixelButton onClick={() => onSend({ type: RewardType.Hugs })}>
                    <span role="img" aria-label="hugging face">🤗</span> Send Hugs
                </PixelButton>
                <PixelButton onClick={() => setInputType('text')}>
                   <span role="img" aria-label="speech bubble">📝</span> Write Note
                </PixelButton>
                <PixelButton onClick={() => setInputType('voice')}>
                   <span role="img" aria-label="microphone">🎤</span> Record Voice
                </PixelButton>
                <PixelButton onClick={onSkip} variant="secondary">Skip</PixelButton>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50">
            <div className="bg-[#c69a6c] p-8 border-8 border-[#7a5a3b] text-center w-[90%] max-w-md">
                <h2 className="text-4xl text-white minecraft-text mb-6">Great work! Send your polito some love?</h2>
                {renderContent()}
            </div>
        </div>
    );
};


const RewardNotification: React.FC<{ 
    reward: Reward; 
    onAcknowledge: () => void;
    onDismiss: () => void;
    onRespond: (reward: Omit<Reward, 'from'>) => void; 
}> = ({ reward, onAcknowledge, onDismiss, onRespond }) => {
  const [isResponding, setIsResponding] = useState(false);
  const [responseType, setResponseType] = useState<'text' | 'voice' | null>(null);
  const [responseMessage, setResponseMessage] = useState('');
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);

    const getRewardMessage = () => {
        switch (reward.type) {
            case RewardType.Kisses: return `sent you kisses!`;
            case RewardType.Hugs: return `sent you hugs!`;
            case RewardType.Heart: return `loved your message! 💛`;
            case RewardType.Praise: {
                if (reward.message) return `says: "${reward.message}"`;
                if (reward.audioBase64) return `sent you a voice note!`;
                return 'sent you praise!'; // Fallback
            }
            default: return '';
        }
    };

  const rewardEmojis: Partial<Record<RewardType, string>> = {
    [RewardType.Hugs]: '🤗',
    [RewardType.Kisses]: '💋',
  };

  const emojiToShow = rewardEmojis[reward.type];

  const handleSendResponse = async () => {
    if (responseType === 'text' && responseMessage.trim()) {
      onRespond({ 
          type: RewardType.Praise, 
          message: responseMessage.trim(), 
      });
    } else if (responseType === 'voice' && recordedBlob) {
        const audioBase64 = await blobToBase64(recordedBlob);
        onRespond({
            type: RewardType.Praise,
            audioBase64,
        });
    }
    setIsResponding(false);
    setResponseType(null);
    setResponseMessage('');
    setRecordedBlob(null);
  };
  
  const handleHeartResponse = () => {
    onRespond({ type: RewardType.Heart });
    onAcknowledge();
  };

  const renderResponseUI = () => {
      if (responseType === 'text') {
          return (
              <div className="flex flex-col gap-2 mt-2">
                  <textarea 
                      className="w-full p-2 text-lg bg-[#f3e5ab] text-black border-2 border-[#7a5a3b] focus:outline-none"
                      placeholder="Write a reply..." 
                      value={responseMessage}
                      onChange={(e) => setResponseMessage(e.target.value)}
                      rows={2}
                  />
                  <PixelButton onClick={handleSendResponse}>Send</PixelButton>
                  <PixelButton onClick={() => setResponseType(null)} variant="secondary">Cancel</PixelButton>
              </div>
          );
      }
      if (responseType === 'voice') {
          return (
              <div className="flex flex-col gap-2 mt-2">
                  <AudioRecorder onRecord={setRecordedBlob} />
                  <PixelButton onClick={handleSendResponse} disabled={!recordedBlob}>Send</PixelButton>
                  <PixelButton onClick={() => setResponseType(null)} variant="secondary">Cancel</PixelButton>
              </div>
          );
      }
      return null;
  }

  return (
    <div className="fixed bottom-4 right-4 bg-[#c69a6c] p-4 border-4 border-[#7a5a3b] shadow-lg z-40 max-w-sm w-[90%]">
      {(reward.type === RewardType.Hugs || reward.type === RewardType.Kisses) && (
          <img 
            src={reward.type === RewardType.Hugs ? IMAGES.HUGS_GIF : IMAGES.KISSES_GIF} 
            alt={reward.type}
            className="absolute inset-0 w-full h-full object-cover z-0"
          />
        )}
      <div className="relative z-10 text-center text-white text-shadow-md">
        <h3 className="text-2xl minecraft-text flex items-center justify-center gap-2">
            {emojiToShow && <span className="text-3xl animate-float-up">{emojiToShow}</span>}
            {reward.from}
        </h3>
        <p className="text-xl break-words">{getRewardMessage()}</p>
        
        {reward.audioBase64 && <AudioPlayer src={reward.audioBase64} />}

        {isResponding ? renderResponseUI() : (
            <div className="flex flex-col gap-2 mt-4">
               {reward.type !== RewardType.Heart && (
                  <div className="grid grid-cols-2 gap-2">
                    <PixelButton onClick={() => setIsResponding(true)}>Respond</PixelButton>
                    <PixelButton onClick={handleHeartResponse}>💛</PixelButton>
                  </div>
                )}
                <PixelButton onClick={onAcknowledge} variant="secondary">
                  Dismiss
                </PixelButton>
            </div>
        )}
      </div>
      <button onClick={onDismiss} className="absolute -top-3 -right-3 text-3xl bg-red-600 rounded-full w-8 h-8 flex items-center justify-center border-2 border-white text-white">
          &times;
      </button>
    </div>
  );
};

const PowerCoupleStats: React.FC<{
    character: Character;
    stats: Record<string, number>;
    partnerStats: Record<string, number>;
}> = ({ character, stats, partnerStats }) => {
    const today = getCycleDateString(Date.now());
    const yesterday = getCycleDateString(Date.now() - 24 * 60 * 60 * 1000);

    const formatTime = (totalSeconds = 0) => {
        const hours = Math.floor(totalSeconds / 3600);
        const mins = Math.floor((totalSeconds % 3600) / 60);
        return `${hours}h ${mins}m`;
    };

    const myToday = stats[today] || 0;
    const myYesterday = stats[yesterday] || 0;
    const partnerToday = partnerStats[today] || 0;
    const partnerYesterday = partnerStats[yesterday] || 0;
    const partnerName = CHARACTER_DATA[character].partner;

    return (
        <div className="absolute bottom-4 left-4 bg-black bg-opacity-50 text-white text-xl p-4 border-4 border-gray-800 w-[90%] max-w-xs md:max-w-none md:w-auto">
            <h3 className="text-2xl text-center mb-2 minecraft-text">Power Couple Stats</h3>
            <div className="grid grid-cols-3 gap-x-4 gap-y-1">
                <div />
                <div className="text-center font-bold">{character}</div>
                <div className="text-center font-bold">{partnerName}</div>
                
                <div className="font-bold">Today</div>
                <div className="text-center">{formatTime(myToday)}</div>
                <div className="text-center">{formatTime(partnerToday)}</div>
                
                <div className="font-bold">Yesterday</div>
                <div className="text-center">{formatTime(myYesterday)}</div>
                <div className="text-center">{formatTime(partnerYesterday)}</div>
            </div>
        </div>
    );
};

const GreetingNotification: React.FC<{ message: GreetingMessage; onDismiss: () => void; }> = ({ message, onDismiss }) => {
    useEffect(() => {
        const timer = setTimeout(onDismiss, 5000);
        return () => clearTimeout(timer);
    }, [onDismiss]);

    return (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#c69a6c] p-6 border-4 border-[#7a5a3b] shadow-lg z-50 animate-fade-in-out text-center">
            <p className="text-2xl text-white minecraft-text">
                {message.from} says: "{message.content}"
            </p>
        </div>
    );
};

// --- MAIN APP ---

const App: React.FC = () => {
    // STATE
    const [character, setCharacter] = useState<Character | null>(() => localStorage.getItem('polito-character') as Character | null);
    const [focusState, setFocusState] = useState<FocusState>(FocusState.Idle);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [sessionType, setSessionType] = useState<SessionType>(SessionType.None);
    const [rewards, setRewards] = useState<Reward[]>([]);
    const [greetingMessage, setGreetingMessage] = useState<GreetingMessage | null>(null);
    const [isMuted, setIsMuted] = useState(true);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showRewardModal, setShowRewardModal] = useState(false);
    
    // PARTNER STATE
    const [partnerFocusState, setPartnerFocusState] = useState<FocusState>(FocusState.Idle);
    const [partnerElapsedSeconds, setPartnerElapsedSeconds] = useState(0);
    
    // STATS STATE
    const [dailyStats, setDailyStats] = useState<Record<string, number>>({});
    const [partnerDailyStats, setPartnerDailyStats] = useState<Record<string, number>>({});


    // REFS
    const timerIntervalRef = useRef<number | null>(null);
    const backgroundAudioRef = useRef<HTMLAudioElement | null>(null);

    // DERIVED STATE
    const partner = useMemo(() => character ? CHARACTER_DATA[character].partner : null, [character]);
    const prevFocusState = usePrevious(focusState);

    // DATA MIGRATION EFFECT
    useEffect(() => {
        if (!character) return;
        const migrationKey = `migration_totalFocusTime_${character}`;
        const hasMigrated = localStorage.getItem(migrationKey);

        if (!hasMigrated) {
            const userRef = database.ref(`users/${character}`);
            userRef.once('value', (snapshot) => {
                const data = snapshot.val();
                if (data && data.totalFocusTime && typeof data.totalFocusTime === 'number' && data.totalFocusTime > 0) {
                    const yesterday = getCycleDateString(Date.now() - 24 * 60 * 60 * 1000);
                    
                    database.ref(`users/${character}/dailyStats/${yesterday}`).transaction((currentVal: number) => {
                        return (currentVal || 0) + data.totalFocusTime;
                    }).then(() => {
                        userRef.child('totalFocusTime').remove();
                        localStorage.setItem(migrationKey, 'true');
                        console.log("Migration successful: totalFocusTime moved to yesterday's stats.");
                    }).catch((error: Error) => {
                        console.error("Migration transaction failed: ", error);
                    });
                } else {
                     localStorage.setItem(migrationKey, 'true');
                }
            });
        }
    }, [character]);


    // FIREBASE LISTENERS
    useEffect(() => {
        if (!character || !partner) return;

        const userRef = database.ref(`users/${character}`);
        const partnerRef = database.ref(`users/${partner}`);

        const onUserChange = (snapshot: any) => {
            const data = snapshot.val();
            if (data) {
                setDailyStats(data.dailyStats || {});
            }
        };

        const onPartnerChange = (snapshot: any) => {
            const data = snapshot.val();
            if (data) {
                setPartnerFocusState(data.focusState || FocusState.Idle);
                setPartnerElapsedSeconds(data.elapsedSeconds || 0);
                setPartnerDailyStats(data.dailyStats || {});
            } else {
                setPartnerFocusState(FocusState.Idle);
                setPartnerElapsedSeconds(0);
                setPartnerDailyStats({});
            }
        };
        
        const onReward = (snapshot: any) => {
            const rewardData = snapshot.val();
            if (rewardData) {
                setRewards(prev => [...prev, rewardData]);
                snapshot.ref.remove();
            }
        };

        const onGreeting = (snapshot: any) => {
            const greetingData = snapshot.val();
            if (greetingData) {
                setGreetingMessage(greetingData);
                snapshot.ref.remove();
            }
        };

        userRef.on('value', onUserChange);
        partnerRef.on('value', onPartnerChange);
        userRef.child('rewards').on('child_added', onReward);
        userRef.child('greetings').on('child_added', onGreeting);

        return () => {
            userRef.off('value', onUserChange);
            partnerRef.off('value', onPartnerChange);
            userRef.child('rewards').off('child_added', onReward);
            userRef.child('greetings').off('child_added', onGreeting);
        };
    }, [character, partner]);

    // TIMER LOGIC
    useEffect(() => {
        if (focusState === FocusState.Focusing) {
            timerIntervalRef.current = window.setInterval(() => {
                setElapsedSeconds(prev => prev + 1);
            }, 1000);
        } else {
            if (timerIntervalRef.current) {
                clearInterval(timerIntervalRef.current);
                timerIntervalRef.current = null;
            }
        }
        return () => {
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        };
    }, [focusState]);

    // PUSH STATE TO FIREBASE
    useEffect(() => {
        if (!character) return;
        const userRef = database.ref(`users/${character}`);
        userRef.child('focusState').set(focusState);
        
        if (focusState === FocusState.Focusing && partnerFocusState === FocusState.Focusing) {
             setSessionType(SessionType.Joint);
        } else if (focusState === FocusState.Idle && partnerFocusState === FocusState.Idle) {
             setSessionType(SessionType.None);
        }
        
    }, [character, focusState, partnerFocusState]);
    
     useEffect(() => {
        if (!character) return;
        if (focusState !== FocusState.Focusing) return;

        const userRef = database.ref(`users/${character}`);
        userRef.child('elapsedSeconds').set(elapsedSeconds);

        if (elapsedSeconds > 0 && elapsedSeconds % 10 === 0) {
            const today = getCycleDateString(Date.now());
            userRef.child(`dailyStats/${today}`).transaction((currentVal: number) => {
                return (currentVal || 0) + 10;
            });
        }
     }, [character, elapsedSeconds, focusState]);

     // BACKGROUND AUDIO
    useEffect(() => {
        if (!backgroundAudioRef.current) {
            const audio = new Audio(AUDIO.BACKGROUND_MUSIC);
            audio.volume = 0.3;
            audio.loop = true;
            backgroundAudioRef.current = audio;
        }
        const audio = backgroundAudioRef.current;

        const playAudio = () => {
            if (audio && audio.paused) {
                const playPromise = audio.play();
                if (playPromise !== undefined) {
                    playPromise.catch(error => {
                        console.error("Audio playback was prevented:", error);
                    });
                }
            }
        };

        if (!isMuted) {
            playAudio();
        } else {
            audio.pause();
        }

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && !isMuted) {
                playAudio();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [isMuted]);

    // HANDLE STOP FOCUS LOGIC
    useEffect(() => {
        if (prevFocusState === FocusState.Focusing && focusState !== FocusState.Focusing) {
            if (elapsedSeconds >= 60) {
                setShowRewardModal(true);
            }
        }
    }, [focusState, prevFocusState, elapsedSeconds]);


    // HANDLERS
    const handleCharacterSelect = (selectedCharacter: Character) => {
        localStorage.setItem('polito-character', selectedCharacter);
        setCharacter(selectedCharacter);
        const partnerName = CHARACTER_DATA[selectedCharacter].partner;
        database.ref(`users/${partnerName}/greetings`).push({
            from: selectedCharacter,
            content: "I'm here! Let's focus!",
            type: 'GREETING',
        });
    };

    const handleStartFocus = () => {
        if (focusState === FocusState.Idle || focusState === FocusState.Paused) {
            setFocusState(FocusState.Focusing);
        }
    };

    const handlePauseFocus = () => {
        if (focusState === FocusState.Focusing) {
            setFocusState(FocusState.Paused);
        }
    };
    
    const updateStatsOnStop = useCallback(() => {
        if (!character || elapsedSeconds === 0) return;
        const remainder = elapsedSeconds % 10;
        if (remainder > 0) {
            const today = getCycleDateString(Date.now());
            database.ref(`users/${character}/dailyStats/${today}`).transaction((currentVal: number) => {
                return (currentVal || 0) + remainder;
            });
        }
    }, [character, elapsedSeconds]);

    const handleStopFocus = () => {
        updateStatsOnStop();
        setFocusState(FocusState.Idle);
        database.ref(`users/${character}/elapsedSeconds`).set(0);
        setElapsedSeconds(0);
    };

    const handleSendReward = (reward: Omit<Reward, 'from'>) => {
        if (character && partner) {
            database.ref(`users/${partner}/rewards`).push({
                ...reward,
                from: character
            });
        }
        setShowRewardModal(false);
    };

    const handleRewardModalSkip = () => {
        setShowRewardModal(false);
    };

    const handleAcknowledgeReward = (rewardToAck: Reward) => {
        setRewards(prev => prev.filter(r => r !== rewardToAck));
    };
    
    const handleDismissReward = (rewardToDismiss: Reward) => {
        setRewards(prev => prev.filter(r => r !== rewardToDismiss));
    };
    
    const handleRespondToReward = (response: Omit<Reward, 'from'>, originalReward: Reward) => {
        if (character && partner) {
             database.ref(`users/${partner}/rewards`).push({
                ...response,
                from: character,
            });
        }
       handleAcknowledgeReward(originalReward);
    };
    
    const handleGreetingDismiss = () => {
        setGreetingMessage(null);
    };

    const toggleMute = () => setIsMuted(prev => !prev);
    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
            setIsFullscreen(true);
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
                setIsFullscreen(false);
            }
        }
    };

    // RENDER LOGIC
    if (!character) {
        return <OnboardingScreen onSelect={handleCharacterSelect} />;
    }

    const partnerName = CHARACTER_DATA[character].partner;

    const getBackgroundImage = () => {
        const isFlynnFocusing = (character === Character.Flynn && focusState === FocusState.Focusing) || (partnerName === Character.Flynn && partnerFocusState === FocusState.Focusing);
        const isRapunzelFocusing = (character === Character.Rapunzel && focusState === FocusState.Focusing) || (partnerName === Character.Rapunzel && partnerFocusState === FocusState.Focusing);
        
        if(isFlynnFocusing && isRapunzelFocusing) return IMAGES.JOINT_FOCUS;
        if(isFlynnFocusing) return IMAGES.FLYNN_FOCUS_RAPUNZEL_IDLE;
        if(isRapunzelFocusing) return IMAGES.RAPUNZEL_FOCUS_FLYNN_IDLE;
        return IMAGES.IDLE;
    };

    return (
        <div className="relative w-full h-screen bg-cover bg-center" style={{ backgroundImage: `url(${getBackgroundImage()})` }}>
            <div className="absolute inset-0 bg-black bg-opacity-20" />

            <SoundToggleButton isMuted={isMuted} onToggle={toggleMute} />
            <FullscreenButton isFullscreen={isFullscreen} onToggle={toggleFullscreen} />
            
            <Timer elapsedSeconds={elapsedSeconds} />
            {partnerFocusState !== FocusState.Idle && (
                <PartnerTimer elapsedSeconds={partnerElapsedSeconds} partnerName={partnerName} />
            )}

            <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex gap-4">
                 {focusState === FocusState.Idle && <PixelButton onClick={handleStartFocus}>Start Focus</PixelButton>}
                 {focusState === FocusState.Focusing && (
                    <>
                        <PixelButton onClick={handlePauseFocus}>Pause</PixelButton>
                        <PixelButton onClick={handleStopFocus} variant="danger">Stop</PixelButton>
                    </>
                 )}
                 {focusState === FocusState.Paused && (
                    <>
                        <PixelButton onClick={handleStartFocus}>Resume</PixelButton>
                        <PixelButton onClick={handleStopFocus} variant="danger">Stop</PixelButton>
                    </>
                 )}
            </div>

            <PowerCoupleStats character={character} stats={dailyStats} partnerStats={partnerDailyStats} />

            {showRewardModal && (
                <RewardModal 
                    from={character}
                    onSend={handleSendReward} 
                    onSkip={handleRewardModalSkip} 
                />
            )}
            
            {rewards.map((reward, index) => (
                <RewardNotification 
                    key={index} 
                    reward={reward} 
                    onAcknowledge={() => handleAcknowledgeReward(reward)}
                    onDismiss={() => handleDismissReward(reward)}
                    onRespond={(response) => handleRespondToReward(response, reward)}
                />
            ))}

            {greetingMessage && <GreetingNotification message={greetingMessage} onDismiss={handleGreetingDismiss} />}
        </div>
    );
};

export default App;