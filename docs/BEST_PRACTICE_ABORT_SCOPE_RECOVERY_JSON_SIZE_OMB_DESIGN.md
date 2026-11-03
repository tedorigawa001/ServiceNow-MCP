# OM-B bounded count-only JSON size 詳細契約

Version: br006-recovery-json-size-omb-draft-0.1 / Date: 2026-11-03。
Status: **設計のみ。合成依存限定の後続案。計数器・finalizeモデル・共有budgetへの接続は未実装。正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。**

基準HEAD: `9353ca2`。根拠は同コミットの[OM-A値層](../tests/support/review/synthetic-parent-omission-values.ts)、[CG-C設計](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_OMISSION_CGC_DESIGN.md)§5・8・11、現[finalizeAggregate](../src/review/aggregate-finalize.ts)と[集約schema](../src/review/aggregate-schema.ts)。作業中のsource差分は本設計の根拠へ混ぜず、変更しない。本書は数値候補を具体化するが、本番cap承認・実装・実接続・実通信・設定変更・Pushの指示ではない。

## 1 目的・数える対象・公式根拠

期待run全体をJSON文字列／UTF-8 bufferへ展開せず、compact JSONの論理UTF-8長と固定閾値との関係を計算する。計数対象は最終出力と同じrunのfieldだけ。OM-Aのoriginal_rows／trace／初期prefix、owner／receipt／model metadataをrunへ混ぜて数えない。元IPC envelopeの実受信量・heap占有・producer由来・full schema適合の証明ではない。

参照した公式仕様（2026-11-03閲覧）：

