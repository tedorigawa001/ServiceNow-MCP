# WF-B：bounded raw JSON parserの詳細契約

Version: draft-0.8 / Date: 2026-11-07 / 照合基準HEAD: `7eefb10` / レビュー修正の基準HEAD: `09e65e0` / RP-A実装基準HEAD: `baaf60d` / RP-B実装基準HEAD: `f28f0a2` / RP-Bレビュー修正の基準HEAD: `6a8209a` / RP-C設計レビュー修正の基準HEAD: `cc0f410` / RC-Aレビュー修正の基準HEAD: `0e1229b`。

draft-0.7のレビュー修正: §7のRP-Cの状態を、RC-A実装後の内容に合わせた。parserは変更していない。

draft-0.6のレビュー修正: §4の値検査手順とRJ09を[RP-C差分設計](BEST_PRACTICE_WFB_RPC_PRIVATE_VALUE_BRIDGE_DESIGN.md)に合わせた。設計のみで、実装状態は変わらない。

draft-0.6: [RP-Cの同AST接続・2V受付とcore計数診断保持の差分設計](BEST_PRACTICE_WFB_RPC_PRIVATE_VALUE_BRIDGE_DESIGN.md)を追加。parser finally前の固定借用、一度claim、core失敗計数の観測可否、legacy互換と独立検証条件を具体化した。設計のみでcore接続・受付式の採用は行っていない。

draft-0.4のレビュー修正: byte不正とcap不足の優先順位を§5へ明記した。RP-Bの理由検査を固定し、非空の木の手計数workと拒否・上限の対照を追加した。実装と保証範囲は変更していない。

draft-0.4: RP-Bの有限stack構文解析・重複key・canonical数値・path件数とnode／token上限を合成専用で実装した（§9）。[検証記録](E2E_BEST_PRACTICE_WFB_RAW_JSON_RPB_2026-11-06.md)。新入口の成功はsyntax checked／value uncheckedのmetadataのみ。旧RP-Aと値coreは不変で、RP-C・発行／保存は未接続。

draft-0.3: RP-Aのlimit／計数型・byte受付／copy・UTF-8 prepass・外側framingを合成専用で実装した（§8）。[検証記録](E2E_BEST_PRACTICE_WFB_RAW_JSON_RPA_2026-11-06.md)。返値はsyntax uncheckedの非実行metadataだけで、`parseCheckpointBytes`・JSON構文／値受理は未実装。

draft-0.1のレビュー修正: copy手段を固定し、resizable bufferの拒否を追加した。境界入力と固定理由の対応表（§5.1）を置いた。`max_value_nodes`とcoreの`max_nodes`の単位の違いを明記し、ASTとcore copyの同時保持に枠の名前を付けた。設計のみで、実装状態は変わらない。

Status: **RP-Aのbyte境界とRP-BのJSON字句／構文解析・合成試験を実装済み。core値受理・encoder・実接続は未実装。** 親は[strict値契約](BEST_PRACTICE_WFB_SNAPSHOT_VALUE_CONTRACT.md)（照合した値規則はdraft-0.4）と[本文snapshot設計](BEST_PRACTICE_WFB_CHECKPOINT_SNAPSHOT_BODY_DESIGN.md)。旧`wfb-checkpoint-1`・既存recorder／Storeを維持し、正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を継続する。証拠発行・本文保存・実接続・実通信・実機操作・設定変更・Pushは行わない。

## 1 目的・非目標と入力口

現行`validateCheckpointValue`はJS値のstrict field・10 variant・局所関係と上界を検査する。raw bytesのUTF-8・重複key・元numeric token・末尾データは検査しない。JSON.parse後にその情報を復元できたとは扱わない。本parserは**raw bytesを受ける別境界**であり、private aggregateの値をいったんJSON化して再解析する仕組みではない。

初期入口案は`parseCheckpointBytes(bytes, limits)`のみ。合成専用moduleの内部APIとし、rootは`wfb-checkpoint-2`のcheckpoint objectに限定する。standalone snapshot・旧v1・汎用JSON・JSON Linesの複数frame・stream／file／URL／readerは受け付けない。runtime export・package入口・capture issuerを追加しない。API名と型は提案で、呼出し可能な実装ではない。

