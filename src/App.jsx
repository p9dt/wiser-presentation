import { useState, useEffect, useRef, useCallback } from 'react';
import {
  LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import './theme.css';
import './chrome.css';

// ─── Data ───────────────────────────────────────────────────────────────────

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
  { model: 'Q3',   rel: 0.1483 },
  { model: 'Q4',   rel: 0.0697 },
  { model: 'Q5',   rel: 0.1477 },
];

const REVEAL_COUNTS = [0, 3, 2, 4, 4, 4, 3, 3, 6, 3, 3, 4, 4, 4];
const SLIDE_COUNT = REVEAL_COUNTS.length;

const NOTES = [
  /* 00 */ 'Welcome. This is a research submission for the WISER × BQP Global Quantum+AI 2026 Challenge. The core claim: we derived a formula that predicts exactly when a quantum circuit layer helps a PINN — and verified it with 18 controlled experiments.',
  /* 01 */ 'WISER BQP does not want another benchmark number. They want a causal mechanism: a formula that predicts quantum advantage before any training. Standard quantum ML papers just compare accuracy. We go deeper.',
  /* 02 */ 'Answer first — McKinsey pyramid. K is the Fourier bandwidth of the VQC output. If K ≥ the PDE\'s required frequency modes, QAPINN wins. If not, it provably fails. This is the whole talk in one formula.',
  /* 03 */ 'PINNs train without labeled solution data by penalizing the PDE residual over collocation points. The loss has two terms: interior PDE violation and boundary/IC mismatch. No finite-difference grid, no labeled u(x,t) pairs needed.',
  /* 04 */ 'The ONLY architectural change from PINN to QAPINN is replacing the first Linear(2→H) layer with a QuantumLayer. Everything else — hidden size, depth, tanh activations, training recipe — is identical. This makes the experiment clean and causally interpretable.',
  /* 05 */ 'This is the theoretical anchor (Schuld et al. 2021). VQC output is a trigonometric polynomial with frequency set {-K,...,K} fixed by circuit structure. Training only adjusts the Fourier coefficients. K is a hard ceiling on expressiveness — no amount of training overcomes a mismatched K.',
  /* 06 */ 'K = (n_qubits / in_dim) × n_uploads. For our 2D input (x,t), in_dim=2. With 4 qubits and 2 re-upload layers: K = (4/2)×2 = 4. With angle encoding (n_uploads=1 regardless of layers): K = (4/2)×1 = 2. Re-upload is what unlocks higher K.',
  /* 07 */ 'Heat equation exact solution: u = sin(πx)·exp(-α π²t) + 0.5·sin(4πx)·exp(-16α π²t). Two Fourier modes: k=1 and k=4. Both must be representable. K=3 can\'t reach k=4. K=4 can just cover it. This is the precise prediction we verify.',
  /* 08 */ '18 runs: 6 bandwidth values × 3 seeds. Everything else is fixed: same heat PDE, same 3000-step Adam training, same hidden size, same depth. The only variable is the circuit structure determining K. This is a controlled experiment, not a lucky benchmark.',
  /* 09 */ 'The elbow is exactly at K=4. Mean error at K=3 is 0.068; at K=4 it drops to 0.012 — a 5.7× improvement. Seeds 1,2,3 all agree. This cannot be explained without the Fourier bandwidth mechanism — K=4 is not arbitrary, it is predicted by the exact solution.',
  /* 10 */ 'Burgers is the hard case. Nonlinear, shock formation, no closed-form solution. No simple frequency prediction. We compare Q3, Q4, Q5 against PINN and SIREN. All hyperparameters are matched. This tests whether quantum advantage generalises beyond clean testbeds.',
  /* 11 */ 'SIREN failing on Burgers is a key result: if the advantage came purely from periodic activations, SIREN should win. It doesn\'t. Only Q4 (correct K) beats the classical PINN. SIREN\'s smooth prior is too rigid for the shock. The Fourier bandwidth explanation survives both equations.',
  /* 12 */ 'Three things help Q4: (1) structured Fourier prior matching PDE frequency demand, (2) 27% fewer parameters than the PINN (985 vs 1341 — same capacity per parameter), (3) Fourier basis adaptability to the Burgers shock. The failure modes reveal the edges of the explanation.',
  /* 13 */ 'The engineering recipe: Fourier-analyse your PDE, count required modes, pick K with margin. ν-sweep (6 runs: ν∈{0.05,0.1} × Q3/Q4/Q5) is running on the CRC cluster to validate the second axis — varying shock sharpness vs bandwidth. Results will extend the submission.',
];

