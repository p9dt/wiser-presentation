# Presenter script — SpectralQ

**Deck:** https://wiserbqp.netlify.app/
**25 slides · 86 reveals · 111 keypresses total**
**Target: 12 minutes.** Cuts to reach 8 min are marked `[CUT]`.

Controls: `→`/`Space` advance · `←` back · `F` fullscreen · `N` notes overlay · `Home`/`End` jump.

**The one rule for this talk:** you are not defending a quantum win. You are reporting a
negative result that you predicted, verified, and nearly got wrong. Confidence comes from
the correction, not the outcome. If you sound apologetic about "classical won," the whole
argument collapses. If you sound matter-of-fact, it reads as rigour.

---

## 00 · Title — *WISER × BQP · Global Quantum+AI 2026*
**0 reveals · 20 sec**

> We're SpectralQ. We spent this challenge on one question: when you bolt a quantum circuit
> onto a physics neural network, what actually changes?
>
> We ran it as a controlled ablation — two fluid equations, three seeds each, one machine.
> The short answer is that classical won or tied everywhere. The useful answer is that our
> own theory predicted that in advance, including the one configuration where quantum comes
> closest.

Don't rush off this slide. Let the title sit for a beat.

---

## 01 · Why this matters
**3 reveals · 40 sec**

> Simulating how air and water move is the slowest step in designing almost anything —
> aircraft, turbines, weather forecasts. The bottleneck is the mesh.
>
> `[1]` Physics-informed neural networks promise to replace that mesh with a function you
> can evaluate anywhere.
>
> `[2]` Quantum-assisted versions have already been built and benchmarked — that work exists,
> we cite it.
>
> `[3]` What's missing is a rule that tells you *before* you spend the compute whether one
> will help you. That's the gap.

---

## 02 · The research question
**2 reveals · 30 sec**

> So the question isn't "is quantum faster." Everyone asks that and the answer is always
> "not on a simulator."
>
> `[1]` Ours is: when does the quantum layer change *how the network learns* —
> `[2]` and why. Mechanism, not scoreboard.

---

## 03 · What is a PINN? *(the one slide for non-experts)*
**4 reveals · 55 sec** — the only slide where you slow down for a mixed audience.

> One slide of background, then we're in the results.
>
> `[1]` A normal network learns from labelled examples. A PINN has none.
> `[2]` Instead you feed it random points in space and time,
> `[3]` and you check how badly its output violates the differential equation — using
> automatic differentiation to get the derivatives the equation needs.
> `[4]` That violation *is* the loss. The network is punished for breaking physics, and it
> converges on the solution without ever being shown one.

The line worth landing: **the equation is the training data.**

---

## 04 · What a QAPINN changes
**4 reveals · 40 sec**

> Here's the entire modification.
>
> `[1]` A standard PINN's first layer is a learned matrix multiply.
> `[2]` We replace that one layer with a variational quantum circuit.
> `[3]` Everything downstream is byte-identical — same hidden width, same depth, same
> optimiser, same seeds, same training budget.
> `[4]` That's what makes this an ablation and not a benchmark. Any difference has exactly
> one possible cause.

---

## 05 · Architecture — what the network actually does
**4 reveals · 80 sec** — the densest slide. Walk the diagram, don't read it.

> Left to right. Two numbers go in — position and time, normalised.
>
> `[1]` The classical model multiplies by a learned 2-by-20 matrix and squashes with tanh.
> Sixty parameters.
>
> `[2]` The quantum model instead rotates four qubits by angles proportional to x and t,
> applies learned rotations, entangles them with a CNOT ring, re-uploads the input, rotates
> again — then reads one Pauli-Z expectation per qubit. Twenty-four parameters, four numbers out.
>
> `[3]` Everything right of the second dashed line is identical in both models.
>
> `[4]` And now the part that matters for cost. The PDE residual needs a *second* derivative
> of the output, so autograd has to run back through that circuit twice, every single step.
> That dashed return path is where our twenty-times slowdown comes from. It isn't the circuit
> being big. It's differentiating through it, twice, forever.

If you're over time, this is the slide to compress — but never cut beat `[4]`. It's the
explanation for the cost number that appears four slides later.

---

## 06 · The five experiments
**4 reveals · 60 sec**

