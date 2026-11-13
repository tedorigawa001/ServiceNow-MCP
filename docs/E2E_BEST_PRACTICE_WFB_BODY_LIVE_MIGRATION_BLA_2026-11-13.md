# WF-B BL-A：304case移行台帳・JS patch境界・独立oracle

Date: 2026-11-13 / 実装開始HEAD: `8087efd` / 文書更新時HEAD: `dcfc6f8`。

対象は[body-live試験見直し§7／9](BEST_PRACTICE_WFB_BODY_LIVE_COMPILED_REDESIGN.md)のBL-Aだけ。作業開始時のtreeはclean。途中で別作業の設計レビューcommit `dcfc6f8`が入り、段階計測・参考C案・記録済み状態への訂正を保持した。A案の実装範囲は変えず、参考Cを採用・実装していない。

正式発行口・C実行入口・body起動は閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。実接続・実通信・設定変更・Pushなし。記録作成時点では今回の変更は未コミット。

## 1 実装範囲と未接続範囲

package除外fixtureへ次の値境界を追加した。src／製品runtime・composition fixture・旧body-live script・package／lockfile／設定は変更していない。

| 追加物 | 保証する範囲 |
|---|---|
| body-live-migration.ts | freezeした304case、412個の論理patch出現、同入力の一度のemit、TS／JSのclass・member・BC分岐・anchor照合、基準JSからの独立値生成 |
| body-live-migration-oracle.ts | 旧scriptの固定SHA-256、旧literal表の限定AST読取りと旧TS文字列置換。新patcher／builderはimportしない |
| body-live-migration.test.ts | 全304caseのID／順序／script／member照合、局所ASTと対象外本文の不変、drift・入力hook・recipe不変・parser拒否 |
| compiled-body-live-migration.mjs | 新境界／oracleだけをscratch ESMとしてcompile・importし、304個のJS値生成と新型契約の7行の拒否を確認。生成したmutantはimportしない |

台帳はbase1・field56・shape24・prior180・preflight14・observation5・prefix18・descriptor／projection6で304。8memberだけに412個の論理patchを対応付ける。通常経路には新境界へのcallerを追加せず、旧304module試験を置き換えていない。

入力はprimitive string、最大1,048,576 UTF-16 code unit。JSは同境界がES2022／ES2022 moduleで元TSから一度だけ生成し、外部のemit済みJS・任意patch・callback・modeを受け付けない。全caseのanchor確認が済むまでbaseも返さず、未知入力・syntax・class／member／branch・anchor・case／output不正はtransform_driftに分類する。未知IDを診断へechoせず、必要時のIDは内部の既知case名だけ。

返すものはJS文字列と変更member名の凍結値だけであり、owner／claim／正式証拠ではない。生成JSの保存・実行・mutant import、fresh namespace／brandの実証、新旧304caseの実行結果比較、元19行の意味診断再実行、loader採取器への接続・通常経路切替・期限内の性能受入は未実施。BL-B／CとBR01〜10全完了の代わりにしない。

## 2 独立oracleと検査条件

旧script SHA-256は `d78c192b304fa73d7e5f70d467564f0dea1a5b3d9cbff3736fd4fab1c0075f07`。oracleは旧rows／brands／preflights／livePrefixのliteral表を読む限定decoderと、旧replace／method／relation／inject方式を使う。入力のeval／importや旧runner自体の実行は行わない。旧scriptに変更があればlegacy_script_driftで止まり、暗黙に台帳を再定義しない。

新境界はclass／methodのAST位置と実tokenから局所領域を定める。comment・string・regexpは式と区別し、型消去は固定recipe内のnon-null／as anyだけに限定する。oracleはTS側で変異を作った後、変更memberだけを参照emitし、JS側の局所ASTと比較する。不要な括弧とtriviaを除く構造比較で、演算子の結合・順序・literal・private参照を維持し、対象member外は基準JSとbyte単位で比較する。両者が同じTypeScript emitterを使う点は明示し、別compilerによる意味検証とは主張しない。

