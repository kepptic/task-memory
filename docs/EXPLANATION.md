# Why task-memory works the way it does

This is the design rationale — the *why* behind the statuses, the hooks, and the
markdown files. For *what* each piece is, see the [Reference](REFERENCE.md); for
*how it's built*, see [Architecture](ARCHITECTURE.md); to *try it*, see the
[Tutorial](TUTORIAL.md).

## The problem: context is the bottleneck, and it evaporates

An AI coding assistant is only as good as what's in its context window. That
window is finite, and three things routinely empty it:

- **Session end.** You close the terminal; tomorrow's session knows nothing about today's.
- **Compaction.** A long session gets summarized to fit the window. The summary keeps the gist and drops the specifics — the exact file, the gotcha, the reason you rejected approach B.
- **Multimodal decay.** A screenshot, a PDF, a browser result — once it scrolls out of context, it's gone. The model can't re-open what it already saw.

The failure mode is always the same: *"What was I working on? What did I already
learn? What did I try that didn't work?"* When the answer is gone, the assistant
re-researches what it already knew, re-makes decisions it already made, and
repeats failures it already hit. That's the single most expensive thing an AI
assistant does.

You can't make the context window infinite. So task-memory makes the *important
parts* live somewhere the window can't lose them.

## The approach: the file system is the memory

task-memory is built on the [Manus context-engineering
principles](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus).
The core move: treat plain markdown files as external memory, and use Claude Code
hooks to read from and write to that memory at the right moments — without the
model having to remember to.

Five principles, and how each shows up in the product:

1. **File system as memory.** Tasks live in `planning/tasks.md`; synthesized research lives in `planning/notes/TASK-XXX.md`. Markdown, not a database — so it's diffable, greppable, editable by hand, and survives anything that clears the context window.

2. **Recitation.** Before the model implements, the hook re-injects the current task and its progress (SessionStart, UserPromptSubmit). A fresh or compacted session starts *warm*: it's told what it's doing before it does anything.

3. **Keep errors in.** Failures get logged, not hidden. A model that can see "I tried X and it failed with Y" won't try X again. Erasing failures erases the learning.

4. **The 2-Action Rule.** After two research operations, the hook auto-creates a notes skeleton. Research that isn't written down is research you'll redo — so the system forces a capture point before the findings scroll away.

5. **Never repeat failures.** The 3-Strike protocol: diagnose, then change approach, then rethink — never re-run the same failing action. Recovery is the signal of real agentic behavior; thrashing is the opposite.

The division of labor matters: **the hook captures actions; you capture
synthesis.** The hook can log "WebFetch: docs.example.com." It cannot write
"pagination uses a cursor token in the `X-Next` header." The raw log is the
material; the notes file is the distilled output the next session actually reads.

## Why the Stop hook *blocks* instead of reminds

A reminder you can ignore is a reminder you will ignore — especially a model
optimizing to end the turn. So the notes-preservation step isn't advisory; the
Stop hook *blocks* session end when an `in-progress` task you worked on has
incomplete subtasks or an empty notes file.

This is a forcing function, the same shape as a failing test gate: it makes the
right thing structural instead of hoping it happens. "Preserve your work before
you walk away" stops being a discipline you have to remember and becomes a
condition you have to satisfy.

The trade-off is friction, and the design spends real effort buying it back so
the friction only lands when it should:

- **Scoped stamping.** Only tool use that actually touches the task (its file, its notes, paths in its block, its ID in a Task-agent prompt) counts. Ask an unrelated question and the hook won't trap you.
- **Engagement threshold** (`min_engagements_to_block`, default 3). Sessions with fewer than N task-relevant actions never block — fixes "asked one question, can't stop."
- **Sticky release** (`MAX_STOP_BLOCKS` = 2). After two blocks on the same task, the hook gives up rather than loop forever.
- **Escape hatch.** `touch .claude/state/task-memory/off-topic-<session>.flag` disables blocking for the session; the block message prints the exact path.

The bet: a little friction at the *right* moment (work shipped, notes empty) is
worth far more than the cost of losing the research. If the friction lands at the
*wrong* moment, that's a bug in the scoping, not the idea.

## Why `awaiting` and Outcome Branches exist

Most tasks don't end when the action ships — they end when the world responds. An
email needs a reply, a PR needs CI, a vendor needs to decide. Before v3.4.0 these
tasks had nowhere good to sit: leave them `in-progress` and the Stop hook nags
about work that's genuinely done-for-now; flip them to `todo` and you've lied
(`todo` means *not started*, not *started and waiting*).

`awaiting` names that state precisely: *the action shipped; I'm watching, not
driving.* The Stop hook ignores it, so the task parks cleanly.

**Outcome Branches** solve the partner problem: orphaned tasks. The action ships,
the task technically isn't done, and weeks later nobody remembers what "done" was
supposed to look like. Writing `If approved → … / If no signal by <date> → …`
*up front* captures the plan while you still have the context, so future-you (or
a different session) executes instead of re-deriving. The mandatory silence
deadline is the key part — SessionStart resurfaces any `awaiting` task past its
date, so "waiting on someone" can't quietly become "forgotten forever."

## Why state is project-local, and memory is plain files

Two deliberate constraints:

- **Project-local, on your machine.** No cloud, no external calls, no data leaving the box. Your tasks and research are yours; the standalone viewer uses the browser's File System Access API, which requires explicit per-folder permission. The cost: no built-in cross-device sync. The benefit: zero privacy surface and nothing to trust.
- **Markdown, not a binary store.** You can read the memory without the tool, edit it in any editor, diff it in git, and grep it from a script. A task board you can't open without the app is a board you'll abandon. The cost: the format has parser rules ([UI_FORMAT.md](../skills/task-memory/UI_FORMAT.md)); the benefit: the data outlives the tooling.

## Why one artifact installs into both Claude Code and Cowork

Skills and the Python hook are byte-identical across both runtimes —
the only thing that differs is packaging (Claude Code installs from the `kepptic`
marketplace; Cowork sideloads a `.plugin` archive built from the same tree). One
source of truth means a fix or feature lands in both places at once, and there's
no "the Cowork version is behind" drift. The build script strips
`marketplace.json` (Claude-Code-only metadata) so the Cowork validator sees a
clean archive — same contents, runtime-appropriate envelope.

## The throughline

Every design choice serves one goal: make the answer to *"what was I doing, what
did I learn, what's next?"* always available, no matter what cleared the context
window. The files are the memory; the hooks keep them current without you having
to; the Stop gate makes sure the synthesis actually gets written; and `awaiting`
makes sure work that's waiting on the world doesn't get lost. Completeness is
cheap when the marginal cost of writing it down is near zero — so the system
spends that cheapness on never losing the thread.
