# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Fixed

- Adapter regression tests now own cancellation and drain the original review before restoring mocks or clocks, preventing a timed-out case from leaving admission occupied for following cases. An isolated actual-Vitest-timeout regression preserves the original failure while checking cancellation, cleanup and same-principal recovery. Product deadlines and runtime behavior are unchanged.

- Development-only closed body capture now applies its 4096-chunk retention limit only to nonempty additions. Empty chunks at the exact limit keep sequence validation and zero-byte accounting without discarding a valid body; the 4097th nonempty chunk is still charged then rejected. Includes a RED/GREEN boundary regression through EOF, parsing and digest comparison; formal issuance and production behavior remain unchanged.

- AU-BR-005 no longer treats indirect use of `current.setAbortAction` as "no abort call". Extracted method references, `.call`/`.apply`/`.bind`, comma-operator calls and destructuring (named, computed or rest) of `current` now mark the abort analysis unresolved, so the review cannot complete as clear. The same rules apply to the development-only BR-006 scope plan, which additionally treats `current` passed to code outside the analyzed body as receiver-unresolved instead of `no_target_call`. Direct `current.setAbortAction(...)` calls and ordinary field reads are unchanged.

### Changed

- WF-B BL-B adds an opt-in, package-excluded synthetic ESM loader and a pinned legacy-driver derivation, preserving every old assertion and the original 19-line semantic rejection contract. All 304 cases retain unique module URLs, same-source binding, sticky stop/failure checks and bounded public-observation digests. Separate scratch-only foreign-reference/copy/Proxy controls check namespace and owner isolation, while an ABBA comparator retains a 60-second limit per child and confirms child-group termination. The old runner and normal route remain unchanged; formal issuance and whole-run admission stay closed/disabled.

- WF-B BL-A adds a package-excluded, value-only 304-case body-live migration ledger and emit-once JS patch boundary. A separately pinned legacy TS-text oracle compares every local AST and unchanged surrounding output; strict owner/member/branch/anchor checks reject drift, literal lookalikes and input hooks. The original runner and fixture remain unchanged: no mutant loader, normal-route switch, body startup, formal issuance or whole-run admission is enabled, and performance/cleanup guarantees remain Unknown.

- WF-B adds package-excluded R-b closed rejection contracts: narrow diagnostic/code types, two literal diagnostic scalars before instance allocations, an identity-first origin leaf independent of healthy state, and fixed primitive refusals with non-allocating root-only diagnosis retention. Synthetic actual-slot, stopped/prior-failure, mixed-origin, no-hook, readonly-source and semantic compile-fail controls keep the original callers unchanged. Start consumption, source writes, terminal handoff/sealing, PC08 admission, G_R/G_A, C-03, body startup and runtime connections remain disconnected; work and cleanup guarantees remain Unknown.

- WF-B adds package-excluded R-b preparation-only private supply and actual-field input boundaries. Identity-first checks qualify the original root/source/start and retain the legacy provenance checker; unused-base, empty-storage and empty-payload checks are minimally extracted in their original calling order. Scratch-compiled actual-slot, mixed-reference, forged-view and semantic-private controls exercise the read-only boundary without an operational caller, returned state writer, new export or registration path. PC08 admission, G_R/G_A, C-03, body startup, runtime connections, formal issuance and whole-run admission remain disconnected; work and cleanup guarantees remain Unknown.

- WF-B adds package-excluded R-a returned-preparation contracts: narrow finite states, dedicated pre/post value checks and four prior root scalars. The new synthetic shell checks only untouched initial ownership and returns fixed primitive refusals without source construction, cache materialization or admission. Independent state/field/shape/position oracles and compiled controls preserve prior diagnostics and legacy entries. Actual returned claims, G_R/G_A, C-03, body startup, runtime connections, formal issuance and whole-run admission remain disconnected; work and cleanup guarantees remain Unknown.

- WF-B adds a package-excluded synthetic-only final-post continuation on the original root/source/start. A fixed marker-and-literal-return group completes only the callee; primitive-only caller classification then preserves the fixed `pin_return_not_connected` upper stop, prior diagnostics and the existing single terminal cache. Actual-slot, lost-return, cleanup-flag, reentry, delivery-failure and semantic compile-fail controls preserve legacy modes. PC08, C-03, source-use claims, body startup, runtime connections, formal issuance and whole-run admission remain closed; unresolved work and cleanup guarantees remain Unknown.

- WF-B adds a package-excluded synthetic-only fresh pin-confirmation entry, reusing the existing fixed construction and a single private terminal cache. Early failures and active close preserve prior diagnostics without premature sealing; only the owning entry's verified outer return permits replay of the same closed diagnostic. Prefix/oracle, mixed-source, outer-finally, copied-result, reentry and compiled controls preserve legacy A/B and the C-a allowlisted projection. Final post, accepted return, PC08, C-03, body startup, runtime connections and formal issuance remain disconnected.

- WF-B adds package-excluded synthetic-only final-reply contracts on the existing root: prior narrow state scalars, one-shot diagnostic sealing (including sealed first-none), one privately owned cache and separate delivery failures. Independent prefix/oracle and compiled controls cover no-retry failure custody and closed publication; legacy A/B behavior is retained. Actual public-entry routing, final post, accepted return, PC08, C-03, body startup and formal issuance remain disconnected.

- WF-B adds package-excluded synthetic-only same-owner checked/confirmed transitions and separate intermediate post checks. Fixed synchronous groups preserve original borrows, and a final blocked recheck still returns rejection with the final marker false. Independent prefix, actual-slot/view-forgery, checker-bypass and semantic compile-fail controls retain earlier diagnoses, partial progress and legacy entries. Final post, accepted return, PC08, C-03, body startup and formal issuance remain disconnected.

- WF-B adds package-excluded synthetic-only pin-confirmation preparation: seven narrow value states, a prior same-start final marker, primitive-only caller classification and diagnostic recording before reply allocation. The owning path validates only captured-ready, keeps the marker false and still rejects; later-state and completion positives are value-only. Independent prefix and compiled controls cover original-source qualification, first-reason preservation, invalid positions, reply failure and semantic type rejection. Final post, accepted return, PC08, C-03, body startup and formal issuance remain disconnected.

- WF-B adds a package-excluded synthetic-only source-reference storage continuation. The original root/source/start supplies issued/current borrows through fixed synchronous groups and private actual-reference checks. Only the first already captured mismatching current may enter rejected custody; post-unconfirmed custody, first diagnoses and unresolved responsibilities survive faults, close and reentry. A prior completion scalar distinguishes the normal blocked intermediate result from an unverified captured prefix. Independent prefix tests, real-slot/view-forgery controls and semantic compile-fail cases preserve older entries. Pin confirmation, PC08, C-03, source-use claims, body startup and formal issuance remain disconnected.

- WF-B adds package-excluded synthetic-only pin-storage preparation with narrow ten-variant value contracts and a prior same-start boundary scalar. The owning continuation validates only entry, after-attempt and before-issuance states, then refuses before storing any reference; later-state positives remain value-only. Independent prefix, strict-boundary, checker-sensitivity and semantic compile-fail controls preserve the old call entry and separate caller/receiver diagnoses. Reference storage, PC08, C-03, source-use claims, body startup and formal issuance remain disconnected.

- WF-B adds a package-excluded synthetic-only fixed private pin call and same-owner receiver entry. Direct call-window assignments lead immediately into the fixed callee; separate caller and receiver finally blocks release only busy flags. One-shot trial history, reentry/stop refusal and independent BP03/receiver diagnoses are retained, with a fixed refusal before reference storage. Compiled controls distinguish actual entry from a call counter and preserve older entry behavior. Reference capture, C-03, source-use claims, binding, construction-ready, body startup and formal issuance remain disconnected.

- WF-B adds package-excluded synthetic-only call-window/receiver-busy value contracts, a read-only private bridge and separate BP03 caller/source failure-position mapping. The earlier preparation mode reuses the same root/source/start and preserves earlier diagnoses while rejecting mixed candidates without hooks. That mode still keeps both activity flags false and its active/returned positive cases value-only; it does not dispatch the receiver. Reference storage, claim consumption, body startup and formal issuance remain disconnected.

- WF-B C-02 front adds package-excluded synthetic-only private caller qualification for the original root/source/start, a nonrefundable one-shot start reservation, and pin-specific failure positions. Identity-first rejection, stop-before-duplicate ordering and preflight rechecks preserve generation/preparation diagnoses separately. The fixed continuation intentionally stops before any receiver call; pin storage, source-use claim consumption, binding, construction-ready, body startup and formal issuance remain disconnected.

- WF-B C-01 adds package-excluded synthetic-only pin contracts, prior scalar diagnostics and a closed preparation on the existing unpinned source/start. Read-only provenance, unused-base, empty-storage/payload and phase-specific checks preserve generation diagnoses separately from preparation failures. Thirteen later-state value contracts have independent compiled oracles; they do not populate a receiver or grant authority. Pin attempts/storage, claim consumption, binding, construction-ready, body startup and formal issuance remain disconnected.

- WF-B adds a package-excluded synthetic-only body source issuer on the existing construction root. Prior scalar diagnostics, the same BS shell, fixed BP00/01 hardening and identity-first checks retain partial sources without inspecting unconfirmed fields. Synchronous close records root stop before cached failures and mirrors only the confirmed original source, preserving earlier diagnoses and candidate custody. Independent prefix and compiled controls keep old entries intact; pinning, source-claim consumption, binding, construction-ready, body startup and formal issuance remain disconnected.

- WF-B minimally separates package-excluded BS storage construction from BC data construction. The unchanged seed/live/bundle entries synchronously pass the same retained shell through a two-call private wrapper, preserving checkpoints, failures, models and closed execution. Independent synthetic regressions and compiled event-word, boundary-stop, same-reference and mutation controls add no public entry or source issuer; source generation, pinning, claim consumption, binding, construction-ready and body startup remain disconnected.

- WF-B adds package-excluded synthetic-only body-bind source/receiver contracts, nine empty prior receiver references and primitive diagnostics on the same start. A separate closed preparation checks the untouched initial fields and reports finite projections without minting a source, installing a pin, consuming a claim or borrowing a bundle/draft. Independent fault, close, reentry, field-mutation and semantic compile-fail controls preserve earlier diagnoses and the old seed/live/bundle entries; binding, construction-ready, body startup and formal issuance remain disconnected.

- WF-B adds a package-excluded synthetic-only BC12/13 bundle/draft continuation on the same construction root. Immutable, shallow-frozen aggregates retain the original Initial live slots and run seal without freezing children, transferring custody or granting execution. Independent malformed/child-copy, failure-prefix, all-predecessor and full-post compiled controls preserve partial ownership and earlier diagnoses. Old seed/live entries remain unchanged; binding, construction-ready, body startup, formal issuance and runtime connections stay closed.

- WF-B adds a package-excluded synthetic-only BC06–11 Initial live-slot construction on the existing root, with fixed runtime reference descriptors, writable but strictly initial progress fields, and sealed shapes. Every preceding carrier and the unused suffix are rechecked before each producer and at the final hold. Independent failure-prefix, mixing, compiled mutation and semantic type controls preserve original failure custody and the old BC01–05 seed entry. BC12/13, binding, construction-ready, activation, body startup, formal issuance and runtime connections remain disconnected.

- WF-B adds a package-excluded synthetic-only body-slot seed entry on the existing construction root. A prior shell retains a fixed thirteen-carrier array before generating the same-context origin, throw/cancel sentinels and non-executable route pin; only BC01–05 are populated. Independent partial-prefix, mixing, duplicate-refusal and compiled identity/retention/type controls preserve separate binding/cell owner identities and failed custody. Binding, construction-ready, activation, body startup, formal issuance and runtime connections remain closed.

- WF-B B03-C adds a package-excluded synthetic-only same-target local-retirement continuation after the existing capture/exit guard. Prior live views remain bound to the same immutable control, owner and duty; a retained target latch, actual revoked state and all-post rechecks precede a one-shot body-not-started terminal. Confirmed retirement survives later failures, and post-commit delivery faults never roll back or repeat the duty. Independent prefix, late-boundary, compiled mutation and type controls preserve old A/B behavior; body startup, accepted exit evidence, cleanup claims, formal issuance and runtime connections remain closed.

- WF-B B03-B adds a separate synthetic-only same-start capture-to-exit-guard route. A prior progress cell is privately bound to the unchanged immutable control anchor and existing duty; stable identities, actual constructor/capture history and one-shot settling distinguish not-called, known, unknown and rejected grants without losing earlier diagnoses. Late-grant and identity mutations, independent failure-prefix controls and semantic compile-fail tests keep retirement operations, successful terminals, body startup, formal issuance and runtime connections closed.

- WF-B B03-A adds a package-excluded synthetic-only exit-preparation entry with five prior slots privately bound to the existing start, RunLink and unspent duty. Finite duty progress and separate knowledge/retirement/body value contracts have independent shape and semantic compile-fail controls; live slots remain idle, not-attempted, unobserved and terminal-none. Fixed rejection and explicit value projections preserve partial custody and legacy behavior. No enter, exit attempt, local retirement, successful terminal, body startup, formal issuance or runtime connection is enabled.

- WF-B B-02 adds a separate synthetic-only one-shot enter/grant-capture entry on the same start and RunLink. A fixed issuer retains its reference before return; provisional capture, identity validation, stop/fault prefixes and non-refunded duty obligations have independent synthetic and compiled controls. The grant never becomes active, body startup and formal issuance remain closed, and no revocation, exit record, retirement, Journal supply or runtime connection is performed.

- WF-B B-01 adds synthetic-only execution-state contracts, prior RunLink/exit-duty preparation and one-shot binding to the existing start. A separate fixed-value projection reports retained references only as booleans and preserves closed execution. Independent prefix/state tables, semantic compile-fail cases and compiled identity/projection mutations cover mixing, duplicate preparation and failure retention. Grant issuance, enter/unwind transitions, body startup, accepted exit evidence and runtime connections remain unimplemented.

- WF-B stage A extracts the existing same-start frame wrapper and adds prior private probe cells with one-shot binding to that same start. A separate package-excluded factory checks the probe and seeded legacy routes without starting a body, issuing a grant or consuming a retirement claim. Independent eight-stage prefix tests and compiled cell/receiver/preflight controls preserve legacy synthetic behavior; formal execution, exit evidence, Journal supply and runtime connections remain closed.

- WF-B adds a package-excluded canonical gate construction root: prior gate capture, private same-seed binding through the existing issuer/start/binding, one-shot owner pin binding, and retention of a non-executable continuation draft. Independent 37-stage failure-prefix tests and compiled identity controls reject mixing before downstream guards can mask it. No frame runner, grant issuance, real writer, Journal supply or formal issuance is connected; legacy factories remain compatible.

- WF-B adds an isolated, import-free WriterGate/pin/grant model with one-shot owner binding and frame-grant attempts, fixed reentry refusals, deferred stop, retained partial grants and separate producer/gate diagnostics. Independent event-word and failure-prefix tests plus twenty compiled identity controls exercise the pure state machine. Model-only closure issues no closed evidence; real frames, leaf writers, Journal supply, admission use, packet generation and formal issuance remain disconnected.

- WF-B extracts a development-only values kernel for the fixed holder layout and finite construction-stage relation, preserving the independent synthetic root's brands and ledger. A separate lexical construction root now preallocates empty holders before constructing the existing CaptureAdmissionAssembly and its actual start, then privately binds its canonical scope/epoch/packet descriptor once. Partial-construction prefixes, identity mixing, reentry and retained failures have independent synthetic and compiled controls. The issuer remains unused; writer stop, Journal supply, supply/admission consumption, packet generation and formal issuance stay disconnected.

- WF-B adds an independent, package-excluded synthetic journal-supply construction shell: prior failure/result slots, empty packet/cell holders, a separately branded target descriptor and an unused supply claim. A fixed 34-stage schedule retains captured prefixes and unconfirmed attempts, rejects mixed identities and repeated construction, and defers in-frame close without dropping references. Synthetic and compiled controls do not import or adopt the existing issuer; supply consumption, final anchor issuance, admission use, packet generation and runtime connections remain closed.

- WF-B adds a package-excluded, synthetic-only AbsenceJournal with fixed source/binding writer histories, distinct generation/capture epochs and private one-shot diagnostic binding. Building-slot releases stay provisional until preparation commits; legacy clear checks all eleven slots, and alias/non-mint facts require closed producer paths. Sticky metadata failures preserve producer diagnoses and retained obligations. Independent writer-prefix tests and compiled mutations cover mixing, premature/missing commits, missed clears, stale facts and finite stamps. Admission consumption, packet generation, formal issuance and runtime connections remain closed; real cost/layout coverage remains unknown.

- WF-B adds synthetic-only RootStopAck, TrustedControlPin and one-shot CaptureAdmission issuance through the same private retirement owner. A separate root retirement seal closes normal-use gates without manufacturing close reasons; actual close and source failure diagnoses remain distinct. Strict token/variant checks, provisional retention and fixed failure replies reject mixing and retries. Clear authority remains a non-executable draft; capture, field clear, payload-retirement evidence, root termination and formal admission stay disconnected.

- WF-B adds a synthetic-only retirement-start owner with a private construction/source pin, one-shot claim, fixed field/group diagnostics and a generation-wrapper frame boundary. Requests defer while the frame is active, drain only after its confirmed exit and reject synchronous reentry or mixed ownership without losing prior diagnoses. The new path stops normal use but holds before capture or field clear; proof issuance, root termination, formal admission and runtime connections remain disabled. Existing factories and their tests are retained.

- WF-B adds synthetic-only, one-shot pending-construction/source binding through the existing private composition. Control identity is payload-free and separated from its retirable live cell; owned source capture and per-group retention diagnostics preserve obligations on rejection/close. The prior unbound factory remains a thin compatible entry with its existing tests. Mixing, replay, partial capture and retired-control rejection have independent synthetic and compiled controls. Payload movement, lower-claim consumption, all-alias retirement, proof issuance, root finish and formal admission remain disabled.

- WF-B adds an isolated synthetic unbound-construction factory with a prior RetentionRoot, scoped diagnostic/result slots, one-shot generation claim and four empty pending/failure slots. Fixed mint, uncaptured-attempt and provisional-capture failures retain distinct prefixes; identity mixing, replay, reentry and late-close diagnoses are checked by independent oracles and compiled mutations. Diagnostic sealing does not clear retained slots or imply retirement. Existing source factories are untouched; source binding, payload movement, proof issuance and root finish remain closed.

- WF-B adds a package-excluded, synthetic unused-control boundary. Source gates and the diagnostic owner share one pinned control; a separate private continuation propagates close/failure without clearing payloads or retiring borrows. Explicit anchor/payload relation checks work after stop without consulting live source fields. Value-only fault controls remain distinct from issuance authority. Legacy fixtures stay intact; claim consumption, detach, holder publication, C execution and retirement remain unconnected.

- WF-B adds synthetic-only transfer preflight: a lexical issuer captures the same source owner's issuance anchor and binds an unused, separately branded lower claim to empty pending/holder/failure shells. Fixed refusals preserve source diagnoses and consume no transfer claim; preparation never detaches normal payload slots or publishes a holder. Isolated identity controls, allocation-prefix oracles and compiled mutations preserve legacy factories and package exclusion. C execution, real accounting and formal issuance remain closed or unknown.

- WF-B adds a separate synthetic-only canonical supply diagnostic factory: a module-private continuation binds one C construction's prepared borrow to a pinned source registry, ordered per-file table and non-executing declaration view. One-shot preparation rejects foreign references, equal copies, swapped sources and replay, retains failure diagnoses and clears partial references before borrow retirement. Independent prefix/operation-word oracles and compiled negative controls preserve old B/C-start behavior; transfer claims, C execution, real budgets and formal issuance remain absent or closed.

- WF-B physically colocates the unchanged B kernel and C-start lifecycle in a package-excluded composition fixture. Old entry points remain thin factory re-exports with identical export sets and function identities; C-start still cannot execute the kernel or create supply tables/views. Scratch ESM compilation now resolves the existing pure source-map dependency, preserves all eight declared/actual mutation controls, and separately checks the combined module and compatibility exports.

- WF-B separates immutable legacy declarations from private synthetic source records/handles. A bounded one-attempt source script now supplies actual bytes, metadata changes, interruptions and typed stop signals; the B kernel derives early EOF, excess-byte and metadata diagnoses from declared positions and observed results. Existing scenarios, limits, deadlines and summaries remain unchanged. Independent declaration/actual traces, a 75-case source grid and compiled negative controls add no C execution, source registration, real pinning or issuance authority.

- WF-B mechanically relocates the legacy B read/hash kernel into a package-excluded shared fixture module, leaving its original path as a two-line compatibility factory re-export. The implementation body, fixed scenarios, model, counters, limits and existing expectations remain unchanged. Export/compatibility/C-closed controls introduce no kernel constructor, arbitrary supply registration, canonical adapter or C execution path; issuance, whole-run admission and runtime/core wiring remain closed.

- WF-B snapshot/read preparation adds a separate synthetic-only construction with a prior diagnostic/result owner, preallocated empty cleanup custody, private checked-map borrow and one-shot start claim. Fixed identity/reentry/failure probes retain first diagnoses, forbid origin recreation after failure, and retire borrow references on discard without issuing read or cleanup evidence. The legacy supply and B hash kernel remain unchanged and unconnected; real budgets, pins, row aggregation, core/runtime wiring and formal issuance stay disabled or unknown.

- WF-B read/hash stage B adds synthetic exact-8-MiB success controls (8×1 MiB and 32×256 KiB), last-file excess-byte accounting and pre-open declaration-limit refusals. A separate bounded pure SHA-256 oracle reconstructs the static repeated-byte vectors, while semantic-event/BigInt controls check byte totals, all cleanup reservations and 386/770 success guards without increasing existing caps. Real source pins, snapshot wiring, row aggregation, issuance and whole-run admission remain closed or unknown.

- WF-B read/hash stage B adds a separate synthetic-only owned-scratch SHA-256 assembly with a fixed eight-phase schedule and a 131,524-call guard ceiling. Independent vectors and event/count oracles check received versus successfully hashed prefixes, attempt-bound update reservations, poisoned hash failures, private one-shot candidate acceptance after cleanup/post-guard, and late-stop diagnostics without rewriting committed file observations. Stage A remains unchanged; real pins, source/snapshot wiring, row aggregation, E/S requirements and issuance remain unavailable or closed.

- WF-B read/hash stage A adds an isolated pure ReadOps fake with shared attempt/byte/retry ceilings, fixed logical deadlines, reserved one-attempt cleanup and immutable file/row result slots. Synthetic boundary/fault controls retain first and cleanup diagnoses without resetting budgets; no buffers, hashing, source pins, supply/snapshot wiring or runtime authority are introduced.

- WF-B adds a fixed synthetic-only map supplier and private MapSupplySnapshot bound to the same checked SourceMapDraft/files/rows. Test-only second-set probes reject foreign snapshots, equal copies and version mixing; construction faults retain first diagnoses and retire private references. No real expected values are pinned or hashed, and formal supply/issuance/core paths stay closed.

- WF-B adds synthetic-only strict source-dictionary and SourceMapDraft values with bounded multi-file bindings, role-safe references, retained unimplemented/missing points and unique cost ownership. Detached frozen outputs never perform file/hash verification or establish implementation coverage, E/S requirements or issuance authority; existing carrier/K0/E contracts remain unchanged.

- WF-B adds isolated strict carrier/coverage DATA validation: twenty returnable diagnostic variants, canonical twelve-row bounded correspondence records and detached frozen values. Synthetic labels never establish runtime coverage, acquisition, credit ownership or E/S requirements. Existing K0/E fake and real providers remain separate; seed issuance, core wiring and formal issuance stay closed.

- WF-B adds a pure isolated K0/entry-bootstrap fake with one-shot debit, ordered owner/profile states and fixed refusal carriers. Synthetic capacity boundaries, all 625 four-operation words and fixed build/snapshot/cleanup faults check non-refund accounting and first-diagnostic retention. Its five-unit schedule is fixture-only; K0 remains excluded from abstract work, runtime coverage unknown and all seed/core/real-budget wiring closed.

- WF-B adds a synthetic-only finite bridge-work model: 19 logical slots, 28 fixed recipes and 29 modeled paths yield seed/admit/tail reservation bounds of 102/57/239 abstract units. A separate semantic-event oracle and BigInt capacity controls check the late-return failure bound, unchanged counters and non-refunded prepayment. Outputs remain non-executable and not ready; real bridge coverage, bootstrap/native costs and core wiring remain unknown or disabled.

- WF-B RC-B adds a synthetic-only pure admission calculator for separate 2V logical-tree and 3V+10 structural budgets. Strict pinned-plan projection, checked arithmetic and BigInt/bounded structural controls preserve the original value reserve; the unavailable-variant structural oracle is corrected to 2V+10. Results remain non-executable with bridge work unmodeled; raw/core wiring, formal issuance and whole-run admission stay disabled.

- WF-B RC-A adds a synthetic-only shared value engine with detailed success/failure accounting and an exact legacy API projection. The meter is installed before the first fallible charge; observed zero, unavailable counts and first-failure diagnostics remain distinct. Independent fee-prefix and fixed fault-assembly tests preserve the existing model, schema and v1. Raw-parser/core binding, evidence issuance, body storage and whole-run admission remain disabled.

- WF-B RP-B adds a separate synthetic-only finite-stack JSON syntax route on the same one-copy byte boundary. It rejects malformed grammar, duplicate keys before their values, noncanonical numeric tokens, and fixed-path/cardinality/node/token excesses; it retains only frozen counts and drops its private AST on every outcome. Independent structure, numeric, cap and work controls preserve RP-A and v1. Value-core binding, evidence issuance, body storage, runtime wiring and whole-run admission remain disabled.

- WF-B RP-A adds a synthetic-only raw-byte boundary with strict limit types, separate work counters, pre-copy byte/backing/live admission, intrinsic-only fixed-buffer copying, a bounded UTF-8 prepass and container-aware framing. Hook, buffer-brand, capacity, malformed-byte and retirement controls return only frozen non-executable metadata marked syntax-unchecked. JSON token/value acceptance, evidence issuance, body storage, runtime wiring and whole-run admission remain disabled; v1 is unchanged.

- WF-B adds a development-only strict snapshot value core: ten readonly checkpoint variants, detached/frozen projections, local row/reference/coverage checks, checked count and encoded-size envelopes, and separate synthetic work counters. Independent enum, arithmetic, width and hostile-value controls preserve v1 and existing recorder/Store paths. The core produces no encoded body, evidence, receipt or save authority; formal issuance, whole-run admission and production connections remain closed/unknown.

- WF-B DT-C adds continuous synthetic D_stop/FIFO/D_save/terminal transcripts and independent operation/byte envelopes, including short writes, EINTR, exhausted attempts, partial construction and uncertain cleanup. Test-only notification paths now pre-close Store admission, contain and separately retain one-shot notification throws, continue the other notification, and record the actual recorder state after failed construction. Closed/unknown outcomes never become preservation or process-termination success. Runtime sources, deadlines, formal issuance and whole-run admission are unchanged.

- WF-B DT-B adds a private one-shot recorder terminal slot to the synthetic binding. Requests stay pending through owner/clock/Store intervals and commit only at a fixed safe unwind; the private terminal section closes recorder admission without changing queue entries, four axes or first diagnoses. Pre/post clock uncertainty and lateness stay separate from memory completion, and clock faults after closure cancel Store admission once without blocking cleanup. Synthetic state, reentry, partial-save and cleanup controls do not enable real process termination, manifest issuance or whole-run admission.

- WF-B DT-A pins a strict, immutable evidence/manifest deadline table to the same synthetic run and budget origins. Save, private/public receipt consumption and one-attempt cleanup retain the same internally selected row; expired evidence requests remain sticky and cannot borrow the later manifest window. Legacy standalone deadline pairs remain supported. Independent arithmetic, boundary and binding controls use memory-only dependencies; recorder finalization, manifest issuance, formal issuance and whole-run admission remain disabled.

- WF-B adds immutable per-call Store attempt results while preserving receipt-only `save` compatibility. Pre-create refusal, create failure, acquired-but-unverified content and saved receipts carry their own create/acquisition/close flags, byte reservation and cleanup diagnosis; sticky and reentrant refusals never inherit an earlier call's cleanup. The bound recorder now retains the exact attempt result separately from the Store-wide first reason. Synthetic isolation and fault controls do not enable real storage or change deadlines.

- WF-B SB-B connects the same frozen checkpoint to fixed header bytes, one memory-store save, a module-private receipt consumer and a callback/clock-free acknowledgement section. Existing test-only classes are mechanically colocated behind unchanged re-export paths so no public friend is introduced. FIFO, replay, byte/digest, stop, deadline and saved-but-unacknowledged controls retain queue diagnostics; no filesystem capture, whole-run preservation, formal issuance or runtime connection is enabled.

