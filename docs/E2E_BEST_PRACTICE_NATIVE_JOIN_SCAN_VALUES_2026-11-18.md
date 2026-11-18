# JR-B有限ID・固定schema・先行scalar／guard閉鎖値契約の合成検証

Date: 2026-11-18 / 実装基準HEAD: `a81534a`。
対象: [設計draft-0.2 §9](BEST_PRACTICE_NATIVE_DIAGNOSTIC_JRB_FIELD_ADMISSION_SCAN_DELTA_DESIGN.md)、[旧root](../src/review/abort-scope-evidence-native-diagnostic.ts)、[source試験](../tests/review/native-join-scan-values.test.ts)、[独立oracle／strict scratch](../tests/review/fixtures/native-join-scan-values-model.mjs)、[固定dist検査](../tests/review/fixtures/compiled-native-join-scan-values.mjs)。作業中に別コミット`c29d7d6`で入った親文書の参照更新は保持し、今回の変更と混ぜない。

## 範囲・保証の分離

実装したのは192 literal失敗IDの型／判定、readonlyの19node／131field型、固定primitive metadata／key照会、先行6scalarとreadonly initial／guard／counter値検査だけである。旧8scalarを含めて14scalarとなるが、追加6scalarへのwriterはなく、実値はnone／false／0のまま。既存JoinPrecallCheckの5値と旧固定拒否・3closure・14null aliasは変更しない。

selectorはfield_count・key_count・frozen・prototype・role・kind・orderを返すだけで、対象objectを受理・反射・読取りしない。subset／functionのkey_countは−1、null prototype期待値は文字列null、無効照会は実値null。9control IDだけcodeが固定され、field IDから原因や取得証拠を推定しない。新しいschema object／array・issuer・raw registration／friend・fixture台帳共有はない。

guardはrawRootを同creatorのcontrolRootと参照照合してから、同recovery・共有owner／中断・自roleのclaim／busy／拒否欄・有限counter・entry時lexical値の同値を読むだけである。native操作・state write・claim取得・中断通知・counter加算・entry捕捉・pre/post呼出しは0。sourceのguardは共有ownerがnoneなのでactiveを受理せず、scratch内だけで値を置いた正対照を使う。trueをscan開始・停止資格・全field受付へ昇格しない。

正式発行口／新LM03／C実行入口／body起動閉鎖、全体受付無効、通常経路未切替、Unknown、VM／監視／telemetry調査保留、LOAD6／LOAD7選択・AP01〜06未承認を維持する。scan実行・alias供給・Promise生成・観測／固定終端・private公開・dispatch・実接続・実通信・実機操作・設定変更・stage・コミット・Pushは行わない。

## 独立対照

| 対照 | 結果・意味 |
|---|---|
| initial値・所属 | 2roleで6scalarが初期値のまま、旧拒否後も不変。各scalar変更・recovery差替え・同値copyの8拒否。initial=trueも未使用配置の一致だけ |
| 有限ID | 192受理・77拒否対照。表外の位置・不正node／variant／桁・box／Proxy等を拒否。全switch caseも独立192集合と一致 |
| 固定schema | 19node×7欄＝133照合、順序付き131key、181不正照会拒否。source割当てASTのshell65・control／identity／pin／context shapeとも照合し、allocator field欠落を負の対照にする |
| 費目予約値 | metadataからrun126／cleanup131descriptor、key総数121／123、key比較6790／6795、scan操作予約291／307・tail込み303／319を別計算。実probeや実会計を更新した証拠ではない |
| counter | 16受理・25拒否対照。0／上限・整数・非数値／fraction／NaN／Infinity、0≦completed≦effectsとrole capを確認 |
| control code | 全192IDから固定codeを返すのは9個だけ。残るfield等はnullで、実原因を推定しない |
| guard単独変化 | scratchで6受理・42拒否、foreign hook0。root／recovery・owner／中断・各roleの4診断条件・counter／prefix・5entry値を一つずつ変更。停止済みの同値factsも値検査と実資格を区別する |
| hook・暗黙変換 | ProxyとSymbol.toPrimitive入力で、ID／schema／位置／counter／initial／guard／code照会のhook0。型確認より先に数値演算しない |
| capability／call graph | primitive selector・guard内のnode判定1call／counter判定2callだけ。反射・native・new／await・明示object／array生成・loop・状態write・operational caller0。能力／schema driftの8負の対照 |
| 変異・意味型 | JS構文正常の131key変異と39control／initial／ID変異を検出。型の正対照と不正10行でnode／field／ID／column／owner・readonly初期値を確認 |

表中の件数はoracle内assertionの区分で、source試験件数へ足さない。値表は製品switchから導出せず、別の固定辞書・順序・境界値を持つ。生成JSの変異位置・件数・構文は期待失敗区間の外で検査し、検出はAssertionErrorに限定する。偶発的ReferenceErrorやraw hookのErrorを「変異検出成功」と数えない。

既存callerや同ownerの実stateへ新しい開始継続は接続しない。fixtureコピーだけにprivate参照・primitive値配置を置き、schema／guard postがtrueでも製品のscan入口やwriterを作らない。guardの同値比較だけでは冪等stop event・本番live pin・元floorの資格を証明できない。

