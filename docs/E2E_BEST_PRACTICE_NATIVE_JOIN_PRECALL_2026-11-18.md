# JR-B先行診断・一度限り受付・固定拒否・安全なfailure反映の合成検証

Date: 2026-11-18 / 実装基準HEAD: `2ecb117`。
対象: [pre-call設計draft-0.2 §9](BEST_PRACTICE_NATIVE_DIAGNOSTIC_JRB_PRECALL_ADMISSION_ALIAS_DELTA_DESIGN.md)、[旧root](../src/review/abort-scope-evidence-native-diagnostic.ts)、[source試験](../tests/review/native-join-precall.test.ts)、[独立対照／strict scratch](../tests/review/fixtures/native-join-precall-model.mjs)、[固定dist検査](../tests/review/fixtures/compiled-native-join-precall.mjs)。作業中の別コミット`14b0bd9`による親文書の版・参照訂正は保持し、本実装へ取り込んだ変更として扱わない。

## 実装範囲と閉鎖境界

同creator先頭のroleごと4scalar（attempted／busy／最初のcheck／code）、有限check型、一度限りのprivate受付と固定拒否、既存failure／cold保持への最小適格反映だけを追加した。受付はliteral false、製品callerは0。旧request・3closure・14const null aliasは変更しない。

最初の拒否・空の場合だけ元primary・同期revokedを、slot／shellのproperty検査より前に原始保持する。raw4参照はlexicalな同shell／identity／pin／slotとだけ照合し、不足・混入はowner／evidence_binding_mismatch、それ以外もcomposition／invalid_stateで拒否する。全owner fieldを資格化したわけではない。再入・二度目は原始記録だけで、最初のcheck／code・元primaryを上書きせず、descriptor／helperを再試行しない。busy解除は初回frameのfinallyだけである。

canonical slotの非Proxy確認後、faultAt・fault・phaseがown writable dataかつ有限値域である場合だけ既存primitive failureを使う。不適格・descriptor例外ではhelperを呼ばず、元参照とlexical拒否を保持する。最後の一時descriptorを明示的に退役してから、同canonical非Proxy shellへのcold保持だけを許す。初回descriptor上界は3＋2＝5、再入／二度目0。上位記録・通知・copy・settler・別予算・時計呼出しは追加しない。

全field受付・停止／live pin資格・alias writer・生成claim消費・Promise生成・安全観測・固定abort／失敗終端は未接続。正式発行口／新LM03／C実行／body起動閉鎖、全体受付無効、通常経路未切替、Unknown、VM／監視／telemetry調査保留、LOAD6／LOAD7選択・AP01〜06未承認を維持する。private公開・dispatch・実接続・実通信・実機操作・設定変更・stage・コミット・Pushは行わない。

## 独立対照と保証の限界

| 対照 | 結果・確認した責務 |
|---|---|
| 初回2role | 原始診断→適格slot→cold保持の順。同pending・constructor／entry claim=false・candidate=null、上位診断不変 |
| 再利用2case | 先行authentication_failedを保持。条件復旧後も追加descriptor0、他roleの4scalar不変 |
| slot36case | 最小3field×2roleのreadonly／accessor／missing／不正値／freeze、取得1〜3回目のthrow。slotが不適格ならmetadataにも触れず、hook0・元参照保持 |
| origin34case | 4参照×2roleのforeign／同値copy／Proxy／revoked Proxyと未生成。foreign getter／prototype hook0、別ownerの診断・参照不変 |
| 再入2case・10境界 | 初回の5descriptor点で再入。入場時には先行拒否とrevokedが既にあり、内側frameはbusyを解除しない |
| metadata20case | readiness／retentionのreadonly／accessor／missing／freeze、shell期待参照の欠落、descriptor prototypeのvalue／writable getter。slot理由を失わずhook0 |
| 保持135case | 先行slot fault／site・cancelled／sealedの4case、各roleの全65fieldを一つずつhook化した130case、不正role1case。full-field受理を行わず、全て固定拒否のまま |
| 構造・意味 | 先行8scalar・最小3descriptor・各own data／writable guard・cold前のdescriptor退役・製品entry caller0。有限型とfalse返却の正対照、不正型3行 |
| 負の対照 | Object／Array割当て・Promise／sample／queue・別callerの6拒否。21構文正常変異を検出（構造対照を含み、全てをbehavior差として数えない） |

