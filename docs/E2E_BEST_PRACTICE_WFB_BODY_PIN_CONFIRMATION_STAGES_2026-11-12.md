# WF-B：(B)同ownerのchecked／confirmed・段階別postの合成検証

Date: 2026-11-12 / Version: draft-0.2 / 基準HEAD: `201b1f76a8f9f237c0faa6cf055eb1f0d5c3db17`。

対象は[確認差分設計§16](BEST_PRACTICE_WFB_BODY_PIN_CONFIRM_RETURN_DESIGN.md)の(B)だけ。開始時の作業ツリーはクリーンで、(A)レビュー補強`201b1f7`の一点注入・復帰喪失・正確な再試行Error比較と[既存検証記録](E2E_BEST_PRACTICE_WFB_BODY_PIN_CONFIRMATION_PREPARATION_2026-11-12.md)を保持した。正式発行口・C実行入口・body起動は閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。

## 実装と正常停止点

package除外のcreateProbeBodyPinConfirmationStagesFake／wfb-body-pin-confirmation-stages-1を別のconstructor固定modeとして追加した。元root／source／startと(A)のcaptured_ready照合を再利用し、その成功直後だけから進む。新owner・source・receipt・利用claimは発行しない。

before_checked→G_K→checked専用post→before_confirmed→G_M→confirmed専用post→blocked再検査の固定5観測点を接続した。G_Kはstep checked／境界afterの2直接代入、G_Mはstage confirmed／step confirmed／境界afterの3直接代入。群内に呼出し・allocation・hook・観測を挟まず、I/C/Jを再格納しない。各post成功後の先行scalarを区別し、confirmed記録だけでpost完了を推定しない。

新checkerは同mode・準備履歴・現在点・元活動binding／source／start・entry busy・実I=C=S／J空と狭い段階値を組にする。各post原値も現在段階に一致することを要求する。元metadata・frame／link／duty／control・source未停止／firstなし・BS13carrier／payload6参照空は既存active検査を再利用する。current欠落はstate_invalid、存在する不一致I/Cはbinding_mismatch、J既存や不正状態はstate_invalidとして停止する。失敗参照を新Jへ移さず、修復・clearしない。

正常でもconfirmed／step confirmed・checked後post=true／confirmed後post=trueまででreceiver_unconfirmed／rejected_attempt、root construction_unconfirmed／pin_final_post_not_connectedへ固定拒否する。stages.completedはblocked再照合までの中間履歴だけ。最終markerはfalse、最終post・before_final_postへの移行・G_P・accepted返却・PC08・C-03は未接続である。

途中throw／close／priorでも到達段階・各post・I/C/Jと初回診断を保持する。close／priorでは既存failがcallee内で先に診断を固定するため、その位置も既存初回区間へ接続した。callerのbefore／afterとreceiver現在境界・初回位置を混ぜない。root/source/receiverの三者診断、source claim unused、payload空、body開始0を維持する。返答生成throw後も保持し、終端返答の再materializationを拒否する。旧finallyは元busyの解除だけ。

## RED／GREEN・初回失敗

1. 通常到達の1件はfactory未実装でRED。同ownerの固定遷移／post・閉鎖factoryを追加してGREEN。最終post・acceptedを足して通していない。
2. before_confirmedのthrow、confirmedのclose、先行理由／再入、返答生成throw、前段失敗は、最初は有限script未受付でRED。各固定scriptと当該動作を段階的に接続した。
3. throw試験のreceiverPin.failureBoundaryと再入試験のtop-level refusalは既存projectionにない項目を期待していた。元projectionを読み取り、既存のbuild.receiver.failureBoundary／route.refusalで検証するよう試験だけを訂正した。公開項目を増やして通していない。
4. confirmedでcloseするとrootの失敗位置が先に既存failで確定し、後の新writerが段階点を記録できずfailurePoint noneとなってRED。既存failBodyPinBridgeの初回区間にも段階点を記録し、同close対照でGREEN。first／位置を後から上書きする修正ではない。
5. compiledの実current欠落がbinding_mismatchとなってRED。欠落と存在する同値copyを分け、欠落はstate_invalid、不一致参照はbinding_mismatchとしてGREEN。元slotの修復はしていない。
6. export集合の試験は新factoryが未登録の期待値でRED。開発moduleの期待値2箇所だけへ新factory名を追加した。旧factory・runtime／facade exportは変更していない。
7. 最後の先行cacheのAST確認は、直後constructorのposがfield endと等しく、厳密な小なり比較で誤って失敗した。node境界を読み取り、当該cacheだけend≤constructor.posとして再実行した。物理fieldの移動や実装の緩和ではない。

期限・設定・旧経路の期待値は緩めていない。文書patchの初回は末尾context不一致で拒否され、変更なしを確認して分割適用した。

