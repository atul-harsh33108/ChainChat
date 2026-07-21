# ChainChat — Product Pitch

*A plain-language introduction. No technical background needed.*

---

## In One Sentence

ChainChat lets a team build, save, share, and reuse multi-step AI instructions — the same
way you'd build and share a document in Notion — instead of retyping the same prompts into
ChatGPT over and over.

---

## The Problem

Most people use AI chat tools one message at a time. That works for quick questions, but
it breaks down the moment your work has real *steps*. Think about a task like:

> "Take these customer reviews → summarize the complaints → group them by theme →
> draft a polite reply for each theme → format it as a report."

Today, people handle this by:

- **Retyping the same long prompts** every single time.
- **Copy-pasting** the output of one step into the next, by hand, again and again.
- **Keeping their best prompts in a private notes file** that nobody else on the team can
  find or improve.
- **Reinventing the wheel** because a colleague already solved the same problem last week —
  but their work lived in a chat window that's now gone.

So the knowledge is trapped, the process is manual, and the results are inconsistent
depending on who ran it. AI is powerful, but the *workflow around it* is stuck in the
copy-paste era.

---

## The Solution

ChainChat turns a sequence of AI steps into a **reusable, shareable workflow**.

You build the steps once on a visual canvas — like drawing a flowchart. Each box is one
instruction to the AI. You connect the boxes to say "do this, then feed the result into
that." Save it, and now:

- **Anyone on your team can run it** by just filling in the inputs and pressing go.
- **You can share it** so others can use it as-is, or **remix it** (make their own copy and
  tweak it) — just like duplicating a doc.
- **The AI passes results between steps automatically** — no more manual copy-paste.
- **Every run is saved**, so you can see exactly what the AI produced at each step.

Think of it as **"Google Docs meets a factory assembly line for AI."** You design the
line once, and everyone can press the button.

---

## Who It's For

- **Marketing teams** building repeatable content pipelines (research → draft → edit →
  format).
- **Support teams** turning messy tickets into summaries and drafted replies.
- **Operations and analysts** who run the same "clean up → analyze → report" routine
  weekly.
- **Any small team** that has found a great way to use AI and wants everyone to benefit
  from it, not just the one person who figured it out.

It's priced as a simple team plan (target: **$12/month per team**), sitting in the gap
between a collaborative doc tool (Notion) and a single-turn chatbot (ChatGPT).

---

## How It Works (in everyday terms)

Here's the journey, start to finish, without jargon:

1. **You sign in.** ChainChat knows who you are and which team workspace you belong to.
2. **You open the builder.** It's a blank canvas. You drag in "steps" — each step is one
   instruction for the AI (for example, *"Summarize the text below in 3 bullet points"*).
3. **You connect the steps** in order. The canvas understands that step 2 can't start
   until step 1 finishes, and it automatically hands step 1's answer to step 2.
4. **You save it as a workflow.** Now it's a reusable recipe your whole team can see.
5. **Someone runs it.** They provide the starting input (say, a block of customer
   reviews) and press go.
6. **The engine does the work.** Behind the scenes, ChainChat figures out the correct
   order of steps, sends each instruction to a real AI model, and passes each answer
   forward to the next step. If a step hiccups, it automatically tries again. You can
   cancel a run midway if you change your mind.
7. **You watch it happen live.** The screen updates as each step completes, and every
   result is stored so you can review or reuse it later.

That's the core loop: **build a recipe once, run it any time, share it with everyone.**

### A quick picture

```
   Your input                 The workflow you built
  (e.g. reviews)        ┌────────┐   ┌────────┐   ┌────────┐
        ─────────────▶  │ Step 1 │─▶ │ Step 2 │─▶ │ Step 3 │ ─────────▶  Final result
                        │ summarize│  │ group  │   │ draft  │             (saved & shareable)
                        └────────┘   └────────┘   └────────┘
                             The AI carries each answer to the next step for you
```

---

## What Makes It Different

| The old way (plain ChatGPT) | The ChainChat way |
|---|---|
| Retype prompts every time | Build the steps once, reuse forever |
| Copy-paste between steps by hand | Results flow between steps automatically |
| Your best prompts stay private | Share and remix workflows across the team |
| No record of what happened | Every run is saved step by step |
| Results vary by who ran it | Everyone runs the same reliable recipe |

---

## Where the Product Is Today (honest status)

ChainChat is a working early-stage product (an MVP), not a finished commercial release.
Being upfront about that:

- **What works well today:** building and saving workflows, organizing and versioning
  them, copying/remixing them, and the core engine that actually runs the steps in order
  and calls a real AI model with automatic retries and live progress.
- **What's still being built:** full team accounts and invitations, automatic email
  notifications, the billing/subscription flow, and connecting the "Run" button in the
  visual builder all the way through to the engine. Some of these currently use
  stand-in/placeholder behavior.

In short: the **engine and the workflow-building experience are real**; the surrounding
"turn it into a polished paid team product" pieces are in progress. For the technical
details behind this status, see [HOW-IT-WORKS.md](HOW-IT-WORKS.md).

---

## The Vision

Every team has a handful of people who are great at getting AI to do useful work. Their
know-how usually disappears into private chat histories. ChainChat's goal is to make that
know-how a **shared, reusable team asset** — so the whole team levels up, not just the
early adopters. Build the smart workflow once, and let everyone press go.
