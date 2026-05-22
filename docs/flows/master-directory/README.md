# Master Directory Pages

This directory contains one durable detail page per product flow.

The flow pages are not execution logs. They should stay useful after a revision pass finishes by recording:

- the product meaning of the flow
- which audiences can access it
- whether student and mentor access share behavior or differ by scope
- the canonical entry points and routes
- ownership and privacy rules
- what should happen when the wrong audience deep-links into it
- known bugs, doc drift, and validation limits

Use [`_template.md`](_template.md) for new pages.

## Grouping

| Folder | Flow IDs |
| --- | --- |
| `auth/` | `AUTH-*` |
| `account/` | `ACCOUNT-*` |
| `home/` | `HOME-*`, `SUBJECT-*` when primarily home/setup |
| `learn/` | `LEARN-*`, `PRACTICE-*`, `QUIZ-*`, `DICT-*` |
| `homework/` | `HOMEWORK-*` |
| `billing/` | `BILLING-*` |
| `parent/` | `PARENT-*` |
| `cross-cutting/` | `CC-*` |

## Status Values

| Status | Meaning |
| --- | --- |
| `Not mapped` | Listed in the master register but no deep page exists yet. |
| `Draft` | Initial mapping exists but needs review. |
| `Mapped` | Checked against inventories, navigation contract, and current app routes. |
| `Needs product decision` | Expected audience or scope is ambiguous. |
| `Blocked` | Mapping depends on missing current docs, unavailable route, or unresolved product decision. |
