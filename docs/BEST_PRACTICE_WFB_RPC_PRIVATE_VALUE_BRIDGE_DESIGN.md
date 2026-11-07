# WF-B RP-C 同AST接続と2V受付 計数診断保持の差分設計

Version: draft-0.2 / Date: 2026-11-07 / 照合基準HEAD: `81d23f3` / レビュー修正の基準HEAD: `cc0f410`。

draft-0.1のレビュー修正: 受入条件ごとに検証経路を付け、bytesから届かない経路と試験専用assemblyの決定順を明記した（§9、§10）。modelをplanへ入れないことと、post拒否の理由を固定した。structuralの別候補式を検証対象へ追加した（§4.2）。設計のみで、実装状態は変わらない。

Status: **設計のみ。RP-C・新しい計数API・受付計算器・試験は未実装。** [raw parser契約](BEST_PRACTICE_WFB_BOUNDED_RAW_JSON_PARSER_DESIGN.md)のRP-Bから、[strict値core](BEST_PRACTICE_WFB_SNAPSHOT_VALUE_CONTRACT.md)へ同じASTを一度だけ借用し、copy前の2V受付と失敗時の計数保持を組み合わせる。旧v1・正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。実装・証拠発行・本文保存・実接続・実通信・実機操作・設定変更・Pushを行わない。

## 1 現状と接続の前提

| 現行コード | RP-Cで必要な差分 |
|---|---|
| `SyntaxParser.run()`はframing後のfinallyでroot／stackを破棄する | rootが生きているframing後・finally前に固定継続点を置く。返却metadataからASTを復元しない |
| `inspectCheckpointSyntax`はsyntax checked／value uncheckedの計数だけを返す | 旧入口はそのまま保持し、別の閉鎖した合成入口で値検査へ進む。公開AST getter／任意consumerを作らない |
| `validateCheckpointValue`は成功時だけworkを返し、失敗は5種類のreasonだけ | 単一の検査engineが成功／失敗の計数を保持する内部結果を追加し、旧APIは同engineの互換projectionとする |
| coreの`Cost`はconstructorで最初のstructural 8unitを課金する | 失敗可能な初回課金より前に計数器を診断ownerへ保持する。初回課金失敗を「計数不明だから0」と補完しない |
| parserのVとcoreのstructural計数は別単位 | 2Vとstructural上界を別々に計算・受付し、片方の値をもう片方のlimitへ流用しない |

RP-Cの成功も候補DATAであり、capture／保存／終了やsourceの真正性を証明しない。未知fieldや旧版が構文だけ通っても、RP-Cでは既存coreのschemaを緩めず拒否する。

## 2 同invocationのprivate供給と所有権

合成入口名は親案の`parseCheckpointBytes(bytes, limits)`を候補とする。既存RP-A／RP-BのAPI・model・試験を置き換えない。callerがAST・core関数・Meter・root-end・継続callback・発行済み風のsummaryを供給する引数は追加しない。runtime export・fixture台帳共有も行わない。

同invocationのprivate contextは、元のowned bytes、parser root参照、構文成功時の実測V、元plan、parserの累積計数器、core呼出しclaim、先行診断を持つ。実run／session台帳や外部認証とのbindingではなく、この閉じた同期呼出し内の同一性である。公開digest・件数の一致だけで別contextを混ぜない。

| 対象 | 所有者と寿命 |
|---|---|
| caller view／backing | callerが所有。intrinsic取得・一度copy後に再読せず、破壊・detachしない |
| owned bytes | 外側byte ownerが成功／失敗の元finallyで一度retire。parser／coreは別copy・二重retireをしない |
| 元AST | SyntaxParserが所有。固定継続に同期借用し、await／外部callbackを挟まない。借用から戻った後、既存finallyでroot／stackをretire |
| coreの部分copy／索引／一時container | core engineの責務。拒否時に外へ返さず、元ASTへ書き戻さない |
| core成功のfreeze済みcopy | 一時pending ownerへ一度移し、固定post検査後に非実行の結果ownerへ一度だけmove。bridge側で再cloneしない。post拒否ならpendingを破棄 |
| first reason／計数snapshot | 本文と別の固定診断slotへ保持。AST破棄や後着の後処理診断で上書きしない |

source順のkeyは既存coreが固定field順と未知field拒否で照合する。numeric-likeな未知keyのJS列挙順をsourceの証拠にしない。型・値の補正、sort／dedup、空field補完、旧v1 fallbackは禁止する。