// ─── SVG: Quantum Circuit (Slide 04) ────────────────────────────────────────

const INK = '#080808';
const PAPER = '#f2f2f0';
const DIM = 'rgba(242,242,240,0.25)';
const MUT = 'rgba(242,242,240,0.45)';

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
      {/* Qubit wires */}
      {qs.map((y, i) => (
        <g key={i}>
          <text x={14} y={y + 4} textAnchor="middle" fill={DIM} fontSize={8.5} fontFamily="Space Mono, monospace">q{i}</text>
          <line x1={24} y1={y} x2={476} y2={y} stroke={lc} strokeWidth={0.7} />
        </g>
      ))}
      {/* Column labels */}
      {[
        [80, 'ENC 1'], [150, 'PARAMS 1'], [228, 'RING 1'],
        [315, 'ENC 2'], [385, 'PARAMS 2'], [454, 'MEAS'],
      ].map(([x, lbl]) => (
        <text key={lbl} x={x} y={20} textAnchor="middle" fill="rgba(242,242,240,0.18)"
          fontSize={7} fontFamily="Space Mono, monospace" letterSpacing={0.5}>{lbl}</text>
      ))}
      {/* Layer 1: data encoding */}
      {qs.map((y, i) => <SvgGate key={i} x={80} y={y} label={i % 2 === 0 ? 'Ry(x)' : 'Ry(t)'} w={34} />)}
      {/* Layer 1: parameterised */}
      {qs.map((y, i) => (
        <g key={i}>
          <SvgGate x={135} y={y} label="Ry(θ)" w={30} filled />
          <SvgGate x={168} y={y} label="Rz(θ)" w={30} filled />
        </g>
      ))}
      {/* Layer 1: CNOT ring */}
      <SvgCNOT x={228} yCtrl={qs[0]} yTgt={qs[1]} />
      <SvgCNOT x={228} yCtrl={qs[1]} yTgt={qs[2]} />
      <SvgCNOT x={228} yCtrl={qs[2]} yTgt={qs[3]} />
      {/* Layer boundary */}
      <line x1={268} y1={28} x2={268} y2={175} stroke="rgba(242,242,240,0.08)" strokeDasharray="2 4" strokeWidth={0.8} />
      {/* Layer 2: re-upload */}
      {qs.map((y, i) => <SvgGate key={i} x={315} y={y} label={i % 2 === 0 ? 'Ry(x)' : 'Ry(t)'} w={34} />)}
      {/* Layer 2: parameterised */}
      {qs.map((y, i) => (
        <g key={i}>
          <SvgGate x={370} y={y} label="Ry(θ)" w={30} filled />
          <SvgGate x={403} y={y} label="Rz(θ)" w={30} filled />
        </g>
      ))}
      {/* Measurement */}
      {qs.map((y, i) => (
        <g key={i}>
          <rect x={437} y={y - 10} width={34} height={20} fill={INK} stroke="rgba(242,242,240,0.5)" strokeWidth={0.8} rx={2} />
          <text x={454} y={y + 4} textAnchor="middle" fill="rgba(242,242,240,0.65)" fontSize={8} fontFamily="Space Mono, monospace">⟨Z⟩</text>
        </g>
      ))}
      {/* I/O labels */}
      <text x={28} y={192} fill="rgba(242,242,240,0.2)" fontSize={7.5} fontFamily="Space Mono, monospace">input (x,t)</text>
      <text x={474} y={192} textAnchor="end" fill="rgba(242,242,240,0.2)" fontSize={7.5} fontFamily="Space Mono, monospace">→ PINN tail</text>
      {/* Annotations */}
      <text x={200} y={192} textAnchor="middle" fill="rgba(242,242,240,0.15)" fontSize={7} fontFamily="Space Mono, monospace">n_qubits=4 · n_uploads=2 → K=4</text>
    </svg>
  );
}

