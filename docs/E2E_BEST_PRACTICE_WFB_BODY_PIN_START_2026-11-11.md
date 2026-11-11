# WF-B C-02前半：private caller資格・一度限り開始・pin専用失敗

Date: 2026-11-11 / 基準HEAD: `a3f1f66` / 未コミット差分の合成検証。

対象は[private pin設計§13 draft-0.4](BEST_PRACTICE_WFB_BODY_PRIVATE_PIN_CONNECTION_DESIGN.md)、[生成・停止親§15](BEST_PRACTICE_WFB_BODY_SOURCE_ISSUER_STOP_DESIGN.md)、[bind親§16](BEST_PRACTICE_WFB_BODY_BIND_BORROW_DESIGN.md)。開始時の作業ツリーはクリーン。旧(B)と[C-01・レビュー修正](E2E_BEST_PRACTICE_WFB_BODY_PIN_CONTRACTS_2026-11-11.md)を維持する。正式発行口・既存C実行入口・body起動は閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。

## 実装範囲と固定停止

package除外composition fixtureの同rootに、10原始scalarと空返答参照を先行した。新factory createProbeBodyPinStartFakeは固定文字列の合成scriptだけを受け、prepare／check／checkLegacy／close／inspectの5methodを公開する。元root／source／start・summary・callbackを受け取る公開口は作らない。新しいcap／frame／owner／台帳／friend・source metadata field・receiver参照は追加しない。開発moduleのexport期待値2箇所には新factory名だけを追加し、facade・配布設定・runtime exportは変更しない。

同constructorの固定継続が既存BS→BP00〜01→C-01の検査準備を同active frame内で実行し、元root・issued=current source・同binding.target.startをprivate境界で照合する。最小同一性／元来歴を候補fieldの読取りより先に確認し、foreignは無書込みでrejected_attempt。停止／先行理由を重複より先に扱い、同source再入はin_progress／duplicate_pinのroot refusalだけを記録する。C-01の初期値検査は不変で、新しいcaller初期検査だけが正規in_progress履歴を許す。

PC01の開始はrouteAttempted=true／running／BP02／preflightと元sourceのBP02／beforeを同期直接記録する。hook・await・新carrier生成を挟まない。busyはfinallyで解除するが、開始予約は返却しない。receiver pinAttemptUsed・source利用claimとは別のsequence履歴である。PC02は元来歴／base／空storage・payloadと、source／receiverの狭い未call組をpreflight前後と最後のblocked境界で再検査する。

到達点はmodel=wfb-body-pin-start-1／pin_call_not_connected／ok=falseの**意図的固定停止**で、common first=construction_unconfirmed。root開始はacceptedでもreceiver受理・pin成功・source_pinned_unreadyではない。callBlocked=trueは最後のcallReady検査を通った診断のみ。sourceはfailed／claim unused／pinCallReached=false、receiver pinAttemptUsed=false／empty／9参照空、data・grant・duty消費・body・readyは0。固定call・格納・利用claim消費・bind・構築readyは未接続。

## 診断と所有境界

pin入口以降は専用writerがBP02／preflight／before又はafterと、identity／entry／started／preflight／blockedの詳細初回位置を保持する。確認済み元issuedだけへfailed／firstとBP02／before又はcheckedを反映し、未確認／foreign候補へ触れない。sourceの粗いboundaryはrootの詳細位置を代替しない。

生成診断のBP01／after・failureRecorded=falseとC-01 held／checked／preparationFirst=noneを保存する。build.firstは既存の共通root firstなので、生成失敗の有無はfailureRecorded／位置で読む。生成失敗ならpin診断は未開始、C-01での失敗ならその準備診断だけが成立する。失敗後closeはcacheより先に元sourceへの同期停止を行い、最初の理由・位置・開始履歴・返答同一性を保持する。開始前closeは既存仕様どおり停止のみでfirstを記録しない。保持はcleanup・解放・再利用資格を意味しない。

公開projectionは固定allowlist・strict boolean・凍結plain graphだけで、元参照／brand・任意object・raw Error／message／stack／causeを出さない。最初の理由がある状態で余分な引数を受けても元の有限診断・返答を保持する。

## RED／GREENと試験側の訂正

