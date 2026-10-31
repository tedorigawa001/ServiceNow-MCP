# ND-01：上位診断owner・固定purpose slot・one-shot binding／seal

Date: 2026-10-31。対象：[詳細設計§11](BEST_PRACTICE_ABORT_SCOPE_NATIVE_STATUS_DIAGNOSTIC_DESIGN.md)。純粋fakeの合成試験であり、実通信・実PDI検証ではない。

## 1 実装範囲

- [開発専用model](../src/review/abort-scope-evidence-native-diagnostic.ts)のprivate constructorが、観測・clock・I/Oなしでauthentication／parent／releaseの固定slotを確保する。bindingは同creatorのimmutable identity objectへ一度だけ行い、混入／copy／重複／失敗後の再利用を拒否する。
- header・cleanup・acceptanceのpurpose別writerと停止・解放writerをprivateに保持する。外部に返すのは固定case名runnerだけで、既存owner／session／writer／cleanup診断を提出する口はない。fixture台帳・実session claimとの共有はない。
- first primaryの内部／公開code、first local、first refusalを別々に保持する。HTTPとcleanup終端を独立して残し、停止後の後着観測でも最初のprimaryを上書きしない。
- cleanupは未開始／pending／confirmed／unconfirmed、teardownは未開始／解放中／確認済み／未確認を区別。pendingのままsealすると未確認に固定する。late success・二重終端・再消費は権限を復活させない。seal後の全writerと二重sealはlate_ignoredとなる。
- ordinal1の事実は後続観測で変更しない。後続件数・最初の理由、現在attemptの固定サイズ進行状態を保持する。確認前の次attempt開始、順序飛び、重複、上限210超を拒否。全7permissionは常にfalse。
- [compiled fixture](../tests/review/fixtures/compiled-native-status-diagnostic.mjs)を既存[offline梱包確認](../tests/review/package-http-classification.mjs)へ追加した。新moduleとtestは配布対象外、配布runtimeからの参照もない。

## 2 RED／GREENと追加レビュー

- 最初の1テストはmodule未実装でRED、固定slot・binding・seal実装後にGREEN。
- binding失敗／二重binding／観測前順序違反と、hard HTTP＋cleanup失敗のテストを追加し、未対応caseのREDから実装後のGREENを確認。
- release403／404／no_body、先行取消／期限、parent404のlocal分類、hard403、混入・copy・二重終端、pending終端、seal後writer、ordinal2以降、入力strict検査・秘密非出力を追加。HTTP／cleanupの矛盾4件もREDからGREEN。
- 専用50テストと全体210ファイル・9,419テストが一度成功した後、自己レビューで後続attemptのcleanupを単に無視していた点を発見した。後続cleanup失敗をprimaryへ保持できず、pending中の次attempt開始も拒否しないことを、追加2件のassertion failureで再現した。
- 原因はordinal1の保存slotとcurrent attemptの進行状態を同一視したことだった。固定3個のcurrent状態を別に持ち、後続失敗でも停止、cleanup確認前の置換を拒否するよう修正。ordinal1の診断は不変のまま、専用52テストが成功した。

## 3 検証条件・最終結果

- [専用テスト](../tests/review/native-status-diagnostic.test.ts)：52件成功。期待値はテスト側の固定status／code・状態・参照境界に明示し、製品側scenario一覧や分類関数から生成していない。
- `bdo npm run build`：成功。
- `bdo npm run lint`：0 errors・374 warnings。ND-01の変更source／test／compiled fixture／梱包scriptを指定したESLintは警告も0。
- `bdo node tests/review/package-http-classification.mjs`：既存status各段階とND-01のcompiled試験成功。offline・ignore-scriptsのpack dry-runは409ファイル。ND-01 module／fixtureの非同梱、配布runtimeの非参照を確認。
- `bdo npm test`最終再実行：210ファイル・9,421テスト成功（41.61秒、専用52件を含む）。その後、seal直後のcopyをlate writerより前に捕捉するfixtureの観測順だけを整理し、buildと専用52件を再確認した。期限・上限・設定は変更していない。
- build後の依存再インストールを伴うworker梱包試験は実行しない。offline pack確認の成功を、その試験や実環境検証の成功に置き換えない。

## 4 未接続・閉鎖

native Response／reader・typed cleanup証拠の発行・source consumer・既存実session／ReleasePermit／canonical予算へのbindingは未接続。合成cleanup enumや返却diagnosticから正式証拠を発行できない。acceptanceは診断model上の非実行遷移に限る。

取消／期限は固定codeの合成イベントで、実clock／元windowによる中断検証ではない。reader操作数・pre-release facts・native no_bodyの証明と、実予算C/G/P/Rの会計確認はND-02以降。owner生成時のメモリ確保失敗も注入していない。

正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。fallback有効化・実接続・実通信・実機操作・設定変更・Pushは行っていない。
