# JR-B固定closure／tupleの先行準備・段階別postの検証記録

Date: 2026-11-17。基準HEAD: `15624ca`（設計基準は`b167d09`）。設計：[固定closure／tuple・段階別post差分draft-0.2](BEST_PRACTICE_NATIVE_DIAGNOSTIC_JRB_HANDLERS_POST_TERMINAL_DELTA_DESIGN.md#11-closuretuple準備段階別postの限定実装)。

## 限定実装と非実行境界

[旧root](../src/review/abort-scope-evidence-native-diagnostic.ts)の同role shellへ、handler準備claim／busy／state／detail／最初のfaultを先行配置した。固定順でexecutor・fulfilled・rejectedの3closureと同2参照のtupleを保持し、tupleをshallow freezeする。段階ごとのpostはcanonical shell／identity／pin・同owner・元の停止条件・同cleanup record・live pinを確認し、旧pinの全null postとは分けた。

同割当てのcanonical alias、保持detail、最後の完了position、最初の細分化faultは別である。未完了の失敗はposition=pin、faultAt=handlersと実際の保持detailを残す。初回試行のclaimは戻さず、部分参照をclearしない。重複・再入・停止・条件復旧後も再準備しない。finallyはbusyを取得した当該試行だけが解除し、拒否された再入側に外側busyを解除させない。

closure本体は同shell／identity／pin／slot／roleに結合した固定拒否だけである。本検証でもclosureを呼び出していない。新準備関数と完了checkerを旧execute／cleanから呼ばず、Promise生成・executor入場・settler捕捉・観測登録・callback・通知／copy／終端・private公開・dispatchは接続していない。実class／注入resourceの旧合成回帰と、新しい非実行準備の保証は区別する。

## 独立合成対照

[source試験](../tests/review/native-join-handlers.test.ts)は25件。[独立oracle／scratch導出](../tests/review/fixtures/native-join-handlers-model.mjs)は製品の固定区間を管理された新しい合成JS realmへ導出し、固定scheduleと独立期待値を使う。製品へ新export・friend・登録口・故障callbackを足さない。[compiled検査](../tests/review/fixtures/compiled-native-join-handlers.mjs)は固定distだけを読み、source／TypeScriptへfallbackしない。

| 対照 | 結果・境界 |
|---|---|
| 正対照2role | 同shell／identity／pinと3個の異なる関数、同順序のtuple1個を保持。完了時handlers_ready／complete、tupleのown 0／1／lengthとfreezeを確認。停止下の同record cleanupはread-onlyのまま |
| entry同一性24 | shell／identity／pinそれぞれのforeign・同値copy・hook付きProxy・revoked Proxyを拒否。foreign state／slot／shell不変、hook 0、準備claimは未消費、自owner失効 |
| post参照48 | 引数3種とhandler／tupleの差替えを拒否。mutable holderの差替えを新canonicalと認定しない |
| 部分生成24 | 2role×12位置。claim後、3closureの前後、tupleの前後、freezeの前後、最終post前でthrow。保持参照／detail／freeze状態／先行fault／同期失効を保持し、条件復旧後も再取得0 |
| 完了post field62／entry field10 | 19個の実行閉鎖fieldと準備／pinのfield、主pending／identity／pin、同値tuple copyを確認。entryの準備field欠落も拒否し、旧全null postを緩めない |
| 完了後drift7 | sealed・run停止・cleanup record交換・species getter化を拒否。停止下の同record cleanupは許可。getter実行0 |
| 準備中停止24／再入2 | 6保持位置×2role×stop／seal。run停止とcleanupのread-only条件を分離。再入失敗後も外側がbusy責務を保ち、先行entry faultとexecutorだけを保持 |
| tuple不正12 | 2role×accessor・length超過・余剰field・穴・prototype差替え・順序不正。tuple保持位置で停止し、getter hook 0 |
| 構文正常変異17 | claim・busy所有・first fault・各origin・alias・順序／freeze・post同一性／detail／停止／live pin・tuple形状・旧entry claim検査の省略を拒否。構文エラーを検出成功へ数えない |
| 非実行監査の負対照6 | retained closureへの直接／member／apply呼出し、Promise生成／resolve、通知を構文監査が拒否。負対照を実行してclosureを起動する試験ではない |
| semantic正対照／不正10 | role、有限detail／fault／state、readonly tuple、undefined-return handler、literal null work／resolve、false観測claim／dispatchを1 Programで確認。各不正行だけに診断1件 |

25source試験へ表の対照数を足し合わせない。aliasやreadonly型はauthorityではなく、任意の内部破壊やmodule捕捉前のintrinsic改変を保証しない。runtime field・構文監査・semantic・compiledはそれぞれ別の保証である。

## 先行RED・初回失敗と切り分け

| 段階 | 原因・対応 |
|---|---|
| 最初の1件RED | handler準備の固定境界がHEADに存在せず失敗。閉鎖した準備だけを実装後に成功 |
| 旧source初回47件中2件失敗 | 新cleanup比較式が旧JR-A変異の部分文字列と重なったため、同じ意味の逆向き比較へ変更して旧アンカーの一意性を維持。もう1件はhandler型をnull専用からundefined-returnへ拡張したため旧null代入負対照が合法化したもの。不正戻り値の拒否へ1行更新し、旧8行の件数・行別診断と他の期待値を維持 |
| 新3件中1件失敗 | 試験側が既に循環参照を持つforeign shell全体をJSON化した。参照を含む固定shallow copyとfield比較へ変更してforeign不変性を確認。製品codeの問題ではなかった |
| 新25件中2件失敗 | busy変異のアンカーがemit後の改行に未対応。固定正規表現で件数1と構文を確認するよう変更。もう1件はdata descriptor判定だけを外しても関数実参照比較が同じ不正を拒否する等価変異だった。独立したfirst descriptor検査全体を外す非等価変異へ置換し、等価変異を検出数へ含めない |
| 最初のoffline梱包dry-run | 既定npm cacheへのopenがEPERMで失敗。製品・package設定やcache所有権は変更せず、当該コマンドだけ書込可能な一時cacheを指定して再実行し成功。終了後その一時cacheを削除。環境制約であり梱包内容の退行とは分ける |

期限の延長、既定並列度の変更、旧公開結果やcleanup期待値を緩める対応は行っていない。非実行の準備を越えてPromise／closureの実行を試す回避も行っていない。

## 検証結果

すべて`bdo`経由で作業tree上の対象を確認した。index限定の別展開やコミット前検証ではない。

| 検査 | 結果 |
|---|---|
| build／型検査 | 既存tsconfigのままexit 0 |
| 関連source11file | 303件成功・失敗0、群全体6.29秒。旧278件＋新25件。個別5秒・既定並列度を維持。群の総時間と個別期限は別 |
| 固定dist compiled10本 | 新handler、旧pin、JR-A、CP00〜05、空準備、VK01／02、BG01、ND-01／02／03がexit 0・signalなし。各外側60秒内。旧27資格・32同一性・121phase・12変異、旧pinの23変異も維持 |
| lint／構文 | 変更TS3本のESLintがexit 0。新MJS2本のnode構文検査exit 0。全repository lintではない |
| 旧本文・公開面 | HEADとのAST比較で旧14関数本文・4exportが一致。新private型／関数のd.ts漏出なし |
| offline梱包dry-run | ignore-scripts／offline・一時cacheでexit 0。441file、配布JS109本を検査。旧root群／試験は非同梱、新private準備／model参照0。実tarball生成・展開は未実施 |
| 文書・差分静的確認 | 対象10fileだけが変更。設計3文書＋本記録のlocal link33件・表23個・設計ID57個を確認。末尾改行・差分空白に問題なし、stage0 |

上記は有限合成対照であり、全repository回帰、任意変異、native Promise／resourceの実体保証ではない。文書更新後にも差分と変更範囲を再確認する。

## 残課題と維持条件

同P／settlerの生成、candidate／workの安全な観測、executor／callbackのprivate writer、failure drainの通知／copy／限定settleと実終端は未接続。生成・観測・固定abort／失敗終端は次の工程で対にして検証し、handler準備成功をconstructorの資格へしない。

JR-Cのprivate公開、正規cleanup合流、legacy work統一・dispatch／entry・正常finish、外側custody／最終discard、module捕捉前改変・OOM／process障害・実backing容量・全体回帰は未確認／Unknownである。未解決責務をslot clearや診断sealによって確認済みへしない。

正式発行口／新LM03／C実行入口／body起動閉鎖、全体受付無効、通常経路未切替、LOAD6／LOAD7選択・AP01〜06未承認、VM／監視／telemetry調査保留を維持した。実接続・実通信・実機操作・設定変更・stage・コミット・Pushは行っていない。

## コミット前の対象限定再検証 2026年11月17日

親HEADは`15624ca`。今回の10fileだけをstageし、index全体を別の空directoryへ展開した。作業treeの未登録file・既存dist・`.git`を持ち込まず、導入済み依存だけを参照した。展開先で既存設定のbuild／型検査・変更TS3本のESLintがexit 0。関連source11file・303件が成功、失敗0、群全体9.24秒。個別5秒と既定並列度は変更していない。

展開先で新しく生成した固定distのcompiled10本はすべてexit 0・signalなしで、各外側60秒内に終了した。offline・ignore-scriptsの梱包dry-runは当該コマンド専用一時cacheで成功、441file・配布JS109本。旧root群／試験は非同梱、新private準備／model参照0。cacheは終了後に削除し、設定は変更しなかった。実tarball生成・展開は未実施である。

親HEADとのAST比較で旧14関数本文・4exportが一致し、文書local link33件・表23個を確認した。再検証後の追加は本節だけで、ソース・試験・設定は変更しない。最終indexと展開先の内容一致・対象10file・差分空白を再確認してコミットする。全体回帰・closure呼出し・Promise生成・private公開・dispatchは未実施／未接続、各閉鎖条件・Unknown・調査保留を維持し、Pushは行わない。

## レビュー修正 2026年11月17日

レビュー修正の基準HEADは`48900ac`、修正時のHEADは`f3746c4`。製品コードは変更せず、[独立oracle](../tests/review/fixtures/native-join-handlers-model.mjs)・[source試験](../tests/review/native-join-handlers.test.ts)・[固定dist検査](../tests/review/fixtures/compiled-native-join-handlers.mjs)だけを補強した。冒頭の基準HEADは実際の親`15624ca`へ訂正した。

| 区分 | 内容 |
|---|---|
| 指摘 | 3 closureの固定拒否は製品動作だが試験はclosureを呼ばず、拒否本体の無効化・拒否code入替え・fault位置変更が通過した。tuple 2番目のdescriptor照合と完了時`slot.position`照合を外す変異も通過した |
| 先行RED | 上記5変異を出力JSへ適用し、HEADの旧oracle（6検証関数）が5件とも通過することを確認した。新oracleでは5件とも拒否 |
| closure直接呼出し6・origin不一致2 | 2role×3関数を準備完了後に直接呼ぶ。undefined復帰、handlersFault=closed_call、slot fault=invalid_state・faultAt=handlers・position=handlers、同期revoked・primary=invalid_state、failed_retained、完了checker false。引数のsettler呼出し0・value／reasonのhook 0、通知等の操作0、upper診断不変。別closureの後続呼出しでも最初のfaultと全保持参照は不変。identity holderを同値copyにすると拒否codeはevidence_binding_mismatch |
| tuple・post追加 | tuple 2番目の差替え・accessor化を拒否（tuple不正12→16、getter hook 0）。完了後に`slot.position`をpinへ変えたpostを拒否（field post 62→64） |
| 変異 | 構文正常な変異を17件から22件へ |
| 件数 | handler source試験25件→31件（closure直接呼出しの対照1件と、変異5件をそれぞれ1件として実行）。closureを呼ぶのは本対照だけで、他の対照のclosure呼出し0は維持 |

検証は作業tree上で行い、lint・型検査・build・package分類・全vitest・compiled-probe群・declared-actual・body-live migration／compare・native compiled 12本を実行した。結果はレビュー報告に記す。Promise生成・executor入場・観測・private公開・dispatch未接続、各閉鎖条件・調査保留を維持する。Pushは行わない。
