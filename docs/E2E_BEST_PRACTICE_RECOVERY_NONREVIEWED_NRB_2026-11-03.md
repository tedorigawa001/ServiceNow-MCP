# NR-B fresh合成issuer・producer別claim 検証記録

Date: 2026-11-03 / 基準HEAD: `912144c`。

## 1 実装範囲

[非reviewed設計draft-0.3](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_NONREVIEWED_DESIGN.md)§10の単独fresh合成issuerを、配布対象外の`tests/support/review/synthetic-recovery-nonreviewed-issuer.ts`へ追加した。既存runtimeのソース、NR-Aの契約、CG-BP1の受付は変更していない。

- constructor内だけで同owner／windowのrow handleを生成し、producerを固定する。metadata／retrieval／analysis以外のissuer、既存rootや外部receiptを登録する口は持たない。
- metadataは固定分類からだけ発行し、input／job／T_iを作らない。retrievalは同rowのinput／attempt／cleanup sinkを生成し、同attemptの固定終端イベントとconfirmed cleanup、terminalの一度消費を必要とする。
- analysisは同rowに新input／job／連番idを結び、strict envelopeを相関する。元T_iはconstructorの同rowへpinして再採取しないが、rejected／元omittedの値は時刻を持たないため照合には使わない。同json文字列をCG-Aで検証し、NR-Aで扱うrejected／元omittedだけを発行する。
- producer別開始・終端／受信・発行claimをpre guard前に占有する。局所失敗でもpost guardへ進み、共通停止と先行hardを優先する。commit前のhandleや本文を公開しない。
- 発行handleは別brandの空object。hard／discardでpendingとprivate値を取り外し、発行済みhandleの固定discardでもclaimを戻さない。late retrieval cleanupは1回だけ固定診断を更新でき、terminal／証拠を復活させない。

retrievalのcleanup confirmedは同attemptの**合成イベント**であり、native cleanupの実証拠ではない。summaryはauthority:noneで、runtime_origin／native_cleanup／manifest／whole_run_budgetを未保証とする。NR-Cの固定順partition・同accepted／plan移譲、retained／親省略issuer、reviewedゼロ件、finish jobは未接続。

## 2 RED／GREENと型検査

未存在moduleのimport失敗をREDで確認し、metadata分類から空handleを発行する最小経路をGREENにした。次に未存在のretrieval入口、analysis入口をそれぞれRED→GREENで追加した。固定state集計とretrieval reason写像の独立oracleも、未存在diagnosticへの失敗を確認してから実装した。raw evidence getterは追加していない。

拡張試験は初回73件すべて成功したが、strict型検査が負の試験2件を拒否した。空objectとcleanup handleをterminal引数へ直接渡していたためで、これらを不正な外部入力のruntime対照として明示的にcastした。製品側のnominal型は緩めず、attemptをjobへ代入できないcompile-fail対照も維持した。

## 3 最終検証

| 検証 | 結果 |
| --- | --- |
| NR-B新規 | 77件成功 |
| NR-B／NR-A／CG-BP1／CG-B／RD-B04／CG-A／RD-B03関連 | 7ファイル・590件成功 |
| 全体回帰1回目 | 263ファイル・12,794件成功（reason写像oracle追加前） |
| 最終全体回帰 | 263ファイル・12,795件成功、失敗0・pending 0 |
| build | 成功 |
| 新試験／helperのstrict TypeScript検査 | 成功 |
| 変更TS・梱包試験のESLint | 問題なし |
| 梱包 | 441ファイル。issuer・scope／brand・constructorが非同梱。固定import監査とseeded runtime／I/O／clock／worker／漏出の負の対照成功 |

固定metadataのDELETE／未知action／不正target名／Dictionary・Choice／Script Include／適用ruleなしをstateとreason集計で検査し、retrievalの4 error写像は独立した表に照合した。全7操作のpre/post取消、producer混入、別rootと同root別row／job、input／attempt／id／terminal／deliveryの混入、コピー、二重開始・終端・発行・discardを確認した。

