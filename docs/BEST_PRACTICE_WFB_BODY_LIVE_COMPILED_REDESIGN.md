# WF-B body-live：compiled試験の反復変換・import見直し

Version: draft-0.5 / Date: 2026-11-13 / 元設計の読み取り基準HEAD: `b6682faad7bf33f1f36b0c85214a17dc3d7bf116`。レビュー修正基準HEAD: `8087efd`（draft-0.1）／`4c0c1f9`（draft-0.3）。BL-A実装開始HEAD: `8087efd`（文書更新時に別作業の`dcfc6f8`を保持）。BL-B基準HEAD: `967c7d8`。

draft-0.3のレビュー修正：§9のBL-A境界に一時変異17件を入れ、12件が生存した。入力から到達できる生存5件（BC06〜10分岐の重複、branch 11の`v`束縛と`n === 11`先頭の2条件、TS側anchorの一意性、入力上限の境界値）へ対照を追加し、各対照が該当変異をkillすることを確認した。試験側の形比較が単項演算子の種類を比べていなかったため、比較に追加した。生存の残り7件は固定台帳では到達できない防御、または等価で、§10に区分を記録した。契約・BR01〜10は変えていない。

draft-0.1のレビュー修正：§2の304module内訳を一時コピーの実行で照合した（固有module名304個、群別件数・最終summaryとも一致）。同じ実行でload区間を段階別に計測したところ、変換が支配的でimportは小さかったため、§1に計測値と、それに基づくA／Bの見込みを追記した。設計時に比較していなかった代替変換器の案と計測値を§1の比較表に加え、§8末尾の「作成時点でコミット未実施」を記録後の状態に合わせた。§2〜7の契約・受入条件は変えていない。

Status: **BL-Aに加え、§11のBL-B別試験経路を合成依存限定で接続。通常経路は未切替、BL-Cの全体採用判定は未実施。** §1〜10の未実施記述は各作成時点の履歴として保持し、最新の実装範囲は§11を参照する。正式発行口・C実行入口・body起動は閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。実接続・実通信・設定変更・Pushの承認ではない。

対象は `tests/review/fixtures/compiled-probe-body-live.mjs` の試験設計だけ。製品・composition fixtureの生成／停止／所有権契約、既存factory／export、BC06〜11の期待値、独立Vitest、意味診断19行、各compiled processの60,000ms期限は変えない。親は[live slot／bundle設計](BEST_PRACTICE_WFB_BODY_LIVE_SLOT_BUNDLE_DESIGN.md)、履歴は[Initial検証記録](E2E_BEST_PRACTICE_WFB_BODY_LIVE_INITIAL_2026-11-10.md)、性能根拠は[HEAD対照・レビュー再計測§8〜9](E2E_BEST_PRACTICE_WFB_BODY_PIN_RETURNED_CLOSED_2026-11-13.md)とする。

## 1 根拠・仮説・選択

既存記録の安定負荷下では基準約40.0秒／対象約40.6秒、変異ごとのload区間は304回で約95%を占める。負荷変動時には基準58秒台／対象timeoutもある。約40秒という値は履歴であり、本書で再実測した値でも、全環境での上界でもない。起動経路差とGCの寄与は未確定。型・field追加による約1.4%の差を特定の非線形退行と断定しない。

レビュー時の段階別計測（`8087efd`の一時コピー、Nodeを直接起動、1分load約4.5、1run）では、304回のload区間のうち`transpileModule`が38.0秒（全体42.3秒の約90%）、ファイル書込みが1.0秒、importが1.3秒だった。費用の大半は主fixtureの反復変換であり、import自体は小さい。1runの値で上界ではないが、Aで変換を1回にすれば変換費の大半が消える見込みで、import数を減らすBが必要になる可能性は低い。Bは引き続きAで不足した場合だけの条件付き案とする。

ユーザーが選択した方針は試験設計の見直しであり、期限延長・case削減・負の対照削除ではない。主仮説は「大きな同一fixtureの反復transpileを避ければ、実際に異なる304個の実行moduleを維持しても余裕を増やせる」。これは将来の比較で検証し、成功済みと扱わない。