## 3 固定状態遷移とcore呼出しclaim

状態案は`Parsing → Framed → AdmissionChecked → CoreClaimed → CoreReturned → Returned / Rejected`。元の構文／frame失敗は`Framed`へ進まず、そのまま元診断で停止する。

1. 受付時に同planを検査・pinする。parser／core／bridgeのmodel版は固定定数として照合し、planへmodel欄を追加しない（§8）。modelの違いを同一単位とみなさない。
2. RP-A／RP-Bの同じ一度copy・UTF-8・構文解析を継続し、単一LF／EOFまで確認する。別の`inspectCheckpointSyntax`実行結果を受け取って再parseする方式は使わない。
3. rootが生きている同同期区間で、元の実測Vとplanから§4の受付を行う。構文失敗prefixの開始予約数は使わない。
4. 同planから固定ValueLimitsを生成し、core後のpost検査・診断copy・pending破棄に必要なbridge費も先行確保する。
5. core呼出しclaimを同期に消費してから、固定import先のdetailed engineを一度だけ呼ぶ。拒否・throw・失敗後もclaimを返却しない。
6. core拒否は理由と計数を保持して終了する。成功時は固定post検査を通ったcopyだけをmoveし、元ASTとbytesはそれぞれ元ownerがretireする。

claimはinvocation内の二重実行防止であり、pure APIを新しいinvocationで呼ぶことまで禁じる外部台帳ではない。callerからの再入callbackは受け付けない。受理・拒否が確定したcontextに再移譲／再検査を許可しない。

## 4 copy前の2Vとstructural受付

### 4.1 Vと論理tree枠

Vは同rootの構文・framingが成功した時点の`valueNodes`とし、object／array／scalarを各1、key名は0とする。構文成功時には未完成valueの開始予約が残らないことを別oracleで確認する。callerが申告したVや公開summaryを使わない。

checkedに`L_tree = V + V`を求め、`L_tree ≤ max_live_value_nodes`を要求する。等値は許可、1不足・overflowはcoreのcopy開始前に拒否する。overflowはparse段の`raw_overflow`、枠不足はparse段の`raw_limit`を保持し、どちらもcore呼出し0。既存の`max_value_nodes`／`max_ast_nodes`も別に維持する。

2Vは元ASTと最終normalized treeの**論理node枠**で、native heap byteの保証ではない。coreのownData／recordの一時container、索引、key列挙、数値文字列、plan／診断／結果wrapper、owned bytesは含まれない。core成功後に返すのはそのcopyのmoveであり、三つ目のtreeを生成しない。これら追加費目と実heapはUnknownのままである。

### 4.2 core structural上界の候補

parserのVをcoreの`max_nodes`へ直接渡さない。以下を**現行coreに限定した未検証の候補式**として独立検証する。

`S_candidate(V) = 3V + 10`

根拠案は、schemaのnode訪問が最大V、record field／array indexの辺が最大V−1、初期課金8、root trigger／statusの追加判定が最大3、Metric discriminatorの追加訪問が高々V、という費目所有である。合計は`V+(V−1)+8+3+V`。これはstructuralだけであり、relation・copy・number formatting・arithmeticを含む全work上界ではない。

前提はRP-Bが生成した有限・非循環・aliasなしのAST、現在のschema分岐が同じsubtreeを再walkしないこと、coreの課金点／単位が固定されることである。汎用unknown objectや別のschema／modelには適用しない。正当値だけでなく途中schema拒否のcharged prefixも式内であることを要する。sourceレビューだけで採用済みとはせず、全10 variant・全row・破損prefixと独立計数・課金変異で検証してからmodelを固定する。

採用する場合、checked算術で候補値を求め、`S_candidate ≤ plan.max_nodes`をcore前に照合する。不足ならparse段`raw_limit`、算術overflowならparse段`raw_overflow`、core呼出し0。保守式により実際には通る値を早期拒否し得るが、limitを自動で引き上げない。式の検証・model固定前にRP-Cの受付全体を有効にしない。

この受付を採用すると、RP-C入口を通る値はcoreのstructural上限に届かない。`max_nodes`不足はparse段の`raw_limit`になり、core呼出しは0である。coreの`value_limit`はwork／byte由来で残る。structural上限の拒否はcore直呼びで検証する。

`cc0f410`のレビューでは、残さない一時プローブで次を確認した。`JSON.parse`した値をcoreへ渡した計数であり、RP-Cの実行でもRC03の完了でもない。

