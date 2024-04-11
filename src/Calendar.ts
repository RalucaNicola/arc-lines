import { state } from "./State";
import { getColor } from "./utils";

export function generateCalendar(worker: Worker, dailyCounts: Array<number>) {
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
        day.setAttribute("data-day", i.toString());
        const color = getColor(dailyCounts[i]);
        day.style.backgroundColor = color.toCss();
        day.addEventListener("click", () => {
            state.currentDay = i;
            worker.postMessage({ type: "get-daily-data", day: state.currentDay });
            document.querySelectorAll(".day").forEach((day) => {
                day.classList.remove("selected");
            });
            day.classList.add("selected");
        });
        week.appendChild(day);
    }
}