# FP3-C root側one-shot consumerと消費中slot

Date: 2026-11-04。実装開始時HEAD: `2f9c13d`。[FP-3内部契約](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_FP3_POST_ACCEPT_BUNDLE_DESIGN.md)§6の固定消費・失効／全破棄だけを合成依存限定で実装した。

## 1 固定入口と所有権

package-excludedのfresh入口`createSyntheticBundleConsumerRoot`が、同take・受領snapshot・parts・proof pair・未公開完成bundleを経て、引数なし`consumePreparedBundle`へ固定接続する。外部bundle／summaryの登録、mode引数、payload getter、callback、runtime friendは追加しない。FP3-Aのpair-only、FP3-Bのprivate ready後固定abort、旧FP-1／FP-2／D2の入口と試験を維持する。

`bundleConsumeStarted`を検査より先に立て、同rootのready状態・唯一のbundle・readies=1を検査する。ready slotから同objectを`consumingBundle`へ移し、ready利用権限は残さない。claimは失敗でも戻さず、消費中の再入・二度目の固定入口呼出し・別rootのbundle・同形copyを拒否する。

consumerはpayloadのローカルcopyをguard越しに保持せず、rootの追跡slotだけから検査する。元parts／proof pair／expectation／本文／rows／prefixの参照とmarker・originは、固定照合用の借用であり再発行権限ではない。

## 2 同budgetの停止と失効

既存の同じguard／budget ownerで`bundle_consume_pre`→work全構成照合→`bundle_consume_post`→最終全構成照合を行う。開始UTC・全deadline・会計を再生成／更新しない。初回ready用検査の条件を緩めて再利用せず、消費中状態・同slotの存在・元利用slot不在と、同parts／proof pair・全内容・budget identity／serial・失効serial・source／ready／cleanupのlive条件を確認する。

work不適合は固定理由だけを暫定保持し、post停止の取消／期限・先行hardを優先する。postが通っても最後の同一性・失効再確認を通さなければretireしない。未知理由・guard例外・内部例外は固定分類とし、生例外・本文・handleを診断へ保存しない。

全照合通過時は、消費中slot・bundle origin／marker・proof origin／marker・dest owner・kernel内の照合用payload参照を外し、最後だけ消費数を1にする。直後に既存固定`state` abortへ進む。inspectの`retired=true`／消費数1は局所論理破棄の履歴であって正常成功ではなく、外側状態はfailed、公開／seal数は0のままである。

停止／例外時も消費中slotを含む全payloadをclearし、busy終了・kernel側payload不在を確認してから本文破棄receiptと上位custody移譲へ進む。参照を残すと移譲は止まる。cleanup-only capsuleと固定診断だけを上位へ渡し、source closed／OS cleanup confirmedへ昇格しない。通常のJS参照解放であり、物理消去・OOMからの復旧保証ではない。

## 3 合成試験・compiled保証

- 新FP3-Cは10 tests。reviewedゼロ／mixed、pre時点でreadyなし・消費中あり、post時点で未消費、完了消費1後固定abort、二重利用拒否、pre／postの取消・期限・throw・未知理由、swallowed再入、同既存予算／固定期限、source／cleanup失効・引数拒否・秘密非出力・旧Bのconsumerなしを確認する。新旧6 files／60 tests成功。
- 実graphをstrict TypeScriptで一時ESM treeへemitし、旧D2／FP-1／FP-2（55 field等故障）・FP3-A（レビュー補強済み45故障）・FP3-B（49故障）のcompiled試験を維持する。追加の故障・別rootの実objectは一時emit copyだけへ注入する。fetchは拒否stubで固定する。
- Cは28種類のentry／work／post／origin故障。entry7条件はconsumer checkpoint前に停止し、逆順のprivate呼出し・同継続で二度呼ぶ場合も再armしない。work中13種類の状態・slot・budget・失効ずれはpostまで固定理由を保持し、取消／期限を優先する。work throw／payload失効2種類、post後の失効・copy・budget serial等5種類、別root実bundle1種類も拒否する。28は分類数であり反復実行数ではない。完了数を故障として先に1へ変えたentry caseでは、値を増やさずwork=0で拒否することを確認し、実消費完了とは数えない。
- 消費中slot／bundle origin／marker／proof origin／markerの5つの最終clearを一つずつ外すと、本文破棄確認・custody移譲を拒否する。retire途中3箇所で例外を注入しても消費数0・全破棄となる。
- abortのclearによる救済とは別に、retire直後・完了数加算前の全alias／kernel借用参照不在を一時oracleで観測する。正常系が通り、7つのretire処理を一つずつ除くと完了数0で停止することを確認する。
- pre／post checkpoint除去、post全結合再照合除去、ready→消費中move除去の4変異は、それぞれ対応する停止／成功oracleを失敗させる。さらに消費中slotを残したまま`isCleared`からその不在確認を除くと、誤って本文破棄receipt／移譲が通る5つ目の負の対照を確認する。one-shot bool単独の必要性は、状態遷移・ready slot除去・外側transfer claimと重複するため、この5変異の保証として数えない。
- 新root／消費中slot／claim／helper名を梱包漏洩の負の対照へ追加した。実runtimeへのimportや公開登録口は追加しない。

