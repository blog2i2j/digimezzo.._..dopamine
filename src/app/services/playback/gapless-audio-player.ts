import { Observable } from 'rxjs';
import { IAudioPlayer } from './i-audio-player';
import { Gapless5 } from '@regosen/gapless-5';
import { StringUtils } from '../../common/utils/string-utils';
import { MathExtensions } from '../../common/math-extensions';
import { Logger } from '../../common/logger';

export class GaplessAudioPlayer implements IAudioPlayer {
    public audio: HTMLAudioElement = new Audio(); // TODO: just temporary for compatibility reasons
    public playbackFinished$: Observable<void>;

    private _player = new Gapless5({ guiId: 'gapless5-player-id' });

    private _volumeBeforeMutemute: number = 1;

    public constructor(
        private mathExtensions: MathExtensions,
        private logger: Logger,
    ) {
        this._player.volume = 1;
    }

    public get progressSeconds(): number {
        if (isNaN(this._player.getPosition())) {
            return 0;
        }

        return this._player.getPosition() / 1000;
    }

    public get totalSeconds(): number {
        if (isNaN(this._player.get)) {
            return 0;
        }

        return this.audio.duration;
    }

    public get supportsGaplessPlayback(): boolean {
        return false;
    }

    public play(audioFilePath: string): void {
        const playableAudioFilePath: string = this.replaceUnplayableCharacters(audioFilePath);
        this._player.addTrack(playableAudioFilePath);
        this.audio.src = 'file:///' + playableAudioFilePath;
        this._player.play();
    }

    public stop(): void {
        // TODO
    }

    public pause(): void {
        // TODO
    }

    public resume(): void {
        // TODO
    }

    public setVolume(linearVolume: number): void {
        // log(0) is undefined. So we provide a minimum of 0.01.
        const logarithmicVolume: number = linearVolume > 0 ? this.mathExtensions.linearToLogarithmic(linearVolume, 0.01, 1) : 0;
        this.audio.volume = logarithmicVolume;
        this._player.volume = volume;
    }

    public mute(): void {
        this._volumeBeforeMutemute = this._player.volume;
        this._player.volume = 0;
    }

    public unMute(): void {
        this._player.volume = this._volumeBeforeMutemute;
    }

    public skipToSeconds(seconds: number): void {
        this._player.setPosition(seconds * 1000);
    }

    private replaceUnplayableCharacters(audioFilePath: string): string {
        // HTMLAudioElement doesn't play paths which contain # and ?, so we escape them.
        let playableAudioFilePath: string = StringUtils.replaceAll(audioFilePath, '#', '%23');
        playableAudioFilePath = StringUtils.replaceAll(playableAudioFilePath, '?', '%3F');
        return playableAudioFilePath;
    }

    public preloadTrack(audioFilePath: string): void {
        const playableAudioFilePath: string = this.replaceUnplayableCharacters(audioFilePath);
        this._player.addTrack(playableAudioFilePath);
    }
}
