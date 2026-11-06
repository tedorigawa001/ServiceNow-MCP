# WF-B：bounded raw JSON parserの詳細契約

Version: draft-0.1 / Date: 2026-11-06 / 照合基準HEAD: `7eefb10`。

Status: **設計のみ。parser・新試験・encoder・接続は未実装。** 親は[strict値契約](BEST_PRACTICE_WFB_SNAPSHOT_VALUE_CONTRACT.md)（照合した値規則はdraft-0.4）と[本文snapshot設計](BEST_PRACTICE_WFB_CHECKPOINT_SNAPSHOT_BODY_DESIGN.md)。旧`wfb-checkpoint-1`・既存recorder／Storeを維持し、正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を継続する。実装・証拠発行・本文保存・実接続・実通信・実機操作・設定変更・Pushは行わない。

## 1 目的・非目標と入力口

現行`validateCheckpointValue`はJS値のstrict field・10 variant・局所関係と上界を検査する。raw bytesのUTF-8・重複key・元numeric token・末尾データは検査しない。JSON.parse後にその情報を復元できたとは扱わない。本parserは**raw bytesを受ける別境界**であり、private aggregateの値をいったんJSON化して再解析する仕組みではない。

初期入口案は`parseCheckpointBytes(bytes, limits)`のみ。合成専用moduleの内部APIとし、rootは`wfb-checkpoint-2`のcheckpoint objectに限定する。standalone snapshot・旧v1・汎用JSON・JSON Linesの複数frame・stream／file／URL／readerは受け付けない。runtime export・package入口・capture issuerを追加しない。API名と型は提案で、呼出し可能な実装ではない。

成功は`non_executable_parsed_value`として、既存coreがcopy／freezeした値・shape・encoded上界と、下記の解析計数だけを返す。元bytes・中間AST・例外・本文断片・callback・issuer／receipt・save権限を返さない。DATAのdigestや`complete`はrun／source／captureのprivate identityや発行証拠にならない。

### 1.1 byte所有と入口の固定

- 入力は通常の`ArrayBuffer`を背後に持つ**標準prototypeのUint8Array view**に限定する案。Buffer／subclass／Proxy／SharedArrayBuffer／detached buffer／DataView／他typed array・string／任意iterableは拒否する。callerの`toString`／getter／iterator／sliceメソッドを呼ばない。
- brand／prototype／buffer・offset・lengthは捕捉したintrinsic境界で検査する。callerのproperty lookupを所有確認の代わりにしない。具体的なintrinsicの選定とdetached判定は実装前に照合する未確認事項である。
- `N=view.byteLength`と背後のbuffer全長`A`を入口で確定し、byte上限・入力保持枠・copy枠・copy workを確認してから、可視範囲だけを一度private copyする。offset外のprefix／suffixを解析しない。背後が大きいviewをN byteだけの保持と数えない。
- copyはawait／外部callbackなしの同期区間とし、copy前後のview状態を確認する。共有bufferは初めから拒否する。以後は同じowned copyだけをUTF-8検査・字句解析・構築へ渡し、caller viewを再読しない。
- private copyは本parser内の一時所有に限る。解析後にraw bytesの再利用権限や保存用capsuleを作らない。停止時は未受理AST・byte参照・token scratchを固定unwindで外す。JSの即時GC／ゼロ化／RSS返却を証明したとは扱わない。

## 2 初期wire subset：広いJSON受理を暗黙に追加しない

本subsetは親の固定encoderが将来出力する形式を対象とする。**一般の有効JSONでも、このwire subset外なら拒否**する。初期のstrict受理条件案は次のとおり。

