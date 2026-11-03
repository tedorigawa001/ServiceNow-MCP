# NB-03 一度限りtake・固定abort・失敗custodyの合成検証

Date: 2026-11-03 / 基準HEAD: `4e469d1`。実機E2Eではない。
対象: [接続設計§12](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_OB02_ADOPTION_DESIGN.md)、[private core](../tests/support/review/synthetic-recovery-kernel.ts)、[新試験](../tests/review/synthetic-normal-transfer.test.ts)、[梱包監査](../tests/review/package-http-classification.mjs)。

## 1 範囲と所有権

別fresh合成rootだけに非実行`abortBoundTransfer()`を追加。同採用ticketから同kernelの実acceptedをprivate takeし、完了内容と一つのpendingへ取り外す。最初のtransfer guard時点で元normal／adoption／accepted slotは利用不可。元plan／handoff／route・同pins／行／window／予算をpre-work-postで再照合し、固定abortで全payloadを破棄する。成功handleや移譲先sealは発行しない。

保護scope終了後の既知slot／kernel payload検査から、同token・失効serial・budget binding serial／identityのPayloadClearedReceiptを内部発行する。report確定／上位移譲／元metadata最終discardへ結び、本文を持たないcleanup capsuleだけを既存custody selectorで移す。元側は上位のsink・receipt・診断を変更できない。遅いcleanupがfakeでconfirmedでも、新worker exit・source cleanup・transport終端を補完せずUnknownを保持する。物理heap消去や実resourceの証明ではない。

作業開始時の2ファイルにはNB-02 stage修正と回帰テストがあった。作業中に別コミット`4e469d1`へ保存されたため、その通知順と試験を維持している。上位へ渡すcapsuleは正常root／本文の操作を持たず、同kernel・linkの固定cleanupだけを使う。

## 2 RED／初回失敗

1. 最初のtake／固定abort試験はfactory未実装でRED。実装後1件成功。上位移譲試験もconsumer未実装でREDを確認し、接続後新旧normal 3ファイル94件成功。
2. 退役localのstopが上位移譲後に失効serialを進め、matching receiptの最終discardを壊すREDを確認。もう一つはhealthy状態の失敗移譲拒否が本文を保持したままだった。holder切替後のlocal mutationを拒否し、healthy誤用ではhard／破棄とclaim消費を行うよう修正、4件成功。
3. final discardの余分引数を拒否しても正規receiptで再試行できるREDを検出。公開入口の一度限りclaimを引数検査前に占有して修正。23件成功。
4. healthy transfer内でterminal操作の再入を握り潰すと、terminal用poisonだけが立ち、外側のhealthy guardに伝わらないRED 3件を確認。healthy busyとterminal busyの拒否を分け、前者では固定hard／payload破棄するよう修正。別の1失敗は、試験がstopの意図的throwをexpectで受けていなかったfixture不備であり、期限を緩めず修正した。

## 3 受入条件

| 条件 | 観測 |
| --- | --- |
| 同時取り外し | transfer pre/postで元normal／採用／実accepted slotは空、pending take=1。固定abort後pendingなし・seal成功0 |
| 停止／再利用拒否 | 取消・期限・throw・unknown・余分引数・healthy/terminal両再入を拒否。元slot／claimを戻さない |
| 一つのcustody | seal／commit／discardのpre/post失敗・unknown返値・握り潰した再入でもlocal/upperの一方だけがcapsuleを保持 |
| 最終receipt | foreign／copy／summary・余分引数・二重消費を拒否。他root／上位capsuleは不変 |
| 上位の責務 | local借用操作／stopから上位のreceipt・sinkを変更できない。late cleanupは一度だけ、immutable reportを保持 |
| 途中変更 | source／cleanup失効後はtake拒否。全kernel checkpointの停止後にも破棄証拠と上位移譲が成立し、未公開allocationをabsenceへ昇格しない |
| 費目／時刻 | 同budget参照・元C/G/P／開始UTC／全deadlineを保持。後始末の期限観測は最初のhardを上書きしない |
| Unknown | 未結合予算はnull、4roleの証拠不足と新worker exit／transport不明を保持し、解放済みへ補完しない |
| 非出力 | 本文・行ID・raw例外・pins／plan／内部handleをreportへ移さない。opaque最終receiptからauthorityを再構成できない |

## 4 検証結果