- WF-B SB-A adds a test-only closed binding assembly with a preallocated owner, module-private one-shot run admission, distinct run/recorder/store/checkpoint brands and irreversible preparation/discard claims. Legacy fakes remain unchanged, and the public references give legacy entry points no child instance to acknowledge. Synthetic mixing, replay, construction, clock and cancellation controls issue no save receipt, perform no Store operations and enable no acknowledgement, formal issuance or whole-run admission.

- WF-B adds a test-only in-memory EvidenceStore contract with fixed artifact slots, exclusive creation, pre-spent claims, bounded short-write/EINTR handling, one-attempt cleanup, same-handle reread SHA-256 verification and private one-shot save receipts. Fault and independent event/digest oracles cover collision, replacement, cancellation, deadlines and receipt mixing without filesystem or network access. Receipts do not establish whole-run preservation or enable formal issuance/admission.

- WF-B adds a test-only pure-fake fixed-recorder model: monotone lifecycle, four independent terminal axes, six one-shot FIFO checkpoint slots and immutable outer deadlines with explicit cleanup/publication reserves. Handwritten timing/axis oracles and replay, cancellation, clock reentry/regression and boundary controls perform no capture, storage, process control or network I/O. Operational values remain unapproved; formal issuance and whole-run admission remain disabled.

- WF-A adds test-only bounded parent observations to `ReviewTestScope`, correlating review calls, worker factory attempts and numeric protocol requests without retaining messages or raw request IDs. A fixed 4096-event limit and sticky incomplete-measurement reasons do not change review outcomes. Independent ready/finish gates verify cancellation, worker termination and admission recovery; runtime code, deadlines and closed issuance remain unchanged.

- OB-03 AC-B adds a separate package-excluded synthetic staging root. The same kernel privately issues a one-shot live terminal-obligation binding, not a closure/cleanup confirmation. The same preparation/bundle, empty shell handle, budget/epoch and existing cleanup custody bind one unpublished pre-commit payload/record. Post-guard revalidation moves that exact record into a private staged slot, detaches standalone preparation slots, then fixed-aborts and clears all record/origin/terminal references. Synthetic and compiled field/origin, allocation, replay and retained-slot controls preserve AC-A and legacy paths. No usable handle, atomic commit, successful seal, normal terminal proof, formal issuance, runtime connection or whole-run admission is enabled.

- OB-03 AC-A adds a separate package-excluded atomic-preparation root. Same-construction owner/empty-shell identities precede DATA inspection; a root-owned one-shot claim moves the unpublished bundle into tracked preparation slots. Existing budget/stop guards, full binding checks, provisional work rejection and fixed first-failure diagnostics lead only to the existing abort and cleanup-only custody. Compiled identity/state/replay/allocation and retained-slot controls preserve the previous FP3 paths. No staged commit record, usable handle, terminal proof, successful seal, formal issuance, runtime connection or whole-run admission is enabled.

- OB-03 FP3-C adds a package-excluded fixed consumer for the same synthetic unpublished bundle. A root-owned one-shot claim moves the sole ready object into a tracked consuming slot before the existing budget/stop checkpoints. Work rejection is provisional until the post checkpoint; a final same-origin/budget/epoch check precedes logical retirement of every payload alias. Cancellation, reentry, invalidation, partial retirement and retained-slot controls preserve diagnostics and cleanup-only custody. The continuation still fixed-aborts: no successful destination/seal, formal issuance, runtime connection or whole-run admission is enabled.

- OB-03 FP3-B adds a package-excluded synthetic unpublished complete bundle, binding the same accepted parts/proof pair, expectation, full-content draft, original rows and prefix values to one owner/budget/epoch. A root-owned one-shot builder tracks partial allocations, detaches standalone source-use slots and validates the private ready graph before fixed abort. Compiled component/foreign-bundle, partial-build, detach and retained-reference controls preserve diagnostics and cleanup custody. Private readiness is not publication: no consumer, successful destination/seal, formal issuance, runtime connection or whole-run admission is enabled.

- OB-03 FP3-A adds a package-excluded synthetic post-only proof issuer. A root-owned claim is spent before validation/allocation; the same parts, owner, accepted receipt and budget/epoch bind one private content/prefix proof pair. Separate pre-issuance and post-issuance validators preserve full component checks without relaxing FP-2's proof-free invariant. Partial issuance and fixed abort clear all proof/origin/marker slots while retaining diagnostics and cleanup custody. Compiled replay, foreign-pair, field, allocation and retained-slot controls do not expose a runtime friend. No complete bundle, ready destination, seal, formal issuance, runtime connection or whole-run admission is enabled.

- OB-03 FP-2 adds a package-excluded synthetic BundlePartsDraft continuation. The same private accepted snapshot supplies the bounded expectation; a comparison-only reprojection, original row/receipt links, D1 full-content draft and prefix candidates remain bound to one pending/owner/budget/epoch. Work/post full-component checks and fixed abort clear every payload slot. Independent DATA expectations, compiled field/origin faults and retained-reference controls preserve the FP-1/legacy paths. No completed bundle, ContentChecked/prefix-relation issuance, seal, runtime connection, formal issuance or whole-run admission is enabled.

- OB-03 FP-1 adds a fresh package-excluded synthetic full-projection receipt continuation. Header/full consumers share the same pre-spent claim and original take receipt; the full receipt stays private, is rechecked after the guard, and is retired by the fixed abort. Cross-path/replay, foreign/copy and retained-payload controls preserve diagnostics and cleanup-only custody. No expectation/bundle generation, seal, runtime connection, formal issuance or whole-run admission is enabled.

- OB-03 D2 adds a fresh package-excluded preparation root with a pre-reserved private destination owner. The same pending/pins/model/header feed D1; post-guard identity, budget and epoch checks alone can issue private ContentChecked and prepare an unpublished destination once. The fixed abort clears all new payload slots before failure custody transfer. Legacy transfers never call D1; no commit, seal, runtime connection, formal issuance or whole-run admission is enabled.

- OB-03 D1 adds a package-excluded, non-executable FullMixedDraft DATA contract and full-field mixed-manifest comparator. Existing per-asset/full-schema and producer limits remain intact; original reviewed bodies, parent omission, worker omission, prefix and trace are checked without ID/hash-only shortcuts or array normalization. Independent oracles and a removed-comparison negative control cover content changes and boundaries. No pending connection, ContentChecked authority, seal, runtime connection or admission is enabled.

- PD-B(C) accepts the private prefix relation only after the transfer post-guard and identity recheck, then retires it through a single fixed, non-returning consumer before the existing abort. Root-owned consumption claims and payload-clear checks cover every relation slot. Temporary compiled-graph fault controls exercise replay, marker/epoch mismatch, cancellation after acceptance and retained-reference refusal without adding a runtime friend or publishing a seal; formal issuance and whole-run admission remain disabled.

- PD-B(B) connects the fixed prefix selector/comparator to the same synthetic pending and private header consumer. A root-owned start claim, token/budget/epoch-bound provisional candidate and post-guard recheck preserve one-shot behavior and stop precedence; all new payload references are cleared before failure custody transfer. Mixed parent-omission tests detect P0/Pp substitution. Post-accepted relations, seals, runtime connections, formal issuance and whole-run admission remain disabled.

- PD-B(A) adds a package-excluded, value-only fixed selector and bounded prefix-array comparison around PD-A. It selects the six verify fields, checks sorted base and canonical header prefixes without sort/dedup rescue, and preserves fixed typed rejection metadata. An independent linear/insertion oracle covers ordering, duplicate errors, optional IDs, versions and limits; no pending connection, claims, relation issuance, destination seal, runtime connection or admission is enabled.

- PD-B's first synthetic-only step binds a private accepted-header receipt to the same one-shot take. The fixed internal consumer checks the original taken identity and accepted projection, spends its claim before validation, and clears header references on invalidation/fixed abort. Payload-clear custody includes the new slots; package leak controls cover the private markers. Prefix comparison, destination seals, runtime connections, formal issuance and whole-run admission remain disabled.

- PD-A adds a package-excluded bounded, value-only ordered-prefix/delta projection. Prefix-local eligibility rejects duplicates and 101–103 intermediate limitations before normalization; separate original-order and sorted-base lanes apply the existing stable dedup, fixed soft/verify delta and first-100 error retention. Independent linear/insertion-order oracles cover parent sequences, truncation and Unicode boundaries, with seeded negative controls. No private binding, accepted-header proof, seal, runtime connection, formal issuance or whole-run admission is enabled.

- NB-03 adds a package-excluded fresh synthetic transfer/cleanup root. A private one-shot take removes the same accepted and completed-content slots into a guarded pending value, then fixed-aborts without publishing a destination seal. A token/budget/epoch-bound logical payload-clear receipt gates transfer of the sole cleanup capsule and immutable failure report to its upper owner, with one-shot final discard and upper-only late cleanup. First diagnostics and unknown obligations survive; production issuance, content comparison, runtime connection and whole-run admission remain disabled.

- NB-02 adds a package-excluded fresh synthetic normal-adoption root. The same NB-01 pins feed the private recovery kernel, post-guard completed-content proof and one-shot accepted/plan adoption ticket; a private same-kernel view separately checks the original window. Foreign generation/ready/cleanup values, duplicate adoption and invalidation fail closed while cleanup responsibilities and first diagnostics survive. No body comparison, destination/finish-expectation seal, runtime connection, formal issuance or whole-run admission is enabled.

- NB-01 adds a package-excluded fresh synthetic normal-supply root. Its private pins-birth receipt and no-argument one-shot move retain the original row/input/outcome references and bind an initially unbound budget shell to that same pins context. Guard stops, reentry and invalidation clear payload without restoring claims, while first diagnostics and committed accounting remain available. Legacy FB-03 identity/accounting is unchanged; accepted adoption, transfer seals, runtime binding, formal issuance and whole-run admission remain disabled.

- FB-03 adds a package-excluded fresh synthetic custody run. A fixed seal/commit moves the same cleanup capsule and immutable failure report to its preallocated upper owner; only its matching one-shot receipt permits local final discard. Upper-only late cleanup preserves unresolved evidence and the sealed report. Stop checkpoints and a bounded count-only fake budget trace retain one identity, original C/G/P and full deadline; no actual work admission, accepted adoption, runtime connection or formal issuance is enabled.

- FB-02 adds a package-excluded fresh synthetic construction joining the same private OB-01 supply, initial topology, kernel role bindings and failure owner. Birth/clear checkpoints and same-sink consumers retain old termination and cleanup independently, preserve unpublished new-frame cleanup after a claim post-guard stop, and never infer a new worker exit or transport quiescence from cleanup/counters. Legacy roots stay unchanged; accepted adoption, real resources, formal issuance and whole-run admission remain disabled.

- FB-01 adds a package-excluded fresh DATA-only construction that allocates failure/custody/upper slots before validating OB-01 input, shares the private construction token, and records the first fixed failure notice once before clearing payload references. Legacy supply and custody APIs remain unchanged through co-located private cores. Missing role evidence stays unknown; no kernel generation, accepted adoption, cleanup execution, formal issuance or whole-run admission is enabled.

- Adds package-excluded synthetic failure/upper owners with four fixed cleanup roles and a single custody selector. Immutable failure reports, one-shot commit receipts and final discard keep unresolved obligations under the upper owner without calling them released. Same-origin evidence, late cleanup, duplicate/foreign handles and reentry are covered by synthetic tests; accepted adoption, runtime cleanup, destination seals and whole-run admission remain disabled.

- OB-01 adds a package-excluded owned mixed-supply constructor with a strict DATA-only contract and a one-shot preparation claim. Parent and original worker omissions derive from one pinned row sequence; one pins construction supplies the exact input/original-outcome references used by private row links. Guard stops, mixed handles, invalid contexts and duplicate preparation fail closed. Legacy entry points remain unchanged; accepted adoption, destination seals, runtime binding and whole-run admission remain disabled.

- OD-A adds a package-excluded, fresh synthetic mixed-slot assembly with separate brands and row/receipt identities. Strict producer/state values and canonical order feed one-shot initial/parent/completed prefix stages; original worker omissions remain distinct from parent omissions retaining reviewed DATA. Mixed handles, duplicate generation/consumption, guard stops and cleanup invalidate pending values without upgrading legacy roots. Accepted/plan adoption, content comparison, candidates, runtime origin and whole-run admission remain disabled.

- OM-C adds a package-excluded fresh synthetic parent-decision owner for reviewed-only capture sequences. Each keep/omit decision is bound to the original private capture and a pinned prefix, claimed once, and consumed only by fixed discard; source/cleanup start and hard stops invalidate held values synchronously. Legacy capture APIs are unchanged. Mixed non-reviewed origins, accepted/plan transfer, finalize, finish jobs and runtime issuance remain disabled.

- OM-A adds a package-excluded, bounded pure parent-omission value model. It derives retained finding counts in canonical row order, preserves original reviewed values separately from whole-result omissions, and reproduces the parent's warning/error-prefix behavior without deduplication. Independent truth tables, fixed-source drift controls and malformed-input tests cover the model; no omission evidence, manifest expansion, finish job or runtime admission is enabled.

- NR-C adds a package-excluded, constructor-only synthetic mixed recovery manifest. Reviewed captures, producer-verified non-reviewed outcomes and original retained inputs are partitioned in canonical selected order and transferred once to the same accepted/plan lifecycle. Zero reviewed results require a private plan-bound empty proof; cancellation, mixed identities and fixed discard paths fail closed. Legacy roots, formal issuance, finish jobs and whole-run admission remain unchanged.

- NR-B adds a package-excluded fresh synthetic issuer with separate metadata, retrieval and analysis claims. Opaque evidence is published only after matching row/input/attempt/job identities and pre/post guards; retrieval needs a same-attempt confirmed synthetic terminal, and analysis uses the correlated original JSON string. Duplicate/mixed/failed reuse is rejected, while late cleanup remains diagnostic-only. No runtime issuance, mixed manifest, retained/parent omission issuer or whole-run admission is enabled.

- NR-A adds package-excluded, bounded non-reviewed value checks with strict state/producer/reason variants. Original worker omissions, parent omission drafts and retained deadlines remain distinct; invalid fields, schema-only unsupported reasons and deleted rows under 0.3 are rejected. Results are immutable data only, with producer/receipt/capture/cleanup provenance explicitly unverified; no evidence issuance, mixed-manifest admission or runtime behavior is enabled.

- CG-B's protected captures can now be bound to the existing synthetic accepted/plan lifecycle through a separate constructor-only root. Private original receipts and canonical order are checked before a one-shot content seal; source/cleanup start, hard stops and fixed discard paths synchronously erase content while preserving cleanup responsibilities and first diagnostics. Legacy roots cannot be upgraded, and no finish comparison, runtime binding, candidate or whole-run admission is enabled.

- CG-B adds a package-excluded, fresh synthetic capture owner. Same-delivery full analysis values are accepted only after context checks and the post guard, retained privately and transferred once to an opaque manifest. Cross-root handles, duplicates, reordered receipts, cancellation and reentry fail closed with scalar-only diagnostics; no runtime capture, finish job, candidate or whole-run admission is enabled.

- CG-A adds package-excluded, value-only full-result shape derivation, logical UTF-8 measurement and bounded strict JSON decoding from the same input string. Duplicate decoded keys, unsafe/rounded numbers and raw surrogate replacement are rejected before full analysis/aggregate schema validation. Full-body limits remain separate from local context limits; no delivery provenance, capture, candidate, runtime transport or whole-run admission is enabled.

- RD-B04 adds a package-excluded, synthetic-only one-shot seal from the same private accepted finish slot. It rechecks pinned data and the live source/frame before publishing an empty, separately branded handle; source/cleanup start, hard stops and fixed accepted discard explicitly erase the sealed expectations. Original accepted ownership remains cleanup-only, legacy roots keep their prior surface, and no finish job, candidate, runtime authority or whole-run admission is enabled.

- RD-B03 adds a package-excluded, synthetic-only recovery finish comparison with one shared two-input projection budget. It checks the fixed manifest, receipt origins, reviewed context, retained timestamps and header facts while preserving required diagnostics and omission limits. Its separately branded result is non-executable and explicitly leaves provenance, original body, full-schema and wire guarantees unverified; no sealing, job or runtime authority is enabled.

- RD-B02 extracts package-excluded scalar predicates for validated rule sets, unchanged release JSON encodings and inclusive finish-time bounds, and reconnects the ordinary synthetic WJ-C checks without moving parsing, guards or ownership. Independent oracles and regressions preserve duplicate-rule and unresolved-receipt rejection; recovery comparison, sealing and runtime authority remain disabled.

- RD-B01 adds package-excluded, separately branded structure-only recovery finish expectation/reply projections with strict variants and shared per-projection depth, array, key, node and character-unit limits. Opaque references are preserved without traversal or authority; original-body, origin, semantic time/set matching, full-schema and wire guarantees remain explicitly unverified. The comparison-result type has no constructor yet. No owner, seal, job, candidate or runtime connection is enabled.

- RA-03-B adds package-excluded fixed discard for synthetic accepted finish contexts. The same-owner accepted slot and private source/new-frame completion receipts are spent once; only both healthy fixed terminal paths permit discard followed by normal close. Missing/mixed confirmations, replay, reentry and guard stops fail without restoring authority, while prior diagnostics remain available. No finish candidate, production capability, real connection or whole-run admission is enabled.

- RA-03-A adds package-excluded synthetic acceptance of the same recovery handoff, issued context and one-shot route claim in one protected section. Consumed slots are never restored; bounded revalidation and comparison complete before a separately branded non-executable accepted handle is published. Live invalidation drops expectations while preserving terminal-only ownership, which blocks normal close until the separate RA-03-B discard path exists. No production issuance, finish execution, runtime connection or whole-run admission is enabled.

- RA-02④-A adds a package-excluded, synthetic-only finish issue slot in the same recovery kernel. A one-shot claim revalidates private pins and the live route, publishes an empty branded handle only after the post guard, and revokes it synchronously on source close, cleanup start or hard stop. Fixed receiver discard also clears issued state. Legacy roots remain unchanged; no RA-03 consumer, production issuance, runtime connection or whole-run admission is enabled.

- RB-D binds the same synthetic recovery plan/handoff once to constructor-pinned values and the live private route. Mixed handles, competing branches, revocation and failed reuse stop while retaining diagnostics; source close and cleanup start invalidate the binding. Bounded value projection retains the original frame and exposes counts only. No finish evidence, real connection or whole-run admission is enabled.

- RB-C adds package-excluded source lifecycle, private post-guard ready origins and a separate monotonic cleanup-start serial to the same synthetic pinned recovery kernel. Worker startup does not start cleanup; source close, cleanup start and hard stop invalidate readiness. Owned cleanup sinks remain diagnostics-only after failure. Legacy/RB-A method and diagnostic types are preserved; no handoff, finish evidence, runtime connection or whole-run admission is enabled.

- RB-B adds a package-excluded pinned synthetic recovery root whose immutable pins and fixed recovery input share the original receipt/source/window/release identities. A separate strict constructor supplies selected rows, retained T_i/U and accounting prefix; caller handles or replacement contexts are rejected. Old fake closure confirmation feeds the existing guarded preparation once, with first-stop diagnostics and fixed discard. Legacy/RB-A APIs remain unchanged; no live route, handoff, finish evidence or real connection is enabled.

- RB-A extracts the package-excluded synthetic recovery lifecycle into a shared fresh-root kernel while retaining the legacy issuer API. A separate descriptor-only finish-recovery facade uses the same guard/claim implementation, mints private references and rejects mixed/copy/legacy bindings, replay and reentrancy. It exposes only the observation/claim/non-executable-consumption prefix: no pin adoption, handoff/route acceptance, finish evidence or real connection is enabled.

- RA-02 preparation adds a package-excluded fresh synthetic finish assembly with separately branded owner binding, one-shot bind/prepare claims and bounded private fixture pins. Foreign/copy/old-issuer bindings, replay, reentrancy and failed reuse stop without restoring pins; diagnostics expose counts only. Existing recovery issuer APIs remain unchanged. No evidence issuer, handoff/live-route adoption, real connection or whole-run admission is enabled.

- RA-01 adds package-excluded, synthetic-only finish-context value projections and comparisons with a separate value-only brand, strict variants and shared node/character limits. Missing fields, mixed references and oversized inputs fail closed. This does not issue evidence, validate live provenance or enable formal issuance, runtime connections or whole-run admission.

- SC2-D seals a package-excluded non-executable recovery plan from the same accepted synthetic generation, immutable selected set and retained T_i/U. One-shot private handoff and authority:none summary branches are exclusive; copies, summary promotion, replay, revocation and mixed owners are rejected. The receiving slot has fixed cleanup-confirmed discard only. No real finish/runtime connection, formal issuance or whole-run admission is enabled.

- SC2-C adds package-excluded one-shot HeldClosure use after verification, synthetic new-frame startup and issuer-bound ready acceptance. A separate cleanup sink is handed out before startup and remains diagnostics-only after hard stop; old cleanup cannot discharge the new frame. Mixing, replay and guard cancellation cannot restart or accept a second ready. No real worker/runtime connection, finish plan, formal issuance or whole-run admission is enabled.

- SC2-B connects required consistency verification to the package-excluded worker-recovery preparation. Its fake event ledger inherits the C/G/P prefix once, bounds parent/metadata retries to four attempts, charges unique chunks (including over-limit bytes) once and keeps payload charges unchanged. Guards, one-shot attempt outcomes and fixed diagnostics reject replay, mixing and revoked owners. No generation startup, real accounting/transport/worker connection, formal issuance or whole-run admission is enabled.

- SC2-A adds package-excluded same-owner closure transfer into private HeldClosure and strict bounded recovery-input validation. It preserves completed outcomes, active receipt identity and retained T_i/U, rejects mixing/replay/reentry and revokes held references on failure. A fixed one-shot discard releases preparation without using the generation proof; normal close cannot conceal held preparation. Synthetic tests and package leak controls cover the boundary. No verify, generation startup, worker/runtime connection, formal issuance or whole-run admission is enabled by this preparation path.

- SR-C1 adds synthetic-only old-worker closure leases and one-shot evidence consumption to the package-excluded recovery issuer. Unstarted, ready-wait, allocated-but-unsent and sent-input origins retain distinct dispositions; only same-origin confirmed termination plus completed cleanup can issue closure evidence, while an unstarted origin requires separate no-generation evidence. Mixing, replay, reentry, cancellation and incomplete closure revoke claims without erasing fixed diagnostics. No new generation, finish route, actual worker/runtime, formal issuance or whole-run admission is enabled.

- SR-B extends the package-excluded synthetic soft-recovery issuer with phase-only same-generation reuse or deferred initial startup, preserved completed results/T_i/U, and deadline-tagged unprocessed assets. A separate fake event oracle checks one logical consistency verify (parent and metadata GETs, at most four physical attempts with existing retries), prefix-preserving C/G/P accounting, pre/post cancellation guards and one-shot non-executable plan consumption. No real budget writer, worker, transport, finish route, formal issuance or whole-run admission is enabled.

- SR-A adds a package-excluded synthetic-only issuer for strict soft-origin variants, pinned owner/budget/release identities and one-shot observation/recovery slots. Pre/post guards reject mixing, replay, mutation and reentry. Soft facts, first hard stop and a one-shot diagnostics-only cleanup snapshot stay separate; a preissued cleanup sink can report after cancellation without restoring recovery authority. Independent guard/origin oracles and package leak controls cover the isolated contract. No generation/finish route, actual cleanup, worker/runtime connection, formal issuance or whole-run admission is enabled.

- WJ-C extends the package-excluded synthetic time owner with same-job finish validation: pinned header/asset manifest, exact per-input timestamps, retained-U/end-time bounds and the independent 60000ms JSON/operator-expiry requirements. Only reviewed-to-result_omitted finalization is allowed; added/missing/duplicate assets and state promotion are refused. An opaque candidate is spent once after synthetic source/worker close confirmation and root closure. Guard/cancellation/cleanup failures revoke it while preserving fixed diagnostics and accepted U. Production worker/runtime, soft recovery, formal issuance and whole-run admission remain unconnected/disabled.

- WJ-B adds a package-excluded synthetic time owner over the unchanged WJ-A issuer. The same input receipt advances U only after guards, and same-job analyze candidates must match target, rule/release context and exact T_i timestamps. Startup/send failures, rejection and omission retain accepted UTC without retaining reusable claims; a fixed discard clears terminal timestamp data. Independent mismatch/transcript oracles and injected guard tests cover stopping and diagnostic retention. No actual worker/runtime connection, finish/E validation, soft recovery, formal issuance or whole-run admission is enabled.

- WJ-A adds a package-excluded, synthetic-only issuer for pinned run/source/time binding, generation/input/job identity claims, one-shot consumption and synchronous revocation. Fixed fake limits and an independent event count cover the isolated lifecycle; pre/post guards refuse mixing, replay, reentry and post-source-close issuance. No actual worker, runtime registry or production source is connected. Package checks include a leak negative control and a no-I/O/clock/worker dependency audit. T_i/U/E result checks, soft-recovery and post-stop partial-finish integration remain deferred; formal issuance and whole-run admission stay disabled.

- CT-B TB-B connects the fixed fake composition's CT-A accepted observation to a one-shot upper-time handoff, using the same private session/source/origin/run/budget identities. Normal source cleanup releases the donor but retains upper UTC until the fixed discard endpoint; run stop/revoke clears both sides synchronously and preserves fixed first-stop diagnostics. Cleanup attempts all fixed release sections even after a handoff guard fails. Includes synthetic transfer/reentry/cancellation tests, unchanged accounting/output regression and a compiled fake-I/O fixture. Worker-job timestamps, production source adoption, formal issuance and whole-run admission remain deferred/disabled.

- CT-B TB-A adds a pure, non-authoritative upper-time scope with pinned identity/start/full-deadline binding, one-shot allocation/observation/transfer/acceptance, fixed discard and synchronous revocation. Pre/post guards retain the first fixed stop reason; mixed/copied handles, reentry and out-of-window UTC are refused. Synthetic tests and a compiled value fixture cover the isolated contract; package checks forbid clock/I/O and runtime-root dependencies. CT-A/session/source integration, worker-job timestamps, formal issuance, whole-run admission and production adoption remain deferred/disabled.

- CT-A connects the fixed fake continuation's consumed projection and exact release acknowledgement to one-shot rows/UTC receipts, the fixed pure comparator and private non-executable candidate acceptance. Empty-200 UTC is retained privately until failure/close, without changing legacy output or adopting the candidate as a Permit. Guards refuse foreign/replayed receipts and candidates and preserve first-stop diagnostics. Unset optional policy fields are omitted only in the comparison value projection; pinned policy and strict input validation stay unchanged. Includes synthetic identity/guard/accounting tests and package dependency/no-clock checks. Upper time/job binding, production source replacement, formal issuance and whole-run admission remain deferred/disabled.

- OU-01 adds a value-only one-shot UTC sampler and binds it to the existing fixed fake-200 continuation after row projection and the retrieval guard. Empty-200 observations now sample once too; measured fake decisions reuse that same UTC without a second legacy read. Pinned start/deadline, pre/post guards, first-stop diagnostics and cleanup are preserved; clock failures, detectable reversal and retry/reentry are refused. Normal source acquisition, non-200 handling, public input/summary, formal issuance and whole-run admission are unchanged. Includes synthetic clock/guard tests and packaged-helper checks; comparison-input and upper-result timestamp integration remain deferred.

- RP-01 binds the existing session deadline getter, construction-time `startedAt` and pinned release policy in a private, one-shot projection on the existing fixed fake-200 continuation. Capture and consumption validate the same session/source/key and original full deadline, refuse remaining-time substitution or changed policy/time, and preserve first-stop diagnostics and cleanup. No public supplier/friend or summary field is added; ordinary source release decisions, formal issuance, whole-run admission and real transport remain unchanged/disabled. Includes synthetic corruption/cancellation tests and declaration-surface packaging checks.

- RC3-D03 adds a one-shot, pre-dispatch configured-binding check in the isolated development source/transcript. A consistent binding mismatch consumes the parent acknowledgement but performs no release GET, receive charge or row projection; only a sealed, non-executable `not_requested` comparison is published. Canonical authentication/parent accounting and final-four reservation cleanup stay with the same owner. Synthetic tests cover replay/mixing, guard stops, cancellation, capacity boundaries and same-binding assertion/conflict decisions. Contradictory issue labels remain invalid input; runtime binding, native/status-only fallback, formal issuance and whole-run admission remain disabled.

- RC3-D02 connects the isolated development source's consumed fixed-200 acknowledgement to the fixed pure comparator, pre/post guards and a one-shot, post-cleanup sealed value summary. Only explicit opt-in adds the frozen non-executable summary; existing fields, C/G/P, final-four reservation return and default profiles remain unchanged. Tests cover identity/replay refusal, post-guard source revocation, malformed-body accounting, cancellation/deadline and unconfirmed cleanup suppression. Native/status-only and binding-mismatch no-request support remain deferred; no runtime source/Permit, formal issuance, whole-run admission or real communication is enabled.