| 項目 | 固定契約 |
|---|---|
| framing | object開始`{`からobject終端`}`までのcompact JSON＋**末尾LF 1 byteのみ**。BOM・先頭／途中の空白、CRLF、LF欠落・複数LF、後続value／ごみは禁止。末尾LFも受信byte／workへ計上 |
| UTF-8 | owned bytes全体を有限走査し、不正sequence・overlong・surrogate encoding・範囲外・途中切れを拒否。置換文字への救済やBOM除去なし。UTF-8として正しい非ASCIIは次段のwire profileで拒否する |
| string／key | quote内はprintable ASCIIだけ、backslashを含むescape表記は受理しない。長さは内容0〜64 byte、quote込み最大66。最終的なkey／enum／hexは既存値契約のallowlistに一致させる。自由文・URL・payloadを受ける拡張なし |
| key | source順を保持し、各object内の重複を**上書き／値挿入前**に拒否する。別objectの同名keyは合法。既存coreの固定field順も最後に要求し、sortしない |
| number | JSON numberの字句を32 ASCII byte以内で切り出す。有限・非負・MAX_SAFE_INTEGER以下・−0禁止。捕捉したintrinsicで数値化／再文字列化し、**元tokenとcanonical tokenの完全一致**を要求。U／P／C／M等の整数・範囲は既存coreでも検査 |
| literal | `true`／`false`／`null`のみ。undefined／NaN／Infinity・comment・trailing comma・省略array要素は禁止 |
| container | object／arrayだけ。objectはnull prototype、arrayはdenseな自前構築。object keyはown dataとして挿入し、`__proto__`等をsetter経由で反映しない。unknown keyは最終的にschema拒否 |

数値候補は先頭がdigit／符号の場合に連続する`[0-9eE+.-]`を上限付きで採り、JSON numberの文法を先に検査する。`01`を`0`と別tokenへ分けて救済しない。数値の例: `0`・`0.25`・`1e-7`・`5e-324`は各field範囲内なら候補。`-0`・`+1`・`01`・`1.`・`1.0`・`1e0`・`1E-7`・不要zeroを持つexponent・underflowで0になるtoken・roundingで別tokenになる整数は拒否する。文字列化の32 byte制約は全binary64入力の証明ではない。

`"version"`と`"\u0076ersion"`のaliasを重複検出のためdecodeして受理しない。後者はbackslashの時点で`raw_profile`拒否する。**escapeされた重複keyを受理後に検出したという保証は主張しない**。将来escapeを許すなら、decode後の重複・Unicode・token幅・workを別版で設計する。field順・escape禁止・LF条件は新raw入口の限定であり、既存JS値coreや旧v1へ遡及適用しない。

## 3 明示上限・件数と構造の数え方

limitsは合成計画が事前に確定するimmutableなprimitive値の集合とする。0・欠落・負値・非safe整数・overflow・未知設定は拒否し、既定値や無制限を入れない。以下は**構造条件と必要なcap名の案**であり、本番数値の承認ではない。任意unknown設定objectのreflection費・真正性は別途確認を要する。

| 上限／枠 | 受付規則 |
|---|---|
| `max_input_bytes` | LF込みNの上限。N=0はinput段の`raw_input`で拒否。最大受信量を先に検査し、全stringへのdecode／AST構築を先行させない |
| `max_input_buffer_bytes`／`max_input_live_bytes` | 背後buffer全長Aと、少なくとも`A+N`の同時保持をchecked検査。既存のcaller所有を無料としない。private copy Nの枠を事前確保 |
| `max_depth` | containerだけを数えroot object=1。hard ceiling=5、declared capとの小さい方。6段目のcontainer生成前に拒否。再帰の未制限使用は禁止し、有限stackで管理 |
| `max_tokens` | `{ } [ ] : ,`の各記号と、string／number／literalを各1token。key stringも1、LF／EOFはtokenでなくbyte／検査work。次token開始前にcapを確認 |
| `max_value_nodes` | object／array／scalarを各1node。key名はnodeでなくtoken／string費。nodeを生成する前に枠を確認。欠落値をnullへ補完しない |
| object／scalar hard ceiling | 各object最大10field、string内容最大64 byte、numeric token最大32 byte。field／文字／tokenを追加する前に拒否。既存全variantが範囲内であることを独立照合する |
| `max_array_items` | 未確定pathを含む全arrayの有限上限。既知pathには下記のより小さい上限も適用し、次要素開始前に拒否。callerがpath別callbackを供給しない |
| 既知pathの件数 | `snapshot.modules≤1000, cases≤20000, events≤20000, samples≤600`。`scopes`と`cutoff.scope_tails≤max_scopes`、`workers≤max_workers`。rootとそのsnapshotからの固定path表で判定する。scope別4096・参照・集計は既存coreで照合 |
| `max_parse_work`／`max_value_work`／`max_total_work` | 解析と既存値検査の固定配賦。いずれも正値、checkedに`max_parse_work+max_value_work≤max_total_work`を受付。unused解析枠の転用や失敗後の再試行なし |
| `max_token_scratch_bytes`／`max_ast_nodes` | tokenの有限scratchと中間構築枠。AST node枠はvalue nodeと同じ定義で二重に生成数を計上しないが、ASTと最終core copyの同時保持は別枠。node数を実heap byteと見なさない |
| 既存`ValueLimits` | `max_scopes, max_workers, max_nodes, max_snapshot_bytes, max_control_bytes, max_file_bytes`を同じ計画から固定供給。coreの`max_work`へ`max_value_work`を渡す。入力Nの実長と、coreが返す保守encoded上界は両方を検査し、短い入力で保守上界の不足を回避しない |

