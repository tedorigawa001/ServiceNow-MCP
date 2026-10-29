# NA-02：注入Response／Streamsのnative取得・操作固定検証

Date: 2026-10-29 / Scope: 合成依存・メモリ内native APIのみ。

## 1. 対象と禁止境界

[詳細設計draft-0.3 §14](BEST_PRACTICE_ABORT_SCOPE_NATIVE_ADAPTER_DESIGN.md#14-na-02注入native取得操作固定)に従い、[内部adapter](../src/servicenow/review-native-adapter.ts)を追加した。fake dispatcherとclock／schedulerへ注入したResponse／ReadableStreamだけを取得する。native操作とはメモリ内APIの呼出しであり、実通信・PDI・実sessionの操作ではない。

fixture／NA-01の台帳をimportせず、実object専用のprivate Response／stream claimを分離した。MCP登録・正式receipt／証拠発行・ReleasePermit／選択payload／worker jobの実bindingを追加していない。Unknown・正式発行口閉鎖・全体受付無効・VM／監視／telemetry調査保留は維持する。

## 2. 合成試験の観測範囲

[native-reader-adapter.test.ts](../tests/review/native-reader-adapter.test.ts)：31件。

| 境界 | 確認した結果 |
|---|---|
| 正常EOF | 同readerでchunk／EOFを読み、closedを一回capture、release一回。body_eligible=false／issuance=disabled |
| pending readの取消 | 同readerを一回cancel／releaseし、cancelled primaryとconfirmed cleanupを別々に保持 |
| 取得途中の失敗 | getReader失敗は所有権不明、closed capture失敗は既知readerのcancel／releaseを実施。二度目の取得は禁止 |
| 操作固定 | Response／stream自身の同名getterと、capture後のprototype差替えを呼ばない |
| identity／subset | response／streamの別owner再利用、foreign handle、Proxy／偽object／subclass／既lockを拒否。foreign lockは解放しない |
| one-shot | 並行read、二重acquire、二重finishで停止し、既知resourceの解放は一度だけ |
| source失敗 | 同期throw／Promise rejectのno_response、pending sourceのfetch_pending、no_bodyとEOFを区別 |
| 元期限 | read期限・cleanup期限の等号を拒否。新しい期限に置き換えない |
| cleanup未確認 | cancel pending／reject、closed／read不足、release失敗を保持。releaseがpromiseを決着させても修復しない |
| 遅延Response | 未claim streamのbest-effort cancelだけを行い、新readerも成功結果も発行しない |
| 入力停止 | 不正な用途window／余剰key／ordinalをdispatch前に拒否。停止後の正常入力でも復活しない |
| 秘密非出力 | faultのraw例外は固定理由へ置換し、statusへ本文・Response・readerを出さない |

fault injectionはisolated module評価前の標準prototype差替えで取得／closed／release失敗を再現する。runtimeへ差替えportを追加していない。constructorの依存とmodule評価時の標準intrinsicは信頼前提である。

## 3. RED／GREENと診断保持

- 解放期限ちょうどの追加試験は、expected=attempt_deadline_exceededに対してinternal_review_errorとなりRED。release後の元floor検査のFailureをfirst primaryへ伝播し、cleanup_deadline診断と分離して保持することでGREENとなった。
- 二重acquireで既知readerが残る試験を追加し、同じcleanup promiseへ合流するよう修正した。
- 取得失敗の分類を追加した際、停止後の再要求がreader_owner_unknownをnot_startedで上書きする退行を検出した。停止済みownerを入口で拒否し、新しい取得分類に入らないよう修正した。
- pending read／cancelのlate settlement後も、release前のimmutable観測と既記録のunconfirmedを変更しない。
- foreign finishの追加試験で自ownerのlockが残るREDを確認し、失敗catchを同じ固定cleanupへ合流した。foreign readerには触れず、自ownerの解放だけを一度実行するGREENを確認した。

## 4. 実行記録

実行環境：Node v24.18.0。最低対応Node 22.12.0の実行互換性は未確認。

| 確認 | 結果 |
|---|---|
| 新規NA-02＋既存NA-01／RT-B02／RT-B03 | 4 files／142 tests PASS（NA-02は31件） |
| build | PASS |
| 変更したTS／テスト／梱包scriptのESLint | PASS |
| offline npm dry-run＋compiled注入native smoke | PASS、393 files。adapterの4artifact同梱、fixture／tests非同梱 |
| 全体合成試験（maxWorkers=3、既定の期限維持） | 186 files／5,671 tests PASS、27.76秒 |

初回の全体試験は制限環境内で既存loopbackにEPERMを確認し、OAuth G0等の待受前提試験がtimeoutしたためSIGINTで中断（exit 130）。完走した試験結果とは数えない。製品／テスト期限を変更せず、ローカル待受を許可した環境で再実行した。外部ServiceNow通信・実トークン発行は対象外である。

梱包確認：[package-native-adapter.mjs](../tests/review/package-native-adapter.mjs)、[compiled fixture](../tests/review/fixtures/compiled-native-reader-adapter.mjs)。compiled smokeはfetchをthrowへ置換し、既知bytesを二回read（chunk＋EOF）して同reader解放を確認する。npmはoffline／ignore-scriptsのdry-runであり、公開は行わない。

コミット前の独立再確認：HEAD＋今回の9ファイルだけをindexから一時作業領域へ展開し、既存のnode_modulesのみを依存として参照した。他の作業中ファイルは含めず、build・変更対象ESLint・全体186 files／5,671 tests（37.45秒）・NA-01／NA-02のoffline梱包／compiled確認がすべてPASS。梱包は双方393 filesで、実通信・実session接続は行っていない。

## 5. 残課題

NA-03としてRT-B03の同bytes課金・copy／parse／hash・candidate／ackにnative終端を結合する必要がある。このmodule単独の終端を正式body receiptへ昇格させない。C/G/Pの実更新、source認証／URL binding、実session、選択payload、worker jobは未接続である。全Fetch仕様本文の再照合と最低Node／cross-realmの互換性も未確認とする。

本記録は合成試験の事実であり、実PDI E2E・人の承認・正式な証拠発行の成功を主張しない。
