# EF-02：constructor保護区間・部分rollback・失敗copyの検証

Date: 2026-10-31 / Scope: 合成依存・注入失敗・ローカルcompiled fixtureのみ。

## 1 変更範囲

[詳細設計§13](BEST_PRACTICE_ABORT_SCOPE_EARLY_DIAGNOSTIC_FRIEND_SEPARATION_DESIGN.md)に基づき、[実session](../src/servicenow/bounded-read.ts)の最初のfieldを純粋shellとした。clock／日時／controller生成をconstructor内の保護区間へ移し、core・admission・登録owner・timer・listenerを固定slotで記録する。停止中に戻ったhandleも回収し、owner／coreを先に失効させてから残resourceを解放する。

固定factoryは新sessionの生成成功または固定失敗copyだけを返す。constructor throw時のcopyは同例外に結合した私有WeakMapから一度回収し削除する。ND-03固定入口もfactoryを使い、生成前の失敗をconstructor_diagnosticとして保持する。外部errorから診断を昇格する口、既存sessionを採用する口、caller指定のshell／seedはない。通常0.2／0.3のJSON契約は変更していない。

直接newの事前abort動作と設定→認証→busyのエラー優先順位を維持した。既存update-set adapterがworker依存も含むoptionsをsessionへ渡していたため、[sessionへ渡す3項目だけを明示](../src/review/update-set-adapter.ts)した。[既存source wrapper](../src/review/bounded-source.ts)も同様に3項目だけを渡し、transport optionsに混ぜたrelease assertionを従来どおり無視する。worker設定や合成callbackがconstructorのunknown fieldにならないようにする境界修正であり、期限やworker動作は変えていない。

## 2 合成試験

[専用テスト](../tests/review/construction-transaction.test.ts)は24件。

- 最初のmonotonic clock／日時serialize／controller1・2／core／登録owner／timer／listenerでのthrow。
- owner登録中の同期stop、timer登録中の同期deadline、listener登録中の同期abort。未初期化fieldを読まず後工程へ進まない。
- 部分listener登録のremove、clearTimeoutのthrow、未知timer handleのunconfirmed。first reasonを保持し、他slotの回収を継続する。
- admission未取得時の返却0・取得後の返却1・他runのbusy key不変・double close不変・次のrunを開始可能。
- factory出力projection失敗後のsession回収、shell確保失敗時のnull診断、未知clock値の内部理由保持。
- data-only入力、getter／proxy不実行、caller seed拒否、失敗copyの再帰freezeと秘密非出力。

既存workerライフサイクル・native composition・session ownerの試験も対象とする。特に「事前abortの直接newは停止済みinstanceを返す」という既存期待は書き換えず実装を合わせた。

[ND-03回帰](../tests/review/native-session-composition.test.ts)へ、constructorのclock失敗でnative ownerがまだない場合にもsealed copy・上位内部／公開code・C/G/P=0が残り、次runが開始できる1件を追加した。同ファイル30件が成功した。

## 3 実行記録と修正中の失敗

初回REDはfactory未実装。実装途中のbuildでdefinite assignment、unknown入力型、optional解除関数の型を修正した。既存事前abort試験でconstructor throwへの退行を検出し、commit後に停止しfactoryだけが失敗copyへ写像する形に訂正した。

全体回帰の初回は失敗した。多くがworker到達前のinvalid_inputで、adapterからworkerFactory等のsession用でないoptionsが渡っていることを切り分けた。上記3項目のprojectionで修正し、専用22件＋worker lifecycle8件の30件が成功。その後に日時失敗・timer同期停止の2件を追加し、専用24件が成功した。期限・待機時間・既存期待値を緩和していない。

再実行ではoperator-release-fallbackの1件が失敗した。既存source wrapperのextra transport optionを無視する互換動作を同じprojectionで維持した。adapterのoptions省略時についてbuildが検出した型エラーもoptional参照に修正した。既存テストを新しい拒否に合わせて書き換える対応はしていない。

最終確認：`bdo npm run build`成功、専用24件成功、operator-release-fallbackと合わせ59件成功、ND-03の追加回帰込み30件成功。変更TypeScriptのESLint、相対MDリンク、git diff --check成功。全体回帰は215ファイル・9,602件成功後、追加したND-03の1件を含めて再実行し、**215ファイル・9,603件成功、失敗／保留0（exit 0）**を確認した（`bdo npm test -- --reporter=json --outputFile=/tmp/ef02-final-all-test.json`）。

offline梱包確認は409ファイルで成功し、EF-02 compiled fixtureを含む全固定fixtureが成功。開発module／fixture非同梱と、配布runtimeがEF-01開発moduleをimportしないことを確認した。既存friend本体の非同梱は未達のままであり、この検査では達成と判定しない。再installを伴うpackage-worker検査は今回実行していない。

[compiled fixture](../tests/review/fixtures/compiled-construction-transaction.mjs)はclock失敗copy・新session生成／close・二重close・次run・借用元credential不変を配布対象JSで検査する。fetchを呼ばず、archive取得・依存再installをしない。既存の[offline梱包検査](../tests/review/package-http-classification.mjs)へ追加した。

## 4 残課題・維持する停止状態

- EF-03のfriend／synthetic_io本体撤去、開発／本番assembly分離は未実施。本検証をfriend撤去済み・正式binding完了と解釈しない。
- ND-03以外の直接new上位callerへの詳細copy配送は未接続。公開codeの互換性だけを維持し、全callerが新診断を受け取るとは主張しない。
- snapshotは自前copyの参照を切る。JS文字列の物理消去・強制GC、全phase世代の履歴、native reader解放はこのshellの保証外。
- 未知handle・解除throwはunconfirmedのまま。catastrophicな確保失敗時に詳細copyが必ず得られる保証はない。
- 正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留。friend撤去・fallback有効化・実接続・実通信・実機操作・設定変更・Pushは行わない。
