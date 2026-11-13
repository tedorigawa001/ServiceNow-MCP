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

## 6 レビュー修正（2026-11-13）

レビュー基準HEAD `eebc1f1`。§3の閉鎖契約へ78件の一時変異を入れ（各変異の後でfixtureを復元）、両方を通った節に単独のcompiled対照を足した。fixtureの挙動・既存対照の期待値は変えていない。

| 観測 | 対応 |
|---|---|
| 一時変異78件：Vitest kill 1件・compiledだけでkill 39件・両方通過38件 | 11件は対照の不足としてkill。残る27件は[開始claim／失敗終端設計§16](BEST_PRACTICE_WFB_BODY_PIN_RETURNED_CLAIM_FAILURE_DESIGN.md)に等価節として記録 |
| 停止／先行失敗の注入はroot／sourceだけで、T.first（receiver）の先行失敗・不正値の分岐を外しても通過 | scratch copyのprivate accessor隣にだけsetterを置き、T.firstへreceiver_unconfirmed（prior_failure・root construction_unconfirmed）、不正literalとreceiverで許可されないconstruction_unconfirmed（invalid_state・state_invalid）を注入。元fixtureのaccessorは読取り専用のまま |
| 停止flagが非booleanのときのCL08 invalid_state 3分岐を外しても通過 | root closed・root sourceStopRequested・S.stopRequestedへ非boolean値を1つずつ入れ、stoppedへ補完せずinvalid_stateになることを要求 |
| origin単項14件にissued source（currentは不変）・C/E control・root failure objectを単独で壊す対照がなかった | 3件を追加しorigin単項は17件。各々で拒否と旧caller返答不変を要求 |
| 記録の`point === identity`許可を外しても通過 | identity点からの拒否が正常対照と同じcontinuation_unconnected／construction_unconfirmedになることを要求 |
| 不正slot対照はfirstだけを見ており、rejectClassのinvalid_state化と不正状態でのsourceRecord非書込みを外しても通過 | 不正slot5件にrejectClass／sourceRecordのassertを追加。不正状態×foreign source（withheld経路）3件でsourceRecordがnot_attemptedのままであることを要求 |

修正後のcompiled出力は`originControls: 17`・`refusalCases: 13`・`malformedForeign: 3`・`identityPoint: true`となる。他の件数（54診断組・48role組・84理由写像・foreign4件／固定拒否4件・不正slot5件・使用済み7件・semantic拒否9行・hook0・開始／受理writer 0・運用拒否caller 0）は変わらない。

レビュー時の全体検証（lint・build・梱包判定・Vitest全件・compiled 27script・`git diff --check`）はすべて成功した。§2／4でtimeoutしたbody-liveを含む既存compiled群27scriptも、期限60,000msを変えずに成功し、残存processは0だった。これは記録時の高負荷との関連を支持するが、記録時の停止原因を確定するものではない。

## 7 コミット前の再確認（2026-11-13）

基準HEAD `f4f410e496b886a2948accbd7c4bde420c1242fd`に対し、今回の8fileだけを対象とした。関連合成20file／1,282件と新closed compiled対照を再実行し、双方exit 0。新compiledの54診断組・48role組・84理由写像・origin14件・foreign4件／固定拒否4件・不正slot5件・semantic拒否9行、開始／受理writer 0・運用拒否caller 0を再確認した。

既存compiled群は今回再実行せず、§2／4のtimeout・原因未確定・後続未実施と子process終端未確認をそのまま残す。27script全成功や環境起因の確定へ読み替えない。新たなsource／runtime変更、期限緩和、実受理・開始消費・終端接続・Pushは行わない。

## 8 同条件の基準HEAD対照によるtimeout切り分け（2026-11-13）

### 8.1 比較条件と観測範囲

採取時に固定した対象HEAD `eebc1f1566a97076e4c4d24ebb68a634c91b378a`と、その直前の基準HEAD `f4f410e496b886a2948accbd7c4bde420c1242fd`を比較した。本節の「現行」はこの固定対象を指す。§7の「今回再実行せず」はコミット前確認時の履歴として残し、本節を後続の独立した再確認とする。§6の全群成功履歴も今回のtimeoutを上書きする根拠にはしない。

