# Storyblok Marketing Site: Monorepo vs Outsourcing

## Recommendation: Keep it in the Monorepo

The Storyblok marketing site is not a standalone project—it's an extension of our design system. Outsourcing it creates artificial boundaries that slow us down and risk brand consistency.

## Why Monorepo Hosting is the Right Choice

### Design System Integration

- **Single source of truth** — Design tokens, colors, typography, and spacing are defined once and used everywhere. When the design system updates, the marketing site updates automatically.
- **Guaranteed brand consistency** — Impossible for the site to drift from our visual identity when it's literally using the same components as our other applications.
- **Shared TypeScript configs** — Type safety extends across the entire application. Catch errors at compile time, not in production.
- **No package publishing overhead** — Components update instantly. No npm publish cycles, no waiting for external teams to pull new versions.

### Development Velocity

- **Faster iteration cycles** — Designer requests a change? Developer implements it, merges it, done. No handoff delays, no ticket queues with external vendors.
- **Full stack visibility** — Debugging spans from Storyblok API to rendered React component in one codebase. No "works on my machine" across team boundaries.
- **Unified tooling** — Same ESLint rules, same Prettier config, same testing patterns as the rest of our apps.

### Operational Benefits

- **Full architectural control** — We decide when to upgrade dependencies, how to structure code, what patterns to follow.
- **Knowledge stays in-house** — The team that builds this understands our systems deeply. That knowledge compounds over time.
- **No vendor lock-in** — If we need to change direction, we own the code. No contract negotiations, no knowledge transfer periods.

### Strategic Value

The Storyblok integration for the marketing site should remain within our monorepo. The architecture we've built creates tight coupling with our design system by design—this is a feature, not a bug.

## Why Outsourcing Creates Problems

### Coordination Overhead

- **Handoff friction** — Every change requires communication across team boundaries. Meetings, tickets, approvals.
- **Slower feedback loops** — Designer sees an issue, creates a ticket, external team triages, schedules, implements, deploys. Days instead of hours.
- **Misaligned priorities** — External vendor has other clients. Our "urgent" is their "we'll get to it."

### Design System Complexity

- **Version drift risk** — External team pins to a version. Our design system moves forward. Gap widens. Brand consistency erodes.
- **Lost type safety** — Unless they're in our monorepo, they lose the TypeScript integration that catches errors before deployment.

### Long-term Costs

- **Ongoing dependency** — Need a change? Back to the vendor. Every time.
- **Hidden costs** — Coordination time, context switching, review cycles—these don't show up in the contract but they're real.
- **Knowledge leaves** — External team learns our systems, then moves on to other projects. We're back to square one.

## Cons of Monorepo Hosting

- **Requires internal developer bandwidth** — Someone on the team needs to own this. But given the architecture is already built, ongoing maintenance is minimal.
- **Team needs to learn Storyblok patterns** — One-time learning curve. Storyblok's SDK is well-documented and the integration pattern is straightforward.

## Bottom Line

The Storyblok marketing site is not a standalone project—it's an extension of our design system. Outsourcing it creates artificial boundaries that slow us down and risk brand consistency.
