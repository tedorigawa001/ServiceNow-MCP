# BP-5 R-2 OL-03：型付き署名policy parser・entitlement純粋比較の合成検証

Date: 2026-10-19 / Status: C方式に沿う純粋部品を内部実装/合成検証。実署名・本番registry・移行は未接続。

## 1. 対象とauthorityの境界

[型付きpolicy契約](BEST_PRACTICE_BP5_R2_OL03_TYPED_SIGNATURE_POLICY_DESIGN.md)のparserとentitlement比較を
`native/r2-outer/src/signature_policy.rs`へ実装した。`parse(bytes, started)`と
`ParsedRegistry::compare_entitlements(reference, policy_id, role, observed, started)`はメモリ上のデータだけを扱う。
parse成功はregistryの真正性・issuer/template承認を意味せず、比較成功はkey件数だけを返す。
公開の観測型は呼出し側が構築できる純粋データで、CF型の実測や暗号検証の証明ではない。

本番registryの組込み/有効化、ledger-0.2 reader、実Security API、署名者/全静的flagの観測値との照合は追加していない。
比較対象はentitlementのみで、署名全体の検証を実装済みとはしない。実行permitは発行せず、runtime gateは92のまま。
runtimeのregistry差替えflag・検証成功hook・実機/PDI接続を追加していない。telemetry調査は保留。

## 2. 初期の構造検証profile

| 項目 | 実装した制約 |
|---|---|
| registry | schema固定、raw bytes SHA-256、最大64KiB/深さ8、各container構築中の32要素上限、policies 2〜32 |
| strict JSON | 全階層重複/未知キー、不正UTF-8/BOM/数値/末尾を拒否。空variantも余分なfieldを拒否 |
| ID/role | 非空の限定ASCII ID最大128bytes、一意policy ID、launcher/Node各1以上、参照role一致 |
| issuer形状 | anchor=`apple_developer_id`、証明書class=`developer_id_application`、Team IDは大文字ASCII英数字1〜128bytes、identifierはID文字集合 |
| descriptor | artifact class=`mach_o_thin_arm64`、symbolic template ID=`developer_id_application_v1` |
| flags形状 | 初期のdraft profileはruntime-onlyの`0x10000`だけ。他bitを足した値・0・float/overflowを拒否 |
| 期待entitlement | launcherはemptyのみ。Nodeはemptyまたは1〜32 keys。valueはtag boolean＋trueだけ。key最大128 UTF-8 bytes・非空・制御文字なし |

issuer/templateの値は構造を限定するためのdescriptorで、実際のrequirement式やOIDを生成/検証していない。
runtime-only profileはより広いflag maskを勝手に許可しないための限定仕様。実Node/launcherへの適用・採用SDKでのflag承認は未実施。
Team ID文字数の制約もこの純粋profileの上限であって、Appleが認める実Team IDだという判定ではない。
これらに適合した架空registryが本番allowlistとして有効になる経路はない。後続のpolicy承認/本番registry固定が必要。

## 3. 型・値の完全一致と失敗時停止

- registry referenceのschema/ID/raw digest、policy IDとroleを完全一致で比較。case fold・探索・fallbackはしない。
- 観測はdictionary/absence_proven/unsupported_or_unknownを区別。dictionaryはVecで受け、重複keyをmap化前に拒否する。
- 観測valueはBoolean(bool)、Number、String、Data、Container、Unknownの別tag。非boolの実値は保持せず、型だけで拒否できる。
- key順序だけを無視。追加/欠落/false化/型違いを拒否し、Unicode正規化・trim・boolean変換をしない。
- emptyは型確認済み空dictionaryまたは呼出し側のabsence_provenを比較できるが、後者の実API生成は未実装。
  不明/欠落を空へ変換せず、非空期待値に対するabsenceも拒否する。
- 観測key上限32・key128bytes・blob長申告64KiB。blob長は呼出し側からの値で、CF blobの実長を検証した証拠ではない。
- 元のInstantを共有し、parser visitor/比較前後で共通10秒を確認。同期計算の協調的deadlineで、OS強制中断ではない。
- 失敗は有限のfieldless enumのみ。raw parser error/issuer/entitlement blobを返さず、ParsedRegistryのDebugも固定文言に限定。

## 4. TDD・発見した不具合と検証

架空のtest registryと観測だけを使用。本番policy/証明書/鍵・実PDIコードは使用しない。

- 正常registry解析を固定拒否stubで失敗させ、parser実装後に成功（RED→GREEN）。
- boolean trueの一致を固定拒否stubで失敗させ、比較器実装後に成功（RED→GREEN）。
- unknown-field回帰で、Serdeのinternally tagged unit variantは`empty`に付いた余分なfieldsを無視すると判明。
  field数0のstruct variantへ変更し、extra entries/unknown fieldの両テストで拒否を確認（RED→GREEN）。lint抑制は追加なし。
- 64KiBちょうど/1byte超、32/33 policiesとkeys、128/129-byte key/ID、JSON深さ8/9を検証。
- trueとfalse/Number/String/Data/Container/Unknownの区別、追加/欠落/重複/大小文字/空白違い、順序だけの差を検証。
- empty/absence/unknown、非空launcher、非true期待値、任意template/未知role/issuer形状・flags不適合を検証。
- registry ID同一でbytesだけ異なる場合の拒否、未知policy・role違い・期限切れ/future startを検証。
- 既存OL-02/closure/deployment/exec/PTYと起動gate92の全回帰を実行。共有JSON readerの旧深さ16・容量上限は維持。

## 5. 最終結果

| コマンド（全てbdo経由） | 結果 |
|---|---|
| `cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml` | 96件成功（既存75＋新規21、4 suites） |
| `cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml` | 成功 |
| `cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings` | 成功 |
| `cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check` | 成功 |
| `rustfmt --edition 2024 --check native/r2-outer/tests/fixtures/exec_probe.rs` | 成功 |

新規21件はintegration 20＋共有parser深さ回帰1。依存/Cargo.lock変更なし。TypeScriptの実装変更なし、全体TS回帰は今回再実行していない。

## 6. 残課題

本番registry raw bytes・issuer/template・static flags・Node entitlement承認、組込みregistryの信頼元接続、ledger-0.2/移行は未実装。
Security adapterでのCF型判定/absence証明・暗号的validity・署名者/flags実照合・FD/path結合は未実施。
公証/失効確認、thread/FD/強制中断・更新排他、最終gate統合も未完了。合成データを実署名/起動許可の証拠にしない。
実機/PDI操作・token発行・設定変更・署名/登録・Pushは行っていない。telemetry調査は保留。