| 案 | 主fixtureのtranspile／固有import | 補助2module込み | 選択・追加責務 |
|---|---|---|---|
| 現行：TS変異ごとに全体変換 | 304／304 | 306／306 | 比較用の旧経路。303変異・観測module＋基準1 |
| A：emit-once＋JS段階の局所patch | 1／304 | 3／306 | **先に採用を検証する案**。TS変異との対応を固定し、別URL／別module状態を維持。import回数は減らないと明記 |
| B：隔離capsule factoryへ集約 | 1／1 | 3／3 | Aでも不足する場合の条件付き案。304個の新しいlexical状態をfactory呼出しで作る。module境界変更の追加検証が必要で、Aの実装範囲へ混ぜない |
| 参考C：TS変異のまま変換器だけNode組込みへ置換 | 304／304 | 306／306 | **比較用に記録する未採用案**。`node:module`の`stripTypeScriptTypes`を使う。strip modeはこのfixtureで`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`、transform modeはbaseがlive_heldまで動き1回約32ms（同計測のtsc 1回約201ms、本番平均約125ms）。TS→JS対応の保証責務はほぼ不要になるが、実験的APIで警告が出る。変換器がtscから別実装へ変わるため、出力の意味同等性の検証が新たに要る。短縮量はAより小さい見込み |

数値は通常の本試験に必要なローカルmoduleの計画値であり、Node builtinの読込み・移行監査・TypeScriptのcreateProgramを含まない。Aの短縮量、Bのメモリ削減／速度はUnknown。Aが受入条件を満たせば、import削減は必須にせずBへ進まない。304回を単純なcache共有に置き換える案、複数mutantの同時有効化、並列化による見かけの短縮、試験分割による期限枠の増設は採らない。

## 2 維持するcase台帳と期待値

304は変異だけの数ではなく、現在のload呼出しから得るmodule数。以下を固定の移行台帳として使い、case IDは旧module名・対象class／method・対象節・故障script・patch列・期待観測へ一対一対応させる。数だけ一致する別case集合は不可。

| 旧群 | 固有module数 | 保持する判定 |
|---|---|---|
| base | 1 | 正常live_held、後続の正規拒否対照。毎runは新しいassembly |
| field | 56 | BC06〜11の8／5／9／10／11／13関係節。単独除去で対応する不正値がlive_heldになる |
| copy／brand／fixed／writable | 24 | 各6。identity・brand・参照descriptor・進行writableを別々に確認 |
| prior-stage／prior-copy | 180 | 前段位置45組（5＋6＋7＋8＋9＋10）×故障のみ／検査除去の2経路×2種 |
| preflight | 14 | 元base・対象空・suffix・最終検査の7組×2経路 |
| 単項観測 | 5 | missing-issued、readonly-ref、live-write、rejected同参照、diag-first |
| live-prefix | 18 | shell／carrier／suffixの9節×故障のみ／検査除去 |
| descriptor／projection | 6 | 非列挙、拡張可能かつnon-configurable、許可外phaseの各2経路 |
| 合計 | 304 | 基準1＋303。補助module2は別に数える |

既存の最終summaryはfield56、brand／copy／fixedReference／writable各6、priorStage／priorIdentity各45、preflight7、livePrefix9、型拒否19と既存の保持・readonly・projectionフラグを維持する。各群のsummaryだけでcase省略を隠せないよう、固定台帳とのID集合・順序・完了集合も照合する。

故障のみ経路は元first・最初のphase／boundaryを要求する。除去経路は従来どおりlive_heldまたは**元の最初の拒否位置の消失**を要求し、後段の別guardによる拒否を元guardの感度と読み替えない。TypeErrorをconstruction_unconfirmedへ写すreadonly試験とbinding_mismatchになるInitial値変更を区別する。先行state_invalid・close後の同reply・初回rejectedとcurrentの同参照も削除しない。

## 3 A案：一度のemitと、同じcaseの局所JS変異

### 3.1 固定scheduleと所有