成功は`non_executable_parsed_value`として、既存coreがcopy／freezeした値・shape・encoded上界と、下記の解析計数だけを返す。元bytes・中間AST・例外・本文断片・callback・issuer／receipt・save権限を返さない。DATAのdigestや`complete`はrun／source／captureのprivate identityや発行証拠にならない。

### 1.1 byte所有と入口の固定

- 入力は標準prototypeの固定長`ArrayBuffer`を背後に持つ**標準prototypeのUint8Array view**に限定する案。Buffer／subclass／Proxy／SharedArrayBuffer／resizable buffer／length-tracking view／detached buffer／DataView／他typed array・string／任意iterableは拒否する。callerの`toString`／getter／iterator／sliceメソッドを呼ばない。resizableは初期subsetでは拒否し、受け入れる場合は別版で設計する。
- brand／prototype／buffer・offset・lengthは捕捉したintrinsic境界で検査する。callerのproperty lookupを所有確認の代わりにしない。detached／範囲外のviewは`byteLength`が0と読めるので、N=0として`raw_input`で拒否する。brand取得に使うintrinsicの具体的な選定は実装前に照合する未確認事項である。
- `N=view.byteLength`と背後のbuffer全長`A`を入口で確定し、byte上限・入力保持枠・copy枠・copy workを確認してから、可視範囲だけを一度private copyする。offset外のprefix／suffixを解析しない。背後が大きいviewをN byteだけの保持と数えない。
- copyは、新規`Uint8Array(N)`へ捕捉した`%TypedArray%.prototype.set`で行う。捕捉した`%TypedArray%.prototype.slice`と`ArrayBuffer.prototype.slice`はspecies解決でview／bufferの`constructor`を読み、callerのgetterを実行するので使わない。`Uint8Array.from`もiteratorを読むので使わない。copyはawait／外部callbackなしの同期区間とし、copy前後のview状態を確認する。共有bufferは初めから拒否する。以後は同じowned copyだけをUTF-8検査・字句解析・構築へ渡し、caller viewを再読しない。
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
| `max_token_scratch_bytes`／`max_ast_nodes`／`max_live_value_nodes` | tokenの有限scratchと中間構築枠。AST node枠はvalue nodeと同じ定義で二重に生成数を計上しない。ASTと最終core copyの同時保持は`max_live_value_nodes`で受け、構築したnode数の実測V_aについて`2V_a`をcheckedに照合してからcoreへ渡す（超過はparse段の`raw_limit`）。coreの内部一時containerは含まない。node数を実heap byteと見なさない |
| 既存`ValueLimits` | `max_scopes, max_workers, max_nodes, max_snapshot_bytes, max_control_bytes, max_file_bytes`を同じ計画から固定供給。coreの`max_work`へ`max_value_work`を渡す。入力Nの実長と、coreが返す保守encoded上界は両方を検査し、短い入力で保守上界の不足を回避しない。`max_nodes`はcoreのstructural計数の上限で、`max_value_nodes`のV定義とは単位が異なる。Vをそのまま渡さず、coreの計数に対する上界式は未導出として別途確定する |

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
6. **ValueChecked**: [RP-C差分設計](BEST_PRACTICE_WFB_RPC_PRIVATE_VALUE_BRIDGE_DESIGN.md)の2V／structural受付を通した後、有界に自前構築した中間値だけを、既存`validateCheckpointValue`と同じ単一engineのdetailed入口へ一度渡す。fixed field順・10 variant・局所関係・実shape・encoded上界を照合する。親§4のnon-observed metricとnot_run failure矛盾、親§6の空run complete拒否を維持する。
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
| `raw_input` | 許可外brand／buffer／resizable／detached／view状態不整合・N=0・copy不能 |
| `raw_limit` | 入力／保持／depth／token／node／field／array／scalar scratch等の上限超過 |
| `raw_work` | parserの課金枠不足。core内のwork不足と混同しない |
| `raw_overflow` | byte合計・shape・配賦・カウンター等のchecked算術不成立 |
| `raw_utf8` | owned byte列の不正UTF-8 |
| `raw_profile` | 有効UTF-8だがASCII compact subset外、BOM／root閉鎖前の空白・制御文字／非ASCII／escape等（§5.1） |
| `raw_syntax` | 構造・delimiter・literalの不正、object以外のroot、途中切れ、trailing comma等（§5.1） |
| `raw_duplicate_key` | 同object内で既出の非escape key。後の値で上書きしない |
| `raw_number` | 数値字句・canonical往復同値・finite／非負等の不成立。token長超過は先に`raw_limit` |
| `raw_frame` | 正常rootの後が単一LF＋EOFでない、空白／CR／複数frame／trailing data（§5.1） |
| `value_schema / value_relation / value_limit / value_overflow / value_invalid` | 既存coreの`schema / relation / limit / overflow / invalid_value`を1対1で保持。`value_limit`がwork由来かbyte由来か等は現行coreから識別できず、推測しない |
| `raw_internal` | 想定外の内部例外を固定化。成功・正常cleanupへ補完しない |