1. factory未実装の正常試験はTypeErrorでRED。最小の閉鎖入口とprivate固定継続の実装後、新1件＋C-01の24件が成功した。
2. entry故障、再入、closeの固定script未受付によりinput_rejectedでRED。有限scriptとpin専用失敗／同期停止を追加し、新4件が成功。その後、7境界×4modeとforeign／copy／Proxyへ展開した。
3. 最後のblocked境界でsource.boundaryだけをbeforeへ変えるcompiled対照は、期待binding_mismatchに対してconstruction_unconfirmedで失敗した。最終検査がcontextだけでphaseを見ていなかったためである。blocked点ではPC02の確認済みroute boundary=afterを保持し、最後にもcallReady全条件を再検査するよう修正した。通常経路と対照の両方が成功した。
4. foreign／copy／Proxyの7script未受付で7件失敗。合成候補を固定分岐で作り、同一性比較より先に候補hookを読まないよう接続して39件成功した。外部objectの採用口は作っていない。
5. 追加試験では早期故障script3件が未受付で失敗した。既存(B)／C-01の固定scriptだけを新factoryへ許可し、pin診断未開始のまま先行失敗を保持することを確認した。
6. 開始前closeの試験が返答参照同一・first=closedを仮定し、別の試験が存在しないsourceCreated fieldを参照していた。既存closeは未開始時に停止だけを記録するため、製品挙動は変えず、disposition=closed／first=noneとsource.state=not_createdの検査へ訂正した。その後49件成功した。
7. 旧C-01 compiledの「module全体にpin関連書込みなし」が、新たに承認されたcallerの開始／診断writerで失敗した。C-01とreceiverの禁止は維持し、CanonicalGateDraftRootの4固定methodと列挙caller fieldへの15直接代入箇所だけを明示許可した。元のruntime対照・旧assertは削除していない。
8. 新compiledのreceiver書込み禁止が、同名のroot側#bodyPinFailureStepも検出した。class scopeを区別し、rootのfailBodyPinStartだけを例外にした。receiver側の同名fieldは禁止のまま。期限・並列度・設定・旧(B)／C-01の期待値は緩めていない。

## 合成・compiledの保証範囲

Vitest49件は独立した有限prefix oracleから開始予約・資格確認・初回位置・停止を比較する。正常固定停止、7位置×故障／close／先行理由／再入、別root／source／start・同値copy・Proxy、生成／C-01早期失敗、開始前close、敵対的入力と全5methodの余分な引数を確認した。期待値に実装のbuilder／schedule／checkerをimportしない。返答cache・claim unused・空receiver・BC／grant／duty／body／ready0と、公開graphが凍結plainで500未満であることを別々に確認する。

新compiledは同sourceのscratch emitだけで実行し、finallyで除去する。次を確認した。

| 対象 | 結果／対照 |
|---|---|
| 正規root同士のforeign | root／source／startの3組。双方projection不変、各identity guard除去で見逃す対照 |
| 停止と重複の順序 | root close／source stop／root first／source stop field／source firstの5組。停止guard除去でrefused_existingとなる対照 |
| 同owner phase値 | source進行13field×4位置の52拒否。entry後は開始前state_invalid、PC02以降はbinding_mismatch |
| active／準備履歴 | frame・ready・C-01 state／phase／checked／first／failurePhase・caller確認の8拒否 |
| 再検査位置 | entry前後・PC02前後・最後のcallReadyの5呼出し。個別除去で最初の拒否位置又は最終callBlockedが変わる対照 |
| 初回診断・未確認source | 異なる位置での再fail／close後も初回位置保持。metadata未確認時はsource firstを書かず、guard除去で書く対照 |
| projection | allowlist6・strict boolean4に未知値を注入し、各除去対照でraw値／truthyが出ることを確認 |
| 物理field・負の境界 | root10scalarはconstructor前のliteral、reply参照はundefined。開始予約writerは1箇所でtrueのみ。receiver／payload／source claimへの直接書込み0 |
| 型 | private caller／qualifier／継続の外部呼出し、非法admission／step、生成phaseへのBP02を6行のsemantic compile-failで拒否 |

旧C-01 compiledのAST例外は上記callerだけで、C-01・receiver・payload・source利用claimの境界を緩めない。出力operationalWrites=0は未承認の書込み0、c02CallerWriteSites=15は許可済み静的箇所数である。これを実work・確保量へ換算しない。scratchでのprivate-slot改変は局所guard感度の確認であり、任意private-slot改竄安全性や全guardの単独感度の証明ではない。旧C-01の等価／観測不能評価を新経路へ自動移植しない。

## 検証結果

