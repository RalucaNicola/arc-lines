import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import { InOutData, Station } from "./types";
import { Point } from "@arcgis/core/geometry";
import Graphic from "@arcgis/core/Graphic";
import Mesh from "@arcgis/core/geometry/Mesh";
import { FillSymbol3DLayer, MeshSymbol3D } from "@arcgis/core/symbols";


// a 3D bar symbol
const barSymbol = new MeshSymbol3D({
    symbolLayers: [
        new FillSymbol3DLayer({
            material: { color: [255, 255, 255, 1] },
        }),
    ]
});

const createGeometry = (origin: Point, topColor: number[], baseColor: number[]) => {
    const geometry = Mesh.createCylinder(origin, {
        size: { height: 1, width: 30, depth: 30 },
        //@ts-ignore
        useTransform: true,
        vertexSpace: "local",
        densificationFactor: 1,
    });

    const coordinateColors = [];

    const vertexNo = geometry.vertexAttributes.position.length / 3;

    for (let i = 0; i < vertexNo; i++) {
        if (i < vertexNo / 2) {
            coordinateColors.push(topColor);
        } else {
            coordinateColors.push(baseColor);
        }
    }

    const colorVertices = Uint8Array.from(coordinateColors.flat());
    geometry.vertexAttributes.color = colorVertices;

    return geometry;
};


// a symbol based on a canvas

// const padding = 5;
// const symbolSize = 30;

// function getSymbol(bikesIn: number, bikesOut: number) {
//     bikesIn = bikesIn ** 2;
//     bikesOut = bikesOut ** 2;
//     const canvas = document.createElement("canvas");
//     canvas.width = symbolSize;
//     canvas.height = symbolSize + bikesIn + bikesOut + padding * 2;

//     const context = canvas.getContext("2d");
//     context.fillStyle = "rgba(255, 255, 255, 0.6)";
//     context.fillRect(0, bikesIn + padding, symbolSize, symbolSize);

//     context.fillStyle = "rgb(3, 215, 252)";
//     context.fillRect(0, 0, symbolSize, bikesIn);

//     context.fillStyle = "rgb(245, 66, 173)";
//     context.fillRect(0, symbolSize + bikesIn + padding * 2, symbolSize, bikesOut);

//     return new PointSymbol3D({
//         symbolLayers: [new IconSymbol3DLayer({
//             resource: { href: canvas.toDataURL("image/png") },
//             material: { color: [255, 255, 255, 1] },
//             anchor: "bottom",
//             size: 20
//         })]
//     });
// }

const inColor = [3, 215, 252, 255];
const outColor = [245, 66, 173, 255];
const betweenColor = [250, 250, 250, 255];
class StationsLayer extends GraphicsLayer {

    stations: Station[];

    constructor(stations: Station[]) {
        super();
        this.stations = stations;
        stations.forEach((station) => {
            const origin = new Point({
                longitude: station.lng,
                latitude: station.lat,
                z: 0,
                spatialReference: { wkid: 4326 }
            });
            const inGraphic = new Graphic({
                geometry: createGeometry(origin, betweenColor, inColor),
                symbol: barSymbol,
                attributes: {
                    name: station.name,
                    id: station.id,
                    type: 'in'
                }
            });
            const outGraphic = new Graphic({
                geometry: createGeometry(origin, outColor, betweenColor),
                symbol: barSymbol,
                attributes: {
                    name: station.name,
                    id: station.id,
                    type: 'out'
                }
            });
            this.addMany([inGraphic, outGraphic]);
        });
        this.elevationInfo = {
            mode: "absolute-height",
            offset: 0,
        }
    }

    updateGraphics(stationsInOut: Array<InOutData>) {
        console.log("updating graphics")
        this.stations.forEach((station) => {
            const inGraphic = this.graphics.find((g) => g.attributes.id === station.id && g.attributes.type === "in");
            const outGraphic = this.graphics.find((g) => g.attributes.id === station.id && g.attributes.type === "out");
            const bikesIn = stationsInOut.filter((s) => s.stationID === station.id && s.type === "end").length;
            const bikesOut = stationsInOut.filter((s) => s.stationID === station.id && s.type === "start").length;
            (inGraphic.geometry as Mesh).transform.scale = [1, 1, bikesIn > 0 ? bikesIn : 1];
            //@ts-ignore
            inGraphic.notifyMeshTransformChanged({ action: 2 });

            (outGraphic.geometry as Mesh).transform.scale = [1, 1, bikesOut > 0 ? bikesOut : 1];
            (outGraphic.geometry as Mesh).transform.translation = [0, 0, bikesIn > 0 ? bikesIn : 1];
            //@ts-ignore
            outGraphic.notifyMeshTransformChanged({ action: 2 });
        });

    }
}
export default StationsLayer;