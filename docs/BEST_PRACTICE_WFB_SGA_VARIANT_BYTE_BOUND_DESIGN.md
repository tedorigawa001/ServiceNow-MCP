# WF-B SG-A後：variant別byte積上げ・保守上界と合法最大の区別

Version: draft-0.2 / Date: 2026-11-14 / 読取り基準HEAD: `39ed840` / レビュー修正基準HEAD: `f6574e7`。

draft-0.1のレビュー修正：数値の誤りはなかった。§4のCounts 175byteは各値がprofile別上限以下であることを前提としていたが、親のrecord field契約draft-0.2はCountsをU64型とするだけで超過値の拒否を定めていなかった。親をdraft-0.3として上限超過の拒否を明記し、§4にこの前提と、型だけで計算した場合の336byte（SUM／TERMのU_indは各161byte増）を記した。各上界値は変えていない。

Status: **文書・定数の算定のみ。LOAD6／LOAD7の選択・format・容量の採用は未承認。** 元のtest 5,000ms・既定並列度、通常経路未切替、正式発行口・C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。実装・負荷採取・試験再実行・実process対照・実接続・実通信・設定変更・Pushは行わない。

親は[record別strict field契約draft-0.3](BEST_PRACTICE_WFB_SGA_RECORD_FIELDS_ENCODING_DESIGN.md)と[固定schedule設計draft-0.2](BEST_PRACTICE_WFB_SGA_FIXED_SCHEDULE_SLOT_ENCODING_DESIGN.md)。前者のASCII限定・key順・値域・LFと、後者の封印／失敗prefixを前提に、record単位の**保守的なencoded長上界**を算定する。合法最大・packet総量の確定・最大同時保持・allocation／work／wall時間の実証は別の課題として残す。

## 1 三つの量を区別する

| 記号 | 意味 | 今回の扱い |
|---|---|---|
| U_ind(R) | fieldごとの最大長を独立に選び、関係制約を緩和して足したrecord長上界 | 数値を算定する。同時成立する入力の存在は要しない |
| U_rel(R) | 明記した一部の関係制約を加えて狭めた上界 | SUM／TERMの一部を例示。残りの制約を閉じたとはしない |
| M_C(R) | 対象契約Cの全variant・field関係・封印時点・scheduleを満たすrecordについての最大長 | 未確定。上界証明に加え、その長さへ到達する合法値／経路の説明が必要 |

`M_C(R) ≤ U_rel(R) ≤ U_ind(R)`となるように扱う。Cの一部を落とした「型だけに合う最大値」は、record全体の合法最大ではない。実provider／private bindingが成立することも型や文字列長からは証明できず、実行可能性はさらに別のUnknownである。

ここでの合法は**候補schema・scheduleの意味上の合法性**であり、実行・採用の承認ではない。現在のgateが閉鎖中だからM_C=0と置くことも、仮想的な合法値があるから実行してよいとすることもない。最大値を証明できなければ、Uを「最大」と呼び替えず未確定のまま残す。

## 2 byte式と共通定数

全数値は完成したJSON token／recordの長さで、rawメモリ量ではない。ASCII stringは外側quote込み、recordは末尾LF1byte込みとする。途中失敗buffer・buffer容量・外側metadataはこの長さに含めない。

- `Q(s) = 2 + ASCII_length(s)`。
- `O((k1,b1),…,(kn,bn)) = 2 + max(n−1,0) + Σ(length(ki)+3+bi)`。key quote2・colon1・comma・braceを含む。
- `A(b1,…,bm) = 2 + max(m−1,0) + Σbi`。
- `Line(R) = O(Rの全field) + 1`。

Idは最大66、Headは42、U53 stringは18、U64／Mono stringは22、UTC stringは26、F64NonNeg stringは18byte。Pairは`O((u,22),(t,22))=55`、load3値は`A(18,18,18)=58`byteとなる。Id64文字の中身を変更してlabelの同一性を満たせるかはprivate供給の課題で、算式の中で実Idを採取・生成しない。

## 3 V variant別の長さ

okのwrapperは`O((state,Q(ok)),(value,b))=23+b`。非okは`24+length(state)+length(reason)`である。下表は共通variant辞書のwire向け部分からの最大で、各field固有のreason可否は緩和している。not_applicableはwire禁止なので含めない。

| state | 長いreasonの例 | 非ok object長上界 |
|---|---|---|
| missing | dependency_missing（18文字） | 49byte |
| unsupported | unsupported_platform／provider_unavailable（各20文字） | 55byte |
| invalid | precision_unconfirmed（21文字） | 52byte |
| late | timing_violation（16文字） | 44byte |
| cancelled | cancelled（9文字） | 42byte |
| not_started | stopped_before_step（19文字） | 54byte |

