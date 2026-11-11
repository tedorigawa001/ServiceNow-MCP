# WF-B 固定private call・同owner receiver入場の合成検証

Date: 2026-11-11 / 基準HEAD: `9f4361c` / 未コミット差分の検証。

対象は[call／receiver設計§15](BEST_PRACTICE_WFB_BODY_PIN_CALL_RECEIVER_DESIGN.md)、[private pin親§17](BEST_PRACTICE_WFB_BODY_PRIVATE_PIN_CONNECTION_DESIGN.md)、[bind親§19](BEST_PRACTICE_WFB_BODY_BIND_BORROW_DESIGN.md)。開始時はクリーン。前段の[bridge検証記録](E2E_BEST_PRACTICE_WFB_BODY_PIN_BRIDGE_2026-11-11.md)と旧試験を保持する。正式発行口・C実行入口・body起動閉鎖、全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。

## 今回の境界

同package除外composition fixtureへcreateProbeBodyPinCallFake／wfb-body-pin-call-1を追加した。固定scriptだけを受ける凍結5methodで、任意object／callback・外部root／source／start・公開診断からの昇格口はない。開発moduleのexport期待値2箇所へ新factory名だけを追加した。runtime／facade export・src・配布設定・lockfile・期限は不変。

既存同constructor・同prepare・同active frameのPC02／bridge最終確認後だけで新modeを分岐する。旧factoryは元の固定拒否・期待値を維持し、返却済みrootを再開しない。callerでidentity-firstの元組照合、停止、重複、PC02／strict falseを確認し、tryを用意してから直接8代入→同startへの固定callを行う。この同期区間にscript・hook・guard・value view生成・awaitを挟まない。flagだけ立ちcall未実施という故障checkpointを追加しない。

receiverはidentity→停止→既存busy／attempt→active・初期fieldの順で拒否を決める。正規entryだけbusyをtrueへし、自分のtry内でpreflight前後の固定検査→step attempt／attemptUsed=true／stage attempting→全attempting検査まで進む。そこでreceiver_unconfirmedを記録してrejected_attempt、参照格納前で固定停止する。caller finallyはcallActive、receiver finallyはentryBusyだけをfalseへ戻す。call flag・試行・stage・診断は返却しない。

| 正常合成到達の軸 | 実保持／診断 |
|---|---|
| root | first construction_unconfirmed、BP03／call／after、pin_storage_not_connected／ok false |
| source | first receiver_unconfirmed、BP03／call、pinCallReached true、claim unused、bindCall／post false |
| receiver | first receiver_unconfirmed、pin／attempt／after、attemptUsed true／stage attempting |
| caller／callee活動 | callActive false／entryBusy false。実callee中だけ両方true |
| 参照／後段 | expected-source3＋payload6は空、occupancy free／bindingState empty／prefix none、data／grant／duty消費／ready／bodyは0 |
| 生成 | BP01／afterの履歴・failureRecorded false。共通root firstと生成失敗の有無は別軸 |

callerのprimitive復帰はpin受理成功ではない。sourceをBP03／after、rootをreturnedへ移すPC08は未実装で、参照格納・confirmed・C-03・payload借用／bind・構築readyへ進めない。保持は未解決責務でありcleanup証拠・借用退役・root終端成功ではない。

calleeから戻った既知のbinding_mismatch／state_invalid／closedは同じ上位理由へ、未知／receiver_unconfirmedだけはconstruction_unconfirmedへ写像する。元rootの先行理由を優先し、source／receiverのfirstと各実位置は別に保持する。返却後の合成観測はこの初回診断の記録後だけ。closeは返答cacheより先にroot stopと確認済み元source stopを同期反映し、参照clearやreceiver診断の強制更新をしない。

## RED／GREEN・初回失敗

1. 新factoryを使う試験は未実装TypeErrorでRED。最小の固定call・entry・格納前停止を接続し、新1件＋旧bridge30件が成功した。
2. receiver preflightでcloseする試験はscript未受付のinput_rejectedでRED。有限観測と故障／close／先行理由／再入を追加し、新2件＋旧30件が成功した。
3. Proxy sourceの試験もscript未受付のinput_rejectedでRED。固定内部候補の同一性拒否を追加後、3件＋旧bridge／compositionを含む最終79件へ拡張して成功した。
4. 旧bridge compiledは`#bodyPinEntryBusy = false;`のanchorがinitializerとfinallyの2箇所になり、一意性assertで失敗した。initializerの配置を含むanchorへ限定し、既存の不正busy対照を残した。旧AST禁止はclass／method／fieldを限定して新entry制御writerだけ許可し、参照格納・source利用claim・payloadへの禁止は維持した。
5. 新compiledの先行field配置検査は最後のfield.endとconstructor.posが等しい場合を誤って除外した。AST位置を出して隣接を確認し、constructorより後ではない`<=`へ訂正した。field移動や生成順変更で回避していない。
6. phase viewの不正値をreceiverだけがstate_invalidと記録した場合、callerがroot既存理由だけを読んでconstruction_unconfirmedへ丸める見逃しを発見した。設計§8に沿うstate_invalid期待でREDを確認し、同startのprivate診断を固定allowlistで上位へ写像して解消した。27fieldの故障とchecker迂回の両対照が成功する。
7. 文書ID検査は最新範囲表のCR03／04への参照まで新しい定義として数え、重複と誤判定した。CR定義表の§6／CE定義表の§11へ検査対象を限定し、8／14項目の順序・重複なしを確認した。契約IDや参照を削除して回避していない。