最終scope検査ではHEAD不変のassertが失敗し、別作業のcommit `fb75e1b089e937e2171bb9af2c20d6e1ee068956`への前進を検出した。同commitは既存の閉鎖対照と関連文書のレビュー更新であり、巻き戻していない。今回実行した2script・入力fixture・共有2module・package／lockfileは固定対象HEADと一致することを再確認した。更新済み§6等も保持する。ただし最新HEAD全体を実行したとは言わず、本節の8試行は固定した2HEADの結果として扱う。

両HEADのtracked内容を一時領域へ別々に展開し、同じ既存node_modulesを参照した。Node `v24.18.0`・TypeScript `5.9.3`・arm64・利用可能CPU数10、NODE_OPTIONSなし。各試行のTMPDIRだけを別の同長pathへ分離し、他の環境条件・起動方法・試験内容を共通にした。各試行のprocess group先頭は`bdo`で、Nodeはその子として動いた。この経路は両HEADで共通だが、Nodeを直接起動した場合との所要時間差を含む（§9）。build／型検査／他の重い検証は同時起動せず、対象2scriptごとに **基準→現行→現行→基準** の順で直列実行した。外部の自然負荷・空きメモリ・cache状態は固定していないため、完全に同一の負荷を再現した試験ではない。

両HEADで2script・source-map-values-core.ts・supply-construction-kernel.ts・package.json・package-lock.jsonのSHA-256一致を確認した。比較対象の大型fixtureだけは前commitとの差分を含む。

| 入力 | 基準／現行のbyte長 | SHA-256（基準／現行、共通は1値） |
|---|---|---|
| compiled-declared-actual.mjs | 同一 | `c80320de81bbc8d56508e93224e019f3f62e6ed5425274a0abf339034c3c0e26` |
| compiled-probe-body-live.mjs | 同一 | `d78c192b304fa73d7e5f70d467564f0dea1a5b3d9cbff3736fd4fab1c0075f07` |
| snapshot-read-composition-fake.ts | 590,230／598,807 | 基準 `4fe7e303b4359d0996b6b5f58fa0adc63989025586981cd1dbfda75bb617e0be`／現行 `f0f38d7bd4dc87cd7f1c5ebda00e91f64c9f8408a975864e8369e035426be890` |

fixtureの実行期限は各 **60,000msのまま**。期限到達時は今回起動したprocess groupだけへSIGTERMを送り、1,000ms後も残る場合のSIGKILLと、別枠の有限cleanup確認を用意した。cleanup枠は試験継続時間の延長ではない。今回はSIGKILL不要だった。既存／未知processにはsignalを送っていない。

### 8.2 8試行の結果

所要時間は起動直前から親processのexit／closeまでの単調時計値。loadは開始／終了時の1分値、RSSは5秒間隔で観測した単一processの最大値で、真のpeak・group合計・確保上界ではない。

| ID | script | HEAD | exit／close（ms） | 終了理由 | load開始→終了 | 観測最大RSS（KiB） |
|---|---|---|---|---|---|---|
| r01 | declared-actual | 基準 | 14,364／14,364 | code 0・signalなし | 5.52→5.32 | 602,512 |
| r02 | declared-actual | 現行 | 13,950／13,950 | code 0・signalなし | 5.32→6.11 | 654,768 |
| r03 | declared-actual | 現行 | 14,405／14,405 | code 0・signalなし | 6.11→6.01 | 570,320 |
| r04 | declared-actual | 基準 | 14,583／14,583 | code 0・signalなし | 6.01→6.15 | 619,440 |
| r05 | body-live | 基準 | 58,435／58,435 | code 0・signalなし | 6.15→5.99 | 1,051,728 |
| r06 | body-live | 現行 | 60,001／60,097 | 60,000msにSIGTERM・code null | 5.99→7.79 | 1,022,112 |
| r07 | body-live | 現行 | 60,002／60,046 | 60,001msにSIGTERM・code null | 7.79→7.41 | 1,331,296 |
| r08 | body-live | 基準 | 58,169／58,169 | code 0・signalなし | 7.41→6.97 | 1,233,760 |

