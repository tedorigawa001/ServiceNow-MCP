# CP00からCP05の部分生成回収の検証記録

Date: 2026-11-16。基準HEAD: `1707e8d`。設計：[部分生成回収とJoinCell生成公開 draft-0.2](BEST_PRACTICE_NATIVE_DIAGNOSTIC_CONSTRUCTION_JOIN_DELTA_DESIGN.md#11-cp00からcp05の限定実装)。

## 実装した境界

[旧root](../src/review/abort-scope-evidence-native-diagnostic.ts)内のprivate allocateとinitializeに分けた。RecoveryAnchorへstate creatorの返却物・writer・失敗専用facadeを順に保持する。facadeを保持してから旧準備の6object、strict raw、正常aggregateを構築し、freeze後の最終同owner検査が通った場合だけprivate readyを確定する。保持直後・次のfreezeより前に14値の固定checkpointを更新し、参照prefixとともに保持する。可変traceは追加しない。初期化claimは失敗後も戻さない。

既存primary／revoked／sealed／phaseは正常継続と同じclosureの1組で、部分生成失敗を先に原始値へ固定する。その後に同upper reject／stop、既存の固定bridge stop通知、seal／copyを個別のtryで一度ずつ進める。通知throw／再入でも同anchorと先行理由を失わない。正常snapshotへfallbackせず、停止・seal・理由整合を確認できたcopyだけを保持して返す。

copy不能は固定internal_review_errorで拒否する。close／execute／diagnosticsを再度呼んでも、copy・seal・初期化を再試行しない。部分参照は保持し、未取得のHTTP／cleanup／teardownへno_bodyやconfirmedを補わない。bootstrapのanchor／upper／facade未成立、state creator内部の未返却物、OOM／process終了の完全回復は保証しない。

ND-03のfake driverは同facadeを先に保持してからinitializeし、ready不成立なら固定エラーでbeginを終了する。公開stopは引数なしの取消、内部driverは元code付きstopで、同じ口として扱わない。外側closeとdisposeを独立finallyにし、disposal claimを先に消費する。bytes.fillの失敗を繰り返さず、先行HTTP／構築理由をcleanup異常で上書きしない。実class側のsession close／予約返却は既存の別責務のままである。

runPending／cleanupPendingはnull、既存の空JoinCellはreadonlyのままである。active JoinCellの生成・公開・dispatch、CP06、新LM03、正式発行口／C実行入口／body起動は未接続・閉鎖。全体受付無効、Unknown、通常経路未切替、VM／監視／telemetry調査保留、LOAD6／LOAD7とAP01〜06未承認を維持する。実接続・実通信・実機操作・設定変更・コミット・Pushは行っていない。

## 合成対照と保証範囲

[新source試験](../tests/review/native-construction-recovery.test.ts)は7件。実constructorのorigin freeze失敗、copy生成失敗と再試行拒否、実class／fake I/Oのbegin失敗、close拒否下のbytes破棄、dispose失敗時の先行HTTP理由保持を確認する。これらは新しい製品故障引数でなく、試験内だけの固定freeze／fill故障を使う。spyは試験のfinallyまたはafterEachで戻す。

[固定oracle](../tests/review/fixtures/native-construction-recovery-model.mjs)はsourceの出力JSまたは固定distから実際のallocate関数・strict data関数を抽出する。回収anchorの試験側観測と故障挿入をscratch copyに限定し、製品export／登録口／callback引数は追加しない。この抽出試験の私有参照確認と、実constructor／driverを呼ぶ連続試験は別保証として集計する。

| 対照 | 確認内容 |
|---|---|
| 24固定条件 | bootstrap 5、6準備object・正常aggregate・identity・upper reject／stop・seal／copy・停止／close再入の14、余剰の回収／初期化／bridge／join入力5。固定理由・同owner保持・部分prefix・copy再試行拒否 |
| 通知再入 | 同bridge stop内で同facade.stopへ再入し、その後throw。通知は1回、元理由と同copyを保持 |
| 最終同owner post | 正常aggregateのfreeze直前に試験側でholder rootをcopyへ差替え。ready=false、evidence_binding_mismatch、dispatch 0 |
| JoinCell閉鎖 | 抽出関数のcaptured Pを試験用拒否constructorに置換し、明示的生成呼出し0。run／cleanupの新pending slotはnull。APIのasync wrapper Promiseとは区別 |
| 6変異 | copy再試行許可、先行理由上書き、保持代入欠落、seal省略、通知省略、構築post欠落を拒否。全変異は構文正常、拒否はoracleのAssertionErrorで確認 |
| 公開面 | 4export・4methodと引数なしpublic stopを維持。RecoveryAnchor／private allocate／初期化／failure処理は宣言に出さない。新setter／adoption／policy口なし |

state creator復帰前の内部部分生成物を、scratch観測で製品の回収済みとしない。partial参照の保持はnative cleanupの成功ではなく、slot／Promise／診断の終端も全解放の証拠ではない。CJ01〜14の全組合せを完了した結果ではない。

## 初回失敗と切り分け

| 段階 | 観測と対応 |
|---|---|
| 先行RED | origin freeze失敗がPRIVATE_CONSTRUCTION_SECRETを外へ漏らして1件失敗、exit 1。保護区間と失敗facadeを実装後に同対照が成功 |
| 初回接続回帰 | 3file・93件中91成功／2失敗。公開stopが引数を無視する新facadeを内部driverにも使い、receive_budget_exceededがcancelledになった。内部code付きstopをprivate controllerへ分離し、旧期待値を変えず94件成功（追加対照1件を含む） |
| 型検査 | failureCodeが内部invalid_observation_timeを実class向けcode型へ返し、2診断でexit 2。既存bridgeと同じinternal_review_errorへの写像を固定し、型を広げず解消 |
| 故障挿入の初回 | 出力JSがtry／statementを改行し、source形式の文字列anchorが0件で拒否。製品を変更せず、固定failure関数内の一意な文へ限定した |
| 変異対照の初回 | 同様に複数文を一行としたanchorが0件で拒否。7件中6成功／1失敗、関連全体では229件中228成功／1失敗。同関数内の文へ限定後、構文正常な6変異をoracleが拒否 |

後ろ2件は試験側のdrift検出であり、製品退行やtimeoutとは分類しない。最初の停止理由の退行は製品側の変更不備として修正し、旧試験・期待値を維持した。期限や並列度は緩めていない。

## 最終検証

commandはすべて`bdo`経由。worktreeで実施し、コミット対象だけの別展開検証ではない。

| 検査 | 結果 |
|---|---|
| `npm run build` | exit 0、既存tsconfigで実行 |
| `npm run type-check` | exit 0 |
| 変更3 TS fileのESLint | exit 0。リポジトリ全体lintではない |
| 関連source 8file | 229件成功・exit 0、1.11秒。旧222件＋新7件。元5秒・既定並列度を維持 |
| 新compiled回収fixture | exit 0。24条件・通知／最終owner対照・構文正常な6変異・実constructor／実class fake begin失敗を確認 |
| 既存compiled 6本 | 空準備、VK01／02、BG01、旧ND-01／02／03すべてexit 0。各直接実行は外側60秒の上限内 |
| 新旧`.mjs`構文4file | model／compiled回収とmodel／compiled空準備がexit 0 |
| offline梱包dry-run | ignore-scripts／offline。441file・436 runtime artifact、対象7fileの非同梱・3markerのruntime参照0、10負対照を拒否 |

旧空準備のsource／compiled probeはprivate初期化位置への追従と、同じstate／writerを用意するsetupだけを更新した。27拒否・9変異・6prefix・semantic型拒否の期待値は維持した。旧workflow・実class fake連続試験の期待値は変更していない。

基準HEADと構文位置で比較し、data／sample／observe／wait／clean／eligible／guard／consume／issue／snapshot／execute／closeの12関数本文が一致した。旧run／cleanup joinのdispatchは従来どおりで、新JoinCellへ接続していない。停止通知だけは同旧root内のprivate継続へまとめ、4つのbridge呼出し責務を残した。state／facts kernel・実class・build／package／Vitest設定の変更はない。

設計3文書と本記録のローカルリンク38件・表23個に、参照先欠落・列数ずれはない。末尾改行と差分空白も確認した。差分は旧root、試験5file、CHANGELOG、設計3文書、本記録の計11fileだけで、コミットはまだ行っていない。

## 残課題

全体回帰、HTTP pack全体、実tarball生成／展開、専用U/D/I/H artifact、新childのstdio／終了契約は未検証。梱包確認はdry-runで、本番artifactのfriend撤去や実transportの保証ではない。

JoinRuntimeの段階型と同Promise／settler生成・private公開、dispatch／entry／settle、実resourceとの新結合は次工程。bootstrap未成立、copy不能、未確認prefixの寿命と外側custody／最終discard、旧UN62移行・新LM03・friend撤去・AP承認は残る。回収anchorの保持を全解放・正式binding・公開可へ昇格しない。

## コミット前の対象限定再検証 2026年11月17日

今回の11fileだけをstageし、index全体を別の空directoryへ展開した。既存dist／`.git`は持ち込まず、導入済み依存だけを参照した。build・型検査・対象3 TS fileのlintはexit 0、関連8file・229件が成功（1.67秒）。新回収と既存空準備／VK01／02／BG01／旧ND-01／02／03のcompiled計7本、新旧`.mjs`4fileの構文検査もexit 0だった。offline梱包dry-runは441file・436 runtime artifact、対象7fileの非同梱・3markerのruntime参照0、10負対照拒否で成功した。設計3文書と本記録のリンク38件・表23個も欠落／列ずれ0。元の期限・並列度、JoinCell生成／dispatch未接続と各閉鎖条件を維持する。再検証後の変更は本節だけで、実装・試験入力は変更しない。全体回帰・実tarball展開は未実施のまま、Pushは行わない。

## レビュー修正 2026年11月17日

基準HEADは`75b5d02`。旧入口の構築時raw不正（余剰key・deadline超過）もfailure facadeへ送るため、execute前のdiagnosticsがprepared／未sealedからclosed／sealedへ、初回executeのteardownがconfirmedからnot_startedへ、再executeの`request_rejected`がinvalid_stateからnullへ変わる。既存試験は`primary`・counts中心で通っており、本記録の「旧workflowの期待値は変更していない」はこの公開差分を含まなかった。未実行のself-teardownをconfirmedと報告しない意図した差分として[設計draft-0.3](BEST_PRACTICE_NATIVE_DIAGNOSTIC_CONSTRUCTION_JOIN_DELTA_DESIGN.md)§4・§11へ明記し、製品コードは変更していない。

source試験を3件追加した（計10件）。raw不正2種で同copyへの終端とexecute／close再入の同参照、停止通知（実classのsession stop）が1回throwしてもND-03 beginがready不成立で終了しreserve／request 0となること、正常aggregate生成後にcopyが作れない場合も正常snapshotへfallbackせず固定拒否しcopy試行1回であることを確認する。追加前に、修正前ソースでは3件とも失敗し、beginのready検査削除と正常snapshot fallbackの各変異でも対応する1件が失敗することを確認した。

| 検査 | 結果 |
|---|---|
| lint・型検査・build・HTTP pack | exit 0 |
| Vitest全体（`--maxWorkers=3`） | 359file・18,854件成功・失敗0 |
| compiled probe群・declared-actual・migration・native 8本 | すべてexit 0 |
| compiled比較 | inconclusive（control_deadline、load avg 7〜9）。ND moduleを読まない比較で、成功には数えない |

copy内`sealed`検査と初期化claimの削除は、sealが`sealed=true`かthrowのどちらかで、初期化が各入口で一度だけ呼ばれるため等価変異として残る。distでbegin検査・disposal claimを外す変異はcompiled fixtureでは検出されず、source試験だけが検出する。全体受付無効・正式発行口閉鎖・JoinCell未接続などの条件は変えていない。