将来の本試験は、期限開始→同一runのsource読取り→台帳／anchor検査→主fixture1回emit→補助2module各1回emit→base import→旧順の303moduleを順次patch／write／import／assert→元TSの意味診断→完了summary→finallyのscratch除去、の順とする。読取り・emit・台帳生成・import・意味診断を60秒の外へ事前移動しない。永続cache、前runのemit済みartifact、distの古いコピーを利用しない。

元TS・同一runのimmutableな基準JS文字列・台帳は試験driverが所有し、各caseは基準JSから独立に生成する。fault＋bypassのcaseでは、そのcaseの固定patch列だけを適用する。前caseのmutated textを次へ持ち越さない。base文字列もin-placeで更新しない。

### 3.2 TS→JS対応の固定

ES2022のnative private fieldを保持し、現在と同じES2022 module出力を使う。TS上の`private method`は出力で`private`修飾が消えるため、旧文字列を全域replaceする方式をそのまま流用しない。class名・member名・BC番号・対象式の形と出現数をTS／emitted JS双方から照合し、固定した局所範囲だけを対象にする。

| patch種別 | JS側の移行契約 |
|---|---|
| 関係式／guardの除去・定数化 | 同じmethod・同じBC分岐の同じ節だけを置換。短絡順序・残余式・副作用の順は不変 |
| 固定位置へのfault挿入 | bodySeedPoint等の元代入直後、同phase／boundaryの条件の中だけに元のfaultを挿入 |
| 代入削除／生成方法変更 | issued捕捉の代入だけを消す等、元caseのpatch列と同じ順・同じ意味に限定 |
| inspectの観測追加／projection変更 | rejectedSameの観測fieldやphase echoだけを変え、判定本体や先行拒否を変更しない |
| TSの`as any`等 | 固定の型assertion消去だけを許す。動作を代替するhelper・任意callbackへ変換しない |

anchorが0／複数、method／分岐移動、未知構文、重複case名、旧patch対象消失は`transform_drift`として即時不合格。元試験と同じ「そのcaseの生成に失敗した」であり、負の対照によるkillではない。自動検索範囲拡張・未対応caseのskip・期待値の補完・古いJSの再利用は不可。

TS変異→emitと、基準emit→JS変異が同じ実行変化を表すことは新たな検証責務になる。移行時は旧経路を保持し、同一入力・旧case台帳の全304moduleの観測を新旧で比較する。局所ASTの差分が承認した対象だけであることも独立に照合する。比較oracleは新patch生成器の出力から期待値を作らず、旧scriptのpatch列と手書き期待値を基準にする。

新旧はそれぞれ独立のprocess・同じ60,000ms枠で実行する。旧がtimeoutして対応caseの観測を得られなければ、そのrunを等価確認済みとしない。新経路だけのcode 0では対応保証を完了にしない。移行監査の旧反復emitを将来の通常試験へ恒久的に重ねない一方、本試験の仕事を別枠へ逃がして速度を主張することも禁止する。

### 3.3 独立性と負の対照

303caseはそれぞれ固有のscratchファイル名と新しいESM URLへimportする。異なるcaseが同じJSになってもURLを共用しない。namespace／class static初期化・Symbol brand・module内access継続／台帳を再利用せず、同一caseを確認用に再実行する場合にも新しいrun／URLを用いる。既存baseを複数scriptで使う箇所だけは旧挙動どおり維持し、毎runのassemblyは新しくする。

現在の補助2moduleは値検査／凍結した固定配列・純粋関数の共有に限る。mutable registry・owner参照等が増えた場合は再評価を必須とし、共有安全性を名前やコメントだけで認めない。builtin・グローバルprototypeは変更しない。

loader自身の負の対照として、同URL再利用、前caseのtext持越し、patch no-op、別caseのpatch／script対応、二重patch、重複／欠落ID、patch anchor消失を意図的に与える。各々で移行検査または元の期待値assertが失敗することを要求し、構文／importエラーを意味上のguard感度へ数えない。case Aの失敗・close・再prepare後にcase Bのbrand・first・prefixが初期状態であることも確認する。

