# WF-B SB-B：同headerの保存・private消費・固定ackの合成検証

Date: 2026-11-05 / 基準HEAD: `186cea6` / 未コミット変更を検証。

## 1 範囲・構成

[接続差分設計](BEST_PRACTICE_WFB_STORE_RECORDER_BRIDGE_DESIGN.md)のSB-Bをメモリ依存だけで実装した。正式発行口閉鎖・全体受付無効・Unknown・調査保留、未承認の保存先・運用cap／時間枠等は維持。再採取・既存証拠copy／保管操作・実接続・実通信・設定変更・Pushは未実施。

公開friendや任意callbackへack権限を渡さないため、旧3試験moduleのclass本体を`tests/review/fixtures/store-recorder-kernel.ts`へ機械的に集約し、旧pathは同じclass／型の再exportにした。自然数helperは同じ判定へ統合し、Storeのbyte-size／copy・late cleanup、SB-Aのroot claim／停止後clock読取というレビュー修正を維持した。製品src・設定・依存は変更していない。

新規`tests/review/store-recorder-persistence.test.ts`のdriverはMap／数値配列だけ。read／write／flush／closeはメモリ故障注入であり、OSのdurabilityやFD解放を証明しない。親の試行別結果／slot区分別期限表の要求は未完了として残す。

## 2 対照と独立oracle

- 固定文字列`{"version":"wfb-checkpoint-1","sequence":1,"trigger":"conditions_ready","at":0}\n`をliteral byte oracleにし、実装のencoder／mapperから生成しない。80 byte・SHA-256 `aacdba98587d693127aa25cd4a590ae1acb5d1c40450c4780c84695deaec83d1`を固定期待値にした。
- 6 triggerの保存名／順序、anomalyとslow_hintの発生順違い、1byte→EINTR→2byteの手書き操作列を確認。最大16桁の時刻でheader 95 byteが通り94 byte capではStore操作前に拒否する。
- copy／foreign／primitive準備claim、二重persist、DATAからの再利用はsave前に拒否。旧public acknowledge／consumeをthrowへ置換しても成功することを確認し、private継続だけを使う。commit直前にArray.prototype.shiftを差し替えても先行captureしたqueue関数を使う。
- create／flush／close／再読／identity故障、同長digest不一致、header／累積byte不足で、先頭の元参照・未受理件数・既存ack成功分を保持する。
- save後とprivate消費後のD_save到達・致命的再入で、saved_unacknowledgedと元queueを保持する。失敗対照では狙ったslot状態へ到達したことをassertする。保存済みbytesが存在してもackしない。
- 観測中のwrite／再読で取消しても現在の保存とstop_requestedをFIFOでack。Reservedの取消はStoreを取消さないがrecorder Closedなのでack=0。致命的callback後も共有clockでcloseを一度行い、期限後に返るcloseはlateとする。
- 固定ackの後にclockやIOを呼ばない対照、conditions_ready ack後だけstart成功する対照を追加。test終端後のStore失敗でfailed／measurement completeを変えず、全ack成功でもpreservation unverified／termination unconfirmedを保つ。

## 3 実行結果

全コマンドは`bdo`経由。期限・並列設定は変更していない。

| 検査 | 結果 |
|---|---|
| 3 moduleの機械的集約直後、旧recorder／Store／SB-A | 3ファイル／277件成功 |
| SB-B初回＋旧3ファイル | 4ファイル／302件成功 |
| oracle／境界／commit対照追加後の対象4ファイル | **310件成功**（SB-B新規33件＋旧277件）、138ms |
| strict単独TypeScript検査（kernelと対象4試験） | 成功 |
| 変更したfixture／新規試験のESLint | 成功 |
| `npm run build` | 成功 |

最終の型・lint・`git diff --check`は成功。文書リンク13件、kernelの依存が計算用cryptoだけでtestsが製品build／package許可対象外である構成も確認した。構成確認は実梱包の代替ではない。全体回帰・梱包dry-run・compiled配布物試験は今回未実施。旧277件の成功と、実観測器を使う全体回帰は区別する。