- [ECMA-262 第16版 §25.5.2.2](https://262.ecma-international.org/16.0/index.html#sec-serializejsonproperty)：JSON.stringifyにはtoJSONやreplacerを呼ぶ経路がある。本案はそれらを受けない限定subsetであり、汎用serializerの互換実装ではない。
- [同 §25.5.2.3〜4](https://262.ecma-international.org/16.0/index.html#sec-quotejsonstring)：文字列のquote／escapeを照合する根拠。
- [同 §25.5.2.5〜6](https://262.ecma-international.org/16.0/index.html#sec-serializejsonobject)：object／arrayの区切り、列挙、cycleの扱いの根拠。
- [Node.js Buffer.byteLength](https://nodejs.org/api/buffer.html#static-method-bufferbytelengthstring-encoding)：文字数とは別のencoded byte長を返す。独立試験のoracleに使い、計数器本体ではrun文字列の生成に使わない。

公式のlive draftではなくECMAの固定版を互換基準とする。実際の対象Node版・buildの既存JSON出力との適合は合成corpusで別途確認し、未試験の実装互換を主張しない。

## 2 値の受付と計数を分ける

初期の合成入口案は次の二段階。名称・型は未実装で、外部登録口ではない。

| 段階 | 契約 | 成功しても証明しないこと |
| --- | --- | --- |
| prepareSyntheticJsonSizeValue | bounded own-data検査・全graphのsubset検査・owned immutable値と有限shape統計を生成。rawはborrowの間だけ読み、callerをfreezeしない | 実capture／receipt／job／run origin、公開aggregateのfull schema |
| measurePreparedJsonSize | 同準備値を固定thresholdでcount-only走査。結果はvalue-only、body getterやJSON文字列を返さない | omissionの正当性、同wireの受信量、全体予算受付 |

**受付は値全体を最後まで検査する。** 最初の巨大stringで閾値超過を知っても、未検査の末尾にgetter／不正variant／cycleがあるrawをover_thresholdとして受理しない。受付完了後の計数だけが閾値で早期終了できる。受付途中の予算・期限・取消・上限超過は失敗であり、サイズ超過結果ではない。

OM-Aのvalue-only brandを、無検査でtrusted prepared inputへ昇格しない。initial版は新しい合成prepareで検査する。後続で同ownerの保護immutable値を再利用する場合は、別のprivate供給契約・epoch・費目の審査が必要。runtimeとfixtureの台帳は共有せず、旧root／summary／外部identityを登録しない。

## 3 対応subsetと拒否条件

対応はnull／boolean／string／有限safe integer、dense array、plain own-data objectだけ。objectはObject.prototypeまたはnull、arrayは通常Array.prototypeからowned値へ正規化する。全fieldはenumerable own dataとして扱い、non-enumerable field・symbol key・accessor・Proxy・疎配列・arrayの余分なkey・特殊prototypeを受付で拒否する。constructor／toJSON等を呼び出して変換しない。

undefined／function／symbol値／BigInt／NaN／±Infinity／非整数／boxed primitive／Date／Map／Set／typed array／raw-JSON特殊objectはunsupported。native JSONが無視やnull化できる場合でも、その救済は実装しない。optional fieldはown property自体がないこととし、undefinedを入れない。callerのreplacer／space／encoding設定は受けず、無改行・無indent・UTF-8固定。

cycleはancestor集合で拒否する。同じimmutable値が非循環で二箇所から参照される場合は、JSONへの出現回数だけ訪問・文字数を課金する。object identityでの重複排除／digest代用／長さcacheは初期版で使わない。key順はサイズ合計を変えないsubsetでも、早期終了・workの再現性のため固定builderの順序を維持する。array順は変更しない。

計数coreはpreparedな内部field列と値だけを読み、rawへのproperty lookupや列挙をしない。公式JSONとの対照はintrinsic／prototypeを汚染していない隔離試験条件で行う。inherited toJSON等がある環境をnative比較の前提に混ぜず、prepare／adapter境界で未対応として止める。global prototype変更を本工程の対策として行わない。

## 4 論理byte計数の規則

以下は公式JSONの表現をUTF-8で数えるための限定subsetの設計。文字列内容の正規化・改行置換・Unicode正規化はしない。keyにも同じ規則を使う。

| 値・文字 | 加えるbyte数 |
| --- | --- |
| null／true／false | 4／4／5 |
| stringの外側quote | 合計2 |
| quote・backslash、短形式の制御文字（BS／TAB／LF／FF／CR） | 1文字ごとに2 |
| その他U+0000〜001F、孤立surrogate | 1 code unitごとに6（Unicode escape） |
| その他ASCII／U+0080〜07FF／surrogate以外のBMP | code pointごと1／2／3 |
| 正しいsurrogate pair | 2 code unitを一緒に消費して4 |
| object／array | 両括弧2、隣接要素間comma各1、objectのkeyと値間colon各1 |

slash、U+2028／U+2029等を余分にescapeせず、孤立surrogateをU+FFFDへ置換しない。chunk境界でpairを分断しないよう1 code unitの持越し状態を設け、末尾の未対応leading surrogateは6として処理する。

numberはsafe integerに限定するため、0／−0は1 byte、その他は絶対値の十進桁数＋負数のsign 1。最大は17 byte。桁数は固定の10の冪との比較（最大16桁）で求め、任意objectへのToString／valueOfを呼ばない。非整数・指数領域の一般number変換は未対応とする。これらの式は後続の明示境界表とnative oracleで検証する。

string全体のencode／slice列／parts.joinは作らず、元immutable stringをcode-unit cursorで読む。run単位のJSON.stringify／Buffer.from／TextEncoderを計数coreへ導入しない。小さな固定stack・scalarだけを計数scratchとする。準備graph／key列のallocationは別費目であり、scratchが小さいことを総メモリ一定の証明にしない。

## 5 threshold結果・算術・post guard

本番に対応する値はB=262144、H=B−256=261888。合成pure計数のthresholdは0〜Bのsafe integerとし、最初のfinalize接続ではHだけを固定継続から渡す。callerのtool入力から任意thresholdやcapを供給しない。

結果案は閉じたunion：

- exact：同prepared epoch／model／thresholdに対応するbytes（1≤bytes≤threshold）、usage。値全体を計数済み。threshold=0ではexactを返さない。
- over_threshold：同epoch／model／thresholdとusageだけ。bytes／total_lengthは**absent**。超過を観測したが全長を計算したとは言わない。

サイズaccumulatorは常に0〜thresholdに保つ。次の寄与dについて`d > threshold − current`ならover_thresholdの局所候補へ進み、current＋dを先に計算してoverflowさせない。node／文字費／work／shapeの全加算・乗算もsafe integerのchecked arithmeticで、overflowはlimit失敗とする。閾値超過とwork／resource超過を同じvariantへ畳まない。

pre guard→計数→post guard→候補公開の順。over_thresholdを観測した場合もpost guardは省略しない。postで取消・期限・先行hardがあれば失敗を返し、over_thresholdを省略判断に使わせない。unknown例外は固定失敗へ写像し、raw値・schema issues・cause・文字列片を診断へ残さない。partial sizeをexactへ変えない。

## 6 中間graphの数値候補と導出

以下は**新しい合成subsetの保守的候補**。本番受付cap・実heapサイズの承認値ではない。現在のOM-A／schemaで受理する全ての値がこの候補に入るとはまだ主張しない。source／schemaが変わればmodelとoracleを再確認し、上限を自動拡大しない。

| 領域 | 候補・根拠 |
| --- | --- |
| asset | 行数≤100、各node≤262144・文字費≤786432、depth≤6。既存OM-Aの局所枠を上限候補として再利用し、正規化前後の統計差も実装時に検証 |
| header skeleton | assetsを空配列にした同run。node≤10000・文字費≤1048576の新しい有限枠。errors／assets≤100、limitationsだけ≤106（下記）、object key≤30、全run depth≤8 |
| 全measure view | N≤100×262144＋10000＝26,224,400。C≤100×786432＋1048576＝79,691,776。header skeletonにroot／assets配列nodeとassets keyを含め、asset子graphだけ加える |
| 文字の単位 | Cはstring／keyのUTF-16 length×3。U＝C÷3の整数上界。UTF-8 byte数・heap byte数とは異なる |
| その他array | limitations以外は各schemaの固有上限かつ≤100。106をfindings／assets／errorsへ流用しない |

headerのlimitationsはOM-A出力≤103を入口候補とし、finalizeで未存在のfinding_budget_exceeded／response_truncated／error_details_truncatedが最大3増える場合まで保守的に106を予約する。これは関連条件を使わない粗い上界で、106件を公開JSONとして受理する変更ではない。dedup後に既存full schemaの≤100等を別途検査する。soft回復等の非省略warningはfinalize入口prefixへ既に反映済みでなければならず、途中追加はこの3件枠へ隠さない。

header枠の十分性、key上限・depth、max schema文字長、正規化後graphのnode／文字費は独立corpusで証明・検査するまで未確定。候補外はlimit停止し、黙って大きなprofileへ切替えたり、warning／fieldを削って通したりしない。上界は大きく、現実的に時間内で扱える枠を意味しない。

## 7 共有予算・checkpoint・費目所有

controlはJSON入力とは別の内部境界に置く。初期実装はfresh合成budget／stopだけを注入し、runtime sessionへ登録しない。prepareと全measure反復が**同じ**budget／stopを使い、呼出しごとの予算や時計のリセットは禁止。後続owner接続では同receipt／runへのbindingと同期失効を必要とするが、pure型だけでその証拠を発行しない。

node／key／indexの次の訪問・stack確保・string chunk走査前にwork／resource枠を確保し、pre／post checkpointを通す。stringは最大256 code unitのchunk、surrogate持越しは次chunkの課金を消費してから読む。各node／chunkと入口・返却直前に停止を確認し、guard中の再入・throw・未知停止を固定失敗とする。hard取消／全deadlineをover_thresholdや省略へ格下げしない。

| 費目 | 所有者・扱い |
| --- | --- |
| raw受付・owned化・全graph検査 | prepare owner。copy・native key列挙・schema検査・freeze・shape統計・key列allocationを課金。早期overで免除しない |
| count-only走査 | measure owner。node／edge／key／code unit／数値桁比較／区切り・accumulator／checkpointを課金。出力bodyは作らない |
| header更新・asset省略・recount／coverage | finalizeモデルowner。count内部へ隠さず、固定順で別に課金 |
| full schema／内容比較／移譲／discard | 後続gate owner。既存CG-A／RD-B03との二重計上・未計上を区別する |

count側の論理work候補は、訪問node N、object key出現K、key／stringのcode unit和U、number Q、処理chunk数Tに対し`12N + 6K + 2U + 32Q + 8T + 64`。これは実装前の保守的イベント式であり未検証。独立イベントoracleで実課金≤式を確認し、各定数の費目所有と停止経路を検証して初めて採用する。受付・schema／freeze・allocation費をこの式に含めたとはしない。

受付・反復全体の総work／allocation必要量、本番の承認capはUnknown。native key列挙・一括schema parseをcheckpointで中断できると主張せず、それらの有限な受付枠と実行場所も後続で審査する。全体60秒・210試行・C/G/P／retryを変更せず、別timerで期限を延ばさない。

## 8 固定Eのfinalizeモデルへの接続

1. 同manifestの親処理後assetsと固定header／prefixからprepared viewを作る。元captureは別に保持するが、original_rowsをfinish入力へ再投入しない。
2. 同finish応答の既存時刻検査で受けたEを一度pinし、ended_atへ設定する。初期pure試験は固定EのDATAだけで、実jobの時刻証拠とは呼ばない。S／O／T_i／U／全deadlineと元会計prefixを変えない。
3. finding順走査→recount／analysis_completeの現source条件を再現してから、Hで測る。over_thresholdのときだけ末尾reviewedを一つomitし、warning／error・coverage・countsを更新した新view epochへ進む。
4. 同epochのexactだけをそのviewの閾値成立に使う。省略・prefix・counts変更後の以前のsize結果は再利用しない。長さが単調減少するという仮定で測定を省略しない。
5. byte省略は元reviewed数R以下、測定はR＋1≤101回。各回同budgetで課金し、必要枠不足なら停止する。reviewedなしでoverなら既存相当の固定失敗。
6. H以内の確認後だけlimitationsを初出順dedupし、full schemaを検査する。dedup前overをdedup後のサイズで救済しない。後続wire側のB・同bytes検証も省略しない。

各epochは固定ownerの更新とheader delta／asset slot overlayを使う案とし、元本文graph全体を反復ごとにdeep cloneする方式は採用しない。初期pure実装でimmutable overlayの安全性が未証明なら、boundedな再準備費を明示して止め、readonlyという名前だけで費用を0にしない。OM-AのB事後serialize検査の置換も別範囲とし、自動では行わない。

## 9 合成試験・独立oracle

- exact：null／boolean／0／−0／±1／10の冪の前後／±MAX_SAFE_INTEGER、空／複合array・object、key順だけの変更を固定byte表へ照合。native JSON.stringify＋Buffer.byteLengthも独立対照として実行し、モデル自身から期待値を作らない。
- Unicode：全制御文字、quote／backslash／slash、ASCII・2／3／4-byte、U+2028／2029、孤立leading／trailing、pair・連続surrogate、chunk境界255／256／257とpair跨ぎ。keyとvalue双方、文字列／code pointの正規化0を確認する。
- threshold：0／1／H−1／H／H＋1／B、exact端点・最初の超過、compound内の後半超過。over結果にbytesが存在しないこと、誤ったtotal長をtraceへ残さないことを検査する。
- 全体受付：閾値超過しそうな先頭の後ろに不正field／getter／cycleを置いてもprepareは拒否。unsupported値・prototype／symbol／accessor／non-enumerable／疎配列・raw JSON特殊objectは救済せず、caller callbackは呼出し0回。
- bounds／算術：node／文字費／key／array／depth／header106枠の各端点と超過、shared aliasの出現課金、cycle、計数／work arithmetic overflowを対照にする。巨大objectのnative列挙限界は未証明として記録する。
- stop：prepare／measureの全pre/post、256-unit chunk間、over観測直後の取消・期限・throw・再入。停止・予算超過とsize超過を混同せず、先行hardを保持する。
- epoch／同budget：copied prepared handle・別owner／budget／stop・旧epoch／summaryからの再利用、反復予算リセットを拒否する合成owner試験を後段で行う。pure値成功をorigin証拠に昇格しない。
- finalize対照：固定E・finding境界・末尾選択・errors99／100・warning重複・dedup前後で閾値を跨ぐfixture・全省略でもoverを独立表で検査。現sourceの分岐・定数driftと意図的な変異でも失敗する対照を維持する。

native oracleは十分小さい合成corpusに限り、サイズ計数器本体の実装として流用しない。ここに挙げた試験は計画であり、今回のMD作成で成功した保証ではない。

## 10 最初の実装範囲・承認待ち

| 分割案 | 最初の成果 | 未対応のまま残すもの |
| --- | --- | --- |
| MB-A | 限定subsetのstrict準備値・shape／数値cap検査と独立corpus。大きなrunをserializeしない | 同budget／stopのruntime接続・証拠 |
| MB-B | count-only core、exact／overの型、UTF-8／escape／整数、256-unit checkpointとfake control、work oracle | finalize・OM-A置換・full gate |
| MB-C | 固定Eの非実行finalizeモデル・反復epoch／同fake budgetと順序／副作用対照 | ParentOmissionDecision・実finish job・候補 |

承認／検証待ち：header node／文字費枠・106枠のsubset十分性、整数／Unicode互換と対象Node、所有graph／epochの型、受付の実allocation上界、各定数workの独立証明、共有budgetの供給元、同期schema処理の中断場所、full比較／RD-B03 coverageとの接続。候補の数値を確認済み・本番承認済みへ昇格しない。

次の実装はMB-Aから個別に指示を受ける。本工程はMDと親設計書の参照更新だけ。正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持し、実装・実接続・実通信・実機操作・設定変更・トークン／Permit／候補発行・Pushは行わない。