> Here's the whole experimental design on one slide.
>
> `[1]` Two PDEs, picked to sit at opposite ends of one axis. Heat is smooth — its exact
> solution has exactly two spatial modes. Burgers forms a shock, so it's broadband.
>
> `[2]` E1 and E2 ask whether the quantum layer helps on each.
> `[3]` E3 is the control: is any effect we see actually *quantum*, or would periodic
> activations give you the same thing? That's SIREN.
> `[4]` E4 and E5 ask whether the bandwidth formula predicts behaviour at all.
>
> Every cell is three seeds on one machine. And I'll say this now rather than bury it: two of
> these verdicts are revisions. We had a Burgers win and a SIREN conclusion that did not
> survive a fair training budget.

That last sentence is a promise. Slide 16 pays it off.

---

## 07 · The answer, up front
**3 reveals · 45 sec**

> I'll give you the conclusion now and spend the rest of the talk earning it.
>
> `[1]` There's one number — the bandwidth K — that you can compute before training, and it
> tells you what the circuit is capable of representing.
>
> `[2]` It does *not* predict an advantage. There wasn't one. Classical won or tied in every
> configuration we tested.
>
> `[3]` At roughly twenty times the compute. The rest of the talk is why that happens, and
> why it's still a useful result.

Say "there wasn't one" flatly. No hedge, no wince.

---

## 08 · Why — the mechanism *(not ours)*
**4 reveals · 50 sec**

> Credit where it's due: this is Schuld, Sweke and Meyer, Physical Review A, 2021. Established
> theory. Not our contribution.
>
> `[1]` When a circuit encodes an input through rotation gates, its output as a function of
> that input is *exactly* a truncated Fourier series.
> `[2]` The set of frequencies in that series is fixed the moment you choose the architecture.
> `[3]` Training only rescales the coefficients.
> `[4]` It can never add a frequency that isn't already there. That's a theorem, not a
> tendency — and it's the reason this whole project is answerable rather than empirical.

---

## 09 · How to compute the ceiling
**3 reveals · 40 sec**

> The formula is small enough to do in your head.
>
> `[1]` K equals qubits divided by input dimension, times the number of data uploads.
> `[2]` Re-uploading is the lever. Angle encoding gives you one upload no matter how deep you
> stack.
> `[3]` So adding layers without re-uploading buys you parameters, not bandwidth. That's the
> single most common way to waste qubits on this architecture.

---

## 10 · We measured the ceiling — it is really there
**3 reveals · 45 sec**

> This is a measurement, not a claim.
>
> `[1]` We swept one input across a full period and took a discrete Fourier transform of the
> untrained layer's output.
> `[2]` Magnitude is exactly zero past the predicted K. All three configurations.
> `[3]` Note the amplitude decay too — the top mode is representable but *weak*. That's why
> you want margin, not exactly enough bandwidth.

---

## 11 · Testbed 1 — the heat equation
**3 reveals · 35 sec**

> `[1]` Heat is our clean testbed because the exact solution is known in closed form.
> `[2]` Which means the required modes are known: k equals 1 and k equals 4.
> `[3]` So we get a falsifiable prediction instead of a benchmark. If bandwidth theory is
> right, something should happen at K=4.

---

## 12 · Method — 18 runs, and a flaw we found in our own design
**4 reveals · 55 sec**

> `[1]` Six bandwidths, three seeds each — eighteen runs.
> `[2]` And here's a flaw in our own experiment that we found during validation.
> `[3]` Look at the qubit column. The ladder alternates two and four qubits as K goes up.
> `[4]` So K and register width were varied together. We confounded the two.
>
> We can still separate them, and the next slide does — but I'd rather you hear it from me
> than find it in the code.

Deliver this as a finding, not a confession. Reviewers reward teams who audit themselves.

---

## 13 · Result 1 — split the sweep and the mechanism appears
**4 reveals · 70 sec** — one of the two most important slides.

