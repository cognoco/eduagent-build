# WI-2948 / WI-2992 independent-review correction

Date: 2026-08-01

This bounded correction changes only the offline evidence contract and its
documentation. It does not invoke staging or production and does not read,
print, persist, rotate, or mutate any credential.

## Red

At landed revision `9cd1e3971f7009c72eab7965592ee1d3d6315bb3`:

```text
$ zsh scratchpad/wi2948-evidence-transport.test.zsh
evidence README retains a dead success-receipt link
exit 1
```

The assertion was obsolete: the final landed delivery contains a valid tracked
success receipt and the README correctly links it.

## Green and mutation proof

With candidate contract SHA-256
`0834401f3274e5477d61850070b17293a687c2a9def68b4e55f6b643e17d725c`:

```text
$ zsh scratchpad/wi2948-evidence-transport.test.zsh
transport canonical pass: exact allowlist and both refusal guards present
transport mutation killed: missing-allowlist
transport mutation killed: missing-backend-guard
transport mutation killed: missing-testing-token-refusal
transport canonical restore pass: exact allowlist and both refusal guards present
WI-2948 evidence transport contract OK
exit 0
```

The contract requires the linked receipt to exist and validates its schema and
stable artifact pointer. Its three synthetic source mutations remove, one at a
time, the exact Doppler allowlist, the required backend-key presence guard, and
the ambient testing-token refusal. Every variant fails the contract.

The installed `@clerk/testing` contract is documented at
`docs/evidence/WI-2948/README.md:165`; separate authorization for any further
hosted proof is documented at `docs/evidence/WI-2948/README.md:190`.

The unchanged wrapper and receipt hashes used by this run were:

```text
dc29b8fd5c5ff389abbbcd4fe87a137d3119be9ed991efcfd32061753f1eadba  scratchpad/wi2948-ramtop-receipt.zsh
eca82eb14a1edb2709477d99bc5067557ac83d4b6a8bc7730f05b07715bbc231  docs/evidence/WI-2948/ramtop-node22-seeded-signin-receipt.json
```