- RC3-D01 adds package-excluded, per-development-root time/policy conditions with private source/context/deadline binding and one-shot handle/run/ready-generation claims. Synthetic tests preserve existing source/transcript summaries, canonical accounting and final-four cleanup, reject foreign identities and reentry, and retain fixed failure reasons. Unsupported native combinations are refused before spending their delivery. No comparison is executed or published; config timestamp caps remain pending, runtime state/admission are isolated, and formal issuance, whole-run admission and real communication remain disabled.

- RC-02 adds deterministic release-value comparison with pinned-start policy date/issue consistency, observation priority and exact limitation ordering. Fixed-table synthetic oracles cover missing/partial/unknown/limited observations, measured/config conflicts (including expired assertions), all five families and deadline boundaries. Results are fresh frozen, non-executable drafts; copied/serialized drafts cannot be accepted as comparison input. Config timestamp length remains pending approval. Existing source/Permit, non-200 fallback, old tests, closed issuance and disabled whole-run admission are unchanged; no real connection or communication is enabled.

- RC-01 adds a descriptor-copied, strict release-comparison value input and readonly, non-executable draft types. Proxy/accessor input is refused without executing traps; fixed observation/timing limits, fresh frozen copies and canonical family values are tested. Catalog/config/result contracts share only the dependency-free family boundary with unchanged matching semantics. Config timestamp length remains pending approval (no new cap or reformatting); policy consistency, release comparison/draft generation and source adoption remain deferred. Legacy tests, formal-issuance closure and disabled whole-run admission are preserved; no Permit or real communication is enabled.

- EF-03B B-02-03 connects injected Response/Streams cancel-only cleanup to the isolated development source. A separate development resource realm reuses the existing same-reader cleanup component without importing native diagnostic friends; private one-shot proofs bind the original attempt/window and are spent even when source guards refuse. Synthetic tests retain HTTP and cleanup diagnostics, bounded joins after cancellation, partial-acquisition uncertainty and immutable late-settlement facts. Legacy real-class tests and entry behavior remain intact. No release fallback/permit, production binding, formal issuance, whole-run admission or real communication is enabled.

- EF-03B B-02-02 connects the isolated development assembly's existing canonical core to its one-shot bootstrap accounting port, final-four reservation and bounded fixed-200 transcript. Synthetic per-user/cached/exchange paths charge dispatch attempts and the same parsed bytes exactly once, keep payload accounting at zero, retain the original deadline/window and release reservations on success, refusal or cancellation. Existing real-class tests stay intact; release admission remains explicitly not evaluated. Includes independent accounting expectations and package-exclusion checks. Native migration, friend removal, formal issuance, whole-run admission and real communication remain disabled/deferred.

- EF-03B B-02-01 extracts strict five-column parent validation and release-row projection into a shared value-only kernel used by the existing source. A separate test-only source lifecycle adds per-run generation claims, readiness, private one-shot acknowledgements, pre/post guards and synchronous revocation to the isolated development assembly. Existing real-class tests remain; development-assembly results do not establish production identity binding. Includes synthetic, compiled-value and offline packaging checks. Accounting/native migration, fake friend removal, formal issuance, whole-run admission and real communication remain deferred/disabled.

- EF-03B B-01 adds a test-only, construction-scoped development root using the shared pure kernel and a fresh canonical core. Private realm brands, one-shot weak registration, local admission and a fixed cleanup sequence are isolated from production session state and its two admission slots. Synthetic tests cover partial failure, cancellation, reentry, unknown cleanup and secret-free sealed summaries while retaining all existing real-class tests. Formal issuance, source/native migration, friend removal and real communication remain disabled/deferred.

- EF-03A extracts fixed construction-resource state, reason normalization/public mapping and immutable copy/seal into a fresh, dependency-free kernel used by the existing bounded-session class. Live identity checks, generation claims, failure-copy recovery, admission and cleanup stay private to the runtime root. Synthetic and compiled/package checks preserve the distinction between construction failure and later run stops. Fake friends and synthetic orchestration remain unchanged; formal issuance, whole-run admission and real communication are not enabled.

- EF-02 moves bounded-session clocks, controllers and resource registration into a guarded constructor transaction, with a pure first-field diagnostic shell, fixed partial rollback, admission return and credential-reference clearing. A fixed fresh factory recovers a sealed, authority-free failure copy without exposing raw exceptions or caller-supplied seeds; the ND-03 development entry retains that copy. Includes fault-injection, cancellation, compatibility and compiled/offline packaging tests. Existing direct-constructor error codes and pre-aborted behavior remain compatible. Fake friends are not removed, formal issuance/whole-run admission remain disabled and no native fallback or real communication is enabled.

- CM-04-03 connects data-only, fixed-200 synthetic parent/release responses through the existing native cleanup/same-byte acknowledgement lane to a creator-key-bound private source consumer and the existing C-mode release decision. One session, registered lease and canonical C/G budget cover cached/per-user or synthetic OAuth readiness and prepared binding; the session's phase reserve is shared rather than recomputed. Fake output is explicitly marked, carries no live authority and is returned only after closure. Includes cancellation, caps, malformed input, conflict/fallback, foreign-consumer rejection and offline packaging tests. Existing MCP/legacy workflows, formal issuance, whole-run admission and real communication remain unchanged/disabled; non-200 semantics and final capacity transfer remain deferred.

- CM-04-02 adds a fixed new-run, pre-I/O composition checkpoint: the creating session privately binds its pinned snapshot, registered canonical lease, one-shot transport claim and one concrete source before ready/authentication. Initial identity binding is distinct from ReleasePermit admission and rejects replay, foreign identities and reentry. The fixed entry returns only a frozen constructor-bound summary after releasing accounting, admission, timers and credentials; no existing-session adoption, work callback or mutable port is exposed. Includes fake-clock/cancellation and compiled/offline tests. Authentication/GET/native dispatch, private ack adoption, formal issuance and whole-run admission remain unconnected/disabled; existing public workflows stay legacy.

- CM-04-01 separates canonical-core creation from one-shot constructor accounting supply. The existing fresh bootstrap factory delegates lazily to that same core; legacy writes select the legacy lane, preventing later acquisition even after zero-charge operations. Acquisition/reservation claims are consumed before clock callbacks, retain first-stop diagnostics and cannot be reminted after failure or release. Includes synthetic and compiled packaging tests; actual-session native selection, formal issuance and whole-run admission remain disabled/unconnected.

- CM-02 moves legacy bounded-session C/G/P accounting and its readonly lease onto the CM-01 canonical state, removing duplicate mutable counter fields. Dispatch placement, four final slots, retry/status handling and local payload-limit behavior remain unchanged. A private clock preserves the original run origin; core errors are translated to existing bounded errors, with owner diagnostics retained before one-shot abort propagation. Includes before/after synthetic event oracles and compiled packaging checks. Native/typed activation, formal issuance and whole-run admission remain disabled/unconnected.

- A bounded review session now stops once its first authentication attempt fails. Previously the session stayed active after a failed OAuth/token step: later `get` calls failed with the same code, but `assertActive()` and other session checks still passed. Now the authentication failure code (for example `invalid_response` or `upstream_unavailable`) becomes the session stop code, so every later check fails with that code. Review outcomes are unchanged, because authentication runs on the first parent read and that failure already ended the review.

### Security

- Remove packaged fixture registration/owner/transport-claim exports and the real session's fixture transport factory. Fixture registries, claims, draft handles and synthetic accounting now live exclusively in package-excluded development modules, and reject raw real-session registration. Ordinary session GET/payload/phase behavior remains intact; packaged and source regression tests cover the former fixture-to-real-mode path. Production BR-006 evidence issuance remains unimplemented/closed.

### Added

- WF-B BL-B comparator verdict fix: per-child classification moves into a pure, package-excluded function that reports cleanup, spawn/signal, unclosed, output-overflow and stderr anomalies as failures before a legacy-control deadline can be called inconclusive (SF17). A close at or after 60,000 ms counts as the deadline even if the timer has not fired, each signal is sent at most once per child, and hand-written reports cover the order. Deadlines are unchanged; supervisor fault injection (SG-A/SG-B) remains unimplemented.

- WF-B BL-B review controls: the body-live loader test now covers every reachable observation refusal (string/key length, prototype, freeze, symbol and non-enumerable keys, array length, depth, node, count and byte limits), scenario/namespace binding, isolation and seal preconditions, the entry contract and a negative clock. Observations refuse -0 because JSON digests cannot distinguish it from 0. The ABBA comparator reports a legacy-control deadline as inconclusive (exit 2) instead of a pass or a JS-path failure, and caps retained output in bytes. Deadlines are unchanged.

- WF-B BL-A review controls: the body-live migration test now refuses a duplicated BC06 branch, a renamed or reordered final branch, a TS-only anchor loss hidden by type erasure, and checks the exact input limit; its shape comparator distinguishes unary operators. The dead template rescan is removed (template-bearing recipes fail closed) and anchor drift carries the known case ID. Fixed-ledger defences remain uncounted, and BL-B/C, mutant import and the normal-route switch stay disconnected.

- WF-B R-b closed-contract review controls: the compiled closed harness now injects T.first through a scratch setter (receiver prior, invalid and source-only first), feeds non-boolean stop flags, breaks the issued source, C/E control and root failure origin slots on their own, checks the identity point as a valid pre-start point, and asserts the reject class and source record for malformed state, including the withheld path. These kill 11 surviving temporary mutants; the other 27 of 78 are recorded as equivalent in the claim/failure design §16. Fixture behaviour is unchanged.

- WF-B R-b preparation review controls now scope the forged receiver view to the private supply call and assert that the legacy caller still reaches the capture point; previously the forged accessor stopped C-c earlier and counted an unreached capture as a refusal. Receiver qualification slots must refuse, start-side bridge relations are broken one at a time, and foreign controls assert reachability. Twelve remaining equivalent clauses are recorded; fixture behavior is unchanged.

- WF-B R-a review fixes: the compiled returned-preparation harness now breaks each remaining initial-owner absence clause on its own (14 controls), moves the real slots behind seven finite projections, and checks that a valid `accepted` state is still refused by the pre/post value checks. These kill 22 surviving temporary mutants; the other 5 of 84 are recorded as equivalent in the returned design §16. Fixture behaviour is unchanged.

- WF-B C-c review fix: an input rejection recorded during the final-post observation now maps the source first reason to `state_invalid`, matching the legacy owners and the PC08 design §7 (previously `construction_unconfirmed`; no current script reaches it). A new compiled control was RED before the fix; it also kills one mutant previously recorded as equivalent, leaving 31 in the C design §20.

- WF-B C-c review fixes: the compiled final-post harness now asserts that a missing final marker is reported as an inconsistent completion, that a second call never counts an accepted return, and that a root close flag alone still yields a closed first reason after the callee completed. These kill three surviving temporary mutants; the remaining 32 survivors of 73 are recorded as equivalent in the C design §20. Fixture behaviour is unchanged.

- WF-B C-b review fix: the fresh pin-confirmation entry now records failures through the same single-owner routing as the legacy `fail()` (extracted as `failRecord`), so a contract- or bridge-phase failure no longer rewrites the held source build or the confirmation diagnosis. Vitest adds whole-pipeline parity with legacy B, shared-field parity with the bridge/start factories, completion and pre-preparation/input entry cases; the compiled harness adds nine single-point publication/replay guard controls. Remaining equivalent clauses are documented.

- WF-B pin final-contracts review: the C-a inspect projection now maps every private enum through a fixed allowlist (out-of-range becomes unconfirmed) and every flag through strict boolean, matching earlier factories; eleven compiled controls inject invalid private values and confirm nothing echoes. Vitest also pins the sealed `check()` result, and the remaining fixed-mode and co-recorded clauses are documented as equivalent.

- WF-B pin confirmation-stages review: a compiled control now drops the receiver busy flag right before the owning prepared check and confirms the run stops with state_invalid without entering the stage continuation (stage point stays none), so removing the prepared-validity condition on the stage branch is detected. The remaining fixed-mode, same-point, identity and same-value clauses are documented as equivalent; no fixture behavior changed.

- WF-B pin confirmation-preparation review: vitest now compares the per-point disposition, the pre-call source failure boundary, the failed seed shell and the exact reply re-materialization error, and compiled controls inject a single fault right before the owning prepared check (busy, inactive call window, rejected slot) and lose the primitive return after the receiver call, so removing each guard moves the disposition, first reason or return classification. The remaining fixed-mode, unreachable or same-value clauses are documented as equivalent; no fixture behavior changed.

- WF-B pin reference-storage review: compiled controls now inject one fault right after each fixed observation point (store before-issued/blocked rechecks, root reference check, rejected_before qualification and the seven rejected_after post clauses), and the missing-current vitest case compares the reference point and boundary, so removing each guard moves the first rejection, failure point or rejected-hold state. The remaining unreachable, duplicate or co-recorded clauses are documented as equivalent; no fixture behavior changed.

- WF-B pin-call review: compiled controls now inject single faults before the fixed call (route boundary, busy flag, call counter, source stop request and source first), into the direct call-window record and receiver initial fields, and before/after receiver preflight, so removing each dispatch precheck, receiver initial clause, entry recheck or source stop clause moves the first rejection, call or trial outcome. The remaining duplicate, single-writer or unreachable clauses are documented as equivalent; no fixture behavior changed.

- WF-B pin-bridge review: compiled controls now inject the call-active flag, receiver busy flag, receiver relation flag, PC02 route boundary and source metadata count at single bridge points, so removing each before/checked/blocked recheck or the caller identity clause moves the first rejection. A literal control covers the call-active initializer, and the vitest close cases assert the root stop-first record. Remaining duplicate or unreachable clauses are documented as equivalent; no fixture behavior changed.

- WF-B C-02 pin-start review: compiled controls now inject each of the 13 root route scalars before the entry check and at PC02 preflight, so the start-unused and preflight route clauses are pinned to their first rejecting step and boundary. The base, storage, payload and provenance context calls, the second caller identity check at entry/after (same-value source copy), first-refusal retention across two reentries, and `refusal: none` on internal context rejections are also checked. Vitest compares storage state after pin-start failures. Two clauses are recorded as equivalent or unobservable.

- WF-B C-01 pin-contract review: compiled controls now inject each of the 13 source progress fields and 12 receiver pin values through the owner path, so the BP02 entry checker connection and its value mappings are pinned to `binding_mismatch` at `before`. Four `checked`-position injections move the rejection to `after` when that recheck is removed, three controls isolate the PayloadEmpty occupancy/binding-state/prefix clauses, and the receiver pin projection allowlist is checked. Vitest now compares storage and source state after failures and the `not_created` receiver pin projection when no source exists. Three root clauses and the entry `issuedSame`/`currentSame` mappings are recorded as equivalent or unobservable.

- WF-B body source issuer review: seven compiled single-injection controls pin the BP00 attempt pre-issue recheck and the BP01 provenance/stable clauses to the first rejecting phase/step/boundary, and two controls isolate the metadata and progress `enumerable` descriptor clauses. An absent source now projects `not_created` on every source axis; `unconfirmed` is reserved for an issued but unverified source.

- WF-B body bind-field review: compiled single-injection controls now pin the two root-side `bodyFieldsIntact` clauses (base unused, no BC shell), the root-side `state`/`phase`/`failurePhase`/`reentry` projection allowlists, and the `bodyStarts` projection derived from the real body cell. Two remaining mutants are recorded as equivalent.

- WF-B body bundle/draft review: two compiled single-injection controls pin the BC12/BC13 mint base preflight to its own `before`, before the producer is called; removing it previously delayed rejection to the final post. The `cell.rejected` clause of the live and bundle data checks is recorded as an equivalent defensive condition, correcting an earlier live-path record that counted an anchor-only failure as a kill.

- WF-B body live-slot review: nine compiled single-injection controls now pin each shell, carrier and suffix clause of the live-path prefix check to the first rejecting phase. Two further controls isolate the `enumerable` and `isSealed` descriptor clauses, which previously masked each other. The phase projection allowlist and the per-slot `initial`/`sealed` live projection are now asserted. The redundant `configurable` clause is recorded as equivalent.

- WF-B body slot seed review: twenty compiled single-injection controls now pin each BC00 base clause, per-mint preflight, bootstrap check and the final recheck to the phase/boundary that first rejects; removing a clause moves the rejection or reaches `seed_held`. Further controls cover freeze-after-issued, the identity of the first rejected candidate and the slot-stage projection allowlist. The design now lists the start-side base clauses that have no single injection point.

- WF-B probe local exit review: twelve compiled injection controls now pin each per-phase recheck in `localFinish` (history, attempt ready/history/used/target open, block context, confirm ready, not-required ready/history, absence ready and the commit all-post recheck) to the phase that first rejects. Overlapping later checks had masked their removal. The design now states that the committed live state stays outside the B-01 state validator.

- WF-B probe exit preparation review: the public projection now reports absent slots as `not_created` and present out-of-allowlist values as `unconfirmed`, instead of defaulting to `not_owed` or `unknown`; `settled_not_started` is added to the duty allowlist. A pre-preparation inspect test and two compiled injection controls pin the rule.

- WF-B probe grant capture review: capture failures after the claim are now classified by boundary instead of collapsing to unconfirmed. Before the constructor call the duty stays owed with an empty grant (`claimed_not_issued`); an issuer-held candidate stays provisional and known with the duty owed for the later fixed exit (`grant_known`); only an uncaptured constructor result is unconfirmed (`grant_unknown`). A `capture.prefix` diagnostic and compiled controls pin the classification.

- WF-B probe run preparation review: thirteen isolated invalid state shapes, each changing one fact from a valid entering/active/exiting/unconfirmed baseline, now pin every clause of the state-relation check (16 compiled single-clause controls, up from 3); the blanket `not_owed` rejection is documented as equivalent.

- WF-B canonical gate draft review: the in-frame close reply (`deferred_frame`) is now exposed as a `closeInFrame` diagnostic and pinned by the test, so dropping the in-frame deferral is detected; unreachable double guards are documented.

- WF-B writer gate fake review: the gate now becomes `unconfirmed` only for unconfirmed operations or failures while a frame is entering/exiting. Duplicate bind/enter are refusals that keep gate/frame state (sticky `refusal` diagnostic), so a duplicate request after a confirmed exit no longer blocks closure, and input rejection or a pre-frame pin mismatch keeps the gate state. The event-word oracle is updated accordingly.

- WF-B canonical supply construction review: seven start-only controls (claim owner, claim and pin identity, claim owner/pin, a pre-spent issued claim, binding pin) keep the issuer scope consistent so only the start-side `constructionMatches()` can reject them, and an `issuer_rejected` control pins the issuer state check; eight compiled controls added. The `scopeMatches()` call is documented as redundant.

- WF-B journal supply shell review: a close before construction now records only the stop (no first diagnosis) and refuses later preparation, matching the other fixtures. Fixed single-field controls for claim brand/target/state and descriptor brand install the malformed value as the only issued slot (four compiled controls added), and the in-frame close reply is pinned.

- WF-B absence journal review: control live retirement is now journaled as a `released` write on C14 (no absence fact), and the legacy source `clear()` is refused once the root is retirement-sealed, with the refused writer recorded through the normal journal acceptance (`journal_sealed` after seal). The `legacy_clear` control now runs before the retirement seal, and a new `legacy_clear_after_seal` control pins the refusal.

- WF-B capture admission review: mixing tests now fix the rejecting stage through seal/ack/pin/admission issue counts, so a later binding check can no longer mask an unchecked earlier field (`pin_origin` is now isolated and added to the compiled controls). New controls pin the seal-vs-issue exception classification, a scope extra key and the root-not-created ack extra key.

- WF-B retirement start review: pin field controls (construction, retention, source slot) now install the malformed pin as the issued pin itself, so only the private `matches()` field comparison rejects them, with three compiled single-clause mutants. New tests pin the in-frame retirement request on generation failure (deferred, then started after `finally`) and control stop on argument-bearing rejection.

- WF-B pending source binding review: failures now map to the root by class (generation failures to `read_prepare_unavailable`, binding/duplicate to `binding_mismatch`), and a source-owned `source_rejected` no longer adds a root binding diagnosis. New fixed controls pin close propagation to the control, root and retention root, retired-control refusal at all five source gates, and claim receiver binding (plus a compiled receiver guard).

- WF-B unbound pending construction review: snapshots now expose `parentLinks`, `roleOriginsDistinct` and `scopeOriginsDistinct`, read directly from the captured cells so that generation and checking cannot agree on a missing or crossed parent shell or a shared origin. Sealed results record the pre-seal state as `sealedFrom`. New tests pin first-reason retention on argument-bearing retries and the sealed reply.

- WF-B unused-control boundary review: close/failure before a control is bound now reaches the source owner through its existing close and fail+clear contracts (root close and Snapshot retirement included). Count value controls truncate the tail so they are isolated, and compiled controls confirm that removing each count check makes the rejection disappear. New tests pin the pre-bind close path, copied-control relation rejection and extra factory arguments.

- WF-B supply transfer preflight review: a close before any preparation start now records only `stopReason` (as the source owner does) and keeps later preparation closed; a close of a prepared preflight reports state `closed` instead of `rejected`. New tests pin claim/shell retention after every rejection, extra factory arguments and terminal replies. Unreachable capture/state guards are recorded as equivalent mutants.

- WF-B canonical supply review adds fixed `post_*` selectors that each break exactly one post-validation clause (issued table/view, envelopes, table origin, registry/binding/declaration correspondence, lengths, record validity and oversize), two valid re-issue bases, a `retainedTableOrigin` diagnostic, and reason-routing tests for parent lifecycle mapping, claim-less close, direct preparation after construction failure, terminal replies and extra factory arguments. Envelope field checks and `borrow.matches(e)` are documented as mutually redundant.

- WF-B declared/actual review now runs the compiled declared/actual negative controls from the package classification runner, and isolates each malformed source event/record field against a valid base, including rejection through `openOnce`. New fixed selectors check that a read event fires only at its own offset and that an after-metadata size change is `source_changed`; cleanup timing distinguishes stop/end clock signals and the source probe diagnostic stays limited to its selector. Legacy B results, caps and deadlines are unchanged.

- WF-B snapshot/read preparation review keeps the read side unused when synthetic supply construction fails and records a close-derived read stop only after the construction issued its start claim, so a never-started read no longer reports `supply_closed`. Added controls cover prepare after an ordinary terminal, close-only `rejected` disposition and readonly check returning the first prior reason after lifecycle or supply failure. No legacy supply, B kernel, budget or resource wiring changes.

- WF-B read/hash capacity review measures the concurrent update-reservation peak from the live reservation count instead of assigning a constant 1, and the capacity event oracle now counts reservations and releases separately, so a double reservation is detected. A capacity test name no longer claims package exclusion it does not check.

- WF-B read/hash stage-B review makes the digest-mismatch controls fail through the real comparison against the pinned abc digest instead of a scenario flag, keeps misuse after every file is committed as `binding` even when a late stop was recorded, and admits only zero arguments or one fixed scenario string. New controls step directly after a sticky stop, pin the 900/1000 time boundaries, catch a clock reversal from a non-initial sample, keep the first control stop, and report unknown cleanup timing when the guard ceiling is exhausted.

- WF-B ReadOps stage-A review keeps a fully read and confirmed-closed file `pending` and counts it in `acceptedFiles`, so a finished session can be told apart from one that stopped partway. Closing a file before its after observation now records `incomplete`. Once every file is accepted, a later deadline, cancel, clock or limit stop is kept only in `stopReason`. New fixed scenarios cover after-read size/identity/kind changes and before-read identity/kind changes, and tests pin the first-open ordinal, backward clock steps, the first late stop reason, outstanding cleanup and the closed core path.

- WF-B map-supply review adds a `map_wrapper` probe that keeps the checked files and rows but changes the map object, so the map identity check is now guarded on its own. Tests also pin that the origin probe holds its input before the check and that a normal supply finishes construction. Supply results stay synthetic and non-executable.

- WF-B source-map review tests now pin array proxies before traps, array-like and subclassed lists, hidden entries and fields, duplicate file IDs, free-text missing points, a thirteenth row, step order within a row, unknown roles and reference bindings that claim a cost step. Two earlier tests were rejecting their input for a different reason than their names stated. The implementation is unchanged.

- WF-B coverage rows must now list all five gaps, so an Unknown or synthetic row cannot understate what remains unverified. Review tests pin every closed carrier and ledger field, truncated ledgers, non-standard arrays, array proxies and deep freezing. Values stay untrusted DATA, with runtime coverage unknown and seed issuance, core wiring and formal issuance closed.

- WF-B K0/entry fake review tests: extend the reference machine to all 3,125 five-operation words so it reaches operations after a successful close, and pin frozen results and carriers, the coverage flag, refusal when used equals the cap, pre-entry diagnostics and the refused end state. The fake, its fixture schedule, the absence of seed, core and real-budget wiring are unchanged.

- WF-B finite bridge-work review tests: refuse non-enumerable counters and pin frozen capacity and overflow refusals; remove assertions that could not fail. The recipes, reservation bounds, not-ready status and absence of core wiring are unchanged.

- WF-B RC-B review tests: pin non-enumerable plan refusal, the arithmetic step where structural overflow stops, frozen refusals, and exact charges on the value core's field-count and field-order rejection paths; remove assertions that compared a value with itself. The admission calculator, value engine, raw-parser separation, formal issuance and whole-run admission are unchanged.

- WF-B RC-A review tests: pin the separate first eight units of the standalone bounds calculator with an independent 45-unit control, and pin frozen detailed, legacy and unavailable results, a snapshot detached from the live meter, and refusal of a meter installed after the terminal result. The value engine, charges, raw-parser separation, formal issuance and whole-run admission are unchanged.

- WF-B DT-A review fixes: one synthetic deadline table now yields one Store, so a rebuilt Store cannot shed a sticky failure to reach `manifest.json` or start a separate byte budget. The table is spent once its binding passes and is never refunded. Proxy plan and Store inputs, a `budget` without a table, and identical run and budget origins are refused. Deadline arithmetic, row selection, formal issuance and whole-run admission are unchanged.

- WF-B RP-B review hardening: raw JSON syntax controls now pin each fixed stage and reason, and a hand-counted 312-unit tree checks every per-unit work charge. New controls cover same-length delimiter and literal errors, mismatched closers, unterminated strings, DEL bytes, scratch and hard ceilings, smaller global caps at known paths, and off-path arrays. The parser, value core, formal issuance and whole-run admission are unchanged.

- WF-B snapshot value core review hardening: an empty snapshot can no longer claim a complete run, and `passed` now conflicts with `not_run` cases blocked by a module or hook failure. Non-observed metrics, including `not_supported`, keep the prefix incomplete. New synthetic controls isolate each local relation, pin all ten encoded bounds, add maximal-width fixtures, hostile nested values, standalone caps and a hand-counted work breakdown. Bound formulas, runtime sources, formal issuance and whole-run admission are unchanged.

- WF-B DT-C review hardening: assertions inside throwing notification mocks were swallowed by the notification catch, so they now observe in the mock and assert after unwind. New synthetic controls pin Pending during both notifications, admission closure before notification, Store-then-recorder order, one observation claim across reentry, `not_present` on owner/recorder construction failure, frozen notification snapshots, a whole-save EINTR cap and EINTR charging against the write attempt cap. The test kernel, cost formulas, runtime sources, deadlines, formal issuance and whole-run admission are unchanged.

- WF-B DT-B terminal controls now pin unknown and boundary lateness, the pre-clock before the commit, one Store cancellation across repeated clock faults, nested clock reads, a pending request during a direct Store consume, the post-fatal epoch and queue counts, and handle cleanup after one clock fault. No fixture behaviour changes.

- WF-B review tests for the test-only Store attempt results: a close that throws counts as attempted, a reported close with an invalid next time stays unconfirmed, and a late close keeps the primary reason. The bound bridge now has controls for partial writes, the EINTR cap and a refused save that must not copy the previous cleanup. No fixture behaviour, real storage or formal issuance changes.

- WF-B review fixes for the test-only checkpoint persistence: a stray recorder call after the test terminal is only a diagnostic and no longer cancels the Store, so queued evidence can still be saved; misuse while observing stays a fatal stop. The cleanup split and the limits are read once at construction. Tests now cover consume failures, slot and digest mismatches with a genuine receipt, and a queue head that moved. No whole-run preservation or formal issuance is enabled.

- WF-B review fixes for the test-only store/recorder binding: the shared clock stays readable after a stop so a Store can still release its handle, admission staying with the guard; a root takes one owner, so a fresh run key cannot obtain a fresh Store; recorder misuse and a refused gate are fatal stops, while cancellation, the stop deadline and the start window stay observation stops; a discard at or after the save deadline closes without cancelling the Store. Tests now cover the Store wiring and `Store.cancel`. No bound save or acknowledgement exists yet.

- WF-B review fixes for the test-only in-memory EvidenceStore: the byte limits now use the real input size and copy with no callback after the check, so a growing buffer or a subclass that misreports its length cannot exceed them. A close that succeeds at or after the cleanup deadline is reported as a separate `late` state rather than confirmed, and non-object forged receipts are sticky failures. New controls cover first-reason retention, throwing cleanup, structural ceilings and nested calls. No filesystem, recorder or issuance behavior changes.

