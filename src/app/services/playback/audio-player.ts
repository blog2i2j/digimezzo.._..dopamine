import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { Logger } from '../../common/logger';
import { MathExtensions } from '../../common/math-extensions';
import { StringUtils } from '../../common/utils/string-utils';
import { AudioPlayerBase } from './audio-player.base';
import { SettingsBase } from '../../common/settings/settings.base';

@Injectable()
export class AudioPlayer implements AudioPlayerBase {
    private _audio: HTMLAudioElement;
    private _preloadAudio: HTMLAudioElement | undefined;
    private _audioContext: AudioContext;
    private _buffer: AudioBuffer | undefined = undefined;
    private _sourceNode: AudioBufferSourceNode | undefined = undefined;
    private readonly _gainNode: GainNode;
    private _webAudioStartTime: number = 0;
    private _webAudioPausedAt: number = 0;
    private readonly _analyser: AnalyserNode;
    private readonly _enableGaplessPlayback: boolean = true;
    private _isPaused: boolean;
    private _currentPlayableAudioFilePath: string = '';
    private _gainNodeVolumeBeforeMute: number = 0;
    private _keepHtml5AudioMuted: boolean = false;
    private _isPlayingOnWebAudio: boolean = false;
    private _nextAudioPath: string = '';

    public constructor(
        private mathExtensions: MathExtensions,
        private settings: SettingsBase,
        private logger: Logger,
    ) {
        this._enableGaplessPlayback = this.settings.enableGaplessPlayback;
        this._audio = new Audio();
        this._audioContext = new AudioContext();
        this._gainNode = this._audioContext.createGain();
        this._gainNode.connect(this._audioContext.destination);

        this._analyser = this._audioContext.createAnalyser();
        this._analyser.fftSize = 128;

        if (!this._enableGaplessPlayback) {
            const mediaElementSource: MediaElementAudioSourceNode = this._audioContext.createMediaElementSource(this._audio);
            this._analyser.connect(this._audioContext.destination);
            mediaElementSource!.connect(this._analyser);
        }

        try {
            // This fails during unit tests because setSinkId() does not exist on HTMLAudioElement
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call
            this._audio.setSinkId('default');
        } catch (e: unknown) {
            // Suppress this error, but log it, in case it happens in production.
            this.logger.error(e, 'Could not perform setSinkId()', 'AudioPlayer', 'constructor');
        }

        this._audio.defaultPlaybackRate = 1;
        this._audio.playbackRate = 1;
        this._audio.volume = 1;
        this._audio.muted = false;

        this._gainNode.gain.setValueAtTime(1, 0);

        this._audio.onended = () => this.playbackFinished.next();
    }

    private playbackFinished: Subject<void> = new Subject();
    public playbackFinished$: Observable<void> = this.playbackFinished.asObservable();

    public get analyser(): AnalyserNode {
        return this._analyser;
    }

    public get audio(): HTMLAudioElement {
        return this._audio;
    }

    public get progressSeconds(): number {
        if (this._isPlayingOnWebAudio) {
            return this._audioContext.currentTime - this._webAudioStartTime;
        } else {
            if (isNaN(this.audio.currentTime)) {
                return 0;
            }

            return this.audio.currentTime;
        }
    }

    public get totalSeconds(): number {
        if (this._isPlayingOnWebAudio) {
            return this._buffer?.duration || 0;
        } else {
            if (isNaN(this.audio.duration)) {
                return 0;
            }

            return this.audio.duration;
        }
    }

    public get isPaused(): boolean {
        return this._isPaused;
    }

    public play(audioFilePath: string): void {
        this._isPlayingOnWebAudio = false;

        const playableAudioFilePath: string = this.replaceUnplayableCharacters(audioFilePath);
        this._currentPlayableAudioFilePath = playableAudioFilePath;
        this._keepHtml5AudioMuted = false;

        if (this._enableGaplessPlayback && this._preloadAudio && this._nextAudioPath === audioFilePath) {
            this._preloadAudio.volume = this._audio.volume;
            this._preloadAudio.muted = this._audio.muted;
            this._preloadAudio.defaultPlaybackRate = this._audio.defaultPlaybackRate;
            this._preloadAudio.playbackRate = this._audio.playbackRate;

            this._audio = this._preloadAudio;
            this._preloadAudio = undefined;
            this._nextAudioPath = '';
        } else {
            // This is a workaround to fix flickering of OS media controls when switching track from the media controls
            const tempAudio: HTMLAudioElement = new Audio();
            tempAudio.volume = this._audio.volume;
            tempAudio.src = 'file:///' + playableAudioFilePath;
            tempAudio.muted = this._audio.muted;
            tempAudio.defaultPlaybackRate = this._audio.defaultPlaybackRate;
            tempAudio.playbackRate = this._audio.playbackRate;

            this._audio = tempAudio;
        }

        this._audio.muted = false;
        this._audio.play();

        if (this._enableGaplessPlayback) {
            const playableAudioFilePath: string = this.replaceUnplayableCharacters(audioFilePath);
            this.loadAudioWithWebAudio(playableAudioFilePath);
        }
    }

