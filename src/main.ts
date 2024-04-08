import WebScene from "@arcgis/core/WebScene";
import SceneView from "@arcgis/core/views/SceneView";
import Papa from "papaparse";
import * as webMercatorUtils from "@arcgis/core/geometry/support/webMercatorUtils";
import { watch, whenOnce } from "@arcgis/core/core/reactiveUtils";
import TimeSlider from "@arcgis/core/widgets/TimeSlider";
import { Trip, Station, InputStation, InOutData, HistogramInfo } from "./types";
import TimeExtent from "@arcgis/core/TimeExtent";
import Slider from "@arcgis/core/widgets/Slider";
import ArcLinesRenderNode from "./ArcLinesRenderNode";
import { state } from "./State";
import { dateToString, getStationIdInteger } from "./utils";
import { generateCalendar } from "./Calendar";
import StationsLayer from "./StationsLayer";
import Histogram from "./Histogram";

let startDate: Date = null;
let endDate: Date = null;
let renderNode: ArcLinesRenderNode = null;
let timeSlider: TimeSlider = null;
let dailyCounts: Array<number> = null;
let stationsLayer: StationsLayer = null;
let stationsInOutData: Array<InOutData> = null;
let histogram: Histogram = null;

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
    },
    constraints: {
        tilt: {
            max: 55
        }
    }
});

(window as any).view = view;

const currentTimeContainer = document.getElementById("currentTime");
const tooltipContainer = document.getElementById("tooltip");
const stationInfoContainer = document.getElementById("stationInfo");

