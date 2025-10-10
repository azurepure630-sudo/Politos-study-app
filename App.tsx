
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
    const date = new Date(timestamp);
    // The cycle starts at 1 AM UTC. So subtract 1 hour to align the date.
    date.setUTCHours(date.getUTCHours() - 1); 
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
            audioBase64 
        });
    }
  };

    const handleBackFromRespond = () => {
        if (responseType) {
            setResponseType(null);
            setResponseMessage('');
            setRecordedBlob(null);
        } else {
            setIsResponding(false);
        }
    };
    
    const renderResponseContent = () => {
        if (responseType === 'text') {
            return (
                 <div className="flex flex-col gap-4">
                    <textarea
                      className="w-full p-2 text-xl bg-[#d2b48c] text-black border-4 border-[#7a5a3b] focus:outline-none placeholder-gray-600"
                      placeholder="Thank you!"
                      value={responseMessage}
                      onChange={(e) => setResponseMessage(e.target.value)}
                      rows={3}
                    />
                    <PixelButton onClick={handleSendResponse}>Send Note</PixelButton>
                    <PixelButton onClick={handleBackFromRespond} variant="secondary">Back</PixelButton>
                </div>
            );
        }
        if (responseType === 'voice') {
            return (
                 <div className="flex flex-col gap-4">
                    <AudioRecorder onRecord={setRecordedBlob} />
                    <PixelButton onClick={handleSendResponse} disabled={!recordedBlob}>Send Voice Note</PixelButton>
                    <PixelButton onClick={handleBackFromRespond} variant="secondary">Back</PixelButton>
                </div>
            );
        }
        // Choose response type
        return (
            <div className="flex flex-col gap-4">
                <PixelButton onClick={() => setResponseType('text')}>📝 Write Response</PixelButton>
                <PixelButton onClick={() => setResponseType('voice')}>🎤 Record Response</PixelButton>
                <PixelButton onClick={handleBackFromRespond} variant="secondary">Back</PixelButton>
            </div>
        );
    };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 animate-fade-in p-4">
      <div className="bg-[#f3e5ab] p-8 border-8 border-[#a0522d] text-center w-[90%] max-w-lg">
        {!isResponding ? (
          <>
            {emojiToShow && (
              <div className="text-8xl mb-4 animate-bounce">
                {emojiToShow}
              </div>
            )}
            <h2 className="text-4xl md:text-5xl text-[#5c3c1a] minecraft-text mb-4">
              {reward.from} {getRewardMessage()}
            </h2>
            {reward.audioBase64 && <AudioPlayer src={reward.audioBase64} />}
            <div className="flex justify-center gap-4 mt-4">
               {reward.type === RewardType.Heart ? (
                    <PixelButton onClick={onDismiss}>Got it!</PixelButton>
                ) : (
                    <>
                        <PixelButton onClick={onAcknowledge} variant="secondary" className="text-4xl !p-3">💛</PixelButton>
                        <PixelButton onClick={() => setIsResponding(true)}>Respond</PixelButton>
                    </>
                )}
            </div>
          </>
        ) : (
          <div>
            <h3 className="text-3xl text-[#5c3c1a] minecraft-text mb-4">Respond to {reward.from}:</h3>
            {renderResponseContent()}
          </div>
        )}
      </div>
    </div>
  );
};

