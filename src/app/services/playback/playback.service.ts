import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { Logger } from '../../common/logger';
import { MathExtensions } from '../../common/math-extensions';
import { AlbumModel } from '../album/album-model';
import { ArtistModel } from '../artist/artist-model';
import { ArtistType } from '../artist/artist-type';
import { GenreModel } from '../genre/genre-model';
import { PlaylistModel } from '../playlist/playlist-model';
import { TrackModel } from '../track/track-model';
import { TrackModels } from '../track/track-models';
import { LoopMode } from './loop-mode';
import { PlaybackProgress } from './playback-progress';
import { PlaybackStarted } from './playback-started';
import { PlaybackServiceBase } from './playback.service.base';
import { TrackServiceBase } from '../track/track.service.base';
import { PlaylistServiceBase } from '../playlist/playlist.service.base';
import { SettingsBase } from '../../common/settings/settings.base';
import { NotificationServiceBase } from '../notification/notification.service.base';
import { TrackSorter } from '../../common/sorting/track-sorter';
// import { QueuePersister } from './queue-persister';
import { QueueRestoreInfo } from './queue-restore-info';
import { takeUntil } from 'rxjs/operators';
import { Gapless5 } from '@regosen/gapless-5';
import { Queue } from './queue';
import { DateTime } from '../../common/date-time';

@Injectable()
export class PlaybackService implements PlaybackServiceBase {
    private progressChanged: Subject<PlaybackProgress> = new Subject();
    private playbackStarted: Subject<PlaybackStarted> = new Subject();
    private playbackPaused: Subject<void> = new Subject();
    private playbackResumed: Subject<void> = new Subject();
    private playbackStopped: Subject<void> = new Subject();
    private playbackSkipped: Subject<void> = new Subject();
    private _progress: PlaybackProgress = new PlaybackProgress(0, 0);
    private _volume: number = 0;
    private _loopMode: LoopMode = LoopMode.None;
    private _isShuffled: boolean = false;
    private _isPlaying: boolean = false;
    private _canPause: boolean = false;
    private _canResume: boolean = true;
    private _volumeBeforeMute: number = 0;
    private _audioPlayer: Gapless5 = new Gapless5({ guiId: 'gapless5-player-id' });
    private reportProgressInterval: number = 0;
    private shouldReportProgress: boolean = false;

    public constructor(
        private trackService: TrackServiceBase,
        private playlistService: PlaylistServiceBase,
        private notificationService: NotificationServiceBase,
        private trackSorter: TrackSorter,
        private queue: Queue,
        private mathExtensions: MathExtensions,
        private dateTime: DateTime,
        private settings: SettingsBase,
        private logger: Logger,
    ) {
        this.applyVolume(this.settings.volume);

        this.initializeSubscriptions();
    }

    private initializeSubscriptions(): void {
        this._audioPlayer.onplay = (path) => this.onPlayHandler(path);
        this._audioPlayer.onnext = (fromPath, toPath) => this.onNextHandler(toPath);
        this._audioPlayer.onprev = (fromPath, toPath) => this.onPrevHandler(toPath);
        this._audioPlayer.onfinishedtrack = (path) => this.onFinishedTrackHandler(path);
    }

    public get playbackQueue(): TrackModels {
        const trackModels: TrackModels = new TrackModels();

        if (this.queue.tracks != undefined) {
            for (const track of this.queue.tracks) {
                trackModels.addTrack(track);
            }
        }

        return trackModels;
    }

    public get volume(): number {
        return this._volume;
    }

    public set volume(v: number) {
        this.applyVolume(v);
    }

    public get progress(): PlaybackProgress {
        return this._progress;
    }

    public get loopMode(): LoopMode {
        return this._loopMode;
    }

    public get isPlaying(): boolean {
        return this._isPlaying;
    }

    public get isShuffled(): boolean {
        return this._isShuffled;
    }

    public get canPause(): boolean {
        return this._canPause;
    }