strict scratchは固定source／distから閉鎖区間を抽出し、試験コピーだけでprivate参照・fault操作・descriptor計数／再入注入を露出する。製品にfixture台帳・friend・event登録口・generic setterを追加しない。今回のscratchでは14aliasの宣言も変更しない。全field hook対照は、それらを受理した証拠でも、将来の74cell受付の代替でもない。

既存live試験のcaller対照は、原始failure／cold保持の追加call siteがreflectJoinPrecallFailure内の各1個だけであることへ更新した。postは依然caller0、pre-call入口もcaller0。旧control意味試験のprefix抽出には、先行scalarが参照する既存有限型2宣言をASTから同じまま添え、元の正対照・不正6行の期待値を維持した。

## RED・初回失敗・修正

- tracerは未実装markerで1件RED。追加後、旧preparationPrefixが先行scalarを既に含むことを見落とし、scratchへ二重挿入してSyntaxErrorになった。重複挿入を除き、元配置を含むことを明示確認した。
- prototype故障の準備自体が通常prototypeのdescriptor objectを使い、2個目のpoison設置で先に入れたgetterを呼んだ。準備descriptorをnull prototypeにして、製品呼出し前の故障と分離した。
- 既存live試験2件はcaller0期待で失敗した。追加が許されるのは未接続拒否内の2call siteだけであるため、owner付きの厳密なcall graph期待へ更新した。旧post／helper本体は変更していない。
- 初回21件へ拡張前の20変異では、5件が生成JSの空白・改行差で置換先不一致、2件がoracleを通過した。置換前の件数確認・構文確認を期待失敗区間の外に維持したまま空白差だけを許容し、先行primaryの確認assertionとown data guardの構造対照を補った。readonly／accessorに対して別guardが同じ拒否を返す場合はbehavior検出と混同しない。
- cold保持前のdescriptor退役を検査する対照を先に追加し、1件REDを確認。最後のdescriptor参照をundefinedへ戻してから既存helperへ渡すようにした。
- 旧pin compiledの変異anchor `rawShell !== s`が、新しい`rawShell !== shell`の先頭とも一致して2件となった。新継続のlocalをheldShell／heldIdentity／heldPinへ分け、旧変異対象と本文を変えずに元の1件対照を維持した。
- 関連16fileの初回は543成功・旧control意味試験1件失敗。抽出prefixだけでは新scalarの型名を解決できず4診断となった一方、製品type-checkは成功していた。前述の有限型2宣言を付けて再検証した。期限は変更していない。

## 最終検証

- 関連source16file・545件成功（17.76秒）。新規sourceは30件。全体回帰ではなく、旧root・準備／pin／handlers／seed／values／live・構築／facts／注入workflow／session周辺の限定回帰である。個別5秒・既定並列度を変更していない。
- build、type-check、変更TS4fileのESLintはexit0。
- 固定dist compiled14本は全て元の60,000ms以内、exit0・signalなし・実行errorなし。実測msはprecall672、live4899、values1178、seed1892、handlers13190、pin4014、generation183、construction85、control96、facts54、pure54、workflow73、status70、session79。
- 固定dist新fixtureは内部型／継続／scalar名のd.ts漏出を拒否する。既存61関数の本文（変更を内包するcreator2個は比較から除外）と4exportは基準HEADとbyte一致し、新private関数は3個だけ。
- offline／ignore-scriptsの梱包dry-runは441file・配布JS109file。tests／private evidence root／新継続名の混入0。操作専用の一時cacheはfinallyで削除し、依存・package／runner設定は変更していない。
- 新規source単独の最終確認は30件成功（1.66秒）。新MJS2fileの構文確認もexit0。更新文書7fileの相対link83・表41・pre-call設計ID64、末尾改行・差分空白を確認した。親文書は受渡しdraft-0.5／seed→実行draft-0.8へ更新し、関連3設計の現行版参照を揃えた。別コミット`14b0bd9`を保持し、今回の作業によるstage／コミット／Pushは0である。