    public stop(): void {
        // Html5 audio
        this._audio.currentTime = 0;
        this._audio.pause();

        // Web audio
        if (this._enableGaplessPlayback) {
            if (this._sourceNode) {
                this._sourceNode.onended = () => {};
                this._sourceNode.stop();
                this._sourceNode.disconnect();
            }
        }
    }

    public pause(): void {
        // Html5 audio
        this._audio.pause();

        // Web audio
        if (this._enableGaplessPlayback) {
            this._webAudioPausedAt = this._audioContext.currentTime - this._webAudioStartTime;

            if (this._sourceNode) {
                this._sourceNode.onended = () => {};
                this._sourceNode.stop();
                this._sourceNode.disconnect();
            }
        }
    }

    public resume(): void {
        // Html5 audio
        this._audio.play();

        // Web audio
        if (this._enableGaplessPlayback) {
            this.playWebAudio(this._webAudioPausedAt);
        }
    }

    public setVolume(linearVolume: number): void {
        // log(0) is undefined. So we provide a minimum of 0.01.
        const logarithmicVolume: number = linearVolume > 0 ? this.mathExtensions.linearToLogarithmic(linearVolume, 0.01, 1) : 0;
        this._audio.volume = logarithmicVolume;

        if (this._enableGaplessPlayback) {
            this._gainNode.gain.setValueAtTime(logarithmicVolume, 0);
        }
    }

    public mute(): void {
        // Html5 audio
        this._audio.muted = true;

        // Web audio
        if (this._enableGaplessPlayback) {
            this._gainNodeVolumeBeforeMute = this._gainNode.gain.value;
            this._gainNode.gain.setValueAtTime(1, 0);
        }
    }

    public unMute(): void {
        // Html5 audio
        if (!this._keepHtml5AudioMuted) {
            this._audio.muted = false;
        }

        // Web audio
        if (this._enableGaplessPlayback) {
            this._gainNode.gain.setValueAtTime(this._gainNodeVolumeBeforeMute, 0);
        }
    }

    public skipToSeconds(seconds: number): void {
        // Html5 audio
        this._audio.currentTime = seconds;

        // Web audio
        if (this._enableGaplessPlayback) {
            this.playWebAudio(seconds);
        }
    }

    private replaceUnplayableCharacters(audioFilePath: string): string {
        // HTMLAudioElement doesn't play paths which contain # and ?, so we escape them.
        let playableAudioFilePath: string = StringUtils.replaceAll(audioFilePath, '#', '%23');
        playableAudioFilePath = StringUtils.replaceAll(playableAudioFilePath, '?', '%3F');
        return playableAudioFilePath;
    }

    private async fetchAudioFile(url: string): Promise<Blob> {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch audio file: ${response.statusText}`);
        }
        return await response.blob(); // Convert the response to a Blob
    }

    private async loadAudioWithWebAudio(playableAudioFilePath: string): Promise<void> {
        this.fetchAudioFile(playableAudioFilePath)
            .then((blob) => {
                const reader = new FileReader();
                reader.readAsArrayBuffer(blob);
                reader.onloadend = async () => {
                    const arrayBuffer = reader.result as ArrayBuffer;
                    this._buffer = await this._audioContext.decodeAudioData(arrayBuffer);
                    this.switchToWebAudio(playableAudioFilePath);
                };
            })
            .catch((error) => console.error(error));
    }

    private playWebAudio(offset: number): void {
        if (!this._buffer) {
            return;
        }

        if (this._audio.paused) {
            return;
        }

        try {
            // Make sure to stop any previous sourceNode if it's still playing
            if (this._sourceNode) {
                this._sourceNode.onended = () => {};

                this._sourceNode.stop();
                this._sourceNode.disconnect(); // Disconnect the previous node to avoid issues
            }

            // Create a new buffer source node
            this._sourceNode = this._audioContext.createBufferSource();
            this._sourceNode.buffer = this._buffer;

            // Connect the source to the analyser
            this._sourceNode.connect(this._analyser);

            // Connect the source node to the gain node
            this._sourceNode.connect(this._gainNode);

            this._sourceNode.onended = () => {
                this.playbackFinished.next();
            };

            this._isPlayingOnWebAudio = true;

            // Store the current time when audio starts playing
            this._webAudioStartTime = this._audioContext.currentTime - offset;

            // Sync playback position with HTML5 Audio
            this._sourceNode.start(0, offset);

            // Sync HTML5 audio with WebAudio
            this._audio.currentTime = offset;
        } catch (error) {}
    }

    private switchToWebAudio(playableAudioFilePath: string): void {
        if (this._currentPlayableAudioFilePath !== playableAudioFilePath) {
            return;
        }

        // Get the current position of HTML5 audio
        const currentTime: number = this._audio.currentTime;

        this._audio.muted = true;
        this._keepHtml5AudioMuted = true;

        this.playWebAudio(currentTime);
    }

    public preloadNextTrack(audioFilePath: string): void {
        if (this._enableGaplessPlayback && this._isPlayingOnWebAudio) {
            this._nextAudioPath = audioFilePath;
            const playableAudioFilePath: string = this.replaceUnplayableCharacters(audioFilePath);
            this._preloadAudio = new Audio();
            this._audio.preload = 'auto';
            this._preloadAudio.src = 'file:///' + playableAudioFilePath;
            this._preloadAudio.load();
        }
    }
}