意味診断はcapsuleや変換済みJSでなく、元fixture TS＋既存19行を同じstrict設定でcreateProgramへ渡す。元TSのbaseline診断0、既存の拒否行集合19を維持し、JS変異の成功を型保証の代替にしない。独立Vitestの既存caseも残す。

## 4 B案：import削減を選ぶ場合だけ必要な追加境界

Aで十分に余裕が得られなければ、別工程でscratch専用capsule factoryを検討する。単に同じESM namespaceをcacheして304caseへ配る方式は不採用。factoryを1回importし、各caseでmodule本体相当のlexical scopeを新規生成する方式に限定する。

factory内へ元moduleのclass・mutableなaccess継続・Symbol・Map／Set・静的初期化・固定dataを**全て**配置し、呼出しごとに初期化する。外へ残せるのは確認済みの純粋importだけ。同runでimmutableに固定したcase IDに対応するpatchだけが有効で、後から切替可能なglobal mode／setter／prototype差替えは作らない。選択用分岐を導入するならその有効化自体を独立の検査対象とする。

返せるのはscratch内のbody-live試験driver用の固定factoryだけ。別caseへの参照・brand／registry・private access継続の流出は禁止する。元TS／runtimeには新export・friend・mode・登録口を追加しない。既存のexport保証は元moduleを別に維持する。

必須追加条件は、全304caseのA／旧経路との一対一対応、caseを逆順・反復しても独立、case間の同値copy／brand／owner混入拒否、static accessの別scope確認、case生成途中throwが次caseへ残らないこと、原始global非更新、top-level await／import.meta等の新依存検出で固定拒否、である。304個のlexical生成費は残るためimport数3だけを根拠に性能改善済みとしない。これらが成立する具体変換・実測はUnknownで、本書だけではBの実装方式を確定しない。

## 5 期限・出力・終了観測

各compiled processの上限60,000msは不変。最初の起動から測り、作業段階ごとやcaseごとにdeadlineを更新しない。別の移行比較runを設けても、通常試験を複数processへ分割して合計予算を増やさない。取消後は次case・新emit／importを開始しない。終了確認の有限cleanup枠はassertを続ける実行枠ではない。

将来の親採取器はstdout／stderrに生成直後からdata listenerを接続し、保存上限到達後もdrainを続ける。上限超過はtruncatedとして保持し、未採取／空出力／最終summary受理を区別する。上限は各64KiB、通常の最終summaryは1個の有限JSONとする。通常出力にsource本文・生成JS・参照・raw例外を含めない。

進行観測はstart 1件、source完了／emit完了の2件、8群の開始／完了16件、semantic開始／完了2件、summary 1件の固定最大22件に限定する。各eventはrun／群ID・単調時計・当該群の最後に完了したcase IDと件数だけ。無制限なcase別stdoutを追加しない。必要な詳細比較は有限なin-memory台帳で行う。実装時に実emit回数・固有import回数・完了ID集合を独立に照合し、summary counterだけを信用しない。

子processのexitとstdio close、終了code／signal／経過時間、今回所有するprocess groupの消滅を別に記録する。負荷は同じ間隔でload・CPU・sampled RSS・free memoryを取り、free memoryをmemory pressureと同一視しない。timeout時のSIGTERM／必要ならSIGKILLと、2回のgroup不在確認を残す。許可のないprocess操作・起動経路／OS設定変更は行わず、観測不可なら終了未確認として失敗を保持する。

## 6 60秒期限での受入条件（全て将来・未実施）