期限・並列度・設定・旧runtime期待値を緩めていない。最終合格は以下の再実行を基準とし、途中版の成功と混ぜない。

## 合成・compiled保証

新Vitest43件は公開5methodだけを使う。5観測点×fault／close／prior／root再入のprefixを独立条件式で予測し、callee再入・foreign／copy／Proxy・先行4失敗・開始前close・入力hook非実行・extra引数・返答同一性と凍結有限graphを確認する。before_callのroot再入は既存PC01開始資格で拒否し、receiverへの再入は実call中又は診断保持後に限定する。fixedCallsは正規dispatcherの到達数で、拒否を確かめる合成侵入callを含む総メソッド呼出し数ではない。

| compiled対照 | 確認範囲 |
|---|---|
| 正規owning window | 実entry中にactive=true・callActive=true・entryBusy=true・source call到達true。初期値偽装の正例ではない |
| 活動境界 | 実call中のcallActive=falseを拒否し、重なるactive scalar／interval条件を両方除くと試行へ進んでしまう共同対照。単独節感度とはしない |
| finally 2対照 | caller／receiverの各finally解除を除くと当該busyが実状態として残る。正常・throw・close・先行失敗でも元版は解除 |
| call省略／偽accepted対照 | 到達counterを残したままcalleeを省くと試行false／receiver first noneとなり、正常固定停止の期待を満たさない。acceptedだけを返してもstate_invalidで閉鎖し、参照は空 |
| live foreign 2対照 | 実call中に同値copy／Proxyをreceiverへ渡して拒否。前後のreceiver全projection同一・busy／trial未使用、hook非実行 |
| 停止優先 | 同receiver busy中にclose→再入はrejected_attempt。停止guardを除くとrefused_existingになり、順序を検出 |
| phase接続27field | 実entry後の狭い検査viewでsource13／receiver14fieldを単独故障し、試行前のstate_invalidと実位置を保持。receiverEntry checkerを迂回するとattemptingへ進む対照 |
| attempting接続 | 実attempt後のstep不正を検出。該当checker迂回でreceiver_unconfirmedへ変わることを確認 |
| 同期／先行／負の境界 | try内8直接代入直後の固定call、receiverの連続attempt記録、先行8scalar・private access代入各1回、call flag／trialのwriter各1箇所を確認 |
| 未接続保証 | expected-source／payload9参照・bindCall・post・source claimへの直接writer 0 |
| projection／型 | 新allowlist7個、外部からのprivate call／receiver／matcher／refusal呼出しと不正phase／point／resultの8行を拒否 |

27fieldは値checkerのprivate接続を検査するもので、元保持slotの全field破損耐性や全guard単独感度の証明ではない。活動条件の重複は共同対照と明記し、TSエラー・anchor消失だけを意味的killにしない。source firstの非none保持はclose後の値でも確認するが、任意改竄・OOM・診断必着まで保証しない。CE全14条件、CR05〜08・PC08・C-03全体を受入済みにしない。

## 検証結果

| 検証 | 結果 |
|---|---|
| 新probe-body-pin-call | 43件成功、失敗0 |
| 新call＋旧bridge＋composition | 3ファイル79件成功、失敗0 |
| 関連合成回帰 | 36ファイル2,809件成功、失敗0 |
| 新compiled-probe-body-pin-call | exit 0。owning window・finally2・27field・同期8代入・型拒否8等 |
| 新旧compiled26本 | 全26本exit 0、失敗0。追加のactive共同対照・偽accepted・固定代入式確認後も新compiledを再実行してexit 0 |
| composition＋新旧body10試験のstrict TypeScript | exit 0 |
| build | exit 0 |
| 全体lint（src／tests） | exit 0、error 0／既存warning 374。今回のfixture／新試験／新旧pin compiledはerror・warning 0 |
| 梱包dry-run（offline・ignore-scripts） | exit 0、441ファイル。src／tests・fixture混入0。archive生成／公開なし |
| 文書／差分 | 4文書のローカルリンク47・表27、設計15／17／19節、CR8／CE14の順序・改行／差分空白に異常なし |

関連36ファイルはprobe全10 body試験とframe／run／grant／exit／local-exit、composition／snapshot-read-start／snapshot-value、read-hash全4、source-map全2、pending2、canonical-supply全3とcanonical-gate、journal-supply-shell／writer-gate／absence-journal／capture-admission／retirement-startを明示し、`bdo npx --no-install vitest run`で実行した。全repositoryのVitest回帰は今回未実施。

