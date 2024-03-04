
const NO_SEG = 30;
const dailyBikeFullData = [];
let bikeData = [];
const counts = [];
onmessage = function (e) {
    try {
        const { type, data } = e.data;
        if (type === "register-data") {
            bikeData = data.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
            bikeData.forEach((feature) => {
                const day = new Date(feature.startTime).getDate();
                counts[day] = (counts[day] || 0) + 1;
            });
            postMessage({ type: "register-data", counts });
        } else {
            if (type === "get-daily-data") {
                const day = e.data.day;
                if (!dailyBikeFullData[day]) {
                    const dailyBikeData = bikeData.filter((trip) => new Date(trip.startTime).getDate() === day);
                    const startDate = new Date(`${day} January 2024 00:00:00`);
                    const endDate = new Date(`${day} January 2024 23:59:59`);
                    const vertices = [];
                    dailyBikeData.forEach((trip) => {
                        const { startX, startY, endX, endY, startTime, endTime } = trip;
                        const start = {
                            x: startX,
                            y: startY,
                            z: 50,
                            color: [245, 66, 173, 0],
                            time: new Date(startTime).getTime() - startDate.getTime(),
                            endTime: new Date(endTime).getTime() - startDate.getTime()
                        }
                        const end = {
                            x: endX,
                            y: endY,
                            z: 50,
                            color: [3, 215, 252, 0],
                            time: new Date(endTime).getTime() - startDate.getTime(),
                            endTime: new Date(endTime).getTime() - startDate.getTime()
                        }
                        vertices.push(calculatePointsOnParaboloid({ start, end }));
                    });
                    dailyBikeFullData[day] = { startDate, endDate, vertices: vertices.flat() };
                }
                postMessage({ type: "get-daily-data", data: dailyBikeFullData[day] });
            }
        }

    }
    catch (err) {
        console.log(err);
    }

}

function calculatePointsOnParaboloid({ start, end }) {
    const points = [];
    const H = 1.0;
    const { x: xs, y: ys, z: zs, time: time_s } = start;
    const { x: xe, y: ye, z: ze, time: time_e } = end;
    const distance = Math.sqrt((xe - xs) ** 2 + (ye - ys) ** 2);
    const deltaZ = ze - zs;
    const dh = distance * H;
    for (let i = 0; i < NO_SEG; i++) {
        const unitZ = deltaZ / dh;
        const p = unitZ * unitZ + 1;
        const z0 = deltaZ >= 0 ? zs : ze;
        const ratio = deltaZ >= 0 ? i / (NO_SEG - 1) : (1 - (i / (NO_SEG - 1)));
        const x = xs * (1 - ratio) + xe * ratio;
        const y = ys * (1 - ratio) + ye * ratio;
        const z = ratio * (p - ratio) * dh + z0;
        const r = start.color[0] * (1 - ratio) + end.color[0] * ratio;
        const g = start.color[1] * (1 - ratio) + end.color[1] * ratio;
        const b = start.color[2] * (1 - ratio) + end.color[2] * ratio;
        const a = start.color[3] * (1 - ratio) + end.color[3] * ratio;
        const time = time_s + (time_e - time_s) * ratio;
        points.push({ x, y, z, color: [r, g, b, Math.floor(a * 255)], time, endTime: time_e })
    }
    return points;
}