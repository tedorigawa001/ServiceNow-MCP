# WF-B：(A)確認値型・先行marker・閉鎖caller準備の合成検証

Date: 2026-11-12 / Version: draft-0.2 / 実装前HEAD: `d7d30551c66e765ee154e175e857770ae01491b2`。

対象は[確認・未接続停止設計§14](BEST_PRACTICE_WFB_BODY_PIN_CONFIRM_RETURN_DESIGN.md)の(A)だけ。実装前の作業ツリーはクリーンで、前工程のレビュー対照・等価判断は`d7d3055`に保存済みだった。その内容を保持し、新しい未関連変更がないことも差分確認する。正式発行口・既存C実行入口・body起動は閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。

## 実装範囲と到達点

package除外のcreateProbeBodyPinConfirmationPreparationFake／wfb-body-pin-confirmation-preparation-1を追加した。元root／source／start・参照格納・中間postから分岐するconstructor固定modeであり、旧reference／storage／callの動作・期限は変えない。実ownerが検査するのはcaptured_readyだけ。正常でもI=C=S・J空、stage captured／step currentのままreceiver_unconfirmed／rejected_attempt、root construction_unconfirmed／pin_confirmation_not_connectedで固定停止する。

BodyPinConfirmationStateは7段階の狭いunionと厳密な値checker。before_final_postのconfirmed／before等の正例は値専用で、実stateを進めない。startの最終markerはconstructor前のliteral false、初期化後のwriterは0。referencePostCheckedは中間post、rejected hold confirmedは失敗候補の局所保持であり、最終postとは別である。

caller分類器はprimitiveだけから有限enumを返す。accepted・call=1・final=true・first noneの正例はcompleted_value_onlyで、実callerはacceptedを引き続きstate_invalidとして拒否する。実結果未格納のthrowをunreturnedとし、markerやcall数から完了を復元しない。診断前は同Tのprivate first／marker原値だけを読み、allocatingなreceiver viewや位置objectを生成しない。

新診断writerは既存root slotを再利用し、first・pin初回位置・独立sourceReason・route failedを直接記録する。sourceはmetadata確認済みかつ引数の元Sがissued/current双方と同参照である場合だけ更新する。未確認sourceの属性読取り／書込みはしない。位置はBP02／preflight又はBP03／callとbefore／afterの正規組だけ、それ以外は全noneとし、各先行理由を保持する。source所有は元root、I/C/Jの借用／未確認責務は元startに残す。

診断固定の後に返答を生成する。(A)は旧generic cacheを再利用し、新modeの空cache・終端返答試行scalarを足す限定準備であり、将来の最終返却用cache統一ではない。失敗first又はcloseがある終端だけをcacheする。未開始check／checkLegacyの有限な返答は終端試行を消費せず、開始前closeはfirst noneでも終端として保持する。新終端返答のmaterialization故障では先行診断／参照を保持し、その返答の再生成を拒否する。OOM・プロセス終了・診断必着・inspect成功・全runtimeの無割当てはUnknownである。

## RED／GREENと初回失敗

1. 通常準備の初回1件は新factory未実装でRED。別固定mode・captured_ready検査・閉鎖返答を追加してGREENとした。後段writer／acceptedを足して通したものではない。
2. 新callerが診断前にreceiver値viewを作っていた。compiledで返却後のview生成をthrowさせると診断未記録となりRED。private first原値accessへ置き換え、同じ対照で診断記録を確認した。中間captured_ready検査時の値viewまで無割当てと主張しない。
3. 新writerがissued=currentだけでsourceを信頼し、両方を同値copyへ同時置換した対照で相手のfirstを更新した。元Sを明示し、metadata＋元S===issued===currentの範囲に限定してGREEN。callerは混入をbinding_mismatchとして保持する。
4. 位置のphase／stepを別々に認めるとBP03／preflightという不正な既知位置を作った。正規pairを一括検査し、不正時は三項目全noneとしてGREEN。先行位置がある場合は変更しない。
5. 返答故障tracerの初回はscript未受付でthrowせずRED。診断固定後だけの有限cp_reply_throwを追加し、同一診断・参照保持と再materialization拒否を確認した。開始前closeでは既存firstがnoneのため、新返答cacheをfirst条件に依存させず保持する。旧close契約は変えない。
6. 梱包dry-runの初回補助確認は存在しない`dist/review/worker-entry.js`を期待してassert失敗した。実ファイル一覧と既存entryを読み取り、確認スクリプトを`dist/review/review-worker.js`へ訂正して再実行した。build・配布設定の不具合ではなく、manifest／設定や製品entryは変更していない。
7. 開始前check／checkLegacyが終端cacheと試行scalarを消費し、後の失敗診断を隠す問題を2件の回帰で検出した。checkの初回期待not_readyも不正で、元checkBodyBindFieldsのblocked_frame_executionが既存allowlistではinternal_unconfirmedになることを確認して期待を訂正した。それでも2件は試行scalarでREDとなり、終端条件を失敗first又はcloseへ限定してGREEN。未開始返答の旧分類・開始前close・失敗後の再生成拒否を同時に維持した。

