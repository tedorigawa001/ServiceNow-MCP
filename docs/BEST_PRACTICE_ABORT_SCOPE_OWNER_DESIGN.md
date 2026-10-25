# AU-BR-006：証拠生成owner・一度限りの消費の詳細設計

Version: br006-scope-owner-draft-0.1 / Date: 2026-10-25。
Status: **合成issuerのみのowner/session claim・3phase・証拠生成/純粋比較器接続を実装。実取得・worker/MCP接続・人による採用承認は未実施**。
親は[スコープ証拠設計draft-0.2](BEST_PRACTICE_ABORT_SCOPE_EVIDENCE_DESIGN.md)。既存の内部型/純粋比較器は変更せず、明示14規則・既定3規則・公開JSON・取得先・運用設定を維持する。

## 1. 現状との差分・保証の範囲

現行abort-scope-evidence.tsのfactoryは構造検証と同一contextへの結合を行うだけで、実認証session・worker・取得元を証明しない。純粋比較器は繰り返し可能で、終了/取消を自ら検出しない。JSON/structuredCloneしたhandleは別realmのWeakMapへ移せない。

本案は、それらの外側で「誰が発行できるか」「どの資産のどの実行か」「一度だけ完了を受け取るか」を管理する。比較器をstatefulにせず、**ownerだけが発行する非公開の完了証拠を上位callerが受理する**構造にする。

信頼するのは固定ローカル実装のadapter/bounded source/worker。レビュー対象のJavaScript/XML、MCP引数、HTTP応答はデータとして扱う。sourceタグ・一致するhash・TypeScriptのbrandやnonce単独を認証証明としない。悪意ある同一process内コードや改変された実行基盤を隔離する仕組みではない。現行の純粋部品だけで本案の保証が成立したとは扱わない。

## 2. 発行元と所有権

| 所有者/部品（提案名） | 保持・発行できるもの | 禁止する入口 |
|---|---|---|
| `ScopeEvidenceRunOwner`（親process） | 既存adapterが実際に作ったBoundedReadSession、同じBoundedUpdateSetSourceとmatchedのReleasePermit、worker実体/世代、選択資産のprivate台帳 | URL/token/認証主体/任意sourceをMCP引数から受けて生成すること |
| `ScopeEvidenceAssetJob`（親ownerのprivate子） | 同一runの選択行・取得済みpayload受領物・worker要求・初回/最終観測の進行 | callerが任意sys_id/hashで新jobを作ること、処理済み行の再登録 |
| worker内のasset owner | 当該jobの安全抽出/AST計画、processローカルcontext・payload/table handle、比較の一度限りの試行 | 外から送られた「verified」「scope_match」やclone済みhandleを採用すること |
| 固定bounded sourceの観測issuer | 固定GETの受領・再照合結果。HTTP応答自体は未検証データで、identity/件数/版検証後にのみ渡す | 一般client/別session/別認証の応答を同じ証拠として渡すこと |
| 親ownerのcompletion issuer | validated child応答と親のactive/bindingを確認したローカルな完了証拠 | 生JSONの比較結果だけを上位へ「正式結果」として渡すこと |

run ownerのconstructor/発行関数は固定adapterからだけ到達する内部境界に閉じる。実session・source固有permitの所有関係を確認し、WeakMap等のsession側claimを**生成に先立って**消費する。sessionのフィールドが同じという比較だけでは受理しない。claimは失敗/close後も同じsessionで再取得できず、sessionのGCまで再生成拒否を維持する。

現行の自由に呼べるfactoryを本番経路へそのまま露出させない。将来はowner実装のprivate発行部品に閉じ、合成fixture用の入口はproduction接続から到達不能にする。開発用の直接比較が残っても、その出力にはowner完了証拠がなく、上位callerは受理できない。export削除/テストfacadeの具体的分離は後の実装で確認する。

## 3. session／worker job／資産への結合

親側で次をprivateに固定し、可変のclient設定を処理中に再読しない：

- 同じBoundedReadSessionの参照、認証snapshotの内部identity、instance binding、source参照・ReleasePermit。認証tokenやprincipal hashをworker/結果へ送らない。
- 親が実際に起動/選択したReviewWorker実体と、その起動世代。URLやthread IDの数値一致だけで同一workerとしない。
- update_set/update_xml/asset ID、一覧/詳細の版、sourceが受領したpayloadと要求の私有対応。別の行/資産/再取得版へ付け替えない。
- workerが当該payloadから計算したpayload/code hash、collection・payload scope・構文計画の識別子。callerの自己申告hashやbooleanを採用しない。
- session由来のstartedAt・remainingMs・外部signal。既存の全体期限を上書きする時刻/timeout引数を作らない。

