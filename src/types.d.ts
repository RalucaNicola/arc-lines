export interface Trip {
    startLng?: number;
    startLat?: number;
    endLng?: number;
    endLat?: number;
    startX?: number;
    startY?: number;
    endX?: number;
    endY?: number;
    startTime: string;
    endTime: string;
    durationMin: number;
}

export interface Vertex {
    x: number;
    y: number;
    z: number;
    color: Array<number>;
    time: number;
    endTime: number;
}