期限・設定・旧期待値を緩めず、途中版の成功と追加対照後の成功を区別した。

## 合成・compiled保証

新Vitest50件は公開APIで、通常停止・5点×fault／close／prior／再入20件・保持2点×同4種8件・pre-call throw・混入／Proxy・前段失敗・入力hook 0・cache／開始前close／未開始check・有限凍結plain graph・秘密非出力を確認する。prefix期待値は実装scheduleをimportせず、固定原始eventと独立した条件式で計算する。

| 対象 | 今回確認した範囲 |
|---|---|
| 狭い値契約 | 独立builderによる7正例・phase cross49件、source13＋receiver14の各field改変189件、欠落／余分key／不正境界・hold／booleanを拒否 |
| primitive分類 | 結果4×call数2×marker2×first5の80組、不正call数／marker／first等7組。完了正例は値専用 |
| 実owner閉鎖 | 実checkerのphaseはcaptured_readyだけ、receiverはliteral rejected_attemptだけ。accepted偽装でもstate_invalid、最終marker true／秘密文字列／nullの初期故障でprepared拒否 |
| 非割当て区間 | 診断writer・純粋分類器のASTでCall／New／object／array／await／template禁止。callerの診断前prefixは固定raw access／分類器だけ、割当て構文なし。返却後view故障でも診断保持 |
| 元S限定 | issued/current同時copyで相手first不変。metadata未確認のProxy source属性読取り0、root診断は保持 |
| 初回理由 | cp_later_reasonでroot construction_unconfirmedとsource receiver_unconfirmed／sourceReasonを独立保持。root first又はsourceReasonの初回guardを除去すると後発state_invalidへ喪失する2対照 |
| 正規位置 | BP03／preflight混入で既知位置を捏造せず全none。pre-call throwはBP02／preflight／after・unreturnedのまま |
| 返答故障 | 診断後の新返答throwで参照／first／位置保持、2回目のmaterialization・pin再開なし |
| 先行配置 | start marker false、rootの準備／診断記録／分類／返答試行4scalarがconstructor前。markerの初期化後代入0 |
| semantic compile-fail | private checker／caller／writer／receiver利用、不正phase／boundary／marker／分類、公開snapshotからsource参照を復元する計10行を拒否 |

旧compiledのwriter監査はcontracts／startの2本でclass／method／fieldを限定して新診断writerとcaller現在境界だけを許可した。後段stage・source claim・payload・BP04への一括解禁はしていない。開発moduleのexport期待値2箇所に新factory名を追加し、旧factory名／runtime exportは維持した。

前工程`d7d3055`の一点注入16件と[親§16の12等価節](BEST_PRACTICE_WFB_BODY_PIN_REFERENCE_STORAGE_DESIGN.md)は削除せず旧compiledで再実行する。今回追加した初回guard対照は新writerの要求点に限定し、旧全節の非等価・全FEの成功・全費用証明へ読み替えない。

## 検証結果

| 検証 | 結果 |
|---|---|
| 新合成 | 最終50件成功、失敗0 |
| 関連合成回帰 | 最終39ファイル2,944件成功、失敗0（新50件を含む） |
| 新compiled（最終追加後） | exit 0、7状態／field189／cross49・caller80／不正7・型拒否10行・marker writer0等 |
| 新旧compiled29本の連続実行 | 全29本exit 0、失敗／timeout 0。終端cache修正後は新compiledとdeclared-actualを再実行し各exit 0 |
| strict TypeScript | composition・body全試験・composition試験の明示対象でexit 0 |
| build | exit 0 |
| 変更コード／試験7ファイルのlint | exit 0。compiled最終追加後にも当該ファイルを再確認、error／warning 0 |
| offline・ignore-scripts梱包dry-run | exit 0、441ファイル、src／tests／新fixture混入0、既存review-workerあり。archive生成／公開なし |

関連回帰はprobe全試験、composition／snapshot-read-start／snapshot-value、read-hash全4、source-map全2、pending2、canonical-supply全3／canonical-gate、journal-supply-shell／writer-gate／absence-journal／capture-admission／retirement-startを明示した。全repository Vitest回帰は未実施。strictは`bdo npx --no-install tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck`へcomposition fixture・body全試験・composition試験を指定、buildは`bdo npm run build`。新50件だけの成功を旧回帰の成功へ代用しない。

