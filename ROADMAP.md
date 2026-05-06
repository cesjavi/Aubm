# Aubm Roadmap

This document outlines the strategic evolution of Aubm, moving from a robust orchestration core to an enterprise-ready multi-agent operating layer.

## Phase 1: Core Foundation (Completed)
- [x] Autonomous Agent Execution: Multi-provider support (OpenAI, Groq, Gemini, etc.).
- [x] Project Orchestration: Intelligent task scheduling and dependency management (DAG).
- [x] Human-in-the-Loop: Approval and rejection workflows for agent outputs.
- [x] Semantic RAG: Contextual memory injection across project tasks.
- [x] Real-time Logs: Streaming agent thoughts and actions via SSE.
- [x] Cost Control: Token-based budgeting and execution blocking.

## Phase 2: Advanced Collaboration and Tools (Completed)
- [x] Multi-Agent Debates: Allow agents to cross-verify each other's outputs before human review.
- [x] Extended Toolbelt:
  - [x] Web Browser Tool (via Playwright) for live data fetching.
  - [x] Code Sandbox for executing and testing generated snippets.
  - [x] File Generation (Excel, Word, and advanced PDF layouts).
- [x] Collaborative Editing: Real-time collaborative output refining for humans.
- [x] Mobile Experience: Capacitor-based mobile app for project monitoring (initialized).

## Phase 3: Intelligence and Scale (Completed)
- [x] Fine-tuning Loop: Feedback loop (Like/Dislike) implemented for data collection.
- [x] Recursive Project Decomposition: Agents that can spawn sub-tasks and manage them.
- [x] Enterprise Security:
  - [x] SSO Integration (Google, GitHub via Supabase).
  - [x] Advanced RLS for granular team permissions.
  - [x] Audit logs for every LLM interaction.
- [x] Agent Marketplace: Community-driven agent templates and specialized skill sets.

## Phase 4: Autonomy and Beyond (Completed)
- [x] Self-Healing Infrastructure: Agents that can monitor health and apply safe patches.
- [x] Voice Interaction: Control navigation and hear project/task status updates via browser voice APIs.
- [x] VR/AR Dashboard: Spatial DAG viewer scaffold for layered project/task visualization.

## Phase 5: Production Operations (Completed)
- [x] Operations Monitoring: Backend health summary endpoint and frontend monitoring dashboard with Supabase fallback.
- [x] Deployment Hardening: Dockerized backend/runtime profile and production CORS configuration.
- [x] Error Tracking: Sentry-compatible error reporting hooks for backend and frontend.
- [x] Performance Budgeting: Frontend code splitting and bundle-size targets.

## Phase 6: Distributed Scale and Intelligence (In Progress)
- [x] Recursive Project Decomposition: Agents that can automatically break down goals.
- [x] Numerical Consistency (Semantic Backprop): Enforce absolute figures across tasks.
- [x] Visual Tooling: Integrated support for charts and AI illustrations.
- [x] Vercel Deployment: Monorepo serverless configuration.
- [x] Heuristic Output Guardrails: Prompt hardening, reviewer checks, and final-report filtering for placeholders, unsupported claims, and low-quality sections.
- [ ] Asynchronous Task Queue: Dedicated background workers (`worker.py`).
- [ ] Vectorized Long-term Memory: Cross-project semantic retrieval.
- [ ] Self-Optimizing Agents: Meta-prompting loops based on human feedback.

## Phase 7: Structured Evidence and Entity Integrity (Next)
- [ ] Strict JSON Task Schemas: Enforce structured outputs per task type instead of free-form text.
- [ ] Mandatory `source_url` per Claim: Require evidence links for competitor, pricing, release, benchmark, and market claims.
- [ ] Entity Normalization Layer: Canonicalize entity names, merge aliases, and separate direct competitors from adjacent tools before final reporting.
- [ ] Semantic Deduplication: Collapse equivalent claims written differently across tasks.
- [ ] Evidence-Aware Final Report: Build the final report from normalized entities and validated claims only.

---

*Last updated: May 6, 2026*
