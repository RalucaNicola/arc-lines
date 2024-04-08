import Color from "@arcgis/core/Color";

export function createShader(gl: WebGL2RenderingContext, src: string, type: number): WebGLShader | null {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        alert("Error compiling shader: " + gl.getShaderInfoLog(shader));
        return;
    }
    return shader;
}

export function createProgram(
    gl: WebGL2RenderingContext,
    vsSource: string,
    fsSource: string
): WebGLProgram {
    const program = gl.createProgram();
    if (!program) {
        console.error("Failed to create program");
    }
    const vertexShader = createShader(gl, vsSource, gl.VERTEX_SHADER);
    gl.attachShader(program, vertexShader);
    const fragmentShader = createShader(gl, fsSource, gl.FRAGMENT_SHADER);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    const success = gl.getProgramParameter(program, gl.LINK_STATUS);
    if (!success) {
        console.error("Failed to link program: " + gl.getProgramInfoLog(program));
    }
    return program;
}

export function getColor(count: number): Color {
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

export const dateToString = (date: Date) => {
    return new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "numeric",
        hour12: true,
    }).format(date);
};

export const getStationIdInteger = (stationId: string) => {
    return parseInt(`${stationId.charCodeAt(0)}${stationId.slice(1)}`);
}