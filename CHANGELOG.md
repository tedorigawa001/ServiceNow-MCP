# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Fixed

- Development-only closed body capture now applies its 4096-chunk retention limit only to nonempty additions. Empty chunks at the exact limit keep sequence validation and zero-byte accounting without discarding a valid body; the 4097th nonempty chunk is still charged then rejected. Includes a RED/GREEN boundary regression through EOF, parsing and digest comparison; formal issuance and production behavior remain unchanged.

- AU-BR-005 no longer treats indirect use of `current.setAbortAction` as "no abort call". Extracted method references, `.call`/`.apply`/`.bind`, comma-operator calls and destructuring (named, computed or rest) of `current` now mark the abort analysis unresolved, so the review cannot complete as clear. The same rules apply to the development-only BR-006 scope plan, which additionally treats `current` passed to code outside the analyzed body as receiver-unresolved instead of `no_target_call`. Direct `current.setAbortAction(...)` calls and ordinary field reads are unchanged.

### Changed

- CM-04-03 connects data-only, fixed-200 synthetic parent/release responses through the existing native cleanup/same-byte acknowledgement lane to a creator-key-bound private source consumer and the existing C-mode release decision. One session, registered lease and canonical C/G budget cover cached/per-user or synthetic OAuth readiness and prepared binding; the session's phase reserve is shared rather than recomputed. Fake output is explicitly marked, carries no live authority and is returned only after closure. Includes cancellation, caps, malformed input, conflict/fallback, foreign-consumer rejection and offline packaging tests. Existing MCP/legacy workflows, formal issuance, whole-run admission and real communication remain unchanged/disabled; non-200 semantics and final capacity transfer remain deferred.

- CM-04-02 adds a fixed new-run, pre-I/O composition checkpoint: the creating session privately binds its pinned snapshot, registered canonical lease, one-shot transport claim and one concrete source before ready/authentication. Initial identity binding is distinct from ReleasePermit admission and rejects replay, foreign identities and reentry. The fixed entry returns only a frozen constructor-bound summary after releasing accounting, admission, timers and credentials; no existing-session adoption, work callback or mutable port is exposed. Includes fake-clock/cancellation and compiled/offline tests. Authentication/GET/native dispatch, private ack adoption, formal issuance and whole-run admission remain unconnected/disabled; existing public workflows stay legacy.

- CM-04-01 separates canonical-core creation from one-shot constructor accounting supply. The existing fresh bootstrap factory delegates lazily to that same core; legacy writes select the legacy lane, preventing later acquisition even after zero-charge operations. Acquisition/reservation claims are consumed before clock callbacks, retain first-stop diagnostics and cannot be reminted after failure or release. Includes synthetic and compiled packaging tests; actual-session native selection, formal issuance and whole-run admission remain disabled/unconnected.

- CM-02 moves legacy bounded-session C/G/P accounting and its readonly lease onto the CM-01 canonical state, removing duplicate mutable counter fields. Dispatch placement, four final slots, retry/status handling and local payload-limit behavior remain unchanged. A private clock preserves the original run origin; core errors are translated to existing bounded errors, with owner diagnostics retained before one-shot abort propagation. Includes before/after synthetic event oracles and compiled packaging checks. Native/typed activation, formal issuance and whole-run admission remain disabled/unconnected.

- A bounded review session now stops once its first authentication attempt fails. Previously the session stayed active after a failed OAuth/token step: later `get` calls failed with the same code, but `assertActive()` and other session checks still passed. Now the authentication failure code (for example `invalid_response` or `upstream_unavailable`) becomes the session stop code, so every later check fails with that code. Review outcomes are unchanged, because authentication runs on the first parent read and that failure already ended the review.

### Security

- Remove packaged fixture registration/owner/transport-claim exports and the real session's fixture transport factory. Fixture registries, claims, draft handles and synthetic accounting now live exclusively in package-excluded development modules, and reject raw real-session registration. Ordinary session GET/payload/phase behavior remains intact; packaged and source regression tests cover the former fixture-to-real-mode path. Production BR-006 evidence issuance remains unimplemented/closed.

### Added

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