- 正当値53件のstructural計数は、本文ありで`2V+10+M`、本文なしで`2V+9`に一致した（MはMetric数）。
- 構文を通った変異11,312件で、拒否までの計数は`3V+10`を超えなかった。
- `3V+10`は実計数の1.33〜1.5倍だった。scope 100、worker 1000の最大shape（V=392332）へ式を当てると、実計数の上限786474に対して1177006になる。

Metricはsample行だけにあり、sampleは最大600行なので`M≤1800`である。これによる別候補`S_alt(V) = min(3V+10, 2V+1810)`もRC03の検証対象とする。1800の部分はsample上限に依存し、主にソースから導出した値なので、sample上限やMetric数を変えたら再検証する。どちらの式を採用するかは未決定で、現時点の候補は`S_candidate`のままである。

## 5 同planのValueLimitsと費目所有

ValueLimitsは既存の固定順を保つ。`max_scopes, max_workers, max_nodes, max_work, max_snapshot_bytes, max_control_bytes, max_file_bytes`のうち、`max_work`だけ元planの`max_value_work`を渡し、他は同名のpin済み値を使う。残りparser work、現在の時刻、入力中の値から再生成しない。

| 費目 | 所有と単位 |
|---|---|
| 解析prefix | 元のparser計数器をそのまま継続。copy／UTF-8／構文の再計上・resetなし |
| bridge受付・結果合流 | 2V／structural式のchecked算術、model照合、ValueLimits生成、claim、pre／post、診断snapshot、move／discard。parserと同じ`max_parse_work`側に配賦し、bridge内訳は分離 |
| core | 独立のValueWork 5費目を`max_value_work`以内で計数。parser残量への借入れなし |
| 入力／tree保持 | A+NとV／2Vを別々に受付。node枠をbyte・structural単位へ換算しない |

`max_parse_work + max_value_work ≤ max_total_work`の事前配賦を維持する。parser＋bridgeが前者、coreが後者を使い、未使用枠を相互に移さない。bridgeの固定費・post／破棄予約の具体unitは未導出で、0として追加しない。新しいbridge profileとmodelの検証が必要であり、旧RP-A100／RP-B110や312の対照へ追加処理を無料で押し込まない。

両方の計数を観測できる場合だけ、checkedなparser＋bridge実計数とcore実計数の合計を返す。core実計数が取得不能なら、既知のparser成分と予約上界は保持するが、観測totalはUnknownにする。予約上界と実計数を二重加算しない。limits bootstrapのnative reflectionや実heap／時間は、抽象work totalとは別の未確認事項である。

## 6 detailed core結果と旧API互換

内部API名案は`inspectCheckpointValueDetailed`。旧`validateCheckpointValue`と同じ単一engineを使い、旧APIは従来のValueResultへprojectionする。旧APIから新APIを呼んだ後に再検査する実装や、二つの検査器の複製は禁止する。旧理由・正常copy・成功work・課金順とunitを維持する。

### 6.1 計数snapshotの型と初期課金

bridgeの`coreInvocation`は`not_called / called_once`。計数snapshot案は次の二variantとし、呼ばなかった場合のabsenceはbridge側で別に持つ。

| snapshot | 意味 |
|---|---|
| `observed`＋readonly ValueWork | 実際に計上できたprefix。失敗でも5費目とtotalをfreezeして返す。拒否された次の課金は加算しない |
| `unavailable` | 計数器を保持する前の失敗、snapshot生成不能等で実計数を確定できない。raw例外を出さず、0へ置き換えない |

計数器は、失敗し得る最初のstructural 8unitの課金より前に診断ownerへ保持する。`max_work<8`等で最初の課金が拒否された場合は、保持済みの計数器が示す**観測済み0**を返せる。これは計数取得不能を0と補完する場合とは異なる。limits検査自体が計数器生成前に失敗すれば、計数はunavailableのまま、元のreasonを保持する。

想定外の内部例外でも計数器が保持できていれば、charged prefixはobservedとして残し、既存の`invalid_value`を使う。計数が観測できることは、native処理／解放／物理メモリの成功を意味しない。raw path／key／scalar・offset・stack・外部callback・計数器のmutable参照を結果へ含めない。

### 6.2 理由と成功値

新detailed結果の成功は、従来のfreeze済みValidatedValueと観測済みValueWork、固定value-work-modelを持つ。失敗は既存ValueFailureと上記snapshotを持ち、部分copyを返さない。成功なのにworkがunavailable、またはmodelが異なる内部結果はbridge側の契約不成立として成功拒否する。