したがって共通の緩和上界は`V_bound(b)=max(23+b,55)`。長いunsupported reasonをどのfieldにも使えるという仕様変更ではない。field固有reason・原因・到達位置を未反映でも、元契約の全合法値を包含する安全側の計算として使う。

| Vのpayload型 | ok長 | U_indで使う長さ | 長い側 |
|---|---|---|---|
| Id | 89 | 89 | ok |
| Mono／U64 | 45 | 55 | 非okの緩和上界 |
| UTC | 49 | 55 | 同上 |
| C／N | 26 | 55 | 同上 |
| U53 | 41 | 55 | 同上 |
| 固定validated string | 34 | 55 | 同上 |
| 固定n_ack参照 | 30 | 55 | 同上。ただしreceived時はok必須 |
| load3値配列 | 81 | 81 | ok |
| Pair | 78 | 78 | ok |

Pairの55byteはU64型だけの局所値域から求めた長さで、CPU集計からu／tとも20桁へ到達できる証拠ではない。同様に、V<Mono>の55byteを多用したrecordが、全getter実行済みの正常traceとして成立するとは限らない。

## 4 入れ子の独立上界

| 入れ子 | 最大側の選択／式 | U_indで使う長さ |
|---|---|---|
| ClockInfo | Id×2、mono_ns_u64、V<U64>の55 | 254byte |
| Evidence | static／fake／runtimeはinsufficient、approvalはunapproved | 96byte |
| Scope | ref=V<Id>の89、state=unconfirmed | 119byte |
| Lights | n=55、load=81、free=55、total=55 | 277byte |
| FirstFailure | set、reason=precision_unconfirmed、step／op各4文字 | 74byte |
| DiagFlags | 固定12 Bool全てfalse（5byte） | 192byte |
| Custody | 固定4 field全てunconfirmed | 100byte |
| Counts | 9 fieldに各profileの計数上限の10進桁数を使用 | LOAD6／LOAD7とも175byte |
| Schedule | samples=6、period_ms=1000、pre／totalは13／14または14／15 | 両案とも66byte |
| interval_states | 5要素を各not_started等の11文字stateへ緩和 | 71byte |

Countsに全field一律20桁は使わず、既存の上限`6,24,26,6,7680,6400,14,1,14`／`6,28,29,7,7680,6400,15,1,15`の桁数を使う。これは親draft-0.3の、上限を超えるCountsをencoding前に拒否する値域条件に依存する。その条件がなければU64型だけで`2＋8＋101＋27＋9×22＝336byte`となり、SUM／TERMのU_indは各161byte大きい1,411／1,668byteになる。ただしSUM／TERMの封印時点までにその全上限へ同時到達できるとはしない。例えばSUMのnotify_attempt／encode_attemptは後続の実行結果を先取りできない。

DiagFlags全falseはbyte数として長い一方、FirstFailure=setの具体的故障とその対応flagを同時に反映する場合には短くなる。この表の選択をまとめて合法な入力例とは呼ばない。FirstFailureとstep／opの対応、Scopeと各variant等も別途制約する必要がある。

## 5 record別U_indの積上げ

共通envelopeの8 keyを含む。key税は`2 + (n−1) + Σ(length(key)+3)`、共通value合計にはv・kind・slot・trial／plan／pin／packetの各Id・profileを含める。同じIdが別field／recordに現れてもencoded bytesは省略せず数える。

| record | 全key数 | key税 | 共通value合計 | 追加value上界合計 | LF | U_ind（byte） |
|---|---|---|---|---|---|---|
| H | 20 | 202 | 301 | 924 | 1 | 1,428 |
| S[k] | 17 | 159 | 302 | 663 | 1 | 1,125 |
| L | 13 | 111 | 300 | 497 | 1 | 909 |
| I[k] | 12 | 101 | 304 | 87 | 1 | 493 |
| SUM | 16 | 164 | 304 | 781 | 1 | 1,250 |
| TERM | 21 | 207 | 306 | 993 | 1 | 1,507 |

例えばHの追加value合計は`66+42+4+66+254+24+119+66+66+96+55+66=924`。Sは`1+4×55+55+55+55+277=663`、Lは`4×55+277=497`、Iは`1+4+4+78=87`となる。SUMは`55+71+78+119+17+175+74+192=781`、TERMは`96+6×55+13+13+175+74+192+100=993`である。

