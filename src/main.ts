import WebScene from "@arcgis/core/WebScene";

import SceneView from "@arcgis/core/views/SceneView";

import Papa from "papaparse";
import * as webMercatorUtils from "@arcgis/core/geometry/support/webMercatorUtils";
import { watch, whenOnce } from "@arcgis/core/core/reactiveUtils";
import TimeSlider from "@arcgis/core/widgets/TimeSlider";
import { Vertex, Trip } from "./types";
import TimeExtent from "@arcgis/core/TimeExtent";
import Color from "@arcgis/core/Color";
import Slider from "@arcgis/core/widgets/Slider";
import ArcLinesRenderNode from "./ArcLinesRenderNode";
import { state } from "./State";
import { getColor } from "./utils";

let startDate: Date = null;
let endDate: Date = null;
let vertices: Array<Vertex> = null;
let renderNode: ArcLinesRenderNode = null;
let timeSlider: TimeSlider = null;
let dailyCounts: Array<number> = null;

const view = new SceneView({
    container: "viewDiv",
    map: new WebScene({
        portalItem: {
            id: '0e4333f1fd52435a8568ba7d09172b83'
        }
    }),

    qualityProfile: "high",
    viewingMode: "global",

    environment: {
        atmosphereEnabled: false,
        lighting: {
            directShadowsEnabled: true
        }
    }
});

(window as any).view = view;

const currentTimeContainer = document.getElementById("currentTime");
const dateToString = (date: Date) => {
    return new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "numeric",
        hour12: true,
    }).format(date);
};

try {
    view.when(() => {
        Papa.parse("./202401-tripdata-cambridge.csv", {
            delimiter: ",", download: true, header: true, dynamicTyping: true, complete: async (result) => {

                const dataProcessingWorker = new Worker("./dataProcessingWorker.js");
                let data = result.data.filter((trip: Trip) => trip.startTime && trip.endTime);
                data = data.map((trip: Trip) => {
                    const { startLng, startLat, endLng, endLat, startTime, endTime, durationMin } = trip;
                    const [startX, startY] = webMercatorUtils.lngLatToXY(startLng, startLat);
                    const [endX, endY] = webMercatorUtils.lngLatToXY(endLng, endLat);
                    return {
                        startTime,
                        endTime,
                        durationMin,
                        startX,
                        startY,
                        endX,
                        endY
                    }
                });
                dataProcessingWorker.postMessage({ type: "register-data", data });
                dataProcessingWorker.onmessage = function (e) {
                    switch (e.data.type) {
                        case "register-data":
                            dailyCounts = e.data.counts;
                            dailyCounts[0] = 0;
                            generateCalendar();
                            dataProcessingWorker.postMessage({ type: "get-daily-data", day: state.currentDay });
                            break;
                        case "get-daily-data":
                            startDate = new Date(e.data.data.startDate);
                            endDate = new Date(e.data.data.endDate);
                            state.currentTime = startDate.getTime() - startDate.getTime();
                            vertices = e.data.data.vertices;
                            if (renderNode) {
                                renderNode.initData(vertices);
                            } else {
                                renderNode = new ArcLinesRenderNode({ view, vertices });
                            }
                            document.querySelector(".date").innerHTML = `${startDate.toDateString()} - ${dailyCounts[state.currentDay]} trips`;
                            const stopsCount = Math.floor((endDate.getTime() - startDate.getTime()) / 30000);
                            if (timeSlider) {
                                timeSlider.set({
                                    fullTimeExtent: new TimeExtent({
                                        start: startDate,
                                        end: endDate
                                    }),
                                    timeExtent: new TimeExtent({
                                        start: null,
                                        end: startDate
                                    }),
                                    stops: {
                                        count: stopsCount
                                    }
                                });
                            } else {
                                timeSlider = new TimeSlider({
                                    container: "timeSliderDiv",
                                    mode: "cumulative-from-start",
                                    view,
                                    fullTimeExtent: {
                                        start: startDate,
                                        end: endDate
                                    },
                                    playRate: 100,
                                    stops: {
                                        count: stopsCount
                                    }
                                });

                                watch(
                                    () => timeSlider.timeExtent,
                                    (value) => {
                                        state.currentTime = value.end.getTime() - startDate.getTime();
                                        renderNode.requestRender();
                                        const timeString = dateToString(value.end);
                                        const [time, amPM] = timeString.split(/\s/);
                                        currentTimeContainer.innerHTML = `${time}<span class="amPM">${amPM}</span>`;
                                    }
                                );

                                const speedSlider = new Slider({
                                    container: "speedSliderDiv",
                                    min: 20,
                                    max: 200,
                                    values: [100],
                                    steps: [20, 100, 200],
                                    snapOnClickEnabled: true,
                                    visibleElements: {
                                        labels: false,
                                        rangeLabels: false
                                    }
                                });

                                speedSlider.on("thumb-drag", (event) => {
                                    if (event.state === "stop") {
                                        timeSlider.playRate = event.value;
                                        if (timeSlider.viewModel.state === "playing") {
                                            whenOnce(() => timeSlider.viewModel.state === "ready").then(() => {
                                                timeSlider.play();
                                            })
                                        }
                                    }
                                });

                            }
                            break;
                    }
                }

                function generateCalendar() {
                    const calendar = document.getElementById("calendar");
                    const table = document.createElement("table");
                    calendar.appendChild(table);
                    const header = document.createElement("thead");
                    header.innerHTML = `<tr><th>Su</th><th>Mo</th><th>Tu</th><th>We</th><th>Th</th><th>Fr</th><th>Sa</th></tr>`;
                    table.appendChild(header);
                    const body = document.createElement("tbody");
                    table.appendChild(body);
                    let week = null;
                    for (let i = 1; i < dailyCounts.length; i++) {
                        if (i % 7 === 1) {
                            week = document.createElement("tr");
                            body.appendChild(week);
                        }
                        const day = document.createElement("td");
                        day.classList.add("day");
                        if (i === state.currentDay) {
                            day.classList.add("selected");
                        }
                        day.innerHTML = `${i}`;
                        const color = getColor(dailyCounts[i]);
                        day.style.backgroundColor = color.toCss();
                        day.addEventListener("click", () => {
                            state.currentDay = i;
                            dataProcessingWorker.postMessage({ type: "get-daily-data", day: state.currentDay });
                            document.querySelectorAll(".day").forEach((day) => {
                                day.classList.remove("selected");
                            });
                            day.classList.add("selected");
                        });
                        week.appendChild(day);
                    }
                }
            }
        });

    }).catch(error => console.log(error));

} catch (error) {
    console.error(error);
}
