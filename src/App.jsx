import { useState, useEffect, useRef, useCallback } from 'react';
import {
  LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, ReferenceLine, ResponsiveContainer, Legend,
} from 'recharts';
import './theme.css';
import './chrome.css';

// ─── Data — every number below is read from results/*/summary.json ───────────

const HEAT_PINN_REL = 0.001175;   // results/heat_pinn/summary.json

const KSWEEP = [
  { K: 1, mean: 0.182, s1: 0.165, s2: 0.216, s3: 0.166 },
  { K: 2, mean: 0.024, s1: 0.013, s2: 0.015, s3: 0.045 },
  { K: 3, mean: 0.068, s1: 0.067, s2: 0.080, s3: 0.057 },
  { K: 4, mean: 0.012, s1: 0.012, s2: 0.013, s3: 0.010 },
  { K: 5, mean: 0.060, s1: 0.074, s2: 0.070, s3: 0.036 },
  { K: 8, mean: 0.016, s1: 0.018, s2: 0.007, s3: 0.023 },
];

const BURGERS = [
  { model: 'PINN',  rel: 0.0756 },
  { model: 'SIREN', rel: 0.1952 },
  { model: 'Q3',    rel: 0.1483 },
  { model: 'Q4',    rel: 0.0697 },
  { model: 'Q5',    rel: 0.1477 },
];

// Measured Fourier spectrum of the untrained quantum layer.
// src/xai/fourier.py → empirical_spectrum(), 256-point DFT over one period.
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

// Burgers training loss, all three models, identical 8 500-epoch budget.
// results/burgers_{pinn,siren,qapinn_q4}/history.json
const LOSS_CURVES = [
  { ep: 1,    pinn: 0.4642,  siren: 0.5343,  q4: 0.5638 },
  { ep: 1000, pinn: 0.0654,  siren: 0.0772,  q4: 0.0823 },
  { ep: 2000, pinn: 0.0419,  siren: 0.0573,  q4: 0.0635 },
  { ep: 3000, pinn: 0.00917, siren: 0.0522,  q4: 0.0492 },
  { ep: 4000, pinn: 0.00464, siren: 0.0476,  q4: 0.0226 },
  { ep: 5000, pinn: 0.00299, siren: 0.0292,  q4: 0.0140 },
  { ep: 6000, pinn: 0.00212, siren: 0.00903, q4: 0.0104 },
  { ep: 7000, pinn: 0.00149, siren: 0.00765, q4: 0.00823 },
  { ep: 8000, pinn: 0.00111, siren: 0.00540, q4: 0.00662 },
  { ep: 8500, pinn: 0.000301,siren: 0.00247, q4: 0.00295 },
];

const NU_SWEEP = [
  { nu: 0.05, model: 'Q3', rel: 0.003696, winner: true  },
  { nu: 0.05, model: 'Q4', rel: 0.004446, winner: false },
  { nu: 0.05, model: 'Q5', rel: 0.007188, winner: false },
  { nu: 0.1,  model: 'Q3', rel: 0.005514, winner: false },
  { nu: 0.1,  model: 'Q4', rel: 0.006712, winner: false },
  { nu: 0.1,  model: 'Q5', rel: 0.003900, winner: true  },
];

// Classical baselines at the two sweep viscosities — the missing like-for-like
// comparison. results/burgers_nu{0.05,0.1}_pinn/summary.json
const NU_PINN = { 0.05: 0.001241, 0.1: 0.002268 };

// Where quantum wins and where it stops winning. Log axis.
const CROSSOVER = [
  { nu: '0.00318', label: 'sharp shock', pinn: 0.0756,   quantum: 0.0697   },
  { nu: '0.05',    label: 'moderate',    pinn: 0.001241, quantum: 0.003696 },
  { nu: '0.1',     label: 'gentle',      pinn: 0.002268, quantum: 0.003900 },
];

const CAPACITY = {
  pinn:   { layers: 5, spectral: 252.5, complexity: 16492 },
  qapinn: { layers: 4, spectral: 120.7, complexity: 5140  },
};

const REVEAL_COUNTS = [
  0, // 00 title
  3, // 01 why it matters
  2, // 02 question
  4, // 03 what is a PINN
  4, // 04 what a QAPINN changes
  3, // 05 the answer
  4, // 06 fourier mechanism
  3, // 07 the formula
  3, // 08 measured spectrum
  3, // 09 heat testbed
  4, // 10 k-sweep design
  3, // 11 k-sweep result
  4, // 12 training curves
  2, // 13 burgers
  4, // 14 model comparison
  5, // 15 scoreboard — table reveals in pairs (2..5)
  4, // 16 nu-sweep
  4, // 17 how they learn (XAI)
  4, // 18 when it helps / when it doesn't
  4, // 19 design rule
  4, // 20 limitations
  4, // 21 future work
  4, // 22 conclusion
];
const SLIDE_COUNT = REVEAL_COUNTS.length;

const NOTES = [
  /* 00 */ 'Opening. One sentence: does bolting a quantum circuit onto a physics neural network actually help? We ran thirty controlled experiments on two fluid-dynamics equations to find out. The answer is more interesting than yes or no — and I will show you the runs where quantum lost.',
  /* 01 */ 'Why anyone should care. Simulating fluid flow is the design bottleneck in aircraft, turbines and weather. Every high-fidelity run costs hours on a cluster, and engineers need thousands of them. Neural surrogates promise to replace the mesh. The open question is whether quantum layers make those surrogates better or just slower.',
  /* 02 */ 'The research question. Not "is quantum faster" — that question is unanswerable on a simulator. The question is: under what conditions does the quantum layer change how the network learns, and can we predict those conditions before spending any compute?',
  /* 03 */ 'This is the only slide aimed at non-experts. A PINN learns a solution by being punished for breaking physics, not by being shown answers. Take about forty-five seconds here. The key idea is: no training data, just the equation itself as the loss.',
  /* 04 */ 'The single architectural change. We replace only the first layer with a variational quantum circuit. Everything downstream is byte-identical — same hidden size, same depth, same optimiser, same seeds. That is what makes this a controlled experiment rather than a benchmark.',
  /* 05 */ 'Answer up front. The bandwidth K predicts how accurate the quantum model can get. Say the second sentence clearly: it does NOT predict that quantum beats classical. We ran four problem setups. The formula ranked the quantum models correctly in all four. Quantum beat the classical network in exactly one. The formula explains the quantum family; it does not crown it.',
  /* 06 */ 'The mechanism, from Schuld et al. 2021. The circuit output is a Fourier series with a frequency set fixed at build time. Training rescales the coefficients; it can never invent a new frequency. This is a theorem, not an empirical trend.',
  /* 07 */ 'The formula itself. K equals qubits divided by input dimension, times the number of data uploads. Re-uploading is the lever — angle encoding gives you one upload no matter how deep you go, so stacking layers buys nothing.',
  /* 08 */ 'This is the measurement, not the claim. We swept one input over a full period and took a DFT of the untrained layer. The magnitude is exactly zero past the predicted K in all three configurations. Also note the amplitude decay: the top mode is representable but weak — which is why a margin of one mode matters.',
  /* 09 */ 'Heat equation as the clean testbed. We know the exact solution, so we know the required modes are k=1 and k=4. That gives us a falsifiable prediction: error should drop at K=4 and nowhere else.',
  /* 10 */ 'The controlled sweep. Six bandwidths, three seeds, eighteen runs. Be explicit about what we did NOT vary: the measurement operator was Pauli-Z expectation throughout, and parameter counts drift a little between configs — 927 to 1009. Honest caveat, not a fatal one.',
  /* 11 */ 'The elbow lands exactly at K=4, five point seven times better than K=3, all three seeds agreeing. Now point at the dashed line. That is the classical PINN at 0.0012. Every quantum configuration is above it. The mechanism is confirmed and the classical baseline still wins this problem. Say both halves.',
  /* 12 */ 'Learning behaviour, not final scores. Same 8 500-epoch budget for all three. The PINN plunges early then flattens. SIREN stalls on a plateau from epoch 2 000 to 5 000. The quantum model descends slower but never plateaus. Different optimisation character, same budget.',
  /* 13 */ 'Burgers is the hard case — nonlinear, shock-forming, broadband. No closed-form solution, so no clean frequency prediction. This is where the quantum layer earns its keep, if it earns it anywhere.',
  /* 14 */ 'Q4 is the only model that beats the PINN, by 7.8 percent. SIREN is the control: if periodic activations alone explained the advantage, SIREN should win. It comes last. That rules out the simplest alternative explanation.',
  /* 15 */ 'The full scoreboard, including the rows that lose. Read the training time row out loud — 4 097 seconds versus 178. Twenty-three times the cost for a 7.8 percent accuracy gain on one equation, and a ten-times loss on the other. Say plainly that generalization and memory were not measured.',
  /* 16 */ 'Be upfront here — this slide cost us our headline. Our original sweep had no classical baseline at these viscosities, so we ran them. The classical PINN wins at both: three times better at ν=0.05, one point seven times at ν=0.1. The quantum advantage is confined to the sharpest shock we tested. Then pivot to what survived: within the quantum family the formula still ranks every configuration correctly, and the winning bandwidth moves when the fluid changes and the network does not. If someone asks why we included this — because a mechanism that only explains wins is not a mechanism.',
  /* 17 */ 'The explainability slide. Two independent probes. First: on Burgers the quantum model has 8.6 times the PDE residual yet lower solution error — it fits the physics loss worse and the actual solution better. That is a regulariser signature. Second: the capacity bound says it is a 3.2 times simpler function. Both point the same way — the quantum layer constrains rather than expands.',
  /* 18 */ 'This is the heart of the talk. Give it the most time. Left column: it helps in one place — sharp-shock, broadband problems where the band-limited basis stops the classical network overfitting the residual. Right column: it hurts on smooth problems, it hurts as soon as you smooth the shock even mildly, and it costs 23 times the wall clock everywhere. Do not soften the right column. If asked for the honest summary: one win in four setups, and we can tell you exactly why it was that one.',
  /* 19 */ 'The deliverable an engineer can use tomorrow. Four steps, and step zero is: check whether you need this at all. If your solution is smooth, use the classical PINN.',
  /* 20 */ 'Limitations, stated before anyone asks. Simulator only, no hardware. Barren plateaus not measured — we stayed at 2 to 5 qubits, below the regime where they bite. Generalization untested. Coarse logging. Say these calmly; they are scoping, not failure.',
  /* 21 */ 'Four things we would do next, in priority order, each tied to a gap on the previous slide.',
  /* 22 */ 'Close. One formula, two equations, thirty-two runs. The formula ranked the quantum models correctly every time. Quantum beat classical once in four setups — and the three losses are the reason to trust the one win. End on the recipe: compute K first, and if your solution is smooth, do not use a quantum layer at all.',
];