> Two things here, and I want both on the record.
>
> `[1]` The honest problem first: every four-qubit run beats nearly every two-qubit run. So
> the dramatic step from K=3 to K=4 is *also* a two-to-four qubit step. We cannot attribute
> it to bandwidth.
>
> `[2]` Now the clean result. Hold qubits fixed at four and vary K alone.
> `[3]` K=2 gives 0.024. K=4 gives 0.012. K=8 gives 0.016.
> `[4]` Minimum exactly at K=4 — which is the highest mode in the target — and then the
> slight rise at K=8 that capacity theory predicts, because you've added expressiveness the
> problem doesn't need.
>
> That's the mechanism, uncontaminated.

Say both halves. The clean slice is only convincing *because* you disclosed the confound.

---

## 14 · Testbed 2 — Burgers, the hard case
**2 reveals · 30 sec**

> `[1]` Burgers is nonlinear and forms a shock, so it has detail at every scale — broadband.
> `[2]` No closed form, so no clean frequency prediction. This is where a bandwidth limit
> should hurt, and it's the honest stress test.

---

## 15 · Result 2 — on the hard problem, classical wins clearly
**4 reveals · 50 sec**

> `[1]` Classical is 3.1 times more accurate.
> `[2]` And with three seeds this one is statistically solid — t equals 4.8.
> `[3]` Now look at SIREN. At a fair training budget it matches the quantum models.
> `[4]` That reverses a control conclusion we had earlier, and I'll come back to it.

---

## 16 · The result we almost reported
**4 reveals · 75 sec** — **the emotional centre of the talk. Give it room.**

> If you ask me what we actually learned, it's this slide.
>
> `[1]` We had a 7.8 percent quantum win on Burgers. It was in our draft.
>
> `[2]` It was an artifact of stopping L-BFGS at 500 iterations. Training was still descending
> when we cut it off.
>
> `[3]` Look at the curve — that vertical drop at the end is the L-BFGS phase. The classical
> model gains most from it, because it had the most headroom left. So the early cutoff
> penalised the model that was going to win.
>
> `[4]` Our own report had flagged this as a limitation before we tested it. We tested it, the
> classical error dropped twelve-fold, and the win evaporated.
>
> Most teams would have shipped the win.

Pause after the last line. Don't fill the silence.

---

## 17 · The full scoreboard — including the rows we lose
**5 reveals · 60 sec**

> `[1]` Heat is a statistical tie. I want to be precise: tied, not a quantum win and not a
> quantum loss. t equals 1.05.
> `[2]` Burgers, classical wins clearly.
> `[3]` Cost is roughly twenty times, measured on identical hardware — that's the autograd
> path from slide 5.
> `[4]` Parameter count favours quantum, 27 percent fewer.
> `[5]` And memory and out-of-domain generalisation we did not measure. So we don't claim
> anything about them.

---

## 18 · The finding we weren't looking for
**3 reveals · 50 sec**

> This one surprised us.
>
> `[1]` Classical Burgers lands within 0.7 percent across three seeds.
> `[2]` The quantum models vary between 24 and 82 percent.
> `[3]` That multiplies the cost problem. Every quantum number needs several seeds before it
> means anything — on top of already being twenty times slower per run. If you're planning a
> QAPINN study, budget for that.

---

## 19 · Explainability — how the two models differ
**3 reveals · 55 sec**

> `[1]` Our capacity probe says the quantum model is a structurally *simpler* function class —
> 3.2 times lower complexity, 27 percent fewer parameters.
> `[2]` And it reaches comparable accuracy on heat *with* that simpler class.
> `[3]` So the layer constrains rather than expands — which is exactly what the Fourier
> theorem says it should do. The theory and the measurement agree.
>
> The honest limit: both of these probes are indirect. We're inferring, not proving.

---

## 20 · The honest answer — when it helps, when it doesn't
**4 reveals · 75 sec** — **the intellectual centre. Slowest delivery in the deck.**

> This is the thesis.
>
> `[1]` The quantum layer replaces a free learned map with a fixed, band-limited basis. That
> is a *restriction*.
>
> `[2]` A restriction can only pay off if it matches your problem better than the thing it
> replaced. When the target fits inside K, we get parity.
> `[3]` When it doesn't, we lose.
> `[4]` And when a band-limited prior is genuinely what you want — SIREN gives you one for a
> twentieth of the cost.
>
> There is no regime in our results where band-limiting wins. That's not a failure to find an
> advantage. It's an explanation for why there wasn't one.

---

## 21 · The recommendation — how to build one of these
**4 reveals · 50 sec**

