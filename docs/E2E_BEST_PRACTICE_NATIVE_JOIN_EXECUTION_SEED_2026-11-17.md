# JR-B未使用execution seed・先行field・固定拒否の検証記録

Date: 2026-11-17。基準HEAD: `48900ac`。設計：[実行前内部契約・先行slot draft-0.2](BEST_PRACTICE_NATIVE_DIAGNOSTIC_JRB_EXECUTION_SEED_CONTRACT_DESIGN.md#10-未使用seedの限定実装)。着手時の設計draft-0.1と親2文書は未コミットであり、その内容を保持して実装節・参照・状態を更新した。既存の作業をstage／コミットしてから始めたものではない。

## 実装範囲と保持責務

[旧root](../src/review/abort-scope-evidence-native-diagnostic.ts)の同shell割当て時に25個の固定fieldを追加した。将来の有限state／位置／fault siteはprivate型語彙、runtimeは初期literalへのExtract投影である。既存candidate／work／settler／ackはnull、constructor／entry／observer／drain／settle claimはfalseのままで、native状態へ進めるwriterは実装していない。14個の期待aliasもconst nullであり、unknown値やfake eventを採用する口ではない。

未使用検査はcaptured own descriptorのdataタグ・値・writable／enumerable／configurableを照合し、getterを実行しない。旧pin postとhandler段階別postの初期検査へ加え、従来の同owner・停止・同record・live pin・closed fieldは削除していない。原始値だけでなくdescriptor属性の不正も拒否する。

executionSeedUnusedの唯一の製品内部callerは閉鎖したrequestJoinExecutionである。seed checkerはread-only、正常seedを含め要求の戻り値は必ずfalse。要求はconstructor_preまたは先行faultを保持して同期失効し、準備済み参照・handlers履歴を維持する。retentionのown data書込み資格が成立する場合だけunconfirmedを記録し、accessor／非writableならhookを呼ばずrole slotの固定失敗と元fieldを保持する。新しい試行claimは消費しない。

新要求はlegacy execute／cleanから呼ばず、旧固定拒否closureも呼び出していない。Promise／candidate取得・観測登録・callback・upper通知・copy・settle／実終端・private公開・dispatchは未接続。原始failure保持は本実装に含むが、正常／失敗workの終端を行ったとはしない。構築用RecoveryAnchor.copyやreader cleanup factsへの変換も行わない。

## source／compiledの独立合成対照

[source試験](../tests/review/native-join-execution-seed.test.ts)は70件。[oracle／scratch導出](../tests/review/fixtures/native-join-execution-seed-model.mjs)は固定区間を管理された新しい合成JS realmへ導出する。製品にexport・friend・登録口・event writerを足さない。[compiled検査](../tests/review/fixtures/compiled-native-join-execution-seed.mjs)は固定distだけを読み、source／TypeScriptへfallbackしない。

| 対照 | 確認範囲 |
|---|---|
| 正対照2role | handlerより前に25fieldをown writable dataで保持。未使用checkを繰り返しても非変更。固定要求後は同shell・参照・handlers履歴を保持し、位置handlers・fault site constructor_pre。停止下の同record cleanupでも元authentication_failedを上書きしない。拒否後にtest側で停止flagを復旧してもseed再利用は拒否 |
| 25field×24拒否=600 | pin／handlerの各段階、2roleで値変更・accessor・非writable・非enumerable・欠落を拒否。handler後はseed checkerも拒否。fieldごとのaccessor下要求とnonconfigurableも確認。getter hook 0 |
| 同一性24 | shell／identity／pinへforeign・同値copy・hook付きProxy・revoked Proxyを投入。診断は自ownerだけ、foreign shell／slotは不変。constructor claim未消費、handlersFault不変、hook 0 |
| 停止／先行診断11 | run停止・sealed・cleanup record交換・species getter・role不正を拒否。同recordの停止下cleanupはread-only checkを許可しても実行要求は固定拒否。先行handlers fault／site／detailを保持 |
| descriptor継承2 | 同shellのaccessorと、descriptorが継承するvalue getterを合成realmだけへ注入。dataタグを先に確認し、seed／descriptorの両getter実行0 |
| 構文正常変異38 | field検査省略25、固定拒否／binding診断／first site／readiness／retention／同期失効／aliasの7、pin／handler境界・dataタグ・属性3種の6。構文正常を確認してoracleが拒否 |
| 構文負対照7 | constructor／retained closure／apply、通知／copy、raw field書込み／読取りを監査が拒否。これらを実行してclosureを起動する試験ではない。alias14個はnull、source上の新要求caller 0 |
| semantic不正15 | 有限state／site、role、literal false claim／初期state、null登録work、retention、const aliasへの不正代入を1 Programで行別診断。未来語彙の合法値とlive seedの初期限定を区別 |

70source試験と表中の有限対照は別の単位である。値イベントや型の一致からnative Promise／settlerのoriginを証明せず、未来の全状態遷移oracle・失敗後callback writerまで実装済みとはしない。

## 先行RED・初回失敗と対応

| 段階 | 原因・対応 |
|---|---|
| 最初の1件RED | 新seed区間がHEADに存在せず失敗。初期field／未使用検査／固定拒否だけを実装後に成功 |
| 初回型検査3診断 | faultAtを広げた一方で旧failPreparedJoinのat型が狭いままだった2件と、未使用のJoinRegistrationState。前者をfault site型へ揃え、後者は既存observerStateの初期Extractへ適用。runtime参照やclaimを広げない |
| 初回関連72件中5件失敗 | 上記製品型不整合がsemantic試験3件にも余分な診断として出た。残りは新readiness代入と旧変異アンカーの重複、handler完了checkerの内部caller 0前提。新保持変数名で旧アンカー一意性を維持し、唯一の閉鎖seed callerを明示。旧資格・期待値・semantic負対照の件数は緩めない |
| 29件中1件失敗 | 試験自身がconstructorClaimのgetterを事後assertで読んだ。descriptorの確認へ変更し、製品がgetterを実行した問題と分離 |
| 追加試験の構文失敗 | MJS監査assertの余分な括弧でimport前に失敗。node構文検査で位置を特定し、target名の局所変数へ分割。製品codeや制限を変更しない |
| 69件中2件失敗 | handler境界の変異を誤ってpin区間から探したため、正しい固定区間へ修正。dataタグ省略は通常accessor対照だけだと値不一致が残り検出できなかった。descriptor継承value getter対照を追加し、タグ省略時にhookへ到達する非等価な差をsource／compiledで検出。未検出のまま成功件数へ含めない |

最後の変異位置修正前の再実行でも同じ境界アンカー失敗を確認した。別の製品退行として重複計上しない。期限・既定並列度を緩めたり、プロセス全体のlistenerで失敗を隠したりする対応は行っていない。

## 検証結果

作業treeで実施した結果であり、コミット対象だけの別展開ではない。

| 検査 | 結果 |
|---|---|
| build／型検査 | 既存tsconfigでexit 0 |
| 関連source12file | 373件成功・失敗0、群全体9.49秒。停止flag復旧後の再利用拒否対照を加えた再検証でも373件成功・9.04秒。旧303件＋新70件。個別5秒・既定並列度を維持。群全体時間と個別期限は別 |
| 新旧compiled11本 | 新seed、handler、pin、JR-A、CP00〜05、空準備、VK01／02、BG01、ND-01／02／03がすべてexit 0・signalなし、各外側60秒内 |
| lint／MJS構文 | 変更TS3本のESLint exit 0、新MJS2本のnode構文検査exit 0。全repository lintではない |
| 旧本文／公開面 | AST比較で旧14関数本文・4exportがHEADと一致。seed型／新関数のd.ts漏出なし。旧handler監査への追加は未使用field checkerだけ、旧caller監査は唯一のseed checkerに限定 |
| 梱包dry-run | offline／ignore-scripts・当該コマンド専用一時cacheでexit 0。441file・配布JS109本。旧root群／試験非同梱、新seed／model参照0。cacheは終了後削除。実tarball生成・展開は未実施 |
| 文書／差分静的確認 | 設計3文書＋本記録のlocal link36件・表24個、seed設計ID53個を確認。対象11fileだけの変更、末尾改行・差分空白に問題なし、stage0 |

文書更新後にもlink／表／ID・差分・変更範囲を再確認した。全repository回帰・実backing容量・任意intrinsic改変・OOM／process障害時の全回収は未検証／Unknownであり、本記録の成功とはしない。

## 残課題と維持条件

同P／settler生成、candidate／work安全観測、実callback writer、通知／copy／固定abort・失敗終端は未接続。次に実生成を行う場合は安全な観測・未dispatch候補の固定終端と一体で検証し、未観測rejectや無期限pendingを後工程へ残さない。旧workとの統一・JR-C private公開・dispatch／entry・外側custody／最終discardは別工程である。

正式発行口／新LM03／C実行入口／body起動閉鎖、全体受付無効、通常経路未切替、LOAD6／LOAD7選択・AP01〜06未承認、VM／監視／telemetry調査保留を維持する。実接続・実通信・実機操作・設定変更・stage・コミット・Pushは行っていない。

## レビュー・コミット前の対象限定再検証 2026年11月17日

差分・同owner／descriptor境界・固定拒否・先行診断／参照保持・literal型・source／compiled oracle・旧caller移行・梱包境界をレビューした。この非実行seed範囲で修正必須の問題は見つからず、製品ソース／試験の追加修正は行わなかった。これは将来のPromise／callback／終端接続や全repositoryの安全性を承認した結果ではない。

未コミットだった詳細設計draft-0.1と親2文書を、作業treeの実装内容を変更せず前工程コミット`8069fac`へ分離した。文書3fileだけのindexでlink26件・表21個・新設計ID53個と差分空白を静的確認し、ソース・試験を含めなかった。

次に実装・試験・文書11fileだけをstageし、index全体を別の空directoryへ展開した。既存dist・`.git`・未登録の作業fileを持ち込まず、導入済み依存だけを参照した。展開先で既存設定のbuild／型検査・変更TS3本のESLintがexit 0、関連source12file・373件が成功（失敗0、群全体8.64秒）。元の個別5秒・既定並列度を変更していない。

展開先で新たに生成した固定distのcompiled11本はすべてexit 0・signalなしで、各外側60秒内に終了した。新MJS2本の構文検査もexit 0。offline／ignore-scripts・コマンド専用一時cacheの梱包dry-runは441file・配布JS109本で成功し、旧root群／試験非同梱・新seed／model参照0を確認した。一時cacheは終了後に削除した。実tarball生成・展開は未実施である。

親HEADとのAST比較で旧14関数本文・4exportが一致し、文書link36件・表24個を確認した。再検証後の追加は本節だけで、検証済みのソース・試験・設定は変更しない。最終indexと展開先の内容一致・対象11file・差分空白を再確認して実装コミットを作成する。全体回帰、Promise生成・closure呼出し・観測・終端処理・private公開・dispatchは未実施／未接続、各閉鎖条件・Unknown・調査保留を維持し、Pushは行わない。

## レビュー修正 2026年11月18日

レビュー基準は`f3746c4`、修正時のHEADは`ed57855`。設計は[実行前内部契約・先行slot draft-0.6](BEST_PRACTICE_NATIVE_DIAGNOSTIC_JRB_EXECUTION_SEED_CONTRACT_DESIGN.md#10-未使用seedの限定実装)。

| 指摘 | 原因と対応 |
|---|---|
| 合成realmが非strict | 独立oracleが製品を非strictのscriptとして実行していた。書込み不可・getterだけのaccessorへの代入が黙って無視され、retention書込み条件の省略（常に書込み／writable省略／dataタグ省略）の3変異がsource・compiledの両対照を通過した。setter付きaccessorを使う対照もなかった。導出realmを製品と同じstrictへ改めた |
| readiness書込みの例外脱出 | strictでreadinessを書込み不可にすると、failExecutionSeedの代入が例外を出し、catch内の再記録でも同じ例外が出て要求の外へ抜けた。slot faultはnull、phaseはbuilding、revokedはfalseのままだった。readinessにもretentionと同じown data・writableの書込み資格を課し、不成立なら書込みを飛ばして固定失敗・同期revokedを記録する |

追加した失敗writer対照は2role×4の8件である。readiness書込み不可、retention書込み不可、retentionのgetter／setter付きaccessor、同accessorでdescriptorが継承するwritable getterを用意する。要求が例外を出さずにfalseを返し、invalid_state・constructor_pre・failed_retained・revoked・primaryを記録すること、当該descriptorを保持し他方fieldだけを書くこと、hook 0を確認する。構文正常な変異は38件から43件になった（readinessの書込み資格2件、retentionの書込み資格3件）。

先行REDとして、新しい対照をHEADの製品コードへ当てると「run readiness readonly」で例外が出て失敗した。修正後のコードでは8件とも成功した。新しい変異5件は旧oracleで5件とも通過し、新oracleで12件の固定変異がすべて検出された。strict化後も既存の正対照・field拒否・同一性・停止・descriptor継承の各対照は変更なしで成功した。

catch経路のinternal_review_errorを無効化する変異は、要求内で例外を起こせる合成入力がないため未検出のまま残る。handler／pin／値postの各oracleも非strictの合成realmを使っており、本修正の範囲外として残る。Promise生成・closure呼出し・観測・終端処理・private公開・dispatchは未接続のままで、各閉鎖条件・Unknown・調査保留を維持する。