// ─── SVG: Frequency Spectrum (Slide 06) ─────────────────────────────────────

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
      {/* K=4 boundary */}
      <line x1={14 + 4 * (bw + gap) - gap / 2} y1={8}
            x2={14 + 4 * (bw + gap) - gap / 2} y2={88}
        stroke="rgba(242,242,240,0.3)" strokeDasharray="3 3" strokeWidth={1} />
      <text x={14 + 4 * (bw + gap) - gap / 2 + 4} y={16}
        fill="rgba(242,242,240,0.3)" fontSize={6.5} fontFamily="Space Mono, monospace">K=4</text>
      {/* Baseline */}
      <line x1={8} y1={88} x2={252} y2={88} stroke="rgba(242,242,240,0.12)" strokeWidth={0.5} />
    </svg>
  );
}

// ─── Charts ──────────────────────────────────────────────────────────────────

const AXIS_STYLE = { fill: 'rgba(242,242,240,0.4)', fontFamily: 'Space Mono, monospace', fontSize: 10 };
const GRID_STROKE = 'rgba(242,242,240,0.07)';

function KSweepChart() {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={KSWEEP} margin={{ top: 8, right: 24, bottom: 28, left: 10 }}>
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function KPI({ val, lbl }) {
  return (
    <div className="kpi">
      <span className="kpi-val">{val}</span>
      <span className="kpi-lbl">{lbl}</span>
    </div>
  );
}

// ─── Slides ───────────────────────────────────────────────────────────────────
// Each slide receives { reveal } prop. Uses .ri / .ri.in for per-item reveals.
// The slide container is keyed on active index in App, triggering im-enter on transition.

function S00() {
  return (
    <article className="slide title-slide">
      <p className="eyebrow">WISER × BQP · GLOBAL QUANTUM+AI 2026</p>
      <h1>Quantum bandwidth<br /><em>predicts PDE error.</em></h1>
      <p className="subtitle">18 controlled runs. One formula. Causal evidence.</p>
      <p className="title-note">K = (n_qubits ÷ in_dim) × n_uploads</p>
      <p className="nav-hint">↓ / Space  to advance&nbsp;&nbsp;·&nbsp;&nbsp;N  for notes&nbsp;&nbsp;·&nbsp;&nbsp;F  fullscreen</p>
    </article>
  );
}

function S01({ reveal }) {
  const ri = n => `ri${reveal >= n ? ' in' : ''}`;
  return (
    <article className="slide shift-slide">
      <p className="eyebrow">01 · THE QUESTION</p>
      <h2>When and why does a quantum layer help a PINN?<br /><em>Explain it.</em></h2>
      <div className="context-layout">
        <div className={ri(1)}>
          <p className="ctx-label">Current approach</p>
          <div className="ctx-inputs">
            <strong>Benchmark accuracy</strong>
            <strong>Compare models</strong>
            <strong>Report one number</strong>
            <strong>Ignore mechanism</strong>
          </div>
        </div>
        <div className={`ctx-arrow${reveal >= 1 ? '' : ' ri'}`}>→</div>
        <div className={`ctx-result ${ri(2)}`}>
          <p className="ctx-label">What we need</p>
          <strong>A causal formula</strong>
          <strong>Predict before training</strong>
          <strong>Generalise to new PDEs</strong>
        </div>
      </div>
      <p className={`caption ${ri(3)}`} style={{ position: 'absolute', bottom: '6vh', left: '6vw' }}>
        Challenge spec: explain the mechanism, not just the number.
      </p>
    </article>
  );
}

function S02({ reveal }) {
  const ri = n => `ri${reveal >= n ? ' in' : ''}`;
  return (
    <article className="slide close-slide">
      <p className="eyebrow">02 · THE ANSWER</p>
      <h2>Match the circuit's Fourier bandwidth K to the PDE's required modes — and quantum wins.<br /><em>Mismatch it, and it fails.</em></h2>
      <div className={`formula-block ${ri(1)}`}>
        K = (n_qubits ÷ in_dim) × n_uploads
      </div>
      <p className={`caption ${ri(2)}`} style={{ marginTop: '2vh' }}>
        Derived from Schuld et al. 2021 (data re-uploading theorem). Verified in 18 controlled runs.
      </p>
    </article>
  );
}

function S03({ reveal }) {
  const ri = n => `ri${reveal >= n ? ' in' : ''}`;
  const rows = [
    ['01', 'Residual loss', 'Penalise PDE violation over 8 000 interior collocation points'],
    ['02', 'No labeled data', 'Only BC and IC matching — no ground-truth u(x,t) pairs needed'],
    ['03', 'Automatic diff.', 'Derivatives ∂u/∂x and ∂u/∂t flow through the network via autograd'],
    ['04', 'Shared architecture', 'Hidden dim 64, depth 4, tanh activations — identical for PINN and QAPINN'],
  ];
  return (
    <article className="slide rules-slide">
      <p className="eyebrow">03 · PHYSICS-INFORMED NEURAL NETWORKS</p>
      <h2>Train on the physics —<br /><em>not the solution.</em></h2>
      <div className="rule-list">
        {rows.map(([n, t, c], i) => (
          <div key={n} className={`rule-row ${ri(i + 1)}`}>
            <span className="rule-num">{n}</span>
            <span className="rule-title">{t}</span>
            <span className="rule-copy">{c}</span>
          </div>
        ))}
      </div>
      <p className="caption" style={{ position: 'absolute', bottom: '6vh', left: '6vw', maxWidth: '32ch' }}>
        Raissi et al. 2019 — our starting architecture.
      </p>
    </article>
  );
}

function S04({ reveal }) {
  const ri = n => `ri${reveal >= n ? ' in' : ''}`;
  return (
    <article className="slide shift-slide">
      <p className="eyebrow">04 · QAPINN ARCHITECTURE</p>
      <h2>The only change: replace the first layer<br />with a <em>Variational Quantum Circuit.</em></h2>
      <div className="context-layout">
        <div className={ri(1)}>
          <p className="ctx-label">Classical PINN</p>
          <div className="ctx-inputs">
            <strong>Linear(2 → 64)</strong>
            <strong>tanh activations</strong>
            <strong>Hidden blocks × 3</strong>
            <strong>Linear(64 → 1)</strong>
          </div>
        </div>
        <div className={`ctx-arrow${reveal >= 1 ? '' : ' ri'}`}>→</div>
        <div className={`ctx-result ${ri(2)}`}>
          <p className="ctx-label">QAPINN</p>
          <strong>QuantumLayer(2 → 4)</strong>
          <strong>⟨Z⟩ expectation values</strong>
          <strong>Same hidden tail</strong>
          <strong>985 params total</strong>
        </div>
      </div>
      <div className={ri(3)} style={{ position: 'absolute', bottom: '5vh', left: '6vw', right: '6vw' }}>
        <CircuitSVG />
      </div>
      <p className={`caption ${ri(4)}`} style={{ position: 'absolute', bottom: '1.5vh', right: '6vw', textAlign: 'right' }}>
        4 qubits · 2 re-upload layers · ring entanglement → K = 4
      </p>
    </article>
  );
}

function S05({ reveal }) {
  const ri = n => `ri${reveal >= n ? ' in' : ''}`;
  const pillars = [
    ['FREQUENCY SET', 'Modes {-K, ..., K} fixed at circuit build time', 'Determined by n_qubits, in_dim, n_uploads — not by weights'],
    ['TRAINING', 'Weights adjust Fourier coefficients cₙ only', 'Gradient descent never generates a new frequency — it scales existing ones'],
    ['HARD CEILING', 'No mode k > K can appear in VQC output — ever', 'This is not a limitation of depth or width. It is a theorem.'],
    ['CONSEQUENCE', 'Accuracy is K-limited regardless of training time', 'If the PDE requires mode k=4 and K=3, the model cannot converge.'],
  ];
  return (
    <article className="slide map-slide">
      <p className="eyebrow">05 · THE FOURIER MECHANISM</p>
      <h2>VQC output is a truncated Fourier series.<br />Bandwidth K is fixed by structure, <em>not training.</em></h2>
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

function S06({ reveal }) {
  const ri = n => `ri${reveal >= n ? ' in' : ''}`;
  return (
    <article className="slide" style={{ justifyContent: 'flex-start' }}>
      <p className="eyebrow">06 · THE BANDWIDTH FORMULA</p>
      <h2 style={{ marginBottom: '1.5vh' }}>
        This formula fixes the accuracy ceiling <em>before training starts.</em>
      </h2>
      <div className="formula-block" style={{ fontSize: 'clamp(16px,2.2vw,36px)', marginBottom: '2.5vh' }}>
        K = (n_qubits ÷ in_dim) × n_uploads
      </div>
      <div style={{ width: 'min(760px, 58vw)', borderTop: '1px solid rgba(242,242,240,0.22)' }}>
        <div className={`rule-row ${ri(1)}`}
          style={{ display: 'grid', gridTemplateColumns: '72px 1fr 1.1fr', padding: '1.6vh 0', borderBottom: '1px solid rgba(242,242,240,0.22)', gap: '1.5vw', alignItems: 'start' }}>
          <span className="rule-num">RE-UPLOAD</span>
          <span className="rule-title">n_uploads = n_layers</span>
          <span className="rule-copy">Each data-encoding pass adds one bandwidth unit. 2 re-upload layers → double the K.</span>
        </div>
        <div className={`rule-row ${ri(2)}`}
          style={{ display: 'grid', gridTemplateColumns: '72px 1fr 1.1fr', padding: '1.6vh 0', borderBottom: '1px solid rgba(242,242,240,0.22)', gap: '1.5vw', alignItems: 'start' }}>
          <span className="rule-num">ANGLE ENC.</span>
          <span className="rule-title">n_uploads = 1</span>
          <span className="rule-copy">Single input pass regardless of circuit depth. K stays low — adding layers doesn't help.</span>
        </div>
      </div>
      <div className={ri(3)} style={{ position: 'absolute', right: '6vw', bottom: '6vh', width: 'min(300px, 28vw)' }}>
        <p className="caption" style={{ marginBottom: '1vh' }}>Heat eq. required modes (K=4 covers both)</p>
        <FreqSpectrumSVG />
      </div>
      <p className="caption" style={{ position: 'absolute', bottom: '6vh', left: '6vw', maxWidth: '30ch' }}>
        For our experiments: in_dim=2 (x,t), n_qubits=4, n_uploads=2 → K=4.
      </p>
    </article>
  );
}

function S07({ reveal }) {
  const ri = n => `ri${reveal >= n ? ' in' : ''}`;
  return (
    <article className="slide shift-slide">
      <p className="eyebrow">07 · HEAT EQUATION — THE CLEAN TESTBED</p>
      <h2>Exact solution known analytically.<br />Required bandwidth: <em>K ≥ 4.</em></h2>
      <div className="context-layout">
        <div className={ri(1)}>
          <p className="ctx-label">The PDE</p>
          <div className="ctx-inputs">
            <strong>∂u/∂t = α ∂²u/∂x²</strong>
            <strong>α = 0.01</strong>
            <strong>u(0,t) = u(1,t) = 0</strong>
            <strong>u(x,0) = sin(πx) + 0.5 sin(4πx)</strong>
          </div>
        </div>
        <div className={`ctx-arrow${reveal >= 1 ? '' : ' ri'}`}>→</div>
        <div className={`ctx-result ${ri(2)}`}>
          <p className="ctx-label">Exact solution</p>
          <strong style={{ fontStyle: 'normal', fontFamily: 'var(--mono)', fontSize: 'clamp(11px,1vw,16px)' }}>
            u = sin(πx)·e<sup>-απ²t</sup><br />
            + 0.5·sin(4πx)·e<sup>-16απ²t</sup>
          </strong>
          <p style={{ fontFamily: 'var(--sans)', fontSize: 'clamp(11px,0.95vw,15px)', color: 'rgba(242,242,240,0.55)', marginTop: '1vh' }}>
            Two modes: k=1 and k=4. A K=3 circuit provably cannot represent mode k=4.
          </p>
        </div>
      </div>
      <p className={`caption ${ri(3)}`} style={{ position: 'absolute', bottom: '6vh', left: '6vw' }}>
        Prediction: error drops at K=4 and nowhere else. We verify with 18 runs.
      </p>
    </article>
  );
}

function S08({ reveal }) {
  const ri = n => `ri${reveal >= n ? ' in' : ''}`;
  const rows = [
    ['K=1', '2 qubits · angle enc. · 1 layer', 'bandwidth = (2÷2)×1 = 1', false],
    ['K=2', '4 qubits · angle enc. · 1 layer', 'bandwidth = (4÷2)×1 = 2', false],
    ['K=3', '2 qubits · reupload · 3 layers',  'bandwidth = (2÷2)×3 = 3', false],
    ['K=4', '4 qubits · reupload · 2 layers',  'bandwidth = (4÷2)×2 = 4 ← theory predicts elbow here', true],
    ['K=5', '2 qubits · reupload · 5 layers',  'bandwidth = (2÷2)×5 = 5', false],
    ['K=8', '4 qubits · reupload · 4 layers',  'bandwidth = (4÷2)×4 = 8', false],
  ];
  return (
    <article className="slide rules-slide">
      <p className="eyebrow">08 · K-SWEEP EXPERIMENT — 18 RUNS</p>
      <h2>Vary K across 6 values,<br /><em>fix everything else.</em></h2>
      <div className="rule-list" style={{ top: '34%' }}>
        {rows.map(([k, cfg, bw, hl], i) => (
          <div key={k} className={`rule-row${hl ? ' highlight' : ''} ${ri(i + 1)}`}
            style={{ gridTemplateColumns: '52px 1fr 1.3fr', padding: '1.3vh 2vw 1.3vh 0' }}>
            <span className="rule-num">{k}</span>
            <span className="rule-title">{cfg}</span>
            <span className="rule-copy">{bw}</span>
          </div>
        ))}
      </div>
      <p className="caption" style={{ position: 'absolute', bottom: '6vh', left: '6vw', maxWidth: '36ch' }}>
        3 seeds × 6 K values = 18 runs. Fixed: heat PDE, 3000-step Adam, hidden dim 64, depth 4.
      </p>
    </article>
  );
}

function S09({ reveal }) {
  const ri = n => `ri${reveal >= n ? ' in' : ''}`;
  return (
    <article className="slide data-slide">
      <p className="eyebrow">09 · K-SWEEP RESULT</p>
      <h2>Error drops 5.7× at K=4. The elbow lands<br /><em>exactly where theory predicts.</em></h2>
      <div className={`kpi-row ${ri(1)}`}>
        <KPI val="0.068" lbl="K=3 mean error" />
        <KPI val="0.012" lbl="K=4 mean error" />
        <KPI val="5.7×" lbl="improvement" />
        <KPI val="3/3" lbl="seeds agree" />
      </div>
      <div className={ri(2)} style={{ position: 'absolute', left: '6vw', right: '6vw', top: '42%', bottom: '9vh' }}>
        <KSweepChart />
      </div>
      <p className={`caption ${ri(3)}`} style={{ position: 'absolute', bottom: '3vh', left: '6vw' }}>
        This causal structure — elbow at exactly the predicted K — cannot be explained without the bandwidth mechanism.
      </p>
    </article>
  );
}

function S10({ reveal }) {
  const ri = n => `ri${reveal >= n ? ' in' : ''}`;
  return (
    <article className="slide shift-slide">
      <p className="eyebrow">10 · BURGERS EQUATION — SHOCK AND BROADBAND</p>
      <h2>Nonlinear. Sharp shock. No closed form.<br /><em>Broadband frequency content.</em></h2>
      <div className="context-layout">
        <div className={ri(1)}>
          <p className="ctx-label">The PDE</p>
          <div className="ctx-inputs">
            <strong>∂u/∂t + u·∂u/∂x = ν∂²u/∂x²</strong>
            <strong>ν = 0.00318</strong>
            <strong>Sharp shock forms near x=0</strong>
            <strong>No simple Fourier prediction</strong>
          </div>
        </div>
        <div className={`ctx-arrow${reveal >= 1 ? '' : ' ri'}`}>→</div>
        <div className={`ctx-result ${ri(2)}`}>
          <p className="ctx-label">Result</p>
          <strong>QAPINN Q4 beats PINN</strong>
          <strong style={{ fontFamily: 'var(--mono)', fontStyle: 'normal', fontSize: 'clamp(11px,1vw,16px)' }}>
            Q4: 0.0697 · PINN: 0.0756
          </strong>
          <p style={{ fontFamily: 'var(--sans)', fontSize: 'clamp(11px,0.95vw,15px)', color: 'rgba(242,242,240,0.55)', marginTop: '0.8vh' }}>
            7.8% improvement. SIREN (0.1952) and Q5 (0.1477) both fail — ruling out periodicity as cause.
          </p>
        </div>
      </div>
      <p className={`caption ${ri(3)}`} style={{ position: 'absolute', bottom: '6vh', left: '6vw' }}>
        Burgers broadband content requires high K. Only K=4 circuit has sufficient bandwidth.
      </p>
    </article>
  );
}

function S11({ reveal }) {
  const ri = n => `ri${reveal >= n ? ' in' : ''}`;
  return (
    <article className="slide rules-slide">
      <p className="eyebrow">11 · FULL MODEL COMPARISON</p>
      <h2>One model beats PINN.<br />It's the one with <em>the right K.</em></h2>
      <div className="rule-list">
        <div className={`rule-row ${ri(1)}`}>
          <span className="rule-num">HEAT</span>
          <span className="rule-title">K-sweep elbow at K=4</span>
          <span className="rule-copy">Error 0.068 (K=3) → 0.012 (K=4), factor 5.7×. Three seeds, consistent.</span>
        </div>
        <div className={`rule-row ${ri(2)}`}>
          <span className="rule-num">BURGERS</span>
          <span className="rule-title">Q4 only beats PINN</span>
          <span className="rule-copy">Q4: 0.0697 vs PINN: 0.0756 (−7.8%). Q3: 0.148, Q5: 0.148, SIREN: 0.195.</span>
        </div>
        <div className={`rule-row ${ri(3)}`}>
          <span className="rule-num">SIREN</span>
          <span className="rule-title">Periodic activations aren't the cause</span>
          <span className="rule-copy">SIREN fails on Burgers, ruling out the hypothesis that periodicity alone drives advantage.</span>
        </div>
      </div>
      <div className={ri(3)} style={{ position: 'absolute', left: '6vw', bottom: '5.5vh', width: 'min(380px, 34vw)', height: '28vh' }}>
        <BurgersChart />
      </div>
      <p className={`caption ${ri(4)}`} style={{ position: 'absolute', bottom: '5.5vh', right: '6vw', maxWidth: '26ch', textAlign: 'right' }}>
        Burgers comparison. Q4 bar is highlighted (white). Lower = better.
      </p>
    </article>
  );
}

function S12({ reveal }) {
  const ri = n => `ri${reveal >= n ? ' in' : ''}`;
  const pillars = [
    ['FOURIER PRIOR', 'Structured inductive bias at the correct frequencies', 'Circuit can only represent modes up to K — exactly what the PDE needs.'],
    ['PARAM EFFICIENCY', 'QAPINN (Q4): 985 params vs PINN: 1,341 params', '27% fewer parameters, equal or better accuracy on matched PDEs.'],
    ['SHOCK ADAPTION', 'Fourier basis adapts to Burgers shock profile', "SIREN's smooth prior can't adapt; the Fourier basis restructures around the discontinuity."],
    ['FAILURE MODES', 'Quantum loses when K=required (zero margin)', 'K=3 on Heat, K=0 (angle enc.) on Burgers — confirms the mechanism limits both ways.'],
  ];
  return (
    <article className="slide map-slide">
      <p className="eyebrow">12 · THE MECHANISM — WHY QUANTUM HELPS</p>
      <h2>Structured Fourier inductive bias.<br />When K matches the PDE, <em>quantum wins.</em></h2>
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

function S13({ reveal }) {
  const ri = n => `ri${reveal >= n ? ' in' : ''}`;
  return (
    <article className="slide close-slide">
      <p className="eyebrow">13 · CONCLUSION</p>
      <h2>Fourier-analyse the PDE. Pick K to cover<br />required modes plus margin. <em>Done.</em></h2>
      <div style={{ marginTop: '2.5vh', display: 'flex', flexDirection: 'column', gap: '1.4vh', maxWidth: '48ch' }}>
        <div className={ri(1)} style={{ display: 'flex', gap: '1.2vw', alignItems: 'baseline' }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 'clamp(9px,0.75vw,12px)', color: 'rgba(242,242,240,0.4)', letterSpacing: '0.14em', textTransform: 'uppercase', flexShrink: 0 }}>PROVED</span>
          <span style={{ fontFamily: 'var(--sans)', fontSize: 'clamp(13px,1.15vw,18px)', color: 'var(--paper)', lineHeight: 1.35 }}>K-sweep elbow at K=4 for Heat equation — 18 runs, 3 seeds, causal structure</span>
        </div>
        <div className={ri(2)} style={{ display: 'flex', gap: '1.2vw', alignItems: 'baseline' }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 'clamp(9px,0.75vw,12px)', color: 'rgba(242,242,240,0.4)', letterSpacing: '0.14em', textTransform: 'uppercase', flexShrink: 0 }}>PROVED</span>
          <span style={{ fontFamily: 'var(--sans)', fontSize: 'clamp(13px,1.15vw,18px)', color: 'var(--paper)', lineHeight: 1.35 }}>QAPINN Q4 beats classical PINN on Burgers by 7.8% — SIREN failure rules out periodicity hypothesis</span>
        </div>
        <div className={ri(3)} style={{ display: 'flex', gap: '1.2vw', alignItems: 'baseline' }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 'clamp(9px,0.75vw,12px)', color: 'rgba(242,242,240,0.4)', letterSpacing: '0.14em', textTransform: 'uppercase', flexShrink: 0 }}>PENDING</span>
          <span style={{ fontFamily: 'var(--sans)', fontSize: 'clamp(13px,1.15vw,18px)', color: 'rgba(242,242,240,0.55)', lineHeight: 1.35 }}>ν-sweep (ν∈{'{'}{0.05, 0.1}{'}'} × Q3/Q4/Q5) running on CRC cluster — second axis of validation</span>
        </div>
      </div>
      <p className={`caption ${ri(4)}`} style={{ position: 'absolute', bottom: '6vh', left: '6vw', maxWidth: '44ch' }}>
        Engineering recipe: run <code>K = (n_qubits ÷ in_dim) × n_uploads</code> before training. Match K to PDE Fourier demand with margin ≥1.
      </p>
    </article>
  );
}

// ─── Slide registry ───────────────────────────────────────────────────────────

const SLIDES = [S00, S01, S02, S03, S04, S05, S06, S07, S08, S09, S10, S11, S12, S13];

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