| 元core理由 | RP-Cの固定理由 |
|---|---|
| `schema` | `value_schema` |
| `relation` | `value_relation` |
| `limit` | `value_limit` |
| `overflow` | `value_overflow` |
| `invalid_value` | `value_invalid` |

この1対1対応を維持し、`limit`からwork／structural／byte不足を推測しない。将来その分類を追加する場合は別の型付き契約を必要とする。計数unavailableや後処理の異常は別診断で保持し、先行core理由を消さない。

## 7 失敗時の順序と一度限りの移譲

| 位置 | 固定結果と責務 |
|---|---|
| raw／構文／frame拒否 | 元stage／reasonを保持。core not_called。元AST／bytesは元finallyがretire |
| model／plan不成立 | core前に拒否。model混在を`raw_limits`として扱い、cap不足や観測成功へ補完しない。model混在はbytesから届かない（§9.1） |
| 2V／structural／bridge費不足 | parse段`raw_limit / raw_overflow / raw_work`。core not_called。未知fieldでも先行受付不足が優先 |
| core拒否 | value段で1対1理由を保持し、observed／unavailableも保持。raw成功へdowngrade・再呼出し・fallbackなし |
| 固定core呼出し自体の予期しないthrow／結果型・model不成立 | coreを呼び直さず、value段`raw_internal`。取得できた先行診断／計数成分を残し、部分成功を出さない |
| core成功後のpost拒否 | pending copyを破棄し、value段`raw_internal`を保持。coreの成功workは残すが、候補値は外へ返さない |
| 成功post後 | normalized copyを非実行の結果ownerへ一度moveし、元ASTとbytesをretire。コピーからcapture／save権限を生成しない |

postでは固定model、元context／claimの対応、観測された各work枠・合計、元Nと返却encoded上界の整合を確認する。成功値に対して`N ≤ upper.encoded`が成り立たなければ幅modelの不成立として`raw_internal`で拒否し、上界やcapを修正して続行しない。core自身のbyte上限拒否は元の`value_limit`を保持する。

同じfreeze済みcopyを指すDetailed結果wrapperとpendingは、別treeとして二重計上しない。ただしpost拒否時にはwrapperも含む全candidate aliasを固定unwindで外す。成功move後も診断slotへ本文参照を残さず、固定計数と理由だけを保持する。

先行失敗後は追加の業務post検査を行わず、先行確保した固定unwindだけを実行する。後処理費不足で先行core理由を置換しない。返却用の固定診断と破棄費をcore呼出し前に確保することが前提で、その数値が未導出な間はreadyなbridge profileを作らない。

## 8 modelと互換性の固定

parserの既存model、value work model案、RP-C bridge model案を別に扱う。value work model候補名は`wfb-value-core-work-1`、bridgeは`wfb-raw-value-rpc-1`とし、まだ実装済みの定数ではない。modelは固定import先の定数とし、callerの自由な文字列で検査器を選ばない。limitsは19項目の入力契約を維持し、model欄を追加しない。

value schema／discriminatorの追加、再walk、課金点・単位の変更はstructural式とmodelの再検証を要する。model名だけ一致させて旧計数へ混ぜない。現行の旧v1、RP-A／RP-Bの結果型・課金対照、legacy値coreの5理由と成功値を保持する。Detailed結果はtest-only module内の純粋な検査契約であり、runtime friendや証拠発行口へ配布しない。

## 9 独立合成受入条件

以下は実装後の受入条件であり、今回は未実施。

