# BP-5 R-2 OL-03：activation/ledger-0.2/registryの共有予算厳密検証

Date: 2026-10-20 / Status: 純粋検証・合成テストのみ。実reader/revalidate/closure/permitなし。

## 1. 範囲

[接続設計draft-0.4 §11](BEST_PRACTICE_BP5_R2_OL03_RECORD_PARSER_CLOSURE_DESIGN.md)に対応する。
共有予算JSON coreへ実schemaを接続し、activation/ledger-0.2/registryを架空JSONで検証する。前工程の架空非JSON RecordSource投影を実readerへ置き換える作業ではない。
telemetry調査は保留。実機/PDI・API実接続・token発行・設定変更・本番policy投入・実署名/permit発行は対象外。

## 2. 実装

- record_validation::validateは同じBudgetでactivation→registry→ledgerを検証。size上限64KiB→raw hash→strict JSON/schema/意味検証を要求する。ledger hashはactivationから導出し、registry/activationの期待hashはprivateな比較入力。
- activation schema型は既存のまま。ledgerのschema/contextとregistryの意味検査・role参照検査は既存public経路と共通の内部関数へ分離し、旧public signature/失敗型/開始Instantの意味は維持する。
- registryはdepth8/container32、activation/ledgerはdepth16/container65536。未知/重複/欠落/旧版混在を拒否し、誤hashの不正JSONはdecode前にBindingで停止。
- 同じ予算をhash chunk、JSON visitor、意味検証/role結合/時刻の前後、registryのpolicy/group要素に伝播する。原開始時刻・workをresetしない。
- 元開始wallの460秒超と現在wallの450秒超を分離。新経路はelapsedをwallへ再加算しない。clock値の取得や真偽はまだ検証しない。
- Json/InvalidRecord/Binding/Expired/Limit/Policy/Budgetを型付きで保持。SharedBudget bridgeは既存Failureへラッチするが、戻り値の詳細理由を文字列へ潰さない。
- 成功は固定Debugの非authority内部所有型のみ。raw JSON/path/hash/承認refを出力しない。本文をMCPへ返す機能や外部書込は追加しない。

## 3. 追加21テスト

| 群 | 確認したこと |
|---|---|
| pure検証16件 | 正常実schemaと既存public parserの意味一致、固定Debug、全3種類のhash-firstとpin済み不正JSONの区別 |
| strict/binding | activation未知/重複/欠落/旧schema、ledger旧版/旧binary混在/未知/path、UID/GID/groups、generation/release/platform/index、registry参照/両role/不明policy |
| registry意味 | issuer/重複ID/flags/team/Launcher entitlementの既存拒否を維持。registry container上限はInvalidへ丸めない |
| 時刻・size | 3種類の64KiB等号/1byte超、深さ、開始期限・未来承認・不正時刻。現在wallの最終450秒境界と二重加算/現在460秒再要求をしないこと |
| generic予算matrix | 正常経路の全checkpointへDeadline/Cancelledを個別挿入。初回/途中/最終work上限、overflow、繰返し時の予算共有、既存失敗優先 |
| SharedBudget bridge5件 | 同じstart/workと他台帳不変、受付期限/取消/既存理由、途中fake clock期限/取消、work capと再呼出し、typed size/JSON/参照/期限/registry上限のラッチ |

generic BudgetとSharedBudgetの両方でJSON内/意味境界の理由を検証する。期待hash/context/clockは合成入力であり、実root保護や実署名の証拠ではない。

## 4. 検証コマンドと途中経過

```sh
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml record_validation
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml record_json
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml
bdo cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml
bdo cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings
bdo cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check
bdo rustfmt --edition 2024 --check native/r2-outer/tests/fixtures/exec_probe.rs
bdo git -c core.fsmonitor=false diff --check
```

- pure16件、bridge5件が成功。Clippy指摘なし。
- 感度確認でactivation/registryのhash比較を一時的に外すと、hash-first試験が失敗（Bindingの代わりにJson(InvalidRecord)となることを検出）。比較を復元して全体を再実行した。一時変更は残していない。
- 全体468件（5 suites）成功、release build成功、Clippy指摘なし。cargo fmt/fixture rustfmt、3文書のlocal link/コードフェンス/行末空白、git diff --checkも成功。

## 5. 未接続・限界

期待hash/context/ParsedRegistryは比較データであり、root承認・安全な実reader・固定build bytesの真正性を証明しない。APPROVED_REGISTRY=Noneは変更しない。
実RecordSource revalidate/RecordBinding投影、index・全closure集合producer/同round観測、OS metadata/path/clock、leaseは未接続。
1,000,000 work capは停止中の内部経路用の暫定値。serde内部/型変換/schema文字列検査/有限policy内処理は完全にinterruptibleではない。管理allocation/RSS上限・hard timeoutを保証しない。
旧public/offline契約、通常v2入口Unavailable、runtime gate92、DER/absence停止、公開JSON/exit codeは維持する。