> If you're going to build one anyway, here's the recipe.
>
> `[1]` Step zero: check whether you need this at all. Genuinely.
> `[2]` Fourier-analyse your target to find the highest mode that matters.
> `[3]` Pick K with margin — remember the amplitude decay from slide 10.
> `[4]` And buy K with re-uploads before qubits. But know that qubit count also sets your
> output width, so it's doing two jobs and you can't tune it freely.

---

## 22 · Limitations
**4 reveals · 45 sec**

> Stated before anyone has to ask.
>
> `[1]` Simulator only — no hardware, so no noise, no decoherence.
> `[2]` Two to five qubits, two 1-D PDEs. Small.
> `[3]` One readout scheme. And our single probability-readout run *halved* the heat error —
> so that axis clearly matters and we didn't explore it.
> `[4]` And the K-sweep confounds bandwidth with register width, as I showed on slide 12.

---

## 23 · Future work
**4 reveals · 40 sec**

> Four experiments, ordered by how fast each would change our recommendation.
>
> `[1]` De-confound the sweep — fix qubits, vary re-uploading alone, across the full ladder.
> `[2]` Chase the probability readout, since that one run halved the error.
> `[3]` A 2-D PDE, where classical parameter count grows faster than quantum.
> `[4]` And hardware, which changes the cost model entirely.

---

## 24 · Conclusion
**4 reveals · 45 sec**

> `[1]` A quantum layer is a constraint you have to earn. On these problems it wasn't earned.
>
> `[2]` But the formula predicts what the circuit can represent, and we verified that directly
> with a Fourier transform.
> `[3]` It correctly predicts where quantum comes closest — the smooth problem, at matched
> bandwidth.
> `[4]` And we found and corrected a confound that would have handed us a false positive.
>
> That's the result. Thank you.

Stop there. Don't add "happy to take questions" — let the last line land.

---

# Timing

| Segment | Slides | Budget |
|---|---|---|
| Setup — problem, question, background | 00–06 | 4:05 |
| Mechanism — theory and its verification | 07–10 | 3:00 |
| Results — heat, Burgers, the correction | 11–18 | 6:45 |
| Interpretation — thesis and recommendation | 19–24 | 5:10 |

Full read-through is ~19 min at a comfortable pace. **For a 12-minute slot**, compress
slides 03, 09, 11, 14, 21, 23 to a single sentence each. **For 8 minutes**, cut to:
00, 04, 06, 07, 13, 16, 17, 20, 24 — that path still tells a complete story with the
correction intact.

---

# Q&A — the five you will actually get

**"So quantum is useless for PINNs?"**
> Not what we showed. We showed that on two 1-D problems, at 2–5 qubits, on a simulator, a
> band-limited first layer doesn't buy you anything a cheaper classical prior wouldn't. The
> mechanism we verified is real and it generalises; the negative result is scoped to our setup.

**"Your qubit counts are tiny."**
> Agreed, and it's our first limitation. The constraint is the second derivative in the PDE
> residual — autograd has to traverse the circuit twice per step, so cost grows much faster
> than circuit width suggests. That's the honest reason, not a lack of ambition.

**"Why should we trust the fixed-qubit slice if the full sweep is confounded?"**
> Because the slice holds the confounding variable constant by construction. Same four qubits
> at K=2, 4 and 8 — the only thing changing is re-uploading depth. That's three points, which
> is thin, and I'd want the full de-confounded ladder before I'd call it settled. It's the
> first item in our future work.

**"How do you know the classical baseline is trained enough *now*?"**
> We ran L-BFGS to 5000 iterations with a gradient tolerance of 1e-9, which is where it stops
> improving rather than where we ran out of patience. And both models get the identical budget
> from one config per PDE — that was the specific fix for the bug on slide 16.

**"The literature reports quantum advantages. Why don't you?"**
> Mostly training budget. A QAPINN converges in fewer iterations, so if you fix the iteration
> count both models get, you hand the quantum model an advantage the classical one hasn't been
> given the chance to close. That's precisely the error we made and caught. We're not claiming
> published results are wrong — we're saying this comparison is very easy to get wrong, and we
> have a worked example of getting it wrong ourselves.

---

*Notes are also embedded in the deck — press `N` during the talk.*