| ID | 必須条件 |
|---|---|
| BR01 | §2の304個のID／順序／patch列と全期待観測を新旧で照合。case省略・重複・catchによるassert無効化0。意味診断19行と元TS診断0を維持 |
| BR02 | 関係節・descriptor・前段／suffix・issued保持・readonly／Initial変更・rejected同参照・先行診断・projectionの全負の対照を維持。元の最初の拒否位置への感度を保持 |
| BR03 | 各変異は同runの基準JSから生成し別URLへimport。fresh状態と§3.3のloader負の対照を確認。複数patchを累積して他caseの拒否でmaskしない |
| BR04 | emit-once／局所patchの対応失敗はtransform_driftで停止。TS変異と異なるJS変化、未知構文、anchor消失を成功・killへ数えない |
| BR05 | Aの本試験は主fixture emit1＋補助emit2、主fixture固有import304＋補助import2、意味診断program1。移行監査の追加費は別に記録し、本試験の事前処理を期限外へ移さない |
| BR06 | 同一HEAD／依存／Node／起動経路で旧→新→新→旧の比較を行い、code・全summary・負荷・時間・終了確認を採る。旧が未完了なら移行同等性を未確認として残す |
| BR07 | 新経路の安定負荷下の独立3runと通常並列回帰の全てで、60,000ms以内のcode 0・全summary受理・子process終端を要求。既存の他試験の期限／並列度を緩めない |
| BR08 | 安定負荷下の新経路3run各30秒以下を改善目標とする（60秒への約2倍の余裕）。30秒は設計上の目標で未達でも期限を延長しない。30〜60秒なら機能条件の結果と余裕不足を分け、見直し完了とはせず追加削減／B再設計を判断する |
| BR09 | drainの既知負の対照・上限超過／未summary・親exit先行／stdio未close・timeout／取消を確認。出力未採取の0byteを空出力としない。対象groupの終端未確認を成功にしない |
| BR10 | 元fixture・runtime・export・独立Vitestの保証を維持。変更対象だけのbuild／strict／関連合成／既存compiled回帰・梱包監査を行い、fixture／採取器の配布混入0。全体未実施は未実施と記録 |

30秒目標も通常並列の成功も任意の高負荷・将来のfixture増大で60秒以内となる保証ではない。受入時のfixtureサイズ・依存版・起動経路・負荷域を残し、以後サイズ増大やtimeoutがあれば同じ期限で再評価する。性能値を実E／S・全体work cap・物理allocationの証拠へ昇格しない。

## 7 実装する場合の分割と停止条件

1. **BL-A：移行台帳・JS patch境界**。304対応・局所patch・独立oracle・drift拒否を先に検証。旧試験を残し、通常経路は未切替。
2. **BL-B：emit-once loaderへ接続**。fresh ESMと意味診断を維持し、新旧同条件比較・出力drain・終了確認を行う。旧の意味上の保証と実測の両方が揃うまで置換を完了にしない。
3. **BL-C：期限内回帰・余裕判定**。BR01〜10・関連回帰・梱包確認後に採用判断。目標未達なら原因内訳を記録し、import削減が必要か判断する。Bを暗黙に開始しない。

試験sourceやemitterの変化で対応が崩れた場合は固定拒否し、保証を減らして通さない。旧試験を恒久的に二重起動して性能問題を戻さず、移行後も旧対応台帳と再検証方法を残す。旧経路を撤去する時点は別途レビューする。

## 8 今回の文書作業と未確認事項

本書は設計だけであり、試験script・fixture・emitter・loader・採取器・CHANGELOG・設定は編集しない。新旧試験・再採取・build・梱包は実行しない。304の内訳は現行scriptの静的読取りによるもので、本作業で304caseを実行した件数ではない。

残る未確認事項は、JS patchとの可換性の全case実証、実時間／GC／メモリ改善、自然負荷下の余裕、Bの隔離変換、実OOMと診断必着である。正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持し、開始claim消費・実受理・G_R／G_A・C-03・構築ready・body起動・実接続／実通信・設定変更・Pushは行わない。draft-0.1は作成時点でコミット未実施で、その後 `8087efd` として保存された。

文書検証：本書・親設計・既存検証記録の3文書で、ローカルリンク15件、表18個の列数、304moduleの内訳、BR01〜10の連番、末尾改行／差分空白を確認した。親設計の追加参照以外の本文と既存検証記録の履歴は保持し、src／tests／package／lockfile／CHANGELOGに差分なし。これは文書整合だけの確認であり、短縮・case等価性・将来受入試験の成功ではない。

## 9 BL-Aの値境界・移行台帳限定実装（2026-11-13）

