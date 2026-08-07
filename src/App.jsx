import { useState, useEffect, useRef, useCallback } from 'react';
import {
  LineChart, Line, BarChart, Bar, Cell, ScatterChart, Scatter,
  XAxis, YAxis, ZAxis, CartesianGrid, ReferenceLine, ResponsiveContainer, Legend,
} from 'recharts';
import './theme.css';
import './chrome.css';

// ─── Data ────────────────────────────────────────────────────────────────────
// Every number below comes from results/rerun/<run>_s{1234,2025,7}/summary.json
// (3 seeds, one machine, one training recipe per PDE, 5 000 L-BFGS throughout)
// unless a comment says otherwise.

const HEAT = [
  { model: 'SIREN',     mean: 0.000231, sd: 0.000048, seeds: [0.000186, 0.000282, 0.000225] },
  { model: 'PINN',      mean: 0.000243, sd: 0.000026, seeds: [0.000226, 0.000229, 0.000272] },
  { model: 'QAPINN Q4', mean: 0.000487, sd: 0.000402, seeds: [0.000950, 0.000291, 0.000222] },
];

const BURGERS = [
  { model: 'PINN',  mean: 0.006268, sd: 0.000045, seeds: [0.006248, 0.006237, 0.006320] },
  { model: 'SIREN', mean: 0.014832, sd: 0.005398, seeds: [0.013630, 0.020730, 0.010135] },
  { model: 'Q4',    mean: 0.019406, sd: 0.004721, seeds: [0.024116, 0.014673, 0.019430] },
  { model: 'Q5',    mean: 0.023701, sd: 0.004222, seeds: [0.019081, 0.024660, 0.027361] },
  { model: 'Q3',    mean: 0.050154, sd: 0.039763, seeds: [0.038742, 0.094375, 0.017345] },
];

// Heat K-sweep, 18 runs. NOTE the ladder alternates qubit count, which is the
// confound this deck now discloses: K and n_qubits were varied together.
const KSWEEP = [
  { K: 1, nq: 2, mean: 0.1823 },
  { K: 2, nq: 4, mean: 0.0240 },
  { K: 3, nq: 2, mean: 0.0680 },
  { K: 4, nq: 4, mean: 0.0117 },
  { K: 5, nq: 2, mean: 0.0602 },
  { K: 8, nq: 4, mean: 0.0159 },
];
// The clean slice: qubit count held at 4, bandwidth varied alone.
const KSWEEP_4Q = KSWEEP.filter(d => d.nq === 4);
const KSWEEP_2Q = KSWEEP.filter(d => d.nq === 2);

// Measured Fourier spectrum of the UNTRAINED quantum layer.
// src/xai/fourier.py -> empirical_spectrum(), 256-point DFT over one period.
const SPECTRUM = [
  { n: 0, angle: 0.498, reup2: 0.502, reup3: 0.507 },
  { n: 1, angle: 0.498, reup2: 0.372, reup3: 0.383 },
  { n: 2, angle: 0.249, reup2: 0.249, reup3: 0.248 },
  { n: 3, angle: 0,     reup2: 0.125, reup3: 0.121 },
  { n: 4, angle: 0,     reup2: 0.063, reup3: 0.068 },
  { n: 5, angle: 0,     reup2: 0,     reup3: 0.062 },
  { n: 6, angle: 0,     reup2: 0,     reup3: 0.001 },
  { n: 7, angle: 0,     reup2: 0,     reup3: 0 },
];

// Burgers training loss, seed 1234. Epoch 13 000 is the end of the 5 000-step
// L-BFGS phase — the vertical drop that the old 500-step budget cut off.
const LOSS_CURVES = [
  { ep: 1,     pinn: 0.464205, siren: 0.534349, q4: 0.563819 },
  { ep: 1000,  pinn: 0.065413, siren: 0.077240, q4: 0.082274 },
  { ep: 2000,  pinn: 0.042035, siren: 0.057105, q4: 0.063553 },
  { ep: 3000,  pinn: 0.009713, siren: 0.052180, q4: 0.049304 },
  { ep: 4000,  pinn: 0.005195, siren: 0.047588, q4: 0.022754 },
  { ep: 5000,  pinn: 0.003052, siren: 0.028422, q4: 0.014072 },
  { ep: 6000,  pinn: 0.002140, siren: 0.008713, q4: 0.010384 },
  { ep: 7000,  pinn: 0.001650, siren: 0.006294, q4: 0.008154 },
  { ep: 8000,  pinn: 0.001477, siren: 0.005866, q4: 0.006685 },
  { ep: 13000, pinn: 0.000005, siren: 0.000130, q4: 0.000155 },
];

// Coefficient of variation across the 3 seeds — the reproducibility finding.
const REPRO = [
  { model: 'PINN · Burgers',  cv: 0.7,  kind: 'classical' },
  { model: 'PINN · heat',     cv: 10.7, kind: 'classical' },
  { model: 'Q5 · Burgers',    cv: 17.8, kind: 'quantum' },
  { model: 'SIREN · heat',    cv: 20.9, kind: 'classical' },
  { model: 'Q4 · Burgers',    cv: 24.3, kind: 'quantum' },
  { model: 'SIREN · Burgers', cv: 36.4, kind: 'classical' },
  { model: 'Q3 · Burgers',    cv: 79.3, kind: 'quantum' },
  { model: 'Q4 · heat',       cv: 82.4, kind: 'quantum' },
];

const CAPACITY = { pinn: 16492, qapinn: 5140 };

const REVEAL_COUNTS = [
  0, // 00 title
  3, // 01 why it matters
  2, // 02 question
  4, // 03 what is a PINN
  4, // 04 what a QAPINN changes
  4, // 05 architecture deep dive
  4, // 06 the five experiments
  3, // 05 the answer
  4, // 06 mechanism
  3, // 07 formula
  3, // 08 measured spectrum
  3, // 09 heat testbed
  4, // 10 method
  4, // 11 k-sweep result + confound
  2, // 12 burgers testbed
  4, // 13 burgers result
  4, // 14 the confound we caught
  5, // 15 scoreboard
  3, // 16 reproducibility
  3, // 17 explainability
  4, // 18 when it helps / doesn't
  4, // 19 design recommendation
  4, // 20 limitations
  4, // 21 future work
  4, // 22 conclusion
];
const SLIDE_COUNT = REVEAL_COUNTS.length;

const NOTES = [
  /* 00 */ 'Opening. One sentence: does bolting a quantum circuit onto a physics neural network actually help? We ran it as a controlled ablation on two fluid equations, three seeds each. The answer is no — and the interesting part is that our own theory predicted exactly that, including the one case where it comes close.',
  /* 01 */ 'Why anyone should care. Simulating fluid flow is the design bottleneck in aircraft, turbines and weather. Neural surrogates promise to replace the mesh. Quantum PINNs have been built and benchmarked before; what is missing is a rule that tells you in advance whether one will help you.',
  /* 02 */ 'Be precise about credit here. The bandwidth theorem is Schuld et al. 2021 — established theory, not ours. Quantum PINN benchmarks also already exist. The gap we fill is between them: turn the theorem into a number you compute before training, and test it as a controlled ablation that includes the runs where quantum loses.',
  /* 03 */ 'The only slide for non-experts. A PINN learns a solution by being punished for breaking physics, not by being shown answers. Take about forty-five seconds. Key idea: no training data, the equation itself is the loss.',
  /* 04 */ 'The single architectural change. We replace only the first layer with a variational quantum circuit. Everything downstream is identical — same hidden size, depth, optimiser, seeds, training budget. That is what makes this an ablation rather than a benchmark.',
  /* 05 */ 'The architecture in detail. Walk the diagram left to right. Two numbers go in, normalized. The classical model multiplies by a learned 2-by-20 matrix and squashes with tanh — sixty parameters. The quantum model instead rotates four qubits by angles proportional to x and t, applies learned rotations, entangles with a CNOT ring, re-uploads the input and rotates again, then reads one Pauli-Z expectation per qubit. Twenty-four parameters, four numbers out. Everything right of the second dashed line is identical in both. Then the important part: the PDE residual needs a second derivative of the output, so autograd runs back through the circuit twice per step. That dashed return path is where the twenty-times cost comes from — not the circuit size, the differentiation through it.',
  /* 06 */ 'The experiment map. Two PDEs chosen to sit at opposite ends of one axis: heat is smooth with exactly two modes, Burgers is a broadband shock. E1 and E2 ask whether the quantum layer helps on each. E3 is the control — is any effect even quantum, or just periodic activations. E4 and E5 ask whether the bandwidth formula predicts behaviour. Every cell is three seeds on one machine. Say plainly that two of these verdicts are revisions: we had a Burgers win and a SIREN conclusion that did not survive a fair training budget.',
  /* 06 */ 'Answer up front, and do not soften it. The bandwidth K predicts what the quantum model can represent. It does not predict an advantage, because there was not one: classical won or tied in every setup we tested, at roughly twenty times less compute. The rest of the talk is why, and why that is still a useful result.',
  /* 07 */ 'The mechanism, and say clearly that it is not ours — Schuld et al., Phys Rev A 2021. The circuit output is a Fourier series whose frequency set is fixed when you build the circuit. Training rescales coefficients; it can never invent a frequency. That is a theorem.',
  /* 08 */ 'The formula. K equals qubits over input dimension, times data uploads. Re-uploading is the lever — angle encoding gives one upload no matter how deep, so stacking layers buys parameters, not bandwidth.',
  /* 09 */ 'This is a measurement, not a claim. We swept one input over a full period and took a DFT of the untrained layer. Magnitude is exactly zero past the predicted K in all three configurations. Also note the amplitude decay: the top mode is representable but weak, which is why margin matters.',
  /* 10 */ 'Heat as the clean testbed. Exact solution known, so the required modes are known: k equals 1 and 4. That gives a falsifiable prediction rather than a benchmark.',
  /* 11 */ 'The sweep design — and this is where we disclose a flaw we found in our own experiment. Six bandwidths, three seeds. But look at the qubit column: the ladder alternates two and four qubits, so K and register width were varied together. We can still separate them, which the next slide does.',
  /* 12 */ 'Two things. First, the honest problem: every four-qubit run beats nearly every two-qubit run, so the dramatic K=3 to K=4 step is also a 2-to-4 qubit step. We cannot attribute that to bandwidth. Second, the clean result: hold qubits at four and vary K alone — 0.024, 0.012, 0.016. Minimum exactly at K=4, with the slight rise at K=8 that capacity theory predicts. That is the mechanism, uncontaminated. Say both halves.',
  /* 13 */ 'Burgers is the hard case. Nonlinear, shock-forming, broadband. No closed form, so no clean frequency prediction — this is where a bandwidth limit should hurt.',
  /* 14 */ 'Classical wins by 3.1 times, and with three seeds this one is statistically solid — t equals 4.8. Note SIREN: at a fair budget it now matches the quantum models. That reverses our earlier control conclusion and we say so on the next slide but one.',
  /* 15 */ 'This is the slide I would lead with if asked what we learned. We had a 7.8 percent quantum win. It was an artifact of stopping L-BFGS at 500 steps — training was still descending. Look at the curve: the vertical drop at the end is the L-BFGS phase, and the classical model gains most from it because it had the most headroom left. Our own report flagged this as limitation L1 before we tested it. Most teams would have shipped the win.',
  /* 16 */ 'The full scoreboard including the rows we lose. Heat is statistically tied — do not claim a win in either direction there. Burgers classical wins clearly. Cost is roughly twenty times on identical hardware. Memory and out-of-domain generalization were not measured and we say so rather than guess.',
  /* 17 */ 'The finding nobody was looking for. Classical Burgers lands within 0.7 percent across three seeds. The quantum models vary 24 to 82 percent. That multiplies the cost problem: every quantum number needs several seeds before it means anything, on top of already being twenty times slower.',
  /* 18 */ 'Explainability. The capacity bound says the quantum model is a structurally simpler function class — 3.2 times lower complexity, 27 percent fewer parameters. It reaches comparable accuracy on heat with that simpler class. So the layer constrains rather than expands, which is exactly what the Fourier theorem says it should do. The honest limit: both probes are indirect.',
  /* 19 */ 'The heart of the talk, and give it the most time. The quantum layer replaces a free learned map with a fixed band-limited basis. That is a restriction. A restriction can only pay off if it matches the problem better than what it replaced. When the target fits inside K we get parity; when it does not we lose; and when a band-limited prior is genuinely what you want, SIREN gives you one for a twentieth of the cost. There is no regime here where band-limiting wins.',
  /* 20 */ 'The deliverable. Step zero is check whether you need this at all. Then Fourier-analyse the target, pick K with margin, and buy K with re-uploads before qubits — but know that qubit count also sets the output width, so it is doing two jobs.',
  /* 21 */ 'Limitations, stated before anyone asks. Simulator only. Four to six qubits. Two 1D PDEs. One readout — and our single probability-readout run halved the heat error, so that axis mattered and we did not explore it. The K-sweep confounds bandwidth with register width.',
  /* 22 */ 'Four things we would do next, ordered by how fast each would change the recommendation.',
  /* 23 */ 'Close. A quantum layer is a constraint you have to earn, and on these problems it was not earned. The formula predicts what the circuit can represent, we verified that directly, and it correctly predicts where quantum comes closest. We found and corrected a confound that would have handed us a false positive. That is the result.',
];