| ID | 対照 | 必須結果 | 検証経路 |
|---|---|---|---|
| RC01 | 同root／同planと、返却metadata・別invocation・再parseからの混入 | 固定内部継続だけが対象。公開AST供給・getter／friend・任意core callbackなし | bytes、配布境界の検査 |
| RC02 | 構文成功V、失敗prefixの予約数、2Vの等値／1不足／overflow | 成功Vだけを使い、受付拒否はcore呼出し0。BigIntの別計算で算術を照合 | 等値／1不足はbytes。overflowは受付の純粋計算 |
| RC03 | structural候補式の全10 variant・全row・Metric variant・schema拒否prefix | coreの計数を独立に数え、3V+10と`S_alt`の適用条件と保守性を検証。課金削除・追加・再walkの変異を検出。Vをmax_nodesへ流用しない | Detailed直呼び。Vはbytesから取得 |
| RC04 | Detailedとlegacyの成功・5理由・各費目と既存golden | 単一engineを一度実行し旧API互換。schemaを緩めず未知field・順序・旧版を拒否 | Detailed直呼び。`overflow`／`invalid_value`は§9.1 |
| RC05 | 初回8unit拒否・途中課金拒否・relation／byte拒否・計数器前の失敗 | 観測済み0とunavailableを区別。失敗charged prefixを保持し、未実施費を加算しない | Detailed直呼び |
| RC06 | parser／bridge／core各work枠の等値・1不足、core全5費目の途中停止 | 枠転用・reset・二重計上なし。実計数と予約上界を別に保持し、取得不能totalを0にしない | bytes。計数取得不能だけ試験専用assembly |
| RC07 | coreの5理由、core後の診断異常・post拒否 | value段1対1写像と先行理由を固定。limitの種類を推測せず、失敗後の再利用／二重呼出し0 | `schema`／`relation`／`limit`はbytes。他の2理由とpost拒否は§9.1 |
| RC08 | full値の10 variant・全row、normal golden・不正schema／関係・Nと上界 | boundedな独立oracleと全field／順序を比較。normalized copyだけを一度move、schema失敗からsyntax成功へ戻らない | bytes |
| RC09 | copy途中／core途中／postの故障・秘密canary | AST・bytes・pendingの責務が同ownerでretire。未受理本文・raw例外・key／offset持出し0。即時GC／zero化成功とは呼ばない | 秘密canaryはbytes。core途中／postの故障は試験専用assembly |
| RC10 | 旧v1・RP-A／RP-B・値core・配布境界の負対照 | 旧試験を残し、runtime台帳／実I/O／発行／保存への接続0。model混在を拒否 | 旧試験と配布境界の検査。model混在は§9.1 |

### 9.1 bytesから届かない経路

次の経路は、現行のcoreとparserではbytesから届かない。bytes経由で検証したと記録しない。

| 経路 | 届かない理由 | 検証手段 |
|---|---|---|
| core `overflow` | 配列長は最大2^32−1で、`validateCheckpointValue`の乗算・加算は桁あふれしない。JS値を渡しても同じ | 理由の対応表を純粋関数として単体検証し、保持は試験専用assemblyで確認 |
| core `invalid_value` | ASTにgetter／Proxyがなく、engine内で例外が出ない。レビューでは`Array.prototype.push`を壊した場合だけ観測した | 同上。共有prototypeの改変を受入の手段にしない |
| model混在 | modelは固定定数で、入力から変えられない | 試験専用assembly |
| detailed engineのthrow、成功時のwork取得不能、結果型の不成立 | engineの`try`が例外を固定失敗へ変換する | 試験専用assembly |
| `N > upper.encoded`のpost拒否 | レビューの最長値では差が0で、超える値は確認していない。等値は受理する | 試験専用assembly |
| RP-C入口からのcore structural上限 | 受付で候補式と`max_nodes`を照合済み（§4.2） | core直呼び |

試験専用assemblyと固定継続の境界は、RC-Aの実装前に決める。assemblyはruntimeへ配布せず、public AST consumer／任意callbackを増やさない。private参照が外へ出ないことだけからGC完了を推論しない。

## 10 実装順と未確認事項

1. **実装前の決定**: 試験専用assemblyと固定継続の境界、理由対応表の形（§9.1）。これがない間は、§9.1の経路を受入済みにしない。
2. **RC-A候補**: shared core engineのdetailed結果・計数ownerとlegacy projection。失敗prefix保持を先に固定し、まだraw入口をcoreへ接続しない。
3. **RC-B候補**: 同V／同planからの2Vとstructural受付の純粋計算・固定model。独立oracleと保守性の検証が済むまで、候補式を実受付へ採用しない。
4. **RC-C候補**: parser finally前の固定借用・一度claim・pre／post・費目合流を連続接続。bridge費profileがreadyであることを前提とし、失敗時の診断／破棄を検証する。

各段階は別の明示指示を要する。structural式は候補、bridge固定費・core全work上界・内部一時containerと索引／scratchの保持上界・運用capは未導出／未承認。shared deadline／取消・native故障・実heap／CPU時間、実source、encoder、private aggregate／capture／custody、本文保存と正式発行は対象外のままである。

本設計は既存ソースの所有／課金点を読み取り照合したもので、新計算器・式の合成受入・core接続試験を実施した記録ではない。旧v1・正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持する。