選択行につきasset jobは1個。jobの開始claimを生成前に取り、失敗後も同じ行の新jobを自動作成しない。HTTP内部の最大1retryは同じphaseの予算付き試行であり、新job・新証拠世代ではない。payloadの版/所属が変わったら新しい値でこっそりやり直さない。

親のpayload受領物とworkerへの要求をprivate identityで結び、hashは固定workerの安全抽出結果から得る。workerとsourceの対応を確認せずに、hashだけを一致させて「実取得済み」と認定しない。

per-userの認証キーは現在token更新を跨ぐ安定した人間IDではない。本案もそれを本人性の追加証明へ昇格させず、当該sessionのsnapshot同一性だけを扱う。

## 4. realmを跨ぐ固定bridge

**親のローカルhandleをworkerへpostMessageしない。workerのhandleも親で再利用しない。** 親/子は各々のrealmでprivateな台帳とhandleを持つ。現行ready/analyze/finishだけのprotocolは本機能には不足するため、以下は追加設計であって、現行コードで実現済みではない。

1. 親が固定workerを起動し、既存ready検査を経て、本機能の世代handshakeを完了する。親はworker実体とportを登録し、失敗時は証拠を発行せず終了させる。
2. prepare要求は選択・取得済みのpayloadだけを渡す。子は同jobのsource/識別/hashを検査・計算し、コード本文を返さずboundedな計画応答を返す。
3. 親は計画と自身の取得台帳を結合し、同じsession/sourceから得た初回/最終観測を固定messageで渡す。これは任意HTTPデータの「署名」ではなく、信頼する親から子への供給経路の限定である。
4. 子は検証済みの同jobにだけローカルcontext/handleを生成する。観測は初回・最終それぞれ1回だけ受理する。固定のunavailableもphaseの受領として記録するが、既知scopeへ補完しない。
5. consume要求で子の利用claimを消費し、比較器を1回呼ぶ。strictに検証した比較結果だけを応答し、純粋handleは返さない。
6. 親は同じ世代/要求/asset jobへの応答を1回だけ受理し、active確認後に親ローカルのcompletionを発行する。上位callerはこれを一度だけ消費して結果を格納する。

message envelopeはprotocol版、親が生成するrun/worker-generation nonce、run内のasset job番号、単調増加のrequest番号、固定kindとstrict payloadを持つ案。nonceは内部生成・非ログ化し、権限tokenとしてMCPへ渡さない。**nonce一致だけでは不十分**で、登録済みの実worker/port・未解決要求・owner状態・対象bindingとの一致をすべて必要とする。ユーザー指定のworkerFactoryやmessage callbackを公開入力へ加えない。

1つのworkerで同時未解決要求は1つとし、要求番号の再利用/巻戻り/安全整数overflowを拒否。次のkindだけを期待して受理する。messageは受信前後のbyte上限・追加キー/件数/文字列上限・残期限を検証する。応答サイズは既存262,144 bytes以下、計画/観測は選択100行・候補100・table8名等の親設計内に抑える。詳細schemaと下位byte枠は実装前に固定する。

遅延・重複・不一致・未知kind・非結果応答は成功として無視しない。activeなprotocol不整合はrunを停止させ、終了/失効済み世代のlate応答は破棄する。messageを別workerへ再送して救済しない。固定workerのコードは信頼前提であり、チャネル確認でOS侵害や悪意あるworkerを安全にするとは主張しない。

## 5. 状態遷移と意味

runは`active → closing → closed`、または`active → failed → closing → closed`。一度failed/closingへ入ったらactiveへ戻らない。下表はasset jobの提案状態。

| 状態 | 次に許す操作 | 成功時 | 失敗/取消時 |
|---|---|---|---|
| reserved | 同bindingのprepareを1回だけ開始 | preparing | failed |
| preparing | 期待する同worker応答だけ受理 | prepared | failed |
| prepared | 同sourceの初回観測を1回開始/受理 | initial_received | failedまたは固定unavailableを受領 |
| initial_received | 同sourceの最終観測を1回開始/受理 | ready_to_consume | failedまたは固定unavailableを受領 |
| ready_to_consume | consume claimを取得し比較開始 | consuming | failed |
| consuming | 同requestの比較応答を1回受理 | consumed | failed |
| consumed | 親completionを上位で1回消費、保持物を解放 | closed | 診断を保持してclosed |
| failed | 後始末・診断の受渡しのみ | closed | closedのまま |
| closed | 固定の拒否/保存済み診断の参照のみ | 遷移なし | 再開しない |