最終再実行は全て成功。途中の全合成recovery 40ファイル3,314件ではfixtureの意図的stop throw 1件だけ失敗し、修正後に30件・全体3,315件が成功した。その後late cleanup再入の2試験を追加した。

- `bdo npx vitest run tests/review/synthetic-normal-transfer.test.ts`: **32件成功**。
- `bdo npx vitest run tests/review/synthetic*.test.ts`: **40ファイル3,317件成功**（全リポジトリ全件ではない）。
- `bdo npx tsc --noEmit --strict --noUnusedLocals --noUnusedParameters --skipLibCheck --target es2022 --module esnext --moduleResolution bundler tests/review/synthetic-normal-transfer.test.ts tests/review/synthetic-normal-adoption.test.ts tests/review/synthetic-normal-owned-supply.test.ts`: helperを含む厳密型検査に成功。
- `bdo npx eslint tests/support/review/synthetic-recovery-kernel.ts tests/review/synthetic-normal-transfer.test.ts tests/review/package-http-classification.mjs`: エラー・警告とも0。
- `bdo npm run build`: 成功。srcの製品ビルドであり、helper型保証は上記と分ける。
- offline `package-http-classification.mjs`: **441 files成功**。新factory／PendingBoundTransfer／PayloadClearedReceipt／scope marker非同梱と、固定import・runtime/I/O/clock/worker禁止のseeded負の対照・compiled fixture群を確認。
- offline `package-worker.mjs`: **441 files成功**。製品依存限定install・compiled worker／MCP smoke・fixture境界を確認。

正式発行口閉鎖・全体受付無効・VM／監視／telemetry保留を維持する。内容比較・移譲先seal成功・正常終端・実cleanup／予算lease・全work／heap上界は未保証。元の210試行・C/G/P・全60秒の上限や旧FB-03の会計modelは変更せず、実接続・実通信・設定変更・Pushは行わない。

## 5 レビュー修正（2026-11-03）

修正前の新規32件は記録として残す。本記録は全リポジトリの合成テストを実行していなかったため、レビュー時にrepo全体のlint（error 0・warning 374）、build、梱包分類監査、全体合成275ファイル／13,496件成功・失敗0を確認した。

レビューで30変異を確認し、次の判定は唯一の防御なのに未検証だった。実装は正しく、probeでも現行コードは拒否した。試験だけの不足である。

- terminal操作中の通常操作への再入。`live()`の`if(terminalBusy){terminalPoison=true;…}`が唯一の防御だった。`failure_seal_pre`のguardから`root.prepare()`を呼び例外を握り潰すと、判定を外した変異では再入が検出されずcommitが通り、custodyがupperへ移った。既存の再入試験はterminal操作への再入だけで、別判定が先に止めていた。transferFailureが拒否されlocalのまま残ることを検査する1件を追加した。
- cleanup capsule経路での未知のguard戻り値。FB-03と同じ型で、`terminalCheckpoint`の未知値判定がこの経路の唯一の防御だった（seal／commitはcustodyの`reject('shape')`が別に拒否）。`failure_cleanup_pre`で未知値を返すと、判定を外した変異ではcleanupが完了し`confirmed`と記録された。拒否されcleanupが`not_requested`のままであることを検査する1件を追加した。
- `abortBoundTransfer`の余分な引数が固定abortの`state`ではなく`binding`になることを検査する1件を追加した。

上記3変異はそれぞれ追加した試験だけを失敗させた。payload破棄の照合（`assertCleared`／`checkClearedReceipt`／`isCleared`／`payloadPending`。rootの`fail()`が常に`clear()`と`kernel.revoke`を行い構造上成立）、taken値の内部整合（marker／hard／終端結合）と二度目の`checkTaken`、一度限りtakeと重複abort判定・capsuleのholder判定とcapsule有無・abort前のbinding判定（他の判定が先に拒否）は等価変異として扱う。helperは変更せず、新規試験は35件。修正後も全体合成275ファイル／13,499件成功・失敗0。

## 6 コミット候補だけの再検証

対象8ファイルだけをindexへ登録し、`git checkout-index`でHEAD＋その変更の一時コピーを生成した。既存node_modulesを参照し、distはコピー内で新規ビルドした。製品ビルド、合成recovery **40ファイル3,317件**、NB-01〜03とhelperのstrict／noUnused型検査、変更箇所ESLint、offline梱包監査・製品依存限定スモーク（ともに**441 files**）がすべて成功。元作業ツリーの未登録変更には依存せず、期限緩和・実通信・設定変更・Pushは行っていない。
