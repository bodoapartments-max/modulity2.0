# Modulity 2.0 — Billing & Entitlement Model

This document defines how billing, plans, subscriptions and entitlements are modeled so payment is a replaceable subsystem.

---

## 1. Golden Rules

1. **Payment is replaceable.** Do not hard-code a specific payment provider into Core.
2. **Do not hard-code prices.** Prices live in configuration or provider data, not source code.
3. **Core asks capability questions**, not plan-name questions.
4. **Personal and organization entitlements are separable.**
5. **Default limits are configuration**, not permanent business logic.

---

## 2. Capability Questions

Core code should ask questions such as:

```ts
canUse('connections');
canUse('advanced-reports');
canUse('external-sharing');
canUse('automation');
canUse('external-agent-api');
canUse('module-pack:office');
canUse('agent:module-designer');
```

Not:

```ts
planName === 'business';
userCount > 5 && plan === 'pro';
```

The entitlement resolver answers these questions based on the active subscription, plan and current usage.

---

## 3. Plan

A Plan defines a set of capabilities and limits.

```json
{
  "planId": "plan:personal-basic",
  "name": "Personal Basic",
  "scope": "personal",
  "capabilities": {
    "modules": { "limit": null },
    "records": { "limit": 100 },
    "connections": { "limit": 0 },
    "external-sharing": { "limit": 0 },
    "advanced-reports": { "enabled": false },
    "automation": { "enabled": false },
    "external-agent-api": { "enabled": false },
    "agents": { "enabled": false }
  },
  "isDefault": true
}
```

Plan fields:

- `planId` — immutable internal ID
- `name` — human-readable name
- `scope` — `personal` or `organization`
- `capabilities` — map of capability names to `{ enabled, limit }`
- `prices` — optional provider-specific price references (NOT hard-coded amounts)
- `isDefault` — whether this plan is assigned automatically

---

## 4. Subscription

A Subscription links an account or organization to a plan.

```json
{
  "subscriptionId": "sub:<uuid>",
  "scope": "organization",
  "organizationId": "org:<uuid>",
  "planId": "plan:team-0-5",
  "status": "active",
  "currentPeriodStart": "2026-10-01T00:00:00.000Z",
  "currentPeriodEnd": "2026-10-31T23:59:59.999Z",
  "billingProviderRef": "stripe-subscription-id",
  "metadata": {}
}
```

Subscription statuses:

- `trialing`
- `active`
- `past_due`
- `canceled`
- `paused`
- `expired`

---

## 5. Entitlement

Entitlement resolves the effective capabilities for a given actor (user or organization) at runtime.

```json
{
  "capability": "connections",
  "enabled": true,
  "limit": 5,
  "used": 2,
  "remaining": 3,
  "source": "subscription",
  "subscriptionId": "sub:<uuid>"
}
```

Entitlement resolution order:

1. Load active subscription for the actor.
2. Load plan capabilities.
3. Apply usage counters where applicable.
4. Apply overrides from admin/billing-provider metadata.
5. Return effective `enabled` / `limit` / `used` / `remaining`.

---

## 6. Usage Counters

Usage counters track consumption of limited capabilities.

Examples:

- Number of members in an organization
- Number of external connections
- Number of external API calls in a period
- Number of agent executions

Counters are updated when the relevant action succeeds, never from client values.

---

## 7. Billing Provider Adapter

The Billing Provider Adapter abstracts the payment provider.

```ts
interface BillingProvider {
  name: string;
  createSubscription(planId, customerRef, metadata): Promise<SubscriptionResult>;
  syncSubscription(subscriptionId): Promise<Subscription>;
  cancelSubscription(subscriptionId): Promise<void>;
  getInvoices(subscriptionId): Promise<Invoice[]>;
  handleWebhook(payload, signature): Promise<BillingEvent[]>;
}
```

Examples:

- `stripe-adapter`
- `paddle-adapter`
- `manual-adapter` (for enterprise / offline billing)

Changing billing provider must not require changes to Core business logic beyond the adapter and plan configuration.

---

## 8. Default Development Configuration

During development and testing, use a configurable default connection limit of:

```
MAX_CONNECTIONS = 5
```

This value is loaded from environment/configuration, not hard-coded.

---

## 9. Entitlement Enforcement Points

Entitlement checks happen:

- When inviting a member (member count limit)
- When enabling external sharing
- When enabling external agent API
- When running an agent
- When creating a report with advanced features
- When activating a paid module pack
- When exceeding a usage counter

UI may show upsell, but enforcement is server-side.

---

## 10. Pricing Strategy (Non-Binding Examples)

These examples are for illustration only and must not be hard-coded:

| Organization Size | Approximate Monthly Price |
| ----------------- | ------------------------- |
| 0–5 employees     | ~ EUR 20                  |
| 6–15 employees    | ~ EUR 30                  |
| 16–50 employees   | ~ EUR 50                  |
| 50+ employees     | ~ EUR 150                 |

Actual prices and plan definitions are configured in the billing provider or configuration data, not in source code.

---

## 11. Personal vs Organization

A user may have:

- Personal entitlements (free or paid)
- Organization-derived entitlements (through memberships)

Effective entitlement for an action considers both scopes and applies the most permissive applicable grant where allowed, or the organization grant when acting on organization data.

---

## 12. Audit

Billing events produce audit events:

- `subscription.created`
- `subscription.updated`
- `subscription.canceled`
- `entitlement.exceeded`
- `entitlement.granted`