    public get canResume(): boolean {
        return this._canResume;
    }

    public currentTrack: TrackModel | undefined;

    public progressChanged$: Observable<PlaybackProgress> = this.progressChanged.asObservable();
    public playbackStarted$: Observable<PlaybackStarted> = this.playbackStarted.asObservable();
    public playbackPaused$: Observable<void> = this.playbackPaused.asObservable();
    public playbackResumed$: Observable<void> = this.playbackResumed.asObservable();
    public playbackStopped$: Observable<void> = this.playbackStopped.asObservable();
    public playbackSkipped$: Observable<void> = this.playbackSkipped.asObservable();

    public enqueueAndPlayTracks(tracksToEnqueue: TrackModel[]): void {
        if (tracksToEnqueue.length === 0) {
            return;
        }

        this.queue.setTracks(tracksToEnqueue);

        this._audioPlayer.removeAllTracks();
        for (const track of tracksToEnqueue) {
            this._audioPlayer.addTrack(track.path);
        }

        this.play();
    }

    public enqueueAndPlayTracksStartingFromGivenTrack(tracksToEnqueue: TrackModel[], trackToPlay: TrackModel): void {
        if (tracksToEnqueue.length === 0) {
            return;
        }

        if (trackToPlay == undefined) {
            return;
        }

        this.queue.setTracks(tracksToEnqueue);

        this._audioPlayer.removeAllTracks();
        for (const track of tracksToEnqueue) {
            this._audioPlayer.addTrack(track.path);
        }

        this._audioPlayer.gotoTrack(trackToPlay.path);
        this.play();
    }

    public enqueueAndPlayArtist(artistToPlay: ArtistModel, artistType: ArtistType): void {
        const tracksForArtists: TrackModels = this.trackService.getTracksForArtists([artistToPlay], artistType);
        const orderedTracks: TrackModel[] = this.trackSorter.sortByAlbum(tracksForArtists.tracks);
        this.enqueueAndPlayTracks(orderedTracks);
    }

    public enqueueAndPlayGenre(genreToPlay: GenreModel): void {
        const tracksForGenre: TrackModels = this.trackService.getTracksForGenres([genreToPlay.displayName]);
        const orderedTracks: TrackModel[] = this.trackSorter.sortByAlbum(tracksForGenre.tracks);
        this.enqueueAndPlayTracks(orderedTracks);
    }

    public enqueueAndPlayAlbum(albumToPlay: AlbumModel): void {
        const tracksForAlbum: TrackModels = this.trackService.getTracksForAlbums([albumToPlay.albumKey]);
        const orderedTracks: TrackModel[] = this.trackSorter.sortByAlbum(tracksForAlbum.tracks);
        this.enqueueAndPlayTracks(orderedTracks);
    }

    public async enqueueAndPlayPlaylistAsync(playlistToPlay: PlaylistModel): Promise<void> {
        const tracksForPlaylist: TrackModels = await this.playlistService.getTracksAsync([playlistToPlay]);
        this.enqueueAndPlayTracks(tracksForPlaylist.tracks);
    }

    public async addTracksToQueueAsync(tracksToAdd: TrackModel[]): Promise<void> {
        if (tracksToAdd.length === 0) {
            return;
        }

        this._audioPlayer.removeAllTracks();

        for (const track of tracksToAdd) {
            this._audioPlayer.addTrack(track.path);
        }

        await this.notifyOfTracksAddedToPlaybackQueueAsync(tracksToAdd.length);
    }

    public async addArtistToQueueAsync(artistToAdd: ArtistModel, artistType: ArtistType): Promise<void> {
        const tracksForArtists: TrackModels = this.trackService.getTracksForArtists([artistToAdd], artistType);
        const orderedTracks: TrackModel[] = this.trackSorter.sortByAlbum(tracksForArtists.tracks);
        await this.addTracksToQueueAsync(orderedTracks);
    }

