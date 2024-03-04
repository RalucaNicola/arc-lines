import WebScene from "@arcgis/core/WebScene";
import { subclass } from "@arcgis/core/core/accessorSupport/decorators";
import ManagedFBO from "@arcgis/core/views/3d/webgl/ManagedFBO";
import RenderNode from "@arcgis/core/views/3d/webgl/RenderNode";
import SceneView from "@arcgis/core/views/SceneView";
import { createProgram } from "./utils";
import * as webgl from "@arcgis/core/views/3d/webgl";
import SpatialReference from "@arcgis/core/geometry/SpatialReference";
import Papa from "papaparse";
import * as webMercatorUtils from "@arcgis/core/geometry/support/webMercatorUtils";
import { watch, whenOnce } from "@arcgis/core/core/reactiveUtils";
import TimeSlider from "@arcgis/core/widgets/TimeSlider";
import { Vertex, Trip } from "./types";
import TimeExtent from "@arcgis/core/TimeExtent";
import Color from "@arcgis/core/Color";
import Slider from "@arcgis/core/widgets/Slider";

const NO_SEG = 30;
const NO_POSITION_COORDS = 3;
const NO_COLOR_COORDS = 4;

let startDate: Date = null;
let endDate: Date = null;
let currentTime: number = null;
let vertices: Array<Vertex> = null;
let renderNode: GeometryRenderNode = null;
let timeSlider: TimeSlider = null;
let dailyCounts: Array<number> = null;
let currentDay: number = 1;

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

@subclass("esri.views.3d.GeometryRenderNode")
class GeometryRenderNode extends RenderNode {
    consumes: __esri.ConsumedNodes = { required: ["transparent-color"] };
    produces: __esri.RenderNodeOutput = "transparent-color";

    program: WebGLProgram;

    attribPositionLocation: number;
    attribColorLocation: number;
    attribTimeLocation: number;
    attribEndTimeLocation: number;
    uniformCurrentTimeLocation: WebGLUniformLocation;
    uniformProjectionMatrixLocation: WebGLUniformLocation;
    uniformModelViewMatrixLocation: WebGLUniformLocation;

    vboPositions: WebGLBuffer;
    vboColor: WebGLBuffer;
    vboTime: WebGLBuffer;
    vboEndTime: WebGLBuffer;

    initialize() {
        this.initShaders();
        this.initData();
    }

