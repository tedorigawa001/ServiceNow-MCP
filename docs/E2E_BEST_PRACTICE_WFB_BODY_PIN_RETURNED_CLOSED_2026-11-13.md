# WF-B：R-b内部型・先行2scalar・origin leafと固定拒否の閉鎖契約

Date: 2026-11-13 / 基準HEAD: `279083040fd95bd6bf065cd6a368ad64c94506ff` / 対象：[開始claim／失敗終端設計§15](BEST_PRACTICE_WFB_BODY_PIN_RETURNED_CLAIM_FAILURE_DESIGN.md)。合成依存限定・package除外fixtureだけ。正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。

## 1 今回の保証と未接続範囲

狭い内部型・有限値検査／理由写像7関数、最初のinstance fieldとして初期化する2scalar、privateなorigin／固定拒否／原始診断の3methodを追加した。既存404method本文は基準HEADと一致。新factory／export／constructor flagは追加していない。

開始claim消費・実受理・G_R／G_A・C-03・body・実接続／実通信／設定変更・Pushは行っていない。source／BS／Tへの書込み、returned4scalar更新、route退役／診断完了marker、終端ownerへの受渡し・seal／返答生成も未接続。failure_pendingは内部primitiveだけで、公開証拠・実際のhandoff完了ではない。

作業開始時はcleanだったが、途中で前段準備境界のレビュー差分がCHANGELOG・R-b接続設計・前回検証記録・compiled supplyへ加わった。これらは保持し、今回の実装／試験実績と前段レビューの変異監査を分離する。共有するcompiled供給試験では、開始／受理4scalarの監査を明示して新診断2scalarと区別する箇所だけを調整した。

前段レビュー差分は作業中に別commit `f4f410e`へ保存された。実装作業の終了時点では今回の実装を未コミットで保持した。共有compiled側の4scalar監査も同commitに含まれたため、その差分を戻さない。R-b接続設計§17のレビュー履歴と前回検証記録は今回編集していない。

## 2 REDと初回試験不備

| 段階 | 結果と対応 |
|---|---|
| origin tracerのRED | 未実装methodの呼出しが既存callerのcatchを経由してcaptured undefinedとなり、正規origin trueのassertで失敗。readonly origin leaf実装後にGREEN |
| 新compiledの初回拡張 | 注入したconst firstが既存callerのconst firstと同scopeで衝突しSyntaxError。注入変数をfirstCode／secondCodeへ変更して再実行。実装や期待値・期限は変更していない |
| 既存compiled群の再実行 | 最初のcompiled-declared-actualが出力なしで停止。初回wrapperはcode／signalを出しておらず原因を確定できない。診断付き単独再実行は60,802ms、ETIMEDOUT／SIGTERM・status null、stdout／stderr空。期限60,000msを維持し、以降の群は未実施 |
| 負荷低下後の順次再実行 | load average約13.10／31.54／20.79・空き約601MiBまで下がった後、同じ60,000msで再実行。declared-actual 19,581ms・bind-fields 18,435ms・bundle 41,965msで成功したが、body-liveは60,004msでETIMEDOUT／SIGTERM・status null、出力空。以降は未実施 |
| 子プロセスの読取り確認 | 該当試験名だけを抽出するps読取りを試みたが、実行制約のEPERMで確認できなかった。権限／設定の変更や未知のprocess停止は行っておらず、子process終端確認を完了扱いしない |

試験の構文エラーは実装の拒否成功へ数えない。unknown候補の拒否対照も、捕捉点到達と旧callerの正常返答維持を別にassertする。source非更新は、helper呼出し直前／直後の実13progress値を比較し、catchで隠れるthrowだけを根拠にしない。

## 3 独立compiled対照

scratchだけで既存C-cの実復帰／completion分類後・失敗writer前へ観測を挿入する。元fixtureのreturnedClosedRefusal呼出しsiteは0。正常なprivate拒否でもroot first construction_unconfirmed／rejectClass continuation_unconnected／sourceRecord not_attemptedだけを保持し、元C-cは従来のpin_return_not_connectedへ進む。

