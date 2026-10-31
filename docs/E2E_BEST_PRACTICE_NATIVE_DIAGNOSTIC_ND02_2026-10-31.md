# ND-02：注入native issuer・typed終端・唯一consumer・上位診断の合成接続

Date: 2026-10-31。対象：[詳細設計§12](BEST_PRACTICE_ABORT_SCOPE_NATIVE_STATUS_DIAGNOSTIC_DESIGN.md)。注入Response／Web Streamsとfake budget／schedulerだけで確認した。実通信・実PDI操作ではない。

## 1 接続範囲と証拠の意味

- [開発専用module](../src/review/abort-scope-evidence-native-diagnostic.ts)の新規creatorが、ND-01の上位ownerを観測前に生成・bindingする。同生成元にprivate anchor・元window・Response／header・reader identity・typed cleanup recordとopaque terminalの台帳を閉じる。
- native body getterで得た同streamのreaderだけを取得し、closed捕捉・cancel・releaseLockを各一度、readは0とする。native no_bodyは全操作0、factsはnot_applicableで、EOFへ変換しない。cancel／closedの結果はreleaseLock前に確定し、release後の状態変化から成功を推定しない。
- 唯一のconsumerは同recordから発行されたterminalだけを、claim消費・live除去・同一性照合・pre／post guardの順で一度消費する。公開diagnosticやST-03Cのconsumptionを証拠へ昇格しない。HTTP・cleanup・受理履歴・first primary／refusalを上位ownerへ保持し、固定解放後にsealする。
- 発行／消費は注入laneのprivate非実行契約であり、実sourceのprivate採用・ReleasePermit・C方式判定・fallbackを呼ばない。release／ordinal1だけを対象とし、認証／親のslotは未観測のまま。既存ordinal2診断やretry仕様は変えない。
- 再executeはrequest_rejected=invalid_stateとなる。進行中の再入は同期失効させ、seal後は既存診断を変更しない。foreign／copy tokenで自分のclaimを復元せず、外国台帳も変更しない。返却物は再帰的freezeした診断copyだけ、全7permissionはfalse。

## 2 テスト先行・初回失敗・修正

1. 最初の連続テストはfactory未実装でRED。実装後に成功したが、初回buildは関数内の型ブランド宣言（TS1184）で停止した。module scopeへ移し、build成功を確認した。
2. 同reader正常系、403／404・bodyあり／なし、hard401、cancel拒否、pending timeout、issue／pre／postの取消・期限・再入を追加した。再executeが元の成功結果だけを返す点を4件のREDで検出し、要求拒否とseal済み診断を分離してGREENとなった。
3. native getter／closed捕捉／release失敗、時計の例外・逆行、入力strict検査、非対象purpose、readonly copy／秘密非出力を追加した。schedulerの同期throwで、待機Promiseがraceへ登録される前に拒否され、未処理拒否が1件残ることを検出した。境界Promiseを固定の失敗理由へ解決し、原例外を出さず停止するよう修正した。
4. private provenanceの負の対照では、copy／foreign terminal・copy cleanup・foreign anchorを固定case名fixtureから検証した。任意fault／terminal／consumerを注入factoryへ渡すことは拒否する。fixtureが返すのもseal済み診断だけで、台帳やtokenは公開しない。
5. 最初の全体回帰は211ファイル・9,482件成功。その後、同期契約のbudget／schedulerがnative rejected Promiseを返す誤実装を追加し、未処理拒否2件を再現した。返却Promiseを採用せず、固定ハンドラーで決着だけを観測して失敗へ合流するよう修正し、専用60件・未処理拒否0を確認した。

## 3 独立した期待値と確認項目

[専用テスト](../tests/review/native-diagnostic-workflow.test.ts)は固定status表、テスト側の操作イベント／reader参照、注入clock／scheduler境界、直接のstream.lockedとtimer件数を用いる。製品eligibility関数・scenario一覧・counterを期待値の生成元にはしない。

- 同readerに対してreader→closed→cancel→releaseの順、read=0、各操作一度。成功時のterminal発行／消費は各1回。
- release403／404だけが非実行受理。401・200・302・500は発行しない。hard401＋cleanup拒否でもauthentication_failedを保持する。
- pending中の取消／closeを同cleanupへjoinし、元floorの等号・clock逆行・例外・scheduler不正で停止する。元期限を延長しない。未確認cleanupとteardownをseal後に昇格しない。
- owner／Responseの再利用、copy診断／不正descriptor／proxy／accessorを拒否。constructorはnativeやclockを観測するより先に上位bindingを完了する。
- terminal／writer／anchor／readerの公開や外部consumerはなく、native proofと公開copyを同一視しない。疑似秘密markerを返却JSONや未処理拒否へ流さない。

## 4 最終検証

- `bdo npm run build`：成功。
- ND-02専用：60テスト成功、未処理拒否なし。関連5ファイル248件は同期境界Promiseの追加前に成功。
- 変更source／test／compiled fixture／梱包scriptのESLint：警告・エラー0。
- `bdo node tests/review/package-http-classification.mjs`：ND-01／ND-02と既存status各段階のcompiled試験成功。offline・ignore-scriptsのpack dry-runは409ファイル。開発module／fixtureの非同梱、配布runtimeからの非参照を維持。
- `bdo npm test`最終再実行：211ファイル・9,484テスト成功、未処理拒否なし（43.95秒）。依存再取得を伴うworker梱包試験や実環境検証の成功は主張しない。

## 5 未接続と停止状態

実session／ReleasePermit／認証snapshot／ready世代・実source consumer・canonical C/G/P/Rとのbinding、固定dispatcher／URLからの証明、認証／親のnative観測は未接続。ND-02のfake budgetはreadonly残時間だけで、実会計を新設・更新しない。ND-03の実class連続fake、SA-03の承認後判定は別工程。

正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留・既存200限定guardを維持する。fallback有効化・実接続・実通信・実機操作・設定変更・Pushは行っていない。
