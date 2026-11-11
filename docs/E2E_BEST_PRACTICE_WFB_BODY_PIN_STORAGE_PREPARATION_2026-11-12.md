# WF-B 新modeの狭い状態・先行境界と格納前後検査の限定準備

Date: 2026-11-12 / 基準HEAD: `7a9a613` / 未コミット差分の合成検証。

対象は[格納・PC08未接続停止設計§13](BEST_PRACTICE_WFB_BODY_PIN_STORAGE_RETURN_STOP_DESIGN.md)、[call親§17](BEST_PRACTICE_WFB_BODY_PIN_CALL_RECEIVER_DESIGN.md)、[private pin親§18](BEST_PRACTICE_WFB_BODY_PRIVATE_PIN_CONNECTION_DESIGN.md)。開始時はクリーン。前段の固定call・receiver入場と`8d95d5c`の一点対照／等価判断を保持する。正式発行口・既存C実行入口・body起動閉鎖、全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。

## 実装した範囲と固定拒否

package除外compositionにcreateProbeBodyPinStorageFake／wfb-body-pin-storage-1を追加した。凍結5methodと固定scriptだけを公開し、元root／source／start・任意object／callback・public診断から資格を採用しない。開発moduleのexport期待値2箇所へ新factory名だけを追加した。旧facade／runtime export・配布設定は不変。

新constructor固定modeは既存call継続を含む。同root／同prepare／同frameのreceiver attempting全検査後、旧格納前失敗writerより前だけで新準備へ分岐する。旧call factoryは旧分岐・返答・期待値を維持し、失敗済みrootを再prepareして再開しない。

同startの新境界scalarはconstructor前のliteral none。実準備はbeforeでentry検査→after／checkedでattempted検査→before／before_issuedで格納前検査→blockedでも格納前再検査の固定順である。元root／source／start・固定mode・実callActive／entryBusyと、元来歴／同frame・停止／先行理由・未使用base／空BS／空payloadを確認してから、同時点のsource／receiver／境界原値を検査する。

通常到達はpin_storage_not_connected／root first construction_unconfirmed、source／receiver first receiver_unconfirmedで固定停止する。receiverはattempt true・stage attempting・step attempt／failureBoundary before、root初回位置はBP03／call／after、source境界はBP03／call。9参照はすべて空、claim unused・bindCall／post false、occupancy free／bindingState empty／prefix none、data／grant／duty消費／body／readyは0。

新準備は参照もstageも書き換えない。receiver finallyは元のentryBusy、caller finallyは元のcallActiveだけを解除し、新境界・試行・初回診断・参照の保持責務は払い戻さない。sourceをpreparingへ移さず、PC08／C-03やaccepted後のpin_return_not_connectedには進めない。

## 狭い値型とowning経路の区別

BodyPinStorageStateは、source BP03／call／initializing／unusedとreceiverのstage／step・境界を結ぶ10variant。entry、attempted、before_issued、issued、before_current、captured、before_checked、checked、before_confirmed、confirmedを個別に受け、任意phaseや広いstage ORにしない。元C-01の厳密なsource13field・receiver14field検査を再利用する。

実ownerのprivate checkerが受け取るphase型はentry／attempted／before_issuedの3つだけで、前／後7variantは原始値だけの純粋検査である。実private issued/currentへ参照を入れたり、pinStageをconfirmedに偽装して正例を作ったりしない。純粋検査のtrueは資格・発行証拠・cleanup receiptではない。

新receiver診断writerは境界before／afterの原値だけを初回診断へcopyし、それ以外はnoneとする。不正初期境界はstate_invalidで拒否し、公開storage.boundaryはallowlist外をunconfirmedへ投影する。既知位置を偽造するために未知境界をbeforeへ丸めない。before観測のthrowは新準備境界none、checkedはafter、before_issued／blockedはbeforeとして区別する。

rootの準備点／初回失敗点／再入結果と、callerのBP03 call before／after・receiverのattempt位置・生成BP01／afterを分離する。close／priorがcallee中に起きればroot初回位置はcall before、primitive復帰後の通常固定停止／callee捕捉失敗ならcall after。返答cacheより先の同期停止、元source first・初回位置、生成failureRecorded=falseを維持する。

## RED／GREEN・初回失敗と切り分け

1. 新factoryの正常停止を使う1件は未実装TypeErrorでRED。最小の新mode・境界・格納直前検査と固定拒否を追加し、新1件＋旧call43件が成功した。
2. before_issuedでcloseする1件はscript未受付のinput_rejectedでRED。有限4点とfault／close／prior／再入を追加して、新2件＋旧call43件が成功した。その後、独立prefix oracleと混入・先行失敗・秘密非出力等を新35件へ拡張した。
3. 格納後の値状態を含むcompiled tracerはissuedでfalseとなりRED。実ownerの受入phaseは3つのまま、狭い値unionと純粋検査だけを10variantへ拡張して成功した。
4. 追加busy対照はguard除去後もstate_invalidとなり失敗した。診断を限定出力すると、基準側はstorage.before、対照側はstorage.none／receiver preflightで停止していた。基準runが立てた試験用global flagを対照run前に消していなかったため、次runの旧入場検査へ故障が漏れていた。finally除去ではなく、各run間の注入解放不足が原因である。
5. 同じ観点で境界注入も確認し、基準／対照run間でglobalを解除し、finally cleanupも残した。境界の対照は「理由又は点が違う」だけでなく、before→checked、checked→before_issued、before_issued／blocked→blockedの期待suffixと理由を固定し、手前へ戻る誤検出を拒否する。試験用診断出力は除去した。fixture本体・製品期限・設定はこの切り分けで変更していない。

