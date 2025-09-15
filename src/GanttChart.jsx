import React from "react";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from "chart.js";
import { Bar } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export default function GanttChart({ processes, algorithm }) {
  // Convert processes into timeline data (start → completion)
  const labels = processes.map((p) => `P${p.pid}`);

  const datasets = [
    {
      label: `${algorithm} Execution`,
      data: processes.map((p) => [p.start || p.arrival, p.ct]), // [start, end]
      backgroundColor: "rgba(75, 192, 192, 0.8)",
      borderColor: "rgba(0,0,0,0.6)",
      borderWidth: 1,
      borderSkipped: false,
    },
  ];

  const data = {
    labels,
    datasets,
  };

  const options = {
    indexAxis: "y", // horizontal bars
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        beginAtZero: true,
        title: {
          display: true,
          text: "Time",
        },
      },
      y: {
        title: {
          display: true,
          text: "Processes",
        },
      },
    },
    plugins: {
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const [start, end] = ctx.raw;
            return `Start: ${start}, End: ${end}`;
          },
        },
      },
    },
  };

  return (
    <div style={{ width: "100%", height: "300px", marginTop: "20px" }}>
      <h3 style={{ textAlign: "center" }}>{algorithm} - Gantt Chart</h3>
      <Bar data={data} options={options} />
    </div>
  );
}
