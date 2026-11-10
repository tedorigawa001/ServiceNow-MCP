# WF-B body bind：source／receiver内部型・原始先行field・固定拒否

Date: 2026-11-10 / 基準HEAD: `e6cc8cd` / 未コミット差分の合成検証。

対象は[bind差分設計§10](BEST_PRACTICE_WFB_BODY_BIND_BORROW_DESIGN.md)、[構築親§15](BEST_PRACTICE_WFB_BODY_SLOT_CONSTRUCTION_DESIGN.md)、[live／bundle親の限定実装注記](BEST_PRACTICE_WFB_BODY_LIVE_SLOT_BUNDLE_DESIGN.md)。開始時の作業ツリーはクリーン。旧BC12／13のレビュー追加`5ec73dd`と旧入口・試験を保持した。正式発行口・C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。実接続・実通信・設定変更・Pushなし。本記録作成時点ではindex登録・コミットも行っていない。

## 実装範囲と閉鎖境界

package除外のcomposition fixtureにsourceのreadonly metadata／狭いInitial型・有限state×claim×call／post履歴と、receiverのpin／occupancy／binding／prefix・診断の有限型を追加した。sourceは型だけで、runtime brand・BodyBindSourceShellの実体・private issuerは生成していない。同rootにはissued／current／rejectedの空参照、metadataConfirmed=falseとfield検査の位置／最初の失敗位置／状態scalarだけを先行する。不在sourceのstate／claimはnot_createdであり、unusedへ読み替えない。

同RetirementStartAssemblyにはexpected-source3参照＋bundle／draft6参照をundefined、履歴／診断10scalarをliteralで先行した。追加field initializerに新receiver object／array／Promise／関数はない。新module-private継続は空／初期値の検査・有限projection・固定診断だけで、source／pin／payloadを格納する操作はない。参照9本の診断配列はinspect時にだけ作り、元参照やsymbol／brandを返さない。

createProbeBodyBindFieldsFakeは同既存rootのbase37・probe8・run4・exit anchor5を準備した後、BS／BC生成前に止まる。従来baseのgate pin／RunLink等はそのまま準備するが、新expected-source pin・source利用claim・body bindは行わない。APIはprepare／check／checkLegacy／close／inspectだけ。正常でもmodel=wfb-body-bind-fields-1、bind_fields_held／ok=false、rootReady=false、body data／grant試行／body起動／duty消費は0である。

before／checked／afterはfield限定検査の位置で、BP／BD実行を意味しない。各点で元base・source不在・receiver原始初期値を再検査する。close／故障／再入と先行診断の有限scriptだけを受け付け、任意hook・callback・artifact／friend登録口は設けない。診断scriptはreceiver first=state_invalidを保持するが、pin／bind失敗を実行したように見せないためreceiver failurePhase／prefix／boundaryはnoneのまま。

失敗後の返答は同一参照で固定し、重複prepareは拒否、部分生成後の再開はない。実行拒否は旧frame wrapperを呼ばない。sourceの予期しない非空参照は保持booleanとunconfirmedだけへ投影し、そのgetter／ownKeysを実行しない。旧seed／live／bundleの正常終端・検査・モデルは維持した。

## 検証結果

| 検証 | 結果 |
|---|---|
| 新probe-body-bind-fields | 18件成功、失敗0 |
| 関連28ファイル | 2,164件成功、失敗0 |
| 新compiled-probe-body-bind-fields | exit 0。receiver19field・source不在4条件・後段変化2・allowlist9・型拒否21等 |
| 旧compiled19本 | 全てexit 0 |
| composition＋新試験＋旧body3試験のstrict TypeScript | exit 0 |
| build | exit 0 |
| 全体lint（src／tests） | 最終exit 0、error 0／既存warning 374。今回のfixture／試験はerror／warning 0 |
| 梱包dry-run（offline・ignore-scripts） | exit 0、441ファイル。src／tests・今回のfixture混入0、archive生成／公開なし |
| 文書・差分整合 | 更新4文書のローカルリンク31件・表24件に異常なし。差分空白検査もexit 0 |

関連28ファイルは[前回bundle検証](E2E_BEST_PRACTICE_WFB_BODY_BUNDLE_DRAFT_2026-11-10.md)の27ファイルに新probe-body-bind-fieldsを加え、`bdo npx --no-install vitest run`へ明示した。全repositoryのVitest回帰は今回未実施。新18件は正常1、故障／close／再入各3、先行診断1、準備前後close1、hostile入力1、引数付き5入口の拒否5である。9参照のsemantic名・空状態、位置と期待値を本体の定数／builderからimportせず記述し、公開graphの250node未満・freeze／plain data／原始値・getter／symbol非出力を検査した。

compiledは新1本に加え、旧body-bundle／body-live／body-seed／local-exit／exit-guard／exit-preparation／grant-capture／run-preparation／frame-preparation／canonical-gate-draft／canonical-supply-construction／journal-supply-shell／writer-gate／absence-journal／capture-admission／retirement-start／pending-binding／pending-construction／declared-actualの19本を実行した。旧export期待値へ新しい開発専用factory名だけを追記し、旧facadeのexport・factory identityは変更していない。

