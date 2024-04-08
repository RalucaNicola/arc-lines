import { subclass } from "@arcgis/core/core/accessorSupport/decorators";
import ManagedFBO from "@arcgis/core/views/3d/webgl/ManagedFBO";
import RenderNode from "@arcgis/core/views/3d/webgl/RenderNode";
import { createProgram, getStationIdInteger } from "./utils";
import * as webgl from "@arcgis/core/views/3d/webgl";
import SpatialReference from "@arcgis/core/geometry/SpatialReference";
import { Vertex } from "./types";
import { state } from "./State";

const NO_SEG = 30;
const NO_POSITION_COORDS = 3;
const NO_COLOR_COORDS = 4;

@subclass("esri.views.3d.GeometryRenderNode")
class ArcLinesRenderNode extends RenderNode {
    consumes: __esri.ConsumedNodes = { required: ["transparent-color"] };
    produces: __esri.RenderNodeOutput = "transparent-color";

    program: WebGLProgram;

    attribPositionLocation: number;
    attribColorLocation: number;
    attribTimeLocation: number;
    attribEndTimeLocation: number;
    attribStartStationLocation: number;
    attribEndStationLocation: number;
    uniformCurrentTimeLocation: WebGLUniformLocation;
    uniformProjectionMatrixLocation: WebGLUniformLocation;
    uniformModelViewMatrixLocation: WebGLUniformLocation;
    uniformCurrentStationLocation: WebGLUniformLocation;

    vboPositions: WebGLBuffer;
    vboColor: WebGLBuffer;
    vboTime: WebGLBuffer;
    vboEndTime: WebGLBuffer;
    vboStartLocations: WebGLBuffer;
    vboEndLocations: WebGLBuffer;
    vertices: Array<Vertex>;

    constructor({ vertices, view }: { vertices: Array<Vertex>, view: __esri.SceneView }) {
        super();
        this.vertices = vertices;
        this.view = view;
    }

    initialize() {
        this.initShaders();
        this.initData(this.vertices);
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

        gl.bindBuffer(gl.ARRAY_BUFFER, this.vboStartLocations);
        gl.enableVertexAttribArray(this.attribStartStationLocation);
        gl.vertexAttribPointer(this.attribStartStationLocation, 1, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.vboEndLocations);
        gl.enableVertexAttribArray(this.attribEndStationLocation);
        gl.vertexAttribPointer(this.attribEndStationLocation, 1, gl.FLOAT, false, 0, 0);

        gl.useProgram(this.program);

        gl.uniform1f(this.uniformCurrentTimeLocation, state.currentTime);

        gl.uniform1f(this.uniformCurrentStationLocation, state.currentStation);

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

        for (let i = 0; i <= this.vertices.length; i += NO_SEG) {
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
        in float a_startStation;
        in float a_endStation;
        uniform float u_currentStation;
        uniform float u_currentTime;
        uniform mat4 u_projectionMatrix;
        uniform mat4 u_modelViewMatrix;

        out vec4 v_color;

        void main() {
            float alpha;
            float timeDiff = u_currentTime - a_endTime;
            gl_Position = u_projectionMatrix * u_modelViewMatrix * a_position;
            if (u_currentStation == 0.0) {
                if ( timeDiff > 360000.0) {
                    alpha = max(0.05, 0.1 - 0.9 * (timeDiff - 600000.0) / 240000.0);
                } else {
                    if (a_time - u_currentTime > 0.0) {
                        alpha = 0.0;
                    } else {
                        alpha = 1.0;
                    }
                }
            } else {
                if ((a_startStation == u_currentStation) || (a_endStation == u_currentStation)) {
                    alpha = 1.0;
                } else {
                    alpha = 0.0;
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
        this.attribStartStationLocation = gl.getAttribLocation(this.program, "a_startStation");
        this.attribEndStationLocation = gl.getAttribLocation(this.program, "a_endStation");
        // get program uniforms locations
        this.uniformCurrentTimeLocation = gl.getUniformLocation(this.program, "u_currentTime");
        this.uniformProjectionMatrixLocation = gl.getUniformLocation(this.program, "u_projectionMatrix");
        this.uniformModelViewMatrixLocation = gl.getUniformLocation(this.program, "u_modelViewMatrix");
        this.uniformCurrentStationLocation = gl.getUniformLocation(this.program, "u_currentStation");
    }

    initData(vertices: Array<Vertex>) {
        const gl = this.gl;
        this.vertices = vertices;
        const numPoints = vertices.length;
        let positions = new Float32Array(numPoints * NO_POSITION_COORDS);
        let colors = new Uint8Array(numPoints * NO_COLOR_COORDS);
        let times = new Float32Array(numPoints);
        let endTimes = new Float32Array(numPoints);
        let startLocations = new Float32Array(numPoints);
        let endLocations = new Float32Array(numPoints);

        for (let i = 0; i < numPoints; i++) {
            const { x, y, z, color, time, endTime, startStationId, endStationId } = vertices[i];
            const renderCoords = webgl.toRenderCoordinates(this.view, [x, y, z], 0, SpatialReference.WebMercator, new Float32Array(3), 0, 1);
            for (let j = 0; j < NO_POSITION_COORDS; j++) {
                positions[i * NO_POSITION_COORDS + j] = renderCoords[j];
            }
            for (let j = 0; j < NO_COLOR_COORDS; j++) {
                colors[i * NO_COLOR_COORDS + j] = color[j];
            }
            times[i] = time;
            endTimes[i] = endTime;
            startLocations[i] = getStationIdInteger(startStationId);
            endLocations[i] = getStationIdInteger(endStationId);
        }

        this.vboPositions = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vboPositions);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

        this.vboColor = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vboColor);
        gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);

        this.vboTime = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vboTime);
        gl.bufferData(gl.ARRAY_BUFFER, times, gl.STATIC_DRAW);

        this.vboEndTime = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vboEndTime);
        gl.bufferData(gl.ARRAY_BUFFER, endTimes, gl.STATIC_DRAW);

        this.vboStartLocations = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vboStartLocations);
        gl.bufferData(gl.ARRAY_BUFFER, startLocations, gl.STATIC_DRAW);

        this.vboEndLocations = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vboEndLocations);
        gl.bufferData(gl.ARRAY_BUFFER, endLocations, gl.STATIC_DRAW);
    }
}

export default ArcLinesRenderNode;