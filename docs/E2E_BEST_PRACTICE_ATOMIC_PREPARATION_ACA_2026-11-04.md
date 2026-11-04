# AC-A 合成内owner・準備claim・失敗診断と全破棄

Date: 2026-11-04。実装開始HEAD: `381c7fd`。[atomic commit準備・失敗時所有権設計](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_ATOMIC_COMMIT_FAILURE_DESIGN.md)のAC-Aだけを実装した。開始時は作業ツリーがクリーンで、前工程のFP3-Cレビュー補強・既存型対応の設計更新はコミット済みだった。それらを維持する。

## 1 内部ownerと一度限りの準備

package-excludedの`createSyntheticAtomicPreparationRoot`は、引数なし`prepareAtomicCommit`を持つ別fresh合成継続である。callerがmode・owner・shell・bundleを指定する口、外部登録・getter・runtime friendを追加しない。FP3-Cのconsumer／retireや旧rootを変更せず、同rootのFP3-B ready bundleから準備だけに分岐する。

DATA検査前にAtomicPreparationOwner、同ownerのAtomicDestinationShellと非公開空handle、元identity台帳、準備claim・診断slotを確保する。ownerは既存DestinationOwnerと同tokenに結合する。台帳に残るのはpayloadを含まない元shell／owner参照だけで、使用権限・再登録権限はない。clearでは使用slot側のowner／shellも外す。

準備入口でclaimを先行消費し、reserved・同owner／shell・同ready bundle・空の準備slotを確認してpreparingへ進む。同bundleを準備追跡slotへmoveし、ready slotを外す。pre guard後、AtomicPreparationに同owner／shell／bundle・budget identity／serial・失効serial・開始UTC／全deadlineを結合する。workとpost後の最終検査で同bindingと元bundle全構成、source／ready／cleanupのlive条件を再照合する。

AtomicPreparationはbasic bindingであり、完成PreCommitBundle・CanonicalCommitRecordやterminal証拠ではない。AC-Aにはstaged／committing／sealed状態、commit成功claim、利用可能handle、正常終了票を作らない。全検査を通ってもfixed_abort phaseのstate失敗で終える。

## 2 停止・失敗診断とcustody

既存の同guard／budgetでatomic_prepare_pre／postを実施し、新timer・新会計・残時間からの期限再計算はしない。work不適合は固定理由だけを暫定保持し、post停止を優先する。先行hardがある場合は新postへ進まない。first failureの固定phase／reasonを一度だけ保存し、後の私的な二重入口・外部再試行でも置換しない。診断にraw例外・本文・opaqueを保持しない。

状態はreserved／preparing／invalidated／failedだけ。source close／cleanup開始でinvalidatedにし、後続の利用を拒否する。失敗では準備中bundle・wrapper・owner／shell、既存proof／origin／全payloadをclearし、busy終了とkernel側payload不在を含むisClearedを満たした後だけ本文破棄receipt／既存上位custodyへ進む。claim・件数・固定理由は残す。

元resource台帳とbudget identityが食い違う場合は、payloadが消えてもcustody移譲を拒否する。budgetを再発行して救済しない。上位へ渡すのは同constructionのcleanup-only capsuleと固定診断・未解決責務だけで、本文や準備物をclosureへ隠さない。本文破棄とsource closed／cleanup confirmedを混同せず、未確認責務はUnknownのまま保持する。

## 3 試験と独立した負の対照

- 新AC-Aは10 tests。reviewedゼロ／mixed、DATA前の空shell、reserved→preparing、元ready不在、pre前wrapper不在／post時wrapper保持、同budget維持、失敗後再試行拒否・秘密非出力と固定abortを確認する。pre／postの取消・期限・throw・未知理由、swallowed再入、元固定期限、早い入口／余剰引数／source・cleanup失効も確認する。
- 新旧7 files／70 tests成功。既存FP3-Cのretire継続にprepareAtomicCommitや新inspect欄を追加しない。
- strict TypeScriptで実graphを一時ESM treeへemitし、旧D2／FP-1／FP-2・FP3-A／Bとレビュー補強済みFP3-Cの39故障等を維持する。fetch拒否・package除外・固定純粋依存の監査を継続する。
- AC-Aの34故障は、準備入口14条件（guard実行0・starts0）、wrapperのtoken／owner／shell／bundle／budget／serial／失効世代／開始UTC／全deadlineの9変更（post取消／期限優先も確認）、work状態／slot等7変更、最終再照合3変更、別rootの実wrapper1種類。件数は故障分類数で反復数ではない。wrapperの全field対応を見ており、wrapperを独立の完成発行証拠に昇格させない。
- wrapper確保throwでもpostまで固定理由を保持し、期限を優先する。work内の先行hardはpost実行0。同budget identityの故障では、消費／公開0とcustody拒否を確認する。内部で最初の失敗をcatchしてから再入しても、最初のphase／reasonを維持する。
- 準備中bundle／wrapper／owner／shellの4 clearを一つずつ除くと、本文破棄receipt／custody移譲は拒否される。参照を元slotや上位へ戻す経路はない。
- pre／post checkpoint、最終照合、readyから準備slotへのmoveをそれぞれ外す4変異で、対応oracleがAssertionErrorになる。故障はtemporary emit copyだけへ入れ、ソースにfault hookを作らない。準備claimの一部はroot失敗・state／slotと冗長なので、4変異の保証には数えない。

