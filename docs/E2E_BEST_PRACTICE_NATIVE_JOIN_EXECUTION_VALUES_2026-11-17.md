# JR-B execution variant・origin leaf・段階別値postの合成検証

Date: 2026-11-17 / 基準HEAD: `a477987`。
対象: [接続差分設計§9](BEST_PRACTICE_NATIVE_DIAGNOSTIC_JRB_SEED_EXECUTION_TRANSITION_DELTA_DESIGN.md)、[旧root](../src/review/abort-scope-evidence-native-diagnostic.ts)、[source試験](../tests/review/native-join-execution-values.test.ts)、[独立oracle](../tests/review/fixtures/native-join-execution-values-model.mjs)、[compiled検査](../tests/review/fixtures/compiled-native-join-execution-values.mjs)。

## 範囲と非実施

readonlyの8variant、反射・live状態に依存しない同保持origin leaf、creator-owned data投影の段階別値postだけを追加した。実shellのfalse／null・14null alias、元requestと3closureの固定拒否は維持。値検査から実行へのcaller・新export／friend／登録口・fixture台帳共有はない。

正式発行口／新LM03／C実行／body起動閉鎖、全体受付無効、通常経路未切替、Unknown、VM／監視／telemetry調査保留、LOAD6／LOAD7・AP01〜06未承認を維持する。Promise生成・observer登録・setter呼出し・private公開・dispatch・実接続・実通信・実機操作・設定変更・stage・コミット・Pushは行わない。試験が使う合成関数参照・objectはnative起源の証拠ではない。

## 独立対照

- 8variantの固定表からrun／cleanup各prefixと失敗保持を作り、44正常値・836不正値／aliasを確認。native関数・candidateのactual出力を期待値へコピーしない。
- falsey返却候補、登録途中・throw／return_lost・refused・ack候補保持を含む16正常値、欠けるpair・不正site・ack／work混入など76境界拒否を別表で確認。null／undefined／0の取得済み候補を未取得へ戻さない。
- 同origin6対照、foreign／copy／Proxy／revoked Proxyと元pending喪失の34拒否。停止／sealed／current交換・failed custody後の同参照照合は生成資格にしない。raw hook 0。
- 正常なchecked投影を検査した後でも、元request2経路・3closure×2roleの6経路は固定拒否。元shellのconstructor／entry claimはfalse、candidateはnull、先行診断・同期失効を維持する。
- 値postは入力・alias・root／upperを書き換えない。ASTでは新blockのcallは値helper2箇所だけ、origin leafのcall／反射0、writer／new／await／throw／closure生成0。禁止能力6件の負の対照と構文正常変異14件を検査する。
- semantic正対照と不正7行でreadonly・variant／role分離・cleanup reject=null・元live shellのliteral閉鎖を確認する。

これらはsource試験の内部assert数であり、source成功件数へ加算しない。safe_same_work／verifiedの値上の整合はnative brandや実登録・cleanup確認ではない。

## 初回失敗と補正

最初のtracerは新block未実装のためmarker欠落で1件RED。次のstage／origin対照は、未実装のstage拒否とleaf不在で2件REDとなり、限定実装後に通過した。境界追加ではprimitive `0`をverified ackへ置ける対照がREDとなり、値上のverified参照をobject／functionに限定した。これはnative brand検査の代替ではない。

関連5fileの初回結合実行は160成功・8失敗。旧変異試験4件は全source上の文字列anchorが新blockにも一致したdriftで、旧oracle／期待値は変えず新block内の比較表記を分離した。新変異4件は、それまでの別の境界失敗が検出不足を覆っていたもの。元pending喪失を古い実参照で照合する対照、running中のrun resolveのみ、正常なfailed観測baseからのsite検査、unused claim対照を補強した。修正後の同5fileは168件成功。全件を期限延長・並列度変更で回避しない。

## 最終確認

関連13fileのsource回帰は401件成功（16.22秒、既定並列度・元の個別5秒期限を変更しない）。新規sourceは22件で、旧12fileの保証を置き換えない。build・type-check・変更TSのESLintはexit 0。

固定distのcompiledは新規1本と既存11本の計12本成功。各childの元60,000ms期限を維持し、全てexit 0・signalなし・実行errorなし。実測は新規375ms、seed802ms、handlers8,455ms、pin3,260ms、generation163ms、construction587ms、control91ms、facts55ms、pure54ms、workflow74ms、status71ms、session78ms。source fallbackは使わず、新規d.ts漏出検査も通過した。

旧14関数本文・4exportは基準HEADとbyte一致。初回の一時scannerは再exportを数えず3と報告したため、その検査器を補正して4exportを再照合した。製品側exportを変更したものではない。

