import { Observable } from 'rxjs';

export interface IAudioPlayer {
    audio: HTMLAudioElement;
    playbackFinished$: Observable<void>;
    progressSeconds: number;
    totalSeconds: number;
    supportsGaplessPlayback: boolean;
    play(audioFilePath: string): void;
    stop(): void;
    pause(): void;
    resume(): void;
    setVolume(volume: number): void;
    mute(): void;
    unMute(): void;
    skipToSeconds(seconds: number): void;
}
