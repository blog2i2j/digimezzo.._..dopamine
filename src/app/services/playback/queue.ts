import { Injectable } from '@angular/core';
import { Logger } from '../../common/logger';
import { Shuffler } from '../../common/shuffler';
import { TrackModel } from '../track/track-model';

@Injectable({ providedIn: 'root' })
export class Queue {
    private _tracks: TrackModel[] = [];

    public constructor(private logger: Logger) {}

    public get tracks(): TrackModel[] {
        return this._tracks;
    }

    public setTracks(tracksToSet: TrackModel[]): void {
        this._tracks = tracksToSet.map((x) => x.clone());

        this.logger.info(`Set '${tracksToSet?.length}' tracks.`, 'Queue', 'setTracks');
    }

    public removeTrack(path: string): void {
        const index = this._tracks.findIndex((track) => track.path === path);
        if (index !== -1) {
            this._tracks.splice(index, 1);
            this.logger.info(`Removed track with path '${path}'.`, 'Queue', 'removeTrack');
        } else {
            this.logger.warn(`Track with path '${path}' not found.`, 'Queue', 'removeTrack');
        }
    }

    public getTrackForPath(path: string): TrackModel | undefined {
        return this._tracks.find((x) => x.path === path);
    }
}