strictは`bdo npx --no-install tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck`にcompositionと新call／旧bridge／start／contracts／source-issuer／storage-data-split／bind-fields／bundle／live／seed試験を明示した。buildは`bdo npm run build`。compiledはcall／bridge／start／contracts／source-issuer／storage-data-split／bind-fields／bundle／live／seed／local-exit／exit-guard／exit-preparation／grant-capture／run-preparation／frame-preparation／canonical-gate-draft／canonical-supply-construction／journal-supply-shell／writer-gate／absence-journal／capture-admission／retirement-start／pending-binding／pending-construction／declared-actualを順に実行する。

旧compiled3本の書込み例外は新制御writerのclass／method／fieldだけで、禁止集合や旧runtime対照・意味的型拒否は維持した。表示上も「全write=0」ではなく「未許可の保護field write=0」を区別する。追加費を静的代入箇所数から実費へ換算しない。packはbuild成功後、一時cacheの`bdo proxy npm pack --dry-run --json --ignore-scripts --offline`で一覧だけを確認してfinallyでcacheを除去した。依存取得／導入・設定変更はしていない。

## 費目・未接続と保護した範囲

新modeの先行8原始scalar・空reply参照、固定private accessの狭いentry／停止／診断継続、同owner照合・call・有限前後検査・試行・finally・公開projectionが追加費目。既存root／owner／frame・source22key・metadata9／進行13・receiver9参照・callActive／entryBusy・PC01予約を再発行／再計上しない。新authority／owner／registry／friendは作らない。

実E／S・unit係数・実layout／allocation／GC／OOM・全guard数／全体work上界・停止後解消予約・診断必着はUnknown。参照格納・PC08・C-03・source claim消費・payload借用／bind・構築ready・body起動・Journal供給・root終端・正式発行・実予算更新は未接続である。

正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持する。実接続・実通信・実機操作・設定変更・Push、index登録・コミットは行っていない。検証は未コミット作業内容に対するもので、コミット対象だけを隔離した検証ではない。

差分は合成fixture・新43件・新compiled・旧compiled3本の限定AST更新・開発export期待値2箇所・CHANGELOG・設計3文書と本記録の13ファイル。src／manifest／lockfile／TypeScript／配布設定・旧facadeは基準HEADから変更しない。

## レビュー修正（2026-11-11）

`1b929dc`のレビューで、固定call・receiver入場の一時変異43件のうち28件がVitest・compiledの両方を通った。最初の実行は変異scriptの変数衝突で一時ファイルを書いていたため無効とし、修正して全件を再実行した結果である。

| 追加 | 一点注入と期待 | kill |
|---|---|---|
| dispatch前検査3件 | before_callでroute境界before／busy flag／call回数1。binding_mismatch又は未call・未試行 | PC02再検査・entryBusy・call回数の節 |
| 停止判定2件 | before_callでsource.stopRequested／source.first=closed。closed・未call | sourceの停止2節、停止だけの理由をclosedへ写す節 |
| receiver初回2件 | dispatch直接記録のroute境界をafter、before_callで初期field flag。call1回でreceiver無書込み | active資格・初期fieldの節 |
| 入場検査2件 | preflight前／後でsource境界をbefore。state_invalid・未試行、失敗点がその観測点 | 1回目・2回目の入場検査 |

修正後に対象12件を再実行し、10件をanchorを保ったまま意味的なassertでkillした。receiver初回条件のstep／failureStepは、literal初期値の対照がC-01の検査で先に拒否され、dispatchのPC02でも同値を検査するため等価とした。残りを含む18件の根拠は設計§16に記録した。fixture本体は変更していない。

## コミット対象だけの隔離再検証（2026-11-11）

上記は実装時の記録。本節はその後のコミット依頼に対する再検証で、基準HEADは同じ`9f4361c`。対象13ファイルだけを明示してindexへ登録し、全indexを一時フォルダへ展開した。全1,520ファイルのGit blob hashと実行属性がindexと一致することを確認し、未登録の作業中変更を対象へ含めなかった。既存node_modulesへの参照だけを再利用し、依存取得・導入・設定変更はしていない。

分離した内容だけでbuild・compositionと新旧body10試験のstrict TypeScriptがexit 0、関連36ファイル2,809件成功・失敗0、新旧compiled全26本がexit 0だった。全体lintはerror 0／既存warning 374、今回変更したコード／試験8ファイルはerror・warning 0。build成功後のoffline・ignore-scripts梱包dry-runは441ファイルでsrc／tests・fixture混入0、archive生成・公開なし。4文書のローカルリンク47・表27・設計15／17／19節・CR8／CE14の順序と改行／空白も確認した。全repositoryのVitest回帰は今回も未実施。

検証済みのソース・試験は変更せず、本節だけを追加・再登録した。記録以外のindex全1,519項目のfingerprint不変、最終対象13ファイル、分離した全1,520ファイルの内容・属性一致と文書整合を再確認する。参照格納・PC08・C-03・構築ready・body・正式発行は未接続、全体受付無効・Unknown・調査保留を維持する。実接続・実通信・実機操作・設定変更・Pushは行わない。
