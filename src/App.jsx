import React, { useState } from "react";
import GanttChart from "./GanttChart";

function App() {
  const [processes, setProcesses] = useState([]);
  const [pid, setPid] = useState("");
  const [arrival, setArrival] = useState("");
  const [burst, setBurst] = useState("");
  const [priority, setPriority] = useState("");
  const [quantum, setQuantum] = useState(""); // RR time quantum
  const [results, setResults] = useState({});
  const [showTable, setShowTable] = useState(false);

  // Add process
  const addProcess = () => {
    if (!pid || !arrival || !burst) return;
    setProcesses([
      ...processes,
      {
        pid,
        arrival: parseInt(arrival),
        burst: parseInt(burst),
        priority: priority ? parseInt(priority) : 0,
      },
    ]);
    setPid("");
    setArrival("");
    setBurst("");
    setPriority("");
  };

  // Helper to calculate metrics (non-preemptive)
  const calculateMetrics = (seq) => {
    let time = 0;
    let result = [];
    seq.forEach((p) => {
      time = Math.max(time, p.arrival);
      let start = time;
      let ct = start + p.burst;
      let tat = ct - p.arrival;
      let wt = tat - p.burst;
      result.push({ ...p, start, ct, tat, wt });
      time = ct;
    });
    return result;
  };

  // Round Robin (RR)
  const roundRobin = (procs, quantum) => {
    let queue = [];
    let time = 0;
    let result = [];
    let remaining = procs.map((p) => ({ ...p, rem: p.burst }));
    while (remaining.length > 0 || queue.length > 0) {
      // Add available processes to queue
      remaining = remaining.filter((p) => {
        if (p.arrival <= time) {
          queue.push({ ...p });
          return false;
        }
        return true;
      });

      if (queue.length === 0) {
        time++;
        continue;
      }

      let current = queue.shift();
      let execTime = Math.min(current.rem, quantum);
      let start = time;
      time += execTime;
      current.rem -= execTime;

      result.push({
        ...current,
        burst: execTime, // executed slice
        start,
        ct: time,
      });

      if (current.rem > 0) {
        // still needs CPU, push back
        queue.push(current);
      } else {
        // finished process
        current.tat = current.ct - current.arrival;
        current.wt = current.tat - (current.burst + execTime - current.rem);
      }
    }

    // Merge slices into per-process metrics
    let final = [];
    procs.forEach((p) => {
      let slices = result.filter((r) => r.pid === p.pid);
      let ct = slices[slices.length - 1].ct;
      let tat = ct - p.arrival;
      let wt = tat - p.burst;
      final.push({ ...p, ct, tat, wt });
    });
    return final;
  };

  // SRTF (Shortest Remaining Time First)
  const srtf = (procs) => {
    let time = 0;
    let completed = [];
    let remaining = procs.map((p) => ({ ...p, rem: p.burst }));
    let gantt = [];

    while (remaining.length > 0) {
      let available = remaining.filter((p) => p.arrival <= time);
      if (available.length === 0) {
        time++;
        continue;
      }

      available.sort((a, b) => a.rem - b.rem);
      let current = available[0];
      let start = time;
      time++;
      current.rem--;

      gantt.push({ ...current, start, ct: time, burst: 1 });

      if (current.rem === 0) {
        let ct = time;
        let tat = ct - current.arrival;
        let wt = tat - current.burst;
        completed.push({ ...current, ct, tat, wt });
        remaining = remaining.filter((p) => p.pid !== current.pid);
      }
    }

    return completed;
  };

  // Run all algorithms
  const runAlgorithms = () => {
    if (processes.length === 0) return;

    // FCFS
    let fcfsSeq = [...processes].sort((a, b) => a.arrival - b.arrival);
    let fcfsRes = calculateMetrics(fcfsSeq);

    // SJF
    let sjfSeq = [];
    let sjfProcs = [...processes];
    let time = 0;
    while (sjfProcs.length > 0) {
      let available = sjfProcs.filter((p) => p.arrival <= time);
      if (available.length === 0) {
        time = Math.min(...sjfProcs.map((p) => p.arrival));
        continue;
      }
      available.sort((a, b) => a.burst - b.burst);
      let next = available[0];
      sjfSeq.push(next);
      time = Math.max(time, next.arrival) + next.burst;
      sjfProcs = sjfProcs.filter((p) => p !== next);
    }
    let sjfRes = calculateMetrics(sjfSeq);

    // Priority
    let prioSeq = [];
    let prioProcs = [...processes];
    time = 0;
    while (prioProcs.length > 0) {
      let available = prioProcs.filter((p) => p.arrival <= time);
      if (available.length === 0) {
        time = Math.min(...prioProcs.map((p) => p.arrival));
        continue;
      }
      available.sort((a, b) => a.priority - b.priority);
      let next = available[0];
      prioSeq.push(next);
      time = Math.max(time, next.arrival) + next.burst;
      prioProcs = prioProcs.filter((p) => p !== next);
    }
    let prioRes = calculateMetrics(prioSeq);

    // RR
    let rrRes = quantum ? roundRobin(processes, parseInt(quantum)) : [];

    // SRTF
    let srtfRes = srtf(processes);

    setResults({
      FCFS: fcfsRes,
      SJF: sjfRes,
      Priority: prioRes,
      ...(quantum ? { "Round Robin": rrRes } : {}),
      SRTF: srtfRes,
    });
    setShowTable(true);
  };

  const avg = (arr, field) =>
    (arr.reduce((sum, p) => sum + p[field], 0) / arr.length).toFixed(2);

  return (
    <div style={{ padding: "20px", fontFamily: "Arial" }}>
      <h1>CPU Scheduling Simulator</h1>

      {/* Input Form */}
      <div>
        <input
          placeholder="PID"
          value={pid}
          onChange={(e) => setPid(e.target.value)}
        />
        <input
          type="number"
          placeholder="Arrival"
          value={arrival}
          onChange={(e) => setArrival(e.target.value)}
        />
        <input
          type="number"
          placeholder="Burst"
          value={burst}
          onChange={(e) => setBurst(e.target.value)}
        />
        <input
          type="number"
          placeholder="Priority"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
        />
        <input
          type="number"
          placeholder="Time Quantum (RR)"
          value={quantum}
          onChange={(e) => setQuantum(e.target.value)}
        />
        <button onClick={addProcess}>Add Process</button>
        <button onClick={runAlgorithms}>Run</button>
      </div>

      {/* Show process list */}
      <h3>Processes:</h3>
      <ul>
        {processes.map((p, i) => (
          <li key={i}>
            {p.pid} | AT: {p.arrival} | BT: {p.burst} | P: {p.priority}
          </li>
        ))}
      </ul>

      {/* Results */}
      {showTable &&
        Object.keys(results).map((alg) => (
          <div key={alg} style={{ marginTop: "20px" }}>
            <h2>{alg}</h2>
            <table border="1" cellPadding="5">
              <thead>
                <tr>
                  <th>PID</th>
                  <th>AT</th>
                  <th>BT</th>
                  <th>P</th>
                  <th>CT</th>
                  <th>TAT</th>
                  <th>WT</th>
                </tr>
              </thead>
              <tbody>
                {results[alg].map((p, i) => (
                  <tr key={i}>
                    <td>{p.pid}</td>
                    <td>{p.arrival}</td>
                    <td>{p.burst}</td>
                    <td>{p.priority}</td>
                    <td>{p.ct}</td>
                    <td>{p.tat}</td>
                    <td>{p.wt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>
              Avg TAT: {avg(results[alg], "tat")} | Avg WT:{" "}
              {avg(results[alg], "wt")}
            </p>
            <GanttChart processes={results[alg]} algorithm={alg} />
          </div>
        ))}
    </div>
  );
}

export default App;
