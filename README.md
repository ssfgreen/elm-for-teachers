# ELM for Teachers: Planning Document

The example documents in [`elm-for-teachers/`](./elm-for-teachers/README.md) are worked examples linked from this planning document, using differentiation and adaptive teaching as the first domain.

## Aims of the project

- To have a well scoped specification for a potential pilot deployment of ELM within schools for teachers.
- To have built an interface for teachers using ELM to support specific "high-value tasks".
- To have curated best practice (as skills), important reference documents (as data context) and common prompts.
- To have tested the agentic version using a standard set of prompts against ELM standard across the suite of available models.
- To have assessed the cost of different agentic behaviour patterns for key tasks.

## What are high-value tasks

- Tasks that teachers are commonly using language models for right now.
- Tasks that have the potential to:
  - Save teachers time.
  - Increase teachers' output quality.
  - Enable teacher professional development.
- Tasks that can plausibly be improved through the curation of skills and data from research and from experts. This means tasks that can be improved with "knowledge" rather than changes in model "capability", and that teachers are "normatively" happy to delegate.

See [`elm-for-teachers/tasks/TASKS-README.md`](./elm-for-teachers/tasks/TASKS-README.md) for how this definition is reflected (and currently only partly covered) in the task list.

## Research Outputs

**TASK LIST** — A prioritised list of high-value tasks.

**PROMPTS** — A suite of real, or realistic, prompts mapped to tasks from documented teacher usage or donated by teachers themselves.

**SKILLS** — A set of skills files that captures "best practice". Example: "How to do differentiation for dyslexia".

**DATA CURATION** — An excel file (task, document, usage, reference, ++?) that is a map to key files a system might use to support teachers with a task.

**USER INTERFACE DESIGN** — A series of user stories and interface designs to enable the deployment of a teacher-first ELM.

**ABLATION STUDY** — A comparison of ELM-basic vs. Education-Agentic-ELM for key tasks with evaluated outputs, ablated across various ELM model options.

## First steps

Go through the data from the first three workshops and create user stories decomposing research and software sub-tasks:

- Agent Harness Canvas
- Task and Data Delegation
- Differentiation Workshop

## Potential workstreams

- Sourcing high-value tasks from literature.
- Sourcing high-value tasks from participants in the Gemini Pilot.
- Sourcing prompts from teachers via the Gemini Pilot.
- Creating an interface for ELM to iterate upon that handles skills and data objects.