## 4 初回失敗と実行記録

- 最初の編集適用は、1行のclear関数の一部分を行全体として指定したため一致せず停止した。変更は適用されていないことを確認し、実際の行を読んで適用し直した。
- 最初の新旧70 testsとビルドは成功した。compiled初回は、clear内に追加したifによりemitが複数行になり、既存fixtureの1行範囲ではcontentCheckedのclearを見付けられず停止した。生成位置を追跡し、既存proof状態と同じ三項演算の固定状態代入へ揃えた。同じ状態遷移・全clearを保持し、期限や拒否条件を変更していない。
- 文書一括更新の初回は、前工程で親参照から版番号が外れていたため位置指定が一致しなかった。差分が未適用であることを確認し、現行親の節見出しへ更新位置を合わせた。
- 修正後standalone compiled保証は旧試験とAC-Aの34故障・4残留slot・4変異対照を含め成功した。対象4ファイルESLintは問題なし。
- 初回の全体回帰は286 files／13,760 tests成功、失敗・保留0。外部取得禁止の梱包試験とcompiledを含む配布監査も各441 filesで成功した。
- 最終レビューで、専用準備継続の固定abortが外側のtransferAborts更新より先にthrowするため、固定abort件数だけ0となることを発見した。reviewedゼロ／mixedの2ケースへ件数1のassertionを追加し、2失敗／8成功で再現を確認した。専用固定abortの直前だけtransferAbortsを1へ更新し、停止・混入の分類やseal数は変更しない。修正後の再検証結果を以下へ追記する。
- 診断件数修正後、新旧7 files／70 tests、standalone compiled保証、ビルド、対象4ファイルESLintが成功。`npm test -- --reporter=json --outputFile=/private/tmp/servicenow-aca-vitest-final.json`は286 files／13,760 tests成功、失敗・保留0。製品／試験期限は変更していない。
- 最終版の`env npm_config_offline=true npm run test:pack`は外部取得禁止・既存キャッシュのみでproduction-only install／analysis／aggregation成功（441 files）。`node tests/review/package-http-classification.mjs`も最新compiled保証・漏洩負の対照・固定依存と配布除外監査を含め成功（441 files）。関連3文書のローカルリンク22件と`git diff --check`も問題なし。

## 5 維持する制約と次工程

正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。seal成功・実session／worker／runtime接続・実通信・実機操作・設定変更・Pushは行っていない。実装時点では未コミットとし、その後の指示によるコミット前検証を次節に記録する。

追加費目はshell／owner／marker／空handle・元identity台帳、準備wrapper／重複参照保持、pre／post・work／finalの全結合照合、固定診断・全clearとcustody検査。元C/G/P・retry・210試行・全60秒・局所bounded上限は不変。全work／heap・copyピーク・3round配賦・必要予約／中断粒度はUnknownのままにする。

次はAC-Bの同bundle／record／terminal bindingと未公開staged境界。AC-Aのpreparingやwork通過をstaged・利用可能dest・終端証拠として使わない。atomic commit・seal成功と正常terminal-only接続は別の明示指示待ちである。

## 6 コミット前の再検証

ユーザーのコミット指示後、AC-Aの8ファイルだけをstageし、未stage差分・未追跡ファイルがない状態で再検証した。ビルド、対象4ファイルのESLint、全体286 files／13,760 tests（失敗・保留0）が成功した。出力先は`/private/tmp/servicenow-aca-commit-vitest.json`。外部取得禁止・既存キャッシュのみの梱包動作試験（441 files）、AC-Aの34故障・4残留slot・4変異対照と旧保証を含む配布監査（441 files）も成功した。関連3文書のローカルリンク22件と差分の空白検査も問題なし。初回失敗と診断件数の修正記録は保持し、期限・閉鎖状態は変更していない。