取得/待機中は各状態にprivateなpending phaseを持ち、初回/最終の二重開始を拒否する。`initial_received`や`ready_to_consume`は「そのphaseの結果が揃った」という意味で、観測が成功/known/same scopeという意味ではない。unavailableも順序を前に進めて比較器に渡し、比較結果はinsufficientになる。401/403・全体期限/取消をunavailableへ変換する経路は設けない。

table cacheは同runの原観測を共有するだけ。別資産のhandle/contextを共有しない。将来のownerは共有観測の時刻/版・同じ認証を保ったまま、各asset jobのcontextへ1回ずつ結び直す。後続payloadの取得が初回観測より後でも、最終観測は両方より後でなければならない。cacheから旧runの観測を持ち込まない。

## 6. 一度限りの消費と失敗後の再利用拒否

利用状態は**estimateや結果の一時値ではなく、run/asset jobのprivate台帳**に保持する。単なるTypeScriptの型移動やcopy可能なboolean/JSONだけに依存しない。

- consumeの入口で同owner/jobを確認し、最初の試行をstickyに記録する。binding・状態・期限等の後続検査に失敗してもclaimを戻さない。比較器がinsufficient/changed/rejectedを返した場合も、再比較で都合のよい結果を探さない。
- 二度目のprepare/初回/最終/consume、別context・別worker世代での利用は拒否する。protocol不整合ならrunをfailedとし、他の新job開始も止める。過去の失敗を消して別job番号で同じ行を登録し直さない。
- 純粋比較器自体は従来どおり繰り返せる。直接比較の結果をownerが受理したという完了証拠にはできない。上位格納はowner発行の非公開completionだけを受け付け、生の同形JSONは拒否する。
- childの比較応答はwire上のデータであって親realmのcapabilityではない。親がactiveな実worker/要求との対応を検証してから、親ローカルのcompletionへ変換する。completionはcopy/clone/別owner持込み・二重格納を拒否する。
- 取消とconsumeが競合したら、親はまずrevoked/closingを同期的に立ててから中断する。消費開始後でも、受理時に失効していた応答からcompletionを発行しない。既に上位へ格納済みでも、呼出し全体の取消/期限失敗は既存BP-5契約に従う。

親/子のclaim取得と結果公開の間に非同期待機があるため、dispatch前・応答受理時・completion格納前にactive/世代/期限を再検査する。失敗後に自動retryするのは許可されたHTTP試行だけで、owner/worker処理のretryではない。

## 7. 終了時失効・解放・worker再起動

終了はidempotentにし、失効を解放の**前**に行う。責務は次の順。

1. runをclosing/failed、世代と未消費completionをrevokedにする。新job・発行・消費を直ちに禁止する。
2. pendingのHTTP/worker待機を中断し、固定session/sourceの所有者へ既存の取消を伝播する。late応答が後段へ流れないよう要求台帳を閉じる。
3. 子へ破棄を通知する場合もそれを無期限に待たず、既存supervisorのworker終了処理・残予算を使ってterminate/exitを確認する。
4. source/workerのraw payload・観測cache・handle/contextへのowner参照、pending callback/listenerを解放する。親のtokenは子へ渡さず、既存session.closeが資格情報snapshotを破棄する。
5. 固定理由の診断と二重利用拒否に必要なterminal状態だけを残す。同じsessionに対する生成claimは解除しない。同時実行枠の解放は既存のsession/worker所有責務に従い、二重に解放しない。

純粋handleそのものが自動で無効化されたとは扱わない。現在の比較器にはrevoke機能がなく、参照が残れば直接比較は可能だからである。**失効するのはownerの受理/発行/格納権限**であり、後段は必ずowner状態/receiptを検査する。公開pipelineからhandleを持ち出させず、主張をGCによる消去や物理的なゼロ化保証に依存させない。JS文字列の確実なメモリ消去は保証しない。

worker終了・再起動時は世代を必ず変え、古いjobを新workerへ移植しない。soft deadline後に集約専用workerを新起動する従来経路でも、BR-006の証拠発行/再比較を再開しない。既に消費・検証した本文なしの結果を従来の集約へ渡す範囲に限定する。未完了jobは理由付き未処理にする。

## 8. 診断保持と上位停止

ownerは最初の失敗のstageと固定codeをprimaryに保持し、cleanup失敗・二重利用などは件数上限付きsecondary診断として保持する案。後のcloseでprimaryを書き換えない。成功済みの比較観測を過去の失敗と混ぜて「成功」にしない。

