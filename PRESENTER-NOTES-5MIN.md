# 5-minute script — SpectralQ

**9 slides shown · 16 skipped · 56 keypresses · 4:50 with 10 sec spare**

`→` reveals the next item on the current slide.
`Shift + →` jumps to the next slide, ignoring whatever reveals are left.

Skipping is what `Shift + →` is for. Without it, moving from slide 07 to slide 13
costs 25 presses because plain `→` walks every reveal of every slide in between.

**Shown:** 00 · 04 · 06 · 07 · 13 · 16 · 17 · 20 · 24
**Skipped:** 01 02 03 · 05 · 08 09 10 11 12 · 14 15 · 18 19 · 21 22 23

---

## 00 · Title — 15 sec · no reveals

> We're SpectralQ. One question: does replacing a layer of a physics neural network with a
> quantum circuit actually help? We ran it as a controlled ablation — two fluid equations,
> three seeds each. Short answer is no, and we can explain why.

**→→ Press `Shift + →` four times** (past 01, 02, 03) to land on **04**.

---

## 04 · What a QAPINN changes — 25 sec · 4 reveals

> `[1]` A PINN's first layer is a learned matrix multiply.
> `[2]` We replace that one layer with a variational quantum circuit.
> `[3]` Everything downstream is byte-identical — same width, depth, optimiser, seeds,
> training budget.
> `[4]` So this is an ablation, not a benchmark. Any difference has exactly one cause.

**→→ Press `Shift + →` twice** (past 05) to land on **06**.

---

## 06 · The five experiments — 30 sec · 4 reveals

> `[1]` Two PDEs at opposite ends of one axis. Heat is smooth — exactly two spatial modes.
> Burgers forms a shock, so it's broadband.
> `[2]` E1 and E2 ask whether the quantum layer helps on each.
> `[3]` E3 is the control — is the effect actually quantum, or would periodic activations do
> the same thing?
> `[4]` E4 and E5 test whether our bandwidth formula predicts behaviour at all.
>
> Three seeds each, one machine.

**→→ Press `Shift + →` once** to land on **07**.

---

## 07 · The answer, up front — 30 sec · 3 reveals

> Conclusion first, then I'll earn it.
>
> `[1]` One number — the bandwidth K — tells you before training what the circuit can
> represent.
> `[2]` It does not predict an advantage. There wasn't one. Classical won or tied in every
> configuration.
> `[3]` At roughly twenty times the compute.

Say "there wasn't one" flatly. No wince.

**→→ Press `Shift + →` six times** (past 08–12) to land on **13**.

---

## 13 · The mechanism — 45 sec · 4 reveals

> Our bandwidth sweep — and a flaw we found in it.
>
> `[1]` The ladder changes qubit count alongside K, so the big step at K=4 is also a
> two-to-four qubit step. We can't attribute that to bandwidth.
> `[2]` So hold qubits fixed at four and vary K alone.
> `[3]` K=2 gives 0.024. K=4 gives 0.012. K=8 gives 0.016.
> `[4]` Minimum exactly at K=4 — the highest mode in the target — then the rise at K=8 that
> capacity theory predicts.
>
> That's the mechanism, uncontaminated.

**→→ Press `Shift + →` three times** (past 14, 15) to land on **16**.

---

## 16 · The result we almost reported — 45 sec · 4 reveals

**The one that wins you the room. Don't rush it.**

> This is what we actually learned.
>
> `[1]` We had a 7.8 percent quantum win on Burgers. It was in our draft.
> `[2]` It was an artifact of stopping L-BFGS at 500 iterations — training was still
> descending.
> `[3]` That vertical drop is the L-BFGS phase. The classical model gains most from it
> because it had the most headroom left, so the early cutoff penalised the model that was
> going to win.
> `[4]` We tested it, classical error dropped twelve-fold, and the win vanished.
>
> Most teams would have shipped the win.

Pause after that line.

**→→ Press `Shift + →` once** to land on **17**.

---

## 17 · The scoreboard — 35 sec · 5 reveals

> `[1]` Heat is a statistical tie — not a win in either direction.
> `[2]` Burgers, classical wins 3.1 times, t equals 4.8.
> `[3]` Cost, twenty times, on identical hardware.
> `[4]` Quantum uses 27 percent fewer parameters.
> `[5]` Memory and out-of-domain generalisation we did not measure, so we don't claim them.

**→→ Press `Shift + →` three times** (past 18, 19) to land on **20**.

---

## 20 · The honest answer — 40 sec · 4 reveals

> The thesis.
>
> `[1]` The quantum layer replaces a free learned map with a fixed band-limited basis. That
> is a restriction.
> `[2]` A restriction only pays off if it fits your problem better than what it replaced.
> Target inside K, we get parity.
> `[3]` Outside it, we lose.
> `[4]` And if a band-limited prior is genuinely what you want, SIREN gives you one for a
> twentieth of the cost.
>
> There's no regime in our results where band-limiting wins.

**→→ Press `Shift + →` four times** (past 21, 22, 23) to land on **24**.

---

## 24 · Conclusion — 25 sec · 4 reveals

> `[1]` A quantum layer is a constraint you have to earn. Here, it wasn't.
> `[2]` But the formula predicts what the circuit can represent, and we verified that
> directly.
> `[3]` It correctly predicts where quantum comes closest.
> `[4]` And we caught a confound that would have handed us a false positive.
>
> That's the result. Thank you.

Stop. Don't add "any questions."

---

# Press sheet

| Slide | Talk | Then |
|---|---|---|
| 00 | — | `Shift+→` ×4 |
| 04 | `→` ×4 | `Shift+→` ×2 |
| 06 | `→` ×4 | `Shift+→` ×1 |
| 07 | `→` ×3 | `Shift+→` ×6 |
| 13 | `→` ×4 | `Shift+→` ×3 |
| 16 | `→` ×4 | `Shift+→` ×1 |
| 17 | `→` ×5 | `Shift+→` ×3 |
| 20 | `→` ×4 | `Shift+→` ×4 |
| 24 | `→` ×4 | end |

**32 `→` · 24 `Shift+→` · 56 total.**

---

# What was cut, and why it's safe

| Cut | Why it survives being cut |
|---|---|
| 01, 02 — motivation, research question | Judges already know why CFD matters. Slide 00 carries the question. |
| 03 — what is a PINN | Only needed for a lay audience. Cut for a technical panel; if the room is mixed, restore it and drop slide 06 instead. |
| 05 — architecture deep-dive | Slide 04 states the change. Detail is in the report. |
| 08, 09 — Fourier theorem, K formula | Slide 13 shows the formula working. The theory is Schuld et al., not our contribution. |
| 10 — measured spectrum | Strong evidence, but slide 13 already carries the mechanism. **First slide to restore** if you get 7 minutes. |
| 11, 12 — heat testbed, sweep method | Slide 13 restates what it needs. |
| 14, 15 — Burgers testbed and result | Slide 17 has the 3.1× number. |
| 18 — reproducibility (CV 24–82%) | Genuinely novel, but it's a secondary finding. **Second to restore.** |
| 19 — explainability probes | Both probes are indirect; weakest evidence in the deck. |
| 21, 22, 23 — recommendation, limitations, future work | Limitations belong in Q&A, where they land better as answers. |

**Running long?** Drop slide 06 (saves 30 sec and 5 presses). The story holds without it.
**Running short?** Restore 10, then 18.

---

*Full-length script: PRESENTER-NOTES.md*