    override render(inputs: ManagedFBO[]): ManagedFBO {

        const output = this.bindRenderTarget();
        const gl = this.gl;
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.CULL_FACE);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.vboPositions);
        gl.enableVertexAttribArray(this.attribPositionLocation);
        gl.vertexAttribPointer(this.attribPositionLocation, 3, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.vboColor);
        gl.enableVertexAttribArray(this.attribColorLocation);
        gl.vertexAttribPointer(this.attribColorLocation, 4, gl.UNSIGNED_BYTE, true, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.vboTime);
        gl.enableVertexAttribArray(this.attribTimeLocation);
        gl.vertexAttribPointer(this.attribTimeLocation, 1, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.vboEndTime);
        gl.enableVertexAttribArray(this.attribEndTimeLocation);
        gl.vertexAttribPointer(this.attribEndTimeLocation, 1, gl.FLOAT, false, 0, 0);

        gl.useProgram(this.program);

        gl.uniform1f(this.uniformCurrentTimeLocation, currentTime);

        gl.uniformMatrix4fv(
            this.uniformProjectionMatrixLocation,
            false,
            this.camera.projectionMatrix
        );

        gl.uniformMatrix4fv(
            this.uniformModelViewMatrixLocation,
            false,
            this.camera.viewMatrix
        );

        for (let i = 0; i <= vertices.length; i += NO_SEG) {
            gl.drawArrays(gl.LINE_STRIP, i, NO_SEG);
        }
        this.resetWebGLState();
        return output;
    }

    initShaders() {
        const gl = this.gl;

        // Initialize shaders
        const vsSource = `#version 300 es
        in vec4 a_position;
        in vec4 a_color;
        in float a_time;
        in float a_endTime;
        uniform float u_currentTime;
        uniform mat4 u_projectionMatrix;
        uniform mat4 u_modelViewMatrix;

        out vec4 v_color;

        void main() {
            float alpha;
            float timeDiff = u_currentTime - a_endTime;
            gl_Position = u_projectionMatrix * u_modelViewMatrix * a_position;
            if ( timeDiff > 360000.0) {
                alpha = max(0.1, 0.1 - 0.9 * (timeDiff - 600000.0) / 240000.0);
            } else {
                if (a_time - u_currentTime > 0.0) {
                    alpha = 0.0;
                } else {
                    alpha = 1.0;
                }
            }
            
            v_color = vec4(a_color.xyz, alpha);
        }
    `;

        const fsSource = `#version 300 es
        precision highp float;
        in vec4 v_color;    
        out vec4 fragColor;
        void main() {
            fragColor = v_color;
        }
    `;

        // Setup GLSL program
        this.program = createProgram(gl, vsSource, fsSource);
        if (!this.program) {
            alert("Could not initialize shaders");
        }

        // get program attributes locations
        this.attribPositionLocation = gl.getAttribLocation(this.program, "a_position");
        this.attribColorLocation = gl.getAttribLocation(this.program, "a_color");
        this.attribTimeLocation = gl.getAttribLocation(this.program, "a_time");
        this.attribEndTimeLocation = gl.getAttribLocation(this.program, "a_endTime");
        // get program uniforms locations
        this.uniformCurrentTimeLocation = gl.getUniformLocation(this.program, "u_currentTime");
        this.uniformProjectionMatrixLocation = gl.getUniformLocation(this.program, "u_projectionMatrix");
        this.uniformModelViewMatrixLocation = gl.getUniformLocation(this.program, "u_modelViewMatrix");
    }

    initData() {
        const gl = this.gl;
        const numPoints = vertices.length;
        let positions = new Float32Array(numPoints * NO_POSITION_COORDS);
        let colors = new Float32Array(numPoints * NO_COLOR_COORDS);
        let times = new Float32Array(numPoints);
        let endTimes = new Float32Array(numPoints);

        for (let i = 0; i < numPoints; i++) {
            const { x, y, z, color, time, endTime } = vertices[i];
            const renderCoords = webgl.toRenderCoordinates(view, [x, y, z], 0, SpatialReference.WebMercator, new Float32Array(3), 0, 1);
            for (let j = 0; j < NO_POSITION_COORDS; j++) {
                positions[i * NO_POSITION_COORDS + j] = renderCoords[j];
            }
            for (let j = 0; j < NO_COLOR_COORDS; j++) {
                colors[i * NO_COLOR_COORDS + j] = color[j];
            }
            times[i] = time;
            endTimes[i] = endTime;
        }

        this.vboPositions = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vboPositions);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

        this.vboColor = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vboColor);
        gl.bufferData(gl.ARRAY_BUFFER, new Uint8Array(colors), gl.STATIC_DRAW);

        this.vboTime = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vboTime);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(times), gl.STATIC_DRAW);

        this.vboEndTime = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vboEndTime);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(endTimes), gl.STATIC_DRAW);
    }
}


const currentTimeContainer = document.getElementById("currentTime");
const dateToString = (date: Date) => {
    return new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "numeric",
        hour12: true,
    }).format(date);
};

const getColor = (count: number): Color => {
    const stops = [
        { value: 500, color: new Color("#555") },
        { value: 4000, color: new Color("#03a9fc") }
    ];
    for (let i = 0; i < stops.length; i++) {
        const stop = stops[i];

        if (count < stop.value) {
            if (i === 0) {
                return stop.color;
            }

            const prev = stops[i - 1];

            const weight = (count - prev.value) / (stop.value - prev.value);
            return Color.blendColors(prev.color, stop.color, weight);
        }
    }

    return stops[stops.length - 1].color;
}



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
                            dataProcessingWorker.postMessage({ type: "get-daily-data", day: currentDay });
                            break;
                        case "get-daily-data":
                            startDate = new Date(e.data.data.startDate);
                            endDate = new Date(e.data.data.endDate);
                            currentTime = startDate.getTime() - startDate.getTime();
                            vertices = e.data.data.vertices;
                            if (renderNode) {
                                renderNode.initData();
                            } else {
                                renderNode = new GeometryRenderNode({ view });
                            }
                            document.querySelector(".date").innerHTML = `${startDate.toDateString()} - ${dailyCounts[currentDay]} trips`;
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
                                        currentTime = value.end.getTime() - startDate.getTime();
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
                        if (i === currentDay) {
                            day.classList.add("selected");
                        }
                        day.innerHTML = `${i}`;
                        const color = getColor(dailyCounts[i]);
                        day.style.backgroundColor = color.toCss();
                        day.addEventListener("click", () => {
                            currentDay = i;
                            dataProcessingWorker.postMessage({ type: "get-daily-data", day: currentDay });
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