優先順位は「前段優先、同段は次に実行する操作のcap課金→byte／token検査→値操作」の先着sticky。すべての不正を探すために失敗後の入力走査を続けない。UTF-8 prepassはparseより先なので、後方の不正UTF-8が前方のJSON不正より先に報告され得る。これは明示した順序であり、offset最小の全種エラーを返す契約ではない。空白は次tokenを開始しないので、token capの残量に関わらず`raw_profile`とする。value開始位置はbyte classの確認→node予約→値の分類の順で、node枠が尽きていれば不正な値の字句でも`raw_limit`を先に返す。上位への写像と保存／cleanup診断との合流は未接続。

### 5.1 境界入力の固定理由

判定位置で理由を決める。JSONとして有効かどうかを追加で読んで理由を変えない。下表は、該当操作のcapが先に尽きず、前段を通過した場合の理由である。

| 入力 | stage | reason |
|---|---|---|
| N=0（空、detached、範囲外view） | input | `raw_input` |
| 先頭がBOM／空白／LF／CR、LFのみの入力 | parse | `raw_profile` |
| root閉鎖前のtoken境界にある空白／LF／CR／制御文字／DEL／非ASCII | parse | `raw_profile` |
| 文字列内の制御文字／DEL／非ASCII／backslash | parse | `raw_profile` |
| 先頭が`{`以外のprintable ASCII（`[]`、`1`、`"a"`、`null`、`x`を含む） | parse | `raw_syntax`。rootを読み進めない |
| root閉鎖前のEOF（閉じていない文字列を含む） | parse | `raw_syntax` |
| 閉じたrootの直後がEOF（LF欠落） | frame | `raw_frame` |
| 閉じたrootの直後が空白／CR／LF以外の任意のbyte | frame | `raw_frame` |
| 閉じたrootとLFの後にbyteが続く（複数LF、後続frameを含む） | frame | `raw_frame` |

## 6 独立oracle・合成受入条件（RP-A／RP-Bを部分実施）

RP-BによりRJ04／06、syntax側のRJ05／07／09〜12を追加確認した（[記録](E2E_BEST_PRACTICE_WFB_RAW_JSON_RPB_2026-11-06.md)）。全10 variantの構文・構造計数も確認したが、RJ01のcore値受理、実encoded上界との連続照合、AST／core copyの同時保持、value work、privateな真正性はRP-C以降へ残す。

draft-0.3時点では§8と[RP-A記録](E2E_BEST_PRACTICE_WFB_RAW_JSON_RPA_2026-11-06.md)でRJ02／03／05／07／08／10〜13のbyte境界側だけを部分確認した。当時の重複key・数値token・syntax・token／node未実施分はRP-Bで追加検証したが、AST／core copy・value workと値受理は未実施のまま。下表全体を完了扱いしない。

oracleを製品encoderやparserの出力から生成して正解としない。手書きASCII golden／hex byte列、独立の構造数え上げ、BigInt算術、boundedな標準JSON.parseによる**正常な合成例だけの**値比較を併用する。JSON.parseは重複key／UTF-8／上限の拒否oracleには使わない。故障callbackを新APIへ渡す口は設けず、失敗検査は返却後に行う。

