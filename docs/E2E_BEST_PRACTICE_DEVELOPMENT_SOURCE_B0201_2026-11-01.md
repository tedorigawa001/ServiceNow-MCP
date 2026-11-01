# B-02-01：共通source値検査・開発lifecycleの合成検証

Date: 2026-11-01（JST）。設計基準：`146ddfc`、[B-02設計§7](BEST_PRACTICE_ABORT_SCOPE_DEVELOPMENT_MIGRATION_B02_DESIGN.md)。実通信・PDI操作・設定変更・Pushなし。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。

## 1 変更と保証区分

- shared-kernel：[source-values](../src/servicenow/review-kernel/source-values.ts)の親5列strict schema／target一致とbuild_name projectionを実sourceのprivate受理・通常取得・最終再読へ共通接続。既存のエラー型へ固定理由を写像。行数上限・認証・会計・C方式判断・permitは従来の所有者に残す。
- development-assembly：[source lifecycle](../tests/support/review/ef03/source.ts)と[開発root](../tests/support/review/ef03/assembly.ts)のsource profile経路。run別生成claim、同context参照、ready世代1、親→release、pending ack最大1、一度限り消費、pre／post guard、同期revoke、解放後のsealed summary。実登録台帳・friendは使わない。
- production-class-fake-I/O：旧B-SA／B-ACK／B-ND／B-EF等の試験を削除・skip・変更せず残す。実class側は同値検査への委譲だけを変更。別assemblyの成功を実session／ReleasePermitの正式binding証明と数えない。
- 未対応：bootstrap会計／final予約、OAuth／native reader、実ReleasePermit、選択payload／worker、開発assemblyのcompiled移行・friend撤去。C/G/P=0、R未予約。新規規則追加ではない。

## 2 RED／修正履歴

1. 共通値検査のtracerはmodule未存在でRED→親検査最小実装でGREEN。既存sourceへ委譲後、新旧3ファイル75件が成功。
2. 開発sourceのtracerはmodule未存在でRED→限定lifecycleでGREEN。root接続のtracerはsource profile拒否／scope不一致でRED→内部新規contextとsource-only実行の接続でGREEN。
3. guard最後のcallbackでrevokeする試験が「throwしない」でRED。最初のcallbackでのrevokeだけを試すと後続checkが拾うため見逃すことを確認。原因はcallback後にclosedを再検査せずpreparedへ代入していたこと。post-callbackの失効・first reason検査を追加してGREEN。
4. 同runのcontext wrapperコピーによる再生成が「throwしない」でRED。生成WeakSetがcontext wrapperをキーにしていたためで、run identityキーへ修正してGREEN。
5. 追加試験の配列parameterがVitestで展開され、release行の空配列／21件と過大配列の試験が誤った値を渡して失敗。`{rows}`／`{result}`でcaseを包み修正。製品の期待／期限／上限は緩和しない。
6. standalone型検査でcallback後primaryのTypeScript narrowingエラー1件、後に新試験のOAuth合成値の必須field不足3件を確認。callback後の状態再取得と合成入力の必須field補完で解消。型検査を省略して成功とはしない。

## 3 検証

- 新規：[共通値検査](../tests/review/source-values.test.ts)12件、[開発source／assembly](../tests/review/development-source.test.ts)31件、計43件。実classの枠・construction・run primary・stats不変、foreign／copy／purpose混入、順序・二重消費、pre／post取消、期限理由、guard再入、失効・seal、値pin・有限上限・秘密非出力を確認。
- 関連8ファイル：183件成功。上記2本とdevelopment-root、private-composition-ack、source-status-binding、source-status-binding-boundary、native-session-composition、native-session-boundary。新旧の保証は§1で分離し、総件数を正式binding完了数にしない。
- `npm run build`：成功。standalone `tsc --noEmit`（開発assemblyと新試験、strict／ES2022／bundler）：成功。変更8ファイルのESLint：成功。
- `node tests/review/package-http-classification.mjs`：417ファイル。既存compiled試験と新しい[compiled値fixture](../tests/review/fixtures/compiled-source-values.mjs)が成功。共通値kernel4artifactの同梱、JSのimportがzodのみ、開発rootのJS／宣言／map非混入を確認。これは開発assemblyのcompiled保証やfriend撤去証明ではない。
- 全体テスト：`npm test -- --reporter=json --outputFile=/tmp/servicenow-b0201-full-20261101.json`を他の試験・build終了後に単独実行しexit 0。JSONで219ファイル・9,703件成功、失敗0・保留0、success=trueを確認した。元期限を維持し、重複起動・再試行による選別はしていない。
- コミット前確認：対象14ファイルを明示stageし、indexだけを`/tmp/servicenow-b0201-commit-20261101/`へ取り出して既存node_modulesを参照。build・standalone型検査・関連8ファイル183件・offline梱包417ファイルを順次再実行し、すべてexit 0。無関係な未追跡ファイルはこのコピーに含めていない。全体9,703件の再実行ではなく、上記の全体結果とは区別する。

ネットワークを使う依存再導入や全梱包系の再実行は行っていない。通常の実class試験は合成I/Oであり、PDIの確認済みとはしない。byte layout・全体work／必要量は未導出で、受付へ昇格させない。

## 4 レビュー修正（2026-11-01）

- 開発profileのpinが全配列を21要素へ制限していたため、開発assembly経由の22行releaseが値検査へ届かず`invalid_input`となり、本番の`invalid_response`と一致しなかった。pinの配列上限はobjectと同じ64 keyの資源境界とし、21行上限は共通値検査だけで判定する。assembly経由の22行が`invalid_response`（親消費1・release消費0）となる試験を追加し、pin上限の試験は64行に変更した。
- 開発sourceの`reject()`がrevoke済みの`closed`を`failed`へ上書きし、その後の直接`seal()`が`invalid_state`で失敗し得た。revokeを終端状態として保持し、guard callback中のrevoke後も`closed`のままsealできることを試験に追加した。
- 開発source試験は32件、関連3ファイル（source-values・development-source・development-root）72件が成功。変異確認として、pinの21要素上限を戻すと22行試験が、`closed`上書きを戻すとrevoke試験が各1件失敗した。退避copyから復元し`cmp`で一致を確認した。§3の件数は修正前の記録として残す。
- ND設計とsource受理設計の版数リンク（EF draft-0.11・EF-03 draft-0.8）と、B-02設計へのリンク（draft-0.3）を更新した。
