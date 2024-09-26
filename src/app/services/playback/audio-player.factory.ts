import { Injectable } from '@angular/core';
import { MathExtensions } from '../../common/math-extensions';
import { Logger } from '../../common/logger';
import { AudioPlayer } from './audio-player';
import { IAudioPlayer } from './i-audio-player';
import { SettingsBase } from '../../common/settings/settings.base';
import { GaplessAudioPlayer } from './gapless-audio-player';

@Injectable({ providedIn: 'root' })
export class AudioPlayerFactory {
    public constructor(
        private mathExtensions: MathExtensions,
        private settings: SettingsBase,
        private logger: Logger,
    ) {}

    public create(): IAudioPlayer {
        if (this.settings.enableGaplessPlayback) {
            return new GaplessAudioPlayer(this.mathExtensions, this.logger);
        }

        return new AudioPlayer(this.mathExtensions, this.logger);
    }
}