| 対照 | 確認 |
|---|---|
| 全304case | 固有ID・固定順序・script・変更member集合と局所AST、対象外の出力が一致。個数だけ一致する別集合を認めない |
| 基準の再利用 | field-0生成後のbaseと再生成値が不変。各caseは前caseのmutated textでなく同じ基準JSから構成 |
| strict drift 8件 | 不正構文・class欠落／重複・member欠落／重複・BC分岐欠落・anchor欠落／重複を、値生成口の公開前に拒否 |
| literal境界 | comment／括弧等のtriviaをanchorにしない。実式が消え同じ文字がregexp本文だけに残る候補はfield-2のanchor drift |
| hostile入力 | Proxy・array・null・number・function・空／長過ぎるstringと不正IDを拒否。入力hook 0 |
| recipe保持 | recipe・case・patch配列へのReflect.setがfalse、元の固定値を保持。旧scriptの1改行追加もpin不一致 |
| parser例外 | 深い括弧入力のRangeErrorを外へ流さず、固定syntax拒否。実OOMや診断必着の保証ではない |
| 新型の意味拒否 | readonly patch、branchの不正型、group／reason／pointの不正variant、union未narrowingの利用、readonly結果更新の7行を拒否。新fixtureのbaseline診断0 |

構文／anchorで止まることを、旧guardの意味上のkillや初回拒否位置の実行検証へ数えない。旧guardの感度・保持・readonly実操作は旧試験に残り、新loaderでの再実行はBL-Bで行う。

## 3 RED／初回失敗・修正

| 段階 | 観測と修正 |
|---|---|
| 台帳のRED | 空配列0件に対し304件のassertで失敗。固定台帳追加後に成功 |
| 境界のRED | 未実装factoryのTypeError。値だけの境界を追加 |
| 最初の字句実装 | templateを含むbodyLiveMintでscannerのtemplate再走査が不足し、base-mutantのanchorを見失った。再現後に訂正。後述のliteral対照でsource側はAST tokenへ移行 |
| oracle監査の初回304件失敗 | 検査helperが元TSをcheck.jsとしてparseし、classを取得できなかった。TS modeへ訂正。期待値・旧script・製品は変更しない |
| 監査GREEN後の整理 | 全318件成功後、基準ASTの再parseと同じ値の重複生成を監査内だけで除去し、再実行でも全318件成功。通常body-liveを切り替えた高速化ではない |
| regexp負の対照のRED | 生scannerはregexp内だけに残る文字列を式anchorと誤認し、候補を受理した。source側をAST leaf tokenに変更して拒否 |
| AST移行時の初回失敗 | runtime identifierのundefinedとscannerのkeyword種別の差でfield-29を誤拒否。選別5件と関連再実行の新試験309件が連鎖失敗した。Identifierのtoken種別を正規化し、期待値を変えずに再確認 |
| parser例外のRED | 深い括弧入力がRangeErrorを外へ流した。parseを保護しsyntaxへ固定写像した後、同じ入力で成功 |
| 診断用tsxの環境制約 | ローカルIPC listenがEPERMでhelper起動失敗。設定／権限を変更せず、Nodeで値moduleを読む診断へ切り替えた。製品退行や合成拒否成功には数えない |

## 4 最終検証

重い検証は直列で実行し、期限や既存の試験並列度を変えていない。

| 検証 | 結果 |
|---|---|
| 合成・関連回帰 | 6file／753件成功、失敗0。新320件に全304局所比較を含む |
| 新compiled契約 | 304値生成・意味拒否7行、baseline診断0・mutantImports 0。code 0／signal null、7,877ms（監督側の終了確認を含む）で60,000ms枠内 |
| 新compiled終端 | stdout／stderrをdrainし、exit後のcloseを取得。今回の所有group不在を間隔を空けて2回確認。SIGTERM／SIGKILLなし。過去のtimeout群終端を遡及確認したものではない |
| strict型検査 | 新fixture2件＋新test、ES2022／NodeNext／strict／noEmit、exit 0 |
| lint | 新fixture2件・新compiled・新testの4file、exit 0 |
| build | npm run build、exit 0 |
| 梱包dry-run | offline・ignore-scripts・一時cache、441file、review-workerあり、src／tests／今回fixture混入0。archive生成なし、当該cacheはfinallyで削除 |
| 文書・scope | 設計／本記録のローカルリンク5件・表8個の列数・末尾改行／差分空白を確認。旧fixture／旧script・runtime／設定は開始HEADと不変、index未登録 |