途中版のcompiled成功を、追加対照後の最終成功へ読み替えない。期限・並列度・旧期待値・既存設定は緩めていない。

## 合成・compiled保証と等価判断の範囲

新Vitest35件は公開APIだけを使う。4点×fault／close／prior／再入の境界・初回位置を実装表から独立に計算し、foreign／copy／Proxy、先行5失敗、開始前close、敵対入力・extra引数・cache同一性・凍結有限plain graphを確認する。新35件＋旧call43件＋composition6件の3ファイル84件も成功した。

| 対象 | 確認範囲 |
|---|---|
| 値専用10variant | 独立の原始値builderから10正例、100交差組、source13＋receiver14fieldの270単独拒否。missing／extra・不正phase／境界・nullも拒否 |
| 初期境界 | 文字列秘密・after・null・0・trueの5不正初期値を最初のbeforeでstate_invalid。公開値から秘密を非echo |
| 準備4点 | raw境界getterを当該点で壊し、該当checker迂回で最初の拒否が予定suffixへ移動する対照。前runの注入を解放して実施 |
| mode／active／busy | 実準備beforeで個別故障。該当guardを外すと理由が変わる意味的対照。busy対照のrun間解放を確認 |
| owning値供給27field | 同live ownerから作る狭いviewのsource13／receiver14fieldを単独故障し、beforeのstate_invalidを確認。core検査迂回ではblockedの固定拒否になる対照 |
| 先行／負の境界 | receiver境界literal none、root3scalar literal none・空reply参照、境界writerは新prepareだけのafter／beforeの2箇所。参照／claim／後続stage writer 0 |
| projection | 準備点／初回失敗点／再入結果のallowlist3対照。不正境界もunconfirmed、raw参照／owner由来値／Error非出力 |
| semantic compile-fail | private準備／checker／診断writerの外部呼出し、不正境界、entry境界／issued組／spent claim、owning checkerへのconfirmed指定の9行を拒否 |

owning27field対照はprivate viewと値coreの接続検査であり、参照格納後の全実slot破損耐性ではない。境界・mode／active／busyについては最初の理由又は予定拒否点の移動を比較し、anchor消失・型／構文エラー・後段の一律拒否だけをkillに数えない。後続stageの正例は値だけである。

設計§9の等価判断は準備範囲だけで再評価した。格納前の同一性・call区間・busy／試行・caller refusalの元契約を維持し、単一の失敗診断要求と未格納のstageに関する到達不能／重複防御は後続格納で再評価を要する。新たな全節感度や全SE受入は主張しない。初回rejected保持・confirmed最終post・accepted後の上位未接続停止は今回の正例に含めない。

## 検証結果

| 検証 | 結果 |
|---|---|
| 新probe-body-pin-storage | 35件成功、失敗0 |
| 新storage＋旧call＋composition | 3ファイル84件成功、失敗0 |
| 関連合成回帰 | 37ファイル2,844件成功、失敗0 |
| 新compiled-probe-body-pin-storage（追加対照後） | exit 0。値10variant／270field・100交差組、owning値供給27field／準備4点・mode／active／busy3対照、型拒否9行等 |
| 新旧compiled27本 | 連続実行は全27本exit 0。注入解放・追加対照後の最新新compiledも再実行してexit 0 |
| composition＋新旧body11試験のstrict TypeScript | exit 0 |
| build | exit 0 |
| 全体lint（src／tests） | exit 0、error 0／既存warning 374。変更したコード・試験7ファイルはerror・warning 0。新compiled追加対照後も当該compiled・fixture・新試験を再実行してerror・warning 0 |
| 梱包dry-run（offline・ignore-scripts） | exit 0、441ファイル。src／tests・fixture混入0。archive生成／公開なし |
| 文書／差分 | 4文書のローカルリンク38・表26、設計13／17／18節、SG9／SE12の順序・改行／空白に異常なし |

関連37ファイルはprobe全11 body試験とframe／run／grant／exit／local-exit、composition／snapshot-read-start／snapshot-value、read-hash全4、source-map全2、pending2、canonical-supply全3とcanonical-gate、journal-supply-shell／writer-gate／absence-journal／capture-admission／retirement-startを明示し、`bdo npx --no-install vitest run`で実行した。全repositoryのVitest回帰は今回未実施。