    public async addGenreToQueueAsync(genreToAdd: GenreModel): Promise<void> {
        if (genreToAdd == undefined) {
            return;
        }

        const tracksForGenre: TrackModels = this.trackService.getTracksForGenres([genreToAdd.displayName]);
        const orderedTracks: TrackModel[] = this.trackSorter.sortByAlbum(tracksForGenre.tracks);
        await this.addTracksToQueueAsync(orderedTracks);
    }

    public async addAlbumToQueueAsync(albumToAdd: AlbumModel): Promise<void> {
        const tracksForAlbum: TrackModels = this.trackService.getTracksForAlbums([albumToAdd.albumKey]);
        const orderedTracks: TrackModel[] = this.trackSorter.sortByAlbum(tracksForAlbum.tracks);
        await this.addTracksToQueueAsync(orderedTracks);
    }

    public async addPlaylistToQueueAsync(playlistToAdd: PlaylistModel): Promise<void> {
        if (playlistToAdd == undefined) {
            return;
        }

        const tracksForPlaylist: TrackModels = await this.playlistService.getTracksAsync([playlistToAdd]);
        await this.addTracksToQueueAsync(tracksForPlaylist.tracks);
    }

    public removeFromQueue(tracksToRemove: TrackModel[]): void {
        if (tracksToRemove.length === 0) {
            return;
        }

        for (const track of tracksToRemove) {
            this._audioPlayer.removeTrack(track.path);
            this.queue.removeTrack(track.path);
        }
    }

    public playQueuedTrack(trackToPlay: TrackModel): void {
        this._audioPlayer.gotoTrack(trackToPlay.path);
    }

    public toggleLoopMode(): void {
        const oldLoopMode: LoopMode = this._loopMode;

        if (this._loopMode === LoopMode.None) {
            this._loopMode = LoopMode.All;
            this.settings.playbackControlsLoop = 2;
        } else if (this._loopMode === LoopMode.All) {
            this._loopMode = LoopMode.One;
            this.settings.playbackControlsLoop = 1;
        } else {
            this._loopMode = LoopMode.None;
            this.settings.playbackControlsLoop = 0;
        }

        this.logger.info(`Toggled loopMode from ${oldLoopMode} to ${this._loopMode}`, 'PlaybackService', 'toggleLoopMode');
    }

    public toggleIsShuffled(): void {
        this._isShuffled = !this._isShuffled;
        this._audioPlayer.toggleShuffle();
        this._isShuffled = this._audioPlayer.isShuffled();
        this.settings.playbackControlsShuffle = this._audioPlayer.isShuffled() ? 1 : 0;

        this.logger.info(`Toggled isShuffled from ${!this._isShuffled} to ${this._isShuffled}`, 'PlaybackService', 'toggleIsShuffled');
    }

    public forceShuffled(): void {
        this._isShuffled = true;
        this._audioPlayer.shuffle();

        this.logger.info(`Forced isShuffled`, 'PlaybackService', 'forceShuffled');
    }

    public pause(): void {
        this._audioPlayer.pause();

        this._canPause = false;
        this._canResume = true;

        this.pauseUpdatingProgress();

        this.playbackPaused.next();

        if (this.currentTrack != undefined) {
            this.logger.info(`Pausing '${this.currentTrack.path}'`, 'PlaybackService', 'pause');
        }
    }

    public resume(): void {
        // if (!this.isPlaying) {
        //     const firstTrack: TrackModel | undefined = this.queue.getFirstTrack();
        //
        //     if (firstTrack != undefined) {
        //         this.play(this.queue.getFirstTrack()!, false);
        //         return;
        //     }
        //
        //     return;
        // }
        //
        // this._audioPlayer.resume();
        //
        // this._canPause = true;
        // this._canResume = false;
        // this.startUpdatingProgress();
        // this.playbackResumed.next();
        //
        // if (this.currentTrack != undefined) {
        //     this.logger.info(`Resuming '${this.currentTrack.path}'`, 'PlaybackService', 'resume');
        // }
    }

