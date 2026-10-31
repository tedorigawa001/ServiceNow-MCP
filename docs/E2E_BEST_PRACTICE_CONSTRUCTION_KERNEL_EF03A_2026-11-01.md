# EF-03A：純粋construction kernel抽出・既存class接続の検証

Date: 2026-11-01 / Baseline: `7d82842` / Scope: 合成依存・既存class回帰・ローカルcompiled検査のみ。

## 1 実装範囲

[設計§9](BEST_PRACTICE_ABORT_SCOPE_KERNEL_ROOT_SEPARATION_EF03_DESIGN.md)に沿い、[kernel](../src/servicenow/review-kernel/construction-state.ts)へ固定resource状態・理由正規化／公開写像・first reason・commit／copy／sealを抽出した。純粋factoryは自分のローカル状態だけを生成し、外部seed・owner・実handleを入力しない。固定コードSetは静的語彙であり、run registryではない。

[session](../src/servicenow/bounded-read.ts)の最初のfieldからprivate wrapper経由でkernelを生成する。実参照束・core／sourceの生成claim・failure WeakMap・admission・clock・認証・停止・rollbackはrootに残した。recordBindingは参照検査後の診断ラベルであり、正式証拠の発行・採用APIではない。ReadFailureCode／ConstructionDiagnosticは従来のimport先から型として取得可能で、公開JSONを変更していない。

## 2 RED／GREENと合成条件

最初のtracerは新kernel module未実装でimport失敗（exit 1）。抽出・既存class接続後、tracerとEF-02／ND-03の56件、buildが成功した。その後に理由写像・resource終端・独立状態の条件を追加し、同3ファイル83件が成功した。

[kernel試験](../tests/review/construction-kernel.test.ts)は28件：

- clock／日時／controller／timer／fetchの境界をthrowにしても純粋生成・診断・sealが可能。外部呼出し0。
- 公開理由20種の維持、内部3理由の公開internal_review_error写像、先行理由の保持。
- 未知string／object／proxyを読取・文字列化・保持せず固定理由へ正規化。
- 未取得返却0、解除1回、未知handleと未解放slotのunconfirmed、seal後の変更・再commit拒否。
- copyの再帰freeze・detach、historical bindingとlive authorityの区別。
- ローカルkernelを生成・変更・sealしても既存実sessionの診断・admissionは不変。

既存EF-02の25件とND-03の30件は実classのまま実行し、constructor失敗copy・事前abortと、commit後の取消／HTTP失敗のrun診断分離を維持する。別開発assemblyへの移行ではないため、今回はその保証を置換していない。

## 3 検証結果

最終確認：

- `bdo npm run build`：成功（exit 0）。
- `bdo npx vitest run tests/review/construction-kernel.test.ts tests/review/construction-transaction.test.ts tests/review/native-session-composition.test.ts`：3ファイル83件成功。
- `bdo npm test -- --reporter=json --outputFile=/tmp/ef03a-full-test.json`：216ファイル・9,632件成功、失敗／保留0（exit 0）。
- 変更TypeScript3ファイルのESLint：成功。
- `bdo node tests/review/package-http-classification.mjs`：413ファイル、kernel4artifact同梱・AST無依存・EF-03Aを含むcompiled fixture成功。
- `bdo node tests/review/package-canonical-budget.mjs`：413ファイル、既存canonical会計・private ack・synthetic_io経路のcompiled回帰成功（撤去は未実施）。
- 文書3ファイルのローカルリンク31件、空白検査、`bdo git diff --check`：成功。

[compiled fixture](../tests/review/fixtures/compiled-construction-kernel.mjs)は配布対象kernelと既存classを使い、独立状態・固定理由・seal・run取消後もconstruction primaryがnullであることを確認する。外部通信をしない。[pack検査](../tests/review/package-http-classification.mjs)はkernelのJS／map／宣言／宣言map同梱を要求し、compiled ASTでimport／再export元／dynamic import／requireがないことを確認する。新moduleは必要な本番依存なので梱包除外しない。

## 4 費目と未対応

診断状態は固定10resource・first reason1・履歴binding2・固定purpose3。rootの参照／claimを複製したrun台帳はなく、kernel委譲の固定writer object1と差分method closure4を追加した。kernelのrecord／copyはdispatch C=0・受信G/P=0・予約Rの更新0。実際の計上・解放callbackは従来rootだけが行う。byte量・Rust work上界・全体受付モデルへの昇格は行っていない。

friend／synthetic_io／開発probe・fake I/O moduleは残る。EF-03B以降の別root／brandへの試験移行、friend本体撤去、EF3-N01〜N09変異試験、空build／tarball展開による全閉包検証は未実施。今回のpack成功をそれらの完了と扱わない。依存再installを伴うpackage-worker試験も今回の限定梱包検査とは別である。

正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持。実接続・実通信・実機操作・設定変更・Pushは行わない。