## 独立合成・compiled保証

新Vitest48件は公開APIで確認する。5点×throw／close／prior／再入の20件は実装scheduleをimportせず、独立した原始event indexと条件式からstage／step・現在境界・各post履歴・caller初回before／after・診断を予測する。通常停止、故障tracer、先行理由、nested refusal、13前段失敗／混入、入力hook 0、cache・未開始check／close、返答故障、余分な引数、有限凍結plain graph・秘密非出力を含む。

| compiled対象 | 確認した範囲 |
|---|---|
| 実field 50故障 | 各5点でI不一致・C copy／欠落・J既存・stage／step不正・busy false・final true・checked後／confirmed後post不正を個別拒否。元prefix／未確認責務を保持 |
| checker省略5対照 | 各点でstepを壊し、当該checkerだけ省略すると理由／初回点／post履歴／未実施suffixのいずれかが変わる。単なる最終固定拒否や構文／型エラーをkillとしない |
| 実参照／値view | confirmedでCを同値copyにし、値viewのcurrentSameだけtrueへ偽装しても拒否。実参照checkerだけの迂回で中間完了へ誤進行する対照 |
| 安定境界8故障 | 空payload・source first／stop・referencePost・hold・同duty・metadata確認・canonical call活動を個別に壊し、中間完了しないことを確認 |
| 復帰と非昇格 | callee accepted偽装はstate_invalid。callee中間完了後にprimitive復帰を失うとresult none／unreturned・caller beforeのまま、busy解除と履歴を保持 |
| 固定2同期群 | ASTで直接代入・順序・隣接性を比較し、呼出し／allocation／hook／awaitの介在を拒否 |
| 先行fieldとwriter | start2post・root中間完了はliteral false、root3点／再入scalarはnone、空cacheはconstructor前。中間post writer各1、最終marker writer0 |
| projection 3対照 | 点／初回点／再入結果の不正enum・秘密文字列をunconfirmedへ写像し、秘密をechoしない |
| semantic compile-fail | private checker／point／advance／reject利用、不正最終phase、source metadata更新、公開診断からsource参照復元の7行を拒否 |

旧compiledの許可更新はcontracts／start／bridgeで新advance methodのstep／stageだけ、storageで同methodの現在境界・literal confirmedだけ、reference-storageで同methodのliteral confirmedだけに限定した。source claim／payload／BP04／最終markerの一括解禁はない。旧(A)の段階値189field／cross49・caller80組、以前の一点注入・復帰喪失対照も維持した。

[設計§15](BEST_PRACTICE_WFB_BODY_PIN_CONFIRM_RETURN_DESIGN.md)の15等価節は(A)だけの履歴に残す。新checkerの各呼出し点は上の5省略対照で区別し、新raw参照照合と値checkerを対に確認した。全新節の網羅的変異・全FE／全体work上界を確認済みとはしない。

## 検証結果

| 検証 | 結果 |
|---|---|
| 新合成 | 48件成功、失敗0 |
| 関連合成回帰 | 40ファイル2,992件成功、失敗0（新48件を含む）。最後のcaller位置assert追加後も新48件を再確認 |
| 新compiled最終追加後 | exit 0。実field50・省略5・安定8・projection3・型拒否7行、固定2群・最終marker writer0 |
| 新旧compiled30本 | 全30本exit 0、失敗／timeout 0。追加対照後の新compiledも再実行してexit 0 |
| strict TypeScript | composition・body全試験・composition試験の明示対象でexit 0 |
| build | exit 0 |
| lint | 変更コード／試験10ファイルでexit 0、error／warning 0 |
| offline・ignore-scripts梱包dry-run | exit 0、441ファイル、src／tests／新fixture混入0、既存review-workerあり。archive生成／公開なし |

関連回帰はprobe全試験、composition／snapshot-read-start／snapshot-value、read-hash全4、source-map全2、pending2、canonical-supply全3／canonical-gate、journal-supply-shell／writer-gate／absence-journal／capture-admission／retirement-startを明示した。全repository Vitest回帰は未実施。strictは`bdo npx --no-install tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck`へcomposition fixture・body全試験・composition試験を指定、buildは`bdo npm run build`。追加assert後の新試験とcompiledを再実行し、前段成功を新段階の成功へ代用しない。

compiledは新stages、旧confirmation-preparation／reference-storage／storage／call／bridge／start／contracts／source-issuer／storage-data-split／bind-fields／bundle／live／seed／local-exit／exit-guard／exit-preparation／grant-capture／run-preparation／frame-preparation／canonical-gate-draft／canonical-supply-construction／journal-supply-shell／writer-gate／absence-journal／capture-admission／retirement-start／pending-binding／pending-construction／declared-actualの30本。各`bdo node tests/review/fixtures/compiled-*.mjs`を1process当たり既存同様60,000msの外側枠で順次実行し、全30本exit 0・失敗／timeout 0。旧body-liveも41,505msで成功した。最初の連続実行後に追加した新compiledのprojection／先行cache確認は別途再実行しexit 0であり、初回のnode境界assert失敗も上に記録した。期限は延長していない。