| ID | 合成対照 | 受入条件 |
|---|---|---|
| RJ01 | 全10 variantの手書きgolden、全row・enum、空captured（run incomplete）、unavailable | 同じfield順・値でcore受理、非実行DATAだけ返却。`N≤upper.encoded`。raw reasonと既存value reasonの層を混同しない |
| RJ02 | 先頭／末尾offsetを持つview、caller側変更、Buffer／subclass／Proxy／SAB／resizable／length-tracking／detached／範囲外view、viewとbufferのown accessor（`constructor`、`length`、`byteLength`、`Symbol.iterator`） | 可視範囲一度copy・再読0、許可外input拒否、入力hook実行0。accessor付きの標準viewはgetter実行0のまま受理候補とする。detached試験手段の利用は合成試験として別途確定 |
| RJ03 | 不正UTF-8：overlong・surrogate・範囲外・途中切れ、BOM、正しい非ASCII | 不正UTF-8とsubset外を固定理由で区別。置換・BOM削除・文字列全decodeなし |
| RJ04 | 全depthのobjectで同名key、別object同名key、escape alias、`__proto__` | 同object重複は値解析／挿入前に拒否、別objectは候補、escape aliasはprofile拒否、prototype変更0 |
| RJ05 | §5.1の全行：empty、LFのみ、先頭／途中／root後のwhitespace、CRLF、LF欠落・2個、object以外のroot、制御文字、trailing value／data、未閉鎖・不正literal・comma | §5.1のstageと理由に一致。複数frame分割・v1 fallback・途中補正0 |
| RJ06 | −0・unsafe整数・32／33byte token、1.0／1e0／1E-7、underflow／overflow、MIN_VALUE・小数 | 長さ境界、canonical比較とcoreのfield範囲を分離。丸め／string→整数補完なし。33byteは変換前に拒否 |
| RJ07 | 各capの−1／等値／＋1、depth5／6、10／11field、64／65byte string、件数path別境界 | 次操作前の課金・拒否、無制限のskip／構築なし。上限fixtureを実運用capへ昇格しない |
| RJ08 | 入力Nと背後Aの差、A+N、token scratch、`max_live_value_nodes`の等値／1不足 | 独立BigIntでoverflow／必要量を比較。不足時はcoreを呼ばない。visible byteだけでbacking保持を無料化しない。実heap byte保証は未確認 |
| RJ09 | node／tokenを手書き小treeと全rowで数える、32固定費・ScopeTail・Metric variants、受理した全fixtureの入力長 | §3.1のV／T上界と実計数を独立検証。parser内部counter同士だけで正当化しない。`N≤upper.encoded`を確認し、encoderとは別の経路で上界式を照合する。Vを`max_nodes`へ流用した場合に正当な値が`value_limit`になることを、core直呼びの対照として固定する。RP-C入口では事前受付によりparse段の`raw_limit`となり、coreを呼ばない |
| RJ10 | 途中のbyte／token／node／比較／数値変換でwork不足、coreのwork不足 | 前後の操作到達数を計数する内部fixtureで停止位置を検証。二重課金・core複数呼出し0、unused枠転用0、公開fault callbackなし |
| RJ11 | 不正UTF-8＋schema不正、token上限＋syntax不正、parse成功＋関係矛盾等 | §4／§5の先着理由を保持。失敗後の後段開始0。passedとnot_run module／hook failureの矛盾、非observed metric、空run completeを最新core通り拒否 |
| RJ12 | 秘密canaryを含む不正key／値／trailing bytes、部分生成失敗 | raw値・offset・key・例外・stackの出力0、未受理AST／byte参照の固定unwind。JSメモリ消去成功と称さない |
| RJ13 | 旧v1／旧Store・recorder対照、import／package境界、同値DATAの再利用 | 既存試験・型／経路不変、runtime台帳／発行／capture／保存0。pure値からprivate証拠へ昇格する入口なし |

## 7 実装順と未確認・承認待ち

1. **RP-A（byte境界のみ実装済み）**: 合成専用のlimit／計数型・入力境界、UTF-8 prepass・外側framingと固定理由を実装。入力hook非実行・copy前受付・failure unwindを検証した。JSON値の受理・証拠発行は未接続であり、syntax uncheckedの結果をparser成功へ昇格しない（§8）。
2. **RP-B（合成専用で実装済み）**: 有限stackの字句／構文、同object重複、strict numeric token、path別件数・node／token制限を追加。中間ASTは外へ返さず、内部の固定retireで破棄する。独立goldenと構造oracle・拒否対照を追加した（§9）。coreへの固定継続は未接続。
3. **RP-C**: [同AST／2V・計数診断保持の差分設計](BEST_PRACTICE_WFB_RPC_PRIVATE_VALUE_BRIDGE_DESIGN.md)まで整理済み。失敗時も計数を残すcore結果（RC-A）は合成実装した。受付計算器と固定借用・費目合流は未実装で、式の採用とcore接続も未実施。発行・保存とは引き続き分離する。