実Promise／新観測・callback・終端処理の実行、全field受付・alias供給・実backing容量・完全回収・最終discard、全体回帰は今回の保証外。不適格slotやmetadataはUnknownのまま保持し、同期停止・false復帰・cold保持の実行を全解放の証拠へ昇格させない。

## コミット対象だけの再検証（2026-11-18）

基準HEAD `14b0bd9` のarchiveへ、今回の15fileだけを反映した分離snapshotを作成した。既存node_modulesは同じ実体を参照し、依存の取得・更新・設定変更を行わない。開始時のSHA-256で対象を固定し、対象外の作業中変更をsnapshotへコピーしていない。

- build・type-check・変更TS4fileのESLintはexit0。
- 関連16file・545件成功（15.76秒）。元の個別5秒・既定並列度を維持し、全体回帰とは区別する。
- 固定dist compiled14本成功。実測msはprecall510、live3072、values780、seed1409、handlers9286、pin3634、generation176、construction70、control94、facts52、pure52、workflow70、status68、session95。各childは元の60,000ms期限内でexit0・signalなし・実行errorなし。
- offline／ignore-scriptsの梱包dry-runは441file・配布JS109fileで、tests／private evidence root／新継続名の混入0。操作専用の一時cacheは削除した。

検証後の変更は本節と、JoinRuntime設計の古い「MDだけ」を限定実装の現状へ訂正した1段落だけで、ソース・試験・依存・設定は検証済み内容から変えていない。このMD差分もsnapshotへ反映して、link・表・差分空白と全対象の内容一致を確認する。各閉鎖条件・Unknown・調査保留を維持し、Pushは行わない。

## レビュー修正 2026年11月18日

レビュー基準と修正時のHEADはどちらも`08e646a`。設計は[pre-call設計draft-0.3](BEST_PRACTICE_NATIVE_DIAGNOSTIC_JRB_PRECALL_ADMISSION_ALIAS_DELTA_DESIGN.md)§9。製品コードは変更していない。

| 指摘 | 原因と対応 |
|---|---|
| 許容値とnull shellの見逃し7件 | 一時変異25件のうち12件が全oracleを通過し、7件は非等価だった。phaseの許容値claimed_unheld／checked／failed_retainedを外すとfaultが記録されず、先行faultの許容値invalid_state／evidence_binding_mismatch／internal_review_errorを外すとphaseがbuildingのまま残り、期待shellのnull判定を外すとowner拒否がcompositionになる。どの差も既存対照に現れなかった。各値から拒否を反映する14対照（2role×7）と7変異を加えた |
| 変異判定の幅 | 変異試験が任意の例外を検出扱いにしていた。判定をAssertionErrorに限り、保持135対照と新しい14対照も変異の判定に含めた |

先行REDとして、追加した7変異は旧oracle（保持対照を含めても）で7件とも通過した。新oracleでは28変異すべてがAssertionErrorで検出され、変異1件あたり1.5秒未満だった。

等価として扱った5変異：canonical slotとshellのProxy確認、shellのnull確認、反映前のcode null確認、recoveryの照合。いずれもlexicalな自owner参照か、直前の固定拒否で値が決まるため、この閉鎖単位では結果が変わらない。全field受付・alias供給・Promise生成・観測・終端処理・private公開・dispatchは未接続のままで、各閉鎖条件・Unknown・調査保留を維持する。