const JoinNotification: React.FC<{ partnerName: string }> = ({ partnerName }) => (
    <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-[#7a5a3b] text-white text-2xl px-6 py-3 border-4 border-[#4d3924] shadow-[6px_6px_0px_#383838] animate-fade-in-out">
        {partnerName} has joined you!
    </div>
);

const OfflinePresenceNotification: React.FC<{ partnerName: string }> = ({ partnerName }) => (
    <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-gray-500 text-white text-xl px-4 py-2 border-4 border-gray-700 shadow-[6px_6px_0px_#383838] animate-fade-in-out">
        {partnerName} is now offline.
    </div>
);

const OnlinePresenceNotification: React.FC<{
    partnerName: string;
    showSendHi: boolean;
    onSendHi: () => void;
    onClose: () => void;
}> = ({ partnerName, showSendHi, onSendHi, onClose }) => (
    <div
        className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white text-xl px-4 py-2 border-4 border-green-800 shadow-[6px_6px_0px_#383838] flex flex-col items-center gap-2 animate-fade-in-out"
        style={{ animationDuration: '15s' }}
    >
        <button
            onClick={onClose}
            className="absolute -top-2 -right-2 bg-red-600 border-2 border-red-800 text-white w-6 h-6 flex items-center justify-center text-lg font-bold hover:bg-red-700"
            aria-label="Close"
        >
           <span style={{transform: 'translateY(-1px)'}}>×</span>
        </button>
        <p>{partnerName} is now online!</p>
        {showSendHi && (
            <div className="text-center">
                <p className="text-sm">say hiiii to your polito</p>
                <PixelButton onClick={onSendHi} className="!text-lg !py-1 !px-3 !bg-yellow-500 !border-yellow-700 hover:!bg-yellow-600">
                    Hiii 👋
                </PixelButton>
            </div>
        )}
    </div>
);


const MessageNotification: React.FC<{ 
    message: GreetingMessage; 
    onDismiss: () => void;
    onReact: (rewardType: RewardType.Heart | RewardType.Kisses | RewardType.Hugs) => void; 
    onRespond: (reward: Omit<Reward, 'from'>) => void;
}> = ({ message, onDismiss, onReact, onRespond }) => {
    const [isResponding, setIsResponding] = useState(false);
    const [responseType, setResponseType] = useState<'text' | 'voice' | null>(null);
    const [responseMessage, setResponseMessage] = useState('');
    const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);

    const handleSendResponse = async () => {
        if (responseType === 'text' && responseMessage.trim()) {
            onRespond({ type: RewardType.Praise, message: responseMessage.trim() });
        } else if (responseType === 'voice' && recordedBlob) {
            const audioBase64 = await blobToBase64(recordedBlob);
            onRespond({ type: RewardType.Praise, audioBase64 });
        }
    };

    const handleBackFromRespond = () => {
        if (responseType) {
            setResponseType(null);
            setResponseMessage('');
            setRecordedBlob(null);
        } else {
            setIsResponding(false);
        }
    };

    const renderResponseContent = () => {
        if (responseType === 'text') {
            return (
                 <div className="flex flex-col gap-4">
                    <textarea
                        className="w-full p-2 text-xl bg-[#d2b48c] text-black border-4 border-[#7a5a3b] focus:outline-none placeholder-gray-600"
                        placeholder="Hiiii back!"
                        value={responseMessage}
                        onChange={(e) => setResponseMessage(e.target.value)}
                        rows={3}
                    />
                    <PixelButton onClick={handleSendResponse} disabled={!responseMessage.trim()}>Send Note</PixelButton>
                    <PixelButton onClick={handleBackFromRespond} variant="secondary">Back</PixelButton>
                </div>
            );
        }
        if (responseType === 'voice') {
            return (
                 <div className="flex flex-col gap-4">
                    <AudioRecorder onRecord={setRecordedBlob} />
                    <PixelButton onClick={handleSendResponse} disabled={!recordedBlob}>Send Voice Note</PixelButton>
                    <PixelButton onClick={handleBackFromRespond} variant="secondary">Back</PixelButton>
                </div>
            );
        }
        // Choose response type
        return (
            <div className="flex flex-col gap-4">
                <PixelButton onClick={() => setResponseType('text')}>📝 Write Response</PixelButton>
                <PixelButton onClick={() => setResponseType('voice')}>🎤 Record Response</PixelButton>
                <PixelButton onClick={handleBackFromRespond} variant="secondary">Back</PixelButton>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
            <div className="bg-[#f3e5ab] p-8 border-8 border-[#a0522d] text-center w-[90%] max-w-lg">
                {!isResponding ? (
                    <>
                        <h2 className="text-4xl md:text-5xl text-[#5c3c1a] minecraft-text mb-4">
                            Your polito says "{message.content}"
                        </h2>
                        <div className="flex flex-col sm:flex-row justify-center items-center gap-4 mt-4">
                            <div className="flex gap-2">
                                <PixelButton onClick={() => onReact(RewardType.Heart)} className="text-4xl !p-3">💛</PixelButton>
                                <PixelButton onClick={() => onReact(RewardType.Kisses)} className="text-4xl !p-3">💋</PixelButton>
                                <PixelButton onClick={() => onReact(RewardType.Hugs)} className="text-4xl !p-3">🤗</PixelButton>
                            </div>
                            <PixelButton onClick={() => setIsResponding(true)}>Respond</PixelButton>
                        </div>
                        <PixelButton onClick={onDismiss} variant="secondary" className="mt-4 !text-xl !py-2">Dismiss</PixelButton>
                    </>
                ) : (
                    <div>
                        <h3 className="text-3xl text-[#5c3c1a] minecraft-text mb-4">Respond to {message.from}:</h3>
                        {renderResponseContent()}
                    </div>
                )}
            </div>
        </div>
    );
};


const PowerCoupleStats: React.FC<{
    user: Character;
    partner: Character;
    userStats: { today: number; yesterday: number };
    partnerStats: { today: number; yesterday: number };
    jointTime: { today: number; yesterday: number };
}> = ({ user, partner, userStats, partnerStats, jointTime }) => {
    const [isOpen, setIsOpen] = useState(false);

    const formatTime = (totalSeconds: number) => {
        const seconds = Math.floor(totalSeconds);
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${hours}h ${minutes}m`;
    };

    return (
        <div className="absolute top-36 md:top-20 left-4 z-20">
            <PixelButton onClick={() => setIsOpen(!isOpen)} className="!py-2 !px-4 !text-xl">
                Power couple stats 🦋
            </PixelButton>
            {isOpen && (
                <div className="absolute top-full left-0 mt-2 w-72 bg-[#c69a6c] p-4 border-4 border-[#7a5a3b] text-white text-2xl shadow-[6px_6px_0px_#383838]">
                    <h3 className="text-3xl minecraft-text mb-2 text-center">Power Stats</h3>
                    <div className="space-y-3">
                        <div>
                            <p className="font-bold underline">{user}:</p>
                            <p className="pl-4">Today: {formatTime(userStats.today)}</p>
                            <p className="pl-4">Yesterday: {formatTime(userStats.yesterday)}</p>
                        </div>
                        <div>
                             <p className="font-bold underline">{partner}:</p>
                            <p className="pl-4">Today: {formatTime(partnerStats.today)}</p>
                            <p className="pl-4">Yesterday: {formatTime(partnerStats.yesterday)}</p>
                        </div>
                         <div>
                             <p className="font-bold underline">Together:</p>
                            <p className="pl-4">Today: {formatTime(jointTime.today)}</p>
                            <p className="pl-4">Yesterday: {formatTime(jointTime.yesterday)}</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};


const MainDisplay: React.FC<{
    user: Character;
    partner: Character;
    userFocus: FocusState;
    partnerFocus: FocusState;
    onStart: () => void;
    onJoin: () => void;
    onEnd: () => void;
    onPause: () => void;
    onResume: () => void;
    isMuted: boolean;
    onToggleMute: () => void;
    userElapsedSeconds: number;
    partnerElapsedSeconds: number;
    isUserInSession: boolean;
    isPartnerInSession: boolean;
    isFullscreen: boolean;
    onToggleFullscreen: () => void;
}> = ({
    user, partner, userFocus, partnerFocus, onStart, onJoin, onEnd, onPause, onResume,
    isMuted, onToggleMute, userElapsedSeconds, partnerElapsedSeconds,
    isUserInSession, isPartnerInSession, isFullscreen, onToggleFullscreen
}) => {
    let imageSrc = IMAGES.IDLE;
    let text = "Ready for today, Politos?";
    let controls: React.ReactNode = null;

    const isUserFocusing = userFocus === FocusState.Focusing;
    const isPartnerFocusing = partnerFocus === FocusState.Focusing;
    const isUserPaused = userFocus === FocusState.Paused;
    const isPartnerPaused = partnerFocus === FocusState.Paused;
    const isUserIdle = userFocus === FocusState.Idle;
    const isPartnerIdle = partnerFocus === FocusState.Idle;

    const isAnyoneFocusing = isUserFocusing || isPartnerFocusing;

    // Determine controls, text, and image based on state matrix
    if (isUserFocusing) {
        controls = (
            <div className="flex gap-4 justify-center">
                <PixelButton onClick={onPause}>PAUSE</PixelButton>
                <PixelButton onClick={onEnd} variant="danger">END SESSION</PixelButton>
            </div>
        );
        if (isPartnerFocusing) {
            imageSrc = IMAGES.JOINT_FOCUS;
            text = "We politos are focussing.";
        } else if (isPartnerPaused) {
            imageSrc = user === Character.Flynn ? IMAGES.FLYNN_FOCUS_RAPUNZEL_IDLE : IMAGES.RAPUNZEL_FOCUS_FLYNN_IDLE;
            text = "Focus time. Your polito is resting and will be right back";
        } else { // Partner is idle
            imageSrc = user === Character.Flynn ? IMAGES.FLYNN_FOCUS_RAPUNZEL_IDLE : IMAGES.RAPUNZEL_FOCUS_FLYNN_IDLE;
            text = "Focus time. Your polito will join you.";
        }
    } else if (isUserPaused) {
        controls = (
            <div className="flex gap-4 justify-center">
                <PixelButton onClick={onResume}>RESUME</PixelButton>
                <PixelButton onClick={onEnd} variant="danger">END SESSION</PixelButton>
            </div>
        );
        if (isPartnerFocusing) {
            imageSrc = user === Character.Flynn ? IMAGES.RAPUNZEL_FOCUS_FLYNN_IDLE : IMAGES.FLYNN_FOCUS_RAPUNZEL_IDLE;
            text = "Lil rests go a long way, but do return to your polito.";
        } else if (isPartnerPaused) {
            imageSrc = IMAGES.IDLE;
            text = "Rest politos, lil rests go a long way";
        } else { // Partner is idle
            imageSrc = IMAGES.IDLE;
            text = "You are on a break.";
        }
    } else if (isUserIdle) {
        if (isPartnerFocusing) {
            imageSrc = user === Character.Flynn ? IMAGES.RAPUNZEL_FOCUS_FLYNN_IDLE : IMAGES.FLYNN_FOCUS_RAPUNZEL_IDLE;
            text = "Your polito is focussing.";
            controls = <PixelButton onClick={onJoin}>JOIN THEIR SESSION</PixelButton>;
        } else if (isPartnerPaused) {
            imageSrc = user === Character.Flynn ? IMAGES.RAPUNZEL_FOCUS_FLYNN_IDLE : IMAGES.FLYNN_FOCUS_RAPUNZEL_IDLE;
            text = "Your polito is on a well deserved rest.";
            controls = <PixelButton onClick={onJoin}>JOIN THEIR SESSION</PixelButton>;
        } else { // Partner is idle
            imageSrc = IMAGES.IDLE;
            text = "Ready for today, Politos?";
            controls = <PixelButton onClick={onStart}>START "STUDY"</PixelButton>;
        }
    }

    const partnerDisplayName = partner === Character.Rapunzel ? 'Faryal 💛' : 'Asad 💛';
    
    return (
        <div className="relative w-full h-full md:h-auto">
            <img src={imageSrc} alt="Scene" className="w-full h-full object-cover md:h-auto block"/>

            <div className="absolute inset-0">
                <SoundToggleButton isMuted={isMuted} onToggle={onToggleMute} />
                <FullscreenButton isFullscreen={isFullscreen} onToggle={onToggleFullscreen} />
                
                {isUserIdle && isPartnerIdle && (
                  <>
                    <div key="heart1" className="absolute top-[48%] left-[51%] text-3xl animate-float-up" style={{ animationDelay: '0s' }}>❤️</div>
                    <div key="heart2" className="absolute top-[50%] left-[49%] text-3xl animate-float-up" style={{ animationDelay: '0.8s' }}>❤️</div>
                  </>
                )}
                
                {isAnyoneFocusing && (
                    <div className="absolute top-[42%] left-1/2 -translate-x-1/2 flex items-center justify-center gap-4">
                        <div className="relative text-5xl" style={{ animation: `brain-pulse 2s infinite ease-in-out` }}>
                            🧠
                            <span className="absolute -top-2 -right-2 text-3xl" style={{ animation: `spark-fade 1.5s infinite linear`, animationDelay: '0.2s' }}>⚡</span>
                        </div>
                        {isUserFocusing && isPartnerFocusing && (
                            <>
                                <div className="text-4xl text-yellow-300" style={{ textShadow: '2px 2px #000a' }}>💛</div>
                                <div className="relative text-5xl" style={{ animation: `brain-pulse 2s infinite ease-in-out`, animationDelay: '1s' }}>
                                    🧠
                                    <span className="absolute -top-2 -right-2 text-3xl" style={{ animation: `spark-fade 1.5s infinite linear`, animationDelay: '0.7s' }}>⚡</span>
                                </div>
                            </>
                        )}
                    </div>
                )}
            
                {isUserInSession && <Timer elapsedSeconds={userElapsedSeconds} />}
                {isUserInSession && isPartnerInSession && <PartnerTimer elapsedSeconds={partnerElapsedSeconds} partnerName={partnerDisplayName} />}
            
                <div className="absolute bottom-0 w-full z-10 flex flex-col items-center p-8 pb-12 gap-6">
                    <h2 className="text-4xl md:text-5xl text-white minecraft-text text-center px-4 py-2 bg-black bg-opacity-40">{text}</h2>
                    <div className="min-w-[300px] text-center">{controls}</div>
                </div>
            </div>
        </div>
    );
};

// --- MAIN APP COMPONENT ---

const App: React.FC = () => {
  const [userCharacter, setUserCharacter] = useState<Character | null>(null);
  const [userFocus, setUserFocus] = useState<FocusState>(FocusState.Idle);
  const [userFocusStartTime, setUserFocusStartTime] = useState<number | null>(null);
  const [userTotalPausedTime, setUserTotalPausedTime] = useState<number | null>(null);
  const [userLastPauseStartTime, setUserLastPauseStartTime] = useState<number | null>(null);
  const [partnerFocus, setPartnerFocus] = useState<FocusState>(FocusState.Idle);
  const [partnerFocusStartTime, setPartnerFocusStartTime] = useState<number | null>(null);
  const [partnerTotalPausedTime, setPartnerTotalPausedTime] = useState<number | null>(null);
  const [partnerLastPauseStartTime, setPartnerLastPauseStartTime] = useState<number | null>(null);
  
  const [userTodayTime, setUserTodayTime] = useState(0);
  const [userYesterdayTime, setUserYesterdayTime] = useState(0);
  const [partnerTodayTime, setPartnerTodayTime] = useState(0);
  const [partnerYesterdayTime, setPartnerYesterdayTime] = useState(0);
  const [jointTodayTime, setJointTodayTime] = useState(0);
  const [jointYesterdayTime, setJointYesterdayTime] = useState(0);

  const [sessionType, setSessionType] = useState<SessionType>(SessionType.None);
  const [showRewardModal, setShowRewardModal] = useState(false);
  const [receivedReward, setReceivedReward] = useState<Reward | null>(null);
  const [receivedMessage, setReceivedMessage] = useState<GreetingMessage | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [showJoinNotification, setShowJoinNotification] = useState(false);
  const [showOfflineNotification, setShowOfflineNotification] = useState(false);
  const [showOnlineNotification, setShowOnlineNotification] = useState(false);
  const [hiSent, setHiSent] = useState(false);
  const [isPartnerOnline, setIsPartnerOnline] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [userElapsedSeconds, setUserElapsedSeconds] = useState(0);
  const [partnerElapsedSeconds, setPartnerElapsedSeconds] = useState(0);


  const musicRef = useRef<HTMLAudioElement>(null);
  const silentAudioRef = useRef<HTMLAudioElement>(null);
  const onlineNotificationTimerRef = useRef<number | null>(null);
  const desiredOrientationRef = useRef<string | null>(null);
  const prevPartnerFocus = usePrevious(partnerFocus);
  const prevIsPartnerOnline = usePrevious(isPartnerOnline);

  const partnerCharacter = userCharacter === Character.Flynn ? Character.Rapunzel : Character.Flynn;
  
  const handleEnd = useCallback(async () => {
    if (!userCharacter) return;
    const now = Date.now();
    
    const userRef = database.ref(`users/${userCharacter}`);
    const partnerRef = database.ref(`users/${partnerCharacter}`);

    const [userSnapshot, partnerSnapshot] = await Promise.all([userRef.once('value'), partnerRef.once('value')]);
    
    const userData = userSnapshot.val();
    const partnerData = partnerSnapshot.val();

    if (!userData || !partnerData) return;
    
    if ((userData.focusState !== FocusState.Focusing && userData.focusState !== FocusState.Paused) || !userData.focusStartTime) {
        return; 
    }
    
    let finalTotalPausedTime = userData.totalPausedTime || 0;
    if (userData.focusState === FocusState.Paused && userData.lastPauseStartTime) {
        finalTotalPausedTime += (now - userData.lastPauseStartTime);
    }
    const sessionDurationMs = (now - userData.focusStartTime) - finalTotalPausedTime;
    const sessionDurationSec = sessionDurationMs > 0 ? Math.floor(sessionDurationMs / 1000) : 0;

    const todayDateString = getCycleDateString(now);
    const updates: { [key: string]: any } = {};

    if (sessionDurationSec > 0) {
        updates[`/dailyStats/${todayDateString}/${userCharacter}/totalFocusTime`] = firebase.database.ServerValue.increment(sessionDurationSec);
    }
    
    if ((partnerData.focusState === FocusState.Focusing || partnerData.focusState === FocusState.Paused) && partnerData.focusStartTime) {
        let partnerFinalTotalPaused = partnerData.totalPausedTime || 0;
        if (partnerData.focusState === FocusState.Paused && partnerData.lastPauseStartTime) {
            partnerFinalTotalPaused += (now - partnerData.lastPauseStartTime);
        }
        
        const userEffectiveStart = userData.focusStartTime + finalTotalPausedTime;
        const partnerEffectiveStart = partnerData.focusStartTime + partnerFinalTotalPaused;
        const effectiveJointStartTime = Math.max(userEffectiveStart, partnerEffectiveStart);
        const jointDurationMs = now - effectiveJointStartTime;
        const jointDurationSec = jointDurationMs > 0 ? Math.floor(jointDurationMs / 1000) : 0;

        if (jointDurationSec > 0) {
            updates[`/dailyStats/${todayDateString}/joint/totalFocusTime`] = firebase.database.ServerValue.increment(jointDurationSec);
        }
    }
    
    updates[`/users/${userCharacter}/focusState`] = FocusState.Idle;
    updates[`/users/${userCharacter}/focusStartTime`] = null;
    updates[`/users/${userCharacter}/totalPausedTime`] = null;
    updates[`/users/${userCharacter}/lastPauseStartTime`] = null;

    await database.ref().update(updates);

    silentAudioRef.current?.pause();

    setSessionType(SessionType.None);
    setShowRewardModal(true);
  }, [userCharacter, partnerCharacter]);
  
    // --- FULLSCREEN HANDLING ---
    const toggleFullscreen = useCallback(async () => {
        const doc = document as any;
        const docEl = document.documentElement as any;

        const requestFullscreen = docEl.requestFullscreen || docEl.mozRequestFullScreen || docEl.webkitRequestFullscreen || docEl.msRequestFullscreen;
        const exitFullscreen = doc.exitFullscreen || doc.mozCancelFullScreen || doc.webkitExitFullscreen || doc.msExitFullscreen;
        const fullscreenElement = doc.fullscreenElement || doc.mozFullScreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement;

        try {
            if (!fullscreenElement) {
                if (requestFullscreen) {
                    // Determine and store the desired orientation BEFORE requesting fullscreen.
                    const isPortrait = window.innerHeight > window.innerWidth;
                    desiredOrientationRef.current = isPortrait ? 'portrait' : 'landscape';
                    await requestFullscreen.call(docEl);
                }
            } else {
                if (exitFullscreen) {
                    await exitFullscreen.call(doc);
                }
            }
        } catch (err: any) {
            console.error(`Error with fullscreen request/exit: ${err.message} (${err.name})`);
            // Clear desired orientation on error to prevent inconsistent state
            desiredOrientationRef.current = null;
        }
    }, []);

    useEffect(() => {
        const onFullscreenChange = async () => {
            const doc = document as any;
            const fullscreenElement = doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement;
            
            setIsFullscreen(!!fullscreenElement);

            if (fullscreenElement) {
                // We have ENTERED fullscreen. Now, try to lock orientation.
                if (desiredOrientationRef.current) {
                    try {
                        if (screen.orientation && typeof (screen.orientation as any).lock === 'function') {
                            // FIX: The type `OrientationLockType` is not available in all TypeScript DOM library versions.
                            // The type assertion has been removed as `desiredOrientationRef.current` already holds a valid string 
                            // ('portrait' or 'landscape') for the `lock` method.
                            await (screen.orientation as any).lock(desiredOrientationRef.current);
                        }
                    } catch (err) {
                        console.error('Could not lock orientation:', err);
                    }
                }
            } else {
                // We have EXITED fullscreen. Unlock orientation and clear our ref.
                try {
                    if (screen.orientation && typeof (screen.orientation as any).unlock === 'function') {
                        (screen.orientation as any).unlock();
                    }
                } catch (err) {
                    console.error('Could not unlock orientation:', err);
                }
                desiredOrientationRef.current = null;
            }
        };

        document.addEventListener('fullscreenchange', onFullscreenChange);
        document.addEventListener('webkitfullscreenchange', onFullscreenChange);
        document.addEventListener('mozfullscreenchange', onFullscreenChange);
        document.addEventListener('MSFullscreenChange', onFullscreenChange);

        return () => {
            document.removeEventListener('fullscreenchange', onFullscreenChange);
            document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
            document.removeEventListener('mozfullscreenchange', onFullscreenChange);
            document.removeEventListener('MSFullscreenChange', onFullscreenChange);
        };
    }, []);

  // --- AUDIO HANDLING ---
  useEffect(() => {
    const musicEl = musicRef.current;
    
    if (musicEl) musicEl.volume = 0.3;

    if (isMuted) {
        musicEl?.pause();
    } else {
        musicEl?.play().catch(e => console.error("Music play failed", e));
    }
  }, [isMuted]);

  // --- FIREBASE REAL-TIME LOGIC ---
  useEffect(() => {
    if (!userCharacter) return;

    const userStatusRef = database.ref(`users/${userCharacter}`);

    // Check for dangling session on load
    userStatusRef.once('value', (snapshot: any) => {
        const data = snapshot.val();
        if (data && (data.focusState === FocusState.Focusing || data.focusState === FocusState.Paused) && data.focusStartTime) {
            console.log("Dangling focus session detected. Ending it now.");
            handleEnd();
        }
    });

    const partnerRef = database.ref(`users/${partnerCharacter}`);
    
    database.ref('.info/connected').on('value', (snapshot: any) => {
        if (snapshot.val() === false) return;
        
        userStatusRef.onDisconnect().update({
            isOnline: false,
            focusState: FocusState.Idle,
            focusStartTime: null,
            totalPausedTime: null,
            lastPauseStartTime: null,
        }).then(() => {
            userStatusRef.update({ isOnline: true });
        });
    });

    const onUserChange = (snapshot: any) => {
        const data = snapshot.val();
        if (data) {
            setUserFocus(data.focusState || FocusState.Idle);
            setUserFocusStartTime(data.focusStartTime || null);
            setUserTotalPausedTime(data.totalPausedTime || null);
            setUserLastPauseStartTime(data.lastPauseStartTime || null);
        }
    };
    userStatusRef.on('value', onUserChange);

    const onPartnerChange = (snapshot: any) => {
        const data = snapshot.val();
        const partnerIsCurrentlyOnline = !!(data && data.isOnline);
        setIsPartnerOnline(partnerIsCurrentlyOnline);

        if (!partnerIsCurrentlyOnline) {
            setPartnerFocus(FocusState.Idle);
            setPartnerFocusStartTime(null);
            setPartnerTotalPausedTime(null);
            setPartnerLastPauseStartTime(null);
        } else {
            setPartnerFocus(data.focusState || FocusState.Idle);
            setPartnerFocusStartTime(data.focusStartTime || null);
            setPartnerTotalPausedTime(data.totalPausedTime || null);
            setPartnerLastPauseStartTime(data.lastPauseStartTime || null);
        }
    };
    partnerRef.on('value', onPartnerChange);
    
    const onRewardReceived = (snapshot: any) => {
        const reward = snapshot.val();
        if(reward) {
            setReceivedReward(reward);
            userStatusRef.child('lastRewardReceived').set(null);
        }
    };
    userStatusRef.child('lastRewardReceived').on('value', onRewardReceived);

    const onMessageReceived = (snapshot: any) => {
        const message = snapshot.val();
        if(message) {
            setReceivedMessage(message);
            userStatusRef.child('lastMessageReceived').set(null);
        }
    };
    userStatusRef.child('lastMessageReceived').on('value', onMessageReceived);

    // --- DAILY STATS LISTENERS ---
    const today = getCycleDateString(Date.now());
    const yesterday = getCycleDateString(Date.now() - 24 * 60 * 60 * 1000);

    const refs = {
        userToday: database.ref(`dailyStats/${today}/${userCharacter}/totalFocusTime`),
        userYesterday: database.ref(`dailyStats/${yesterday}/${userCharacter}/totalFocusTime`),
        partnerToday: database.ref(`dailyStats/${today}/${partnerCharacter}/totalFocusTime`),
        partnerYesterday: database.ref(`dailyStats/${yesterday}/${partnerCharacter}/totalFocusTime`),
        jointToday: database.ref(`dailyStats/${today}/joint/totalFocusTime`),
        jointYesterday: database.ref(`dailyStats/${yesterday}/joint/totalFocusTime`),
    };

    const listeners = {
        userToday: (snap: any) => setUserTodayTime(snap.val() || 0),
        userYesterday: (snap: any) => setUserYesterdayTime(snap.val() || 0),
        partnerToday: (snap: any) => setPartnerTodayTime(snap.val() || 0),
        partnerYesterday: (snap: any) => setPartnerYesterdayTime(snap.val() || 0),
        jointToday: (snap: any) => setJointTodayTime(snap.val() || 0),
        jointYesterday: (snap: any) => setJointYesterdayTime(snap.val() || 0),
    };
    
    (Object.keys(refs) as Array<keyof typeof refs>).forEach(key => {
        refs[key].on('value', listeners[key]);
    });


    return () => {
        database.ref('.info/connected').off();
        userStatusRef.off('value', onUserChange);
        partnerRef.off('value', onPartnerChange);
        userStatusRef.child('lastRewardReceived').off('value', onRewardReceived);
        userStatusRef.child('lastMessageReceived').off('value', onMessageReceived);
        (Object.keys(refs) as Array<keyof typeof refs>).forEach(key => {
            refs[key].off('value', listeners[key]);
        });
    };
  }, [userCharacter, partnerCharacter, handleEnd]);
  
  // --- TIMER CALCULATION LOGIC ---
  useEffect(() => {
    const calculateElapsed = (
      focus: FocusState, 
      startTime: number | null, 
      totalPaused: number | null, 
      lastPauseStart: number | null
    ) => {
      if (!startTime) return 0;
      const now = Date.now();
      let currentTotalPaused = totalPaused || 0;
      if (focus === FocusState.Paused && lastPauseStart) {
        currentTotalPaused += now - lastPauseStart;
      }
      const elapsed = now - startTime - currentTotalPaused;
      return Math.floor(elapsed / 1000);
    };

    const interval = setInterval(() => {
      const userSeconds = calculateElapsed(userFocus, userFocusStartTime, userTotalPausedTime, userLastPauseStartTime);
      setUserElapsedSeconds(userSeconds > 0 ? userSeconds : 0);
      
      const partnerSeconds = calculateElapsed(partnerFocus, partnerFocusStartTime, partnerTotalPausedTime, partnerLastPauseStartTime);
      setPartnerElapsedSeconds(partnerSeconds > 0 ? partnerSeconds : 0);
    }, 1000);

    return () => clearInterval(interval);

  }, [
    userFocus, userFocusStartTime, userTotalPausedTime, userLastPauseStartTime,
    partnerFocus, partnerFocusStartTime, partnerTotalPausedTime, partnerLastPauseStartTime
  ]);

  // --- JOIN NOTIFICATION LOGIC ---
  useEffect(() => {
      if (userFocus === FocusState.Focusing && partnerFocus === FocusState.Focusing && prevPartnerFocus !== FocusState.Focusing) {
          setShowJoinNotification(true);
          setTimeout(() => {
              setShowJoinNotification(false);
          }, 4000);
      }
  }, [userFocus, partnerFocus, prevPartnerFocus]);

  // --- ONLINE NOTIFICATION LOGIC ---
  useEffect(() => {
    if ((partnerFocus === FocusState.Focusing && prevPartnerFocus === FocusState.Idle) || !isPartnerOnline) {
        if (onlineNotificationTimerRef.current) {
            clearTimeout(onlineNotificationTimerRef.current);
            onlineNotificationTimerRef.current = null;
        }
        setShowOnlineNotification(false);
        setHiSent(false);
    } else if (isPartnerOnline && !prevIsPartnerOnline && partnerFocus === FocusState.Idle) {
        setShowOnlineNotification(true);
        if (onlineNotificationTimerRef.current) {
            clearTimeout(onlineNotificationTimerRef.current);
        }
        onlineNotificationTimerRef.current = window.setTimeout(() => {
            setShowOnlineNotification(false);
        }, 15000);
    }
  }, [isPartnerOnline, prevIsPartnerOnline, partnerFocus, prevPartnerFocus]);
  
  // --- OFFLINE NOTIFICATION LOGIC ---
  useEffect(() => {
    if (!isPartnerOnline && prevIsPartnerOnline) {
      setShowOfflineNotification(true);
      const timer = setTimeout(() => {
        setShowOfflineNotification(false);
      }, 4000); // Duration of the fade-in-out animation
      return () => clearTimeout(timer);
    }
  }, [isPartnerOnline, prevIsPartnerOnline]);

  const handleCharacterSelect = (character: Character) => {
    try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        const audioContext = new AudioContext();
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
    } catch (e) {
        console.error("Could not initialize AudioContext", e);
    }

    database.ref(`users/${character}`).update({
        focusState: FocusState.Idle,
        focusStartTime: null,
        isOnline: true,
    });
    setUserCharacter(character);
    setIsMuted(false); 
  };
  
  const startFocusing = () => {
    if (userCharacter) {
      database.ref(`users/${userCharacter}`).update({
        focusState: FocusState.Focusing,
        focusStartTime: firebase.database.ServerValue.TIMESTAMP,
        totalPausedTime: 0,
        lastPauseStartTime: null,
      });
      silentAudioRef.current?.play().catch(e => console.error("Silent audio could not be played", e));
    }
  };

  const handleStart = () => startFocusing();
  const handleJoin = () => startFocusing();

  const handlePause = () => {
    if (userCharacter) {
      database.ref(`users/${userCharacter}`).update({
        focusState: FocusState.Paused,
        lastPauseStartTime: firebase.database.ServerValue.TIMESTAMP,
      });
      silentAudioRef.current?.pause();
    }
  };

  const handleResume = async () => {
    if (!userCharacter) return;
    const userRef = database.ref(`users/${userCharacter}`);
    const snapshot = await userRef.once('value');
    const data = snapshot.val();

    if (data && data.focusState === FocusState.Paused && data.lastPauseStartTime) {
        const pausedDuration = Date.now() - data.lastPauseStartTime;
        const newTotalPausedTime = (data.totalPausedTime || 0) + pausedDuration;

        await userRef.update({
            focusState: FocusState.Focusing,
            totalPausedTime: newTotalPausedTime,
            lastPauseStartTime: null
        });
        silentAudioRef.current?.play().catch(e => console.error("Silent audio could not be played", e));
    }
  };

  
  const sendReward = (recipient: Character, reward: Omit<Reward, 'from'>) => {
      if (!userCharacter) return;
      const fullReward: Reward = { ...reward, from: userCharacter };
      database.ref(`users/${recipient}/lastRewardReceived`).set(fullReward)
        .catch((error: Error) => {
            console.error("Firebase write error:", error);
            alert(`Failed to send reward: ${error.message}`);
        });
  }

  const handleSendRewardFromModal = (reward: Omit<Reward, 'from'>) => {
    sendReward(partnerCharacter, reward);
    setShowRewardModal(false);
  };
  
  const handleRespondToReward = (reward: Omit<Reward, 'from'>) => {
      if (!receivedReward) return;
      sendReward(receivedReward.from, reward);
      setReceivedReward(null);
  }

  const handleAcknowledgeReward = () => {
    if (!receivedReward || !userCharacter) return;
    sendReward(receivedReward.from, { type: RewardType.Heart });
    setReceivedReward(null);
  };

  const handleSendHi = () => {
    if (!userCharacter) return;
    const message: GreetingMessage = { from: userCharacter, content: "hiiii", type: "GREETING" };
    database.ref(`users/${partnerCharacter}/lastMessageReceived`).set(message);
    setHiSent(true);
  };

  const handleReactToMessage = (rewardType: RewardType.Heart | RewardType.Kisses | RewardType.Hugs) => {
    if (!receivedMessage || !userCharacter) return;
    sendReward(receivedMessage.from, { type: rewardType });
    setReceivedMessage(null);
  };

  const handleRespondToMessage = (reward: Omit<Reward, 'from'>) => {
      if (!receivedMessage) return;
      sendReward(receivedMessage.from, reward);
      setReceivedMessage(null);
  };

  const handleToggleMute = () => {
      setIsMuted(prev => !prev);
  }
  
  const handleCloseOnlineNotification = () => {
      if (onlineNotificationTimerRef.current) {
          clearTimeout(onlineNotificationTimerRef.current);
          onlineNotificationTimerRef.current = null;
      }
      setShowOnlineNotification(false);
  };

  if (!userCharacter) {
    return <OnboardingScreen onSelect={handleCharacterSelect} />;
  }
  
  const isUserInSession = userFocus === FocusState.Focusing || userFocus === FocusState.Paused;
  const isPartnerInSession = partnerFocus === FocusState.Focusing || partnerFocus === FocusState.Paused;

  return (
    <div className="w-full h-screen md:h-auto md:min-h-screen bg-[#61bfff]">
      <audio ref={musicRef} src={AUDIO.BACKGROUND_MUSIC} loop />
      <audio ref={silentAudioRef} src="data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABgAAABkYXRhAAAAAA==" loop />

      {showOnlineNotification && <OnlinePresenceNotification 
        partnerName={partnerCharacter} 
        showSendHi={userFocus === FocusState.Focusing && !hiSent}
        onSendHi={handleSendHi}
        onClose={handleCloseOnlineNotification}
      />}
      {showOfflineNotification && <OfflinePresenceNotification partnerName={partnerCharacter} />}
      {showJoinNotification && <JoinNotification partnerName={partnerCharacter} />}
      {receivedReward && <RewardNotification 
            reward={receivedReward} 
            onDismiss={() => setReceivedReward(null)} 
            onAcknowledge={handleAcknowledgeReward}
            onRespond={handleRespondToReward} />}
      {receivedMessage && <MessageNotification 
            message={receivedMessage}
            onDismiss={() => setReceivedMessage(null)}
            onReact={handleReactToMessage}
            onRespond={handleRespondToMessage}
      />}
      {showRewardModal && <RewardModal from={userCharacter} onSend={handleSendRewardFromModal} onSkip={() => setShowRewardModal(false)} />}

      <MainDisplay
        user={userCharacter}
        partner={partnerCharacter}
        userFocus={userFocus}
        partnerFocus={partnerFocus}
        onStart={handleStart}
        onJoin={handleJoin}
        onEnd={handleEnd}
        onPause={handlePause}
        onResume={handleResume}
        isMuted={isMuted}
        onToggleMute={handleToggleMute}
        userElapsedSeconds={userElapsedSeconds}
        partnerElapsedSeconds={partnerElapsedSeconds}
        isUserInSession={isUserInSession}
        isPartnerInSession={isPartnerInSession}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
      />
      
      <PowerCoupleStats 
        user={userCharacter}
        partner={partnerCharacter}
        userStats={{ today: userTodayTime, yesterday: userYesterdayTime }}
        partnerStats={{ today: partnerTodayTime, yesterday: partnerYesterdayTime }}
        jointTime={{ today: jointTodayTime, yesterday: jointYesterdayTime }}
      />
    </div>
  );
};

export default App;