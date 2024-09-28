import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { Logger } from '../../common/logger';
import { MathExtensions } from '../../common/math-extensions';
import { PromiseUtils } from '../../common/utils/promise-utils';
import { StringUtils } from '../../common/utils/string-utils';
import { AudioPlayerBase } from './audio-player.base';

@Injectable()
export class AudioPlayer implements AudioPlayerBase {
    private _audio: HTMLAudioElement;
    private _nextAudio: HTMLAudioElement | undefined = undefined;
    private _nextAudioPath: string = '';
    private _threshold: number = 200; // milliseconds before the end

    public constructor(
        private mathExtensions: MathExtensions,
        private logger: Logger,
    ) {
        this._audio = new Audio();

        try {
            // This fails during unit tests because setSinkId() does not exist on HTMLAudioElement
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call
            this.audio.setSinkId('default');
        } catch (e: unknown) {
            // Suppress this error, but log it, in case it happens in production.
            this.logger.error(e, 'Could not perform setSinkId()', 'AudioPlayer', 'constructor');
        }

        this._audio.defaultPlaybackRate = 1;
        this._audio.playbackRate = 1;
        this._audio.volume = 1;
        this._audio.muted = false;
    }

    private playbackFinished: Subject<void> = new Subject();
    public playbackFinished$: Observable<void> = this.playbackFinished.asObservable();

    public get audio(): HTMLAudioElement {
        return this._audio;
    }

    public get progressSeconds(): number {
        if (isNaN(this._audio.currentTime)) {
            return 0;
        }

        return this._audio.currentTime;
    }

    public get totalSeconds(): number {
        if (isNaN(this._audio.duration)) {
            return 0;
        }

        return this._audio.duration;
    }

    private crossFade(previousAudio: HTMLAudioElement, newAudio: HTMLAudioElement, duration: number): void {
        const volumeToRestore: number = previousAudio.volume;
        const interval = duration / 10; // Interval in milliseconds
        const steps = duration / interval;
        let currentStep = 0;

        newAudio.volume = 0;
        newAudio.play();

        const fadeInterval = setInterval(() => {
            currentStep++;
            previousAudio.volume = Math.max(0, volumeToRestore * Math.pow(0.1, currentStep / steps));
            newAudio.volume = Math.min(volumeToRestore, volumeToRestore * (1 - Math.pow(0.1, currentStep / steps)));

            if (currentStep >= steps) {
                clearInterval(fadeInterval);
                previousAudio.pause();
                previousAudio.volume = volumeToRestore; // Reset volume for future use
            }
        }, interval);
    }

    public play(audioFilePath: string): void {
        if (this._nextAudio !== undefined && this._nextAudioPath === audioFilePath) {
            const previousAudio: HTMLAudioElement = this._audio;
            this._audio = this._nextAudio;
            this._nextAudio = undefined;

            this.crossFade(previousAudio, this._audio, this._threshold);
        } else {
            this._audio.pause();
            const playableAudioFilePath: string = this.replaceUnplayableCharacters(audioFilePath);
            this._audio.src = 'file:///' + playableAudioFilePath;
            PromiseUtils.noAwait(this._audio.play());
        }

        this._audio.ontimeupdate = () => this.checkNearEnd();
    }

    public stop(): void {
        this._audio.currentTime = 0;
        this._audio.pause();
    }

    public pause(): void {
        this._audio.pause();
    }

    public resume(): void {
        PromiseUtils.noAwait(this._audio.play());
    }

    public setVolume(linearVolume: number): void {
        // log(0) is undefined. So we provide a minimum of 0.01.
        const logarithmicVolume: number = linearVolume > 0 ? this.mathExtensions.linearToLogarithmic(linearVolume, 0.01, 1) : 0;
        this._audio.volume = logarithmicVolume;
    }

    public mute(): void {
        this._audio.muted = true;
    }

    public unMute(): void {
        this._audio.muted = false;
    }

    public skipToSeconds(seconds: number): void {
        this._audio.currentTime = seconds;
    }

    private replaceUnplayableCharacters(audioFilePath: string): string {
        // HTMLAudioElement doesn't play paths which contain # and ?, so we escape them.
        let playableAudioFilePath: string = StringUtils.replaceAll(audioFilePath, '#', '%23');
        playableAudioFilePath = StringUtils.replaceAll(playableAudioFilePath, '?', '%3F');
        return playableAudioFilePath;
    }

    public preloadNextTrack(audioFilePath: string): void {
        this._nextAudioPath = audioFilePath;
        const playableAudioFilePath: string = this.replaceUnplayableCharacters(audioFilePath);
        this._nextAudio = new Audio('file:///' + playableAudioFilePath);
        this._nextAudio.preload = 'auto';
        this._nextAudio.volume = this._audio.volume;
        this._nextAudio.muted = this._audio.muted;
    }

    private checkNearEnd(): void {
        if (this._audio.duration - this._audio.currentTime <= this._threshold / 1000) {
            this.playbackFinished.next();
        }
    }
}