## RED・初回失敗と修正

- tracerは未実装markerで1件RED。ID／schema／counter・guardの各段階でも未実装関数のREDを確認し、値契約だけを追加した。
- 最初のtype-checkは新しい型2個のunused診断で失敗。初期owner literalとcounterのrole型へ限定参照を加え、runtimeの値やwriterを増やさず解消した。
- 初回の変異群ではguardのrecovery比較省略がoracleを通過した。実recovery参照だけを差し替える対照を追加した。位置のtypeof省略はhook Errorを直接返してしまい、限定したAssertionError検出にはならなかった。通常のno-hook対照をdoesNotThrowで囲み、hook実行を明示的なassertion失敗として扱った。
- 意味試験の正対照変数bが既存budget変数と衝突し、想定10行に加えて再宣言2診断が出た。正対照を独立blockへ置いた。その後、不正literalの4行はsuggestion付き2820であり、2322だけの期待が失敗した。実診断を確認し、10行の位置ごとに2820×4／2322×5／2540×1を厳密照合した。製品の型エラーや期限延長で救済したものではない。
- ID／schema作者用の一時読取りでMDの行抽出を誤り、JSON出力が上限を超えた。固定node行だけを選ぶ形へ直し、19行を確認してからapply_patchでsourceへ固定展開した。runtimeのMD読取り・生成器・自動登録を追加していない。

## 保証外

将来のscannerがselectorを呼べば、そのswitch比較・helper呼出し費もcoverageへ加える必要がある。今回のnative操作0は、将来の291／307操作予約や比較係数が実装済みという意味ではない。全field受付・readonly借用／handoff・拒否前scanの一度限り入場・再入時中断・実停止／live pin・failure tailの新接続・実会計・全体回帰は未実施／未接続である。

ownKeysの不正経路の内部割当て、新しいprivate関数closureを含む実backing容量、完全回収・最終discardもUnknownのまま。sourceに明示object／array／newを置かないことを、JS engine内の割当てやOOMがない保証として報告しない。

## 最終検証

- 新規source181件成功（単独5.46秒）。関連17file・734件成功（19.90秒）。前段の171件時点では意味試験の期待が失敗したが、上記の正対照scopeと診断codeを修正して再確認した。元の個別5秒・既定並列度を変更しておらず、file全体の実測時間と個別case期限を混同しない。
- build・type-check・変更TS2fileのESLintはexit0。新MJS2fileの構文確認もexit0。
- 固定dist compiledは新1本と既存14本が成功。新fixture最終版は9,360ms（source回帰との並列実行時）、131key＋39control／initial変異、8負の対照とprivate d.ts漏出0を確認した。既存14本の実測msはprecall1176、live3164、values842、seed1679、handlers10601、pin4012、generation191、construction71、control97、facts52、pure54、workflow70、status69、session76。全childは元の60,000ms期限内でexit0・signalなし・実行errorなし。
- 基準HEADと比較し、変更を内包するcreator2個以外の既存64関数本文と4exportはbyte一致。追加private関数は8個だけで、既存request／拒否writer／3closureへnew guardやschemaを接続していない。
- offline／ignore-scriptsの梱包dry-runは441file・配布JS109file、tests／private evidence root／新guard名の混入0。一時cacheはfinallyで削除し、依存・package／runner設定は変更していない。

文書2fileの相対link12・表8・既存設計ID31、末尾改行・差分空白を静的確認した。意図した7fileだけが変更され、stage0、依存・package／runner設定は不変である。別作業の親文書参照更新`c29d7d6`も保持した。全体回帰・scan実行・probe／会計更新・実停止／live pin・alias供給・Promise生成・実接続は今回の検証範囲ではない。今回の変更は未コミットで、Pushは行わない。

## コミット対象だけの再検証（2026-11-18）

基準HEAD `c29d7d6` のarchiveへ今回の7fileだけをコピーした分離snapshotで再検証した。既存node_modulesは同じ実体を参照し、依存の取得・更新や設定変更は行わない。対象のSHA-256を開始時に固定し、対象外の作業中変更をsnapshotへ反映していない。

- build・type-check・変更TS2fileのESLintはexit0。
- 関連17file・734件成功（20.46秒）。元の個別5秒・既定並列度を維持。全体回帰ではない。
- 固定dist compiled15本成功。実測msはscan-values4012、precall1185、live3182、values832、seed1613、handlers10502、pin4113、generation211、construction71、control98、facts53、pure55、workflow72、status68、session77。全childは元の60,000ms期限内でexit0・signalなし・実行errorなし。
- offline／ignore-scriptsの梱包dry-runは441file・配布JS109file、tests／private evidence root／新guard名の混入0。一時cacheは削除した。

検証後の追記は本節だけで、ソース・試験・依存・設定は検証済み内容と同一である。この追記もsnapshotへ反映して文書の静的整合と全対象の内容一致を確認する。各閉鎖条件・Unknown・調査保留を維持し、Pushは行わない。