declared-actualは基準2回・現行2回とも期限内にcode 0。body-liveは基準2回が期限内code 0、現行2回が期限到達で停止した。現行timeoutをassert失敗や試験完了として数えない。

body-liveの最後の生存sampleはいずれも約55.1秒時点でNodeがR状態だった。順にr05／r06／r07／r08のCPU累積時間は69.18／68.48／69.69／70.52秒、CPU使用率は114.8／123.6／118.9／116.6%。両HEADとも終了近傍までCPU活動が見え、待機だけが原因とする証拠ではない。一方、どの変異・emit／import・semantic検査の途中だったかは未観測であり、CPU値だけでその位置を推定しない。

同4試行のsample中の1分load範囲は5.77〜6.27／5.64〜7.79／7.15〜8.10／7.14〜7.81、最小free memoryは73／67／74／68MiBだった。r08の基準は現行に近いload域でも成功した。ただしmacOSのfree memoryは利用可能メモリやmemory pressureを直接表さず、swap・GC・CPU割当て等の差を除去できていない。

### 8.3 終了・子process確認と観測器の制約

全8試行で親のexitとstdio closeを別々に確認し、その後、同PGIDのprocessが0件かつgroupへの存在照会がESRCHとなることを、間隔を空けて2回確認した。今回のgroup内で観測したprocessはbdoとNodeだけ。監督processもcode 0で終了し、全試行後の再照会でも、観測した17個のPID（負の対照を含む）の残存は0だった。

監督側の負の対照c00は、試験本体とは別の使い捨て待機processに500msの監督期限を設定し、501msにSIGTERM、exit 502ms／close 504ms・group消滅を確認した。この500msはfixtureの60,000ms期限を変更したものではない。監督器の検査対象は今回所有するgroup／観測PIDであり、別groupへの離脱を含む全OS processの不在や、過去のtimeout子processの終了を遡及的に証明するものではない。

観測器レビューで、stdout／stderr pipeのdata listenerが未接続と判明した。結果JSONのstdoutBytes／stderrBytesが0なのは**未採取**であり、「試験が出力しなかった」「最終件数まで完走した」という根拠には使わない。code 0・signal・exit／close・負荷・group消滅は独立に採取できたが、出力本文による最終assert件数と停止caseの確認は未実施。pipeが未drainだった点も観測器の制約として残す（対象scriptは終端で小さいJSONを1回出す構造だが、その構造だけで影響ゼロと断定しない）。§2の過去の出力空という記録は別wrapperの観測であり、本節の未採取と混同しない。

一時監督器／結果は `/private/tmp/rb-timeout-ab-cMzsDY/` に保持した。これは既存の承認済み永続保管先への保存ではなく、作業用一時出力である。監督器SHA-256は `2eed9f9333b2287fe4b1222b59870834a96e4ffef394ef560ed24a61de3ce011`、結果JSONは `cc4741c6bbe97efdadf3920f99afef19895b889c2c5dee0d7eb584a00d17dfee`。再現条件・結果・制約は本MDに記録し、一時pathの存続を検証根拠の必須条件にしない。

### 8.4 判定と残課題

1. **declared-actualの今回の再現なし**：両HEADが同程度の約14秒で成功した。過去の高負荷時timeoutの原因は未確定のまま。
2. **body-liveの現行差分に連動するtimeoutを観測**：基準2成功／現行2timeoutであり、環境制約だけとして退行候補を除外しない。基準も60秒まで約1.6〜1.8秒しか余裕がなく、自然負荷変動下の2反復だけで特定コードの性能退行を確定しない。§9のレビュー再計測では、安定負荷下の差は約1.4%（fixture増加率と同程度）で、性能退行よりも60秒期限に対する余裕不足による境界越えとして説明できる。
3. **候補機序と未観測点**：body-liveは大型fixture全体を変異ごとにtranspileModule→別URL importし、最後に意味診断を行う構造。現行fixtureは8,577byte増えているため累積compile／load費の増加は調査候補だが、実測内訳は未取得。追加型・field・methodのruntime挙動、compile／import／GC／semantic処理のどれが支配的かはUnknown。次の採取では両HEADへ等しい一時観測を適用し、出力drainと有限な進行点を確認してから、同じ60秒のまま停止位置・費用内訳を比較する。実装修正や期限延長は本調査では行わない。
4. **確認済み／未確認を分離**：今回の所有group終端は確認済み。過去の子process終端は未確認のまま。既存compiled全27script・全体回帰は今回実行しておらず、2scriptの対照で全群完了に置き換えない。