0.3 deleted拒否とpost-guard停止優先、未確認cleanupからの停止、cleanupだけではterminalを作れないこと、hard／normal discard後のlate cleanup診断だけの更新、最初のhard保持、caller後書換え・getter／Proxy trap実行0、100 row上限と秘密非出力も検査した。analysisの不正JSON・重複member・多byte上限・ID不一致・不適切stateも発行を拒否した。

全体回帰では既存localhost合成待受試験だけを許可し、外部サービスは使っていない。新issuer自体はnative worker／transport／時計／timerを呼ばない。

## 4 レビュー修正（2026-11-03）

§3の77件・12,795件は修正前の記録として残す。レビュー時にrepo全体のlint（error 0・warning 374）、build、梱包、全体合成263ファイル／12,795件成功・失敗0を再確認した。§1のanalysis記述は、T_iを照合に使うように読めたため、pinするだけで照合しないと訂正した。

レビューでissuerの26変異を確認し、次の判定は外しても既存77件がすべて通過した。実装は正しく、probeでも現行コードは拒否した。試験だけの不足である。

- 同root別rowのretrieval terminal。`pending.slot!==slot`を外すと、row 1のinput／attemptにrow 2のterminalを渡した発行が通り、row 2の`payload_unavailable`がrow 1の証拠として発行された。2 rowとも終端済みの状態で入替えを拒否する1件を追加した。
- guard中の`discard`／`recordCleanup`再入。busy判定を外すと、discard後もmetadata証拠が発行され（state discarded・pending_evidence 1）、guard中にcleanup診断が書き換わった。各々`reentrant`で停止し何も公開しない2件を追加した。
- 発行成功後のterminal取外し（pending_terminals:0を既存正常系へ追加）、終端イベント前に記録されたcleanupでの終端拒否、requested rule重複・依存の余分key・Proxy guard関数（呼出し0回）、未知のguard停止文字列と未知のrevoke理由の固定写像を各々追加した。
- metadata分類は[adapter](../src/review/update-set-adapter.ts)の`classify`の複製で、ソース変更時のずれを検出できなかった。両方をTypeScript transpile後にAcorn ASTへ変換し、局所名・単文block・末尾`return undefined`だけを正規化して構造一致を検査する1件を追加した。対象JSは実行しない。DELETE判定・table比較・name参照を変えた複製では失敗することを確認した。

上記11変異はそれぞれ追加・拡張した試験だけを失敗させた。発行時のcleanup confirmed再確認（confirmed時だけterminalが作られ以後変化しない）、analysisのstate制限（NR-Aがrejected／元omitted以外を拒否）、analysisの同root別row delivery（本文IDの照合が必ず拒否）は等価変異として扱う。helperは変更せず、新規試験は84件。修正後も全体合成263ファイル／12,802件成功・失敗0。

[SRD設計](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_FINISH_SRD_DESIGN.md)のStatusは改版のたびに内容gateの古いdraft表記が残っていたため、版数を書かず各設計のStatusを参照する形にした（表記のみで版数は変更しない）。

## 5 費用と残課題

constructorのbounded copy（深さ4／key8／array100／node2000／文字費262144）、private row／claim索引、操作ごとの2 guard、分類・固定写像、CG-A同json decode／schema copy、NR-A projection、handle／terminal／diagnostic集計とclearは追加費目である。台帳は各100以下、input／jobは各rowで最大1だが、実heap／総CPU／work上界ではない。pending jsonだけでも最大100×262144の論理byte和を持ち得る。

既存C/G/P prefixを更新せず、本番の受信枠・210試行・全60秒を変更していない。合成input／job counterを実request会計やworker起動数の証拠にしない。旧rootのclaim台帳と混在させず、元receiptへの結合はNR-Cの別工程で必要になる。

正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持した。実接続・実通信・実機操作・設定変更・本番cap／Permit／候補発行・Push・本作業のコミットは行っていない。
