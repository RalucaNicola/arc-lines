import { InOutData } from "./types";

export const state: State = {
    currentTime: null,
    currentDay: 1,
    currentStation: 0,
    dailyBikeTrips: []
}

type State = {
    currentTime: number;
    currentDay: number;
    currentStation: number;
    dailyBikeTrips: Array<InOutData>
}