このpath表は初期schema版に固定し、値coreのkind／件数上限が変われば同時改版する。未知pathの大きいarrayを無制限にwalkしてからschema拒否してはならない。`max_array_items`とnode／token／work枠は未知pathにも有効である。

### 3.1 計画用shape式と、その限界

受理されるcaptured frameのvalue node上界案（scalarも1）は、`V≤32+7N_c+13N_m+11N_s+11N_e+11N_w+12N_p`。`11N_s`にはScope8＋ScopeTail3を含む。固定32は最大detailを持つfirst_anomalyのframe15＋空snapshot17。本文なしvariantはV≤17（conditions_ready≤15、child_started≤11）。Metricはstatus／valueを含むobject3nodeであり、Sampleは12node。

上の定義のtoken数は、treeの各value／container／object key／colon／separatorを独立に数えると保守的に`T≤5V`で包める。shape式・加乗算はcheckedで求め、これを必要node／tokenの計画に使う場合も明示capと照合する。**不正入力をこの式の中へ押し込めて受理する指示ではない**。未知／不正構造には宣言shapeを信用せず、実際のtoken・node・depth・byte・workカウンターで途中停止する。scope／workerの運用capが未承認なので、この式からrun受付を承認しない。

## 4 検査順・内部状態と停止の線形化

固定順は次のとおり。前段で失敗したら後段を呼ばない。pure関数を別途呼び直すことまで禁止する台帳は作らないが、**同一invocation内**でcopy／parse／core検査をretryしない。

1. **PlanChecked**: limitsと各配賦のchecked整合、入力brand／背後buffer／可視範囲／byteと同時保持枠を確認する。不正limitを内部で補完しない。
2. **BytesOwned**: copy work／N byteを先に配賦し、可視範囲を一度copy。以後caller viewを使わない。
3. **Utf8Checked**: owned bytes全体をboundedなUTF-8走査で検査。stringへ全decodeしない。最初の不正sequenceで停止。cap／workが先に尽きればその理由が優先。
4. **Parsing**: root object・compact profile、文字列／数値／literalと有限container stackを解析する。次byte probe／token／field／element／nodeの前に該当費を課金する。同objectの既出keyは有界リストで照合し、重複判明時は値の解析・挿入前に停止する。
5. **Framed**: root終了直後が単一LFかつ直後EOFであることを確認。root閉鎖以前のsyntax不正を末尾エラーへ置き換えない。
6. **ValueChecked**: 有界に自前構築した中間値だけを既存`validateCheckpointValue`へ一度渡す。fixed field順・10 variant・局所関係・実shape・encoded上界を照合する。parent draft-0.4のnon-observed metric、not_run failure矛盾、空run complete拒否を維持する。
7. **Returned／Rejected**: 成功値のcopy／freezeを受け取った後に中間AST・bytesへの参照を外す。失敗は固定理由と実到達stageのみを保持し、部分値を返さない。coreが失敗すればparser-only成功へdowngradeしない。

duplicate keyの照合は**現在のobjectだけ**で最大10key、key比較は最大64byte。substringの無制限蓄積・汎用hash callback・外部reviver／schema callbackは使わない。generic JSON.parseに先に任せる方式は禁止する。既存coreが自身でcopy／freezeする費用を省略・無料化せず、中間ASTとの寿命の重なりを残す。

### 4.1 work・期限と取消の境界

