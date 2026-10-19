# BP-5 R-2 OL-03：ledger-0.2安全読取・固定registry接続の合成検証

Date: 2026-10-19 / Scope: ローカルRust合成検証のみ

## 1. 境界

[型付きpolicy設計draft-0.4](BEST_PRACTICE_BP5_R2_OL03_TYPED_SIGNATURE_POLICY_DESIGN.md)§5.1と
[前回のledger-0.2検証](E2E_BEST_PRACTICE_R2_OL03_LEDGER_V2_SYNTHETIC_2026-10-19.md)を接続した。
telemetry調査は保留。実機/PDI操作・OAuth/token発行・アカウント/ACL/設定変更は行っていない。
実行permitは発行せず、既存runtime gateの92停止は変更していない。

C方式ではregistryは**外部ファイルではなくbuild時の固定bytes**である。
今回の「安全なファイル読込」はactivationとledgerが対象。registryファイル/path/env/argv指定口は作っていない。
本番registryの承認・組込みは未実施で、`APPROVED_REGISTRY=None`を維持する。
引数なしの`inspect_installed_v2_records()`はファイル読取前に`Unavailable`で停止する。
合成registryの注入はprivateな内部関数のテストだけで、公開起動フラグ/owner緩和はない。

## 2. 実装

- `records_v2.rs`：固定registryのstrict解析、実UID/group/OS取得、安全なactivation/ledger読取、参照binding、再読取照合を一つの内部経路に接続。
- Native sourceは既存の`filesystem.rs`を再利用。directory FD基準・`O_NOFOLLOW`・regular単一link・所有者/mode/ACL・祖先metadata/identity・64KiB上限を維持する。
- activationは固定path、root所有0440、宣言したreader GIDと実groupを照合。ledgerはactivation指定path、実行UID所有0600。raw hash不一致はJSON解析前に停止。
- `ledger_v2::parse_bound_ledger`：既存の純粋`parse_and_bind`と共用し、同じstrict parser/bindingを使用。外部向けの旧summary契約は変えない。
- Contextは検査したactivationと実OSから内部生成。世代/release/UID/indexとledgerの一致を要求。
- registry ID/raw digest・未知policy・launcher/Nodeのroleを照合。schema/旧項目の混在や旧版fallbackは拒否。
- activation/ledger各2回の読取を比較。bytes・metadata・祖先identityが変われば停止する。
- 同じ10秒予算をregistry/parser/読取再確認まで維持し、各段階のclock整合を検査。開始時460秒超、終了時450秒超の残期限を両recordへ要求。
- 結果はopaqueな`InspectedV2Records`。Debugは固定文字列、errorは固定enum。registry本文/issuer/path等を表示しない。

旧`inspect_installed_records()`は0.1専用のoffline経路のまま。旧型/exec接続を変えていない。
新型から旧型/exec permitへの変換や`launch_paths`公開はない。

## 3. 合成テスト

追加17テスト（既存113 → 全130、5 suites）。テストfixtureは架空の値で、実際の資格情報/コード本文は含まない。

| 区分 | 確認 |
|---|---|
| 正常内部接続 | 固定activation→ledger→両再読取、opaque非authority出力 |
| 未承認registry | 通常入口はUnavailable、不正build bytesは一切ファイルを読まない |
| bytes binding | 同一registry IDでもraw bytes差で拒否、ledger hashをJSONより先に照合 |
| 新旧分離 | 旧0.1のoffline正常系維持、両readerが相手版を拒否 |
| ファイルtrust | 両recordのowner/mode/特殊bit/ACL/link/regular不適合、祖先不適合・欠落を拒否 |
| 差替え | activation/ledgerの再読取identity差を拒否 |
| 文脈 | root UID、group/GID、世代、OS、index、実行UID不一致を拒否 |
| registry契約 | 未知policy・role違い・digest違い・外部registry path追加を拒否 |
| bounded | missing、64KiB超、壊れたactivationで停止 |
| 時間 | 読取前の時計逆行/drift、開始後各1〜4読取時点の10秒到達で停止、新規読取を増やさない |
| 期限境界 | 両recordの460秒ちょうどを拒否、460001ms残＋9999ms実行を受理 |

既存のNative `openat` leaf/ancestor symlink拒否テストも全体実行に含める。
内部readerの正常系は合成Sourceによるもので、root所有の実配備を構築・検証した証拠ではない。

## 4. 検証コマンドと結果

```text
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml
bdo cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml
bdo cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings
bdo cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check
bdo rustfmt --edition 2024 --check native/r2-outer/tests/fixtures/exec_probe.rs
bdo git -c core.fsmonitor=false diff --check
```

全130テスト成功、release build・Clippy（warnings拒否）・整形・diff検査成功。
Rustのみの変更で、TypeScript/MCP全体E2Eは再実行していない。

## 5. 未確認・次工程

- 本番registryの人による承認、信頼済みbuild/署名への固定bytes組込み。
- Security APIによる署名/entitlement/公証等の実観測と同一artifactへの結合。
- 更新排他、closureと署名検査の一体化、検査後の差替え防止。
- レコード読取のxattr検査は追加していない。今回再利用したOL-02 file契約と、deployment scannerのxattr契約は別物である。
- 10秒は段階ごとの経過時間検査。filesystem I/O中の強制中断・hard realtime保証ではない。
- 本番reader有効化、実配備、実行permitは別工程。合成成功をそれらの承認に転用しない。
