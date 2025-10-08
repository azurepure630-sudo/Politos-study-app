import React, { useState, useEffect, useRef } from 'react';
import { Character, FocusState, SessionType, RewardType, Reward } from './types';
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

const Timer: React.FC = () => {
    const [seconds, setSeconds] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setSeconds(s => s + 1);
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    const formatTime = () => {
        const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
        const secs = (seconds % 60).toString().padStart(2, '0');
        return `${mins}:${secs}`;
    };

    return <div className="absolute top-4 right-4 bg-black bg-opacity-50 text-white text-3xl p-4 border-4 border-gray-800">{formatTime()}</div>;
};

const PartnerTimer: React.FC<{ startTime: number; partnerName: string; }> = ({ startTime, partnerName }) => {
    const [elapsedSeconds, setElapsedSeconds] = useState(0);

    useEffect(() => {
        const updateTimer = () => {
            const now = Date.now();
            const elapsed = Math.floor((now - startTime) / 1000);
            setElapsedSeconds(elapsed > 0 ? elapsed : 0);
        };

        updateTimer();
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [startTime]);

    const formatTime = () => {
        const mins = Math.floor(elapsedSeconds / 60).toString().padStart(2, '0');
        const secs = (elapsedSeconds % 60).toString().padStart(2, '0');
        return `${mins}:${secs}`;
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
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
    const [error, setError] = useState<string | null>(null);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const timerIntervalRef = useRef<number | null>(null);
    const MAX_RECORDING_TIME_MS = 120 * 1000; // 2 minutes

    useEffect(() => {
        return () => {
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                mediaRecorderRef.current.stop();
            }
        };
    }, []);

    const startRecording = async () => {
        setError(null);
        setAudioBlob(null);
        onRecord(null);

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            setError("Audio recording is not supported by your browser.");
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            mediaRecorderRef.current = recorder;
            const chunks: Blob[] = [];

            recorder.ondataavailable = (e) => chunks.push(e.data);
            recorder.onstop = () => {
                const blob = new Blob(chunks, { type: 'audio/webm;codecs=opus' });
                setAudioBlob(blob);
                onRecord(blob);
                stream.getTracks().forEach(track => track.stop());
            };

            recorder.start();
            setIsRecording(true);
            setRecordingTime(0);

            timerIntervalRef.current = window.setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);

            setTimeout(() => {
                if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                    stopRecording();
                }
            }, MAX_RECORDING_TIME_MS);

        } catch (err) {
            console.error("Error starting recording:", err);
            setError("Microphone access was denied or not available.");
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        }
    };
    
    const handleReset = () => {
        setAudioBlob(null);
        onRecord(null);
        setRecordingTime(0);
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
        const secs = (seconds % 60).toString().padStart(2, '0');
        return `${mins}:${secs}`;
    };

    if (error) {
        return <p className="text-red-500 text-center text-lg py-2">{error}</p>;
    }
    
    if (isRecording) {
        return (
            <div className="flex items-center justify-center gap-4 my-2">
                <PixelButton onClick={stopRecording} variant="danger">
                    <span role="img" aria-label="stop">⏹️</span> Stop ({formatTime(recordingTime)})
                </PixelButton>
            </div>
        );
    }
    
    if (audioBlob) {
        const audioUrl = URL.createObjectURL(audioBlob);
        return (
            <div className="flex items-center justify-center gap-2 my-2">
                <AudioPlayer src={audioUrl} />
                <PixelButton onClick={handleReset} variant="secondary" className="!p-3 text-3xl">
                    🗑️
                </PixelButton>
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
  <div className="w-full min-h-screen flex flex-col justify-center items-center bg-[#f3e5ab] p-4">
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
    <div className="fixed top-5 left-1/2 z-50 bg-[#7a5a3b] text-white text-2xl px-6 py-3 border-4 border-[#4d3924] shadow-[6px_6px_0px_#383838] animate-fade-in-out">
        {partnerName} has joined you!
    </div>
);


const MainDisplay: React.FC<{
    user: Character,
    partner: Character,
    userFocus: FocusState,
    partnerFocus: FocusState,
    onStart: () => void,
    onJoin: () => void,
    onEnd: () => void,
    isMuted: boolean,
    onToggleMute: () => void,
    partnerStartTime: number | null,
}> = ({ user, partner, userFocus, partnerFocus, onStart, onJoin, onEnd, isMuted, onToggleMute, partnerStartTime }) => {

    let imageSrc = IMAGES.IDLE;
    let text = "Ready for today, Politos?";
    let controls = <PixelButton onClick={onStart}>START "STUDY"</PixelButton>;

    const isUserFocusing = userFocus === FocusState.Focusing;
    const isPartnerFocusing = partnerFocus === FocusState.Focusing;
    const isAnyoneFocusing = isUserFocusing || isPartnerFocusing;

    if (!isUserFocusing && !isPartnerFocusing) { // State A: Idle
        imageSrc = IMAGES.IDLE;
        text = "Ready for today, Politos?";
        controls = <PixelButton onClick={onStart}>START "STUDY"</PixelButton>;
    } else if (!isUserFocusing && isPartnerFocusing) { // State B: Partner Focusing
        imageSrc = user === Character.Flynn ? IMAGES.RAPUNZEL_FOCUS_FLYNN_IDLE : IMAGES.FLYNN_FOCUS_RAPUNZEL_IDLE;
        text = `Your polito is focussing.`;
        controls = <PixelButton onClick={onJoin}>JOIN THEIR SESSION</PixelButton>;
    } else if (isUserFocusing && !isPartnerFocusing) { // State C: I am Focusing
        imageSrc = user === Character.Flynn ? IMAGES.FLYNN_FOCUS_RAPUNZEL_IDLE : IMAGES.RAPUNZEL_FOCUS_FLYNN_IDLE;
        text = "Focus time. Your polito will join you.";
        controls = <PixelButton onClick={onEnd} variant="danger">END SESSION</PixelButton>;
    } else if (isUserFocusing && isPartnerFocusing) { // State D: Joint Session
        imageSrc = IMAGES.JOINT_FOCUS;
        text = "We politos are focussing.";
        controls = <PixelButton onClick={onEnd} variant="danger">END SESSION</PixelButton>;
    }
    
    const partnerDisplayName = partner === Character.Rapunzel ? 'Faryal 💛' : 'Asad 💛';
    
    return (
        <div className="relative w-full min-h-screen bg-[#61bfff]">
            <img src={imageSrc} alt="Scene" className="w-full h-auto block"/>

            <div className="absolute inset-0">
                <SoundToggleButton isMuted={isMuted} onToggle={onToggleMute} />
                
                {!isAnyoneFocusing && (
                  <>
                    <div key="heart1" className="absolute top-[48%] left-[51%] text-3xl animate-float-up" style={{ animationDelay: '0s' }}>❤️</div>
                    <div key="heart2" className="absolute top-[50%] left-[49%] text-3xl animate-float-up" style={{ animationDelay: '0.8s' }}>❤️</div>
                  </>
                )}
                {isAnyoneFocusing && (
                     <div className="absolute top-[42%] left-[50%] text-white text-3xl animate-sweat-drop" style={{ textShadow: '2px 2px #000a' }}>💧</div>
                )}
            
                {isUserFocusing && <Timer />}
                {isUserFocusing && isPartnerFocusing && partnerStartTime && <PartnerTimer startTime={partnerStartTime} partnerName={partnerDisplayName} />}
            
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
  const [partnerFocus, setPartnerFocus] = useState<FocusState>(FocusState.Idle);
  const [partnerFocusStartTime, setPartnerFocusStartTime] = useState<number | null>(null);
  const [sessionType, setSessionType] = useState<SessionType>(SessionType.None);
  const [showRewardModal, setShowRewardModal] = useState(false);
  const [receivedReward, setReceivedReward] = useState<Reward | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [showJoinNotification, setShowJoinNotification] = useState(false);

  const musicRef = useRef<HTMLAudioElement>(null);
  const prevPartnerFocus = usePrevious(partnerFocus);

  const partnerCharacter = userCharacter === Character.Flynn ? Character.Rapunzel : Character.Flynn;

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

    // --- PRESENCE SYSTEM ---
    const userStatusRef = database.ref(`users/${userCharacter}`);
    const partnerRef = database.ref(`users/${partnerCharacter}`);
    
    database.ref('.info/connected').on('value', (snapshot: any) => {
        // If we're not connected, don't do anything.
        if (snapshot.val() === false) {
            return;
        }
        
        // onDisconnect() sets a write to be performed when the client disconnects.
        userStatusRef.onDisconnect().update({
            isOnline: false,
            focusState: FocusState.Idle, // Also reset focus state
            focusStartTime: null,
        }).then(() => {
            // Once the onDisconnect() is established, set the user as online.
            userStatusRef.update({ isOnline: true });
        });
    });

    const onPartnerChange = (snapshot: any) => {
        const data = snapshot.val();
        // Partner is considered idle if their data node doesn't exist OR they are marked as offline.
        if (!data || !data.isOnline) {
            setPartnerFocus(FocusState.Idle);
            setPartnerFocusStartTime(null);
        } else {
            setPartnerFocus(data.focusState || FocusState.Idle);
            setPartnerFocusStartTime(data.focusStartTime || null);
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

    return () => {
        database.ref('.info/connected').off();
        partnerRef.off('value', onPartnerChange);
        userStatusRef.child('lastRewardReceived').off('value', onRewardReceived);
    };
  }, [userCharacter, partnerCharacter]);
  
  // --- JOIN NOTIFICATION LOGIC ---
  useEffect(() => {
      if (userFocus === FocusState.Focusing && partnerFocus === FocusState.Focusing && prevPartnerFocus === FocusState.Idle) {
          setShowJoinNotification(true);
          setTimeout(() => {
              setShowJoinNotification(false);
          }, 4000);
      }
  }, [userFocus, partnerFocus, prevPartnerFocus]);
  
  const updateUserFocusState = (newState: FocusState) => {
    setUserFocus(newState);
    if (userCharacter) {
        const focusData = {
            focusState: newState,
            focusStartTime: newState === FocusState.Focusing ? firebase.database.ServerValue.TIMESTAMP : null
        };
        database.ref(`users/${userCharacter}`).update(focusData);
    }
  };
  
  const handleCharacterSelect = (character: Character) => {
    database.ref(`users/${character}`).set({
        focusState: FocusState.Idle,
        lastRewardReceived: null,
        focusStartTime: null
    });
    setUserCharacter(character);
    setIsMuted(false); 
  };

  const handleStart = () => {
    updateUserFocusState(FocusState.Focusing);
  };

  const handleJoin = () => {
    updateUserFocusState(FocusState.Focusing);
    setSessionType(SessionType.Joint);
  };

  const handleEnd = () => {
    updateUserFocusState(FocusState.Idle);
    setSessionType(SessionType.None);
    setShowRewardModal(true);
  };
  
  const sendReward = (recipient: Character, reward: Omit<Reward, 'from'>) => {
      if (!userCharacter) return;
      const fullReward: Reward = { ...reward, from: userCharacter };
      database.ref(`users/${recipient}/lastRewardReceived`).set(fullReward);
  }

  const handleSendRewardFromModal = (reward: Omit<Reward, 'from'>) => {
    sendReward(partnerCharacter, reward);
    setShowRewardModal(false);
  };
  
  const handleRespondToReward = (reward: Omit<Reward, 'from'>) => {
      if (!receivedReward) return;
      sendReward(receivedReward.from, reward);
      setReceivedReward(null); // Dismiss notification after responding
  }

  const handleAcknowledgeReward = () => {
    if (!receivedReward || !userCharacter) return;
    sendReward(receivedReward.from, { type: RewardType.Heart });
    setReceivedReward(null);
  };

  const handleToggleMute = () => {
      setIsMuted(prev => !prev);
  }

  if (!userCharacter) {
    return <OnboardingScreen onSelect={handleCharacterSelect} />;
  }

  return (
    <div className="w-full min-h-screen bg-black">
      <audio ref={musicRef} src={AUDIO.BACKGROUND_MUSIC} loop />

      {showJoinNotification && <JoinNotification partnerName={partnerCharacter} />}
      {receivedReward && <RewardNotification 
            reward={receivedReward} 
            onDismiss={() => setReceivedReward(null)} 
            onAcknowledge={handleAcknowledgeReward}
            onRespond={handleRespondToReward} />}
      {showRewardModal && <RewardModal from={userCharacter} onSend={handleSendRewardFromModal} onSkip={() => setShowRewardModal(false)} />}

      <MainDisplay
        user={userCharacter}
        partner={partnerCharacter}
        userFocus={userFocus}
        partnerFocus={partnerFocus}
        onStart={handleStart}
        onJoin={handleJoin}
        onEnd={handleEnd}
        isMuted={isMuted}
        onToggleMute={handleToggleMute}
        partnerStartTime={partnerFocusStartTime}
      />
    </div>
  );
};

export default App;