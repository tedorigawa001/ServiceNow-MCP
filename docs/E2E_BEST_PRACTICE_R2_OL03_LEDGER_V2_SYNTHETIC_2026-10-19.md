# BP-5 R-2 OL-03：ledger-0.2 strict parser・registry参照bindingの合成検証

Date: 2026-10-19 / Status: 純粋データ検査を内部実装/合成検証。installed readerと実行permitには未接続。

## 1. 対象と信頼の境界

[型付きpolicy契約](BEST_PRACTICE_BP5_R2_OL03_TYPED_SIGNATURE_POLICY_DESIGN.md)の参照専用ledger-0.2を実装した。
`native/r2-outer/src/ledger_v2.rs`の`parse_and_bind(bytes, registry, context, started)`はメモリ上の入力だけを検査する。
戻り値は結合したpolicy件数2のsummaryのみで、ledgerのpath・issuer・承認ref・raw parser errorを返さない。

registryは前工程の`ParsedRegistry`。Contextはledger raw hash・世代/release/UID・index hash・OS版/build・開始wall時刻を
呼出し側が与える純粋データで、root所有activationを検証済みだという証拠ではない。
同じデータから期待hashを作れることだけで真正性を主張せず、将来のadapterで独立検証済みrecordへ結合する必要がある。
実ファイル読込・所有者/ACL/xattr・署名/entitlement観測・本番registry組込み・実Node起動は追加していない。
既存`inspect_installed_records`は0.1専用のまま。runtime gateは必ず92で停止し、実行permitは発行しない。
telemetry調査は保留。

## 2. strict schemaとbinding

| 項目 | 検査 |
|---|---|
| schema分離 | 新しい`LedgerV2/BinaryV2/RegistryLink`。旧Ledgerとのunion/自動判別/変換なし |
| version | ledger=`bp5-r2-launch-ledger-0.2`、outer policy=`bp5-r2-outer-macos-arm64-0.2`に固定 |
| JSON | 最大64KiB、深さ16、全階層重複/未知キー、不正UTF-8/BOM/数値/末尾データを拒否 |
| binary | path・SHA-256・version・signature_policy_idだけ。旧requirement/publisher/hardened_runtime/entitlementsは混在しても拒否 |
| registry参照 | schema registry-0.1、ID・SHA-256形状、ParsedRegistryのID/raw bytes digestへ完全一致 |
| policy参照 | launcher/node各IDの存在とrole一致。未知ID・別role・暗黙選択/近いIDへのfallbackを拒否 |
| 既存項目 | generation/UID/release、darwin/arm64・OS版/build、runtime root/cwd/固定entry/index、binaryとreceipt/source/lock hashをstrictに検査 |
| Context | ledger raw bytes hash、generation/release/UID、index hash、OS版/buildと完全一致。JSON正規化後のhashは使わない |
| 期間 | 既存Time検査を再利用。開始wall時刻＋460秒を超える期限が必要、終了時は経過monotonic時間を加算して残り450秒超を確認 |
| 時間 | 元のInstantを共有し、JSON visitorと各照合前後で共通10秒。期限切れ/future start・wall値加算overflowは停止 |

registryの参照/role判定は`signature_policy`の内部`bind_reference`へ共通化し、既存entitlement比較器も同じ判定を使う。
policyの存在を確認したことは、その期待値が本番承認済みであることや、実binaryの署名・entitlementが一致したことを意味しない。
Timeの開始wall値は呼出し側の値。実時計の巻戻り/同期・二重読取・exec直前の期限再検証はinstalled adapterで別途必要。
deadlineは協調的な同期処理の確認で、OS強制中断やallocator停止への保証ではない。

## 3. 旧0.1の互換性

旧Ledger/Activationのschema名・意味・OS readerの判定は変更しない。新型を同じdeserialize unionへ追加していない。
旧0.1のoffline正常系は従来どおり成功し、旧readerに0.2のversion/registry参照/新binary項目を渡すと拒否する。
0.2 parser側は0.1のtag・完全な旧binary形状・旧/新フィールドの混在を拒否し、自動移行しない。
activation-0.1の実record切替・0.2 installed readerへの接続・ledger書換は今回実施していない。

## 4. TDD・合成テスト

架空のledger/registry/Contextだけを使用。最初の正常系は固定拒否stubで失敗し、専用schema/binding実装後に成功した（RED→GREEN）。
追加17件（integration 16＋旧offline交差試験1）で以下を確認した。

- 正常0.2のlauncher/node各policyを解決し、件数だけを返す。
- registry digest/ID/schema不一致、同じregistry IDでbytesだけ変わった場合を拒否。
- launcher/nodeそれぞれの未知policy、別roleのpolicy指定を拒否。
- 旧binary4項目の各混在、旧schema/outer policy ID、required項目欠落を拒否。
- 全objectの未知キー、全階層の重複キー、BOM/不正UTF-8/末尾/深さ超過を拒否。
- ledgerの空白だけを変えても旧raw hashでは拒否。新bytes hashを明示した合成Contextとの照合は成功。
- generation/release/UID/index hash/OS版/build/raw hashのContext不一致を拒否。
- 不正path/版/hash/数値、root外index/Node、cwd/固定entry不一致を拒否。
- 64KiBちょうどを受理し1byte超を拒否。開始余裕460秒ちょうどを拒否し＋1msを受理。
- future approval/不正日時/期限切れ、expired/future Instant、wall時刻overflowを拒否。
- 既存0.1のoffline正常系を維持し、旧readerが新recordを拒否することを確認。従来のpolicy/closure/FD/exec全回帰も実行。

## 5. 最終結果

| コマンド（全てbdo経由） | 結果 |
|---|---|
| `cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml` | 113件成功（既存96＋追加17、5 suites） |
| `cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml` | 成功 |
| `cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings` | 成功 |
| `cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check` | 成功 |
| `rustfmt --edition 2024 --check native/r2-outer/tests/fixtures/exec_probe.rs` | 成功 |

依存/Cargo.lock変更なし。TypeScript/MCPの実装は変更せず、全体TS回帰は今回再実行していない。

## 6. 未接続・未承認

本番registryの固定/承認、0.2 installed-record reader、activation/ledgerの実metadata/xattrと二重読取・時計への結合は未接続。
Security APIでの暗号検証・self/path結合・CF型/absence証明・実entitlement照合は未実施。
更新排他・exec直前再検証・全gate統合も未完了。binding summaryを実行permitへ昇格しない。
実機/PDI操作・token発行・設定変更・署名/登録・Pushは行っていない。telemetry調査は保留。

## 追補：raw hashの照合をJSON解析より前へ移動（2026-10-19）

レビューで、`parse_and_bind`がstrict JSON解析・schema検証の後に`context.ledger_sha256`を照合していた点を確認した。
OL-02 reader（digest照合→decode）とclosure設計§4の3（bytes hash照合→schema検証）の順序と逆であり、
上限付きparserとはいえ未認証bytesを先に解析していた。

- 回帰試験`raw_hash_is_bound_before_any_json_parsing`を追加した。pinしたhashと異なる不正JSON・不正UTF-8・未知schemaは`Binding`、
  pinしたhashと一致する不正JSONだけが`Invalid`になることを固定する。修正前は`Invalid`を返して失敗した（RED）。
- 照合を`decode_bounded`の前へ移し、hash不一致はJSONの形に関わらず`Binding`で停止するようにした。
- 修正後は114件成功（既存113＋追加1、5 suites）。既存試験の期待する失敗種別は変わらなかった。clippy `-D warnings`・`fmt --check`も成功。