- The WF-B pure-fake recorder now keeps measurement after the test terminal and a verified preservation after Published, reports checkpoints left behind by Closed as unsaved, and no longer spends the stop slot on a stray call after the terminal. New tests cover invalid timing values, acknowledgement deadlines, state transitions, runtime type checks and snapshot immutability. Product code and deadlines are unchanged.

- WF-A observation time now uses a clock captured at import, so `vi.useFakeTimers()` can no longer freeze case time at zero or stop measurement as a false rewind. New tests cover terminate failures, a worker left running at close, rejected reviews, first-reason retention, ordinal limits and request ID handling, and event order checks now fail when an event is missing. Product code and deadlines are unchanged.

- Adapter timeout regressions now reach a delayed worker termination and an owner close failure. They fail if the shared test owner stops awaiting cleanup, restores mocks or clocks too early, drops the framework signal, swallows a close failure, or skips restoration after one. Product code and deadlines are unchanged.

- The OB-03 AC-B compiled fixture adds 44 faults: coherent terminal replacement, sink, custody-holder and cleanup/ready live drift; staged record payload and ledger rewrites; builder pre-record preparation, resource and slot drift; and candidate and staged gate slot conditions. Each of these checks was previously unobserved because existing faults changed only top-level record fields or the issuer itself. The kernel itself is unchanged.

- The OB-03 AC-A compiled fixture adds 10 faults: same-origin bundle and wrapper rewrites at work and final that only the full bundle check can reject, work-stage state and source-slot drift, a coherent shell rewrite and an entry destination-owner change. Synthetic tests also pin the invalidated state after source close or cleanup start. Each of these was previously unobserved. The kernel itself is unchanged.

- The OB-03 FP3-C compiled fixture adds 11 faults: each retire-entry term rejected just before the use right is removed, a completed count during work, and a hard stop during work that must not run the post guard. A temporary oracle also observes the retired state at the consumer return. Each of these was previously unobserved. Consumer test assertions moved outside the guard, and one strict type error in the FP-2 test was resolved. The kernel itself is unchanged.

- The OB-03 FP3-B compiled fixture adds 17 faults: each builder entry one-shot term and pre-allocation check must stop with no bundle allocated, and building and prepared stages each reject their own state drift. An FP3-A issue-start fault covers the moved start check. Each of these checks was previously unobserved. The kernel itself is unchanged.

- The OB-03 FP3-A compiled fixture adds 16 faults: origin-ledger-only drift, post-issuance counter and D2-slot drift, and pre-issuance drift or injected proofs that must stop with no further evidence issued. Each of these checks was previously unobserved. Synthetic tests also pin a provisional work failure and post-stop priority on the FP3-A root. The kernel itself is unchanged.

- The OB-03 FP-2 compiled fixture adds 20 faults: prefix-lane rewrites that keep the candidate, values and parts consistent; expectation run status, consistency, kind, frame supervisor/worker and appended input/outcome rows; same-shape copies of reviewed outcome receipts and accepted outcomes; a diverging same-plan reprojection; and draft version, ruleset, selected and initial-prefix changes. Each of these post-guard checks was previously unobserved because existing faults were rejected earlier by identity or shape. The kernel itself is unchanged.

- The OB-03 FP-1 compiled fixture now also requires zero completed header consumptions on each cross-path, replay and copied-take fault, so the full-mode refusal inside the header consumer is covered; previously only the full-side count was checked and removing that refusal went unnoticed. The kernel itself is unchanged.

- OB-03 D2 now has a compiled-graph fixture, run by the package audit, that injects epoch, owner, pending, model, budget-serial and missing-candidate faults only into emitted temporary copies just before the post-guard destination recheck, and seeds a retained destination owner, candidate, ContentChecked or unpublished destination slot to show each blocks payload-clear custody. The recheck and the new clear checks were previously unobservable by runtime tests. The kernel itself is unchanged.

- OB-03 D1 FullMixedDraft tests now reject a manifest that drops trailing assets, a candidate array with an appended element (finding, prefix limitation/error or trace row), a trailing extra key in the schema-free prefix/trace copies, and pin the original reviewed ruleset mismatch to the parent phase; each check was previously untested. The value helper itself is unchanged.

- PD-B(A) pending prefix value tests now reject a same-key but different `update_xml_sys_id` value in both the pins and accepted header errors, and an unknown `kind`; each check was previously untested. The value helper itself is unchanged.

- PD-A prefix delta tests now check that a `candidate_filter_violation` supplied as a verify error is rejected under a failed collection at the delta phase; the delta-side error rule was previously the sole, untested guard there. The value helper itself is unchanged.

- NB-03 normal transfer tests now check that a guard swallowing reentry into a normal operation poisons the terminal transfer, that an unknown guard return on the cleanup-capsule path fails closed without recording cleanup, and that extra `abortBoundTransfer` arguments report `binding`. The transfer root itself is unchanged.

- NB-02 normal adoption failures detected by the root itself after the kernel starts are now recorded with the operation stage (`cleanup`, `transfer`) instead of `internal`; the root previously revoked the kernel before claiming, so the kernel's revoke notice claimed first. Kernel-detected failures keep their phase stage. Tests also cover extra `startKernel` arguments and post-checkpoint stop priority for startKernel and adopt.

- NB-01 normal owned supply markers are now part of the kernel package leak audit, and a test checks that an unknown `stop()` reason is recorded as `internal` rather than retaining caller text. The supply itself is unchanged.

- FB-03 failure custody run tests now check that an unknown `cleanup_guard` return at either cleanup checkpoint fails closed with the first hard stop, without recording a stop observation or (before the sink) a cleanup fact; the budget observer was previously the sole, untested guard on the cleanup path. The run itself is unchanged.

- Synthetic failure custody tests now check that after commit and before final discard the local owner can no longer request or observe cleanup, the holder stays upper and upper can still consume the same evidence; the custody holder check was previously the sole, untested guard against dual cleanup authority. The custody helper itself is unchanged.

- OB-01 owned mixed supply tests now reject a reviewed row whose `target.retrieved_at` differs from the pinned input T_i, and analysis rows with a null-context or missing input; each check was previously the sole, untested guard required by the OD-B contract. The supply itself is unchanged.

- OD-A mixed slots now have the same package classification audit as other synthetic helpers (fixed imports, non-packaged markers and seeded runtime/I/O/clock/worker leak controls). Tests also check directly that source close, cleanup start or discard reentry from the generate post guard fails `generate` with no slot published, and cover prefix release, a Proxy guard, unknown kind and stop reason, double starts and unknown cleanup status. The assembly itself is unchanged.

- OM-C parent-decision owner tests now check directly that `beginSourceClose`/`beginCleanup` reentry from an accept guard fails `accept` itself with no capture published, and cover first-delivery and decision extra arguments, unknown kind, construction-time context order and unknown stop reasons in isolation. The owner itself is unchanged.

- OM-A parent omission values now accept retained (not_processed) rows only as a contiguous suffix, as the adapter appends them after interrupting its loop; a reviewed row after a retained row was previously modeled. New tests also cover two-rule applicability duplicates and subsets, nested result refinements, consistently reversed selected order and an unknown kind.

- NR-C mixed manifest tests now reject a retrieval failure bound to a completed input that already carries an analysis context, an analysis outcome whose completed input has no expected context, and a shorter supplier expected-evidence list at construction; each check was previously the sole, untested guard. The root and supplier themselves are unchanged.