## 4 初回失敗と実行記録

- 最初の新旧60 testsとビルドは成功した。
- compiled初回は、故障注入でrootのbudget identity自体を差し替えたcaseに、上位custody移譲の成功まで期待して失敗した。`assertCleared`の`resources.budget === budget.identity`を追跡し、元resource台帳と異なる予算への移譲を既存契約が拒否していることを確認した。このcaseだけは消費0・全payload slot不在と、本文破棄receipt／custody移譲の拒否を期待するよう訂正した。破棄と移譲を混同せず、実装・照合・期限は変更していない。
- 訂正後のstandalone compiled試験は、旧保証・Cの28故障・5残留slot・3途中例外・7retire省略・5変異対照を含め成功した。
- `npm run build`：成功。対象4ファイルのESLint：問題なし。
- `npm test -- --reporter=json --outputFile=/private/tmp/servicenow-fp3c-vitest.json`：ローカル合成待受が可能な条件で285 files／13,750 tests成功、失敗・保留0。製品／試験期限は変更していない。
- `env npm_config_offline=true npm run test:pack`：外部取得禁止・既存ローカルキャッシュだけでproduction-only install／analysis／aggregation成功（441 files）。
- `node tests/review/package-http-classification.mjs`：固定依存・配布除外・漏洩負の対照とcompiled監査が成功（441 files）。
- 最終の対象4ファイルESLint・`git diff --check`は問題なし。関連4文書のローカルリンク33件は全て存在する。最新の28故障／5変異対照も梱包監査内で再実行し成功した。

## 5 閉鎖状態と残課題

正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。seal成功・実session／worker／runtime接続・実通信・実機操作・設定変更・Pushは行っていない。実装時点では未コミットとし、その後の指示によるコミット前検証を§7へ記録する。

追加費目はroot claim／消費中slot、pre／postと二度の全構成照合、暫定理由保持、同一性再確認、借用参照retire・失敗clear・診断保持。C/G/P・retry・210試行・全60秒は既存のまま。全work／heap・copyピーク・3round配賦・予約額を導出したとは扱わず、Unknownを0へ置換しない。

実atomic commit・利用可能dest／seal成功・正常terminal-only cleanup接続は別工程である。今回のretired履歴や未公開bundle成立を、その承認・完成証拠として使わない。

## 6 レビュー修正（2026-11-04）

本記録の故障件数は修正前の記録として残す。レビュー時にrepo全体のlint（error 0・warning 374）、build、梱包分類監査（441ファイル、Compiled FP3-Cを含む）、全体合成285ファイル／13,750件成功・失敗0を確認した。

kernelの37変異を確認し、次の条件は外しても既存試験が全て通過した。実装は正しく、試験だけの不足である。

- `retireConsumedBundle`入口の9条件（状態、消費中slot、started、完了数、pre／work／postの通過数、postの照合数、暫定理由）。retireは照合の直後に呼ばれ、既存故障はこのガードへ届かなかった。§3のretire省略はガードより後の処理だけを対象にしている。
- work照合の完了数条件。
- work中にhardが立った場合のrethrow。外すとhard後にpost guardが1回余分に呼ばれる。
- `proofIssueState='retired'`の書込み。直後のclearで上書きされ、観測点がなかった。

[compiled fixture](../tests/review/fixtures/compiled-destination-preparation.mjs)に11故障を追加した。retire直前に各条件を崩す9件、work中に完了数を崩す1件（workでの拒否を確認）、work中のhard停止1件（post guard呼出し0を確認）である。別にconsumer戻り時点でretired状態を確認する一時oracleを追加した。上記12条件を一つずつ外す変異は、それぞれ対応するcaseで初めて失敗した。

[合成試験](../tests/review/synthetic-bundle-consumer.test.ts)のguard内`expect`は呼出しの外へ移した。guard内の例外は`checkpoint`が`internal`へ変換し、失敗表示が実際の原因を指さなくなるためである。あわせて[FP-2試験](../tests/review/synthetic-bundle-parts.test.ts)に残っていたstrict型エラー1件（`bundle_parts`のoptional参照）を、判定を弱めずに解消した。

`checkConsumingBundle`の`!busy`（`operation`内でだけ呼ばれる）、`first`（hardは`fail`で例外となり直前のcheckpointかrethrowで止まる）、`!consumingBundle`（`value!==origin.value`が同じbindingで拒否）は等価変異として扱う。kernelは変更せず、設計書をdraft-0.8とした。vitest試験数は不変。修正後も全体合成285ファイル／13,750件成功・失敗0。

## 7 コミット前の再検証

ユーザーのコミット指示後、今回の9ファイルだけをstageし、未stage差分・未追跡ファイルがない状態で再検証した。ビルド、対象4ファイルのESLint、全体285 files／13,750 tests（失敗・保留0）、外部取得禁止の梱包試験（441 files）、最新compiled保証を含む配布除外監査（441 files）が成功した。関連4文書のローカルリンク33件と差分の空白検査も問題なし。全体テストの出力先は`/private/tmp/servicenow-fp3c-commit-vitest.json`。初回の期待値訂正の記録は維持し、期限・閉鎖状態は変更していない。