## 4 レビュー修正（2026-11-05）

`672eda4`のレビュー指摘を修正した。§3の件数は修正前の記録で、そのまま残す。

| 指摘 | 修正 |
|---|---|
| 通常の`endTest`の後の`poll`・`testAnomaly`・二重`endTest`で致命的停止となり、Storeを取消して`test_terminal`を保存できなくなった | 呼出し前が`Draining`／`Verifying`なら`state`理由で停止せず`false`を返す。`Observing`の誤用は致命的停止のまま |
| 消費の失敗経路と照合が未検証だった | 消費中のidentity喪失・`D_save`、slot／size／digest不一致、queue先頭の移動の対照を追加した |
| 消費中の`D_save`の分類が未定義だった | 設計§4へ明記し、bridgeのguardとの差を試験で固定した |
| `cleanupMs`を3回、`limits`を2回読んでいた | 一度だけ読む |
| 設計の`unsaved`の定義が実装とずれ、§7の見出しが「未実施」のままだった | 定義を`unacknowledged`へ合わせ、§7へ状況表を追加した |

前者の誤分類は、`186cea6`で採用したレビュー指摘の分類が`Draining`を考慮していなかったことによる。

照合の対照は公開Store `save`のprototypeを差し替え、本物のreceiptと異なるslot・bytesを作る。queue先頭の移動と`Verifying`の対照は、準備のために生のrecorderを使う。いずれもbound経路の成功実証ではない。

`persist`とprivate継続を対象に、変異61個のうち41個を検出した。残る20個は次の理由で等価または到達不能と判断した。

| 変異 | 理由 |
|---|---|
| `claim-not-spent`、`ack-keeps-checkpoint`、`ack-keeps-binding` | slotの状態とphaseの検査が先に拒否するので、別名が残っても受理されない |
| `guard1`、`guard-before-save`、`guard-after-consume` | 間にcallbackがなく、次のguardが同じ結果を返す |
| `cap-160` | 最大95 byteで、到達しない構造上限 |
| `final-evidence-check`、`final-epoch-check` | 直前のguardの後にcallbackがなく、自己比較になる |
| `commit-any-conditions` | `conditions_ready`はsequence 1で、`start`前のackはこれだけである |
| `ack-evidence-kept-in-success`、`finally-evidence-kept` | 成功時とfinallyの解除が重複している |
| `ready-closed`、`ready-published` | recorderのClosedはbridgeの閉鎖へ写され、Publishedはqueueが空でないと到達しない |
| `consume-busy`、`consume-reason`、`consume-receipt`、`consume-no-spend`、`consume-run` | saveごとにreceiptは1つで、再入経路も別のrun originを渡す経路もない |
| `consume-size` | sizeが違えばdigestも違うので、digestの照合が同じ結果を返す |

全スイート（`--maxWorkers=3`）は292ファイル・**14,115件すべて成功**（SB-B試験は48件）。`npm run lint`はエラー0、`npm run build`は成功、`package-http-classification`はPASS（441ファイル）、`git diff --check`も成功。strict単独TypeScript検査も成功。梱包dry-runは未実施。

## 5 残課題

1. SB-CのStore試行別結果（create試行の有無を含む完全分類）とmanifest区分を含む期限表。現状はcheckpoint専用のStore／単一D_saveを内部で使用し、manifest入口を公開しない。未試行slotへ前回のcleanupを写さないが、一般的なsticky拒否全件の試行結果APIは未実装。
2. D_saveで保存経路を閉じた後のrecorder最終終端、通知throw・部分生成／上位cleanup診断の詳細費目と連続対照。今回のclose lateや観測停止の基本接続だけを、SB-C全体の完了と呼ばない。
3. 本文／WF-A集約・UTF-8容量とscratch、manifest／session票と全体保全、ProcessOwner／OS backend・承認gateは未対応。headerは実観測本文や承認証拠の代替ではない。

保存receiptやprivate消費の成功はartifact単位のfake結果で、実保管・採取・process操作の開始許可ではない。未知・未承認事項を補完していない。
