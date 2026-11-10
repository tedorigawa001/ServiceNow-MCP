# WF-B (A)：BS storage／BC dataの最小分離・旧入口維持

Date: 2026-11-11 / 基準HEAD: `f3b3721` / 未コミット差分の合成検証。

対象は[生成・停止設計§11](BEST_PRACTICE_WFB_BODY_SOURCE_ISSUER_STOP_DESIGN.md)、[bind親§12](BEST_PRACTICE_WFB_BODY_BIND_BORROW_DESIGN.md)、[構築親§16](BEST_PRACTICE_WFB_BODY_SLOT_CONSTRUCTION_DESIGN.md)。開始時の作業ツリーはクリーン。`5873d16`の原始fieldレビュー修正と[field検証記録](E2E_BEST_PRACTICE_WFB_BODY_BIND_FIELDS_2026-11-10.md)の範囲／等価注記を保持する。正式発行口・C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。

## 最小の実装差分

package除外のcomposition fixtureに追加した実装行は7行だけである。prepareBodySeedを「const shell = prepareBodyStorage()→return prepareBodyData(shell)」のprivate wrapperにし、BS00〜14をstorageへ、BC00以降をdataへ分けた。storageは元の同shellをそのまま返し、dataはその参照を引数で受ける。新しいroot／owner／frame／duty／予算、receipt・callback・public factory／exportは追加しない。

元のBS／BC操作、チェックポイント、予約／call到達、issued／current／初回rejected、freeze／seal、前段／base再検査、5／11／13dataのholdは変更していない。旧prepare入口の同じ外側try／catch／finallyに2呼出しがあり、BSの例外はdataを呼ばず元catchへ伝わる。BC失敗も元の最初の位置／返答cacheで停止する。新たなhook／awaitや、途中の返答／再開APIはない。

旧compiled-probe-body-seedの変更は5箇所の注入先method名だけ。cellOwner対照、unused carrier対照、BC00 base対照、最終base対照、最終data対照をprepareBodyDataへ向け直した。from／toの置換節・期待値・assert・20再検査対照を削除／緩和していない。旧module／facade exportの期待値も変更していない。

読み取り専用の照合では、基準HEADの元prepareBodySeedの18トップレベルstatementと、抽出後storageの4文＋dataの14文が文字列まで一致した。wrapper／抽出methodを元methodへ機械的に戻すとcompositionソース全体が基準HEADとbyte単位で一致する。旧compiledも5つの注入先名を元へ戻すと基準HEADと完全一致した。これは移動以外の差分がないことの確認であり、18をruntime呼出し数／費用上界にしない。

## 初回確認・RED／GREEN

最初に公開旧入口を使う回帰試験9件を追加し、抽出前に全て成功した。挙動を変えないrefactorなので、旧挙動の基準として保持した。次にcompiledでprivate storage／data境界を確認し、未分離の時点ではmissing private extraction boundary: prepareBodyStorageで期待どおり失敗した。

7行の最小抽出後、同compiledが成功した。追加のevent／境界・mutation／型対照、新9件と既存body4試験の計436件、旧seed compiledも成功した。旧注入先を改名する以外に期待値を合わせ直した箇所はない。期限・並列度・製品設定は変更していない。確認中に未解消の試験失敗は発生していない。

## 独立合成試験とcompiled保証

新probe-body-storage-data-splitは9件。旧seed／live／bundleのmodel／返答・5／11／13data・13carrierの保持状態・重複拒否／実行閉鎖を3件で比較する。BS14 done・BC00 before／afterの故障3件では全13carrierを保持したままdata未生成・予約なしで止まる。BS14 done／BC00 beforeのcloseと再入を2件、旧field限定入口がBS／source／pinへ進まないことを1件で確認する。期待値は本体の生成表・builderからimportしない。

新compiledはprivate method3つ、wrapperの固定storage→data順、storage内にBC呼出しなし・data内にBS構築なしを確認する。その後だけ一時scratchへ観測を加える。実配布fixtureに新しいfield・診断・公開APIは追加しない。観測は固定event文字列と同参照／同frame・source不在／receiver初期値のbooleanだけで、任意callbackを実行しない。

BS15段階×4境界の60点、BC00の2点、BC01〜05の各6境界、live6行の固定化数、bundle／draftのfreezeと最終postを独立に列挙し、正常3経路の全event列を比較する。storage終了直後とdataのBC00 beforeへ固定throwを注入する3経路×2位置の6対照では、全BS保持・data未生成・source不在・receiver初期値と最初の失敗位置、再prepare／close後の元返答を確認する。

storage省略・data省略・storage二重・data二重・storage返却copy・data引数copy・storageでの早いBCの7変異は、正常event列／同参照観測から逸脱する。copy変異はprivate受渡しの同一性を失うことで検出するもので、新たな任意入力のruntime拒否guardを実装したという意味ではない。2つの新private methodへの外部呼出しはsemantic compile-fail2行で拒否する。初期値やreadonly値型の保証は旧compiledを継続する。