| 対照 | 確認結果 |
|---|---|
| 診断組oracle | 54組。noneにはnot_attemptedのみ、拒否種別6値には閉鎖subset3値だけ。written／prior_preservedは拒否 |
| firstのrole別oracle | root／source／receiver／不正roleと12値の48組。入力hook 0 |
| 理由写像oracle | 7種別×12値の84組。source receiver_unconfirmed／post_unconfirmedはroot construction_unconfirmedへ、未知literalをechoしない |
| origin単項 | current／rejected・storage確認・生成試行・確認数／段階・BP01位置・binding／BS／link／dutyの14件を個別に壊して拒否、旧caller返答不変 |
| foreign／copy | R/S/T Proxyとsource同値copyの4件を拒否、未知hook 0・捕捉到達あり |
| foreign固定拒否 | 同じ4候補を拒否継続へ渡し、foreign rootはowner_rejected、他はbinding_mismatch／withheld。元source不変・hook0 |
| 不正原始slot | returned post／point／failurePoint、新rejectClass不正値、closed段階のsourceRecord writtenの5件でstate_invalidを先行保持。claim／point等を正常値へ修復しない |
| 停止／先行失敗 | root close／root stop／S.stop、root input_rejected、S.post_unconfirmed、root／S不正firstの7件。origin trueのままhealthy供給false、固定分類／初回理由とsource不変を確認 |
| 記録再入・使用済み | checking／failed、seal／replyAttempt／cache、非活動frame／public入場の7件で固定拒否。元first／新2scalarに記録を足さない |
| 初回記録保持 | binding_mismatch／withheld後のstopped／unconfirmed記録でも先行理由・分類・sourceRecordを保持 |
| origin読取りthrow | rootへobservation_unconfirmed／construction_unconfirmed・sourceRecord unconfirmedを保持。source記録／終端化なし |
| 最先行・閉鎖AST | 新2scalarが最初のinstance fieldでliteral初期値。開始／受理4scalarへの代入0、運用拒否call site 0 |
| 非割当て | 新3method＋7helperを監査。object／array／new／closure／spread／template／awaitを禁止し、呼出し先を固定。書込みは記録methodのroot firstと新2scalarだけ。receiver-first accessorの直接private読取りも確認 |
| semantic compile-fail | private3method（TS2341が3件）・private field（TS18013が1件）・claimed／written／不正診断組等の9行を拒否。fixture本体の意味診断0 |

oracleは実装のbuilder／検査表をimportせず独自literal集合から期待値を計算する。型組とfixed拒否は閉鎖段階の保証で、CL全順序・開始claim・FD全schedule・CFV全体の完了ではない。非割当てはコード経路の契約であり、JSの物理allocation・GC／OOMはUnknown。

## 4 関連検証

| 確認 | 結果 |
|---|---|
| focused合成 | 4file／99件成功 |
| 関連合成回帰 | pin各段階・source issuer・storage／seed／live／bundle・compositionの20file／1,282件成功 |
| 新compiled | §3の全対照成功。開始／受理writer 0・拒否運用caller 0 |
| build | npm run build、exit 0 |
| strict型検査 | fixture・新閉鎖試験・旧供給試験、ES2022／NodeNext／strict／noEmit、exit 0 |
| lint | fixture・新compiled・共有compiled supply・新閉鎖試験・旧供給試験の5file、exit 0 |
| 梱包dry-run | 441file、dist/review/review-worker.jsあり、src／tests／fixture混入0。offline・ignore-scripts・一時cache、終了後に当該cache削除 |
| 既存compiled群 | 負荷低下後は先頭3script成功、body-liveでtimeout停止。新closed対照は別に成功したが、残りは未実施。27成功とはしない |

全体回帰は未実施。既存の試験期限／compiled各processの60,000msは変更していない。timeout時の環境読取りではload average 82.66／37.99／19.14、利用可能CPU数10、空きメモリ約88MiBだった。高負荷との関連は疑われるが、環境だけが原因ともコード退行とも確定しない。新compiledの成功、既存404method本文不変、関連合成成功を、既存compiled群完了の代わりにはしない。

再確認時はbuild／型検査／他の重い検証との同時起動を避け、同じ60,000msのまま終了code／signal／所要時間を採る。負荷が下がっても再失敗する場合は同条件の基準HEAD対照で差分を切り分ける。期限延長・試験skip・失敗の成功扱いは行わない。

負荷低下後にもbody-liveがtimeoutしたため、同条件の基準HEAD対照と環境／退行の切り分けは未完了の残課題である。新しいorigin資格にstorage確認の単項対照を補完した最終版でも、新closed scriptは全対照成功した。既存群のtimeoutをこの成功で解消済みとはしない。

## 5 費目と保持責務

同R／元frameが有限検査・leaf・原始記録・2scalar・拒否分岐の費目を持つ。source・利用claim・trial／call・FailureOwner／cacheを再発行しない。元SはR、I/C/JはT、BSは元construction ownerの保持責務に残り、origin trueやfailure_pendingを解放確認へ昇格しない。

実E／S・全体work上界・unit／layout／物理allocation・停止後解消予約・cleanup／借用退役・診断必着はUnknown。正式発行口閉鎖・全体受付無効・調査保留と実接続禁止を維持する。

差分確認では、新規分の設計／本記録3文書のローカル参照19件・表25個・節順、既存設計の§1以降本文保持を確認した。既存404method本文は基準HEADと一致し、src／配布runtime・設定・manifest／lockfileは変更していない。index登録・今回変更のコミット・Pushは行わず、途中で保存された前段レビューcommitは保持している。

## 6 コミット前の再確認（2026-11-13）

基準HEAD `f4f410e496b886a2948accbd7c4bde420c1242fd`に対し、今回の8fileだけを対象とした。関連合成20file／1,282件と新closed compiled対照を再実行し、双方exit 0。新compiledの54診断組・48role組・84理由写像・origin14件・foreign4件／固定拒否4件・不正slot5件・semantic拒否9行、開始／受理writer 0・運用拒否caller 0を再確認した。

既存compiled群は今回再実行せず、§2／4のtimeout・原因未確定・後続未実施と子process終端未確認をそのまま残す。27script全成功や環境起因の確定へ読み替えない。新たなsource／runtime変更、期限緩和、実受理・開始消費・終端接続・Pushは行わない。