profile文字列はどちらも5文字、index／slotは規定範囲で桁数が変わらず、Schedule／Countsも両案で長さが同じため、上表の各record上界は両案共通。LOAD6はL record不在であり、その909byteを仮のLとして出力しない。

この表は候補field契約に対する長さの包絡であり、上限いっぱいのrecordを生成・encoding・採取した結果ではない。M_Cの欄を埋めたものでも、同時保持する全bufferの容量でもない。

## 6 関係制約を加える例：SUMとTERM

### 6.1 SUMのbusyとinterval_states

独立選択は`71+78=149byte`だが、busy=okなら5 intervalは全てokなので、state配列は`A(4,4,4,4,4)=26byte`になる。

- busy=ok側：`26+78=104byte`。
- busy非ok側：state配列を71、busyを55へ緩和して`71+55=126byte`。

この含意だけを加えたblock上界は126byteであり、SUMの上界を`1,250−(149−126)=1,227byte`へ狭められる。非ok reasonのfield適用、eligibility、FirstFailure／DiagFlags、Counts時点、元sampleとの関係等はまだ緩和したままなので、**1,227byteを合法最大とはしない**。

### 6.2 TERMのreceiptとh

receiptごとのobject長はnot_sent=20、unconfirmed=53、rejected=48、received=96byte。unconfirmedの長いreasonはtiming_unconfirmed、rejectedはbinding_mismatchである。独立選択ではreceived96＋非ok h55＝151byteを使うが、この組合せは親契約に反する。

| receipt | h側に加える関係 | blockの緩和上界 |
|---|---|---|
| not_sent | h非ok、共通55へ緩和 | 20＋55＝75 |
| unconfirmed | h非ok、共通55へ緩和 | 53＋55＝108 |
| rejected | h非ok、共通55へ緩和 | 48＋55＝103 |
| received | h=okのn_ack参照、30byte | 96＋30＝126 |

この関係だけのblock上界は126byteで、TERMは`1,507−(151−126)=1,482byte`へ狭められる。receivedにはn_ack=okも必要だが、その値・他時刻・通知結果・attempt・失敗診断までの同時成立はここで最大化していない。**1,482byteも合法最大ではない**。違反した実行事実を診断に残す例外branchも、正常受理の成功形へ書き換えない。

### 6.3 数値の位置付け

| record | U_ind | 今回一部制約を加えたU_rel | M_C（合法最大） |
|---|---|---|---|
| H／S／L／I | 上表の値 | 今回は追加の数値を確定しない | 未確定 |
| SUM | 1,250 | 1,227以下 | 未確定 |
| TERM | 1,507 | 1,482以下 | 未確定 |

「以下」は上界の意味で、同じ長さに達する合法入力があるという主張ではない。部分的な制約で減った23／25byteを、runtimeの空き容量として再配賦しない。

## 7 合法最大の確定に必要な制約と到達説明

| 対応範囲 | 閉じる必要がある条件 | 最大値を名乗る前の確認 |
|---|---|---|
| scalar／V | field固有state／reason・値域・範囲・非適用禁止 | 最長の共通reasonをそのfieldで使えるか |
| sample／L | 予定・entered・begin／end、早期timer拒否、getter到達と非okの対応 | 時計失敗で後続getter未開始になるprefixを守っているか |
| I／SUM | 同scope／epoch・項目別差分・Pair合計・eligibility | 型上のU64上限が実counterモデルでも到達可能か |
| Counts | SUM／TERMの封印前prefix、FS08／13／14の試行数 | 自分の未来のseal／encode／z_postを足していないか |
| TERM | 通知結果写像、received→h／nAck、attempt／timing、時刻順 | その通知結果と最長診断・時刻variantが同じ分岐で成立するか |
| Failure／Diag／Custody | 最初の理由とFS／OP、対応flag、未解放責務 | 長い全falseやunconfirmedを機械的に組み合わせていないか |
| packet／private | 全record同一label・profile、実参照・receipt・供給snapshot | 型だけの値を正規ownerから来た実証拠へ昇格していないか |

M_Cを確定するには、対象制約Cの版を固定し、全合法variantを包含する上界の説明と、同じbyte長に達する値・分岐の到達説明の両方が必要である。到達説明はMD上の非実行な値関係・step列から始め、実providerや実行承認を捏造しない。関係表が未完なら、合法最大が既に定まったかのように扱わない。

今回はその制約閉包・最大化を完了していない。fieldごとのreason適用やproviderの確認不能な前提が残れば、該当するM_Cは未確定とする。有限のUがあることと、実sourceからの合法な到達を確認したことは別である。