// ─── SVG: Quantum circuit ────────────────────────────────────────────────────

const INK = '#080808';
const PAPER = '#f2f2f0';
const DIM = 'rgba(242,242,240,0.25)';

function SvgGate({ x, y, label, w = 32, filled }) {
  const h = 19;
  return (
    <g>
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h}
        fill={filled ? 'rgba(242,242,240,0.09)' : INK}
        stroke={filled ? 'rgba(242,242,240,0.7)' : DIM}
        strokeWidth={0.8} rx={2} />
      <text x={x} y={y + 3.5} textAnchor="middle"
        fill={filled ? PAPER : DIM} fontSize={7.5} fontFamily="Space Mono, monospace">
        {label}
      </text>
    </g>
  );
}

function SvgCNOT({ x, yCtrl, yTgt }) {
  return (
    <g>
      <line x1={x} y1={yCtrl} x2={x} y2={yTgt} stroke={DIM} strokeWidth={0.8} />
      <circle cx={x} cy={yCtrl} r={3} fill={DIM} />
      <circle cx={x} cy={yTgt} r={8} fill={INK} stroke={DIM} strokeWidth={0.8} />
      <line x1={x - 8} y1={yTgt} x2={x + 8} y2={yTgt} stroke={DIM} strokeWidth={0.8} />
      <line x1={x} y1={yTgt - 8} x2={x} y2={yTgt + 8} stroke={DIM} strokeWidth={0.8} />
    </g>
  );
}

function CircuitSVG() {
  const qs = [46, 84, 122, 160];
  const lc = 'rgba(242,242,240,0.3)';
  return (
    <svg viewBox="0 0 500 200" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%' }}>
      {qs.map((y, i) => (
        <g key={i}>
          <text x={14} y={y + 4} textAnchor="middle" fill={DIM} fontSize={8.5} fontFamily="Space Mono, monospace">q{i}</text>
          <line x1={24} y1={y} x2={476} y2={y} stroke={lc} strokeWidth={0.7} />
        </g>
      ))}
      {[[80, 'ENC 1'], [150, 'PARAMS 1'], [228, 'RING 1'],
        [315, 'ENC 2'], [385, 'PARAMS 2'], [454, 'MEAS']].map(([x, lbl]) => (
        <text key={lbl} x={x} y={20} textAnchor="middle" fill="rgba(242,242,240,0.18)"
          fontSize={7} fontFamily="Space Mono, monospace" letterSpacing={0.5}>{lbl}</text>
      ))}
      {qs.map((y, i) => <SvgGate key={i} x={80} y={y} label={i % 2 === 0 ? 'Ry(x)' : 'Ry(t)'} w={34} />)}
      {qs.map((y, i) => (
        <g key={i}>
          <SvgGate x={135} y={y} label="Ry(θ)" w={30} filled />
          <SvgGate x={168} y={y} label="Rz(θ)" w={30} filled />
        </g>
      ))}
      <SvgCNOT x={228} yCtrl={qs[0]} yTgt={qs[1]} />
      <SvgCNOT x={228} yCtrl={qs[1]} yTgt={qs[2]} />
      <SvgCNOT x={228} yCtrl={qs[2]} yTgt={qs[3]} />
      <line x1={268} y1={28} x2={268} y2={175} stroke="rgba(242,242,240,0.08)" strokeDasharray="2 4" strokeWidth={0.8} />
      {qs.map((y, i) => <SvgGate key={i} x={315} y={y} label={i % 2 === 0 ? 'Ry(x)' : 'Ry(t)'} w={34} />)}
      {qs.map((y, i) => (
        <g key={i}>
          <SvgGate x={370} y={y} label="Ry(θ)" w={30} filled />
          <SvgGate x={403} y={y} label="Rz(θ)" w={30} filled />
        </g>
      ))}
      {qs.map((y, i) => (
        <g key={i}>
          <rect x={437} y={y - 10} width={34} height={20} fill={INK} stroke="rgba(242,242,240,0.5)" strokeWidth={0.8} rx={2} />
          <text x={454} y={y + 4} textAnchor="middle" fill="rgba(242,242,240,0.65)" fontSize={8} fontFamily="Space Mono, monospace">⟨Z⟩</text>
        </g>
      ))}
      <text x={28} y={192} fill="rgba(242,242,240,0.2)" fontSize={7.5} fontFamily="Space Mono, monospace">input (x,t)</text>
      <text x={474} y={192} textAnchor="end" fill="rgba(242,242,240,0.2)" fontSize={7.5} fontFamily="Space Mono, monospace">→ PINN tail</text>
      <text x={200} y={192} textAnchor="middle" fill="rgba(242,242,240,0.15)" fontSize={7} fontFamily="Space Mono, monospace">n_qubits=4 · n_uploads=2 → K=4</text>
    </svg>
  );
}

function PinnDiagramSVG() {
  const t = { fill: 'rgba(242,242,240,0.6)', fontSize: 8.5, fontFamily: 'Space Mono, monospace' };
  const box = { fill: 'none', stroke: 'rgba(242,242,240,0.3)', strokeWidth: 0.9 };
  return (
    <svg viewBox="0 0 460 130" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%' }}>
      <rect x={6} y={48} width={62} height={34} rx={2} {...box} />
      <text x={37} y={69} textAnchor="middle" {...t}>(x, t)</text>
      <line x1={68} y1={65} x2={104} y2={65} stroke="rgba(242,242,240,0.3)" strokeWidth={0.9} />
      <path d="M104 65 l-6 -3 v6 z" fill="rgba(242,242,240,0.4)" />
      <rect x={106} y={34} width={96} height={62} rx={2} fill="rgba(242,242,240,0.05)" stroke="rgba(242,242,240,0.45)" strokeWidth={0.9} />
      <text x={154} y={61} textAnchor="middle" fill={PAPER} fontSize={9.5} fontFamily="Space Mono, monospace">network</text>
      <text x={154} y={76} textAnchor="middle" fill="rgba(242,242,240,0.4)" fontSize={7.5} fontFamily="Space Mono, monospace">guesses u(x,t)</text>
      <line x1={202} y1={65} x2={238} y2={65} stroke="rgba(242,242,240,0.3)" strokeWidth={0.9} />
      <path d="M238 65 l-6 -3 v6 z" fill="rgba(242,242,240,0.4)" />
      <rect x={240} y={10} width={126} height={44} rx={2} {...box} />
      <text x={303} y={30} textAnchor="middle" {...t}>does the guess obey</text>
      <text x={303} y={43} textAnchor="middle" fill={PAPER} fontSize={9} fontFamily="Space Mono, monospace">the equation?</text>
      <rect x={240} y={76} width={126} height={44} rx={2} {...box} />
      <text x={303} y={96} textAnchor="middle" {...t}>does it match the</text>
      <text x={303} y={109} textAnchor="middle" fill={PAPER} fontSize={9} fontFamily="Space Mono, monospace">edges &amp; start?</text>
      <line x1={366} y1={32} x2={400} y2={54} stroke="rgba(242,242,240,0.3)" strokeWidth={0.9} />
      <line x1={366} y1={98} x2={400} y2={76} stroke="rgba(242,242,240,0.3)" strokeWidth={0.9} />
      <text x={432} y={61} textAnchor="middle" fill={PAPER} fontSize={9.5} fontFamily="Space Mono, monospace">error</text>
      <text x={432} y={75} textAnchor="middle" fill="rgba(242,242,240,0.4)" fontSize={7.5} fontFamily="Space Mono, monospace">↺ retrain</text>
    </svg>
  );
}

// ─── Mermaid-style flow diagram primitives ──────────────────────────────────
// Nodes fade+rise, edges draw themselves, both gated on the slide's reveal
// counter so the diagram assembles as you talk through it.

function FlNode({ x, y, w, h, title, sub, on, accent, pulse, r = 3 }) {
  return (
    <g className={`fl-node${on ? ' in' : ''}${pulse ? ' pulse' : ''}`}>
      <rect x={x} y={y} width={w} height={h} rx={r}
        fill={accent ? 'rgba(242,242,240,0.10)' : 'rgba(242,242,240,0.03)'}
        stroke={accent ? 'rgba(242,242,240,0.75)' : 'rgba(242,242,240,0.30)'}
        strokeWidth={accent ? 1.1 : 0.8} />
      <text x={x + w / 2} y={y + (sub ? h / 2 - 2 : h / 2 + 3.5)} textAnchor="middle"
        fill={accent ? PAPER : 'rgba(242,242,240,0.8)'}
        fontSize={9.5} fontFamily="Space Mono, monospace">{title}</text>
      {sub && (
        <text x={x + w / 2} y={y + h / 2 + 11} textAnchor="middle"
          fill="rgba(242,242,240,0.42)" fontSize={7.5} fontFamily="Space Mono, monospace">{sub}</text>
      )}
    </g>
  );
}

// Orthogonal connector: down, across, down — the mermaid elbow.
function FlEdge({ from, to, on, label, len = 260 }) {
  const [x1, y1] = from, [x2, y2] = to;
  const my = y1 + (y2 - y1) / 2;
  const d = x1 === x2
    ? `M${x1} ${y1} V${y2 - 6}`
    : `M${x1} ${y1} V${my} H${x2} V${y2 - 6}`;
  return (
    <g>
      <path d={d} className={`fl-edge${on ? ' in' : ''}`} style={{ '--len': len }}
        fill="none" stroke="rgba(242,242,240,0.32)" strokeWidth={0.9} />
      <path d={`M${x2} ${y2} l-3.5 -5 h7 z`} className={`fl-head${on ? ' in' : ''}`}
        fill="rgba(242,242,240,0.45)" />
      {label && (
        <text x={(x1 + x2) / 2} y={my - 4} textAnchor="middle"
          className={`fl-head${on ? ' in' : ''}`}
          fill="rgba(242,242,240,0.35)" fontSize={7} fontFamily="Space Mono, monospace">{label}</text>
      )}
    </g>
  );
}

// Slide 04 — the architecture swap, as a flow.
function ArchFlowSVG({ reveal }) {
  const on = n => reveal >= n;
  const yTop = 30, yMid = 92, yBot = 154, h = 30;
  return (
    <svg viewBox="0 0 520 200" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%' }}>
      <FlNode x={8}   y={yMid} w={72} h={h} title="(x, t)" sub="normalized" on={on(1)} />
      <FlNode x={112} y={yTop} w={116} h={h} title="Linear(2→20)" sub="classical first layer" on={on(1)} />
      <FlNode x={112} y={yBot} w={116} h={h} title="QuantumLayer(2→4)" sub="⟨Z⟩ · K = 4" on={on(2)} accent pulse />
      <FlNode x={264} y={yMid} w={116} h={h} title="hidden × 3" sub="Linear(20→20) tanh" on={on(3)} />
      <FlNode x={412} y={yMid} w={96}  h={h} title="Linear(20→1)" sub="→ u(x,t)" on={on(3)} />

      {/* input fans out to the two interchangeable first layers */}
      <FlEdge from={[80, yMid + h / 2]} to={[170, yTop + h]} on={on(1)} len={200} />
      <FlEdge from={[80, yMid + h / 2]} to={[170, yBot]}     on={on(2)} len={200} />
      {/* both rejoin the identical tail */}
      <FlEdge from={[228, yTop + h / 2]} to={[322, yMid]}     on={on(3)} len={200} />
      <FlEdge from={[228, yBot + h / 2]} to={[322, yMid + h]} on={on(3)} len={200} />
      <FlEdge from={[380, yMid + h / 2]} to={[460, yMid]}     on={on(3)} len={140} />

      <text x={170} y={yMid + h / 2 + 4} textAnchor="middle"
        className={`fl-head${on(2) ? ' in' : ''}`}
        fill="rgba(242,242,240,0.55)" fontSize={8} fontFamily="Space Mono, monospace">
        swap one layer
      </text>
      <text x={343} y={196} textAnchor="middle" fill="rgba(242,242,240,0.22)"
        fontSize={7} fontFamily="Space Mono, monospace">
        everything right of here is byte-identical
      </text>
    </svg>
  );
}

