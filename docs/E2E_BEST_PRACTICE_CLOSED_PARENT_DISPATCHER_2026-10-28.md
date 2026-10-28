# AU-BR-006 CD-01：固定親GET・同attempt dispatchの合成検証

Date: 2026-10-28 / Scope: 同期fake dispatcher／fake clock／fake I/O限定。正式発行口閉鎖。

設計：[閉鎖dispatcher詳細設計 §10](BEST_PRACTICE_ABORT_SCOPE_CLOSED_DISPATCH_SIGNAL_DESIGN.md#10-cd-01固定親get同期fake-dispatcherの最初の接続)。
実装：[同module内のprivate coreとfactory](../src/review/abort-scope-evidence-closed-attempt-supervisor.ts)。
試験：[21件の合成検証](../tests/review/closed-parent-dispatcher.test.ts)。

## 1. 実装範囲

`createFakeClosedParentDispatcher`は同core／ReadStateを一度生成し、private WeakMap内のopaque request handleを同parent_initial／parent_finalへ結ぶ。架空接続先`closed-dispatch.invalid`への固定GET（本番`fetchParent`／TC-04と同じ単一record取得`sys_update_set/<sys_id>`、fields `sys_id,state,application,sys_updated_on,sys_mod_count`）をconstructorで生成する。callerのURL／origin／用途／auth上書きを受け付けず、凍結descriptorは説明用であって権限ではない。

同constructorのfixture auth contextを不変参照として初回・retry・最終へ渡す。実tokenやcredentialは持たず、実認証snapshot／ready世代の証明には昇格しない。別factory・コピー・descriptor・auth contextをrequestとして渡しても拒否し、外国ownerは変更しない。

同ReadStateのdispatch／window成立後だけ同期fake dispatcherを一度呼び、Cは同coreだけが加算する。同期throw・返却不適合でも返金しない。soft cutoff・取消・Qのfinal予約不足はC=0／dispatcher未呼出しで止める。

同signalをdispatcherへ渡し、同attemptのabortと結合する。返却不適合では一次診断を確定してからsignalを失効させる。cleanup確認済みtimeoutだけ同logical requestのretryを認め、同context／URL／予算・別signal／ordinalで2回まで。完了handle・3回目・未確認cleanup後の再利用は拒否する。

## 2. RED→GREENと切り分け

- 最初のtracerはfactory未実装で失敗。固定親GET・dispatch前後のC・固定summaryを接続して成功した。
- 誤ってasync dispatcherを返す試験では、7件のassertionが通っても未処理rejectが1件発生して実行は失敗した。同期口でPromiseを拒否した後にsettlementを観測していないことが原因。native Promiseの両settlementを即観測し、採用せず固定invalid_inputで止めるよう修正した。不正I/O内の既知closed Promiseも拒否時に観測する。
- Proxy I/Oの回帰は、任意get trapが呼ばれてinternal_review_errorになるため失敗。Proxyを先に拒否し、own data propertyだけをpinすることでget trap／accessorの実行を防いだ。
- 返却拒否時のsignal試験で、一次診断は正しいがsignalが未失効であることを確認。失敗結果の確定後に同controllerをabortし、listenerからcancelへ再入しても先行invalid_inputを保持するよう修正した。
- 静的buildで、Object descriptor検査後の関数・Promise型がunknownになる不整合を検出。実行時検査境界で型を明示し、read payloadの妥当性は既存pumpの検査で維持した。

## 3. 独立観測

試験側ledgerがdescriptor・signal／context参照・呼出し順・呼出し時点のCを観測する。期待URLは試験側で別途構築し、製品builderを期待値計算へ流用しない。

| 観点 | 検証 |
|---|---|
| 固定GET | method・架空origin・単一record path・fields等、一覧照会用query／limit／offset／no_countが無いこと、初回と最終の対象一致 |
| identity | foreign／copy／auth handle／表示descriptorをC=0で拒否、外国run不変 |
| 順序・claim | final早期呼出し、完了request再利用、3回目を拒否 |
| 会計 | dispatch時C=1、同期throwでも1、soft cutoff／取消／Q=4は0、retryで台帳をresetしない |
| 中断 | 同signalのabort、reentrant cancel、未確認cleanup後の停止、一次診断保持 |
| 固定依存 | immutable request／auth、Proxy／accessor未呼出し、非同期Promise／Response／thenableを不採用 |
| 非露出・閉鎖 | 例外・token sentinel・URL・対象sys_idがsummary／statusへ出ず、global fetchを呼ばない |

## 4. 検証結果

| 確認 | 結果 |
|---|---|
| CD-01追加試験 | 21 tests成功 |
| dispatcher＋stream＋supervisor＋body＋ReadState＋gate | 6 files／230 tests成功 |
| `npm run build` | 成功 |
| 変更実装・追加試験のESLint | 成功 |
| 全体 `vitest run --maxWorkers=3` | 174 files／5,242 tests成功、最終再実行39.92秒 |
| offline package-worker smoke | production-only install・解析・集約成功、377 files |
| 関連MDの相対参照先 | 4 files／66 linksの存在確認成功（見出しanchorの自動検証ではない） |
| `git diff --check` | 成功 |

新factoryは既存のpackage除外prefix内で、production登録口を追加しない。全体試験の既存ローカル合成待受は許可して実行したが、PDI／外部サービスには通信していない。製品・テストの期限は緩めていない。

## 5. 限界と残課題

同期fake I/Oのdispatch結合までであり、注入Response待機・HTTP status／URL確認・late Responseのcleanupは未接続。拒否したResponse本文は読まず、Response所有権や終了確認を主張しない。cleanup.not_startedをdispatcher未呼出しと解釈しない。

native streamsを扱う既存factoryへ新しい正式採用口を追加していない。次段階は同resourceのdispatch pending・signal・Response待機を同deadline／cleanupへ接続する工程。その後、同Responseのprivate採用から既存reader監督へ一体接続する。Table APIの実形状・auth snapshot／ReleasePermit／選択payload／worker job・公開結果への正式binding、全体work／heap／本番capは引き続き未証明／未承認。

正式発行口閉鎖・Unknown・全体受付無効、VM／監視／telemetry保留を維持。実transport・実機操作・実token発行・設定変更・Pushは行わない。

## レビュー修正：親GETを単一record取得へ統一（2026-10-28）

初版は旧fixture builderの一覧照会形（`sys_id=…^ORDERBYsys_id`、fields 3列、limit=2）でURLを生成しており、設計§4（本番`fetchParent`／TC-04の単一record取得）と食い違っていた。一覧照会の実応答は`result`配列で、fakeの単一object応答・body laneのparent射影と形が合わず、本番が必須とする`state`／`application`も要求していなかった。URLを`/api/now/table/sys_update_set/<sys_id>?sysparm_fields=sys_id,state,application,sys_updated_on,sys_mod_count&sysparm_display_value=false&sysparm_exclude_reference_link=true`へ改め、試験の独立期待値と一覧照会用parameterが無いことの検査を更新した。修正前の実装では固定GET試験が失敗する。
