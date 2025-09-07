
import React from "react";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export default function GanttChart({ processes, algorithm }) {
  const labels = processes.map((p) => `P${p.pid}`);
  const data = {
    labels,
    datasets: [
      {
        label: `${algorithm} Schedule`,
        data: processes.map((p) => p.ct), // completion time as bar height
        backgroundColor: "rgba(75, 192, 192, 0.6)",
      },
    ],
  };

  return (
    <div style={{ width: "600px", margin: "20px auto" }}>
      <h3>{algorithm} - Gantt Chart</h3>
      <Bar data={data} />
    </div>
  );
}