// Architecture deep-dive: the full forward path, the swap point, and the loss.
function ArchDeepSVG({ reveal }) {
  const on = n => reveal >= n;
  const mono = 'Space Mono, monospace';
  const lbl = (x, y, t, o = 0.34, fs = 7) => (
    <text x={x} y={y} textAnchor="middle" fill={`rgba(242,242,240,${o})`} fontSize={fs} fontFamily={mono}>{t}</text>
  );
  return (
    <svg viewBox="0 0 940 320" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%' }}>
      {/* stage captions */}
      <g className={`fl-head${on(1) ? ' in' : ''}`}>
        {lbl(76, 14, 'INPUT', 0.28)}{lbl(250, 14, 'FIRST LAYER — the only thing we change', 0.28)}
        {lbl(600, 14, 'SHARED TAIL — identical in both models', 0.28)}{lbl(846, 14, 'OUTPUT', 0.28)}
      </g>
      <line x1={160} y1={22} x2={160} y2={300} stroke="rgba(242,242,240,0.10)" strokeDasharray="2 5" />
      <line x1={456} y1={22} x2={456} y2={300} stroke="rgba(242,242,240,0.10)" strokeDasharray="2 5" />

      {/* input */}
      <FlNode x={8}  y={116} w={56} h={32} title="(x, t)" on={on(1)} />
      <FlNode x={80} y={116} w={72} h={32} title="normalize" sub="→ [−1,1]²" on={on(1)} />
      <FlEdge from={[64, 132]} to={[116, 116]} on={on(1)} len={60} />

      {/* classical branch */}
      <FlNode x={176} y={44} w={124} h={32} title="Linear(2 → 20)" sub="+ tanh · 60 params" on={on(1)} />
      <FlEdge from={[152, 132]} to={[238, 44]} on={on(1)} len={180} />

      {/* quantum branch, expanded */}
      <FlNode x={176} y={196} w={64} h={30} title="encode" sub="Ry(s·x), Ry(s·t)" on={on(2)} accent />
      <FlNode x={248} y={196} w={64} h={30} title="rotate" sub="Ry(θ) Rz(θ)" on={on(2)} accent />
      <FlNode x={320} y={196} w={50} h={30} title="CNOT" sub="ring" on={on(2)} accent />
      <FlNode x={384} y={196} w={60} h={30} title="⟨Z⟩ × 4" sub="measure" on={on(3)} accent pulse />
      <FlEdge from={[152, 132]} to={[208, 196]} on={on(2)} len={160} />
      {[[240, 211, 248], [312, 211, 320], [370, 211, 384]].map(([a, y, b], i) => (
        <g key={i} className={`fl-head${on(i === 2 ? 3 : 2) ? ' in' : ''}`}>
          <line x1={a} y1={y} x2={b - 5} y2={y} stroke="rgba(242,242,240,0.32)" strokeWidth={0.9} />
          <path d={`M${b} ${y} l-5 -3.5 v7 z`} fill="rgba(242,242,240,0.45)" />
        </g>
      ))}
      <g className={`fl-head${on(2) ? ' in' : ''}`}>
        <path d="M180 236 v8 H366 v-8" stroke="rgba(242,242,240,0.25)" strokeWidth={0.8} fill="none" />
        {lbl(273, 254, '× 2 re-upload  →  K = (4 ÷ 2) × 2 = 4', 0.42)}
        {lbl(273, 266, '24 trainable params — vs 60 classical', 0.26)}
      </g>

      {/* merge into the shared tail */}
      <FlNode x={488} y={116} w={104} h={32} title="Linear(· → 20)" sub="4 or 2 inputs" on={on(1)} />
      <FlNode x={612} y={116} w={104} h={32} title="hidden × 3" sub="Linear(20→20) tanh" on={on(1)} />
      <FlNode x={736} y={116} w={96}  h={32} title="Linear(20→1)" on={on(1)} />
      <FlNode x={852} y={116} w={56}  h={32} title="u(x,t)" on={on(1)} accent />
      <FlEdge from={[300, 60]}  to={[540, 116]} on={on(1)} len={300} />
      <FlEdge from={[444, 211]} to={[540, 148]} on={on(3)} len={220} />
      {[[592, 612], [716, 736], [832, 852]].map(([a, b], i) => (
        <g key={i} className={`fl-head${on(1) ? ' in' : ''}`}>
          <line x1={a} y1={132} x2={b - 5} y2={132} stroke="rgba(242,242,240,0.32)" strokeWidth={0.9} />
          <path d={`M${b} 132 l-5 -3.5 v7 z`} fill="rgba(242,242,240,0.45)" />
        </g>
      ))}

      {/* autograd + loss */}
      <g className={`fl-head${on(4) ? ' in' : ''}`}>
        <path d="M880 148 V286 H150 V152" stroke="rgba(242,242,240,0.28)" strokeWidth={0.9}
          strokeDasharray="4 3" fill="none" />
        <path d="M150 148 l-3.5 6 h7 z" fill="rgba(242,242,240,0.4)" />
        {lbl(515, 282, 'autograd back through the circuit  →  ∂u/∂t,  ∂u/∂x,  ∂²u/∂x²', 0.44, 7.5)}
        {lbl(515, 296, 'second derivatives through a state-vector sim — this is the ~20× cost', 0.26)}
      </g>
      <FlNode x={700} y={196} w={208} h={44} title="loss = PDE residual + BC/IC" sub="8 000 collocation · 400 supervised" on={on(4)} />
      <FlEdge from={[880, 148]} to={[804, 196]} on={on(4)} len={120} />
    </svg>
  );
}

// Slide 05 — the experiment map.
function ExperimentMapSVG({ reveal }) {
  const on = n => reveal >= n;
  const box = { w: 150, h: 34 };
  const yQ = 8, yPde = 74, yExp = 146, yLad = 210;
  return (
    <svg viewBox="0 0 700 268" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%' }}>
      <FlNode x={275} y={yQ} w={150} h={30} title="Does it help?" sub="one layer swapped" on={on(1)} accent />

      <FlNode x={78}  y={yPde} w={box.w} h={box.h} title="HEAT" sub="smooth · modes k = 1, 4" on={on(1)} />
      <FlNode x={472} y={yPde} w={box.w} h={box.h} title="BURGERS" sub="shock · broadband" on={on(1)} />
      <FlEdge from={[350, yQ + 30]} to={[153, yPde]} on={on(1)} len={260} />
      <FlEdge from={[350, yQ + 30]} to={[547, yPde]} on={on(1)} len={260} />

      <FlNode x={8}   y={yExp} w={132} h={box.h} title="E1  head-to-head" sub="classical vs Q4" on={on(2)} />
      <FlNode x={152} y={yExp} w={132} h={box.h} title="E4  K-sweep" sub="18 runs · 6 bandwidths" on={on(2)} />
      <FlNode x={412} y={yExp} w={132} h={box.h} title="E2  head-to-head" sub="classical vs Q4" on={on(2)} />
      <FlNode x={556} y={yExp} w={132} h={box.h} title="E5  K ladder" sub="Q3 · Q4 · Q5" on={on(2)} />
      <FlEdge from={[153, yPde + box.h]} to={[74,  yExp]} on={on(2)} len={150} />
      <FlEdge from={[153, yPde + box.h]} to={[218, yExp]} on={on(2)} len={150} />
      <FlEdge from={[547, yPde + box.h]} to={[478, yExp]} on={on(2)} len={150} />
      <FlEdge from={[547, yPde + box.h]} to={[622, yExp]} on={on(2)} len={150} />

      <FlNode x={253} y={yLad} w={194} h={box.h} title="E3  SIREN control" sub="both PDEs · is it just periodicity?" on={on(3)} accent />
      <FlEdge from={[74,  yExp + box.h]} to={[300, yLad]} on={on(3)} len={420} />
      <FlEdge from={[622, yExp + box.h]} to={[400, yLad]} on={on(3)} len={420} />

      <text x={350} y={262} textAnchor="middle" fill="rgba(242,242,240,0.22)"
        fontSize={7.5} fontFamily="Space Mono, monospace">
        3 seeds every cell · one machine · one training recipe per PDE
      </text>
    </svg>
  );
}

function FreqSpectrumSVG() {
  const required = new Set([1, 4]);
  const heights = [18, 58, 14, 10, 44, 11, 7, 5];
  const bw = 24, gap = 10, base = 88;
  return (
    <svg viewBox="0 0 260 110" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%' }}>
      {heights.map((h, k) => {
        const x = 14 + k * (bw + gap), y = base - h, req = required.has(k);
        return (
          <g key={k}>
            <rect x={x} y={y} width={bw} height={h}
              fill={req ? 'rgba(242,242,240,0.85)' : 'rgba(242,242,240,0.07)'}
              stroke={req ? PAPER : 'rgba(242,242,240,0.2)'} strokeWidth={0.8} />
            <text x={x + bw / 2} y={101} textAnchor="middle"
              fill={req ? 'rgba(242,242,240,0.8)' : 'rgba(242,242,240,0.28)'}
              fontSize={8} fontFamily="Space Mono, monospace">k={k}</text>
          </g>
        );
      })}
      <line x1={14 + 4 * (bw + gap) - gap / 2} y1={8} x2={14 + 4 * (bw + gap) - gap / 2} y2={88}
        stroke="rgba(242,242,240,0.3)" strokeDasharray="3 3" strokeWidth={1} />
      <text x={14 + 4 * (bw + gap) - gap / 2 + 4} y={16}
        fill="rgba(242,242,240,0.3)" fontSize={6.5} fontFamily="Space Mono, monospace">K=4</text>
      <line x1={8} y1={88} x2={252} y2={88} stroke="rgba(242,242,240,0.12)" strokeWidth={0.5} />
    </svg>
  );
}

// ─── Charts ──────────────────────────────────────────────────────────────────

const AXIS = { fill: 'rgba(242,242,240,0.4)', fontFamily: 'Space Mono, monospace', fontSize: 10 };
const GRID = 'rgba(242,242,240,0.07)';
const LEG = { fontFamily: 'Space Mono, monospace', fontSize: 10, color: 'rgba(242,242,240,0.5)' };
const axLabel = (v, pos, dx = 0) => ({
  value: v, position: pos, dx, fill: 'rgba(242,242,240,0.3)',
  fontFamily: 'Space Mono, monospace', fontSize: 9,
});

