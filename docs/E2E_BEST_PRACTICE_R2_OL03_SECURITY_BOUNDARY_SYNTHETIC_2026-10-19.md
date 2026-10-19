# BP-5 R-2 OL-03：Security API内部境界の合成検証

Date: 2026-10-19 / Scope: Rust内部契約＋test-only fake backend

## 1. 対象

[内部契約draft-0.1](BEST_PRACTICE_BP5_R2_OL03_SECURITY_BOUNDARY_DESIGN.md)に基づき、registry policy取得から署名状態/発行者/flag/entitlement照合までの順序を実装した。
`signature_boundary`はprivate、合成backendは`cfg(test)`のみ。native Security/CF APIや外部コマンドは実装・実行していない。
telemetry調査は保留。実機/PDI操作・token発行・設定変更は行っていない。本番registryは未設定、permit未発行、gate92を維持。

## 2. 実装箇所

- `signature_policy.rs`：参照/roleを検証したpolicyの内部borrowを追加。既存のpublic純粋比較契約は維持。
- `signature_boundary.rs`：固定profile・型付き観測・有限理由・共通deadline/cancel・RAII handleの契約と照合手順。
- `signature_boundary/tests.rs`：架空registry、応答、clock/cancel、Drop counter、phase別失敗を持つfake。
- `lib.rs`：private moduleのみ追加。native backend未実装の段階的部品であるためmoduleのdead-codeを明示許可。

## 3. 追加17テスト

| 区分 | 結果として要求すること |
|---|---|
| 正常系 | launcher/Nodeで正しい順序、launcher self検査必須、固定profile、非authority集計、handle Drop1回 |
| 各API失敗 | before/acquire/validate/self/snapshot/afterで停止、後続呼出し/再試行なし、取得済みhandle解放 |
| null/validity | null handle/snapshot拒否、Invalid/RequirementMismatch/Unknown拒否。情報取得をvalidityの代用にしない |
| self | dynamic validity失敗と、validでも異なるself実体を拒否 |
| deadline/cancel | 全6phaseで応答後の10秒到達/取消を拒否。遅延取得handleもDrop。開始時取消/期限切れ/未来開始はbackend0回 |
| identity | Security側device/inode/size/hash差、最終FD側identity差、壊れた期待hash/sizeを拒否 |
| issuer/flags | Team ID/identifier/anchor/certificate class差、runtime欠落/余分/未知bit、投影文字列上限超過を拒否 |
| 形式 | unsigned/ad-hoc/linker-only/unknown、非thin layoutを拒否 |
| entitlement | missing/unknownをabsenceへ救済しない。false/Number/String/Data/Container/Unknown/64KiB超を拒否 |
| absence | 明示の合成assertionだけを純粋比較器へ渡す。empty期待値のみ一致候補。native producerを実装済みとしない |
| policy | registry digest違い、未知policy、role違いはbackendアクセス前に停止 |
| 非出力 | markerを含む観測でも固定enumのみ。summary Debugは固定文字列 |

合成backendが正しいCF型や暗号検証値を返すことを検証したものではない。
Drop counterはRust handleの解放を確認するもので、実CF所有権やSecurity内部資源の解放を証明しない。

## 4. 検証

```text
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml
bdo cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml
bdo cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings
bdo cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check
bdo rustfmt --edition 2024 --check native/r2-outer/tests/fixtures/exec_probe.rs
bdo git -c core.fsmonitor=false diff --check
```

初回は143テスト成功後、Clippyが`BoundPolicy.template`の本体未参照を検出した（test backendだけで参照）。
境界本体にも対応済みtemplate IDの明示検査を追加し、Clippyを再実行して成功。
その後policy/absence/期待identity/self実体の境界テストを追加した。
最終結果：147テスト成功（既存130＋追加17、5 suites）、release build・Clippy・整形・diff検査成功。
TypeScript/MCP全体E2Eは対象外で再実行していない。

## 5. 未確認

実SDK constants/requirement式、FFI/CF型投影・native RAII、absence生成条件、実暗号検証、公証/失効鮮度、同一FD/path/selfへのOS上の結合は未確認。
停止しないFFIの強制中断・thread/FDのexec適合・更新排他・検査後差替え防止も未実装。
ledger-0.2 reader/closure/deploymentとの一体接続、本番registry承認/組込み、実行permitは別工程。
