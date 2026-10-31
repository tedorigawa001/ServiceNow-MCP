# ND-03：実session／source class＋注入resourceの連続fake試験

Date: 2026-10-31。対象：[詳細設計§13](BEST_PRACTICE_ABORT_SCOPE_NATIVE_STATUS_DIAGNOSTIC_DESIGN.md)。実classを使うが、実通信・実認証・実PDI検証ではない。

## 1 接続した経路

`probeNativeStatusComposition` → 新規fake専用friend → 実`BoundedReadSession`／`BoundedUpdateSetSource`の同constructor private継続 → 登録済みready世代1 → 同canonical会計の親bytes → 注入Response／同reader cleanup → sole native consumer → close前のprivate source受理 → 同期失効・cleanup join・固定解放・session close → freeze済み限定診断copy。

- sessionはper-user形式の合成snapshotから新規生成し、fetchは固定throw。既存sessionへの登録・lookup・mode切替、caller指定source／consumer／driverは公開entryで受け付けない。旧MCP／legacy／固定200の経路は変更しない。
- driver.beginは親bytes／注入resourceの観測前。native ownerはここで生成・bindingする。scopeにはopaque alias、同leaseのreadonly残時間、固定check／accept／stopだけを渡し、raw session／source／core／snapshot／writerを渡さない。
- class側のreceiptは同source・認証snapshot参照・lease・canonical core・transport handle・attempt・元windowに結合する。native側では同anchor／reader／typed終端の検証を行い、sole consumerのguard内から固定class継続へhandoffする。公開diagnostic／ST-03Cの消費結果を再採用しない。
- 親C=1／G=bytes長、release C=1／read=0／G=0。会計は既存canonical ownerだけ。最終4枠・最大210試行・受信量・全体60秒を変更しない。native clockは同leaseの残時間で、期限の起点を作り直さない。
- source／native双方を同期失効して、同reader cleanupを元floorまでjoinする。先行理由は上書きせず、HTTP／cleanup、native上位診断、session内部／公開理由を分けて保存する。未公開draftは失敗時に返さない。close後のsource consumer／terminalは再利用できない。

## 2 テストと初回失敗

- 最初の連続テストはentry未実装でRED、実装後に成功した。初回buildはprivateメンバーへのoptional chain（TS18030）で停止したため、通常のifでcloseを行うように変更し、型検査も成功した。
- ND-01のexport一覧の回帰試験が新entry追加で1件失敗した。許可する4つの開発専用exportを明示し、旧fixtureの意味を変更せず修正した。
- 返却copyの再帰freeze試験で、sessionのstats copyがfreezeされていないことを検出した。上位summaryのbudget copyをfreezeし、GREENを確認した。
- 同期取消・元floor到達・親不正・受信量／request cap超過、ready偽装、sourceのforeign／copy receiptと二重受理、source受理前／後／await間の取消を追加した。境界破壊はtest内のclass wrapperのみで、製品にfault注入APIは追加していない。
- 全体213ファイル・9,521テストが一度成功した後、内部停止理由の引渡しを追加したことでND-02公開stopにも任意引数が通る点をレビューで発見し、秘密markerがprimaryへ入る1件のREDで再現した。公開factoryは引数を受けない固定cancel wrapperを維持し、理由を渡せる停止関数はND-03 private driverだけに閉じた。関連3ファイル98テスト・build・compiled／梱包の再実行に成功した。

## 3 独立した受入条件

[連続試験](../tests/review/native-session-composition.test.ts)28件＋[private境界試験](../tests/review/native-session-boundary.test.ts)8件、計36件。

- 403／404、bodyあり／なしを各一度受理し、sourceとnativeの消費数を独立に確認。公開GET／release判定／global fetchを呼ばない。親bytes長はテスト側で計算する。
- 401とcancel拒否の組合せでもauthentication_failedを保持。失敗時はdraft=nullで、nativeのHTTP／unconfirmed cleanupは返却後も残る。
- 同core／sourceへのbinding確認は成功有無と分けて保持する。foreign／copy source receiptはsessionの内部evidence_binding_mismatch、二重受理はinvalid_stateを保持し、公開codeへ潰した情報だけを返さない。外国runの履歴は不変。
- ready成功を偽装しても登録世代がなければdispatch前に停止する。取消は同期失効、非協調cancelは元floorまでreadonly cleanupを継続。遅延settleから成功へ昇格しない。timer／admissionを解放し、次runを開始できる。
- native byteLength／buffer getterで親bytesをbounded copyし、shadow getter／proxy／accessorやSharedArrayBufferを拒否する。コード・資格情報・例外本文のmarkerを出力しない。返却物は再帰freezeしたcopyだけ。
- classに公開static entryを追加しない。開発moduleが内部friendを一度だけ取得し、再取得を拒否する。scopeは既存sessionを採用する能力を持たない。

## 4 検証結果

- `bdo npm run build`：成功。
- 専用2ファイル36テスト成功。変更source／test／compiled fixture／梱包scriptのESLint：警告・エラー0。
- `bdo node tests/review/package-http-classification.mjs`：ND-03のcompiled試験と既存各段階が成功。offline・ignore-scriptsのpack dry-runは409ファイル。開発module／fixtureの非同梱と配布runtimeからの非参照を維持した。
- `bdo npm test`最終再実行：213ファイル・9,522テスト成功、未処理拒否なし（49.61秒）。依存再取得を伴うworker梱包試験は行っていない。

## 5 制約・未接続

内部friendは配布物からdeep importされ得る。新規fake run・固定throw fetch・非実行draftに限るが、trusted fake driverを受ける試験用境界であり、本番native provenanceの証明ではない。公開entryは任意driverやcleanup申告を拒否する。このfriendをMCPや既存sessionの正式発行経路へ接続してはならない。

既存constructorのclock／timer／listener初期化はdriver.beginより前である。constructor以前の診断owner予約は今回変更しておらず、生成前失敗のnative診断はnullで固定session理由だけを返す。nativeの認証／親slotは未観測、per-user tokenの本人性や実OAuthの確認はしていない。

実dispatcher／固定URL／認証snapshot／ReleasePermit・選択payload／worker jobへの本番bindingと、承認後のC方式fallback判定は未接続。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留・既存200限定guardを維持する。実接続・実通信・実機操作・設定変更・Pushは行っていない。