packはbuild後、一時cacheで`bdo proxy npm pack --dry-run --json --ignore-scripts --offline`の一覧だけを確認し、finallyでcacheを除去した。依存取得／導入・archive展開・実worker／runtime接続を伴う梱包試験は実行していない。

## 費目・未接続・変更範囲

追加保持はstartのpost2scalar、rootの観測点／初回点／再入結果／中間完了4scalar・空返答cacheとconstructor固定mode。旧(A)の終端返答試行を再利用し、旧generic返答と新mode返答の保持は(A)と同じ限定方式。5個の有限event／段階検査、固定診断／返答／投影の費目を分け、元owner／source22field／BS13carrier／9参照・call／trialを再発行しない。

実E／S・unit係数・実layout／allocation／GC／OOM・全guard数／全体work上界・停止後解消予約・診断必着はUnknown。最終post・accepted返却・PC08・C-03・source利用claim・payload借用／bind・構築ready・body・Journal供給・field clear／cleanup／root終端・正式発行は未接続。全体受付無効・調査保留を維持する。

変更はpackage除外の合成fixture／試験／compiled10ファイル、CHANGELOG・設計3文書・本記録の計15ファイル。src/runtime・manifest／lockfile・設定は変更せず、実接続・実通信・実機操作・設定変更・index登録・コミット・Pushは行っていない。

最終文書整合：設計3文書＋本記録のローカルリンク38件に欠落なし、26表の列数・末尾改行／行末空白に異常なし。設計の節順は16／18／19。親の既存等価節（確認設計§15・参照格納設計§16）がHEADと同一であることを照合した。変更範囲15ファイル、HEAD `201b1f7`と空indexの不変、差分と追加ファイルの空白を確認した。この限定検証を全repository回帰・最終post・全FE／正式発行の成功へ読み替えない。

## レビュー修正（2026-11-12）

`7343af3`のレビューで、段階writer・段階matcher・観測点・返答に34件の一時変異を入れ、25件は検出、9件がVitest・compiledの両方を通った。

検出できた1件は段階継続へ入る分岐の`valid &&`条件である。compiledにprepared検査の直前でreceiver busyを落とす対照を追加した。state_invalid・prepared falseで止まり、`stages.point`／`failurePoint`がnone、checked post未記録のままであることを比較する。条件を外すと段階継続へ進み`stages.point`がbefore_checkedになるため、anchorを保ったまま意味的なassertでkillした。

残る8件（prepared節、固定mode節3、観測点一致節、identity 2、dispositionのclassification条件）は[設計§17](BEST_PRACTICE_WFB_BODY_PIN_CONFIRM_RETURN_DESIGN.md)に根拠を記録した。fixture本体・Vitestは変更していない。

## コミット前の対象限定検証（2026-11-12）

上記は実装時点の履歴。今回、コミット指示に従い(B)の15ファイルだけを明示してindexへ登録した。検証対象treeは`e390b9486183f4c4cdf2f295e2d6e86eacbc33a0`、基準HEADは同じ`201b1f7`。index全体を一時ディレクトリへ切り出し、追跡対象1,535ファイルのGit blob hashがindexと全件一致することを確認した。既存node_modulesだけを参照し、元作業ツリーのdistや未登録変更は混ぜず、依存取得・設定変更は行っていない。

| 隔離したコミット対象での再検証 | 結果 |
|---|---|
| 関連合成回帰 | 40ファイル2,992件成功、失敗0。新48件を含む |
| 新旧compiled | 最終版30本を全件再実行、全exit 0・失敗／timeout 0。各processの60,000ms枠を維持。body-liveは41,442ms |
| strict TypeScript | 同じ明示対象でexit 0 |
| build | 一時ディレクトリ内で新規build、exit 0 |
| lint | 同じ変更コード／試験10ファイルでexit 0、error／warning 0 |
| offline梱包dry-run | build後に実施、exit 0、441ファイル、src／tests／新fixture混入0、既存review-workerあり |
| 文書整合 | 設計3文書と本記録のリンク38件・表26件を再確認。本節追記後はリンク38件・表27件を確認、異常なし |

再検証中にソース・テスト・期限は変更していない。検証後の追加差分は本記録の版更新と本節だけで、実装／build入力・合成試験／compiled・manifest／lockfileが検証treeと同一であることをコミット直前に照合した。全repository回帰と実接続を伴う梱包試験は未実施。正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持し、最終post・accepted返却・PC08・C-03・body・実接続・実通信・設定変更・Pushは行わない。