| 事象 | 提案扱い |
|---|---|
| 偽造/別owner・session・asset・hash・世代、順序違反 | fixed binding/state/protocol failure、run停止、claimは使用済み/失効のまま |
| scope不足・Global alias未証明・最終観測不能 | 比較が正常にinsufficientを返したなら1回の消費完了。ただしBR-006未評価/partialへ接続し、knownへ補完しない |
| 観測変更 | changed/unknownを1回消費。暫定候補を撤回する方針を維持 |
| 認証/ACL・全体予算/期限・取消 | 既存の全体停止を維持し、証拠不足やowner再生成で迂回しない |
| worker起動不能/exit・不正応答・終了未確認 | 固定理由で停止。新workerによる同jobの再開を禁止し、終了/解放の未確認を隠さない |
| closeの再呼出し/late応答 | 新しい結果を発行せず、保存済みprimary診断を上書きしない |

raw payload・HTTP/worker原例外・stack・token・nonce・認証identityは診断/一般ログへ流さない。次版結果契約へ載せるstage/codeの列挙と、cleanup未確認の上位表現は実装前に固定する。比較結果を単に捨てる/例外文字列だけに潰す設計にはしない。

## 9. 期限・件数・追加費目

全処理は同じrunの60秒に含める。owner専用の新しい60秒timerや、worker再起動で期限を作り直す処理は禁止。実時間の停止はsession.remainingMs/既存supervisor/signalから得て、比較器へ渡すISO時刻は内部生成する。壁時計の逆行/矛盾を時刻の切詰めで救済せず停止理由を残す。

payload取得・prepare/計画・初回観測は既存の通常phase内、最終観測は照合phase内、completion/集約/終了は残予算内。50/55秒の境界を延長しない。8table・証拠16KiB/256KiB・R(T)=4+2T・全体210試行の追加会計は親設計の**未承認提案**のままで、ownerの作成によって有効化しない。

run claimは1/session、asset jobは選択100行以内、構文計画は100候補以内、table cacheは8名以内という親設計の範囲で保持する。IPC要求のstate/binding検査と計画・結果の保持も有界にし、無制限の待機queue・失敗履歴・nonce台帳は作らない。具体的なIPC/control費目・byte枠・secondary診断上限は、実装前に合成計数で固定する必要がある。

## 10. 合成検証・実装順・未決定事項

最初は**合成issuerのみ**でowner/claim/診断を実装する。合成session/source/workerでの結果を実認証・実取得の証拠へ昇格させず、MCP登録・Table API許可先・本番取得への接続を同時に行わない。

必須試験：

- 同sessionの重複owner、別session/permit/source/worker/世代/asset/hashの混入、同値scalar/cloneの拒否。
- prepare/初回/最終/consumeの順序と二重開始、検査途中の失敗後の再利用拒否。insufficient/changedも二度消費できないこと。
- arbitrary factory/純粋比較の出力や、同形JSONだけでは親completion/上位結果にならないこと。
- worker境界のplan/resultの追加キー・上限・job/要求番号/nonce違い、重複・遅延・順序逆転・restartの拒否。
- 取消とconsumeの競合、応答直前/直後の期限切れ、close中のlate応答、cleanup失敗時のprimary診断保持。
- 終了後の生成/発行/消費・cache再利用拒否、同じsessionでの再生成拒否、終了処理のidempotenceと解放が一度だけであること。
- 親/子の出力・ログへ秘密/コード/内部identityが出ないこと。旧14規則・JSON・固定評価セットの互換性。

実装前の残決定：private factory/合成facadeの分離、workerのstrict envelope/世代handshake・段階schema、completionの上位保持契約、control費目/byte上限、終了未確認の表現。これらを決めずにboolのone-shotだけを追加して接続しない。

その後にbounded取得の予約/下位受信上限、固定GET/再読、構文計画・次版JSONを順に接続する。実機確認は別途承認が必要。本書作成では実装・schema/fixture生成・実機操作・トークン発行・設定変更・Pushを行わない。VM/監視/telemetry調査は保留、Unknown・全体受付無効、本番cap/完成parts/permit非発行を維持する。

## 11. 今回の限定実装

`abort-scope-evidence-owner.ts`は合成issuerごとに隔離したWeakMap台帳を持つ。sessionに唯一の生成claimを置き、worker結合検査より前に消費する。ownerは合成session・worker実体と結合し、jobは同じsession/workerと選択assetに結合する。別job番号で同assetを再登録しても拒否する。use/receiptの一度限りの消費と、失敗・取消・owner/session終了・worker終了後の受理拒否を実装した。closeはidempotentで、最初の終了事由（未検知のworker終了/session終了を含む）をprimary理由に固定し、後のclose/取消で書き換えない。job発行/予約は100件以下。