parser内の抽象費目は、入力copy byte、UTF-8 byte走査、字句のadvance／lookaheadごとのbyte probe、token開始、value node生成、field／element挿入、既出key照合の比較byte、有限stack操作、算術、数値変換／formatter呼出しと文字比較を別に計数する。copyとUTF-8が各Nを使うことを隠さず、同じbyteを別phaseで読む費用を二重読取として数える。いずれのloopも無料で進まず、上限到達前の操作だけを実行する。

検査順上、解析後の既存coreは現在のprivate `Cost`で別計数する。**現状で共通の停止owner／runtime budgetへ接続済みとは扱わない。** 将来の合成wrapperは事前配賦した`max_value_work`をそのままcoreへ渡し、解析の残量からdeadline／枠を再生成しない。計数modelの版・固定設定検査費・失敗unwind費の実装式は後続検証で確定する。

初期parserは同期・clock／timer／I/O／外部callbackなしの純粋境界とする。work capはwall-time保証でも非同期取消の即時反映でもない。共有期限／取消ownerへの実接続、boundedな停止照会間隔、前後checkpointとその費用は後続設計事項であり、今回のpure APIで満たしたとはしない。有限work内でも実heap／CPU時間はUnknownを維持する。

## 5 固定失敗理由と診断の非出力

結果案は成功か`{ok:false, stage:<固定値>, reason:<固定値>}`。stageは`plan / input / copy / utf8 / parse / frame / value`のみ。失敗を別purposeの公開HTTP／worker reasonへ直結しない。内部例外・入力path／key・token・byte offset・部分JSON・stack・buffer内容は返却／ログしない。

| reason | 固定意味 |
|---|---|
| `raw_limits` | limit不正／欠落・配賦不整合。既定値で続行しない |
| `raw_input` | 許可外brand／buffer／detached／view状態不整合・copy不能 |
| `raw_limit` | 入力／保持／depth／token／node／field／array／scalar scratch等の上限超過 |
| `raw_work` | parserの課金枠不足。core内のwork不足と混同しない |
| `raw_overflow` | byte合計・shape・配賦・カウンター等のchecked算術不成立 |
| `raw_utf8` | owned byte列の不正UTF-8 |
| `raw_profile` | 有効UTF-8だがASCII compact subset外、BOM／途中空白／非ASCII／escape等 |
| `raw_syntax` | 構造・delimiter・literalの不正、途中切れ、trailing comma等 |
| `raw_duplicate_key` | 同object内で既出の非escape key。後の値で上書きしない |
| `raw_number` | 数値字句・canonical往復同値・finite／非負等の不成立。token長超過は先に`raw_limit` |
| `raw_frame` | 正常rootの後が単一LF＋EOFでない、複数frame／trailing data |
| `value_schema / value_relation / value_limit / value_overflow / value_invalid` | 既存coreの`schema / relation / limit / overflow / invalid_value`を1対1で保持。`value_limit`がwork由来かbyte由来か等は現行coreから識別できず、推測しない |
| `raw_internal` | 想定外の内部例外を固定化。成功・正常cleanupへ補完しない |

優先順位は「前段優先、同段は次に実行する操作のcap課金→byte／token検査→値操作」の先着sticky。すべての不正を探すために失敗後の入力走査を続けない。UTF-8 prepassはparseより先なので、後方の不正UTF-8が前方のJSON不正より先に報告され得る。これは明示した順序であり、offset最小の全種エラーを返す契約ではない。上位への写像と保存／cleanup診断との合流は未接続。

## 6 独立oracle・合成受入条件（未実施）

oracleを製品encoderやparserの出力から生成して正解としない。手書きASCII golden／hex byte列、独立の構造数え上げ、BigInt算術、boundedな標準JSON.parseによる**正常な合成例だけの**値比較を併用する。JSON.parseは重複key／UTF-8／上限の拒否oracleには使わない。故障callbackを新APIへ渡す口は設けず、失敗検査は返却後に行う。

