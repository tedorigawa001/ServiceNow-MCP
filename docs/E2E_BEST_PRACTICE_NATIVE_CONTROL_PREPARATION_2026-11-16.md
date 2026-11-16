# 旧rootのLinkと空JoinCell準備の検証記録

Date: 2026-11-16。基準HEAD: `02aac7c`。設計：[CF01〜05 draft-0.2 §12](BEST_PRACTICE_NATIVE_DIAGNOSTIC_CF_CONTROL_RESOURCE_DESIGN.md#12-空の内部保持と同owner検査の限定実装)。

## 実装範囲

[旧root](../src/review/abort-scope-evidence-native-diagnostic.ts)のprivate creator内にRootControlLink／RunLink／ResourceDutyとrun／cleanup用EmptyJoinCellを追加した。既存upper／writerの生成直後、raw依存を検査する前に、6fieldのholder→origin→root→run cell→run→cleanup cell→dutyの固定順で用意する。各実参照をholderへ先に記録し、6objectをshallow freezeする。holderを含む固定7objectで、子のupper／writerはdeep freezeしない。

生成時のcanonical constと、引数5参照・holder6参照を同一性で照合する。foreign／copy／Proxyはpropertyを読む前に拒否し、正規参照についてだけfreeze・全field・同root／run／joinの結合を確認する。constructorと既存execute入口の2か所で失敗を既存のevidence_binding_mismatch／bindingへ写す。execute closureが同pins／holderを保持し、public ownerや診断へ新fieldを出さない。

両cellのwork／resolverはnull、dispatchStarted／entered／settledはfalse。window／attempt／record／anchorはnull、readerIdentityはundefined、retentionはemptyのままである。startClaimed=falseはreadonlyの空値であり、旧startedの複製や新しいlive claimではない。旧runWork／cleanupWorkと実resourceには接続せず、既存workflowが実行されても新metadataは空のまま保持する。

先行join dispatch、新LM03、正式発行口／C実行入口／body起動は未接続・閉鎖、全体受付無効、Unknown、通常経路未切替、VM／監視／telemetry調査保留、LOAD6／LOAD7とAP01〜06未承認を維持する。実接続・実通信・実機操作・設定変更・Pushは行っていない。

## 試験の境界と独立対照

[source試験](../tests/review/native-control-preparation.test.ts)と[試験用モデル](../tests/review/fixtures/native-control-preparation-model.mjs)は、現在のcreatorから閉じた準備prefixを構文位置で取り出す。試験側だけでprivate参照を取り出して比較し、製品export・friend・登録口は増やさない。モデルは旧runnerの結果copyではなく、固定field集合・空値・同一性・生成順を期待値とする。

| 対象 | 確認した条件 |
|---|---|
| 同owner正対照 | 2creatorは別origin／binding、各holder・Link・cell・dutyは同canonical実参照。空cellは各ownerに2個 |
| 27拒否 | 5引数ごとのforeign／copy／Proxyで15、revoked Proxyで5、holderの6field置換で6、holder全体と引数のforeign置換で1。hook呼出し0、foreign上位snapshot不変 |
| 9変異 | 常時true、holderをidentityへ昇格、dutyのfreeze欠落、run kindの誤り、5引数の参照gate欠落を拒否。位置は一意なanchorまたはASTで固定し、driftは失敗にする |
| 6部分生成prefix | 各freeze直前で試験側が固定中断し、保持済みprefixとfreeze済みprefixを区別する。native HTTP観測なし。catch／保持の確認はscratch側だけで、製品の生成失敗回収ではない |
| 能力遮断 | prefixのnew／await／importとPromise・clock・native・queue等の参照を構文検査。Promise／timer／native constructor／clockを使えない条件でも準備は成功、禁止hook 0 |
| semantic型境界 | 正規prefixのstrict型検査は診断0。run／cleanup混同、Promise work、dispatch=true、実record、readonly書込み2件を拒否。6診断が挿入位置に一致 |
| 既存constructor | execute前のconstructor／closeでbudget・schedule・native操作0。新しい保持先をrawで渡す4caseはinvalid_input、発行0 |

[新compiled fixture](../tests/review/fixtures/compiled-native-control-preparation.mjs)は固定dist `.js`と`.d.ts`のみを読み、同prefixで27拒否・9変異・6部分生成prefix、private名の宣言非公開を確認する。実旧root全体を再構成した実行ではなく、型が消えた準備部分の保証である。TS／source fallbackや実classのfriend importは追加しない。旧workflow／source classの動作は既存source・compiled回帰を併存して別に確認する。

## 先行失敗と修正

| 段階 | 観測・切り分け・対応 |
|---|---|
| 最初のRED | 閉鎖準備markerが未実装で先行1件が失敗、exit 1。実装後に同試験が成功 |
| 能力遮断試験の初回 | global Promiseの差替えが試験後も残り、runnerの後処理を保留した。実行を中断してexit 130を観測。試験内finallyで差替えを戻すように修正し、製品の待機処理・期限は変更しない。OS process一覧の確認は権限制約で拒否されたため、この中断runの全子process終端は証明していない |
| 変異oracle初回 | 6件中5成功／1失敗。参照gateの文字列anchorがholder照合にも一致し、一意性検査が拒否した。変異位置を引数Identifierとcanonical IdentifierのBinaryExpressionへ限定し、製品を変えず再検証 |
| semantic型対照初回 | 7件中6成功／1失敗。run／cleanupの不一致は想定2322でなく2719を返した。実診断のkind不一致内容と挿入位置を確認し、期待する診断codeを訂正。型契約は緩めない |

以後の関連回帰は終了code 0を確認した。これらは試験側の後処理・anchor・診断期待値の不備であり、環境timeoutや製品退行へ分類していない。旧試験・期待値・元5秒期限・既定並列度は変更していない。

## 最終検証

commandはすべて`bdo`経由。現在のworktreeで実施し、コミット対象だけの別展開検証ではない。実装変更は旧rootだけで、既存source／compiled試験とbuild／package／runner設定に差分はない。

| 検査 | 結果 |
|---|---|
| `npm run build` | exit 0。既存tsconfigを使用、専用U/D buildではない |
| `npm run type-check` | exit 0 |
| 変更2 TS fileのESLint | exit 0。全体lintではない |
| source回帰7file | 222件成功・exit 0、1.24秒。旧211件と新11件を併存、期限・並列度変更なし |
| 新compiled準備prefix | exit 0、27拒否・9変異・6部分生成prefixと宣言非公開 |
| 既存compiled 5本 | VK01／02、BG01 pure、旧ND-01／02／03がすべてexit 0。各直接実行は外側60秒の上限内で終了 |
| 新`.mjs`構文 | modelとcompiled fixtureの2fileがexit 0 |
| offline梱包dry-run | ignore-scripts／offline、441file・436 runtime artifact。旧rootのJS／宣言／map 4artifactと試験modelの同梱0。準備marker／checker／modelのruntime参照0。file混入5＋参照混入3の8負対照を拒否 |

基準HEADとの機械比較では、追加した準備prefixとconstructor／executeのowner gateを除けば旧root本文全体が一致する。bridge4call site、旧runWork／cleanupWorkのqueue位置、元sample／floor、native操作・cleanup・claim・finallyは不変。新4型はcreator-localで、旧4export・strict入力・5faultと宣言surfaceを維持する。

更新した設計3文書と本記録のローカルリンク57件・表23個は、参照先欠落・列数ずれ0。末尾改行と差分空白も確認した。既存の作業中変更は開始時になく、今回の差分は旧root・新試験3file・CHANGELOG・設計3文書・本記録の計9fileだけである。コミットはまだ行っていない。

全体回帰、HTTP pack script全体、実tarball生成／展開、専用U/D/I/H artifact、新childのstdio／終了契約は未検証である。今回の梱包確認はdry-runであり、本番artifactからfriendを撤去した結果ではない。

## 残す実装gate

active JoinCellのPromise／resolver・先行公開とdispatch、実window／attempt／record／readerへの結合、固定cleanup／guard／終端との連続検査は次段階とする。その前に部分生成失敗を製品の同upper failure copyへ固定回収する保護区間と公開写像を確定する。試験側の6prefix保持を、その製品回収の実装済み根拠にしない。

RetainedDuty、未解決責務の外側custody／最終discard、moduleを跨ぐprivate継続、新LM03、旧UN62のcompiled移行、専用build・friend撤去とAP承認は残る。空の内部保持の成功をresource解放・正式binding・公開可へ昇格しない。

## コミット前の対象限定再検証

同日、今回の9fileだけをstageし、index全体を別の空directoryへ展開した。既存dist／`.git`は持ち込まず、導入済み依存だけを参照した。build・型検査・対象2 TS fileのlintはexit 0、関連7file・222件が成功（2.18秒）。新準備prefixとVK01／02・BG01・旧ND-01／02／03のcompiled計6本、新`.mjs`2fileの構文検査もexit 0だった。offline梱包dry-runは441file・436 runtime artifact、対象5fileの非同梱・3markerのruntime参照0、8負の対照拒否で成功した。設計3文書と本記録のリンク57件・表23個も欠落／列ずれ0。元の期限・並列度と各閉鎖条件を維持する。再検証後は本節だけを追記し、実装・試験入力は変更しない。全体回帰・実tarball展開は未実施のまま、Pushは行わない。