event観測／変異・emitは全てscratch限定。checkpoint観測に256の上限を置き、実行する固定有限caseの範囲だけを検証する。emit先module URLは重複を拒否し、scratchはfinallyで除去する。公開observer／frame操作・source発行口を追加したり、返答から元shellを復元したりしない。

## 検証結果

| 検証 | 結果 |
|---|---|
| 新probe-body-storage-data-split | 9件成功、失敗0 |
| 関連29ファイル | 2,173件成功、失敗0 |
| 新compiled-probe-body-storage-data-split | exit 0。正常event3経路・境界停止6・変異7・private型拒否2 |
| 旧compiled20本 | 全てexit 0。旧seedのfield33／型拒否9／再検査20と、field限定のrootIntact2／rootAllowlists4も維持 |
| composition＋新試験＋旧body4試験のstrict TypeScript | exit 0 |
| build | exit 0 |
| 全体lint（src／tests） | exit 0、error 0／既存warning 374。今回のfixture／試験はerror／warning 0 |
| 梱包dry-run（offline・ignore-scripts） | exit 0、441ファイル。src／tests・今回のfixture混入0。archive生成／公開なし |
| 機械的一致 | 元18文＝storage4文＋data14文。再結合ソースは基準HEADとbyte一致。旧compiledは注入先名5箇所以外の差分0 |
| 文書・差分整合 | 更新4文書のローカルリンク34件・表23件・差分空白に異常なし |

関連29ファイルは前回field検証の28ファイルに新probe-body-storage-data-splitを加え、`bdo npx --no-install vitest run`へ明示した。全repositoryのVitest回帰は今回未実施。compiledは新1本と、前回のbody-bind-fields／body-bundle／body-live／body-seed／local-exit／exit-guard／exit-preparation／grant-capture／run-preparation／frame-preparation／canonical-gate-draft／canonical-supply-construction／journal-supply-shell／writer-gate／absence-journal／capture-admission／retirement-start／pending-binding／pending-construction／declared-actualの20本を実行した。

strictは`bdo npx --no-install tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck tests/review/fixtures/snapshot-read-composition-fake.ts tests/review/probe-body-storage-data-split.test.ts tests/review/probe-body-bind-fields.test.ts tests/review/probe-body-bundle.test.ts tests/review/probe-body-live.test.ts tests/review/probe-body-seed.test.ts`、buildは`bdo npm run build`。lintは既存src／tests全体のJSONを集計した。packは一時cacheを指定した`bdo proxy npm pack --dry-run --json --ignore-scripts --offline`で一覧確認し、cacheはfinallyで除去した。取得／導入・設定／期限／配布設定は変更していない。

## 未接続・Unknown

新source用BootstrapReadyは未実装で、bodySeedCarriersMatchを全13行空の確認へ流用していない。source生成・private issuer／pin・新しい同期停止・source利用claim消費・payload bind・構築ready・body起動は未接続。旧field限定のsource／shell不在検査・旧close順序・返答cacheを保持する。source／receiverの原始fieldやtype-only brandにも変更はない。

SS01の(A)最小分離部分の確認だけであり、SS02〜12全体の成功を主張しない。追加private call／method配置を含む実allocation・E／S・全guard／全体work上界、実OOMでの診断必着はUnknownのまま。既存の未対照base節・等価とした旧検査の注記も維持する。保持はcleanup確認／解放済みの証拠ではない。

実接続・実通信・設定変更・index登録・コミット・Pushは行っていない。正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持する。

最終の作業中差分は合成fixture／新試験／compiled対照・CHANGELOG・設計／検証文書の9ファイルだけ。src・manifest／lockfile・TypeScript／配布設定に差分なし。未解消の検証失敗はなく、source生成・pin・claim消費・bind・構築ready・body起動は追加していない。本記録作成時点では未コミット・Pushなし。

## コミット前の対象限定再検証（2026-11-11）

上記の未コミット・index未登録という記述は前回作成時点の記録である。対象9ファイルだけをindexへ登録し、そのindexの全追跡ファイルを新しい一時フォルダへ展開した。対象名が指定9件と一致し、各対象の内容がindexとbyte単位で同じであることを確認した。未登録・未追跡の他の作業内容はコピーせず、依存は既存のローカルnode_modulesを参照し、取得／導入は行っていない。

同コピーでbuild・strict TypeScript・関連29ファイル2,173件とcompiled21本が全てexit 0。全体lintはerror 0／既存warning 374。offline・ignore-scriptsの梱包dry-runは441ファイル、src／tests・今回のfixture混入0。更新4文書の34リンク・23表と差分空白を確認した。元18文＝storage4文＋data14文、再結合したソースの基準HEADとのbyte一致、旧compiledの注入先名5箇所以外の差分0も同コピーで再確認した。全repositoryのVitest回帰は今回未実施であり、確認範囲を広げて主張しない。

再検証後の追記は本記録だけで、検証済みコード・試験・設定は変更していない。source生成・pin・claim消費・bind・構築ready・body起動は未接続、正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持する。本節はコミット直前の確認記録であり、実接続・実通信・設定変更・Pushは行っていない。