## 8 総量・失敗prefix・同時保持への引継ぎ

次段階では、各recordの保守上界から`H＋6S＋[L]＋5I＋SUM`とTERM込みの和を計算できる。ただしその和を「単一の合法packetで到達できる最大値」とはしない。本書はrecord単位を対象とし、packet総量の確定・旧32KiBとの採用判断を行わない。

FS08失敗時の成功bytes prefix・部分buffer・sealedだが未encodingのTERMを区別する。TERMのwire bytesが0でも、内部TERM値・診断・元入力の保持量は0ではない。FS08未到達の早期失敗で共通identityが足りなければ、架空labelでbyteの大きなrecordを組み立てず、未encodingの保持責務を残す。

record長Uは成功した完成lineの上界で、失敗encoderの確保容量・一時copy・sealed入力・上位借用・scratch・GC・native allocationを制限した証拠ではない。部分bufferも同じU内に収めるには、将来のencoder受付・出力予約・途中停止の別契約が必要である。実費・最大同時保持・外側owner費・R内encodingの実時間はUnknownのまま残す。

## 9 後続の独立確認案（全て未実施）

| ID | 対照 | 必須の関係 |
|---|---|---|
| VB01 | 各stateの固定reason長 | 非ok49／55／52／44／42／54、not_applicable除外 |
| VB02 | ok wrapperとscalar | 23＋payload、V型別の最大側を比較 |
| VB03 | 各入れ子のkey・comma・quote | O／A式を独立の平坦なkey税＋value和で検算 |
| VB04 | recordのkind／slot／共通Id反復 | key数20／17／13／12／16／21、末尾LFを一度だけ計上 |
| VB05 | U_ind全record表 | 1,428／1,125／909／493／1,250／1,507に一致 |
| VB06 | SUMのbusy=ok含意を無視する負の対照 | 独立149と一部制約126のblockを区別。合法最大としない |
| VB07 | received＋非ok hという負の対照 | receipt／h block151を126へ制約。nAck等は別の残課題 |
| VB08 | SUMへ未来のCounts、FirstFailureと全false | 数値上界の選択を合法witnessへ昇格しない |
| VB09 | FS08失敗・TERM未encoding | 完成wire長と内部保持・部分bufferを分離 |
| VB10 | 旧32KiB・record上界和から実memory成功扱い | 総量・同時保持・allocation・実費の未確認を維持 |

将来のoracleはencoderやそのenum／key定義・長さhelperを流用せず、独立した表・固定token長・制約別期待値で照合する。本書作成では定数式の検算のみで、record生成・encoder接続・fixture／検査器実装・合成試験は行わない。

## 10 未承認事項と今回の範囲

- [ ] 候補field／encoding契約と、保守上界の算定前提のレビュー。
- [ ] field別variant可否・phase／snapshot制約と合法最大の対象Cの固定。
- [ ] record別M_Cの上界証明と合法な到達説明。
- [ ] packet総量・最大同時保持・encoder部分出力予約と費目coverage。
- [ ] LOAD6／LOAD7の選択と、実装・合成確認・実確認・保管の個別承認。

全て未承認。本MDと親2文書の参照更新だけを行い、選択・format・容量capを採用しない。元の5秒期限・既定並列度、各閉鎖条件・全体受付無効・Unknown・調査保留を維持する。実装・負荷採取・試験再実行・実process対照・実接続・実通信・設定変更・コミット・Pushは今回行わない。

文書整合として対象3文書のローカルリンク11件・表23個の列数、VB01〜10の計画ID連番、未承認チェック5項目、variant長・入れ子式とrecordのkey税／value和の二経路検算、SUM／TERMの差分23／25byteと上界1,227／1,482byte、末尾改行と差分空白を確認した。文書と定数の静的検算のみで、record生成・encoder／検査器実装・合成試験・負荷採取・試験再実行・合法最大／総量／保持上界の実証ではない。

## 11 後続のpacket総量・部分buffer予約（2026-11-14）

[packet総量の保守算定・部分bufferの予約境界draft-0.1](BEST_PRACTICE_WFB_SGA_PACKET_TOTAL_BUFFER_RESERVATION_DESIGN.md)で、Counts上限拒否を前提にPrePacketとTERM込みのU_ind／U_relを集計し、record別出力予約・write前受付・同backing昇格と失敗保持を対にした。合法最大・最大同時保持・実allocator／費用は未確定で、旧32KiBや差分を実memory適合へ昇格させない。選択未承認・元5秒・既定並列度・各閉鎖条件・Unknown・調査保留と実装／採取／再実行未実施を維持する。