| 検証 | 結果 |
|---|---|
| 新probe-body-pin-start | 49件成功、失敗0 |
| 関連32ファイル | 2,446件成功、失敗0 |
| 新compiled-probe-body-pin-start | exit 0。foreign3・停止優先5・phase52・context8・再検査5・型拒否6・projection6／boolean4等 |
| 旧compiled23本 | 全てexit 0。C-01の13variant・351field拒否・旧生成／来歴／属性／再検査／型対照も維持 |
| composition＋新試験＋旧body7試験のstrict TypeScript | exit 0 |
| build | exit 0 |
| 全体lint（src／tests） | exit 0、error 0／既存warning 374。今回のfixture／新試験／新compiledはerror／warning 0 |
| 梱包dry-run（offline・ignore-scripts） | exit 0、441ファイル。src／tests・今回のfixture混入0。archive生成・公開なし |
| 文書・差分整合 | 更新4文書のローカルリンク40件・表23件・設計13節、末尾改行と差分空白に異常なし |

関連32ファイルは前回の31ファイルへ新probe-body-pin-startを加え、`bdo npx --no-install vitest run`へ明示した。全repositoryのVitest回帰は今回未実施。compiledは新1本と旧pin-contracts／source-issuer／storage-data-split／body-bind-fields／body-bundle／body-live／body-seed／local-exit／exit-guard／exit-preparation／grant-capture／run-preparation／frame-preparation／canonical-gate-draft／canonical-supply-construction／journal-supply-shell／writer-gate／absence-journal／capture-admission／retirement-start／pending-binding／pending-construction／declared-actualの23本を順次実行し、24本すべてexit 0だった。最後の追加対照後も新compiledを再実行してexit 0を確認した。

strictは`bdo npx --no-install tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck`にcompositionと新pin-start／旧pin-contracts／source-issuer／storage-data-split／bind-fields／bundle／live／seed試験を明示した。buildは`bdo npm run build`。lintは既存src／tests全体のJSONを集計し、最新のcompiledも個別再検査した。packは一時cacheで`bdo proxy npm pack --dry-run --json --ignore-scripts --offline`の一覧だけを確認し、cacheはfinallyで除去した。依存取得・導入・設定変更はしていない。

## 未接続と残課題

C-02後半のPC03固定receiver call・同startの試行／格納と、C-03のBP04全post／preparing閉鎖保持は未接続。PC／CP表全体・pin成功・構築readyを受入済みにしない。返却済み(B)／C-01 rootや公開summaryからの再開口はない。source利用claim・payload borrow／bind・BC00・body起動・Journal供給・正式証拠・実予算更新も接続しない。

実allocation／layout・実E／S／unit係数・全guard数／全体work・停止後解消予約・OOM時の診断必着はUnknown。正式発行口閉鎖・全体受付無効・調査保留を維持する。実接続・実通信・実機操作・設定変更・index登録・コミット・Pushは行っていない。

作業中差分は合成fixture・新49件・新compiled・旧C-01 compiledの限定AST更新・開発export期待値2箇所・CHANGELOG・設計3文書と本記録の11ファイルだけ。src・manifest／lockfile・TypeScript／配布設定はHEADから変更していない。これは未コミット作業内容の検証であり、コミット対象だけを別コピーで確認した記録ではない。

## コミット対象だけの隔離再検証（2026-11-11）

上記は実装時の記録。本節は、その後のコミット依頼に対する再検証である。基準HEADは同じ`a3f1f66`。対象11ファイルだけを明示してindexへ登録し、indexの全内容を一時フォルダへ展開した。全1,513ファイルのGit blob hashがindexと一致し、他の未登録変更を含まないことを確認した。既存node_modulesへの参照だけを再利用し、依存取得・導入・設定変更は行っていない。

隔離フォルダでbuild・上記9入力のstrict TypeScriptがexit 0、関連32ファイル2,446件が成功・失敗0、新旧compiled全24本がexit 0だった。全体lintはerror 0／既存warning 374、今回のfixture／新試験／compiledはerror・warning 0。build成功確認後のoffline・ignore-scripts梱包dry-runは441ファイル、src／tests・今回のfixture混入0で、archive生成・公開なし。文書4件のローカルリンク40・表23・設計13節・改行と差分空白にも異常はなかった。全repositoryのVitest回帰は今回も未実施。

再検証後の追加変更は本節の記録だけで、ソース・試験は検証済みindexから変更していない。更新した本記録もindexから隔離フォルダへ再展開して文書検査と全ファイル一致を再確認する。コミット対象は同じ11ファイルに限定し、正式発行口閉鎖・全体受付無効・Unknown・調査保留、固定call以降未接続を維持する。実接続・実通信・実機操作・設定変更・Pushは行わない。