    public playPrevious(): void {
        this._audioPlayer.prev(undefined, false);
    }

    public playNext(): void {
        const path: string = this._audioPlayer.getTrack();
        this.increaseCountersBasedOnProgress(path);
        this._audioPlayer.next(undefined, true, false);
    }

    public skipByFractionOfTotalSeconds(fractionOfTotalSeconds: number): void {
        const seconds: number = (fractionOfTotalSeconds * this._audioPlayer.currentLength()) / 1000;
        this.skipToSeconds(seconds);
    }

    private skipToSeconds(seconds: number): void {
        this._audioPlayer.setPosition(seconds * 1000);
        this._progress = this.getCurrentProgress();
        this.playbackSkipped.next();
    }

    public togglePlayback(): void {
        if (this.canPause) {
            this.pause();
        } else {
            this.resume();
        }
    }

    public stopIfPlaying(track: TrackModel): void {
        // if (this.currentTrack != undefined && this.currentTrack.path === track.path) {
        //     if (this.queue.numberOfTracks === 1) {
        //         this.stop();
        //     } else {
        //         this.playNext();
        //     }
        // }
    }

    public toggleMute(): void {
        if (this._volume === 0) {
            this.applyVolume(this._volumeBeforeMute > 0 ? this._volumeBeforeMute : 0.5);
        } else {
            this._volumeBeforeMute = this._volume;
            this.applyVolume(0);
        }
    }

    private play(): void {
        this._audioPlayer.play();

        this._isPlaying = true;
        this._canPause = true;
        this._canResume = false;

        this.startUpdatingProgress();
    }

    private stop(): void {
        this._audioPlayer.stop();
        this._isPlaying = false;
        this._canPause = false;
        this._canResume = true;
        this.stopUpdatingProgress();

        if (this.currentTrack != undefined) {
            this.logger.info(`Stopping '${this.currentTrack.path}'`, 'PlaybackService', 'stop');
        }

        this.currentTrack = undefined;
        this.playbackStopped.next();
    }

    // private playbackStartedHandler(path: string): void {
    //     this.currentTrack = this.queue.getTrackByPath(path);
    //
    //     if (this.currentTrack) {
    //         this.playbackStarted.next(new PlaybackStarted(this.currentTrack, false));
    //         this.startUpdatingProgress();
    //
    //         this.logger.info(`Playing '${this.currentTrack.path}'`, 'PlaybackService', 'play');
    //
    //         if (this._audioPlayer.supportsGaplessPlayback) {
    //             this._audioPlayer.preloadTrack(this.queue.getNextTrack(this.currentTrack, false)?.path ?? '');
    //         }
    //     }
    // }

    private onPlayHandler(path: string): void {
        const track: TrackModel | undefined = this.queue.getTrackForPath(path);

        if (track) {
            this.currentTrack = track;
            this.playbackStarted.next(new PlaybackStarted(track, false));
        }
    }

    private onNextHandler(path: string): void {
        const track: TrackModel | undefined = this.queue.getTrackForPath(path);

        if (track) {
            this.playbackStarted.next(new PlaybackStarted(track, false));
        }
    }

    private onPrevHandler(path: string): void {
        const track: TrackModel | undefined = this.queue.getTrackForPath(path);

        if (track) {
            this.playbackStarted.next(new PlaybackStarted(track, true));
        }
    }

    private onFinishedTrackHandler(path: string): void {
        this.logger.info(`Track finished: '${path}'`, 'PlaybackService', 'playbackFinishedHandler');

        this.increasePlayCountAndDateLastPlayed(path);
    }

    private increaseCountersBasedOnProgress(path: string): void {
        if (this.progress == undefined) {
            this.logger.warn('Progress was undefined', 'PlaybackService', 'increaseCountersForCurrentTrackBasedOnProgress');

            return;
        }

        if (this.progress.progressPercent <= 80) {
            this.increaseSkipCount(path);
        } else {
            this.increasePlayCountAndDateLastPlayed(path);
        }
    }