後続段階は別の明示指示を要する。RP-Aのintrinsic選定と境界用work modelは§8へ固定したが、native copyのallocation／set例外の故障注入、全parserのwork model／unwind費、coreのstructural計数上界式、raw byte／heap／scratchの運用capは未確認／未承認。小さい合成capだけで有限境界を検証し、本番capは投入しない。

ASCII compact＋LFだけという初期subsetを将来広げる判断、共有期限／取消ownerと停止照会間隔、budgetへの正式結合、formatter全入力の根拠、encoderと同bytesの独立照合、private aggregate／capture／custody・Store接続は残課題。raw parserの成功からこれらを確認済みにせず、Unknown・正式発行口閉鎖・全体受付無効・調査保留を維持する。

draft-0.1作成時の確認は、ローカルMDリンク・差分の空白検査と、手作りのfirst_anomaly＋空snapshot値による固定32nodeの独立数え上げに限る。当時はテスト・ビルド・実parser実行を行っていない。今回のRP-A試験も全parserの受入完了ではない。

draft-0.1のレビューでは、残さない一時プローブで次を確認した（Node v24.18.0）。いずれもparserの試験ではなく、§6の受入完了でもない。

- copy手段のgetter実行は、捕捉`slice`系と`Uint8Array.from`であり、捕捉`set`と`new Uint8Array(view)`では0。全engine・全版の保証ではない。
- resizable bufferの固定長viewとlength-tracking viewは、prototypeとSABの検査だけでは拒否されない。
- 手作りの多行fixtureでVは§3.1の式と一致（902）。T／Vは最大4.14。depth 5、10 field、64 byteに到達。同じfixtureのcore structural計数は1829で、`max_nodes=902`は`limit`になる。

## 8 RP-A実装境界・計数と破棄

配置は`tests/review/fixtures/raw-json-boundary.ts`、試験は`tests/review/raw-json-boundary.test.ts`。runtime／旧fixture台帳と共有せず、importは`node:util.types`だけ。公開する合成APIは`inspectCheckpointBoundary(bytes, limits)`であり、§1の将来の`parseCheckpointBytes`ではない。成功は`kind=non_executable_raw_boundary, syntax=unchecked`と固定model名・計数metadataのみ。bytes・文字列・AST・検査済み値・callback・proofを返さない。

### 8.1 受付とnative memory操作

limitは§3の19項目を列挙順のown enumerable dataで必須とし、正safe整数のみをcopy／freezeする。bootstrapの設定検査後に固定64unitを計上する。設定objectのreflection一時heap／実時間をこの64unitで証明したとはせず、任意巨大unknown設定はruntimeへ開かない。

捕捉するのは`Uint8Array` constructor、`%TypedArray%.prototype`の`buffer / byteLength / byteOffset` getterと`set`、`ArrayBuffer.prototype`の`byteLength / resizable` getter。prototype／Proxy／AB内部状態を確認し、resizable getterがない環境も拒否する。view／bufferにown constructor・length・byteLength・buffer・slice・set・iterator accessorがあっても読まない。species／slice／from／外部iteratorによるcopyを行わない。

plan配賦和、入力N・背後A・同時保持A+N、copy全費用とcleanup予約を先に検査・課金してから、新規Uint8Array(N)へ捕捉setを一度呼ぶ。copy後もintrinsicで元viewの同一buffer／offset／N／Aを確認する。以後はprivate copyだけを走査する。SharedArrayBuffer・resizable／length-tracking／detached・異brand／prototypeは拒否する。

### 8.2 UTF-8と外側framingの保証範囲

UTF-8 prepassは全owned bytesを直接読む。C2〜DF、E0のA0下限、EDの9F上限、F0の90下限、F4の8F上限と残りcontinuationを固定検査し、overlong／surrogate／範囲外／途中切れを拒否する。TextDecoderや全string decodeは使わない。不正UTF-8の先着を後続のframing診断で上書きしない。

外側scannerは最大5段のcontainer stackとquote状態だけを追い、文字列中の括弧をroot終端と誤認しない。depth、printable ASCII／backslash禁止、string内容64byteとquote込みscratch枠を検査する。最初のunquoted root閉鎖の直後がLF、さらに直後がEOFであることを検査する。UTF-8後のprofile／root種別／未閉鎖／末尾の固定理由は§5.1に対応する。