function SpectrumChart() {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={SPECTRUM} margin={{ top: 8, right: 16, bottom: 28, left: 6 }} barGap={2}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="n" stroke="rgba(242,242,240,0.15)" tick={AXIS}
          label={axLabel('harmonic  n', 'insideBottom')} />
        <YAxis stroke="rgba(242,242,240,0.15)" tick={AXIS} tickFormatter={v => v.toFixed(2)}
          label={{ ...axLabel('|coefficient|', 'insideLeft', 4), angle: -90 }} />
        <Legend wrapperStyle={LEG} iconSize={8} verticalAlign="top" height={22} />
        <Bar dataKey="angle" name="angle, 1 layer → K=2" fill="rgba(242,242,240,0.18)" radius={[1, 1, 0, 0]} />
        <Bar dataKey="reup2" name="re-upload, 2 layers → K=4" fill={PAPER} radius={[1, 1, 0, 0]} />
        <Bar dataKey="reup3" name="re-upload, 3 layers → K=6" fill="rgba(242,242,240,0.42)" radius={[1, 1, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// K-sweep split by register width — the confound made visible.
function KSweepChart() {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart margin={{ top: 8, right: 20, bottom: 30, left: 14 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
        <XAxis type="number" dataKey="K" domain={[0, 9]} ticks={[1, 2, 3, 4, 5, 8]}
          stroke="rgba(242,242,240,0.15)" tick={AXIS}
          label={axLabel('K  (Fourier bandwidth)', 'insideBottom')} />
        <YAxis scale="log" domain={[0.008, 0.25]} stroke="rgba(242,242,240,0.15)" tick={AXIS}
          tickFormatter={v => v.toFixed(3)}
          label={{ ...axLabel('rel L² error (log)', 'insideLeft', -6), angle: -90 }} />
        <Legend wrapperStyle={LEG} iconSize={8} verticalAlign="top" height={22} />
        <Line data={KSWEEP_2Q} dataKey="mean" name="2 qubits" stroke="rgba(242,242,240,0.35)"
          strokeWidth={1.6} strokeDasharray="4 3" dot={{ fill: 'rgba(242,242,240,0.35)', r: 4, strokeWidth: 0 }} />
        <Line data={KSWEEP_4Q} dataKey="mean" name="4 qubits" stroke={PAPER}
          strokeWidth={2.4} dot={{ fill: PAPER, r: 5, strokeWidth: 0 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// Per-seed scatter: shows the mean AND how little it means for the quantum runs.
function SeedScatter({ data, domain }) {
  const points = data.flatMap((d, i) => d.seeds.map(v => ({ x: i, y: v, model: d.model })));
  const means = data.map((d, i) => ({ x: i, y: d.mean }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top: 8, right: 20, bottom: 30, left: 16 }}>
        <CartesianGrid stroke={GRID} />
        <XAxis type="number" dataKey="x" domain={[-0.5, data.length - 0.5]}
          ticks={data.map((_, i) => i)} tickFormatter={i => data[i].model}
          stroke="rgba(242,242,240,0.15)" tick={AXIS} />
        <YAxis type="number" dataKey="y" scale="log" domain={domain}
          stroke="rgba(242,242,240,0.15)" tick={AXIS} tickFormatter={v => v.toExponential(0)}
          label={{ ...axLabel('rel L² (log)', 'insideLeft', -8), angle: -90 }} />
        <ZAxis range={[45, 45]} />
        <Legend wrapperStyle={LEG} iconSize={8} verticalAlign="top" height={22} />
        <Scatter data={points} name="individual seeds" fill="rgba(242,242,240,0.30)" shape="circle" />
        <Scatter data={means} name="mean" fill={PAPER} shape="cross" />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

function LossCurveChart() {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={LOSS_CURVES} margin={{ top: 8, right: 22, bottom: 30, left: 14 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
        <XAxis dataKey="ep" type="number" domain={[0, 13000]} ticks={[0, 4000, 8000, 13000]}
          stroke="rgba(242,242,240,0.15)" tick={AXIS}
          label={axLabel('epoch  →  8000 Adam, then 5000 L-BFGS', 'insideBottom')} />
        <YAxis scale="log" domain={[0.000004, 1]} stroke="rgba(242,242,240,0.15)" tick={AXIS}
          tickFormatter={v => v.toExponential(0)}
          label={{ ...axLabel('total loss (log)', 'insideLeft', -8), angle: -90 }} />
        <ReferenceLine x={8000} stroke="rgba(242,242,240,0.45)" strokeDasharray="5 3"
          label={{ value: 'L-BFGS starts', position: 'top', fill: 'rgba(242,242,240,0.45)',
                   fontFamily: 'Space Mono, monospace', fontSize: 9 }} />
        <Legend wrapperStyle={LEG} iconSize={8} verticalAlign="top" height={22} />
        <Line type="monotone" dataKey="pinn" name="classical PINN" stroke={PAPER} strokeWidth={2.4} dot={false} />
        <Line type="monotone" dataKey="siren" name="SIREN" stroke="rgba(242,242,240,0.30)" strokeWidth={1.6} strokeDasharray="4 3" dot={false} />
        <Line type="monotone" dataKey="q4" name="QAPINN Q4" stroke="rgba(242,242,240,0.55)" strokeWidth={1.8} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function ReproChart() {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={REPRO} layout="vertical" margin={{ top: 8, right: 40, bottom: 24, left: 96 }}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" stroke="rgba(242,242,240,0.15)" tick={AXIS}
          label={axLabel('seed-to-seed variation, CV %', 'insideBottom')} />
        <YAxis type="category" dataKey="model" width={92} stroke="rgba(242,242,240,0.15)"
          tick={{ ...AXIS, fontSize: 9 }} />
        <Bar dataKey="cv" radius={[0, 2, 2, 0]}>
          {REPRO.map(d => (
            <Cell key={d.model} fill={d.kind === 'quantum' ? PAPER : 'rgba(242,242,240,0.22)'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function KPI({ val, lbl }) {
  return (
    <div className="kpi">
      <span className="kpi-val">{val}</span>
      <span className="kpi-lbl">{lbl}</span>
    </div>
  );
}

function MetricTable({ cols, rows, revealFrom, reveal }) {
  return (
    <div className="metrics">
      <div className="metrics-row metrics-head">
        <span />
        {cols.map(c => <span key={c}>{c}</span>)}
      </div>
      {rows.map(([label, vals, win], i) => (
        <div key={label} className={`metrics-row ri${reveal >= revealFrom + Math.floor(i / 2) ? ' in' : ''}`}>
          <span className="m-label">{label}</span>
          {vals.map((v, j) => (
            <span key={j} className={win === j ? 'm-win' : win === -1 ? 'm-none' : ''}>{v}</span>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Slides ──────────────────────────────────────────────────────────────────

function S00() {
  return (
    <article className="slide title-slide">
      <p className="eyebrow">WISER × BQP · GLOBAL QUANTUM+AI 2026</p>
      <h1>Does a quantum layer<br />actually help a<br /><em>physics AI?</em></h1>
      <p className="subtitle">
        We replaced one layer of a physics-informed neural network with a quantum circuit and
        ran it as a controlled ablation on two fluid equations, three seeds each.
        The answer is no — and the theory told us why, before we ran anything.
      </p>
      <p className="title-note">Quantum-Assisted PINNs for CFD · PennyLane state-vector simulation</p>
      <p className="nav-hint">↓ / Space  to advance&nbsp;&nbsp;·&nbsp;&nbsp;N  for notes&nbsp;&nbsp;·&nbsp;&nbsp;F  fullscreen</p>
    </article>
  );
}

function S01({ reveal }) {
  const ri = n => `ri${reveal >= n ? ' in' : ''}`;
  const pillars = [
    ['THE BOTTLENECK', 'Fluid simulation is the slowest step in engineering design',
     'Aircraft wings, turbine blades, combustion, weather. Every design change means re-simulating the flow.'],
    ['THE COST', 'One high-fidelity run takes hours on a cluster',
     'Engineers need thousands of them to explore a design space. The mesh is the expensive part.'],
    ['THE PROMISE', 'A neural network can replace the mesh entirely',
     'Train once on the physics itself, then evaluate anywhere, instantly — no grid, no re-meshing.'],
    ['THE OPEN QUESTION', 'Does a quantum circuit make that surrogate better, or just slower?',
     'Quantum PINNs have been built and benchmarked. What is missing is a rule that tells you which you will get — before you train.'],
  ];
  return (
    <article className="slide map-slide">
      <p className="eyebrow">01 · WHY THIS MATTERS</p>
      <h2>Simulating how air and water move is<br />the slowest step in <em>designing almost anything.</em></h2>
      <div className="pillar-grid cols-4">
        {pillars.map(([sp, st, p], i) => (
          <div key={i} className={`pillar ${i === 3 ? 'accent ' : ''}${ri(Math.min(i + 1, 3))}`}>
            <span>{sp}</span><strong>{st}</strong><p>{p}</p>
          </div>
        ))}
      </div>
    </article>
  );
}

function S02({ reveal }) {
  const ri = n => `ri${reveal >= n ? ' in' : ''}`;
  return (
    <article className="slide dense shift-slide">
      <p className="eyebrow">02 · THE RESEARCH QUESTION</p>
      <h2>Not "is quantum faster."<br /><em>When does it change how the network learns — and why?</em></h2>
      <div className="context-layout">
        <div className={ri(1)}>
          <p className="ctx-label">What we already have</p>
          <div className="ctx-inputs">
            <strong>Theory: Schuld et al. 2021 — encoding sets the frequency spectrum</strong>
            <strong>Practice: quantum PINN benchmarks on individual PDEs</strong>
            <strong>The gap: no way to connect one to the other in advance</strong>
          </div>
        </div>
        <div className={`ctx-arrow${reveal >= 1 ? '' : ' ri'}`}>→</div>
        <div className={`ctx-result ${ri(2)}`}>
          <p className="ctx-label">What we set out to add</p>
          <strong>Turn the theory into a number you compute before training</strong>
          <strong>Test it as a controlled ablation, not a benchmark</strong>
          <strong>Check it against the failures too, not just the wins</strong>
        </div>
      </div>
      <p className="caption" style={{ position: 'absolute', bottom: '6vh', left: '6vw', maxWidth: '52ch' }}>
        The bandwidth theorem is not ours. What we test is whether it works as a practical design
        rule — and whether it survives contact with the cases where quantum loses.
      </p>
    </article>
  );
}

function S03({ reveal }) {
  const ri = n => `ri${reveal >= n ? ' in' : ''}`;
  const rows = [
    ['01', 'It is never shown an answer', 'No dataset of solved flows. Nothing to copy.'],
    ['02', 'It guesses, then gets marked', 'For each point in space and time, it proposes a value.'],
    ['03', 'The equation is the marker', 'If the guess breaks the physics, that counts as error.'],
    ['04', 'Repeat until physics is satisfied', 'The only supervision is the equation and the boundary conditions.'],
  ];
  return (
    <article className="slide dense rules-slide">
      <p className="eyebrow">03 · WHAT IS A PINN?  (the one slide for non-experts)</p>
      <h2>A network that learns physics<br />by being <em>marked wrong by the physics.</em></h2>
      <div className="rule-list" style={{ top: '34%', width: 'min(660px, 50vw)' }}>
        {rows.map(([n, t, c], i) => (
          <div key={n} className={`rule-row ${ri(i + 1)}`} style={{ gridTemplateColumns: '44px 1fr 1.1fr' }}>
            <span className="rule-num">{n}</span><span className="rule-title">{t}</span><span className="rule-copy">{c}</span>
          </div>
        ))}
      </div>
      <div className={ri(1)} style={{ position: 'absolute', left: '6vw', top: '38%', width: 'min(420px, 34vw)' }}>
        <PinnDiagramSVG />
        <p className="caption" style={{ marginTop: '1.5vh', maxWidth: '32ch' }}>
          No training data. The equation itself is the loss function.
        </p>
      </div>
      <p className="caption" style={{ position: 'absolute', bottom: '5vh', left: '6vw', maxWidth: '34ch' }}>
        Raissi et al. 2019. Our classical baseline: 1 341 parameters, 4 layers, tanh.
      </p>
    </article>
  );
}

function S04({ reveal }) {
  const ri = n => `ri${reveal >= n ? ' in' : ''}`;
  return (
    <article className="slide dense flow">
      <p className="eyebrow">04 · WHAT A QAPINN CHANGES</p>
      <h2>We change exactly one layer.<br /><em>Everything else stays byte-identical.</em></h2>
      <div className="flow-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1.25fr', gap: '4vw', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2.4vh' }}>
          <div className={ri(1)}>
            <p className="ctx-label">Classical PINN</p>
            <div className="ctx-inputs" style={{ gap: '0.7vh' }}>
              <strong>Linear(2 → 64)</strong>
              <strong>tanh activations</strong>
              <strong>Hidden blocks × 3</strong>
              <strong>1 341 parameters</strong>
            </div>
          </div>
          <div className={ri(2)} style={{ borderTop: '1px solid var(--line)', paddingTop: '2.2vh' }}>
            <p className="ctx-label">QAPINN — one layer swapped</p>
            <div className="ctx-inputs" style={{ gap: '0.7vh' }}>
              <strong style={{ color: 'var(--paper)', fontStyle: 'normal', fontWeight: 600 }}>QuantumLayer(2 → 4)</strong>
              <strong style={{ color: 'var(--paper)', fontStyle: 'normal', fontWeight: 600 }}>⟨Z⟩ expectation values</strong>
              <strong>Same tail, optimiser, seeds, budget</strong>
              <strong>985 parameters</strong>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '1.6vh' }}>
          <ArchFlowSVG reveal={reveal} />
          <div className={ri(4)} style={{ width: '100%', borderTop: '1px solid var(--line)', paddingTop: '1.4vh' }}>
            <CircuitSVG />
          </div>
        </div>
      </div>
    </article>
  );
}

function SArchDetail({ reveal }) {
  const ri = n => `ri${reveal >= n ? ' in' : ''}`;
  const cols = [
    ['WHAT GOES IN', 'Two numbers: a position and a time',
     'Every training step feeds 8 000 randomly drawn (x,t) points plus 400 on the boundary and initial line. Both are affinely normalized to [−1,1] first — without that the first layer saturates.'],
    ['WHAT ACTUALLY CHANGES', 'A 60-parameter matrix becomes a 24-parameter circuit',
     'Classical: multiply by a learned 2×20 matrix, squash with tanh, done. Quantum: rotate 4 qubits by angles proportional to x and t, apply learned rotations, entangle with a CNOT ring, re-upload the input, rotate again — then read one ⟨Z⟩ per qubit. Four numbers in [−1,1] come out.'],
    ['WHAT COMES OUT', 'One value of u, and the derivatives of that value',
     'The tail maps those 4 numbers to a single u(x,t). Then autograd differentiates u back through the whole network — including the circuit — to get ∂u/∂t, ∂u/∂x and ∂²u/∂x², which is what the PDE residual needs.'],
  ];
  return (
    <article className="slide dense flow">
      <p className="eyebrow">05 · ARCHITECTURE — WHAT THE NETWORK ACTUALLY DOES</p>
      <h2>Two numbers in, one number out.<br /><em>We replace 60 parameters with 24 and change nothing else.</em></h2>
      <div className="flow-body">
        <div className={ri(1)}><ArchDeepSVG reveal={reveal} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2.6vw', marginTop: '1.4vh' }}>
          {cols.map(([k, t, c], i) => (
            <div key={k} className={ri(Math.min(i + 2, 4))} style={{ borderTop: '1px solid var(--line)', paddingTop: '1.1vh' }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 'clamp(8px,0.68vw,11px)', letterSpacing: '0.14em', color: 'var(--muted)' }}>{k}</span>
              <p style={{ fontFamily: 'var(--serif)', fontSize: 'clamp(11px,1vw,16px)', fontWeight: 500, color: 'var(--paper)', margin: '0.3vh 0', lineHeight: 1.25 }}>{t}</p>
              <p className="caption" style={{ maxWidth: 'none' }}>{c}</p>
            </div>
          ))}
        </div>
        <p className={`caption flow-foot ${ri(4)}`} style={{ maxWidth: '96ch' }}>
          <strong style={{ color: 'var(--paper)', fontWeight: 500 }}>Why it costs ~20×:</strong> the PDE residual needs a
          second derivative of the output with respect to the input, so every training step differentiates twice
          <em> through the state-vector simulation</em>. That is the dashed return path. The circuit is tiny — 4 qubits,
          16 amplitudes — but it is evaluated and differentiated 8 400 times per step, in Python, per gate.
        </p>
      </div>
    </article>
  );
}

function SExperiments({ reveal }) {
  const ri = n => `ri${reveal >= n ? ' in' : ''}`;
  const rows = [
    ['E1', 'Heat — head-to-head', 'Does it help when the target fits inside K?', 'Tied  ·  t = 1.05'],
    ['E2', 'Burgers — head-to-head', 'Does it help when the target is broadband?', 'Classical 3.1×  ·  t = 4.8'],
    ['E3', 'SIREN control', 'Is any effect just periodic activations?', 'Not ruled out — SIREN ties Q4'],
    ['E4', 'Heat K-sweep, 18 runs', 'Does bandwidth K predict accuracy?', 'Yes — at fixed register width'],
    ['E5', 'Burgers K ladder', 'Does the right K matter on a hard target?', 'No signal — every seed differs'],
  ];
  return (
    <article className="slide dense flow">
      <p className="eyebrow">06 · THE FIVE EXPERIMENTS</p>
      <h2>Two equations chosen to sit at opposite ends of one axis,<br />
        <em>and five tests built around them.</em></h2>
      <div className="flow-body" style={{ display: 'grid', gridTemplateColumns: '1.05fr 1fr', gap: '3vw', alignItems: 'center' }}>
        <ExperimentMapSVG reveal={reveal} />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="metrics" style={{ borderTop: 'none' }}>
            {rows.map(([id, name, asks, verdict], i) => (
              <div key={id} className={`metrics-row ${ri(Math.min(i + 1, 4))}`}
                style={{ gridTemplateColumns: '34px 1fr', gap: '1vw', alignItems: 'start', padding: '1.05vh 0' }}>
                <span className="rule-num" style={{ paddingTop: '0.15em' }}>{id}</span>
                <span>
                  <span style={{ display: 'block', fontFamily: 'var(--serif)', fontSize: 'clamp(12px,1.05vw,17px)', fontWeight: 500, color: 'var(--paper)', lineHeight: 1.25 }}>{name}</span>
                  <span style={{ display: 'block', fontFamily: 'var(--sans)', fontSize: 'clamp(10px,0.85vw,13px)', fontWeight: 300, color: 'rgba(242,242,240,0.5)', marginTop: '0.15em' }}>{asks}</span>
                  <span style={{ display: 'block', fontFamily: 'var(--mono)', fontSize: 'clamp(9px,0.75vw,12px)', color: 'rgba(242,242,240,0.72)', marginTop: '0.3em' }}>→ {verdict}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="caption" style={{ position: 'absolute', bottom: '3vh', left: '6vw', maxWidth: '86ch' }}>
        E1 and E2 ask whether it helps. E3 asks whether any effect is even quantum. E4 and E5 ask whether
        the bandwidth formula predicts behaviour. Verdicts shown are the final three-seed results — the
        rest of the deck is how we got to each one, including two we had to revise.
      </p>
    </article>
  );
}

function S05({ reveal }) {
  const ri = n => `ri${reveal >= n ? ' in' : ''}`;
  return (
    <article className="slide close-slide">
      <p className="eyebrow">07 · THE ANSWER, UP FRONT</p>
      <h2>One number, known before training, tells you what the circuit can represent.<br />
        <em>It never told us the quantum model would win — because it didn't.</em></h2>
      <div className={`formula-block ${ri(1)}`}>K = (n_qubits ÷ in_dim) × n_uploads</div>
      <div className={ri(2)} style={{ display: 'flex', gap: '3vw', marginTop: '1vh', flexWrap: 'wrap' }}>
        <KPI val="0 of 2" lbl="PDEs where quantum won" />
        <KPI val="~20×" lbl="training cost of the quantum layer" />
        <KPI val="24–82%" lbl="quantum seed variation (classical: 0.7–11%)" />
      </div>
      <p className={`caption ${ri(3)}`} style={{ marginTop: '2.5vh', maxWidth: '60ch' }}>
        Derived from Schuld et al. 2021. The formula is a ceiling, not a promise. On the smooth
        problem the quantum model ties classical; on the broadband one it loses 3.1×. The rest of
        this deck is why that happens, and why a negative result with a mechanism is still worth having.
      </p>
    </article>
  );
}

function S06({ reveal }) {
  const ri = n => `ri${reveal >= n ? ' in' : ''}`;
  const pillars = [
    ['THE SHAPES', 'The circuit can only draw a fixed set of wave shapes',
     'Its output is a Fourier series with frequencies {−K … K}, set when you build the circuit.'],
    ['TRAINING', 'Training resizes those waves. It never adds new ones.',
     'Gradient descent adjusts the coefficients cₙ. It cannot create a frequency the encoding did not supply.'],
    ['THE CEILING', 'No wave faster than K can ever appear',
     'Not a limit of depth, width or patience. It is a theorem about the encoding.'],
    ['THE CONSEQUENCE', 'This is a restriction, not an addition',
     'A restricted function class can only help if the restriction happens to suit the problem. That is the whole bet.'],
  ];
  return (
    <article className="slide dense map-slide">
      <p className="eyebrow">08 · WHY — THE MECHANISM (NOT OURS)</p>
      <h2 style={{ marginBottom: '1.2vh' }}>The circuit is a wave generator with a<br />fixed vocabulary. <em>Training can't extend it.</em></h2>
      <p className="caption" style={{ maxWidth: '58ch' }}>
        A theorem from Schuld et al., <em>Phys. Rev. A</em> 103, 032430 (2021) — established quantum-ML
        theory. Our contribution starts on the next slide: turning it into a design rule and testing
        whether it predicts real PINN behaviour.
      </p>
      <div className="pillar-grid cols-4">
        {pillars.map(([sp, st, p], i) => (
          <div key={i} className={`pillar ${i === 3 ? 'accent ' : ''}${ri(i + 1)}`}>
            <span>{sp}</span><strong>{st}</strong><p>{p}</p>
          </div>
        ))}
      </div>
    </article>
  );
}

function S07({ reveal }) {
  const ri = n => `ri${reveal >= n ? ' in' : ''}`;
  const rows = [
    ['RE-UPLOAD', 'n_uploads = n_layers', 'Every pass that re-feeds the input adds one unit of bandwidth. The only lever that scales.'],
    ['ANGLE ENC.', 'n_uploads = 1, always', 'The input enters once no matter how deep. Stacking layers buys parameters, not bandwidth.'],
  ];
  return (
    <article className="slide dense" style={{ justifyContent: 'flex-start' }}>
      <p className="eyebrow">09 · HOW TO COMPUTE THE CEILING</p>
      <h2>Three numbers you already know give you the ceiling <em>before you spend a GPU-hour.</em></h2>
      <div className="formula-block" style={{ fontSize: 'clamp(16px,2.2vw,34px)', marginBottom: '2vh' }}>
        K = (n_qubits ÷ in_dim) × n_uploads
      </div>
      <div style={{ width: 'min(760px, 58vw)', borderTop: '1px solid var(--line)' }}>
        {rows.map(([a, b, c], i) => (
          <div key={a} className={`rule-row ${ri(i + 1)}`}
            style={{ display: 'grid', gridTemplateColumns: '84px 1fr 1.1fr', padding: '1.5vh 0',
                     borderBottom: '1px solid var(--line)', gap: '1.5vw', alignItems: 'start' }}>
            <span className="rule-num">{a}</span><span className="rule-title">{b}</span><span className="rule-copy">{c}</span>
          </div>
        ))}
      </div>
      <div className={ri(3)} style={{ position: 'absolute', right: '6vw', bottom: '6vh', width: 'min(300px, 28vw)' }}>
        <p className="caption" style={{ marginBottom: '1vh' }}>Heat eq. required modes — K=4 covers both</p>
        <FreqSpectrumSVG />
      </div>
      <p className="caption" style={{ position: 'absolute', bottom: '6vh', left: '6vw', maxWidth: '30ch' }}>
        Our setup: in_dim=2 (x,t), n_qubits=4, n_uploads=2 → K=4.
      </p>
    </article>
  );
}

function S08({ reveal }) {
  const ri = n => `ri${reveal >= n ? ' in' : ''}`;
  return (
    <article className="slide dense data-slide">
      <p className="eyebrow">10 · WE MEASURED THE CEILING — IT IS REALLY THERE</p>
      <h2>Sweep one input, take a Fourier transform:<br />the circuit's output <em>flatlines exactly at K.</em></h2>
      <div className={`kpi-row ${ri(1)}`}>
        <KPI val="0.000" lbl="magnitude past K, all 3 configs" />
        <KPI val="256" lbl="point DFT over one period" />
        <KPI val="untrained" lbl="bandwidth is structural, not learned" />
      </div>
      <div className={ri(2)} style={{ position: 'absolute', left: '6vw', right: '34vw', top: '40%', bottom: '9vh' }}>
        <SpectrumChart />
      </div>
      <div className={ri(3)} style={{ position: 'absolute', right: '6vw', top: '42%', width: 'min(300px, 25vw)' }}>
        <p className="caption">
          <strong style={{ color: 'var(--paper)', fontWeight: 500 }}>One:</strong> the cutoff is hard —
          magnitude is exactly zero past K, so the formula is not an approximation.
        </p>
        <p className="caption" style={{ marginTop: '1.4vh' }}>
          <strong style={{ color: 'var(--paper)', fontWeight: 500 }}>Two:</strong> amplitude decays as n rises,
          so the top mode is representable but <em>weak</em>. Coverage alone is not enough — you want margin.
        </p>
      </div>
      <p className="caption" style={{ position: 'absolute', bottom: '3vh', left: '6vw', maxWidth: '48ch' }}>
        Measured with <code>src/xai/fourier.py</code> on an untrained layer — no training involved.
      </p>
    </article>
  );
}

function S09({ reveal }) {
  const ri = n => `ri${reveal >= n ? ' in' : ''}`;
  return (
    <article className="slide dense shift-slide">
      <p className="eyebrow">11 · TESTBED 1 — THE HEAT EQUATION</p>
      <h2>We picked a problem where the right answer is known,<br />so a <em>wrong prediction has nowhere to hide.</em></h2>
      <div className="context-layout">
        <div className={ri(1)}>
          <p className="ctx-label">The problem</p>
          <div className="ctx-inputs">
            <strong>∂u/∂t = α ∂²u/∂x²</strong>
            <strong>α = 0.05</strong>
            <strong>u(0,t) = u(1,t) = 0</strong>
            <strong>u(x,0) = sin(πx) + 0.5 sin(4πx)</strong>
          </div>
        </div>
        <div className={`ctx-arrow${reveal >= 1 ? '' : ' ri'}`}>→</div>
        <div className={`ctx-result ${ri(2)}`}>
          <p className="ctx-label">Exact solution — the answer is known in advance</p>
          <strong style={{ fontStyle: 'normal', fontFamily: 'var(--mono)', fontSize: 'clamp(11px,1vw,16px)' }}>
            u = sin(πx)·e<sup>-απ²t</sup><br />+ 0.5·sin(4πx)·e<sup>-16απ²t</sup>
          </strong>
          <p style={{ fontFamily: 'var(--sans)', fontSize: 'clamp(11px,0.95vw,15px)', color: 'rgba(242,242,240,0.55)', marginTop: '1vh' }}>
            Only two waves matter: k=1 and k=4. So the theory says a K=3 circuit must fail and a K=4 circuit must not.
          </p>
        </div>
      </div>
      <p className={`caption ${ri(3)}`} style={{ position: 'absolute', bottom: '6vh', left: '6vw', maxWidth: '46ch' }}>
        A falsifiable prediction: the error must fall once K reaches 4, and not before.
      </p>
    </article>
  );
}

function S10({ reveal }) {
  const ri = n => `ri${reveal >= n ? ' in' : ''}`;
  const rows = [
    ['K=1', '2 qubits · angle · 1 layer', '(2÷2)×1 = 1', false],
    ['K=2', '4 qubits · angle · 1 layer', '(4÷2)×1 = 2', true],
    ['K=3', '2 qubits · reupload · 3 layers', '(2÷2)×3 = 3', false],
    ['K=4', '4 qubits · reupload · 2 layers', '(4÷2)×2 = 4', true],
    ['K=5', '2 qubits · reupload · 5 layers', '(2÷2)×5 = 5', false],
    ['K=8', '4 qubits · reupload · 4 layers', '(4÷2)×4 = 8', true],
  ];
  return (
    <article className="slide dense rules-slide">
      <p className="eyebrow">12 · METHOD — 18 RUNS, AND A FLAW WE FOUND IN OUR OWN DESIGN</p>
      <h2>Six bandwidths, three seeds.<br /><em>But the ladder changes qubit count too.</em></h2>
      <div className="rule-list" style={{ top: '33%' }}>
        {rows.map(([k, cfg, bw, is4], i) => (
          <div key={k} className={`rule-row${is4 ? ' highlight' : ''} ${ri(Math.min(i + 1, 3))}`}
            style={{ gridTemplateColumns: '52px 1fr 1.3fr', padding: '1.1vh 2vw 1.1vh 0' }}>
            <span className="rule-num">{k}</span>
            <span className="rule-title">{cfg}</span>
            <span className="rule-copy">{bw}</span>
          </div>
        ))}
      </div>
      <div className={ri(4)} style={{ position: 'absolute', left: '6vw', bottom: '5vh', width: 'min(340px, 30vw)' }}>
        <p className="ctx-label">The confound</p>
        <p className="caption" style={{ marginTop: '0.8vh' }}>
          Rows in white are 4 qubits, the rest are 2. K and register width move together, so the
          sweep alone cannot tell them apart. The next slide separates them.
        </p>
      </div>
      <p className="caption" style={{ position: 'absolute', bottom: '5vh', right: '6vw', maxWidth: '32ch', textAlign: 'right' }}>
        Also not varied: measurement operator (⟨Z⟩ throughout), entanglement (ring), optimiser.
        Parameter counts drift 927–1 009.
      </p>
    </article>
  );
}

function S11({ reveal }) {
  const ri = n => `ri${reveal >= n ? ' in' : ''}`;
  return (
    <article className="slide dense data-slide">
      <p className="eyebrow">13 · RESULT 1 — SPLIT THE SWEEP AND THE MECHANISM APPEARS</p>
      <h2>Hold the qubit count fixed, and bandwidth behaves<br /><em>exactly as the theory says it should.</em></h2>
      <div className={`kpi-row ${ri(1)}`}>
        <KPI val="0.024" lbl="K=2 · 4 qubits · under-covers" />
        <KPI val="0.012" lbl="K=4 · 4 qubits · covers k=4" />
        <KPI val="0.016" lbl="K=8 · 4 qubits · excess capacity" />
      </div>
      <div className={ri(2)} style={{ position: 'absolute', left: '6vw', right: '36vw', top: '42%', bottom: '9vh' }}>
        <KSweepChart />
      </div>
      <div className={ri(3)} style={{ position: 'absolute', right: '6vw', top: '43%', width: 'min(330px, 27vw)' }}>
        <p className="ctx-label">What we cannot claim</p>
        <p className="caption" style={{ marginTop: '0.6vh' }}>
          Every 4-qubit run beats nearly every 2-qubit run. So the big K=3 → K=4 drop is also a
          2 → 4 qubit jump. We cannot attribute it to bandwidth.
        </p>
        <p className="ctx-label" style={{ marginTop: '1.8vh' }}>What we can</p>
        <p className="caption" style={{ marginTop: '0.6vh' }}>
          Along the white line, width is fixed and only K moves: the minimum sits exactly at K=4,
          with the mild rise at K=8 that capacity theory predicts. That is the mechanism, uncontaminated.
        </p>
      </div>
      <p className={`caption ${ri(4)}`} style={{ position: 'absolute', bottom: '3vh', left: '6vw', maxWidth: '76ch' }}>
        K=5 on 2 qubits covers mode k=4 and is still 5× worse than K=4 on 4 qubits. <strong style={{ color: 'var(--paper)', fontWeight: 500 }}>Bandwidth
        is necessary but not sufficient</strong> — the layer emits one ⟨Z⟩ per qubit, so a narrow register is a
        dimensional bottleneck no amount of re-uploading fixes.
      </p>
    </article>
  );
}

function S12({ reveal }) {
  const ri = n => `ri${reveal >= n ? ' in' : ''}`;
  return (
    <article className="slide dense shift-slide">
      <p className="eyebrow">14 · TESTBED 2 — BURGERS, THE HARD CASE</p>
      <h2>A shock wave has detail at every scale.<br /><em>This is where a bandwidth limit should hurt.</em></h2>
      <div className="context-layout">
        <div className={ri(1)}>
          <p className="ctx-label">The problem</p>
          <div className="ctx-inputs">
            <strong>∂u/∂t + u·∂u/∂x = ν ∂²u/∂x²</strong>
            <strong>ν = 0.01/π ≈ 0.00318</strong>
            <strong>Sharp shock forms near x = 0</strong>
            <strong>No closed-form solution</strong>
          </div>
        </div>
        <div className={`ctx-arrow${reveal >= 1 ? '' : ' ri'}`}>→</div>
        <div className={`ctx-result ${ri(2)}`}>
          <p className="ctx-label">Why it is the real test</p>
          <strong>Broadband — no reachable K covers it</strong>
          <strong>No exact solution → no clean prediction</strong>
          <p style={{ fontFamily: 'var(--sans)', fontSize: 'clamp(11px,0.95vw,15px)', color: 'rgba(242,242,240,0.55)', marginTop: '0.8vh' }}>
            Heat was designed to confirm the mechanism. Burgers was chosen to try to break it.
          </p>
        </div>
      </div>
      <p className="caption" style={{ position: 'absolute', bottom: '6vh', left: '6vw', maxWidth: '48ch' }}>
        Reference from a spectral solver. All models: 8 000 Adam + 5 000 L-BFGS, 3 seeds, identical.
      </p>
    </article>
  );
}

function S13({ reveal }) {
  const ri = n => `ri${reveal >= n ? ' in' : ''}`;
  return (
    <article className="slide dense data-slide">
      <p className="eyebrow">15 · RESULT 2 — ON THE HARD PROBLEM, CLASSICAL WINS CLEARLY</p>
      <h2>The classical network is 3.1× more accurate,<br /><em>and this gap survives three seeds.</em></h2>
      <div className={`kpi-row ${ri(1)}`}>
        <KPI val="0.0063" lbl="classical PINN" />
        <KPI val="0.0194" lbl="QAPINN Q4" />
        <KPI val="t = 4.8" lbl="statistically distinguishable" />
        <KPI val="19×" lbl="quantum training cost" />
      </div>
      <div className={ri(2)} style={{ position: 'absolute', left: '6vw', right: '37vw', top: '42%', bottom: '9vh' }}>
        <SeedScatter data={BURGERS} domain={[0.004, 0.12]} />
      </div>
      <div className={ri(3)} style={{ position: 'absolute', right: '6vw', top: '43%', width: 'min(340px, 28vw)' }}>
        <p className="ctx-label">The bandwidth ladder does not hold here</p>
        <p className="caption" style={{ marginTop: '0.6vh' }}>
          Q3, Q4 and Q5 are statistically indistinguishable, and <em>a different K wins on every seed</em>
          (Q5 on 1234, Q4 on 2025, Q3 on 7). On a broadband target no reachable K suffices, so K
          stops predicting anything.
        </p>
        <p className="ctx-label" style={{ marginTop: '1.8vh' }}>And SIREN now matches quantum</p>
        <p className="caption" style={{ marginTop: '0.6vh' }}>
          0.0148 vs 0.0194 — tied — at 4 minutes against 81.
        </p>
      </div>
      <p className={`caption ${ri(4)}`} style={{ position: 'absolute', bottom: '3vh', left: '6vw', maxWidth: '72ch' }}>
        Crosses are means, dots are individual seeds. Note how tight the classical spread is
        (0.7%) against the quantum ones — that gap is a result in itself, three slides from now.
      </p>
    </article>
  );
}

function S14({ reveal }) {
  const ri = n => `ri${reveal >= n ? ' in' : ''}`;
  return (
    <article className="slide dense data-slide">
      <p className="eyebrow">16 · THE RESULT WE ALMOST REPORTED</p>
      <h2>We had a 7.8% quantum win.<br /><em>It was our classical baseline being under-trained.</em></h2>
      <div className={`kpi-row ${ri(1)}`}>
        <KPI val="0.0756" lbl="classical @ 500 L-BFGS steps" />
        <KPI val="0.0063" lbl="classical @ 5 000 steps" />
        <KPI val="12×" lbl="improvement from budget alone" />
      </div>
      <div className={ri(2)} style={{ position: 'absolute', left: '6vw', right: '37vw', top: '42%', bottom: '9vh' }}>
        <LossCurveChart />
      </div>
      <div className={ri(3)} style={{ position: 'absolute', right: '6vw', top: '43%', width: 'min(340px, 28vw)' }}>
        <p className="caption">
          Look at the drop after the dashed line. That is the L-BFGS phase, and it does more for
          accuracy than the 8 000 Adam epochs before it. Our original budget stopped at 500 steps —
          <em> while every model was still descending.</em>
        </p>
        <p className="caption" style={{ marginTop: '1.4vh' }}>
          Cutting training short does not penalise models equally. It penalises whichever one has
          the most headroom left. That was the classical PINN, which is how a quantum "win" appeared.
        </p>
      </div>
      <p className={`caption ${ri(4)}`} style={{ position: 'absolute', bottom: '3vh', left: '6vw', maxWidth: '78ch' }}>
        Our own technical report flagged this as limitation L1 before we tested it: our classical Burgers
        baseline sat 80× off the published figure for the same architecture. <strong style={{ color: 'var(--paper)', fontWeight: 500 }}>That
        gap is the fingerprint of an under-trained baseline</strong> — and it is worth checking in any paper claiming quantum advantage.
      </p>
    </article>
  );
}

function S15({ reveal }) {
  const ri = n => `ri${reveal >= n ? ' in' : ''}`;
  return (
    <article className="slide dense flow">
      <p className="eyebrow">17 · THE FULL SCOREBOARD — INCLUDING THE ROWS WE LOSE</p>
      <h2>Tied on the smooth problem, beaten on the hard one,<br /><em>and ~20× the cost either way.</em></h2>
      <div className="flow-body">
        <div className={ri(1)}>
          <MetricTable
            cols={['Classical PINN', 'SIREN', 'QAPINN Q4']}
            rows={[
              ['rel L² — Heat  (3 seeds)',    ['0.000243', '0.000231', '0.000487'], -1],
              ['rel L² — Burgers  (3 seeds)', ['0.006268', '0.014832', '0.019406'], 0],
              ['Seed variation (CV)',          ['0.7 – 11%', '21 – 36%', '24 – 82%'],  0],
              ['Training time — Burgers',      ['4.2 min',   '4.2 min',   '81 min'],   0],
              ['Training time — Heat',         ['2.7 min',   '2.2 min',   '60 min'],   0],
              ['Parameters',                   ['1 341',     '1 341',     '985'],      2],
              ['Peak memory',                  ['not measured', 'not measured', 'not measured'], -1],
              ['Generalization, unseen domain',['not tested', 'not tested', 'not tested'], -1],
            ]}
            revealFrom={2} reveal={reveal} />
        </div>
        <p className={`caption flow-foot ${ri(5)}`} style={{ maxWidth: '94ch' }}>
          White = better. <strong style={{ color: 'var(--paper)', fontWeight: 500 }}>Heat has no winner</strong> — the three
          models are statistically indistinguishable (t = 1.05), so we mark no column. Burgers classical
          wins and that one is solid (t = 4.82). Memory and out-of-domain generalization were never measured
          and we will not guess them. All figures from <code>results/rerun/</code>: one machine, one recipe
          per PDE, 5 000 L-BFGS, seeds 1234 / 2025 / 7.
        </p>
      </div>
    </article>
  );
}

function S16({ reveal }) {
  const ri = n => `ri${reveal >= n ? ' in' : ''}`;
  return (
    <article className="slide dense data-slide">
      <p className="eyebrow">18 · THE FINDING WE WEREN'T LOOKING FOR</p>
      <h2>Run it again with a different seed and the quantum answer moves.<br />
        <em>The classical one barely does.</em></h2>
      <div className={`kpi-row ${ri(1)}`}>
        <KPI val="0.7%" lbl="classical PINN spread, Burgers" />
        <KPI val="82%" lbl="QAPINN spread, heat" />
        <KPI val="×3" lbl="seeds — the minimum to see this at all" />
      </div>
      <div className={ri(2)} style={{ position: 'absolute', left: '6vw', right: '38vw', top: '40%', bottom: '9vh' }}>
        <ReproChart />
      </div>
      <div className={ri(3)} style={{ position: 'absolute', right: '6vw', top: '42%', width: 'min(350px, 29vw)' }}>
        <p className="caption">
          White bars are quantum. The classical PINN lands within <strong style={{ color: 'var(--paper)', fontWeight: 500 }}>0.7%</strong> across
          three seeds on Burgers; the quantum models swing by 24–82%.
        </p>
        <p className="caption" style={{ marginTop: '1.4vh' }}>
          This compounds the cost problem. A quantum number from a single run carries almost no
          information, so you need several seeds — on top of already being 20× slower per run.
        </p>
        <p className="caption" style={{ marginTop: '1.4vh' }}>
          It is also why our own earlier single-seed conclusions dissolved: at this variance, one
          run can show almost anything.
        </p>
      </div>
      <p className="caption" style={{ position: 'absolute', bottom: '3vh', left: '6vw', maxWidth: '54ch' }}>
        Coefficient of variation = standard deviation ÷ mean, over seeds 1234 / 2025 / 7.
      </p>
    </article>
  );
}

function S17({ reveal }) {
  const ri = n => `ri${reveal >= n ? ' in' : ''}`;
  const ratio = (CAPACITY.pinn / CAPACITY.qapinn).toFixed(1);
  return (
    <article className="slide dense flow">
      <p className="eyebrow">19 · EXPLAINABILITY — HOW THE TWO MODELS DIFFER</p>
      <h2>The quantum layer isn't a bigger brain.<br /><em>It's a smaller one — which is the whole problem.</em></h2>
      <div className="flow-body">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3vw' }}>
          <div className={ri(1)}>
            <p className="ctx-label">Probe 1 — capacity bound</p>
            <p className="caption" style={{ maxWidth: 'none', marginTop: '1vh' }}>
              Bartlett–Mendelson spectral complexity: the QAPINN is a
              <strong style={{ color: 'var(--paper)', fontWeight: 500 }}> {ratio}× structurally simpler</strong> function
              class than the PINN, with 27% fewer parameters — and on heat it reaches comparable accuracy
              with that simpler class.
            </p>
            <div style={{ display: 'flex', gap: '2.5vw', marginTop: '1.6vh', flexWrap: 'wrap' }}>
              <KPI val={`${ratio}×`} lbl="lower complexity bound" />
              <KPI val="27%" lbl="fewer parameters" />
            </div>
          </div>
          <div className={ri(2)}>
            <p className="ctx-label">Probe 2 — the measured spectrum</p>
            <p className="caption" style={{ maxWidth: 'none', marginTop: '1vh' }}>
              The DFT of the untrained layer is exactly zero past K. So the restriction is not an
              emergent training effect — it is baked into the architecture before a single gradient step.
            </p>
            <p className="caption" style={{ maxWidth: 'none', marginTop: '1.2vh' }}>
              Together: the quantum layer <em>constrains</em> the hypothesis space rather than enlarging it,
              exactly as the Fourier theorem says. On heat the constraint is harmless. On Burgers it binds.
            </p>
          </div>
        </div>
        <p className={`caption flow-foot ${ri(3)}`} style={{ maxWidth: '92ch', borderTop: '1px solid var(--line)' }}>
          <strong style={{ color: 'var(--paper)', fontWeight: 500 }}>Honest limits.</strong> Both probes are indirect —
          no attribution, no neuron-level interpretability, no loss-landscape visualisation. And with 3 seeds
          at 24–82% variance we can describe the mechanism but cannot separate inductive bias from
          optimisation luck with statistical confidence.
        </p>
      </div>
    </article>
  );
}

function S18({ reveal }) {
  const ri = n => `ri${reveal >= n ? ' in' : ''}`;
  const helps = [
    ['TARGET FITS INSIDE K', 'Heat: statistically tied with classical',
     '0.000243 vs 0.000487, t = 1.05. The restriction costs nothing here — but it also buys nothing.'],
    ['TIGHT PARAMETER BUDGETS', '985 params doing the work of 1 341',
     'If parameter count binds rather than wall clock or reproducibility, the trade improves. It never closed on our runs.'],
  ];
  const hurts = [
    ['TARGET EXCEEDS K', 'Burgers: classical wins 3.1×',
     'Broadband shock, no reachable K covers it, and K stops predicting anything — a different bandwidth wins on each seed.'],
    ['ANY WALL-CLOCK BUDGET', '~20× on identical hardware',
     '81 min vs 4.2 min on Burgers; 60 vs 2.7 on heat. And you need several seeds, so multiply again.'],
    ['YOU WANTED A BAND-LIMITED PRIOR', 'SIREN gives you one for 1/20th the cost',
     '0.0148 vs 0.0194 on Burgers — statistically tied, in 4 minutes. The quantum layer offers no function class a classical net cannot.'],
  ];
  const Col = ({ title, sub, items, from }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.4vh' }}>
      <div>
        <p className="ctx-label">{title}</p>
        <p style={{ fontFamily: 'var(--serif)', fontSize: 'clamp(14px,1.4vw,22px)', fontWeight: 500, color: 'var(--paper)', marginTop: '0.4vh', lineHeight: 1.2 }}>{sub}</p>
      </div>
      {items.map(([k, t, c], i) => (
        <div key={k} className={ri(from + i)} style={{ borderTop: '1px solid var(--line)', paddingTop: '1vh' }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 'clamp(8px,0.7vw,11px)', letterSpacing: '0.14em', color: 'var(--muted)' }}>{k}</span>
          <p style={{ fontFamily: 'var(--serif)', fontSize: 'clamp(12px,1.05vw,17px)', fontWeight: 500, color: 'var(--paper)', margin: '0.3vh 0', lineHeight: 1.25 }}>{t}</p>
          <p className="caption" style={{ maxWidth: 'none' }}>{c}</p>
        </div>
      ))}
    </div>
  );
  return (
    <article className="slide dense flow">
      <p className="eyebrow">20 · THE HONEST ANSWER — WHEN IT HELPS, WHEN IT DOESN'T</p>
      <h2>The quantum layer removes capability in a structured way.<br />
        <em>That only pays if the structure suits the problem. Here it never did.</em></h2>
      <div className="flow-body">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.15fr', gap: '3.5vw' }}>
          <Col title="≈  BEST CASE: PARITY" sub="The restriction costs nothing" items={helps} from={1} />
          <Col title="✗  WHEN IT COSTS YOU" sub="Broadband targets, any clock, and a cheaper classical alternative" items={hurts} from={1} />
        </div>
        <p className={`caption flow-foot ${ri(4)}`} style={{ maxWidth: '92ch' }}>
          The one-sentence version: <strong style={{ color: 'var(--paper)', fontWeight: 500 }}>a fixed band-limited basis
          can at best match an unrestricted one, and only when the target happens to fit inside it.</strong> We found no
          regime across two PDEs where band-limiting won. Two PDEs is not a proof — but the same formula
          predicted the parity, the loss, and where the advantage would have to come from if it existed.
        </p>
      </div>
    </article>
  );
}

function S19({ reveal }) {
  const ri = n => `ri${reveal >= n ? ' in' : ''}`;
  const rows = [
    ['STEP 0', 'First ask whether you need a quantum layer at all',
     'On both our PDEs the classical PINN matched or beat it, 20× faster and far more reproducible. This step eliminates most cases.'],
    ['STEP 1', 'Fourier-analyse the target, not the network',
     'FFT the initial condition and any known solution, count the modes carrying real energy. Costs seconds.'],
    ['STEP 2', 'Check the modes fit inside a reachable K — with margin',
     'The measured spectrum showed the top harmonic is present but weak. Aim one mode above what you need. If your target is broadband, stop: no reachable K will cover it.'],
    ['STEP 3', 'Buy K with re-uploads, but do not forget register width',
     'K = (n_qubits ÷ in_dim) × n_uploads. Re-uploads are the cheap lever — but qubits also set the output width feeding the classical tail, and K=5 on 2 qubits lost to K=4 on 4.'],
  ];
  return (
    <article className="slide dense rules-slide">
      <p className="eyebrow">21 · THE RECOMMENDATION — HOW TO BUILD ONE OF THESE</p>
      <h2>Four steps, and the first one<br />is <em>"probably don't."</em></h2>
      <div className="rule-list" style={{ top: '33%', width: 'min(900px, 68vw)' }}>
        {rows.map(([n, t, c], i) => (
          <div key={n} className={`rule-row${i === 0 ? ' highlight' : ''} ${ri(i + 1)}`}
            style={{ gridTemplateColumns: '62px 1fr 1.6fr', padding: '1.4vh 2vw 1.4vh 0' }}>
            <span className="rule-num">{n}</span><span className="rule-title">{t}</span><span className="rule-copy">{c}</span>
          </div>
        ))}
      </div>
      <p className="caption" style={{ position: 'absolute', bottom: '5vh', left: '6vw', maxWidth: '62ch' }}>
        Scope: 1D time-dependent PDEs with 2D input (x,t) and identifiable Fourier structure, at 2–6 qubits
        on a simulator. The mode-counting step assumes you have an initial condition or reference solution to transform.
      </p>
    </article>
  );
}

function S20({ reveal }) {
  const ri = n => `ri${reveal >= n ? ' in' : ''}`;
  const pillars = [
    ['SIMULATOR ONLY', 'No quantum hardware, at any point',
     'PennyLane state-vector simulation throughout — no shot noise, no decoherence, no gate error. Hardware would only degrade the quantum column further.'],
    ['CONFOUNDED SWEEP', 'K and register width varied together',
     'Our 18-run ladder alternates 2 and 4 qubits, so only the fixed-width slice supports the bandwidth claim. A clean sweep would hold qubits constant throughout.'],
    ['ONE READOUT', '⟨Z⟩ expectation everywhere',
     'Our single probability-readout run halved the heat error (0.0119 → 0.0063 at the old budget). The measurement operator clearly matters and we did not explore it.'],
    ['SCOPE', 'Two 1D PDEs, 2–6 qubits, 3 seeds',
     'No 2D/3D domains, no out-of-domain generalization test, no memory profiling, no barren-plateau measurement — we stayed below the regime where plateaus are expected.'],
  ];
  return (
    <article className="slide dense map-slide">
      <p className="eyebrow">22 · LIMITATIONS</p>
      <h2>What this result does not cover,<br /><em>said before anyone has to ask.</em></h2>
      <div className="pillar-grid cols-4">
        {pillars.map(([sp, st, p], i) => (
          <div key={i} className={`pillar ${i === 1 ? 'accent ' : ''}${ri(i + 1)}`}>
            <span>{sp}</span><strong>{st}</strong><p>{p}</p>
          </div>
        ))}
      </div>
    </article>
  );
}

function S21({ reveal }) {
  const ri = n => `ri${reveal >= n ? ' in' : ''}`;
  const rows = [
    ['01', 'Re-run the sweep with qubit count held fixed',
     'The single change that would turn our best evidence from a two-point slice into a proper bandwidth curve. Cheap, and it fixes the one design flaw we found in our own experiment.'],
    ['02', 'Sweep the measurement operator',
     'Probability readout halved the heat error in the one run we have. It is the most promising unexplored axis and it costs no extra qubits.'],
    ['03', 'Test generalization outside the training domain',
     'Train on t ∈ [0,1], evaluate beyond it. A band-limited basis should extrapolate differently from tanh — a testable prediction we never ran.'],
    ['04', 'Push to hardware, and to the barren-plateau regime',
     'Shot noise attacks high harmonics first, exactly the ones the bandwidth argument depends on. And 8–12 qubits with gradient-variance logging would find where trainability collapses.'],
  ];
  return (
    <article className="slide dense rules-slide">
      <p className="eyebrow">23 · FUTURE WORK</p>
      <h2>Four experiments that would<br />either <em>break this or extend it.</em></h2>
      <div className="rule-list" style={{ top: '33%', width: 'min(900px, 68vw)' }}>
        {rows.map(([n, t, c], i) => (
          <div key={n} className={`rule-row ${ri(i + 1)}`} style={{ gridTemplateColumns: '44px 1fr 1.6fr', padding: '1.5vh 2vw 1.5vh 0' }}>
            <span className="rule-num">{n}</span><span className="rule-title">{t}</span><span className="rule-copy">{c}</span>
          </div>
        ))}
      </div>
      <p className="caption" style={{ position: 'absolute', bottom: '5vh', left: '6vw', maxWidth: '52ch' }}>
        Ordered by how quickly each would change the recommendation on slide 19.
      </p>
    </article>
  );
}

function S22({ reveal }) {
  const ri = n => `ri${reveal >= n ? ' in' : ''}`;
  const rows = [
    ['PREDICTED', 'A number computed before training tells you what the circuit can represent',
     'Verified directly: the DFT of the untrained layer is exactly zero past K. With register width held fixed, the error minimum lands exactly where theory says.'],
    ['MEASURED', 'It never beat a properly-trained classical network',
     'Heat: statistically tied. Burgers: classical wins 3.1×, t = 4.8. At ~20× the compute and 24–82% seed variation against 0.7–11%.'],
    ['CORRECTED', 'We found the confound that would have handed us a false positive',
     'A 7.8% quantum win that was our own classical baseline stopping 5 000 L-BFGS steps early. Our report flagged it as a limitation; we tested it and it reversed.'],
  ];
  return (
    <article className="slide close-slide">
      <p className="eyebrow">24 · CONCLUSION</p>
      <h2>A quantum layer is a constraint you have to earn.<br /><em>On these problems, it wasn't earned.</em></h2>
      <div style={{ marginTop: '2vh', display: 'flex', flexDirection: 'column', gap: '1.6vh', maxWidth: '66ch' }}>
        {rows.map(([tag, t, c], i) => (
          <div key={tag} className={ri(i + 1)} style={{ display: 'grid', gridTemplateColumns: '96px 1fr', gap: '1.4vw', alignItems: 'start' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 'clamp(9px,0.75vw,12px)', color: i === 2 ? 'var(--paper)' : 'rgba(242,242,240,0.4)', letterSpacing: '0.14em', textTransform: 'uppercase', paddingTop: '0.3em' }}>{tag}</span>
            <span>
              <span style={{ display: 'block', fontFamily: 'var(--sans)', fontSize: 'clamp(12px,1.1vw,17px)', color: 'var(--paper)', lineHeight: 1.35 }}>{t}</span>
              <span style={{ display: 'block', fontFamily: 'var(--sans)', fontSize: 'clamp(10px,0.88vw,14px)', fontWeight: 300, color: 'var(--muted)', lineHeight: 1.5, marginTop: '0.4vh' }}>{c}</span>
            </span>
          </div>
        ))}
      </div>
      <p className={`caption ${ri(4)}`} style={{ position: 'absolute', bottom: '5vh', left: '6vw', maxWidth: '66ch' }}>
        The recipe an engineer can use tomorrow: compute <code>K = (n_qubits ÷ in_dim) × n_uploads</code>,
        Fourier-analyse your PDE, and check the modes fit inside K with margin — then, on the evidence here,
        use the classical network anyway.
      </p>
    </article>
  );
}

// ─── Registry ────────────────────────────────────────────────────────────────

const SLIDES = [S00, S01, S02, S03, S04, SArchDetail, SExperiments, S05, S06, S07, S08, S09, S10, S11,
                S12, S13, S14, S15, S16, S17, S18, S19, S20, S21, S22];

// ─── Chrome ──────────────────────────────────────────────────────────────────

function DeckChrome({ active, total, onPrev, onNext, onReset, atStart, atEnd, visible }) {
  function toggleFS() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  }
  return (
    <>
      <div className={`deck-top-bar${visible ? '' : ' hidden'}`}>
        <button onClick={toggleFS} title="Fullscreen (F)">⛶</button>
      </div>
      <div className={`deck-controls${visible ? '' : ' hidden'}`}>
        <button onClick={onPrev} disabled={atStart} title="Previous (←)">‹</button>
        <span className="ctrl-counter">{active + 1} / {total}</span>
        <button onClick={onNext} disabled={atEnd} title="Next (→ / Space)">›</button>
        <div className="ctrl-divider" />
        <button onClick={onReset} title="Reset (R)">↺</button>
      </div>
    </>
  );
}

function NotesPanel({ note, onClose }) {
  return (
    <div className="notes-overlay" onClick={onClose}>
      <div className="notes-panel" onClick={e => e.stopPropagation()}>
        <p className="notes-kicker">Presenter notes — press N or Esc to close</p>
        <p className="notes-text">{note}</p>
        <button className="notes-close" onClick={onClose}>CLOSE  N</button>
      </div>
    </div>
  );
}

function SlideFooter({ active, total, onGoto }) {
  return (
    <div className="deck-footer">
      <div className="slide-dots">
        {Array.from({ length: total }, (_, i) => (
          <button key={i} className={`slide-dot${i === active ? ' active' : ''}`}
            onClick={() => onGoto(i)} title={`Slide ${i + 1}`} />
        ))}
      </div>
      <span className="deck-counter">{active + 1} / {total}</span>
    </div>
  );
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [active, setActive] = useState(0);
  const [reveal, setReveal] = useState(0);
  const [notesVisible, setNotesVisible] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const hideTimer = useRef(null);

  const bumpChrome = useCallback(() => {
    setChromeVisible(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setChromeVisible(false), 1800);
  }, []);

  useEffect(() => {
    bumpChrome();
    window.addEventListener('mousemove', bumpChrome);
    return () => {
      window.removeEventListener('mousemove', bumpChrome);
      clearTimeout(hideTimer.current);
    };
  }, [bumpChrome]);

  function goNext() {
    if (reveal < REVEAL_COUNTS[active]) setReveal(r => r + 1);
    else if (active < SLIDE_COUNT - 1) { setActive(a => a + 1); setReveal(0); }
  }
  function goPrev() {
    if (reveal > 0) setReveal(r => r - 1);
    else if (active > 0) { const p = active - 1; setActive(p); setReveal(REVEAL_COUNTS[p]); }
  }
  function goTo(idx) {
    setActive(Math.max(0, Math.min(SLIDE_COUNT - 1, idx)));
    setReveal(0);
  }

  const stateRef = useRef({ active, reveal, notesVisible });
  useEffect(() => { stateRef.current = { active, reveal, notesVisible }; });

  useEffect(() => {
    function onKey(e) {
      const { active, reveal, notesVisible } = stateRef.current;
      bumpChrome();
      if (notesVisible) {
        if (e.key === 'n' || e.key === 'N' || e.key === 'Escape') setNotesVisible(false);
        return;
      }
      if (e.key === 'n' || e.key === 'N') { setNotesVisible(true); return; }
      if (e.key === 'f' || e.key === 'F') {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
        else document.exitFullscreen?.();
        return;
      }
      if (e.key === 'r' || e.key === 'R' || e.key === 'Home') { setActive(0); setReveal(0); return; }
      if (e.key === 'End') { setActive(SLIDE_COUNT - 1); setReveal(0); return; }

      if (['ArrowRight', 'ArrowDown', ' ', 'PageDown'].includes(e.key)) {
        e.preventDefault();
        if (reveal < REVEAL_COUNTS[active]) setReveal(r => r + 1);
        else if (active < SLIDE_COUNT - 1) { setActive(a => a + 1); setReveal(0); }
      } else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) {
        e.preventDefault();
        if (reveal > 0) setReveal(r => r - 1);
        else if (active > 0) { const p = active - 1; setActive(p); setReveal(REVEAL_COUNTS[p]); }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bumpChrome]);

  const SlideComponent = SLIDES[active];
  const atStart = active === 0 && reveal === 0;
  const atEnd = active === SLIDE_COUNT - 1 && reveal === REVEAL_COUNTS[active];

  return (
    <div className="im-root" style={{ width: '100vw', height: '100vh' }}>
      <SlideComponent key={active} reveal={reveal} />
      <SlideFooter active={active} total={SLIDE_COUNT} onGoto={goTo} />
      <DeckChrome
        active={active} total={SLIDE_COUNT}
        onPrev={goPrev} onNext={goNext} onReset={() => goTo(0)}
        atStart={atStart} atEnd={atEnd} visible={chromeVisible} />
      {notesVisible && <NotesPanel note={NOTES[active]} onClose={() => setNotesVisible(false)} />}
    </div>
  );
}