これは状態機械の**基礎subset**であり、実時計/期限/signal、privateな実取得issuer、実payload/hash/ReleasePermit結合、worker通信・実解放・上位結果ownerへの接続は未実装。従来の状態遷移用receiptには比較結果もscope証明もなく、本番完了証拠ではない。§13で別型の合成比較receiptを追加したが実認証の証明にはしない。合成issuerは呼出し側が自由に作れる。worker handleの差が合成の世代差を表し、実worker世代handshakeは行わない。新moduleも既存の`!dist/review/abort-scope-evidence*`によりnpm非同梱。

検証は[合成owner検証記録](E2E_BEST_PRACTICE_ABORT_SCOPE_OWNER_SYNTHETIC_2026-10-25.md)を参照。VM/監視調査保留・全体受付無効を維持する。

## 12. 合成phase遷移の限定実装

利用台帳に`reserved → preparing → prepared → initial_pending → initial_received → final_pending → ready_to_consume`を追加した。各phaseは固定begin/finish関数の対でのみ進む。beginは非同期作業を始める前にpendingを固定し、owner/use/job/phaseに結合した不透明な票を発行する。finishは票を消費してから残りのjob/phase整合を検査し、失敗しても戻さない。clone・別issuer・別job・違うphaseの票を拒否する。票は最大3枚/jobで、同asset100件上限を維持する。

consumeは`ready_to_consume`だけを受理する。順序違反・二重開始/完了・早すぎるconsumeはownerをstickyに停止し、他の未完了jobも再開できない。`failPhase`は有効なpending票を一度だけ消費して`phase_failed`をprimaryに保持する。後のclose・取消・再試行でprimaryやsession claimを戻さない。終了後のlate finishも受理しない。

従来のphase-only finishは**合成phaseの完了通知だけ**で、観測値や成功/known scopeを証明しない。§13の証拠付きfinishとは区別し、phase-onlyのreadyだけで比較結果を発行しない。401/403等をunavailableへ変換する実経路もなく、実source/issuerとの接続は今後の課題。実clock/signal・IPC世代handshakeは未接続のまま。

検証は[phase検証記録](E2E_BEST_PRACTICE_ABORT_SCOPE_PHASES_SYNTHETIC_2026-10-25.md)を参照。

## 13. 合成issuerから純粋比較器への接続

`finishPrepareEvidence`は同owner/jobのprepare票を消費し、strict context/payload factoryを内部で呼ぶ。contextのassetを選択jobへ結び、payloadのasset/hash/code hashを同contextへ照合する。context/payload handleを外へ返さない。続く`finishInitialEvidence`/`finishFinalEvidence`は同じ利用台帳のcontextで観測handleを生成し、生データのphaseも固定phaseと照合する。入力スナップショットは既存factoryの正規化に従い、外側の観測fixtureを後で変更しても影響しない。

これは**合成fixtureの構造/対応の検査だけ**。contextのinstance/update-set/update-xml/hash/時刻は合成callerの入力で、実session/sourceが実測/発行した証明ではない。実コード本文を取得せず、hashを本文から計算したとも主張しない。

`compareAndConsume`は従来consumeと同じuse claimを消費する。final完了とpayload/初回/最終の内部handleが揃わなければ停止し、比較器は呼ばない。成功時も不足/変更時も一度だけ比較し、別型`SyntheticScopeComparisonReceipt`を返す。`acceptComparison`は同owner/active/未消費を確認してから本文なしの凍結比較結果を一度返す。従来のreceipt・clone・直接比較のJSONは比較receiptとして受理しない。

factory不正は`evidence_invalid`、証拠不足は`evidence_missing`、job/asset/hashの不一致は固定binding理由でowner全体を停止する。比較器の`rejected`はその固定reason（時刻/期限整合・table binding等）をprimaryに保持し、修正入力による再試行は拒否する。比較器の`insufficient`/`changed`は正常な一度の比較完了だがUnknownのまま。認証/ACL/取消/期限停止をunavailableへ変換する文字列は受け付けない。

消費時は内部証拠を台帳から外し、失敗/close時もownerに属する証拠参照を削除する。後で票が残っていてもowner検査で受理しない。物理ゼロ化や実resource解放の証明ではなく、純粋handleの直接比較の性質も変更しない。実通信や実時間中断は未接続。

検証は[合成比較接続記録](E2E_BEST_PRACTICE_ABORT_SCOPE_COMPARISON_OWNER_SYNTHETIC_2026-10-25.md)を参照。
