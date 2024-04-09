import { HistogramInfo } from "./types";

class Histogram {
    container: HTMLElement;

    constructor(container: HTMLElement) {
        this.container = container;

        for (let i = 0; i < 24; i++) {
            const hourContainer = document.createElement("div");
            hourContainer.setAttribute("data-hour", i.toString());
            hourContainer.style.margin = "0 2px";
            this.container.appendChild(hourContainer);
            const bikeOut = document.createElement("div");
            bikeOut.style.width = `100%`;
            bikeOut.style.backgroundColor = "rgb(255, 115, 8)";
            hourContainer.appendChild(bikeOut);
            const bikeIn = document.createElement("div");
            bikeIn.style.width = `100%`;
            bikeIn.style.backgroundColor = "rgb(3, 215, 252)";
            hourContainer.appendChild(bikeIn);
        }
    }

    updateHour = (hour: number, bikeIn: number, bikeOut: number) => {
        const hourContainer = this.container.querySelector(`[data-hour="${hour}"]`);
        const bikeInElement = hourContainer.children[0] as HTMLElement;
        bikeInElement.setAttribute("data-bike-in", bikeIn.toString());
        bikeInElement.style.height = `${bikeIn / 5}px`;
        const bikeOutElement = hourContainer.children[1] as HTMLElement;
        bikeOutElement.style.height = `${bikeOut / 5}px`;
        bikeOutElement.setAttribute("data-bike-out", bikeOut.toString());
    }

    updateDay(histogramData: HistogramInfo[]) {
        histogramData.forEach(({ hour, bikeIn, bikeOut }) => {
            this.updateHour(hour, bikeIn, bikeOut);
        });

    }
}

export default Histogram;