try {
    view.when(() => {
        Papa.parse("./202401-tripdata-cambridge.csv", {
            delimiter: ",", download: true, header: true, dynamicTyping: true, complete: async (result) => {
                const dataProcessingWorker = new Worker("./dataProcessingWorker.js");
                let data = result.data.filter((trip: Trip) => trip.startTime && trip.endTime);
                data = data.map((trip: Trip) => {
                    const { startLng, startLat, endLng, endLat, startTime, endTime, startStationId, endStationId } = trip;
                    const [startX, startY] = webMercatorUtils.lngLatToXY(startLng, startLat);
                    const [endX, endY] = webMercatorUtils.lngLatToXY(endLng, endLat);
                    return {
                        startTime,
                        endTime,
                        startStationId,
                        endStationId,
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
                            generateCalendar(dataProcessingWorker, dailyCounts);
                            histogram = new Histogram(document.getElementById("histogram"));
                            dataProcessingWorker.postMessage({ type: "get-daily-data", day: state.currentDay });
                            break;
                        case "get-daily-data":
                            startDate = new Date(e.data.data.startDate);
                            endDate = new Date(e.data.data.endDate);
                            state.currentTime = startDate.getTime() - startDate.getTime();
                            let vertices = e.data.data.vertices;
                            if (renderNode) {
                                renderNode.initData(vertices);
                            } else {
                                renderNode = new ArcLinesRenderNode({ view, vertices });
                            }
                            let bikesInTotalCounts = 0;
                            let bikesOutTotalCounts = 0;
                            if (stationsInOutData) {
                                state.dailyBikeTrips = stationsInOutData.filter((d) => {
                                    const time = new Date(d.time);
                                    return time.getTime() < endDate.getTime() && time.getTime() > startDate.getTime();
                                });
                                const histogramData: HistogramInfo[] = [];

                                state.dailyBikeTrips.forEach((d) => {
                                    const time = new Date(d.time);
                                    const hour = time.getHours();
                                    if (histogramData[hour]) {
                                        if (d.type === "start") {
                                            histogramData[hour].bikeOut += 1;
                                            bikesInTotalCounts += 1;
                                        } else {
                                            histogramData[hour].bikeIn += 1;
                                            bikesOutTotalCounts += 1;
                                        }
                                    } else {
                                        histogramData[hour] = { hour, bikeIn: 0, bikeOut: 0 };
                                    }
                                });
                                histogram.updateDay(histogramData);
                            }

                            document.querySelector(".date").innerHTML = `${startDate.toDateString()} - ${dailyCounts[state.currentDay]} trips - 
                            <span class="bikesIn">${bikesInTotalCounts} arrivals</span> - <span class="bikesOut">${bikesOutTotalCounts} departures</span>`;
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

                                        if (stationsInOutData && stationsLayer) {
                                            const changedStations = stationsInOutData.filter((d) => {
                                                const time = new Date(d.time);
                                                return time.getTime() < value.end.getTime() && time.getTime() > startDate.getTime();
                                            });
                                            stationsLayer.updateGraphics(changedStations);
                                        }
                                    }
                                );

                                watch(() => timeSlider.viewModel.state, (value) => {
                                    if (value === "playing") {
                                        state.currentStation = 0;
                                        stationInfoContainer.style.display = 'none';
                                        renderNode.requestRender();
                                    }
                                });

                            }
                            timeSlider.play();
                    }
                }

            }
        });

    }).catch(error => console.log(error));

    Papa.parse("./bike-station-information-cambridge.csv", {
        delimiter: ",", download: true, header: true, dynamicTyping: true, complete: (result) => {
            const stations: Array<Station> = result.data.map((d: InputStation) => {
                return {
                    id: d.Number,
                    name: d.Name,
                    lat: d.Latitude,
                    lng: d.Longitude
                }
            });
            stationsLayer = new StationsLayer(stations);
            view.map.add(stationsLayer);
            view.on("pointer-move", (event) => {
                view.hitTest(event, { include: [stationsLayer] }).then((response) => {
                    if (response.results.length) {
                        view.container.style.cursor = "pointer";
                        tooltipContainer.style.display = "block";
                        tooltipContainer.style.left = `${event.x + 10}px`;
                        tooltipContainer.style.top = `${event.y - 10}px`;
                        tooltipContainer.innerHTML = response.results[0].graphic.attributes.name;
                    } else {
                        view.container.style.cursor = "default";
                        tooltipContainer.style.display = "none";
                        tooltipContainer.innerHTML = "";
                    }
                });
            });
            let timeSliderWasPlaying = false;
            view.on("click", (event) => {
                view.hitTest(event, { include: [stationsLayer] }).then((response) => {
                    if (response.results.length) {
                        const graphic = response.results[0].graphic;
                        state.currentStation = getStationIdInteger(graphic.attributes.id);
                        const { arrivals, departures } = getStationArrivalsAndDepartures(graphic.attributes.id);
                        stationInfoContainer.innerHTML = `<p class="title">${graphic.attributes.name}</p>
                        <p class="date">${startDate.toDateString()}</p>
                        <div class="bikeInfo">
                        <div class="bikesIn"><span class="count">${arrivals.length}</span><span>arrivals</span></div>
                        <div class="bikesOut"><span class="count">${departures.length}</span><span>departures</span></div>
                        </div>`;
                        stationInfoContainer.style.display = 'block';
                        if (timeSlider.viewModel.state === "playing") {
                            timeSlider.stop();
                            timeSliderWasPlaying = true;
                        } else {
                            timeSliderWasPlaying = false;
                        }
                    } else {
                        state.currentStation = 0;
                        if (timeSliderWasPlaying) {
                            timeSlider.play();
                        }
                        stationInfoContainer.style.display = 'none';
                    }

                    renderNode.requestRender();
                });
            });
        }
    });

    Papa.parse("./202401-stationdata-cambridge.csv", {
        delimiter: ",", download: true, header: true, dynamicTyping: true, complete: (result) => {
            stationsInOutData = result.data as Array<InOutData>;
            console.log(stationsInOutData);
        }
    });

    const getStationArrivalsAndDepartures = (stationId: number) => {
        const arrivals = state.dailyBikeTrips.filter((d) => d.stationID === stationId && d.type === "end");
        const departures = state.dailyBikeTrips.filter((d) => d.stationID === stationId && d.type === "start");
        return { arrivals, departures };
    };

} catch (error) {
    console.error(error);
}