本節では検証記録だけを更新した。製品・fixture・試験script・設定・依存関係は変更せず、開始claim消費・実受理・G_R／G_A・C-03・body起動・実接続／実通信・Pushを行っていない。正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。記録作成時点ではコミット未実施で、その後 `b0916a4` として保存された。

## 9 レビュー修正（2026-11-13）

レビュー基準HEAD `b0916a4`。§8の数値（8試行のexit／close・SIGTERM時刻・load開始→終了と範囲・最小free memory・最大RSS・55.1秒時点のCPU値、観測PID 17個・2回の終了確認・c00）、両HEADのSHA-256・byte長（差8,577byte）、監督器と結果JSONのSHA-256は、`/private/tmp/rb-timeout-ab-cMzsDY/`の採取物と一致した。§8.1の起動経路の注記、§8.4の2番目の判定の補足、末尾の「コミットも未実施」を記録後の状態に合わせて修正した。

body-liveについて、同じ2HEADのtracked内容を別の一時領域へ展開し、同じnode_modulesを参照して独立に再計測した。Nodeは`bdo`を経由せず直接起動し、stdout／stderrを全量読み取り、60,000msでprocess groupへSIGTERMを送る。期限は変更していない。

| 実行 | 順序 | 基準 `f4f410e` | 現行 `eebc1f1` | 1分load |
|---|---|---|---|---|
| A（負荷上昇中） | 基準→現行→現行→基準 | 43,114／41,960ms・code 0 | 55,042ms・code 0／60,046ms・SIGTERM | 4.35→9.64→7.76 |
| B（負荷安定） | 現行→基準→基準→現行→現行→基準 | 39,934／40,050／40,109ms・code 0 | 40,823／40,526／40,448ms・code 0 | 4.04〜5.25 |
| 段階計測（各1回） | 基準→現行 | 40.1s（変異ごとのload 304回で38.1s、意味診断0.79s） | 41.3s（同39.4s、0.76s） | 約4.5 |

1. **安定負荷下の差は約1.4%**：実行Bの平均は基準40,031ms・現行40,599msで、差568ms（約1.4%）。fixtureの増加率（8,577／590,230byte≒1.5%）と同程度で、費用の大半は大型fixtureを変異ごとにtranspileModule→importする累積処理（304回、全体の約95%）にある。意味診断はいずれも1秒未満。特定の追加コードによる非線形な性能退行の兆候は観測していない。
2. **timeoutは余裕不足による境界越え**：所要時間の基底は約40秒で、60秒期限に対する余裕は約1.5倍しかない。負荷が6〜9へ上がると基準も58秒台に達し（§8のr05／r08）、現行は約1.4%の差で境界を越えうる。実行Aでもload上昇後に現行だけがtimeoutした一方、load 9.64直後の基準は42秒で成功しており、負荷との関係も単純ではない。2反復ずつの結果で特定コードの退行を断定しない点は§8.4と同じ。
3. **起動経路の差**：§8の試行はprocess group先頭が`bdo`で、基準でも58秒前後だった。本節の直接起動では40〜43秒である。同時刻の比較ではないため、経路と負荷のどちらが支配的かは切り分けていない。
4. **残る判断事項**：fixtureの増加や負荷上昇が続けば、退行がなくてもbody-liveは60秒期限を越える。期限は延長しない前提のため、変異ごとのtranspile／import回数を減らす試験設計の見直しか、このリスクを記録して運用するかは別途判断する。本修正では試験script・fixture・期限を変更していない。

再計測用の一時コピーは計測後に削除し、残存processは0、作業treeはcleanであることを確認した。