compiledは新confirmation-preparation、旧reference-storage／storage／call／bridge／start／contracts／source-issuer／storage-data-split／bind-fields／bundle／live／seed／local-exit／exit-guard／exit-preparation／grant-capture／run-preparation／frame-preparation／canonical-gate-draft／canonical-supply-construction／journal-supply-shell／writer-gate／absence-journal／capture-admission／retirement-start／pending-binding／pending-construction／declared-actualの29本を列挙し、各`bdo node tests/review/fixtures/compiled-*.mjs`を1process当たり既存同様60,000msの外側枠で順次実行した。全29本exit 0、失敗／timeout 0、旧body-liveは37,236msで成功した。最終の終端cache修正は新modeの返答だけで、全29本を再実行した扱いにはしない。期限は延長していない。

packはbuild後、一時cacheで`bdo proxy npm pack --dry-run --json --ignore-scripts --offline`の一覧だけを確認し、finallyでcacheを除去した。依存取得／導入・archive展開・実worker／runtime接続を伴う梱包試験は実行していない。

## 費目・未接続・変更範囲

追加保持はstartの1scalar、rootのprepared／診断記録／分類／返答試行4scalarと空cache・固定mode。原値access・7状態検査・診断／返答／投影の費目を分け、元owner／source22field／BS13carrier／9参照／call・trial予約を再発行・二重計上しない。元generic返答と新mode返答は(A)では別であり、将来の最終返却cache設計やallocation上界を実証済みとはしない。

実E／S・unit係数・実layout／allocation／GC／OOM・全guard数／全体work上界・停止後解消予約はUnknown。最終post・accepted返却・PC08・C-03・source利用claim消費・payload借用／bind・構築ready・body・Journal供給・field clear／cleanup／root終端・正式発行は未接続。全体受付無効・調査保留を維持する。

変更はpackage除外の合成fixture／試験／compiled7ファイル、CHANGELOG・設計3文書・本記録の計12ファイル。src/runtime・manifest／lockfile・設定は変更せず、実期待値pin・実source照合・S発行・実接続・実通信・実機操作・設定変更・index登録・コミット・Pushは行っていない。

最終整合確認：設計3文書＋本記録のローカルリンク31件に欠落なし、24表の列数・末尾改行／行末空白に異常なし。設計の節順は14／17／18、親の既存§16の等価判断はHEADと同一である。差分の空白確認、追加3ファイルの末尾／空白確認、変更範囲12ファイル、HEAD `d7d3055`・空index不変を確認した。これは(A)の限定検証で、全repository回帰・全FE／最終post／正式発行の成功を意味しない。

## コミット前の対象限定検証（2026-11-12）

上記は実装時点の履歴である。今回、ユーザーのコミット指示に従い、(A)の12ファイルだけを明示してindexへ登録した。基準HEADは同じ`d7d3055`、検証対象treeは`0364912b3b5797976bc5712ee11f24599049e16b`。そのindex全体を一時ディレクトリへ切り出し、既存node_modulesだけを参照して検証した。追跡対象1,532ファイルのGit blob hashがindexと全件一致し、未登録の作業中変更や元作業ツリーの生成済みdistを混ぜていないことを確認した。依存取得・設定変更は行っていない。

| 隔離したコミット対象での再検証 | 結果 |
|---|---|
| 関連合成回帰 | 39ファイル2,944件成功、失敗0。新50件を含む |
| 新旧compiled | 上記と同じ29本を最終版で全件再実行、全exit 0・失敗／timeout 0。各processの60,000ms枠を維持。body-liveは36,958ms |
| strict TypeScript | 同じ明示対象でexit 0 |
| build | exit 0。一時ディレクトリ内で新規build |
| lint | 同じ変更コード／試験7ファイルでexit 0、error／warning 0 |
| offline梱包dry-run | build後に実施、exit 0、441ファイル、src／tests／新fixture混入0、既存review-workerあり |
| 文書整合 | 設計3文書と本記録のリンク31件・表24件を再確認。本節追記後はリンク31件・表25件を確認、異常なし |

この再検証中はソース・テスト・期限を変更していない。検証後の追加差分は本記録の版更新と本節だけであり、実装／build入力・合成試験／compiled・manifest／lockfileが検証treeと同一であることをコミット直前に照合した。全repository回帰と実接続を伴う梱包試験は未実施。正式発行口・実行閉鎖、全体受付無効、Unknown、調査保留を維持し、最終post・accepted返却・PC08・C-03・body・実通信・設定変更・Pushは行わない。
