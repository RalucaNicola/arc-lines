import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import { InOutData, Station } from "./types";
import { Point } from "@arcgis/core/geometry";
import Graphic from "@arcgis/core/Graphic";
import { IconSymbol3DLayer, PointSymbol3D } from "@arcgis/core/symbols";


const padding = 5;
const symbolSize = 30;

function getSymbol(bikesIn: number, bikesOut: number) {
    const canvas = document.createElement("canvas");
    canvas.width = symbolSize;
    canvas.height = symbolSize + bikesIn + bikesOut + padding * 2;

    const context = canvas.getContext("2d");
    context.fillStyle = "rgba(255, 255, 255, 0.6)";
    context.fillRect(0, bikesIn + padding, symbolSize, symbolSize);

    context.fillStyle = "rgb(245, 66, 173)";
    context.fillRect(0, 0, symbolSize, bikesIn);

    context.fillStyle = "rgb(3, 215, 252)";
    context.fillRect(0, symbolSize + bikesIn + padding * 2, symbolSize, bikesOut);

    return new PointSymbol3D({
        symbolLayers: [new IconSymbol3DLayer({
            resource: { href: canvas.toDataURL("image/png") },
            material: { color: [255, 255, 255, 1] },
            anchor: "bottom",
            size: 10
        })]
    });
}

class StationsLayer extends GraphicsLayer {
    constructor(stations: Station[]) {
        super();
        stations.forEach((station) => {
            const geometry = new Point({
                longitude: station.lng,
                latitude: station.lat,
                spatialReference: { wkid: 4326 }
            });
            const graphic = new Graphic({
                geometry,
                symbol: getSymbol(0, 0),
                attributes: {
                    name: station.name,
                    id: station.id
                }
            });
            this.add(graphic);
        });

    }

    updateGraphics(stationsInOut: Array<InOutData>) {

        if (stationsInOut.length === 0) {
            this.graphics.forEach((graphic) => {
                graphic.symbol = getSymbol(0, 0);
            });
        } else {
            const stations = new Set(stationsInOut.map((station) => station.stationID));
            stations.forEach((stationID) => {
                const graphic = this.graphics.find((g) => g.attributes.id === stationID);
                if (graphic) {
                    const bikesIn = stationsInOut.filter((s) => s.stationID === stationID && s.type === "end").length;
                    const bikesOut = stationsInOut.filter((s) => s.stationID === stationID && s.type === "end").length;;
                    graphic.symbol = getSymbol(bikesIn, bikesOut);
                }
            });
        }

    }
}

export default StationsLayer;