package除外fixture `body-live-migration.ts` に、固定順の304caseとmember／branch／from／toの局所patch列を追加した。全caseとpatch列はfreezeし、任意patch・外部callbackの登録口は設けない。`createBodyLivePatchBoundary` はprimitiveな元TS文字列（最大1,048,576 UTF-16 code unit）を受け、同runで一度だけES2022へemitする。元TS／JSの唯一のCanonicalGateDraftRoot、唯一のmember・BC分岐、全caseの一意anchorを検査してから値生成口を返す。入力hookは実行しない。

元sourceはASTの実token位置から照合し、comment／string／regexp本文を式anchorにしない。TSのnon-null assertionと固定recipe中のas anyだけをJS用に消去する。各caseは保存した同じ基準JSから独立に構成し、変更範囲の重なり・no-op・不正構文・未知IDを固定transform_driftへ分類する。公開診断は固定pointと内部の既知case IDだけで、未知入力やraw例外をechoしない。返すJSは値であり、書込み・import・eval・source owner／実runへの登録は行わない。

独立oracle `body-live-migration-oracle.ts` は新builder／patcherをimportせず、旧scriptのSHA-256を固定し、旧literal表を限定AST decoderで読み、旧TS文字列のreplace／method／relation方式から参照変異を作る。全304caseのID・順序・script・member対応、局所JS AST、対象member以外の出力byte不変を照合した。局所参照memberだけをemitする監査であり、通常試験を別枠へ移した高速化ではない。旧script変更時は自動追従せずlegacy_script_driftで止め、台帳とoracleのレビューを要求する。

この段階では新規ESM URLへのmutant importを一度も行わず、source／namespace／brandの実行同等性、旧304caseの実行結果比較、既存19行の意味診断再実行、通常並列での期限達成・30秒目標は未確認。BR01の値対応・局所変化の部分を検証しただけで、BR01〜10全完了ではない。BL-Bで旧試験と同じ実行・感度・fresh module保証を接続し、BL-Cで性能／回帰を判断する。通常経路・既存fixture・既存compiled scriptは変更していない。別作業の§1の段階計測と参考C案を保持したが、今回参考Cの実装・採用は行わない。

drift／入力・recipe不変の合成試験と全304局所比較、新境界のcompiled値生成と7行の型拒否を追加した。詳細な初回失敗・修正・保証の限界は[BL-A検証記録](E2E_BEST_PRACTICE_WFB_BODY_LIVE_MIGRATION_BLA_2026-11-13.md)に記載する。正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持する。

## 10 draft-0.3のレビュー修正と等価区分（2026-11-13）

基準HEAD `4c0c1f9` の§9境界に一時変異17件を入れ、試験・compiled契約を実行した（終了後に復元）。killは5件（member重複、Identifier種別の正規化、string値、caseのfreeze、class重複）、生存は12件だった。

| 区分 | 変異 | 対応 |
|---|---|---|
| 入力到達・対照不足 | BC06〜10分岐の重複受理、branch 11の`v`束縛検査の除去、`n === 11`先頭検査の除去、TS側anchor検査の除去、入力上限の1単位縮小 | 対照5件を追加し、各変異で該当試験が失敗することを確認 |
| 固定台帳だけの防御 | no-op recipe、変更範囲の重なり、出力不変、出力の構文 | 現台帳と任意sourceからは到達しない。台帳編集時のfail-closed防御として保持し、試験済みの保証には数えない |
| 等価 | membersの重複除去（同一memberへの複数patchが台帳にない）、JSDoc除外（本fixtureで差なし） | 等価として記録 |
| 不要化した処理 | recipe走査のtemplate再走査 | AST token移行後はsource側で使われていないため削除。recipeにtemplateが入った場合はlocateで拒否する |

試験側の形比較は前置・後置演算子をnodeの属性として持つため、`!a` と `-a` を同じ形と判定していた。演算子の種類を比較へ加え、旧比較では失敗する対照で確認した。別途、読み取りだけの照合として、全304caseで旧方式（TS変異後に全体emit）の出力と新しいJS値を比べ、対象member外のbyte一致と、単項演算子を含む対象memberのAST一致を確認した（byte全体一致は65件）。これは一時scriptでの確認で、リポジトリの試験には追加していない。