一時cacheを当該コマンドだけに指定したoffline／ignore-scriptsの梱包dry-runは441file。testsとabort-scope-evidence系は配布対象外で、配布JS109fileへ新検査／fixture名が混入しないことを確認し、一時cacheは削除した。依存・package／runner・期限・並列度の設定変更はない。

最終レビューでは新変異器のanchor driftをoracleの検出成功と混同しないよう、変異生成を期待例外区間の外へ分離した。semantic不正7行も各行1診断を個別照合した。補強後の新規source22件（1.53秒）と新compiledは再成功し、関連13fileも改めて401件成功（12.76秒）した。4文書のlocal link44件・表20個・設計ID49個と、意図した9fileだけの変更・stage0・末尾改行／差分空白を静的確認した。

全体回帰・実Promise／実resourceの生成／終端・実backing容量／完全回収は今回の検証範囲外である。実origin leafのlive生成資格、実callback資格、native candidate安全確認・観測・固定abort／失敗終端は後続単位に残る。

## コミット対象だけの再検証（2026-11-18）

基準HEAD `a477987` のarchiveへ今回の9fileだけを重ねた分離snapshotで再検証した。依存は既存node_modulesを同じ実体で参照し、依存の再取得・更新や設定変更は行わない。開始時のSHA-256で対象内容を固定し、検証後も元作業領域とsnapshotの一致、HEAD不変を確認した。

- build・type-check・変更TSのESLintは全てexit 0。
- 関連13file・401件成功（11.75秒）。元の個別5秒期限・既定並列度を維持した。
- 固定dist compiled 12本成功。新規365ms、seed752ms、handlers7,949ms、pin3,098ms、generation159ms、construction580ms、control117ms、facts55ms、pure53ms、workflow70ms、status67ms、session75ms。各childの元60,000ms期限を維持し、全てexit 0・signalなし・実行errorなし。
- offline／ignore-scriptsの梱包dry-runは441file、配布JS109file。tests・private evidence root・新検査名の配布混入なし。一時cacheは当該操作後に削除した。
- 旧14関数本文・4exportは基準HEADと一致。検証記録の本追記もsnapshotへ反映して文書整合を確認し、対象外の変更は含めない。

この再検証は正式発行・全体受付・実Promise／実resourceの新経路・実接続の承認ではない。固定拒否・Unknown・調査保留を維持し、Pushは行わない。

## レビュー修正 2026年11月18日

レビュー修正の基準HEADは`3755cba`、修正時のHEADは`50a2ef1`。[旧root](../src/review/abort-scope-evidence-native-diagnostic.ts)の観測値post、[独立oracle](../tests/review/fixtures/native-join-execution-values-model.mjs)・[source試験](../tests/review/native-join-execution-values.test.ts)・[固定dist検査](../tests/review/fixtures/compiled-native-join-execution-values.mjs)と[接続差分設計draft-0.5](BEST_PRACTICE_NATIVE_DIAGNOSTIC_JRB_SEED_EXECUTION_TRANSITION_DELTA_DESIGN.md)を直した。

- 設計との不一致：値postはrefused・到達trueと、未到達refusedのreturn_lostを受理し、ET01が区別する到達前throw（threw・未到達）とregistering／busy・未到達を拒否していた。oracleも到達前throwを不正値として期待していた。refused＝未到達、returned＝到達、registering／threw＝到達前後とも可、return_lost＝到達後だけに直した。
- 追加対照：
  - 安定な各行を他の6variant名へ付け替える拒否102件（段階拒否は836件から938件）。
  - 境界の正常値を16件から20件（到達前throwと到達前registeringを各role）、拒否を76件から92件にした。追加した拒否は、refusedの到達、未到達のreturn_lost、到達なしのreturned、未呼出しconstructorでのentry、候補なしのunsafe_retained、原始値のsafe_same_work、held ackのobserverAck、未claimの登録workである。
  - origin leafで、保持field（executor closure・tuple・RecoveryAnchorのrun slot参照、cleanupのcontext record）を書き換えると拒否し、戻すと同originへ戻ることを確認（拒否は34件から41件）。
- RED：上の補強に対応する11変異（variant付け替え2件、失敗保持・観測関係5件、origin保持field 4件）は、HEADのoracleで11件とも素通りし、新oracleで全て検出した。新oracleをHEADの製品コードへ当てると境界対照が失敗し、修正後に通過した。
- 構文正常変異は14件から28件（上の11件と、到達関係の3件）。pinのbasisとidentityのcontextの照合は、凍結objectのため外から書き換えられず等価として変異に含めない。
- 最終確認：lint・型検査・build・`package-http-classification`はexit 0。vitestは全体で失敗0、compiled検査は全本成功し、各childの元60,000ms期限・元の個別5秒期限・既定並列度は変更していない。

この修正は値検査の整合だけで、constructor／entry消費・Promise生成・観測登録・固定終端・private公開・dispatchは引き続き未接続である。