strictは`bdo npx --no-install tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck`にcompositionと新storage／旧call／bridge／start／contracts／source-issuer／storage-data-split／bind-fields／bundle／live／seed試験を明示した。buildは`bdo npm run build`。compiledは新storageと旧call／bridge／start／contracts／source-issuer／storage-data-split／bind-fields／bundle／live／seed／local-exit／exit-guard／exit-preparation／grant-capture／run-preparation／frame-preparation／canonical-gate-draft／canonical-supply-construction／journal-supply-shell／writer-gate／absence-journal／capture-admission／retirement-start／pending-binding／pending-construction／declared-actualの26本を順次実行した。

旧C-01／startのAST例外は新receiver診断writerのbodyPinFailureStepだけをclass／method／field単位で追加し、旧runtime対照と型拒否は維持した。receiver参照格納をmodule一括解禁していない。packはbuild後、一時cacheの`bdo proxy npm pack --dry-run --json --ignore-scripts --offline`で一覧だけを確認し、finallyでcacheを除去した。依存取得／導入・設定変更はしていない。

## 費目・Unknown・未接続

追加保持は同startの境界1scalar、同rootの準備点／初回失敗点／再入結果3scalar・空reply参照と固定mode。新private照合・値view・固定走査・失敗診断／projectionは費目だが、既存owner／frame・source22key・metadata9・BS13carrier・receiver9参照・call／試行予約は再発行しない。実E／S・unit係数・layout／allocation／GC／OOM・全guard数／全体work上界・停止後解消予約・診断必着はUnknown。

参照格納・初回rejected保持・confirmed最終post・PC08・C-03・source利用claim消費・payload借用／bind・構築ready・body起動・Journal供給・root終端・正式発行・実予算更新は未接続である。正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持し、実接続・実通信・実機操作・設定変更・Pushは行っていない。

差分は合成fixture・新35件・新compiled・旧compiled2本の限定AST更新・開発export期待値2箇所・CHANGELOG・設計3文書と本記録の12ファイル。src／manifest／lockfile／TypeScript／配布設定・旧facadeは基準HEADから変更しない。index登録・コミットは行っておらず、今回の検証は未コミット作業内容に対するもので、コミット対象だけを隔離したものではない。

## レビュー修正（2026-11-12）

`10e2f96`のレビューで、格納準備の新コードに23件の一時変異を入れた。18件は意味的なassertで落ちた。内訳はstorageのVitest又はcompiled、busy節（anchorを保った変異で再確認）、固定mode節（旧call factoryが格納準備へ進むためcallのVitestで検出）である。

残る5件（storage receiver診断の初回保持guard、storageModeのidentity、storageEventのmode／identity、bodyPinStoragePointのidentity）は試験変更なしで通った。上の「等価判断の範囲」は単一の失敗診断要求と重複防御をまとめて書くだけで節を特定していなかったため、節ごとの根拠を[設計§14](BEST_PRACTICE_WFB_BODY_PIN_STORAGE_RETURN_STOP_DESIGN.md)に記録した。文書だけの修正で、fixture・試験・CHANGELOGは変更していない。

## コミット対象だけの隔離再検証（2026-11-12）

上記は実装時の記録。本節はその後のコミット依頼に対する再検証で、基準HEADは同じ`7a9a613`。今回の12ファイルだけを明示してindexへ登録し、全indexを一時フォルダへ展開した。全1,524ファイルのGit blob hash・実行属性がindexと一致することを確認し、未登録の作業中変更を対象へ含めなかった。既存node_modulesへの参照だけを再利用し、依存取得・導入・設定変更はしていない。

分離した内容だけでbuild・compositionと新旧body11試験のstrict TypeScriptがexit 0、関連37ファイル2,844件成功・失敗0だった。全体lintはerror 0／既存warning 374、今回変更したコード・試験7ファイルはerror・warning 0。build成功後のoffline・ignore-scripts梱包dry-runは441ファイルでsrc／tests・fixture混入0、archive生成・公開なし。4文書のローカルリンク38・表26・設計13／17／18節・SG9／SE12の順序・改行／空白も確認した。全repositoryのVitest回帰は今回も未実施。

compiled27本の初回連続実行は26本がexit 0、旧probe-body-liveの1本だけが外側60,000ms枠でspawnSync bdo ETIMEDOUTとなった（exit null、stdout／stderr空）。通常のprocess読取りは権限制約で取得できず、許可された限定読取りで同script名の生存processがないことを確認した。その後、同じ分離内容・同じ60,000ms枠で当該1本を単独再実行し、37,845msでexit 0、型拒否19行を含む既存assertが成功した。製品／試験期限・設定・ソースを変更していない。

最終的には全27本それぞれの成功を確認したが、初回連続27本が一括成功したとは記録しない。初回timeoutの発生原因と打切り時の一時scratch回収は未確定であり、環境負荷とも機能退行とも断定しない。初回の失敗と同枠での再実行成功を両方保持する。

検証後のソース・試験は変更せず、本節だけを追加・再登録する。記録以外のindex全1,523項目のfingerprint不変、最終対象12ファイルと、分離した全1,524ファイルの内容・属性一致、文書整合を再確認する。参照格納・PC08・C-03・body・正式発行は未接続、全体受付無効・Unknown・調査保留を維持する。実接続・実通信・実機操作・設定変更・Pushは行わない。