anchor系のdriftでは、既知case IDを付ける箇所をそろえた。BL-B／C、mutant import、通常経路の切替は引き続き未実施で、正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持する。

## 11 BL-B：固有ESMと旧assertを使う別経路（2026-11-13）

`compiled-body-live-b.mjs`はopt-inの合成試験入口であり、旧`compiled-probe-body-live.mjs`や通常の呼出し元を変更しない。`body-live-driver.ts`が固定hashの旧scriptからscratch driverを派生し、loadのI/O部分・run結果の相関採取・一時領域・終了処理だけを差し替える。旧assert式の本文／順序と、意味診断19行の入力・options・assertは保持する。旧方式の対照も同じdriverでTS変異後の全体emitを行い、新方式と同じ相関観測を付す。旧entryそのものの無観測実行との時間比較ではない。

`body-live-esm-loader.ts`のsessionは試験用のload ownerであり実認証sessionではない。同source・固定台帳・同runの一時URLに結合し、case順序と渡されたTS変異が独立oracleの参照と一致してからwrite／importする。JS方式はBL-Aの基準JSから生成し、旧方式は従来のtscで変換する。URLはwrite前に一度だけ予約し、再利用・別case／別ownerのnamespace・factory再利用を拒否する。予約を失敗後やstop後に返さず、ESM cacheを再採用しない。

同じ絶対deadlineを全pre／postで使い、時計例外／逆行／期限、再入、I/O失敗、import中のstop、最終時計観測中の同期stopを固定firstに残す。停止後のnamespace公開・再開始は拒否する。通常経路の設定・実予算や正式なclaimを更新しない。

全304moduleに異なるESM URLとfactory identityを要求する。元run helperが返す385組の有限公開reply／snapshotを同じ順で採り、全体とcase別のSHA-256で照合する。観測は凍結plain data・dense array・有限primitiveだけ、1,024組／4MiBまで。getter／関数／Proxy・不完全graphをserializeせず拒否し、raw参照は出力しない。SHA-256照合は暗号学的digestによる照合であり、全観測値を永続保存したbyte比較とは区別する。

追加の2moduleは隔離対照だけで、304個の実caseには観測hookや混入口を加えない。この2つのscratch copyだけにprivate currentの差替え／capture継続を追加し、brandの別identity、close／診断の非波及、双方向のforeign参照・同値copy・Proxyの拒否、元参照のdescriptor不変、入力hook 0を確認する。これらのfriendは元fixture・runtimeへ追加せず、配布物に含めない。offerはfinallyで外すが、ESM cache／heapの物理退役済みとは主張しない。

payloadのtranspileは旧306（主304＋補助2）から新3（主1＋補助2）へ減る。別にdriver用support4moduleを各runで変換し、その費用も起動からの60秒に含める。304caseと補助2のimportは維持し、隔離対照2だけを追加する。Bのcapsule集約・参考Cの変換器変更は採用しない。

`compiled-body-live-compare.mjs`は旧→新→新→旧を直列で起動する。各childの起動前から60,000msを計り、64KiBずつのstdout／stderrを上限後もdrainし、期限後は所有groupだけをSIGTERM／必要ならSIGKILLする。最大3秒の後始末枠は実行期限の追加ではない。exit／closeとgroup不在2回を確認し、未確認なら次の試行を始めない。親が所有する一時TMPDIR内の生成物だけを終了確認後に削除する。

新旧実行・意味診断・停止試験の結果と初回失敗は[BL-B検証記録](E2E_BEST_PRACTICE_WFB_BODY_LIVE_LOADER_BLB_2026-11-13.md)を参照。BL-Cの安定3run／repository全体の通常並列回帰・通常経路への採用判断は残る。BR01〜10の全完了、任意負荷での60秒保証、実E／S／work上界・GC／OOM／診断必着へ昇格しない。