strictは`bdo npx --no-install tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck tests/review/fixtures/snapshot-read-composition-fake.ts tests/review/probe-body-bind-fields.test.ts tests/review/probe-body-bundle.test.ts tests/review/probe-body-live.test.ts tests/review/probe-body-seed.test.ts`、buildは`bdo npm run build`。lintは既存src／testsのJSONを集計し、packは一時cacheを指定した`bdo proxy npm pack --dry-run --json --ignore-scripts --offline`で一覧を検査した。cacheとcompiled scratchはfinallyで除去した。取得／導入・設定／期限／並列度／配布設定の変更はない。

## compiled保証の範囲

receiverの9参照と10scalarを1つずつ非初期値へ変え、beforeが最初に拒否し、当該条件だけを外すとbind_fields_heldへ誤受理することを19対照で確認した。9参照の非空は実projectionにもretained=trueとして現れる。構文木上で新field initializerを検査し、9参照にinitializerがなく、10scalarに固定literalだけがあることを別に確認した。これはソース上の追加field境界の保証で、実allocation／layoutの証明ではない。

rootのsource issued／current／rejected／metadataConfirmedの4条件を個別に破壊し、当該条件除去で拒否が消えることを確認した。未発行sourceにはgetter／ownKeysがthrowするProxyを使い、公開診断・拒否が未知参照へ触れないことを検査する。checked／afterでの遅延変化2つもその位置で拒否する。誤ったroot ready=trueを注入してもcheck／checkLegacyは固定拒否し、body起動へ進まない。

receiverの列挙scalar9つへ許可外文字列を注入し、値をechoせずunconfirmedへ投影することを確認した。元state_invalidと返答cacheを保持する。semantic compile-fail21行はInitial claim／pin／post、不正なheld／preparing／failed履歴、各有限enum、metadata readonly、bundle／draftとの型混入、wrong start型・callback fieldを拒否する。型だけでは同値copyのidentity・正規issuerを証明しない。

これらは合成fixtureを一時scratchへemitした対照であり、製品ソースは変異させない。emit先module URLの重複を拒否し、全scratchをfinallyで除去する。旧base全節・root全scalarの単独感度や任意故障点の網羅を主張しない。

## 初回失敗と修正

最初の正常試験はfactory未実装のTypeErrorで1件失敗し、新しい閉鎖factory・先行fieldと固定projectionを追加後に成功した。新18件・関連28ファイル・strict・build・compiledは成功したが、初回全体lintはBodyBindSourceInitialがTypeScript本体から未参照でerror 1だった（型拒否snippet内だけで参照していた）。対象ファイル単独でも同じ1件を再現した。

初期状態型をBodySourceHistoryのinitializing枝の定義元としてPickで使用し、未使用抑止・export追加・実体生成で回避しなかった。修正後はstrict・新compiled／型拒否と対象lint・全体lintが成功した。既存の期限・期待値・製品動作は変更していない。

補助文書検査の初回は、検査用ワンライナーの正規表現がtabではなく文字tを空白扱いし、表題末尾のslotを誤検出した。実際の末尾空白が0件であることを別に確認し、検査側をspace／tabの明示比較へ直した後、4文書・31リンク・24表の検査が成功した。文書内容や製品コードを誤検出に合わせて変更していない。

## 未接続・Unknown

sourceのBP00〜04生成／固定化／private pin・claim消費・receiver占有／payload格納・bind全post・構築ready・body起動・退出／回収・正式証拠・実予算更新は未接続。新型が表す将来stateをruntimeで遷移させず、不在のsourceをclaim未消費の資格にしない。

実allocation／E／S／OOM時の診断必着・GC解放・全体work上界はUnknown。BB10〜12の一部分の対照であり、BB01〜09や全受入条件を合格へ昇格しない。保持先は空の先行slotで、cleanup確認済み・解放済みの証拠ではない。正式発行口閉鎖・全体受付無効・調査保留を維持する。

最終確認では関連28ファイル2,164件、build、strictを再実行して成功し、全compiled20本の成功と、新compiledのprimitiveOnlyFields=19を追加した再実行の成功を確認した。全体lintはerror 0／既存warning 374。変更は合成fixture／試験／compiledとexport期待値・CHANGELOG・設計／検証文書の10ファイルだけで、src・manifest／lockfile・配布／TypeScript設定に差分なし。実接続・実通信・設定変更・index登録・コミット・Pushは行っていない。

## コミット前の対象限定再検証（2026-11-11）

上記の未コミット・index未登録という記述は前回作成時点の記録である。今回の対象10ファイルだけをindexへ登録し、そのindexの全追跡ファイルを新しい一時フォルダへ展開した。登録対象名が指定10件と一致し、各対象の内容がindexとbyte単位で同じであることを確認した。未登録・未追跡の他の作業内容はコピーせず、依存は既存のローカルnode_modulesを参照し、取得／導入は行っていない。

同コピーでbuild・strict TypeScript・関連28ファイル2,164件とcompiled20本が全てexit 0。全体lintはerror 0／既存warning 374。offline・ignore-scriptsの梱包dry-runは441ファイルで、src／tests・今回のfixture混入0。更新4文書のローカルリンク31件・表24件と差分空白も確認した。全repositoryのVitest回帰は今回未実施であり、確認範囲を広げて主張しない。

再検証後の追記は本記録だけで、検証済みコード・試験・設定に変更はない。pin・claim消費・bind・構築ready・body起動は未接続、正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持する。本節はコミット直前の確認記録であり、実接続・実通信・設定変更・Pushは行っていない。