合成の対象はbody-live-migration、probe-body-live、probe-body-seed、probe-body-bundle、probe-body-bind-fields、probe-body-pin-returned-closed。既存の元body-live compiled・compiled全群・repository全体回帰・通常並列timeout再採取は今回実行していない。新compiled約8秒や監査testの所要時間を、旧body-live約40秒との性能比較に使わない。新compiledはmutantを実行しておらず仕事が異なる。

## 5 費目・限界・次の境界

費用はpackage除外の試験driverに帰属する。同runの元TS／JS・AST token位置表・304計画・412論理patch出現・局所参照emit・比較を保持し、元runの予算・実E／S・停止ownerへ課金しない。source上限はUTF-16長の入力受付で、encoded byte／物理heap／work上界の実証ではない。compiler内部allocation・GC・実OOM・失敗時診断必着、fresh moduleの実行同等性はUnknown。

次はBL-Bで、旧期待値・意味診断19行・固有URLを維持して生成JSを旧case実行へ接続する。同じ開始点の60秒内に前処理を含め、新旧の観測とdriftを比較する。BL-Cの通常並列・安定3run／30秒目標・配布境界の受入まで、見直し全体を完了としない。C実行・正式発行口・全体受付を開かず、実接続／実通信／設定変更・Pushを行わない。

## 6 コミット対象だけの再検証（2026-11-13）

基準HEAD `dcfc6f8`へ今回の7fileだけをindex登録し、indexの全追跡内容を新しい一時コピーへ展開した。登録対象が7fileだけであることと各byteの一致を確認し、作業treeの他の未登録／未追跡変更をコピーしなかった。依存だけ既存node_modulesを参照し、導入／取得・設定変更を行っていない。

同コピーでbuild、関連6file／753件、strict型検査、追加4fileのlintが全てexit 0。新compiledは304値・7行の意味拒否・mutantImports 0を維持し、60,000ms枠内の7,939ms（終了確認込み）、code 0／signal nullで終了した。stdout／stderrをdrainし、所有group不在を2回確認、終了signalは不要だった。offline梱包dry-runは441file、review-workerあり、src／tests／今回fixture混入0、archive生成なし。文書のリンク5件／表8個と差分空白も再確認した。

元body-liveの実行・性能比較やcompiled全群／repository全体回帰はこの再検証でも未実施。検証後の追加は本節等の記録だけで、検証したコード／試験を変更せずにコミット対象を再確認する。通常経路未切替・正式発行口閉鎖・全体受付無効・Unknown・調査保留とPush禁止を維持する。

## 7 レビュー修正（2026-11-13）

基準HEAD `4c0c1f9` のレビューで、一時変異17件中12件が生存した。区分と等価の根拠は[設計§10](BEST_PRACTICE_WFB_BODY_LIVE_COMPILED_REDESIGN.md)に記録した。入力から到達できる生存5件に対し、新試験へ次の対照を追加した。

| 追加対照 | killした変異 |
|---|---|
| BC06分岐の重複をbranch driftで拒否 | 分岐数の検査を「1件以上」へ緩める |
| branch 11の末尾宣言が`v`でないとbranch drift | `v`束縛検査の除去 |
| branch 11のreturnが`n === 11`で始まらないとbranch drift | 先頭検査の除去（除去時はanchor driftへ変わり失敗） |
| non-null assertionを消したTSはJSが同一でもfield-9のanchor drift | TS側anchor検査の除去 |
| 1,048,576単位はinputを通過（class driftで停止）、1単位多いとinput drift | 上限の1単位縮小 |
| 形比較が`!a`／`-a`、`a++`／`a--`を区別し、括弧は無視 | 比較から演算子の種類を外す（旧比較の状態） |

fixtureでは、AST token移行後に使われていなかったrecipe走査のtemplate再走査を削除し、templateを含むrecipeはlocateで拒否するようにした。no-op／重なりのanchor driftにも既知case IDを付けた。固定台帳だけの防御4件（no-op、重なり、出力不変、出力構文）は、現在の台帳と入力からは到達しないため、試験済みの保証には数えない。

レビュー時の読み取りだけの照合では、全304caseで旧方式の全体emitと新JS値を比べ、対象member外のbyte一致と、単項演算子を含む対象memberのAST一致を確認した（一時script、約64秒、リポジトリ試験には未追加）。新試験は326件になった。BL-B／C、mutant import、通常経路の切替は未実施のままで、正式発行口閉鎖・全体受付無効・Unknown・調査保留とPush禁止を維持する。