**このscannerはJSON parserではない。** colon／comma／literal／number文法、field数・key重複・schema版／field順・path別件数・値関係は未検査。`{not_json}`や重複keyを持つ殻でも`syntax=unchecked`の結果になり得る。malformed bodyの診断優先順位はRP-Bの構文検査が入るまで未完成であり、RP-Aのframe診断を完成parserの最終診断へ転用しない。将来は同module内の固定継続へ接続し、RP-Bが構文不正を拒否してから最終framing／RP-Cの値受理へ進む。新たな任意root-end指定口・昇格口は設けない。

### 8.3 境界modelと参照retire

modelは`wfb-raw-boundary-rpa-1`。workの項目は`plan, input, arithmetic, copy, utf8, frame, stack, cleanup`と総和。plan=64、metadata検査1回=10、checked加算1回=1、copy=N+1、UTF-8はbyte probeごと1（途中切れ時のEOF probeも含む）、framingもbyte／EOF probeごと1、stack push／popごと1、cleanupの予約=1。copy前後のmetadataは各1回。`max_parse_work`を超える次操作は実行せず、`max_value_work`や`max_total_work`の余りへ流用しない。失敗時の未使用／予約済み費用を返却しない。

`{}\n`（N=A=3）の独立対照は`64+20+2+4+3+4+2+1=100`unit。等値100は境界成功、99はframeのEOF probe直前で停止する。固定cleanup予約は破棄用のabstract費で、GC／OS cleanup確認や実CPU命令数ではない。token／node／AST／value workなど将来のlimitも型／planで検査するが、RP-Aではその処理を始めず、当該上限を消費済みとしない。

copyのattempt／完了／retireを別計数し、成功・UTF-8／frame／work失敗ともfinallyでowned参照を一度だけ外す。native set途中失敗なら確保済み領域も対象にする。返却metadataにowned bytesのaliasはなく、`ownedReferences=0`はこの境界からの参照非持出しの意味だけ。caller入力・backingの破壊、zero化・即時GC／RSS返却・保存責務の解決は主張しない。計数は合成専用・raw内容／offset／key／例外／stackを含まず、公開上位診断へは未接続。

RP-A時点で残したRP-Bは§9で合成実装した。RP-C、native allocation／set例外の故障注入、設定bootstrapやnative処理のheap／実時間、全parser計数式・共有停止／予算、raw上限とAST/core同時保持の運用承認、encoder・capture／custody・保存接続は引き続き残課題である。Unknown・正式発行口閉鎖・全体受付無効・調査保留を維持する。

## 9 RP-B：構文だけの閉鎖した固定継続

### 9.1 入口・所有・保証の区別

同じ`raw-json-boundary.ts`に`inspectCheckpointSyntax(bytes, limits)`を追加した。privateなmode選択で、既存のlimit受付→一度copy→UTF-8を共用し、RP-Bは旧frame-only走査ではなく構文解析を先に行い、正常root閉鎖の後だけLF／EOFを確認する。callerがmode／root-end／AST／継続callbackを渡す口はない。旧`inspectCheckpointBoundary`のmodel・syntax unchecked・100unit対照は維持した。

RP-Bの返値は成功なら`kind=non_executable_json_syntax, syntax=checked, valueStatus=unchecked`、失敗なら固定stage／reason。双方にfrozen work／操作数／構造計数だけを付ける。bytes／token文字列／AST／scalar値／key／path／例外・offset／receipt／proofを返さない。JSONとして構文が通る旧v1や未知fieldもsyntax-only成功になり得る。`parseCheckpointBytes`やcore受理・版検査を実装済みと呼ばない。

ASTは同copyから自前構築し、Object.create(null)とdense arrayだけを使う。keyはown dataで挿入し、`__proto__`もsetterを起動しない。frameのkeyリストはsource順で重複照合し、sort／dedupしない。汎用JS objectのnumeric-like keyの列挙順を元source順の証拠にせず、後続RP-Cで固定schemaのfield順／未知fieldを厳密拒否する前提を維持する。現在はASTを外へ移譲せず、成功／失敗ともroot参照とframe stackを固定finallyで外す。bytesのretireは外側の元finallyが一度だけ所有する。

