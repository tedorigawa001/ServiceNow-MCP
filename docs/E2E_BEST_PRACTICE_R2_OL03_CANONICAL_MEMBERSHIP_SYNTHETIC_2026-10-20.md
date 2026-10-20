# OL-03 canonical参照所属判定：合成検証

Date: 2026-10-20 / Scope: 既存immutable宣言への参照所属。OS実証/全体受付ではない。

## 1. 変更

relative validateのedgeごとの全entry検索と、require_parent/require_childのcanonical検索を、同じ固定回数helperへ置換した。sliceのポインタ範囲、要素境界、canonical要素へのptr::eqで所属を判定し、virtual indexは元オブジェクトへのptr::eqだけで許可する。guardは従来のscope/receipt/round/budget/親子view確認を維持する。

helperは1 work＋前後checkpoint。unsafeやポインタ復元/外部dereferenceはなく、結果にaddressを含めない。所属を確認する前に候補のpath/valueを走査しない。別slice/コピーを値の一致で許す仕様には変更しない。

## 2. 回帰・合成テスト

- 既存のコピーentry・別親view・別round/budget・origin/resource混入の拒否テストを維持。
- 新規4テスト：N=1/5,500/100,000で先頭/中央/末尾/virtual index、別slice、コピーしたentry/indexを各1 workで検査。各Nで末尾参照の64回確認が64 workであることも検査。
- empty/subslice直前・終端の範囲外拒否と、subslice内要素の正確な受入れを検査。
- work上限・検査前の取消・期限切れ・sticky理由の保持を検査。各3 checkpointへの期限注入も成功を停止させる。
- N=100,000は純粋helperに渡す合成Vecであり、JSON全体を共有予算で受付したテストではない。allocation準備をhelperのwork1に含める主張ではない。
- 先に既存work期待値をfile106/directory94へ変更し、修正前は実測112との差で失敗した。実装後は新値で成功。file残work0〜106の全prefix・各取得点の失敗/取消/期限・cleanupも再実行した。

追加テストの初回実行で、fake clock内で最後の取消loadの**後**にflagを変更しても即時拒否される、という過剰な期待が失敗した。SharedBudgetの既存順序（取消load→時刻取得）を照合し、製品の協調停止仕様は変更せず、期限を各checkpoint、取消を検査前の独立ケースとして検証した。最後のguard後に発生した取消を遡及的に捕捉する保証はしない。

## 3. 費用

membershipはentry位置/Nによらず1 work。require_childはroot親6/nonroot親7。相対入口Vは旧 `6+Q+2k+Σp_i` から **`6+Q+3k`**、再照合全体は `V+9(h+k)+39`。fixtureはfile106、directory94。rootだけの42、root expected child15等の無関係な費目は維持する。

directory(path)の名前検索・expected child全走査・child/seen lookup・metadata18M等は対象外で、これだけで完全collectorを100万以内に収められたとはしない。旧index/scan上界のmodel ID・cap・3round配賦は変更せず、全体受付は無効。

## 4. 最終検証

```sh
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml
bdo cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings
bdo cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml
bdo cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check
bdo git -c core.fsmonitor=false diff --check
```

最終再実行結果：全Rustテスト **666 passed**（追加4、既存662）。clippy全targetsは警告なし、release build・cargo fmt check・diff checkも成功した。テスト関数数であり、独立ケース数・実OS性能/網羅率ではない。

telemetry保留・OS/API実接続なし・実機操作なし・本番policy未投入・DER/absence停止・permit未発行・全体受付無効を維持する。