- NR-B issuer tests now cover same-root cross-row retrieval terminals (previously the only check against issuing another row's outcome), `discard`/`recordCleanup` reentry from guards, terminal release after issue, cleanup recorded before the terminal event, constructor dependency and rule-list shape, unknown stop/revoke reasons, and an AST oracle keeping the metadata classification copy identical to the adapter. The issuer itself is unchanged.

- NR-A non-reviewed value tests now cover valid own data carried by exotic prototypes, symbol keys whose values are admissible strings (which would otherwise disable character accounting), and the exact 16/17 node boundary. The value helper itself is unchanged.

- CG-BP1 synthetic captured recovery roots now require each event's `applicable_rule_ids` to equal the pinned requested rules, as the worker always sends; a self-consistent event with different applicable rules was previously captured. New tests change body and context together so each private pin check (time, record update, Update Set, release, ID, event count) is the sole detector, and cover the summary terminal and constructor budget stops.

- CG-B synthetic capture tests now cover construction-time context consistency (target ID and duplicate rule IDs that CG-A alone accepts), trap-counting transparent Proxy envelopes, dependencies and contexts, `discard`/`discardManifest` reentry from accept and transfer guards, and invalid explicit stop reasons. The capture helper itself is unchanged.

- CG-A full JSON decoder tests now cover the `\b`, `\f` and `\r` escapes that `JSON.stringify` emits, so mis-decoding them can no longer silently change a schema-valid body, and RFC 8259 spellings it does not emit (`\/`, uppercase hex, `E` exponents, tab/CR/LF whitespace) decode to identical values. The decoder itself is unchanged.

- RD-B03 synthetic recovery finish comparison now accepts the single `output/response_limit` error that `finalizeAggregate` appends when it first omits a reviewed result (or `error_details_truncated` once errors are full), instead of rejecting finalize-shaped replies; any other error change is still refused. Adds tests for that rule and for previously unguarded duplicate reply assets, dropped expected limitations and reply skipped rules.

- RA-02④ synthetic finish-context issuance now holds value/identity mismatches without recording a hard stop until the post guard, so a cancellation or deadline at the post guard keeps priority as the design requires; the mismatch is still refused at commit. Adds two tests for the held mismatch with and without a post-guard cancellation.

- RB-C synthetic recovery kernel now refuses a normal close while a begun source close is still unsettled, instead of reporting the source as closed. Adds three tests covering that refusal, the unchanged `closed` report for a close that never began a source close, and caught cleanup-start reentry during worker startup.

- Adds eight RB-B synthetic pinned recovery root tests: unstarted origins refuse closure events other than `not_required`/`not_required` (with a positive control), bind/observe extra arguments are refused, construction descriptors with a non-plain prototype are refused, and a structurally invalid descriptor never invokes the external guard.

- Adds two RB-A synthetic finish-recovery root tests showing that construction descriptors and their time objects with a non-plain prototype are refused even when their own data properties are valid.

- RA-02 synthetic finish assembly now publishes its bound/prepared states only after the final post guard. Adds three tests covering caught reentry into close during the preparation post guard and the post-guard publication order of bind and prepare.

- RA-01 synthetic finish-context values now apply the aggregate schema's metadata budget rule (`metadata_seen <= max_records+1`, `selected = min(metadata_seen, max_records)`, `truncated = metadata_seen > max_records`) instead of only upper bounds. Adds 18 tests isolating previously unguarded header/run semantics (S/O/U/L order, header start, collection counts, duplicate rules/limitations, ruleset derivation, empty skipped rules), expected-limitation subsets, accepted-outcome reuse, omitted rows without a completed input, and cycle/oversized-array failure classification.

- SC2-C synthetic generation recovery now invalidates the pre-start ticket as a discard handle when the new frame starts, so a started frame without an accepted ready can no longer be discarded through the original start ticket. Adds three tests covering that refusal, fixing unexpected startup/ready failure reasons to an internal error, and caught reentry into the new-frame cleanup sink during startup.

- Adds three SC2-B synthetic worker-verify tests for checks that earlier tests did not distinguish: a non-boolean verify change flag hard-stops instead of counting as changed, and string or proxy chunk identities are refused without charging received bytes.

- Adds three SC2-A synthetic preparation tests: unknown `collection_status` and `consistency` values are refused, and a generalized unfinished-input set (another retained input besides the active receipt, active receipt not at U) is shown to be accepted. The design now states that the adapter's sequential order (only the active input unfinished, with T_i equal to U; none for phase deadlines) is not guaranteed by the SC2-A/SR-B synthetic contracts.

- The three R2 runner budget tests in `tests/review/r2-runner.cases.ts` (host remaining budget pinning, host-budget waiting timer, default 385-second budget) now race their `onReady` wait against the runner task settling, so a refused local listen (e.g. `listen EPERM` in a restricted sandbox) fails immediately with the runner's actual receipt (such as `callback_unavailable`) instead of waiting for the 30000ms test timeout. Assertions after ready, the existing abort-and-await `finally`, fake timers, product code and test timeouts are unchanged; no tests are skipped (see `docs/E2E_BEST_PRACTICE_WORKER_CLOSURE_SRC1_2026-11-02.md` §7.3).

- Loopback test fixtures (`tests/review/oauth-g0.test.ts` issuer helper, `tests/review/fixtures/oauth-g0-smoke.ts`, `tests/fixtures/http-host-survival.mjs`, and the fixed-port probes/occupiers in `tests/review/r2-runner.cases.ts`) now reject their listen wait on the server `error` event and close the already-created server on failure, so a refused local listen (e.g. `listen EPERM` in a restricted sandbox) fails fast instead of stalling until the Vitest timeout. Test-only; no product code, timeouts or skips changed.

- Adds five SR-C1 synthetic worker-closure tests for checks that earlier tests did not distinguish: no-generation evidence for an unstarted origin requires the same supervisor/request/input/point context, and a closure settle event with an extra field is refused instead of issuing closed-generation evidence.

- Adds nine SR-B synthetic phase-recovery tests for checks that earlier tests did not distinguish: non-bounded verify failures and non-boolean change flags stop instead of continuing as unverified, worker-deadline recoveries cannot prepare a phase plan, completed reviewed rows require an accepted input time, window/verify/receipt references must be non-proxy objects, a reused ready generation refuses an initial-start frame, and unexpected ready-failure reasons are fixed to an internal error.

- Adds SR-A synthetic soft-recovery coverage for two checks that earlier tests did not distinguish: seed and observation identity references must be non-proxy objects (a string identity would otherwise match any copied value by `===`), and caught reentry into a preissued cleanup diagnostics sink during a guard stops the owner instead of recording cleanup mid-operation.

- Adds six WJ-C synthetic finish tests for five checks that earlier tests did not distinguish: a same-length reply whose duplicate id hides a missing fixed id, a finish header that differs from the accepted input context, a changed reason for an analyzed rejection, acceptance of a parent-side response_limit omission of an accepted reviewed input, and reused release-evidence validation (observation after E, missing required limitation on a zero-input run).

- Adds WJ-B synthetic time-owner coverage for three preconditions that earlier tests did not distinguish: analyze refuses a time-only receipt (which would otherwise accept rejected/omitted replies without the same-input expectation), terminal UTC discard is refused on an active or normally closed owner, and a startup failure is refused for a ready generation.

- Adds WJ-A synthetic issuer coverage for caught reentry of otherwise valid input, source-close, analyze and finish calls from analyze/consume guards, which the earlier bind-only reentry cases could not distinguish from state refusal. The package check now audits the issuer for references to I/O, timer, clock and worker globals rather than direct calls only, rejects `Date.now` value reads and computed `Date` access, and proves the audit with seeded-leak negative controls. It remains a lexical audit, not proof against indirect global access.

- Adds TB-B real-class fake coverage for synchronous cancellation at every post-observation clock boundary, including the handoff, source-close and discard guards that the earlier late-boundary targets never reached. The record now states that continuing all fixed release sections after a handoff guard failure is not externally observable or test-confirmed, and the comparator/observation-UTC designs no longer describe the upper time handoff as unimplemented.

- Fixes the TB-A release time scope: once a held value has been discarded normally, a stray later call (accept/issue/discard/allocate/observe) is refused without rewriting the terminal `discarded` state to `failed` or adding an `internal_review_error` diagnostic, matching the existing `revoke` behaviour. A test covers all five calls.

- Extends the offline package check to the OU-01 `release-observation` kernel: besides the four artifacts, its compiled JS must import only `zod` and must not read the wall clock (`new Date`/`Date.now`), use fetch/timers, or re-export/require a root, so time is read only through the injected clock. Test-only; no runtime behaviour changes.

- Tightens the RC3-D02/D03 development release-conditions owner: comparison may now start only after `beforeRelease` decided to request the release, not directly from the claimed state. The D02 unit fixture calls `beforeRelease`, and a test confirms that skipping the decision is refused. Test-only; no runtime behaviour changes.

- Fixes the RC3-D02 development release comparison: the final post-cleanup clock/cancel/deadline re-check now only withholds the comparison candidate (recording a fixed `release_comparison_withheld` reason) instead of rewriting a run whose teardown was already confirmed to `cancelled`/`deadline_exceeded`/`internal_review_error`. Opting in no longer changes the existing summary; a test compares the base summary with a non-opted run. Test-only; no runtime behaviour changes.

- Fixes the EF-03B B-02-02 development bootstrap: like the production bootstrap contract, it now checks after each chunk that received bytes grew by exactly that chunk and that request/payload counters did not change, failing closed with `internal_review_error` otherwise. A test substitutes a port that over-charges by one byte. Design version links are updated. Test-only; no runtime behaviour changes.

- Fixes the EF-03B B-02-01 development source: the profile pin capped every array at 21 elements, so a 22-row release through the development assembly was rejected as `invalid_input` instead of reaching the shared value check (`invalid_response`, as in production). The pin now applies only the 64-key resource bound. A revoked development lifecycle also stays `closed` when a later rejection is recorded, so sealing it no longer fails. Tests cover both; design version links are updated. Test-only; no runtime behaviour changes.

- Fixes the EF-03B B-01 development root's construction order to match the production session: busy pre-check, then core, admission and registered owner. Previously the owner was registered before admission, so a busy claimant registered and rolled back on a path production never takes. A new test checks that a busy claimant allocates no core/admission/owner slot and that an admission fault leaves the owner unregistered; live registrations are now bounded by the two admission slots. Test-only; no runtime behaviour changes.

- Fixes the EF-03A compiled construction-kernel fixture: the "local state cannot affect the live session" check previously failed an already-sealed, unrelated state (a no-op). It now fails and seals a fresh, unsealed local state holding a resource and compares the live session's construction copy before and after; a temporary cross-instance leak injected into the compiled kernel is now detected. Design version links are updated. No runtime behaviour changes.

- Fixes EF-02 so the construction shell records only construction-time failures (plus a pre-abort detected at commit): runtime stops after a successful hand-off no longer mark the construction as failed, and the registered owner again closes with the session stop code first.

- Fixes EF-01 so, after commit, only the new owner may report an unowned (never-started or already-released) slot: its not-needed report no longer fails the shell, the old owner's report is refused, and a repeated new-owner release is classified as a duplicate.

- EF-01 adds a package-excluded pure construction-shell model: three unobserved purpose slots, ten fixed resource slots, separate one-shot core/source bindings and a non-executable ownership-transfer model. Synthetic tests cover foreign/copy binding rejection, first-failure retention, partial/unknown acquisition, owner-specific one-shot release metadata and immutable sealing. No clock, controller, timer, listener, session registration or real cleanup is invoked. Constructor integration, diagnostic failure-copy delivery, fake-friend removal, formal issuance and whole-run admission remain unconnected/disabled. Includes compiled/offline packaging checks.

- Fixes ND-03 so a native cleanup-floor stop reaches the session as `upstream_unavailable` (matching the SA-02 floor check) while the canonical run deadline is not reached; the native diagnostic keeps its own `deadline_exceeded`/`cleanup_deadline`.

- ND-03 adds a package-excluded, fresh fake-only composition of the actual bounded session/source classes and injected native status cleanup. The sole native consumer calls the creator-bound closed-gate source continuation before closure; canonical C/G counters, registered ready generation, source/core receipt checks and the original attempt window are shared. Failure results retain native HTTP/cleanup and session internal/public diagnostics after revocation and release. Includes replay/mixed-source/private-boundary, caps, cancellation, frozen-copy and compiled/offline tests. The new one-shot development friend never adopts an existing session or performs network I/O; real authentication/URL provenance, fallback, permits, formal issuance and whole-run admission remain disabled/unconnected.

- Fixes ND-02 so stop/close no longer cut a pending reader cleanup short (it keeps its read-only wait until the original floor, as ST-03C does), and teardown reflects only the lane's own releases instead of mirroring reader cleanup failures.

- ND-02 connects the package-excluded diagnostic owner, bound before observation, to a creator-private native status anchor/cleanup terminal and a sole one-shot consumer using injected Response/Streams only. Same-reader cancel/closed/release facts are frozen before release effects can rewrite them; cleanup, first-stop and acceptance diagnostics survive closure. Includes original-window guards, pending/late cleanup, native failures, replay/reentry, provenance negative controls and compiled/offline packaging tests. No diagnostic-to-evidence adoption, real session/source integration, transport, fallback, formal issuance or whole-run admission is enabled.

- Fixes ND-01 later-attempt reasons to match the bootstrap contract (`upstream_unavailable` for 429/5xx, `invalid_response` otherwise) and lets an attempt that ended without a response be retried, keeping the ordinal-1 HTTP slot null.

- ND-01 adds a package-excluded, pure-fake upper diagnostic owner with fixed authentication/parent/release slots, creator-only writers, one-shot identity binding and seal. First run/local/refusal reasons remain separate from HTTP/cleanup and acceptance history; pending cleanup seals as unconfirmed, late writes cannot upgrade it, and later attempts cannot overwrite ordinal-1 facts. Fixed-case tests and compiled/offline packaging checks return frozen non-authoritative copies only. Native evidence, session/source adoption, fallback, formal issuance and whole-run admission remain unconnected/disabled.

- Moves the SA-02 status-acceptance probe entry and its fake profile into a package-excluded development module. The runtime keeps only a one-shot internal friend that pins the fake object and normalizes its outputs; the static method is removed from `BoundedReadSession`.

- Fixes the SA-02 probe so a failed ready transition reports the earlier stop reason (or `internal_review_error`) instead of `authentication_failed`, since the probe performs no authentication.

- SA-02 adds a fresh fake-I/O-only probe connecting the actual bounded session and source creator continuation to one-shot, closed-gate status acceptance before close. Parent bytes use the same canonical C/G budget; private status receipts bind the pinned snapshot, registered lease/core, concrete source, ready generation and attempt. Copy/foreign/replayed receipts, unconfirmed cleanup, cancellation and expired windows fail closed with first diagnostics retained. Only a frozen fake-marked summary with all seven permissions false is returned. Existing fixed-200 composition/MCP workflows, fallback, permits, whole-run admission and real communication remain unchanged/disabled. Includes synthetic boundary tests and compiled/offline checks.

- Fixes SA-01 so a lost ready/parent prerequisite is reported as `invalid_state` at both the pre- and post-guard; `evidence_binding_mismatch` is reserved for reference drift.

- SA-01 adds a package-excluded synthetic source-status acceptance contract with a creator-owned issuer, a shared one-shot body/status release claim, non-executable drafts and acceptance before close. Fixed case-name fixtures verify identity mixing, foreign-token claim spending, pre/post cancellation/expiry/reentry, body/status conflicts and immutable history without exporting any token or consumer. All seven permissions remain false; no native/session/source adoption, fallback, permit, whole-run admission or real communication is enabled. Includes RED/GREEN synthetic tests and compiled/offline packaging checks.

- Fixes the fake bound status workflow so descriptors the injected owner would refuse are rejected before reservation and simulated dispatch (C=0), and maps the lifecycle stop code to the native owner so an ordinary close is recorded as `closed`.

- Adds a package-excluded fake composition connecting the existing canonical/status binding to ST-03C's injected Response, same-reader typed cleanup and one-shot private consumption. A fresh local constructor owns all identities; no existing session/binding/terminal or external cleanup diagnostic can be adopted. Simulated dispatch uses the same C budget, status-only reads remain zero/G=0, synchronous stop revokes native claims, and HTTP/cleanup/history remain separate. Includes replay, cancellation, pending/late cleanup, no-body, hard/local HTTP, input-mixing and compiled packaging tests. All seven permissions remain false; fallback, formal issuance, whole-run admission and real transport adoption stay disabled.

- Connects the constructor status binding to the same canonical accounting and fixed stop owner in the fake composition lane. Creator-owned accounting identity is checked once; C/G operations delegate without duplicate counters, and first-stop notification synchronously invalidates the binding while preserving internal/public diagnostics. Reservation release invalidates only that binding, without replacing an earlier ordinary cutoff with `closed`. Includes independent fake event-oracle, overshoot, mixed-port, reentry, cancellation and replay tests. Formal status issuance, whole-run admission and real transport adoption remain disabled.

- Adds a constructor-owned status binding contract to the existing private composition continuation. One-shot generation binds the original transport handle, snapshot, registered lease and initial source, synchronously revokes on the existing run stop, and retains first-terminal diagnostics without body/status issuance or dispatch authority. Synthetic identity-mixing, duplicate/reentrant generation, expiry/cancellation and failure-reuse tests cover the contract. Real status transport adoption, formal issuance and whole-run admission remain disabled.

- ST-03C connects injected native Response/Streams cleanup to private issuance and one-shot consumption inside the same fixed constructor. The original clock/window and private header/cleanup record are retained through issue/pre/post guards; no external diagnostic or raw-record adoption API is exposed. The existing ST-02 entry stays diagnostic-only, while a strict fake-I/O workflow entry returns only frozen, non-authoritative consumption history. Includes same-reader/read-zero, cancellation/reentry/expiry/fault/ownership regressions and compiled packaging checks. Real sessions/transports, source fallback, formal issuance and whole-run admission remain unconnected/disabled.

- ST-03B connects a one-shot private consumer and post-issuance revocation inside the closed synthetic status-context constructor. The consume claim starts before clock callbacks and remains spent after pre/post-guard failure, cancellation, reentry or expiry. Foreign/copied tokens and diagnostics cannot be adopted; successful consumption remains immutable, non-authoritative history after later errors. First terminal/HTTP/cleanup diagnostics are preserved independently of the latest phase. Includes forty-two fixed consumer scenarios and offline/packaging checks. Native records, real sessions/transports, formal issuance and whole-run admission remain unconnected/disabled.

- ST-03A adds a package-excluded, closed synthetic contract for same-constructor private context/anchor/record binding and one-shot issuance claims. Foreign identities, copied/external diagnostics, duplicate construction and reentry fail closed while preserving HTTP/cleanup facts and first diagnostics. Non-executable drafts and a reserved, unimplemented consumer slot remain private; the only fixture input is a fixed scenario name. Includes 33 independent expected cases, invalid-input/offline tests and packaging checks. Native adoption, terminal consumption, real sessions/transports, formal issuance and whole-run admission remain unconnected/disabled.

- ST-02 adds a package-excluded, injected Response/Streams cancel-only cleanup owner. Pinned native operations capture `closed`, cancel and release the same reader once without calling `read`; stop/close/finish join one cleanup operation. Frozen HTTP/cleanup diagnostics preserve failures, original deadlines and pre-release facts; an independent revocation flag prevents returning an acquisition handle after cancellation even when a hard HTTP failure owns the primary code. No status/body proofs or retry/fallback authority are issued. Includes synthetic fault, ownership, cancellation, clock and packaging checks. Existing body adapters, real sessions/transports, formal issuance and whole-run admission remain unchanged/unconnected/disabled.

- ST-01 adds a package-excluded, synthetic-only status-terminal owner with private binding/attempt identities, one-shot finish/consume claims and separate HTTP/cleanup diagnostics. Hard HTTP failures and revoked attempts retain diagnostic-only cleanup outcomes; synthetic release candidates never grant continuation authority. Includes independent cleanup-fact expectations, expiry/reentry/mixing regressions and compiled/offline packaging checks. Native Response/Streams operations, runtime adoption, formal issuance and whole-run admission remain unconnected/disabled; non-200 behavior approvals remain pending.

- Development-only HTTP classification contract describes legacy and approval-pending purpose/status/body-presence meanings without granting dispatch, retry, fallback, body acknowledgement, release-permit or formal-issuance authority. Strict data-only input, frozen descriptive output and an independent dense-table oracle cover all 3,000 finite tuples plus invalid/mutation cases. The classifier and oracle are excluded from the npm package, and packaged runtime imports are checked to remain unconnected; the fixed-200 gate and pending behavior approvals are unchanged.

- CM-03 adds a fresh canonical bootstrap budget and an atomic attempt-floor/C commit for the injected native/typed lane. C is committed immediately before dispatch, without an intervening observation: pre-dispatch rejection keeps C=0, while synchronous throws, rejections and entered-dispatch cancellation retain C=1. Same-budget G, final-four reservation ownership, one-shot release and fixed diagnostics remain bounded. Includes boundary/oracle tests and compiled packaging checks; legacy dispatch placement, real-session native activation, formal issuance and whole-run admission are unchanged.

- CM-01 adds an unconnected internal canonical budget core with zero-initialized C/G/P accounting, lowered ceilings, a readonly lease, pinned monotonic remaining-time observations and first-stop diagnostics. Internal binding/state/time reasons remain diagnostic-only while public failures map to `internal_review_error`. Pure synthetic tests distinguish retained overshoots from local payload/final-slot refusals, reject seeded/session-shaped inputs and keep update authority out of views. Actual session counters, typed dispatch placement, formal issuance and whole-run admission are unchanged.

- NA-03 connects injected native EOF evidence to the existing RT-B03 same-byte charging/copy, JSON/hash consume and one-shot acknowledgement. Owner/attempt/window-bound opaque end proofs reject mixing, replay, cancellation and expiry before candidates; native cleanup diagnostics remain separate from first-stop failures. An explicit constructor-only `native_body` fake lane covers bootstrap parent/release and OAuth bytes without a fetch fallback or fixture registry. Includes synthetic boundary tests and compiled/offline packaging checks; actual sessions, formal issuance and whole-run admission remain unconnected/disabled.

- NA-02 adds constructor-injected native Response/Streams acquisition with pinned intrinsic operations and private, fixture-independent response/stream claims. Same-reader cleanup captures observations before release, rejects reuse and retains first-stop diagnostics on partial acquisition failures, cancellation and expiry. Includes in-memory fault-injection tests and offline packaged smoke; no fetch fallback, real-session adoption, RT-B03 proof consumption or formal issuance is enabled.

- NA-01 adds an isolated synthetic internal contract for ResponseDelivery, owner-scoped resource claims, immutable pre-release snapshots and one-shot end evidence. A new domain-private registry rejects cross-owner/domain mixing, replay, callback reentry, invalid windows and post-failure reuse without native operations or real-session adoption. Cleanup facts remain separate from first-stop diagnostics; no-body is not EOF, and all views keep body eligibility/formal issuance disabled. Includes synthetic tests and a no-native compiled/static packaging check; native acquisition and RT-B03 native-proof consumption remain unconnected.

- RT-B03 adds an opt-in, constructor-bound fake body path to the RT-B02 bootstrap contract. Same-resource read/cancel/closed/release observations produce typed cleanup, opaque same-byte candidates, one JSON decode/hash and a one-shot acknowledgement under the original attempt/run budget. Synthetic regressions cover unconfirmed cleanup, replay/mixing, cancellation/expiry, cap overshoot, bounded chunks, late responses and secret-free output. Legacy completion events remain unobserved; actual sessions expose no body/ack entry point, and native transport activation, formal receipts and whole-run admission stay disabled.

- RT-B02 adds a constructor-bound fake bootstrap continuation to the private review lifecycle: one canonical C/G/P lease, shared first-stop diagnostics, dispatch/chunk accounting and four reserved final requests cover authentication → parent → release → prepared. Synthetic tests cover retries, time/cap boundaries, synchronous revocation, mixed source/claims and secret-free output. Dependencies are pinned only when a fresh isolated lifecycle is created; actual sessions supply none, expose no continuation and retain the legacy path. This shipped internal contract does not provide native cleanup proof, formal body receipts, real transport activation or whole-run admission.

- Internal RT-B01 constructor transport contract adds a one-shot identity claim and fixed diagnostics to the existing private review lifecycle. It reuses the existing prepared source/release verifier, rejects mixed or replayed claims and post-failure reuse, and returns no dispatch, accounting-update or evidence authority. Actual sessions keep the continuation in `#runOwner`; the default legacy path never claims it. Includes no-dispatch synthetic tests and packaged-boundary checks; typed bootstrap/cleanup, formal issuance and whole-run admission remain disabled/unconnected.

- Development-only CD-03/CD-04 parent reads now share a private workflow owner with their fixed target, ReadState and reserved final slot. Same-byte initial/final observations compare once; changed parents stop with `changed_during_review`, terminal failures discard the baseline, and ordinary-close refusal preserves an accepted baseline for final verification. A one-shot same-attempt acknowledgement preserves the original cutoff and cancellation across the asynchronous return handoff. Fake-only tests cover retries, mixing, cleanup, all changed-field combinations and secret-free output; production issuance, transport and whole-run admission remain closed/disabled.

- Development-only synthetic parent projection now uses the body lane's same privately copied bytes for chunk accounting, one JSON decode and hashing, then accepts a fixed five-field snapshot only after the body and issuer post-guards. Fake-only hooks preserve cancellation/expiry reasons and discard unaccepted drafts; final observations stop at private comparison preparation, without publishing stable/changed or opening formal issuance. Existing ReadState/CD entry paths and whole-run admission remain unchanged.

- Development-only synthetic parent-stability issuer adds private draft/snapshot/workflow-owner types and a fixed five-field comparator. Constructor-owned context identities, one-shot owner/use/draft/comparison claims, pre/post-guard commits, exact-string comparison and fixed first-cause diagnostics reject replay, mixing, malformed projections, cancellation and expiry without exposing records. Synthetic changed observations stop as changed_during_review; at most two logical records are retained and cleared at comparison/stop. This package-excluded model does not adopt real sessions, HTTP/body receipts or production source authority, and leaves formal issuance and whole-run admission disabled.

- Development-only CD-04 adds fixed HTTP status classification to the closed Response-reader path: 429/500–599 permit at most one caller-started same-purpose retry after confirmed cleanup; 401/403 stop as authentication_failed/access_denied, while redirects and other unsupported statuses stop without following Location. Original deadlines, shared request/final reservations, immutable auth/URL binding and first/last fixed HTTP failure diagnostics are retained. Error bodies are cancelled without parsing; unconfirmed cleanup, ownership uncertainty, cancellation and exhausted limits forbid retry. CD-02 wait/discard semantics, MCP contracts, formal issuance and package exclusions are unchanged; no real transport or production activation is added.

- Development-only CD-03 fixed parent Response-to-reader composition reuses the same closed attempt/ReadState, original deadline, signal, native reader and body pump through response wait, private byte charging, hashing and parsing. Initial/final requests retain the immutable fixture auth/URL binding; target sys_id mismatches, replay/foreign locks, late bodies, malformed JSON and cap exhaustion fail closed without exposing body data. Handoff preserves scheduler/stop/cleanup failures instead of upgrading an unconfirmed terminal. Synthetic coverage maintains CD-01/CD-02 compatibility; no real transport/session binding, formal receipt, production cap or MCP activation is added, and the implementation remains package-excluded.

- Development-only CD-02 Response-wait composition shares the closed supervisor's original attempt deadline, ReadState and cancellation signal. Native Promise settlement, dispatch-pending versus Response-body cancellation cleanup, late owned-body disposal, replay/foreign-lock refusal and fixed first diagnostics are covered by injected Response/Streams tests. It discards rather than reads bodies and never issues a body candidate or formal receipt; unopened settlement refuses success and even zero-byte appends. Only status 200 with a body is accepted by this wait-only subset; real transport/session activation and production caps remain disabled, and the implementation stays package-excluded.

- Development-only CD-01 closed parent dispatcher binds opaque logical requests to the same attempt/ReadState, fixed synthetic HTTPS GET and immutable fixture auth context. Only synchronous fake I/O is accepted; foreign/copied handles, caller URL/auth overrides, replay, Proxy/accessor I/O, accidental Promise/Response results and exhausted retries are refused. Dispatch-time C/no-refund, same signal cancellation, retained diagnostics and ordered initial/final use are covered by synthetic tests. No Response-wait adoption, actual authentication/HTTP, formal evidence issuance or MCP activation is enabled; the module remains package-excluded.

- Development-only injected Web Streams adapter over the same closed attempt supervisor/ReadState. Its private post-dispatch continuation claims each stream once, pins native default-reader read/cancel/closed/releaseLock operations, rejects Proxy/locked/reused streams and never exposes a reader/body or calls fetch. In-memory native-stream tests cover EOF, timeout retry, pending/rejected cancellation, reader errors, byte streams, empty quotas, reentrancy, late chunks, source-byte mutation and fixed non-exposing diagnostics. Existing fake Promise entry remains compatible; no real transport/session/source binding, production cap, formal receipt or MCP activation is added, and the module remains package-excluded.

- Development-only attempt supervisor for the closed fake ReadState: opt-in dispatch-time windows cap each attempt at 10 seconds and the original phase/run deadline, reserving up to 250ms (at most one quarter of remaining attempt time) for cleanup. Injected promises and an absolute-deadline scheduler exercise cancellation, pending-read/closed settlement, one-shot release, total empty-read limits, late-result rejection and retained fixed diagnostics. Cleanup-confirmed timeouts remain retryable on the same purpose/budget; unconfirmed cleanup or global stop cannot reopen it. A readonly stopped-run clock grants no body/accounting authority. No real Web Streams/transport, formal issuer, production policy or MCP contract is enabled; new modules remain package-excluded.

- Development-only byte mode for the closed fake ReadState binds private body candidates and typed cleanup terminals to the same attempt/accounting owner. Received bytes are privately copied before adoption and the same snapshot is charged, hashed and parsed once by fixed synthetic projections; only counts/digest are returned. Unconfirmed cleanup, replay/mixed handles, cancellation and expiry reject consumption and release retained references. Scalar accounting/confirmation bypasses are disabled in this mode; default length-event tests remain compatible. Formal body receipts, real transport/source/worker authority and production caps remain closed/unchanged; all new modules remain package-excluded.

- Development-only opt-in accounting on the closed fake body gate: one constructor-owned ReadState supplies C/G/S/P/E and ordered final reservations, with a one-shot session/run/transport-bound accounting claim. Synthetic events cover bounded purpose/retry use, atomic table reservations, overshoot/no-refund accounting, independent event/token oracles, cutoff/cancellation/reentrancy and fixed first diagnostics. Ordinary/evidence exhaustion preserves eligible reasoned final skips; global failures synchronously revoke retained ports. These are modeled length/cleanup events, not body provenance or actual I/O; formal receipt issuance, real sessions/transports and production caps remain disabled/unchanged. Both modules stay package-excluded.

- Development-only closed body gate with private fake-constructor continuations, realm-bound opaque session/run/transport identities and one-shot claims. Synthetic tests cover reentrancy, foreign/cloned handles, irreversible failure, deadline/clock rejection and first-diagnostic retention. The transport handle is identity-only: no accounting, I/O, real-session adoption, auth-ready transition or body receipt is issued. The module remains excluded from npm packaging; formal evidence issuance and public contracts are unchanged/closed.

- Development-only TC-04 fixed-source composition keeps fake bootstrap, pinned Update Set parent, bounded build_name-only release observation and permit-gated metadata/final rereads on the same TC-03 transport. Private post-cleanup JSON projection uses capped scratch and the same owned byte snapshot as accounting; no raw body, token, metadata rows or observer/adoption port is exported. Per-user/cached/exchange premises, configured release fallback, binding/expiry/conflict checks, one-shot stages and cancellation-before-commit are covered by synthetic tests. Payload/table/worker evidence issuance, real sessions, transport, public MCP registration and production caps remain closed/unchanged.

- Development-only TC-03 injected Web Streams adapter connects native read/cancel/captured reader.closed/releaseLock observations to the same TC-02 attempt and budget. A bounded attempt deadline, injected absolute-deadline scheduler and fake-only cleanup reserve stop pending I/O without extending the run clock. Cancellation/rejection/unknown ownership, late responses, reused streams, locked bodies, overshoot and scheduler failure preserve typed cleanup uncertainty and first diagnostics. Body bytes are charged then discarded, never returned as evidence; no global fetch, live transport, production session or formal evidence issuer is activated. Synthetic tests, packaging exclusion and design/verification records are updated.

- Development-only TC-02 composition connects the existing run lifecycle, one private fake C/G/P budget and the TC-01 typed cleanup model. A construction-time lane and one-shot transport claim reject mixing/re-preparation; dispatch, sequenced chunk adoption and modeled payload acceptance share the original clock and readonly lease. Stop revokes before fake abort/worker callbacks, retaining the first primary and independent fixed HTTP/worker cleanup reasons. Synthetic oracles cover overshoot, replay, cancellation, deadline/clock failure and reentrancy. No actual session counters, transport, worker, production evidence issuance or public MCP contracts are changed; the module remains excluded from npm packaging.

- Development-only TC-01 cleanup contract model: opaque, realm-bound purpose/attempt/report handles, strict primitive-observation classification, one-shot terminal consumption, and independent HTTP/worker cleanup slots retaining the first diagnostic. Finalization rejects pending or unconsumed resources; late success cannot repair an unconfirmed/closed run. Synthetic boundary tests cover confirmation forgery, cross-axis/realm substitution, phase/deadline/reentrancy and non-exposure. No real session, accounting, transport or worker is connected, and formal evidence issuance remains disabled; the module is excluded from npm packaging.

- Source-owned ReleasePermit and independent immutable release snapshot bound to the private run owner in prepared-only state, verified with fake I/O. Private-field source verification rejects copied/proxy/foreign sources and permits; mixed bindings stop only the receiving run, while cancellation, close and the original deadline revoke retained bindings. C-mode assertion limitations and the original counters are preserved. Existing permit-gated acquisition remains compatible; source receipts, worker binding, formal evidence issuance and public MCP contracts remain disabled/unchanged. Packaged smoke coverage exercises the same closed boundary.
- Session-private run lifecycle connected to the actual bounded session class and verified with fake I/O: isolated ECMAScript-private auth snapshot, a one-shot ready generation, synchronous revocation before pending I/O cancellation, and a readonly lease over the original clock/C/G/P counters. Fixed frozen diagnostics retain the first failure; no fixture adoption, owner lookup, source/ReleasePermit binding, transport activation or formal evidence issuance is added. Old mutation-by-session lifecycle hooks are removed. Package boundary and fake-dependency regression tests cover the closed boundary; public MCP input/result contracts are unchanged.
- Development-only synthetic run-owner model: opaque diagnostic/session/run/source/permit/binding handles, one-shot run/source claims, immutable synthetic release premises and repeated readonly binding validation. First diagnostics and separate HTTP/worker cleanup axes survive failure/close; late cleanup cannot become confirmed or revive a binding. The independent issuer accepts no real session or transport and has no I/O, worker, timer or counter activation API. Formal evidence issuance remains closed; production lifecycle and public schemas are unchanged.
- Synthetic OAuth→fixed-source→native Worker IPC→strict fixture upper-result E2E coverage. Tests retain the original session clock and C/G/E/R across retries and worker completion, stop both source and worker through a test-only cancellation owner, withdraw provisional comparisons on cancellation/incomplete evidence, and capture child stdout/stderr to verify credential/code non-exposure. Production runtime, public schemas, formal evidence issuance and live transport remain unchanged/disabled.
- OH-03 package-excluded fixed-source adoption reuses the OAuth run's existing adapter, dispatcher, accounting owner and absolute deadlines. A same-module private core accepts only the locally held transport after consuming the pinned one-shot ticket; no arbitrary adapter registration export is added. Initial/final observations, local-failure final skips, reservation release and OAuth retry accounting are covered by synthetic oracles (C=7/8, R=0). Root cancellation withdraws retained delivery; formal evidence/seals, production sessions, live transport and public rule activation remain disabled.
- OH-02 package-excluded OAuth/source transport composition: a fixed dispatcher transfers ownership of the existing Web Streams adapter after observed OAuth cleanup/finally, without a second transport claim or resetting accounting/clock. Private fixture-session lifecycle binding, one-shot tickets, stale-bootstrap rejection and authoritative root cancellation are covered by synthetic tests, including cross-phase Response/stream reuse. The adopted lane only probes the pinned parent's fixed GET and discards its projection; full fixed-source adoption/final reads remain OH-03. No live transport, token use or formal evidence issuance is enabled.
- OH-01 development-only synthetic OAuth handoff model: session-owned one-shot creation/transfer claims and opaque root/destination/ticket/lease handles, reference binding for modeled auth/ready/adapter/budget/dispatcher identities, separate ready/finally states, irreversible rejection and root-controlled revocation. Stale bootstrap operations cannot stop an adopted lease; failed transfers preserve primary diagnostics and reject unknown raw reason strings. No existing fixture or real-session transport is adopted, dispatched or activated.
- Development-only BR-006 worker integration: safe XML/AST preparation computes hashes and bounded current/setAbortAction(true) plans, correlates observations and one-shot comparisons over real Worker IPC, and emits a strict fixture-only upper result. Fixed-source normalized observation delivery is one-shot and disabled on changed/incomplete final checks. Cancellation, protocol failure or unconfirmed termination withdraw provisional candidates while preserving primary diagnostics. Source and compiled-JS tests retain code non-exposure; production worker, public schemas/rules and evidence issuance stay unchanged/closed.
- Development-only BR-006 OAuth bootstrap from a dedicated pre-auth fixture claim, sharing the same C/G/R/clock through confirmed response validation and a one-time auth-ready transition. Fixed synthetic POST descriptor only; token/error text is never returned or retained for use. Separates OAuth rejection, insufficient lifetime, cleaned-up upstream retries/exhaustion, request/phase/hard limits and sticky cleanup uncertainty. No real token exchange, production session enrollment, source handoff or evidence issuance is enabled.
- Development-only BR-006 fixed-source/Web Streams composition: fixed GET descriptors, one-shot safe projections using captured status/time, semantic-unavailable final skips and ordered re-reads share the fixture accounting owner. Extra columns are discarded without refunding bytes/attempts. Stable/changed/unverified summaries never issue seals or production evidence; real source/ReleasePermit, selection/payload/worker provenance remain disconnected.
- Development-only BR-006 Web Streams adapter over an injected Response source: real read/cancel/reader.closed/releaseLock observations feed the fixture state machine and one accounting owner. Uses fixed absolute I/O/cleanup deadlines, bounded scratch, fatal UTF-8 decoding, one-time cleanup and sticky uncertainty; late responses cannot restore receipts. Total empty-read limit is per attempt, not consecutive. No global fetch, production session registration, Worker integration or public evidence issuance is enabled.
- Prepared-only BR-006 final table skips derived from retained initial outcomes or exhausted evidence capacity. Releases only unused reservations once, preserves charged attempts/bytes and continues in fixed table order; includes one-slot release after a final retry becomes unnecessary. Rejects arbitrary successful-table skips, foreign/replayed slots, active I/O, pending bodies and stopped sessions. Synthetic-only; no production evidence issuance or live transport/Worker connection.
- Prepared-only BR-006 fake transport accounting bound one-shot to a registered session and its authentication/source owner. Dispatch and ordered chunk events use the session's existing request/receive/payload counters plus evidence/reservation dimensions; retries and overshoot are never refunded. Legacy GET mixing, late/replayed events and foreign owners are rejected. Fake body text must match charged bytes by digest. No live transport/Worker, production evidence issuance or public rule activation is enabled.
- Development-only BR-006 transport state model with opaque purpose/attempt/cleanup/body handles, injected fake I/O and clock, one-shot consumption, retry/phase checks and sticky cleanup uncertainty. Synthetic tests distinguish cleanup requests from confirmed observations and reject stale/foreign resources; no real transport, budget, Worker, production evidence issuance or public rule activation is connected.
- Prepared-only BR-006 selection-window/row draft handles and payload-start/transfer claims, with owner/session binding, bounded selection/lookahead checks and one-shot fake completion/consumption. Revocation clears private draft data and rejects stale handles; no payload bytes, GETs, worker messages, production receipts or rule/schema activation are added. Mixed-rule selection and real source/body/job provenance remain unconnected.
- Prepared-only BR-006 owner lifecycle bound to each bounded session's private authentication snapshot and single auth-ready generation. Session-owned claims, synchronous stop/close revocation and fixed diagnostics are covered with fake source/permit dependencies; the evidence gate always rejects and no live source/Worker/receipt path is enabled. Includes an internal runtime lifecycle dependency while the fake issuer remains excluded from npm; public rules, budgets and schemas are unchanged.
- Synthetic-only BR-006 final-source orchestration: bounded baseline capture, fixed parent → metadata → table re-reads, local-unavailable continuation and zero-dispatch evidence skips. Stable observations alone can issue an opaque, owner-bound, one-shot synthetic seal; changed/incomplete evidence, cleanup uncertainty, cancellation and global failures cannot. Uses one C/R/G/E ledger throughout; no live transport, Worker, production seal, public rule or result-schema integration.
- Synthetic-only BR-006 initial-source/stream composition with opaque, table-bound one-shot body receipts. Only bounded, UTF-8/JSON-accepted bodies with confirmed synthetic cleanup reach the fixed-source normalizer; retry/overshoot bytes remain charged once. Foreign, cloned, replayed and revoked receipts stop the composition. Final re-read/seal, worker delivery and real transport remain unconnected; no public rule or result changes.
- Synthetic-only BR-006 fixed-source issuer types with session/source/release identity claims, sticky generation rejection, fixed table GET descriptors and bounded normalization. Tests reject duplicate/foreign handles and retries after failure; normalized observations project only required fields. No live ReleasePermit, transport, Worker, budget or final-seal integration.
- Development-only synthetic BR-006 stream harness with per-response/global/evidence byte accounting, bounded retries and abortable reads. Charges excess chunks before rejecting, never refunds failed-body bytes, and retains cancellation/cleanup uncertainty. Independent test-only byte-event oracle checks the accounting; no real transport or Worker connection.
- Development-only pure BR-006 reservation ledger with separate parent/metadata/table quotas, one-shot logical attempts and fixed-order final reads. Ordinary exhaustion preserves reserved capacity; invalid diversion/reuse stops the ledger without refunding attempts. Synthetic tests independently reconstruct C/R/T from event traces. No live transport, byte reader, clock or production permit connection.
- Development-only BR-006 synthetic channel with recursive strict request/response bodies, bounded wire parsing, peer/generation/request/job correlation and irreversible stop diagnostics. Preserves the first typed failure and sticky unconfirmed cleanup; asset-local parse rejections remain separate. No actual Worker/source connection, public result schema change or production authority.
- Synthetic-only BR-006 payload/observation issuance connected to the existing pure comparator. Owner/job-bound evidence is required for a shared one-shot comparison claim; comparison receipts are separate from lifecycle receipts. Rejected comparisons preserve their fixed reason and stop the owner; unavailable/changed results remain unknown, without retries or live authority.
- Synthetic-only BR-006 prepare/initial/final lifecycle with one-shot phase tickets bound to owner/job, separate start/completion, and consumption gated on final completion. Out-of-order, duplicate and failed phases stop the owner without reopening claims. No observed-data validation, live issuer or worker IPC integration.
- Development-only synthetic BR-006 evidence owner/session claim with identity-bound worker jobs, sticky one-shot use and receipt acceptance, and terminal revocation. No live issuer, authentication proof, comparison/IPC integration or MCP registration; npm exclusion remains in place.
- Development-only BR-006 scope-evidence types and a pure comparison building block, with synthetic tests for Global/reference-ID identity, payload-versus-current timing and unavailable evidence. No BR-006 MCP registration, live acquisition, production authority or rule findings; the unconnected module is excluded from the npm package.
- Explicit BR-only `AU-QRY-002` review of full-text query preconditions on locally constructed GlideRecord/GlideRecordSecure receivers. Distinguishes reserved-name two-argument `addQuery` from fixed one-argument `addEncodedQuery` term boundaries, not substrings in search values or ordinary LIKE/CONTAINS searches. Typed index-setting and per-construction follow-ups retain index/search settings and encoded-query validity as unverified; no query execution, index creation or automatic rewrite. Dynamic/mutated/escaping receivers and unsupported query forms remain unresolved. Defaults/budgets unchanged; opt-in ruleset `bp3-0.15`; synthetic verification only.
- Explicit Client-Script-only `AU-CL-005` review of two-argument `setValue` calls on bounded `g_form`-derived receivers. Custom same-name methods and explicit three-argument calls are distinguished; a candidate never proves a reference field, available display value, extra network call or violation. Typed follow-up requires field-type, display-value, clearing intent and UI checks; no extra lookup or automatic argument insertion. Unknown, mixed, mutated or escaping receivers remain unresolved. Defaults/budgets are unchanged; opt-in ruleset `bp3-0.14`; synthetic verification only.
- Explicit Client-Script-only `AU-CL-007` bounded DOM lookup review (`getElementById`, `querySelector`, `querySelectorAll`). Document-derived receivers and locally `createElement`-derived subtrees have distinct typed follow-ups; selector names never establish standard UI ownership, and custom DOM is not automatically a violation. Shadowed/local same-name methods are excluded; unknown, mixed, mutated or escaping receivers remain unresolved. No automatic removal or replacement. Defaults and budgets remain unchanged; opt-in ruleset `bp3-0.13`; synthetic verification only.
- Explicit onLoad-Client-Script-only `AU-CL-003` review of server lookups in the single top-level, parameterless `onLoad` (`GlideAjax` `getXML`/`getXMLAnswer`/`getXMLWait`, client `GlideRecord` `get`/`query`, `getReference`) as data-timing considerations. Each candidate's inputs are classified as static, runtime (form values such as `g_form.getValue`) or unknown, with a matching typed follow-up beside the shared availability/freshness/exposure review; moving data to `g_scratchpad` is not recommended by default, and no sensitive data is added or migrated automatically. Unknown inputs, lookups outside `onLoad`, mixed or escaping receivers, member writes and dynamic members prevent `analysis_complete`. Non-onLoad scripts are skipped as `missing_context`. Defaults/budgets stay unchanged; ruleset `bp3-0.12` only when requested; synthetic verification only.
- Explicit onChange-Client-Script-only `AU-CL-008` review of server lookups that may run during form load. A bounded path analysis of the single top-level `onChange` follows its fourth (`isLoading`) parameter through `!`/`&&`/`||`, boolean `===`/`!==`, if/conditional branches and early returns; lookups on the loading path (`getReference`, client `GlideRecord` `get`/`query`, `GlideAjax` `getXML`/`getXMLAnswer`/`getXMLWait`) are reported, guarded ones are excluded. Typed loading-intent follow-up keeps necessary load-time work as a human check; no automatic `return` or guard is added. Loops/try/switch, nested callbacks, a rebound `isLoading`, missing or duplicate `onChange` and dynamic members stay unresolved and prevent `analysis_complete`. Non-onChange scripts are skipped as `missing_context`. Defaults/budgets stay unchanged; ruleset `bp3-0.11` only when requested; synthetic verification only.
- Explicit Client-Script-only `AU-CL-002` review of bounded server lookups: `g_form.getReference` and client `GlideRecord` `get`/`query` on locally constructed receivers. Typed necessity follow-up keeps call frequency, needed columns, existing client data and UI constraints as human checks; candidates are not judged unnecessary, and no automatic removal or replacement is offered. Mixed, rebound or escaping receivers and dynamic members stay unresolved and prevent `analysis_complete`. Defaults/budgets stay unchanged; ruleset `bp3-0.10` only when requested; synthetic verification only.

## [1.16.0] — 2026-10-25

Adds the read-only best-practice review PoC and its explicit opt-in rules. The review is partial by design: it reports unverified, low-confidence candidates for a bounded subset of an Update Set, and zero or partial findings never establish safety or compliance. Includes the 1.15.1 security fixes.

### Security

- **Dependency updates.** `zod` 4.6.7 (memory exhaustion while validating oversized constrained collections, GHSA-mrhx-c7xc-m3w5), `body-parser` 2.4.0 (denial of service via trailing bytes after a compressed body, GHSA-27r3-jxmh-p828), `fast-uri` 3.1.9 and `ip-address` 10.7.4 (moderate). Development-only `vite` 8.3.5. `npm audit` reports no known vulnerabilities; the native `r2-outer` Cargo.lock has none per OSV.

### Changed

- Package the best-practice review worker and its runtime modules. `acorn` and `saxes` are now production dependencies, with `xmlchars` installed transitively; all installations gain these dependencies and the package size increases. Development-only evaluation harnesses and the BP-2 search PoC are excluded.

### Added

- Explicit Client-Script-only `AU-CL-006` review of bounded g_form mandatory/visibility/read-only controls as UI Policy considerations. Typed suitability follow-up retains complex logic and UI compatibility as human checks, not blanket violations or automatic migrations. Defaults/budgets stay unchanged; synthetic verification only.
- Explicit stored-`before_display`-only `AU-BR-007` review of bounded current property writes and field setters, with typed persistence-intent follow-up. Display-only changes are not confirmed violations; unknown write evidence prevents complete analysis. Default rules and budgets stay unchanged; synthetic verification only.
- Explicit before-BR-only `AU-BR-005` review of possible calls/property writes after `current.setAbortAction(true)`, with bounded receiver/order, if-branch and early-return handling. Necessary post-processing is never a confirmed violation or an automatic return fix. Unresolved paths prevent complete analysis. Defaults/budgets remain unchanged; synthetic verification only.
- Explicit BR-only `AU-BR-004` review of script-level variable declarations, with function/block-local exclusion and typed sharing-intent follow-up. Global-table, ordinary-table and unknown contexts are distinct; intentional sharing is never automatically approved. Defaults/budgets remain unchanged; synthetic verification only.
- Explicit `AU-QRY-001` opt-in for BR payloads: bounded GlideRecord/GlideRecordSecure receiver analysis detects literal `LIKE` in three-argument `addQuery`, not encoded-query LIKE. Unresolved query evidence prevents complete analysis; default three rules, existing budgets and source-free output remain unchanged. Synthetic verification only; no new PDI validation.
- Opt-in `selection_mode=review_targets` for best-practice review: fixed update/name candidate selection and a versioned 0.3 aggregate with explicit incomplete-inventory warnings. Omitted/`bounded_all` retains 0.2 behavior; record, receive and 60-second budgets are unchanged. Synthetic tests and read-only PDI E2E confirm BR payload-analysis reachability. A separately authorized inactive synthetic Client Script fixture confirms an AU-CL-004 candidate via the MCP; fixture source, Customer Updates and Update Set are removed while platform version history is retained. UI execution and independent quality evaluation remain unverified.
- Read-only PoC MCP tool `review_update_set_best_practices` in `full` and `platform_developer` (503 tools total). Strict sys_id/rule/record-budget inputs, session-pinned credentials, bounded payload-only analysis, source-free JSON, fixed errors and MCP cancellation propagation. Australia, three default rules and explicit BR-only QRY-001/BR-004/BR-005/BR-007 plus Client-Script-only CL-006 opt-ins; rules and independent human quality evaluation are unapproved. Existing tools retain their behavior.
- Internal 50/55-second acquisition/verification cutoffs retain analyzed results and label unprocessed rows before the unchanged 60-second hard deadline. Hard deadline, cancellation and internal contract failures still return fixed errors without partial results.

### Tests

- Verify the actual npm tarball in an isolated production-only installation: the fixed JavaScript worker must parse and aggregate synthetic input without tsx, TypeScript or Vitest. Run with `npm run test:pack`; the same check runs before publication.
- Synthetic server/router tests and in-memory MCP SDK calls cover registration, strict JSON/runtime input validation, client/credential separation, fixed diagnostics, partial/error flags and cancellation. The packaged tool is also called through the compiled server handlers using synthetic settings/HTTP only.
- Read-only PDI review E2E: two bounded collection/aggregation cases passed; one payload-analysis case explicitly skipped because eligible BR updates were outside the first 100 metadata rows. Results remain partial with truncation and incomplete-analysis warnings; no code or record writes. See `docs/E2E_BEST_PRACTICE_REVIEW_2026-10-18.md`.
- Follow-up target-selection PDI E2E: all five checks passed without skips. Opt-in 0.3 reviewed ten existing BRs; omitted-mode 0.2 behavior remained compatible. Code was not displayed, and no records were written. See `docs/E2E_BEST_PRACTICE_TARGET_SELECTION_2026-10-18.md` for limitations and untested cases.

## [1.15.1] — 2026-10-22

Security-only patch on top of 1.15.0. It contains no other changes from the development branch.

### Security

- **HTTP transport: a malformed `Host` header could stop the server.** The handler used the untrusted `Host` as the base for URL parsing before authentication, and the listener did not catch the resulting rejection. Malformed `Host` values and request targets now return a fixed `400` without reflecting input, routing uses a fixed base, and the listener converts any handler rejection into a fixed `500` (or closes a response already in progress).
- **`trend_query`: unbounded `periods` could block the event loop.** `periods` must now be an integer from 1 to 120 (schema and runtime). Omitting it still uses 6.
- **Excel import: huge or sparse row numbers could block the event loop.** Worksheet row numbers are limited to 1–1,048,576 for explicit, inferred and cell-reference rows, and only populated rows are traversed.
- **Portal widgets: `create_portal_widget` / `update_portal_widget` now require `SCRIPTING_ENABLED=true`** in addition to `WRITE_ENABLED=true`, because widget templates and scripts are executable definitions.
- **Import Set tools could write to arbitrary tables.** `create_import_set_row` and `import_excel_to_import_set` now verify through `sys_db_object` that `staging_table` extends `sys_import_set_row` before any read or write.
- **Transform Maps could be run against unrelated Import Sets.** `run_transform_map` and the optional transform in `import_excel_to_import_set` require 32-character sys_ids, an Import Set on a verified staging table, and an active map whose `source_table` equals that staging table. They additionally require `SCRIPTING_ENABLED=true` when the map targets a protected platform table (`sys_*`, `sp_*`, `sysauto*`, `sysevent_script*`, `oauth_*`, `discovery_credential*`, `ecc_*`, or an empty/malformed target), has `run_script` enabled, has a transform script, or has a field map that uses a source script.

### Changed (behavior restrictions from the fixes above)

- `trend_query` rejects `periods` values that were previously accepted implicitly, such as `0`, `null`, strings, fractions and values above 120, with `INVALID_REQUEST`.
- Metadata-only widget updates and empty widget creation, previously possible with `WRITE_ENABLED` alone, now also require `SCRIPTING_ENABLED`.
- Import Set staging tables that do not extend `sys_import_set_row`, and Transform Map / Import Set pairs that do not match, are rejected with `VALIDATION_ERROR`.
- `run_transform_map` and the Excel import's optional transform no longer claim that the transform ran. They create the `sys_import_set_run` record as before, but return `transform_started: "not_verified"` with a `note`, because starting a transform this way has not been verified on an instance.

## [1.15.0] — 2026-10-17

### Changed

- **`list_job_run_history` now reads scheduler aggregates** from `sys_scheduler_job_history` (count / average / max duration per classification and time window). The previous table did not exist. `job_sys_id` and status filters are rejected with `INVALID_REQUEST`; filter by `job_classification` instead. `limit` must be an integer from 1 to 1000.
- **Mobile tools aligned with the instance schema.** Configs, applets and layouts read `sys_sg_mobile_application`, `sys_sg_screen` and `sys_sg_screen_m2m_ui_element`. `configure_offline_sync`, `send_push_notification` and `get_mobile_analytics` now fail with `UNSUPPORTED_OPERATION` instead of writing state tables or returning invented usage counts.

### Fixed

- **The per-call `instance` argument was passed through to the tool.** docs/MULTI_INSTANCE.md says `instance` can be passed to any tool, but the server forwarded it with the tool's own arguments. Tools with strict argument checks (`list_job_run_history`, `list_mobile_applets`, `create_problem`, `create_csm_case`, `create_security_incident`) rejected the call, and tools that forward their arguments as record fields could send `instance` to ServiceNow. The server now consumes `instance` to choose the client and removes it before the tool runs.
- **Tools that read tables missing from the instance** now use the real tables:
  - ATF results: `sys_atf_test_result` (by `parent`).
  - PA jobs: `sysauto_pa`.
  - VA categories: `sys_cb_topic_category`.
  - Subflows: `sys_hub_flow` with `type=subflow`.
  - Process automation: `sys_pd_process_definition`.
  - Workspaces: `sys_aw_master_config`.

### Tests

- E2E reads with no data on the instance are now reported as explicit skips. With `E2E_READ_FIXTURES=true` (plus `WRITE_ENABLED=true`, PDI only), disposable fixtures are created for five reads that had no data, and their deletion is verified.

## [1.14.2] — 2026-10-17

### Fixed

- `list_integration_parameters` now masks labels such as `API Key` and `API-Key`
  even when the parameter name is neutral and its type is string. Previously
  only `apikey` / `api_key` matched, so these plain-text values could be returned
  in definition and instance scope. Found with disposable dummy values on the PDI.
- **Secret masking now covers the other common credential labels.** Scanner integrations name credentials in many ways; `Access Key`, `Client Key`, `Signing Key`, `Subscription Key`, `Shared Key`, `Passphrase`, `Pass code`, `Auth Token`, `Authorization`, `Bearer`, `Key Secret`, `Certificate Key`, `PIN` and cookie-style labels are now masked as well. `PIN` is matched as a whole word with any non-alphanumeric character — including `_` — as the boundary, and camelCase and acronym names are also judged word by word, so `user_pin`, `pin_code`, `userPin` and `PINCode` are masked while `Pinned version`, `Spinner delay` and `Ping interval` stay visible (a first cut used `\bpin\b`, which treats `_` as part of the word and let `user_pin` / `pin_code` through; found in review with a dummy value). A bare `key` or `auth` is deliberately not matched, so ordinary settings such as `Primary key field` and `Authentication type` stay visible. The decision lives in one exported function, `isSecretParameter`, which the live E2E now imports instead of keeping its own copy of the pattern. On the PDI's real parameters exactly the two `API Key` credentials are treated as secret and none of the 21 ordinary settings are hidden.
- **`list_integration_parameters` no longer lets a query reveal a masked value.** Its free-form `query` was passed through, so a caller could filter or sort on the value column (`valueSTARTSWITHa`, `ORDERBYvalue`) and recover a masked secret one character at a time from which rows came back. Any query term on `value`, `default_value` or `password_value` — including dot-walks such as `configuration.default_value` and `OR` / `NQ` / `ORDERBY` terms — is now rejected with `VALIDATION_ERROR`; queries on metadata columns are unaffected. Verified live.

### Added

- `USEM_E2E_FIXTURES=true` opt-in for the USEM configuration read suite creates
  inactive classification/exclusion rules and a dedicated integration with an
  inactive implementation and dummy parameter values. Requires WRITE_ENABLED
  and a PDI URL; created records are deleted and absence verified on completion.
  Covers the four previously skipped detail/masking cases.
  Live PDI: 37 passed, 0 skipped, 0 failed; all 12 disposable records removed and
  verified absent. Normal suite: 1,690 passed. Details in
  `docs/E2E_USEM_READ_2026-10-14.md` (2026-10-17 follow-up).

---

## [1.14.1] — 2026-10-14

### Fixed

- **Looking a record up by number could return a different record — in every module.** Record numbers are not guaranteed unique: on the PDI the Vulnerable Item counter had wrapped into demo data, so three items were numbered VIT0010001 and `get_finding_grouping_status` silently diagnosed a closed 2022 demo item instead of the one just created. All 30 number lookups now go through `findOneByNumber`, which fails with the new code **`AMBIGUOUS_NUMBER`** — listing the candidates' sys_ids, created dates and short descriptions, newest first — when a number matches more than one record; a sys_id still bypasses the lookup.
  - USEM / VR / security: `get_vulnerable_item`, `get_remediation_task`, `get_vulnerability_group`, `get_remediation_sla` (VI / legacy RT / group), `get_group_sla`, `get_integration_run`, `get_security_incident`, `get_vulnerability`, and the VI/RT arguments of `get_finding_grouping_status`, `list_remediation_task_findings` and `add_vi_to_remediation_task`.
  - All other modules (a sweep of `src` for queries on a number column found 21 more): `get_incident`, `get_problem`, `get_change_request`, `get_task`, `get_knowledge_article`, `get_request`, `get_request_item`, `get_hr_case`, `get_csm_case`, `get_discovery_run`, `get_risk`, `get_grc_indicator`, `get_compliance_policy`, `get_compliance_control`, `get_policy_exception`, `get_grc_issue`, `get_audit_engagement`, `get_audit_control_test`, and the alert tools (`get_alert`, `acknowledge_alert`, `close_alert`, `update_alert`). The write tools among them — `schedule_cab_meeting`, `retire_knowledge_article` and the alert actions — previously acted on whichever record came first; they now change nothing when the number is ambiguous.
  - `get_discovery_run` interpolated a non-sys_id `run_id` into the encoded query without sanitising it; the lookup now strips `^` like every other one. The `number=X^ORsys_id=X` form used by several tools lost its redundant `^ORsys_id` branch (a sys_id is already handled before the number lookup).
  - Tests: one per tool for an ambiguous number and one for a unique number (23 of the new cases fail on the previous code), plus the write-tool cases. Verified live against the duplicated number; the full live E2E suite passes (18 files, 201 passed, 0 failed, 19 skipped for absent plugins or data).
- **`create_vulnerable_item` reports fields a business rule overwrote.** The tool accepted `short_description`, but the "Update short description" business rule regenerates it on insert as `<vulnerability> detected on <CI>`, so the value never stuck and nothing said so. The result now carries `overwritten_fields` (sent vs stored) and a `warning` that points to `source` for tagging items; the parameter description says the same.
- **The documented remediation task rule example could never match.** Its condition selected items by a test string in `short_description` (`STARTSWITHMCP-UI-E2E-`), but the value given at creation is replaced by the generated text above, so it never matched; it now uses `source`. (A condition on the generated text, such as the CVE id, does match.) This is why the 2026-09-15 test rule grouped nothing. With the condition on `source`, grouping was verified end to end on the PDI: three Vulnerable Items for one CVE, two assigned to Network and one to Database, were grouped into two remediation tasks — one per assignment group — by the "Link to Remediation Tasks" business rule, triggered through REST. The test tasks and links were deleted afterwards; the test items, which cannot be deleted cross-scope, were closed.
- `get_finding_grouping_status` no longer claims that REST-origin inserts do not trigger grouping (they do, as do REST updates that change the CI, state, vulnerability or number); its diagnosis now explains that a condition on a test string supplied in short_description at creation never matches, and that items created before a rule was activated need a qualifying update to be re-evaluated.

---

## [1.14.0] — 2026-10-14

### Fixed

- USEM rule readback preserves comma order in ordinary strings; only `applies_to`
  list values are compared without regard to order. `set_usem_rule_active` now
  reads back `active` and returns `FIELDS_NOT_SAVED` if the toggle was discarded.
- `list_remediation_sla` now includes `sys_id` for VI, legacy RT and group records,
  so list results can be used with the SLA detail tools. Populated PDI records
  exposed the missing identity column in the existing read-only E2E suite.
- **Remediation task rules that assign by field ("Group by field") can now be created and updated.** `create_usem_rule` / `update_usem_rule` sent `assignment_group_fields` through the Table API, which never stored it: the field is a choice field with no `sys_choice` rows (the workspace builds its options from `field_1`–`field_6` at runtime), and the Table API ignores any value outside a choice list while still answering 200. The rule was saved with `assignment_type` 5 and an empty group-by field, so it could not assign anything. Re-investigated live after a USEM upgrade (`sn_vul` 30.8.7; `sn_sec_rem` 31.0.12, which owns the table, unchanged): not read-only, no field ACLs, business rules or data policies, and both `GlideRecord` and `GlideRecordSecure` persist the value — the drop is the Table API's choice validation, reproduced on an out-of-list `incident.category`. The tools now send every other field over REST, set `assignment_group_fields` from a run-once server script (requires `SCRIPTING_ENABLED=true`; the value must be a field path), and read the rule back. Verified on the PDI: create, change and restore the group-by field on an inactive rule.
- **Every USEM rule write is now read back** and fails with the new code `FIELDS_NOT_SAVED` — naming the field, the value sent and the value stored — when ServiceNow dropped something. Readback normalises the forms ServiceNow returns (booleans and numbers as strings, a trailing `^EQ` on conditions, the order of the `applies_to` list, reference objects). It immediately caught a second silent drop: `remediation_target` allowed and listed `order`, but `sn_sec_wf_ttr_rule` has no such column, so `order` was always discarded and lists were sorted by a column that does not exist. `order` is removed for that rule type and its lists are sorted by `name`. A sweep of all 16 rule types against the PDI's dictionary found no other allowlisted field without a column.
- `create_usem_rule` / `update_usem_rule` accept the remediation grouping configuration (`applies_to`, `description`, `assignment_type`, `assignment_group_fields`, `field_1`–`6`, `table_1`–`6`, `extended_table_1`–`6`) through an explicit allowlist that keeps system and lifecycle columns such as `marked_for_deletion` out.

### Added

- USEM read-only E2E for all 16 rule types, list/detail/filter consistency,
  risk-calculator relationships and exact-name lookup, integration parameter
  parent filters and secret masking. Cases without suitable data explicitly skip.
  PDI run: 50 passed, 4 skipped across new and existing USEM read suites;
  see `docs/E2E_USEM_READ_2026-10-14.md` for the missing fixtures and limitations.

---

## [1.13.2] — 2026-10-07

### Security

- **Two new advisories in transitive dependencies; `overrides` floors raised** (repository `npm audit`: 2 → 0).
  - `proxy-addr` → `^2.0.8` (critical, [GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h): IP spoofing through an IPv4-mapped IPv6 address matching a trusted subnet). Reached through the MCP SDK's `express`. This server does not use `express` — the HTTP transport is built on `node:http` and never consults `trust proxy` — so the vulnerable path was not reachable here.
  - `source-map-js` → `^1.2.2` (high, [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q): event-loop DoS via indexed source-map sections). Dev-only, through `vitest` / `vite` / `postcss` and `@vitest/coverage-v8`.
  - Users of the published package were not exposed: both fixes fall inside the ranges the parents declare (`express` asks for `proxy-addr@^2.0.7`), so a fresh install of 1.13.1 already resolves `proxy-addr@2.0.8` and `npm audit` reports 0. The floors make the repository's lockfile match.
  - Verified: type-check, lint, build, 1611 unit tests and coverage.

### Fixed

- **A create that timed out could create the record several times.** The client retried every request the same way — on a timeout, a dropped connection or a 5xx — including `POST` and `PATCH`. When ServiceNow had already applied the first attempt and only the response was late, each retry created another record (or appended another work note). Reproduced live with a 300 ms budget on `createRecord('incident', …)`: the previous client created **4 incidents** for one call and reported it as failed; the fixed client creates 1. Found through a stray `[E2E …] incident create/update test` incident left on the PDI by a passing E2E run — the test deleted the record it was handed, not the duplicate.
  - Only repeatable methods (`GET`, `HEAD`, `OPTIONS`, `DELETE`) are retried after an ambiguous failure. `POST` / `PATCH` / `PUT` are retried only when the server certainly did not process the request — HTTP 429 (now error code `RATE_LIMITED`) or a connection that was never established (`ECONNREFUSED`, `ENOTFOUND`, `EAI_AGAIN`). Otherwise they fail with the new code **`OUTCOME_UNKNOWN`**, whose message says the change may already have been applied and should be checked before it is sent again — so an AI client does not blindly repeat the create.
  - `403` is no longer retried for any method.
  - A `DELETE` that is retried after a timeout and then gets `404` resolves as success: the first attempt deleted the record.
  - Token requests and attachment uploads have their own fetch calls and were never retried; unchanged.
  - Nine unit tests cover the policy; five of them fail on the previous client. 1620 unit tests pass, and the write and Excel E2E suites pass against the PDI with nothing left behind.

---

## [1.13.1] — 2026-10-04

### Changed

- Dependencies: `chalk` 5 → 6 and `commander` 14 → 15. Their breaking changes are already met here — both now require Node 22 (this package requires 22.12 since 1.12.0) and `commander` 15 is ESM-only (this package is ESM). `commander` 15 also changes how a default is derived when both `--foo` and `--no-foo` are defined; the CLI defines no `--no-*` options. In range: `@modelcontextprotocol/sdk` 1.32, `dotenv` 18.0.5; dev: `vitest` / `@vitest/coverage-v8` 5.0.3, `eslint` 10.12, `globals` 17.13, `@types/node` 22.20.5.
  - Verified: type-check, lint, build, 1611 unit tests; the CLI by hand (`--version`, `--help`, `auth --help`, `instances list`, an unknown command and a missing argument both exit 1 with commander's message, `FORCE_COLOR` output is coloured); and stdio sessions both on `dist/server.js` and through the launcher's `server` subcommand (initialize, `tools/list` = 502, `prompts/list` = 11, `resources/list` = 6, tool calls). `npm audit`: 0.
- Still held back: TypeScript 7 — `typescript-eslint` 8.71 still declares `typescript <6.1.0`.

---

## [1.13.0] — 2026-10-04

### Security

- **`exceljs` is no longer a runtime dependency, which removes the `uuid` advisory from installs of the package** ([GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq)). The `overrides` added in 1.11.6 only apply inside this repository — npm ignores a dependency's `overrides` — so every install since then still resolved `exceljs`'s `uuid@^8.3.0` and `npm audit` reported it to users; the 1.11.6 note claiming 0 vulnerabilities was true only for the repository. `import_excel_to_import_set` now reads workbooks with `src/utils/xlsx.ts`, a read-only parser with no third-party code: the ZIP central directory is validated before anything is inflated (same limits as before), only the parts the workbook references are inflated with `node:zlib`, each bounded by its declared size and checked against the stored length and CRC-32; encrypted entries, duplicate entry names and relationship targets that leave the package are rejected; XML is read by a small tokenizer that refuses any DTD, so entity expansion and external entities are impossible.
  - Installing the package: 231 → 137 packages, `node_modules` 65 MB → 31 MB, `npm audit` clean (measured from `npm pack` output in an empty project). `exceljs` stays as a devDependency because the tests build their fixtures with it, which also cross-checks that workbooks written by exceljs read back identically.

### Changed

- **Rows after a blank row are now imported.** The exceljs-based parser counted the populated rows and then read that many rows from row 2, so a blank row in the middle silently dropped the same number of rows from the end. Every row after the header is now read.
- **A formula in the header row is rejected**, like formulas in data rows already were. Previously the formula's cached result silently became the column name.
- Cells using the CJK built-in date formats (numFmt ids 27–36 and 50–58, e.g. ja-JP 31 `yyyy"年"m"月"d"日"` and 57/58 Japanese era dates) are imported as dates; exceljs had no format codes for these ids and returned the raw serial number (e.g. `45000`). Phonetic guide text (furigana, `<rPh>`) in shared strings is excluded, and `_xHHHH_` escapes (Excel writes a carriage return as `_x000D_`) are decoded.
- Everything else is unchanged: a 29-workbook comparison suite (dates incl. the 1904 system, custom and Japanese-era formats, rich text, hyperlinks, error values, Japanese text, empty cells, multiple sheets, every validation error) produced byte-identical output from the old and new parser apart from the two changes above. The live Excel → Import Set E2E passes against the PDI.

---

## [1.12.1] — 2026-10-04

### Security

- **Four advisories in transitive dependencies, fixed by raising the `overrides` floors** (`npm audit`: 4 → 0). None is in code this project calls directly.
  - `brace-expansion` (high) — [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) and related DoS advisories via uncontrolled recursion. Reached through `exceljs` (`archiver` / `unzipper` → `glob` → `minimatch` 3 and 5). Floors: `minimatch@3` → `^1.1.21`, `minimatch@9` → `^2.1.7`, and a new `minimatch@5` → `^2.1.7` entry — `minimatch` 5 had no override, so its `brace-expansion` 2.x line was never pinned.
  - `hono` → `^4.13.13` ([GHSA-hxh3-vqpv-xpqv](https://github.com/advisories/GHSA-hxh3-vqpv-xpqv), `hono/jsx` XSS; the MCP SDK's HTTP transport uses `hono`, not `hono/jsx`).
  - `ip-address` → `^10.7.3` ([GHSA-j6r3-76f7-8jcv](https://github.com/advisories/GHSA-j6r3-76f7-8jcv) cross-family subnet match, [GHSA-h3mg-xc3c-68pw](https://github.com/advisories/GHSA-h3mg-xc3c-68pw) unbounded diagnostic; via the SDK's `express-rate-limit`).
  - `fast-uri` → `^3.1.8` ([GHSA-hrr3-gc8f-f4qj](https://github.com/advisories/GHSA-hrr3-gc8f-f4qj) host case normalization; via `ajv`). Kept on 3.x, the line `ajv` declares.
  - Verified: type-check, lint, build, 1592 unit tests, an `exceljs` zip write/read, and the Streamable HTTP transport run for real on localhost (401 without or with a wrong bearer token, `initialize` and a session `tools/list` of 502 tools with the right one). `npm audit signatures`: all verified.

---

## [1.12.0] — 2026-09-29

### Changed

- **Node.js 20 is no longer supported; the minimum is now 22.12.** Node 20 reached end-of-life in April 2026. `engines.node` is `>=22.12.0`, the `servicenow-mcp` launcher refuses older runtimes with a bilingual message (it previously checked for 20), CI tests Node 22 and 24 (was 20 and 22), and the README, `docs/INSTALLATION.md`, `docs/CLIENT_SETUP.md` and every `clients/*/SETUP.md` say 22.12+. MCP client configs need no change — only the Node binary they launch.
- Dev: **vitest 4 → 5** and `@vitest/coverage-v8` 5, which require Node `^22.12 || ^24 || >=26` and were held back in 1.11.8 for that reason. No test or config changes were needed: 1592 unit tests, type-check, lint, build and coverage pass on Node 24, and all read-only live E2E files pass against the PDI.

### Fixed

- The E2E test for `get_mid_server_health` read `servers.records[0]`, but `list_mid_servers` returns its rows as `mid_servers`; it crashed as soon as the PDI had a MID server (until then it returned early). It now uses `mid_servers` and checks the health result refers to that server.

---

## [1.11.8] — 2026-09-29

### Fixed

- **The stdio server wrote a non-JSON line to stdout whenever a `.env` file was present.** `dotenv` 17 prints `◇ injected env (N) from .env // tip: …` to **stdout** by default, and stdout is the MCP stdio transport, so a client started from a directory with a `.env` received that banner as its first frame (strict clients reject it as a protocol error). `src/server.ts` now calls `dotenv.config({ quiet: true })`, as the E2E setup already did. A new test spawns the real entry point from a directory with a `.env` and asserts the first stdout line is the JSON-RPC `initialize` response; it fails on the previous code. Found while evaluating the `dotenv` 18 upgrade, whose release notes move that banner to stderr.

### Changed

- Dependencies: `zod` 3 → 4 (only the MCP SDK uses it; the SDK accepts `^3.25 || ^4.0`), `dotenv` 17 → 18, `@modelcontextprotocol/sdk` 1.29 → 1.31, `@inquirer/prompts` 8.7, `ora` 9.4.1; dev: `eslint` 9 → 10 (flat config unchanged), `typescript-eslint` 8.71, `tsx` 4.23, `globals` 17.12, `@types/node` 22.20. Verified with type-check, lint, the unit suite and a live stdio session (initialize, `tools/list` = 502, `tools/call`, `prompts/list`, unknown tool and unknown method). `npm audit`: 0.
- Held back on purpose: **TypeScript 7** — `typescript-eslint` 8.71 declares `typescript >=4.8.4 <6.1.0`, so lint would run on an unsupported compiler; **vitest 5 / `@vitest/coverage-v8` 5** — they require Node `^22.12 || ^24 || >=26`, while `engines` is `>=20.19` and CI still tests Node 20; `@types/node` stays on 22 to match the supported floor.

---

## [1.11.7] — 2026-09-26

### Added

- Read-only E2E suites for Smart Query, USEM SLA/approval/integration/configuration,
  Now Assist metadata, and the public Store catalog. PDI validation: 21 passed,
  4 explicitly skipped for absent VI/RT/group fixtures; no write or AI invocation.
  See `docs/E2E_READ_COVERAGE_2026-09-26.md` for the tested behaviors and limitations.

### Changed

- **`list_active_events` now returns only unprocessed events by default** (`em_event.state` Ready or Error), newest first. It used to return the oldest rows of the whole `em_event` table with no state filter, so the "active" in its name was not true: on the PDI all 31 events were `Processed`, i.e. already turned into alerts. A new `state` parameter takes `unprocessed` (default), `Ready`, `Processed`, `Error`, `Ignored` or `all`; a state clause inside `query` still wins over the default. Callers that relied on the old behaviour pass `state: "all"`. For the alerts operators act on, use `list_alerts`.

---

## [1.11.6] — 2026-09-24

### Security

- **`uuid` pinned to `^11.1.1` under `exceljs`** ([GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq), moderate: missing buffer bounds check in `v3`/`v5`/`v6` when `buf` is passed). `exceljs@4.4.0` (latest) still declares `uuid@^8.3.0`, and `npm audit fix --force` would have downgraded `exceljs` to 3.4.0. The override is scoped to `exceljs` and stays on 11.x because `uuid` 12+ is ESM-only while `exceljs` loads it with `require('uuid')`. `exceljs` only calls `v4()` (conditional-formatting extensions), so the vulnerable code path was not reachable here; the pin removes the advisory regardless. Verified by writing and re-reading a workbook that exercises that path. `npm audit`: 0 vulnerabilities. *(Correction, see Unreleased: that count was for the repository only — npm does not apply a dependency's `overrides`, so installs of the package still reported the advisory until `exceljs` was removed.)*

---

## [1.11.5] — 2026-09-22

### Fixed

- **`create_epic` / `update_epic` / `list_epics` used a `project` column that `rm_epic` does not have.** A `project` value was silently dropped on create/update, and `list_epics` with `project` matched nothing. Epics on Agile Development 2.0 group by `product` (cmdb_model), `theme` (scrum_theme) and `parent_epic`; the tools now take and filter on those, and reject `project` loudly like any other undeclared field. Found when Agile Development was installed on the PDI: the other eight Agile tools passed their live round trip unchanged.

### Added

- **Event Management alert tools** (`src/tools/event-management.ts`, in the `itom_engineer` package). Until now the only Event Management tool read `em_event`; operators work on alerts. `list_alerts` (not-Closed by default, most severe first; filters on severity, state, acknowledged, CI, source, assignment group, unassigned, without incident, plus a free encoded query), `get_alert` (by number or sys_id, with `em_alert_history`, `em_alert_related_task` links and child alerts), `get_alert_summary` (counts by severity/state/acknowledgement and top sources via aggregates), `acknowledge_alert` (sets `acknowledged=true`, exactly what the product's "Acknowledge" action does; already-acknowledged alerts are reported, not re-written), `close_alert` (`state=Closed`, which the product also acknowledges when `evt_mgmt.alert_ack_on_close` is on; refuses Closed alerts), and `update_alert` (assignment, work notes, maintenance, description, KB — state changes are routed to the two dedicated tools). Column names, state/severity choices and the action semantics were taken from the installed plugin's dictionary and UI actions and verified live, including on a throwaway alert; E2E covers the read set and the update → acknowledge → close cycle.
- Live E2E for the six Agile write tools (epic → story → scrum task chain, updates, list-by-story, cleanup), gated on the `rm_*` tables.

---

## [1.11.4] — 2026-09-22

### Fixed

- **`execute_background_script` POSTed to an endpoint that does not exist** (`/api/now/sp/background_script`) and always returned `failed: Requested URI does not represent any resource`. ServiceNow has no REST endpoint that runs server script synchronously (`sys.scripts.do` is a UI page behind a session and CSRF token), so the tool now uses the one path the Table API offers: the script is wrapped in a function inside a run-once `sysauto_script`, the scheduler runs it (normally within seconds), and its return value or exception comes back through `syslog`. `return <value>;` is the way to get data out; results are JSON, capped at ~3.5 KB (`truncated: true` beyond that). Runtime exceptions are still reported as `action: 'failed'` with the server-side message and stack rather than thrown, as before. `wait_seconds` (0–120, default 30) bounds the wait; if the scheduler has not run the job in time the tool returns `script_scheduled` with the job instead of guessing. The job is deleted once its result is read.
  - The `scope` parameter is gone: the Table API cannot set `sys_scope` on a `sysauto_script` (the record is created in global regardless), so it never did anything. Scripts run in the global scope as the integration user; scoped tables and APIs are reachable subject to their application access.
  - Verified live: a GlideRecord read returned as an object, a thrown `TypeError` reported with message and stack, a scoped `sn_vul_*` aggregate, and a script with no return (`result: null`) — 10–18 s round trips, no jobs left behind. Two E2E tests cover the value and exception paths.
- The run-once-job-plus-syslog mechanism now lives in `src/utils/script-job.ts`, shared by `execute_background_script` and `scan_vulnerabilities` (`run_security_playbook` keeps its own `sys_pd_context` polling).

---

## [1.11.3] — 2026-09-20

### Fixed

- **All five outbound SOAP Message tools targeted the wrong tables and could not work.** `list_soap_messages`, `get_soap_message`, `list_soap_message_functions`, `create_soap_message`, and `create_soap_message_function` read from and wrote to `sys_web_service` / `sys_web_service_function`. `sys_web_service` is the *inbound* Scripted Web Service table (it has `script` and `wsdl_compliance`, no endpoint or authentication columns), and `sys_web_service_function` does not exist at all. The outbound tables are `sys_soap_message` and `sys_soap_message_function`, linked by `soap_message`.
  - `list_soap_messages` silently returned inbound scripted web services; `get_soap_message` and `list_soap_message_functions` threw `Invalid table`; `create_soap_message` wrote `endpoint`/`namespace`/`active` into a table that has none of those columns, so ServiceNow discarded them and created an unrelated inbound record; `create_soap_message_function` threw.
  - Now targets the correct tables and only the columns that exist on them. This corrects the input schemas of the two write tools: `create_soap_message` requires only `name` (the endpoint URL belongs to each function, not the message), and `create_soap_message_function` takes `function_name`, `soap_endpoint`, `soap_action`, and `envelope` — the previous `name`, `active`, and `soap_message_template` had no backing column. Nothing could have depended on the old contract, since none of it ever reached a real SOAP Message record.
  - Caught by the new live E2E coverage, not by the unit tests: the mocks had been written to the same wrong table names, so they agreed with the bug. Their expectations now assert the real tables and columns.
- **`list_security_playbooks` queried a table that does not exist.** It read `sn_si_playbook`, which is not part of Security Incident Response or any other plugin, so it threw `Invalid table` even on an instance with SIR installed. SIR playbooks are Process Automation Designer definitions in `sys_pd_process_definition`, shipped in the `sn_si_aw` (Security Incident Analyst Workspace) scope — the stock Malware, Phishing, and Failed Login templates. The tool now queries that table scoped to `sn_si_aw`; the old `category` filter (no such column) is replaced by a label/name `query`. Surfaced the moment SIR was installed on the PDI: the plugin-presence gate had been treating the missing table as "plugin absent", which is exactly the blind spot such a gate has for a misspelled table.

- **`run_security_playbook` inserted into a table that does not exist and could never start anything.** It wrote `{playbook, incident, ...parameters}` into `sn_si_playbook_execution`, which is not a table. Rebuilt to do what the SIR Analyst Workspace does (`sn_si_aw.AnalystWorkspaceSIRUtil.startPlaybooks`): resolve the playbook to a `sys_pd_process_definition` in the `sn_si_aw` scope, refuse drafts and inactive definitions, refuse a duplicate while an execution for that playbook is still queued/in progress on the incident (`sys_pd_context`), then start it via `sn_playbook.PlaybookExperience.triggerPlaybook('<package source>.<name>', incidentGr)` from a one-time `sysauto_script` — the same mechanism `restore_archived_record` uses. Optional `wait_seconds` polls `sys_pd_context` and returns the execution.
  - **Now a Scripting-tier tool** (`SCRIPTING_ENABLED=true`), since it executes server-side script; it was Write-tier before. `playbook` accepts a sys_id or scoped name (`playbook_sys_id` still works as an alias); the old `parameters` object is gone — `triggerPlaybook` takes none and the values were only ever spread into the phantom row.
  - Three things learned live and encoded: the API wants the fully qualified name (`sn_si_aw.security_incident_malware_manual_template_v1` — the bare `name` is rejected as "missing or inactive"); the five stock SIR playbooks are shipped as `status=draft` templates that the product itself filters out, so the tool rejects them up front (`CONFLICT`) instead of scheduling a script that fails server-side; and between scheduling and execution a repeat call used to queue a second job, so a pending job for the same incident + playbook now returns `already_scheduled` (the job is keyed on the two sys_ids because `sysauto_script.name` is capped at 100 characters and a name built from the scoped name was being truncated, which silently defeated the lookup). The job is deleted once its execution has been observed.
  - Verified live against a published copy of the Automated Malware template: draft rejection, scheduling with the exact product start call for the incident, `already_scheduled` on a repeat call with exactly one job queued, and cleanup. The start-and-observe E2E is gated on a published SIR playbook and additionally skips — with the reason — when the instance scheduler does not run the job inside the wait budget, since a starved scheduler is an instance condition rather than a tool defect. On the PDI used here the job first never ran within budget because all eight scheduler workers were held by a NIST NVD import stuck in a 429 (rate-limit) retry loop — the integration had no API key configured; the same condition starves `restore_archived_record` and every other `sysauto_script`-based operation. Once that run was cancelled the full start-and-observe test passed: the execution appeared in `sys_pd_context` and the repeat call returned `already_running`.

- **`scan_vulnerabilities` inserted into a table that does not exist** (`sn_vul_scan_request`) and could never start anything. Rebuilt on the real model: an on-demand VR scan is an `sn_vul_scan` record whose targets are linked through an m2m table (`sn_vul_m2m_scan_configuration_item` for CIs, `sn_vul_m2m_scan_source` for Vulnerable Items) and whose move to `processing` is what the async "Process scan request" rule hands to the scanner integration — the path `sn_vul.VulnerabilityScanUtil.createScanFromTask` and the "Initiate Scan" / "Rescan" actions take.
  - **Now a Scripting-tier tool** (`SCRIPTING_ENABLED=true`). None of that path is reachable through the Table API: `sn_sec_cmn_scan.state` is dictionary read-only, so a REST update silently keeps `draft`, and the m2m write ACL requires `sn_vul_scan.state=new`, so REST inserts land with blank references. Verified both ways live before choosing the design. The scan is therefore created by a run-once `sysauto_script` (as `run_security_playbook` does) that reports back through `syslog`; the tool waits `wait_seconds` (default 30) for it, returns the scan, and deletes the job — or returns `scan_scheduled` with the job if the scheduler has not run it yet.
  - Inputs changed to what the model has: `ci_sys_ids` **or** `vulnerable_item_sys_ids` (one source table per scan, max 200), optional `scanner_sys_id` (defaults to the active default `sn_vul_scanner`), `initiate` (default true; `false` leaves a Draft to launch from the UI) and `wait_seconds`. The old `group` and `scan_type` had no backing columns. Guards mirror the product: every target must exist, a target already in a queued/processing/scanning scan returns `already_running`, and initiating without an active scanner is refused up front (`CONFLICT`) instead of creating a scan that the async rule immediately errors out — Vulnerability Response can only launch scans through a scanner integration (Qualys, Tenable, Rapid7, …).
  - Verified live on real CIs: the Draft path links both targets (which REST could not); with a temporary stub scanner the initiate path went `draft → processing → scanning` through the product's async rule within ~17 s and a repeat call returned `already_running`. The E2E exercises the Draft path only, so a configured scanner never receives a scan from the test suite; VR tables refuse cross-scope deletes, so the test cancels its scan from a script rather than deleting it.
- `run_security_playbook` no longer sends a `description` when scheduling its job; `sysauto_script` has no such column and ServiceNow was discarding it.

### Added

- **Live E2E coverage 50 → 206 tools (10.1% → 41.5%); modules with no E2E 30 → 7.** Six new read-only suites — `platform-config`, `integration-tables`, `itom-tables`, `catalog-portal`, `optional-plugins`, `script-tables` — exercise every read tool that can run without an id and chain into the matching `get_*` where a record exists. The remaining uncovered modules are the USEM family (deferred on purpose), `now-assist` (needs `NOW_ASSIST_ENABLED` and the plugin), `store` (external API), and `smart-query`.
- **`skipUnlessTables` / `tableExists` helpers** in `tests/e2e/helpers.ts`. Modules backed by optional plugins (GRC, HRSD, CSM, DevOps, Mobile, SecOps, Agile, Event Management, …) now gate each test on the table's presence in `sys_db_object`: an absent plugin reports "skipped — table not on this instance", while a present table that the tool still cannot read is a real failure. The existing GRC read and write suites are retrofitted onto the gate — they had been hard-failing with `Invalid table` since the PDI was re-provisioned without GRC.
- **`scriptingE2eDescribe`** for the scripting-tier list/get tools, which sit behind `SCRIPTING_ENABLED` even though they never write.

### Changed

- E2E files now run sequentially (`fileParallelism: false` in `vitest.e2e.config.ts`). Thirteen suites hitting one PDI in parallel produced spurious 30 s timeouts on the incident/group write tests that pass every time in isolation.
- Live tests get a longer request budget. `tests/e2e/setup.ts` defaults `REQUEST_TIMEOUT_MS` to 120 s (an explicit value in the environment still wins), and the write suite raises its own test timeout to match. The production default stays 30 s. The write tests delete every record they create, and ServiceNow cascades a delete through every table that references it — a `sys_user_group` delete measured 21–23 s on a PDI still digesting a plugin install, which exceeded the client's 30 s abort and failed the test after its assertions had already passed.

---

## [1.11.2] — 2026-09-14

### Changed

- **Node.js floor raised to `>=20.19.0`** (was `>=20.0.0`). The test toolchain below now depends on `vite` 8 / `rolldown`, which require `^20.19.0 || >=22.12.0`, and the docs had stated 20.19+ as the intended floor since before 1.11.1 — the `engines` field was the part that lagged. README, `docs/INSTALLATION.md`, `docs/CLIENT_SETUP.md`, and every `clients/*/SETUP.md` now agree with `engines`. The runtime itself (`dist/` + `dependencies`) does not need 20.19; this tightening matters for anyone building or testing from source, and consumers on 20.0–20.18 will see an `EBADENGINE` warning at install.

### Security

- **Test toolchain: `vitest` / `@vitest/coverage-v8` `^3.2.7` → `4.1.11`.** 1.11.1 stopped at 3.2.7 because Node 20.12's bundled npm 10.5.0 could not resolve the vitest 4 tree (`Cannot read properties of null (reading 'edgesOut')`). With Node 20.19 / npm 10.8.2 that resolves cleanly. Full suite runs about 4× faster under vite 8 / rolldown (≈11 s → ≈2.5 s).
- **`hono` override `^4.12.34` → `4.13.5`** (exact pin).
- `npm audit`: 2 findings, unchanged — both the known-unreachable `exceljs` → `uuid@8.3.2` (see 1.11.1 / 1.9.1).
- Verified: `tsc` clean, ESLint 0 errors, 59 test files / 1553 tests pass, `--coverage` runs clean on the new provider, the opt-in E2E config still skips without `RUN_E2E`, the read-only PDI E2E passes live, and the Streamable HTTP transport boots (496 tools) and completes a real `initialize` + `tools/list` JSON-RPC round trip on the pinned hono.

---

## [1.11.1] — 2026-09-05

### Security

Dependency-only release: no tool, API, or behaviour changes.

- **Refreshed the transitive overrides that had drifted back into vulnerable ranges.** As in 1.9.2, new advisories were published against the exact versions the previous overrides pinned — pinning a "fixed" version is not a one-time fix.
  - `fast-uri` `^3.1.5` → `^3.1.7` — 1.9.2 pinned 3.1.5, and three new advisories (repeated hostname percent-decoding SSRF, malformed IPv6 normalization SSRF, host confusion via skipped IDN canonicalization) cover `3.0.0 - 3.1.5`. This chain (`@modelcontextprotocol/sdk` → `ajv` → `fast-uri`) is genuinely exercised, since the SDK validates request schemas with ajv. `ajv@8.20.0` asks for `^3.0.1`, so 3.1.7 is a non-breaking bump.
  - `js-yaml` → `^4.3.2` — via `eslint` → `@eslint/eslintrc`; the quadratic-CPU advisories cover `4.0.0 - 4.3.0` and `@eslint/eslintrc` asks for `^4.1.1`.
  - `ip-address` → `^10.7.0`, `qs` → `^6.16.0`, `body-parser` → `^2.3.0` — reached only through `@modelcontextprotocol/sdk`'s Express-based OAuth Authorization Server handlers, which this project never imports (`server-http.ts` builds directly on `node:http`). Unreachable in practice, but each fix sits inside the parents' own semver ranges, so they were taken rather than recorded as accepted risk.
  - `brace-expansion` pinned per minimatch major (`minimatch@3` → `^1.1.18`, `minimatch@9` → `^2.1.4`, `minimatch@10` → `^5.0.9`) — the production copy arrives via `exceljs` → `archiver`/`unzipper` → `glob` → `minimatch`. A flat override would have forced one major onto trees that require different ones; scoping by parent keeps each inside its range. `exceljs`-scoped nested overrides were tried first and did not reach the deeper `archiver-utils`/`rimraf` copies.
- **Upgraded the test toolchain to clear the two critical advisories**: `vitest` and `@vitest/coverage-v8` `^2.1.9` → `^3.2.7`. The advisories cover `<=3.2.5` (arbitrary file read/execute through the Vitest UI server, plus the `vite`/`esbuild`/`postcss`/`nanoid` chain beneath it), and 3.2.7 sits outside that range.
  - **Deliberately not `vitest` 5**, which is what npm proposes as the fix: it requires Node `^22.12.0 || ^24.0.0 || >=26.0.0`, while this project supports `>=20.0.0`. Taking it would quietly raise the floor for anyone cloning the repo to run the suite. `vitest` 4 keeps `^20.0.0` but needs a newer npm than the 10.5.0 bundled with Node 20.12, which cannot resolve that tree at all (`Cannot read properties of null (reading 'edgesOut')`).
- **Scope of these overrides.** npm honours an `overrides` block only at the install root, so this release pins the tree for this repository, its CI, and anyone installing from source. Consumers of the published package resolve `dependencies` themselves — for these particular advisories a fresh install already lands on the patched versions, because every affected package is reached through a caret range that resolves to the fixed release.
- **`npm audit`: 16 findings → 2.** Both remaining are `exceljs` → `uuid@8.3.2` (counted twice) and are unchanged from the 1.9.1 analysis: the advisory only affects uuid v3/v5/v6 when a `buf` argument is supplied and exceljs uses v4, while the only npm-offered fix is a breaking downgrade to `exceljs@3.4.0`.
- Verified: `tsc` clean, ESLint 0 errors, 59 test files / 1553 tests pass on the new vitest, `--coverage` runs clean under the upgraded provider, the opt-in E2E config still skips correctly without `RUN_E2E`, the read-only PDI E2E passes against a live instance, and the Streamable HTTP transport boots end-to-end (496 tools) completing a real `initialize` + `tools/list` JSON-RPC round trip — which exercises the ajv/`fast-uri` path directly.

---

## [1.11.0] — 2026-08-26

### Added

- **`scan_update_set_sca`** (`updateset.ts`, Tier 0 / read-only): inventories an Update Set's script-bearing changes and detects third-party components with exact, evidence-backed versions. First phase of the Update Set SCA roadmap (see `docs/ROADMAP.md` #13).
  - Resolves the target Update Set by sys_id or exact name (no fuzzy matching; ambiguous names are rejected) and paginates `sys_update_xml`, capping at `max_records` (1–100, default 50) with one extra row fetched so truncation is always explicit.
  - Restricts text extraction to an allowlist of script-bearing change types (Business Rule, Script Include, Client Script, UI Script, UI Action, Script Action, Scheduled Script Execution, Scripted REST Resource, Service Portal Widget); everything else is counted but skipped. Payloads over 512 KiB are skipped without being read into the result.
  - Detects components only where an exact version is present: npm lockfile v1/v3 structures and `package.json`-style manifests embedded in a script field, versioned CDN URLs (jsDelivr, unpkg, cdnjs), and `require`/`import` module specifiers pinned to an exact version (`package@1.2.3`). Version ranges, `latest`/aliases, and bare package names are never reported as an installed version.
  - Normalizes npm components by ecosystem, package name, and exact version; emits a PURL and direct/transitive/unknown dependency classification while retaining all distinct hashed evidence.
  - Queries OSV for exact-version npm components by default (optional local-only mode). Results include advisory IDs, aliases, severity, CVSS vectors, fixed versions, and source. Lookups have a five-second per-component timeout, a 50-component cap, and a one-hour in-memory cache; failures are explicitly reported as incomplete coverage.
  - Defines a versioned SCA JSON contract with severity summary, assessment, coverage counters, limitations, and top-level errors so an AI can report findings without interpreting raw script content. A no-findings response is explicitly not a clean-security verdict.
  - Separates unversioned or alias-based references into `unresolved_references` and never sends them to OSV. Arbitrary string literals are not considered library references, and external-artifact hash verification is explicitly reported as not performed.
  - Adds boundary coverage for payload secret non-disclosure, oversized OSV responses, pagination, and the 50-component lookup cap. Component caps now correctly set `lookup.truncated` so partial coverage cannot be presented as complete.
  - Adds an opt-in, read-only PDI E2E test that compares bounded SCA inventory metadata with `preview_update_set` and verifies source non-disclosure.
  - Source code, payload contents, and the surrounding script text around a detected component are never returned — only metadata, byte counts, and SHA-256 hashes of the payload and of the specific matched token.
  - Added to the `platform_developer` tool package.

### Fixed

- Fixed a regex-literal syntax error in the SCA CDATA-unwrapping helper (introduced during this feature's development, never released) that broke `tsc`/module loading entirely.

---

## [1.10.2] — 2026-08-23

### Security

- **Preserved impersonation on direct authenticated endpoints.** `uploadAttachment()` and `getXmlStats()` now use the same authenticated-header builder as ordinary Table API requests, so `X-Sn-Impersonate` is included in impersonation mode and those calls cannot silently execute with service-account privileges.
- **Bounded attachment decoding.** Attachment uploads now accept only standard Base64 and reject payloads larger than 10 MiB after decoding before obtaining OAuth credentials or allocating the decoded buffer. The MCP schema and tool documentation expose the limit.
- **Blocked XLSX ZIP expansion attacks before parsing.** `import_excel_to_import_set` now reads ZIP central-directory metadata before passing a workbook to ExcelJS. It rejects ZIP64/multi-disk archives, more than 200 entries, entries over 25 MiB uncompressed, more than 50 MiB total expansion, and compression ratios over 100:1.

### Verification

- Added regression coverage for direct-endpoint impersonation, bounded Base64 attachment uploads, and XLSX ZIP expansion limits.
- Verified the self-cleaning Excel Import Set write E2E against the PDI: Import Set creation, workbook attachment, staging-row creation and linking, then deletion of all test artifacts.

---

## [1.10.1] — 2026-08-16

### Fixed

- **`create_business_rule` silently created rules that could never fire.** The tool only ever set `name`/`collection`/`when`/`script`/`condition`/`active`/`order` on `sys_script`, leaving `action_insert`/`action_update`/`action_delete` at ServiceNow's row default of `false`. A business rule with `when: "before"`/`"after"`/`"async"` needs at least one of those three flags `true` to ever execute — so every rule created through this tool silently never ran, regardless of `when` or `condition`, unless the caller separately edited it in the ServiceNow UI afterward.
  - Found via live testing on a PDI while investigating async business rule execution: an `async` rule created through the tool never fired on insert, with no error at creation time or execution time.
  - `create_business_rule` now sets `action_insert`/`action_update` to `true` and `action_delete` to `false` by default (matching the ServiceNow "New Business Rule" form defaults), and accepts optional `action_insert`/`action_update`/`action_delete` booleans to override.
  - `update_business_rule` now allows updating `action_insert`/`action_update`/`action_delete` on existing rules.

---

## [1.10.0] — 2026-08-12

### Added

- **Data Management (13 tools)** (`data-management.ts`): manage ServiceNow Data Management Policies, archive rules, destroy rules, Table Cleanup Rules (Auto Flush), and archive restores.
  - `list_data_management_policies` / `get_data_management_policy` / `create_data_management_policy`
  - `list_archive_rules` / `create_archive_rule` / `set_archive_rule_active`
  - `create_destroy_rule` / `set_destroy_rule_active`
  - `list_cleanup_rules` / `create_cleanup_rule` / `set_cleanup_rule_active`
  - `get_archive_restore_status` / `restore_archived_record`
  - Safety design: every rule-creation tool always creates the rule **inactive** — nothing is archived, destroyed, or cleaned up until a separate, explicit activation call. Activating an archive, destroy, or cleanup rule requires `confirmation: "I_UNDERSTAND"`; activating an archive or destroy rule additionally requires an **active Data Management Policy** to already exist for the target table. `set_destroy_rule_active` and `set_cleanup_rule_active` are marked destructive (they permanently delete data); `restore_archived_record` requires both `WRITE_ENABLED=true` and `SCRIPTING_ENABLED=true` since it schedules a one-time script (`GlideArchiveRestore`) — the `archive_log_sys_id` is strictly validated as a sys_id before being interpolated into that script, so no injection is possible through it.
  - Added to the `system_administrator` package (72 → 85 tools).
  - Verified live against a PDI: inactive policy/archive/destroy rule creation, `retain_references`, confirmation-gate rejection, and the active-policy-gate rejection all behave as designed. 11 unit tests added.

---

## [1.9.2] — 2026-08-02

### Security

- **Refreshed transitive dependency overrides**: new advisories were published against the `fast-uri`/`hono` versions pinned in 1.8.2's overrides (`fast-uri` host-confusion via backslash authority introducer, `hono` ReDoS in CORS middleware). Bumped overrides to `fast-uri` `^3.1.5` and `hono` `^4.12.34` (resolves to 4.13.0). Verified live: built and ran the Streamable HTTP transport and confirmed a JSON-RPC request round-trips correctly against the updated dependency tree.
- **Investigated a new transitive chain** (`@modelcontextprotocol/sdk` → `express-rate-limit` → `ip-address`, 3 high-severity SSRF/trust-boundary advisories): confirmed unreachable — `express-rate-limit`/`ip-address` are used exclusively inside the SDK's built-in OAuth Authorization Server route handlers (`server/auth/handlers/*`), which this project never imports (`src/server.ts`/`src/server-http.ts` only import `server/index.js`, `server/stdio.js`, `server/streamableHttp.js`, and `types.js`). No dependency change needed.
- `exceljs`'s `uuid` finding (unreachable, documented in 1.9.1) and the devDependency-only findings (vitest/vite/esbuild/postcss toolchain, now also flagging `postcss` via `vite`) remain unchanged — none are shipped in the published package.

1517 tests pass, tsc clean.

---

## [1.9.1] — 2026-07-31

### Security

- **Fixed CSV/Excel formula injection (CWE-1236) in `import_excel_to_import_set`**: the formula-cell rejection added in 1.9.0 only caught genuine Excel formula cells; a plain string cell whose text merely starts with `=`, `+`, `-`, or `@` (e.g. typed literally, not entered as a formula) passed through unmodified into the staging table. If that data is later exported via ServiceNow's own Export to Excel/CSV and reopened, such values are interpreted as live formulas by the spreadsheet application. Now neutralized per the OWASP CSV Injection mitigation: string cell values matching that pattern are prefixed with a single quote before insertion, so they round-trip as literal text. Verified live against a PDI (`=cmd|'/c calc'!A1` → `'=cmd|'/c calc'!A1`, `-Confidential` → `'-Confidential`). Found during a security check of the 1.9.0 Excel feature; the `exceljs`→`archiver`/`glob`/`uuid` dependency chain flagged by `npm audit` was also investigated and confirmed unreachable (this server only calls `workbook.xlsx.load()`, never the writer path that pulls in `archiver`; `uuid` is called without the vulnerable `buf` argument) — no dependency change needed. 1 regression test added.

---

## [1.9.0] — 2026-07-30

### Added

- **`import_excel_to_import_set`** (`integration.ts`): securely upload a Base64 `.xlsx` workbook, parse one selected worksheet, create and attach the workbook to a ServiceNow Import Set, insert parsed rows into its staging table, and optionally start a Transform Map. This provides an auditable Excel→Import Set workflow for MCP clients.
  - Staging rows are now always bound to their Import Set through `sys_import_set`; `create_import_set_row` gained the required `import_set_sys_id` parameter and applies the same binding.
  - Defensive limits: `.xlsx` only, 10 MiB input, 500 data rows, 50 columns, strict Base64/ZIP validation, formula-cell rejection, and rejection of `sys_*` / prototype-pollution field names. Write operations remain gated by `WRITE_ENABLED=true`.
  - Supports optional worksheet selection, import-set labels, Excel-header→staging-column mapping, and Transform Map execution.

### Verification

- Added unit coverage for workbook parsing, column mapping, formula/system-field rejection, attachment upload, staging-row binding, and optional Transform Map execution.
- Added a self-cleaning PDI E2E test that creates an Import Set from an in-memory workbook, verifies its attachment and staging row, then deletes all created artifacts.

---

## [1.8.2] — 2026-07-22

### Security

- **Eliminated all `dependencies` (production) vulnerabilities via `npm overrides`**: `@modelcontextprotocol/sdk@1.29.0` transitively pulled in vulnerable `@hono/node-server` (<2.0.5, Windows-only path traversal in `serve-static`), `hono` (4.0.0-4.12.26, JSX XSS / cross-request context leak / header dedup issue), and `fast-uri` (3.0.0-3.1.3, host-confusion via IDN/backslash parsing, reached via `ajv-formats`). None of these were actually exploitable through this server's code paths — `src/server-http.ts` uses Node's built-in `http.createServer` and only imports `getRequestListener` (a plain HTTP↔Web-Request adapter) from `@hono/node-server`, never hono's routing/JSX/serve-static; no tool inputSchema in this codebase declares `format: "uri"`, so the `fast-uri` code path is never exercised by our own tools. Overridden anyway to close the gap: `@hono/node-server` → `^2.0.11`, `hono` → `^4.12.31`, `fast-uri` → `^3.1.4`. Verified the override doesn't break the HTTP transport: built and ran the Streamable HTTP server (`MCP_TRANSPORT=http`) against `getRequestListener@2.0.11` and confirmed it correctly handles a live JSON-RPC request end-to-end. `npm audit` now reports zero findings in `dependencies` — the remaining 9 are all `devDependencies` (vitest/vite/esbuild toolchain), never shipped.

---

## [1.8.1] — 2026-07-21

### Security

- **Fixed encoded-query injection in two write tools**: `schedule_cab_meeting` (`change.ts`) and `retire_knowledge_article` (`knowledge.ts`) resolved a human-friendly id (`change_id` / `article_id`) to a sys_id via `number=X^ORsys_id=X`, then wrote to the resolved record — without stripping `^` from X first. An id like `CHG0001^ORDERBYDESCsys_created_on` could select a different record than intended, silently misdirecting the write (CAB scheduling / KB article retirement) to the wrong change request or article. Both now sanitize with `sanitizeLikeValue()` before building the lookup query, matching the existing pattern in `itam.ts`'s `track_asset_lifecycle`. Found during a general security check of the MCP server; regression tests added.
- **Fixed the same class of issue in four read tools** (second, impact-ranked batch): `get_incident` (`incident.ts`), `get_change_request` (`change.ts`), `get_knowledge_article` (`knowledge.ts`), and `get_remediation_sla`/`get_group_sla` (`usem-sla.ts`) all resolved `number_or_sysid` the same unsanitized way. Read-only, so the impact is a wrong record being returned rather than a wrong write — but `get_remediation_sla`/`get_group_sla` touch VR/security data, and `get_incident`/`get_change_request` are high-traffic tools. Same `sanitizeLikeValue()` fix; 6 regression tests added.
- **Closed the remaining instances of the same pattern** (third, final batch — a full-codebase sweep for `X=${args...}^ORY=${args...}` single-record lookups found no further unsanitized cases beyond these): `get_catalog_item` (`catalog.ts`), `get_script_include` and `get_changeset` (`script.ts`). All other `number_or_sysid`/`sys_id_or_name` lookups across the codebase (grc-*.ts, csm.ts, problem.ts, task.ts, usem.ts, usem-integration.ts, hrsd.ts, security.ts) were already sanitized via `sanitizeLikeValue`/`queryValue`/a shared resolver, or constrained by a strict format regex (catalog.ts's REQ/RITM number lookups) — confirmed clean, not just assumed. Every write tool that resolves an id via a free-text lookup before mutating (`schedule_cab_meeting`, `retire_knowledge_article`, `track_asset_lifecycle`) is now sanitized; no further write-path instances of this pattern exist. 3 regression tests added.

Verified end-to-end against a live PDI: all 33 read-only E2E tests and all 8 write-operation E2E tests (self-cleaning create/update/delete) pass with these fixes applied — no regressions.

---

## [1.8.0] — 2026-07-18

### Added

- **`list_ecc_queue`** (`discovery.ts`): inspect the ECC Queue — the instance⇄MID job/result bus — with agent/topic/name/queue/state/time filters. Payload excluded by default (huge); `include_payload` opts in. MID names are auto-prefixed to `mid.server.<name>`.
- **`check_app_upgrade`** (`store.ts`): compare a scoped app's installed version (`sys_scope`) against the public Store version history and return release notes for every newer version. Store apps upgrade independently of platform releases (ACC-F, VR, ...), so this is the upgrade-planning primitive. Listing resolution: explicit `listing_id`, exact-title search match, or first result (flagged for verification). Verified live: sn_vul 30.3.5 → latest 30.7.2, 3 newer releases, exact-title match.

### Changed

- **`get_mid_server_health`** (`discovery.ts`): now includes extension contexts (MID Web Server / ACC Websocket Endpoint with status and error_message) and an `upgrade_note` when the MID reports Upgrading — a persistent old version across restarts indicates a failing upgrade (on Docker hosts, overlayfs cannot rename image-layer directories; keep the install dir on a volume).

Hardening: `check_app_upgrade` re-validates search-derived listing ids as 32-char sys_ids before building the versions URL (never trusts the external API's response shape), and `list_ecc_queue` documents that payloads can contain sensitive data (command output, host details, credential references).

Packages: `itom_engineer` 30 → 34 (adds `list_ecc_queue` + the 3 Store tools), `secops_analyst` 102 → 103 (adds `check_app_upgrade`). 11 unit tests added (1502 total). Completes ROADMAP #12 (12-3/12-4/12-5).

---

## [1.7.0] — 2026-07-18

### Added

- **`list_mid_extension_contexts`** (`discovery.ts`): list MID Server extension contexts (`ecc_agent_ext_context`) — MID Web Server, ACC Websocket Endpoint, etc. — with status and error_message. Born from a live ACC verification session: agents get `handshake failed with status 404` until the "ACC Websocket Endpoint" context exists (created by "Setup ACC Listener" on the MID Server record), and this table is where that shows. Filters sanitize `^` to prevent encoded-query injection. Added to the `itom_engineer` package (now 30 tools).

### Changed

- **`check_table_access`** (`core.ts`): each result now carries a `status` explaining *why* access failed — `not_installed` (Invalid table: the providing plugin/app is absent), `no_access` (403: table exists but ACL denies the account), `empty` (readable but zero rows — truly empty or ACL row filtering), or `accessible` — plus a human-readable `hint`. The summary counts not-installed and ACL-denied tables. This turns the tool into a plugin-installation check as well (verified live: `sn_agent_policy=empty`, `sn_agent_api_key=not_installed`, `sys_scope=accessible` on a Zurich PDI with ACC Framework installed).

Docs: added the previously missing "Discovery & MID/ACC Diagnostics" section to TOOLS.md covering all 12 tools of `discovery.ts`. 7 unit tests added.

---

## [1.6.0] — 2026-07-16

### Added

**ServiceNow Store tools (2)** — `store.ts`, a new module that calls store.servicenow.com's public catalog API (no instance authentication):

- **`search_store_apps`**: keyword search of the public Store catalog, returning `listing_id` values.
- **`get_store_app_versions`**: per-version release notes (new features / bug fixes), publish dates, and release types for a Store app, with HTML notes converted to readable text.

Release notes are not stored in any instance table — `sys_app_version`/`sys_store_app`/`sys_remote_app` have no notes column and App Manager fetches them remotely — so this public API is the only programmatic source. Verified live against the Store: Vulnerability Response returns 20 versions (24.0.10 through 30.7.2). Both tools are included in the `secops_analyst` package (now 102 tools) for upgrade planning alongside `sys_app_version` queries. `listing_id` is validated as a 32-char sys_id to prevent URL injection; 14 unit tests added (1487 total).

---

## [1.5.11] — 2026-07-15

### Fixed

Three unsanitized free-text/identifier-injection sites remained in `ml.ts` after the 1.5.10 audit, found in a follow-up review and fixed with the codebase-wide `sanitizeLikeValue()` convention:

- **`ml_predict_change_risk`**: `type`/`category`.
- **`ml_forecast_incidents`**: `category`/`priority`.
- **`ml_virtual_agent_nlu`**: `topic_sys_id`.

Added regression tests confirming `^` is stripped from each so it cannot inject extra encoded-query clauses. 1473 tests pass, `tsc` clean.

---

## [1.5.10] — 2026-07-14

### Fixed

Same unsanitized free-text/identifier-injection pattern fixed progressively since 1.5.5, found in six more modules and fixed by applying the codebase-wide `sanitizeLikeValue()` convention:

- **`ml.ts`**: `ml_train_incident_classifier`/`ml_train_change_risk`'s `solution_name`, `ml_model_training_history`'s `model_sys_id`.
- **`agile.ts`**: the whole module had zero sanitization — fixed across `list_stories` (`sprint`/`state`), `list_epics` (`project`/`state`), and `list_scrum_tasks` (`story_sys_id`/`assigned_to`).
- **`devops.ts`**: `list_deployments`'s `pipeline_sys_id`/`environment`/`state`.
- **`app-studio.ts`**: `list_scoped_apps`'s `query`, `get_scoped_app`'s `id`.
- **`problem.ts`**: `get_problem`'s `number_or_sysid`.
- **`task.ts`**: `get_task`'s `number_or_sysid`.
- **`va.ts`**: the whole module had zero sanitization — fixed across `list_va_topics_full`'s `category`, `get_va_conversation`'s `conversation_id`, and `list_va_conversations`'s `topic_sys_id`/`user_sys_id`.

### Added

**Complete test coverage for all 476 tools in the project** — this closes out the coverage audit that started this session at 261/476 (55%) tools with zero test references. Final batch: `reporting.ts` (6 tools), `va.ts` (6 tools), `ml.ts` (5 tools), `security.ts` (5 tools, already correctly sanitized), `agile.ts` (4 tools), `devops.ts` (4 tools), `app-studio.ts` (3 tools), `incident.ts` (2 tools), `problem.ts` (2 tools), `task.ts` (2 tools), `now-assist.ts` (1 tool), and `updateset.ts` (1 tool, including a `RESULT_TOO_LARGE` regression test for `export_update_set`'s 2000-change cap). 1470 tests pass, `tsc` clean.

---

## [1.5.9] — 2026-07-14

### Fixed

- **`atf.ts`**: `get_atf_suite`'s name lookup was unsanitized.
- **`deployment.ts`**: `find_artifact`'s `name`/`scope` were unsanitized.
- **`itam.ts`**: the whole module had zero query sanitization — fixed across `list_assets` (`state`/`assigned_to`/`location`), `list_asset_contracts` (`asset_sys_id`), `track_asset_lifecycle` (`asset_id`, used in a two-clause OR query), and `get_license_optimization` (`software_name`).

All three match the same unsanitized free-text/identifier-injection pattern fixed progressively since 1.5.5 (`integration.ts`) — fixed by applying the codebase-wide `sanitizeLikeValue()` convention.

### Added

- **Test coverage for 30 more previously-untested tools**: `atf.ts` (9 tools, new `tests/tools/atf.test.ts`), `deployment.ts` (7 tools), `itam.ts` (7 tools), and `mobile.ts` (7 tools, already safe — every filterable field is a sys_id reference, not free text).

---

## [1.5.8] — 2026-07-14

### Fixed

- **`csm.ts` had zero query sanitization anywhere in the module** — the same class of gap already fixed in `integration.ts`/`flow.ts`/`sys-properties.ts`, but this time affecting every free-text/identifier value in the file: `account`/`contact`/`state`/`priority` filters on `list_csm_cases`, `name_or_sysid` lookups on `get_csm_account`/`get_csm_contact`, `number_or_sysid` on `get_csm_case`, `case_sysid` on `get_csm_case_sla`, and `account_sysid`/`query` on `list_csm_contacts`/`list_csm_accounts`/`list_csm_products`. Fixed by applying `sanitizeLikeValue()` throughout.

### Added

- **Test coverage for 19 more previously-untested tools**: `hrsd.ts` (10 tools, already correctly sanitized) and `csm.ts` (9 tools, including regression tests for the sanitization fix above). `csm.ts` previously only had write-field-allowlist tests.

---

## [1.5.7] — 2026-07-14

### Fixed

- **`sys-properties.ts`'s `category`/`type` filters were not sanitized** — `list_system_properties`'s `category`/`type` and `export_properties`'s `category` were interpolated directly into encoded queries, unlike the rest of the module (`get_system_property`, `set_system_property`, `delete_system_property`, `bulk_set_properties`, `import_properties`, `validate_property`, `get_property_history` already sanitize the property name via `sanitizePropertyName()`). Fixed by applying the same helper to `category`/`type`.

### Added

- **Test coverage for 34 more previously-untested tools**, continuing the coverage pass: `sys-properties.ts` (12 tools, new `tests/tools/sys-properties.test.ts`, including regression tests for the sanitization fix above and sensitive-value masking across get/list/search/export/history), `notification.ts` (11 tools, already correctly sanitized), and `performance.ts` (11 tools, already correctly sanitized).

---

## [1.5.6] — 2026-07-14

### Fixed

- **`flow.ts` had the same unsanitized query-injection gap fixed in `integration.ts` (1.5.5)** — `args.category`/`args.query`/`args.status`/`args.name_or_sysid` were interpolated directly into encoded queries across `list_flows`, `get_flow`, `list_flow_executions`, `list_subflows`, `get_subflow`, `list_action_instances`, `get_process_automation`, and `list_process_automations`. Fixed by applying `sanitizeLikeValue()` at every affected site.

### Added

- **Test coverage for 47 more previously-untested tools**, continuing the coverage pass from 1.5.4/1.5.5: `flow.ts` (16 tools, new `tests/tools/flow.test.ts`, including regression tests for the sanitization fix above), `workspace.ts` (16 tools, new `tests/tools/workspace.test.ts` — no sanitization gap here since every filterable field is a sys_id reference, not free text), and `portal.ts` (15 tools — confirmed its existing `sanitizeLikeValue()` usage was already correct).

---

## [1.5.5] — 2026-07-14

### Fixed

- **`integration.ts` free-text/identifier values were not sanitized before being interpolated into encoded queries** — the only tools module not following the codebase-wide `sanitizeLikeValue()` convention (already used in `notification.ts`, `portal.ts`, `security.ts`, `performance.ts`, `sam.ts`, `reporting.ts`, and the `grc-*.ts` modules). A caller could pass e.g. `sys_id_or_name: "Jira^ORactive=true"` and inject an extra encoded-query clause into `get_rest_message`/`get_transform_map`/`get_event_registry_entry`, or similarly via the `query`/`type`/`state` params on `list_rest_messages`, `list_transform_maps`, `list_data_sources`, `list_event_registry`, `list_event_log`, `list_oauth_applications`, `list_credential_aliases`, and `list_import_sets`'s `state` field. Fixed by applying `sanitizeLikeValue()` at every affected site; `list_import_sets`'s `query` param is intentionally left as pass-through since it's documented as a full encoded-query filter (same by-design pattern as `catalog.ts`'s `list_requests`/`list_approvals`).

### Added

- Regression tests for `create_import_set_row` (WRITE_ENABLED gate, required-fields check, staging-table/import-set mismatch, `sys_*` field rejection, successful insert) — previously only partially covered by a combined test elsewhere.
- Tests confirming the new query sanitization for the 8 affected tools above.

### Changed

- Fixed inconsistent `WRITE_ENABLED` env-var cleanup in `catalog.test.ts`/`integration.test.ts` — every `describe` block that sets it in `beforeEach` now restores it in `afterEach`, preventing state from leaking into later tests when vitest reuses a worker.
- Replaced `length > 0` tool-count assertions in `integration.test.ts`/`script.test.ts` with pinned counts (24 and 27), matching the existing pattern in `core.test.ts`.

---

## [1.5.4] — 2026-07-14

### Added

- **Test coverage for 76 previously-untested tools**, first batch of a broader test-coverage pass (an audit found 261 of 476 tools with zero test references). Prioritized by impact: `core.ts` (14 foundational/CMDB read tools) plus `list_instances`/`switch_instance`/`get_current_instance` (multi-instance routing, tested in `router.test.ts` since that's where the logic actually lives), `integration.ts` (23 tools: REST/SOAP Messages, Transform Maps, Import Sets, Event Registry, OAuth/credential listing — new `tests/tools/integration.test.ts`), `catalog.ts` (19 tools: catalog item CRUD/search/order, approval rules and lifecycle, SLA lookup, full request/RITM lifecycle), and `script.ts` (18 tools: Business Rules, Script Includes, Client Scripts, Changesets, UI Policies, UI Actions, ACLs — including a regression test confirming `requireScripting()` gates every tool in the module, not just writes).

No production code changed in this release; test-only.

---

## [1.5.3] — 2026-07-14

### Fixed

- **Record-count logic corrected across 8 more tools** — second pattern-search pass for the same bug class fixed in 1.5.2. `get_security_dashboard`, `get_mobile_analytics`, `ml_forecast_incidents`, `get_devops_insights`, `validate_deployment`, `get_license_optimization`, `ml_predict_change_risk`, and `ml_detect_anomalies` all previously reported totals derived from a capped `queryRecords(limit:N)` fetch's `.count`/`.records.length` instead of the true match count, silently wrong once a query matched more than `N` records (in `get_security_dashboard`'s case, `limit:1`, meaning every field was always 0 or 1). Fixed by sourcing totals from ungrouped `runAggregateQuery` calls; `get_devops_insights` now uses a status-grouped aggregate query for an exact per-status breakdown instead of any capped fetch. Tools whose calculations genuinely need per-record data (`ml_predict_change_risk`, `ml_detect_anomalies`) keep a bounded sample but now report the sample size and an honest `note` alongside the accurate total. None of the eight had prior test coverage for this logic — added for all, including new `tests/tools/mobile.test.ts` and `tests/tools/devops.test.ts` (neither test file previously existed).

---

## [1.5.2] — 2026-07-13

### Fixed

- **Record-count logic corrected across 5 tools** — `get_table_record_count`, `compare_record_counts`, `analyze_data_quality`, `ml_virtual_agent_nlu`, and `ml_process_optimization` all previously reported wrong or silently truncated totals. Root cause: `runAggregateQuery`'s `groupBy` parameter was required, so callers wanting an ungrouped total passed `''`, which always failed client-side validation and threw before any request was sent — `get_table_record_count`/`compare_record_counts` silently fell back to `queryRecords(limit:1).count` (always 0 or 1), and `analyze_data_quality` was similarly always wrong. `ml_virtual_agent_nlu`/`ml_process_optimization` separately undercounted past their fetch's `limit` (500/1000) without warning. `groupBy` is now optional on `runAggregateQuery`; all five tools now use accurate ungrouped aggregate queries. None of the five had any prior test coverage — added for all.

---

## [1.5.1] — 2026-07-13

### Fixed

- **`update_compliance_control` no longer lists `state` as a writable field** — confirmed live that REST Table API writes to `sn_compliance_control.state` are silently ignored (HTTP 200, value never persists) regardless of target value; only the in-app "Attest" UI Action can actually change it. Listing it as writable was misleading. Full investigation (including how GRC assessments actually get issued) recorded in [GRC_DESIGN.md](docs/GRC_DESIGN.md) section 5a.

---

## [1.5.0] — 2026-07-12

### Added

- **GRC (Governance, Risk, Compliance) tooling** — four new modules covering Audit Management (`sn_audit_*`: Engagements, Control Tests, dashboard), Policy and Compliance Management (`sn_grc_*`/`sn_compliance_*`: Entities, Policies, Controls, Control Objectives, Policy Exceptions, Issues, dashboard), Risk Management (`sn_risk_*`: Risks, Risk Statement library, Risk Criteria scale, dashboard), and Indicator/KRI (`sn_grc_indicator*`: Indicators, Indicator Results, dashboard). 41 new tools, all verified live against a PDI rather than assumed from documentation — see [GRC_DESIGN.md](docs/GRC_DESIGN.md) for the investigation, including confirmed cases where a business rule silently overrides client-supplied writes (`sn_risk_risk` `impact`/`likelihood`/`score`/`justification`/`response`/`classification`) or rejects mismatched `entity`/`item` pairs on `sn_grc_indicator` (HTTP 403) — those write paths are intentionally restricted to what was confirmed to actually persist.
- Replaces 6 broken pre-existing GRC tools in `security.ts` (`list_grc_risks`, `get_grc_risk`, `list_grc_controls`, `create_grc_risk`, `get_compliance_assessment`, `list_audit_results`) that pointed at nonexistent tables (`sn_compliance_assessment`, `sn_audit_result`) or used a field set that didn't match the real schema.

### Changed

- `secops_analyst` tool package grows from 61 to 100 tools with the new GRC modules.

---

## [1.4.0] — 2026-07-12

### Security

- **Write-field allowlists extended to remaining tool families** — `update_user`/`update_group`, USEM/VR rule create+update, agile (`update_story`/`update_epic`/`update_scrum_task`), `update_task`, scripting (`update_business_rule`/`update_script_include`/`update_client_script`/`update_ui_action`), `update_scoped_app`, `update_portal_widget`, `update_report`/`update_scheduled_job`, and `update_va_topic` now reject any field outside a curated allowlist (default-deny), closing the mass-assignment gap that remained after 1.2.0's initial rollout.
- **Schema-level defense in depth** — every allowlisted `fields` parameter now also declares `properties` for each allowed key plus `additionalProperties: false` in its JSON input schema, so MCP-client-side schema validation rejects undeclared fields before a call reaches server code, not just the runtime check. USEM rule tools use a closed union schema across all `rule_type` variants, since the allowed set depends on a sibling parameter.
- **USEM query literal sanitization** — user-supplied filter values in `usem.ts` (`cmdb_ci`, `assignment_group`, `assigned_to`, CVE/number lookups) now pass through `sanitizeLikeValue`, while caller-supplied raw `query` strings remain intentionally unsanitized (the existing opt-in raw-query design).

### Fixed

- `update_portal_widget` and `update_report` no longer mutate the caller-supplied `fields` object when remapping friendly field names (`server_script`→`script`, `query`→`filter_fields`); both now operate on a shallow copy.

---

## [1.3.0] — 2026-07-12

### Added

- **USEM remediation workflow completion** — added `create_vulnerable_item`, `list_remediation_task_findings`, and `get_finding_grouping_status` so SecOps users can create VIs with the vulnerability reference intact, inspect VI <-> Remediation Task links, and diagnose grouping failures in one call.
- **Cross-table Remediation Task lookup** — `list_remediation_tasks` now queries both `sn_vul_remediation_task` and the rule-engine-backed `sn_vul_vulnerability` table, annotates each record with `source_table`, reports `by_table` counts, and globally sorts/limits merged results.
- **Smarter Remediation Task resolution** — `get_remediation_task` now routes VUL numbers directly to `sn_vul_vulnerability`, falls back from `task_number` to VUL `number` for non-VUL identifiers, and tries both tables for sys_id lookups when the first table returns NOT_FOUND.

### Changed

- `secops_analyst` now includes the new USEM remediation workflow tools.
- ROADMAP and tool documentation now mark USEM remediation workflow item 11 complete and describe the cross-table RT behavior.

### Fixed

- `get_remediation_task` no longer hides ACL/auth/network failures behind cross-table fallback; only genuine NOT_FOUND responses fall through to the second table.

---

## [1.2.0] — 2026-07-11

### Security

- **Write-field allowlists on all create/update tools** — `incident`, `problem`, `change_request`, CSM case, HR case, HR profile, asset, knowledge article, catalog item, notification, PA dashboard, security incident, and vulnerability writes now reject any field outside a curated allowlist (default-deny). AI-supplied arguments can no longer set arbitrary columns such as `sys_id`, workflow, or ACL-adjacent fields. Rejected requests name both the offending fields and the full allowed-field list.
- **Encoded-query sanitization across list/search tools** — free-text and reference filters in `security`, `hrsd`, `sam`, `portal`, `reporting`, `performance`, `notification`, and the MCP resource layer are passed through `sanitizeLikeValue` (strips `^` clause separators and NUL) before interpolation, preventing encoded-query injection.
- **API path traversal guard** — the raw `/api/` REST helper rejects `.` / `..` / `%2e` path segments before URL normalization can hide an escape, and validates any embedded `sysparm_query`.
- **Scheduled-job scripting gate** — `create_scheduled_job` and `update_scheduled_job` now require `SCRIPTING_ENABLED=true` (not just `WRITE_ENABLED`), matching their server-side script (RCE) surface.

### Changed

- Field-allowlist `VALIDATION_ERROR` messages now include the allowed-field list, so a caller rejected for an undeclared field can see what is permitted.

---

## [1.1.0] — 2026-07-11

### Added

- **USEM `sn_sec_*` configuration coverage** — `list_usem_rules` and the generic rule tools now cover `rollup`, `exception_config`, `calculator_config`, `risk_field`, and `risk_score_weight`, closing the remaining KB2556844 migration-table gaps.
- **`get_risk_calculator_details`** — one-call explanation of a USEM Risk Calculator (group → rules → weighted risk fields → score-weight bands).
- **`list_integration_parameters`** — USEM integration parameter definitions (`sn_sec_int_config`) and per-implementation values (`sn_sec_int_impl_config`), with secret-value masking; encrypted `password_value` columns are never returned.

### Security

- **HTTP resource limits** — Streamable HTTP now enforces a 1 MiB request-body cap (413), a 100-session cap (429), and 30-minute idle-session expiry, configurable via `MCP_HTTP_MAX_BODY_BYTES` / `MCP_HTTP_MAX_SESSIONS` / `MCP_HTTP_SESSION_IDLE_TIMEOUT_MS`.
- **Per-connection instance isolation** — a new `InstanceContext` scopes `switch_instance` state to each MCP connection, preventing one session's instance switch from leaking into another over shared HTTP.
- **Write-boundary tightening** — `create_import_set_row` requires the owning `import_set_sys_id` and a matching staging table; `create_acl` requires validated roles; `update_acl` allows only `description`.

### Changed

- Setup writers emit `npx <pkg> server` with VS Code `inputs` for secrets, so no plaintext secrets are written to `.vscode/mcp.json`.

---

## [1.0.8] — 2026-07-11

### Security

- **HTTP MCP authentication** — Streamable HTTP requests now require an explicit Bearer token before a session or tool invocation is accepted
- **Encoded-query validation** — CMDB, active-event, and aggregate-query helpers now apply the shared ServiceNow JavaScript-expression allowlist
- **Per-user fail-closed behavior** — instances without a bound per-user token now fail at API use rather than falling back to service-account authority
- **Claude Code setup hardening** — configuration values are passed as process arguments instead of a shell command; Windows uses the `claude.cmd` shim

### Changed

- Documented `MCP_HTTP_AUTH_TOKEN` and the required Authorization header for Streamable HTTP MCP clients

---

## [1.0.2] — 2026-06-07

### Security

- **Sensitive property masking** — `sys-properties.ts` now masks values of password2-type, `private=true`, and name-pattern-matched properties (`secret`, `token`, `key`, `password`, `credential`, etc.) across all read paths including `bulk_get`, `export`, `validate`, and `history`
- **Encoded query injection prevention** — added `sanitizePropertyName()` and `sanitizeSearchTerm()` helpers in `sys-properties.ts`; added field-value validators (sys_id format, REQ/RITM number format, stage/state enum checks) in `catalog.ts`; sanitized free-text search values in SOAP tools in `integration.ts`
- **File permission hardening** — `config-store.ts` and `auth.ts` now apply `chmodSync(path, 0o600)` after every `writeFileSync` to prevent other-user read of credential files
- **Update Set XML safety** — `export_update_set` now paginates to guarantee completeness and throws `RESULT_TOO_LARGE` (with UI export link) instead of silently returning truncated XML when change count exceeds 2,000

### Added

#### New Tools
- **Catalog request lifecycle** (`catalog.ts`) — `list_requests`, `get_request`, `list_request_items`, `get_request_item`, `cancel_request`, `update_request_item` for full `sc_request` / `sc_req_item` / `sc_task` tracking
- **SOAP Message support** (`integration.ts`) — `list_soap_messages`, `get_soap_message`, `list_soap_message_functions`, `create_soap_message`, `create_soap_message_function` for `sys_web_service` / `sys_web_service_function` management
- **`auth test` CLI command** — tests OAuth connectivity against a configured instance and reports grant type and API user

#### Tool Packages
- `service_desk` package now includes `list_requests`, `get_request`, `list_request_items`, `get_request_item`
- `catalog_builder` package now includes the full request lifecycle tools
- `integration_engineer` package now includes all SOAP message tools

### Changed

- **OAuth-only authentication** — Basic Auth removed entirely from client, CLI wizard, env var writers, and all documentation; only `client_credentials` and `password` grant types are supported
- **Auto grant-type detection** — `ServiceNowClient` selects `client_credentials` when only `clientId`/`clientSecret` are configured; switches to `password` grant when `username`+`password` are also present — no explicit configuration required
- **Update Set XML export** — `export_update_set` now returns real importable XML assembled from `sys_update_xml.payload` fields, replacing the previous metadata-only response
- **`NOW_ASSIST_ENABLED` env var** — corrected from `NOWASSIST_ENABLED` (broken) to `NOW_ASSIST_ENABLED` (matches `permissions.ts`)
- **OAuth setup documentation** — Application Registry creation now documented as **New Inbound Integration Experience** with **Token Format: JWT** required; deprecated UI option called out explicitly
- **Installation** — changed from `npm install -g` to build-from-source (`git clone` → `npm install` → `npm run build` → `npm run setup`)

### Fixed

- **Password Grant credentials lost on reload** — `instances.ts` wizard config loader was reading `c['username']`/`c['password']`; corrected to `c['oauthUsername']`/`c['oauthPassword']` to match the keys saved by `setup.ts`
- **`auth test` command** — was documented in README but not implemented; now registered as `auth test [instanceName]` in CLI

### Removed

- Basic Auth code paths (`authMethod: 'basic'`, `SERVICENOW_BASIC_USERNAME`, `SERVICENOW_BASIC_PASSWORD`, `SERVICENOW_AUTH_METHOD`)
- All Basic Auth examples from `server.json`, `instances.example.json`, client config templates, and all documentation

---

## [1.0.0] — 2026-03-01

### Initial Release

The most comprehensive ServiceNow MCP server — 400+ tools across all modules.

#### Core
- **400+ MCP tools** covering 31+ ServiceNow modules
- **Multi-instance support** — connect to unlimited instances (dev, staging, prod, customer tenants) simultaneously
- **Role-based tool packages** — 14 persona-specific packages (service_desk, platform_developer, system_administrator, etc.)
- **5-tier permission system** — read-only by default; write, CMDB, scripting, Now Assist, and ATF each require explicit opt-in
- **OAuth 2.0** (client_credentials / password grant)

#### CLI
- **`servicenow-mcp setup`** — interactive wizard detects AI clients and writes config automatically
- **`servicenow-mcp auth login/logout/whoami`** — per-user OAuth flow
- **`servicenow-mcp instances list/remove`** — manage configured instances

#### MCP Features
- **11 slash commands** (`/morning-standup`, `/p1-alerts`, `/my-tickets`, `/create-incident`, etc.)
- **6 @ mention resources** (`@my-incidents`, `@open-changes`, `@sla-breaches`, etc.)
- **Custom commands** via `servicenow-mcp.commands.json`

#### Module Coverage
ITSM, ITOM, CMDB, HRSD, CSM, SecOps, GRC, Agile, ATF, Flow Designer, Scripting, Now Assist, Service Portal, UI Builder, Integration Hub, Notifications, Attachments, Performance Analytics, System Properties, Update Sets, Virtual Agent, ITAM, DevOps, Scoped Applications, and more.

#### AI Client Support
Claude Desktop, Claude Code, Cursor, VS Code, Windsurf, Zed, GitHub Copilot, Continue.dev, Cline, JetBrains, Amazon Q, Google AI Studio, ChatGPT, Gemini, Grok, Ollama, and any MCP-compatible client.