### 9.2 有限状態・制限

object frameは先頭key-or-end／key必須／colon／value／comma-or-end、array frameは先頭value-or-end／value必須／comma-or-endで進む。parser関数の再帰は使わず、container開始前に`min(5,max_depth)`を確認する。trailing comma・hole・不正literal・delimiter不整合・途中切れを拒否する。

- 各objectの11番目のfieldはkey token生成前に`raw_limit`。最大10個の既出keyと、長さ＋最大64文字の比較を課金し、同名ならcolon／value解析・挿入前に`raw_duplicate_key`。別objectの同名keyは合法。
- string内容は64byte以内、quote込みscratchも受付する。escape／非ASCII／control等は親profile通り拒否し、decodeしない。
- 数値候補byte集合を最大32／明示scratch以内で集め、固定JSON number grammar→捕捉Number変換→finite／非負／−0禁止／MAX_SAFE以下→捕捉formatter→元tokenとの文字単位一致を確認する。33番目は変換前の`raw_limit`。`1.0`／`1e0`／`1E-7`・underflow／precision差は`raw_number`。値coreのfield別integer等は未検査。
- token上限は次token開始前。value nodeは`min(max_value_nodes,max_ast_nodes)`を次予約前に確認する。keyはnodeに加算せず、containerとscalarだけを各1予約。成功時は§3.1のV定義と一致する。失敗時の計数は未完成token／valueの開始予約を含み得るので、実allocation数とは呼ばない。
- pathはroot／snapshot／cutoffと固定の配列名の有限tagで管理し、配列要素の子や他のpathではunknownへ戻す。root直下snapshotのmodules1000／cases20000／events20000／samples600／scopes=明示cap／workers=明示cap、cutoff.scope_tails=明示scope capと、全arrayの`max_array_items`の小さい方を、次要素解析前に確認する。似たsuffixだけで既知pathにしない。unknownにも全array capが働く。

`max_nodes`（core structural計数）、`max_live_value_nodes`の2V受付、value work・encoded上界はRP-Cの責務で、RP-Bからcoreを呼んで確認済みにしない。小さな合成capやschemaに不適合なsyntax成功を、本番受付やcaptureの根拠へ昇格しない。

### 9.3 model・独立対照と残課題

RP-B modelは`wfb-raw-syntax-rpb-1`。元RP-Aの受付／copy／UTF-8計数に、`lexical, tokenStarts, nodeReservations, fields, items, insertion, keyComparison, tokenCopy, numeric, path, states, nodeCleanup`を追加する。byte／EOF lookaheadごとlexical1、token開始1、node予約1＋retire予約1、field／item受付と値挿入は各1、keyの長さ比較と各文字比較は各1、scratchへ追加する文字ごと1。numeric grammarは長さ＋1、変換／formatter／長さ照合は各1と実比較文字ごと1。有限path分岐／状態stepも各1、stack push／popは元のstack費、最後のLF／EOFはframe費として分離する。有限の組込み比較を含む抽象単位で、実CPU命令数／heapの証明ではない。

`{}\n`の独立上界対照はplan64＋input20＋arithmetic2＋copy4＋utf8 3＋cleanup1＋lexical5＋tokenStarts2＋nodeReservations1＋nodeCleanup1＋path1＋states2＋stack2＋frame2＝**110unit**。RP-Aの100と混同しない。work不足は次操作前に停止し、value予算へ借入れず、予約は返却しない。

`tokens, valueNodes, objectFields, arrayItems, containers, maxDepth, numericTokens`は受理された正常treeの独立数え上げと一致する。失敗prefixの開始予約も含むvalueNodesを、内部treeの責務としてretiredNodesへ一度退役させる。`treeReferences=0`はこのAPIが参照を持ち出さない意味で、物理node数／GC／zero化・OS解放確認ではない。

手書き10 variant、正常golden・80個の有限生成treeの独立oracle、全7既知pathの等値／次要素拒否、全work切断対照と、非空の木の手計数312unit対照を実施した。既存RP-Aと値coreは維持する。full値の比較・core固定受理・2Vとstructural計数の受付式、shared budget／期限／取消、native allocation失敗、実heap／時間・運用cap、encoder／private aggregate／capture／custody／保存は未接続／未確認。正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持する。