    private increasePlayCountAndDateLastPlayed(path: string): void {
        const track: TrackModel | undefined = this.queue.getTrackForPath(path);
        if (!track) {
            this.logger.warn(`Could not find track for path '${path}'`, 'PlaybackService', 'increasePlayCountAndDateLastPlayed');
            return;
        }

        let playCount: number = track.playCount;
        this.trackService.savePlayCountAndDateLastPlayed(track.id, playCount++, this.dateTime.convertDateToTicks(new Date()));
    }

    private increaseSkipCount(path: string): void {
        const track: TrackModel | undefined = this.queue.getTrackForPath(path);
        if (!track) {
            this.logger.warn(`Could not find track for path '${path}'`, 'PlaybackService', 'increaseSkipCount');
            return;
        }

        let skipCount: number = track.skipCount;
        this.trackService.saveSkipCount(track.id, skipCount++);
    }

    private applyVolume(volume: number): void {
        const volumeToSet: number = this.mathExtensions.clamp(volume, 0, 1);
        this._volume = volumeToSet;
        this.settings.volume = volumeToSet;
        this._audioPlayer.setVolume(volumeToSet);
    }

    private async notifyOfTracksAddedToPlaybackQueueAsync(numberOfAddedTracks: number): Promise<void> {
        if (numberOfAddedTracks === 1) {
            await this.notificationService.singleTrackAddedToPlaybackQueueAsync();
        } else {
            await this.notificationService.multipleTracksAddedToPlaybackQueueAsync(numberOfAddedTracks);
        }
    }

    public async initializeAsync(): Promise<void> {
        if (this.settings.rememberPlaybackStateAfterRestart) {
            if (this.settings.playbackControlsLoop !== 0) {
                this._loopMode = this.settings.playbackControlsLoop === 1 ? LoopMode.One : LoopMode.All;
            }

            if (this.settings.playbackControlsShuffle === 1) {
                this._isShuffled = true;
            }

            await this.restoreQueueAsync();
        }
    }

    public saveQueue(): void {
        // if (this.settings.rememberPlaybackStateAfterRestart) {
        //     this.queuePersister.save(this.queue, this.currentTrack, this.progress.progressSeconds);
        // }
    }

    private async restoreQueueAsync(): Promise<void> {
        // const info: QueueRestoreInfo = await this.queuePersister.restoreAsync();
        // this.queue.restoreTracks(info.tracks, info.playbackOrder);
        //
        // if (info.playingTrack) {
        //     this.play(info.playingTrack, false);
        //     this.pause();
        //     this.skipToSeconds(info.progressSeconds);
        //     this.startUpdatingProgress();
        // }
    }

    public startUpdatingProgress(): void {
        this.reportProgress();
        this.shouldReportProgress = true;

        if (this.reportProgressInterval === 0) {
            this.reportProgressInterval = window.setInterval(() => {
                this.reportProgress();
            }, 500);
        }
    }

    public stopUpdatingProgress(): void {
        this.pauseUpdatingProgress();
        this.progressChanged.next(new PlaybackProgress(0, 0));
    }

    public pauseUpdatingProgress(): void {
        this.shouldReportProgress = false;
    }

    public getCurrentProgress(): PlaybackProgress {
        let progressSeconds: number = 0;
        if (!isNaN(this._audioPlayer.getPosition())) {
            progressSeconds = this._audioPlayer.getPosition() / 1000;
        }

        let totalSeconds: number = 0;
        if (!isNaN(this._audioPlayer.currentLength())) {
            totalSeconds = this._audioPlayer.currentLength() / 1000;
        }

        return new PlaybackProgress(progressSeconds, totalSeconds);
    }

    private reportProgress(): void {
        if (this.shouldReportProgress) {
            const currentProgress: PlaybackProgress = this.getCurrentProgress();
            this._progress = currentProgress;
            this.progressChanged.next(currentProgress);
        }
    }
}
