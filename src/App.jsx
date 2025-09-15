import React, { useState, useRef } from "react";
import GanttChart from "./GanttChart";

function App() {
  const [processes, setProcesses] = useState([]);
  const [pid, setPid] = useState("");
  const [arrival, setArrival] = useState("");
  const [burst, setBurst] = useState("");
  const [priority, setPriority] = useState("");
  const [quantum, setQuantum] = useState("");
  const [results, setResults] = useState({});
  const [showTable, setShowTable] = useState(false);

  // Keep previous TQ for smoothing across runs (ref so it persists without re-render glitches)
  const prevTQRef = useRef(10);

  // Add process
  const addProcess = () => {
    if (!pid || arrival === "" || burst === "") return;
    setProcesses([
      ...processes,
      {
        pid: pid.toString(),
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

  // Round Robin (existing implementation) - uses given quantum (ms)
  const roundRobin = (procs, quantum) => {
    if (!procs || procs.length === 0) return [];

    let queue = [];
    let time = 0;
    let resultSlices = [];
    // clone with remaining
    let remaining = procs.map((p) => ({ ...p, rem: p.burst }));

    // loop until all done
    while (remaining.length > 0 || queue.length > 0) {
      // push newly arrived to queue
      remaining = remaining.filter((p) => {
        if (p.arrival <= time) {
          // push a shallow copy so changes in queue don't affect remaining
          queue.push({ ...p });
          return false;
        }
        return true;
      });

      if (queue.length === 0) {
        // no ready process, advance time
        time++;
        continue;
      }

      let current = queue.shift();
      // find the current's rem in the remaining set or from previously queued rem
      // we track rem by storing rem in the queue copies too
      // ensure rem is present
      if (current.rem == null) {
        // try to fetch from remaining clones (rare)
        const orig = procs.find((x) => x.pid === current.pid);
        current.rem = orig ? orig.burst : 0;
      }

      let execTime = Math.min(current.rem, quantum);
      let start = time;
      time += execTime;
      current.rem -= execTime;

      // store a slice (for Gantt display if later we want per-slice timeline)
      resultSlices.push({
        pid: current.pid,
        arrival: current.arrival,
        burst: execTime,
        start,
        ct: time,
      });

      // update remaining list: subtract executed time
      // find in remaining clones (if exists)
      for (let i = 0; i < remaining.length; i++) {
        if (remaining[i].pid === current.pid) {
          remaining[i].rem -= execTime;
          break;
        }
      }

      if (current.rem > 0) {
        // push back with updated rem
        queue.push(current);
      } else {
        // process finished; ensure it's removed from remaining (some implementations already did)
        remaining = remaining.filter((p) => p.pid !== current.pid);
      }
    }

    // Build final summary per process
    let final = [];
    procs.forEach((p) => {
      let slices = resultSlices.filter((r) => r.pid === p.pid);
      // If no slices (shouldn't happen), fallback to arrival
      if (slices.length === 0) {
        final.push({ ...p, ct: p.arrival + p.burst, tat: p.burst, wt: 0, start: p.arrival });
      } else {
        let ct = slices[slices.length - 1].ct;
        let firstStart = slices[0].start;
        let tat = ct - p.arrival;
        let wt = tat - p.burst;
        final.push({ ...p, start: firstStart, ct, tat, wt });
      }
    });
    return final;
  };

  // SRTF (preemptive shortest remaining time first)
  const srtf = (procs) => {
    if (!procs || procs.length === 0) return [];
    let time = 0;
    let completed = [];
    let remaining = procs.map((p) => ({ ...p, rem: p.burst }));
    let ganttSlices = [];

    while (remaining.length > 0) {
      let available = remaining.filter((p) => p.arrival <= time);
      if (available.length === 0) {
        time++;
        continue;
      }

      // pick shortest rem
      available.sort((a, b) => a.rem - b.rem || a.arrival - b.arrival);
      let current = available[0];
      let start = time;
      time++;
      current.rem--;

      ganttSlices.push({ pid: current.pid, arrival: current.arrival, start, ct: time, burst: 1 });

      // update remaining array entry
      for (let i = 0; i < remaining.length; i++) {
        if (remaining[i].pid === current.pid) {
          remaining[i].rem = current.rem;
          break;
        }
      }

      if (current.rem === 0) {
        let ct = time;
        let tat = ct - current.arrival;
        let wt = tat - current.burst;
        completed.push({ ...current, ct, tat, wt });
        remaining = remaining.filter((p) => p.pid !== current.pid);
      }
    }

    // convert completed items to final format normal processes
    return completed.map((c) => {
      return { pid: c.pid, arrival: c.arrival, burst: c.burst, ct: c.ct, tat: c.tat, wt: c.wt, start: c.arrival };
    });
  };

  // AHQ - Adaptive Hybrid Quantum Round Robin
  const ahqRoundRobin = (procs) => {
    if (!procs || procs.length === 0) return [];

    // Compute bursts array from ready queue snapshot
    const bursts = procs.map((p) => p.burst).sort((a, b) => a - b);
    const Qlen = bursts.length;
    const min = bursts[0];
    const avg = bursts.reduce((a, b) => a + b, 0) / Qlen;
    const median =
      Qlen % 2 === 0 ? (bursts[Qlen / 2 - 1] + bursts[Qlen / 2]) / 2 : bursts[Math.floor(Qlen / 2)];

    // AHQ parameters
    const Qcap = 8; // capacity mapping to L = 1
    const L = Math.min(1.0, Qlen / Qcap); // load factor in [0,1]
    // TQ_new formula (with median nudge)
    const medianNudgeFactor = 0.15;
    const TQ_new = (1 - L) * avg + medianNudgeFactor * (1 - L) * median + L * min;

    // smoothing (EMA)
    const alpha_sm = 0.85;
    const prev = prevTQRef.current || 10;
    let TQ_smoothed = alpha_sm * prev + (1 - alpha_sm) * TQ_new;

    // clamp
    const TQ_min = 3;
    const TQ_max = 200;
    TQ_smoothed = Math.max(TQ_min, Math.min(TQ_smoothed, TQ_max));

    // update prev for next scheduling round
    prevTQRef.current = TQ_smoothed;

    const chosenQuantum = Math.max(1, Math.floor(TQ_smoothed)); // integer quantum for RR
    // console.log("AHQ chosen quantum:", chosenQuantum, { min, median, avg, L, TQ_new, TQ_smoothed });

    // Use standard round robin with this adaptive quantum
    return roundRobin(procs, chosenQuantum);
  };

  // Run algorithms
  const runAlgorithms = () => {
    if (processes.length === 0) return;

    // FCFS
    let fcfsSeq = [...processes].sort((a, b) => a.arrival - b.arrival);
    let fcfsRes = calculateMetrics(fcfsSeq);

    // SJF (non-preemptive)
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

    // Priority (non-preemptive, lower value -> higher priority)
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

    // Normal RR if quantum provided by user
    const rrRes = quantum ? roundRobin(processes, parseInt(quantum)) : null;

    // SRTF
    let srtfRes = srtf(processes);

    // AHQ Round Robin
    let ahqRes = ahqRoundRobin(processes);

    // Collect results object
    const out = {
      FCFS: fcfsRes,
      SJF: sjfRes,
      Priority: prioRes,
      ...(rrRes ? { "Round Robin": rrRes } : {}),
      SRTF: srtfRes,
      "AHQ Round Robin": ahqRes,
    };

    setResults(out);
    setShowTable(true);
  };

  const avg = (arr, field) =>
    arr && arr.length > 0 ? (arr.reduce((sum, p) => sum + p[field], 0) / arr.length).toFixed(2) : "0.00";

  return (
    <div style={{ padding: "16px", fontFamily: "Arial, sans-serif" }}>
      <h1 style={{ textAlign: "center", marginBottom: "20px" }}>CPU Scheduling Simulator</h1>

      {/* Input Form */}
      <div
        className="process-inputs"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "8px",
          marginBottom: "16px",
        }}
      >
        <input placeholder="PID" value={pid} onChange={(e) => setPid(e.target.value)} style={{ flex: "1 1 120px", padding: "8px" }} />
        <input type="number" placeholder="Arrival" value={arrival} onChange={(e) => setArrival(e.target.value)} style={{ flex: "1 1 120px", padding: "8px" }} />
        <input type="number" placeholder="Burst" value={burst} onChange={(e) => setBurst(e.target.value)} style={{ flex: "1 1 120px", padding: "8px" }} />
        <input type="number" placeholder="Priority" value={priority} onChange={(e) => setPriority(e.target.value)} style={{ flex: "1 1 120px", padding: "8px" }} />
        <input type="number" placeholder="Time Quantum (RR)" value={quantum} onChange={(e) => setQuantum(e.target.value)} style={{ flex: "1 1 160px", padding: "8px" }} />
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={addProcess} style={{ padding: "8px 12px" }}>
            Add
          </button>
          <button onClick={runAlgorithms} style={{ padding: "8px 12px" }}>
            Run
          </button>
        </div>
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
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: "500px" }}>
                <thead>
                  <tr>
                    {["PID", "AT", "BT", "P", "CT", "TAT", "WT"].map((h) => (
                      <th key={h} style={{ border: "1px solid #ddd", padding: "8px", background: "#f4f4f4" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results[alg].map((p, i) => (
                    <tr key={i}>
                      <td style={{ border: "1px solid #ddd", padding: "8px" }}>{p.pid}</td>
                      <td style={{ border: "1px solid #ddd", padding: "8px" }}>{p.arrival}</td>
                      <td style={{ border: "1px solid #ddd", padding: "8px" }}>{p.burst}</td>
                      <td style={{ border: "1px solid #ddd", padding: "8px" }}>{p.priority}</td>
                      <td style={{ border: "1px solid #ddd", padding: "8px" }}>{p.ct}</td>
                      <td style={{ border: "1px solid #ddd", padding: "8px" }}>{p.tat}</td>
                      <td style={{ border: "1px solid #ddd", padding: "8px" }}>{p.wt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              Avg TAT: {avg(results[alg], "tat")} | Avg WT: {avg(results[alg], "wt")}
            </p>
            <GanttChart processes={results[alg]} algorithm={alg} />
          </div>
        ))}
    </div>
  );
}

export default App;
