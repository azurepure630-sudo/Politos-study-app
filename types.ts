
export enum Character {
  Flynn = 'Flynn',
  Rapunzel = 'Rapunzel',
}

export enum FocusState {
  Idle = 'IDLE',
  Focusing = 'FOCUSING',
  Paused = 'PAUSED',
}

export enum SessionType {
    None = 'NONE',
    Joint = 'JOINT',
}

export enum RewardType {
    Kisses = 'KISSES',
    Hugs = 'HUGS',
    Praise = 'PRAISE',
    Heart = 'HEART'
}

export type Reward = {
    type: RewardType;
    message?: string;
    audioBase64?: string;
    from: Character;
};

export type GreetingMessage = {
    from: Character;
    content: string;
    type: 'GREETING';
};