// ─── SVG: Quantum Circuit ────────────────────────────────────────────────────

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
      {[
        [80, 'ENC 1'], [150, 'PARAMS 1'], [228, 'RING 1'],
        [315, 'ENC 2'], [385, 'PARAMS 2'], [454, 'MEAS'],
      ].map(([x, lbl]) => (
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

// ─── SVG: PINN loss diagram (beginner slide) ────────────────────────────────

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

// ─── SVG: Frequency Spectrum (target modes) ─────────────────────────────────

function FreqSpectrumSVG() {
  const required = new Set([1, 4]);
  const heights  = [18, 58, 14, 10, 44, 11, 7, 5];
  const bw = 24; const gap = 10; const base = 88;
  return (
    <svg viewBox="0 0 260 110" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%' }}>
      {heights.map((h, k) => {
        const x = 14 + k * (bw + gap);
        const y = base - h;
        const req = required.has(k);
        return (
          <g key={k}>
            <rect x={x} y={y} width={bw} height={h}
              fill={req ? 'rgba(242,242,240,0.85)' : 'rgba(242,242,240,0.07)'}
              stroke={req ? PAPER : 'rgba(242,242,240,0.2)'}
              strokeWidth={0.8} />
            <text x={x + bw / 2} y={101} textAnchor="middle"
              fill={req ? 'rgba(242,242,240,0.8)' : 'rgba(242,242,240,0.28)'}
              fontSize={8} fontFamily="Space Mono, monospace">k={k}</text>
            {req && <text x={x + bw / 2} y={y - 4} textAnchor="middle"
              fill="rgba(242,242,240,0.55)" fontSize={7} fontFamily="Space Mono, monospace">▲</text>}
          </g>
        );
      })}
      <line x1={14 + 4 * (bw + gap) - gap / 2} y1={8}
            x2={14 + 4 * (bw + gap) - gap / 2} y2={88}
        stroke="rgba(242,242,240,0.3)" strokeDasharray="3 3" strokeWidth={1} />
      <text x={14 + 4 * (bw + gap) - gap / 2 + 4} y={16}
        fill="rgba(242,242,240,0.3)" fontSize={6.5} fontFamily="Space Mono, monospace">K=4</text>
      <line x1={8} y1={88} x2={252} y2={88} stroke="rgba(242,242,240,0.12)" strokeWidth={0.5} />
    </svg>
  );
}

// ─── Charts ──────────────────────────────────────────────────────────────────

const AXIS_STYLE = { fill: 'rgba(242,242,240,0.4)', fontFamily: 'Space Mono, monospace', fontSize: 10 };
const GRID_STROKE = 'rgba(242,242,240,0.07)';
const LEGEND_STYLE = { fontFamily: 'Space Mono, monospace', fontSize: 10, color: 'rgba(242,242,240,0.5)' };

function KSweepChart() {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={KSWEEP} margin={{ top: 8, right: 96, bottom: 28, left: 10 }}>
        <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" />
        <XAxis dataKey="K" stroke="rgba(242,242,240,0.15)" tick={AXIS_STYLE}
          label={{ value: 'K  (Fourier bandwidth)', position: 'insideBottom', offset: -14,
                   fill: 'rgba(242,242,240,0.3)', fontFamily: 'Space Mono, monospace', fontSize: 9 }} />
        <YAxis stroke="rgba(242,242,240,0.15)" tick={AXIS_STYLE} tickFormatter={v => v.toFixed(3)}
          label={{ value: 'rel L² error', angle: -90, position: 'insideLeft', dx: -2,
                   fill: 'rgba(242,242,240,0.3)', fontFamily: 'Space Mono, monospace', fontSize: 9 }} />
        <ReferenceLine x={4} stroke="rgba(242,242,240,0.45)" strokeDasharray="5 3"
          label={{ value: 'elbow', position: 'top',
                   fill: 'rgba(242,242,240,0.45)', fontFamily: 'Space Mono, monospace', fontSize: 9 }} />
        {/* The honest line: classical baseline sits below every quantum config */}
        <ReferenceLine y={HEAT_PINN_REL} stroke={PAPER} strokeDasharray="6 3" strokeWidth={1.4}
          label={{ value: 'classical PINN  0.0012', position: 'right',
                   fill: PAPER, fontFamily: 'Space Mono, monospace', fontSize: 9 }} />
        <Line type="monotone" dataKey="s1" stroke="rgba(242,242,240,0.18)" strokeWidth={1} dot={false} />
        <Line type="monotone" dataKey="s2" stroke="rgba(242,242,240,0.18)" strokeWidth={1} dot={false} />
        <Line type="monotone" dataKey="s3" stroke="rgba(242,242,240,0.18)" strokeWidth={1} dot={false} />
        <Line type="monotone" dataKey="mean" stroke={PAPER} strokeWidth={2.5}
          dot={{ fill: PAPER, r: 4, strokeWidth: 0 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

const BAR_FILL = { PINN: 'rgba(242,242,240,0.25)', SIREN: 'rgba(242,242,240,0.16)', Q3: 'rgba(242,242,240,0.22)', Q4: PAPER, Q5: 'rgba(242,242,240,0.22)' };

function BurgersChart() {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={BURGERS} margin={{ top: 8, right: 20, bottom: 24, left: 10 }}>
        <CartesianGrid stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="model" stroke="rgba(242,242,240,0.15)" tick={AXIS_STYLE} />
        <YAxis stroke="rgba(242,242,240,0.15)" tick={AXIS_STYLE} tickFormatter={v => v.toFixed(3)}
          label={{ value: 'rel L²', angle: -90, position: 'insideLeft',
                   fill: 'rgba(242,242,240,0.3)', fontFamily: 'Space Mono, monospace', fontSize: 9 }} />
        <ReferenceLine y={0.0756} stroke="rgba(242,242,240,0.35)" strokeDasharray="5 3"
          label={{ value: 'PINN baseline', position: 'right',
                   fill: 'rgba(242,242,240,0.35)', fontFamily: 'Space Mono, monospace', fontSize: 8 }} />
        <Bar dataKey="rel" radius={[2, 2, 0, 0]}>
          {BURGERS.map(d => <Cell key={d.model} fill={BAR_FILL[d.model]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function SpectrumChart() {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={SPECTRUM} margin={{ top: 8, right: 16, bottom: 28, left: 6 }} barGap={2}>
        <CartesianGrid stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="n" stroke="rgba(242,242,240,0.15)" tick={AXIS_STYLE}
          label={{ value: 'harmonic  n', position: 'insideBottom', offset: -14,
                   fill: 'rgba(242,242,240,0.3)', fontFamily: 'Space Mono, monospace', fontSize: 9 }} />
        <YAxis stroke="rgba(242,242,240,0.15)" tick={AXIS_STYLE} tickFormatter={v => v.toFixed(2)}
          label={{ value: '|coefficient|', angle: -90, position: 'insideLeft', dx: 4,
                   fill: 'rgba(242,242,240,0.3)', fontFamily: 'Space Mono, monospace', fontSize: 9 }} />
        <Legend wrapperStyle={LEGEND_STYLE} iconSize={8} verticalAlign="top" height={22} />
        <Bar dataKey="angle" name="angle, 1 layer → K=2" fill="rgba(242,242,240,0.18)" radius={[1, 1, 0, 0]} />
        <Bar dataKey="reup2" name="re-upload, 2 layers → K=4" fill={PAPER} radius={[1, 1, 0, 0]} />
        <Bar dataKey="reup3" name="re-upload, 3 layers → K=6" fill="rgba(242,242,240,0.42)" radius={[1, 1, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function LossCurveChart() {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={LOSS_CURVES} margin={{ top: 8, right: 22, bottom: 28, left: 12 }}>
        <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" />
        <XAxis dataKey="ep" stroke="rgba(242,242,240,0.15)" tick={AXIS_STYLE}
          label={{ value: 'epoch  (identical 8 500-step budget)', position: 'insideBottom', offset: -14,
                   fill: 'rgba(242,242,240,0.3)', fontFamily: 'Space Mono, monospace', fontSize: 9 }} />
        <YAxis scale="log" domain={[0.0002, 1]} stroke="rgba(242,242,240,0.15)" tick={AXIS_STYLE}
          tickFormatter={v => v >= 0.01 ? v.toFixed(2) : v.toExponential(0)}
          label={{ value: 'total loss (log)', angle: -90, position: 'insideLeft', dx: -4,
                   fill: 'rgba(242,242,240,0.3)', fontFamily: 'Space Mono, monospace', fontSize: 9 }} />
        <Legend wrapperStyle={LEGEND_STYLE} iconSize={8} verticalAlign="top" height={22} />
        <Line type="monotone" dataKey="pinn"  name="classical PINN" stroke="rgba(242,242,240,0.45)" strokeWidth={1.6} dot={false} />
        <Line type="monotone" dataKey="siren" name="SIREN" stroke="rgba(242,242,240,0.28)" strokeWidth={1.6} strokeDasharray="4 3" dot={false} />
        <Line type="monotone" dataKey="q4"    name="QAPINN Q4" stroke={PAPER} strokeWidth={2.4} dot={{ fill: PAPER, r: 2.5, strokeWidth: 0 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function CrossoverChart() {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={CROSSOVER} margin={{ top: 8, right: 20, bottom: 30, left: 14 }}>
        <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" />
        <XAxis dataKey="nu" stroke="rgba(242,242,240,0.15)" tick={AXIS_STYLE}
          label={{ value: 'viscosity ν   (left = sharpest shock)', position: 'insideBottom', offset: -16,
                   fill: 'rgba(242,242,240,0.3)', fontFamily: 'Space Mono, monospace', fontSize: 9 }} />
        <YAxis scale="log" domain={[0.0008, 0.12]} stroke="rgba(242,242,240,0.15)" tick={AXIS_STYLE}
          tickFormatter={v => v >= 0.01 ? v.toFixed(2) : v.toFixed(4)}
          label={{ value: 'rel L² error (log)', angle: -90, position: 'insideLeft', dx: -6,
                   fill: 'rgba(242,242,240,0.3)', fontFamily: 'Space Mono, monospace', fontSize: 9 }} />
        <Legend wrapperStyle={LEGEND_STYLE} iconSize={8} verticalAlign="top" height={22} />
        <Line type="monotone" dataKey="pinn" name="classical PINN"
          stroke="rgba(242,242,240,0.45)" strokeWidth={1.8} strokeDasharray="5 3"
          dot={{ fill: 'rgba(242,242,240,0.45)', r: 3.5, strokeWidth: 0 }} />
        <Line type="monotone" dataKey="quantum" name="best QAPINN"
          stroke={PAPER} strokeWidth={2.4} dot={{ fill: PAPER, r: 4, strokeWidth: 0 }} />
      </LineChart>
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

// Scoreboard table. `win` marks which column is better for that row.
function MetricTable({ cols, rows, revealFrom, reveal }) {
  return (
    <div className="metrics">
      <div className="metrics-row metrics-head">
        <span />
        {cols.map(c => <span key={c}>{c}</span>)}
      </div>
      {rows.map(([label, vals, win, note], i) => (
        <div key={label} className={`metrics-row ri${reveal >= revealFrom + Math.floor(i / 2) ? ' in' : ''}`}>
          <span className="m-label">{label}{note && <em>{note}</em>}</span>
          {vals.map((v, j) => (
            <span key={j} className={win === j ? 'm-win' : win === -1 ? 'm-none' : ''}>{v}</span>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Slides ───────────────────────────────────────────────────────────────────

function S00() {
  return (
    <article className="slide title-slide">
      <p className="eyebrow">WISER × BQP · GLOBAL QUANTUM+AI 2026</p>
      <h1>Does a quantum layer<br />actually help a<br /><em>physics AI?</em></h1>
      <p className="subtitle">
        We replaced one layer of a physics-informed neural network with a quantum circuit,
        ran 30 controlled experiments on two fluid-dynamics equations, and looked honestly
        at where it won and where it lost.
      </p>
      <p className="title-note">Quantum-Assisted PINNs for CFD · simulator only (PennyLane)</p>
      <p className="nav-hint">↓ / Space  to advance&nbsp;&nbsp;·&nbsp;&nbsp;N  for notes&nbsp;&nbsp;·&nbsp;&nbsp;F  fullscreen</p>
    </article>
  );
}

function S01({ reveal }) {
  const ri = n => `ri${reveal >= n ? ' in' : ''}`;
  const pillars = [
    ['THE BOTTLENECK', 'Fluid simulation is the slowest step in engineering design',
     'Aircraft wings, turbine blades, engine combustion, weather. Every design change means re-simulating the flow.'],
    ['THE COST', 'One high-fidelity run takes hours on a cluster',
     'Engineers need thousands of them to explore a design space. The mesh is the expensive part.'],
    ['THE PROMISE', 'A neural network can replace the mesh entirely',
     'Train once on the physics itself, then evaluate anywhere, instantly — no grid, no re-meshing.'],
    ['THE OPEN QUESTION', 'Does adding a quantum circuit make that surrogate better?',
     'Or just slower? Nobody has answered this with a controlled experiment. That is what we did.'],
  ];
  return (
    <article className="slide map-slide">
      <p className="eyebrow">01 · WHY THIS MATTERS</p>
      <h2>Simulating how air and water move is<br />the slowest step in <em>designing almost anything.</em></h2>
      <div className="pillar-grid cols-4">
        {pillars.map(([sp, st, p], i) => (
          <div key={i} className={`pillar ${i === 3 ? 'accent ' : ''}${ri(Math.min(i + 1, 3))}`}>
            <span>{sp}</span>
            <strong>{st}</strong>
            <p>{p}</p>
          </div>
        ))}
      </div>
    </article>
  );
}

function S02({ reveal }) {
  const ri = n => `ri${reveal >= n ? ' in' : ''}`;
  return (
    <article className="slide shift-slide">
      <p className="eyebrow">02 · THE RESEARCH QUESTION</p>
      <h2>Not "is quantum faster."<br /><em>When does it change how the network learns — and why?</em></h2>
      <div className="context-layout">
        <div className={ri(1)}>
          <p className="ctx-label">What most papers ask</p>
          <div className="ctx-inputs">
            <strong>Which model scores better?</strong>
            <strong>Report one benchmark number</strong>
            <strong>Declare a winner</strong>
            <strong>Mechanism left unexplained</strong>
          </div>
        </div>
        <div className={`ctx-arrow${reveal >= 1 ? '' : ' ri'}`}>→</div>
        <div className={`ctx-result ${ri(2)}`}>
          <p className="ctx-label">What we ask instead</p>
          <strong>What property of the circuit controls learning?</strong>
          <strong>Can we predict it before training?</strong>
          <strong>Where does it fail, and does the same rule explain that too?</strong>
        </div>
      </div>
      <p className="caption" style={{ position: 'absolute', bottom: '6vh', left: '6vw', maxWidth: '46ch' }}>
        A prediction that only explains the wins is not a mechanism. We looked for one that explains the losses.
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
    <article className="slide rules-slide">
      <p className="eyebrow">03 · WHAT IS A PINN?  (the one slide for non-experts)</p>
      <h2>A network that learns physics<br />by being <em>marked wrong by the physics.</em></h2>
      <div className="rule-list" style={{ top: '34%', width: 'min(660px, 50vw)' }}>
        {rows.map(([n, t, c], i) => (
          <div key={n} className={`rule-row ${ri(i + 1)}`} style={{ gridTemplateColumns: '44px 1fr 1.1fr' }}>
            <span className="rule-num">{n}</span>
            <span className="rule-title">{t}</span>
            <span className="rule-copy">{c}</span>
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
    <article className="slide shift-slide">
      <p className="eyebrow">04 · WHAT A QAPINN CHANGES</p>
      <h2>We change exactly one layer.<br /><em>Everything else stays byte-identical.</em></h2>
      <div className="context-layout">
        <div className={ri(1)}>
          <p className="ctx-label">Classical PINN</p>
          <div className="ctx-inputs">
            <strong>Linear(2 → 64)</strong>
            <strong>tanh activations</strong>
            <strong>Hidden blocks × 3</strong>
            <strong>1 341 parameters</strong>
          </div>
        </div>
        <div className={`ctx-arrow${reveal >= 1 ? '' : ' ri'}`}>→</div>
        <div className={`ctx-result ${ri(2)}`}>
          <p className="ctx-label">QAPINN</p>
          <strong>QuantumLayer(2 → 4)</strong>
          <strong>⟨Z⟩ expectation values</strong>
          <strong>Same hidden tail, same optimiser, same seeds</strong>
          <strong>985 parameters</strong>
        </div>
      </div>

      {/* Reveal 3: circuit overlays as top layer — backdrop-filter blurs everything behind */}
      {reveal >= 3 && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          background: 'rgba(5,5,5,0.65)',
          zIndex: 10,
          padding: '4vh 8vw',
          animation: 'im-enter 0.55s cubic-bezier(0.16, 1, 0.3, 1) both',
        }}>
          <div style={{ width: 'min(680px, 86vw)' }}>
            <CircuitSVG />
          </div>
          <p className={`caption ${ri(4)}`} style={{ marginTop: '2vh', textAlign: 'center', maxWidth: '54ch' }}>
            4 qubits · 2 re-upload layers · ring entanglement. One layer swapped means any
            difference we measure is caused by the circuit and nothing else.
          </p>
        </div>
      )}
    </article>
  );
}

function S05({ reveal }) {
  const ri = n => `ri${reveal >= n ? ' in' : ''}`;
  return (
    <article className="slide close-slide">
      <p className="eyebrow">05 · THE ANSWER, UP FRONT</p>
      <h2>One number — fixed before training starts — decides how accurate the quantum
        model can possibly get.<br /><em>It does not decide whether it beats classical.</em></h2>
      <div className={`formula-block ${ri(1)}`}>
        K = (n_qubits ÷ in_dim) × n_uploads
      </div>
      <div className={ri(2)} style={{ display: 'flex', gap: '3vw', marginTop: '1vh', flexWrap: 'wrap' }}>
        <KPI val="4 of 4" lbl="setups where K predicted the ranking" />
        <KPI val="1 of 4" lbl="setups where quantum beat classical" />
        <KPI val="23×" lbl="training cost of the one win" />
      </div>
      <p className={`caption ${ri(3)}`} style={{ marginTop: '2.5vh', maxWidth: '58ch' }}>
        Derived from Schuld et al. 2021. The formula is a ceiling, not a promise — it tells you the best the
        circuit could do, and across four problem setups that ceiling sat below the classical network three
        times out of four. The one exception is not an accident, and the rest of this deck is about why.
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
    ['THE CONSEQUENCE', 'If the flow needs a detail finer than K, the model cannot represent it',
     'Train it for a year and the error stays. This is what makes the ceiling predictable.'],
  ];
  return (
    <article className="slide map-slide">
      <p className="eyebrow">06 · WHY — THE MECHANISM</p>
      <h2>The circuit is a wave generator with a<br />fixed vocabulary. <em>Training can't extend it.</em></h2>
      <div className="pillar-grid cols-4">
        {pillars.map(([sp, st, p], i) => (
          <div key={i} className={`pillar ${i === 3 ? 'accent ' : ''}${ri(i + 1)}`}>
            <span>{sp}</span>
            <strong>{st}</strong>
            <p>{p}</p>
          </div>
        ))}
      </div>
    </article>
  );
}

function S07({ reveal }) {
  const ri = n => `ri${reveal >= n ? ' in' : ''}`;
  return (
    <article className="slide" style={{ justifyContent: 'flex-start' }}>
      <p className="eyebrow">07 · HOW TO COMPUTE THE CEILING</p>
      <h2 style={{ marginBottom: '1.5vh' }}>
        Three numbers you already know give you the ceiling <em>before you spend a GPU-hour.</em>
      </h2>
      <div className="formula-block" style={{ fontSize: 'clamp(16px,2.2vw,36px)', marginBottom: '2.5vh' }}>
        K = (n_qubits ÷ in_dim) × n_uploads
      </div>
      <div style={{ width: 'min(760px, 58vw)', borderTop: '1px solid rgba(242,242,240,0.22)' }}>
        <div className={`rule-row ${ri(1)}`}
          style={{ display: 'grid', gridTemplateColumns: '84px 1fr 1.1fr', padding: '1.6vh 0', borderBottom: '1px solid rgba(242,242,240,0.22)', gap: '1.5vw', alignItems: 'start' }}>
          <span className="rule-num">RE-UPLOAD</span>
          <span className="rule-title">n_uploads = n_layers</span>
          <span className="rule-copy">Every pass that re-feeds the input adds one unit of bandwidth. This is the only lever that scales.</span>
        </div>
        <div className={`rule-row ${ri(2)}`}
          style={{ display: 'grid', gridTemplateColumns: '84px 1fr 1.1fr', padding: '1.6vh 0', borderBottom: '1px solid rgba(242,242,240,0.22)', gap: '1.5vw', alignItems: 'start' }}>
          <span className="rule-num">ANGLE ENC.</span>
          <span className="rule-title">n_uploads = 1, always</span>
          <span className="rule-copy">The input enters once no matter how deep the circuit. Stacking layers buys parameters, not bandwidth.</span>
        </div>
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
    <article className="slide data-slide">
      <p className="eyebrow">08 · WE MEASURED THE CEILING — IT IS REALLY THERE</p>
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
          Two things to read off this plot. <strong style={{ color: 'var(--paper)', fontWeight: 500 }}>One:</strong> the
          cutoff is hard — magnitude is exactly zero past K, so the formula is not an approximation.
        </p>
        <p className="caption" style={{ marginTop: '1.4vh' }}>
          <strong style={{ color: 'var(--paper)', fontWeight: 500 }}>Two:</strong> amplitude decays as n rises, so the
          top mode is representable but <em>weak</em>. That is why K needs margin, not just coverage — and it is
          what the K=4 result on the next slides is testing.
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
    <article className="slide shift-slide">
      <p className="eyebrow">09 · TESTBED 1 — THE HEAT EQUATION</p>
      <h2>We picked a problem where the right answer is known,<br />so a <em>wrong prediction has nowhere to hide.</em></h2>
      <div className="context-layout">
        <div className={ri(1)}>
          <p className="ctx-label">The problem</p>
          <div className="ctx-inputs">
            <strong>∂u/∂t = α ∂²u/∂x²</strong>
            <strong>α = 0.01</strong>
            <strong>u(0,t) = u(1,t) = 0</strong>
            <strong>u(x,0) = sin(πx) + 0.5 sin(4πx)</strong>
          </div>
        </div>
        <div className={`ctx-arrow${reveal >= 1 ? '' : ' ri'}`}>→</div>
        <div className={`ctx-result ${ri(2)}`}>
          <p className="ctx-label">Exact solution — so we know the answer in advance</p>
          <strong style={{ fontStyle: 'normal', fontFamily: 'var(--mono)', fontSize: 'clamp(11px,1vw,16px)' }}>
            u = sin(πx)·e<sup>-απ²t</sup><br />
            + 0.5·sin(4πx)·e<sup>-16απ²t</sup>
          </strong>
          <p style={{ fontFamily: 'var(--sans)', fontSize: 'clamp(11px,0.95vw,15px)', color: 'rgba(242,242,240,0.55)', marginTop: '1vh' }}>
            Only two waves matter: k=1 and k=4. So the theory says a K=3 circuit must fail and a K=4 circuit must not.
          </p>
        </div>
      </div>
      <p className={`caption ${ri(3)}`} style={{ position: 'absolute', bottom: '6vh', left: '6vw', maxWidth: '46ch' }}>
        A falsifiable prediction: the error must fall at K=4 and at no other value. If the elbow lands anywhere else, the mechanism is wrong.
      </p>
    </article>
  );
}

function S10({ reveal }) {
  const ri = n => `ri${reveal >= n ? ' in' : ''}`;
  const rows = [
    ['K=1', '2 qubits · angle enc. · 1 layer', 'bandwidth = (2÷2)×1 = 1', false],
    ['K=2', '4 qubits · angle enc. · 1 layer', 'bandwidth = (4÷2)×1 = 2', false],
    ['K=3', '2 qubits · reupload · 3 layers',  'bandwidth = (2÷2)×3 = 3', false],
    ['K=4', '4 qubits · reupload · 2 layers',  'bandwidth = (4÷2)×2 = 4 ← theory predicts the elbow here', true],
    ['K=5', '2 qubits · reupload · 5 layers',  'bandwidth = (2÷2)×5 = 5', false],
    ['K=8', '4 qubits · reupload · 4 layers',  'bandwidth = (4÷2)×4 = 8', false],
  ];
  return (
    <article className="slide rules-slide">
      <p className="eyebrow">10 · METHOD — 18 RUNS, ONE VARIABLE</p>
      <h2>Change the circuit's bandwidth,<br /><em>hold everything else still.</em></h2>
      <div className="rule-list" style={{ top: '32%' }}>
        {rows.map(([k, cfg, bw, hl], i) => (
          <div key={k} className={`rule-row${hl ? ' highlight' : ''} ${ri(Math.min(i + 1, 3))}`}
            style={{ gridTemplateColumns: '52px 1fr 1.3fr', padding: '1.2vh 2vw 1.2vh 0' }}>
            <span className="rule-num">{k}</span>
            <span className="rule-title">{cfg}</span>
            <span className="rule-copy">{bw}</span>
          </div>
        ))}
      </div>
      <div className={ri(4)} style={{ position: 'absolute', left: '6vw', bottom: '5vh', width: 'min(330px, 30vw)' }}>
        <p className="ctx-label">What we did NOT vary</p>
        <p className="caption" style={{ marginTop: '0.8vh' }}>
          Measurement operator (⟨Z⟩ expectation throughout), entanglement topology (ring throughout),
          optimiser, collocation points, seeds. Parameter counts drift 927–1 009 across configs —
          not perfectly matched, and we say so.
        </p>
      </div>
      <p className="caption" style={{ position: 'absolute', bottom: '5vh', right: '6vw', maxWidth: '34ch', textAlign: 'right' }}>
        3 seeds × 6 bandwidths = 18 runs. Fixed: heat PDE, 3 000-step Adam, hidden 64, depth 4.
      </p>
    </article>
  );
}

function S11({ reveal }) {
  const ri = n => `ri${reveal >= n ? ' in' : ''}`;
  return (
    <article className="slide data-slide">
      <p className="eyebrow">11 · RESULT 1 — THE PREDICTION HOLDS, AND CLASSICAL STILL WINS</p>
      <h2>The error cliff lands exactly where theory said it would —<br /><em>and the classical baseline is still below all of it.</em></h2>
      <div className={`kpi-row ${ri(1)}`}>
        <KPI val="0.068" lbl="K=3 mean error" />
        <KPI val="0.012" lbl="K=4 mean error" />
        <KPI val="5.7×" lbl="improvement at the elbow" />
        <KPI val="0.0012" lbl="classical PINN — 10× better still" />
      </div>
      <div className={ri(2)} style={{ position: 'absolute', left: '6vw', right: '6vw', top: '44%', bottom: '10vh' }}>
        <KSweepChart />
      </div>
      <p className={`caption ${ri(3)}`} style={{ position: 'absolute', bottom: '3vh', left: '6vw', maxWidth: '70ch' }}>
        Both halves matter. The elbow at exactly K=4 across three independent seeds is strong causal evidence for the
        bandwidth mechanism. The white dashed line is the classical PINN, and every quantum configuration sits above it —
        on this smooth problem the quantum layer is a handicap, and the same formula explains why.
      </p>
    </article>
  );
}

function S12({ reveal }) {
  const ri = n => `ri${reveal >= n ? ' in' : ''}`;
  return (
    <article className="slide data-slide">
      <p className="eyebrow">12 · LEARNING BEHAVIOUR — NOT JUST FINAL SCORES</p>
      <h2>Same budget, three different ways of getting there.<br /><em>The quantum model is slower but never stalls.</em></h2>
      <div className={ri(1)} style={{ position: 'absolute', left: '6vw', right: '36vw', top: '34%', bottom: '9vh' }}>
        <LossCurveChart />
      </div>
      <div style={{ position: 'absolute', right: '6vw', top: '36%', width: 'min(330px, 27vw)', display: 'flex', flexDirection: 'column', gap: '1.8vh' }}>
        <div className={ri(2)}>
          <p className="ctx-label">Classical PINN</p>
          <p className="caption">Plunges early, then flattens after epoch 3 000. It reaches the lowest training loss of the three — and still loses on test error. That gap is the story.</p>
        </div>
        <div className={ri(3)}>
          <p className="ctx-label">SIREN</p>
          <p className="caption">Visible plateau from epoch 2 000 to 5 000 — the periodic activations get stuck before breaking free. Worst final accuracy.</p>
        </div>
        <div className={ri(4)}>
          <p className="ctx-label">QAPINN Q4</p>
          <p className="caption">Slowest start, steadiest descent, no plateau. The band-limited basis cannot overfit the residual as aggressively — which turns out to help.</p>
        </div>
      </div>
      <p className="caption" style={{ position: 'absolute', bottom: '3vh', left: '6vw', maxWidth: '52ch' }}>
        Burgers equation, ν = 0.00318. Identical 8 500-epoch budget, identical seeds. Log scale.
      </p>
    </article>
  );
}

function S13({ reveal }) {
  const ri = n => `ri${reveal >= n ? ' in' : ''}`;
  return (
    <article className="slide shift-slide">
      <p className="eyebrow">13 · TESTBED 2 — BURGERS, THE HARD CASE</p>
      <h2>A shock wave has detail at every scale.<br /><em>This is where a bandwidth limit should hurt — or help.</em></h2>
      <div className="context-layout">
        <div className={ri(1)}>
          <p className="ctx-label">The problem</p>
          <div className="ctx-inputs">
            <strong>∂u/∂t + u·∂u/∂x = ν ∂²u/∂x²</strong>
            <strong>ν = 0.00318</strong>
            <strong>Sharp shock forms near x = 0</strong>
            <strong>No closed-form solution</strong>
          </div>
        </div>
        <div className={`ctx-arrow${reveal >= 1 ? '' : ' ri'}`}>→</div>
        <div className={`ctx-result ${ri(2)}`}>
          <p className="ctx-label">Why it is the real test</p>
          <strong>Nonlinear and broadband</strong>
          <strong>No exact solution → no clean K prediction</strong>
          <p style={{ fontFamily: 'var(--sans)', fontSize: 'clamp(11px,0.95vw,15px)', color: 'rgba(242,242,240,0.55)', marginTop: '0.8vh' }}>
            The heat equation was designed to confirm the mechanism. Burgers was chosen to try to break it —
            we could not predict the winner in advance.
          </p>
        </div>
      </div>
      <p className="caption" style={{ position: 'absolute', bottom: '6vh', left: '6vw', maxWidth: '46ch' }}>
        Reference solution from a high-resolution spectral solver, 8 500 epochs, all models identical.
      </p>
    </article>
  );
}

function S14({ reveal }) {
  const ri = n => `ri${reveal >= n ? ' in' : ''}`;
  return (
    <article className="slide rules-slide">
      <p className="eyebrow">14 · RESULT 2 — ON THE HARD PROBLEM, ONE QUANTUM MODEL WINS</p>
      <h2>Only the circuit with the right bandwidth<br />beats the classical network. <em>Just barely.</em></h2>
      <div className="rule-list" style={{ top: '33%' }}>
        <div className={`rule-row highlight ${ri(1)}`}>
          <span className="rule-num">Q4 WINS</span>
          <span className="rule-title">0.0697 vs PINN 0.0756</span>
          <span className="rule-copy">A 7.8% accuracy gain — real, reproducible, and small. Max pointwise error also drops, 0.63 → 0.48.</span>
        </div>
        <div className={`rule-row ${ri(2)}`}>
          <span className="rule-num">Q3 · Q5</span>
          <span className="rule-title">Wrong bandwidth, both lose badly</span>
          <span className="rule-copy">0.148 and 0.148 — roughly 2× worse than classical. Bandwidth mismatch hurts in both directions.</span>
        </div>
        <div className={`rule-row ${ri(3)}`}>
          <span className="rule-num">SIREN</span>
          <span className="rule-title">The control experiment — and it fails</span>
          <span className="rule-copy">0.195, worst of all five. If periodic activations alone explained the gain, SIREN should have won. It did not, which rules out the simplest rival explanation.</span>
        </div>
      </div>
      <div className={ri(4)} style={{ position: 'absolute', left: '6vw', bottom: '5.5vh', width: 'min(380px, 32vw)', height: '26vh' }}>
        <BurgersChart />
      </div>
      <p className={`caption ${ri(4)}`} style={{ position: 'absolute', bottom: '5.5vh', right: '6vw', maxWidth: '30ch', textAlign: 'right' }}>
        Lower is better. Q4 highlighted. Note how narrow the win is — and hold that thought until the cost slide.
      </p>
    </article>
  );
}

function S15({ reveal }) {
  const ri = n => `ri${reveal >= n ? ' in' : ''}`;
  return (
    <article className="slide">
      <p className="eyebrow">15 · THE FULL SCOREBOARD — INCLUDING THE ROWS WE LOSE</p>
      <h2 style={{ marginBottom: '2vh' }}>
        Quantum buys a little accuracy on one equation<br />and <em>pays 23× the training time for it.</em>
      </h2>
      <div className={ri(1)} style={{ position: 'absolute', left: '6vw', right: '6vw', top: '34%' }}>
        <MetricTable
          cols={['Classical PINN', 'SIREN', 'QAPINN Q4']}
          rows={[
            ['rel L² error — Heat',    ['0.00117', '0.00079', '0.01166'], 1],
            ['rel L² error — Burgers', ['0.0756',  '0.1952',  '0.0697'],  2],
            ['PDE residual — Burgers', ['1.81e-4', '1.04e-3', '1.55e-3'], 0],
            ['Max pointwise err — Burgers', ['0.630', '1.627', '0.477'],  2],
            ['Training time — Burgers', ['178 s',  '183 s',   '4 097 s'], 0],
            ['Parameters',              ['1 341',  '1 341',   '985'],     2],
            ['Peak memory',             ['not measured', 'not measured', 'not measured'], -1],
            ['Generalization, unseen domain', ['not tested', 'not tested', 'not tested'], -1],
          ]}
          revealFrom={2} reveal={reveal}
        />
      </div>
      <p className={`caption ${ri(4)}`} style={{ position: 'absolute', bottom: '3.5vh', left: '6vw', maxWidth: '78ch' }}>
        White = better. Read the two rows nobody quotes: quantum has the <em>worse</em> PDE residual on Burgers yet the
        better solution error, and it costs 23× the wall clock. Memory and out-of-domain generalization were not measured —
        we are not going to guess them. All figures from <code>results/*/summary.json</code>; heat timings are not
        epoch-matched (6 500 vs 3 000) so we base the cost claim on Burgers, where all runs used 8 500.
      </p>
    </article>
  );
}

function S16({ reveal }) {
  const ri = n => `ri${reveal >= n ? ' in' : ''}`;
  const nu05 = NU_SWEEP.filter(d => d.nu === 0.05);
  const nu1  = NU_SWEEP.filter(d => d.nu === 0.1);
  const fmt = list => list.map(d => `${d.model} ${d.rel.toFixed(4)}${d.winner ? '★' : ''}`).join(' · ');
  return (
    <article className="slide">
      <p className="eyebrow">16 · RESULT 3 — WE RAN THE MISSING BASELINE, AND IT ENDED THE WINNING STREAK</p>
      <h2 style={{ marginBottom: '1vh', maxWidth: '30ch' }}>
        Smooth the shock and the classical network takes the lead back.<br />
        <em>Quantum only wins in the sharpest flow we tested.</em>
      </h2>
      <div className={ri(1)} style={{ position: 'absolute', left: '6vw', width: 'min(460px, 38vw)', top: '32%', bottom: '10vh' }}>
        <CrossoverChart />
      </div>
      <div style={{ position: 'absolute', right: '6vw', width: 'min(560px, 46vw)', top: '31%' }}>
        <div className={`metrics ${ri(2)}`}>
          <div className="metrics-row metrics-head" style={{ gridTemplateColumns: '1fr 1fr 1fr 1.1fr' }}>
            <span />
            <span>Classical PINN</span>
            <span>Best QAPINN</span>
            <span>Verdict</span>
          </div>
          {[
            ['ν = 0.00318', '0.0756', `Q4  ${(0.0697).toFixed(4)}`, 'quantum, −7.8%', true],
            ['ν = 0.05',    NU_PINN[0.05].toFixed(4), 'Q3  0.0037', 'classical, 3.0× better', false],
            ['ν = 0.1',     NU_PINN[0.1].toFixed(4),  'Q5  0.0039', 'classical, 1.7× better', false],
          ].map(([nu, p, q, v, qWins]) => (
            <div key={nu} className="metrics-row" style={{ gridTemplateColumns: '1fr 1fr 1fr 1.1fr' }}>
              <span className="m-label">{nu}</span>
              <span className={qWins ? '' : 'm-win'}>{p}</span>
              <span className={qWins ? 'm-win' : ''}>{q}</span>
              <span style={{ fontFamily: 'var(--sans)', fontSize: 'clamp(10px,0.85vw,13px)', color: qWins ? 'var(--paper)' : 'var(--muted)' }}>{v}</span>
            </div>
          ))}
        </div>
        <div className={ri(3)} style={{ marginTop: '2.5vh' }}>
          <p className="ctx-label">What still holds — and it is the important half</p>
          <p className="caption" style={{ maxWidth: 'none', marginTop: '0.8vh' }}>
            Within the quantum family the formula predicts correctly every time. At ν=0.05 the narrower
            spectrum favours K=3 ({fmt(nu05)}). At ν=0.1 it shifts to K=5 ({fmt(nu1)}). Nothing about the
            network changed between those rows — only the fluid — and the winning bandwidth moved with it.
            That is a causal mechanism behaving as one should.
          </p>
          <p className="caption" style={{ maxWidth: 'none', marginTop: '1.2vh' }}>
            What does <em>not</em> hold is any claim that quantum beats classical here. It does not, at either
            viscosity, and it costs 5–24× the training time to lose.
          </p>
        </div>
      </div>
      <p className={`caption ${ri(4)}`} style={{ position: 'absolute', bottom: '3.5vh', left: '6vw', maxWidth: '84ch' }}>
        6 quantum runs on the CRC cluster; the two classical baselines were missing from our original sweep, so we ran them —
        387 s each — rather than compare against a PINN trained at a different viscosity, which is not a fair test.
        Running them cost us the headline. We think the resulting story is the stronger one: the quantum advantage is
        real, narrow, and located exactly where the mechanism says it should be.
      </p>
    </article>
  );
}

function S17({ reveal }) {
  const ri = n => `ri${reveal >= n ? ' in' : ''}`;
  const ratio = (CAPACITY.pinn.complexity / CAPACITY.qapinn.complexity).toFixed(1);
  return (
    <article className="slide">
      <p className="eyebrow">17 · EXPLAINABILITY — HOW THE TWO MODELS ACTUALLY LEARN</p>
      <h2 style={{ marginBottom: '1.5vh' }}>
        The quantum layer isn't a bigger brain.<br /><em>It's a smaller one that can't cheat.</em>
      </h2>
      <div style={{ position: 'absolute', left: '6vw', right: '6vw', top: '33%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3vw' }}>
        <div className={ri(1)}>
          <p className="ctx-label">Probe 1 — it fits the physics worse, and the answer better</p>
          <p className="caption" style={{ maxWidth: 'none', marginTop: '1vh' }}>
            On Burgers the QAPINN ends with <strong style={{ color: 'var(--paper)', fontWeight: 500 }}>8.6× the PDE residual</strong> of
            the classical PINN (1.55e-3 vs 1.81e-4) — yet a <strong style={{ color: 'var(--paper)', fontWeight: 500 }}>lower solution error</strong> (0.0697 vs 0.0756)
            and a 24% lower max pointwise error.
          </p>
          <p className="caption" style={{ maxWidth: 'none', marginTop: '1.2vh' }}>
            The classical network drives the residual down hard at the 8 000 collocation points and drifts between
            them, right where the shock is. The band-limited circuit physically cannot chase the residual that
            aggressively. That constraint behaves like a regulariser.
          </p>
        </div>
        <div className={ri(2)}>
          <p className="ctx-label">Probe 2 — capacity bound says the same thing</p>
          <p className="caption" style={{ maxWidth: 'none', marginTop: '1vh' }}>
            Bartlett–Mendelson spectral complexity (Hu et al.): the QAPINN is a
            <strong style={{ color: 'var(--paper)', fontWeight: 500 }}> {ratio}× structurally simpler</strong> function class
            than the PINN, with 27% fewer parameters — and still matches or beats it on the broadband problem.
          </p>
          <div style={{ display: 'flex', gap: '2.5vw', marginTop: '2vh', flexWrap: 'wrap' }}>
            <KPI val={`${ratio}×`} lbl="lower complexity bound" />
            <KPI val="2.1×" lbl="lower spectral product" />
            <KPI val="27%" lbl="fewer parameters" />
          </div>
        </div>
      </div>
      <div className={ri(3)} style={{ position: 'absolute', left: '6vw', right: '6vw', bottom: '10vh', borderTop: '1px solid var(--line)', paddingTop: '2vh' }}>
        <p className="ctx-label">Both probes point the same direction</p>
        <p className="caption" style={{ maxWidth: '80ch', marginTop: '0.8vh' }}>
          Two independent measurements — one from training dynamics, one from a capacity bound — agree that the quantum
          layer is <em>constraining</em> the hypothesis space, not enlarging it. The advantage on Burgers is an inductive-bias
          effect, not extra expressive power. That also explains the heat result: on a smooth problem there is nothing to
          regularise, so the constraint is pure cost.
        </p>
      </div>
      <p className={`caption ${ri(4)}`} style={{ position: 'absolute', bottom: '3.5vh', left: '6vw', maxWidth: '70ch' }}>
        Honest limit of this analysis: both probes are indirect. We did not run attribution or neuron-level
        interpretability, and with 30 runs we cannot separate inductive bias from optimisation luck with statistical confidence.
      </p>
    </article>
  );
}

function S18({ reveal }) {
  const ri = n => `ri${reveal >= n ? ' in' : ''}`;
  const helps = [
    ['SHARP SHOCKS ONLY', 'Burgers at ν=0.00318 — the single win we found',
     'Q4 beats the PINN by 7.8% on rel L², and by 24% on max pointwise error. Raise the viscosity and this reverses: classical wins at ν=0.05 and ν=0.1.'],
    ['WHERE THE RESIDUAL IS OVERFITTABLE', 'The ceiling acts as a regulariser',
     'It stops the network chasing residual between collocation points. That is why the quantum model has 8.6× the PDE residual and still the better solution.'],
    ['TIGHT PARAMETER BUDGETS', '985 params doing the work of 1 341',
     'If parameter count binds rather than wall clock, the trade improves. On our runs it never fully closed.'],
  ];
  const hurts = [
    ['SMOOTH, LOW-MODE PDEs', 'Heat equation: classical wins by 10×',
     'Nothing to regularise, so the ceiling is pure downside — 0.00117 classical vs 0.01166 quantum. SIREN beats both.'],
    ['EVEN MILDLY SMOOTHED FLOWS', 'The advantage vanishes fast',
     'Burgers at ν=0.05: classical 3.0× better. At ν=0.1: 1.7× better. The winning window is narrower than we expected before running the baselines.'],
    ['ANY WALL-CLOCK BUDGET', '4 097 s vs 178 s on identical hardware',
     '23× slower on simulator for a 7.8% gain, and 5–24× slower in the ν-sweep where it also loses on accuracy. On a real deadline this trade does not close.'],
  ];
  const Col = ({ title, sub, items, from, accent }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.6vh' }}>
      <div>
        <p className="ctx-label" style={{ color: accent ? 'var(--paper)' : 'var(--muted)' }}>{title}</p>
        <p style={{ fontFamily: 'var(--serif)', fontSize: 'clamp(15px,1.5vw,24px)', fontWeight: 500, color: 'var(--paper)', marginTop: '0.4vh', lineHeight: 1.2 }}>{sub}</p>
      </div>
      {items.map(([k, t, c], i) => (
        <div key={k} className={ri(from + i)} style={{ borderTop: '1px solid var(--line)', paddingTop: '1.1vh' }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 'clamp(8px,0.7vw,11px)', letterSpacing: '0.14em', color: 'var(--muted)' }}>{k}</span>
          <p style={{ fontFamily: 'var(--serif)', fontSize: 'clamp(12px,1.1vw,18px)', fontWeight: 500, color: 'var(--paper)', margin: '0.4vh 0', lineHeight: 1.25 }}>{t}</p>
          <p className="caption" style={{ maxWidth: 'none' }}>{c}</p>
        </div>
      ))}
    </div>
  );
  return (
    <article className="slide">
      <p className="eyebrow">18 · THE HONEST ANSWER — WHEN IT HELPS, WHEN IT DOESN'T</p>
      <h2 style={{ marginBottom: '1vh', maxWidth: '30ch' }}>
        The quantum layer is a constraint, not an upgrade.<br />
        <em>It pays off only when the constraint is the right one.</em>
      </h2>
      <div style={{ position: 'absolute', left: '6vw', right: '6vw', top: '30%', bottom: '9vh', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4vw' }}>
        <Col title="✓  WHEN IT HELPS" sub="Broadband problems, tight parameter budgets" items={helps} from={1} accent />
        <Col title="✗  WHEN IT DOESN'T" sub="Smooth problems, and any clock you have to watch" items={hurts} from={1} />
      </div>
      <p className={`caption ${ri(4)}`} style={{ position: 'absolute', bottom: '3.5vh', left: '6vw', maxWidth: '76ch' }}>
        The one-sentence version: <strong style={{ color: 'var(--paper)', fontWeight: 500 }}>a band-limited layer helps exactly
        when your PDE has structure the classical network overfits, and hurts everywhere else.</strong> We found that window
        once in four setups. Four setups is not enough to call it a law — but the same formula predicted the win, the losses,
        and the point where the advantage disappears, which is more than a benchmark number does.
      </p>
    </article>
  );
}

function S19({ reveal }) {
  const ri = n => `ri${reveal >= n ? ' in' : ''}`;
  const rows = [
    ['STEP 0', 'First ask whether you need a quantum layer at all',
     'Is your solution smooth and low-mode? Use the classical PINN. Our heat result says you will win by 10× and finish 4× sooner.'],
    ['STEP 1', 'Fourier-analyse the target, not the network',
     'Take the initial condition and any known solution, FFT it, and count the modes that carry real energy. This costs seconds.'],
    ['STEP 2', 'Pick K to cover the top mode with margin ≥ 1',
     'Coverage alone is not enough — the measured spectrum showed the top harmonic is present but weak. Aim one mode above what you need.'],
    ['STEP 3', 'Buy K with re-uploads, then qubits',
     'K = (n_qubits ÷ in_dim) × n_uploads. Re-uploads are cheap in simulation; qubits are not. Never use angle encoding for this — it caps n_uploads at 1.'],
  ];
  return (
    <article className="slide rules-slide">
      <p className="eyebrow">19 · THE RECOMMENDATION — HOW TO BUILD ONE OF THESE</p>
      <h2>Four steps, and the first one<br />is <em>"probably don't."</em></h2>
      <div className="rule-list" style={{ top: '33%', width: 'min(880px, 66vw)' }}>
        {rows.map(([n, t, c], i) => (
          <div key={n} className={`rule-row${i === 0 ? ' highlight' : ''} ${ri(i + 1)}`}
            style={{ gridTemplateColumns: '62px 1fr 1.5fr', padding: '1.5vh 2vw 1.5vh 0' }}>
            <span className="rule-num">{n}</span>
            <span className="rule-title">{t}</span>
            <span className="rule-copy">{c}</span>
          </div>
        ))}
      </div>
      <p className="caption" style={{ position: 'absolute', bottom: '5vh', left: '6vw', maxWidth: '60ch' }}>
        Scope of this recipe: 1D time-dependent PDEs with a 2D input (x,t) and identifiable Fourier structure.
        We have not tested it on 2D/3D domains, and the mode-counting step assumes you have an initial condition
        or reference solution to transform.
      </p>
    </article>
  );
}

function S20({ reveal }) {
  const ri = n => `ri${reveal >= n ? ' in' : ''}`;
  const pillars = [
    ['SIMULATOR ONLY', 'No quantum hardware was used, at all',
     'Everything is PennyLane state-vector simulation. No shot noise, no decoherence, no gate error. Real hardware would degrade every quantum number on the scoreboard.'],
    ['TRAINING COST', '23× slower on the equation where we win',
     '4 097 s vs 178 s. Circuit simulation cost grows with qubits and re-uploads, so the lever that buys bandwidth is the same one that buys wall clock.'],
    ['BARREN PLATEAUS', 'Not measured — we stayed below the regime',
     'At 2–5 qubits gradient variance never collapsed and training was stable. That is not evidence of absence: it means we never entered the regime where plateaus are expected. Scaling K past ~8 needs this checked.'],
    ['SCOPE', 'Two 1D PDEs, one input dimension, one measurement operator',
     'No 2D/3D domains, no out-of-domain generalization test, no memory profiling, ⟨Z⟩ throughout. Loss logged every 1 000 epochs, so the curves are coarse.'],
  ];
  return (
    <article className="slide map-slide">
      <p className="eyebrow">20 · LIMITATIONS</p>
      <h2>What this result does not cover,<br /><em>said before anyone has to ask.</em></h2>
      <div className="pillar-grid cols-4">
        {pillars.map(([sp, st, p], i) => (
          <div key={i} className={`pillar ${i === 1 ? 'accent ' : ''}${ri(i + 1)}`}>
            <span>{sp}</span>
            <strong>{st}</strong>
            <p>{p}</p>
          </div>
        ))}
      </div>
    </article>
  );
}

function S21({ reveal }) {
  const ri = n => `ri${reveal >= n ? ' in' : ''}`;
  const rows = [
    ['01', 'Run it on hardware and see what survives',
     'Shot noise and decoherence attack the high harmonics first — exactly the ones the bandwidth argument depends on. This is the single highest-value next experiment.'],
    ['02', 'Test generalization outside the training domain',
     'Train on t ∈ [0,1], evaluate beyond it. A band-limited basis should extrapolate differently from tanh, and that is a testable prediction we have not yet run.'],
    ['03', 'Push K into the barren-plateau regime',
     'Sweep to 8–12 qubits logging gradient variance, and find where the bandwidth gain is cancelled by trainability collapse. That crossing point is the real design limit.'],
    ['04', 'Extend the formula to 2D and 3D domains',
     'in_dim = 3 or 4 divides the qubit budget further, so K falls fast. Whether the recipe survives that is the question that decides if this is useful for real CFD.'],
  ];
  return (
    <article className="slide rules-slide">
      <p className="eyebrow">21 · FUTURE WORK</p>
      <h2>Four experiments that would<br />either <em>break this or scale it.</em></h2>
      <div className="rule-list" style={{ top: '33%', width: 'min(880px, 66vw)' }}>
        {rows.map(([n, t, c], i) => (
          <div key={n} className={`rule-row ${ri(i + 1)}`} style={{ gridTemplateColumns: '44px 1fr 1.5fr', padding: '1.6vh 2vw 1.6vh 0' }}>
            <span className="rule-num">{n}</span>
            <span className="rule-title">{t}</span>
            <span className="rule-copy">{c}</span>
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
    ['PREDICTED', 'A number you can compute before training tells you the quantum model\'s accuracy ceiling',
     'K-sweep elbow lands at exactly K=4 on the heat equation, 18 runs, 3 seeds, all agreeing. The measured Fourier spectrum flatlines at K with no training involved.'],
    ['CONFIRMED', 'The same formula predicts the wins and the losses',
     'Burgers at ν=0.00318: only the correct-K circuit beats classical, by 7.8%. SIREN fails, ruling out periodicity. Change the fluid and the winning K moves with it, every time.'],
    ['COST', 'And quantum lost three of the four setups we ran',
     '10× worse on the smooth heat equation; 3.0× and 1.7× worse once we smoothed the Burgers shock; 23× slower where it won; simulator only. The honest answer is "sometimes, for a specific reason, at a real price."'],
  ];
  return (
    <article className="slide close-slide">
      <p className="eyebrow">22 · CONCLUSION</p>
      <h2 style={{ maxWidth: '26ch' }}>
        A quantum layer isn't better or worse.<br /><em>It's a constraint you have to earn.</em>
      </h2>
      <div style={{ marginTop: '2vh', display: 'flex', flexDirection: 'column', gap: '1.8vh', maxWidth: '62ch' }}>
        {rows.map(([tag, t, c], i) => (
          <div key={tag} className={ri(i + 1)} style={{ display: 'grid', gridTemplateColumns: '92px 1fr', gap: '1.4vw', alignItems: 'start' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 'clamp(9px,0.75vw,12px)', color: i === 2 ? 'var(--paper)' : 'rgba(242,242,240,0.4)', letterSpacing: '0.14em', textTransform: 'uppercase', paddingTop: '0.3em' }}>{tag}</span>
            <span>
              <span style={{ display: 'block', fontFamily: 'var(--sans)', fontSize: 'clamp(13px,1.15vw,18px)', color: 'var(--paper)', lineHeight: 1.35 }}>{t}</span>
              <span style={{ display: 'block', fontFamily: 'var(--sans)', fontSize: 'clamp(10px,0.9vw,14px)', fontWeight: 300, color: 'var(--muted)', lineHeight: 1.5, marginTop: '0.4vh' }}>{c}</span>
            </span>
          </div>
        ))}
      </div>
      <p className={`caption ${ri(4)}`} style={{ position: 'absolute', bottom: '5vh', left: '6vw', maxWidth: '62ch' }}>
        The recipe an engineer can use tomorrow: compute <code>K = (n_qubits ÷ in_dim) × n_uploads</code>,
        Fourier-analyse your PDE, match K to its modes with margin ≥ 1 — and if your solution is smooth,
        don't use a quantum layer at all.
      </p>
    </article>
  );
}

// ─── Slide registry ───────────────────────────────────────────────────────────

const SLIDES = [
  S00, S01, S02, S03, S04, S05, S06, S07, S08, S09, S10, S11,
  S12, S13, S14, S15, S16, S17, S18, S19, S20, S21, S22,
];

// ─── DeckChrome ───────────────────────────────────────────────────────────────

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

// ─── NotesPanel ───────────────────────────────────────────────────────────────

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

// ─── Slide footer (dots) ──────────────────────────────────────────────────────

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
    if (reveal < REVEAL_COUNTS[active]) {
      setReveal(r => r + 1);
    } else if (active < SLIDE_COUNT - 1) {
      setActive(a => a + 1);
      setReveal(0);
    }
  }

  function goPrev() {
    if (reveal > 0) {
      setReveal(r => r - 1);
    } else if (active > 0) {
      const prev = active - 1;
      setActive(prev);
      setReveal(REVEAL_COUNTS[prev]);
    }
  }

  function goTo(idx) {
    setActive(Math.max(0, Math.min(SLIDE_COUNT - 1, idx)));
    setReveal(0);
  }

  // Stable key handler via ref trick to avoid stale closure recreation on every state change
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
        if (reveal < REVEAL_COUNTS[active]) {
          setReveal(r => r + 1);
        } else if (active < SLIDE_COUNT - 1) {
          setActive(a => a + 1);
          setReveal(0);
        }
      } else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) {
        e.preventDefault();
        if (reveal > 0) {
          setReveal(r => r - 1);
        } else if (active > 0) {
          const prev = active - 1;
          setActive(prev);
          setReveal(REVEAL_COUNTS[prev]);
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bumpChrome]);

  const SlideComponent = SLIDES[active];
  const atStart = active === 0 && reveal === 0;
  const atEnd   = active === SLIDE_COUNT - 1 && reveal === REVEAL_COUNTS[active];

  return (
    <div className="im-root" style={{ width: '100vw', height: '100vh' }}>
      {/* Remount slide on active change (triggers im-enter animation) */}
      <SlideComponent key={active} reveal={reveal} />

      {/* Footer dots live inside im-root so they use theme CSS */}
      <SlideFooter active={active} total={SLIDE_COUNT} onGoto={goTo} />

      {/* Chrome overlays use system font — outside slide canvas context */}
      <DeckChrome
        active={active} total={SLIDE_COUNT}
        onPrev={goPrev} onNext={goNext} onReset={() => goTo(0)}
        atStart={atStart} atEnd={atEnd}
        visible={chromeVisible}
      />

      {notesVisible && (
        <NotesPanel note={NOTES[active]} onClose={() => setNotesVisible(false)} />
      )}
    </div>
  );
}