| ID | 合成対照 | 受入条件 |
|---|---|---|
| RJ01 | 全10 variantの手書きgolden、全row・enum、空captured（run incomplete）、unavailable | 同じfield順・値でcore受理、非実行DATAだけ返却。raw reasonと既存value reasonの層を混同しない |
| RJ02 | 先頭／末尾offsetを持つview、caller側変更、Buffer／subclass／Proxy／SAB／detached等 | 可視範囲一度copy・再読0、許可外input拒否、入力hook実行0。detached試験手段の利用は合成試験として別途確定 |
| RJ03 | 不正UTF-8：overlong・surrogate・範囲外・途中切れ、BOM、正しい非ASCII | 不正UTF-8とsubset外を固定理由で区別。置換・BOM削除・文字列全decodeなし |
| RJ04 | 全depthのobjectで同名key、別object同名key、escape alias、`__proto__` | 同object重複は値解析／挿入前に拒否、別objectは候補、escape aliasはprofile拒否、prototype変更0 |
| RJ05 | whitespace／CRLF／LF欠落・2個、trailing value／data、empty、未閉鎖・不正literal・comma | profile／syntax／frameの定めた順序で拒否。複数frame分割・v1 fallback・途中補正0 |
| RJ06 | −0・unsafe整数・32／33byte token、1.0／1e0／1E-7、underflow／overflow、MIN_VALUE・小数 | 長さ境界、canonical比較とcoreのfield範囲を分離。丸め／string→整数補完なし。33byteは変換前に拒否 |
| RJ07 | 各capの−1／等値／＋1、depth5／6、10／11field、64／65byte string、件数path別境界 | 次操作前の課金・拒否、無制限のskip／構築なし。上限fixtureを実運用capへ昇格しない |
| RJ08 | 入力Nと背後Aの差、A+N、token scratch、ASTとcore copyの同時保持 | 独立BigIntでoverflow／必要量を比較。visible byteだけでbacking保持を無料化しない。実heap byte保証は未確認 |
| RJ09 | node／tokenを手書き小treeと全rowで数える、32固定費・ScopeTail・Metric variants | §3.1のV／T上界と実計数を独立検証。parser内部counter同士だけで正当化しない |
| RJ10 | 途中のbyte／token／node／比較／数値変換でwork不足、coreのwork不足 | 前後の操作到達数を計数する内部fixtureで停止位置を検証。二重課金・core複数呼出し0、unused枠転用0、公開fault callbackなし |
| RJ11 | 不正UTF-8＋schema不正、token上限＋syntax不正、parse成功＋関係矛盾等 | §4／§5の先着理由を保持。失敗後の後段開始0。passedとnot_run module／hook failureの矛盾、非observed metric、空run completeを最新core通り拒否 |
| RJ12 | 秘密canaryを含む不正key／値／trailing bytes、部分生成失敗 | raw値・offset・key・例外・stackの出力0、未受理AST／byte参照の固定unwind。JSメモリ消去成功と称さない |
| RJ13 | 旧v1／旧Store・recorder対照、import／package境界、同値DATAの再利用 | 既存試験・型／経路不変、runtime台帳／発行／capture／保存0。pure値からprivate証拠へ昇格する入口なし |

## 7 実装順と未確認・承認待ち

1. **RP-A（最初の候補）**: 合成専用のlimit／計数型とbyte入力境界、UTF-8 prepass・framingの固定理由を実装。未知入力のhook非実行・copy前受付・failure unwindを先に検証する。JSON値の受理・証拠発行はまだ接続しない。
2. **RP-B**: 有限stackの字句／構文、同object重複、strict numeric token、path別件数・node／token制限。中間値は外へ返さず、parser内固定継続だけへ渡す。独立goldenと拒否対照を追加。
3. **RP-C**: 既存coreへの一度の値検査・費目の分離・結果合流と全10 variantの連続試験。発行・保存とは引き続き分離する。

各段階は別の明示指示を要する。API／brand取得のintrinsic選定、copy途中の例外・detached判定、parser work modelの版とunwind費、raw byte／heap／scratchの具体capは未確認／未承認。小さい合成capだけで有限境界を検証し、本番capは投入しない。

ASCII compact＋LFだけという初期subsetを将来広げる判断、共有期限／取消ownerと停止照会間隔、budgetへの正式結合、formatter全入力の根拠、encoderと同bytesの独立照合、private aggregate／capture／custody・Store接続は残課題。raw parserの成功からこれらを確認済みにせず、Unknown・正式発行口閉鎖・全体受付無効・調査保留を維持する。

文書作成時の確認は、ローカルMDリンク・差分の空白検査と、手作りのfirst_anomaly＋空snapshot値による固定32nodeの独立数え上げに限る。これはparserの合成試験や§6の受入完了ではない。テスト・ビルド・実parser実行は今回未実施である。
